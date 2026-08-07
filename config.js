const CORES = ['#8b5cf6', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444'];

let state = null;
let saveTimeout = null;
let expandedId = null; // item aberto (acordeao: um por vez); tambem recebe o Ctrl+V

const rowsEl = document.getElementById('rows');
const emptyEl = document.getElementById('empty');
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

// ---- salvamento automatico ----

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

function saveDebounced() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(save, 350);
}

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

function rowDe(id) {
  return [...rowsEl.children].find((r) => Number(r.dataset.id) === id);
}

function atualizarImagens(sp) {
  const row = rowDe(sp.id);
  if (!row) return;
  for (const [imgSel, phSel] of [['.thumb-img', '.thumb-ph'], ['.img-thumb', '.img-ph']]) {
    const img = row.querySelector(imgSel);
    const ph = row.querySelector(phSel);
    if (sp.image) {
      img.src = fileUrl(sp.image);
      img.hidden = false;
      ph.style.display = 'none';
    } else {
      img.hidden = true;
      img.removeAttribute('src');
      ph.style.display = '';
    }
  }
}

// ---- imagem ----

async function aplicarImagem(sp, action, btn) {
  const res = action === 'pick' ? await api.pickImage(sp.id)
    : action === 'paste' ? await api.pasteImage(sp.id)
    : await api.clearImage(sp.id);
  if (res && res.ok) {
    sp.image = res.image;
    atualizarImagens(sp);
    piscarSalvo();
  } else if (res && !res.canceled && btn) {
    btn.classList.add('err');
    setTimeout(() => btn.classList.remove('err'), 700);
  }
}

// Ctrl+V no item aberto cola a imagem (fora dos campos de texto)
document.addEventListener('keydown', (e) => {
  if (!e.ctrlKey || e.key.toLowerCase() !== 'v' || expandedId === null) return;
  const el = document.activeElement;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
  const sp = state.spells.find((s) => s.id === expandedId);
  if (!sp) return;
  const row = rowDe(sp.id);
  aplicarImagem(sp, 'paste', row ? row.querySelector('.img-btn') : null);
});

// ---- expandir / recolher (acordeao) ----

function setExpanded(id, on) {
  const row = rowDe(id);
  if (!row) return;
  const edit = row.querySelector('.edit');
  if (on) {
    // fecha os outros
    if (expandedId !== null && expandedId !== id) setExpanded(expandedId, false);
    expandedId = id;
    row.classList.add('open');
    edit.hidden = false;
  } else {
    if (expandedId === id) expandedId = null;
    row.classList.remove('open');
    edit.hidden = true;
  }
}

function toggleExpanded(id) {
  setExpanded(id, expandedId !== id);
}

// ---- lista ----

