const wrap = document.getElementById('wrap');
const SCALES = { small: 0.6, medium: 0.8, large: 1 };

// no layout livre cada janela mostra so a sua magia (?spell=<id>)
const params = new URLSearchParams(location.search);
const soloId = params.get('spell') ? Number(params.get('spell')) : null;

let positioning = false;
let lastItems = [];
let curSettings = { size: 'large', layout: 'vertical', iconSize: 48 };

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function fileUrl(p) {
  return 'file:///' + encodeURI(String(p).replace(/\\/g, '/')).replace(/#/g, '%23');
}

function applySettings(settings) {
  curSettings = settings;
  const mini = settings.size === 'mini';
  const icon = settings.size === 'icon';
  document.body.style.zoom = mini || icon ? 1 : (SCALES[settings.size] ?? 1);
  document.body.classList.toggle('mini', mini);
  document.body.classList.toggle('icon', icon);
  const iconSize = Math.min(96, Math.max(12, Math.round(Number(settings.iconSize) || 48)));
  const borda = iconSize < 28 ? 2 : 3; // mesma regra do main.js
  document.body.style.setProperty('--icon', (iconSize + borda * 2) + 'px');
  document.body.style.setProperty('--iborder', borda + 'px');
  document.body.classList.toggle('horizontal', soloId === null && settings.layout === 'horizontal');
}

function cardHtml(it) {
  // opacidade escolhida vale enquanto conta; nos ultimos 5s e no AGORA! acende sozinho
  const alerta = it.go || (!it.preview && it.shown <= 5);
  const opStyle = positioning ? '' : `opacity:${alerta ? 1 : (curSettings.opacity ?? 1)};`;
  // modo icone: so a imagem (ou a tecla, se nao tiver imagem) com a borda piscando
  if (curSettings.size === 'icon') {
    let cls = 'icard';
    if (it.go) cls += ' go';
    else if (!it.preview && it.shown <= 5) cls += ' warn';
    if (it.preview) cls += ' preview';
    const inner = it.image
      ? `<img src="${fileUrl(it.image)}" alt="">`
      : `<span class="ikey">${esc(it.key)}</span>`;
    return `<div class="${cls}" style="--c:${esc(it.color)};${opStyle}">${inner}</div>`;
  }
  const pct = it.go ? 100 : Math.max(0, Math.min(100, (it.remaining / it.total) * 100));
  let cls = it.go ? 'card go' : (!it.preview && it.shown <= 5 ? 'card warn' : 'card');
  if (it.preview) cls += ' preview';
  const time = it.go ? 'AGORA!' : it.shown + 's';
  const img = it.image ? `<img class="cimg" src="${fileUrl(it.image)}" alt="">` : '';
  return `<div class="${cls}" style="--c:${esc(it.color)};${opStyle}">` + img +
    `<div class="cbody">` +
    `<div class="top"><span class="key">${esc(it.key)}</span>` +
    `<span class="name">${esc(it.name)}</span>` +
    `<span class="time">${time}</span></div>` +
    `<div class="bar"><div class="fill" style="width:${pct}%"></div></div>` +
    `</div></div>`;
}

function render() {
  const items = soloId === null ? lastItems : lastItems.filter((it) => it.id === soloId);
  let html = '';
  if (positioning && soloId === null) {
    html += curSettings.size === 'icon'
      ? '<div class="icard drag-hint-i" style="--c:#8b5cf6"><span class="ikey">✥</span></div>'
      : '<div class="card drag-hint">' +
        '<div class="dh-title">✥ Arraste para posicionar</div>' +
        '<div class="dh-sub">a posição fica salva sozinha</div></div>';
  }
  html += items.map(cardHtml).join('');
  wrap.innerHTML = html;
}

api.getState().then((s) => {
  applySettings(s.settings);
  positioning = !!s.positioning;
  document.body.classList.toggle('positioning', positioning);
  render();
});

api.onState((s) => applySettings(s.settings));

api.onTick((items) => {
  lastItems = items;
  render();
});

api.onPositionMode((on) => {
  positioning = on;
  document.body.classList.toggle('positioning', on);
  render();
});
