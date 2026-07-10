# Website Refresh — Journal Product, App Tabs, Availability, Animation

Date: 2026-07-10
Repo: `whitejournal-website` (plain HTML/CSS/JS, Vercel auto-deploy on push to `main`)
Primary file: `index.html`

## Purpose

Three changes to the marketing homepage:

1. Separate **White Mirror — The Journal** as White Mirror Labs' flagship first product, with its own homepage section and a brand animation.
2. Reflect availability accurately: the journal is **in production, not shipping yet** — pre-order stays open (XPay shop remains live).
3. Update the app-features section so it matches the **current shipped app** (4 bottom-nav tabs, not the 6 currently advertised).

## Current state (baseline)

- Hero sells the journal as **available now / "Buy the Journal" / shipping across Egypt**.
- Features section = **6 cards**: Today, Insights, Music, Circles, Meditate, You.
- Real app bottom nav (`whitemirror-app/lib/shared/widgets/bottom_nav_shell.dart`) = **4 tabs**:
  - `/home` → Today
  - `/mood-map` → Map
  - `/breathe` → Meditate
  - `/settings` → You
- Insights = real screen, gated on `journal_unlocked`, **no longer a bottom tab**.
- Music = persistent mini-player bar, **never a tab**.
- Circles = **does not exist** in the app (only a private "friends" layer exists).
- Map = real tab, **missing from the website**.

## Decisions (locked with user)

| Topic | Decision |
|-------|----------|
| Availability | **Pre-order live** — reframe as "in production", keep XPay shop working. |
| Animation | **Code-authored SVG/CSS is primary** (built directly, on-brand, instant). Higgsfield/AI video is an optional cinematic layer: wire a `<video>` slot + write shot briefs; user renders and drops in. |
| Journal placement | **New homepage section**, inserted after hero, above the app section. |
| App tabs | **4 real tabs only** (Today, Map, Meditate, You). Fold Insights + Music in as woven features. Drop Circles. |

## Design

### 1. Availability → pre-order (site-wide copy)

Reframe journal as *in production, pre-order open*. Shop/XPay path stays live and purchasable.

Copy changes:
- Hero notice (`index.html`, `.hero-notice`): journal is in production; pre-order today, ships with the first run. App = waitlist (unchanged intent).
- Primary CTAs: "Buy the Journal" → **"Pre-order the Journal"** (hero, CTA band, footer).
- Nav CTA: "Buy Now" → **"Pre-order"** (desktop `.nav-cta` + mobile `.mobile-cta`).
- CTA band sub-line + waitlist section sub-copy: align to production/pre-order language.
- `shop.html`: add a matching pre-order line near the buy button; keep the XPay flow live and unchanged functionally.

Tone: confident, not apologetic. "In production" reads as anticipation, not delay.

### 2. New "The Journal" section

Insert a new `<section>` immediately after the hero `<section>` and its divider, **before** the `#features` (app) section. Rationale: the journal is the first product; the app is the companion, so the journal leads.

Contents:
- Section label: "The Product" / "The Journal".
- Headline + short product story: physical 90-day guided journal, built on the M.I.R.R.O.R. method, first release = the Foundation edition (Discover Yourself).
- **Animated visual** — inline code SVG: a journal that breathes + a mirror circle that ripples/shimmers + five phase dots filling I→V (refined from the approved demo). Greyscale, brand type, `prefers-reduced-motion` respected.
- Optional Higgsfield `<video>` slot: a container (`.journal-film`) with `poster` fallback, hidden/degraded until a rendered file exists — so the code SVG carries the section on its own today.
- Pre-order CTA + a small "in production" note.

New styles live in `styles.css` under a clearly commented block. Section is responsive: visual and copy stack on mobile.

### 3. App tabs → 4 real tabs

Replace the 6-card `.features-grid` block. Header "Six tabs. / One complete practice." → **"Four tabs. / One complete practice."**

Cards:
- **Today** (`☀`) — one prompt, six moods, encrypted entry, camera scan of the physical journal.
- **Map** (`Icons.route` equivalent glyph) — the 90-day mood grid, phase grouping, your arc at a glance. *(new card)*
- **Meditate** (`○`) — guided/silent/with-music breathing, three durations, 4-4-6 box breathing.
- **You** (`◎`) — streak, arc, 90-day progress, account.

Folded-in (woven features, not tabs):
- **AI Insights** — reads across entries and surfaces what's shifting; unlocks with the journal. Mentioned inside the Today or Map card copy, or as a one-line "woven throughout" note.
- **Music** — curated channels that play through the whole session; mentioned in the Meditate card copy.

Removed: **Circles** card (feature does not exist in the shipped app).

### 4. Animation implementation

- Code SVG/CSS animations authored inline in `index.html`; keyframes in `styles.css` (or scoped `<style>`), `transform-box: fill-box` for local origins.
- Scroll-reveal: add an `IntersectionObserver` in `main.js` that adds an `is-visible` class to sections/visuals as they enter the viewport (fade/translate-up). Reuse across the new journal section, method, and phases.
- Accessibility: wrap motion in `@media (prefers-reduced-motion: reduce)` to disable/replace with a static end-state.
- Higgsfield layer: one `<video>` slot in the journal section with `poster`, `muted`, `loop`, `playsinline`, `preload="none"`; degrades gracefully when no source is present. Shot briefs delivered as a separate markdown doc (`docs/higgsfield-briefs.md`) with prompt + duration + mood per shot (journal-on-desk, app-in-hand, mirror concept).

## Files touched

- `index.html` — hero copy, new Journal section + SVG animation, app-tabs rewrite, CTA/waitlist copy.
- `styles.css` — Journal section, animation keyframes, scroll-reveal states, video slot.
- `main.js` — IntersectionObserver scroll-reveal.
- `shop.html` — pre-order copy line (flow unchanged).
- `docs/higgsfield-briefs.md` — shot-by-shot Higgsfield prompts (new).

## Out of scope

- No change to the M.I.R.R.O.R. acronym wording (site uses Mindfulness/Inquiry/…; app uses Moment/Identify/…). Noted as a known discrepancy, left as-is.
- No change to the XPay payment integration logic.
- No app-side (`whitemirror-app`) changes.

## Success criteria

- Homepage leads hero → **Journal section (with animation)** → App (4 accurate tabs) → Method → Phases → CTA → Waitlist → Contact.
- No copy claims the journal is shipping/available now; pre-order path works.
- App-features section names only features that exist in the shipped app; no Circles.
- Animations run in code with no external dependency; reduced-motion respected; a Higgsfield `<video>` slot is ready for later drop-in.
