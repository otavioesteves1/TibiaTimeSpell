const CORES = ['#8b5cf6', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444'];

let state = null;
let saveTimeout = null;
let selectedId = null;

const rowsEl = document.getElementById('rows');
const countEl = document.getElementById('count');
const savedEl = document.getElementById('saved');
const cornerEl = document.getElementById('corner');
const sizeEl = document.getElementById('size');
const layoutEl = document.getElementById('layout');
const volumeEl = document.getElementById('volume');
const volumeValEl = document.getElementById('volume-val');
const opacityEl = document.getElementById('opacity');
const opacityValEl = document.getElementById('opacity-val');
const iconSizeEl = document.getElementById('icon-size');
const iconSizeValEl = document.getElementById('icon-size-val');
const slIconEl = document.getElementById('sl-icon');
const imgMenu = document.getElementById('img-menu');

// ---- salvamento automatico: toda mudanca vai pro disco na hora ----

let savedTimer = null;
function piscarSalvo() {
  savedEl.classList.add('show');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => savedEl.classList.remove('show'), 1100);
}

function save() {
  clearTimeout(saveTimeout);
  saveTimeout = null;
  api.saveState(state);
  piscarSalvo();
}

// pra campos de texto: espera parar de digitar antes de salvar
function saveDebounced() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(save, 350);
}

// garante que nada digitado se perca se a janela fechar antes do debounce
window.addEventListener('beforeunload', () => {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    api.saveState(state);
  }
});

function novaCor() {
  const usadas = state.spells.map((s) => s.color);
  return CORES.find((c) => !usadas.includes(c)) || CORES[state.spells.length % CORES.length];
}

