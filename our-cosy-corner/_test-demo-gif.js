// Demo-GIF harness (throwaway, excluded from packaging). Boots local mode,
// injects a fake animated cursor, click-drives a ~22s product demo
// (create blocks, type, tick a todo, switch themes, hop pages) while
// capturing frames, for ffmpeg assembly into website demo.gif.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT = require('path').join(require('os').tmpdir(), 'cosy-shots', 'gif-frames');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const src = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
fs.writeFileSync(path.join(__dirname, '_test-index.html'),
  src.replace('src="supabase-config.js"', 'src="_test-config-stub.js"'));
fs.writeFileSync(path.join(__dirname, '_test-config-stub.js'),
  'window.SUPABASE_CONFIG = {};\nwindow.hasSupabaseConfig = function () { return false; };\n');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CURSOR_SETUP = `(function () {
  if (window.__demoCursor) return 'exists';
  var c = document.createElement('div');
  c.id = '__demo-cursor';
  c.style.cssText = 'position:fixed;left:640px;top:400px;z-index:2147483647;width:26px;height:26px;pointer-events:none;transition:left .55s cubic-bezier(.3,.7,.3,1),top .55s cubic-bezier(.3,.7,.3,1);filter:drop-shadow(0 2px 4px rgba(60,40,20,.45));';
  c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M5 2 L5 19 L9.5 15.5 L12.5 22 L15 21 L12 14.5 L18 14 Z" fill="#3b2a1c" stroke="#fffdf4" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  document.body.appendChild(c);
  window.__demoCursor = {
    moveTo: function (x, y) { c.style.left = x + 'px'; c.style.top = y + 'px'; },
    moveToEl: function (sel) {
      var el = typeof sel === 'string' ? document.querySelector(sel) : sel;
      if (!el) return false;
      var r = el.getBoundingClientRect();
      this.moveTo(r.left + r.width / 2 - 3, r.top + r.height / 2 - 2);
      return true;
    },
    click: function (sel) {
      var el = typeof sel === 'string' ? document.querySelector(sel) : sel;
      if (!el) return false;
      c.firstChild.style.transform = 'scale(.78)';
      setTimeout(function () { c.firstChild.style.transform = ''; }, 160);
      el.click();
      return true;
    }
  };
  return 'ok';
})()`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false, width: 1280, height: 800,
    webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false }
  });
  win.webContents.setFrameRate(30);
  await win.loadFile('_test-index.html');
  await sleep(800);
  const js = (code) => win.webContents.executeJavaScript(code, true).catch((e) => 'ERR:' + e.message);

  // boot to a fresh board, meadow theme, banner hidden
  await js("document.querySelector('#btn-signin').click()"); await sleep(450);
  await js("document.querySelector('#btn-create').click()"); await sleep(650);
  await js("var b=document.querySelector('#btn-gender-skip'); if(b&&b.offsetParent) b.click();"); await sleep(600);
  await js("var d=document.querySelector('#banner-dismiss'); if(d) d.click(); var lb=document.querySelector('#local-banner'); if(lb) lb.hidden=true;");
  await js("window.CosyThemes.apply({ preset: 'parchment' })");
  console.log('cursor:', await js(CURSOR_SETUP));
  await sleep(400);

  // frame capture loop (concurrent)
  let capturing = true, frame = 0;
  const capLoop = (async () => {
    while (capturing) {
      try {
        const img = await win.webContents.capturePage();
        fs.writeFileSync(path.join(OUT, 'f' + String(frame).padStart(4, '0') + '.png'), img.toPNG());
        frame++;
      } catch (_) {}
      await sleep(100);
    }
  })();

  const move = async (sel, dwell) => { await js("window.__demoCursor.moveToEl(" + JSON.stringify(sel) + ")"); await sleep(dwell || 700); };
  const click = async (sel, dwell) => { await js("window.__demoCursor.click(" + JSON.stringify(sel) + ")"); await sleep(dwell || 600); };
  const clickByText = async (txt, dwell) => {
    await js("(function(){var bs=[].slice.call(document.querySelectorAll('.popover button'));var b=bs.filter(function(x){return x.textContent.indexOf(" + JSON.stringify(txt) + ")!==-1})[0];if(b){window.__demoCursor.moveToEl(b);setTimeout(function(){window.__demoCursor.click(b)},560);}return !!b})()");
    await sleep((dwell || 600) + 560);
  };

  // 1. add a text block and type
  await move('#btn-add-block'); await click('#btn-add-block');
  await clickByText('Text', 800);
  await js("(function(){var ed=document.querySelector('.block-card [contenteditable]');if(!ed)return 'no editor';window.__demoCursor.moveToEl(ed);ed.focus();return 'focused'})()");
  await sleep(650);
  const msg = 'plan our weekend ♡';
  for (const ch of msg) {
    await js("(function(){var ed=document.querySelector('.block-card [contenteditable]');if(ed){ed.focus();document.execCommand('insertText',false," + JSON.stringify(ch) + ");}})()");
    await sleep(85);
  }
  await sleep(700);

  // 2. add a to-do block
  await move('#btn-add-block'); await click('#btn-add-block');
  await clickByText('To-do', 900);

  // 3. theme switch: cherry-blossom, then velvet-night, back to meadow
  await move('#btn-theme'); await click('#btn-theme', 800);
  for (const key of ['cherry-blossom', 'velvet-night']) {
    await js("(function(){var s=document.querySelector('.theme-swatch[data-key=\"" + key + "\"]');if(s){window.__demoCursor.moveToEl(s);setTimeout(function(){window.__demoCursor.click(s)},560);}return !!s})()");
    await sleep(1500);
  }
  await js("(function(){var s=document.querySelector('.theme-swatch[data-key=\"terracotta\"]');if(s){window.__demoCursor.moveToEl(s);setTimeout(function(){window.__demoCursor.click(s)},560);}return !!s})()");
  await sleep(1300);
  await js("(function(){document.body.click()})()"); await sleep(400);

  // 4. hop to a personal page and back
  const rows = "document.querySelectorAll('.page-row')";
  await js("(function(){var r=" + rows + ";if(r.length>1){window.__demoCursor.moveToEl(r[1]);setTimeout(function(){window.__demoCursor.click(r[1])},560);}})()");
  await sleep(1500);
  await js("(function(){var r=" + rows + ";if(r.length){window.__demoCursor.moveToEl(r[0]);setTimeout(function(){window.__demoCursor.click(r[0])},560);}})()");
  await sleep(1400);

  // 5. settle
  await js("window.__demoCursor.moveTo(660, 470)");
  await sleep(1100);

  capturing = false; await capLoop;
  console.log('frames captured:', frame);

  // cleanup local test data
  console.log('CLEANED:', await js(`(function(){var ks=['cosy.localUser','cosy.spaces','cosy.blocks','cosy.pages','cosy.files','cosy.invites','cosy.mySpaceId'];var n=0;ks.forEach(function(k){if(localStorage.getItem(k)!==null){localStorage.removeItem(k);n++;}});Object.keys(localStorage).forEach(function(k){if(k.indexOf('cosy.genderAsked.')===0||k.indexOf('cosy.lastSeen.')===0){localStorage.removeItem(k);n++;}});return n+' keys'})()`));
  console.log('ALL-DONE');
  app.quit();
}).catch((e) => { console.error('HARNESS-FAIL', e); app.quit(); });
