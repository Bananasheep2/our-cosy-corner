# Shipping Our Cosy Corner 🚀

This is the operator's checklist for publishing the app as a downloadable
macOS + Windows build from your website, backed by **one hosted Supabase
project** that every couple shares (isolated per-couple by database security
rules). Do these in order. Items marked **⚠️ only you can do** need your
accounts/keys/certs — I can't do them from code.

---

## Part A — Stand up the backend (once)

1. **⚠️ Create the Supabase project** and run the full SQL from
   [SETUP.md](SETUP.md) in the SQL editor (schema + indexes + triggers + the
   4 RPCs + RLS policies, in one paste, top to bottom).
2. **⚠️ Create the private Storage bucket** `cosy-files` and add the
   membership-scoped policy from SETUP.md.
3. **⚠️ Enable Google auth** in Supabase → Authentication → Providers, and add
   the redirect URLs `http://127.0.0.1:53682`, `53683`, `53684`.
4. **⚠️ Publish the Google OAuth consent screen** (move it out of "Testing").
   With only email+profile scopes you don't need full Google verification for
   basic use, but an unpublished screen blocks anyone who isn't a listed test
   user. If you expect >100 users, plan for Google's verification.
5. **⚠️ Set Supabase Auth rate limits** (Auth → Rate Limits) to sane values —
   this is your main defense against sign-in/abuse spam, since the app itself
   has no server.

## Part B — Point the app at your backend

6. **⚠️ Put your project URL + anon (public) key** into `supabase-config.js`
   (replace the `PASTE_...` placeholders). The anon key is public by design —
   RLS is the real security boundary — but **if the key already in this repo
   was ever committed/shared, rotate it** (Supabase → Settings → API →
   roll anon key) before launch. **Never** put the `service_role` key in the
   app.
