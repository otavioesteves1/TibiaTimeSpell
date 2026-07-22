const { app, BrowserWindow, ipcMain, screen, dialog, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');

// hook global de teclado (escuta a tecla sem roubar do jogo)
let uIOhook = null;
let UiohookKey = null;
try {
  ({ uIOhook, UiohookKey } = require('uiohook-napi'));
} catch (e) {
  console.error('uiohook-napi indisponivel; sync por tecla desligado:', e.message);
}

// ---- Layout base na escala "grande" (precisa bater com o CSS do overlay.html) ----
const CARD_W = 250;
const ROW_H = 52;
const GAP = 8;
const PAD = 10;
const MARGIN = 12;
const SCALES = { small: 0.6, medium: 0.8, large: 1 };
const SIZES = ['icon', 'mini', 'small', 'medium', 'large'];
// tamanho "mini": so icone + tecla + tempo, cartao compacto com dimensoes proprias
const MINI = { cardW: 130, rowH: 36, gap: 6, pad: 8 };
// tamanho "icone": so a imagem com borda que pisca no aviso (borda fina em icones pequenos)
const clampIconSize = (v) => Math.min(96, Math.max(12, Math.round(Number(v) || 48)));
const iconBorder = (size) => (size < 28 ? 2 : 3);

const CORES = ['#8b5cf6', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444'];
const CANTOS = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'custom'];
const LAYOUTS = ['vertical', 'horizontal', 'free'];

const DEFAULT_STATE = {
  spells: [
    { id: 1, name: 'Exemplo (edite aqui)', key: 'F10', cooldown: 40, color: '#8b5cf6', enabled: false, image: null, pos: null },
  ],
  settings: { corner: 'top-right', volume: 0.6, customPos: null, size: 'large', layout: 'vertical', opacity: 1, iconSize: 48 },
};

// pasta fixa de config (senao o Electron usaria o productName com espacos).
// O projeto se chamava "tibia-alerta-magias": migra a pasta antiga pra nao perder nada.
const USER_DIR = path.join(app.getPath('appData'), 'TibiaTimeSpell');
const LEGACY_DIR = path.join(app.getPath('appData'), 'tibia-alerta-magias');
let dataDir = USER_DIR;
try {
  if (!fs.existsSync(USER_DIR) && fs.existsSync(LEGACY_DIR)) fs.renameSync(LEGACY_DIR, USER_DIR);
} catch (e) {
  dataDir = LEGACY_DIR; // migracao falhou: segue na pasta antiga em vez de perder a config
  console.error('Migracao da pasta de config falhou, usando a antiga:', e.message);
}
app.setPath('userData', dataDir);

// caminhos de imagem salvos apontam pra pasta antiga: reaponta pra nova
function remapImagem(p) {
  if (typeof p !== 'string' || !p) return null;
  if (dataDir !== LEGACY_DIR && p.startsWith(LEGACY_DIR)) {
    return path.join(dataDir, p.slice(LEGACY_DIR.length + 1));
  }
  return p;
}

let state = null;
let configWin = null;
let overlayWin = null;        // janela unica (layouts vertical/horizontal)
const freeWins = new Map();   // layout livre: id da magia -> janela propria
let positionMode = false;     // modo "arrastar overlay" ativo
let programmaticMove = false; // nosso proprio setBounds nao conta como arraste do usuario
let lastSig = '';

// id da magia -> { startedAt, total, lastShown, lastCycle }
const timers = new Map();

const configPath = () => path.join(app.getPath('userData'), 'config.json');
const imagesDir = () => path.join(app.getPath('userData'), 'images');

function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    return {
      spells: Array.isArray(raw.spells) && raw.spells.length ? raw.spells.map(sanitizeSpell) : DEFAULT_STATE.spells,
      settings: { ...DEFAULT_STATE.settings, ...(raw.settings || {}) },
    };
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
}

