# KeeperHQ — context for Claude

A commissioner tool for fantasy keeper leagues. Web app, React + Vite,
deployed via Vercel from `bshiroky/keeperhq`. Workflow now uses one
`claude/<short-name>` branch per feature off `main` (e.g.
`claude/keeper-grid-scroll` for the grid scroll/snap fix). PR from
branch → user merges → start next branch off main. Don't push to
main directly.

## Recent shipped work (off main)

Independent of the design-system rollout snapshot below, several
features have shipped through their own branches (all merged):

- **PR #4 (merged):** Real client-side routing via `react-router-dom`
  v7. See the **Routing** section for the route table.
- **PR #5 (merged):** Restructured payouts to `{standings: [{place,
  phase, amount}], other: [{label, amount}]}` with an edit/view
  toggle on the Prize Structure card. See the **Payouts model**
  section.
- **PR #6 (merged):** Keeper grid horizontal-scroll fixes —
  `scroll-padding-left: TEAM_W` so snap-align works with sticky
  columns, one-column-per-click chevron, stretch-vs-scroll mode based
  on whether K columns fit, header-bg parity, and an empty-state when
  there are no teams or no keeper slots.
- **PR #7 (merged):** Keeper cell redesign — bordered two-line cards
  (name + single value), per-league grid accent (blue snake / orange
  auction), expiring pink-tint + `Final yr` pill, outgoing-only trade
  shown as a `⇄` swap badge with a shared-Tooltip hover, full-width
  "+ Add" cells, Edit-button balance, and long-name truncation. See
  the **File map** entry for `OverviewTab.jsx`.
- **PR #8 (merged):** Keeper-cell height fix — expiring cells no
  longer render taller than normal cells (the `Final yr` pill's
  Tooltip trigger is `display: inline-flex` so its line-box doesn't
  inflate line 2). All cell states share one height.
- **PR #9 (merged):** Roadmap/docs expansion in CLAUDE.md (backend +
  multi-user reframe, Open items, housekeeping). Docs only.
- **PR #10 (open):** Create-League wizard — a 4-step flow
  (Basics → League Format → Teams → Review) at `/new` that writes a
  real league to localStorage (the `src/data.js` shape) and routes
  into it. Replaces the `AddLeagueSlot` `alert()` placeholder.
  `useReducer` state; three-column card (left rail · form · live
  preview). The live-preview column is the **real** `TradingCard`
  (newly extracted into `components.jsx`, driven by a
  `state='building'|'ready'` prop); the Step-2 sample cells are the
  **real** `SampleKeeperCell` (`src/tabs/keeper-grid-variants.jsx`,
  shared with the keeper grid). New league fields: `commissionerTeamId`,
  `commishFee: 0`, `createdAt`, and `teams[0].isCommissioner`. Per
  scope: no keeper round-cost UI, no commissioner-reassignment UI
  (auto team #1), and no season selector (a sensible default season is
  stored under the hood). Addresses Open item #16.

## Resume here (design-system rollout — paused snapshot)

> The section below is the snapshot from when the design-system
> rollout was paused after HomeView. Subsequent work (above) has
> shipped independently. The rollout has **not** been resumed in
> session; check with the user before assuming where it stands.

**Branch tip at pause:** `4b519cc` (clean working tree, before the
routing / payouts / grid work above).

**Design-system rollout, paused after HomeView.** Token vocabulary
lives in `makeTheme` + the module-scope `tokens` constant in
`src/components.jsx` — see the Design system section below for the
full reference. Through the rollout so far we've made four
self-corrections to the system (typography weights, sport border
alpha, theme-invariant token extraction, sub-pixel rounding to scale).
That pattern continues — pixel shifts during a migration mean the
token is wrong, not the migration.

**Steps complete:**

- **Step 1**: six leaf primitives (`StatBox`, `SportBadge`,
  `DraftBadge`, `StatusPill`, `Tag`, `ExpiringDot`) consume tokens.
  Only deliberate visual change was `StatBox` sub-text 11→12px.
- **Step 2 (HomeView)**: full redesign to the trading-card direction
  (`4b519cc`). Pixel-perfect to the Claude Design prototype per user
  visual review on the Vercel preview. See Critical decision #9 for
  the card model and #8 for the PackStats KPI strip.

**Tokens added during step 2:**

- `typeHeadingHero` (22/800/-0.01em) — trading-card league name
- `typeNumericCompact` (19/800/-0.01em) — stat values in the back-of-
  card 3-col stat block

**Tweaks panel was trimmed in the same commit:**

- Removed `sportColors` toggle (consumer deleted by the rewrite)
- Removed `cardStyle` toggle + entire Layout section (had no consumer
  even before this work — dead UI predating the rollout)
- Panel now reads as Appearance (theme only) + Data (reset button)

**Pending asset:** `commissioner.png` for the PackStats mascot. Not
yet generated. PackStats currently uses `mascot-empty.png` via an
`onError` fallback. When `commissioner.png` lands in `public/`, the
fallback stops firing automatically — no code change needed.

**Parked here.** User explicitly stopped after HomeView; the rest of
the original migration plan is queued but not in flight.

**Next step when resumed:** Step 3 = `LeagueView` header + TabBar
migration, per the original order:
LeagueView header → PayoutsTab → PlayersTab → OverviewTab + LotteryTab
→ SettingsTab → modals. One commit per surface. "No visual change
expected" is the rule per step except where the agreed system mandates
a consolidation. Visual eyeball is on the user — this container is
headless.

## How it runs

- `npm run dev` — local Vite dev server
- `npm run build` — runs `scripts/fetch-players-nhl.mjs` then `vite build`.
  Vercel runs this on every push.
- `npm run players:nhl` — refresh NHL player directory on-demand
- This Claude Code container's network policy **blocks** `api-web.nhle.com`
  and `api.nhle.com`. Vercel's build environment can reach them fine — so
  the fetch script always works on deploy, but you can't test it in-session.
- Asking the container to hit NHL APIs will fail; trust Vercel for that.

## Product positioning

KeeperHQ is the **off-season home for keeper league fantasy sports**.
It doesn't replace Yahoo, Sleeper, or ESPN during the season — it
handles everything between seasons that those platforms don't: keeper
decisions, off-season trades, contract tracking, and draft setup.
Players self-serve their keeper choices and trade negotiations.
Commissioners get a single source of truth that exports cleanly to
whatever platform their league uses in-season.

**Primary user**: the keeper league commissioner. Underserved by major
platforms because they're a minority of total users but they make the
platform decisions for their leagues.

### Off-season phase model

The product treats the off-season as a five-phase sequence:

1. **Carry-forward** — last season's data lands in the product
2. **Keeper decisions** — players pick who they're keeping
3. **Off-season trades** — players negotiate, commissioner approves
4. **Pre-draft prep** — dues collected, draft order set, draft config
   finalized
5. **Export** — handoff to Yahoo/Sleeper/ESPN for the in-season
   experience

Every league has a current phase. Every UI surface should reflect and
serve that phase.

### Anti-patterns

- Don't optimize for in-season use cases (live scores, lineups,
  matchups). Those belong on Yahoo/Sleeper/ESPN.
- Don't lean on dues collection as the headline activity. It's a real
  workflow but it's phase 4.
- Don't over-pixelate. Retro accents only — pixel art lives in sport
  avatars, empty states, and achievement decorations. Layout,
  typography, and structure stay modern.

## Architecture in one paragraph

100% client-side **today**. League data lives in the user's browser via
localStorage (`src/App.jsx` handles persistence). NHL player directory
ships as a static JSON at `public/players-nhl.json`, generated at build
time by `scripts/fetch-players-nhl.mjs`. No backend, no auth, no DB *yet*.
This is the current implementation, **not a permanent stance** —
single-commissioner server-side persistence + auth is now a planned
milestone (see the Roadmap "split A vs B" note and Open items #7/#15).
What stays deferred is multi-user *collaboration*, not persistence.

## Routing

Real client-side routing via `react-router-dom` (v7), wired in
`src/main.jsx` (`<BrowserRouter>`) and `src/App.jsx` (`<Routes>`).
Vercel's `vite` framework preset already serves `index.html` for
unmatched paths, so refresh on any deep URL works out of the box —
no extra rewrite rule needed.

**Route table:**

| Path | Behavior |
|---|---|
| `/` | `HomeView` — My Leagues |
| `/new` | `CreateLeagueWizard` — 4-step create-league flow (Basics → League Format → Teams → Review); writes a new league to localStorage and routes into it |
| `/league/:leagueId` | redirects to `/league/:leagueId/overview` |
| `/league/:leagueId/overview` | `LeagueView` w/ overview tab |
| `/league/:leagueId/lottery` | `LeagueView` w/ lottery tab — **snake-draft only**; on auction leagues redirects to overview |
| `/league/:leagueId/players` | `LeagueView` w/ players tab |
| `/league/:leagueId/payouts` | `LeagueView` w/ payouts tab |
| `/league/:leagueId/settings` | `LeagueView` w/ settings tab |
| `/league/<unknown-id>/...` | redirect to `/` |
| `/league/:leagueId/<unknown-tab>` | redirect to `/league/:leagueId/overview` |
| any other path | redirect to `/` |

`:leagueId` is the existing stable `league.id` slug in `src/data.js`
(`hockey-1`, `basketball-1`, etc.) — no separate routing key was
introduced.

**Wiring:**

- `App.jsx` holds `leagues` state + the `<Routes>` tree. Two thin
  wrappers — `HomeRoute` and `LeagueRoute` — do the URL-param lookup
  and validity-gating before rendering the view components.
- `LeagueView` is fully props-driven now: it takes `activeTab` from
  the parent route instead of holding tab state itself. The
  per-route refresh that used to require a `useEffect` syncing
  `currentLeague ↔ league` is gone — the leagues array lives in
  `App.jsx` and the matching league is looked up fresh on every
  render by id.
- `TabBar` items are `<Link>`s built from a `basePath` prop, so
  back/forward and right-click-copy-link both work.
- The home/breadcrumb/`← All Leagues` button and the logo wordmark
  are all `<Link to="/">`.

## Payouts model

`league.payouts` is an **object** with two arrays:

```js
payouts: {
  standings: [{ place: number, phase: 'regular' | 'playoffs', amount: number }, ...],
  other:     [{ label: string, amount: number }, ...],
},
payoutNote: string,
```

**Standings Payouts** render as a **place×phase grid** with an
**edit/view toggle** (`PayoutsTab` in `src/LeagueView.jsx`), mirroring
Settings' `EditableCard` pattern. Card header carries [Edit] in view
mode; [Cancel] [Save] in edit mode. Save commits a draft to
`onUpdateLeague`; Cancel discards.

*View mode (default):*
- Rows = only places with **at least one** payout (regular OR
  playoffs). The all-12-rows-of-dashes version is too noisy.
- Friendly place labels in the row column: `"Champion (1st)"`, `"2nd"`,
  `"Last Place (Nth)"`.
- Columns = Regular Season, Playoffs. Each cell renders the saved
  amount as colored text (green positive, red negative) or `"—"` for
  no stored line.
- Read-only: no inputs, no dropdowns, no × buttons. This is also the
  future end-user read-only view.

*Edit mode (click Edit):*
- Same grid; cells become amount inputs in place (not a modal).
- Phase stays as the column header — there's **no per-row phase
  dropdown** because the column already encodes the phase.
- Row × button removes the row (clears both phase lines).
- A `+ Add place…` `<select>` below the grid lets the commissioner
  pick which place to add. Options are **plain ordinals** (`1st`,
  `2nd`, …, `12th`), excluding places already shown — explicitly
  *not* friendly labels like "Champion" or "Last Place" because you
  pick a number, not a label. Supports non-contiguous layouts: add
  place 12 for a last-place penalty without first adding 4–11.
- A session-added row with no data vanishes on Cancel or Save (data
  drives view-mode visibility).

This pattern supersedes the earlier standalone grid (cells live on
all-12-rows) and standalone list (one-row-per-line with phase
dropdowns) — they were the same data in two presentation states; this
is the resolved combined form. Underlying data model is still
`{place, phase, amount}` lines with no `_state` field, so the
edit/view distinction is purely in `PayoutsTab` rendering.

The Other Payouts section and the optional `payoutNote` follow the
same draft pattern: editable inputs in edit mode, plain text in view
mode (and hidden entirely in view mode if empty). The Payments column
(right side of the Payouts tab) is unrelated to the draft — it
always reads from `league.buyIn` so the Mark Paid buttons don't shift
mid-edit.

**Place labels are plain ordinals everywhere** — `"1st"`, `"2nd"`,
… `"12th"`. No "Champion" treatment for 1st, no "Last Place" treatment
for the bottom seat. The friendly-label concept was tried twice and
discarded both times: making one row special read as cluttered, not
fancy. `ordinal()` handles the 11th/12th/13th English exceptions. The
`+ Add place…` dropdown also uses plain ordinals (you pick a number,
not a label).

**Dollar inputs step by $25.** All `<input type="number">` fields in
the Prize Structure card (buy-in, standings cells, Other Payouts
amount) have `step="25"` so the arrow keys / scroll wheel jump by 25
— hits common payout amounts (150 / 300 / 450 / 750) cleanly while
fine entry by typing remains available.

**Visual treatment is intentionally plain.** No trophy icons, no
column accent for 1st, no per-row decoration. The Payouts panel is
read as a data table; personality on the league-detail view is
deferred to a future holistic pass across all the tabs, not a one-off
on this surface.

**Other Payouts** is the escape hatch: free-text label + dollar
amount, for prizes that don't map cleanly to place×phase (weekly
high score, sweep bonus, etc.). The amount is the **total dollars
allocated to the prize, not per-instance** — so weekly winners at
$5/week × 18 weeks goes in as label `"Weekly high score — $5/week"`
and amount `90`. This keeps the pool math honest.

**Totals are combined:**
- `allocated = sum(standings.amount) + sum(other.amount)`
- `unallocated = totalPool − allocated`

**Backwards compat:** none. The previous shape was `payouts: [{ label,
amount }, ...]`. Old localStorage data won't crash — `payouts?.standings
|| []` falls back to empty — but it will appear as no payouts until
the user clicks "Reset to demo data" in the tweaks panel. Single-user
local-first app; not worth a migration shim.

**Demo data:**
- `hockey-1` matches the user's real league: Reg 1st $750 / 2nd $150;
  Playoffs 1st $450 / 2nd $300 / 3rd $150; Other line for the sweep
  bonus rule (amount $0 — the label carries the conditional, $0 keeps
  the math honest).
- `basketball-1` and `football-1`: both phases pay top 3, with a
  last-place penalty (-$50) in the regular column. Sums to $950
  against a $1,200 pool ($250 unallocated).
- `baseball-placeholder`: `{ standings: [], other: [] }`.

## Critical decisions made

1. **Local-first *for now* — server-side persistence is now planned.**
   Today data lives in the browser (README: "your league data lives in
   your own browser"). But single-commissioner persistence + auth is a
   near-term milestone (Roadmap split A; Open items #7/#15) — don't
   treat "backend deferred" as still-true blanket guidance. Still off
   the table: **sharing / collaboration** features that imply *multiple
   users* (Roadmap split B). Don't promise member-facing sharing.
2. **NHL only** for the player directory. Other sports show "Coming soon"
   via `public/mascot-soon.png` in `PlayersTab` and elsewhere.
3. **Players tab is keeper-centric.** Assigning a free agent creates a
   keeper entry with contract terms, not just a roster row. The manage
   modal exposes BOTH "Add to roster" and "Make keeper" actions.
4. **Submission status was removed.** No more "Mark as submitted" — keepers
   auto-save as added. Counters now show "teams started" (≥1 keeper).
5. **Settings reorganized.** No standalone "League Info" card. Sport, Draft
   Type, Teams sit as locked rows inside "Keeper Rules"; Season is editable
   below them. "No Playoff Pickup Keepers" rule deleted (depended on a
   roster-import feature we don't have).
6. **Expired contracts tracked separately** in `buildStatusIndex`
   (`src/lib/players.js`). Blocked from being made keepers; shown as
   "Expired · {team}" pill in red.
7. **Pre-loaded mock data lives in `src/data.js`** — used to seed
   localStorage on first run.
8. **PackStats KPI strip is dollar-first** (was "KPI bar"). Reframed
   in the trading-card redesign as a mascot + speech-bubble + 4 mono-
   space numerics: Leagues · Collected · Outstanding · Unpaid. The
   speech bubble's voice line + border color react to the state
   (green when paid up, warning-orange while chasing). PackStats sums
   across the whole league pack, not the current filter selection.
   Phase-4 (pre-draft prep) commissioner workflow.
9. **League card is a trading card** (rewritten from the previous
   compact 4-col model). Card body structure:
   1. League name (`typeHeadingHero`)
   2. Pills row — `SportBadge` + rule pill, side by side
   3. Flavor text with mood-colored left rule
   4. Stats footer (Teams · Paid · Pool)

   No season label, no standalone meta line — both were redundant.
   Year is implied by context; contract config beyond the keeper
   count belongs on the league detail view, not the card.

   Hero panel renders a per-sport pixel-art scene as the background
   (rink / arena / field / stadium), an action sticker top-left,
   and the mascot bottom-right. Hero is `aspectRatio: '5 / 2'`
   (cinematic strip) with `backgroundSize: cover`; per-sport
   `SPORT_CONFIG[sport].bgPosition` shifts the crop downward for
   basketball (`center 80%`) and football (`center 75%`) so the
   character's feet land on the court / field. Hockey and baseball
   read fine at default `'center'`. Sport `color` is the fallback
   during image load.

   **Hero panel is scene-only — action sticker is the sole UI overlay.**
   The old "print band" (sport + season text inside the hero) didn't
   survive the busy scene backgrounds; identity moved into the body.

   **Pills row recipe:**
   - `SportBadge` — sport-color tint bg + border + solid sport-color text
   - Rule pill — neutral gray (`t.badgeBg` + `t.border` + `t.textSecondary`),
     same typography (`typePill`), same padding/radius as SportBadge
     so the row reads as a matched pair. Pill string is built from
     `ruleMod(league)` + keeper count.

   **Rule strings (trimmed for pill density):**
   - snake: `${contractYears}-yr contracts` (was: "max contract")
   - auction: `+$${costIncreasePerYear}/yr keeper cost`
   - keeper count: `${keeperSlots} keepers` (was: "Up to ${N} keepers")
   - Combined pill: `"3-yr contracts · 4 keepers"`, `"+$5/yr keeper cost · 4 keepers"`.

   Hover: card lifts, holofoil shine sweeps, mascot bobs. Stats are
   `Teams · Paid (X/N) · Pool ($total)`. The Add League slot at grid's
   tail is a binder-empty-slot variant (dashed outline + faded
   greyscale mascot at 12% opacity).

   **Sport filter pills** above the grid carry the sport's color
   even when idle: inactive sport pill uses `cfg.tint` background +
   `cfg.border` border + `cfg.color` text (SportBadge recipe). Active
   pill saturates to solid `cfg.color` + white text. "All Leagues" is
   the neutral option (gray idle, `tokens.info` blue when active).

   Card-level logic lives in `HomeView.jsx` helpers:
   - `nextAction(league)` returns `{ kind: 'action'|'waiting'|'ready', label }`
     and drives the action sticker's copy + color
   - `flavorLine(league, action)` returns the voice copy for the line
     below the pills row
   - `paymentsOf(league)` returns derived payment totals
   - `ruleMod(league)` returns the rule-pill modifier string

## Visual / design language

- **Modern and clean by default.** Layout, typography, structure all
  contemporary. Pixel art is a *subtle accent*, not the dominant
  aesthetic. (Earlier sessions leaned hard pixel-art; we pulled back.)
- **Where pixel art lives**: sport avatars on league cards (40px
  circle), empty-state mascots, achievement / celebration decorations.
  Nowhere else. The nav, headers, modals, tabs, and forms stay clean.
- All character art generated by user via ChatGPT, dropped into `public/`.
- Inline styles only (no Tailwind, no CSS modules). `makeTheme(isDark)` in
  `src/components.jsx` is the design-token source.

## Design system

The full token vocabulary lives in `makeTheme(isDark)` in
`src/components.jsx`. Two non-negotiable rules:

1. **New surfaces consume tokens. They do not introduce values.**
   If a font size, padding, radius, or color isn't already in
   `makeTheme` or `SPORT_CONFIG`, the answer is *add it as a token
   first*, not *inline a value*. The whole point of the system is
   that values can't drift if values can't be introduced.
2. **Two namespaces, two concerns.** `text*` tokens are *colors*
   (`textPrimary`, `textBody`, `textMuted`, etc.). `type*` tokens
   are *typography style objects* (font-size + weight + letter-spacing
   + transform). Do not merge them. `textBody` is a color string;
   `typeBody` is `{ fontSize: '13px', fontWeight: 500 }`. They are
   combined at the call site: `style={{ ...t.typeBody, color: t.textBody }}`.

### Token reference

**Typography (style objects, spread-friendly)**:
| Token | Spec | Role |
|---|---|---|
| `typeHeadingPage` | 20/800/-0.01em | Page-level title (league detail h1) |
| `typeHeadingHero` | 22/800/-0.01em | Trading-card league name on hero-style cards |
| `typeHeadingCard` | 18/700/-0.01em | Card and modal titles |
| `typeHeadingSection` | 13/600/0.06em UPPERCASE | "KEEPERS", "Prize Structure", section dividers |
| `typeLabelEyebrow` | 11/600/0.06em UPPERCASE | StatBox labels, KPI labels, column headers |
| `typePill` | 11/600/0.03em | Soft pills: DraftBadge, SportBadge, Tag (the "label" pills) |
| `typePillEmphatic` | 11/700/0.05em UPPERCASE | StatusPill ("announcer" pills) |
| `typeBody` | 13/400 | Table cells, body copy, form input text |
| `typeBodyMeta` | 12/400 | Helper / secondary / footer text |
| `typeNumericHero` | 26/700 | SummaryBar values (dashboard hero metrics) |
| `typeNumericCard` | 22/700 | StatBox value (card-level stats) |
| `typeNumericCompact` | 19/800/-0.01em | Stat values inside compact 3-col stat blocks (trading-card stat footer) |
| `typeNumericInline` | 17/700 | League header inline counters |

**Spacing (numbers, auto-px in inline styles)**:
`space2xs: 4 · spaceXs: 8 · spaceSm: 12 · spaceMd: 16 · spaceLg: 20 · spaceXl: 24 · space2xl: 32`.
Cards default to `spaceMd × spaceLg` padding. KPI bar uses `spaceLg × spaceXl`.

**Radius**:
`radiusSm: 6` (chips) · `radiusMd: 8` (buttons, inputs) ·
`radiusLg: 12` (cards, modals, nested stat blocks — match parent) ·
`radiusPill: 999` (true pills).

**Semantic color**:
| Token | Hex | Usage |
|---|---|---|
| `success` / `successBg` / `successBorder` | `#6dd4a8` | Completed/secured states (all keepers submitted, paid, Keeper status) |
| `warning` / `warningBg` / `warningBorder` | `#e8832a` | Needs-attention states (Outstanding, Unpaid, incomplete payments) |
| `danger` / `dangerBg` / `dangerBorder` | `#e85252` | Expired, destructive actions, negative payouts |
| `info` / `infoBg` / `infoBorder` | `#3b8ae6` | Informational badges (Rostered status), default accent |
| `brand` | `#3ca96b` | The "HQ" half of the nav wordmark. Singular use. |