function fileUrl(p) {
  return 'file:///' + encodeURI(String(p).replace(/\\/g, '/')).replace(/#/g, '%23');
}

function preencherSlider(el) {
  const min = Number(el.min);
  const max = Number(el.max);
  const pct = ((Number(el.value) - min) / (max - min)) * 100;
  el.style.setProperty('--fill', pct + '%');
}

function selectRow(id) {
  selectedId = id;
  for (const r of rowsEl.children) {
    r.classList.toggle('selected', Number(r.dataset.id) === id);
  }
}

function updateThumb(sp) {
  const row = [...rowsEl.children].find((r) => Number(r.dataset.id) === sp.id);
  if (!row) return;
  const thumb = row.querySelector('.img-thumb');
  const ph = row.querySelector('.img-ph');
  if (sp.image) {
    thumb.src = fileUrl(sp.image);
    thumb.hidden = false;
    ph.style.display = 'none';
  } else {
    thumb.hidden = true;
    thumb.removeAttribute('src');
    ph.style.display = '';
  }
}

// ---- imagem: menu do botao ----

async function aplicarImagem(sp, action, btn) {
  const res = action === 'pick' ? await api.pickImage(sp.id)
    : action === 'paste' ? await api.pasteImage(sp.id)
    : await api.clearImage(sp.id);
  if (res && res.ok) {
    sp.image = res.image;
    updateThumb(sp);
    piscarSalvo();
  } else if (res && !res.canceled && btn) {
    // colar sem imagem na area de transferencia: pisca vermelho
    btn.classList.add('err');
    setTimeout(() => btn.classList.remove('err'), 700);
  }
}

function abrirImgMenu(sp, btn) {
  imgMenu.innerHTML = '';
  const mk = (txt, fn) => {
    const b = document.createElement('button');
    b.textContent = txt;
    b.onclick = (e) => {
      e.stopPropagation();
      imgMenu.hidden = true;
      fn();
    };
    imgMenu.appendChild(b);
  };
  mk('Escolher arquivo…', () => aplicarImagem(sp, 'pick', btn));
  mk('Colar imagem (Ctrl+V)', () => aplicarImagem(sp, 'paste', btn));
  if (sp.image) mk('Remover imagem', () => aplicarImagem(sp, 'clear', btn));
  const r = btn.getBoundingClientRect();
  imgMenu.hidden = false;
  const larg = imgMenu.offsetWidth || 200;
  imgMenu.style.left = Math.min(r.left, window.innerWidth - larg - 10) + 'px';
  imgMenu.style.top = Math.min(r.bottom + 4, window.innerHeight - imgMenu.offsetHeight - 10) + 'px';
}

document.addEventListener('mousedown', (e) => {
  if (!imgMenu.hidden && !imgMenu.contains(e.target)) imgMenu.hidden = true;
});

// Ctrl+V com uma linha selecionada cola a imagem nela (fora dos campos de texto)
document.addEventListener('keydown', (e) => {
  if (!e.ctrlKey || e.key.toLowerCase() !== 'v' || selectedId === null) return;
  const el = document.activeElement;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
  const sp = state.spells.find((s) => s.id === selectedId);
  if (!sp) return;
  const row = [...rowsEl.children].find((r) => Number(r.dataset.id) === sp.id);
  aplicarImagem(sp, 'paste', row ? row.querySelector('.img-btn') : null);
});

// ---- tabela ----

function renderRows() {
  rowsEl.innerHTML = '';
  const tpl = document.getElementById('row-template');
  for (const sp of state.spells) {
    const row = tpl.content.firstElementChild.cloneNode(true);
    row.dataset.id = sp.id;

    const enabled = row.querySelector('.in-enabled');
    const name = row.querySelector('.in-name');
    const key = row.querySelector('.in-key');
    const cd = row.querySelector('.in-cd');
    const color = row.querySelector('.in-color');
    const imgBtn = row.querySelector('.img-btn');

    enabled.checked = sp.enabled;
    name.value = sp.name;
    key.value = sp.key;
    cd.value = sp.cooldown;
    color.value = sp.color;

    enabled.onchange = () => { sp.enabled = enabled.checked; save(); };
    name.oninput = () => { sp.name = name.value; saveDebounced(); };
    key.oninput = () => { sp.key = key.value.toUpperCase(); saveDebounced(); };
    cd.onchange = () => {
      const v = Math.round(Number(cd.value));
      sp.cooldown = Number.isFinite(v) ? Math.min(3600, Math.max(2, v)) : 40;
      cd.value = sp.cooldown;
      save();
    };
    color.oninput = () => { sp.color = color.value; saveDebounced(); };

    imgBtn.onclick = (e) => {
      e.stopPropagation();
      abrirImgMenu(sp, imgBtn);
    };

    row.querySelector('.btn-restart').onclick = () => api.restartSpell(sp.id);
    row.querySelector('.btn-del').onclick = () => {
      state.spells = state.spells.filter((s) => s.id !== sp.id);
      renderRows();
      save();
    };

    row.addEventListener('mousedown', () => selectRow(sp.id));

    rowsEl.appendChild(row);
    updateThumb(sp);
  }
  countEl.textContent = state.spells.length;
  if (selectedId !== null) selectRow(selectedId);
}

// ---- status ao vivo (atualiza so o texto, sem re-renderizar, pra nao perder o foco) ----

api.onTick((items) => {
  const porId = new Map(items.map((it) => [it.id, it]));
  for (const row of rowsEl.children) {
    const sp = state ? state.spells.find((s) => s.id === Number(row.dataset.id)) : null;
    const statusEl = row.querySelector('.status');
    const it = sp ? porId.get(sp.id) : null;
    if (!sp || !sp.enabled) {
      statusEl.textContent = '—';
      statusEl.className = 'st idle status';
    } else if (!it || it.preview) {
      statusEl.textContent = '…';
      statusEl.className = 'st idle status';
    } else if (it.go) {
      statusEl.textContent = 'AGORA!';
      statusEl.className = 'st go status';
    } else {
      statusEl.textContent = it.shown + 's';
      statusEl.className = 'st status' + (it.shown <= 5 ? ' warn' : '');
    }
  }
});

// ---- som dos avisos (toca aqui: janela unica que sempre existe) ----

let actx = null;
function beepFreq(freq, dur, delay = 0) {
  const vol = state ? state.settings.volume : 0.5;
  if (vol <= 0) return;
  actx = actx || new AudioContext();
  const t = actx.currentTime + delay;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(actx.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

api.onBeep(({ kind, second }) => {
  if (kind === 'warn') {
    beepFreq(second === 1 ? 1245 : 880, 0.12);
  } else if (kind === 'go') {
    beepFreq(1046, 0.12);
    beepFreq(1568, 0.2, 0.13);
  }
});

// ---- controles gerais ----

document.getElementById('btn-add').onclick = () => {
  state.spells.push({
    id: Date.now(),
    name: 'Nova magia',
    key: 'F1',
    cooldown: 40,
    color: novaCor(),
    enabled: false,
    image: null,
    pos: null,
  });
  renderRows();
  save();
  const inputs = rowsEl.querySelectorAll('.in-name');
  const ultimo = inputs[inputs.length - 1];
  if (ultimo) { ultimo.focus(); ultimo.select(); }
};

document.getElementById('btn-restart-all').onclick = () => api.restartAll();
document.getElementById('btn-test').onclick = () => beepFreq(880, 0.12);

function atualizarIconSlider() {
  const so = sizeEl.value !== 'icon';
  iconSizeEl.disabled = so;
  slIconEl.classList.toggle('dim', so);
}

cornerEl.onchange = () => { state.settings.corner = cornerEl.value; save(); };
sizeEl.onchange = () => {
  state.settings.size = sizeEl.value;
  atualizarIconSlider();
  save();
};
layoutEl.onchange = () => { state.settings.layout = layoutEl.value; save(); };

volumeEl.oninput = () => {
  state.settings.volume = Number(volumeEl.value) / 100;
  volumeValEl.textContent = volumeEl.value + '%';
  preencherSlider(volumeEl);
  saveDebounced();
};

opacityEl.oninput = () => {
  state.settings.opacity = Number(opacityEl.value) / 100;
  opacityValEl.textContent = opacityEl.value + '%';
  preencherSlider(opacityEl);
  saveDebounced();
};

iconSizeEl.oninput = () => {
  state.settings.iconSize = Number(iconSizeEl.value);
  iconSizeValEl.textContent = iconSizeEl.value + 'px';
  preencherSlider(iconSizeEl);
  saveDebounced();
};

// ---- modo "arrastar overlay" ----

let posMode = false;
const btnPos = document.getElementById('btn-position');
const btnPosTxt = document.getElementById('pos-label');

btnPos.onclick = () => {
  posMode = !posMode;
  api.setPositionMode(posMode);
  btnPosTxt.textContent = posMode ? 'Concluir' : 'Arrastar overlay';
  btnPos.classList.toggle('active', posMode);
};

// enquanto o usuario arrasta, o main salva e avisa aqui (pra nao perder no proximo save)
api.onSettings((s) => {
  if (!state) return;
  state.settings.corner = s.corner;
  state.settings.customPos = s.customPos;
  cornerEl.value = s.corner;
  piscarSalvo();
});

api.onSpellPos(({ id, pos }) => {
  if (!state) return;
  const sp = state.spells.find((s) => s.id === id);
  if (sp) sp.pos = pos;
  piscarSalvo();
});

// ---- init ----

api.getState().then((s) => {
  state = s;
  cornerEl.value = state.settings.corner;
  sizeEl.value = state.settings.size;
  layoutEl.value = state.settings.layout;

  volumeEl.value = Math.round(state.settings.volume * 100);
  volumeValEl.textContent = volumeEl.value + '%';
  opacityEl.value = Math.round((state.settings.opacity ?? 1) * 100);
  opacityValEl.textContent = opacityEl.value + '%';
  iconSizeEl.value = state.settings.iconSize ?? 48;
  iconSizeValEl.textContent = iconSizeEl.value + 'px';
  for (const el of [volumeEl, opacityEl, iconSizeEl]) preencherSlider(el);

  atualizarIconSlider();
  renderRows();
});
