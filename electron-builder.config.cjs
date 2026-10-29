module.exports = {
  appId: 'br.com.metalab.pocket',
  productName: 'MetaLab Pocket',
  directories: { output: 'dist/desktop/release' },
  files: ['electron/**/*', 'package.json'],
  extraResources: [{ from: '.next-desktop-runtime/standalone', to: 'next-server' }],
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
