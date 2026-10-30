const path = require('node:path');

const desktopDistDir = process.env.METALAB_DESKTOP_DIST_DIR || '.next-desktop-runtime';
const desktopReleaseDir = process.env.METALAB_DESKTOP_RELEASE_DIR || 'dist/desktop/release';
if (!/^\.next-desktop-[a-z0-9-]+$/u.test(desktopDistDir)) throw new Error('METALAB_DESKTOP_DIST_DIR must be a local .next-desktop-* directory.');
if (!/^dist\/desktop\/release(?:-[a-z0-9-]+)?$/u.test(desktopReleaseDir)) throw new Error('METALAB_DESKTOP_RELEASE_DIR must be a local dist/desktop/release* directory.');

module.exports = {
  appId: 'br.com.metalab.pocket',
  productName: 'MetaLab Pocket',
  directories: { output: desktopReleaseDir },
  files: ['electron/**/*', 'package.json'],
  extraResources: [{ from: path.join(desktopDistDir, 'standalone'), to: 'next-server' }],
  asar: true,
  npmRebuild: false,
  win: { target: [{ target: 'nsis', arch: ['x64'] }] },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true
  }
};
