# Our Cosy Corner — Marketing Brief

A factual, specific rundown for a marketing/publicity agent. Everything here is
true of the shipped product as of version **1.0.5 (macOS)** / **1.0.5 (Windows)**, July 2026. A "Do not claim" section at the end lists
things that are *not* true — respect it, because overclaiming on privacy or
platforms will backfire.

> **What changed in 1.0.5 (important — the product just widened):** Our Cosy
> Corner is no longer couples-only. A corner can now be a **couple, a group of
> friends, or a family** (up to 8 people), chosen when you create it, and each
> type gets its own look and wording. Email sign-up was added alongside Google.
> If you have older material, it will be couples-only — rewrite it.

---

## 1. One-liner & elevator pitch

- **One-liner:** Our Cosy Corner is a free desktop app where a small group —
  a couple, some friends, or a family — shares one private, cosy workspace of
  plans, notes, to-dos, photos, files and links that syncs live between everyone's
  computers.
- **Elevator pitch:** It's a Notion-style shared home for the people closest to
  you. Everyone gets their own private page, you all share one together, and you
  can nest as many pages inside as you like. Anything one person writes shows up
  on everyone else's screen within seconds. It's warm and tactile rather than
  corporate — paper textures, soft type, seven hand-tuned themes — and it's free,
  with no ads and no tracking.

## 2. What it is

A **native desktop application** (built with Electron) for **macOS and Windows**.
It is a small-group shared workspace / planning hub / digital scrapbook. Think
"Notion, but built for the handful of people you actually live your life with,
and cosy instead of corporate."

It is **not** a phone app, **not** a website you log into, and **not** a big-team
tool. A corner holds between 2 and 8 people.

## 3. Who it's for

Three named audiences, and the product asks which one you are when you create a corner:

- **Couples** — the original audience, still first-class (a corner set to Couple
  holds exactly 2).
- **Friends** — a group chat's worth of people who actually want to plan things:
  trips, house shares, projects. Up to 8.
- **Families** — parents and kids/siblings keeping plans, lists and photos in one
  place. Up to 8.

Skews young adult and teenage, but works for any age. **Long-distance
relationships and long-distance friend groups** are a standout segment: live sync
between separate computers is the single biggest practical hook for people who
don't share a home.

## 4. The core concept (the thing that makes it different)

**Ownership is the signature idea.** The sidebar is organised by whose things are
whose:

- **Shared** (called "Ours" for couples, "Home" for families) — the group
  dashboard and any shared pages.
- **Your space** ("Your side" for couples) — your own private page.
- **One zone per other person**, labelled with their name — "Robin's space".

So the app always answers "what's ours, what's mine, what's theirs." Your private
pages are hidden from everyone else's dashboard. This "shared home + a nook that's
just yours" framing is the emotional centre of the product — use it.

## 5. Category personalities (new — good story material)

Each corner type has its own default look and voice:

| Type | Default theme | Feel |
|---|---|---|
| **Couple** | Cherry Blossom (soft pink) | intimate, warm |
| **Friends** | Clear Harbour (blue) | bright, easy |
| **Family** | Evergreen (sage green) | homey, settled |

Wording adapts too — a family corner's shared page is called "Our family plans",
a friends corner invites "your friends". Everything is still fully
re-customisable afterwards.

## 6. Full feature list (be specific — these all exist)

**Pages**
- One shared dashboard, plus a private personal page for every member.
- Unlimited **nested pages and sub-pages** (a Notion-style tree).
- Per-page icons, drag-to-reorder, trash with restore.
- **Quick switcher** (Cmd/Ctrl+K) to jump to any page.

**Content blocks** (mix any of these on a page):
- **Note** — rich text with Title / Heading / Small heading / Body, four font
  styles (Clean, Classic, Handwritten, Marker), and text colours.
- **To-do** — checkable shared lists.
- **Photo** — images.
- **Countdown** — days until a big day (a trip, a birthday, a reunion).
- **Sticky note** — a small coloured note.
- **Little note** — a longer written note to leave for the others.
- **PDF** — viewed inline in the app.
- **File** — attach anything (docx, xlsx, etc.).
- **Link** — a bookmark to anything on the web.
- **Divider** — a decorative separator.
- Blocks can be **dragged to reorder** and **resized** in width.

**Look & feel**
- **Seven themes:** Parchment, Peach Blossom, Cherry Blossom, Evergreen,
  Frosted Petal, Clear Harbour, Velvet Night (dark).
- **"Make it yours" customiser:** accent colour, background, font, corner
  roundness. Everyone in the corner sees the same customised world.

