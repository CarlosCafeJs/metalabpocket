const { app, BrowserWindow, dialog, safeStorage, utilityProcess } = require('electron');
const { randomBytes } = require('node:crypto');
const { createServer } = require('node:net');
const { appendFile, access, mkdir, readFile, rename, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { classifyDiagnosticText, formatStartupEntry, getPackagedNodePath } = require('./startup-diagnostics.cjs');

const appDataFolder = 'MetaLab Pocket';
const startupTimeoutMs = 45_000;
let serverProcess;
let mainWindow;
let shuttingDown = false;
let startupStage = 'app-start';
let startupLogQueue = Promise.resolve();

function writeStartupLog(stage, code = 'none') {
  startupLogQueue = startupLogQueue.then(async () => {
    const logPath = path.join(app.getPath('userData'), 'desktop-startup.log');
    await mkdir(path.dirname(logPath), { recursive: true });
    await appendFile(logPath, formatStartupEntry(stage, code), 'utf8');
  }).catch(() => {});
  return startupLogQueue;
}

function logChildDiagnostic(chunk) {
  const code = classifyDiagnosticText(String(chunk));
  if (code !== 'unclassified') void writeStartupLog('next-runtime-output', code);
}

function classifyStartupError(error) {
  const message = error instanceof Error ? error.message : '';
  if (/armazenamento seguro|safeStorage/iu.test(message)) return 'secure_storage_unavailable';
  if (/chave local/iu.test(message)) return 'secure_key_unavailable';
  if (/servidor local.*tempo esperado/iu.test(message)) return 'readiness_timeout';
  if (/servidor local foi encerrado/iu.test(message)) return 'next_exited_early';
  return classifyDiagnosticText(message);
}

function serverNodeModulePath() {
  return getPackagedNodePath(app.isPackaged, process.resourcesPath);
}

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
    ...(serverNodeModulePath() ? { NODE_PATH: serverNodeModulePath() } : {}),
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
    backgroundColor: '#F4F7F2',
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
  mainWindow.webContents.on('did-fail-load', (_event, errorCode) => {
    void writeStartupLog('window-load-failed', `chromium_${Math.abs(Number(errorCode)) || 'unknown'}`);
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    const safeReason = /^[a-z0-9_-]{1,32}$/iu.test(details.reason) ? details.reason : 'unknown';
    void writeStartupLog('window-render-exit', safeReason);
  });
  mainWindow.once('ready-to-show', () => mainWindow && mainWindow.show());
  mainWindow.once('ready-to-show', () => void writeStartupLog('window-ready'));
  mainWindow.loadURL(url);
}

async function start() {
  await app.whenReady();
  startupStage = 'app-ready';
  await writeStartupLog(startupStage);

  startupStage = 'runtime-paths';
  const serverRoot = resolveServerRoot();
  const entry = path.join(serverRoot, 'server.js');
  await access(entry);
  await writeStartupLog('runtime-files-present');

  startupStage = 'local-storage';
  const dataDirectory = path.join(app.getPath('userData'), 'offline');
  await mkdir(dataDirectory, { recursive: true });
  const dataKey = await getDataKey();
  await writeStartupLog('secure-storage-ready');

  startupStage = 'reserve-local-port';
  const port = await reserveLocalPort();
  await writeStartupLog('local-port-ready', `port_${port}`);

  startupStage = 'spawn-next';
  serverProcess = utilityProcess.fork(entry, [], {
    serviceName: 'CaféFlow Pocket Next server',
    cwd: serverRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: desktopServerEnvironment(dataDirectory, dataKey, port)
  });
  serverProcess.on('spawn', () => void writeStartupLog('next-process-spawned'));
  serverProcess.stdout?.on('data', logChildDiagnostic);
  serverProcess.stderr?.on('data', logChildDiagnostic);
  serverProcess.on('error', () => void writeStartupLog('next-process-error'));
  serverProcess.on('exit', code => {
    serverExited = true;
    void writeStartupLog('next-process-exit', `exit_${Number.isInteger(code) ? code : 'unknown'}`).then(() => {
      if (!shuttingDown && mainWindow && !mainWindow.isDestroyed()) app.quit();
    });
  });

  startupStage = 'next-readiness';
  const url = `http://127.0.0.1:${port}`;
  await waitForServer(url);
  await writeStartupLog('next-health-ready');
  startupStage = 'create-window';
  createMainWindow(url);
}

app.on('before-quit', () => {
  shuttingDown = true;
  if (serverProcess && serverProcess.pid !== undefined) serverProcess.kill();
});
app.on('window-all-closed', () => app.quit());

start().catch(error => {
  void (async () => {
    const code = classifyStartupError(error);
    await writeStartupLog(`failed-${startupStage}`, code);
    if (app.isReady()) {
      dialog.showErrorBox(
        'Não foi possível iniciar o CaféFlow Pocket',
        'O servidor local não concluiu a inicialização. Nenhum dado local foi removido. Consulte desktop-startup.log na pasta de dados do aplicativo e envie esse arquivo ao suporte.'
      );
    }
    app.quit();
  })();
});
