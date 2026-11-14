# Our Cosy Corner 🏡💕

A warm little **shared workspace for two** — a cosy, Notion-style home where
you and your partner each get your own dashboard, share one together, and nest
as many pages inside as you like: plans, love notes, countdowns, PDFs, files,
and links. Built as a native **macOS desktop app** with Electron.

It works **completely offline out of the box** (everything saved on your Mac),
and can optionally sync live between two Macs when you connect a free Supabase
project.

> **Project status:** no longer maintained. The hosted sync backend has been
> retired, so the app runs in local mode by default. To try cloud sync, point
> `supabase-config.js` at your own free Supabase project using
> **[SETUP.md](SETUP.md)**.

---

## Run it

```bash
cd our-cosy-corner
npm install
npm start
```

That's it — the app opens in its own window. On first launch you'll see a
gentle banner saying you're in **local mode**; everything works, it just isn't
syncing to a partner yet. To sync across two computers, follow **[SETUP.md](SETUP.md)**.

> Requires Node.js 18+ and macOS (it also runs on Windows/Linux, the cosmetic
> `hiddenInset` titlebar is mac-only).

---

## A little tour ✨

**Sign in → make a corner.** In local mode you just pick a name and step
inside. In cloud mode you sign in with Google. Then either **create a new
corner** (you get a 6-character invite code) or **join** your partner's corner
with their code.

**The header.** Your space name is editable (click it). Both partners appear as
avatars with a **mood sticker** you can tap to change (😊 🥰 😴 …) — moods sync
live. There's a 🎨 theme button and a copy-invite-code button.

**Pages, like Notion.** The left sidebar is your page tree: 🏡 the shared home
dashboard, plus a personal dashboard for each of you, and unlimited nested
sub-pages inside any page (hover a page for ＋ / 🗑, double-click to rename,
click the icon to pick a new emoji). The content area shows one page at a
time — breadcrumbs on top, a big editable icon + title, chips for its
sub-pages, then its blocks. The home page also shows two big dashboard cards
that jump straight to each partner's own dashboard. Add blocks with the **＋**
button — a cute picker pops up.

### Block types

| Block | What it does |
|-------|--------------|
| 📝 **Text** | A proper long-form document editor. Focus it for a docked toolbar: undo/redo, Title/Heading/Body styles, bold / italic / underline / strikethrough, text + highlight colours, bullet & numbered lists, quotes, inline code & code blocks, alignment, links, horizontal rules, clear formatting. Markdown shortcuts too (`# `, `- `, `> `, `---`, ` ``` `) and a floating toolbar on selection. |
| ✅ **To-do list** | Checkable items, add/remove, strike-through when done, little `3/5 done ✿` progress. |
| 🖼️ **Image** | Upload from a file picker or just **paste** an image. Width slider + optional caption. |
| 🎀 **Countdown** | Label + emoji + date → “12 days to go 🎀”, or “30 days since 💗” for anniversaries. |
| 🗒️ **Sticky note** | Little pastel note card (4 colours), gently rotated for charm. |
| ୨୧ **Divider** | Cute separator — click to cycle flower / heart / moon styles. |
| 💌 **Love note** | A little letter with a wax seal, for leaving something sweet for your love. |
| 📄 **PDF** | Upload a PDF and read it right on the page in an inline viewer (S/M/L heights), or pop it open in Preview. |
| 📎 **File** | Attach anything — docx, xlsx, zip… shows a cosy file card with the right icon and opens in the matching app. |
| 🔗 **Link** | Paste a URL for a bookmark card with favicon, editable title and note; click to open in your browser. |

**Drag to reorder** any block within its page (grab the ⠿ handle) — a floating
preview follows your cursor and an accent line shows exactly where it will land.

**Find & recover.** Press **⌘K** (or the 🔍 row in the sidebar) to jump to any
page. Deleted blocks offer a quick **undo**; deleted pages go to the sidebar
**🗑 trash** where they can be restored or removed forever. The **⚙ settings**
popover has a one-click **JSON export** of your whole corner (and sign-out in
cloud mode). A little header chip shows sync status ("all cosy ✓ / saving… /
offline 💤").

> 📁 **Where do uploaded files live?** A local copy is always saved on this
> Mac (in the app's own `cosy-files` folder) for instant access; in cloud
> mode it's also uploaded to Supabase Storage so your partner can fetch it
> too — no paid plan needed, and no size hacks. Files uploaded on an older
> version (before this synced) only exist on that person's Mac — re-upload
> once and it'll sync from then on.

### Themes 🎨

Four hand-tuned presets — **Warm Café ☕**, **Strawberry Milk 🍓**,
**Cottagecore 🌿**, **Midnight Cocoa 🌙** — plus a customiser for accent colour,
background, base font, and corner-roundness. The theme is stored on the shared
space, so both partners always see the same cosy world.

---

## How it's built

- **Electron** main process (`main.js`) + vanilla HTML/CSS/JS renderer. **No
  React, no bundler, no build step** — just `npm install && npm start`.
- **Storage abstraction** (`js/storage.js`): the UI only ever talks to
  `window.CosyStore`, which is either a **LocalStore** (localStorage + instant
  pub/sub) or a **CloudStore** (Supabase Auth + Postgres with live Realtime
  subscriptions). The UI code doesn't know or care which one is active.
- **Google sign-in in Electron** uses a reliable **system-browser OAuth
  loopback** (see `main.js`) on a fixed local port, then hands the returned
  code to Supabase to finish the sign-in. Details in SETUP.md.
- Small images are compressed client-side to base64 data URLs and stored
  directly in the block document (both modes); larger images, PDFs, and files
  go through Supabase Storage in cloud mode — no paid plan required.

### File map

```
our-cosy-corner/
├── package.json         Electron + supabase-js deps, `npm start`
├── main.js              Electron main; window + Google OAuth loopback
├── preload.js           safe bridge (contextIsolation)
├── supabase-config.js   ← paste your Supabase values here (placeholder = local mode)
├── index.html           the single page
├── css/
│   ├── styles.css       layout + all components
│   └── themes.css       variable defaults, paper texture, per-theme touches
├── js/
│   ├── storage.js       local ⇄ Supabase abstraction (the important one)
│   ├── themes.js        4 presets + customiser
│   ├── blocks.js        all 10 block renderers + rich-text toolbar
│   ├── dragdrop.js       drag controller, hit-testing, ghost + indicator
│   └── app.js           UI wiring: auth, spaces, pages, blocks, moods, theme
├── README.md
└── SETUP.md             non-developer Supabase setup + partner invite
```

---

## Want your partner on their own Mac?

Local mode saves everything on **one** computer. To sync live between two Macs,
spend ~15 minutes on **[SETUP.md](SETUP.md)** to create a free Supabase project
and paste two values into `supabase-config.js`. Then one of you creates the
corner, shares the 6-character invite code, and the other joins. Edits appear on
both screens in real time. 💌
