import { spawnSync } from 'node:child_process';
import { cp, mkdir, readdir, rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const desktopDistDir = process.env.METALAB_DESKTOP_DIST_DIR || '.next-desktop-runtime';
if (!/^\.next-desktop-[a-z0-9-]+$/u.test(desktopDistDir)) throw new Error('METALAB_DESKTOP_DIST_DIR must be a local .next-desktop-* directory.');
const nextCli = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
const nextEnvPath = path.join(root, 'next-env.d.ts');
const tsconfigPath = path.join(root, 'tsconfig.json');
const [nextEnvBefore, tsconfigBefore] = await Promise.all([readFile(nextEnvPath), readFile(tsconfigPath)]);
let result;
try {
  result = spawnSync(process.execPath, [nextCli, 'build', '--webpack'], {
    cwd: root,
    env: { ...process.env, METALAB_DESKTOP_BUILD: '1' },
    stdio: 'inherit',
    shell: false
  });
} finally {
  // Next writes its selected distDir into shared TS config files; restore them so web settings stay canonical.
  await Promise.all([writeFile(nextEnvPath, nextEnvBefore), writeFile(tsconfigPath, tsconfigBefore)]);
}
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const output = path.join(root, desktopDistDir);
const standalone = path.join(output, 'standalone');
const standaloneDist = path.join(standalone, desktopDistDir);
await mkdir(standaloneDist, { recursive: true });
await cp(path.join(output, 'static'), path.join(standaloneDist, 'static'), { recursive: true, force: true });
await cp(path.join(root, 'public'), path.join(standalone, 'public'), { recursive: true, force: true });
async function removeEnvironmentFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (/^\.env(?:\..*)?$/u.test(entry.name)) {
      await rm(target, { recursive: true, force: true });
    } else if (entry.isDirectory()) {
      await removeEnvironmentFiles(target);
    }
  }
}
await removeEnvironmentFiles(standalone);
console.log('Next.js standalone pronto para o empacotador Electron. Nenhuma migração foi executada.');