**Sport accents** (`SPORT_CONFIG[sport]`):
Each sport carries pre-baked `tint` (~12% alpha) and `border` (~33%
alpha) alongside its `color`. Use those instead of inlining
`${color}1f` or `${color}55`. For surfaces with a raw accent hex but
no sport object, use the `sportTint(color)` / `sportBorder(color)`
helpers exported from `components.jsx`.

### Spotting drift

When reviewing a new surface, the smell tests are:
- Inline hex (`'#e8832a'`, `'rgba(...)'`) instead of token reference
- Font size that isn't in the type-token list above
- Card padding that doesn't decompose to `spaceX × spaceY`
- `${color}` followed by a 2-char alpha suffix (use the sport helpers)
- `outline: 'none'` on an input with no focus replacement (TODO: focus
  ring token still pending)

If one of these is unavoidable, the next step is *add a token*, not
*inline an exception*.

### Asset inventory (`public/`)

| File | Role |
|---|---|
| `keeper-hq-logo.png` | Shield icon — **in use** as nav fallback under 640px viewport. Do NOT delete. |
| `nav-logo.png` | Old pixel-art horizontal lockup — no longer used (replaced by HTML wordmark). Safe to delete. |
| `favicon.svg` | (removed; favicon now uses `nav-logo.png`? — check `index.html`) |
| `sport-hockey.png` | Action-pose hockey character — TradingCard hero mascot (152px) |
| `sport-basketball.png` | Same, basketball |
| `sport-football.png` | Same, football |
| `sport-baseball.png` | Same, baseball |
| `hockey-bg.png` | SNES-era side-view rink scene — TradingCard hero panel background (hockey) |
| `basketball-bg.png` | Arena scene with hoop + scorer's table — TradingCard hero panel background (basketball) |
| `football-bg.png` | Stadium with goal post + bench — TradingCard hero panel background (football) |
| `baseball-bg.png` | At-bat scene with catcher, umpire, backstop — TradingCard hero panel background (baseball) |
| `mascot-empty.png` | Puzzled everyman — empty states + AddLeagueSlot silhouette + PackStats fallback |
| `mascot-soon.png` | Construction-worker everyman — "Coming soon" |
| `mascot-celebrate.png` | Cheering everyman — celebration banners (unused yet) |
| `commissioner.png` | **PENDING** — target asset for PackStats mascot (72px). `mascot-empty.png` is the live `onError` fallback until this lands. Drop into `public/` and the fallback stops firing automatically. |
| `players-nhl.json` | NHL player directory (refreshed on every Vercel build) |

