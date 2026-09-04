# LOCTITE PH Repair Platform — task.md

Source of truth: the BUILD PROMPT doc pasted into the originating chat, plus the
Claude Design handoff bundle in `project/` (read in full before any code was written —
see `DESIGN_HANDOFF.md`). This file tracks build progress per the spec's TASK SYSTEM
section so the build can resume from exactly here if the session ends.

## Stack decisions
- **Next.js 16 (App Router) + TypeScript**, Tailwind v4. Chosen over a plain Vite SPA
  because Netlify's official Next.js Runtime (`@netlify/plugin-nextjs`, already in
  `package.json`) turns `src/app/api/**/route.ts` Route Handlers into Netlify Functions
  automatically — satisfying the spec's "Netlify Function, Node/TypeScript, server-only"
  requirement for Grok calls without a separate `netlify/functions/` tree.
- Design tokens ported 1:1 from `project/_ds/modernist-.../styles.css` into
  `src/app/globals.css` (Tailwind `@theme inline`). Do not invent new colors/spacing —
  extend these tokens. Brutalist/editorial look: 0px radius everywhere, 2px hairline
  borders, Archivo 900 headings uppercase, accent red `#ec3013`.
- The design bundle itself (`Loctite Screens.dc.html`) is ONE continuous client-side
  state machine (screens: home → gallery → expand → upload → scan → detect → correct
  → describe → check → product → guide → value → near → shop → share, plus quick).
  We're porting that architecture faithfully as React state within the `/repair` flow,
  not fragmenting every micro-step into its own route (matches "recreate pixel-perfectly,
  don't copy internal structure, do reuse the design's own patterns").

## ⚠️ Known limitation of THIS session's own verification
This dev/build environment's outbound network is allowlisted (works: npm registry.
Blocked: fonts.googleapis.com, api.x.ai — confirmed via direct curl, HTTP 403 from an
org egress proxy). This is a restriction of the automated shell only, not of the app:
- `next/font/google` (Archivo) fails **only** when built from this automated shell.
  Confirmed the rest of the build is clean by temporarily swapping to a system font —
  full build succeeded. Netlify's build servers and the user's own normal terminal have
  full internet access, so this is expected to just work there. If it doesn't, fall back
  to self-hosting Archivo via `next/font/local` (download .woff2 into `src/app/fonts/`).
- **The Grok API calls (`/api/detect`, `/api/repair-search`) have not been executed
  against the live xAI API in this session** — same egress block. The code was written
  carefully against the current docs.x.ai reference (chat completions for vision,
  `/v1/responses` + `web_search` tool for search), but:
  - **`callGrokWebSearch`'s response-parsing is defensive/best-guess** — docs.x.ai didn't
    surface a concrete example response body for `/v1/responses` at fetch time. First
    real call should be inspected and the parsing in `src/lib/grok.ts` adjusted to match.
  - Model name defaults to `"grok-4"` (env override: `GROK_MODEL`) — confirm this is the
    right vision-capable model on your account; `grok-4.6` also appears in current docs.
  - **Action needed:** run `npm run dev` locally (outside any Claude-controlled shell) or
    deploy to a Netlify preview, then hit `/api/detect` with a real photo and confirm the
    JSON parses as expected. Both routes fail closed (return NEED_MORE_INFO /
    NO_RELIABLE_PRICE_FOUND / PRICE_COMPARISON_UNAVAILABLE) rather than crash or fabricate,
    so this is safe to test live even if the shape needs a tweak.
- Mapbox is unaffected — it's a public token used entirely client-side in the user's own
  browser, not from any of my restricted shells.

## Completed
- **TASK #1 (partial) — scaffold**: Next.js 16 + TS + Tailwind v4 scaffolded. Renamed to
  `loctite-ph-repair-platform`. `netlify.toml` (`@netlify/plugin-nextjs`), `.env.example`
  (names only, committed), `.env.local` (real keys provided by the user, gitignored —
  `.gitignore` updated to allow `.env.example` through the blanket `.env*` ignore).
  `mapbox-gl` + `@types/mapbox-gl` installed. Design tokens ported into `globals.css` +
  `layout.tsx` (Archivo via `next/font/google`).
  - ⚠️ **Not yet done**: `git init` / first commit (holding off — user hasn't asked for a
    commit yet per repo convention). Netlify site itself is not created/connected (no
    Netlify account access from this session) — user needs to connect the repo in Netlify
    and paste the same env vars into Site settings → Environment variables.
