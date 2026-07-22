// Gera os candidatos a icone do app: renderiza cada SVG numa janela offscreen
// do proprio Electron e salva PNG (256px) + .ico multi-resolucao.
// Uso: node_modules\electron\dist\electron.exe tools\gerar-icones.js

const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'prototipos', 'icones');
const ROXO = '#9d7bff';
const ROXO_ESC = '#6d47d6';
const TINTA = '#150c26';

// ficha de cada candidato: fundo do tile + glifo por cima
const CANDIDATOS = [
  {
    id: 'a-cooldown',
    nome: 'Seta de cooldown (tile roxo)',
    tile: `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
             <stop offset="0" stop-color="#b39bff"/><stop offset="1" stop-color="${ROXO_ESC}"/>
           </linearGradient>`,
    fundo: 'url(#g)',
    glifo: `<g fill="none" stroke="${TINTA}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round">
              <path d="M186 128a58 58 0 1 1-17-41"/>
              <path d="M186 66v30h-30"/>
            </g>`,
  },
  {
    id: 'b-ampulheta',
    nome: 'Ampulheta (tile roxo)',
    tile: `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
             <stop offset="0" stop-color="#b39bff"/><stop offset="1" stop-color="${ROXO_ESC}"/>
           </linearGradient>`,
    fundo: 'url(#g)',
    glifo: `<g fill="none" stroke="${TINTA}" stroke-width="17" stroke-linecap="round" stroke-linejoin="round">
              <path d="M84 60h88M84 196h88"/>
              <path d="M92 60c0 34 36 40 36 68s-36 34-36 68"/>
              <path d="M164 60c0 34-36 40-36 68s36 34 36 68"/>
            </g>`,
  },
  {
    id: 'c-chama',
    nome: 'Chama roxa (tile escuro)',
    tile: '',
    fundo: '#17131f',
    glifo: `<g transform="translate(48,44) scale(7.1)">
              <path fill="${ROXO}" d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67z"/>
              <path fill="#e4d9ff" d="M12 22c-2.2 0-4-1.8-4-4 0-2 1.2-3.2 2.5-4.6.5 1.4 1.6 2 2.6 2 1.3 0 2.2-.9 2.2-2.3 1.4 1.6 2.7 3 2.7 4.9 0 2.2-1.8 4-4 4z"/>
            </g>`,
  },
  {
    id: 'd-relogio',
    nome: 'Relógio (tile roxo)',
    tile: `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
             <stop offset="0" stop-color="#b39bff"/><stop offset="1" stop-color="${ROXO_ESC}"/>
           </linearGradient>`,
    fundo: 'url(#g)',
    glifo: `<g fill="none" stroke="${TINTA}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="128" cy="132" r="62"/>
              <path d="M128 96v38l26 16"/>
            </g>`,
  },
  {
    id: 'e-anel',
    nome: 'Anel de cooldown (tile escuro)',
    tile: '',
    fundo: '#17131f',
    glifo: `<circle cx="128" cy="128" r="70" fill="none" stroke="#2f2a3d" stroke-width="24"/>
            <circle cx="128" cy="128" r="70" fill="none" stroke="${ROXO}" stroke-width="24"
                    stroke-linecap="round" stroke-dasharray="330 440" transform="rotate(-90 128 128)"/>
            <circle cx="128" cy="128" r="30" fill="${ROXO}"/>`,
  },
  {
    id: 'f-raio',
    nome: 'Raio (tile roxo)',
    tile: `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
             <stop offset="0" stop-color="#b39bff"/><stop offset="1" stop-color="${ROXO_ESC}"/>
           </linearGradient>`,
    fundo: 'url(#g)',
    glifo: `<g transform="translate(52,46) scale(6.4)">
              <path fill="${TINTA}" d="M13 2 4.6 13.4c-.3.4 0 1 .5 1H10l-1.8 7.1c-.1.6.6.9 1 .5L19.4 10c.3-.4 0-1-.5-1H14l1.9-6.4c.2-.6-.5-1-1-.6z"/>
            </g>`,
  },
];

function svgDe(c) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
    <defs>${c.tile}</defs>
    <rect x="8" y="8" width="240" height="240" rx="52" fill="${c.fundo}"/>
    ${c.glifo}
  </svg>`;
}

// monta um .ico com varios PNGs dentro (Windows Vista+ aceita PNG embutido)
function montarIco(pngsPorTamanho) {
  const n = pngsPorTamanho.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // tipo: icone
  header.writeUInt16LE(n, 4);

  const entradas = [];
  let offset = 6 + n * 16;
  for (const { tamanho, buf } of pngsPorTamanho) {
    const e = Buffer.alloc(16);
    e.writeUInt8(tamanho >= 256 ? 0 : tamanho, 0); // 0 significa 256
    e.writeUInt8(tamanho >= 256 ? 0 : tamanho, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);   // planos
    e.writeUInt16LE(32, 6);  // bits por pixel
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    entradas.push(e);
    offset += buf.length;
  }
  return Buffer.concat([header, ...entradas, ...pngsPorTamanho.map((p) => p.buf)]);
}

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const win = new BrowserWindow({
    width: 256,
    height: 256,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true },
  });

  for (const c of CANDIDATOS) {
    const svg = svgDe(c);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;padding:0;background:transparent;width:256px;height:256px;overflow:hidden}
    </style></head><body>${svg}</body></html>`;
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await new Promise((r) => setTimeout(r, 220));

    const img = await win.capturePage();
    const png256 = img.toPNG();
    fs.writeFileSync(path.join(OUT, `${c.id}.png`), png256);

    const tamanhos = [16, 24, 32, 48, 64, 128, 256];
    const partes = tamanhos.map((t) => ({
      tamanho: t,
      buf: t === 256 ? png256 : img.resize({ width: t, height: t, quality: 'best' }).toPNG(),
    }));
    fs.writeFileSync(path.join(OUT, `${c.id}.ico`), montarIco(partes));
    console.log('gerado:', c.id, '-', c.nome);
  }

  win.destroy();
  app.quit();
});
