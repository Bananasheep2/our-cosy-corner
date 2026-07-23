# Design brief — Our Cosy Corner marketing site

*Paste this whole document as the prompt. It is written to be self-contained.*

---

You are the design lead for **Our Cosy Corner**, a small independent product. Redesign its
marketing website. Read every section below before proposing anything — several constraints
are commercial or legal, not aesthetic, and breaking them costs the owner real money and time.

## 1. The product

Our Cosy Corner is a **free desktop app for couples** (macOS + Windows, built in Electron).
Exactly two people share one private "corner" — a calm workspace where they keep the
practical and the tender side by side: plans for next year, a rich-text note, a shared to-do
list, photos, PDFs, links, CVs, and letters they are not ready to send yet.

How it works, factually:
- Sign in with Google. One person creates a corner and gets a **6-character invite code**;
  their partner enters that code to join. Hard cap of two people per corner.
- Everything syncs live between both computers (Postgres + realtime + private file storage
  on Supabase, isolated per couple by row-level security).
- Content lives on **pages and sub-pages** in a sidebar tree, each page holding **blocks**
  (rich text, to-dos, sliders, images, PDFs, files, bookmarks, countdowns, sticky notes).
- **Six built-in themes** plus a customiser (accent colour, background, font, corner radius).
- Export a corner to JSON and restore from that backup. In-app auto-update on Windows.
- No ads, no analytics, no tracking, no paywall. Free forever.

It was built by one person, for herself and her boyfriend, then opened to everyone. That
origin matters to the tone: this is a personal object, not a startup landing page.

## 2. Audience and voice

Couples, mostly non-technical, deciding in under a minute whether to download a ~120 MB app
from a developer they have never heard of. The site must feel **warm, calm, and trustworthy**
— an unsigned indie desktop app has a trust problem, and the design is what solves it.

Voice: affectionate, plain, unhurried. Lowercase warmth in places is fine. Never corporate,
never salesy, never twee. No exclamation marks. **No emoji anywhere** (see §6).

## 3. Non-negotiable constraints — read twice

**3a. Google OAuth verification is pending and has already been rejected once.**
The app signs users in with Google, which requires Google to approve the consent screen.
The reviewer visits the live home page. It was rejected for exactly two reasons, both now
fixed — **do not undo either**:

1. *"Your home page does not explain the purpose of your app."* This sentence must remain on
   the home page, above the fold, in plain prose, essentially verbatim:
   > Our Cosy Corner is a free desktop app for couples. Two people share one private
   > workspace to plan together, keep notes and to-do lists, and save photos, files and
   > links — synced live between both computers on macOS and Windows.
   You may re-typeset it. Do not make it poetic, do not shorten it into a tagline, do not
   move it below the fold, and do not hide it behind an interaction.
2. *"The app name configured for your OAuth consent screen does not match the app name on
   your home page."* The product name must appear prominently and be rendered exactly
   **`Our Cosy Corner`** — Title Case, three words, no stylisation, no lowercase logotype,
   no "OCC" monogram substituting for it in the header. It currently sits in the eyebrow
   directly above the H1; keep it at least that prominent.

There is also a supporting `#what` section ("What Our Cosy Corner does") with three plain
statements. Keep a plain-language explanation of that kind somewhere high on the page.
`/privacy` and `/terms` must stay at those exact paths and stay reachable from the footer —
they are submitted to Google as the privacy policy and terms URLs.

**3b. Download plumbing must keep working.**
- `app/downloads.ts` is the single source of truth for the three installer URLs and the
  version string. Do not inline URLs anywhere else, and do not change the filenames — they
  are matched character-for-character by the app's auto-updater.
- Installers are served from a Cloudflare R2 bucket at `downloads.ourcosycorner.com`.
  **Never put installers in `public/`** — Cloudflare caps static assets at 25 MB and the
  files are ~100–125 MB each. `public/downloads/` is gitignored for this reason.
- The primary hero button detects the visitor's OS and reads "Download for macOS" /
  "Download for Windows" (falling back to "Download the app"), and links to `/download`
  rather than downloading directly — the browser cannot tell Apple Silicon from Intel, so
  the user picks on that page. Preserve this behaviour and its no-hydration-mismatch
  implementation.
- `/download` must keep: three labelled builds (Apple Silicon, Intel, Windows), the
  first-launch security instructions (Gatekeeper "Open Anyway" on macOS 15, right-click →
  Open on 13/14, the `xattr -cr` fallback, SmartScreen "More info → Run anyway" on Windows),
  and release notes. Those instructions are the difference between a working download and a
  confused user, so give them real design attention rather than burying them.

## 4. Technical environment

- **vinext** (Vite + Next-style App Router, React 19, TypeScript) deployed to **Cloudflare
  Workers**; `worker/index.ts` also serves the R2 download route and a www→apex redirect.
- Routes today: `/`, `/download`, `/privacy`, `/terms`, `/about`, `/pricing`.
- All styling lives in **`app/globals.css`**, currently written as very long single-line
  rules. You may restructure it for readability, but keep it one stylesheet and keep
  Tailwind's `@import "tailwindcss"` line intact.
- `app/components/Stars.tsx` is a client component holding the scroll system (see §7).
- Build and deploy: `npm run build` then `npx wrangler deploy`. Keep the built client bundle
  small — it is currently ~880 KB total.
- `tests/rendered-html.test.mjs` renders the built worker and asserts: the hero headline
  text, a `/download` link and `/demo.gif` on `/`; all three installer hrefs on `/download`;
  and the support email on `/privacy` and `/terms`. If your redesign changes that copy,
  update the test to match — do not delete the test.

## 5. Colour system

