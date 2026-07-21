const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getState: () => ipcRenderer.invoke('state:get'),
  saveState: (state) => ipcRenderer.send('state:save', state),
  restartSpell: (id) => ipcRenderer.send('spell:restart', id),
  restartAll: () => ipcRenderer.send('spells:restart-all'),
  setPositionMode: (on) => ipcRenderer.send('overlay:position-mode', on),
  onPositionMode: (cb) => ipcRenderer.on('position-mode', (_e, on) => cb(on)),
  onSettings: (cb) => ipcRenderer.on('settings', (_e, settings) => cb(settings)),
  onSpellPos: (cb) => ipcRenderer.on('spell-pos', (_e, data) => cb(data)),
  pickImage: (id) => ipcRenderer.invoke('spell:image-pick', id),
  pasteImage: (id) => ipcRenderer.invoke('spell:image-paste', id),
  clearImage: (id) => ipcRenderer.invoke('spell:image-clear', id),
  onTick: (cb) => ipcRenderer.on('tick', (_e, items) => cb(items)),
  onBeep: (cb) => ipcRenderer.on('beep', (_e, beep) => cb(beep)),
  onState: (cb) => ipcRenderer.on('state', (_e, state) => cb(state)),
});
