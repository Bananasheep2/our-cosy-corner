/*
 * blocks.js — renders each block type into a DOM node and wires its editing.
 * The UI shell (card frame, drag handle, delete) lives in app.js; here we only
 * build the *content* of a block and call ctx.update(patch) when it changes.
 *
 * ctx = {
 *   update(patch)  -> persist changes for this block
 *   uploadImage(file) -> Promise<url>
 * }
 *
 * Teardown hook (S3): the root node returned by window.CosyBlocks.render()
 * (i.e. what a renderer's own function returns — its `wrap` element, which
 * app.js appends as a child of the block's outer card) MAY carry a
 * `__cosyTeardown()` function. Currently set by the pdf and image renderers,
 * which create `URL.createObjectURL()` blob URLs — call
 * `content.__cosyTeardown && content.__cosyTeardown()` (where `content` is
 * that returned node) whenever such a node is discarded — on delete, on
 * rebuild-in-place (replaceChild), and on full page-navigation teardown — so
 * the most recent object URL for that block instance gets revoked instead of
 * leaking. Idempotent: safe to call more than once.
 */
(function () {
  'use strict';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function debounce(fn, ms) {
    var t; return function () {
      var a = arguments, self = this;
      clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms);
    };
  }

  // ---- cosy palettes ------------------------------------------------------
  var TEXT_COLORS = ['#4a3728', '#b8794a', '#f2789f', '#7c9367', '#5b7fb0', '#9b6bbf', '#c0392b'];
  var HILITE_COLORS = ['transparent', '#fff3b0', '#ffd6e0', '#c9e4de', '#dcd3ff', '#ffe0b3'];
  var FONTS = [
    { label: 'Clean (IBM Plex Sans)', css: "'IBM Plex Sans', system-ui, sans-serif" },
    { label: 'Classic (EB Garamond)', css: "'EB Garamond', Georgia, serif" },
    { label: 'Handwritten (Caveat)', css: "'Caveat', cursive" },
    { label: 'Marker (Patrick Hand)', css: "'Patrick Hand', cursive" }
  ];
  var STICKY_COLORS = ['#fff3b0', '#ffd6e0', '#c9e4de', '#dcd3ff'];
  var PDF_MAX_LOCAL_BYTES = 650 * 1024; // keep non-Electron data-URL fallback comfortably small
  var PDF_HEIGHTS = ['S', 'M', 'L'];
  var IMAGE_INLINE_MAX_BYTES = 300 * 1024; // above this, images go through chunked file storage (A2)

  // ---- inline SVG line icons ---------------------------------------------
  // Small, self-contained icon strings used anywhere a block-type / file-type
  // glyph used to be a raw emoji character. Consistent style across the app:
  // 24x24 viewBox, stroke=currentColor (inherits the caller's text colour so
  // it follows every theme automatically), sized to 1em unless noted.
  function svgIcon(inner, size) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
      'stroke-linecap="round" stroke-linejoin="round" width="' + (size || '1em') + '" height="' + (size || '1em') + '" aria-hidden="true">' + inner + '</svg>';
  }
  var ICON_CLOUD = svgIcon('<path d="M7 18a4 4 0 0 1-.5-7.97A5 5 0 0 1 16.5 8.05 4.5 4.5 0 0 1 16 17H7Z"/>');
  var ICON_MISSING = svgIcon('<rect x="5" y="3" width="14" height="18" rx="2" stroke-dasharray="3 3"/>');
  var ICON_LINK = svgIcon('<path d="M9 15l6-6"/><path d="M8.4 16.5 5.6 14a4 4 0 0 1 0-5.6L8.4 5.6a4 4 0 0 1 5.6 0"/><path d="M15.6 7.5 18.4 10a4 4 0 0 1 0 5.6l-2.8 2.8a4 4 0 0 1-5.6 0"/>');
  var ICON_QUOTE = svgIcon('<path d="M7 6c-1.5 1-2.5 2.8-2.5 4.5S5.5 14 7 14"/><path d="M15 6c-1.5 1-2.5 2.8-2.5 4.5S13.5 14 15 14"/>');
  var ICON_EDIT = svgIcon('<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="M13.5 8 16 10.5"/>');
  var ICON_TEXT = svgIcon('<path d="M6 3h9l3 3v15H6Z"/><path d="M15 3v3h3"/><path d="M9 12h6M9 15h6M9 9h3"/>');
  var ICON_TODO = svgIcon('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12.5l2.5 2.5L16 9"/>');
  var ICON_IMAGE = svgIcon('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5.5-5.5a2 2 0 0 0-2.8 0L3 20"/>');
  var ICON_COUNTDOWN = svgIcon('<path d="M6 3h12M6 21h12M7 3c0 5 4 6 5 6s5-1 5-6M7 21c0-5 4-6 5-6s5 1 5 6"/>');
  var ICON_STICKY = svgIcon('<path d="M5 3h10l4 4v14H5Z"/><path d="M15 3v4h4"/>');
  // A little folded note — replaces the old heart-sealed envelope for the
  // "Little note" block (see TYPES below and the love-seal in its renderer).
  var ICON_LOVE = svgIcon('<path d="M5 3h9l5 5v13H5Z"/><path d="M14 3v5h5"/>');
  var ICON_PDF = svgIcon('<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4"/>');
  var ICON_FILE = svgIcon('<path d="M7 12.5V6a4 4 0 0 1 8 0v9a2.5 2.5 0 0 1-5 0V7.5"/>');
  var ICON_SHEET = svgIcon('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M10 4v16"/>');
  var ICON_SLIDES = svgIcon('<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M10 9.5l5 2.5-5 2.5Z" fill="currentColor" stroke="none"/>');
  var ICON_ZIP = svgIcon('<rect x="4" y="7" width="16" height="13" rx="2"/><path d="M4 7l2-4h12l2 4"/><path d="M12 11v5"/>');
  var ICON_AUDIO = svgIcon('<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>');
  var ICON_VIDEO = svgIcon('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3Z" fill="currentColor" stroke="none"/>');

  var FILE_EMOJI_MAP = [
    { exts: ['doc', 'docx', 'rtf', 'odt', 'pages'], emoji: ICON_TEXT },
    { exts: ['xls', 'xlsx', 'csv', 'numbers'], emoji: ICON_SHEET },
    { exts: ['ppt', 'pptx', 'key'], emoji: ICON_SLIDES },
    { exts: ['zip', 'rar', '7z', 'tar', 'gz'], emoji: ICON_ZIP },
    { exts: ['png', 'jpg', 'jpeg', 'gif', 'heic', 'webp', 'bmp'], emoji: ICON_IMAGE },
    { exts: ['mp3', 'm4a', 'wav', 'aac', 'flac'], emoji: ICON_AUDIO },
    { exts: ['mp4', 'mov', 'avi', 'mkv', 'webm'], emoji: ICON_VIDEO }
  ];

  // ---- files (pdf/file/bookmark blocks) helpers -----------------------
  function isElectron() { return !!(window.cosyBridge && window.cosyBridge.isElectron); }

  function humanSize(bytes) {
    var n = +bytes || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function fileExt(name) {
    var parts = String(name || '').split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : '';
  }
  function fileEmoji(name) {
    var ext = fileExt(name);
    for (var i = 0; i < FILE_EMOJI_MAP.length; i++) {
      if (FILE_EMOJI_MAP[i].exts.indexOf(ext) !== -1) return FILE_EMOJI_MAP[i].emoji;
    }
    return ICON_PDF;
  }

  function readFileAs(file, method) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error || new Error('could not read that file')); };
      reader[method](file);
    });
  }
  function fileToArrayBuffer(file) { return readFileAs(file, 'readAsArrayBuffer'); }
  function fileToDataUrl(file) { return readFileAs(file, 'readAsDataURL'); }

  // Raw decode shared by dataUrlToBlob (pdf viewer) and the image renderer's
  // >300KB chunked-upload branch (A2) — both need the exact byte length to
  // decide inline-vs-chunked, so this is split out rather than duplicated.
  function dataUrlToBytes(dataUrl) {
    var b64 = String(dataUrl || '').split(',')[1] || '';
    var byteStr = atob(b64);
    var arr = new Uint8Array(byteStr.length);
    for (var i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
    return arr;
  }
  function dataUrlToBlob(dataUrl, mime) {
    return new Blob([dataUrlToBytes(dataUrl)], { type: mime });
  }

  // A cosy "the file isn't on this Mac" card — used by both pdf and file
  // blocks when nothing (cache, legacy path, cloud download) worked out.
  // `hintReupload` is set for legacy path-only blocks (no fileId at all),
  // where the only real fix is asking the uploader to re-add it so it syncs.
  function missingFileCard(name, hintReupload) {
    var card = el('div', 'file-missing');
    var missIcon = el('div', 'file-missing-emoji'); missIcon.innerHTML = ICON_MISSING;
    card.appendChild(missIcon);
    var msg = el('div', 'file-missing-msg');
    msg.appendChild(document.createTextNode('“'));
    msg.appendChild(el('strong', null, name || 'this file'));
    msg.appendChild(document.createTextNode('” lives on someone else’s computer — ask them to send it over'));
    card.appendChild(msg);
    if (hintReupload) {
      card.appendChild(el('div', 'file-missing-hint', 'ask them to re-upload it so it syncs'));
    }
    return card;
  }

  // -------------------------------------------------------------------------
  //  Partner file sync (pdf/file blocks) — R2-B
  //
  //  Every upload also goes through window.CosyStore.uploadFileData /
  //  downloadFileData / deleteFileData, which BOTH LocalStore and CloudStore
  //  implement identically (LocalStore just uses localStorage as a stand-in
  //  "cloud", which is what lets a single-Mac / test run exercise the same
  //  fileId + cache + download code path as real cloud sync). We deliberately
  //  never branch this flow on window.CosyStore.isCloud — the abstraction is
  //  the same either way, so the UI doesn't need to know or care.
  //
  //  A block's shared content only ever gets ONE of:
  //    - { fileId, name, size }  — this machine (and any partner) can fetch
  //      the bytes via CosyStore; `cosy.filecache.<fileId>` remembers THIS
  //      machine's own local disk copy so we don't re-download every render.
  //    - { path, name, size }    — legacy blocks (pre-fix), or a fresh upload
  //      that couldn't reach the cloud for some reason: viewable only on the
  //      machine that has that exact path.
  // -------------------------------------------------------------------------
  var CLOUD_UPLOAD_MAX_BYTES = 15 * 1024 * 1024; // friendly cap for cloud/file-doc sync

  function fileCacheKey(fileId) { return 'cosy.filecache.' + fileId; }
  function getCachedPath(fileId) {
    try { return window.localStorage.getItem(fileCacheKey(fileId)); } catch (e) { return null; }
  }
  function setCachedPath(fileId, path) {
    try { window.localStorage.setItem(fileCacheKey(fileId), path); } catch (e) { /* ignore */ }
  }
  function clearCachedPath(fileId) {
    try { window.localStorage.removeItem(fileCacheKey(fileId)); } catch (e) { /* ignore */ }
  }
  function currentSpaceId() {
    return (window.CosyStore && window.CosyStore.getMySpaceId && window.CosyStore.getMySpaceId()) || null;
  }
  // Best-effort cleanup of a file's cloud/local-mode record — used on
  // "replace" and on block delete. Never blocks the caller on failure.
  function bestEffortDeleteFile(fileId) {
    var spaceId = currentSpaceId();
    if (!fileId || !spaceId || !(window.CosyStore && window.CosyStore.deleteFileData)) return;
    window.CosyStore.deleteFileData(spaceId, fileId).catch(function () { /* ignore */ });
  }

  // A small "uploading…" placeholder shown in place of the block's usual
  // content while bytes are being sent — returns the status line element so
  // the caller can update it with chunk progress ("3/12").
  function buildUploadingCard(wrap, iconHtml) {
    wrap.innerHTML = '';
    var box = el('div', 'file-uploading');
    var iconEl = el('div', 'file-uploading-emoji'); iconEl.innerHTML = iconHtml || ICON_CLOUD;
    box.appendChild(iconEl);
    var status = el('div', 'file-upload-status', 'sending to our cloud…');
    box.appendChild(status);
    wrap.appendChild(box);
    return status;
  }

  // Shared render-side resolver for pdf/file blocks. Tries, in priority
  // order: (1) this machine's cached local path for content.fileId — clears
  // the cache entry and falls through if that path no longer reads; (2) a
  // legacy content.path (Electron only); (3) content.fileId via
  // CosyStore.downloadFileData, caching the freshly-saved local path after.
  // Calls exactly one of opts.onReady(path, bytes) / opts.onMissing(legacyOnly).
  // opts.onLoading() fires just before a network-style download begins.
  function resolveBlockFile(c, opts) {
    function ready(path, bytes) { opts.onReady(path || null, bytes || null); }
    function missing() { opts.onMissing(!!c.path && !c.fileId); }

    function viaDownload() {
      var spaceId = currentSpaceId();
      if (!c.fileId || !spaceId || !(window.CosyStore && window.CosyStore.downloadFileData)) {
        missing();
        return;
      }
      if (opts.onLoading) opts.onLoading();
      window.CosyStore.downloadFileData(spaceId, c.fileId).then(function (res) {
        if (isElectron()) {
          window.cosyBridge.saveFile(res.name || c.name, res.bytes.buffer).then(function (saveRes) {
            setCachedPath(c.fileId, saveRes.path);
            ready(saveRes.path, res.bytes);
          }).catch(function () { ready(null, res.bytes); });
        } else {
          ready(null, res.bytes);
        }
      }).catch(missing);
    }
    function viaLegacyPath() {
      if (c.path && isElectron()) {
        window.cosyBridge.readFile(c.path).then(function (bytes) { ready(c.path, bytes); }).catch(viaDownload);
      } else {
        viaDownload();
      }
    }

    var cachedPath = c.fileId ? getCachedPath(c.fileId) : null;
    if (cachedPath && isElectron()) {
      window.cosyBridge.readFile(cachedPath).then(function (bytes) { ready(cachedPath, bytes); }).catch(function () {
        clearCachedPath(c.fileId);
        viaLegacyPath();
      });
    } else {
      viaLegacyPath();
    }
  }
  var DIVIDERS = ['୨୧ ───────── ୨୧', '⋆ ｡ﾟ ─────── ｡ﾟ⋆', '─────────────', '｡˚ ⋆ ───── ⋆ ˚｡', '· ───────── ·'];
  var PARA_STYLES = [
    { label: 'Title', tag: 'H1' },
    { label: 'Heading', tag: 'H2' },
    { label: 'Small heading', tag: 'H3' },
    { label: 'Body', tag: 'P' }
  ];

  // =========================================================================
  //  Rich-text toolbars — a floating (selection) one and a docked (focus) one.
  //  Both are single shared instances that move to whichever text block's
  //  editor is currently active, and both build their buttons from the same
  //  little helpers below so behaviour (tooltips, mousedown handling, etc.)
  //  never drifts between the two.
  // =========================================================================
  var toolbar = null;          // floating selection toolbar
  var dockedToolbar = null;    // toolbar docked to the top of the focused block
  var activeEditable = null;
  var lastRange = null;        // last known selection range inside activeEditable

  function cmd(c, v) { ensureFocus(); document.execCommand(c, false, v || null); }

  // Buttons use mousedown-preventDefault so clicking them never steals focus
  // (and therefore never collapses the current selection) away from the
  // editor they're acting on.
  function makeBtn(label, title, handler, pressedCmd) {
    var b = el('button', 'rt-btn', label);
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-label', title);
    if (pressedCmd) { b.dataset.cmd = pressedCmd; b.setAttribute('aria-pressed', 'false'); }
    b.addEventListener('mousedown', function (e) { e.preventDefault(); });
    b.addEventListener('click', function (e) { e.preventDefault(); handler(); saveActive(); });
    return b;
  }
  // Same as makeBtn, but for the couple of toolbar buttons whose "label" is
  // an icon rather than plain text — makeBtn/el() write text via
  // .textContent (safe for B/I/U-style letters), which would print raw
  // markup instead of rendering it, so these get their icon set via
  // .innerHTML after the fact instead.
  function makeIconBtn(svgHtml, title, handler, pressedCmd) {
    var b = makeBtn('', title, handler, pressedCmd);
    b.innerHTML = svgHtml;
    return b;
  }
  function makeSep() { return el('span', 'rt-sep'); }
  // Reflects live execCommand state (bold/italic/…) onto any [data-cmd]
  // buttons in a toolbar — called from the selectionchange listeners each
  // toolbar already has, so the docked/floating B/I/U/S buttons announce
  // their pressed state to screen readers as the caret moves.
  function syncFormatState(bar) {
    if (!bar) return;
    var btns = bar.querySelectorAll('[data-cmd]');
    for (var i = 0; i < btns.length; i++) {
      var pressed = false;
      try { pressed = document.queryCommandState(btns[i].dataset.cmd); } catch (e) { /* ignore */ }
      btns[i].setAttribute('aria-pressed', pressed ? 'true' : 'false');
    }
  }
  function makeSwatch(color, title, cmdName) {
    var sw = el('button', 'rt-swatch');
    sw.type = 'button';
    sw.setAttribute('aria-label', title);
    sw.style.background = (color === 'transparent') ? 'repeating-linear-gradient(45deg,#ccc,#ccc 3px,#fff 3px,#fff 6px)' : color;
    sw.title = title;
    sw.addEventListener('mousedown', function (e) { e.preventDefault(); });
    sw.addEventListener('click', function (e) { e.preventDefault(); cmd(cmdName, color); saveActive(); });
    return sw;
  }

  function saveActive() {
    if (activeEditable && activeEditable.__onChange) activeEditable.__onChange();
  }

  // Keeps the current selection reachable even after focus briefly moves to
  // a <select> or a popover input — restore it before running a command.
  function ensureFocus() {
    if (!activeEditable) return;
    var sel = window.getSelection();
    if (sel && sel.rangeCount && activeEditable.contains(sel.anchorNode)) return;
    activeEditable.focus();
    if (lastRange) {
      sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(lastRange);
    }
  }

  document.addEventListener('selectionchange', function () {
    var sel = window.getSelection();
    if (activeEditable && sel && sel.rangeCount && activeEditable.contains(sel.anchorNode)) {
      lastRange = sel.getRangeAt(0).cloneRange();
    }
  });

  // Wraps the current (non-collapsed) selection in <tagName> — used for
  // inline code so it doesn't rely on execCommand's limited tag support.
  function wrapSelectionInTag(tagName) {
    ensureFocus();
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    if (range.collapsed) return;
    var node = document.createElement(tagName);
    try {
      range.surroundContents(node);
    } catch (e) {
      var frag = range.extractContents();
      node.appendChild(frag);
      range.insertNode(node);
    }
    sel.removeAllRanges();
    var newRange = document.createRange();
    newRange.selectNodeContents(node);
    sel.addRange(newRange);
  }

  // ---- small "insert link" popover (URL prompt, applied via createLink) ----
  var linkPopoverEl = null;
  function linkPopoverOutsideHandler(e) {
    if (linkPopoverEl && !linkPopoverEl.contains(e.target)) closeLinkPopover();
  }
  function closeLinkPopover() {
    if (linkPopoverEl) { linkPopoverEl.remove(); linkPopoverEl = null; }
    document.removeEventListener('mousedown', linkPopoverOutsideHandler);
  }
  function openLinkPopover(anchor) {
    closeLinkPopover();
    var range = lastRange ? lastRange.cloneRange() : null;
    var target = activeEditable;
    var pop = el('div', 'popover rt-link-pop');
    pop.appendChild(el('div', 'picker-head', 'add a link'));
    var input = el('input', 'rt-link-input');
    input.type = 'text'; input.placeholder = 'https://…';
    input.setAttribute('aria-label', 'link URL');
    pop.appendChild(input);
    var row = el('div', 'rt-link-row');
    var applyBtn = el('button', 'btn-secondary small', 'apply');
    var cancelBtn = el('button', 'btn-secondary small', 'cancel');
    row.appendChild(applyBtn); row.appendChild(cancelBtn);
    pop.appendChild(row);
    document.body.appendChild(pop);
    var r = anchor.getBoundingClientRect();
    pop.style.position = 'absolute';
    pop.style.top = (r.bottom + 8 + window.scrollY) + 'px';
    pop.style.left = Math.max(8, Math.min(r.left + window.scrollX, window.innerWidth - pop.offsetWidth - 12)) + 'px';
    input.focus();

    function apply() {
      var url = input.value.trim();
      if (!url) { closeLinkPopover(); return; }
      if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = 'https://' + url;
      if (target) target.focus();
      var sel = window.getSelection();
      if (range) { sel.removeAllRanges(); sel.addRange(range); }
      document.execCommand('createLink', false, url);
      if (target) refreshLinkTitles(target);
      saveActive();
      closeLinkPopover();
    }
    applyBtn.addEventListener('mousedown', function (e) { e.preventDefault(); });
    applyBtn.addEventListener('click', function (e) { e.preventDefault(); apply(); });
    cancelBtn.addEventListener('mousedown', function (e) { e.preventDefault(); });
    cancelBtn.addEventListener('click', function (e) { e.preventDefault(); closeLinkPopover(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); apply(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeLinkPopover(); }
    });
    linkPopoverEl = pop;
    setTimeout(function () { document.addEventListener('mousedown', linkPopoverOutsideHandler); }, 0);
  }

  // Sets a friendly tooltip on every link so folks know how to open it.
  function refreshLinkTitles(ed) {
    var links = ed.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) links[i].title = 'Cmd/Ctrl+Click to open ↗';
  }

  // -------------------------------------------------------------------------
  //  Floating selection toolbar (appears above/below a text selection)
  // -------------------------------------------------------------------------
  function buildToolbar() {
    var bar = el('div', 'rt-toolbar');
    bar.style.display = 'none';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'text selection formatting');

    bar.appendChild(makeBtn('B', 'Bold', function () { cmd('bold'); }, 'bold')).style.fontWeight = '800';
    bar.appendChild(makeBtn('I', 'Italic', function () { cmd('italic'); }, 'italic')).style.fontStyle = 'italic';
    bar.appendChild(makeBtn('U', 'Underline', function () { cmd('underline'); }, 'underline')).style.textDecoration = 'underline';
    bar.appendChild(makeBtn('S', 'Strikethrough', function () { cmd('strikeThrough'); }, 'strikeThrough')).style.textDecoration = 'line-through';

    bar.appendChild(makeSep());

    // presets
    bar.appendChild(makeBtn('Title', 'Title preset', function () { cmd('fontSize', '6'); cmd('bold'); }));
    bar.appendChild(makeBtn('Header', 'Header preset', function () { cmd('fontSize', '4'); cmd('bold'); }));
    bar.appendChild(makeBtn('Body', 'Body preset', function () { cmd('fontSize', '3'); }));

    bar.appendChild(makeSep());

    // font family
    var fontSel = el('select', 'rt-select');
    FONTS.forEach(function (f) { var o = el('option', null, f.label); o.value = f.css; fontSel.appendChild(o); });
    fontSel.title = 'Font';
    fontSel.setAttribute('aria-label', 'font family');
    fontSel.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    fontSel.addEventListener('change', function () { cmd('fontName', fontSel.value); saveActive(); });
    bar.appendChild(fontSel);

    // font size
    var sizeSel = el('select', 'rt-select');
    [['1', 'XS'], ['2', 'S'], ['3', 'M'], ['4', 'L'], ['5', 'XL'], ['6', 'XXL'], ['7', 'Huge']].forEach(function (s) {
      var o = el('option', null, s[1]); o.value = s[0]; sizeSel.appendChild(o);
    });
    sizeSel.value = '3'; sizeSel.title = 'Size';
    sizeSel.setAttribute('aria-label', 'font size');
    sizeSel.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    sizeSel.addEventListener('change', function () { cmd('fontSize', sizeSel.value); saveActive(); });
    bar.appendChild(sizeSel);

    bar.appendChild(makeSep());

    // colours
    TEXT_COLORS.forEach(function (c) { bar.appendChild(makeSwatch(c, 'Text colour', 'foreColor')); });

    document.body.appendChild(bar);
    return bar;
  }

  function positionToolbar() {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !activeEditable) {
      toolbar.style.display = 'none'; return;
    }
    if (!activeEditable.contains(sel.anchorNode)) { toolbar.style.display = 'none'; return; }
    var rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect.width && !rect.height) { toolbar.style.display = 'none'; return; }
    toolbar.style.display = 'flex';
    var top = rect.top - toolbar.offsetHeight - 10 + window.scrollY;
    if (top < 8) top = rect.bottom + 10 + window.scrollY;
    var left = rect.left + rect.width / 2 - toolbar.offsetWidth / 2 + window.scrollX;
    left = Math.max(8, Math.min(left, window.innerWidth - toolbar.offsetWidth - 8));
    toolbar.style.top = top + 'px';
    toolbar.style.left = left + 'px';
    syncFormatState(toolbar);
  }

  function initToolbar() {
    if (toolbar) return;
    toolbar = buildToolbar();
    document.addEventListener('selectionchange', positionToolbar);
    document.addEventListener('mouseup', positionToolbar);
    document.addEventListener('scroll', function () { if (toolbar.style.display !== 'none') positionToolbar(); }, true);
    document.addEventListener('mousedown', function (e) {
      if (toolbar.contains(e.target)) return;
      if (linkPopoverEl && linkPopoverEl.contains(e.target)) return;
      if (activeEditable && activeEditable.contains(e.target)) return;
      toolbar.style.display = 'none';
    });
  }

  // -------------------------------------------------------------------------
  //  Docked toolbar — pinned to the top of whichever text block is focused
  // -------------------------------------------------------------------------
  function buildDockedToolbar() {
    var bar = el('div', 'rt-toolbar rt-toolbar-docked');
    bar.style.display = 'none';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'text formatting');

    bar.appendChild(makeBtn('↶', 'Undo (Cmd/Ctrl+Z)', function () { cmd('undo'); }));
    bar.appendChild(makeBtn('↷', 'Redo (Cmd/Ctrl+Shift+Z)', function () { cmd('redo'); }));
    bar.appendChild(makeSep());

    var styleSel = el('select', 'rt-select rt-style-select');
    styleSel.title = 'Paragraph style';
    styleSel.setAttribute('aria-label', 'paragraph style');
    PARA_STYLES.forEach(function (s) {
      var o = el('option', null, s.label); o.value = s.tag; styleSel.appendChild(o);
    });
    styleSel.value = 'P';
    styleSel.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    styleSel.addEventListener('change', function () {
      ensureFocus();
      document.execCommand('formatBlock', false, styleSel.value);
      saveActive();
      if (activeEditable) activeEditable.focus();
    });
    bar.appendChild(styleSel);
    bar.appendChild(makeSep());

    bar.appendChild(makeBtn('B', 'Bold (Cmd/Ctrl+B)', function () { cmd('bold'); }, 'bold')).style.fontWeight = '800';
    bar.appendChild(makeBtn('I', 'Italic (Cmd/Ctrl+I)', function () { cmd('italic'); }, 'italic')).style.fontStyle = 'italic';
    bar.appendChild(makeBtn('U', 'Underline (Cmd/Ctrl+U)', function () { cmd('underline'); }, 'underline')).style.textDecoration = 'underline';
    bar.appendChild(makeBtn('S', 'Strikethrough', function () { cmd('strikeThrough'); }, 'strikeThrough')).style.textDecoration = 'line-through';
    bar.appendChild(makeSep());

    TEXT_COLORS.forEach(function (c) { bar.appendChild(makeSwatch(c, 'Text colour', 'foreColor')); });
    bar.appendChild(makeSep());
    HILITE_COLORS.forEach(function (c) { bar.appendChild(makeSwatch(c, c === 'transparent' ? 'No highlight' : 'Highlight colour', 'hiliteColor')); });
    bar.appendChild(makeSep());

    bar.appendChild(makeBtn('•≡', 'Bullet list', function () { cmd('insertUnorderedList'); }));
    bar.appendChild(makeBtn('1.≡', 'Numbered list', function () { cmd('insertOrderedList'); }));
    bar.appendChild(makeIconBtn(ICON_QUOTE, 'Blockquote', function () { document.execCommand('formatBlock', false, 'BLOCKQUOTE'); }));
    bar.appendChild(makeSep());

    bar.appendChild(makeBtn('</>', 'Inline code', function () { wrapSelectionInTag('code'); }));
    bar.appendChild(makeBtn('{ }', 'Code block', function () { document.execCommand('formatBlock', false, 'PRE'); }));
    bar.appendChild(makeSep());

    bar.appendChild(makeBtn('⟸', 'Align left', function () { cmd('justifyLeft'); }));
    bar.appendChild(makeBtn('≡', 'Align centre', function () { cmd('justifyCenter'); }));
    bar.appendChild(makeBtn('⟹', 'Align right', function () { cmd('justifyRight'); }));
    bar.appendChild(makeSep());

    var linkBtn = makeIconBtn(ICON_LINK, 'Insert link', function () { openLinkPopover(linkBtn); });
    bar.appendChild(linkBtn);
    bar.appendChild(makeBtn('―', 'Horizontal rule', function () { cmd('insertHorizontalRule'); }));
    bar.appendChild(makeBtn('⨯', 'Clear formatting', function () { cmd('removeFormat'); cmd('unlink'); }));

    document.body.appendChild(bar);
    return bar;
  }

  // Keeps the paragraph-style dropdown (and B/I/U/S aria-pressed state)
  // reflecting the block/formatting the caret is currently in.
  function syncDockedState() {
    if (!dockedToolbar || dockedToolbar.style.display === 'none') return;
    syncFormatState(dockedToolbar);
    var sel = dockedToolbar.querySelector('.rt-style-select');
    if (!sel) return;
    try {
      var val = String(document.queryCommandValue('formatBlock') || '').toUpperCase();
      if (['H1', 'H2', 'H3', 'P'].indexOf(val) !== -1) sel.value = val;
    } catch (e) { /* ignore */ }
  }

  function initDockedToolbar() {
    if (dockedToolbar) return;
    dockedToolbar = buildDockedToolbar();
    document.addEventListener('selectionchange', syncDockedState);
  }

  // Moves the single shared docked toolbar to the top of `wrap` (the text
  // block's own wrapper) and shows it — this is what makes it feel "docked"
  // to whichever block is currently being edited.
  function attachDockedToolbar(wrap, ed) {
    initDockedToolbar();
    if (dockedToolbar.parentNode !== wrap) wrap.insertBefore(dockedToolbar, wrap.firstChild);
    dockedToolbar.style.display = 'flex';
    syncDockedState();
  }
  function detachDockedToolbarIfBlurred(ed) {
    setTimeout(function () {
      if (dockedToolbar && dockedToolbar.contains(document.activeElement)) return;
      if (linkPopoverEl) return; // link popover input is temporarily focused
      if (document.activeElement === ed) return;
      if (activeEditable === ed) dockedToolbar.style.display = 'none';
    }, 0);
  }

  // -------------------------------------------------------------------------
  //  Markdown shortcuts — "# ", "- ", "1. ", "> " on space; "---"/``` on Enter
  // -------------------------------------------------------------------------
  // Finds the top-level child of `ed` that contains the caret — our stand-in
  // for "the current line", since a fresh contenteditable line is usually a
  // direct child (div/p/text node) of the editable root.
  function currentLineNode(ed, node) {
    while (node && node.parentNode !== ed && node !== ed) node = node.parentNode;
    return node;
  }
  function textBeforeCaret(ed) {
    var sel = window.getSelection();
    if (!sel.rangeCount) return '';
    var range = sel.getRangeAt(0);
    var lineNode = currentLineNode(ed, range.startContainer);
    if (!lineNode) return '';
    var pre = document.createRange();
    if (lineNode === ed) pre.setStart(ed, 0);
    else pre.setStart(lineNode, 0);
    pre.setEnd(range.startContainer, range.startOffset);
    return pre.toString();
  }
  // Deletes the `n` characters immediately before the caret using the Range
  // API directly (the shortcut trigger characters the person just typed).
  function removeLinePrefix(ed, n) {
    var sel = window.getSelection();
    if (!sel.rangeCount || n <= 0) return;
    var range = sel.getRangeAt(0);
    var node = range.startContainer, offset = range.startOffset;
    if (node.nodeType === 3 && offset >= n) {
      var delRange = document.createRange();
      delRange.setStart(node, offset - n);
      delRange.setEnd(node, offset);
      delRange.deleteContents();
      var newRange = document.createRange();
      newRange.setStart(node, offset - n);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
      return;
    }
    // Rare fallback: prefix spans more than one node — step back char by char.
    var remaining = n;
    while (remaining > 0 && document.execCommand('delete', false, null)) remaining--;
  }
  var MD_SPACE_RULES = [
    { re: /^#$/, run: function (ed) { document.execCommand('formatBlock', false, 'H1'); } },
    { re: /^##$/, run: function (ed) { document.execCommand('formatBlock', false, 'H2'); } },
    { re: /^###$/, run: function (ed) { document.execCommand('formatBlock', false, 'H3'); } },
    { re: /^[-*]$/, run: function (ed) { document.execCommand('insertUnorderedList'); } },
    { re: /^\d+\.$/, run: function (ed) { document.execCommand('insertOrderedList'); } },
    { re: /^>$/, run: function (ed) { document.execCommand('formatBlock', false, 'BLOCKQUOTE'); } }
  ];
  var MD_ENTER_RULES = [
    { re: /^-{3,}$/, run: function (ed) { document.execCommand('insertHorizontalRule'); } },
    { re: /^```$/, run: function (ed) { document.execCommand('formatBlock', false, 'PRE'); } }
  ];
  function handleMarkdownShortcut(e, ed) {
    if (e.key === ' ') {
      var text = textBeforeCaret(ed);
      for (var i = 0; i < MD_SPACE_RULES.length; i++) {
        if (MD_SPACE_RULES[i].re.test(text)) {
          e.preventDefault();
          removeLinePrefix(ed, text.length);
          MD_SPACE_RULES[i].run(ed);
          return true;
        }
      }
    } else if (e.key === 'Enter') {
      var text2 = textBeforeCaret(ed);
      for (var j = 0; j < MD_ENTER_RULES.length; j++) {
        if (MD_ENTER_RULES[j].re.test(text2)) {
          e.preventDefault();
          removeLinePrefix(ed, text2.length);
          MD_ENTER_RULES[j].run(ed);
          return true;
        }
      }
    }
    return false;
  }

  // -------------------------------------------------------------------------
  //  Paste sanitisation — strip scripts/styles/handlers/classes, keep a small
  //  allowlist of semantic tags and a handful of safe inline style props.
  // -------------------------------------------------------------------------
  var PASTE_ALLOWED_TAGS = ['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'A', 'H1', 'H2', 'H3',
    'P', 'BR', 'DIV', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'IMG', 'SPAN', 'FONT'];
  var PASTE_STRIP_TAGS = ['SCRIPT', 'STYLE', 'META', 'LINK', 'IFRAME', 'OBJECT', 'EMBED',
    'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'NOSCRIPT', 'TITLE', 'HEAD'];
  var PASTE_ALLOWED_STYLE_PROPS = ['color', 'background-color', 'font-family', 'font-size', 'text-align'];

  function filterStyleValue(styleText) {
    var out = [];
    (styleText || '').split(';').forEach(function (decl) {
      var idx = decl.indexOf(':');
      if (idx === -1) return;
      var prop = decl.slice(0, idx).trim().toLowerCase();
      var val = decl.slice(idx + 1).trim();
      var lowerVal = val.toLowerCase();
      if (PASTE_ALLOWED_STYLE_PROPS.indexOf(prop) !== -1 && val && val.length < 200 &&
        lowerVal.indexOf('expression(') === -1 && lowerVal.indexOf('javascript:') === -1 && lowerVal.indexOf('url(') === -1) {
        out.push(prop + ': ' + val);
      }
    });
    return out.join('; ');
  }
  function unwrapNode(node) {
    var parent = node.parentNode;
    if (!parent) return;
    while (node.firstChild) parent.insertBefore(node.firstChild, node);
    parent.removeChild(node);
  }

  // Strips ASCII control characters (\x00-\x1F, \x7F) plus whitespace and the
  // usual unicode "invisible separator"/format characters attackers use to
  // split a dangerous scheme so a naive regex misses it (e.g. "java\tscript:",
  // "java\nscript:", "java​script:"). ONLY used to decide whether a
  // scheme is dangerous — never mutates what we actually keep, so an
  // ordinary URL with none of these characters is completely unaffected.
  var URL_JUNK_RE = /[\x00-\x20\x7F\xa0\u1680\u180e\u2000-\u200f\u2028-\u202f\u205f\u2060\u3000\ufeff]/g;
  function schemeOf(url) {
    var cleaned = String(url || '').replace(URL_JUNK_RE, '');
    var m = /^([a-z][a-z0-9+.-]*):/i.exec(cleaned);
    return m ? m[1].toLowerCase() : '';
  }
  // Render-time/paste-time guard for href/src attributes — blocks
  // javascript: and vbscript: outright, and blocks data: everywhere EXCEPT
  // data:image/ on an <img src> (legit pasted inline images use this).
  function isSafeUrlAttr(value, allowDataImage) {
    var scheme = schemeOf(value);
    if (!scheme) return true; // relative/no-scheme URLs are fine
    if (scheme === 'javascript' || scheme === 'vbscript') return false;
    if (scheme === 'data') {
      return !!(allowDataImage && /^data:image\//i.test(String(value || '').replace(URL_JUNK_RE, '')));
    }
    return true;
  }

  // Sanitises untrusted HTML before it is EVER assigned to innerHTML — used
  // both for clipboard paste AND (critically) for stored block content.html
  // on render. A malicious member can write raw HTML straight to the shared
  // DB, bypassing the paste-only path entirely — this is audit finding #2
  // (stored XSS): rendered via innerHTML on BOTH partners' machines.
  function sanitizeHtml(html) {
    var doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    // Removed outright (not merely neutralised) — no safe partial form exists.
    PASTE_STRIP_TAGS.forEach(function (t) {
      var nodes = doc.body.querySelectorAll(t);
      for (var i = 0; i < nodes.length; i++) nodes[i].remove();
    });
    var walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT, null, false);
    var toUnwrap = [];
    var node = walker.nextNode();
    while (node) {
      var tag = node.tagName;
      if (PASTE_ALLOWED_TAGS.indexOf(tag) === -1) {
        toUnwrap.push(node);
      } else {
        var attrs = Array.prototype.slice.call(node.attributes);
        attrs.forEach(function (a) {
          var name = a.name.toLowerCase();
          if (name.indexOf('on') === 0) { node.removeAttribute(a.name); return; } // ALL event handlers
          if (name === 'class' || name === 'id') { node.removeAttribute(a.name); return; }
          if (name === 'style') { node.setAttribute('style', filterStyleValue(a.value)); return; }
          if (tag === 'A' && (name === 'href' || name === 'target')) {
            if (name === 'href' && !isSafeUrlAttr(a.value, false)) node.removeAttribute(a.name);
            return;
          }
          if (tag === 'IMG' && (name === 'src' || name === 'alt' || name === 'width' || name === 'height')) {
            if (name === 'src' && !isSafeUrlAttr(a.value, true)) node.removeAttribute(a.name);
            return;
          }
          node.removeAttribute(a.name);
        });
      }
      node = walker.nextNode();
    }
    toUnwrap.forEach(unwrapNode);
    return doc.body.innerHTML;
  }

  // =========================================================================
  //  Block renderers
  // =========================================================================
  var renderers = {};

  // --- TEXT ---
  renderers.text = function (block, ctx) {
    initToolbar();
    initDockedToolbar();
    var wrap = el('div', 'blk-text');
    var ed = el('div', 'rt-editable');
    ed.contentEditable = 'true';
    // S3 (stored XSS fix): content.html is untrusted — it comes straight from
    // the shared DB and a malicious member can write raw HTML there directly
    // (e.g. <img onerror=...>), bypassing the paste-only sanitizer entirely.
    // Sanitize on every load, exactly like paste, so that never executes on
    // the OTHER partner's machine.
    ed.innerHTML = sanitizeHtml((block.content && block.content.html) || '');
    // A1 (concurrent-edit fix): remember exactly what we last persisted so a
    // clean blur/debounce with no real edits never re-sends the same content
    // — that no-op write is what clobbers a partner's newer content that
    // app.js is holding in `pendingBlocks`, waiting for this node to lose
    // focus so it can safely rebuild with the remote version.
    var lastSavedHtml = ed.innerHTML;
    if (!ed.innerHTML.trim()) ed.setAttribute('data-empty', 'Write something sweet…');
    refreshLinkTitles(ed);
    var save = debounce(function () {
      if (ed.innerHTML === lastSavedHtml) return;
      lastSavedHtml = ed.innerHTML;
      ctx.update({ content: { html: ed.innerHTML } });
      ed.toggleAttribute('data-empty', !ed.textContent.trim() && !ed.querySelector('img'));
    }, 450);
    ed.__onChange = save;
    ed.addEventListener('focus', function () {
      activeEditable = ed;
      attachDockedToolbar(wrap, ed);
    });
    ed.addEventListener('input', function () { refreshLinkTitles(ed); save(); });
    ed.addEventListener('blur', function () {
      if (ed.innerHTML !== lastSavedHtml) {
        lastSavedHtml = ed.innerHTML;
        ctx.update({ content: { html: ed.innerHTML } });
      }
      detachDockedToolbarIfBlurred(ed);
    });
    // Tab/Shift+Tab indent-outdent list items; markdown shortcuts at line start.
    ed.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        document.execCommand(e.shiftKey ? 'outdent' : 'indent');
        return;
      }
      handleMarkdownShortcut(e, ed);
    });
    // Cmd/Ctrl-click (or a plain click while not actively editing the link)
    // opens the link externally instead of just placing the caret in it.
    ed.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a');
      if (!a || !ed.contains(a)) return;
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        var href = a.getAttribute('href');
        if (href) window.open(href);
      }
    });
    // Paste: sanitise HTML clipboard content (strip scripts/handlers/classes),
    // fall back to plain text otherwise.
    ed.addEventListener('paste', function (e) {
      var cd = e.clipboardData || window.clipboardData;
      if (!cd) return;
      var html = cd.getData('text/html');
      var text = cd.getData('text/plain');
      e.preventDefault();
      ed.focus();
      if (html) {
        document.execCommand('insertHTML', false, sanitizeHtml(html));
      } else if (text) {
        document.execCommand('insertText', false, text);
      }
      refreshLinkTitles(ed);
      save();
    });
    wrap.appendChild(ed);
    return wrap;
  };

  // --- TODO ---
  renderers.todo = function (block, ctx) {
    var c = block.content || { items: [] };
    c.items = c.items || [];
    var wrap = el('div', 'blk-todo');

    var head = el('div', 'todo-head');
    var prog = el('div', 'todo-progress');
    head.appendChild(prog);
    wrap.appendChild(head);

    var list = el('div', 'todo-list');
    wrap.appendChild(list);

    function updateProgress() {
      var done = c.items.filter(function (i) { return i.done; }).length;
      prog.textContent = done + '/' + c.items.length + ' done';
    }
    function persist() { ctx.update({ content: { items: c.items } }); updateProgress(); }

    function row(item, idx) {
      var r = el('div', 'todo-row');
      var cb = el('input', 'todo-check'); cb.type = 'checkbox'; cb.checked = !!item.done;
      cb.setAttribute('aria-label', item.text ? ('mark "' + item.text + '" done') : 'mark item done');
      var tx = el('input', 'todo-text'); tx.type = 'text'; tx.value = item.text || '';
      tx.placeholder = 'to-do…';
      tx.setAttribute('aria-label', 'to-do item text');
      // A1: only persist on blur if the text actually changed since the last
      // save — a plain focus/blur with no edits must not fire updateBlock.
      var lastSavedText = item.text || '';
      if (item.done) r.classList.add('done');
      cb.addEventListener('change', function () { item.done = cb.checked; r.classList.toggle('done', cb.checked); persist(); });
      tx.addEventListener('input', function () { item.text = tx.value; });
      tx.addEventListener('blur', function () {
        if (tx.value === lastSavedText) return;
        lastSavedText = tx.value;
        persist();
      });
      tx.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); addItem(); }
      });
      var del = el('button', 'todo-del', '✕');
      del.title = 'Remove';
      del.setAttribute('aria-label', item.text ? ('remove "' + item.text + '"') : 'remove item');
      del.addEventListener('click', function () { c.items.splice(idx, 1); persist(); rebuild(); });
      r.appendChild(cb); r.appendChild(tx); r.appendChild(del);
      return r;
    }
    function rebuild() {
      list.innerHTML = '';
      c.items.forEach(function (it, i) { list.appendChild(row(it, i)); });
      updateProgress();
    }
    function addItem() {
      c.items.push({ id: Date.now() + '' + c.items.length, text: '', done: false });
      rebuild();
      var inputs = list.querySelectorAll('.todo-text');
      if (inputs.length) inputs[inputs.length - 1].focus();
      persist();
    }
    var add = el('button', 'todo-add', '＋ add item');
    add.setAttribute('aria-label', 'add a new to-do item');
    add.addEventListener('click', addItem);
    wrap.appendChild(add);
    rebuild();
    return wrap;
  };

  // --- IMAGE ---
  // A2: store.uploadImage() already compresses to a data URL (≤1600px, q.85)
  // — that stays the fast inline content.url path for anything ≤300KB. Above
  // that we go through the same chunked file storage as pdf/file blocks
  // ({fileId, name}, no url), reusing the resolve/cache helpers above so a
  // partner's Mac can fetch and cache its own local copy.
  renderers.image = function (block, ctx) {
    var c = block.content || {};
    var wrap = el('div', 'blk-image');
    var holder = el('div', 'img-holder');
    var img = el('img', 'img-el');
    img.alt = c.caption || '';
    var caption = el('input', 'img-caption');
    caption.placeholder = 'add a caption…'; caption.value = c.caption || '';
    caption.setAttribute('aria-label', 'photo caption');
    var slider = el('input', 'img-slider'); slider.type = 'range';
    slider.min = '30'; slider.max = '100'; slider.value = c.width || 100;
    slider.setAttribute('aria-label', 'photo size');
    var empty = el('label', 'img-empty');
    empty.innerHTML = ICON_IMAGE + '<br><span>click to add a photo</span><br><small>or paste one</small>';
    var file = el('input', 'img-file'); file.type = 'file'; file.accept = 'image/*';
    file.setAttribute('aria-label', 'choose a photo to upload');
    empty.appendChild(file);

    var lastObjectUrl = null;
    // S3: exposed for app.js — call wrap.__cosyTeardown() when this block's
    // node is discarded (block deleted, or the node rebuilt/replaced) so the
    // most recent object URL doesn't leak. Idempotent: safe to call more
    // than once, later calls after the first are no-ops.
    wrap.__cosyTeardown = function () {
      if (lastObjectUrl) { URL.revokeObjectURL(lastObjectUrl); lastObjectUrl = null; }
    };
    function clearStatus() {
      var status = holder.querySelector('.img-status');
      if (status) status.remove();
    }
    function showImage(url, isObjectUrl) {
      if (lastObjectUrl && lastObjectUrl !== url) { URL.revokeObjectURL(lastObjectUrl); lastObjectUrl = null; }
      if (isObjectUrl) lastObjectUrl = url;
      clearStatus();
      empty.style.display = '';
      img.src = url; img.alt = c.caption || '';
      holder.classList.add('has-img');
      holder.style.width = (c.width || 100) + '%';
    }
    // Loading/uploading/missing placeholders reuse the same generic classes
    // as the pdf/file cards (file-loading / file-uploading / file-missing) —
    // no new CSS needed this round.
    function showStatus(node) {
      clearStatus();
      node.classList.add('img-status');
      empty.style.display = 'none'; // hide the "add a photo" label while a status card is showing
      holder.appendChild(node);
    }
    function showLoading() { showStatus(el('div', 'file-loading', 'fetching from our cloud…')); }
    function showUploading() {
      var box = el('div', 'file-uploading');
      var iconEl = el('div', 'file-uploading-emoji'); iconEl.innerHTML = ICON_CLOUD;
      box.appendChild(iconEl);
      var status = el('div', 'file-upload-status', 'sending to our cloud…');
      box.appendChild(status);
      showStatus(box);
      return status;
    }
    function showMissing() { showStatus(missingFileCard(c.name || 'this photo', false)); }

    // Render-side resolver for an existing content.fileId — mirrors pdf/file
    // exactly: cached local path -> download -> cache a fresh local copy.
    function resolveAndShowImage() {
      resolveBlockFile(c, {
        onLoading: showLoading,
        onReady: function (path, bytes) {
          if (bytes) showImage(URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' })), true);
          else showMissing();
        },
        onMissing: showMissing
      });
    }

    if (c.url) showImage(c.url);
    else if (c.fileId) resolveAndShowImage();

    function onUploadError(err) {
      var msg = (err && err.message) || 'that photo is too big, try a smaller one';
      if (ctx.toast) ctx.toast(msg);
    }

    // Decides inline-url vs chunked-fileId storage for a freshly compressed
    // data URL, and persists+renders accordingly.
    function applyUploadedUrl(url) {
      var prevFileId = c.fileId;
      var bytes = null;
      try { bytes = dataUrlToBytes(url); } catch (e) { bytes = null; }

      function inline() {
        c = { caption: c.caption, width: c.width, url: url };
        showImage(url);
        ctx.update({ content: c });
        if (prevFileId) bestEffortDeleteFile(prevFileId);
      }

      if (!bytes || bytes.length <= IMAGE_INLINE_MAX_BYTES) { inline(); return; }

      var spaceId = currentSpaceId();
      if (!spaceId || !(window.CosyStore && window.CosyStore.uploadFileData)) { inline(); return; }

      var name = 'photo-' + Date.now() + '.jpg';
      var statusEl = showUploading();
      window.CosyStore.uploadFileData(spaceId, name, bytes, function (done, total) {
        if (statusEl) statusEl.textContent = 'sending to our cloud… ' + done + '/' + total;
      }).then(function (res) {
        c = { caption: c.caption, width: c.width, fileId: res.fileId, name: name };
        ctx.update({ content: c });
        // We already have the bytes we just sent — show them straight away
        // instead of round-tripping through a redundant download.
        showImage(URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' })), true);
        if (prevFileId && prevFileId !== res.fileId) bestEffortDeleteFile(prevFileId);
      }).catch(function () {
        if (ctx.toast) ctx.toast('could not send that photo to our cloud, keeping a smaller copy just here');
        inline();
      });
    }

    file.addEventListener('change', function () {
      if (!file.files || !file.files[0]) return;
      ctx.uploadImage(file.files[0]).then(applyUploadedUrl).catch(onUploadError);
    });
    wrap.addEventListener('paste', function (e) {
      var items = (e.clipboardData || {}).items || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') === 0) {
          var f = items[i].getAsFile();
          ctx.uploadImage(f).then(applyUploadedUrl).catch(onUploadError);
          e.preventDefault();
        }
      }
    });
    slider.addEventListener('input', function () {
      c.width = +slider.value; holder.style.width = c.width + '%';
    });
    slider.addEventListener('change', function () { ctx.update({ content: c }); });
    // A1: skip the no-op ctx.update when the caption wasn't actually edited.
    var lastSavedCaption = c.caption || '';
    caption.addEventListener('blur', function () {
      if (caption.value === lastSavedCaption) return;
      lastSavedCaption = caption.value;
      c.caption = caption.value; img.alt = c.caption; ctx.update({ content: c });
    });

    holder.appendChild(img);
    holder.appendChild(empty);
    wrap.appendChild(holder);
    var ctrls = el('div', 'img-ctrls');
    ctrls.appendChild(slider);
    wrap.appendChild(ctrls);
    wrap.appendChild(caption);
    return wrap;
  };

  // --- COUNTDOWN ---
  renderers.countdown = function (block, ctx) {
    var c = block.content || {};
    var wrap = el('div', 'blk-countdown');
    var top = el('div', 'cd-top');
    var emoji = el('input', 'cd-emoji'); emoji.value = c.emoji || ''; emoji.maxLength = 4;
    emoji.setAttribute('aria-label', 'countdown emoji');
    var label = el('input', 'cd-label'); label.value = c.label || ''; label.placeholder = 'our special day';
    label.setAttribute('aria-label', 'countdown label');
    top.appendChild(emoji); top.appendChild(label);
    var big = el('div', 'cd-big');
    var date = el('input', 'cd-date'); date.type = 'date'; date.value = c.date || '';
    date.setAttribute('aria-label', 'countdown date');

    function render() {
      if (!c.date) { big.textContent = 'pick a date ↓'; return; }
      var target = new Date(c.date + 'T00:00:00');
      var today = new Date(); today.setHours(0, 0, 0, 0);
      var diff = Math.round((target - today) / 86400000);
      if (diff > 0) big.textContent = diff + (diff === 1 ? ' day to go' : ' days to go') + (c.emoji ? ' ' + c.emoji : '');
      else if (diff === 0) big.textContent = 'today!' + (c.emoji ? ' ' + c.emoji : '');
      else big.textContent = (-diff) + (diff === -1 ? ' day since' : ' days since') + (c.emoji ? ' ' + c.emoji : '');
    }
    // A1: compare against what's actually persisted — a blur/change that
    // didn't alter any field must not fire ctx.update.
    var lastSaved = { label: c.label || '', emoji: c.emoji || '', date: c.date || '' };
    function persist() {
      var next = { label: label.value, emoji: emoji.value, date: date.value };
      if (next.label === lastSaved.label && next.emoji === lastSaved.emoji && next.date === lastSaved.date) return;
      lastSaved = next;
      c.label = next.label; c.emoji = next.emoji; c.date = next.date;
      ctx.update({ content: c });
      render();
    }
    emoji.addEventListener('blur', persist);
    label.addEventListener('blur', persist);
    date.addEventListener('change', persist);

    wrap.appendChild(top); wrap.appendChild(big); wrap.appendChild(date);
    render();
    return wrap;
  };

  // --- STICKY ---
  renderers.sticky = function (block, ctx) {
    var c = block.content || {};
    c.color = c.color || STICKY_COLORS[0];
    var wrap = el('div', 'blk-sticky');
    var note = el('div', 'sticky-note');
    note.style.background = c.color;
    var rot = (block.__rot != null) ? block.__rot : (Math.random() * 4 - 2);
    block.__rot = rot;
    note.style.transform = 'rotate(' + rot + 'deg)';
    var ta = el('textarea', 'sticky-text'); ta.value = c.text || ''; ta.placeholder = 'quick note…';
    ta.setAttribute('aria-label', 'sticky note text');
    // A1: skip the no-op ctx.update when nothing was actually typed.
    var lastSavedText = c.text || '';
    ta.addEventListener('input', function () { c.text = ta.value; });
    ta.addEventListener('blur', function () {
      if (ta.value === lastSavedText) return;
      lastSavedText = ta.value;
      ctx.update({ content: c });
    });
    var swatches = el('div', 'sticky-colors');
    STICKY_COLORS.forEach(function (col) {
      var s = el('button', 'sticky-swatch'); s.style.background = col;
      s.setAttribute('aria-label', 'sticky colour ' + col);
      s.setAttribute('aria-pressed', col === c.color ? 'true' : 'false');
      s.addEventListener('click', function () {
        c.color = col; note.style.background = col; ctx.update({ content: c });
        $$swatches().forEach(function (sw) { sw.setAttribute('aria-pressed', sw === s ? 'true' : 'false'); });
      });
      swatches.appendChild(s);
    });
    function $$swatches() { return Array.prototype.slice.call(swatches.querySelectorAll('.sticky-swatch')); }
    note.appendChild(ta); note.appendChild(swatches);
    wrap.appendChild(note);
    return wrap;
  };

  // --- DIVIDER ---
  renderers.divider = function (block, ctx) {
    var c = block.content || {};
    var idx = (c.variant != null) ? c.variant : 0;
    var wrap = el('div', 'blk-divider');
    var line = el('div', 'divider-line', DIVIDERS[idx % DIVIDERS.length]);
    line.title = 'click to change style';
    line.setAttribute('role', 'button');
    line.setAttribute('tabindex', '0');
    line.setAttribute('aria-label', 'change divider style');
    function cycleVariant() {
      idx = (idx + 1) % DIVIDERS.length;
      line.textContent = DIVIDERS[idx];
      ctx.update({ content: { variant: idx } });
    }
    line.addEventListener('click', cycleVariant);
    line.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cycleVariant(); }
    });
    wrap.appendChild(line);
    return wrap;
  };

  // --- LITTLE NOTE (type slug stays 'love' so saved blocks keep loading) ---
  renderers.love = function (block, ctx) {
    var c = block.content || {};
    var wrap = el('div', 'blk-love');
    var letter = el('div', 'love-letter');
    var seal = el('div', 'love-seal'); seal.innerHTML = ICON_LOVE;
    var body = el('div', 'love-body');
    var greeting = el('div', 'love-greeting', 'Dear you,');
    var ta = el('textarea', 'love-text');
    ta.value = c.text || ''; ta.placeholder = 'leave a little note…';
    ta.setAttribute('aria-label', 'note text');
    var sign = el('input', 'love-sign'); sign.value = c.from || ''; sign.placeholder = '— always, me';
    sign.setAttribute('aria-label', 'signed by');
    // A1: skip no-op ctx.update calls on a plain focus/blur with no edits.
    var lastSavedText = c.text || '';
    var lastSavedFrom = c.from || '';
    ta.addEventListener('input', function () { c.text = ta.value; });
    ta.addEventListener('blur', function () {
      if (ta.value === lastSavedText) return;
      lastSavedText = ta.value;
      ctx.update({ content: c });
    });
    sign.addEventListener('blur', function () {
      if (sign.value === lastSavedFrom) return;
      lastSavedFrom = sign.value;
      c.from = sign.value; ctx.update({ content: c });
    });
    body.appendChild(greeting); body.appendChild(ta); body.appendChild(sign);
    letter.appendChild(seal); letter.appendChild(body);
    wrap.appendChild(letter);
    return wrap;
  };

  // --- PDF ---
  renderers.pdf = function (block, ctx) {
    var c = block.content || {};
    var wrap = el('div', 'blk-pdf');

    // S3: the PDF viewer previously NEVER revoked its blob: object URL — it
    // leaked one on every re-render/replace/navigate. Track the most recent
    // one here (survives across buildViewer() calls, e.g. on "replace") and
    // revoke it whenever a new one is made or the node is torn down.
    var lastPdfObjectUrl = null;
    // Exposed for app.js: call wrap.__cosyTeardown() when this block's node
    // is discarded so the last object URL doesn't leak. Idempotent.
    wrap.__cosyTeardown = function () {
      if (lastPdfObjectUrl) { URL.revokeObjectURL(lastPdfObjectUrl); lastPdfObjectUrl = null; }
    };

    function persist() { ctx.update({ content: c }); }

    function handleFile(file) {
      var looksLikePdf = (file.type && file.type === 'application/pdf') || /\.pdf$/i.test(file.name || '');
      if (!looksLikePdf) { if (ctx.toast) ctx.toast('that doesn’t look like a PDF'); return; }
      var height = c.height || 'M';
      var prevFileId = c.fileId;
      if (prevFileId) bestEffortDeleteFile(prevFileId); // "replace": drop the old cloud copy first

      function finishLocalOnly(localPath, rawBytes) {
        if (localPath) {
          c = { path: localPath, name: file.name, size: (rawBytes && rawBytes.length) || file.size, height: height };
          persist();
          buildViewer(rawBytes || null);
        } else if (file.size < PDF_MAX_LOCAL_BYTES) {
          fileToDataUrl(file).then(function (dataUrl) {
            c = { dataUrl: dataUrl, name: file.name, size: file.size, height: height };
            persist();
            buildViewer(null);
          }).catch(function () {
            if (ctx.toast) ctx.toast('could not read that PDF');
          });
        } else {
          if (ctx.toast) ctx.toast('that PDF is a bit big to store without the desktop app open (max 650KB)');
        }
      }

      function uploadToCloud(bytes, localPath) {
        if (bytes.length > CLOUD_UPLOAD_MAX_BYTES) {
          if (ctx.toast) ctx.toast('that PDF is a bit big to share via our cloud (max 15MB) — saving it just on this computer for now');
          finishLocalOnly(localPath, bytes);
          return;
        }
        var spaceId = currentSpaceId();
        if (!spaceId || !(window.CosyStore && window.CosyStore.uploadFileData)) {
          finishLocalOnly(localPath, bytes);
          return;
        }
        var statusEl = buildUploadingCard(wrap, ICON_PDF);
        window.CosyStore.uploadFileData(spaceId, file.name, bytes, function (done, total) {
          if (statusEl) statusEl.textContent = 'sending to our cloud… ' + done + '/' + total;
        }).then(function (res) {
          c = { fileId: res.fileId, name: file.name, size: res.size, height: height };
          if (localPath) setCachedPath(res.fileId, localPath);
          persist();
          buildViewer(bytes);
        }).catch(function () {
          if (ctx.toast) ctx.toast('could not send that PDF to our cloud, but it’s saved on this computer');
          finishLocalOnly(localPath, bytes);
        });
      }

      fileToArrayBuffer(file).then(function (buf) {
        var bytes = new Uint8Array(buf);
        if (isElectron()) {
          window.cosyBridge.saveFile(file.name, buf).then(function (res) {
            uploadToCloud(bytes, res.path);
          }).catch(function (err) {
            if (ctx.toast) ctx.toast('could not save that PDF: ' + ((err && err.message) || 'unknown hiccup'));
          });
        } else {
          uploadToCloud(bytes, null);
        }
      }).catch(function () {
        if (ctx.toast) ctx.toast('could not read that PDF');
      });
    }

    function wireDropTarget(target) {
      target.addEventListener('dragover', function (e) { e.preventDefault(); wrap.classList.add('drag-over'); });
      target.addEventListener('dragleave', function () { wrap.classList.remove('drag-over'); });
      target.addEventListener('drop', function (e) {
        e.preventDefault(); wrap.classList.remove('drag-over');
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) handleFile(f);
      });
    }

    function buildEmpty() {
      wrap.innerHTML = '';
      var empty = el('label', 'pdf-empty');
      empty.innerHTML = ICON_PDF + '<br><span>click to add a PDF</span><br><small>or drag one here</small>';
      var input = el('input', 'pdf-file-input');
      input.type = 'file'; input.accept = 'application/pdf,.pdf';
      input.setAttribute('aria-label', 'choose a PDF to upload');
      input.addEventListener('change', function () { if (input.files && input.files[0]) handleFile(input.files[0]); });
      empty.appendChild(input);
      wrap.appendChild(empty);
      wireDropTarget(wrap);
    }

    function buildViewer(preloadedBytes) {
      wrap.innerHTML = '';
      var frameWrap = el('div', 'pdf-frame-wrap pdf-h-' + (c.height || 'M'));
      wrap.appendChild(frameWrap);
      // Best-known-so-far local path for the "open ↗" button — starts from a
      // legacy path (if any) and gets refined once resolveBlockFile settles.
      var resolvedPath = (c.path && isElectron()) ? c.path : null;

      function showFrame(bytesOrBlob) {
        var blob = (bytesOrBlob instanceof Blob) ? bytesOrBlob : new Blob([bytesOrBlob], { type: 'application/pdf' });
        // S3: revoke the previous blob URL before minting a new one — this is
        // the fix for the PDF viewer's object-URL leak (re-render/replace
        // used to pile up an unrevoked blob: URL every single time).
        if (lastPdfObjectUrl) { URL.revokeObjectURL(lastPdfObjectUrl); lastPdfObjectUrl = null; }
        var url = URL.createObjectURL(blob);
        lastPdfObjectUrl = url;
        var iframe = el('iframe', 'pdf-frame');
        // No sandbox attribute here — Chromium's built-in PDF plugin needs
        // full iframe privileges to render inside a blob: src.
        iframe.src = url;
        frameWrap.innerHTML = '';
        frameWrap.appendChild(iframe);
      }
      function showLoading() {
        frameWrap.innerHTML = '';
        frameWrap.appendChild(el('div', 'file-loading', 'fetching from our cloud…'));
      }
      function showMissing(hintReupload) {
        frameWrap.innerHTML = '';
        frameWrap.appendChild(missingFileCard(c.name, hintReupload));
      }
      function refreshOpenBtn() {
        var btn = wrap.querySelector('.pdf-open-btn');
        if (btn) btn.style.display = (resolvedPath && isElectron()) ? '' : 'none';
      }

      if (preloadedBytes) {
        showFrame(preloadedBytes);
      } else if (c.dataUrl) {
        showFrame(dataUrlToBlob(c.dataUrl, 'application/pdf'));
      } else {
        resolveBlockFile(c, {
          onLoading: showLoading,
          onReady: function (path, bytes) {
            if (path) resolvedPath = path;
            if (bytes) showFrame(bytes);
            refreshOpenBtn();
          },
          onMissing: function (hintReupload) { showMissing(hintReupload); }
        });
      }

      var controls = el('div', 'pdf-controls');
      var heightBtn = el('button', 'mini-btn pdf-height-btn', 'size: ' + (c.height || 'M'));
      heightBtn.title = 'cycle viewer height (S/M/L)';
      heightBtn.setAttribute('aria-label', 'change PDF viewer height');
      heightBtn.addEventListener('click', function () {
        var idx = PDF_HEIGHTS.indexOf(c.height || 'M');
        c.height = PDF_HEIGHTS[(idx + 1) % PDF_HEIGHTS.length];
        frameWrap.className = 'pdf-frame-wrap pdf-h-' + c.height;
        heightBtn.textContent = 'size: ' + c.height;
        persist();
      });
      controls.appendChild(heightBtn);

      var openBtn = el('button', 'mini-btn pdf-open-btn', 'open ↗');
      openBtn.setAttribute('aria-label', 'open PDF in its own window');
      openBtn.style.display = (resolvedPath && isElectron()) ? '' : 'none';
      openBtn.addEventListener('click', function () {
        if (!isElectron() || !resolvedPath) return;
        window.cosyBridge.openFile(resolvedPath).catch(function () {
          if (ctx.toast) ctx.toast('this PDF lives on someone else’s computer — ask them to send it over');
        });
      });
      controls.appendChild(openBtn);

      var replaceBtn = el('button', 'mini-btn pdf-replace-btn', 'replace');
      replaceBtn.setAttribute('aria-label', 'replace this PDF');
      var replaceInput = el('input', 'pdf-file-input');
      replaceInput.type = 'file'; replaceInput.accept = 'application/pdf,.pdf'; replaceInput.style.display = 'none';
      replaceInput.setAttribute('aria-label', 'choose a replacement PDF');
      replaceBtn.addEventListener('click', function () { replaceInput.click(); });
      replaceInput.addEventListener('change', function () { if (replaceInput.files[0]) handleFile(replaceInput.files[0]); });
      controls.appendChild(replaceBtn);
      controls.appendChild(replaceInput);
      wrap.appendChild(controls);

      wrap.appendChild(el('div', 'pdf-caption', (c.name || 'file') + ' · ' + humanSize(c.size)));
      wireDropTarget(wrap);
    }

    if (c.path || c.dataUrl || c.fileId) buildViewer(null);
    else buildEmpty();

    return wrap;
  };

  // --- FILE ---
  renderers.file = function (block, ctx) {
    var c = block.content || {};
    var wrap = el('div', 'blk-file');

    function persist() { ctx.update({ content: c }); }

    function handleFile(file) {
      if (!isElectron()) {
        if (ctx.toast) ctx.toast('opening the desktop app lets you save files safely');
        return;
      }
      var prevFileId = c.fileId;
      if (prevFileId) bestEffortDeleteFile(prevFileId); // "replace": drop the old cloud copy first

      fileToArrayBuffer(file).then(function (buf) {
        var bytes = new Uint8Array(buf);
        return window.cosyBridge.saveFile(file.name, buf).then(function (saveRes) {
          var localPath = saveRes.path;

          function finishLocalOnly() {
            c = { path: localPath, name: file.name, size: saveRes.size };
            persist();
            buildCard();
          }

          if (bytes.length > CLOUD_UPLOAD_MAX_BYTES) {
            if (ctx.toast) ctx.toast('that file is a bit big to share via our cloud (max 15MB) — saving it just on this computer for now');
            finishLocalOnly();
            return;
          }
          var spaceId = currentSpaceId();
          if (!spaceId || !(window.CosyStore && window.CosyStore.uploadFileData)) {
            finishLocalOnly();
            return;
          }
          var statusEl = buildUploadingCard(wrap, fileEmoji(file.name));
          window.CosyStore.uploadFileData(spaceId, file.name, bytes, function (done, total) {
            if (statusEl) statusEl.textContent = 'sending to our cloud… ' + done + '/' + total;
          }).then(function (res) {
            c = { fileId: res.fileId, name: file.name, size: res.size };
            setCachedPath(res.fileId, localPath);
            persist();
            buildCard();
          }).catch(function () {
            if (ctx.toast) ctx.toast('could not send that file to our cloud, but it’s saved on this computer');
            finishLocalOnly();
          });
        });
      }).catch(function (err) {
        if (ctx.toast) ctx.toast('could not save that file: ' + ((err && err.message) || 'unknown hiccup'));
      });
    }

    function wireDropTarget(target) {
      target.addEventListener('dragover', function (e) { e.preventDefault(); wrap.classList.add('drag-over'); });
      target.addEventListener('dragleave', function () { wrap.classList.remove('drag-over'); });
      target.addEventListener('drop', function (e) {
        e.preventDefault(); wrap.classList.remove('drag-over');
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) handleFile(f);
      });
    }

    function buildEmpty() {
      wrap.innerHTML = '';
      var empty = el('label', 'file-empty');
      empty.innerHTML = ICON_FILE + '<br><span>click to add a file</span><br><small>docx, xls, anything</small>';
      var input = el('input', 'file-file-input'); input.type = 'file';
      input.setAttribute('aria-label', 'choose a file to upload');
      input.addEventListener('change', function () { if (input.files && input.files[0]) handleFile(input.files[0]); });
      empty.appendChild(input);
      wrap.appendChild(empty);
      wireDropTarget(wrap);
    }

    function buildCard() {
      wrap.innerHTML = '';
      var card = el('div', 'file-card');
      var fcIcon = el('div', 'file-card-emoji'); fcIcon.innerHTML = fileEmoji(c.name);
      card.appendChild(fcIcon);
      var meta = el('div', 'file-card-meta');
      meta.appendChild(el('div', 'file-card-name', c.name || 'file'));
      meta.appendChild(el('div', 'file-card-size', humanSize(c.size)));
      card.appendChild(meta);

      // Best-known-so-far local path for the "open ↗" button — refined once
      // resolveBlockFile settles; hidden while nothing works or bytes exist
      // only in memory (download succeeded but couldn't be saved to disk).
      var resolvedPath = (c.path && isElectron()) ? c.path : null;
      var openBtn = el('button', 'mini-btn file-card-open', 'open ↗');
      openBtn.setAttribute('aria-label', 'open file externally');
      openBtn.style.display = (resolvedPath && isElectron()) ? '' : 'none';
      openBtn.addEventListener('click', function () {
        if (!isElectron() || !resolvedPath) return;
        window.cosyBridge.openFile(resolvedPath).catch(function () {
          if (ctx.toast) ctx.toast('this file lives on someone else’s computer — ask them to send it over');
        });
      });
      card.appendChild(openBtn);

      var status = el('div', 'file-card-status');
      card.appendChild(status);

      var replaceBtn = el('button', 'mini-btn file-card-replace', 'replace');
      replaceBtn.setAttribute('aria-label', 'replace this file');
      var replaceInput = el('input', 'file-file-input');
      replaceInput.type = 'file'; replaceInput.style.display = 'none';
      replaceInput.setAttribute('aria-label', 'choose a replacement file');
      replaceBtn.addEventListener('click', function () { replaceInput.click(); });
      replaceInput.addEventListener('change', function () { if (replaceInput.files[0]) handleFile(replaceInput.files[0]); });
      card.appendChild(replaceBtn);
      card.appendChild(replaceInput);

      wrap.appendChild(card);
      wireDropTarget(wrap);

      resolveBlockFile(c, {
        onLoading: function () { status.textContent = 'fetching from our cloud…'; },
        onReady: function (path) {
          status.textContent = '';
          resolvedPath = path || resolvedPath;
          openBtn.style.display = (resolvedPath && isElectron()) ? '' : 'none';
        },
        onMissing: function (hintReupload) {
          wrap.innerHTML = '';
          wrap.appendChild(missingFileCard(c.name, hintReupload));
          wireDropTarget(wrap);
        }
      });
    }

    if (c.path || c.fileId) buildCard();
    else buildEmpty();

    return wrap;
  };

  // --- BOOKMARK ---
  renderers.bookmark = function (block, ctx) {
    var c = block.content || {};
    var wrap = el('div', 'blk-bookmark');

    function persist() { ctx.update({ content: c }); }
    function hostOf(url) {
      try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url || ''; }
    }
    function normaliseUrl(raw) {
      var v = String(raw || '').trim();
      if (!v) return '';
      if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = 'https://' + v;
      return v;
    }
    function isValidUrl(v) {
      try { var u = new URL(v); return !!u.hostname; } catch (e) { return false; }
    }

    function buildEdit() {
      wrap.innerHTML = '';
      var box = el('div', 'bookmark-edit');
      var input = el('input', 'bookmark-url-input');
      input.type = 'text'; input.placeholder = 'paste a link…'; input.value = c.url || '';
      input.setAttribute('aria-label', 'link URL');
      var saveBtn = el('button', 'btn-secondary small', 'save link');
      box.appendChild(input); box.appendChild(saveBtn);
      wrap.appendChild(box);

      function apply() {
        var normalised = normaliseUrl(input.value);
        if (!normalised || !isValidUrl(normalised)) {
          if (ctx.toast) ctx.toast('that doesn’t look like a link yet');
          return;
        }
        c.url = normalised;
        if (!c.title) c.title = hostOf(normalised);
        persist();
        buildCard();
      }
      saveBtn.addEventListener('click', apply);
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
      input.focus();
    }

    function buildCard() {
      wrap.innerHTML = '';
      var card = el('div', 'bookmark-card');
      var host = hostOf(c.url);

      var favWrap = el('div', 'bookmark-favicon');
      var favImg = el('img');
      favImg.src = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(host) + '&sz=64';
      favImg.alt = '';
      favImg.addEventListener('error', function () { favWrap.innerHTML = ICON_LINK; });
      favWrap.appendChild(favImg);
      card.appendChild(favWrap);

      var meta = el('div', 'bookmark-meta');
      var titleInput = el('input', 'bookmark-title-input');
      titleInput.setAttribute('aria-label', 'link title');
      titleInput.value = c.title || host;
      titleInput.addEventListener('blur', function () { c.title = titleInput.value || host; persist(); });
      titleInput.addEventListener('click', function (e) { e.stopPropagation(); });
      titleInput.addEventListener('keydown', function (e) { e.stopPropagation(); });
      meta.appendChild(titleInput);

      meta.appendChild(el('div', 'bookmark-url', c.url));

      var noteInput = el('input', 'bookmark-note-input');
      noteInput.setAttribute('aria-label', 'link note');
      noteInput.placeholder = 'add a little note…';
      noteInput.value = c.note || '';
      noteInput.addEventListener('blur', function () { c.note = noteInput.value; persist(); });
      noteInput.addEventListener('click', function (e) { e.stopPropagation(); });
      noteInput.addEventListener('keydown', function (e) { e.stopPropagation(); });
      meta.appendChild(noteInput);
      card.appendChild(meta);

      var editBtn = el('button', 'bookmark-edit-btn'); editBtn.innerHTML = ICON_EDIT;
      editBtn.title = 'edit link';
      editBtn.setAttribute('aria-label', 'edit link');
      editBtn.addEventListener('click', function (e) { e.stopPropagation(); buildEdit(); });
      card.appendChild(editBtn);

      card.addEventListener('click', function (e) {
        if (e.target === titleInput || e.target === noteInput || e.target === editBtn) return;
        if (c.url) window.open(c.url);
      });

      wrap.appendChild(card);
    }

    if (c.url) buildCard();
    else buildEdit();

    return wrap;
  };

  // =========================================================================
  var TYPES = [
    { type: 'text', label: 'Note', icon: ICON_TEXT, hint: 'rich text & notes' },
    { type: 'todo', label: 'To-do', icon: ICON_TODO, hint: 'checkable list' },
    { type: 'image', label: 'Photo', icon: ICON_IMAGE, hint: 'a photo' },
    { type: 'countdown', label: 'Countdown', icon: ICON_COUNTDOWN, hint: 'days to a big day' },
    { type: 'sticky', label: 'Sticky note', icon: ICON_STICKY, hint: 'little coloured note' },
    { type: 'divider', label: 'Divider', icon: '୨୧', hint: 'cute separator' },
    { type: 'love', label: 'Little note', icon: ICON_LOVE, hint: 'a little note to leave' },
    { type: 'pdf', label: 'PDF', icon: ICON_PDF, hint: 'view a pdf inline' },
    { type: 'file', label: 'File', icon: ICON_FILE, hint: 'docx, xls, anything' },
    { type: 'bookmark', label: 'Link', icon: ICON_LINK, hint: 'link to anything' }
  ];

  function defaultContent(type) {
    switch (type) {
      case 'text': return { html: '' };
      case 'todo': return { items: [{ id: 't1', text: '', done: false }] };
      case 'image': return {};
      case 'countdown': return { label: '', emoji: '', date: '' };
      case 'sticky': return { text: '', color: STICKY_COLORS[0] };
      case 'divider': return { variant: 0 };
      case 'love': return { text: '', from: '' };
      case 'pdf': return {};
      case 'file': return {};
      case 'bookmark': return { url: '', title: '', note: '' };
      default: return {};
    }
  }

  window.CosyBlocks = {
    TYPES: TYPES,
    defaultContent: defaultContent,
    render: function (block, ctx) {
      var fn = renderers[block.type] || renderers.text;
      return fn(block, ctx);
    }
  };
})();
