/*
 * app.js — wires the whole UI: sign-in, space create/join, header, the
 * sidebar page tree, the current page's content (breadcrumbs, icon, title,
 * sub-pages, blocks), moods, and themes.
 * It only ever talks to window.CosyStore, so local & cloud behave identically.
 */
(function () {
  'use strict';

  var store = window.CosyStore;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  // C-8: a non-<button> given role="button" (chips/cards built from <div>/
  // <span> for layout reasons) still needs Enter/Space to activate for
  // keyboard users — this wires that up generically.
  function makeKeyActivatable(node) {
    node.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); node.click(); }
    });
    return node;
  }

  // Mood picker options — short lowercase mood words rather than emoji
  // stickers, matching the calmer redesign; the chosen word is stored as-is
  // on the member profile and rendered as plain text everywhere (mood chip,
  // dashboard card), so there's no markup/escaping concern here.
  var MOODS = ['happy', 'smitten', 'calm', 'thrilled', 'sleepy', 'soft', 'grumpy', 'thinking', 'melting', 'cool', 'celebrating', 'loved', 'cosy', 'rainy', 'sparkly'];
  // Page-icon picker options. These stay as literal emoji characters
  // (unlike the rest of the app's UI chrome) because page.icon is rendered
  // in several places by concatenating it with user-typed page titles
  // (see renderBreadcrumbs) via .textContent — swapping these for inline
  // SVG markup would force those call sites onto .innerHTML and mix
  // untrusted title text into HTML, which isn't a change to make lightly.
  // The app-authored *defaults* (seeded/auto-created page icons) are blank
  // now — see storage.js and the icon: '' spots below — this list only
  // powers the picker a couple can still choose from for their own pages.
  var PAGE_EMOJI = ['🏡', '🌷', '🐻', '📄', '📝', '✅', '🗒️', '💌', '🎀', '🌿', '☕', '🌟',
                     '📚', '🎯', '💡', '🧺', '🗓️', '🎧', '🍰', '🧸', '🎮', '✈️', '🎨', '🐾'];

  // ---- inline SVG line icons ---------------------------------------------
  // Small, self-contained icon strings for spots where a JS-built control's
  // ONLY content used to be a raw emoji character (buttons whose textContent
  // was a single trash/house glyph) — kept as markup here and applied via
  // .innerHTML so they render as icons rather than literal text. Same
  // 24x24/stroke=currentColor style as the static icons in index.html, so
  // they follow every theme.
  function svgIcon(inner, size) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
      'stroke-linecap="round" stroke-linejoin="round" width="' + (size || '1em') + '" height="' + (size || '1em') + '" aria-hidden="true">' + inner + '</svg>';
  }
  var ICON_TRASH = svgIcon('<path d="M4 7h16"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/><path d="M10 11v6M14 11v6"/>');
  var ICON_HOUSE = svgIcon('<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9h12v-9"/>');
  var ICON_SPARKLE = svgIcon('<path d="M12 3c.7 3.6 2.2 6.1 5.4 7.2-3.2 1.1-4.7 3.6-5.4 7.2-.7-3.6-2.2-6.1-5.4-7.2 3.2-1.1 4.7-3.6 5.4-7.2Z"/>');
  var ICON_PAIR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em" aria-hidden="true"><circle cx="8.5" cy="8" r="3"/><path d="M3 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><circle cx="16.5" cy="9.5" r="2.3"/><path d="M14.8 15.3c2.5.3 4.4 2.4 4.4 4.9"/></svg>';
  var ICON_GROUP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em" aria-hidden="true"><circle cx="12" cy="7" r="2.6"/><path d="M7.5 17.5c0-2.6 2-4.3 4.5-4.3s4.5 1.7 4.5 4.3"/><circle cx="5" cy="10" r="1.8"/><path d="M2.5 17c0-1.9 1.3-3.1 3-3.4"/><circle cx="19" cy="10" r="1.8"/><path d="M21.5 17c0-1.9-1.3-3.1-3-3.4"/></svg>';
  var ICON_HOME = ICON_HOUSE;

  // -------------------------------------------------------------------------
  //  Corner categories — Couple / Friends / Family. Each picks its own
  //  default theme preset, copy tone, capacity range, and emblem icon; the
  //  DB just stores the chosen `kind` + `capacity` on the space (see
  //  storage.js's createSpace). currentCategory() is the one place the rest
  //  of the UI reads "what kind of corner is this" from.
  // -------------------------------------------------------------------------
  var CATEGORIES = {
    couple: {
      label: 'Couple', theme: 'cherry-blossom',
      capacity: 2, capacityFixed: true, capacityMin: 2, capacityMax: 2, capacityDefault: 2,
      emblem: ICON_PAIR, groupWord: 'the two of you', invitePeople: 'your partner',
      sharedTitle: 'Our shared plans', zoneShared: 'Ours', zoneMine: 'Your side',
      createBlurb: 'Create your shared space and invite your partner.'
    },
    friends: {
      label: 'Friends', theme: 'clear-harbour',
      capacity: 8, capacityFixed: false, capacityMin: 2, capacityMax: 8, capacityDefault: 4,
      emblem: ICON_GROUP, groupWord: 'your group', invitePeople: 'your friends',
      sharedTitle: 'Our shared plans', zoneShared: 'Shared', zoneMine: 'Your space',
      createBlurb: 'Create your shared space and invite your friends.'
    },
    family: {
      label: 'Family', theme: 'evergreen',
      capacity: 8, capacityFixed: false, capacityMin: 2, capacityMax: 8, capacityDefault: 4,
      emblem: ICON_HOME, groupWord: 'the whole family', invitePeople: 'your family',
      sharedTitle: 'Our family plans', zoneShared: 'Home', zoneMine: 'Your space',
      createBlurb: 'Create your shared space and invite your family.'
    }
  };
  function currentCategory() { return CATEGORIES[(state.space && state.space.kind)] || CATEGORIES.couple; }
  function otherZoneLabel(name) {
    // With a known name: possessive ("Robin’s space"). Without one (a couple's
    // un-joined partner slot, before the invite is used) fall back to the plain
    // zone word so it reads "Their side" / "Their space", never "Their’s side".
    var word = currentCategory() === CATEGORIES.couple ? 'side' : 'space';
    return name ? (name + '’s ' + word) : ('Their ' + word);
  }

  var state = {
    user: null,
    spaceId: null,
    space: null,
    blocks: [],
    pages: [],
    currentPageId: null,
    pendingCreatedPageId: null,
    expanded: {},           // { pageId: true } — sidebar expand/collapse
    pagesReadyFor: null,    // spaceId we've already run ensurePages for
    pagesLoading: false,
    unsubSpace: null,
    unsubBlocks: null,
    unsubPages: null,
    unsubConnection: null,  // S4 — store.onConnectionState unsubscribe
    lastSeen: {}            // { pageId: ms, __initTs: ms } — C-6 unread dots
  };

  // C3 contract helper: block/page updatedAt may be a number (local) or a
  // Firestore Timestamp (cloud) — normalize to millis.
  function normalizeTs(t) { return (t && t.toMillis) ? t.toMillis() : (t || 0); }

  // -------------------------------------------------------------------------
  //  S4 (Round 7) — diagnostics ring buffer + global error handlers.
  //  A rolling in-memory log of console.error/console.warn plus anything
  //  caught by window.onerror / unhandledrejection, so a couple who hits a
  //  weird bug can "copy diagnostics" instead of us needing devtools access.
  //  Wired as early as possible (before boot()) so it catches boot-time
  //  errors too.
  // -------------------------------------------------------------------------
  var DIAG_MAX = 200;
  var diagLog = [];
  function diagStringify(args) {
    return Array.prototype.map.call(args, function (a) {
      if (a instanceof Error) return a.message + (a.stack ? '\n' + a.stack : '');
      if (a && typeof a === 'object') { try { return JSON.stringify(a); } catch (e) { return String(a); } }
      return String(a);
    }).join(' ');
  }
  function diagLine(level, msg) {
    var line = '[' + new Date().toISOString() + '] ' + level.toUpperCase() + ': ' + msg;
    diagLog.push(line);
    if (diagLog.length > DIAG_MAX) diagLog.shift();
    // Feature-detect Agent S5's optional log-to-file bridge — never a hard
    // dependency, S5 runs concurrently and may not have landed it yet (or
    // may expose the bridge method without main.js's IPC handler wired up
    // yet). appendLog() returns a Promise (ipcRenderer.invoke) — it MUST be
    // caught here: an unswallowed rejection would fire unhandledrejection,
    // which itself calls diagLine(), which would call appendLog() again —
    // an infinite loop the moment the bridge is half-wired.
    if (window.cosyBridge && typeof window.cosyBridge.appendLog === 'function') {
      try {
        var r = window.cosyBridge.appendLog(line);
        if (r && typeof r.catch === 'function') r.catch(function () { /* best effort only */ });
      } catch (e2) { /* best effort only */ }
    }
    return line;
  }
  function wireDiagnostics() {
    var origError = console.error.bind(console);
    var origWarn = console.warn.bind(console);
    console.error = function () {
      diagLine('error', diagStringify(arguments));
      origError.apply(console, arguments);
    };
    console.warn = function () {
      diagLine('warn', diagStringify(arguments));
      origWarn.apply(console, arguments);
    };
    window.addEventListener('unhandledrejection', function (e) {
      var reason = e && e.reason;
      diagLine('unhandledrejection', (reason && (reason.message || String(reason))) || 'unknown rejection');
      toast("something slipped through — we've noted it");
    });
    window.onerror = function (message, source, lineno, colno, error) {
      diagLine('error', message + ' @ ' + (source || '') + ':' + (lineno || 0) + (error && error.stack ? '\n' + error.stack : ''));
      toast('something went a bit wonky — but we caught it');
      return false; // let devtools still log it too
    };
  }
  function copyDiagnostics() {
    var text = diagLog.length ? diagLog.join('\n') : '(no diagnostics logged this session — good sign!)';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast('diagnostics copied');
      }).catch(function () {
        toast('could not copy diagnostics');
      });
    } else {
      toast('clipboard is not available here');
    }
  }
  // -------------------------------------------------------------------------
  //  S4 (Round 7) — friendly reporting for any failed store.* mutation.
  //  Every trackPending()-wrapped promise routes its rejection through here:
  //  one gentle toast, one diagnostics line, and (via trackPending) the save
  //  chip flips to its error state. cosy-quota gets its own clear message.
  // -------------------------------------------------------------------------
  function reportMutationError(err) {
    var msg;
    if (err && err.cosyCode === 'cosy-quota') {
      msg = "this computer's local storage is full — remove big files or connect the cloud";
    } else {
      msg = "hmm, that didn't save " + ((err && err.message) || 'try again in a moment');
    }
    console.error('[cosy] mutation failed:', err);
    toast(msg);
  }

  // -------------------------------------------------------------------------
  //  R6 — gender & pronouns
  // -------------------------------------------------------------------------
  // memberProfiles[uid].gender = 'male' | 'female' | 'nonbinary' (absent =
  // unchosen, defaults to they/them everywhere).
  function pronounsFor(gender) {
    if (gender === 'male') return { subject: 'he', object: 'him', possessive: 'his', side: 'His side' };
    if (gender === 'female') return { subject: 'she', object: 'her', possessive: 'her', side: 'Her side' };
    return { subject: 'they', object: 'them', possessive: 'their', side: 'Their side' };
  }
  // Personal-page titles that are still a storage-assigned default (never a
  // custom title the couple typed themselves) — only these get auto-updated
  // by the title rule below.
  var KNOWN_DEFAULT_TITLES = ['Their side', 'Her side', 'His side', "Partner's dashboard"];

  // -------------------------------------------------------------------------
  //  Local-mode banner
  // -------------------------------------------------------------------------
  function showLocalBanner() {
    if (store.isCloud) return;
    if (window.localStorage.getItem('cosy.bannerDismissed')) return;
    var b = $('#local-banner');
    b.hidden = false;
  }
  function wireBanner() {
    $('#banner-dismiss').addEventListener('click', function () {
      $('#local-banner').hidden = true;
      window.localStorage.setItem('cosy.bannerDismissed', '1');
    });
  }

  // -------------------------------------------------------------------------
  //  Screens
  // -------------------------------------------------------------------------
  function show(screen) {
    ['welcome', 'onboard', 'board', 'gender'].forEach(function (s) {
      $('#screen-' + s).hidden = (s !== screen);
    });
    // Recreated every time the onboard screen is shown (not just at boot) —
    // covers the "leave a corner, land back on onboard" flow, so the corner
    // is offered back without re-keying the invite code.
    if (screen === 'onboard') renderRecentCorners();
  }

  // -------------------------------------------------------------------------
  //  Recent corners ("welcome back") — onboard screen
  // -------------------------------------------------------------------------
  function renderRecentCorners() {
    var wrap = $('#recent-corners'); if (!wrap) return;
    wrap.hidden = true;
    wrap.innerHTML = '';
    if (!store.listMySpaces) return;
    store.listMySpaces().then(function (spaces) {
      spaces = spaces || [];
      if (!spaces.length) return;
      wrap.innerHTML = '';
      wrap.appendChild(el('div', 'recent-corners-head', 'welcome back'));
      var row = el('div', 'recent-corners-row');
      spaces.forEach(function (sp) {
        var card = el('div', 'recent-corner-card');
        card.appendChild(el('div', 'rc-name', sp.name || 'Our Cosy Corner'));
        var meta = el('div', 'rc-meta');
        meta.appendChild(el('span', 'rc-code-chip', sp.inviteCode || '——————'));
        meta.appendChild(el('span', 'rc-members', (sp.memberCount || 1) + ' of ' + (sp.capacity || 2) + ' joined'));
        card.appendChild(meta);
        card.addEventListener('click', function () { enterSpace(sp.id); });
        row.appendChild(card);
      });
      wrap.appendChild(row);
      wrap.hidden = false;
    }).catch(function () {
      // Graceful degradation: just hide the section on a failed query.
      wrap.hidden = true; wrap.innerHTML = '';
    });
  }

  // -------------------------------------------------------------------------
  //  Save indicator (C-7) — tiny header chip: "all cosy" / "saving…" /
  //  "offline — will sync". Every promise-returning persist call in this
  //  file gets routed through trackPending() so the counter (and thus the
  //  chip) stays accurate without each call site managing it by hand.
  // -------------------------------------------------------------------------
  var pendingCount = 0;
  var saveChipTimer = null;
  // S4 (Round 7): sticky until a LATER successful save clears it — a single
  // rejection must never be silently swallowed back into "all cosy".
  var saveHadError = false;
  function trackPending(promise) {
    pendingCount++;
    updateSaveChip();
    function settleOk() {
      pendingCount = Math.max(0, pendingCount - 1);
      saveHadError = false;
      updateSaveChip();
    }
    function settleFail(err) {
      pendingCount = Math.max(0, pendingCount - 1);
      saveHadError = true;
      updateSaveChip();
      reportMutationError(err);
    }
    if (promise && typeof promise.then === 'function') promise.then(settleOk, settleFail);
    else settleOk();
    return promise;
  }
  function updateSaveChip() {
    var chip = $('#save-chip'); if (!chip) return;
    clearTimeout(saveChipTimer);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      chip.textContent = 'offline — will sync'; chip.className = 'save-chip offline';
      return;
    }
    if (pendingCount > 0) {
      chip.textContent = saveHadError ? 'retrying…' : 'saving…';
      chip.className = 'save-chip saving';
      return;
    }
    if (saveHadError) {
      // Sticky error state — no debounce delay, and no auto-clear back to
      // "saved" until a subsequent mutation actually succeeds (settleOk above).
      chip.textContent = "couldn't save"; chip.className = 'save-chip error';
      chip.style.color = '#c0392b'; chip.style.borderColor = '#c0392b';
      return;
    }
    chip.style.color = ''; chip.style.borderColor = '';
    // Debounce the saving->saved flip so quick back-to-back saves don't
    // flicker the chip between "saving…" and "saved" every few ms.
    saveChipTimer = setTimeout(function () {
      chip.textContent = 'all cosy'; chip.className = 'save-chip saved';
    }, 400);
  }
  function wireSaveChip() {
    window.addEventListener('online', updateSaveChip);
    window.addEventListener('offline', updateSaveChip);
    updateSaveChip();
  }

  // -------------------------------------------------------------------------
  //  S4 (Round 7) — connection indicator, distinct from the save chip above.
  //  store.onConnectionState reports the underlying realtime link's health
  //  ('online' | 'reconnecting' | 'offline'); LocalStore always reports
  //  'online'. Subscribed per-space (the realtime channels only exist once
  //  we're in a space) and unsubscribed on leave/sign-out.
  // -------------------------------------------------------------------------
  function updateConnectionChip(status) {
    var chip = $('#connection-chip'); if (!chip) return;
    if (!status || status === 'online') {
      chip.hidden = true; chip.textContent = ''; chip.style.color = ''; chip.style.borderColor = '';
      return;
    }
    chip.hidden = false;
    if (status === 'reconnecting') {
      chip.textContent = 'reconnecting…';
      chip.style.color = '#b8860b'; chip.style.borderColor = '#b8860b';
    } else {
      chip.textContent = "offline — changes will sync when you're back";
      chip.style.color = '#c0392b'; chip.style.borderColor = '#c0392b';
    }
  }
  function wireConnectionIndicator() {
    if (state.unsubConnection) { state.unsubConnection(); state.unsubConnection = null; }
    if (!store.onConnectionState) return;
    state.unsubConnection = store.onConnectionState(updateConnectionChip);
  }
  function unwireConnectionIndicator() {
    if (state.unsubConnection) { state.unsubConnection(); state.unsubConnection = null; }
    updateConnectionChip('online'); // hide the chip
  }

  // -------------------------------------------------------------------------
  //  Auth
  // -------------------------------------------------------------------------
  // the sign-in button now embeds an inline Google-logo <svg>; writing to
  // its own .textContent would blow that markup away, so every label
  // update goes through the dedicated #btn-signin-label span instead.
  function setSignInLabel(text) { var l = $('#btn-signin-label'); if (l) l.textContent = text; }

  function signIn() {
    var btn = $('#btn-signin');
    btn.disabled = true; setSignInLabel('opening…');
    var name = store.isCloud ? undefined : ($('#local-name').value || 'You');
    store.signIn(name).then(function () {
      btn.disabled = false; setSignInLabel(store.isCloud ? 'Continue with Google' : 'Step inside');
    }).catch(function (err) {
      btn.disabled = false; setSignInLabel('Try again');
      toast('Sign-in did not finish: ' + err.message);
    });
  }

  // -------------------------------------------------------------------------
  //  Email/password auth — cloud mode only. Only wired from boot() when
  //  store.signInEmail exists (LocalStore has no matching methods, so local
  //  mode's welcome card never grows this UI — it also stays visually hidden
  //  there via #screen-welcome.cloud in css/styles.css).
  // -------------------------------------------------------------------------
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function isValidEmail(v) { return EMAIL_RE.test(v); }

  function setFieldError(errId, msg) {
    var errEl = $('#' + errId);
    if (!errEl) return;
    if (msg) { errEl.textContent = msg; errEl.hidden = false; }
    else { errEl.textContent = ''; errEl.hidden = true; }
  }

  // Blur-validates one field: shows an inline error once the field has SOME
  // content that fails validateFn; an empty field is left alone on blur (so
  // just tabbing through unused fields doesn't nag) — required-but-empty is
  // caught at submit time instead, in each handler below. Also clears the
  // error live while typing, as soon as the value becomes valid again.
  function wireBlurValidation(inputId, errId, validateFn, msg) {
    var input = $('#' + inputId);
    if (!input) return;
    input.addEventListener('blur', function () {
      var v = input.value || '';
      if (!v) { setFieldError(errId, null); return; }
      setFieldError(errId, validateFn(v) ? null : msg);
    });
    input.addEventListener('input', function () {
      var errEl = $('#' + errId);
      if (!errEl || errEl.hidden) return;
      var v = input.value || '';
      if (!v || validateFn(v)) setFieldError(errId, null);
    });
  }

  function wirePasswordToggle(btn) {
    btn.addEventListener('click', function () {
      var input = $('#' + btn.dataset.target);
      if (!input) return;
      var showingNow = input.type === 'text';
      input.type = showingNow ? 'password' : 'text';
      btn.textContent = showingNow ? 'show' : 'hide';
      btn.setAttribute('aria-pressed', showingNow ? 'false' : 'true');
      btn.setAttribute('aria-label', showingNow ? 'show password' : 'hide password');
    });
  }

  function clearAuthMessages() {
    ['signin-email-error', 'signin-password-error', 'signup-email-error',
      'signup-password-error', 'forgot-email-error'].forEach(function (id) { setFieldError(id, null); });
    ['signin-note', 'signup-note', 'forgot-note'].forEach(function (id) {
      var el = $('#' + id); if (el) { el.hidden = true; el.textContent = ''; el.className = 'auth-note'; }
    });
  }

  // name: 'signin' | 'signup' | 'forgot' — the tab switch hides itself while
  // the forgot-password view is open (it isn't one of the two tabs).
  function showAuthPanel(name) {
    clearAuthMessages();
    var tabs = $('.auth-tabs');
    if (tabs) tabs.hidden = (name === 'forgot');
    var tabSignin = $('#tab-signin'), tabSignup = $('#tab-signup');
    if (tabSignin) { tabSignin.classList.toggle('selected', name === 'signin'); tabSignin.setAttribute('aria-selected', name === 'signin' ? 'true' : 'false'); }
    if (tabSignup) { tabSignup.classList.toggle('selected', name === 'signup'); tabSignup.setAttribute('aria-selected', name === 'signup' ? 'true' : 'false'); }
    $('#panel-signin').hidden = name !== 'signin';
    $('#panel-signup').hidden = name !== 'signup';
    $('#panel-forgot').hidden = name !== 'forgot';
  }

  function setAuthSubmitPending(btn, pendingLabel, isPending) {
    btn.disabled = isPending;
    btn.dataset.pending = isPending ? '1' : '0';
    if (isPending) {
      if (!btn.dataset.origLabel) btn.dataset.origLabel = btn.textContent;
      btn.textContent = pendingLabel;
    } else if (btn.dataset.origLabel) {
      btn.textContent = btn.dataset.origLabel;
    }
  }

  function showAuthNote(noteId, msg, kind) {
    var note = $('#' + noteId);
    if (!note) return;
    note.textContent = msg;
    note.className = 'auth-note' + (kind ? ' ' + kind : '');
    note.hidden = false;
  }

  // Maps the handful of Supabase auth errors a couple will actually hit into
  // plain copy; anything else falls back to Supabase's own message via toast.
  function mapAuthError(err) {
    var msg = (err && err.message) || '';
    if (msg === 'Email not confirmed') return 'Please confirm your email first — check your inbox.';
    if (msg === 'Invalid login credentials') return "That email or password doesn't look right.";
    return msg || 'Something went wrong — try again.';
  }

  function handleEmailSignUp() {
    var name = ($('#signup-name').value || '').trim();
    var email = ($('#signup-email').value || '').trim();
    var password = $('#signup-password').value || '';
    var emailOk = isValidEmail(email);
    var pwOk = password.length >= 8;
    setFieldError('signup-email-error', emailOk ? null : 'That doesn’t look like a valid email.');
    setFieldError('signup-password-error', pwOk ? null : 'Password needs to be at least 8 characters.');
    if (!emailOk || !pwOk) return;
    var btn = $('#btn-email-signup');
    setAuthSubmitPending(btn, 'Creating…', true);
    store.signUpEmail(email, password, name).then(function () {
      setAuthSubmitPending(btn, '', false);
      $('#signin-email').value = email;
      showAuthPanel('signin');
      showAuthNote('signin-note', 'Check your inbox to confirm your email, then sign in.', 'success');
    }).catch(function (err) {
      setAuthSubmitPending(btn, '', false);
      toast(mapAuthError(err));
    });
  }

  function handleEmailSignIn() {
    var email = ($('#signin-email').value || '').trim();
    var password = $('#signin-password').value || '';
    var emailOk = isValidEmail(email);
    setFieldError('signin-email-error', emailOk ? null : 'That doesn’t look like a valid email.');
    setFieldError('signin-password-error', password ? null : 'Enter your password.');
    if (!emailOk || !password) return;
    var btn = $('#btn-email-signin');
    setAuthSubmitPending(btn, 'Signing in…', true);
    store.signInEmail(email, password).then(function () {
      setAuthSubmitPending(btn, '', false);
      // No routing here on purpose — store.onAuth's onAuthStateChange
      // listener fires for an email sign-in exactly like it does for
      // Google, and app.js's onAuth() already routes to onboard/board.
    }).catch(function (err) {
      setAuthSubmitPending(btn, '', false);
      toast(mapAuthError(err));
    });
  }

  function handleSendReset() {
    var email = ($('#forgot-email').value || '').trim();
    var emailOk = isValidEmail(email);
    setFieldError('forgot-email-error', emailOk ? null : 'That doesn’t look like a valid email.');
    if (!emailOk) return;
    var btn = $('#btn-send-reset');
    setAuthSubmitPending(btn, 'Sending…', true);
    store.resetPassword(email).then(function () {
      setAuthSubmitPending(btn, '', false);
      showAuthNote('forgot-note', 'Check your inbox for a reset link.', 'success');
    }).catch(function (err) {
      setAuthSubmitPending(btn, '', false);
      toast(mapAuthError(err));
    });
  }

  // Enter-to-submit inside a panel's text inputs, mirroring the space-name /
  // page-title contenteditable Enter handling elsewhere in this file.
  function wireEnterSubmit(panelId, btnId) {
    var panel = $('#' + panelId);
    if (!panel) return;
    panel.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
        e.preventDefault();
        $('#' + btnId).click();
      }
    });
  }

  function wireEmailAuth() {
    $('#tab-signin').addEventListener('click', function () { showAuthPanel('signin'); });
    $('#tab-signup').addEventListener('click', function () { showAuthPanel('signup'); });
    $('#btn-forgot-password').addEventListener('click', function () { showAuthPanel('forgot'); });
    $('#btn-forgot-back').addEventListener('click', function () { showAuthPanel('signin'); });

    $$('.pw-toggle').forEach(wirePasswordToggle);

    wireBlurValidation('signin-email', 'signin-email-error', isValidEmail, 'That doesn’t look like a valid email.');
    wireBlurValidation('signup-email', 'signup-email-error', isValidEmail, 'That doesn’t look like a valid email.');
    wireBlurValidation('forgot-email', 'forgot-email-error', isValidEmail, 'That doesn’t look like a valid email.');
    wireBlurValidation('signup-password', 'signup-password-error', function (v) { return v.length >= 8; }, 'Password needs to be at least 8 characters.');

    $('#btn-email-signup').addEventListener('click', handleEmailSignUp);
    $('#btn-email-signin').addEventListener('click', handleEmailSignIn);
    $('#btn-send-reset').addEventListener('click', handleSendReset);

    wireEnterSubmit('panel-signin', 'btn-email-signin');
    wireEnterSubmit('panel-signup', 'btn-email-signup');
    wireEnterSubmit('panel-forgot', 'btn-send-reset');
  }

  // -------------------------------------------------------------------------
  //  Onboarding (create or join a space)
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  //  Onboard "start a new corner" — category picker + size stepper.
  //  createState tracks the in-progress choice (before any space exists, so
  //  it can't live on state.space) — kind defaults to couple (fixed at 2),
  //  capacity follows the chosen category's default whenever kind changes.
  // -------------------------------------------------------------------------
  var createState = { kind: 'couple', capacity: CATEGORIES.couple.capacityDefault };

  var KIND_ORDER = ['couple', 'friends', 'family'];
  function renderKindPicker() {
    var wrap = $('#kind-picker'); if (!wrap) return;
    wrap.innerHTML = '';
    KIND_ORDER.forEach(function (key) {
      var cat = CATEGORIES[key];
      var btn = el('button', 'kind-opt' + (createState.kind === key ? ' selected' : ''));
      btn.type = 'button';
      btn.dataset.kind = key;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', createState.kind === key ? 'true' : 'false');
      var icon = el('span', 'kind-opt-icon'); icon.innerHTML = cat.emblem;
      btn.appendChild(icon);
      btn.appendChild(el('span', 'kind-opt-label', cat.label));
      btn.addEventListener('click', function () { selectKind(key); });
      wrap.appendChild(btn);
    });
  }
  function selectKind(key) {
    var cat = CATEGORIES[key] || CATEGORIES.couple;
    createState.kind = key;
    createState.capacity = cat.capacityDefault;
    renderKindPicker();
    renderCapacityStepper();
    var blurb = $('#create-blurb'); if (blurb) blurb.textContent = cat.createBlurb;
    var emblem = $('#create-emblem'); if (emblem) emblem.innerHTML = cat.emblem;
  }
  function renderCapacityStepper() {
    var cat = CATEGORIES[createState.kind] || CATEGORIES.couple;
    var wrap = $('#capacity-stepper'); if (!wrap) return;
    wrap.hidden = !!cat.capacityFixed;
    var label = $('#capacity-label'); if (label) label.textContent = 'how many of you?';
    var valueEl = $('#capacity-value'); if (valueEl) valueEl.textContent = createState.capacity;
    var minus = $('#capacity-minus'); if (minus) minus.disabled = createState.capacity <= cat.capacityMin;
    var plus = $('#capacity-plus'); if (plus) plus.disabled = createState.capacity >= cat.capacityMax;
  }
  function stepCapacity(delta) {
    var cat = CATEGORIES[createState.kind] || CATEGORIES.couple;
    if (cat.capacityFixed) return;
    var next = createState.capacity + delta;
    next = Math.max(cat.capacityMin, Math.min(cat.capacityMax, next));
    createState.capacity = next;
    renderCapacityStepper();
  }

  function wireOnboard() {
    renderKindPicker();
    renderCapacityStepper();
    var minus = $('#capacity-minus'); if (minus) minus.addEventListener('click', function () { stepCapacity(-1); });
    var plus = $('#capacity-plus'); if (plus) plus.addEventListener('click', function () { stepCapacity(1); });

    $('#btn-create').addEventListener('click', function () {
      var name = $('#create-name').value || 'Our Cosy Corner';
      var cat = CATEGORIES[createState.kind] || CATEGORIES.couple;
      var capacity = cat.capacityFixed ? cat.capacity : createState.capacity;
      store.createSpace(name, createState.kind, capacity).then(function (sp) { showGenderStep(sp.id); })
        .catch(function (err) { toast('could not create your corner: ' + ((err && err.message) || 'something went wrong')); });
    });
    $('#btn-join').addEventListener('click', function () {
      var code = ($('#join-code').value || '').trim().toUpperCase();
      if (code.length !== 6) { toast('Invite codes are 6 characters'); return; }
      store.joinSpace(code).then(function (sp) { showGenderStep(sp.id); })
        .catch(function (err) { toast(err.message); });
    });
    wireRestoreBackup();
  }

  // Restore-from-backup: reads a JSON file exported by "export our corner",
  // then hands it to store.importSpace which rebuilds a brand new space from
  // it. On success this mirrors #btn-create's success path exactly (drops
  // into the same gender/pronouns step with the freshly imported space id),
  // so the restored corner enters exactly like a freshly created one would.
  function wireRestoreBackup() {
    var btn = $('#btn-restore');
    if (!btn) return;
    var input = el('input', 'restore-file-input');
    input.type = 'file'; input.accept = '.json,application/json'; input.style.display = 'none';
    input.setAttribute('aria-label', 'choose a cosy corner backup file');
    document.body.appendChild(input);

    btn.addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      input.value = ''; // let picking the same file again re-fire change
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var parsed;
        try {
          parsed = JSON.parse(reader.result);
        } catch (e) {
          toast("that file doesn't look like a cosy corner backup");
          return;
        }
        if (!store.importSpace) return;
        toast('restoring your corner…');
        store.importSpace(parsed).then(function (newId) {
          showGenderStep(newId);
          toast('corner restored! files need re-uploading');
        }).catch(function (err) {
          toast('could not restore: ' + ((err && err.message) || 'something went wrong'));
        });
      };
      reader.onerror = function () {
        toast("that file doesn't look like a cosy corner backup");
      };
      reader.readAsText(file);
    });
  }

  function enterSpace(spaceId) {
    state.spaceId = spaceId;
    store.setMySpaceId(spaceId);
    if (state.unsubSpace) state.unsubSpace();
    if (state.unsubBlocks) state.unsubBlocks();
    if (state.unsubPages) state.unsubPages();
    state.blocks = []; state.pages = []; state.currentPageId = null; state.pendingCreatedPageId = null;
    state.pagesReadyFor = null; state.pagesLoading = false;
    state.expanded = loadExpanded(spaceId);
    state.lastSeen = loadLastSeen(spaceId) || {};
    // R6: show('board') runs BEFORE subscribing — LocalStore's subscribeSpace
    // invokes onSpace synchronously (its first emit happens inline), and
    // onSpace may call maybeShowLegacyGenderGate -> show('gender'). If
    // show('board') ran afterward it would instantly stomp that back to the
    // board screen. Calling it first means "last call wins" always leaves
    // the gender gate's show('gender') in effect when it fires.
    show('board');
    state.unsubSpace = store.subscribeSpace(spaceId, onSpace);
    state.unsubBlocks = store.subscribeBlocks(spaceId, onBlocks);
    wireConnectionIndicator();
  }

  // S4 (Round 7): "leave this corner" is now a real, confirmed action — it
  // removes the user's membership server-side (store.leaveSpace) rather than
  // just clearing the local pointer, so their partner sees them gone too.
  // Opens a small confirm popover first; the actual leave lives in
  // doLeaveSpace() below.
  function leaveSpace() {
    if (!state.spaceId) return;
    closePopovers();
    var anchor = $('#btn-settings');
    var pop = el('div', 'popover confirm-pop');
    pop.appendChild(el('div', 'confirm-msg', 'this removes you from the shared corner — the others keep it. sure?'));
    var row = el('div', 'confirm-row');
    var yes = el('button', 'btn-secondary small confirm-yes', 'leave');
    var no = el('button', 'btn-secondary small confirm-no', 'stay');
    yes.addEventListener('click', function () { closePopovers(); doLeaveSpace(); });
    no.addEventListener('click', closePopovers);
    row.appendChild(yes); row.appendChild(no);
    pop.appendChild(row);
    placePopover(pop, anchor || { getBoundingClientRect: function () { return document.body.getBoundingClientRect(); } });
  }

  function doLeaveSpace() {
    if (!state.spaceId || !store.leaveSpace) return;
    var sid = state.spaceId;
    trackPending(store.leaveSpace(sid)).then(function () {
      if (state.unsubSpace) state.unsubSpace();
      if (state.unsubBlocks) state.unsubBlocks();
      if (state.unsubPages) state.unsubPages();
      unwireConnectionIndicator();
      state.spaceId = null; state.space = null; state.blocks = []; state.pages = [];
      state.currentPageId = null; state.pagesReadyFor = null; state.pagesLoading = false;
      store.setMySpaceId(null);
      routeAfterAuth();
    }).catch(function (err) {
      toast('could not leave: ' + ((err && err.message) || 'something went wrong'));
    });
  }

  // S4 (Round 7) — the door button is pure navigation back to the corner
  // picker (you can belong to multiple corners), NOT a membership removal.
  // Actually leaving a corner now lives in settings — see leaveSpace() /
  // doLeaveSpace() above. Modeled closely on doLeaveSpace()'s success path,
  // minus the server-side store.leaveSpace() call.
  function goToCorners() {
    if (state.unsubSpace) state.unsubSpace();
    if (state.unsubBlocks) state.unsubBlocks();
    if (state.unsubPages) state.unsubPages();
    state.unsubSpace = null; state.unsubBlocks = null; state.unsubPages = null;
    unwireConnectionIndicator();
    state.spaceId = null; state.space = null; state.blocks = []; state.pages = [];
    state.currentPageId = null; state.pagesReadyFor = null; state.pagesLoading = false;
    store.setMySpaceId(null);
    routeAfterAuth();
  }

  // -------------------------------------------------------------------------
  //  R6 — gender/pronouns step: shown right after create/join (before the
  //  board), reopened from the settings popover ("pronouns"), and
  //  surfaced once for pre-existing profiles via the legacy gate below.
  // -------------------------------------------------------------------------
  var genderState = { spaceId: null, returnToBoard: false };

  function genderAskedKey(spaceId, uid) { return 'cosy.genderAsked.' + spaceId + '.' + uid; }
  function isGenderAsked(spaceId, uid) {
    return window.localStorage.getItem(genderAskedKey(spaceId, uid)) === '1';
  }
  function markGenderAsked(spaceId, uid) {
    if (spaceId && uid) window.localStorage.setItem(genderAskedKey(spaceId, uid), '1');
  }

  // Applies the title rule: find MY personal page; if its current title is
  // still one of the storage-assigned defaults, rename it to match the
  // chosen pronouns' "side" label. Custom titles the couple typed themselves
  // are never touched. Right after createSpace/joinSpace the personal page
  // may not exist yet (ensurePages hasn't run — that only happens once
  // enterSpace's subscribeSpace kicks off) — in that case, defer via
  // pendingTitleFix and apply it as soon as onPages sees the page appear.
  var pendingTitleFix = null; // { spaceId, uid, gender }
  function applyTitleRule(spaceId, uid, gender) {
    var page = state.pages.filter(function (p) { return p.kind === 'personal' && p.ownerUid === uid; })[0];
    if (page) {
      if (KNOWN_DEFAULT_TITLES.indexOf(page.title) !== -1) {
        trackPending(store.updatePage(spaceId, page.id, { title: pronounsFor(gender).side }));
      }
      return;
    }
    pendingTitleFix = { spaceId: spaceId, uid: uid, gender: gender };
  }
  function flushPendingTitleFix() {
    if (!pendingTitleFix || pendingTitleFix.spaceId !== state.spaceId) return;
    var pf = pendingTitleFix;
    var page = state.pages.filter(function (p) { return p.kind === 'personal' && p.ownerUid === pf.uid; })[0];
    if (!page) return; // still not created yet — try again on the next pages snapshot
    pendingTitleFix = null;
    if (KNOWN_DEFAULT_TITLES.indexOf(page.title) !== -1) {
      trackPending(store.updatePage(pf.spaceId, page.id, { title: pronounsFor(pf.gender).side }));
    }
  }

  function paintGenderSelection(gender) {
    $$('.gender-opt').forEach(function (btn) {
      btn.classList.toggle('selected', btn.dataset.gender === gender);
    });
  }

  // opts.returnToBoard: true when reopened mid-session (settings popover,
  // legacy gate) — finishing shows the board again instead of entering the space
  // fresh (which would tear down + re-subscribe everything unnecessarily).
  function showGenderStep(spaceId, opts) {
    opts = opts || {};
    genderState.spaceId = spaceId;
    genderState.returnToBoard = !!opts.returnToBoard;
    var currentGender = null;
    if (state.space && state.user && state.space.memberProfiles) {
      var profile = state.space.memberProfiles[state.user.uid];
      currentGender = profile && profile.gender;
    }
    paintGenderSelection(currentGender);
    show('gender');
  }

  function pickGender(gender) {
    var spaceId = genderState.spaceId;
    var uid = state.user && state.user.uid;
    var returnToBoard = genderState.returnToBoard;
    if (!spaceId || !uid) return;
    genderState.spaceId = null; genderState.returnToBoard = false;
    markGenderAsked(spaceId, uid);
    trackPending(store.updateMemberProfile(spaceId, uid, { gender: gender })).then(function () {
      applyTitleRule(spaceId, uid, gender);
      if (returnToBoard) show('board'); else enterSpace(spaceId);
    }).catch(function (err) { reportMutationError(err); });
  }

  function skipGender() {
    var spaceId = genderState.spaceId;
    var uid = state.user && state.user.uid;
    var returnToBoard = genderState.returnToBoard;
    genderState.spaceId = null; genderState.returnToBoard = false;
    if (spaceId && uid) markGenderAsked(spaceId, uid);
    if (returnToBoard) show('board'); else enterSpace(spaceId);
  }

  function wireGenderScreen() {
    $$('.gender-opt').forEach(function (btn) {
      btn.addEventListener('click', function () { pickGender(btn.dataset.gender); });
    });
    $('#btn-gender-skip').addEventListener('click', skipGender);
  }

  // Legacy/one-time gate: a space snapshot arrives, MY profile exists but has
  // no gender yet, and we haven't asked before on this Mac -> show the
  // gender screen once. The flag gets set at pick/skip time either way, so
  // this never nags again afterward.
  function maybeShowLegacyGenderGate(space) {
    if (!state.user || !state.spaceId) return;
    var uid = state.user.uid;
    var profile = (space.memberProfiles || {})[uid];
    if (!profile || profile.gender) return;
    if (isGenderAsked(state.spaceId, uid)) return;
    var screen = $('#screen-gender');
    if (screen && !screen.hidden) return; // already showing (mid onboarding flow)
    showGenderStep(state.spaceId, { returnToBoard: true });
  }

  // -------------------------------------------------------------------------
  //  Space snapshot -> header + theme + kick off page migration
  // -------------------------------------------------------------------------
  function onSpace(space) {
    if (!space) { // space vanished
      store.setMySpaceId(null); state.spaceId = null; routeAfterAuth(); return;
    }
    state.space = space;
    window.CosyThemes.apply(space.theme || { preset: (CATEGORIES[space.kind] || CATEGORIES.couple).theme });
    renderHeader();
    maybeShowLegacyGenderGate(space);

    // Migration runs once per space-enter: creates home + personal pages the
    // first time, tops them up (new members, partner-slot re-assignment)
    // every time after. Idempotent, so re-running it is always safe — we
    // just avoid hammering it on every little space update.
    if (state.pagesReadyFor !== state.spaceId && !state.pagesLoading) {
      var sid = state.spaceId;
      state.pagesLoading = true;
      store.ensurePages(sid, space, state.user).then(function () {
        if (state.spaceId !== sid) return;
        state.pagesLoading = false;
        state.pagesReadyFor = sid;
        if (state.unsubPages) state.unsubPages();
        state.unsubPages = store.subscribePages(sid, onPages);
      }).catch(function (err) {
        if (state.spaceId !== sid) return;
        state.pagesLoading = false;
        console.error('[Cosy] ensurePages failed', err);
        toast("couldn't finish loading your corner — retrying…");
        setTimeout(function () {
          if (state.spaceId === sid && state.pagesReadyFor !== sid && !state.pagesLoading && state.space) onSpace(state.space);
        }, 2500);
      });
    }
  }

  function renderHeader() {
    var space = state.space; if (!space) return;
    var nameEl = $('#space-name');
    if (document.activeElement !== nameEl) nameEl.textContent = space.name || 'Our Cosy Corner';
    $('#sidebar-space-name').textContent = space.name || 'Our Cosy Corner';

    // invite code chip
    $('#invite-code').textContent = space.inviteCode || '——————';

    // avatars + moods
    var av = $('#avatars'); av.innerHTML = '';
    var members = space.members || [];
    var profiles = space.memberProfiles || {};
    // R7 header restructure: the invite code is shown in exactly one place
    // (#invite-row, next to the space name) and only until the corner is
    // full — once capacity is reached it disappears entirely and the header
    // goes to the full presence (avatars below) instead of showing the code
    // twice.
    var inviteRow = $('#invite-row');
    if (inviteRow) inviteRow.hidden = members.length >= (space.capacity || 2);
    members.forEach(function (uid) {
      var p = profiles[uid] || {};
      var chip = el('div', 'avatar-chip');
      var img = el('div', 'avatar');
      if (p.photo) { var im = el('img'); im.alt = ''; im.src = p.photo; img.appendChild(im); }
      else img.textContent = (p.name || '?').slice(0, 1).toUpperCase();
      var meta = el('div', 'avatar-meta');
      meta.appendChild(el('div', 'avatar-name', p.name || 'Someone'));
      var mood = el('button', 'mood-sticker', p.mood || '＋mood');
      if (uid === (state.user && state.user.uid)) {
        mood.title = 'change your mood';
        mood.setAttribute('aria-label', 'change your mood');
        mood.addEventListener('click', function (e) { openMoodPicker(e.currentTarget); });
      } else {
        mood.classList.add('readonly');
        mood.setAttribute('aria-hidden', 'true');
        mood.tabIndex = -1;
      }
      meta.appendChild(mood);
      chip.appendChild(img); chip.appendChild(meta);
      av.appendChild(chip);
    });
  }

  // editable space name
  function wireHeader() {
    var nameEl = $('#space-name');
    nameEl.addEventListener('blur', function () {
      var v = nameEl.textContent.trim() || 'Our Cosy Corner';
      nameEl.textContent = v;
      trackPending(store.updateSpace(state.spaceId, { name: v }));
    });
    nameEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); } });

    $('#btn-theme').addEventListener('click', openThemePanel);
    $('#btn-copy-code').addEventListener('click', function () {
      var code = (state.space && state.space.inviteCode) || '';
      navigator.clipboard && navigator.clipboard.writeText(code);
      toast('Invite code copied ' + code);
    });
    $('#btn-leave').addEventListener('click', goToCorners);
    $('#btn-settings').addEventListener('click', function (e) { openSettingsPopover(e.currentTarget); });
  }

  // -------------------------------------------------------------------------
  //  Settings popover (C-1 sign-out, C-4 export)
  // -------------------------------------------------------------------------
  function openSettingsPopover(anchor) {
    closePopovers();
    var pop = el('div', 'popover settings-pop');
    var exportBtn = el('button', 'settings-row', 'export our corner');
    exportBtn.addEventListener('click', function () { closePopovers(); exportSpace(); });
    pop.appendChild(exportBtn);
    var pronounsBtn = el('button', 'settings-row', 'pronouns');
    pronounsBtn.addEventListener('click', function () {
      closePopovers();
      showGenderStep(state.spaceId, { returnToBoard: true });
    });
    pop.appendChild(pronounsBtn);
    // S4 (Round 7 follow-up) — real "leave this corner" now lives here in
    // settings; the door button (#btn-leave) is pure navigation back to the
    // corner picker and no longer removes membership.
    if (state.spaceId && store.leaveSpace) {
      var exitBtn = el('button', 'settings-row', 'exit this corner');
      exitBtn.addEventListener('click', function () { closePopovers(); leaveSpace(); });
      pop.appendChild(exitBtn);
    }
    // Manual update check — only shown when running inside the Electron app
    // (window.cosyBridge), since a browser tab has no updater to ask.
    if (window.cosyBridge && window.cosyBridge.updateCheck) {
      var updateBtn = el('button', 'settings-row', 'check for updates');
      updateBtn.addEventListener('click', function () {
        closePopovers();
        updateManual = true;
        window.cosyBridge.updateCheck();
      });
      pop.appendChild(updateBtn);
    }
    // Sign-out only makes sense in cloud mode — local mode has no account to
    // sign out of, and hiding it there avoids a dead-end button.
    if (store.isCloud) {
      var signOutBtn = el('button', 'settings-row', 'sign out');
      signOutBtn.addEventListener('click', function () { closePopovers(); doSignOut(); });
      pop.appendChild(signOutBtn);
      var deleteBtn = el('button', 'settings-row', 'delete my account');
      deleteBtn.addEventListener('click', function () { closePopovers(); confirmDeleteAccount(); });
      pop.appendChild(deleteBtn);
    }
    placePopover(pop, anchor);
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function exportSpace() {
    if (!state.spaceId || !store.exportSpace) { toast('export is not available here'); return; }
    store.exportSpace(state.spaceId).then(function (data) {
      var json = JSON.stringify(data, null, 2);
      var blob = new Blob([json], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var d = new Date();
      var stamp = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
      var a = document.createElement('a');
      a.href = url; a.download = 'cosy-corner-export-' + stamp + '.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      toast('exported your corner');
    }).catch(function (err) {
      toast('export did not work: ' + ((err && err.message) || 'unknown error'));
    });
  }

  // C-1: unsubscribe every live listener before routing to welcome, so a
  // stale snapshot callback can't fire against a signed-out session.
  function doSignOut() {
    store.signOut().then(function () {
      if (state.unsubSpace) state.unsubSpace();
      if (state.unsubBlocks) state.unsubBlocks();
      if (state.unsubPages) state.unsubPages();
      unwireConnectionIndicator();
      state.unsubSpace = null; state.unsubBlocks = null; state.unsubPages = null;
      state.spaceId = null; state.space = null; state.blocks = []; state.pages = [];
      state.currentPageId = null; state.pagesReadyFor = null; state.pagesLoading = false; state.user = null;
      show('welcome');
    }).catch(function (err) {
      toast('sign out did not work: ' + ((err && err.message) || 'unknown error'));
    });
  }

  // Confirm popover mirrors leaveSpace()'s pattern above — a small popover
  // anchored to the settings gear, not a native confirm(). The actual
  // deletion + cleanup lives inline in the 'delete forever' handler below,
  // reusing doSignOut()'s success-path cleanup since by that point the
  // account is already gone server-side.
  function confirmDeleteAccount() {
    closePopovers();
    var anchor = $('#btn-settings');
    var pop = el('div', 'popover confirm-pop');
    pop.appendChild(el('div', 'confirm-msg', 'this permanently deletes your account. corners you share stay with the rest of the group — corners only you are in are erased forever. this cannot be undone.'));
    var row = el('div', 'confirm-row');
    var yes = el('button', 'btn-secondary small confirm-yes', 'delete forever');
    var no = el('button', 'btn-secondary small confirm-no', 'keep my account');
    yes.addEventListener('click', function () {
      closePopovers();
      if (!store.deleteAccount) return;
      toast('deleting your account…');
      store.deleteAccount().then(function () {
        if (state.unsubSpace) state.unsubSpace();
        if (state.unsubBlocks) state.unsubBlocks();
        if (state.unsubPages) state.unsubPages();
        unwireConnectionIndicator();
        state.unsubSpace = null; state.unsubBlocks = null; state.unsubPages = null;
        state.spaceId = null; state.space = null; state.blocks = []; state.pages = [];
        state.currentPageId = null; state.pagesReadyFor = null; state.pagesLoading = false; state.user = null;
        show('welcome');
        toast('your account is gone. take care');
      }).catch(function (err) {
        toast('could not delete your account: ' + ((err && err.message) || 'unknown error'));
      });
    });
    no.addEventListener('click', closePopovers);
    row.appendChild(yes); row.appendChild(no);
    pop.appendChild(row);
    placePopover(pop, anchor || { getBoundingClientRect: function () { return document.body.getBoundingClientRect(); } });
  }

  function openMoodPicker(anchor) {
    closePopovers();
    var pop = el('div', 'popover mood-pop');
    MOODS.forEach(function (m) {
      var b = el('button', 'mood-opt', m);
      b.addEventListener('click', function () {
        trackPending(store.updateMemberProfile(state.spaceId, state.user.uid, { mood: m }));
        closePopovers();
      });
      pop.appendChild(b);
    });
    var clear = el('button', 'mood-clear', 'clear');
    clear.addEventListener('click', function () {
      trackPending(store.updateMemberProfile(state.spaceId, state.user.uid, { mood: '' })); closePopovers();
    });
    pop.appendChild(clear);
    placePopover(pop, anchor);
  }

  // -------------------------------------------------------------------------
  //  Page tree helpers
  // -------------------------------------------------------------------------
  function findPage(id) {
    if (!id) return null;
    return state.pages.filter(function (p) { return p.id === id; })[0] || null;
  }
  function homePageId() {
    var h = state.pages.filter(function (p) { return p.kind === 'home' && !p.trashed; })[0];
    return h ? h.id : null;
  }
  function childrenOf(pageId) {
    return state.pages.filter(function (p) { return (p.parentId || null) === pageId; })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }
  function canViewPage(page) {
    return page.kind !== 'page' || !page.ownerUid || page.ownerUid === 'shared' ||
      page.ownerUid === (state.user && state.user.uid);
  }
  function isUnderSharedHome(page) {
    var cur = page;
    var guard = 0;
    while (cur && guard++ < 50) {
      if (cur.kind === 'home') return true;
      cur = cur.parentId ? findPage(cur.parentId) : null;
    }
    return false;
  }
  // C-3: a page is hidden from the tree/chips/dashboard/switcher when it (or
  // any ancestor) is trashed — computed transitively so a whole trashed
  // sub-tree disappears together, not just its root.
  function computeHiddenIds() {
    var hidden = {};
    state.pages.forEach(function (p) {
      if (p.trashed) {
        collectDescendantIds(state.pages, p.id).forEach(function (id) { hidden[id] = true; });
      }
    });
    return hidden;
  }
  function visibleChildrenOf(pageId, hidden) {
    hidden = hidden || computeHiddenIds();
    return childrenOf(pageId).filter(function (p) { return !hidden[p.id]; });
  }
  function pageAncestors(page) {
    var chain = [];
    var cur = page;
    var guard = 0;
    while (cur && guard++ < 50) { chain.unshift(cur); cur = cur.parentId ? findPage(cur.parentId) : null; }
    return chain;
  }
  // A page + every descendant page id, root included (mirrors storage.js).
  function collectDescendantIds(pages, rootId) {
    var byParent = {};
    pages.forEach(function (p) {
      var pid = p.parentId || null;
      (byParent[pid] = byParent[pid] || []).push(p.id);
    });
    var result = [rootId];
    var queue = [rootId];
    while (queue.length) {
      var cur = queue.shift();
      (byParent[cur] || []).forEach(function (cid) { result.push(cid); queue.push(cid); });
    }
    return result;
  }
  function isPageDeletable(page) {
    return page.kind !== 'home' && page.kind !== 'personal';
  }

  // -------------------------------------------------------------------------
  //  Unread dots (C-6) — cosy.lastSeen.<spaceId> = { pageId: ms, __initTs: ms }
  // -------------------------------------------------------------------------
  function lastSeenKey(spaceId) { return 'cosy.lastSeen.' + spaceId; }
  function loadLastSeen(spaceId) {
    try {
      var raw = window.localStorage.getItem(lastSeenKey(spaceId));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function saveLastSeen() {
    if (!state.spaceId) return;
    window.localStorage.setItem(lastSeenKey(state.spaceId), JSON.stringify(state.lastSeen));
  }
  // On the very first load of a space (no map on disk yet) seed every page
  // known at that moment with "now" — otherwise every page would show an
  // unread dot the first time the feature ships. Pages created afterwards
  // simply have no entry yet and fall back to comparing against __initTs.
  function ensureLastSeenSeeded() {
    if (state.lastSeen.__initTs) return;
    var now = Date.now();
    state.lastSeen.__initTs = now;
    state.pages.forEach(function (p) { if (state.lastSeen[p.id] == null) state.lastSeen[p.id] = now; });
    saveLastSeen();
  }
  function bumpLastSeen(pageId) {
    if (!pageId) return;
    state.lastSeen[pageId] = Date.now();
    saveLastSeen();
  }
  function newestBlockUpdate(pageId) {
    var max = 0;
    state.blocks.forEach(function (b) {
      if (b.pageId !== pageId) return;
      var t = normalizeTs(b.updatedAt);
      if (t > max) max = t;
    });
    return max;
  }
  function pageHasUnread(pageId) {
    var newest = newestBlockUpdate(pageId);
    if (!newest) return false;
    var seen = state.lastSeen[pageId];
    if (seen == null) seen = state.lastSeen.__initTs || 0;
    return newest > seen;
  }

  // expand/collapse persistence — per space
  function expandedKey(spaceId) { return 'cosy.expanded.' + spaceId; }
  function loadExpanded(spaceId) {
    try {
      var arr = JSON.parse(window.localStorage.getItem(expandedKey(spaceId)) || '[]');
      var map = {};
      arr.forEach(function (id) { map[id] = true; });
      return map;
    } catch (e) { return {}; }
  }
  function saveExpanded() {
    var arr = Object.keys(state.expanded).filter(function (k) { return state.expanded[k]; });
    window.localStorage.setItem(expandedKey(state.spaceId), JSON.stringify(arr));
  }
  function isAncestorOfCurrent(pageId) {
    var cur = findPage(state.currentPageId);
    var guard = 0;
    while (cur && cur.parentId && guard++ < 50) {
      if (cur.parentId === pageId) return true;
      cur = findPage(cur.parentId);
    }
    return false;
  }
  function isExpanded(page) {
    if (Object.prototype.hasOwnProperty.call(state.expanded, page.id)) return !!state.expanded[page.id];
    if (!page.parentId) return true; // top-level pages open by default
    return isAncestorOfCurrent(page.id);
  }
  function toggleExpand(pageId) {
    state.expanded[pageId] = !isExpanded(findPage(pageId) || { id: pageId, parentId: null });
    saveExpanded();
    renderSidebar();
  }

  // -------------------------------------------------------------------------
  //  Pages snapshot -> sidebar + routing
  // -------------------------------------------------------------------------
  function onPages(pages) {
    state.pages = (pages || []).filter(canViewPage);
    flushPendingTitleFix();
    ensureLastSeenSeeded();
    if (state.pendingCreatedPageId && findPage(state.pendingCreatedPageId)) {
      var createdId = state.pendingCreatedPageId;
      state.pendingCreatedPageId = null;
      navigateTo(createdId);
      return;
    }
    var hidden = computeHiddenIds();
    var current = findPage(state.currentPageId);
    if (!current) {
      var last = window.localStorage.getItem('cosy.lastPage.' + state.spaceId);
      var target = (findPage(last) && !hidden[last]) ? last : homePageId();
      navigateTo(target, { skipPersist: true });
    } else if (hidden[current.id]) {
      // C-3: the page we're looking at just got trashed (by us or remotely)
      // — bounce to home rather than showing a ghost page.
      navigateTo(homePageId());
    } else {
      renderSidebar();
      renderBreadcrumbs();
      renderPageHead();
      renderDashboardCards();
      renderSubpageChips();
    }
  }

  function navigateTo(pageId, opts) {
    opts = opts || {};
    var hidden = computeHiddenIds();
    var requested = findPage(pageId);
    if (requested && hidden[requested.id]) requested = null; // trashed — fall back home
    var page = requested || findPage(homePageId());
    if (!page) return; // pages not loaded yet
    state.currentPageId = page.id;
    if (!opts.skipPersist && state.spaceId) {
      window.localStorage.setItem('cosy.lastPage.' + state.spaceId, page.id);
    }
    bumpLastSeen(page.id);
    closePopovers();
    resetBlockRender();
    renderSidebar();
    renderBreadcrumbs();
    renderPageHead();
    renderDashboardCards();
    renderSubpageChips();
    renderBlockList();
  }

  // ---- sidebar: ownership zones ----
  // The signature "whose is whose" element: every top-level page (and the
  // sub-tree hanging off it) belongs to exactly one zone — the shared home
  // (+ any other shared root page) is "Ours"/"Shared"/"Home" (by category),
  // my personal page is "Your side"/"Your space", and every OTHER member
  // gets their own zone, labelled with their own name (otherZoneLabel).
  // A couple keeps the old two-zone-plus-one shape (there's only ever one
  // "other"); friends/family grow one zone-head per joined member.
  function zoneKeyOf(uid) { return 'other:' + uid; }
  function zoneMarkStyle(zoneKey) {
    if (zoneKey === 'ours') return 'ours';
    if (zoneKey === 'mine') return 'mine';
    return 'theirs';
  }
  // Walks the currently-loaded pages (not space.members) so it naturally
  // picks up a legacy couple's still-unclaimed 'partner-slot' placeholder
  // page pre-join, and — for friends/family — only lists zones for members
  // who actually have a personal page yet (ensurePages never pre-seeds
  // anyone else's, see storage.js).
  function computeSidebarZones() {
    var cat = currentCategory();
    var myUid = state.user && state.user.uid;
    var profiles = (state.space && state.space.memberProfiles) || {};
    var zones = [
      { key: 'ours', label: cat.zoneShared },
      { key: 'mine', label: cat.zoneMine }
    ];
    var seen = {};
    state.pages.forEach(function (p) {
      if (p.kind !== 'personal' || !p.ownerUid || p.ownerUid === myUid) return;
      if (seen[p.ownerUid]) return;
      seen[p.ownerUid] = true;
      var name = (p.ownerUid !== 'partner-slot' && profiles[p.ownerUid] && profiles[p.ownerUid].name) || null;
      zones.push({ key: zoneKeyOf(p.ownerUid), label: otherZoneLabel(name) });
    });
    return zones;
  }
  function zoneOfRootPage(page) {
    if (page.kind !== 'personal') return 'ours';
    var myUid = state.user && state.user.uid;
    return page.ownerUid === myUid ? 'mine' : zoneKeyOf(page.ownerUid);
  }

  // Display label for a sidebar row. Personal-page titles are stored
  // generically ("Partner's dashboard", or a person's own name) because
  // every member reads the same list. When the stored title is still a
  // system default (never a title someone typed), show the owner's name, or
  // the zone's own wording. Display-only: startInlineRename still edits
  // page.title.
  function sidebarLabelFor(page, zone) {
    var stored = page.title || 'Untitled';
    if (page.kind !== 'personal') return stored;
    var profiles = (state.space && state.space.memberProfiles) || {};
    var profile = profiles[page.ownerUid];
    // A default-ish title (an old "His/Her/Their side" / "Partner's dashboard",
    // or a legacy "<name>'s dashboard" seed) is display-collapsed to the owner's
    // name. A title the member actually typed is always shown verbatim.
    var isDefault = KNOWN_DEFAULT_TITLES.indexOf(stored) !== -1 ||
      (profile && profile.name && stored === profile.name + "'s dashboard");
    if (!isDefault) return stored;
    if (profile && profile.name) return profile.name;
    return zone === 'mine' ? currentCategory().zoneMine : otherZoneLabel(null);
  }

  function renderSidebar() {
    var root = $('#page-tree'); if (!root) return;
    root.innerHTML = '';
    var hidden = computeHiddenIds();
    function buildLevel(parentId, depth, zone) {
      visibleChildrenOf(parentId, hidden).forEach(function (page) {
        root.appendChild(pageRow(page, depth, hidden, zone));
        if (isExpanded(page) && visibleChildrenOf(page.id, hidden).length) buildLevel(page.id, depth + 1, zone);
      });
    }
    var topLevel = visibleChildrenOf(null, hidden);
    computeSidebarZones().forEach(function (z) {
      var roots = topLevel.filter(function (p) { return zoneOfRootPage(p) === z.key; });
      if (!roots.length) return;
      var head = el('div', 'sidebar-zone-head');
      head.appendChild(el('span', 'zone-mark zone-mark-' + zoneMarkStyle(z.key)));
      head.appendChild(el('span', null, z.label));
      root.appendChild(head);
      roots.forEach(function (page) {
        root.appendChild(pageRow(page, 0, hidden, z.key));
        if (isExpanded(page) && visibleChildrenOf(page.id, hidden).length) buildLevel(page.id, 1, z.key);
      });
    });
    renderTrashButton();
  }

  function pageRow(page, depth, hidden, zone) {
    var zoneClass = zone ? zone.replace(/[^a-zA-Z0-9_-]/g, '-') : '';
    var row = el('div', 'page-row' + (zoneClass ? ' zone-' + zoneClass : ''));
    row.style.paddingLeft = (10 + depth * 18) + 'px';
    row.dataset.id = page.id;
    row.setAttribute('role', 'treeitem');
    if (page.id === state.currentPageId) row.classList.add('active');

    var hasKids = visibleChildrenOf(page.id, hidden).length > 0;
    var chevron = el('button', 'page-chevron' + (hasKids ? '' : ' empty'), hasKids ? (isExpanded(page) ? '▾' : '▸') : '');
    chevron.tabIndex = -1;
    chevron.setAttribute('aria-label', hasKids ? (isExpanded(page) ? 'collapse' : 'expand') + ' ' + (page.title || 'Untitled') : '');
    chevron.setAttribute('aria-hidden', hasKids ? 'false' : 'true');
    chevron.addEventListener('click', function (e) { e.stopPropagation(); toggleExpand(page.id); });
    row.appendChild(chevron);

    if (zone) {
      var mark = el('span', 'zone-mark page-row-mark zone-mark-' + zoneMarkStyle(zone));
      mark.setAttribute('aria-hidden', 'true');
      row.appendChild(mark);
    }

    var icon = el('span', 'page-row-icon', page.icon || '');
    icon.title = 'change icon';
    icon.setAttribute('role', 'button');
    icon.setAttribute('tabindex', '0');
    icon.setAttribute('aria-label', 'change icon for ' + (page.title || 'Untitled'));
    makeKeyActivatable(icon);
    icon.addEventListener('click', function (e) { e.stopPropagation(); openIconPicker(icon, page); });
    row.appendChild(icon);

    var title = el('span', 'page-row-title', sidebarLabelFor(page, zone));
    title.addEventListener('dblclick', function (e) { e.stopPropagation(); startInlineRename(title, page); });
    row.appendChild(title);

    if (pageHasUnread(page.id)) row.appendChild(el('span', 'unread-dot'));

    var actions = el('div', 'page-row-actions');
    var addBtn = el('button', 'page-row-add', '＋');
    addBtn.title = 'add a sub-page';
    addBtn.setAttribute('aria-label', 'add a sub-page to ' + (page.title || 'Untitled'));
    addBtn.addEventListener('click', function (e) { e.stopPropagation(); createSubPage(page.id); });
    actions.appendChild(addBtn);

    if (isPageDeletable(page)) {
      var delBtn = el('button', 'page-row-del'); delBtn.innerHTML = ICON_TRASH;
      delBtn.title = 'move to trash';
      delBtn.setAttribute('aria-label', 'move ' + (page.title || 'Untitled') + ' to trash');
      delBtn.addEventListener('click', function (e) { e.stopPropagation(); trashPage(page); });
      actions.appendChild(delBtn);
    }
    row.appendChild(actions);

    row.addEventListener('click', function () { navigateTo(page.id); });
    return row;
  }

  function startInlineRename(titleSpan, page) {
    var input = el('input', 'page-row-rename-input');
    input.type = 'text'; input.value = page.title || '';
    titleSpan.replaceWith(input);
    input.focus(); input.select();
    var done = false;
    function commit() {
      if (done) return; done = true;
      var v = input.value.trim() || 'Untitled';
      trackPending(store.updatePage(state.spaceId, page.id, { title: v }));
    }
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      else if (e.key === 'Escape') { done = true; renderSidebar(); }
    });
  }

  function createSubPage(parentId) {
    var order = childrenOf(parentId).length;
    var parent = findPage(parentId);
    var ownerUid = (parent && parent.kind === 'page' && parent.ownerUid !== 'shared') ? parent.ownerUid : 'shared';
    trackPending(store.addPage(state.spaceId, {
      title: 'Untitled', icon: '', parentId: parentId, kind: 'page', ownerUid: ownerUid, order: order
    })).then(function (id) {
      state.expanded[parentId] = true; saveExpanded();
      state.pendingCreatedPageId = id;
      if (findPage(id)) { state.pendingCreatedPageId = null; navigateTo(id); }
    }).catch(function (err) { reportMutationError(err); });
  }

  // C-3: soft-delete — recoverable via the trash popover, so no confirm
  // dialog is needed here anymore (it moved to "delete forever").
  function trashPage(page) {
    trackPending(store.updatePage(state.spaceId, page.id, { trashed: true, trashedAt: Date.now() }));
    var doomed = collectDescendantIds(state.pages, page.id);
    if (doomed.indexOf(state.currentPageId) !== -1) {
      var fallback = (page.parentId && doomed.indexOf(page.parentId) === -1) ? page.parentId : homePageId();
      navigateTo(fallback);
    }
    toast('moved to trash');
  }

  function renderTrashButton() {
    var btn = $('#btn-trash'); if (!btn) return;
    var n = state.pages.filter(function (p) { return p.trashed; }).length;
    btn.hidden = n === 0;
    // The static trash SVG icon lives in index.html alongside this label
    // span — update the label only, so we never clobber the icon with a
    // textContent write on the whole button.
    var label = $('#btn-trash-label');
    if (label) label.textContent = 'trash (' + n + ')';
    btn.setAttribute('aria-label', 'trash, ' + n + ' page' + (n === 1 ? '' : 's'));
  }

  function openTrashPopover(anchor) {
    closePopovers();
    var trashedPages = state.pages.filter(function (p) { return p.trashed; })
      .sort(function (a, b) { return (b.trashedAt || 0) - (a.trashedAt || 0); });
    var pop = el('div', 'popover trash-pop');
    pop.appendChild(el('div', 'picker-head', 'trash'));
    if (!trashedPages.length) pop.appendChild(el('div', 'trash-empty', 'nothing here'));
    trashedPages.forEach(function (page) {
      var row = el('div', 'trash-row');
      row.appendChild(el('span', 'trash-row-icon', page.icon || ''));
      row.appendChild(el('span', 'trash-row-title', page.title || 'Untitled'));
      var restore = el('button', 'trash-row-restore', 'restore');
      restore.setAttribute('aria-label', 'restore ' + (page.title || 'Untitled'));
      restore.addEventListener('click', function () {
        trackPending(store.updatePage(state.spaceId, page.id, { trashed: false, trashedAt: null }));
        closePopovers();
      });
      var del = el('button', 'trash-row-del', 'delete forever');
      del.setAttribute('aria-label', 'delete ' + (page.title || 'Untitled') + ' forever');
      del.addEventListener('click', function () { confirmDeleteForever(page, del); });
      row.appendChild(restore); row.appendChild(del);
      pop.appendChild(row);
    });
    placePopover(pop, anchor);
  }

  // The existing confirm-popover pattern, reused for the one truly
  // irreversible action left ("delete forever"). The anchor button lives
  // inside the trash popover itself, which closePopovers() is about to
  // remove — so its position is captured first and handed to placePopover
  // as a plain rect-returning stand-in anchor.
  function confirmDeleteForever(page, anchorEl) {
    var rect = anchorEl.getBoundingClientRect();
    closePopovers();
    var pop = el('div', 'popover confirm-pop');
    pop.appendChild(el('div', 'confirm-msg', 'delete this forever? there’s no undo'));
    var row = el('div', 'confirm-row');
    var yes = el('button', 'btn-secondary small confirm-yes', 'delete forever');
    var no = el('button', 'btn-secondary small confirm-no', 'keep it');
    yes.addEventListener('click', function () {
      closePopovers();
      trackPending(store.deletePage(state.spaceId, page.id));
    });
    no.addEventListener('click', closePopovers);
    row.appendChild(yes); row.appendChild(no);
    pop.appendChild(row);
    placePopover(pop, { getBoundingClientRect: function () { return rect; } });
  }

  function wireSidebar() {
    $('#btn-new-root-page').addEventListener('click', function () {
      var order = childrenOf(null).length;
      trackPending(store.addPage(state.spaceId, {
        title: 'Untitled', icon: '', parentId: null, kind: 'page', ownerUid: 'shared', order: order
      })).then(function (id) {
        state.pendingCreatedPageId = id;
        if (findPage(id)) { state.pendingCreatedPageId = null; navigateTo(id); }
      }).catch(function (err) { reportMutationError(err); });
    });
    $('#btn-trash').addEventListener('click', function (e) { openTrashPopover(e.currentTarget); });
    $('#btn-find-page').addEventListener('click', openSwitcher);
  }

  // ---- sidebar collapse ----
  function wireSidebarToggle() {
    var collapsed = window.localStorage.getItem('cosy.sidebarCollapsed') === '1';
    setSidebarCollapsed(collapsed);
    $('#btn-sidebar-toggle').addEventListener('click', function () { setSidebarCollapsed(true); });
    $('#btn-sidebar-open').addEventListener('click', function () { setSidebarCollapsed(false); });
  }
  function setSidebarCollapsed(collapsed) {
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    $('#btn-sidebar-open').hidden = !collapsed;
    window.localStorage.setItem('cosy.sidebarCollapsed', collapsed ? '1' : '0');
  }

  // ---- icon picker (shared by sidebar rows + the big page title) ----
  function openIconPicker(anchor, page) {
    closePopovers();
    var pop = el('div', 'popover icon-pop');
    PAGE_EMOJI.forEach(function (e2) {
      var b = el('button', 'icon-opt', e2);
      b.setAttribute('aria-label', 'set icon to ' + e2);
      b.addEventListener('click', function () {
        trackPending(store.updatePage(state.spaceId, page.id, { icon: e2 }));
        closePopovers();
      });
      pop.appendChild(b);
    });
    placePopover(pop, anchor);
  }

  // ---- breadcrumbs + big page head ----
  function renderBreadcrumbs() {
    var wrap = $('#breadcrumbs'); wrap.innerHTML = '';
    var page = findPage(state.currentPageId);
    if (!page) return;
    var chain = pageAncestors(page);
    // One page title, not two: a flat/shallow page (home, or a direct child
    // of home/a personal page) already has its name in the big page-title
    // below, so a breadcrumb trail there is just the same words repeated.
    // Breadcrumbs earn their keep at 3+ levels of depth (the UX-catalogue
    // rule of thumb), i.e. once the page has 2+ ancestors of its own.
    if (chain.length < 3) return;
    chain.forEach(function (p, i) {
      var crumb = el('button', 'crumb' + (i === chain.length - 1 ? ' current' : ''), (p.icon ? p.icon + ' ' : '') + (p.title || 'Untitled'));
      crumb.addEventListener('click', function () { navigateTo(p.id); });
      wrap.appendChild(crumb);
      if (i < chain.length - 1) wrap.appendChild(el('span', 'crumb-sep', '/'));
    });
  }

  function renderPageHead() {
    var page = findPage(state.currentPageId);
    if (!page) return;
    var titleEl = $('#page-title');
    if (document.activeElement !== titleEl) titleEl.textContent = page.title || 'Untitled';
    // #page-icon-btn's default markup is an inline house SVG (Rule B) — only
    // overwrite it with text when the page actually has a chosen icon, and
    // restore the SVG (via innerHTML, not textContent) otherwise, so a page
    // with no custom icon doesn't just go blank.
    var iconBtn = $('#page-icon-btn');
    if (page.icon) iconBtn.textContent = page.icon;
    else iconBtn.innerHTML = currentCategory().emblem;
    var visibilityBtn = $('#page-visibility-btn');
    var canChooseVisibility = page.kind === 'page' && !isUnderSharedHome(page);
    visibilityBtn.hidden = !canChooseVisibility;
    if (canChooseVisibility) {
      var isPrivate = !!page.ownerUid && page.ownerUid !== 'shared';
      visibilityBtn.textContent = isPrivate ? 'private' : 'shared';
      visibilityBtn.title = isPrivate ? 'hidden from everyone else' : 'shown to the whole corner';
      visibilityBtn.setAttribute('aria-label', visibilityBtn.title + '; click to change');
    }
  }

  function wirePageHead() {
    var titleEl = $('#page-title');
    titleEl.addEventListener('blur', function () {
      var page = findPage(state.currentPageId);
      if (!page) return;
      var v = titleEl.textContent.trim() || 'Untitled';
      titleEl.textContent = v;
      trackPending(store.updatePage(state.spaceId, page.id, { title: v }));
    });
    titleEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); } });
    $('#page-icon-btn').addEventListener('click', function (e) {
      var page = findPage(state.currentPageId);
      if (page) openIconPicker(e.currentTarget, page);
    });
    $('#page-visibility-btn').addEventListener('click', function () {
      var page = findPage(state.currentPageId);
      if (!page || page.kind !== 'page' || isUnderSharedHome(page)) return;
      var ownerUid = page.ownerUid && page.ownerUid !== 'shared' ? 'shared' : state.user.uid;
      var ids = collectDescendantIds(state.pages, page.id);
      var updates = state.pages.filter(function (p) {
        return p.kind === 'page' && ids.indexOf(p.id) !== -1;
      }).map(function (p) {
        return store.updatePage(state.spaceId, p.id, { ownerUid: ownerUid });
      });
      trackPending(Promise.all(updates));
    });
  }

  // ---- home page dashboard cards ----
  function renderDashboardCards() {
    var wrap = $('#dashboard-cards'); if (!wrap) return;
    wrap.innerHTML = '';
    var page = findPage(state.currentPageId);
    if (!page || page.kind !== 'home') { wrap.hidden = true; return; }
    wrap.hidden = false;
    var profiles = (state.space && state.space.memberProfiles) || {};
    var hidden = computeHiddenIds();
    // A joined member already has a live avatar/name/mood chip in the header
    // (see renderHeader()) — this compact header widget only needs to carry
    // the ones that chip doesn't cover yet (the still-empty partner slot),
    // so it never repeats the same name+avatar the header already shows.
    // The empty partner slot is skipped too: while nobody has joined, the
    // header's invite row already says so AND carries the code to act on it.
    // Showing "waiting for them…" beside it says the same thing twice — the
    // slot is still reachable in the sidebar's "Their side" zone.
    var members = (state.space && state.space.members) || [];
    var personalPages = state.pages.filter(function (p) {
      return p.kind === 'personal' && !hidden[p.id] &&
        members.indexOf(p.ownerUid) === -1 && p.ownerUid !== 'partner-slot';
    }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    personalPages.forEach(function (p) {
      var profile = profiles[p.ownerUid];
      var name = (profile && profile.name) || p.title || 'waiting for someone to join…';
      var card = el('div', 'dashboard-card');
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', 'open ' + name + "'s dashboard");
      makeKeyActivatable(card);
      var av = el('div', 'avatar');
      if (profile && profile.photo) { var im = el('img'); im.alt = ''; im.src = profile.photo; av.appendChild(im); }
      else av.textContent = p.icon || '';
      var meta = el('div', 'dc-meta');
      meta.appendChild(el('div', 'dc-name', name));
      meta.appendChild(el('div', 'dc-mood', (profile && profile.mood) || ''));
      card.appendChild(av); card.appendChild(meta);
      card.addEventListener('click', function () { navigateTo(p.id); });
      wrap.appendChild(card);
    });
  }

  // ---- sub-page chip row ----
  function renderSubpageChips() {
    var wrap = $('#subpage-chips'); if (!wrap) return;
    wrap.innerHTML = '';
    var page = findPage(state.currentPageId);
    if (!page) return;
    visibleChildrenOf(page.id).forEach(function (k) {
      var chip = el('div', 'subpage-chip');
      chip.setAttribute('role', 'button');
      chip.setAttribute('tabindex', '0');
      chip.setAttribute('aria-label', 'open ' + (k.title || 'Untitled'));
      makeKeyActivatable(chip);
      chip.appendChild(el('span', 'chip-icon', k.icon || ''));
      chip.appendChild(el('span', 'chip-title', k.title || 'Untitled'));
      if (pageHasUnread(k.id)) chip.appendChild(el('span', 'unread-dot'));
      chip.addEventListener('click', function () { navigateTo(k.id); });
      wrap.appendChild(chip);
    });
    // Sub-page creation lives in exactly one place — the sidebar's per-row
    // "add a sub-page" button (pageRow()'s .page-row-add) — rather than
    // duplicated here as a second, unlabelled "+" affordance.
  }

  // -------------------------------------------------------------------------
  //  Blocks (for the current page only)
  // -------------------------------------------------------------------------
  // R2-A keyed incremental renderer — every save (debounced text, todo tick,
  // slider drag, divider click…) triggers a full storage snapshot, but a
  // snapshot must NOT mean "destroy and rebuild every block node": that's
  // what caused the caret jump / page-refresh bugs. Instead we keep a
  // blockId -> {node, key, block} map and diff against it on each snapshot.
  var renderedBlocks = {};  // blockId -> { node, key, block }
  var pendingBlocks = {};   // blockId -> fresh block data, waiting for blur to rebuild safely
  var emptyNode = null;     // single reused empty-state element

  function blockKey(block) {
    // Deliberately excludes order/updatedAt/width — those must never force a
    // content rebuild (order is handled by the reposition pass, width by the
    // style-only pass in applyWidth()).
    return block.type + '|' + JSON.stringify(block.content);
  }

  // Shared local-echo-suppression path: fold `patch` into our own copy of the
  // block *before* persisting, and refresh the stored key to match, so when
  // the store echoes the same data back in the next snapshot, the key (or,
  // for width, the style pass) already reflects it and nothing rebuilds.
  // Used by every block-level mutation — content edits (via blockCard's
  // ctx.update) and width changes (via the ⤢ popover / edge-drag) alike.
  function persistBlockPatch(blockId, patch) {
    var entry = renderedBlocks[blockId];
    if (entry) {
      entry.block = Object.assign({}, entry.block, patch);
      entry.key = blockKey(entry.block);
    }
    return trackPending(store.updateBlock(state.spaceId, blockId, patch));
  }

  // ---- widget width (R2-C): 25/33/50/66/75/100% flex-basis, gap-aware ----
  var BLOCK_GAP = 14; // px — keep in sync with .block-list { gap } in css
  var WIDTH_STEPS = [25, 33, 50, 66, 75, 100];
  function widthFlexBasis(w) {
    if (WIDTH_STEPS.indexOf(w) === -1) w = 100;
    // Algebraically equivalent to gap*(columns-1)/columns for columns =
    // 100/w — works for the "odd" steps (33/66) too, without needing to
    // know how many cards actually share the row.
    var adjust = BLOCK_GAP * (100 - w) / 100;
    return 'calc(' + w + '% - ' + adjust.toFixed(2) + 'px)';
  }
  // Style-only pass (mirrors the reposition pass): never touches block
  // content, so it's safe to call on every snapshot walk, on echoed width
  // updates, and instantly on local width changes — reused nodes stay reused.
  function applyWidth(node, block) {
    var w = (block && block.width) || 100;
    var basis = widthFlexBasis(w);
    node.style.flex = '0 0 ' + basis;
    node.style.maxWidth = basis;
    node.style.alignSelf = 'flex-start';
    node.dataset.width = w;
  }
  function nodeHasFocus(node) {
    var active = document.activeElement;
    return !!(active && node.contains(active));
  }
  // Resets the incremental-render map — used on page navigation, where a
  // full clear + rebuild is correct (and expected) behaviour.
  function resetBlockRender() {
    var listEl = $('#block-list');
    // S3/S4 (Round 7): pdf/image block roots may hold a live object URL —
    // tear it down before the node is discarded, or it leaks for the life
    // of the renderer process.
    Object.keys(renderedBlocks).forEach(function (id) {
      var node = renderedBlocks[id].node;
      if (node && node.__cosyTeardown) node.__cosyTeardown();
    });
    if (listEl) listEl.innerHTML = '';
    Object.keys(renderedBlocks).forEach(function (id) { delete renderedBlocks[id]; });
    Object.keys(pendingBlocks).forEach(function (id) { delete pendingBlocks[id]; });
    emptyNode = null;
  }

  function onBlocks(blocks) {
    state.blocks = blocks || [];
    if (state.currentPageId) {
      bumpLastSeen(state.currentPageId); // C-6: viewing = seen, on every snapshot
      renderBlockList();
    }
    // C-6: refresh unread dots. Sidebar/chips are cheap, from-scratch
    // re-renders — they never touch the incremental block-list nodes above,
    // so this can never cause the caret-jump/rebuild bugs R2-A fixed.
    renderSidebar();
    renderSubpageChips();
  }

  function renderBlockList() {
    var listEl = $('#block-list'); if (!listEl) return;
    var mine = state.blocks.filter(function (b) { return b.pageId === state.currentPageId; });
    mine.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });

    // ids gone (deleted, or the delete animation just finished) -> drop node + map entry
    var keepIds = {};
    mine.forEach(function (b) { keepIds[b.id] = true; });
    Object.keys(renderedBlocks).forEach(function (id) {
      if (!keepIds[id]) {
        var gone = renderedBlocks[id];
        if (gone.node.__cosyTeardown) gone.node.__cosyTeardown();
        if (gone.node.parentNode) gone.node.parentNode.removeChild(gone.node);
        delete renderedBlocks[id];
        delete pendingBlocks[id];
      }
    });

    if (mine.length === 0) {
      if (!emptyNode) emptyNode = emptyState();
      if (emptyNode.parentNode !== listEl) listEl.appendChild(emptyNode);
      return;
    }
    if (emptyNode && emptyNode.parentNode) emptyNode.parentNode.removeChild(emptyNode);

    // new id -> build + insert; same key -> reuse untouched; changed key ->
    // rebuild in place UNLESS the node currently holds focus, in which case
    // defer (store as pending, rebuild on blur or on a later unfocused snapshot).
    var desired = mine.map(function (block) {
      var entry = renderedBlocks[block.id];
      var newKey = blockKey(block);

      if (!entry) {
        var node = blockCard(block);
        renderedBlocks[block.id] = { node: node, key: newKey, block: block };
        return node;
      }
      if (entry.key === newKey) {
        delete pendingBlocks[block.id];
        entry.block = block;
        // Width isn't part of the key, so a width-only change lands here —
        // the node is reused untouched, but the style pass must still run.
        applyWidth(entry.node, block);
        return entry.node;
      }
      if (nodeHasFocus(entry.node)) {
        pendingBlocks[block.id] = block; // defer — don't yank the node from under the person
        applyWidth(entry.node, block); // width can still apply live while content edit is deferred
        return entry.node;
      }
      var fresh = blockCard(block);
      if (entry.node.__cosyTeardown) entry.node.__cosyTeardown();
      if (entry.node.parentNode) entry.node.parentNode.replaceChild(fresh, entry.node);
      entry.node = fresh; entry.key = newKey; entry.block = block;
      delete pendingBlocks[block.id];
      return entry.node;
    });

    // Minimal-moves reposition: only touch the DOM for nodes whose position
    // actually changed. Blindly re-appending every node on every snapshot
    // would (among other things) reload live PDF iframes for nothing.
    var prev = null;
    desired.forEach(function (node) {
      var ref = prev ? prev.nextSibling : listEl.firstChild;
      if (ref !== node) listEl.insertBefore(node, ref);
      prev = node;
    });
  }

  // Called (with a short delay, so focus has settled) whenever a block card
  // loses focus — flushes a rebuild that was deferred because the person
  // was actively editing when a changed snapshot came in.
  function tryFlushPending(id) {
    var fresh = pendingBlocks[id];
    if (!fresh) return;
    var entry = renderedBlocks[id];
    if (!entry) { delete pendingBlocks[id]; return; }
    if (nodeHasFocus(entry.node)) return; // focus just moved to another spot inside the same card
    var newNode = blockCard(fresh);
    if (entry.node.__cosyTeardown) entry.node.__cosyTeardown();
    if (entry.node.parentNode) entry.node.parentNode.replaceChild(newNode, entry.node);
    entry.node = newNode; entry.key = blockKey(fresh); entry.block = fresh;
    delete pendingBlocks[id];
  }

  function emptyState() {
    var e = el('div', 'empty-state');
    e.innerHTML = '<div class="empty-emoji">' + ICON_SPARKLE + '</div><div>Add a note, a to-do, or a photo to start this page</div>';
    e.setAttribute('role', 'button');
    e.setAttribute('tabindex', '0');
    e.setAttribute('aria-label', 'add a block');
    makeKeyActivatable(e);
    e.addEventListener('click', function () { var b = $('#btn-add-block'); if (b) b.click(); });
    return e;
  }

  function blockCard(block) {
    var card = el('div', 'block-card');
    card.dataset.id = block.id;
    card.setAttribute('aria-roledescription', 'movable widget');
    applyWidth(card, block); // covers new/rebuilt-in-place/flushed-pending nodes

    var bar = el('div', 'block-bar');
    var handle = el('span', 'block-handle', '⠿');
    handle.title = 'drag to reorder';
    handle.setAttribute('aria-hidden', 'true');
    var typeTag = el('span', 'block-type');
    var t = window.CosyBlocks.TYPES.filter(function (x) { return x.type === block.type; })[0];
    // t.icon is markup (an inline SVG string, see blocks.js) — only safe to
    // insert via innerHTML. typeLabel here is plain text (used for the tag's
    // textContent and for aria-labels below), so it uses t.label alone.
    var typeLabel = t ? t.label : block.type;
    typeTag.textContent = typeLabel;
    var widthBtn = el('button', 'block-width-btn', '⤢');
    widthBtn.title = 'resize';
    widthBtn.setAttribute('aria-label', 'resize ' + typeLabel + ' block');
    widthBtn.addEventListener('click', function (e) {
      var latest = (renderedBlocks[block.id] && renderedBlocks[block.id].block) || block;
      openWidthPicker(e.currentTarget, latest, card);
    });
    var del = el('button', 'block-del'); del.innerHTML = ICON_TRASH;
    del.title = 'remove block';
    del.setAttribute('aria-label', 'delete ' + typeLabel + ' block');
    del.addEventListener('click', function () {
      // C-2: snapshot enough of the block BEFORE deleting to offer an undo.
      var latest = (renderedBlocks[block.id] && renderedBlocks[block.id].block) || block;
      var snapshot = {
        pageId: latest.pageId, type: latest.type,
        content: latest.content, width: latest.width, order: latest.order
      };
      card.classList.add('removing');
      var fid = latest.content && latest.content.fileId;
      var undoUsed = false;
      setTimeout(function () { trackPending(store.deleteBlock(state.spaceId, block.id)); }, 160);
      // S4 (Round 7) undo-race fix: only free the chunked file record once
      // the 6s undo window has expired UNUSED — undo re-adds a block that
      // still points at this same fileId, so deleting it early would orphan
      // the file out from under the restored block.
      setTimeout(function () {
        if (!undoUsed && fid && store.deleteFileData) {
          store.deleteFileData(state.spaceId, fid).catch(function () {});
        }
      }, 6000);
      toast('removed', {
        actionLabel: 'undo',
        duration: 6000,
        onAction: function () {
          undoUsed = true;
          trackPending(store.addBlock(state.spaceId, snapshot));
        }
      });
    });
    bar.appendChild(handle); bar.appendChild(typeTag); bar.appendChild(widthBtn); bar.appendChild(del);
    card.appendChild(bar);

    var ctx = {
      // Local echo suppression: fold this patch into our own copy of the
      // block *before* persisting, and refresh the stored key to match. When
      // the store echoes the same content back in the next snapshot, the
      // key already matches and renderBlockList reuses the node untouched.
      update: function (patch) { persistBlockPatch(block.id, patch); },
      uploadImage: function (file) { return store.uploadImage(state.spaceId, file); },
      toast: toast
    };
    var content = window.CosyBlocks.render(block, ctx);
    card.appendChild(content);

    wireResizeEdge(card, block);
    card.addEventListener('focusout', function () {
      setTimeout(function () { tryFlushPending(block.id); }, 0);
    });
    return card;
  }

  // ---- width control: popover (⤢ button) ----
  var WIDTH_OPTIONS = [[25, '¼'], [33, '⅓'], [50, '½'], [66, '⅔'], [75, '¾'], [100, 'full']];
  function persistWidth(blockId, node, w) {
    var entry = renderedBlocks[blockId];
    var merged = Object.assign({ id: blockId }, entry && entry.block, { width: w });
    applyWidth(node, merged); // instant — don't wait on the storage round-trip
    persistBlockPatch(blockId, { width: w });
  }
  function openWidthPicker(anchor, block, node) {
    closePopovers();
    var pop = el('div', 'popover width-pop');
    var current = block.width || 100;
    WIDTH_OPTIONS.forEach(function (opt) {
      var b = el('button', 'width-opt' + (opt[0] === current ? ' active' : ''), opt[1]);
      b.addEventListener('click', function () {
        persistWidth(block.id, node, opt[0]);
        closePopovers();
      });
      pop.appendChild(b);
    });
    placePopover(pop, anchor);
  }

  // ---- width control: edge drag-resize ----
  // An ~8px invisible hot-zone on the card's right border. Must never
  // conflict with the Notion-style pointer drag-reorder (dragdrop.js): the
  // resize starts on plain mousedown/mousemove/mouseup (not pointer events)
  // on the .resize-edge strip, which lives outside the ⠿ .block-handle that
  // DragController listens on — the two simply can't both claim the same
  // gesture. The `.resizing` class is still set/cleared so DragController's
  // canDrag() guard can veto a drag start while an edge-resize is in flight.
  function wireResizeEdge(card, block) {
    var edge = el('div', 'resize-edge');
    edge.addEventListener('mousedown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var list = $('#block-list');
      var listRect = list.getBoundingClientRect();
      var startX = e.clientX;
      var startPercent = (card.getBoundingClientRect().width / listRect.width) * 100;
      card.classList.add('resizing');

      function currentPercent(ev) {
        var dx = ev.clientX - startX;
        var pct = startPercent + (dx / listRect.width) * 100;
        return Math.max(15, Math.min(100, pct));
      }
      function onMove(ev) {
        var pct = currentPercent(ev);
        card.style.flex = '0 0 ' + pct + '%';
        card.style.maxWidth = pct + '%';
      }
      function onUp(ev) {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        card.classList.remove('resizing');
        var finalPercent = currentPercent(ev);
        var snapped = WIDTH_STEPS.reduce(function (a, b) {
          return Math.abs(b - finalPercent) < Math.abs(a - finalPercent) ? b : a;
        });
        var latest = (renderedBlocks[block.id] && renderedBlocks[block.id].block) || block;
        persistWidth(latest.id, card, snapped);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    card.appendChild(edge);
  }

  // ---- drag & drop reorder within the current page's block list ----
  // Notion-style pointer-drag, delegated on #block-list via CosyDnD
  // (js/dragdrop.js). Wired ONCE at boot — the list element itself survives
  // page navigation (only its children are rebuilt by resetBlockRender/
  // renderBlockList), so a single delegated controller never leaks listeners
  // per page switch.
  var blockDnD = null;
  function initBlockDnD() {
    var list = $('#block-list');
    if (!list || blockDnD) return;
    blockDnD = new window.CosyDnD.DragController({
      container: list,
      scrollContainer: $('#page-view'),
      canDrag: function (card) { return !card.classList.contains('resizing'); },
      getCards: function () {
        return $$('.block-card', list).map(function (c) { return { id: c.dataset.id, el: c }; });
      },
      onDrop: onBlockDrop,
      onCancel: function () {}
    });
  }

  // Computes the new order for the current page's blocks (splice draggedId
  // before beforeId, or append when beforeId is null), optimistically moves
  // the DOM node so the drop feels instant, then persists ONLY order indexes.
  // Order isn't part of blockKey (R2-A), so the storage echo repositions
  // nodes with the existing minimal-move pass — zero rebuilds.
  function onBlockDrop(draggedId, beforeId) {
    if (draggedId === beforeId) return;
    var mine = state.blocks.filter(function (b) { return b.pageId === state.currentPageId; })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var ids = mine.map(function (b) { return b.id; });
    var from = ids.indexOf(draggedId);
    if (from === -1) return;
    ids.splice(from, 1);
    var to = beforeId ? ids.indexOf(beforeId) : -1;
    if (to === -1) ids.push(draggedId);
    else ids.splice(to, 0, draggedId);

    // Optimistic DOM move — instant feedback ahead of the storage round-trip.
    var list = $('#block-list');
    var draggedEntry = renderedBlocks[draggedId];
    if (list && draggedEntry && draggedEntry.node) {
      var beforeEntry = beforeId ? renderedBlocks[beforeId] : null;
      var ref = beforeEntry ? beforeEntry.node : null;
      list.insertBefore(draggedEntry.node, ref);
    }

    var idToOrder = {};
    ids.forEach(function (id, i) { idToOrder[id] = i; });
    trackPending(store.reorderBlocks(state.spaceId, idToOrder));
  }

  // ---- add-block picker ----
  function wireAddBlockButton() {
    $('#btn-add-block').addEventListener('click', function (e) { openBlockPicker(e.currentTarget); });
  }
  function openBlockPicker(anchor) {
    closePopovers();
    var pop = el('div', 'popover picker-pop');
    pop.appendChild(el('div', 'picker-head', 'add a little something'));
    var grid = el('div', 'picker-grid');
    window.CosyBlocks.TYPES.forEach(function (t) {
      var b = el('button', 'picker-item');
      b.innerHTML = '<span class="pi-icon">' + t.icon + '</span><span class="pi-label">' + t.label + '</span><span class="pi-hint">' + t.hint + '</span>';
      b.addEventListener('click', function () {
        addBlock(t.type); closePopovers();
      });
      grid.appendChild(b);
    });
    pop.appendChild(grid);
    placePopover(pop, anchor);
  }
  function addBlock(type) {
    // Guard against a null page_id write (violates the DB not-null
    // constraint) if state is momentarily unsettled — e.g. pages haven't
    // loaded yet after a realtime reconnect.
    var targetPageId = state.currentPageId || homePageId();
    if (!targetPageId) {
      toast('one moment — still loading your corner');
      return;
    }
    var count = state.blocks.filter(function (b) { return b.pageId === targetPageId; }).length;
    trackPending(store.addBlock(state.spaceId, {
      pageId: targetPageId,
      type: type,
      order: count,
      content: window.CosyBlocks.defaultContent(type)
    }));
  }

  // -------------------------------------------------------------------------
  //  Quick switcher (C-5) — Cmd/Ctrl+K or the find-a-page sidebar row
  // -------------------------------------------------------------------------
  var switcherState = { items: [], activeIndex: -1 };

  function isSwitcherOpen() {
    var overlay = $('#switcher-overlay');
    return !!overlay && !overlay.hidden;
  }
  function openSwitcher() {
    if (!state.spaceId) return; // only makes sense once a space is loaded
    closePopovers();
    var overlay = $('#switcher-overlay');
    var input = $('#switcher-input');
    overlay.hidden = false;
    input.value = '';
    renderSwitcherList('');
    input.focus();
  }
  function closeSwitcher() {
    var overlay = $('#switcher-overlay'); if (!overlay) return;
    overlay.hidden = true;
  }
  function switcherBreadcrumbPath(page) {
    var chain = pageAncestors(page);
    return chain.slice(0, -1).map(function (p) { return p.title || 'Untitled'; }).join(' / ');
  }
  function renderSwitcherList(query) {
    var hidden = computeHiddenIds();
    var q = (query || '').trim().toLowerCase();
    var items = state.pages.filter(function (p) { return !hidden[p.id]; });
    if (q) items = items.filter(function (p) { return (p.title || '').toLowerCase().indexOf(q) !== -1; });
    items.sort(function (a, b) { return (a.title || '').localeCompare(b.title || ''); });
    switcherState.items = items;
    switcherState.activeIndex = items.length ? 0 : -1;
    paintSwitcherList();
  }
  function paintSwitcherList() {
    var list = $('#switcher-list'); if (!list) return;
    list.innerHTML = '';
    var input = $('#switcher-input');
    if (!switcherState.items.length) {
      list.appendChild(el('div', 'switcher-empty', 'no pages found'));
      if (input) input.removeAttribute('aria-activedescendant');
      return;
    }
    switcherState.items.forEach(function (p, i) {
      var active = i === switcherState.activeIndex;
      var row = el('div', 'switcher-row' + (active ? ' active' : ''));
      row.id = 'switcher-item-' + i;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', active ? 'true' : 'false');
      row.appendChild(el('span', 'switcher-icon', p.icon || ''));
      var meta = el('div', 'switcher-meta');
      meta.appendChild(el('div', 'switcher-title', p.title || 'Untitled'));
      var path = switcherBreadcrumbPath(p);
      if (path) meta.appendChild(el('div', 'switcher-path', path));
      row.appendChild(meta);
      row.addEventListener('click', function () { navigateTo(p.id); closeSwitcher(); });
      row.addEventListener('mousemove', function () {
        if (switcherState.activeIndex === i) return;
        switcherState.activeIndex = i; paintSwitcherList();
      });
      list.appendChild(row);
    });
    if (input) input.setAttribute('aria-activedescendant', 'switcher-item-' + switcherState.activeIndex);
  }
  function wireSwitcher() {
    var overlay = $('#switcher-overlay');
    var input = $('#switcher-input');
    if (!overlay || !input) return;
    $('.switcher-backdrop', overlay).addEventListener('click', closeSwitcher);
    input.addEventListener('input', function () { renderSwitcherList(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (switcherState.items.length) {
          switcherState.activeIndex = (switcherState.activeIndex + 1) % switcherState.items.length;
          paintSwitcherList();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (switcherState.items.length) {
          switcherState.activeIndex = (switcherState.activeIndex - 1 + switcherState.items.length) % switcherState.items.length;
          paintSwitcherList();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        var item = switcherState.items[switcherState.activeIndex];
        if (item) { navigateTo(item.id); closeSwitcher(); }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeSwitcher();
      }
    });
  }

  // C-5 / C-8: Cmd/Ctrl+K opens the switcher; Escape closes whatever
  // overlay/popover is topmost.
  function wireGlobalKeys() {
    document.addEventListener('keydown', function (e) {
      var k = (e.key || '').toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === 'k') {
        if (!state.spaceId) return;
        e.preventDefault();
        openSwitcher();
        return;
      }
      if (e.key === 'Escape') {
        if (isSwitcherOpen()) { closeSwitcher(); return; }
        closePopovers();
      }
    });
  }

  // -------------------------------------------------------------------------
  //  Theme panel
  // -------------------------------------------------------------------------
  function openThemePanel() {
    closePopovers();
    var panel = $('#theme-panel');
    panel.hidden = false;
    var current = (state.space && state.space.theme) || { preset: 'parchment' };

    var grid = $('#theme-presets'); grid.innerHTML = '';
    Object.keys(window.CosyThemes.PRESETS).forEach(function (key) {
      var preset = window.CosyThemes.PRESETS[key];
      var b = el('button', 'theme-swatch');
      if (current.preset === key) b.classList.add('active');
      b.dataset.key = key;
      var strip = el('div', 'theme-strip');
      ['--bg', '--panel', '--accent', '--ink'].forEach(function (v) {
        var d = el('span'); d.style.background = preset.vars[v]; strip.appendChild(d);
      });
      b.appendChild(strip);
      b.appendChild(el('div', 'theme-label', preset.label));
      b.addEventListener('click', function () {
        var theme = { preset: key, custom: current.custom || null };
        trackPending(store.updateSpace(state.spaceId, { theme: theme }));
        $$('.theme-swatch', grid).forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        current = theme;
      });
      grid.appendChild(b);
    });

    // customiser
    var cust = current.custom || {};
    $('#cust-accent').value = cust.accent || window.CosyThemes.PRESETS[current.preset || 'parchment'].vars['--accent'];
    $('#cust-bg').value = cust.bg || window.CosyThemes.PRESETS[current.preset || 'parchment'].vars['--bg'];
    $('#cust-radius').value = (cust.radius != null) ? cust.radius : 16;
    $('#cust-font').value = cust.font || "'IBM Plex Sans', system-ui, sans-serif";

    function saveCustom() {
      var theme = {
        preset: current.preset || 'parchment',
        custom: {
          accent: $('#cust-accent').value,
          bg: $('#cust-bg').value,
          radius: +$('#cust-radius').value,
          font: $('#cust-font').value
        }
      };
      current = theme;
      trackPending(store.updateSpace(state.spaceId, { theme: theme }));
    }
    ['#cust-accent', '#cust-bg', '#cust-radius', '#cust-font'].forEach(function (s) {
      var node = $(s);
      node.oninput = function () { window.CosyThemes.apply({ preset: current.preset, custom: {
        accent: $('#cust-accent').value, bg: $('#cust-bg').value,
        radius: +$('#cust-radius').value, font: $('#cust-font').value } }); };
      node.onchange = saveCustom;
    });
    $('#cust-reset').onclick = function () {
      var resetTheme = { preset: current.preset || 'parchment', custom: null };
      current = resetTheme;
      trackPending(store.updateSpace(state.spaceId, { theme: resetTheme }));
      window.CosyThemes.apply(resetTheme);
      var basePreset = window.CosyThemes.PRESETS[resetTheme.preset];
      $('#cust-accent').value = basePreset.vars['--accent'];
      $('#cust-bg').value = basePreset.vars['--bg'];
      $('#cust-radius').value = 16;
      $('#cust-font').value = "'IBM Plex Sans', system-ui, sans-serif";
    };
  }
  function wireThemePanel() {
    $('#theme-close').addEventListener('click', function () { $('#theme-panel').hidden = true; });
  }

  // -------------------------------------------------------------------------
  //  Popover helpers
  // -------------------------------------------------------------------------
  function closePopovers() { $$('.popover').forEach(function (p) { p.remove(); }); }
  function placePopover(pop, anchor) {
    // C-8: every popover is a little dialog — give it a role + a label
    // (from the anchor's own label/title when the caller hasn't set one).
    if (!pop.getAttribute('role')) pop.setAttribute('role', 'dialog');
    if (!pop.getAttribute('aria-label')) {
      var fallbackLabel = (anchor.getAttribute && (anchor.getAttribute('aria-label') || anchor.title)) || 'menu';
      pop.setAttribute('aria-label', fallbackLabel);
    }
    document.body.appendChild(pop);
    var r = anchor.getBoundingClientRect();
    var ph = pop.offsetHeight, pw = pop.offsetWidth;
    var top = r.bottom + 8 + window.scrollY;
    var left = r.left + window.scrollX;
    left = Math.min(left, window.innerWidth - pw - 12);
    left = Math.max(12, left);
    // flip above the anchor only when it doesn't fit below AND actually fits above
    if (r.bottom + 8 + ph > window.innerHeight && r.top - ph - 8 >= 8) {
      top = r.top - ph - 8 + window.scrollY;
    }
    // never let the popover poke off the top or bottom of the viewport
    top = Math.max(8 + window.scrollY, Math.min(top, window.scrollY + window.innerHeight - ph - 8));
    pop.style.top = top + 'px'; pop.style.left = left + 'px';
    setTimeout(function () {
      document.addEventListener('mousedown', function handler(e) {
        if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('mousedown', handler); }
      });
    }, 0);
  }

  // -------------------------------------------------------------------------
  //  Toast
  // -------------------------------------------------------------------------
  var toastTimer = null;
  // C-2: backward compatible — existing plain-text callers (toast('msg'))
  // keep working; opts adds an optional action button: { actionLabel,
  // onAction, duration }.
  function toast(msg, opts) {
    opts = opts || {};
    var t = $('#toast');
    t.innerHTML = '';
    t.appendChild(el('span', 'toast-msg', msg));
    if (opts.actionLabel && opts.onAction) {
      var btn = el('button', 'toast-action', opts.actionLabel);
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        clearTimeout(toastTimer);
        t.classList.remove('show');
        opts.onAction();
      });
      t.appendChild(btn);
    }
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, opts.duration || 3200);
  }

  // -------------------------------------------------------------------------
  //  Auto-update (Electron only — window.cosyBridge is absent in a browser
  //  tab). main.js does the actual checking/downloading and just pushes
  //  status events here; this only turns those into cosy toasts.
  // -------------------------------------------------------------------------
  // Whether the last check was asked for from the settings row, so a 'none'
  // result only toasts when someone actually went looking for it — a
  // background check finding nothing shouldn't interrupt anyone.
  var updateManual = false;
  function wireUpdates() {
    if (!(window.cosyBridge && window.cosyBridge.onUpdateStatus)) return;
    var isMac = navigator.platform.toUpperCase().indexOf('MAC') !== -1;
    window.cosyBridge.onUpdateStatus(function (payload) {
      if (!payload) return;
      if (payload.state === 'available') {
        toast('a little update is ready (v' + payload.version + ')', {
          actionLabel: isMac ? 'get it' : 'install',
          duration: 15000,
          onAction: function () {
            window.cosyBridge.updateGet().then(function (r) {
              if (r && r.mode === 'download') toast('downloading the update… ⏳');
            });
          }
        });
      } else if (payload.state === 'ready') {
        toast('update downloaded, it installs when you quit — or', {
          actionLabel: 'restart now',
          duration: 30000,
          onAction: function () { window.cosyBridge.updateInstall(); }
        });
      } else if (payload.state === 'none') {
        if (updateManual) toast('you\'re already on the newest version');
        updateManual = false;
      } else if (payload.state === 'error') {
        if (updateManual) toast('could not check for updates right now');
        updateManual = false;
      }
    });
  }

  // -------------------------------------------------------------------------
  //  Routing
  // -------------------------------------------------------------------------
  function routeAfterAuth() {
    var mySpace = store.getMySpaceId();
    if (mySpace) enterSpace(mySpace);
    else show('onboard');
  }

  function onAuth(user) {
    var previousUid = state.user && state.user.uid;
    state.user = user;
    if (!user) { show('welcome'); return; }
    if (previousUid === user.uid && state.spaceId) return;
    // reflect name on welcome→onboard
    routeAfterAuth();
  }

  // -------------------------------------------------------------------------
  //  Boot
  // -------------------------------------------------------------------------
  // S4 (Round 7): a Cmd-Q mid-typing must not lose keystrokes. blur()-ing the
  // active element flushes any focused contenteditable/input's own blur
  // handler (blocks.js's dirty-checked blur saves, the page-title/space-name
  // blur handlers here) synchronously before the process actually quits.
  // Coordinates with main.js's window-close handling (Agent S5).
  function flushPendingSaves() {
    var active = document.activeElement;
    if (active && typeof active.blur === 'function' && active !== document.body) active.blur();
  }
  function wireQuitFlush() {
    window.addEventListener('beforeunload', flushPendingSaves);
  }

  function boot() {
    wireDiagnostics();
    // labels differ by mode
    if (store.isCloud) {
      setSignInLabel('Continue with Google');
      $('#local-name-row').hidden = true;
      if ($('.welcome-foot')) $('.welcome-foot').textContent = 'Sign in to find your shared corner — or start a new one.';
      $('#screen-welcome').classList.add('cloud');
    } else {
      setSignInLabel('Step inside');
      $('#screen-welcome').classList.add('local');
    }
    // Windows/Linux have no Cmd key — swap the switcher hint to Ctrl+K.
    var isMac = navigator.platform.toUpperCase().indexOf('MAC') !== -1;
    if (!isMac && $('#btn-find-page')) $('#btn-find-page').setAttribute('aria-label', 'find a page (Ctrl+K)');
    // Platform hook for CSS: only macOS uses hiddenInset with the traffic
    // lights inset over the top-left of our own header, so only macOS needs
    // the header's left clearance (see .platform-mac .cosy-header).
    document.documentElement.classList.add(isMac ? 'platform-mac' : 'platform-other');
    showLocalBanner();
    wireBanner();
    wireOnboard();
    wireGenderScreen();
    wireHeader();
    wireSidebar();
    wireSidebarToggle();
    wirePageHead();
    wireAddBlockButton();
    initBlockDnD();
    wireThemePanel();
    wireSwitcher();
    wireGlobalKeys();
    wireSaveChip();
    wireQuitFlush();
    wireUpdates();
    $('#btn-signin').addEventListener('click', signIn);
    if (store.signInEmail) wireEmailAuth();

    // default theme before a space loads
    window.CosyThemes.apply({ preset: 'parchment' });

    store.init().then(function () {
      store.onAuth(onAuth);
    }).catch(function (err) {
      console.error(err); toast('Startup hiccup: ' + err.message);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // expose a tiny hook for the smoke test / debugging
  window.__cosy = {
    state: state, addBlock: addBlock, navigateTo: navigateTo, store: store,
    renderedBlocks: renderedBlocks, pendingBlocks: pendingBlocks,
    // Round 4 additions, handy for headless E2E assertions:
    trashPage: trashPage, computeHiddenIds: computeHiddenIds,
    pageHasUnread: pageHasUnread, bumpLastSeen: bumpLastSeen,
    openSwitcher: openSwitcher, closeSwitcher: closeSwitcher,
    isSwitcherOpen: isSwitcherOpen, switcherState: switcherState,
    openSettingsPopover: openSettingsPopover, exportSpace: exportSpace,
    pendingCount: function () { return pendingCount; },
    // Round 6 additions, handy for headless E2E assertions:
    pronounsFor: pronounsFor, KNOWN_DEFAULT_TITLES: KNOWN_DEFAULT_TITLES,
    showGenderStep: showGenderStep, pickGender: pickGender, skipGender: skipGender,
    isGenderAsked: isGenderAsked,
    // Round 7 (S4) additions, handy for headless E2E assertions:
    trackPending: trackPending, saveHadError: function () { return saveHadError; },
    diagLog: diagLog, copyDiagnostics: copyDiagnostics, reportMutationError: reportMutationError,
    updateConnectionChip: updateConnectionChip, doLeaveSpace: doLeaveSpace,
    flushPendingSaves: flushPendingSaves
  };
})();