function saveStateToDisk() {
  try {
    fs.writeFileSync(configPath(), JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('Erro ao salvar config:', e);
  }
}

function sanitizeSpell(sp) {
  const cd = Math.round(Number(sp.cooldown));
  const pos = sp.pos && Number.isFinite(sp.pos.x) && Number.isFinite(sp.pos.y)
    ? { x: Math.round(sp.pos.x), y: Math.round(sp.pos.y) }
    : null;
  return {
    id: Number(sp.id) || Date.now(),
    name: String(sp.name || 'Magia').slice(0, 40),
    key: String(sp.key || '').slice(0, 12),
    cooldown: Number.isFinite(cd) ? Math.min(3600, Math.max(2, cd)) : 40,
    color: /^#[0-9a-fA-F]{6}$/.test(sp.color || '') ? sp.color : CORES[0],
    enabled: !!sp.enabled,
    image: remapImagem(sp.image),
    pos,
  };
}

// medidas do cartao conforme o tamanho escolhido
function metrics() {
  if (state.settings.size === 'icon') {
    const size = clampIconSize(state.settings.iconSize);
    const d = size + iconBorder(size) * 2;
    return { cardW: d, rowH: d, gap: 6, pad: 6, s: 1 };
  }
  if (state.settings.size === 'mini') return { ...MINI, s: 1 };
  return { cardW: CARD_W, rowH: ROW_H, gap: GAP, pad: PAD, s: SCALES[state.settings.size] ?? 1 };
}

function activeCount() {
  return state.spells.filter((s) => s.enabled).length;
}

// no modo posicionar todas as magias aparecem (mesmo desligadas) pra poder arrastar
function desiredSpells() {
  return positionMode ? state.spells : state.spells.filter((s) => s.enabled);
}

function allOverlayWins() {
  const wins = [];
  if (overlayWin && !overlayWin.isDestroyed()) wins.push(overlayWin);
  for (const w of freeWins.values()) if (!w.isDestroyed()) wins.push(w);
  return wins;
}

function sendOverlays(channel, payload) {
  for (const w of allOverlayWins()) w.webContents.send(channel, payload);
}

function sendConfig(channel, payload) {
  if (configWin && !configWin.isDestroyed()) configWin.webContents.send(channel, payload);
}

// ---- Timers ----

function reconcileTimers() {
  const now = Date.now();
  const ativos = new Set();
  for (const sp of state.spells) {
    if (!sp.enabled) continue;
    ativos.add(sp.id);
    const t = timers.get(sp.id);
    if (!t) {
      timers.set(sp.id, { startedAt: now, total: sp.cooldown, lastShown: null, ready: false });
    } else if (t.total !== sp.cooldown) {
      // tempo mudou: recomeca o ciclo do zero
      t.startedAt = now;
      t.total = sp.cooldown;
      t.lastShown = null;
      t.ready = false;
    }
  }
  for (const id of [...timers.keys()]) {
    if (!ativos.has(id)) timers.delete(id);
  }
  rebuildKeymap();
}

function restartTimer(id) {
  const t = timers.get(id);
  if (!t) return;
  t.startedAt = Date.now();
  t.lastShown = null;
  t.ready = false;
}

function tick() {
  const now = Date.now();
  const items = [];
  for (const sp of desiredSpells()) {
    const t = sp.enabled ? timers.get(sp.id) : null;
    if (t) {
      const total = t.total;
      const elapsed = (now - t.startedAt) / 1000;
      let remaining, shown, go;
      if (elapsed >= total) {
        // zerou: fica piscando "AGORA!" ate o usuario apertar a tecla (nao reseta sozinho)
        if (!t.ready) {
          t.ready = true;
          sendConfig('beep', { kind: 'go' });
        }
        remaining = 0;
        shown = 0;
        go = true;
      } else {
        remaining = total - elapsed;
        shown = Math.ceil(remaining);
        go = false;
        if (shown !== t.lastShown) {
          t.lastShown = shown;
          if ((shown === 5 || shown === 3 || shown === 1) && shown < total) {
            sendConfig('beep', { kind: 'warn', second: shown });
          }
        }
      }

      items.push({ id: sp.id, name: sp.name, key: sp.key, color: sp.color, image: sp.image, total, remaining, shown, go });
    } else {
      // previa no modo posicionar: magia desligada aparece parada no tempo cheio
      items.push({
        id: sp.id, name: sp.name, key: sp.key, color: sp.color, image: sp.image,
        total: sp.cooldown, remaining: sp.cooldown, shown: sp.cooldown, go: false, preview: true,
      });
    }
  }

  sendOverlays('tick', items);
  sendConfig('tick', items);

  const sig = state.settings.layout + '|' + state.settings.size + '|' + items.map((i) => i.id).join(',');
  if (!positionMode && sig !== lastSig) syncOverlays();
}

// ---- Sync pela tecla: apertou F10 em qualquer lugar -> reseta a contagem ----

let keyToSpells = new Map(); // keycode do uiohook -> [ids de magia]

function keycodeFromLabel(label) {
  if (!UiohookKey) return null;
  const norm = String(label || '').trim().toUpperCase();
  if (!norm) return null;
  // F10, A..Z e 0..9 batem direto; "SPACE" etc. viram "Space"
  const code = UiohookKey[norm] ?? UiohookKey[norm.charAt(0) + norm.slice(1).toLowerCase()];
  return typeof code === 'number' ? code : null;
}

function rebuildKeymap() {
  keyToSpells = new Map();
  for (const sp of state.spells) {
    if (!sp.enabled) continue;
    const code = keycodeFromLabel(sp.key);
    if (code === null) continue;
    if (!keyToSpells.has(code)) keyToSpells.set(code, []);
    keyToSpells.get(code).push(sp.id);
  }
}

function startKeyHook() {
  if (!uIOhook) return;
  uIOhook.on('keydown', (e) => {
    const ids = keyToSpells.get(e.keycode);
    if (!ids) return;
    const now = Date.now();
    for (const id of ids) {
      const t = timers.get(id);
      if (!t) continue;
      if (now - t.startedAt < 400) continue; // ignora o auto-repeat da tecla segurada
      restartTimer(id);
      console.log('[sync] tecla detectada, timer resetado (magia', id + ')');
    }
  });
  uIOhook.start();
  app.on('will-quit', () => uIOhook.stop());
}

// ---- Janelas de overlay ----

function keepOverlayOnTop() {
  if (positionMode) return; // nao brigar pelo topo enquanto o usuario arrasta
  for (const w of allOverlayWins()) {
    if (!w.isVisible()) continue;
    w.setAlwaysOnTop(true, 'screen-saver');
    w.moveTop();
  }
}

function applyMouseMode() {
  for (const w of allOverlayWins()) {
    if (positionMode) {
      w.setFocusable(true);
      w.setMovable(true);
      w.setIgnoreMouseEvents(false);
    } else {
      w.setIgnoreMouseEvents(true);
      w.setMovable(false);
      w.setFocusable(false);
    }
    // opacidade agora e por cartao (CSS): apagado enquanto conta, aceso no aviso
  }
}

function createOverlayWindow(spellId) {
  const win = new BrowserWindow({
    width: 100,
    height: 100,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true);
  if (spellId == null) win.loadFile('overlay.html');
  else win.loadFile('overlay.html', { query: { spell: String(spellId) } });

  // usuario arrastou: salva a posicao (com debounce, 'move' dispara varias vezes)
  let saveTimer = null;
  win.on('move', () => {
    if (!positionMode || programmaticMove) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (win.isDestroyed()) return;
      const [x, y] = win.getPosition();
      if (spellId == null) {
        state.settings.corner = 'custom';
        state.settings.customPos = { x, y };
        sendConfig('settings', state.settings);
      } else {
        const sp = state.spells.find((s) => s.id === spellId);
        if (sp) {
          sp.pos = { x, y };
          sendConfig('spell-pos', { id: spellId, pos: sp.pos });
        }
      }
      saveStateToDisk();
    }, 250);
  });
  return win;
}