**Togetherness**
- **Live sync** between everyone's computers, updates in seconds.
- **Presence:** each person's avatar and a short "mood" word.
- **Joining** via a simple 6-character invite code — no friending, no phone numbers.
  The code stays visible until the corner is full.

**Trust & control**
- **Local-first:** works fully offline; everything is saved on your own computer,
  and cloud sync is automatic once you're signed in.
- **JSON export + restore** — your data is portable and you can back it up.
- **Delete-account** support.
- **Auto-update:** Windows updates itself in place; macOS notifies you.

## 7. Signing in (new)

Two ways in:
- **Google account**, or
- **Email + password** — sign up, confirm your email via a link, then sign in.
  There's a forgot-password flow that resets via a link on the website.

## 8. Platforms, pricing, how to get it

- **Website / download:** https://ourcosycorner.com  (download page at /download)
- **macOS:** Apple Silicon (M1+) and Intel builds, version **1.0.5**. ~120 MB .dmg.
- **Windows:** 10/11,  version **1.0.5**
  
- **Price:** **Free.** No paid tier exists yet. No ads.

## 9. Privacy & security model (state this carefully)

- Each corner's data is **isolated at the database level** via row-level security —
  only the people in that corner can read its contents.
- **No ads, no tracking, no selling data**, no third parties reading your content.
- Google sign-in requests **only** name, email and profile photo.
- Data is stored in the app's cloud backend (hosted Postgres) to enable sync;
  it is **private per corner**, but it is **not** end-to-end encrypted (see below).

## 10. Tech stack (for credibility / dev-audience angles)

Electron desktop app; Postgres backend with row-level security and realtime sync;
Google and email auth. Marketing site on Cloudflare. Self-hosted fonts, strict
content security policy. Useful for indie-dev or "built properly by one person"
angles.

## 11. Positioning vs alternatives

- **vs Notion / Trello:** built for a handful of people who know each other,
  ownership-aware, cosy not corporate, free, desktop-native, no workspace admin.
- **vs couple apps (Paired, Between, Cupla):** those are mobile relationship apps
  centred on chat, prompts and calendars, and they're couples-only. Our Cosy
  Corner is a **desktop workspace and scrapbook** for couples *or* friends *or*
  families, with live sync between computers.
- **vs group chats:** a chat loses everything you decided. This keeps the plan,
  the list, the file and the photo in one place you can come back to.
- **vs shared Google Docs / Apple Notes:** purpose-built and warm — block editor,
  themes, countdowns, sticky and little notes, per-person private spaces.

## 12. Brand & voice

- **Name:** Our Cosy Corner. Always Title Case. Domain: ourcosycorner.com.
- **Logo:** a stylised house in warm parchment/terracotta tones. (The old heart
  mark has been retired — the product is no longer couples-only. **Do not use
  hearts or romantic imagery in any campaign.**)
- **Aesthetic:** warm parchment/paper, stationery-like, tactile, calm. Typography
  is IBM Plex Sans (UI) + EB Garamond (reading text). **No emoji** in the product UI.
- **Tone:** gentle, intimate, unhurried, second-person — "your little world," "a
  nook that's just yours." Warm but not romantic. Never salesy or hypey.
- **Feeling to sell:** safety, warmth, a small private world for your people.

## 13. Suggested angles / taglines (starting points, not final)

- "Keep your little world close." (the site's current headline)
- "A cosy corner of the internet, just for your people."
- Friends: "The group chat forgets. Your corner doesn't."
- Family: "One home screen for the whole house."
- Couples/LDR: "Two computers, one cosy room. Sync everything, instantly."

## 14. Current status & honest limitations (hand these off too)


- **Not notarised by Apple / not signed with a paid Windows certificate**, so
  first launch shows a Gatekeeper / SmartScreen "unrecognised app" warning. The
  download page explains the "Open Anyway" / "More info → Run anyway" steps. Be
  ready to reassure — normal for a new indie app, not a red flag.
- **No mobile app, no web version, no distributed Linux build.**
- **2 to 8 people per corner** — not for large teams or communities.
- Google's OAuth branding review may be re-running after the repositioning; sign-in
  still works.

## 15. Do NOT claim

- ❌ End-to-end / zero-knowledge encryption. (Private per corner via row-level
  security, but the provider can technically access stored data — never say E2EE.)
- ❌ A mobile app, iOS/Android, or a browser-based version.
- ❌ Paid plans, teams, or unlimited group sizes.
- ❌ Anything version-specific without checking /download first — macOS and
  Windows now ship together, but that's worth re-confirming before a campaign.
- ❌ "Signed/verified by Apple/Microsoft."
- ❌ Any specific user counts, testimonials, or ratings unless given real ones.
- ❌ Hearts / romantic framing — the product deliberately moved away from it.