### Where assets are wired

- **Nav**: `src/App.jsx` header is an HTML wordmark — "KEEPER" +
  green "HQ" in Space Grotesk 800 — at 24px on viewports ≥641px.
  Under 640px the wordmark hides and `/keeper-hq-logo.png` shows at
  32px instead (handled via `<style>` media-query block in
  `App.jsx`). Header height 64px. Logo container vertically centered.
- **Sport sprites**: `SPORT_CONFIG[sport].logo` → `/sport-{sport}.png`
  - HomeView `TradingCard` hero panel: 152px mascot inside a 160×170px
    hero zone, bottom-right, drop-shadowed. Hovering the parent card
    runs the `kh-bob` keyframe (bob animation).
  - League detail header (`LeagueView.jsx`): 32px sprite inside a 40px
    tinted circle (background `${accentColor}1f`), inline with title.
  - `<SportLogo>` primitive in `components.jsx` is still exported but
    no longer used by HomeView — `TradingCard` renders `<img src={sport.logo}>`
    directly to apply hero-specific positioning and animation classes.
  - Overview keeper-grid headshot column: NOT this — that uses real NHL
    player headshots from the player JSON.
- **Sport scene backgrounds**: `SPORT_CONFIG[sport].bgImage` →
  `/{sport}-bg.png`. Rendered as `background-image` on the TradingCard
  hero panel (5:2 aspect, cover-fit). Optional per-sport `bgPosition`
  tunes the crop — see Critical decision #9. Centered grain overlay
  and shine sweep layer over the bg image.