function renderRows() {
  rowsEl.innerHTML = '';
  const tpl = document.getElementById('row-template');
  for (const sp of state.spells) {
    const row = tpl.content.firstElementChild.cloneNode(true);
    row.dataset.id = sp.id;

    const enabled = row.querySelector('.in-enabled');
    const rName = row.querySelector('.r-name');
    const rKey = row.querySelector('.r-key');
    const name = row.querySelector('.in-name');
    const key = row.querySelector('.in-key');
    const cd = row.querySelector('.in-cd');
    const color = row.querySelector('.in-color');

    enabled.checked = sp.enabled;
    row.classList.toggle('disabled', !sp.enabled);
    rName.textContent = sp.name || 'Magia';
    rKey.textContent = sp.key || '—';
    name.value = sp.name;
    key.value = sp.key;
    cd.value = sp.cooldown;
    color.value = sp.color;

    enabled.onchange = () => {
      sp.enabled = enabled.checked;
      row.classList.toggle('disabled', !sp.enabled);
      save();
    };
    name.oninput = () => {
      sp.name = name.value;
      rName.textContent = sp.name || 'Magia';
      saveDebounced();
    };
    key.oninput = () => {
      sp.key = key.value.toUpperCase();
      rKey.textContent = sp.key || '—';
      saveDebounced();
    };
    cd.onchange = () => {
      const v = Math.round(Number(cd.value));
      sp.cooldown = Number.isFinite(v) ? Math.min(3600, Math.max(2, v)) : 40;
      cd.value = sp.cooldown;
      save();
    };
    color.oninput = () => { sp.color = color.value; saveDebounced(); };

    // abrir/fechar
    row.querySelector('.open').onclick = () => toggleExpanded(sp.id);
    row.querySelector('.chev-btn').onclick = () => toggleExpanded(sp.id);

    // imagem
    const imgBtn = row.querySelector('.img-btn');
    imgBtn.onclick = () => aplicarImagem(sp, 'pick', imgBtn);
    row.querySelector('.act-pick').onclick = () => aplicarImagem(sp, 'pick', imgBtn);
    row.querySelector('.act-paste').onclick = () => aplicarImagem(sp, 'paste', imgBtn);
    row.querySelector('.act-clear').onclick = () => aplicarImagem(sp, 'clear', imgBtn);

    // acoes
    row.querySelector('.btn-restart').onclick = () => api.restartSpell(sp.id);
    row.querySelector('.btn-del').onclick = () => {
      if (expandedId === sp.id) expandedId = null;
      state.spells = state.spells.filter((s) => s.id !== sp.id);
      renderRows();
      save();
    };

    rowsEl.appendChild(row);
    atualizarImagens(sp);
    if (expandedId === sp.id) setExpanded(sp.id, true);
  }
  countEl.textContent = state.spells.length;
  emptyEl.hidden = state.spells.length > 0;
}

// ---- status ao vivo ----

api.onTick((items) => {
  const porId = new Map(items.map((it) => [it.id, it]));
  for (const row of rowsEl.children) {
    const sp = state ? state.spells.find((s) => s.id === Number(row.dataset.id)) : null;
    const statusEl = row.querySelector('.r-status');
    const it = sp ? porId.get(sp.id) : null;
    if (!sp || !sp.enabled) {
      statusEl.textContent = '—';
      statusEl.className = 'st idle r-status';
    } else if (!it || it.preview) {
      statusEl.textContent = '…';
      statusEl.className = 'st idle r-status';
    } else if (it.go) {
      statusEl.textContent = 'AGORA!';
      statusEl.className = 'st go r-status';
    } else {
      statusEl.textContent = it.shown + 's';
      statusEl.className = 'st r-status' + (it.shown <= 5 ? ' warn' : '');
    }
  }
});

// ---- som ----

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
  const novo = {
    id: Date.now(),
    name: 'Nova magia',
    key: 'F1',
    cooldown: 40,
    color: novaCor(),
    enabled: false,
    image: null,
    pos: null,
  };
  state.spells.push(novo);
  expandedId = novo.id;
  renderRows();
  save();
  const row = rowDe(novo.id);
  if (row) {
    row.scrollIntoView({ block: 'nearest' });
    const n = row.querySelector('.in-name');
    if (n) { n.focus(); n.select(); }
  }
};

document.getElementById('btn-restart-all').onclick = () => api.restartAll();
document.getElementById('btn-test').onclick = () => beepFreq(880, 0.12);

document.getElementById('win-min').onclick = () => api.winMinimize();
document.getElementById('win-max').onclick = () => api.winMaximize();
document.getElementById('win-close').onclick = () => api.winClose();

// painel Overlay recolhível
const ovHead = document.getElementById('ov-head');
const ovBody = document.getElementById('ov-body');
ovHead.onclick = () => {
  const abrir = ovBody.hidden;
  ovBody.hidden = !abrir;
  ovHead.setAttribute('aria-expanded', String(abrir));
};

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

// ---- arrastar overlay ----

let posMode = false;
const btnPos = document.getElementById('btn-position');
const btnPosTxt = document.getElementById('pos-label');

btnPos.onclick = () => {
  posMode = !posMode;
  api.setPositionMode(posMode);
  btnPosTxt.textContent = posMode ? 'Concluir' : 'Arrastar overlay';
  btnPos.classList.toggle('active', posMode);
};

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
