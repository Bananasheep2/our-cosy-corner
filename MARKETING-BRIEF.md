# Our Cosy Corner — Marketing Brief

A factual, specific rundown for a marketing/publicity agent. Everything here is
true of the shipped product as of version **1.0.4 (macOS)** / **1.0.2 (Windows)**,
July 2026. A "Do not claim" section at the end lists things that are *not* true —
respect it, because overclaiming on privacy or platforms will backfire.

---

## 1. One-liner & elevator pitch

- **One-liner:** Our Cosy Corner is a free desktop app where two people share one
  private, cosy workspace — plans, notes, to-dos, photos, files and links — that
  syncs live between their computers.
- **Elevator pitch:** It's a Notion-style shared home for a couple. You each get
  your own private page, you share one together, and you can nest as many pages
  inside as you like. Everything one of you writes shows up on the other's screen
  within seconds. It's warm and tactile rather than corporate — paper textures,
  soft type, seven hand-tuned themes — and it's free, with no ads and no tracking.

## 2. What it is

A **native desktop application** (built with Electron) for **macOS and Windows**.
It is a two-person shared workspace / digital scrapbook / planning hub. Think
"Notion, but built for exactly two people who love each other, and cosy instead
of corporate."

It is **not** a phone app, **not** a website you log into, and **not** a group
tool. One corner = exactly two people.

## 3. Who it's for

- **Couples** — the core audience. Young adults and teens especially.
- **Long-distance couples** are a standout segment: the live sync between two
  separate computers is the single biggest practical hook for people who don't
  share a home. Lead with this for LDR communities.
- People who find Notion/Trello too "worky" and shared Google Docs too plain, and
  want something that feels personal and warm.

## 4. The core concept (the thing that makes it different)

**Ownership is the signature idea.** The sidebar is organised into three zones:

- **Ours** — the shared dashboard and any shared pages.
- **Your side** — your own private page (and anything nested under it).
- **Their side** — your partner's private space.

So the app always answers "what's ours, what's mine, what's theirs." Your private
pages are hidden from your partner's dashboard. This "shared home + a nook that's
just yours each" framing is the emotional centre of the product — use it.

## 5. Full feature list (be specific — these all exist)

**Pages**
- One shared dashboard, plus a private personal page for each partner.
- Unlimited **nested pages and sub-pages** (a Notion-style tree).
- Per-page icons, drag-to-reorder, trash with restore.
- **Quick switcher** (Cmd/Ctrl+K) to jump to any page.

**Content blocks** (mix any of these on a page):
- **Note** — rich text with Title / Heading / Small heading / Body, four font
  styles (Clean, Classic, Handwritten, Marker), and text colours.
- **To-do** — checkable shared lists.
- **Photo** — images of the two of you.
- **Countdown** — days until a big day (anniversary, a trip, a reunion).
- **Sticky note** — a small coloured note.
- **Love note** — a letter to your partner.
- **PDF** — viewed inline in the app.
- **File** — attach anything (docx, xlsx, etc.).
- **Link** — a bookmark to anything on the web.
- **Divider** — a decorative separator.
- Blocks can be **dragged to reorder** and **resized** in width.

**Look & feel**
- **Seven themes:** Parchment (default), Peach Blossom, Cherry Blossom, Evergreen,
  Frosted Petal, Clear Harbour, Velvet Night (a dark theme).
- **"Make it yours" customiser:** pick an accent colour, background, font, and
  corner roundness. Both partners see the same customised world.

**Togetherness**
- **Live sync** between two computers, updates in seconds.
- **Presence:** each partner's avatar and a short "mood" word.
- **Pairing** via a simple 6-character invite code — no friending, no phone numbers.

**Trust & control**
- **Local-first:** works fully offline; everything is saved on your own computer,
  and cloud sync is automatic once you're signed in.
- **JSON export + restore** — your data is portable and you can back it up.
- **Delete-account** support.
- **Auto-update:** Windows updates itself in place; macOS notifies you.