- **`commissioner.png` (pending)**: `HomeView.jsx` `PackStats` mascot,
  72px. `onError` falls back to `/mascot-empty.png`.
- **`mascot-empty.png`**: three live uses —
  - `KeepersTab.jsx` `KeeperEditModal` empty state, 100px
  - `HomeView.jsx` `PackStats` `onError` fallback, 72px (until
    `commissioner.png` lands)
  - `HomeView.jsx` `AddLeagueSlot` faded silhouette, 120px @ 12%
    opacity + greyscale filter
- **`mascot-soon`**: `PlayersTab.jsx` non-NHL empty state, 140px
- **`mascot-celebrate`**: not yet wired — earmarked for season-complete
  banner

## Build constraints — reuse, don't rebuild

Standing rules for building new surfaces. They exist because a parallel
copy of a component drifts away from the original.

- **League cards** → use the real `TradingCard` (in `components.jsx`),
  never a lookalike.
- **Keeper cells** → use the shared `SampleKeeperCell`
  (`src/tabs/keeper-grid-variants.jsx`), never a reimplementation.
- **Form inputs / dropdowns** → match the **Manage Player**
  (`KeeperEditModal`) input styling, **not** LeagueView's `inputStyle`.
- **Value styling** → the value is **bold** (`textPrimary`); any unit /
  prefix / suffix (`$`, `players`, `/yr`) is **regular gray**
  (`textMuted`).
