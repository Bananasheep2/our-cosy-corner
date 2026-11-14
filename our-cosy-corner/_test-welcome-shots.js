// Welcome-screen design verification: captures the redesigned sign-in screen
// in local mode, simulated cloud mode, and cloud mode under velvet-night.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const OUT = require('path').join(require('os').tmpdir(), 'cosy-shots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const src = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
fs.writeFileSync(path.join(__dirname, '_test-index.html'),
  src.replace('src="supabase-config.js"', 'src="_test-config-stub.js"'));
fs.writeFileSync(path.join(__dirname, '_test-config-stub.js'),
  'window.SUPABASE_CONFIG = {};\nwindow.hasSupabaseConfig = function () { return false; };\n');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false, width: 1440, height: 900,
    webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false }
  });
  await win.loadFile('_test-index.html');
  await sleep(1200);
  const js = (code) => win.webContents.executeJavaScript(code, true).catch((e) => 'ERR:' + e.message);
  const shot = async (name) => {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, name), img.toPNG());
    console.log('captured', name);
  };

  await js("var lb=document.querySelector('#local-banner'); if(lb) lb.hidden=true;");
  await shot('welcome-local.png');

  // simulate cloud mode presentation
  await js(`(function(){
    var s=document.querySelector('#screen-welcome');
    s.classList.remove('local'); s.classList.add('cloud');
    document.querySelector('#local-name-row').hidden = true;
    document.querySelector('#btn-signin-label').textContent = 'Continue with Google';
    document.querySelector('.welcome-foot').textContent = 'Sign in to find your shared corner — or start a new one.';
    return 'cloud-sim';
  })()`);
  await sleep(300);
  await shot('welcome-cloud.png');

  await js("window.CosyThemes.apply({ preset: 'velvet-night' })");
  await sleep(400);
  await shot('welcome-cloud-dark.png');

  console.log('ALL-DONE');
  app.quit();
}).catch((e) => { console.error('HARNESS-FAIL', e); app.quit(); });