function setWinBounds(win, x, y, w, h) {
  programmaticMove = true;
  win.setBounds({ x, y, width: w, height: h });
  setTimeout(() => { programmaticMove = false; }, 100);
}

function cornerXY(corner, w, h) {
  const c = corner === 'custom' ? 'top-right' : corner;
  const wa = screen.getPrimaryDisplay().workArea;
  const x = c.endsWith('left') ? wa.x + MARGIN : wa.x + wa.width - w - MARGIN;
  const y = c.startsWith('top') ? wa.y + MARGIN : wa.y + wa.height - h - MARGIN;
  return { x, y };
}

function clampToDisplay(pos, w, h) {
  const wa = screen.getDisplayNearestPoint({ x: pos.x, y: pos.y }).workArea;
  return {
    x: Math.min(Math.max(pos.x, wa.x), wa.x + wa.width - w),
    y: Math.min(Math.max(pos.y, wa.y), wa.y + wa.height - h),
  };
}

// recalcula quais janelas existem, tamanho e posicao de cada uma
function syncOverlays() {
  const layout = state.settings.layout;
  const list = desiredSpells();
  const m = metrics();
  lastSig = layout + '|' + state.settings.size + '|' + list.map((i) => i.id).join(',');

  if (layout === 'free') {
    if (overlayWin && !overlayWin.isDestroyed() && overlayWin.isVisible()) overlayWin.hide();
    for (const [id, w] of [...freeWins]) {
      if (!list.some((sp) => sp.id === id)) {
        w.destroy();
        freeWins.delete(id);
      }
    }
    const w = Math.round((m.pad * 2 + m.cardW) * m.s);
    const h = Math.round((m.pad * 2 + m.rowH) * m.s);
    list.forEach((sp, i) => {
      let win = freeWins.get(sp.id);
      if (!win || win.isDestroyed()) {
        win = createOverlayWindow(sp.id);
        freeWins.set(sp.id, win);
      }
      let x, y;
      if (sp.pos) {
        ({ x, y } = clampToDisplay(sp.pos, w, h));
      } else {
        // sem posicao salva ainda: empilha a partir do canto escolhido
        const base = cornerXY(state.settings.corner, w, h);
        const step = h + Math.round(m.gap * m.s);
        x = base.x;
        y = state.settings.corner.startsWith('bottom') ? base.y - i * step : base.y + i * step;
      }
      setWinBounds(win, x, y, w, h);
      if (!win.isVisible()) win.showInactive();
    });
  } else {
    for (const w of freeWins.values()) w.destroy();
    freeWins.clear();
    if (!overlayWin || overlayWin.isDestroyed()) overlayWin = createOverlayWindow(null);
    // modo posicionar tem o cartao extra "arraste aqui"
    const rows = positionMode ? list.length + 1 : list.length;
    if (rows === 0) {
      if (overlayWin.isVisible()) overlayWin.hide();
      applyMouseMode();
      return;
    }
    let w, h;
    if (layout === 'horizontal') {
      w = Math.round((m.pad * 2 + rows * m.cardW + (rows - 1) * m.gap) * m.s);
      h = Math.round((m.pad * 2 + m.rowH) * m.s);
    } else {
      w = Math.round((m.pad * 2 + m.cardW) * m.s);
      h = Math.round((m.pad * 2 + rows * m.rowH + (rows - 1) * m.gap) * m.s);
    }
    const corner = state.settings.corner;
    const pos = state.settings.customPos;
    const { x, y } = corner === 'custom' && pos ? clampToDisplay(pos, w, h) : cornerXY(corner, w, h);
    setWinBounds(overlayWin, x, y, w, h);
    if (!overlayWin.isVisible()) overlayWin.showInactive();
  }
  applyMouseMode();
  keepOverlayOnTop();
}