- **TASK #2 — schema**: `src/types/index.ts`. `Product`, `DamageAssessment` (incl.
  `DamageRegion` for the overlay contract), `MatchResult`, `RepairSession`,
  `RepairVsReplace`/`PriceListing`, `NearbyStore`, `RepairTemplate`, `AnalyticsEvent`.
- **TASK #3 — Henkel/LOCTITE knowledge base**: `src/data/products.ts`. 7 fully-documented
  products with real cited data (4 consumer: Super Glue Liquid Professional, Super Glue
  Ultra Gel Control, Power Grab All Purpose, Epoxy Instant Mix 5min; 3 industrial: LOCTITE
  401, 4902, 243) + 17 catalog stubs (real names/one-line descriptions scraped live from
  the PH industrial catalog's 5 category pages — Instant/Retaining/Structural/Light-curing/
  Windshield — via the in-app browser since those pages are JS-rendered and static fetch
  couldn't see them) with empty compatibility data so they can never wrongly match.
  - Windshield category on the PH site is actually **TEROSON** branded (Henkel's other
    brand), not LOCTITE — noted, not silently relabeled.
  - **PH retail pricing intentionally NOT hardcoded** — Shopee/Lazada prices change
    constantly and are JS-rendered (couldn't get a reliable current PHP figure this pass).
    Live pricing flows through `/api/repair-search` (TASK #10) at request time instead,
    which is the architecturally-correct place for it per the spec.
  - **Before shipping**: verify SKU sizes/pricing per the spec's own instruction to treat
    this as a "seed list, not final source of truth." The 17 stubs need their individual
    PDPs fetched and upgraded before they could ever be used in a real recommendation
    (right now they structurally cannot match anything — safe default).
- **TASK #4 — recommendation rules engine**: `src/lib/recommend.ts`. Fully deterministic:
  `checkRepairability()` (non-repair objects, low confidence, missing damage, safety-
  critical detection → gated to NOT_RECOMMENDED) then `matchProduct()` (hard material-
  compatibility gate, safety-critical products require `safetyCriticalApproved: true` on
  the product data itself, application match as a scoring signal, consumer products
  preferred). Returns `MatchResult` with opt-in `reasonChecks` for the "WHY?" UI and up to
  2 `alternatives` for the "Choose the right LOCTITE" side path. No AI-invented scores.
- **TASK #6 (partial) — Home screen**: `src/app/page.tsx` built to match the design's
  home screen (hero, headline, two CTAs, marquee of damage types, "your repairs" row).
  Tailwind, no inline styles. "Your repairs" row is still the design's static demo data —
  wire to real session state in TASK #13.
- **TASK #7 (partial) — Grok vision backend**: `src/lib/grok.ts` (`callGrok`, `extractJson`
  — defensive JSON extraction that returns `null` rather than throwing on malformed output)
  + `src/app/api/detect/route.ts`. Accepts `{ imageDataUrl, text, sessionId }`, calls Grok
  vision with a JSON-only system prompt, validates the returned `damageRegion` is a real
  0..1 box (rejects out-of-range/non-numeric → `null`), and — critically — Grok's output
  never decides repairability; `checkRepairability()` from TASK #4 does. Not yet wired to
  a client upload UI, and not yet live-tested (see limitation above).
- **TASK #10 (partial) — Grok web search backend**: `callGrokWebSearch()` in
  `src/lib/grok.ts` + `src/app/api/repair-search/route.ts`. JSON-only prompt asking for
  real listings only; returns `NO_RELIABLE_PRICE_FOUND` if Grok's search turns up nothing
  parseable, `PRICE_COMPARISON_UNAVAILABLE` if the Grok call itself fails. Never fabricates
  a price/shop/image/source. Does not yet own the repair-cost side of the math (per spec,
  that composes real/estimated LOCTITE pricing with this route's replacement price on the
  client) or PH-domain preference beyond prompt instruction. Not yet live-tested.

## Remaining (not started)
- TASK #1 rest: connect a Netlify site + env vars; `git init`/first commit when asked.
- TASK #5: full Sneaker Rescue vertical slice UI wired end-to-end (repairability check →
  recommendation → visual repair guidance → repair vs. replace → share) using real
  `/api/detect`, `recommend.ts`, `/api/repair-search`. This is the next highest-value
  piece — most of the backend it needs already exists.
- TASK #6 rest: template gallery + filters + remaining flagship templates (design has 8
  flagship + 16 mini templates fully speced in `Loctite Screens.dc.html`'s data — just
  needs porting to React).
