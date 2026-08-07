// Preload de teste: fornece um window.api falso com dados de exemplo,
// pra renderizar a interface sem o processo principal real.
const { contextBridge } = require('electron');

const state = {
  spells: [
    { id: 1, name: 'Flam', key: '4', cooldown: 40, color: '#8b5cf6', enabled: true, image: null, pos: null },
    { id: 2, name: 'Croco', key: 'F3', cooldown: 180, color: '#22c55e', enabled: true, image: null, pos: null },
    { id: 3, name: 'Utura', key: 'F7', cooldown: 120, color: '#06b6d4', enabled: false, image: null, pos: null },
  ],
  settings: { corner: 'custom', volume: 0.45, customPos: null, size: 'icon', layout: 'vertical', opacity: 0.7, iconSize: 24 },
  positioning: false,
};

let tickCb = null;
contextBridge.exposeInMainWorld('api', {
  getState: () => Promise.resolve(state),
  saveState: () => {},
  restartSpell: () => {}, restartAll: () => {},
  setPositionMode: () => {}, onPositionMode: () => {},
  onSettings: () => {}, onSpellPos: () => {},
  winMinimize: () => {}, winMaximize: () => {}, winClose: () => {},
  pickImage: () => Promise.resolve({ ok: false, canceled: true }),
  pasteImage: () => Promise.resolve({ ok: false, empty: true }),
  clearImage: () => Promise.resolve({ ok: true, image: null }),
  onTick: (cb) => { tickCb = cb; setTimeout(() => cb([
    { id: 1, name: 'Flam', key: '4', color: '#8b5cf6', total: 40, remaining: 23, shown: 23, go: false },
    { id: 2, name: 'Croco', key: 'F3', color: '#22c55e', total: 180, remaining: 0, shown: 0, go: true },
  ]), 100); },
  onBeep: () => {}, onState: () => {},
});