Five brand pastels were chosen by the owner. **Critical: none of them can carry text or act
as a button fill.** White on the raw blush scores 1.69:1 — a hard accessibility failure. The
ink and accent below are therefore derived in-family and contrast-verified. Use these tokens:

| Token | Hex | Role |
|---|---|---|
| `--cream` | `#f8edeb` | seashell — main page background |
| `--bg-2` | `#fcd5ce` | almond silk — alternating section wash |
| `--panel` | `#fffaf9` | lifted card surface |
| `--panel-2` | `#f9dcc4` | powder petal — nested surfaces, pills |
| `--ink` | `#4a2b26` | body text — 11.0:1 on cream |
| `--soft` | `#8a5f56` | muted text — 4.75:1 on cream |
| `--clay` | `#b8543f` | buttons, links, accents — white on it is 4.64:1 (AA) |
| `--accent-soft` | `#ffb5a7` | powder blush — tints, glows, selections only |
| `--peach` | `#fec89a` | peach glow — highlights, secondary glows |
| `--line` | `#f0dcd6` | borders and dividers |

Rules: body text is `--ink`; never place text on `--accent-soft` or `--peach` unless it is
`--ink`; any new colour must be checked to 4.5:1 for body text and 3:1 for large text. The
palette is deliberately low-contrast and warm — earn hierarchy through **scale, weight and
whitespace**, not through darker colours.

## 6. Typography

- **Headings: EB Garamond** (serif, Google Fonts). **Body and UI: Inter.** These match the
  desktop app exactly; keep them so site and app feel like one product.
- Loaded via a single Google Fonts `@import` with `display=swap`.
- EB Garamond is narrower and lighter than a display serif — set headings at weight 600, and
  do not track tighter than about `-1.5px` or the letterforms collide.
- Small caps / eyebrow labels: Inter, uppercase, `letter-spacing: .08em`.
- **No emoji anywhere on the site.** Every icon is an inline SVG line icon: ~1.5–1.6px
  stroke, `currentColor` so it inherits the palette, `aria-hidden="true"`, sized in `em`.
  Typographic arrows (→ ↓) are fine and currently used in buttons.

## 7. Motion

A scroll system already exists and should be preserved in spirit:
- A fixed field of ~26 star/sparkle glyphs in three parallax layers that drift upward as the
  user scrolls, at different rates, with a slow twinkle.
- Section and card reveals: elements with `.rv` fade and rise as they enter the viewport,
  staggered within grids.
- Small parallax on the floating decorative emblems around the hero.
- **Everything must be disabled under `prefers-reduced-motion: reduce`, with content fully
  visible** — never leave anything stuck mid-animation.
Keep motion gentle and slow. This is a calm product; nothing should bounce or snap.

## 8. Content inventory (home page, current)

In order: nav (brand + Pricing + About) → hero (eyebrow = product name, H1 "Keep your little
*world* close.", the plain purpose paragraph, OS-aware download button + "See how it works")
→ hero visual (`/demo.gif`, an 880px-wide 461 KB screen recording of the real app: adding a
note, typing, switching themes, moving between pages — treat it as the primary proof the
product is real) → `#what` (three plain statements) → `#how` intro split → `#spaces` (two
large cards: the shared dashboard, and each person's private space) → `#memories` features
(three cards) → pull quote → closing CTA → footer (privacy, terms, support email
`ourcosycorner.help@gmail.com`).

## 9. Known defects to fix

1. **The two `#spaces` cards are broken.** `.space-copy` is `width: 58%` while `.mini-window`
   is `width: 61%`, `position: absolute; right: -32px` inside an `overflow: hidden` card —
   119% of the width across two elements, so the body copy collides with the mock window and
   the window is clipped mid-content. Rebuild this section's layout properly; the intent is
   "text on the left, a peek of an app window bleeding off the right edge," which needs a
   real two-column arrangement with the bleed as a deliberate, contained effect.
2. The mock window contents inside those cards were designed at a fixed size and do not
   reflow; below ~900px they degrade badly.
3. The three feature cards, the intro split and the CTA are visually plainer than the rest of
   the page and read as unfinished next to the hero.
4. Downloading a ~120 MB installer shows no progress indication (a server limitation, not
   fixable in CSS) — so the download page should set expectations in words instead.
5. General: the page is long and its rhythm is uneven — several sections use near-identical
   vertical padding and similar card treatments, so nothing guides the eye.

## 10. What good looks like

- A visitor understands in five seconds what this is, that it is free, and that it is for two
  people — and a Google reviewer can find a plain statement of purpose without scrolling.
- The demo GIF is the hero of the page, framed like a real application window.
- Trust is designed, not claimed: the privacy stance, the two-person cap, and the
  first-launch warnings are handled with care rather than hidden.
- It looks like the app. Someone who downloads it should feel continuity, not a bait-and-switch.
- Fully responsive from 320px up; the current single breakpoint at 760px is not enough.
- Accessible: AA contrast throughout, visible focus states, real landmarks and heading order,
  every decorative SVG hidden from screen readers.

## 11. Deliverable

Produce the actual implementation — edits to `app/page.tsx`, the other route files,
`app/globals.css`, and `app/components/Stars.tsx` as needed — not a mockup. Then:

```
cd website && npm run build && npm run test
```

Both must pass. Report: what you changed and why, how the `#spaces` cards were rebuilt, any
contrast decisions you made, and confirmation that the exact purpose sentence and the
Title Case `Our Cosy Corner` brand are still present in the rendered HTML of `/`.

Do not change: `app/downloads.ts` URLs or filenames, the R2/worker download route, the
`/privacy` and `/terms` paths, or the support email.
