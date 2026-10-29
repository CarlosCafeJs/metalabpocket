const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('metaLabDesktop', Object.freeze({ enabled: true }));
