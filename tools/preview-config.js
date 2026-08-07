// Renderiza config.html com dados de exemplo e salva um PNG, pra revisar o layout.
// Uso: node_modules\electron\dist\electron.exe tools\preview-config.js [largura] [--expand]
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const W = Number(process.argv[2]) || 380;
const EXPAND = process.argv.includes('--expand');
const OUT = path.join(app.getPath('temp'), 'preview-config.png');

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: W, height: 648, show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preview-preload.js'),
      offscreen: true,
    },
  });
  await win.loadFile(path.join(__dirname, '..', 'config.html'));
  await new Promise((r) => setTimeout(r, 500));
  if (EXPAND) {
    await win.webContents.executeJavaScript(
      "document.querySelector('.open') && document.querySelector('.open').click();"
      + "document.getElementById('ov-head').click();"
    );
    await new Promise((r) => setTimeout(r, 400));
  }
  const img = await win.webContents.capturePage();
  fs.writeFileSync(OUT, img.toPNG());
  console.log('PREVIEW_SALVO:' + OUT);
  win.destroy();
  app.quit();
});