- **Missing component?** If a design references a component that only
  exists inline somewhere, **extract it from where it lives** (and
  re-run the relevant regression — e.g. the keeper-cell suite) rather
  than copying it. A parallel copy drifts.
- **Layout** → wizard/page content sizes to its active column; action
  buttons sit in **normal flow below the content**, never pinned to a
  column-driven height.
- **Design handoff** → approved designs come from **Claude Design as a
  written spec** (tokens, sizes, states, components to reuse), not just
  screenshots. Screenshots are for **final QA only**.

## File map (most-edited)

- `src/App.jsx` — top-level shell, header, view switching, localStorage.
  Holds `leagues` state; `handleAddLeague` appends a wizard-built
  league + navigates into it; `/new` route renders the wizard.
- `src/HomeView.jsx` — My Leagues page (summary tiles + league cards).
  Imports `TradingCard` from `components.jsx` (it no longer lives
  here — see below); renders `PackStats`, `SportFilter`, and the card
  grid.
- `src/CreateLeagueWizard.jsx` — the `/new` create-league flow.
  4 steps (Basics → League Format → Teams → Review); `useReducer`
  state; three-column card (left rail · form · right live-`TradingCard`
  preview, `state='building'` until Review flips it to `'ready'`).
  `buildLeague(state, existing)` produces the saved object (the
  `src/data.js` shape; `slugify`'d unique id; `commissionerTeamId` +
  `teams[0].isCommissioner`; snake adds `contractYears`, auction adds
  `auctionRules.{costIncreasePerYear, budget, …}`). Local `Input` /
  `Select` primitives mirror the `KeeperEditModal` styling (value bold,
  unit/suffix regular gray); the `Select` menu portals out of the
  card's `overflow:hidden` so it isn't clipped.
- `src/LeagueView.jsx` — League detail (tabs: Overview / Lottery /
  Players / Payouts & Pay / Settings), settings forms
- `src/components.jsx` — shared UI primitives + `SPORT_CONFIG`,
  `getLeagueStats`, `Tooltip`, `SportLogo`, `makeTheme`, and
  `TradingCard` (extracted from `HomeView`; takes a
  `state?: 'building' | 'ready'` prop for the wizard live-preview —
  `building` pins the BUILDING… sticker + dashed stats, `ready` flips
  to READY FOR DRAFT, undefined keeps the My-Leagues behavior).
- `src/PlayerAutocomplete.jsx` — autocomplete input backed by
  `loadPlayers`; takes `disabledNames` to block dupes; shows
  in-league keeper/rostered status next to suggestions
- `src/lib/players.js` — `loadPlayers(sport)`, `normalizeName`,
  `buildStatusIndex(league)` — **the** util for matching league
  rosters to the player directory. Returns `{ teamId, teamName,
  status: 'rostered'|'keeper'|'expired', isExpired, keeperList,
  keeperIdx, tradedTo*, ... }` keyed by normalized name.
- `src/lib/season.js` — `startNewSeason()` (advances keepers' contract
  years, drops expired, resets keepers, etc.)
