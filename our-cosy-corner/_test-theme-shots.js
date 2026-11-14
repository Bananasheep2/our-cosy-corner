// Headless verification harness (throwaway, excluded from packaging by the
// !_test-* rule). Boots the app in LOCAL mode via _test-config-stub.js,
// click-drives welcome → create corner → board, captures a PNG per theme
// preset, exercises importSpace() with a synthetic backup (incl. dedup and
// remap edge cases), then wipes the local test data it created (the file://
// localStorage origin is shared with the real app).
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT = require('path').join(require('os').tmpdir(), 'cosy-shots');
fs.mkdirSync(OUT, { recursive: true });
const SITE = path.join(__dirname, 'website', 'screenshots');
const THEMES = ['parchment', 'peach-blossom', 'cherry-blossom', 'evergreen', 'frosted-petal', 'clear-harbour', 'velvet-night'];
const SITE_THEMES = { 'parchment': 'board-parchment.png', 'peach-blossom': 'board-peach-blossom.png', 'cherry-blossom': 'board-cherry-blossom.png', 'velvet-night': 'board-velvet-night.png' };

const src = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
fs.writeFileSync(path.join(__dirname, '_test-index.html'),
  src.replace('src="supabase-config.js"', 'src="_test-config-stub.js"'));
fs.writeFileSync(path.join(__dirname, '_test-config-stub.js'),
  'window.SUPABASE_CONFIG = {};\nwindow.hasSupabaseConfig = function () { return false; };\n');
fs.mkdirSync(SITE, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false, width: 1440, height: 900,
    webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false }
  });
  await win.loadFile('_test-index.html');
  await sleep(800);
  const js = (code) => win.webContents.executeJavaScript(code, true).catch((e) => 'ERR:' + e.message);

  await js("document.querySelector('#btn-signin').click()"); await sleep(500);
  await js("document.querySelector('#btn-create').click()"); await sleep(700);
  await js("var b=document.querySelector('#btn-gender-skip'); if(b&&b.offsetParent) b.click();"); await sleep(700);
  for (let i = 0; i < 2; i++) {
    await js("document.querySelector('#btn-add-block').click()"); await sleep(350);
    await js("var t=document.querySelector('.popover button'); if(t) t.click();"); await sleep(450);
  }
  console.log('board blocks:', await js("document.querySelectorAll('.block-card').length"));
  // Hide the local-mode dev banner — screenshots double as marketing shots.
  await js("var d=document.querySelector('#banner-dismiss'); if(d) d.click(); var lb=document.querySelector('#local-banner'); if(lb) lb.hidden = true;");
  await sleep(300);

  for (const key of THEMES) {
    await js("window.CosyThemes.apply({ preset: '" + key + "' })");
    await sleep(450);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, 'theme-' + key + '.png'), img.toPNG());
    if (SITE_THEMES[key]) fs.writeFileSync(path.join(SITE, SITE_THEMES[key]), img.toPNG());
    console.log('captured', key);
  }

  // ---- importSpace round-trip with edge cases ----
  const importResult = await js(`(function () {
    var backup = {
      space: { name: 'Restored Corner', sectionNames: { shared: 'Our restored plans' }, theme: { preset: 'evergreen' } },
      pages: [
        { id: 'p1', title: 'Our restored plans', icon: '🏡', parentId: null, kind: 'home', ownerUid: 'shared', order: 0 },
        { id: 'p2', title: 'Second home (should demote)', icon: '🏠', parentId: null, kind: 'home', ownerUid: 'shared', order: 1 },
        { id: 'p3', title: 'A sub page', icon: '📄', parentId: 'p1', kind: 'page', ownerUid: null, order: 2 },
        { id: 'p4', title: 'Old trashed page', icon: '🗑', parentId: null, kind: 'page', ownerUid: null, order: 3, trashed: true, trashedAt: '2026-07-01T00:00:00Z' }
      ],
      blocks: [
        { id: 'b1', pageId: 'p1', type: 'text', content: { html: 'hello restored' }, width: 100, order: 0 },
        { id: 'b2', pageId: 'p3', type: 'todo', content: { items: [] }, width: 50, order: 0 },
        { id: 'b3', pageId: 'missing-page', type: 'text', content: { html: 'orphan → home' }, width: 100, order: 1 }
      ],
      files: []
    };
    return window.CosyStore.importSpace(backup).then(function (newId) {
      var spaces = JSON.parse(localStorage.getItem('cosy.spaces') || '{}');
      var pages = JSON.parse(localStorage.getItem('cosy.pages') || '{}')[newId] || {};
      var blocks = JSON.parse(localStorage.getItem('cosy.blocks') || '{}')[newId] || {};
      var pl = Object.keys(pages).map(function (k) { return pages[k]; });
      var bl = Object.keys(blocks).map(function (k) { return blocks[k]; });
      var homeCount = pl.filter(function (p) { return p.kind === 'home'; }).length;
      var homeId = (pl.filter(function (p) { return p.kind === 'home'; })[0] || {}).id;
      var child = pl.filter(function (p) { return p.title === 'A sub page'; })[0];
      var homeParentOk = child && pl.some(function (p) { return p.id === child.parentId && p.kind === 'home'; });
      var orphan = bl.filter(function (b) { return (b.content || {}).html === 'orphan → home'; })[0];
      return [
        'newId=' + !!newId,
        'name=' + (spaces[newId] || {}).name,
        'pages=' + pl.length,
        'homeCount=' + homeCount + '(want1)',
        'trashedKept=' + pl.some(function (p) { return p.trashed; }),
        'childParentIsHome=' + homeParentOk,
        'blocks=' + bl.length,
        'orphanOnHome=' + (orphan ? orphan.pageId === homeId : 'missing')
      ].join(' | ');
    }, function (e) { return 'IMPORT-FAIL: ' + e.message; });
  })()`);
  console.log('IMPORT TEST:', importResult);

  // bad-file validation path
  console.log('IMPORT VALIDATE:', await js(
    "window.CosyStore.importSpace({ nope: true }).then(function(){return 'accepted (BAD)'}, function(e){return 'rejected ok: '+e.message})"));

  // ---- cleanup: wipe local test data from the shared origin ----
  console.log('CLEANED:', await js(`(function () {
    var ks = ['cosy.localUser','cosy.spaces','cosy.blocks','cosy.pages','cosy.files','cosy.invites','cosy.mySpaceId'];
    var removed = []; ks.forEach(function (k) { if (localStorage.getItem(k) !== null) { localStorage.removeItem(k); removed.push(k); } });
    Object.keys(localStorage).forEach(function (k) { if (k.indexOf('cosy.genderAsked.') === 0 || k.indexOf('cosy.lastSeen.') === 0) { localStorage.removeItem(k); removed.push(k); } });
    return removed.length + ' keys';
  })()`));

  console.log('ALL-DONE');
  app.quit();
}).catch((e) => { console.error('HARNESS-FAIL', e); app.quit(); });
