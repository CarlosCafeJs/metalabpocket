const { app, BrowserWindow, safeStorage, utilityProcess } = require('electron');
const { randomBytes } = require('node:crypto');
const { createServer } = require('node:net');
const { appendFile, mkdir, readFile, rename, writeFile } = require('node:fs/promises');
const path = require('node:path');

const appDataFolder = 'MetaLab Pocket';
const startupTimeoutMs = 45_000;
let serverProcess;
let mainWindow;
let shuttingDown = false;

app.setName(appDataFolder);
app.enableSandbox();

function resolveServerRoot() {
  const desktopDistDir = process.env.METALAB_DESKTOP_DIST_DIR || '.next-desktop-runtime';
  if (!/^\.next-desktop-[a-z0-9-]+$/u.test(desktopDistDir)) throw new Error('Invalid Desktop build directory.');
  return app.isPackaged
    ? path.join(process.resourcesPath, 'next-server')
    : path.resolve(__dirname, '..', desktopDistDir, 'standalone');
}

async function getDataKey() {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
    throw new Error('O armazenamento seguro do Windows não está disponível.');
  }

  const keyFile = path.join(app.getPath('userData'), 'desktop-data-key.bin');
  let encryptedKey;
  try {
    encryptedKey = await readFile(keyFile);
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
      throw new Error('Não foi possível ler a chave local; nenhum dado foi substituído.');
    }
  }
  if (encryptedKey) {
    try {
    const decrypted = await safeStorage.decryptStringAsync(encryptedKey);
    const key = Buffer.from(decrypted.result, 'base64url');
    if (key.byteLength !== 32) throw new Error('Chave local inválida.');
    return key.toString('hex');
    } catch {
      throw new Error('Não foi possível abrir a chave dos dados locais; nenhum dado foi substituído.');
    }
  }

  const dataKey = randomBytes(32).toString('base64url');
  const protectedDataKey = await safeStorage.encryptStringAsync(dataKey);
  await mkdir(path.dirname(keyFile), { recursive: true });
  const tempFile = `${keyFile}.${process.pid}.tmp`;
  await writeFile(tempFile, protectedDataKey, { flag: 'wx' });
  await rename(tempFile, keyFile);
  return Buffer.from(dataKey, 'base64url').toString('hex');
}

async function reserveLocalPort() {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const address = listener.address();
  if (!address || typeof address === 'string') throw new Error('Não foi possível reservar uma porta local.');
  await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  return address.port;
}

async function waitForServer(url) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < startupTimeoutMs) {
    if (!serverProcess || serverExited) throw new Error('O servidor local foi encerrado durante a inicialização.');
    try {
      const response = await fetch(`${url}/api/desktop/health`, { signal: AbortSignal.timeout(1200), cache: 'no-store' });
      if (response.ok) return;
    } catch { /* Next ainda está iniciando. */ }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error('O servidor local não ficou pronto dentro do tempo esperado.');
}

let serverExited = false;

function desktopServerEnvironment(dataDirectory, dataKey, port) {
  const safeHostVariables = /^(?:PATH|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMDATA|LANG|LC_ALL)$/iu;
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => safeHostVariables.test(name)));
  return {
    ...env,
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
    HOSTNAME: '127.0.0.1',
    PORT: String(port),
    METALAB_DESKTOP_MODE: '1',
    METALAB_DESKTOP_DB_PATH: path.join(dataDirectory, 'metalab-offline.sqlite'),
    METALAB_DESKTOP_DATA_KEY: dataKey
  };
}

function createMainWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 920,
    minHeight: 640,
    show: false,
    backgroundColor: '#f7f3ed',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  const localOrigin = new URL(url).origin;
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, target) => {
    try {
      if (new URL(target).origin !== localOrigin) event.preventDefault();
    } catch { event.preventDefault(); }
  });
  mainWindow.once('ready-to-show', () => mainWindow && mainWindow.show());
  mainWindow.loadURL(url);
}

async function start() {
  await app.whenReady();
  const serverRoot = resolveServerRoot();
  const entry = path.join(serverRoot, 'server.js');
  const dataDirectory = path.join(app.getPath('userData'), 'offline');
  await mkdir(dataDirectory, { recursive: true });
  const dataKey = await getDataKey();
  const port = await reserveLocalPort();

  serverProcess = utilityProcess.fork(entry, [], {
    serviceName: 'MetaLab Pocket Next server',
    cwd: serverRoot,
    stdio: 'ignore',
    env: desktopServerEnvironment(dataDirectory, dataKey, port)
  });
  serverProcess.on('exit', code => {
    serverExited = true;
    if (!shuttingDown) app.quit();
  });

  const url = `http://127.0.0.1:${port}`;
  await waitForServer(url);
  createMainWindow(url);
}

app.on('before-quit', () => {
  shuttingDown = true;
  if (serverProcess && serverProcess.pid !== undefined) serverProcess.kill();
});
app.on('window-all-closed', () => app.quit());

start().catch(error => {
  const detail = error instanceof Error
    ? `${error.name}: ${error.message}`.replace(/(https?:\/\/)[^/\s]+/gu, '$1[servidor]').replace(/[\r\n\t]+/gu, ' ').slice(0, 500)
    : 'unexpected error';
  console.error('MetaLab Pocket desktop startup failed:', detail);
  void (async () => {
    try {
      const logPath = path.join(app.getPath('userData'), 'desktop-startup.log');
      await mkdir(path.dirname(logPath), { recursive: true });
      await appendFile(logPath, `${new Date().toISOString()} ${detail}\n`, 'utf8');
    } catch { /* Diagnostics must not prevent a clean shutdown. */ }
    app.quit();
  })();
});