function createConfigWindow() {
  configWin = new BrowserWindow({
    width: 940,
    height: 680,
    minWidth: 360,   // modo magrinho: a interface se adapta ate ficar bem estreita
    minHeight: 420,
    backgroundColor: '#0c0c0c',
    autoHideMenuBar: true,
    frame: false,    // barra de titulo propria (sem a faixa azul do Windows)
    title: 'TibiaTimeSpell',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false, // o som dos avisos toca aqui, mesmo minimizada
    },
  });
  configWin.loadFile('config.html');
  configWin.on('closed', () => {
    configWin = null;
    app.quit();
  });
}

// ---- Imagens das magias ----

function tryDeleteImage(p) {
  try {
    if (p && p.startsWith(imagesDir())) fs.unlinkSync(p);
  } catch {}
}

function setSpellImageFromFile(id, src) {
  const sp = state.spells.find((s) => s.id === id);
  if (!sp) return { ok: false };
  try {
    fs.mkdirSync(imagesDir(), { recursive: true });
    const ext = (path.extname(src) || '.png').toLowerCase();
    const dest = path.join(imagesDir(), `${id}_${Date.now()}${ext}`);
    fs.copyFileSync(src, dest);
    tryDeleteImage(sp.image);
    sp.image = dest;
    saveStateToDisk();
    return { ok: true, image: dest };
  } catch (e) {
    console.error('Erro ao copiar imagem:', e);
    return { ok: false };
  }
}

ipcMain.handle('spell:image-pick', async (_e, id) => {
  const r = await dialog.showOpenDialog(configWin, {
    title: 'Escolher imagem da magia',
    filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }],
    properties: ['openFile'],
  });
  if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
  return setSpellImageFromFile(Number(id), r.filePaths[0]);
});

