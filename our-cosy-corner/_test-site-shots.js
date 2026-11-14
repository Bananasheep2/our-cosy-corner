// Website verification harness: loads the local dev site in an offscreen
// window, captures the hero, two scrolled positions (stars/reveals), and
// the /download page.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const OUT = require('path').join(require('os').tmpdir(), 'cosy-shots');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.SITE_URL || 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false, width: 1440, height: 950,
    webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false }
  });
  const js = (code) => win.webContents.executeJavaScript(code, true).catch((e) => 'ERR:' + e.message);
  const shot = async (name) => {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, name), img.toPNG());
    console.log('captured', name);
  };

  await win.loadURL(BASE + '/');
  await sleep(2500);
  console.log('hero button:', await js("(document.querySelector('.actions .button')||{}).textContent"));
  console.log('gif present:', await js("!!document.querySelector('img[src*=demo]')"));
  console.log('stars:', await js("document.querySelectorAll('.star').length"));
  await shot('site-hero.png');
  await js('window.scrollTo({top: 1400, behavior: "instant"})'); await sleep(1200);
  await shot('site-mid.png');
  await js('window.scrollTo({top: 3200, behavior: "instant"})'); await sleep(1200);
  await shot('site-low.png');
  await win.loadURL(BASE + '/download');
  await sleep(2000);
  await shot('site-download.png');
  console.log('dl links:', await js("[].slice.call(document.querySelectorAll('a[href*=downloads]')).map(function(a){return a.getAttribute('href')}).join(' | ')"));
  console.log('ALL-DONE');
  app.quit();
}).catch((e) => { console.error('HARNESS-FAIL', e); app.quit(); });