- `src/tabs/OverviewTab.jsx` — main keeper grid. Team and Edit
  columns are **sticky** (pinned left/right). K columns operate in
  two mutually exclusive modes chosen at runtime by comparing natural
  table width to container width:
  `TEAM_W = 140`, `COL_W = 180`, `EDIT_W = 73`. The table is always
  `tableLayout: fixed` (see the long-name note below for why).
  - **stretch** (`TEAM_W + maxKeepers*COL_W + EDIT_W ≤ containerW`):
    table is `width: 100%`, K columns share leftover space equally,
    Edit pinned flush at the end, no scroll, no chevrons.
  - **scroll** (overflows): table width is an **explicit pixel sum**
    (`TEAM_W + maxKeepers*COL_W + EDIT_W`), **not** `max-content` —
    with `tableLayout: fixed`, `max-content` would let a long player
    name grow its column instead of truncating, so an explicit width
    is required to hold `COL_W` and force the ellipsis. K columns are
    fixed at `COL_W` (180); the container scrolls with
    `scroll-snap-type: x mandatory` + `scroll-padding-left: TEAM_W` so
    snap targets land K columns flush against the post-sticky
    boundary. Chevrons advance exactly **one column per click** (snap
    targets are at multiples of `COL_W`); both directions clamp to
    `maxValidSnap()` so they never leave a partial column at the edge.
  - **Edit-column balance**: `EDIT_W = 73` with the Edit `<td>` right-
    anchored (`textAlign: right`, padding `12px 20px 12px 10px`) makes
    the gap to the table's right edge (20px) match the inter-card gap,
    and the left gap (10px K-cell pad + 10px) also lands at 20px — the
    button reads centered between the last card and the edge.
  - **empty state**: when `teams.length === 0` or `maxKeepers === 0`,
    the table + chevrons are skipped entirely and a small message
    renders in their place — avoids sticky-column overlap and the
    chevron-floats-in-empty-row pitfall.
  Header `<th>` cells each set `background: t.sectionBg` directly
  (not the parent `<tr>`) so the translucent bg doesn't double-layer
  on the sticky Team/Edit cells.

  **Row dividers** live on the `<td>` cells (`borderBottom: 1px solid
  t.border` on every cell except the last row), **not** on the `<tr>`
  — with `borderCollapse: separate` a `<tr>` border doesn't paint, so
  the divider has to be per-cell.

  **Grid accent is draft-type-based, not sport-based.** `gridAccent =
  draftType === 'auction' ? tokens.warning : tokens.info` — blue
  (`#3b8ae6`) for contract/snake, orange (`#e8832a`) for auction.
  Drives keeper values, the empty "+ Add" cells (border + text +
  needsMore bg tint), the Pre-Season pill, and the pencil-hover color.
  This is independent of `SPORT_CONFIG[sport].color` (which the
  `accentColor` prop still carries for non-grid surfaces); a snake
  football league reads blue in the grid even though football's sport
  color is green.

  **Cell design** (each keeper slot, `.kh-keeper-cell`). The filled-cell
  render now lives in `src/tabs/keeper-grid-variants.jsx` as
  `SampleKeeperCell` — extracted so the create-league wizard's Step-2
  SAMPLE KEEPER cells are the *same* component, not a lookalike. The
  grid passes the interactive bits as opt-in props (`onReassignClick`
  for the hover ✎ pencil, `tradedToName` for the ⇄ swap-badge tooltip,
  the move-popover via `children`); the wizard sample passes none and
  gets the static visual. All behavior/footprint is unchanged from the
  inline version (the grid cell-height + stretch/scroll regression
  still passes 42/42):
  - Each filled cell is a **bordered card** — `width: 100%;
    boxSizing: border-box; border: 1px solid t.border; background:
    t.sectionBg; borderRadius: tokens.radiusSm (6); padding: '8px
    10px'`. `width: 100%` is load-bearing: cells whose `<Tooltip>`
    has content (the expiring ones) get wrapped in an `inline-block`
    span, so without it the card shrink-wraps to content and renders
    narrower than its neighbors. The Tooltip is passed `style={{
    display: 'block' }}` for the same reason. All cells (normal,
    expiring, outgoing) render at an identical width + height
    footprint.
  - Empty "+ Add" slots are full-width dashed boxes matching the
    filled-cell footprint: `display: block; width: 100%; minHeight:
    50; padding: '12px 10px'; border: 1px dashed gridAccent;
    borderRadius: tokens.radiusSm`. Border + text always take the
    grid accent (blue/orange) so both league types read as themed;
    `needsMore` (under the `contractsRequired` minimum) adds a
    background tint.
  - Line 1: player name in bold. Truncates with ellipsis (the cell
    is narrow in scroll mode; full names show in stretch mode).
  - Line 2: a **single** value — `Y{contractYear}/{contractLength}`
    on snake/contract leagues, `${keptFor}` on auction. Never both;
    `league.draftType` (`'snake'` vs `'auction'`) is the only field
    that distinguishes them. Value color is `gridAccent`.
  - **Expiring treatment** (snake only, when
    `contractYear >= contractLength`): the cell card's border becomes
    `t.dangerBorder` and the background becomes `t.dangerBg`, the
    name + value go `t.danger` red, and a `Final yr` pill
    (`tokens.typePillEmphatic` + `t.danger`) sits **inline next to
    the value** on line 2 (left-grouped with an 8px gap — does **not**
    push to the far cell edge in stretch mode). The tint/badge keep
    the **same footprint** as a normal cell — only color differs.
    The pill is wrapped in the shared `<Tooltip>` (dark bubble) that
    explains "…final year of contract, returns to the draft after
    this season" — the tooltip lives on the **pill specifically**,
    not the whole cell, so it doesn't collide with the trade-badge
    tooltip on an expiring+traded cell (two distinct small hover
    targets, never both at once). The pill's Tooltip trigger is given
    `display: inline-flex` (not the Tooltip's default `inline-block`)
    so its inherited line-box doesn't inflate line 2 — otherwise an
    expiring cell renders ~6px taller than a normal one. All cell
    states (normal / expiring / traded / expiring+traded) must share
    one height; the cell suite asserts this. Auction leagues have no expiry
    concept.
  - **Trade indicator**: only the **outgoing** case shows, as a small
    swap badge (`⇄` glyph in `gridAccent`) absolutely positioned in
    the cell's **bottom-right corner** — out of flow, so it never
    competes with line 2 for width and the cell holds its footprint.
    The badge is wrapped in the shared `<Tooltip>` component (same
    dark bubble as the setup-page eligible-pool chips) — hover shows
    the **full untruncated** `"{player} · traded to {teamName}"`,
    wrapping within the tooltip's 260px max-width. The absolute
    corner positioning is passed via the Tooltip's `style` prop (it
    spreads into the trigger span); an `aria-label` on the inner glyph
    covers screen readers. NOT a native `title` (finicky delay, can't
    style). The destination team is **not** rendered as inline text —
    an earlier `→ {team}` text version truncated to useless stubs like
    "→ The …" with long names. The name + value strikethrough + mute. Long
    names truncate with ellipsis on line 1; line 2 stays value (+
    Final yr) only — neither wraps, overflows, nor changes the cell's
    footprint (tested with a 30-char name + long team name in both
    modes). A traded keeper renders **only on its source team** — it
    is intentionally NOT shown on the receiving team (no incoming/`←
    from X` indicator, no duplicate), so a team never displays more
    than `maxKeepers` columns. `getDisplayKeepers` returns own keepers
    only; the slots array is capped at `maxKeepers`. Expiring +
    outgoing coexist on one cell (tint + Final yr pill + strikethrough
    + swap badge all at once, no suppression). (Open item #3: a keeper
    traded while still in `priorKeepers` rather than `keepers` won't
    show the indicator —
    out of scope, separate data-iteration issue.)
  - **Legend**: a small swatch + "Final year" label sits in the
    KEEPERS card header (right cluster, next to teams-started count)
    on snake leagues only — makes the pink tint self-explanatory.
    Hidden on auction.
  - **Pencil reassign**: a `✎` button in line 1 is opacity 0 by
    default and fades in on cell hover (`.kh-keeper-cell:hover .kh-
    keeper-pencil`). Click opens the existing "Move {player} to:"
    popover for mid-season reassignment — feature preserved, just
    visually subtle.
  - Team-column avatar (24×24 colored initial square) has been
    removed; just the team name + the under-minimum warning subtext.
  - NHL headshots (`playerMap` from `loadPlayers('nhl')`) are still
    loaded but no longer rendered in the cell — kept wired for
    potential future use.

  **"kept" vs "required" is a real per-league rule, not a bug.**
  `league.contractsRequired: true` means every keeper slot must be
  filled — the team subtext shows an `X/Y required` warning (orange)
  when a team is under the max during pre-season. `contractsRequired:
  false` means keepers are optional up to the max (a team can keep
  fewer; no required warning). Some leagues phrase their slot counts
  as "kept" (up-to-max, optional) and others as "required" (must fill
  all). Don't normalize the two — the difference reflects the league
  setting.

  **Header stats** (`LeagueView` header, not the grid): `POOL` (prize
  money) shows on **both** league types. `EXPIRING` (count of
  contracts going back to the draft) is an **additional** stat shown
  only on snake leagues — appended after POOL, not replacing it. So
  contract header = TEAMS / KEEPERS / PAID / POOL / EXPIRING; auction
  header = TEAMS / KEEPERS / PAID / POOL.
- `src/tabs/PlayersTab.jsx` — NHL directory, search/filter/sort,
  manage modal with Add-to-roster + Make-keeper actions
- `src/tabs/KeepersTab.jsx` — `KeeperEditModal` (used by OverviewTab
  + setup wizard). Has duplicate-prevention via `disabledNames` to
  the PlayerAutocomplete.