ipcMain.handle('spell:image-paste', (_e, id) => {
  id = Number(id);
  const img = clipboard.readImage();
  if (!img.isEmpty()) {
    const sp = state.spells.find((s) => s.id === id);
    if (!sp) return { ok: false };
    try {
      fs.mkdirSync(imagesDir(), { recursive: true });
      const dest = path.join(imagesDir(), `${id}_${Date.now()}.png`);
      fs.writeFileSync(dest, img.toPNG());
      tryDeleteImage(sp.image);
      sp.image = dest;
      saveStateToDisk();
      return { ok: true, image: dest };
    } catch (e) {
      console.error('Erro ao salvar imagem colada:', e);
      return { ok: false };
    }
  }
  // arquivo de imagem copiado no Explorer (Ctrl+C no arquivo): preserva GIF animado
  try {
    const buf = clipboard.readBuffer('FileNameW');
    if (buf && buf.length) {
      const p = buf.toString('ucs2').replace(/\0+$/, '');
      if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(p) && fs.existsSync(p)) {
        return setSpellImageFromFile(id, p);
      }
    }
  } catch {}
  return { ok: false, empty: true };
});

ipcMain.handle('spell:image-clear', (_e, id) => {
  const sp = state.spells.find((s) => s.id === Number(id));
  if (!sp) return { ok: false };
  tryDeleteImage(sp.image);
  sp.image = null;
  saveStateToDisk();
  return { ok: true, image: null };
});

// ---- IPC ----

ipcMain.handle('state:get', () => ({ ...state, positioning: positionMode }));

ipcMain.on('state:save', (_e, next) => {
  const prevSpells = state.spells;
  if (next && Array.isArray(next.spells)) state.spells = next.spells.map(sanitizeSpell);
  if (next && next.settings) state.settings = { ...state.settings, ...next.settings };
  if (!CANTOS.includes(state.settings.corner)) state.settings.corner = 'top-right';
  if (!LAYOUTS.includes(state.settings.layout)) state.settings.layout = 'vertical';
  if (!SIZES.includes(state.settings.size)) state.settings.size = 'large';
  state.settings.volume = Math.min(1, Math.max(0, Number(state.settings.volume) || 0));
  state.settings.opacity = Math.min(1, Math.max(0.2, Number(state.settings.opacity) || 1));
  state.settings.iconSize = clampIconSize(state.settings.iconSize);
  // magia removida leva a imagem junto
  for (const old of prevSpells) {
    if (old.image && !state.spells.some((sp) => sp.id === old.id)) tryDeleteImage(old.image);
  }
  reconcileTimers();
  saveStateToDisk();
  syncOverlays();
  sendOverlays('state', state);
});

ipcMain.on('spell:restart', (_e, id) => restartTimer(Number(id)));

// botoes da barra de titulo propria
ipcMain.on('win:minimize', () => configWin && configWin.minimize());
ipcMain.on('win:maximize', () => {
  if (!configWin) return;
  if (configWin.isMaximized()) configWin.unmaximize();
  else configWin.maximize();
});
ipcMain.on('win:close', () => configWin && configWin.close());

ipcMain.on('spells:restart-all', () => {
  for (const id of timers.keys()) restartTimer(id);
});

ipcMain.on('overlay:position-mode', (_e, on) => {
  positionMode = !!on;
  syncOverlays();
  sendOverlays('position-mode', positionMode);
});

// ---- Ciclo de vida ----

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (configWin) {
      if (configWin.isMinimized()) configWin.restore();
      configWin.show();
      configWin.focus();
    }
  });

  app.whenReady().then(() => {
    state = loadState();
    // se a migracao reapontou alguma imagem, grava o caminho novo de uma vez
    if (state.spells.some((sp) => sp.image && sp.image.startsWith(dataDir))) saveStateToDisk();
    createConfigWindow();
    reconcileTimers();
    syncOverlays();
    startKeyHook();
    setInterval(tick, 100);
    setInterval(keepOverlayOnTop, 1000);
    // jogo abrindo/fechando pode trocar a resolucao: recoloca os overlays
    screen.on('display-metrics-changed', () => syncOverlays());
  });
}

app.on('window-all-closed', () => app.quit());
