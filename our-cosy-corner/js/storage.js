/*
 * storage.js — the ONE storage abstraction the UI talks to.
 *
 * window.CosyStore exposes the same async API whether we are running:
 *   - LOCAL MODE  : everything in localStorage, instant pub/sub (no account)
 *   - CLOUD MODE  : Supabase Auth + Postgres, real-time via Supabase's
 *                   postgres_changes channels. Small photos are still
 *                   compressed client-side to data URLs and stored right on
 *                   the block row (unchanged); bigger files/pdfs go through
 *                   real Supabase Storage (bucket 'cosy-files').
 *
 * UI code (app.js, blocks.js) never checks the mode — it just awaits these.
 */
(function () {
  'use strict';

  var MODE_LOCAL = 'local';
  var MODE_CLOUD = 'cloud';

  // -------------------------------------------------------------------------
  // Small helpers
  // -------------------------------------------------------------------------
  function uid6() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing 0/O/1/I
    var s = '';
    for (var i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }
  function genId(p) {
    return (p || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }
  function nowTs() { return Date.now(); }

  // Default title for the shared/home page, by corner category — used by
  // BOTH stores' createSpace so a brand new family corner opens on "Our
  // family plans" instead of the couple-flavoured "Our shared plans".
  function sharedTitleFor(kind) { return kind === 'family' ? 'Our family plans' : 'Our shared plans'; }

  // -------------------------------------------------------------------------
  // Image compression -> base64 data URL. Shared by LOCAL and CLOUD modes:
  // photos are never uploaded to Storage, they're compressed client-side and
  // stored directly in the block document (localStorage in local mode,
  // Firestore in cloud mode — which caps documents at 1MB).
  // -------------------------------------------------------------------------
  var MAX_DATA_URL_CHARS = 650 * 1024; // keep comfortably under Firestore's 1MB doc cap

  function readAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }
  function loadImageEl(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Could not read that image')); };
      img.src = src;
    });
  }
  function drawToDataUrl(img, maxSide, quality) {
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    var scale = Math.min(1, maxSide / Math.max(w, h));
    var cw = Math.max(1, Math.round(w * scale));
    var ch = Math.max(1, Math.round(h * scale));
    var canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    canvas.getContext('2d').drawImage(img, 0, 0, cw, ch);
    return canvas.toDataURL('image/jpeg', quality);
  }
  // Compress an <input type=file> image (or pasted File/Blob) down to a data
  // URL that safely fits in a Firestore document. Rejects with a friendly
  // message if it just can't get small enough.
  function compressImageFile(file) {
    return readAsDataUrl(file).then(function (rawDataUrl) {
      return loadImageEl(rawDataUrl).then(function (img) {
        var out = drawToDataUrl(img, 1000, 0.8);
        if (out.length > MAX_DATA_URL_CHARS) out = drawToDataUrl(img, 800, 0.65);
        if (out.length > MAX_DATA_URL_CHARS) {
          throw new Error('that photo is too big, try a smaller one');
        }
        return out;
      });
    });
  }

  // -------------------------------------------------------------------------
  // File sync (pdf/file blocks): chunked storage helpers shared by BOTH
  // stores. A file's raw bytes are sliced into <=600KB pieces (base64 of a
  // 600KB slice is ~800KB — safely under Firestore's 1MB doc cap) and each
  // piece is base64-encoded in ~32KB sub-slices so we never hand
  // String.fromCharCode.apply() a megabyte-sized arguments list (that blows
  // the call stack / argument-count limit on some engines).
  // -------------------------------------------------------------------------
  var FILE_CHUNK_RAW_BYTES = 600 * 1024;   // raw bytes per chunk doc
  var B64_SLICE = 32 * 1024;               // sub-slice size while stringifying

  function bytesToBase64(bytes) {
    var parts = [];
    for (var i = 0; i < bytes.length; i += B64_SLICE) {
      var slice = bytes.subarray(i, i + B64_SLICE);
      parts.push(String.fromCharCode.apply(null, slice));
    }
    return btoa(parts.join(''));
  }
  function base64ToBytes(b64) {
    var byteStr = atob(b64 || '');
    var out = new Uint8Array(byteStr.length);
    for (var i = 0; i < byteStr.length; i++) out[i] = byteStr.charCodeAt(i);
    return out;
  }
  // Concatenates same-order Uint8Arrays into one.
  function concatBytes(arrs, totalLen) {
    var out = new Uint8Array(totalLen);
    var offset = 0;
    arrs.forEach(function (a) { out.set(a, offset); offset += a.length; });
    return out;
  }

  // -------------------------------------------------------------------------
  // Pages: shared migration + tree helpers, used by BOTH stores so the two
  // implementations can never drift apart. Each store only supplies the
  // small "how do I read/write one thing" primitives (ctx); the actual
  // decide-what-to-do logic lives here, once.
  // -------------------------------------------------------------------------

  // Every page + all of its descendants (by parentId), root included.
  function collectDescendantIds(pagesArr, rootId) {
    var byParent = {};
    pagesArr.forEach(function (p) {
      var pid = p.parentId || null;
      (byParent[pid] = byParent[pid] || []).push(p.id);
    });
    var result = [rootId];
    var queue = [rootId];
    while (queue.length) {
      var cur = queue.shift();
      (byParent[cur] || []).forEach(function (childId) {
        result.push(childId);
        queue.push(childId);
      });
    }
    return result;
  }

  // ctx = {
  //   space, user,
  //   listPages()  -> Promise<pageDoc[]>       (docs have .id)
  //   listBlocks() -> Promise<blockDoc[]>       (docs have .id)
  //   createPage(draftWithoutId) -> Promise<pageDocWithId>
  //   patchPage(id, patch) -> Promise
  //   patchBlock(id, patch) -> Promise
  // }
  function ensurePagesCommon(ctx) {
    return ctx.listPages().then(function (pages) {
      var space = ctx.space || {};
      var user = ctx.user || null;
      var members = space.members || (user ? [user.uid] : []);
      var profiles = space.memberProfiles || {};
      var sectionNames = space.sectionNames || {};
      var home = pages.filter(function (p) { return p.kind === 'home'; })[0];

      function nameFor(uid) {
        var p = profiles[uid];
        return (p && p.name) || 'Their';
      }
      function personalTitle(uid, key) {
        if (sectionNames[key]) return sectionNames[key];
        // Just the person's name — every member reads the same list, and a
        // per-member sidebar zone already frames it as "<name>'s space", so a
        // bare name reads cleaner than "<name>'s dashboard".
        return nameFor(uid);
      }
      function nextOrder() { return pages.length; }

      function ensureHome() {
        if (home) return Promise.resolve();
        var draft = {
          title: sectionNames.shared || 'Our shared plans',
          icon: '', parentId: null, kind: 'home', ownerUid: 'shared', order: 0
        };
        return ctx.createPage(draft).then(function (created) {
          home = created; pages.push(created);
        });
      }

      function ensurePersonalPages() {
        var meUid = user && user.uid;
        var isCouple = (space.kind || 'couple') === 'couple';
        var tasks = [];

        // Which uids get their personal dashboard page ensured THIS run:
        //  - couple: every current member — exact legacy behaviour, so a
        //    fresh joiner gets the waiting 'partner-slot' page re-assigned
        //    (or a brand new page created if somehow there's no slot).
        //  - friends/family: ONLY the caller's own uid. A group corner never
        //    pre-seeds a placeholder for anyone else — each member's page is
        //    created the first time THEY themselves run ensurePages.
        var uidsToEnsure = isCouple ? members : (meUid ? [meUid] : []);

        uidsToEnsure.forEach(function (uid) {
          var personal = pages.filter(function (p) { return p.kind === 'personal'; });
          var existing = personal.filter(function (p) { return p.ownerUid === uid; })[0];
          if (existing) return; // this member already has a dashboard

          var slot = personal.filter(function (p) { return p.ownerUid === 'partner-slot'; })[0];
          if (slot) {
            // partner just joined (or a legacy couple space still has the
            // placeholder): re-assign it to them, keep everything else
            // (title, icon, content) untouched.
            tasks.push(function () {
              return ctx.patchPage(slot.id, { ownerUid: uid }).then(function () {
                slot.ownerUid = uid;
              });
            });
          } else {
            var key = (uid === meUid) ? 'mine' : 'partner';
            var icon = '';
            tasks.push(function () {
              var draft = {
                title: personalTitle(uid, key), icon: icon,
                parentId: null, kind: 'personal', ownerUid: uid, order: nextOrder()
              };
              return ctx.createPage(draft).then(function (created) { pages.push(created); });
            });
          }
        });

        // Couple-only: solo space so far gets a placeholder page to grow
        // into once the partner joins (ensurePages re-assigns ownerUid
        // above, later). Friends/family spaces never seed this — a group's
        // other members simply don't have a page until they show up.
        if (isCouple) {
          tasks.push(function () {
            var personal = pages.filter(function (p) { return p.kind === 'personal'; });
            var hasSlot = personal.some(function (p) { return p.ownerUid === 'partner-slot'; });
            if (members.length > 1 || hasSlot) return Promise.resolve();
            var draft = {
              title: sectionNames.partner || "Partner's dashboard",
              icon: '', parentId: null, kind: 'personal', ownerUid: 'partner-slot', order: nextOrder()
            };
            return ctx.createPage(draft).then(function (created) { pages.push(created); });
          });
        }

        return tasks.reduce(function (p, task) { return p.then(task); }, Promise.resolve());
      }

      function patchStrayBlocks() {
        return ctx.listBlocks().then(function (blocks) {
          var ownerMap = {};
          pages.forEach(function (p) {
            if (p.kind === 'home') ownerMap.shared = p.id;
            else if (p.kind === 'personal') ownerMap[p.ownerUid] = p.id;
          });
          var stray = blocks.filter(function (b) { return !b.pageId && b.section; });
          return stray.reduce(function (p, b) {
            var pid = ownerMap[b.section] || ownerMap.shared;
            if (!pid) return p;
            return p.then(function () { return ctx.patchBlock(b.id, { pageId: pid }); });
          }, Promise.resolve());
        });
      }

      return ensureHome().then(ensurePersonalPages).then(patchStrayBlocks).then(function () {
        pages.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
        return pages;
      });
    });
  }

  // -------------------------------------------------------------------------
  // Invites lookup collection (contract C2): a durable `invites/{CODE} ->
  // spaceId` mapping so joinSpace never has to scan/list every space (which
  // members-only read rules forbid for non-members). Shared back-fill logic
  // so both stores stay in lockstep:
  //   - createSpace writes the mapping right after the space doc.
  //   - ensurePages (called on every space load, by every member) back-fills
  //     it for spaces created before this feature existed.
  // ctx = {
  //   code, spaceId,
  //   getInvite() -> Promise<existingSpaceId|null>,
  //   createInvite() -> Promise
  // }
  // -------------------------------------------------------------------------
  function backfillInviteCommon(ctx) {
    if (!ctx.code) return Promise.resolve();
    return ctx.getInvite().then(function (existingSpaceId) {
      if (existingSpaceId === ctx.spaceId) return; // already correct, nothing to do
      if (existingSpaceId) {
        // Never clobber a code that (somehow) points at a different space —
        // that would let a stale/duplicate code silently redirect joiners.
        console.warn('[CosyStore] invite code ' + ctx.code + ' already maps to a ' +
          'different space (' + existingSpaceId + '); skipping back-fill for ' + ctx.spaceId);
        return;
      }
      return ctx.createInvite();
    });
  }

  // -------------------------------------------------------------------------
  // Import (reverse of contract C1's exportSpace): rebuilds a brand new space
  // from an "export our corner" JSON dump — used by the "restore a corner
  // from a backup file" onboard flow. Always creates a NEW space with a NEW
  // invite code (never overwrites/reuses anything), so restoring is
  // non-destructive. Shared by BOTH stores so they can never drift apart —
  // ctx supplies each store's own create/add/update primitives (the very
  // same ones addPage/addBlock/updateSpace/updatePage/createSpace already
  // are); the actual "what order to do things in" logic lives here once.
  // ctx = {
  //   createSpace(name) -> Promise<spaceDoc>          (doc has .id)
  //   updateSpace(spaceId, patch) -> Promise
  //   addPage(spaceId, pageDraft) -> Promise<newPageId>
  //   updatePage(spaceId, pageId, patch) -> Promise
  //   addBlock(spaceId, blockDraft) -> Promise<newBlockId>
  //   setMySpaceId(id)
  // }
  // -------------------------------------------------------------------------
  function importSpaceCommon(data, ctx) {
    if (!(data && data.space && Array.isArray(data.pages) && Array.isArray(data.blocks))) {
      return Promise.reject(new Error("that file doesn't look like a cosy corner backup"));
    }

    var oldPages = data.pages;
    var oldBlocks = data.blocks;
    var newId = null;
    var idMap = {}; // old page id -> new page id

    return ctx.createSpace(data.space.name || 'Our Cosy Corner', data.space.kind || 'couple', data.space.capacity || 2).then(function (space) {
      newId = space.id;
      var patch = {};
      if (data.space.sectionNames) patch.sectionNames = data.space.sectionNames;
      if (data.space.theme !== undefined) patch.theme = data.space.theme;
      if (Object.keys(patch).length) return ctx.updateSpace(newId, patch);
    }).then(function () {
      // Dedup protected kinds BEFORE creating anything — the DB's partial
      // unique indexes (one 'home' per space, one 'personal' per ownerUid)
      // count trashed pages too, so this has to run over the whole backup,
      // not just the non-trashed pages. Only the first 'home' page and the
      // first 'personal' page per ownerUid keep their protected kind; any
      // extras become plain pages.
      var seenHome = false;
      var seenOwners = {};
      var draftKinds = oldPages.map(function (p) {
        if (p.kind === 'home') {
          if (seenHome) return 'page';
          seenHome = true; return 'home';
        }
        if (p.kind === 'personal') {
          if (seenOwners[p.ownerUid]) return 'page';
          seenOwners[p.ownerUid] = true; return 'personal';
        }
        return p.kind;
      });

      // Pass 1: create every page flat (parentId null), remembering
      // oldId->newId. Sequential (promise chain), not Promise.all, so order
      // is preserved and we're gentle on any rate limits.
      return oldPages.reduce(function (chain, p, i) {
        return chain.then(function () {
          var draft = {
            title: p.title, icon: p.icon, parentId: null, kind: draftKinds[i],
            ownerUid: p.ownerUid, order: p.order
          };
          return ctx.addPage(newId, draft).then(function (newPageId) {
            idMap[p.id] = newPageId;
            if (p.trashed) {
              return ctx.updatePage(newId, newPageId, { trashed: true, trashedAt: p.trashedAt || nowTs() });
            }
          });
        });
      }, Promise.resolve());
    }).then(function () {
      // Pass 2: re-parent pages whose old parent also got imported.
      return oldPages.reduce(function (chain, p) {
        if (!p.parentId || !idMap[p.parentId] || !idMap[p.id]) return chain;
        return chain.then(function () {
          return ctx.updatePage(newId, idMap[p.id], { parentId: idMap[p.parentId] });
        });
      }, Promise.resolve());
    }).then(function () {
      // Orphan blocks (missing/unmapped pageId) land on the new home page,
      // or the first created page if somehow no home page exists.
      var homeOld = oldPages.filter(function (p) { return p.kind === 'home'; })[0];
      var fallbackPageId = (homeOld && idMap[homeOld.id]) ||
        (oldPages[0] && idMap[oldPages[0].id]) || null;

      return oldBlocks.reduce(function (chain, b) {
        return chain.then(function () {
          var pageId = idMap[b.pageId] || fallbackPageId;
          if (!pageId) return; // no pages at all to attach this block to
          var draft = { pageId: pageId, type: b.type, content: b.content, width: b.width, order: b.order };
          return ctx.addBlock(newId, draft);
        });
      }, Promise.resolve());
    }).then(function () {
      ctx.setMySpaceId(newId);
      return newId;
    });
  }

  // Both stores' importSpace method is a one-liner that hands `this` (the
  // store instance, since it's always invoked as store.importSpace(data))
  // to importSpaceCommon wrapped in a ctx that just calls the store's own
  // already-existing methods — keeps the two stores from ever drifting.
  function importSpaceViaSelf(self, data) {
    return importSpaceCommon(data, {
      createSpace: function (name, kind, capacity) { return self.createSpace(name, kind, capacity); },
      updateSpace: function (spaceId, patch) { return self.updateSpace(spaceId, patch); },
      addPage: function (spaceId, page) { return self.addPage(spaceId, page); },
      updatePage: function (spaceId, id, patch) { return self.updatePage(spaceId, id, patch); },
      addBlock: function (spaceId, block) { return self.addBlock(spaceId, block); },
      setMySpaceId: function (id) { self.setMySpaceId(id); }
    });
  }

  // =========================================================================
  //  LOCAL IMPLEMENTATION
  // =========================================================================
  function LocalStore() {
    var LS = window.localStorage;
    var KEY_USER = 'cosy.localUser';
    var KEY_SPACES = 'cosy.spaces';       // { spaceId: spaceDoc }
    var KEY_BLOCKS = 'cosy.blocks';       // { spaceId: { blockId: block } }
    var KEY_PAGES = 'cosy.pages';         // { spaceId: { pageId: pageDoc } }
    var KEY_FILES = 'cosy.files';         // { fileId: { name, size, data(base64) } }
    var KEY_INVITES = 'cosy.invites';     // { CODE: spaceId }
    var KEY_MYSPACE = 'cosy.mySpaceId';
    var listeners = { space: {}, blocks: {}, pages: {} };
    var authCbs = [];

    function read(k, def) { try { return JSON.parse(LS.getItem(k)) || def; } catch (e) { return def; } }
    // ROUND 7 [F5.1]: don't silently swallow a full-disk/quota failure — tag
    // it so the UI (app.js) can surface a friendly "storage full" message
    // instead of the write just quietly not happening. Normal writes are
    // completely unchanged.
    function write(k, v) {
      try {
        LS.setItem(k, JSON.stringify(v));
      } catch (err) {
        if (err && (err.name === 'QuotaExceededError' || err.code === 22)) {
          var e = new Error('this computer\'s storage is full — free up some space, or connect the cloud to keep syncing');
          e.cosyCode = 'cosy-quota';
          throw e;
        }
        throw err;
      }
    }

    // Legacy local spaces (created before kind/capacity existed) simply lack
    // those keys on disk — default them here, once, on every read, so local
    // mode carries the same shape CloudStore's spaceShape() guarantees.
    function withSpaceDefaults(doc) {
      if (!doc) return doc;
      if (doc.kind == null) doc.kind = 'couple';
      if (doc.capacity == null) doc.capacity = 2;
      return doc;
    }
    function emitSpace(spaceId) {
      var doc = withSpaceDefaults(read(KEY_SPACES, {})[spaceId] || null);
      (listeners.space[spaceId] || []).forEach(function (cb) { cb(doc); });
    }
    function emitBlocks(spaceId) {
      var all = read(KEY_BLOCKS, {})[spaceId] || {};
      var arr = Object.keys(all).map(function (id) { return all[id]; });
      arr.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      (listeners.blocks[spaceId] || []).forEach(function (cb) { cb(arr.slice()); });
    }
    function emitPages(spaceId) {
      var all = read(KEY_PAGES, {})[spaceId] || {};
      var arr = Object.keys(all).map(function (id) { return all[id]; });
      arr.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      (listeners.pages[spaceId] || []).forEach(function (cb) { cb(arr.slice()); });
    }

    return {
      mode: MODE_LOCAL,
      init: function () { return Promise.resolve(); },

      // ---- auth ----
      onAuth: function (cb) {
        authCbs.push(cb);
        cb(read(KEY_USER, null));
        return function () { authCbs = authCbs.filter(function (f) { return f !== cb; }); };
      },
      currentUser: function () { return read(KEY_USER, null); },
      signIn: function (displayName) {
        var user = read(KEY_USER, null);
        if (!user) {
          user = { uid: 'local_' + genId('u'), name: displayName || 'You',
                   photo: '', email: 'you@this-computer' };
          write(KEY_USER, user);
        }
        authCbs.forEach(function (cb) { cb(user); });
        return Promise.resolve(user);
      },
      signOut: function () {
        LS.removeItem(KEY_MYSPACE);
        authCbs.forEach(function (cb) { cb(read(KEY_USER, null)); });
        return Promise.resolve();
      },

      // ROUND 7: LocalStore is always synchronous/single-Mac — there's no
      // real network connection to lose, so this just reports 'online' once
      // (matching CloudStore's "fire immediately" contract) and hands back a
      // no-op unsubscribe.
      onConnectionState: function (cb) {
        cb('online');
        return function () {};
      },

      // ---- spaces ----
      getMySpaceId: function () { return LS.getItem(KEY_MYSPACE); },
      setMySpaceId: function (id) { if (id) LS.setItem(KEY_MYSPACE, id); else LS.removeItem(KEY_MYSPACE); },

      // ROUND 7 (Security §5): real leave, mirroring CloudStore's shape —
      // single-Mac mode has no separate "membership" to revoke server-side,
      // so this just clears the local "current space" pointer (the space
      // still exists in KEY_SPACES / listMySpaces, same as CloudStore leaves
      // the underlying row/other member untouched).
      leaveSpace: function (spaceId) {
        LS.removeItem(KEY_MYSPACE);
        return Promise.resolve();
      },

      createSpace: function (name, kind, capacity) {
        var user = read(KEY_USER, null);
        var id = genId('space');
        var doc = {
          id: id,
          name: name || 'Our Cosy Corner',
          members: [user.uid],
          memberProfiles: {},
          sectionNames: { shared: sharedTitleFor(kind) },
          theme: null,
          kind: kind || 'couple',
          capacity: capacity || 2,
          inviteCode: uid6(),
          createdAt: nowTs()
        };
        doc.memberProfiles[user.uid] = { name: user.name, photo: user.photo || '', mood: '' };
        var spaces = read(KEY_SPACES, {}); spaces[id] = doc; write(KEY_SPACES, spaces);
        var blocks = read(KEY_BLOCKS, {}); blocks[id] = {}; write(KEY_BLOCKS, blocks);
        var invites = read(KEY_INVITES, {}); invites[doc.inviteCode] = id; write(KEY_INVITES, invites);
        LS.setItem(KEY_MYSPACE, id);
        return Promise.resolve(doc);
      },
      joinSpace: function (code) {
        var normalizedCode = String(code || '').toUpperCase();
        var spaces = read(KEY_SPACES, {});
        var invites = read(KEY_INVITES, {});
        var found = invites[normalizedCode] ? spaces[invites[normalizedCode]] : null;
        if (!found) {
          // Legacy fallback for spaces created before the invites map existed
          // (or if it was somehow cleared) — scan every space's inviteCode.
          Object.keys(spaces).forEach(function (id) {
            if (spaces[id].inviteCode === normalizedCode) found = spaces[id];
          });
        }
        if (!found) return Promise.reject(new Error('No cosy corner found for that code on this computer. In local mode everyone shares one computer — connect the cloud to join from your own.'));
        withSpaceDefaults(found);
        var user = read(KEY_USER, null);
        if (found.members.indexOf(user.uid) === -1) {
          if (found.members.length >= (found.capacity || 2)) return Promise.reject(new Error('This corner is already full.'));
          found.members.push(user.uid);
        }
        if (!found.memberProfiles[user.uid]) found.memberProfiles[user.uid] = { name: user.name, photo: user.photo || '', mood: '' };
        spaces[found.id] = found; write(KEY_SPACES, spaces);
        LS.setItem(KEY_MYSPACE, found.id);
        emitSpace(found.id);
        return Promise.resolve(found);
      },
      subscribeSpace: function (spaceId, cb) {
        (listeners.space[spaceId] = listeners.space[spaceId] || []).push(cb);
        emitSpace(spaceId);
        return function () {
          listeners.space[spaceId] = (listeners.space[spaceId] || []).filter(function (f) { return f !== cb; });
        };
      },
      updateSpace: function (spaceId, patch) {
        var spaces = read(KEY_SPACES, {});
        if (!spaces[spaceId]) return Promise.reject(new Error('Space gone'));
        Object.keys(patch).forEach(function (k) { spaces[spaceId][k] = patch[k]; });
        write(KEY_SPACES, spaces); emitSpace(spaceId);
        return Promise.resolve();
      },
      updateMemberProfile: function (spaceId, memberUid, patch) {
        var spaces = read(KEY_SPACES, {});
        var doc = spaces[spaceId]; if (!doc) return Promise.resolve();
        doc.memberProfiles = doc.memberProfiles || {};
        doc.memberProfiles[memberUid] = Object.assign({}, doc.memberProfiles[memberUid], patch);
        write(KEY_SPACES, spaces); emitSpace(spaceId);
        return Promise.resolve();
      },

      // ---- blocks ----
      subscribeBlocks: function (spaceId, cb) {
        (listeners.blocks[spaceId] = listeners.blocks[spaceId] || []).push(cb);
        emitBlocks(spaceId);
        return function () {
          listeners.blocks[spaceId] = (listeners.blocks[spaceId] || []).filter(function (f) { return f !== cb; });
        };
      },
      addBlock: function (spaceId, block) {
        var blocks = read(KEY_BLOCKS, {});
        blocks[spaceId] = blocks[spaceId] || {};
        var id = genId('b');
        block.id = id; block.updatedAt = nowTs();
        blocks[spaceId][id] = block; write(KEY_BLOCKS, blocks); emitBlocks(spaceId);
        return Promise.resolve(id);
      },
      updateBlock: function (spaceId, id, patch) {
        var blocks = read(KEY_BLOCKS, {});
        if (!blocks[spaceId] || !blocks[spaceId][id]) return Promise.resolve();
        Object.keys(patch).forEach(function (k) { blocks[spaceId][id][k] = patch[k]; });
        blocks[spaceId][id].updatedAt = nowTs();
        write(KEY_BLOCKS, blocks); emitBlocks(spaceId);
        return Promise.resolve();
      },
      deleteBlock: function (spaceId, id) {
        var blocks = read(KEY_BLOCKS, {});
        if (blocks[spaceId]) { delete blocks[spaceId][id]; write(KEY_BLOCKS, blocks); emitBlocks(spaceId); }
        return Promise.resolve();
      },
      reorderBlocks: function (spaceId, idToOrder) {
        var blocks = read(KEY_BLOCKS, {});
        if (!blocks[spaceId]) return Promise.resolve();
        Object.keys(idToOrder).forEach(function (id) {
          if (blocks[spaceId][id]) blocks[spaceId][id].order = idToOrder[id];
        });
        write(KEY_BLOCKS, blocks); emitBlocks(spaceId);
        return Promise.resolve();
      },

      // ---- pages ----
      subscribePages: function (spaceId, cb) {
        (listeners.pages[spaceId] = listeners.pages[spaceId] || []).push(cb);
        emitPages(spaceId);
        return function () {
          listeners.pages[spaceId] = (listeners.pages[spaceId] || []).filter(function (f) { return f !== cb; });
        };
      },
      addPage: function (spaceId, page) {
        var pages = read(KEY_PAGES, {});
        pages[spaceId] = pages[spaceId] || {};
        var id = genId('page');
        var doc = Object.assign({}, page, { id: id, createdAt: nowTs(), updatedAt: nowTs() });
        pages[spaceId][id] = doc; write(KEY_PAGES, pages); emitPages(spaceId);
        return Promise.resolve(id);
      },
      updatePage: function (spaceId, id, patch) {
        var pages = read(KEY_PAGES, {});
        if (!pages[spaceId] || !pages[spaceId][id]) return Promise.resolve();
        Object.keys(patch).forEach(function (k) { pages[spaceId][id][k] = patch[k]; });
        pages[spaceId][id].updatedAt = nowTs();
        write(KEY_PAGES, pages); emitPages(spaceId);
        return Promise.resolve();
      },
      // Deletes this page, every descendant page, and every block that lived
      // on any of them.
      deletePage: function (spaceId, id) {
        var pages = read(KEY_PAGES, {});
        var mine = pages[spaceId] || {};
        var arr = Object.keys(mine).map(function (k) { return mine[k]; });
        var toDelete = collectDescendantIds(arr, id);
        toDelete.forEach(function (pid) { delete mine[pid]; });
        pages[spaceId] = mine; write(KEY_PAGES, pages); emitPages(spaceId);

        var blocks = read(KEY_BLOCKS, {});
        var myBlocks = blocks[spaceId] || {};
        Object.keys(myBlocks).forEach(function (bid) {
          if (toDelete.indexOf(myBlocks[bid].pageId) !== -1) delete myBlocks[bid];
        });
        blocks[spaceId] = myBlocks; write(KEY_BLOCKS, blocks); emitBlocks(spaceId);
        return Promise.resolve();
      },
      // Migration: creates home + personal pages the first time, keeps them
      // topped up (new members, re-assigning the partner-slot page) every
      // time after. Also back-fills pageId on any block still using the old
      // `section` field. Safe to call on every space load.
      ensurePages: function (spaceId, space, user) {
        return ensurePagesCommon({
          space: space, user: user,
          listPages: function () {
            var all = read(KEY_PAGES, {})[spaceId] || {};
            return Promise.resolve(Object.keys(all).map(function (id) { return all[id]; }));
          },
          listBlocks: function () {
            var all = read(KEY_BLOCKS, {})[spaceId] || {};
            return Promise.resolve(Object.keys(all).map(function (id) { return all[id]; }));
          },
          createPage: function (draft) {
            var pages = read(KEY_PAGES, {});
            pages[spaceId] = pages[spaceId] || {};
            var id = genId('page');
            var doc = Object.assign({}, draft, { id: id, createdAt: nowTs(), updatedAt: nowTs() });
            pages[spaceId][id] = doc; write(KEY_PAGES, pages); emitPages(spaceId);
            return Promise.resolve(doc);
          },
          patchPage: function (id, patch) {
            var pages = read(KEY_PAGES, {});
            if (!pages[spaceId] || !pages[spaceId][id]) return Promise.resolve();
            Object.keys(patch).forEach(function (k) { pages[spaceId][id][k] = patch[k]; });
            pages[spaceId][id].updatedAt = nowTs();
            write(KEY_PAGES, pages); emitPages(spaceId);
            return Promise.resolve();
          },
          patchBlock: function (id, patch) {
            var blocks = read(KEY_BLOCKS, {});
            if (!blocks[spaceId] || !blocks[spaceId][id]) return Promise.resolve();
            Object.keys(patch).forEach(function (k) { blocks[spaceId][id][k] = patch[k]; });
            write(KEY_BLOCKS, blocks); emitBlocks(spaceId);
            return Promise.resolve();
          }
        }).then(function (pages) {
          // Back-fill the invites map for spaces created before it existed
          // (contract C2) — idempotent, safe to run on every load.
          return backfillInviteCommon({
            code: space && space.inviteCode,
            spaceId: spaceId,
            getInvite: function () {
              var invites = read(KEY_INVITES, {});
              return Promise.resolve(invites[space.inviteCode] || null);
            },
            createInvite: function () {
              var invites = read(KEY_INVITES, {});
              invites[space.inviteCode] = spaceId;
              write(KEY_INVITES, invites);
              return Promise.resolve();
            }
          }).then(function () { return pages; });
        });
      },

      // ---- images ----
      uploadImage: function (spaceId, file) {
        return compressImageFile(file); // base64 data URL
      },

      // ---- files (pdf/file blocks) ----
      // Single-Mac mode: everything lives in one localStorage key, base64
      // encoded. This also doubles as the "cloud" for headless/local-mode
      // testing of the partner-sync flow (see storage.js callers in blocks.js
      // — they always go through this same API regardless of mode).
      uploadFileData: function (spaceId, name, bytes, onProgress) {
        var LOCAL_FILE_MAX = 4 * 1024 * 1024;
        if (!bytes || bytes.length > LOCAL_FILE_MAX) {
          return Promise.reject(new Error('that file is a bit too big for local mode — connect the cloud to share bigger ones'));
        }
        var fileId = genId('file');
        var data = bytesToBase64(bytes);
        var files = read(KEY_FILES, {});
        files[fileId] = { name: name, size: bytes.length, data: data };
        write(KEY_FILES, files);
        if (onProgress) onProgress(1, 1);
        return Promise.resolve({ fileId: fileId, size: bytes.length });
      },
      downloadFileData: function (spaceId, fileId, onProgress) {
        var files = read(KEY_FILES, {});
        var f = files[fileId];
        if (!f) return Promise.reject(new Error('file not found'));
        if (onProgress) onProgress(1, 1);
        return Promise.resolve({ name: f.name, bytes: base64ToBytes(f.data) });
      },
      deleteFileData: function (spaceId, fileId) {
        var files = read(KEY_FILES, {});
        if (files[fileId]) { delete files[fileId]; write(KEY_FILES, files); }
        return Promise.resolve();
      },

      // ---- recent corners (onboard "welcome back" list) ----
      // A user remains a member of a space even after just clearing their
      // local "current space" pointer (see leaveSpace in app.js) — so this
      // lets the onboard screen offer it back without re-keying the invite
      // code. Sorted newest-first, client-side (mirrors CloudStore, which
      // can't do a where+orderBy without a composite index).
      listMySpaces: function () {
        var user = read(KEY_USER, null);
        var uid = user && user.uid;
        if (!uid) return Promise.resolve([]);
        var spaces = read(KEY_SPACES, {});
        var arr = Object.keys(spaces).map(function (id) { return spaces[id]; })
          .filter(function (s) { return (s.members || []).indexOf(uid) !== -1; })
          .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
        return Promise.resolve(arr.map(function (s) {
          return { id: s.id, name: s.name, inviteCode: s.inviteCode, memberCount: (s.members || []).length, capacity: s.capacity || 2 };
        }));
      },

      // ---- export (contract C1) ----
      // Full raw dump for the "export our corner" button — no normalization,
      // docs are handed back exactly as stored (already id-injected) so the
      // JSON round-trips. Files are metadata only (no base64 bytes): local
      // file storage (KEY_FILES) isn't itself keyed by spaceId, so the set of
      // fileIds "in" this space is derived from the fileId a block actually
      // references (pdf/file/image blocks all store content.fileId).
      exportSpace: function (spaceId) {
        var space = withSpaceDefaults(read(KEY_SPACES, {})[spaceId] || null);
        var pagesMap = read(KEY_PAGES, {})[spaceId] || {};
        var pages = Object.keys(pagesMap).map(function (id) { return pagesMap[id]; });
        var blocksMap = read(KEY_BLOCKS, {})[spaceId] || {};
        var blocks = Object.keys(blocksMap).map(function (id) { return blocksMap[id]; });
        var filesStore = read(KEY_FILES, {});
        var seenFileIds = {};
        var files = [];
        blocks.forEach(function (b) {
          var fileId = b.content && b.content.fileId;
          if (!fileId || seenFileIds[fileId] || !filesStore[fileId]) return;
          seenFileIds[fileId] = true;
          files.push({ fileId: fileId, name: filesStore[fileId].name, size: filesStore[fileId].size });
        });
        return Promise.resolve({ space: space, pages: pages, blocks: blocks, files: files });
      },

      // ---- import (restore from an export-our-corner backup file) ----
      importSpace: function (data) {
        return importSpaceViaSelf(this, data);
      }
    };
  }

  // =========================================================================
  //  CLOUD IMPLEMENTATION (Supabase JS v2 — loaded via <script> tag as the
  //  UMD global `window.supabase`). Auth = Supabase Auth (Google OAuth via a
  //  system-browser loopback, see signIn() below). Data = Postgres tables
  //  (spaces/invites/pages/blocks/files) with Realtime subscriptions standing
  //  in for Firestore's onSnapshot. Files = Supabase Storage bucket
  //  'cosy-files' instead of the old Firestore-chunking hack.
  //
  //  Every row read back from Postgres is reshaped to the exact camelCase
  //  object shape app.js/blocks.js already expect (same field names as the
  //  old Firestore docs) — see spaceShape/pageShape/blockShape below. Every
  //  write from a camelCase patch is translated back to snake_case columns
  //  — see translatePatch(). Timestamps: Postgres/Supabase hand back ISO
  //  strings; we convert those to epoch-ms NUMBERS before they ever reach a
  //  callback, so app.js's existing `(t && t.toMillis) ? t.toMillis() :
  //  (t||0)` normalizer keeps working completely unchanged (a plain number
  //  simply falls through to the `: (t||0)` branch).
  // =========================================================================
  function CloudStore() {
    var cfg = window.SUPABASE_CONFIG || {};
    // flowType: 'pkce' is required — without it Supabase defaults to the
    // implicit grant, which returns tokens in a URL *fragment*
    // (#access_token=...). Fragments never reach an HTTP server (the browser
    // keeps them client-side), so the Electron loopback server in main.js
    // would see a bare request with no query params and 404. PKCE instead
    // redirects with `?code=...` in the query string, which the loopback
    // server captures and hands back for exchangeCodeForSession(code).
    // detectSessionInUrl: false because our own window never loads the
    // redirect URL (main.js's loopback server does, out-of-process) — there
    // is never a session to auto-detect from window.location here.
    var client = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, flowType: 'pkce', detectSessionInUrl: false }
    });
    var KEY_MYSPACE = 'cosy.mySpaceId';

    // Last known session user, kept in sync by onAuth's listener so
    // currentUser() can answer synchronously (contract: same as Firebase's
    // auth.currentUser being readable without an await).
    var cachedUser = null;

    function userShape(u) {
      if (!u) return null;
      var meta = u.user_metadata || {};
      return {
        uid: u.id,
        name: meta.full_name || meta.name || 'Someone',
        photo: meta.avatar_url || meta.picture || '',
        email: u.email || ''
      };
    }
    function setAuthFromSession(session) { cachedUser = userShape(session && session.user); }

    // ---- timestamp helpers (see file-level comment above) ----
    function toMillis(v) {
      if (!v) return 0;
      if (typeof v === 'number') return v;
      var t = Date.parse(v);
      return isNaN(t) ? 0 : t;
    }
    function toIsoOrNull(ms) { return (ms === null || ms === undefined) ? null : new Date(ms).toISOString(); }

    // ---- row <-> camelCase shape helpers ----
    function spaceShape(row) {
      if (!row) return null;
      return {
        id: row.id, name: row.name,
        members: row.members || [],
        memberProfiles: row.member_profiles || {},
        sectionNames: row.section_names || {},
        theme: row.theme || null,
        inviteCode: row.invite_code,
        kind: row.kind || 'couple',
        capacity: row.capacity || 2,
        createdAt: toMillis(row.created_at)
      };
    }
    function pageShape(row) {
      if (!row) return null;
      return {
        id: row.id, title: row.title, icon: row.icon,
        parentId: row.parent_id, kind: row.kind, ownerUid: row.owner_uid,
        order: row.order, trashed: !!row.trashed,
        trashedAt: row.trashed_at ? toMillis(row.trashed_at) : null,
        createdAt: toMillis(row.created_at), updatedAt: toMillis(row.updated_at)
      };
    }
    function blockShape(row) {
      if (!row) return null;
      return {
        id: row.id, pageId: row.page_id, type: row.type,
        content: row.content || {}, width: row.width, order: row.order,
        createdAt: toMillis(row.created_at), updatedAt: toMillis(row.updated_at)
      };
    }

    // ---- generic camelCase-patch -> snake_case-row translator, used by
    // updatePage/updateBlock/updateSpace so callers keep passing the exact
    // same patch shapes they always have. `tsFields` lists which incoming
    // keys are epoch-ms numbers that need to become ISO strings for a
    // timestamptz column. ----
    var PAGE_FIELD_MAP = { parentId: 'parent_id', ownerUid: 'owner_uid', trashedAt: 'trashed_at' };
    var BLOCK_FIELD_MAP = { pageId: 'page_id' };
    var SPACE_FIELD_MAP = { memberProfiles: 'member_profiles', sectionNames: 'section_names', inviteCode: 'invite_code' };
    function translatePatch(patch, fieldMap, tsFields) {
      var row = {};
      Object.keys(patch || {}).forEach(function (k) {
        var col = fieldMap[k] || k;
        var v = patch[k];
        if (tsFields && tsFields.indexOf(k) !== -1) v = toIsoOrNull(v);
        row[col] = v;
      });
      return row;
    }
    function throwIfErr(res) { if (res && res.error) throw res.error; return res; }

    // -----------------------------------------------------------------------
    // ROUND 7 — Realtime connection-state tracking + auto-resubscribe.
    // Each of the 3 postgres_changes channels (space/blocks/pages) reports
    // its own connectivity via Supabase's `.subscribe(status)` callback.
    // channelStates tracks the last known status per channel name; the
    // aggregate exposed via onConnectionState is the "worst" of the three
    // (reconnecting beats offline beats online) so the UI shows a single,
    // meaningful signal instead of juggling three.
    // -----------------------------------------------------------------------
    var connCbs = [];
    var channelStates = {};   // channel name -> 'online' | 'reconnecting' | 'offline'
    var lastAgg = 'online';
    var BACKOFF_BASE_MS = 1000;
    var BACKOFF_MAX_MS = 30000;

    function computeAgg() {
      var states = Object.keys(channelStates).map(function (k) { return channelStates[k]; });
      if (states.indexOf('reconnecting') !== -1) return 'reconnecting';
      if (states.indexOf('offline') !== -1) return 'offline';
      return 'online';
    }
    function setChannelState(name, state) {
      channelStates[name] = state;
      var agg = computeAgg();
      if (agg !== lastAgg) {
        lastAgg = agg;
        connCbs.forEach(function (cb) { cb(agg); });
      }
    }
    function dropChannelState(name) {
      delete channelStates[name];
      var agg = computeAgg();
      if (agg !== lastAgg) {
        lastAgg = agg;
        connCbs.forEach(function (cb) { cb(agg); });
      }
    }

    // Wraps a postgres_changes channel with status-driven auto-resubscribe:
    // on CHANNEL_ERROR/TIMED_OUT/CLOSED, marks the channel 'reconnecting' and
    // retries with a capped exponential backoff (1s, 2s, 4s, ... up to 30s),
    // tearing down and rebuilding the channel each attempt (a Realtime
    // channel object can't simply be re-subscribed after it errors out).
    // `makeChannel()` must return a fresh, not-yet-subscribed channel (with
    // its `.on(...)` handlers already attached) every time it's called.
    // Returns an unsubscribe function that permanently stops retrying and
    // removes the channel + its connection-state entry.
    function manageChannel(name, makeChannel) {
      var retryCount = 0;
      var retryTimer = null;
      var current = null;
      var stopped = false;

      function start() {
        if (stopped) return;
        current = makeChannel();
        current.subscribe(function (status) {
          if (stopped) return;
          if (status === 'SUBSCRIBED') {
            retryCount = 0;
            setChannelState(name, 'online');
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setChannelState(name, 'reconnecting');
            scheduleRetry();
          }
        });
      }
      function scheduleRetry() {
        if (stopped || retryTimer) return;
        var delay = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * Math.pow(2, retryCount));
        retryCount++;
        retryTimer = setTimeout(function () {
          retryTimer = null;
          if (stopped) return;
          try { client.removeChannel(current); } catch (e) { /* ignore */ }
          start();
        }, delay);
      }

      start();
      return function stop() {
        stopped = true;
        if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
        try { client.removeChannel(current); } catch (e) { /* ignore */ }
        dropChannelState(name);
      };
    }

    return {
      mode: MODE_CLOUD,

      init: function () {
        return client.auth.getSession().then(function (res) {
          setAuthFromSession(res && res.data && res.data.session);
        });
      },

      // Supabase's onAuthStateChange listener doesn't always fire
      // synchronously right on attach, so we also read getSession() once
      // immediately and call cb ourselves — mirrors the old Firebase
      // behaviour where onAuthStateChanged always fires at least once fast.
      onAuth: function (cb) {
        client.auth.getSession().then(function (res) {
          setAuthFromSession(res && res.data && res.data.session);
          cb(cachedUser);
        });
        var sub = client.auth.onAuthStateChange(function (event, session) {
          setAuthFromSession(session);
          cb(cachedUser);
        });
        return function () {
          try { sub.data.subscription.unsubscribe(); } catch (e) { /* ignore */ }
        };
      },
      currentUser: function () { return cachedUser; },

      // ---------------------------------------------------------------
      // signIn(): Google sign-in via Supabase Auth, using the system
      // browser + a local loopback server run by the MAIN process
      // (Agent E's main.js/preload.js) to catch the redirect, since
      // Electron renderers can't receive a normal web redirect.
      //
      // Exact bridge contract this code is written against (Agent D <->
      // Agent E) — four calls, in this order, across THREE bridge methods
      // on window.cosyBridge:
      //
      //   1. var portInfo = await window.cosyBridge.oauthGetPort()
      //        -> Promise<{port}>. Starts (or reuses) the loopback HTTP
      //        server in main.js and resolves with its port immediately.
      //        This has to happen BEFORE we can build the OAuth URL, since
      //        the URL needs `redirectTo=http://127.0.0.1:<port>`.
      //
      //   2. var authData = await client.auth.signInWithOAuth({
      //        provider: 'google',
      //        options: { redirectTo: 'http://127.0.0.1:' + portInfo.port,
      //                   skipBrowserRedirect: true }
      //      })
      //        -> Promise<{data:{url}, error}>. Runs entirely in THIS
      //        renderer against our own supabase-js client instance, so
      //        the PKCE verifier it generates is stored in this client's
      //        own storage — nothing else must generate a second PKCE pair.
      //
      //   3. window.cosyBridge.oauthOpen(authData.data.url)
      //        -> fire-and-forget. main.js does shell.openExternal(url).
      //
      //   4. var {code} = await window.cosyBridge.oauthWaitForCode()
      //        -> Promise<{code}>, resolves once the already-listening
      //        loopback server (started in step 1) captures Supabase's
      //        `?code=...` redirect, or rejects on `?error=...` / a
      //        5-minute timeout.
      //
      // Then: client.auth.exchangeCodeForSession(code) finishes the sign-in
      // using the verifier supabase-js already has stored from step 2.
      // ---------------------------------------------------------------
      signIn: function () {
        if (!(window.cosyBridge && window.cosyBridge.oauthGetPort)) {
          return Promise.reject(new Error('Google sign-in needs the desktop app — this preview can\'t open a system browser window.'));
        }
        return window.cosyBridge.oauthGetPort().then(function (portInfo) {
          var redirectTo = 'http://127.0.0.1:' + portInfo.port;
          return client.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: redirectTo, skipBrowserRedirect: true }
          }).then(function (authData) {
            if (authData.error) throw authData.error;
            window.cosyBridge.oauthOpen(authData.data.url);
            return window.cosyBridge.oauthWaitForCode();
          });
        }).then(function (res) {
          var code = res && res.code;
          if (!code) throw new Error('Sign-in was cancelled.');
          return client.auth.exchangeCodeForSession(code);
        }).then(function (res) {
          if (res.error) throw res.error;
          setAuthFromSession(res.data && res.data.session);
          return cachedUser;
        });
      },
      signOut: function () { return client.auth.signOut().then(function (res) { throwIfErr(res); }); },

      // ---------------------------------------------------------------
      // Email/password auth — an alternative to Google sign-in, CLOUD-ONLY
      // (LocalStore has no matching methods; app.js feature-detects with
      // `if (store.signInEmail)` before wiring the email UI at all).
      //
      // signUpEmail: Supabase sends a confirmation email itself
      // (emailRedirectTo points at the website's /confirmed page — see
      // website/app/confirmed/page.tsx); the account can't sign in until
      // that link is clicked (assuming "Confirm email" is on in the
      // Supabase dashboard — see SETUP.md / the report for exactly which
      // toggle). `name` lands in user_metadata.name, which userShape()
      // above doesn't currently read (it reads full_name/name — 'name' IS
      // covered) — a signed-up-by-email user's name still shows correctly
      // once they're confirmed and signed in.
      //
      // signInEmail: on success, supabase-js fires onAuthStateChange just
      // like it does after the Google OAuth code exchange — onAuth (in
      // app.js) already listens for that, so no extra routing code is
      // needed here at all.
      //
      // resetPassword: sends a recovery email whose link lands on the
      // website's /reset page (see website/app/reset/page.tsx), which reads
      // the recovery access_token out of the URL fragment and PUTs the new
      // password straight to Supabase's REST API — the desktop app itself
      // is never involved in that leg of the flow.
      // ---------------------------------------------------------------
      signUpEmail: function (email, password, name) {
        return client.auth.signUp({
          email: email, password: password,
          options: { data: { name: name || '' }, emailRedirectTo: 'https://ourcosycorner.com/confirmed' }
        }).then(function (res) { if (res.error) throw res.error; return res.data; });
      },
      signInEmail: function (email, password) {
        return client.auth.signInWithPassword({ email: email, password: password })
          .then(function (res) { if (res.error) throw res.error; return res.data; });
      },
      resetPassword: function (email) {
        return client.auth.resetPasswordForEmail(email, { redirectTo: 'https://ourcosycorner.com/reset' })
          .then(function (res) { if (res.error) throw res.error; return true; });
      },

      getMySpaceId: function () { return window.localStorage.getItem(KEY_MYSPACE); },
      setMySpaceId: function (id) {
        if (id) window.localStorage.setItem(KEY_MYSPACE, id);
        else window.localStorage.removeItem(KEY_MYSPACE);
      },

      createSpace: function (name, kind, capacity) {
        var user = cachedUser;
        var profiles = {}; profiles[user.uid] = { name: user.name, photo: user.photo, mood: '' };
        var code = uid6();
        var row = {
          name: name || 'Our Cosy Corner',
          invite_code: code,
          members: [user.uid],
          member_profiles: profiles,
          section_names: { shared: sharedTitleFor(kind) },
          theme: null,
          kind: kind || 'couple',
          capacity: capacity || 2
        };
        // Invites row is written AFTER the space row so a half-finished
        // createSpace never leaves a dangling invites/{code} pointing at
        // nothing (contract C2 — the invites table is the join lookup).
        return client.from('spaces').insert(row).select().single().then(throwIfErr).then(function (res) {
          var space = spaceShape(res.data);
          return client.from('invites').insert({ code: code, space_id: space.id }).then(throwIfErr).then(function () {
            window.localStorage.setItem(KEY_MYSPACE, space.id);
            return space;
          });
        });
      },
      // ROUND 7 (multi-tenant hardening): join goes ENTIRELY through the
      // `join_space` SECURITY DEFINER RPC now (see SETUP.md, Agent S1) — no
      // more client-side invites SELECT (that table is no longer world-
      // readable) and no more legacy invite_code table scan (a non-member
      // has no read visibility into `spaces` to scan in the first place
      // under the tightened RLS). The RPC looks the code up server-side,
      // rejects an unknown code, enforces the 2-member cap, is idempotent
      // if the caller is already a member, and returns the joined space row
      // in one round trip — reading auth.uid() from the request's own JWT
      // so a caller can only ever add *themselves*.
      joinSpace: function (code) {
        var user = cachedUser;
        var normalizedCode = String(code || '').toUpperCase();
        var unknownCodeErr = new Error('No cosy corner found for that code. Double-check the 6 characters');
        var spaceFullErr = new Error('This corner is already full.');

        return client.rpc('join_space', {
          p_code: normalizedCode, p_name: user.name, p_photo: user.photo || ''
        }).then(function (res) {
          if (res.error) {
            var msg = String((res.error && res.error.message) || '').toLowerCase();
            if (msg.indexOf('full') !== -1 || msg.indexOf('two') !== -1 || msg.indexOf('2 member') !== -1 || msg.indexOf('already has') !== -1) {
              throw spaceFullErr;
            }
            throw unknownCodeErr;
          }
          var row = Array.isArray(res.data) ? res.data[0] : res.data;
          if (!row) throw unknownCodeErr;
          window.localStorage.setItem(KEY_MYSPACE, row.id);
          return spaceShape(row);
        });
      },
      // Realtime channel + a full re-select on every change: this table is
      // tiny (one row per space) so a refetch is simpler and just as fast
      // as hand-merging the payload, and uniformly handles UPDATE/DELETE.
      subscribeSpace: function (spaceId, cb) {
        // A transient fetch error (dropped socket / token refresh on
        // refocus, etc.) must NOT be treated as "the corner was deleted" —
        // that only happens on a SUCCESSFUL fetch that comes back with no
        // row (maybeSingle + no error). So errors/rejections just keep the
        // last-known-good space and self-heal with a single short retry.
        var retryTimer = null;
        function fetchAndEmit() {
          client.from('spaces').select('*').eq('id', spaceId).maybeSingle().then(function (res) {
            if (res.error) { console.error('[Cosy] spaces fetch failed (will retry):', res.error); scheduleRetry(); return; }
            cb(spaceShape(res.data));
          }, function (err) { console.error('[Cosy] spaces fetch rejected (will retry):', err); scheduleRetry(); });
        }
        function scheduleRetry() {
          if (!retryTimer) retryTimer = setTimeout(function () { retryTimer = null; fetchAndEmit(); }, 1500);
        }
        fetchAndEmit();
        var stop = manageChannel('space-' + spaceId, function () {
          return client.channel('space-' + spaceId)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'spaces', filter: 'id=eq.' + spaceId }, fetchAndEmit);
        });
        return function () { if (retryTimer) clearTimeout(retryTimer); stop(); };
      },
      updateSpace: function (spaceId, patch) {
        var row = translatePatch(patch, SPACE_FIELD_MAP);
        return client.from('spaces').update(row).eq('id', spaceId).then(throwIfErr).then(function () {});
      },
      // ROUND 7: routed through the `set_member_profile` SECURITY DEFINER
      // RPC now — direct client UPDATEs of member_profiles are locked out by
      // the tightened RLS (see SETUP.md), since profile writes must always
      // be self-scoped. The RPC derives the caller's uid from auth.uid()
      // server-side and atomically jsonb-merges p_patch into their own
      // member_profiles entry only; `memberUid` is kept in the signature so
      // every existing call site keeps working unchanged, but it's no
      // longer sent to the server — the RPC never trusts a client-supplied
      // uid for a profile write.
      updateMemberProfile: function (spaceId, memberUid, patch) {
        return client.rpc('set_member_profile', { p_space_id: spaceId, p_patch: patch })
          .then(throwIfErr).then(function () {});
      },

      // ---- blocks ----
      subscribeBlocks: function (spaceId, cb) {
        // Same non-destructive treatment as subscribeSpace: a transient
        // error/rejection keeps the last-known-good blocks and retries once
        // instead of emitting [] (which would make the UI look wiped). Only
        // a successful fetch that legitimately comes back empty renders empty.
        var retryTimer = null;
        function fetchAndEmit() {
          client.from('blocks').select('*').eq('space_id', spaceId).order('order').then(function (res) {
            if (res.error) { console.error('[Cosy] blocks fetch failed (will retry):', res.error); scheduleRetry(); return; }
            cb((res.data || []).map(blockShape));
          }, function (err) { console.error('[Cosy] blocks fetch rejected (will retry):', err); scheduleRetry(); });
        }
        function scheduleRetry() {
          if (!retryTimer) retryTimer = setTimeout(function () { retryTimer = null; fetchAndEmit(); }, 1500);
        }
        fetchAndEmit();
        var stop = manageChannel('blocks-' + spaceId, function () {
          return client.channel('blocks-' + spaceId)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'blocks', filter: 'space_id=eq.' + spaceId }, fetchAndEmit);
        });
        return function () { if (retryTimer) clearTimeout(retryTimer); stop(); };
      },
      addBlock: function (spaceId, block) {
        if (!spaceId || !block || !block.pageId) {
          return Promise.reject(new Error('Cannot save a widget before its page has loaded.'));
        }
        var row = { space_id: spaceId, page_id: block.pageId, type: block.type, content: block.content || {} };
        if (block.width !== undefined) row.width = block.width;
        if (block.order !== undefined) row.order = block.order;
        return client.from('blocks').insert(row).select('id').single().then(throwIfErr).then(function (res) { return res.data.id; });
      },
      updateBlock: function (spaceId, id, patch) {
        var row = translatePatch(patch, BLOCK_FIELD_MAP);
        // Belt-and-suspenders with the DB's touch_updated_at trigger (SETUP.md)
        // — set it explicitly too, so unread dots (contract C3/C6) keep
        // working even if a deploy ever forgets the trigger.
        row.updated_at = new Date().toISOString();
        return client.from('blocks').update(row).eq('id', id).then(throwIfErr).then(function () {});
      },
      deleteBlock: function (spaceId, id) {
        return client.from('blocks').delete().eq('id', id).then(throwIfErr).then(function () {});
      },
      // ROUND 7: single atomic RPC (`reorder_blocks`) instead of N parallel
      // per-row updates — one statement, membership-checked server-side,
      // no risk of a partial reorder if one of several parallel requests
      // fails mid-flight.
      reorderBlocks: function (spaceId, idToOrder) {
        var ids = Object.keys(idToOrder);
        var orders = ids.map(function (id) { return idToOrder[id]; });
        return client.rpc('reorder_blocks', { p_space_id: spaceId, p_ids: ids, p_orders: orders })
          .then(throwIfErr).then(function () {});
      },

      // ---- pages ----
      subscribePages: function (spaceId, cb) {
        // Same non-destructive treatment as subscribeSpace/subscribeBlocks:
        // a transient error/rejection keeps the last-known-good pages and
        // retries once instead of emitting [] and blanking the sidebar.
        var retryTimer = null;
        function fetchAndEmit() {
          client.from('pages').select('*').eq('space_id', spaceId).order('order').then(function (res) {
            if (res.error) { console.error('[Cosy] pages fetch failed (will retry):', res.error); scheduleRetry(); return; }
            cb((res.data || []).map(pageShape));
          }, function (err) { console.error('[Cosy] pages fetch rejected (will retry):', err); scheduleRetry(); });
        }
        function scheduleRetry() {
          if (!retryTimer) retryTimer = setTimeout(function () { retryTimer = null; fetchAndEmit(); }, 1500);
        }
        fetchAndEmit();
        var stop = manageChannel('pages-' + spaceId, function () {
          return client.channel('pages-' + spaceId)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'pages', filter: 'space_id=eq.' + spaceId }, fetchAndEmit);
        });
        return function () { if (retryTimer) clearTimeout(retryTimer); stop(); };
      },

      // ROUND 7: subscribe to the aggregate Realtime connection state across
      // all 3 channels (space/blocks/pages) — 'online' while all channels are
      // healthy, 'reconnecting' while any is retrying after a drop, 'offline'
      // if a channel is down and not currently retrying. Fires once
      // immediately with the current state, mirroring onAuth/subscribeSpace.
      onConnectionState: function (cb) {
        connCbs.push(cb);
        cb(lastAgg);
        return function () { connCbs = connCbs.filter(function (f) { return f !== cb; }); };
      },
      addPage: function (spaceId, page) {
        var row = {
          space_id: spaceId, title: page.title, icon: page.icon,
          parent_id: page.parentId || null, kind: page.kind, owner_uid: page.ownerUid
        };
        if (page.order !== undefined) row.order = page.order;
        return client.from('pages').insert(row).select('id').single().then(throwIfErr).then(function (res) { return res.data.id; });
      },
      updatePage: function (spaceId, id, patch) {
        var row = translatePatch(patch, PAGE_FIELD_MAP, ['trashedAt']);
        // Belt-and-suspenders with the DB's touch_updated_at trigger (SETUP.md)
        // — set it explicitly too, so unread dots (contract C3/C6) keep
        // working even if a deploy ever forgets the trigger.
        row.updated_at = new Date().toISOString();
        return client.from('pages').update(row).eq('id', id).then(throwIfErr).then(function () {});
      },
      // Single delete — pages.parent_id and blocks.page_id are both
      // `references ... on delete cascade`, so descendant pages and every
      // block on any of them disappear automatically. MUCH simpler than the
      // old hand-rolled collectDescendantIds walk, same resolved-Promise
      // contract from the caller's perspective.
      deletePage: function (spaceId, id) {
        return client.from('pages').delete().eq('id', id).then(throwIfErr).then(function () {});
      },
      // Migration: same algorithm as LocalStore (see ensurePagesCommon
      // above), just backed by Postgres selects + insert/update per op.
      ensurePages: function (spaceId, space, user) {
        return ensurePagesCommon({
          space: space, user: user,
          listPages: function () {
            return client.from('pages').select('*').eq('space_id', spaceId).then(throwIfErr)
              .then(function (res) { return (res.data || []).map(pageShape); });
          },
          listBlocks: function () {
            return client.from('blocks').select('*').eq('space_id', spaceId).then(throwIfErr)
              .then(function (res) { return (res.data || []).map(blockShape); });
          },
          createPage: function (draft) {
            var row = {
              space_id: spaceId, title: draft.title, icon: draft.icon,
              parent_id: draft.parentId || null, kind: draft.kind, owner_uid: draft.ownerUid,
              order: draft.order || 0
            };
            return client.from('pages').insert(row).select().single().then(throwIfErr)
              .then(function (res) { return pageShape(res.data); });
          },
          patchPage: function (id, patch) {
            var row = translatePatch(patch, PAGE_FIELD_MAP, ['trashedAt']);
            return client.from('pages').update(row).eq('id', id).then(throwIfErr).then(function () {});
          },
          patchBlock: function (id, patch) {
            var row = translatePatch(patch, BLOCK_FIELD_MAP);
            return client.from('blocks').update(row).eq('id', id).then(throwIfErr).then(function () {});
          }
        }).then(function (pages) {
          // Back-fill invites/{code} for spaces created before that table
          // existed (contract C2) — every member's ensurePages call on
          // space load will do this, so it self-heals on first open.
          return backfillInviteCommon({
            code: space && space.inviteCode,
            spaceId: spaceId,
            getInvite: function () {
              return client.from('invites').select('space_id').eq('code', space.inviteCode).maybeSingle()
                .then(function (res) { return (res.data && res.data.space_id) || null; }, function () { return null; });
            },
            createInvite: function () {
              // invites is write-only under RLS (no SELECT policy), so
              // getInvite above can never see an existing row. A 23505
              // unique-violation here just means it was already backfilled,
              // so treat it as success instead of throwing.
              return client.from('invites').insert({ code: space.inviteCode, space_id: spaceId }).then(function (res) {
                if (res && res.error && res.error.code === '23505') { return; }
                return throwIfErr(res);
              }).then(function () {});
            }
          }).then(function () { return pages; });
        });
      },

      // Pure client-side compression shared with LocalStore — never touched
      // Firestore/Storage directly before, still doesn't now.
      uploadImage: function (spaceId, file) {
        return compressImageFile(file); // base64 data URL
      },

      // ---- files (pdf/file blocks) — real Supabase Storage now ----
      // Storage upload happens FIRST, the `files` metadata row is written
      // LAST, so a half-finished upload is never mistaken for a complete
      // file by a partner's downloadFileData (same safety principle as the
      // old "meta doc written last" comment, just inverted since Storage
      // objects — unlike Firestore docs — aren't atomic with our own writes).
      uploadFileData: function (spaceId, name, bytes, onProgress) {
        bytes = bytes || new Uint8Array(0);
        var storagePath = spaceId + '/' + genId('file') + '-' + name;
        return client.storage.from('cosy-files').upload(storagePath, bytes, {
          contentType: 'application/octet-stream'
        }).then(throwIfErr).then(function () {
          return client.from('files').insert({
            space_id: spaceId, name: name, size: bytes.length, storage_path: storagePath
          }).select('id').single();
        }).then(throwIfErr).then(function (res) {
          if (onProgress) onProgress(1, 1);
          return { fileId: res.data.id, size: bytes.length };
        });
      },
      downloadFileData: function (spaceId, fileId, onProgress) {
        return client.from('files').select('name, storage_path').eq('id', fileId).maybeSingle().then(function (res) {
          if (res.error || !res.data) throw new Error('file not found');
          var meta = res.data;
          return client.storage.from('cosy-files').download(meta.storage_path).then(throwIfErr).then(function (dlRes) {
            if (onProgress) onProgress(1, 1);
            return dlRes.data.arrayBuffer().then(function (buf) {
              return { name: meta.name, bytes: new Uint8Array(buf) };
            });
          });
        });
      },
      deleteFileData: function (spaceId, fileId) {
        return client.from('files').select('storage_path').eq('id', fileId).maybeSingle().then(function (res) {
          var path = res && res.data && res.data.storage_path;
          var tasks = [client.from('files').delete().eq('id', fileId)];
          if (path) tasks.push(client.storage.from('cosy-files').remove([path]));
          return Promise.all(tasks);
        }).catch(function () { /* best-effort */ });
      },

      // ---- recent corners (onboard "welcome back" list) ----
      // Sorted newest-first client-side, same as LocalStore — a leave-space
      // only clears the local "current space" pointer, so a corner the user
      // left still shows up here (they're still a member).
      listMySpaces: function () {
        var user = cachedUser;
        if (!user) return Promise.resolve([]);
        return client.from('spaces').select('*').contains('members', [user.uid]).then(function (res) {
          if (res.error) return [];
          var arr = (res.data || []).map(spaceShape);
          arr.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
          return arr.map(function (s) {
            return { id: s.id, name: s.name, inviteCode: s.inviteCode, memberCount: (s.members || []).length, capacity: s.capacity || 2 };
          });
        });
        // Deliberately no further .catch() here — app.js's onboard renderer
        // treats a rejected promise as "hide the section".
      },

      // ---- export (contract C1) ----
      // Full dump for the "export our corner" button — files are metadata
      // only (no bytes), read straight off the `files` table. ROUND 7: check
      // .error on EACH of the 4 queries and reject the whole export if any
      // one of them failed — a half-exported JSON (e.g. missing blocks
      // because that one query hiccuped) is worse than no export at all.
      exportSpace: function (spaceId) {
        return Promise.all([
          client.from('spaces').select('*').eq('id', spaceId).maybeSingle(),
          client.from('pages').select('*').eq('space_id', spaceId),
          client.from('blocks').select('*').eq('space_id', spaceId),
          client.from('files').select('*').eq('space_id', spaceId)
        ]).then(function (results) {
          var spaceRes = results[0], pagesRes = results[1], blocksRes = results[2], filesRes = results[3];
          var errored = results.filter(function (r) { return r && r.error; })[0];
          if (errored) {
            throw new Error('couldn\'t export our corner right now — try again in a moment');
          }
          var space = spaceShape(spaceRes.data);
          var pages = (pagesRes.data || []).map(pageShape);
          var blocks = (blocksRes.data || []).map(blockShape);
          var files = (filesRes.data || []).map(function (f) {
            return { fileId: f.id, name: f.name, size: f.size };
          });
          return { space: space, pages: pages, blocks: blocks, files: files };
        });
      },

      // ---- import (restore from an export-our-corner backup file) ----
      importSpace: function (data) {
        return importSpaceViaSelf(this, data);
      },

      // ---- leave a corner (Security §5) ----
      // Real membership removal (not just clearing this Mac's "current
      // space" pointer): calls the `remove_member` SECURITY DEFINER RPC,
      // which removes the CALLER's own uid from members + their
      // member_profiles entry (a member can only ever remove themselves
      // through this path). The local pointer is cleared only after the RPC
      // succeeds, so a failed leave doesn't strand the app pointed at a
      // space the user is still actually a member of.
      leaveSpace: function (spaceId) {
        var uid = cachedUser && cachedUser.uid;
        return client.rpc('remove_member', { p_space_id: spaceId, p_uid: uid })
          .then(throwIfErr).then(function () {
            window.localStorage.removeItem(KEY_MYSPACE);
          });
      },

      // ---- delete my account (LocalStore has no account, so it has no
      // matching method — app.js feature-detects with `if (!store.deleteAccount)`) ----
      // Mirrors the SQL side's comment on delete_account: storage OBJECTS
      // (file bytes) for corners where I'm the only member have to be wiped
      // from the CLIENT before calling the RPC, because the bucket policy
      // only lets a member reach them — once delete_account removes my
      // membership (or the space itself) nobody could clean those bytes up
      // afterward. So the order here is: 1) find my solo spaces, 2) best-effort
      // remove their storage objects one space at a time, 3) THEN call the
      // RPC to actually erase the account, 4) clear the local pointer + local
      // session last, once the account is actually gone server-side.
      deleteAccount: function () {
        var user = cachedUser;
        if (!user) return Promise.reject(new Error('not signed in'));
        return client.from('spaces').select('id, members').contains('members', [user.uid])
          .then(throwIfErr).then(function (res) {
            var soloIds = (res.data || [])
              .filter(function (s) { return (s.members || []).length <= 1; })
              .map(function (s) { return s.id; });
            var chain = Promise.resolve();
            soloIds.forEach(function (spaceId) {
              chain = chain.then(function () {
                return client.from('files').select('storage_path').eq('space_id', spaceId)
                  .then(throwIfErr).then(function (filesRes) {
                    var paths = (filesRes.data || []).map(function (f) { return f.storage_path; }).filter(Boolean);
                    if (!paths.length) return;
                    return client.storage.from('cosy-files').remove(paths).catch(function () { /* best-effort */ });
                  }).catch(function () { /* best-effort */ });
              });
            });
            return chain;
          })
          .then(function () { return client.rpc('delete_account'); })
          .then(throwIfErr)
          .then(function () {
            window.localStorage.removeItem(KEY_MYSPACE);
            return client.auth.signOut().catch(function () { /* the auth user no longer exists — signOut may 401, that's fine */ });
          });
      }
    };
  }

  // =========================================================================
  //  Pick the implementation
  // =========================================================================
  var cloudReady = typeof window.hasSupabaseConfig === 'function' &&
                   window.hasSupabaseConfig() && window.supabase;

  window.CosyStore = cloudReady ? CloudStore() : LocalStore();
  window.CosyStore.isCloud = cloudReady;
})();