7. Sanity check: launch with `npm start`, confirm the local-mode banner is
   gone (you're in cloud mode), sign in with Google, create a corner, and on a
   second machine/account join with the code. Confirm edits sync both ways.

## Part C — Build the downloads

8. **⚠️ Supply app icons**: create `build/icon.icns` (macOS, 1024×1024 source)
   and `build/icon.ico` (Windows). There is no `build/` folder yet — make it.
   Without these you'll ship with the default Electron icon.
9. Build:
   ```bash
   npm run dist:mac    # → dist/*.dmg  (two DMGs: Intel x64 + Apple Silicon arm64)
   npm run dist:win    # → dist/*.exe  (NSIS installer)
   npm run dist        # both
   ```
   (Cross-building Windows from a Mac needs Wine, or just run `dist:win` on a
   Windows machine / CI. Mac notarization must run on a Mac.)

## Part D — First-launch security prompts (no paid accounts required to ship)

This build ships **without** an Apple Developer account or a Windows
Authenticode certificate. That's a supported path — it just means users see
one extra step on first launch, which you should warn them about next to the
download buttons. Nothing here blocks shipping; it changes what the download
page needs to say.

- **macOS — ad-hoc signed, not notarized.** `package.json`'s `build.mac` sets
  `"identity": null` so electron-builder never searches the keychain for a
  cert we don't have — but that also makes electron-builder **skip its own
  signing step entirely**. The actual **ad-hoc signature** is applied by our
  `build/afterPack.js` hook, which runs `codesign --force --deep --sign -`
  on the packaged `.app` right after packaging and before the dmg is built
  (this is required just for Apple Silicon arm64 binaries to launch at all —
  an entirely unsigned arm64 build won't run). Ad-hoc signing is not the same
  as notarization, and there's no Developer ID cert here, so **Gatekeeper
  will still block the first launch** of the
  quarantined (browser-downloaded) `.app` with "Apple could not verify... is
  free of malware."
  - **macOS 15 Sequoia removed the right-click → Open bypass.** The working
    flow there: double-click the app (it gets blocked — click "Done"/dismiss)
    → System Settings → Privacy & Security → scroll down to the "\"Our Cosy
    Corner\" was blocked" message → **Open Anyway** → confirm in the
    follow-up prompt.
  - **macOS 13/14 (Ventura/Sonoma)**: right-click (or Control-click) the app
    → **Open** → **Open** in the dialog works as before.
  - **Fallback** if users instead see "'Our Cosy Corner' is damaged and can't
    be opened, you should move it to the Trash" (a stricter quarantine
    variant): open Terminal and run
    `xattr -cr "/Applications/Our Cosy Corner.app"`, then relaunch.
  - Put these exact first-launch steps (a screenshot of the System Settings
    "Open Anyway" screen helps a lot) directly next to the Mac download
    button on your site — don't rely on users finding them after they're
    already confused.
  - **Later upgrade path:** an Apple Developer Program account ($99/yr) →
    Developer ID Application cert → set `CSC_LINK`/`CSC_KEY_PASSWORD` → add
    notarization (electron-builder's `afterSign` + `@electron/notarize`, and
    flip `mac.notarize` back on). That removes the Gatekeeper prompt
    entirely. Not needed to ship today.
- **Windows** — an unsigned `.exe` triggers SmartScreen ("Windows protected
  your PC"); users click "More info" → "Run anyway". An **Authenticode
  code-signing certificate** (OV ~$100–300/yr, or EV for instant reputation)
  removes this warning via electron-builder's `win.certificateFile`/
  `signtool`, and is recommended as a later purchase once the app has
  traction — it's optional for an initial release.

## Part E — Website & distribution

10. Host the `.dmg`s and `.exe` on your site with clear buttons. Note there
    are **two Mac downloads**: "Mac (Apple Silicon)" for the `-arm64.dmg`
    and "Mac (Intel)" for the plain `1.0.0.dmg` — label both, since opening
    the wrong one either won't run or runs slowly under Rosetta. Consider a short "first launch" note for users about the OS
    security prompt if you haven't signed yet.
11. **Auto-update (built, needs your GitHub repo wired in):** the app ships
    with an in-app updater (`electron-updater`) against a GitHub Releases
    feed. Three steps make it live:
    1. **⚠️ Fill in your real GitHub owner/repo** in two places: `package.json`'s
       `build.publish` block, and the `UPDATE_RELEASES_URL` constant near the
       top of `main.js`. Both currently say `REPLACE_WITH_GITHUB_OWNER` /
       `REPLACE_WITH_GITHUB_REPO` — keep them in sync.
    2. **Each release:** bump `"version"` in `package.json`, run `npm run dist`,
       then create a GitHub release tagged `v<version>` and upload *everything*
       `dist/` produces for shipping — both `.dmg`s, both mac `.zip`s, the
       Windows `.exe`, **plus** `latest.yml`, `latest-mac.yml`, and all
       `.blockmap` files. electron-updater reads those `.yml` manifests to know
       a new version exists, so a release missing them is invisible to the
       updater even though the app itself would run fine.
    3. **What users then see:** Windows users get a toast when an update is
       found, and a one-click in-app download + install. macOS users get an
       in-app "new version" notice that opens the GitHub releases page in
       their browser — mac can't self-install yet because electron-updater
       refuses to install into an app that isn't Developer-ID signed +
       notarized (see Part D). Full mac auto-install unlocks the day you buy
       that signing — the mac `zip` target and `latest-mac.yml` are already
       being produced by every build, so no further code changes are needed.

---

## What was hardened for this release (context)

Security: code-based invite/join with a 2-member cap (strangers can no longer
enumerate or self-join corners); render-time HTML sanitization + a strict CSP
(no more stored-XSS between partners); membership-scoped file storage; real
"leave" that removes membership; Electron 43 with the renderer sandbox on,
navigation locked to the app, and validated external-link/OAuth opens.

Reliability: the save indicator now tells the truth (errors surface instead of
a false "all cosy ✓"); every save has error handling + a global crash net + a
diagnostics log; the delete→undo flow no longer orphans files; local-storage
"disk full" is surfaced instead of silently dropping saves; realtime
reconnects are detected and shown; unread dots work in cloud mode.

## Known residual items (not blockers, worth tracking)
- **Backend SQL is verified by static review only** — there was no live
  Supabase project to run it against here. Do a real end-to-end test (Part A/B
  step 7) on a throwaway project before go-live, especially the `join_space`
  2-member cap and the `cosy.rpc` GUC guard on the spaces UPDATE policy.
- In-app updater is built but needs your GitHub owner/repo filled in before
  it can find releases (see E-11).
- No per-space file storage quota yet (a member could upload a lot); the
  2-member cap limits blast radius.
- macOS build is ad-hoc signed but **not notarized**, and the Windows build
  is unsigned — both trigger a first-launch OS prompt (see Part D for the
  exact wording to put on the download page). Neither blocks shipping.