## 6. Platforms, pricing, how to get it

- **Website / download:** https://ourcosycorner.com  (download page at /download)
- **macOS:** Apple Silicon (M1+) and Intel builds, version **1.0.4**. ~120 MB .dmg.
- **Windows:** 10/11, version **1.0.2** (a 1.0.4 update is in progress). ~96 MB installer.
- **Price:** **Free.** No paid tier exists today. No ads.
- **Sign-in:** **Google account only** (used just for your name, email and photo).

## 7. Privacy & security model (state this carefully)

- Each couple's data is **isolated at the database level** via row-level security —
  only the two paired accounts can read a corner's contents.
- **No ads, no tracking, no selling data**, no third parties reading your content.
- Google sign-in requests **only** name, email and profile photo.
- Data is stored in the app's cloud backend (hosted Postgres) to enable sync;
  it is **private per couple**, but it is **not** end-to-end encrypted (see below).

## 8. Tech stack (for credibility / dev-audience angles)

Electron desktop app; Postgres backend with row-level security and realtime sync;
Google OAuth. Marketing site is on Cloudflare. Self-hosted fonts, strict content
security policy. Useful if pitching to indie-dev or "built by one person, done
properly" audiences.

## 9. Positioning vs alternatives

- **vs Notion / Trello:** built for two, ownership-aware, cosy not corporate, free,
  desktop-native, no workspace/account overhead.
- **vs couple apps (Paired, Between, Cupla):** those are mobile relationship apps
  centred on chat, prompts and calendars. Our Cosy Corner is a **desktop workspace
  and scrapbook** — planning, notes, files, countdowns, love notes — with live
  two-computer sync. Different job: "a shared home for your stuff," not "a
  relationship coach."
- **vs shared Google Docs / Apple Notes:** purpose-built and warm — block editor,
  themes, countdowns, sticky and love notes, ownership zones.

## 10. Brand & voice

- **Name:** Our Cosy Corner. Always Title Case. Domain: ourcosycorner.com.
- **Aesthetic:** warm parchment/paper, stationery-like, tactile, calm. Typography
  is IBM Plex Sans (UI) + EB Garamond (reading text). **No emoji** in the product UI.
- **Tone:** gentle, intimate, unhurried, second-person — "the two of you," "your
  little world," "a nook that's just yours." Lowercase, soft, never salesy or hypey.
- **Feeling to sell:** safety, warmth, a small private world for two.

## 11. Suggested angles / taglines (starting points, not final)

- "Keep your little world close."
- "A cosy corner of the internet, just for the two of you."
- "Share a home screen with the person you love."
- LDR angle: "Two computers, one cosy room. Sync everything, instantly."
- "Notion energy, love-letter heart."

## 12. Current status & honest limitations (hand these off too)

- **Windows is one version behind** (1.0.2 vs macOS 1.0.4) while a new build is
  produced; the download page says so.
- **Not notarised by Apple / not signed with a paid Windows certificate yet**, so
  first launch shows a Gatekeeper / SmartScreen "unrecognised app" warning. The
  download page explains the "Open Anyway" / "More info → Run anyway" steps. Be
  ready to reassure on this — it's normal for a new indie app, not a red flag.
- **No mobile app, no web version, no distributed Linux build.**
- **Google sign-in is the only way in** right now (no email/password) — people
  without a Google account can't sign up yet.
- **Two people per corner**, not families or groups.
- Google's OAuth branding verification may still be in progress; sign-in works.

## 13. Do NOT claim

- ❌ End-to-end / zero-knowledge encryption. (It's private per couple via RLS, but
  the provider can technically access stored data — do **not** say E2EE.)
- ❌ A mobile app, iOS/Android, or a browser-based version.
- ❌ Paid plans, teams, or group/family sharing.
- ❌ "Signed/verified by Apple/Microsoft."
- ❌ Any specific user counts, testimonials, or ratings unless you're given real ones.