- TASK #7 rest: client upload UI (take/upload photo → scanning animation → SVG overlay
  render from `damageRegion` → YES/NOT QUITE correction flow).
- TASK #8: Taglish free-text is already accepted by `/api/detect`'s `text` field and
  folded into the same Grok call — needs the client "what's wrong with it?" input screen.
- TASK #9: intent routing (careful/urgent/savings framing) — not started.
- TASK #10 rest: repair-cost-vs-replace UI screen (the "big moment"), wiring
  `/api/repair-search` output into it.
- TASK #11: Mapbox `Find Nearest` — package installed, style URL + public token already
  in `.env.local`/`.env.example`. Not yet built. Since this is client-side only it's
  unaffected by this session's egress limits — should be straightforward to build and
  test directly.
- TASK #12: Buy Online mock PDP.
- TASK #13: session history + share card.
- TASK #14: Kuya Lock dashboard + real event wiring.
- TASK #15: responsive/accessibility pass.
- TASK #16: final QA.

## API / environment requirements
See `.env.example`. `GROK_API_KEY`, `ELEVENLABS_API_KEY` (reserved, unused so far — no
feature in the spec actually calls it yet; don't wire a fake feature just to use it),
`NEXT_PUBLIC_MAPBOX_TOKEN` + `NEXT_PUBLIC_MAPBOX_STYLE` (public, client-side by design).
Set the same names in Netlify Site settings → Environment variables for Production +
Deploy previews + Branch deploys.

## File map so far
```
src/types/index.ts          shared schema (TASK #2)
src/data/products.ts        Henkel/LOCTITE knowledge base (TASK #3)
src/lib/recommend.ts         rules engine (TASK #4)
src/lib/grok.ts              server-only Grok client (chat + web search)
src/app/api/detect/route.ts        POST — vision damage detection
src/app/api/repair-search/route.ts POST — replacement price search
src/app/page.tsx             home screen (TASK #6 partial)
src/app/layout.tsx, globals.css    design tokens, fonts
project/                     original Claude Design handoff bundle (reference only)
DESIGN_HANDOFF.md            original Claude Design README
```

## Update — bug-fix pass (after first live check by user)

User ran the app for real and found two bugs I'm noting here so they're not repeated:
1. **Home hero used raw `cqw` (container-query width) units copied straight from the
   Claude Design prototype**, which was built for a fixed embedded preview frame, not a
   real full-width browser window. At real desktop widths this made the hero ~2x taller
   than the viewport, pushing the marquee and "your repairs" row below the fold. Fixed by
   capping hero height with plain `vh`-based Tailwind classes (`min-h-[46vh] md:min-h-[52vh]`)
   instead of `cqw`. **Lesson: don't port `cqw`/`cqi` values from the design bundle
   verbatim into full-page layouts — they assumed a bounded preview frame.**
2. **"TRY A REPAIR" / "UPLOAD YOUR ITEM" linked to `/repair`, which didn't exist yet** —
   a straight 404. I had built the backend (`/api/detect`, `/api/repair-search`) but not
   the page that calls it. Fixed by building the actual guided flow.

### TASK #5 (Sneaker Rescue vertical slice) — now functionally complete
`src/components/repair/RepairFlow.tsx` is a single client-side state machine (mirrors the
design bundle's own architecture: one continuous flow, not one route per micro-step) at
`/repair`, covering: gallery (filters + flagship/mini template cards, real data in
`src/data/templates.ts`) → upload → scan (calls `/api/detect`) → detect (renders the SVG
overlay from `damageRegion`, YES/NOT QUITE) → correct → describe (Taglish text input) →
check (repairability, calls `checkRepairability` client-side — safe, no secrets) →
product (calls `matchProduct` client-side, "WHY?" panel) → guide (4 steps) → value (calls
`/api/repair-search`, real two-number comparison, NO_RELIABLE_PRICE_FOUND /
PRICE_COMPARISON_UNAVAILABLE states wired) → near (static demo stores, map NOT yet wired
to Mapbox — still TASK #11) → shop (mock PDP) → share (share card). Template-picked items
(no photo) skip straight to `check` using a user-declared assessment rather than
pretending to run AI vision on a placeholder image — real photos go through
`/api/detect`.

**Not yet done in this pass:** Quick Fix mode / intent routing (TASK #9's "quick" screen
exists in the design but has no entry point in the UI yet), Mapbox map itself (TASK #11),
real session history (the "your repairs" row on Home is still static demo data), and a
dedicated responsive/accessibility pass (TASK #15) — the flow above uses responsive
Tailwind classes throughout but hasn't been audited screen-by-screen.

### A platform limitation worth knowing about
`device_bash` (my tool for running commands on your machine) **cannot keep a background
process alive between my tool calls** — I confirmed this directly: a `next dev` server
started with `nohup`/`setsid`/`disown` is gone (verified via `ps aux`) by the time my very
next command runs, even a few seconds later. So I can verify routes/content with `curl`
within a single call, but I cannot hand you a live self-hosted preview across turns, and I
cannot drive my own browser tool against a server I started, because it's already dead by
the next tool call. **This is why you need to run `npm run dev` yourself** — in your own
terminal it isn't tied to my tool-call lifecycle and stays up normally. If your terminal
from before is still open, Turbopack's file watcher should have already hot-reloaded these
fixes; otherwise just restart `npm run dev`.

---

## Update — image sourcing + gallery/layout bug-fix pass (2026-09-04)

Addressed every item from your last message with screenshots.

### 1. "Click START on any template, nothing advances"
**Root cause found:** picking a template inserts a new detail panel (photo + "WHAT
HAPPENED?" + START REPAIR button) **above** the template grid in the DOM. If you'd
scrolled down into the grid before clicking, that panel rendered off-screen, above your
current scroll position — it looked like nothing happened, but the panel (and the real
START REPAIR button) was there, just out of view.
**Fix:** `src/components/repair/RepairFlow.tsx` now attaches a ref to that panel and
calls `scrollIntoView({ behavior: "smooth", block: "start" })` whenever you pick a card,
so the panel — and its START REPAIR button — scrolls into view immediately.

### 2. "Why do only some cards show START?"
Flagship (big) cards showed a "START →" label; the 16 compact "mini" cards only showed a
"+" icon box, with no text affordance. Replaced the "+" icon with the same "START →" /
"SELECTED" label flagship cards use, so every template card now signals it's clickable
the same way.

### 3. Upload flow silently hanging
`runScan()` (the function that calls `/api/detect`) had no timeout — if the network or
Grok were slow/unreachable, the "SCANNING…" screen could sit there indefinitely with no
feedback. Added a 25-second `AbortController` timeout with a clear error message
("Detection timed out after 25s…") that now surfaces on the DETECT screen instead of an
infinite spinner.

**I also live-tested `/api/detect` and `/api/repair-search` against the real Grok API
using your key**, from a throwaway build outside this session's restricted mount (details
below) — both work end-to-end: a real photo of a cracked phone screen + Taglish text
("nabasag yung screen ng phone case ko") came back with a correct object/damage/material
read and a valid bounding box; a repair-vs-replace search for "Nike Air Force 1 sneaker"
came back with three real, cited PH listings (nike.com/ph, lazada.com.ph) and a real price
range. Your Grok integration is functionally confirmed working, not just structurally
sound.

### 4. Home page — placeholder images filled in
- **Hero carousel** (`src/components/HeroCarousel.tsx`, new): the old placeholder text
  box ("Photo carousel — broken sneaker / …") is now a real auto-rotating 3-image
  carousel with dot indicators, showing 3 LOCTITE products. I downloaded and
  pixel-sampled the candidate product photos to check blue-dominance before picking:
  **Super Glue Liquid Professional** (~61% blue pixels — most blue), **Power Grab All
  Purpose** (~46%), and **Epoxy Instant Mix 5 Min** (~39%) — the 3 most-blue of the 4
  sourced LOCTITE product photos, per your "all blue, or best-effort blue" instruction.
  Sourced from real Amazon.com listing photos (verified reachable, no watermark).
- **Product/shop screens**: `src/data/products.ts` now carries a real `imageUrl` for all
  4 consumer products (same sourcing pass) — the PRODUCT and SHOP screens in the repair
  flow show the real bottle/tube photo instead of a text placeholder.
- **Template gallery**: all 8 flagship template cards (Sneaker, Cosplay, Bag, Phone,
  3D Print, Backpack, Frame, Moto) now show a real, no-watermark stock photo (sourced from
  Wikimedia Commons, openly licensed — credit stored per-template in `imageCredit` for a
  future attributions footer) instead of a "Drop a ___ photo" placeholder. The picked-card
  detail panel also shows the real photo. The 16 compact "mini" cards intentionally stay
  text-only (that's the original design's mini-card format) but now carry the same START
  affordance as flagship cards (see #2).
- `RepairTemplate` and `Product` types (`src/types/index.ts`) gained optional
  `imageUrl`/`imageCredit` fields to carry all this — everything falls back cleanly to the
  old placeholder text if a URL is ever missing, so nothing can render blank.

### 5. "Huge white space below" on Home
**Root cause:** `body` is `flex flex-col min-h-full` (≥100vh) in `layout.tsx`, but the
Home page's own content (header + hero + marquee + "your repairs" row) wasn't tall enough
to fill 100vh after the earlier `vh`-cap fix — nothing was set to grow, so the leftover
space below the "your repairs" row rendered as dead white space.
**Fix:** `src/app/page.tsx`'s root is now `flex flex-col min-h-screen` and the hero grid
is `flex-1 min-h-[420px]` — header, hero, marquee and "your repairs" now always fill
exactly the viewport height (hero grows/shrinks to take up whatever's left) with a 420px
floor so it never gets crushed on short viewports. No forced scroll, no dead space, on any
window size.

### Verification this pass
Because this session's direct access to your connected folder blocks file *deletion*
(`.next` cache, git lock files) unless you approve it — separate from the earlier
"can't keep a background server alive between my commands" limitation — I copied the
current source (same files now in your folder) into a scratch location this session can
freely build in, and ran the full pipeline there against your real `.env.local`:
- `npx tsc --noEmit` — 0 errors
- `npx eslint src` — 0 errors, 9 pre-existing warnings (all `@next/next/no-img-element`,
  intentionally using plain `<img>` instead of `next/image` — deliberate, see below)
- `npm run build` (production/Turbopack) — **succeeded cleanly**: `/` prerendered static,
  `/repair` + both API routes built as dynamic functions, exactly what Netlify's
  `@netlify/plugin-nextjs` expects.
- `npm run start` + live `curl` against `/`, `/repair`, `/repair?screen=upload` — all 200,
  confirmed the hero carousel images, all 8 flagship template images, and 24 START
  labels (8 flagship + 16 mini) are actually present in the rendered HTML.
- Live end-to-end test of `/api/detect` and `/api/repair-search` against the real Grok API
  (details in #3 above).

**Why plain `<img>` and not `next/image`:** intentional, carried over from the original
build — `next/image` requires every remote image host to be allow-listed in
`next.config.ts` ahead of time, and a missed host is a hard runtime error in production,
not a warning. Since these images come from Amazon/Wikimedia CDNs outside our control,
plain `<img>` avoids that entire class of Netlify "image error" you asked me to rule out,
at the cost of the 9 harmless lint warnings above (no `next/image` optimization/blur-up).

### Still open
- Git wasn't initialized as a usable repo yet — a stale `.git/index.lock` from an earlier
  attempt is still there, and this session's permission to delete files in your folder
  behaved inconsistently (worked once, then failed again on a second file) rather than
  being reliably granted. Not blocking anything — your project runs fine without git — but
  if you want version control, easiest is to delete the `.git` folder yourself and run
  `git init` fresh from your own terminal.
- Wikimedia template photos and Amazon product photos are hotlinked (not downloaded into
  the repo), which keeps the repo small and is fine for a prototype, but means Netlify (or
  anyone) needs internet access to those two CDNs for images to show — worth downloading
  them into `/public` before a "real" launch, and adding a small credits line for the
  Wikimedia-sourced photos (their licenses require attribution).
- Everything else from the original pending list (Quick Fix mode entry point, real Mapbox
  map instead of the labeled demo placeholder, real session history) is unchanged from
  before this pass — not part of what you flagged this round.