- `src/tabs/SetupTab.jsx` — `SeasonSetupWizard` (the big "set up next
  season" flow with the Eligible Pool sidebar). Reached from the
  Overview tab "Continue setup" button.
- `src/tabs/SourcesTab.jsx` — `DataSourcesPanel` (roster + contract
  import buttons inside the wizard)
- `src/tabs/RosterImportTab.jsx` — Yahoo screenshot/paste roster
  parser. Uses `window.claude.complete` for AI screenshot OCR.
- `scripts/fetch-players-nhl.mjs` — build-time NHL fetch

### Note about "orphan" tab files

`SetupTab.jsx`, `SourcesTab.jsx`, `KeepersTab.jsx`, etc. *look* orphan
if you grep `import.*SetupTab` — they export their components under
different names (`SeasonSetupWizard`, `DataSourcesPanel`,
`KeeperEditModal`) and are imported via those. They ARE wired in.

## Roadmap

**Commissioner-first.** The current focus is hardening the
single-user commissioner experience — keeper management, contract
tracking, payouts, draft setup. Routing is the first piece of
foundation work for that (real URLs, deep linking, refresh-safe
navigation); subsequent pieces will keep building on the
commissioner flows.

**Two things that used to be lumped under "backend deferred" are now
split — read this before pushing back on persistence work.**

**(A) Single-commissioner persistence + auth + portability is now an
INTENDED near-term milestone — NOT deferred.** Login (Google SSO
first, lowest-friction), real server-side storage so one
commissioner's data follows them across devices, one owner per
league. The original deferral was about *premature collaboration
features*, not basic persistence — don't read "local-first by design"
or "backend deferred" as a reason to block building auth + a database
for a single commissioner. This is the path to the user running the
app with their real league. **Create-league (#16) is now shipped
(PR #10), so the backend + auth (#7/#15) is the next major
milestone.** The shared responsive-layout / page-width-consistency
item (#17) is the foundation for mobile and is expected to land
alongside that work. See Open items #7 (backend), #15 (account/login),
#16 (create-league flow — shipped), #17 (responsive).

**(B) Multi-user collaboration REMAINS deferred.** League *members*
logging in, members picking their own keepers, in-app trade
negotiation between members, "share this league" UI, the end-user
(league-member) flow. None of this until the single-commissioner
version is stable and the UI has stopped shifting. The trigger:
commissioner flows locked in + a clear need for multiple people to
share state.

So: building auth + a DB + a create-league flow for **one
commissioner** is on-plan now. Building **member-facing collaboration
UI** is not. No copy that implies multi-user, no "share this league"
buttons, no member login until (B)'s trigger is hit.

## Open items (when user wants to revisit)

1. **2-frame running mascot loading animation** — prompts written, plan
   exists at `/root/.claude/plans/playful-juggling-alpaca.md`. ChatGPT
   was producing inconsistent frame alignment when last tried; defer
   until user has both frames matching.
2. **Season-complete celebration banner** using `mascot-celebrate.png`.
3. **priorKeepers trade gap** — trading a player whose contract lives
   in `priorKeepers` (not yet declared a `keepers`) sets `tradedTo` on
   the entry, but `OverviewTab` only iterates `keepers`, so the
   "→ traded to X" indicator doesn't render for that case. Known
   limitation, not yet fixed.
4. **Eligible Pool widget rework** in `SeasonSetupWizard` — user
   wanted Ineligible to be strictly "expired going back to draft."
   Partially done; revisit if they pick it up.
5. **Export/import button** for league data — workaround for no-backend
   life. ~1-hour change. User said they don't need it yet because they
   won't seriously use the app until there's a real backend.
6. **NBA / NFL / MLB player directories** — same pattern as the NHL
   fetch script. Sport choices discussed: Sleeper for NFL (free, no
   key), ESPN unofficial for NBA, MLB Stats API for MLB. Defer until
   user wants to actually use those sports.
7. **Real backend / database — now a planned milestone (no longer an
   indefinite defer).** Replace the localStorage-only mock-data setup
   with real server-side persistence so a commissioner's data
   persists and is portable across devices. **Single owner per
   league** — this is scoped to single-commissioner persistence, NOT
   multi-user collaboration (see Roadmap split A vs B). Path: probably
   Supabase or Neon behind a tiny Vercel serverless layer. Coupled
   with account/login (#15). Supersedes the old "local-first by
   design" framing for persistence purposes — though the data *shape*
   (`src/data.js` / the `league` object) stays the working model;
   this is about where it's stored, not restructuring it.
8. **Holistic visual-hierarchy / sizing pass across all surfaces.**
   Symptom on the Payouts panel: buy-in carries the largest type and
   the most prominent placement, but it's the least important info
   (set once per league). Standings payouts are the substance and
   should carry more visual weight. Same kind of audit is owed
   across the keeper grid, Players, and Settings — establish
   consistent emphasis conventions for numbers vs. labels vs. inputs
   so the eye lands on what matters on every tab. Do this as **one
   deliberate pass across all the surfaces at once**, not per-surface,
   so the conventions hold up. Defer until the core surfaces exist
   and have stopped shifting structurally. (The Payouts-specific
   cleanup is also tracked separately as #21.)
9. **Off-season trade model — undecided, decide before building more
   trade UI.** Keepers aren't locked until declared, so an off-season
   trade really just moves a player between teams' *pools* before
   selection — it may not belong as a grid annotation at all. Open
   question: should trades live as **grid indicators** (the current
   `⇄` swap-badge approach in OverviewTab), as a **transaction
   history** (league-level and/or per-player), or **both**? Settle the
   model before adding more trade UI. Related: the user has asked
   about viewing previous seasons' data — likely part of the same
   strategy discussion. Parked for a future design conversation.
10. **Post-deadline commissioner keeper exceptions.** The commissioner
    needs to make legitimate keeper changes *after* the keeper
    deadline — real example: a player was kept, then injured in
    preseason, and the league granted an exception swap. This is a
    supported commissioner workflow to build, distinct from in-season
    trades (which are explicitly out of scope for now).
11. **Keeper-edit consolidation.** Two editing affordances currently
    overlap and neither does the whole job: the **pencil** (in the
    keeper cell) reassigns a player to another team — a trade-type
    move — while **Edit** (the per-team button → `KeeperEditModal`)
    adds/removes players but can't trade them. Consolidate into one
    coherent keeper-edit flow eventually.
12. **Auto-generated Google Sheet export (high near-term value).**
    Annual pain: league members ask who they can keep / trade for, and
    the commissioner currently hand-digs each person's old Yahoo
    roster page AND old draft page (web only, not in-app) and
    maintains a Google doc by hand. Want an auto-generated Google
    Sheet — overall view + per-team view — that updates **one
    persistent file in place** (does NOT spawn a new file each run),
    to drop in the league group chat as the interim league-visibility
    tool until a user-facing product exists. **Decision point:**
    "update in place" likely implies a Sheets API integration, which
    touches the no-backend constraint — flag and decide that when this
    is built. **The user's "export keeper-eligible list" ask is this
    same item** — the eligible-list export and the Sheet export are
    one feature; the output format (Sheet tabs vs CSV vs other) is
    still to be decided.
13. **Off-season setup workflow (documentation of existing behavior,
    not a new request).** The core off-season loop: the commissioner
    uploads each team's roster by copy-pasting their Yahoo roster page
    (`RosterImportTab` AI paste/OCR). For **auction** leagues, they
    also paste the prior year's auction draft so dollar values attach
    to players (`ImportTab` / `DataSourcesPanel`). The system carries
    contracts forward and applies the defined annual `$` increase
    (`lib/season.js` + `auctionRules.costIncreasePerYear`). This
    individual team / setup page is the **primary work surface** and
    is currently underdocumented — capture it properly when touched.
14. **Draft-pick ownership / validation (deferred, captured for when
    it returns).** In the off-season, teams trade draft picks for
    other teams' excess keepers; the commissioner annotates this by
    hand. Recurring headache: people try to trade picks they no longer
    own, forcing the commissioner to pull the Yahoo draft-picks page
    (web again) to verify. Full pick import may be overkill now, but
    the underlying need — knowing **who owns which picks** to validate
    trades — is real. Revisit whether importing pick ownership solves
    it. **Refinement:** uploaded picks carry **Yahoo team names**, but
    this app keys teams by **GM / owner name**, and team names change
    through the season — so a pick import needs a **mapping layer
    (Yahoo team name ↔ GM/owner)**, not a raw import. Same mapping
    concern likely applies to roster/draft uploads generally.
15. **Account creation + login — near-term, single commissioner per
    league.** Google SSO first (lowest-friction auth). Tightly coupled
    with the backend (#7): login identifies the commissioner whose
    data persists server-side. **One owner per league** — not member
    logins (that's the deferred collaboration line, Roadmap split B).
    Yahoo linking is a later, separate auth (it's also the in-season
    platform many leagues use).
16. **Create / set up a league via UI — SHIPPED (PR #10).**
    `CreateLeagueWizard.jsx` at `/new` writes a real league to
    localStorage (the `src/data.js` shape) and routes into it; the
    `AddLeagueSlot` `alert()` is replaced. The wizard captures name,
    sport, draft type, keeper slots, and the draft-type-branched rules
    (contract length for snake; `costIncreasePerYear` + `budget` for
    auction), plus team count and placeholder team names (team 1 =
    commissioner, via `commissionerTeamId` + `teams[0].isCommissioner`).
    **Not collected** (defaulted, editable in Settings): season (a
    sensible default is stored, no UI), buy-in (→ 0), `minKeepers`
    (→ 0), `contractsRequired`/`contractsFollowTrade` (snake → false /
    absent), `undraftedStartCost`/`minBid` (auction → 5 / 1),
    `playoffTeams`/`bottomLotteryTeams`, `draftDate`, and the keeper
    round-cost rule (intentionally out of scope). Pairs with #7/#15 for
    when persistence/auth land.
17. **Mobile web / responsive — baseline, not polish.** League members
    and the commissioner will largely view on phones. The commissioner
    surfaces (HomeView, LeagueView tabs, the keeper grid, payouts,
    settings) need to be responsive. Treat as a baseline requirement
    when surfaces stabilize, not a final polish pass. (The keeper grid
    already has stretch/scroll modes; the rest of the layout is
    desktop-width-assuming — e.g. `maxWidth: 1000` containers, the
    2-col payouts grid.)
18. **End-user (league-member) flow — REMAINS deferred.** The
    league-member experience is distinct from the commissioner tool:
    members viewing their own team, picking their own keepers,
    negotiating trades. Stays behind the collaboration line (Roadmap
    split B) until the single-commissioner version is locked in. Do
    not build member-facing UI before then.
19. **Public / logged-out homepage (clarify, scope TBD).** A
    logged-out or public entry surface, distinct from the My Leagues
    `HomeView` (which assumes you're already "in"). Needed once there's
    auth (#15) — a place to land before login / sign-up. Scope and
    content TBD.
20. **Draft lottery — make it more engaging / fun.** The user wants to
    revisit the lottery tab (`LotteryTab`, snake-only) and make it more
    of an event — more engaging/playful presentation. Scope TBD; net-
    new design pass, not a bug.
21. **Payouts page cleanup (revisit abandoned work).** A
    visual/structural cleanup of the Payouts tab was started in an
    earlier session and abandoned mid-work. Revisit it. Related to the
    holistic visual-hierarchy pass (#8) — the buy-in-too-prominent
    symptom lives on this surface — but the user calls it out as its
    own to-do.

## Cleanup pending

- `public/nav-logo.png` — unused since the wordmark swap. Safe to
  delete. **Note**: `public/keeper-hq-logo.png` is the small-viewport
  nav fallback now; do NOT delete that one (this is the opposite of
  the previous note).
- `public/commissioner.png` — **not yet generated**, will be dropped
  in by the user. Wired via `onError` fallback in
  `HomeView.jsx` `PackStats`; no code change needed once the asset
  lands.
- Several PNG duplicates at the **repo root on `main`** (uploaded by
  user via GitHub web UI before I moved them to `public/`):
  `Keeper HQ logo.png`, `Fantasy Hockey.png`, `Fantasy Basketball.png`,
  `Fantasy Football.png`, `Fantasy baseball.png`, `nav-logo.png`,
  `mascot-*.png`, `sport-*.png`. All duplicates of files now living in
  `public/`. Safe to delete from GitHub UI.

## Collaboration notes (user profile)

- **Non-dev.** Don't assume CLI/git/code knowledge. Walk through commands
  when relevant; offer to do them through the session when possible.
- **Iterates with screenshots.** Often "this doesn't feel right" → asks
  for alternatives. Lay out trade-offs honestly; let them pick.
- **Has solid UX instincts.** When they push back on a layout (e.g.,
  "the badge dominates", "this is cramped"), they're usually right.
- **Doesn't want magic decisions.** Explain what's changing and why
  before doing it; don't unilaterally restructure things they didn't ask
  for.
- **Trusts informed recommendations.** When I lay out options A/B/C with
  trade-offs, they usually pick "A" (recommended) and move on. Don't
  over-ask.
- **Uses ChatGPT for image generation.** Workflow: I write the prompt,
  they paste into ChatGPT, drop the result into `public/` via GitHub
  web UI. Sometimes results need post-processing (flood-fill to strip
  baked-in backgrounds — see the script pattern in earlier commits).
- **No backend goal in mind**: "make this real, even if just for my
  league." Single-device serious use is the medium-term target.

## How to push changes

Standard flow:
1. Cut a `claude/<short-name>` branch off `main` for each feature
2. Edit files locally in the container
3. `npm run build` to verify
4. `git add <files> && git commit -m "..."` (with a HEREDOC body)
5. `git push -u origin claude/<short-name>`
6. Open a PR — user merges to `main` themselves

User merges to `main` themselves when ready. They've done this once
already (PR #1 was merged earlier). After they merge, future commits
should still go to the same branch and PR/merge from there — don't
push directly to `main`.

## Things NOT to do

- Backend / login / accounts for a **single commissioner** are now
  planned (Roadmap split A, Open items #7/#15) — don't reflexively
  block them. Still don't *start* building them without the user
  steering it, but they're on-plan, not off-limits.
- Don't build **multi-user collaboration** (member logins, member
  keeper-picking, in-app trade negotiation, "share this league") or
  promise it in copy/UI — that's the still-deferred line (Roadmap
  split B).
- Don't push to `main` directly.
- Don't bake in API keys (no provider that requires one has been chosen).
- Don't add comments narrating the change ("Added per user request,
  May 16"); WHY-comments only.
- Don't introduce new dependencies unless asked. The stack is React +
  Vite + nothing else.
