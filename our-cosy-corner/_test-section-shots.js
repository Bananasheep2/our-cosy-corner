// Capture the #what and #spaces sections at desktop + tablet widths to verify
// the heading scale, single-line card titles, and the rebuilt card layout.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const OUT = require('path').join(require('os').tmpdir(), 'cosy-shots');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1440, height: 1000, webPreferences: { offscreen: true } });
  for (const [w, tag] of [[1440, 'wide'], [820, 'tablet'], [390, 'phone']]) {
    win.setBounds({ x: 0, y: 0, width: w, height: 1000 });
    await sleep(400);
    await win.loadURL(BASE + '/');
    await sleep(2200);
    const js = (c) => win.webContents.executeJavaScript(c, true).catch((e) => 'ERR:' + e.message);

    for (const [sel, name] of [['#what', 'what'], ['#spaces', 'spaces']]) {
      const y = await js(`(function(){var e=document.querySelector('${sel}');if(!e)return -1;window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 40);return 1})()`);
      await sleep(900);
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(OUT, `sec-${name}-${tag}.png`), img.toPNG());
      console.log('captured', `sec-${name}-${tag}`, 'found=' + y);
    }

    // measure: do the three card titles each fit on one line?
    console.log(tag, 'title line counts:', await js(`(function(){
      return [].slice.call(document.querySelectorAll('#what .feature-grid h3')).map(function(h){
        var lh = parseFloat(getComputedStyle(h).lineHeight) || parseFloat(getComputedStyle(h).fontSize)*1.2;
        return h.textContent.split(' ')[0] + '=' + Math.round(h.getBoundingClientRect().height / lh) + 'line(s)';
      }).join(' | ');
    })()`));
    console.log(tag, 'h2 size:', await js(`getComputedStyle(document.querySelector('#what h2')).fontSize`));
    console.log(tag, 'copy/window overlap:', await js(`(function(){
      var c=document.querySelector('.space-card .space-copy'), m=document.querySelector('.space-card .mini-window');
      if(!c||!m) return 'n/a';
      var a=c.getBoundingClientRect(), b=m.getBoundingClientRect();
      return b.left >= a.right ? 'no overlap, gutter ' + Math.round(b.left-a.right) + 'px'
                               : 'OVERLAP ' + Math.round(a.right-b.left) + 'px';
    })()`));
  }
  win.destroy();
  console.log('ALL-DONE');
  app.quit();
}).catch((e) => { console.error('FAIL', e); app.quit(); });
