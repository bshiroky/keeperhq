# KeeperHQ — context for Claude

A commissioner tool for fantasy keeper leagues. Web app, React + Vite,
deployed via Vercel from `bshiroky/keeperhq`. Active development branch:
`claude/import-claude-design-project-N35i9` (already merged into `main`
once; keep iterating on the branch and PR/merge when ready).

## Resume here

**Branch tip:** `7fdec25` (clean working tree).

**Mid design-system rollout.** Token vocabulary lives in `makeTheme` +
the module-scope `tokens` constant in `src/components.jsx` (see the
Design system section below for the full reference). Three
self-correction passes during the rollout caught real token errors;
that pattern should continue — pixel shifts during a migration mean
the token is wrong, not the migration.

**Step 1 complete:** the six leaf primitives (`StatBox`, `SportBadge`,
`DraftBadge`, `StatusPill`, `Tag`, `ExpiringDot`) are migrated. Only
deliberate visual change was `StatBox` sub-text 11→12px (agreed
consolidation under `typeBodyMeta`).

**Step 2 (HomeView migration) is blocked.** Before resuming, the user
will bring a revised league card information architecture. The plan
is to land the IA change *and* the token migration in one pass —
don't migrate the current card layout, then re-migrate after the IA
changes. Wait for the new card spec.

**Migration order after HomeView:**
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

100% client-side. League data lives in the user's browser via localStorage
(`src/App.jsx` handles persistence). NHL player directory ships as a
static JSON at `public/players-nhl.json`, generated at build time by
`scripts/fetch-players-nhl.mjs`. No backend, no auth, no DB. Single-user,
single-device by design (see "Backend deferred" below).

## Critical decisions made

1. **Local-first by design (for now).** Backend deferred. README is honest:
   "your league data lives in your own browser." Don't promise sharing
   features that imply a backend.
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
8. **My Leagues KPI bar is dollar-first.** Four cells: Active Leagues ·
   Collected (of total) · Outstanding · Unpaid Teams. Outstanding and
   Unpaid go warning-orange when non-zero. Phase-4 (pre-draft prep)
   commissioner workflow.
9. **League card data shape**: header (avatar + name + season year);
   secondary (draft-type label + status pill); 4-col stat block
   (Teams · Keepers `X/N` "teams submitted" · Payments `X/N` "$N in"
   · Prize Pool `$total` "$N buy-in"); footer (auction yearly-cost
   modifier from `league.auctionRules.costIncreasePerYear` + draft
   date).

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
| `sport-hockey.png` | Action-pose hockey character (no shield, transparent) |
| `sport-basketball.png` | Same, basketball |
| `sport-football.png` | Same, football |
| `sport-baseball.png` | Same, baseball |
| `mascot-empty.png` | Puzzled everyman — empty states |
| `mascot-soon.png` | Construction-worker everyman — "Coming soon" |
| `mascot-celebrate.png` | Cheering everyman — celebration banners (unused yet) |
| `players-nhl.json` | NHL player directory (refreshed on every Vercel build) |

### Where assets are wired

- **Nav**: `src/App.jsx` header is an HTML wordmark — "KEEPER" +
  green "HQ" in Space Grotesk 800 — at 24px on viewports ≥641px.
  Under 640px the wordmark hides and `/keeper-hq-logo.png` shows at
  32px instead (handled via `<style>` media-query block in
  `App.jsx`). Header height 64px. Logo container vertically centered.
- **Sport sprites**: `<SportLogo>` from `src/components.jsx` reads
  `SPORT_CONFIG[sport].logo` → `/sport-{sport}.png`
  - Home cards (`HomeView.jsx`): 32px sprite inside a 40px tinted circle
    (background `${accentColor}1f`)
  - League detail header (`LeagueView.jsx`): same 32-in-40 pattern
    inline with title (no more watermark)
  - Overview keeper-grid headshot column: NOT this — that uses real NHL
    player headshots from the player JSON
- **`mascot-soon`**: `PlayersTab.jsx` non-NHL empty state, 140px
- **`mascot-empty`**: `KeepersTab.jsx` KeeperEditModal empty state, 100px
- **`mascot-celebrate`**: not yet wired — earmarked for season-complete
  banner

## File map (most-edited)

- `src/App.jsx` — top-level shell, header, view switching, localStorage
- `src/HomeView.jsx` — My Leagues page (summary tiles + league cards)
- `src/LeagueView.jsx` — League detail (tabs: Overview / Lottery /
  Players / Payouts & Pay / Settings), settings forms
- `src/components.jsx` — shared UI primitives + `SPORT_CONFIG`,
  `getLeagueStats`, `Tooltip`, `SportLogo`, `makeTheme`
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
- `src/tabs/OverviewTab.jsx` — main keeper grid. Team column and Edit
  column are **sticky**; K columns scroll with paginated chevrons.
  Player names truncate.
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
7. **Real backend** — the big one. Defer trigger: user wants a second
   person to use it, or UI has stopped shifting. Path: probably
   Supabase or Neon, behind a tiny Vercel serverless layer. We've
   discussed this — see the README and the early-conversation
   threads.

## Cleanup pending

- `public/nav-logo.png` — unused since the wordmark swap. Safe to
  delete. **Note**: `public/keeper-hq-logo.png` is the small-viewport
  nav fallback now; do NOT delete that one (this is the opposite of
  the previous note).
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

Standard flow this session has used:
1. Edit files locally in the container
2. `npm run build` to verify
3. `git add -A && git commit -m "..."` (with a HEREDOC body)
4. `git push -u origin claude/import-claude-design-project-N35i9`

User merges to `main` themselves when ready. They've done this once
already (PR #1 was merged earlier). After they merge, future commits
should still go to the same branch and PR/merge from there — don't
push directly to `main`.

## Things NOT to do

- Don't add a backend, login, or accounts unless explicitly asked.
- Don't promise multi-device or multi-user features in copy/UI until
  there's actually a backend.
- Don't push to `main` directly.
- Don't bake in API keys (no provider that requires one has been chosen).
- Don't add comments narrating the change ("Added per user request,
  May 16"); WHY-comments only.
- Don't introduce new dependencies unless asked. The stack is React +
  Vite + nothing else.
