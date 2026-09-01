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
- **PR #10 (merged):** Create-League wizard — a 4-step flow
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
- **PR #21 (merged):** LeagueView jobs-first redesign. "Keepers" is
  now the league home, with an **Overview / Set keepers** toggle
  replacing the old 6-tab strip. Overview = full-width grid of uniform
  team cards (K1..KN slot lists w/ player headshots + "Open slot"
  placeholders) + an "Expiring after this season" roll-up (snake).
  Set keepers = team-chip selector over a two-column workbench: the
  team's keeper panel (left) beside the **Eligible Pool** (right; My
  roster / League / Expired sub-tabs with + Keep toggles). The
  **section doors** (Import / Pool / Lottery / Settings) live in the
  Keepers tab row, right side, as bordered secondary buttons; they
  open right slide-in sheets — except **Lottery**, a full page. The
  league-identity header became a card (sport-color top border, sport
  avatar, name + phase pill, [Hockey][Snake][N teams] pills +
  season/draft meta, keeper-deadline control on the right) — no stat
  strip, no commissioner speech-bubble. **Players is dropped** as a
  standalone tab/route (the NHL directory is absorbed into the Eligible
  Pool's "League" sub-tab; `PlayersTab.jsx` kept). Eligible-pool
  overlay: desktop = inline pool only, mobile = full-screen sheet.
  Addresses Open item #17 for the touched surfaces; the keepers-
  declared celebration (PR #20) shipped earlier in the arc.
- **PR #27 (shared league page):**
  the first sanctioned member-facing surface — a **read-only, public,
  mobile-first** page at `/l/:token` for league members (no login, no
  accounts, no write path). Built to the Claude Design handoff
  "Shared League Page · Build Handoff (v1, FINAL)". Backend: a
  `share_token` column on `public.leagues` (unique, auto-minted via
  column default, never inside the `data` blob) + a
  `get_shared_league(p_token)` **security-definer RPC** executable by
  `anon` that returns a jsonb **projection** (name / sport / draft
  config / teams / contracts — explicitly excludes owner, buy-in,
  payouts, payment status, payoutNote, commissioner fields, and the
  token itself). RLS on the table is unchanged (owner-only).
  Frontend: `src/SharedLeaguePage.jsx` (page + countdown + filter rail
  + mobile rows + desktop stat table reusing the CompactKeeperGrid
  sticky/snap/chevron mechanics), `src/lib/sharedLeague.js` (RPC fetch
  + row derivation reusing `buildTeamPool`, stat-category config),
  a "Share League Page" card in Settings (copy link + regenerate with
  inline danger confirm; `fetchShareToken`/`regenerateShareToken` in
  `leagueStore.js`), and `supabase/migrations/002_share_token.sql`.
  The fetch script now also captures `ppg`/`ppa` (skaters) and `saves`
  (goalies) for the shared page's stat table. **This supersedes the
  old blanket "no share-this-league UI" rule for exactly this
  read-only surface — member logins / collaboration remain deferred**
  (see Roadmap split B).
- **Off-season workflow fixes (this branch's PR):** six fixes from real
  commissioner data entry on production. (1) **Roster-import positions
  come from the NHL directory, not the Yahoo paste** — the paste/OCR
  step extracts names only (Yahoo's left column is a lineup slot, not a
  position); names are matched via `loadPlayers('nhl')` +
  `normalizeName`, matched rows get real position chips, unmatched rows
  save with no `pos` and are flagged "unmatched — check spelling" in
  the preview. Also fixed a name-truncation bug in `cleanPlayerName`
  (the status-flag strip needed `\s+`, not `\s*` — it was chopping the
  last letter off names ending in K/O/Q/P: Hellebuyck, Tkachuk…).
  (2) **Team renames in Settings** — a "Teams" `EditableCard`; renames
  propagate everywhere because teams are referenced by id.
  (3) **Soft delete + restore** — `deleted_at` column on
  `public.leagues` (`003_soft_delete.sql`), danger-styled Delete League
  card in Settings with inline confirm, active/deleted split in
  `App.jsx` (localStorage leagues carry a `deletedAt` field; Supabase
  rows surface the column via `fetchLeagues`), "Recently deleted"
  section with Restore on My Leagues, `get_shared_league` returns NULL
  for deleted leagues (member link → invalid-link state). RLS
  unchanged. (4) **Contract year at entry** — the draft import now
  works for snake leagues (cost is optional in the parse regex) and
  writes `contractYear`/`contractLength` on `priorKeepers`, with a
  per-player "Enters Y_/len" select in the preview (stored as
  entering-year − 1, the years-served convention). KeeperEditModal and
  the Set-keepers slot already had Y selects — verified Y3/3 shows
  Final-yr on the grid + shared page with no season advance.
  (5) **Shared-page polish** — the desktop stat table's floating
  chevrons are gone, replaced by scroll-position-driven edge-fade
  gradients (NHL.com style) at the sticky boundaries; the keeper
  deadline gained a time (`keeperDeadlineTime`, defaults 11:59 PM,
  date-only data still reads as 11:59 PM) read by both `DeadlineLine`
  and the shared countdown. (6) **PPG/PPA plumbing verified** — script
  fields and page keys already align; bumped the `loadPlayers`
  localStorage cache key v3→v4 so schema changes propagate immediately
  instead of after the 12h TTL.
- **Shared-page polish + import-flow fixes (this branch's PR):** four
  follow-ups to #27/#28. (1) **Sticky-transparency regression fixed for
  good** — `opacity` on a sticky `<td>` fades its background too, so
  dimmed team-filter rows let scrolled stats ghost through
  Contract/Status; dim now applies to cell *content* only (sticky cells
  stay fully opaque; the section eyebrow is also sticky-pinned so it
  doesn't slide off on scroll). (2) **Compact Contract/Status columns**
  (display-only, data model untouched): contract shows just `Y1/3`
  (red `Final yr Y3/3` for final, `Expired Y3/3` on the expired view,
  muted `—` for uncontracted); the status pill is the **owner name
  only**, color carrying the state (keeper-accent tint for declared
  keepers *and* under-contract players, readable neutral grey for
  rostered-only); team-filter views show a plain `Keeper` pill on
  keepers and **no pill** on eligible rows; `CONTRACT_W` 150→100,
  `STATUS_W` 160→116 (freed width goes to the stat group); dim raised
  0.6→0.75; same compaction on mobile rows. Auction display unchanged.
  (3) **Recently-deleted retention copy** — "Deleted leagues stay here
  and can be restored anytime" (nothing auto-purges; that line is where
  a purge policy would be stated). (4) **Import preview fixable in
  place** — every preview row (and "+ Add player manually") is the real
  `PlayerAutocomplete` bound to the NHL directory, so unmatched rows
  resolve by picking a suggestion; and `normalizeName` now treats
  punctuation *and spacing* as noise (strips everything non-
  alphanumeric after de-diacriticing), so "AJ Greer" = "A.J. Greer",
  "OReilly" = "O'Reilly", "Pierre Luc" = "Pierre-Luc" — it's the map
  key on all comparison sides, so the re-key is consistent everywhere.
- **Roster-based player directory (this branch's PR):** the NHL
  directory source in `scripts/fetch-players-nhl.mjs` is now
  **roster-based, not stats-based** — players who missed all of last
  season (injury; real case: Aleksander Barkov) used to be absent
  because the old source was the stats list (games-played only). Now:
  every current team's full roster (api-web `/v1/roster/{TEAM}/current`,
  teams from `/v1/standings/now`) is the base; last-season stats merge
  on by playerId; roster players with no stats carry **no stat fields**
  (readers render "—"); stats-only players not on any current roster
  (unsigned/retired) are kept so coverage never shrinks. Roster fields
  (name/team/pos/headshot) win over stats fields on merge — current
  team beats where the player finished last season. Output shape is
  backward-compatible (same file/fields; stat fields simply absent).
  A `MIN_ROSTER_PLAYERS` (500) sanity guard + the existing
  keep-last-good-JSON fallback protect the build if endpoints change.
  `loadPlayers` cache key bumped v4→v5. Readers verified against the
  merged shape (import matcher/autocomplete, eligible pool, shared
  page desktop/mobile) — no UI changes needed. Tradeoff noted: deep
  historical coverage (players absent from both current rosters AND
  last season's stats) is not attempted for v1. **Hardened after the
  first preview shipped the empty placeholder** (live fetch failed →
  fallback deployed a dead directory): off-season endpoint fallbacks
  (stats-derived team list, current∪season roster union), verbose
  per-step build logging, fail-the-build-loudly when no good JSON
  exists, an import-modal "directory unavailable" banner for
  zero-player directories, and `loadPlayers` never caching an empty
  payload.

- **Keeper-rules wizard + the cost/term split (this branch's PR):** the
  create-league flow is rebuilt around **two independent dimensions** —
  what keeping COSTS (a slot / a draft pick / auction dollars) and whether
  the keep has a TERM — replacing the old three-way archetype fork, which
  could not express "auction dollars with three-year terms". Five FIXED rail
  phases (Basics · League type · Keeper rules · Teams · Review), identical on
  every path; sub-screens share their phase's rail row. **No "Step N of M"
  anywhere** — the screen count varies by path, so a counter would be a
  moving target; mobile gets a 5-segment progress bar plus the phase label.
  Keeper rules is one question per screen: count → cost → specifics (branch)
  → term. Slot-only skips specifics (3 screens); auction gets one (4); draft
  picks splits its specifics into **3a which pick** (drafted round vs top
  picks in order, each with a compressed round grid) and **3b the dials**
  (escalation + same-round tie-breaker, hidden on top-picks where slots can't
  collide) — 4 numbered screens, 5 rendered. The **option strip** is the one
  new primitive: a `role="radiogroup"` pill row (label + glyph, 44px min) over
  a single `aria-live="polite"` description block at a **reserved height**
  with the revealed-control slot reserved **unconditionally** (34px/44px) so
  nothing shifts as a keyboard user arrows the group — load-bearing
  accessibility, not styling. The strip is a **grid, never inline flow**:
  equal-width columns on one desktop row (so uneven label lengths can't read
  as ragged and the row can't wrap — it did, with the cost question's three
  pills breaking across two rows), one full-width option per row on mobile.
  The column count is set **inline** per strip as
  `repeat(N, minmax(0, 1fr))` so N equal columns always span the content
  column rather than shrinking to fit; the strip, the screen title and the
  description block share the same left and right edges (no local
  `maxWidth` on any of them). Labels are kept short and even enough to fit
  one line at every width — `Keeper slot` · `Draft pick` ·
  `Auction dollars` (`dollars`, not `value`: it matches the vocabulary on
  the specifics screen and in `CostPath`, and `value` reads as a rating
  rather than a price). Each description is **one sentence that explains
  rather than restating its pill** — "Keeping costs you a draft pick" under
  a pill reading "Draft pick" spent a line saying nothing.
  Reserves are **measured in Chromium, not estimated** — see the reserve
  table below. Between-group gap 30px desktop / 24px mobile. Also: the shared `CostPath`
  beat strip, a live-preview pill composed as `{cost} · {term} · {N} keepers`
  that never names an archetype (each half held back until its screen is
  answered), a mobile sticky footer summary bar that expands the TradingCard
  as a bottom sheet, and a Review `info` callout naming the two never-asked
  settings (`waiverRound: 'last'`, `rookieRules` disabled). `StepBasics`,
  `SportPicker` and `StepTeams` were explicitly out of scope and are
  unchanged. Bundled with it, because the new config shape creates them:
  **(1) the `draftType` conflation is gone** — `draftType` is the draft
  FORMAT only, asked directly on League type and never derived from the
  keeper rules (a contracts league running an auction draft used to be
  mislabelled snake, rendering the wrong vocabulary silently); every keeper
  surface now reads cost/term instead. **(2) `season.js`'s term advance runs
  for any cost model** — it used to branch on `draftType === 'snake'`, so an
  auction league with a term never advanced its contract years (a combination
  that only became reachable now). **(3) `keeperArchetype` is `null` for
  slot + no term** rather than forced onto a wrong legacy value. **(4) a
  read-side shim** (`src/lib/keeperRules.js`) maps legacy `contractYears` /
  `auctionRules` / `draftType` onto the new keys so existing leagues render
  the new labels with **no data migration and no write-on-read**. **(5)
  draft format is editable in Settings** (safe — it owns no keeper data),
  while the **cost model locks** once a season has keepers or an imported
  prior draft recorded, with the reason stated rather than a warning-and-
  allow. See the **preserve-don't-delete** rule in Build constraints.
  193 tests (`npm test`).

- **Pick-ownership foundation (this branch's PR):** the data foundation
  for a third keeper archetype — **pick-cost keepers** (keeping a player
  consumes the draft round he was taken in) — plus rookie rules and
  trade validation. **Deliberately no rules logic** — nothing computes a
  keeper cost from a round yet; this PR only captures data the imports
  used to throw away and makes pick ownership first-class. Three parts:
  (1) **Acquisition metadata** — `acquisitionRound` (int | null),
  `acquisitionMethod` (`'draft'|'waiver'|'trade'|'manual'`), and
  `rookieAtAcquisition` (bool) on keeper/priorKeeper entries in the blob.
  The draft paste stamps them (`ImportTab` — the leading `N.` on Yahoo's
  team-by-team export is the ROUND, now captured per row; method
  `'draft'`, rookie false); `buildTeamPool` threads them through pool
  entries and `makeKeeper` stamps them on new keepers; absent fields
  read as defaults via `acquisitionOf` (`src/lib/acquisition.js`) so old
  data needs no migration. Editable in both edit surfaces, visually
  quiet: a collapsed `Acq · Draft R3 · Rookie` disclosure line on the
  Set-keepers `KeeperSlot`, an always-visible small "Acquisition" row
  per keeper in `KeeperEditModal`. (2) **Draft-pick ownership** —
  `league.draftPicks = { rounds?, ownership: {"<round>:<originalTeamId>":
  ownerTeamId} }`, SPARSE (absent = team owns its own pick; reassigning
  back to the original deletes the entry, so the default state costs
  zero storage). Round count derives from the deepest roster/priorKeepers
  list on file (fallback 15) unless `draftPicks.rounds` is set explicitly
  from the sheet's Rounds input (`getDraftRounds` /
  `defaultDraftRounds`, `src/lib/draftPicks.js`). Commissioner UI: a
  **snake-only "Picks" section door** (`/league/:id/picks`; shipped as
  a slide-in sheet, since promoted to a full page — see the
  picks-surface-cleanup bullet; auction redirects to overview like
  Lottery) with a round×team grid — click a cell to reassign, traded
  cells show `via {owner}` in warning tint, a "Traded Picks" roll-up
  below lists `R2 · Alex's pick → Blake` with an undo ×. **Lottery
  unification:** draftPicks is the source of truth for pick OWNERSHIP;
  the Lottery slate remains draft ORDER. Lottery reassignments write
  through to round-1 ownership (`recordLotteryPickTrade`, names→ids)
  and Picks-grid round-1 edits patch saved `lotteryResults` back
  (`reassignPick`), so the two surfaces can't disagree. Shared page:
  picks are commissioner-only for now (out of scope). (3)
  **Yahoo-name↔GM mapping** — `league.yahooTeamMap: {"<yahoo name>":
  teamId}` in the blob, ACCUMULATED (old names stay mapped so
  re-imports after Yahoo renames still resolve; identity mappings are
  stored too, because the commissioner may later rename the app team).
  The draft-paste preview resolves each parsed team via the saved map
  first (silent), then a similarity suggestion vs team names
  (exact/containment/edit-distance ≥ 0.7, `suggestTeam` in
  `src/lib/teamMap.js`); still-unresolved rows show the existing red
  dropdown plus an "Unrecognized team name" hint, and confirmed picks
  persist at import via `rememberYahooTeams`. Roster pastes are
  per-team (commissioner picks the team from a dropdown; the paste
  carries no Yahoo team names) — verified unaffected.

- **Picks surface cleanup + paste import (this branch's PR):** four
  follow-ups on the pick-ownership foundation. (1) **Picks is a full
  page now, not a sheet** — the round×team grid is page-sized content,
  so `/league/:id/picks` uses the exact Lottery pattern (full-page
  takeover, `← Back to Keepers`, maxWidth 1240); the section-door
  button is unchanged. (2) **Pick-ownership paste import** — a "Paste
  from Yahoo" button on the Picks page opens `PicksPasteModal`
  (paste → preview/mapping → confirm, one modal with steps within).
  `parseDraftPicksText` reads team-name blocks with pick lines
  (`Round 2`, `Round 2 (from X)`, `(via X)`, `(to X)`, `Rd 2`,
  `2nd Round pick`, optional year prefixes); plain rounds are
  no-ops, annotated ones become trades (deduped per round+original,
  trade-annotated entries winning since Yahoo lists a traded pick
  under both teams). Names resolve through the same
  `yahooTeamMap`-then-`suggestTeam` path as the draft import, with
  red selects for unrecognized names; Apply chains `reassignPick`
  (so round-1 lottery sync holds), grows `draftPicks.rounds` if a
  traded round is deeper than the grid, and remembers mappings.
  **Parser format is provisional** — built tolerant from the other
  Yahoo pastes' noise patterns; iterate when the user pastes a real
  sample in the PR conversation. Manual click-to-reassign stays.
  (3) **One-sheet/one-modal-max audited** — see the standing rule in
  Build constraints; the live import flows already complied (the
  draft-import mapping is a STEP inside `DraftImportModal`, now made
  explicit with a "Step 1 of 2 / Step 2 of 2" line in the modal
  header). The only overlay-on-overlay left is the dormant
  `SeasonSetupWizard` path (wizard overlay → import modals), which is
  unrouted since the #21 redesign — flagged, not refactored (wizard
  work out of scope). (4) **Label clarity** — the keeper-slot
  acquisition line reads `Acquired: draft R3 · rookie` /
  `Acquired: manual entry` (lowercase readable forms via
  `acquisitionSummary`; still one quiet collapsed line), and the
  draft-import expander is `Set contract years (carry-forward) ▸`
  with a helper line when expanded ("Set each player's current
  contract year entering this season.").

- **Import/picks IA + clarity fixes (this branch's PR):** four fixes on
  the import/picks surfaces. (1) **Persistent nav on full pages** — the
  Picks and Lottery full-page views now keep the league identity card
  AND the Overview/Set-keepers + section-door row exactly as the
  Keepers home shows them; the current door renders active, any
  door/tab navigates directly, and "← Back to Keepers" is gone. On a
  full page neither sub-tab is highlighted (the active door carries the
  current-surface signal); clicking a sub-tab routes back to
  `…/overview` with that view selected. Standing rule recorded in
  Build constraints. (2) **Draft import says what it's for and shows
  what it did** — the Import-sheet card's blurb is per-league-type
  (auction: drafted price → keeper costs; snake: optional — draft
  rounds + contract carry-forward), and both `DraftImportModal` and
  `RosterImportModal` end on a RESULT step ("N players imported across
  M teams" with per-team contract/price counts; roster: saved count +
  directory match rate) with a Done button instead of closing
  silently. (3) **Acquisition metadata is hidden by default** — the
  keeper-slot "Acquired:" line is removed and `KeeperEditModal`'s
  per-keeper Acquisition row sits behind a single "Show acquisition
  details" toggle; capture at import is unchanged (verified: pastes
  still stamp round/method silently). See the acquisition-visibility
  rule below. (4) **Picks grid advertises click-to-reassign** — lead
  copy is now "Click any pick to record a trade", untraded cells get a
  hover state (`.kh-pick-cell`), and cell tooltips say "click to
  record a trade".

  **Acquisition-visibility rule:** acquisition metadata
  (round/method/rookie) is dormant-by-design — no shipped archetype
  consumes it, so **no surface displays or edits it at all** (the
  "Show acquisition details" toggles that briefly existed on the
  Set-keepers panel and KeeperEditModal were removed as unexplainable
  bloat). Imports keep stamping the fields silently, the metadata
  rides pools/rollovers untouched, and the Last Draft page's snake
  `Rd` select still writes `acquisitionRound` (as the draft-record
  round, which is self-explanatory there). The shared `AcquisitionRow`
  editor stays in `KeepersTab.jsx`, exported but UNWIRED — it returns
  when the pick-cost archetype ships and its leagues surface these
  fields by default (per-league gating on the archetype config, not a
  global reveal).

- **Last Draft page + import-flow flattening (this branch's PR):** the
  imported prior-year draft finally has a HOME — a **"Last Draft"
  section door** (both draft types) opening a full page at
  `/league/:id/draft` (persistent-nav pattern, `LastDraftPanel` in
  `src/tabs/DraftResultsTab.jsx`). Content: all teams' `priorKeepers`
  in one view — team chips (All teams + per-team) over per-team
  sections of rows (headshot · pos chip (directory-first, paste
  fallback) · name · VALUE · remove ×). The VALUE is inline-editable:
  drafted price `$` input on auction (`keptFor`), `Rd` select on snake
  (`acquisitionRound`). Unmatched names get the roster-import
  treatment — red flag + "unmatched" hint, resolvable in place because
  every name cell is the real `PlayerAutocomplete` (local draft state,
  commits on suggestion pick or blur so typing doesn't spam league
  saves). Empty state = "No draft imported yet" + Paste Draft.
  **The import lands here and the modal-on-sheet stack is gone:** the
  paste→map→confirm steps were extracted from `DraftImportModal` into
  `DraftImportFlow` (`ImportTab.jsx`) and run as PAGE CONTENT on the
  Last Draft page (zero overlays anywhere in the flow — audited);
  the PR #34 result-summary step became a transient dismissable
  success banner over the now-populated table. The Import surface's
  draft card is a pointer to this page (see the follow-up bullet — the
  Import sheet became a full page and the `state.startImport`
  hand-off was dropped for a plain page→page link).
  `DraftImportModal` survives only as a thin wrapper
  (flow + result step) for the dormant `SeasonSetupWizard` path.
  Adjacent fixes: (a) the **"Show acquisition details" toggle moved to
  the live Set-keepers keeper panel** (PR #34 had put it in
  `KeeperEditModal`, which isn't reachable in live UI) — later
  REMOVED entirely in the pre-merge round (see the
  acquisition-visibility rule); the shared `AcquisitionRow` extracted
  here survives unwired in `KeepersTab.jsx`;
  (b) **shared page, auction:** rows show a quiet `Drafted $X`
  secondary line under `Keep for $X` (threaded as `draftedCost`
  through `buildSharedRows` — prior record's `keptFor` for keepers,
  `wasCost` for contract rows; rostered/undrafted rows have none),
  one treatment on mobile rows + desktop Contract column, and the
  desktop Contract column widens 100→132 for auction only (snake's
  compact strings keep 100). NOTE: **PR #34 never actually reached
  main** — it was merged into `claude/picks-surface-cleanup` after
  #33 had already landed on main — so this branch cherry-picks it
  first and builds on top.

- **Parser hardening + Import-as-page (this branch's PR, follow-up):**
  three fixes from real basketball pastes + an IA pass. (1) **The
  draft parser handles both Yahoo Draft Results views, sport-
  agnostic** — extracted to `src/lib/draftParse.js` (see its file-map
  entry): the flat PICKS view (was parsing its header row as a team
  named "Pick Player Salary Team" with 0 players) and the TEAM view
  with basketball/football row shapes (multi-position lists, mixed-
  case abbrevs, tolerant trailing junk). A parse yielding 0 players
  now shows an error naming the other Yahoo view instead of an empty
  preview; unit fixtures cover 3 sports × both views
  (`npm run test:parser`). (2) **Import is a full page** at
  `/league/:id/import` (persistent-nav pattern) — the roster paste
  stays a modal OVER it, and the draft card is a plain pointer link
  to Last Draft (page→page). This killed the last drawer→page
  transition and produced the standing **overlay-direction rule** in
  Build constraints. (3) **Copy:** page headline "Import last season"
  + one-line sub; "Pre-Playoff Rosters" renamed **"Last Season's
  Rosters"** with league-agnostic copy ("Paste each team's
  end-of-season roster… seeds who each team can keep") — the old
  pre-playoff-snapshot phrasing was one league's specific eligibility
  rule; eligibility windows vary by league and aren't modeled yet.
  Same de-specification in `RosterImportModal`'s header line.

- **Auction-vocabulary + mapping polish (this branch's PR, final
  round):** four fixes from real basketball QA. (1) **No contract
  language in auction contexts** — auction has no contract concept, so
  the eligible pool says `Drafted $83` (muted status) instead of "On
  contract", `Undrafted` instead of "No contract", group headers read
  "Drafted last year · eligible" / "Rostered · undrafted", the pool's
  Expired tab is snake-only (like the shared page's Expired filter),
  the shared page's "Under contract" chip relabels to "Drafted last
  year" on auction (**superseded** — that chip is gone entirely on
  term-less leagues; see the shared-page cleanup bullet), and the
  workbench tip says "drafted prices".
  (2) **Escalation math is visible wherever a keep cost renders**:
  pool rows pair `Drafted $83` with a `Keep $88` value, keeper slots
  show `Drafted $83 →` before the editable keep-cost input (via a
  `draftedCostByName` lookup against `team.priorKeepers`), the shared
  page already had the pair, and the Last Draft header (auction)
  states the league's rule from config: "Keeper cost = drafted price
  + $N/yr · undrafted players start at $M" (same `|| 5` fallbacks as
  `buildTeamPool`, so the stated rule always matches computed costs).
  (3) **Draft-import mapping blocks duplicates**: teams mapped on
  another row stay in every dropdown marked `✓ (mapped)`; picking one
  STEALS it (the other row visibly reverts to unmapped), auto-resolver
  collisions (saved map + similarity can both hit one team) show an
  inline error naming the team and disable Import until fixed, and an
  "N of M teams mapped" counter (distinct teams) sits by the confirm.
  (4) **Value-sorted rows**: the Last Draft page sorts each team's
  players by price desc (auction) / round asc (snake), missing values
  last, alphabetical tiebreak — display order only; edits/removes
  still address the ORIGINAL `priorKeepers` index, and the auction
  price cell commits on blur/Enter (`PriceCell`) so the list can't
  resort under the cursor mid-edit. The auction pool's drafted list
  sorts by keep cost desc the same way.

- **Shared-page polish for stats-less leagues (this branch's PR):**
  three fixes from a real basketball league viewed via public link.
  (1) **Stats-less rows have their own compact layout** — non-hockey
  mobile rows are a single balanced line (name+pos left, price/status
  inline right, tighter padding, ~46px vs the hockey two-liner's
  ~60px) instead of the hockey card minus its headshot/stat-line
  content. (2) **Mascot speech gated to the true empty state** — the
  "No keepers declared yet" mascot chip renders only when there are
  no rows at all; a populated list with zero keepers gets a one-line
  quiet notice (no mascot — speech is for waiting surfaces, and a
  populated page isn't one). (3) **Desktop shows a real table for
  stats-less leagues** — `useTable` is now viewport-only; non-hockey
  leagues render the same `StatTable` with `cats=[]`
  (Player/Contract/Status, no stat columns, no skater/goalie split,
  no headshots, single-line cells) instead of mobile cards stretched
  wide. Hockey rows/table verified unchanged (regression-asserted).

- **Shared/import polish round (this branch's PR):** five fixes from
  real basketball QA. (1) **Sport-aware paste examples** — the roster
  modal's placeholder and the draft paste step's hint/placeholder show
  rows shaped like the league's own sport (`ROSTER_SAMPLES` /
  `DRAFT_SAMPLE_ROWS`, keyed off `league.sport`, hockey fallback).
  (2) **Yahoo placeholder rows filtered + roster editing** — the
  roster parser (extracted to `src/lib/rosterParse.js`) skips
  vacant-slot furniture ("--empty--", "(Empty)", punctuation-only
  lines; `isRosterPlaceholder`), and saved rosters gained minimal
  editing via a shared **`RosterEditor`** (`RosterImportTab.jsx`):
  per-player remove × and a `PlayerAutocomplete`-backed add (directory
  picks carry the position; typed adds save name-only). Its one entry
  point is the Import page's per-team **"Edit roster" → a MODAL**
  (`RosterEditorModal`; page→modal per the overlay-direction rule) —
  team rows stay one line each, nothing expands inline. Earlier forms
  (an inline accordion; an Eligible Pool "Edit roster" entry) were
  tried and REVERTED — the accordion left a huge empty grid cell
  beside the expanded roster, and the pool editor hijacked the
  keeper-picking flow (the pool's job is selection, not roster
  repair). See Open item #24 for the eventual real home. (3) **Shared-page
  value sort for stats-less leagues** — `sortRowsDefault` takes the
  league now: auction sorts keep-cost desc, stats-less snake sorts
  round asc (rows carry `round` from `acquisitionRound` via
  `buildSharedRows`), alphabetical only as tiebreak/fallback; hockey's
  points sort unchanged, and the desktop table's `orderRows` passes
  stats-less lists through instead of re-alphabetizing. (4) **Player
  search on the shared page** — an input under the filter chips
  (inside `.kh-share-rail`, so print hides it) filters the current
  view by `normalizeName` matching (same as the Eligible Pool);
  no-match shows "No players match “x”." and never summons the
  mascot. (5) **"Eligible, not protected" unified** — desktop team
  filter renders it as the in-table partition row (since #36); the
  mobile eyebrow now matches that treatment's tight spacing.

- **NFL player directory + import resolution (this branch's PR):** imported
  rows stop storing free-text names and start storing a **resolved Sleeper
  `player_id`**, so a later reconciliation against another platform (Yahoo) is
  a join instead of fuzzy name matching across hundreds of rows. **NFL only** —
  the other three sports keep their exact current behavior, and no generic
  multi-sport abstraction was built (their sources differ enough that a shared
  shape now would be guesswork). Four parts. (1) **Storage** —
  `supabase/migrations/004_nfl_player_directory.sql` adds `public.nfl_players`
  (one row per Sleeper player; `player_id text` PK because team defenses have
  ids like `'CAR'`; promoted columns incl. **`yahoo_id` / `espn_id` /
  `sportradar_id` / `rotowire_id` / `stats_id` / `fantasy_data_id`** — unused
  today, and the whole reason for doing this before the Yahoo work — plus the
  **full unfiltered** Sleeper object in `data jsonb`) and
  `public.nfl_directory_refreshes` (one row per run: counts, cross-platform id
  fill rates, ok/error). The `?active=true` / `?position=` filters are
  deliberately NOT used: last season's rosters reference retired and cut
  players, and they must still resolve. (2) **Refresh is manual, never
  destructive** — a button on the Import page's **NFL player directory** card
  (football leagues only; status line = stored player count + last-refresh
  time + fill rates). *Manual-only and the fixed 250-row chunking are both
  SUPERSEDED by the follow-up bullet below* (daily cron + byte-budgeted,
  self-healing writes); the rest of this bullet still stands. Writes go
  through `upsert_nfl_players(jsonb)`; **there is no delete
  policy on either table**, so a stored id can never be orphaned by a later
  fetch, and every column is `COALESCE`d on conflict so a null in a later
  payload leaves the last known value rather than blanking it (a player who
  drops out of Sleeper keeps his row with a stale `last_seen_at`). Same
  preserve-don't-delete rule as the keeper data, enforced in the DB rather
  than in app code. RLS: read for `anon` + `authenticated` (public reference
  data, so demo leagues resolve too), write for `authenticated` only.
  (3) **Resolution at import** — the roster paste and the draft paste both
  resolve names through `normalizeName` against `search_key` (OUR
  normalization is the join column on both sides, so "A.J. Brown" and
  "AJ Brown" both land on `ajbrown` with no fuzzy matching; Sleeper's own
  `search_full_name` is stored alongside for reference and the two agree in
  practice). Every saved row carries **both** the resolved `playerId` and
  `sourceName`, the original pasted string — if a match is ever wrong, that's
  the only way to see what it was resolved FROM. A name matching more than one
  player is narrowed by the **team/position the paste already carried** (the
  roster parser now captures Yahoo's "Buf - QB" line as a `hint`, never as a
  stored position; the draft parser already had `proTeam`/`positions`), and a
  tie that the hints can't break comes back **ambiguous rather than guessed**.
  (4) **Unmatched rows are fixable, never silently text-only** — the roster
  preview flags them (three states: matched / not-in-directory / matches-N) and
  `PlayerAutocomplete` is now NFL-aware (debounced Supabase typeahead beside
  the hockey JSON path), so picking a suggestion attaches the id; on the Last
  Draft page an NFL row with no `playerId` is itself the flag ("no player ID —
  pick this player from the suggestions"), which needs no lookup at all.
  **Cross-platform fill rates are measured, not assumed** — but this container's
  network policy blocks `api.sleeper.app`, so the numbers come from the app: the
  refresh records `yahoo_id`/`espn_id` counts over active players and the
  directory card displays them, and `npm run players:nfl:report` prints the same
  report (with a per-position breakdown) from any machine that can reach
  Sleeper. **The real numbers are in — see "Cross-platform ID coverage" below.**
  Not in scope: backfilling ids onto already-imported rows
  (Open item #26), and nothing yet READS the cross-platform ids.

### Cross-platform ID coverage (MEASURED — the Yahoo sizing input)

From the live `nfl_players` table, 2026-08-18, first full load:

| | count | % of active |
|---|---|---|
| Players stored (unfiltered payload) | 12,221 | — |
| `status = 'Active'` | 8,579 | 100% |
| Active with `yahoo_id` | 4,018 | **47%** |
| Active with `espn_id` | 3,900 | **45%** |

**What this means for the Yahoo integration (Open item #15): it cannot be a
pure `yahoo_id` join.** Roughly half of active players have no Yahoo id at all,
so the reconciliation is **two-tier — join on `yahoo_id` where present, fall
back to `search_key` name matching where it isn't.** Both halves already exist:
`search_key` is our `normalizeName` on both sides, and `pickDirectoryMatch`
handles the ambiguity that name matching creates. Plan for both paths and for a
review surface on what the second one can't resolve; do NOT design as if the id
join covers everything.

**ASSUMPTION, NOT YET VERIFIED:** the missing 53% is expected to be the tail —
practice-squad and deep-bench players nobody rosters in a 12-team league — so
coverage on *real rosters* should be far higher than 47%. Plausible, and it
matches the fact that the payload is deliberately unfiltered (retired and cut
players are stored on purpose so old rosters still resolve). But it is a guess
until measured. **How to settle it cheaply:** after a real league's rosters are
imported, count how many stored rows carry a `playerId` whose directory row also
has a `yahoo_id` — that's the number that actually governs the integration's
cost, and the 47% figure above is only its floor. Until that's run, size the
Yahoo work off 47%, not off the optimistic reading.

- **Directory refresh: daily schedule + a resilient writer (this branch's PR,
  follow-up):** the first real refresh fetched all 12,221 players but died at
  row 750 writing them (`TypeError: Failed to fetch`). Two fixes, plus the
  reversal of the manual-only decision. **(1) The diagnosis is in the error's
  shape**: supabase-js RETURNS `{data, error}` for any HTTP response, so a
  THROWN `TypeError` means no response arrived — not Postgres, not auth, and
  not parallelism (the writes were already sequential in a `for await` loop).
  Chunks 1–3 of identical row count succeeded, so the only thing that varied
  was BYTES: Sleeper player objects differ wildly in size, so a fixed 250-ROW
  chunk is a wildly varying request size. Two causes fit (a request body
  rejected at the edge, or a transient drop) and they need different fixes, so
  `writeDirectoryRows` (`src/lib/nflDirectory.js`) **runs the discriminating
  experiment instead of guessing**: chunks are budgeted by BYTES (128KB
  browser / 256KB server), a failed chunk retries with exponential backoff
  (transient drops recover here), and a chunk that still fails is **split in
  half** down to a single row (a size limit recovers here, and only here).
  Which one recovered it is counted and reported by `diagnoseWrite` into the
  run log's `notes` and the card, so a recurrence names its own cause. Auth
  and permission failures are marked `fatal` and abort instantly — retrying
  those 4× per chunk across 12k rows would be thousands of pointless requests.
  A failure now reports rows-written and states that re-running is safe
  (the upsert is idempotent), rather than leaving the question open.
  **(2) Refresh is automatic and daily** — a **Vercel cron** (`vercel.json`
  `crons`, 09:00 UTC) hits `api/refresh-nfl-directory.js`. Chosen over Supabase
  `pg_cron` because that would mean enabling `pg_net`, fetching 5MB of JSON
  from inside Postgres and parsing it in a SQL function — more surface, in the
  layer that's hardest to debug; Vercel already builds and deploys this app, so
  the job is one config entry plus one file, with logs where every other log
  is. **The manual button calls the SAME endpoint** (server-side execution
  removes the browser from the risky part) and falls back to the in-browser
  writer only when the endpoint is missing or returns **501 = not configured**
  — so the directory can still be loaded before the env vars are set. The
  function needs `SUPABASE_SERVICE_ROLE_KEY` (server-only, never `VITE_`
  prefixed — it bypasses RLS) plus `SUPABASE_URL`, and honors `CRON_SECRET`.
  **(3) Runs are logged as they happen, not just when they succeed**
  (`005_directory_refresh_runs.sql`): a row is opened with `status='running'`
  BEFORE the write and patched at the end, and carries `trigger`
  (`scheduled`|`manual`). So a run that dies mid-flight leaves a stalled row
  instead of silence, and the card surfaces a failed or never-finished
  scheduled run even while the stored player count looks healthy — a silently
  failing cron being worse than no cron. Staleness threshold dropped 21 → 3
  days, since a working daily schedule should never reach it.

- **The card reads the DIRECTORY, not the run log (this branch's PR,
  follow-up):** the first successful refresh wrote all 12,221 players and then
  showed "The last refresh failed", "refresh time unknown", and no fill rates.
  **Cause:** the run row named `trigger` — a column migration 005 adds — so on
  a pre-005 schema PostgREST rejected the insert with PGRST204, `startRun`
  swallowed it and returned null, and `finishRun(null, …)` returned early. A
  fully successful run left NO row. That was a regression introduced with the
  scheduled-refresh work: before it, success INSERTED a complete row directly
  and didn't depend on an opening row existing. Three fixes, and the third is
  the real lesson. **(1) Log writes are schema-tolerant** —
  `withoutUnknownColumn` parses PostgREST's "Could not find the 'x' column"
  and retries without it, so an optional column can never cost the record;
  `finishRun` INSERTS the completed row when no row was opened, so a finished
  run always leaves one. Both paths (browser + serverless) use it. **(2) A
  failure banner can't outlive the failure** — `refreshRunState` (pure,
  unit-tested) reads only the NEWEST run, and suppresses it entirely once the
  player rows were written AFTER that run ENDED (`finished_at` when present,
  else `refreshed_at`, which for a failure row inserted at the end IS the end
  time). A partial write during a failed run therefore still shows, while a
  later unlogged success clears it. **(3) The card's facts now come from
  `nfl_players`** — count, `max(last_seen_at)` for "last written", and the
  yahoo/espn fill rates as three `count(head)` queries with
  `.eq('status','Active')`. The run log is provenance only (scheduled vs
  manual, what failed). **A log row is not allowed to be load-bearing for
  facts the data itself knows**; when no completed run is on record the card
  says exactly that instead of printing "unknown" beside a healthy count.

- **Member-facing rules modal + one grid on every view (this branch's PR,
  follow-up):** three changes. (1) **The team header block is gone** — a team
  tab showed "BEN SC. — KEEPERS DECLARED / 0 keepers", which restated the
  selected tab and the highlighted rows. (2) **The grid renders identically on
  every view** — `hideTeam` (which suppressed the owner name on a team tab and
  hid the pill entirely on eligible rows) is removed, so the default view and a team
  tab differ ONLY in which rows are in the table. Every row names its holder on
  every view; kept rows keep the accent + check. (3) **A "Rules" button beside
  the league name** opens `LeagueRulesModal` — one modal, sections within.
  **Derived half** (`src/lib/rulesSummary.js`, pure + tested): a card grid
  built from the keeper config — slots and whether they must be filled, what
  keeping costs (auction: last year's price + $N/yr, plus the undrafted floor;
  picks: the drafted round or top picks, escalation, waiver round; slot: a
  roster slot), term or no limit, rookie rules when enabled, draft format.
  Cards not prose, and it **cannot drift from the rules the app applies**
  because it reads the same keys the cost math does. **Written half**:
  `league.sharedRulesNote` / `league.sharedPayoutsNote`, free text in the
  existing `data` blob — **no table change** — edited from a "Rules your league
  sees" card in Settings (which renders the same `RulesGrid` so the
  commissioner sees exactly what members see) and omitted from the modal
  entirely when blank. Payouts is free text ONLY: the structured `payouts` /
  `payoutNote` stay unprojected, so nothing written for the commissioner's own
  eyes is exposed — the new key is authored deliberately for members.
  **`006_shared_league_rules.sql` must be run** or none of this reaches the
  page: `get_shared_league` is an explicit field-list projection, so the new
  config keys (`keeperCostModel`, `termModel`, `termYears`, `pickRules`,
  `rookieRules`, `mustFillSlots`) AND the two note fields have to be named in
  it. Without it the modal falls back to the legacy shim and a slot- or
  pick-cost league would be described wrongly.

- **Shared-page label truth pass (this branch's PR, follow-up):** two copy
  changes, no logic, both correcting labels that claimed more than the data
  supports. (1) **"Kept by" → "On team"** — pre-deadline nobody has kept
  anyone, so the column was reading as a claim about last year's keeper
  decisions when it actually holds whose roster the player is on. "On team" is
  true in both states, and it degrades correctly: if free agents ever join the
  page it is legitimately blank for them, where "Kept by" would be nonsense.
  Post-deadline the row highlight already marks who's kept, so the column never
  needed to carry that meaning. (2) **"All players" → "Rostered"** — the view
  holds players who were on a roster at the end of last season, not a universe
  of all players. **"Rostered" not "Eligible" deliberately**: a keeper-
  eligibility cutoff is coming (players picked up after the fantasy regular
  season can't be kept), and "Rostered" stays true under whatever eligibility
  rules land — **eligibility becomes something a ROW shows, never something a
  tab claims.** Apply that test to any future label here. The termed path's
  "Keepable" went with it in the same pass (same class of claim), so the chip
  is now `locked ? 'Final keepers' : 'Rostered'` for **every** league type —
  one label across sports and cost models, so the cutoff rule doesn't have to
  re-fix a per-sport variant later.

- **Rules button wiring fix + two shared-page bugs (this branch's PR,
  follow-up):** the Rules button did nothing — pointer cursor, no modal, no
  console error. **Cause:** the trigger and its `useState` were in
  `SharedLeaguePage` while the modal's render had landed in `InvalidLinkPage`
  (the edit that inserted it matched the FIRST `<FooterMark />` in the file,
  which belongs to the invalid-link state). Clicking flipped state in a
  component that rendered no modal; nothing threw because the orphaned render
  sits on a page that only appears for a dead link — where it *would* have
  thrown a ReferenceError on `rulesOpen`. **The tests passed because they
  rendered the button and the modal SEPARATELY and never the wiring between
  them** — a whole-page render can't click, so "the trigger exists" and "the
  modal renders" both held while the connection was missing. Fix is structural:
  `RulesButton` (`LeagueRulesModal.jsx`) owns the trigger, the state and the
  modal, so they cannot be separated again, and takes `defaultOpen` purely so
  a server render can exercise the OPEN state — that test is the one that would
  have caught it. Two more, both from the same session: the trigger got a real
  touch target (34px desktop / **44px mobile** via `.kh-share-rules-btn`; it
  had shipped as a ~22px pill), and **the search bar no longer disappears with
  its own results** — it's a filter control, so the empty state renders it
  inside a card above the "No players match" message, and on hockey the toolbar
  now rides whichever of the skaters/goalies tables actually renders (a search
  matching only goalies used to empty the skaters table and take the search
  with it).

- **Shared-page: one flat list, kept pinned + marked (this branch's PR,
  follow-up):** three fixes for the page as it goes out to the league.
  (1) **Team chips are alphabetical everywhere the strip appears** —
  `sortTeamsByName` (`src/lib/teamOrder.js`) is now the one place that order is
  decided, used by the shared rail, the Set-keepers selector and the Last Draft
  chips. Diagnosis first: the sort had **never landed anywhere** (no commit in
  history, both strips mapped `league.teams` directly), so this wasn't a
  shared-page regression — it was missing on every surface. Display order only;
  teams are addressed by id, so a click resolves the same either way.
  (2) **The search moved into the list it filters** — it was floating between
  the chip rail and the table, belonging to neither. It's now a `ListSearch`
  header strip INSIDE the table card (and directly above the mobile list), with
  a live row count; on hockey it attaches to the skaters table only, not both.
  Print hides it alongside the rail (`.kh-share-search`).
  (3) **"Eligible, not protected" is gone — one flat list, kept pinned and
  marked in place.** The label only existed to explain an absence. Now
  `keepersFirst` (pure, stable) lifts declared keepers to the top of whatever
  view is showing — that team's keepers on a team tab, the whole league's on
  the default view (where the On-team column names the holder) — and the ROW
  carries the meaning: success tint + border, plus a check glyph in the On-team
  pill. Same treatment as the commissioner's Eligible Pool, which marks
  selected players in place rather than sectioning them off. The dim on
  non-keepers went with it (highlight-only reads better and keeps the returning
  pool legible). Sticky-cell rule still holds: the tint is LAYERED over cardBg
  on the sticky cells (`rowBg(row)`) and set on the `<tr>` for the scrolling
  cells, never as a transparent background, or scrolled stat columns ghost
  through. Clicking a stat header re-sorts within the kept block and the
  eligible block rather than mixing them. **Partially addresses Open item #28**:
  post-deadline, the returning pool is simply the unhighlighted rows instead of
  needing its own view — but #28's own pass is still owed (see the item).

- **Shared-page cleanup for real league use (this branch's PR):** the page went
  out to actual leaguemates, whose job on it is deciding who to keep and who to
  trade for. Three small changes, no new surface. (1) **The "Drafted last year"
  chip is gone on term-less leagues** — its row set (declared keepers + anyone
  carrying a prior price) is very nearly the whole league, so it duplicated
  the default view while implying a distinction that doesn't exist where keeping
  costs dollars and nothing else. **Term leagues keep "Under contract"**, where
  being under contract IS a distinct state. Rail rules moved into
  `sharedFilterChips` (pure, tested) so the page no longer inlines them.
  (2) **Column headers say what the cells hold**: Status → **"Kept by"**
  (**superseded** — now "On team"; see the label-truth bullet)
  everywhere, and Contract → **"Cost to keep"** on dollar-cost leagues only
  (`costColumnLabel`) — a termed league's cell holds `Y1/3`, so calling that a
  cost would be wrong. Widths are untouched: the longer label only lands in the
  auction column, which is already 132px for the `Keep for $X` / `Drafted $Y`
  pair. (3) **The default view was already the trade view and stays as-is** —
  verified rather than changed: `buildSharedRows` covers every team's
  `priorKeepers` + `roster` (deduped by name, strongest state winning), each row
  carries the escalated keep cost (or the undrafted floor) and the holding team,
  and `sortRowsDefault` sorts cost desc for auction with cost-less rows last but
  never dropped. **Caveat worth remembering: that view is only as complete as
  the imported rosters** — a team whose roster was never pasted contributes only
  its drafted players. And the cost-desc sort is the STATS-LESS path; hockey
  still sorts by last-season points (`sortRowsDefault` branches on sport first).

- **Import guards + price provenance (this branch's PR):** two data-integrity
  gaps with one root cause — nothing distinguished an imported/calculated value
  from a hand-entered one, and nothing stopped one overwriting the other.
  **(1) Every bulk import that can destroy work now confirms first, naming what
  it will destroy.** Not a generic "are you sure": `src/lib/importGuard.js`
  computes the impact from counts the app already has, and the dialog reads it.
  Roster re-import: *"3 players currently on file for Ryan will be replaced —
  including any you added or removed by hand"* plus, crucially, **which
  declared keepers aren't in the paste** (the roster is the spine of
  `buildTeamPool`, so a keeper missing from a re-import stays declared but
  silently drops out of the eligible pool — that's the sharp loss, and it's
  knowable at confirm time because the parsed names are in hand). Draft
  re-import: rows replaced, rounds overwritten, **and what survives** (hand-set
  prices, declared keepers' recorded costs) — a warning that only lists losses
  gets clicked through, and the reassurance is often the reason it's safe to
  proceed. Also guarded: the **Picks paste** (only warns when the paste
  contradicts a pick trade already on the grid — it writes ownership pick by
  pick, so that's the only thing it can destroy) and the dormant
  `PrevContractsPasteModal`. **A first import never nags** — `hasImpact` is
  false when there's nothing on file. Cancel is the safe default everywhere
  (autofocus, Escape, scrim). Guards render as a **STEP inside** the host modal
  (`ConfirmBody`), never as a modal over a modal — see the overlay rules.
  **(2) A hand-set price is stored separately from the calculated one and
  marked wherever it renders.** `src/lib/priceProvenance.js`: `keptFor` keeps
  its meaning as **the value in force**, `keptForComputed` preserves the
  calculated/imported value under an override, `keptForOverridden` flags it.
  **The field ordering is deliberate and load-bearing** — see the rule below.
  A re-import then refreshes the calculated price *underneath* while the
  commissioner's number stays in force (`refreshComputedPrice`), which is what
  makes a draft re-import genuinely non-destructive for prices rather than
  merely warned-about. Marked with a neutral `EditedMark` pill (never
  warning-coloured — an override is a legitimate action, not a problem) plus a
  `↺` reset on every editing surface: Set-keepers keeper slot, Last Draft price
  cell, the Eligible Pool's `Drafted $X` status, the Overview team cards, the
  keeper grid cell, and `KeeperEditModal` (unrouted, wired so it can't bypass
  provenance if revived). **Wherever the price is EDITABLE the mark's slot is
  reserved, not conditional** (`PriceMarkSlot`): the three editable fields
  (Set-keepers slot, Last Draft cell, KeeperEditModal) always render it and
  merely hide it, because mounting it on the first keystroke stole width from
  the row and moved the field under the cursor — the same fault as the
  wizard's option-strip reserves, and the standing rule now in Build
  constraints. Read-only surfaces stay conditional; nothing there is typed
  into. Typing the calculated value back clears the override
  rather than pinning a badge to a row nobody changed. **The season rollover
  clears provenance** (`advanceKeeper`): the escalated price is again something
  the app calculated, and carrying "edited" forward would mark the row forever
  and point its reset at a previous season's arithmetic. **(3) An append-only
  change log** in the blob (`league.changeLog`, **no schema change**) records
  price edits, term/round edits, imports and rollovers as
  `{at, kind, field, teamId, teamName, player, from, to, note}`, newest first,
  capped at 500 (an unbounded array inside a jsonb row that's rewritten whole
  on every save). Surfaced as a **Change Log card in Settings** with a standing
  roll-up above it — *"2 prices are set by hand right now (Jokic, Doncic)"* —
  which is the question the log can't answer, since an edit may have been reset
  since. **It is a LOG, not history**: it records what changed, not the state
  before it, and nothing in it restores anything; the card says so.
  Bundled fix found while reviewing: **the draft import dropped every price on
  an auction-cost league that also has a term** — the price/term branch was an
  either/or, so the one combination the cost/term split made reachable imported
  with `keptFor` silently absent. Cost and term are independent here now too.
  439 tests (`npm test`), including `test:provenance` (pure) and `test:guards`
  (renders the real surfaces and asserts the numbers reach the HTML — the
  Rules-button lesson).

  **Price-field rule: `keptFor` always holds the value IN FORCE.** The
  override goes in `keptFor`; the calculated value moves aside into
  `keptForComputed`. The intuitive arrangement is the opposite (leave the
  calculated value alone, put the override in the new field) and it is **wrong
  here**, because the public shared page reads through `get_shared_league`, an
  explicit field-list projection naming `keptFor` and nothing else: storing the
  override in a new field would have shown leaguemates the pre-edit price until
  that function was migrated. Both values are stored and the override is still
  what's read — this way a reader neither module knows about shows the RIGHT
  number and merely misses the marker, instead of confidently showing a stale
  one. Failure modes are not symmetric; pick the one that degrades safely.
  `scripts/test-shared-page.mjs` asserts an override reaches the page, so an
  inversion fails the suite rather than the league.

  **The real fixes are still owed — the guard is a stopgap.** Both are named
  here rather than in Open items because they belong to this arc:
  **(a) merge instead of replace.** Every paste import replaces the list it
  targets. Reconciling row by row (keep what's on file, add what's new, flag
  what conflicts) is the correct answer, and the price-override carry-forward
  is a narrow first instance of it. **(b) snapshots / undo.** There is no
  version history anywhere in this app, which is why "preserve, don't delete"
  has to be a standing rule. A pre-import snapshot per league (a copy of the
  blob, restorable from Settings) would make every one of these guards a
  convenience rather than the last line of defence. Until then a guard's copy
  must never imply recoverability — the dialogs say "There's no undo."

- **Member-facing price provenance (this branch's PR, follow-up):** the second
  half of the override work, held back one round because it needs a projection
  change and the shared page is a public surface. **The decision was to mark
  it, quietly.** The decisive argument isn't a trust-vs-argument tradeoff: the
  discrepancy is **already visible**. The page prints `Drafted $83` beside
  `Keep for $95` and the rules modal states the escalation rule, so a member
  doing the arithmetic already sees a number that doesn't add up. The only
  choice is whether that reads as a commissioner decision or as a bug in the
  tool — and unexplained-and-wrong is worse for trust than
  explained-and-arguable. It does invite argument over individual edits, but
  that argument happens anyway when someone notices, on worse terms.
  Framing carries the mitigation: the label is **"Set by commissioner"**, not
  "Overridden"/"Edited" (most of these are paste corrections, not favours),
  and the page shows the marker ONLY — never the old→new pair, never a
  timestamp. **The page is not a diff**; the change log that holds those stays
  commissioner-only. `CommissionerSetMark` is deliberately NOT `EditedMark`
  (which names the calculated value and offers the way back) — two components,
  because they answer to different information rules, documented together in
  `components.jsx`. **Only a hand-set KEEP COST is marked, never a corrected
  DRAFTED price**: the keep cost still comes out of the escalation in that
  case, so there's no inconsistency to explain — only an edit to argue about.
  That's the standing test for anything else this page might mark: *does the
  number contradict a rule the page itself states?* The rules modal gains one
  card on dollar-cost leagues ("Price adjustments — Commissioner can set one"),
  stated as a rule rather than as current state, so it holds whether or not an
  override exists yet. **`007_shared_price_provenance.sql` must be run** or
  none of it appears. It projects `keepers.keptForOverridden` (the boolean
  only — `keptForComputed` stays private) and, folded into the same trip, a
  pre-existing gap: **`priorKeepers.acquisitionRound` has never been
  projected**, so `sortRowsDefault`'s round ordering for stats-less snake
  leagues has silently fallen back to alphabetical on the shared page since it
  shipped. Both now have regression tests in `scripts/test-shared-page.mjs`.

- **Yahoo Draft Picks import reads the real page (this branch's PR):** the
  Picks paste parser expected a `Round 2 (from Team)` block format Yahoo never
  produces. Yahoo's Draft Picks page has three views — **Grid** (team × round,
  counts only), **By Round**, and **By Team** — and only **By Round is complete
  on its own**, so that is what the import reads now (`src/lib/picksParse.js`,
  pure). Each round is a block of alternating lines: the CURRENT owner, then
  the ORIGINAL owners of every pick it holds that round (or `-`), and when a
  team holds several Yahoo runs the names together with **no separator**
  (`…Hellebuyck GirlStop F***ing Crying Brothe grit grinders`). Solved by
  exact-cover segmentation: every owner line in the paste is a known team, so
  the vocabulary comes from the paste itself (the league's own names are a
  second tier), and the concatenation is split on **`normalizeTeamName`** —
  the GM-mapping key, now exported from `teamMap.js` and widened to keep any
  Unicode letter/digit so a Cyrillic team (`ЦСКА Совки`) no longer normalises
  to the empty string. A chunk no team covers is reported in its raw spelling
  with that pick skipped, never guessed; a string that splits more than one
  way is flagged as ambiguous. **Validation is built in and reported by round
  and team, never silently accepted**: every round must account for exactly
  one pick per team (sum + missing + duplicate checks), and a **Grid pasted
  alongside is a checksum** — per team per round counts compared to what was
  read. The Grid alone is refused with a message naming By Round. The result
  feeds the existing per-pick model directly (each `(round, original,
  owner)` is one `draftPicks.ownership` entry) and, because By Round is
  complete, the import **writes every pick it resolves** — a pick shown with
  its original owner clears a trade recorded by hand, and the preview lists
  those as "back to X" beside the trades; the existing `picksImportImpact`
  guard names each contradicted hand-recorded trade before anything is
  written. Every Yahoo name must map to a distinct team (two names on one
  team disables Apply). `PicksPasteModal` takes an `initialText` seam so
  `npm run test:picks-ui` renders the preview step server-side (the
  Rules-button lesson); `scripts/report-picks-paste.mjs <file>` prints the
  same report from a saved paste. The old block format still parses as the
  by-team fallback. **Not yet run against the real 17-round paste** — the
  synthetic fixture uses the league's real names (204 picks, 12 teams) but
  the user's full paste hadn't been provided when this shipped.

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

**`commissioner.png` — no longer a PackStats asset.** PackStats was
reframed to numerics-only (Critical decision #8) and **no longer
renders a mascot at all**, so neither `commissioner.png` nor the old
`mascot-empty.png` `onError` fallback is wired there anymore. The asset
is still ungenerated; if/when it lands, its candidate homes are the
mascot-*speech* surfaces (celebration / help), not a scanning surface —
see the mascot-speech principle in Visual / design language.

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
- `npm run players:nfl:report` — cross-platform ID coverage report for the
  Sleeper NFL directory (`scripts/report-sleeper-nfl.mjs`; fetches live, or
  reads a saved payload passed as an argument). **Read-only — it never writes
  to the database**; the NFL directory refresh is an in-app button, not a
  build step.
- `npm test` — everything below in sequence
- `npm run test:parser` — paste-parser unit tests, draft + roster + picks
  (`scripts/test-draft-parser.mjs`, `scripts/test-roster-parser.mjs`,
  `scripts/test-picks-parser.mjs`; plain node, no framework)
- `npm run test:picks-ui` — server-renders the pick-ownership paste modal's
  preview step (totals, Grid checksum verdict, round-sum issues, the
  "back to X" clears, the unmapped-name block) in both themes
  (`scripts/smoke-picks-paste.mjs`; esbuild-bundles
  `scripts/picks-smoke-entry.jsx` to `.tmp-picks-bundle.mjs`, gitignored)
- `node scripts/report-picks-paste.mjs <paste.txt>` — read-only: parses a
  saved Yahoo By Round paste (Grid optional) and prints picks / traded /
  every issue by round and team
- `npm run test:nfl` — NFL directory pure helpers: the match key, the Sleeper
  row mapping, the disambiguation rules, the fill-rate summary
  (`scripts/test-nfl-directory.mjs`)
- `npm run test:provenance` — price provenance, the change log, and every
  import guard's impact counts, all pure (`scripts/test-provenance.mjs`)
- `npm run test:guards` — server-renders the surfaces that must SHOW a hand-set
  price or an overwrite confirm, on an auction AND a term league in both
  themes, asserting the numbers reach the HTML rather than only existing in a
  helper (`scripts/smoke-provenance-ui.mjs`; esbuild-bundles
  `scripts/provenance-smoke-entry.jsx`, gitignored)
- `npm run test:nfl-ui` — server-renders the four sport-branched import
  surfaces on a football AND a hockey league in both themes, and asserts the
  hockey path is untouched (`scripts/smoke-nfl-import.mjs`; esbuild-bundles
  `scripts/nfl-smoke-entry.jsx` to `.tmp-nfl-bundle.mjs`, gitignored)
- `npm run test:rules` — keeper cost/term model, the legacy read shim, the
  season rollover, and `buildLeague` (`scripts/test-keeper-rules.mjs`)
- `npm run test:wizard` — renders every create-league screen on all three
  cost-model paths in both themes, plus the flow's structural invariants
  (`scripts/smoke-wizard.mjs`). Both of these esbuild-bundle
  `CreateLeagueWizard.jsx` to `.tmp-wizard-bundle.mjs` first (gitignored,
  React kept external so the SSR render shares one React copy).
- This Claude Code container's network policy **blocks** `api-web.nhle.com`,
  `api.nhle.com`, and `api.sleeper.app`. Vercel's build environment can reach
  the NHL ones — that fetch script runs for real on deploy, but you can't
  exercise it in-session. Sleeper is only ever called from the **browser**
  (the manual refresh button), so a blocked container doesn't affect it in
  production; it does mean the fill-rate report can't be run from here.
- **The fetch script FAILS THE BUILD (exit 1) when the fetch errors and no
  previous good `players-nhl.json` (non-empty `players`) exists** — an
  empty directory silently killed matching/positions/autocomplete app-wide
  once, so a red build is the designed behavior. Consequence: `npm run
  build` in this container fails at the fetch step (blocked API + the
  committed placeholder has zero players). To verify the app compiles,
  run `npx vite build`; to test the script's logic, mock `globalThis.fetch`
  and import the script (see the harness pattern in past PRs).

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

## Backend milestone — auth + persistence

First backend slice for Open items #7/#15 (single-commissioner
persistence + login). Scope is strictly what's described below — still
no multi-user collaboration (Roadmap split B stays deferred).

**Provider: Supabase** (Postgres + auth + RLS in one project). Neon was
considered and rejected — it's DB-only, so auth would still need a
separate provider; Supabase bundles both.

**Migration: none.** There is no existing user data to carry forward.
The demo/seed data in `src/data.js` stays a **logged-out-only**
experience via localStorage, exactly as it works today. Authed users
always start with zero leagues and build their own via the Create-League
wizard — no import/merge step.

**Serverless model: Supabase client direct from the frontend.** The
Supabase JS client talks to Postgres straight from the browser,
protected by RLS — no API layer needed for reads/writes to a user's own
rows. Vercel serverless functions are reserved for the future case
where a server-side secret is required (e.g. the pending Yahoo import,
which needs a private API key) — not needed for this slice.

**Storage shape: one row per league, `jsonb` blob + a few real
columns.** Table `public.leagues`: `owner_id uuid`, `id text` (the
app's existing slug — `hockey-1` etc.), `sport text`, `data jsonb` (the
whole league object, same shape as `src/data.js` today), `created_at`,
`updated_at`. Composite primary key `(owner_id, id)`. `sport` and `id`
are promoted to real columns (not just keys inside `data`) so they're
queryable/indexable without unpacking the blob; everything else stays
inside `data` rather than being normalized into more tables — the
league object shape is not being restructured for this milestone.

**Auth → data: `owner_id` + RLS.** Row Level Security restricts every
row to `auth.uid() = owner_id`, so the single-owner-per-league
constraint is enforced at the database layer, not just in app code.

**One-time setup done via provider dashboards (not from this
container):**
- Supabase project `keeperhq` (ref `ihdptrfgippacaxvrrxg`), free tier,
  RLS-by-default.
- Google SSO wired end-to-end: External/testing OAuth consent screen,
  basic `email` + `profile` + `openid` scopes, a web OAuth client whose
  redirect URI is the Supabase auth callback.
- Supabase Auth **Site URL** and the redirect-URL allowlist are set to
  the Vercel deployment domain.
- Vercel env vars: `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY` (both are the publishable/anon-tier
  keys — safe for the browser bundle, RLS is what actually protects
  data).

**Soft delete (`deleted_at`).** `public.leagues` carries a nullable
`deleted_at timestamptz` column (`003_soft_delete.sql`) — a real
column, never inside the `data` blob (`saveLeague` strips the app-side
`deletedAt` field before writing). Set = the league is soft-deleted:
`fetchLeagues` surfaces it as `deletedAt` on the league object,
`App.jsx` splits active vs deleted (routes and grids see active only;
the "Recently deleted" section on My Leagues lists the rest with
Restore), and `get_shared_league` returns NULL for its token so member
links render the invalid-link state. Restore clears the column. RLS is
unchanged — delete/restore are plain owner-scoped UPDATEs. Logged-out /
demo leagues get the same behavior via a `deletedAt` field on the
localStorage league object. No hard delete in the UI. **Nothing
auto-purges** — the Recently deleted section says so ("Deleted leagues
stay here and can be restored anytime"); if a purge policy ever lands,
that copy is where it gets stated.

**Share token + public read path (shared league page).**
`public.leagues` carries a `share_token text` column — unique index,
`not null`, default `replace(gen_random_uuid()::text,'-','')` so new
rows mint their own (inserts never name it; `saveLeague` upserts
don't touch it). It is a **column, not part of the `data` blob**, so
it never leaks through saves or the projection. Anonymous reads go
exclusively through `get_shared_league(p_token)` — `security
definer`, `stable`, `set search_path = ''`, EXECUTE revoked from
`public` and granted to `anon` + `authenticated` — which returns a
jsonb projection of exactly what the shared page renders. **No anon
RLS policy exists on the table**; RLS stays `auth.uid() = owner_id`.
Regenerating the link is a plain authed UPDATE of `share_token`
(client-minted `crypto.randomUUID()`), which invalidates the old URL
instantly. SQL lives in `supabase/migrations/002_share_token.sql`.

**First serverless function + first scheduled job.** `api/refresh-nfl-directory.js`
is the app's only Vercel function, invoked by a daily cron (`vercel.json`) and
by the Import page's manual refresh. It is also the only place a **server-side
secret** exists: `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS — never `VITE_`
prefixed, or it would ship in the browser bundle), alongside `SUPABASE_URL` and
an optional `CRON_SECRET`. Scheduled calls authenticate with `CRON_SECRET`;
manual calls carry the signed-in user's Supabase access token, verified with the
publishable key. Unconfigured, it answers **501**, which is the client's signal
to fall back to writing from the browser rather than failing. Note the SPA
rewrite in `vercel.json` now excludes `/api/` (`/((?!api/).*)`) so the function
isn't shadowed by `index.html`.

**NFL player directory (`public.nfl_players` + `public.nfl_directory_refreshes`).**
The first table that is NOT per-user data: it's a shared reference directory
sourced from Sleeper's public `/v1/players/nfl` endpoint (no auth, no key).
One row per player keyed by Sleeper's `player_id` (TEXT — team defenses are
`'CAR'` etc.), with the cross-platform ids and the full unfiltered player
object promoted alongside; `search_key` (our `normalizeName`) is the column
imports join on. **RLS differs from `leagues` on purpose**: read is granted to
`anon` + `authenticated` because it's public reference data (demo leagues
resolve names too), write only to `authenticated`, and **no delete policy
exists on either table** — that absence is what guarantees a stored
`player_id` on a keeper/roster row can never be orphaned. Refresh is a manual
in-app button (Import page, football leagues) that calls
`upsert_nfl_players(jsonb)` in chunks; the function `COALESCE`s every column so
a later payload's nulls can't blank known values. No cron, no build-time
fetch, no service-role key — the browser talks to Sleeper directly and writes
through the same RLS as everything else. SQL in
`supabase/migrations/004_nfl_player_directory.sql`.

**Yahoo API is a separate, unblocked-independent track.** The read-only
Yahoo application (Open item #15) is blocked on Yahoo enabling the
"Fantasy Sports" permission on their end — that block does not gate
this Supabase/auth slice.

**Login can't be exercised inside this container** — the OAuth redirect
only completes against a URL in the Supabase allowlist (the production
Vercel domain, or a preview URL added to it). Verify sign-in on a
deployed URL, not via `npm run dev` in-session.

## Routing

Real client-side routing via `react-router-dom` (v7), wired in
`src/main.jsx` (`<BrowserRouter>`) and `src/App.jsx` (`<Routes>`).
The SPA fallback (index.html for unmatched paths) is an **explicit
rewrite in `vercel.json`** (`"/(.*)" → "/index.html"`; static files
match before rewrites, so `/assets/*` and `/players-nhl.json` are
unaffected). Do NOT assume the `vite` framework preset provides this
on its own — with an explicit `vercel.json` present (added in PR #23)
it does not: direct visits to deep URLs returned Vercel's platform
404 until the rewrite was added in PR #27. The gap went unnoticed
because the commissioner app is entered from `/`, while the shared
league page is only ever entered by deep link.

**Route table:**

| Path | Behavior |
|---|---|
| `/` | Branches on auth state (`RootRoute`). Logged out: `LandingPage` — the front door (headline, Google sign-in, "Explore the demo →"); no leagues grid is shown here. Logged in: `HomeView` — My Leagues, or `NewUserEmptyState` (welcome card + "Create your first league") when the account has zero leagues yet. |
| `/demo` | `DemoRoute` — logged-out only. The real `HomeView` grid/cards in demo mode: a "You're browsing demo leagues" banner + a "Demo" badge on every `TradingCard`. The *only* way to reach the demo leagues — reachable via "Explore the demo →" on the landing, never shown at `/`. A signed-in user hitting this path is redirected to `/`. |
| `/new` | `CreateLeagueWizard` — 4-step create-league flow (Basics → League Format → Teams → Review); writes a new league to localStorage and routes into it |
| `/league/:leagueId` | redirects to `/league/:leagueId/overview` |
| `/league/:leagueId/overview` | `LeagueView` — Keepers home (Overview/Set-keepers toggle) |
| `/league/:leagueId/import` | `LeagueView` — **full-page** Import view ("Import last season" headline; per-team roster paste opens a modal over the page; the draft card is a pointer link to `/draft`) — **both draft types** |
| `/league/:leagueId/draft` | `LeagueView` — **full-page** "Last Draft" takeover (the imported prior-year draft: inline-editable values, in-place name fixes, and the on-page paste import) — **both draft types** |
| `/league/:leagueId/payouts` | `LeagueView` + Pool & Payouts sheet open |
| `/league/:leagueId/picks` | `LeagueView` — **full-page** Draft Picks view (round×team pick-ownership grid + paste import) with the persistent league nav — **snake only**; auction redirects to overview |
| `/league/:leagueId/lottery` | `LeagueView` — **full-page** Lottery view with the persistent league nav — **snake only**; auction redirects to overview |
| `/league/:leagueId/settings` | `LeagueView` + League Settings sheet open |
| `/league/<unknown-id>/...` | redirect to `/` |
| `/league/:leagueId/<unknown-tab>` | redirect to `/league/:leagueId/overview` |
| `/l/:token` | `SharedLeagueRoute` — the **public shared league page** (read-only, member-facing). Sits OUTSIDE the auth branching: renders identically for logged-out and logged-in visitors. The app chrome (nav header, TweaksPanel) is suppressed on this route (`isSharedRoute` in `App.jsx`) — the page carries its own wordmark header + "Powered by KeeperHQ" footer. An invalid/unknown token renders the invalid-link state in place (mascot + "ask your commissioner" copy), **never** a redirect to `/`. |
| any other path | redirect to `/` |

`:leagueId` is the existing stable `league.id` slug in `src/data.js`
(`hockey-1`, `basketball-1`, etc.) — no separate routing key was
introduced.

The old `/league/:leagueId/players` route is gone — the standalone
NHL directory was folded into the Set-keepers Eligible Pool ("League"
sub-tab), so `/players` redirects to overview. `VALID_TABS` in
`App.jsx` is `['overview', 'import', 'draft', 'payouts', 'picks',
'lottery', 'settings']`. Pool / Settings render as routed slide-in
sheets over the Keepers home (the `activeTab` decides which sheet is
open; closing routes back to `…/overview`); Import, Last Draft,
Picks, and Lottery are **full-page** routes — Picks and Lottery are
snake-gated in `LeagueRoute` (auction redirects to overview), Import
and Last Draft serve both draft types.

**Wiring:**

- `App.jsx` holds `leagues` state + the `<Routes>` tree. Thin route
  wrappers — `RootRoute` (auth/loading-state branching at `/`),
  `DemoRoute` (`/demo`), and `LeagueRoute` (URL-param lookup +
  validity-gating) — decide what to render before handing off to the
  view components.
- `LeagueView` is fully props-driven now: it takes `activeTab` from
  the parent route instead of holding tab state itself. The
  per-route refresh that used to require a `useEffect` syncing
  `currentLeague ↔ league` is gone — the leagues array lives in
  `App.jsx` and the matching league is looked up fresh on every
  render by id.
- The Keepers home renders an internal **Overview / Set keepers**
  toggle (component-local state) plus the section-door `<Link>`s
  (Import / Pool / Lottery / Settings) on the right of that row. The
  old `TabBar` strip is gone; `App.jsx`'s top bar carries only the
  brand mark + league name + account (no section nav).
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

## Create-league wizard — option-strip reserves (MEASURED)

The description block under each option strip holds a fixed height so it never
shifts as a keyboard user arrows the group. The numbers are **measured in
Chromium against the running dev server**, never estimated — an earlier
estimated table caused three rounds of layout bugs.

| Screen | Tallest state (desktop) | Tallest state (mobile) | Reserve desktop | Reserve mobile |
|---|---|---|---|---|
| Draft format | 85 | 95 | **108** | **116** |
| Cost | 65.5 | 95 | **108** | **116** |
| Term | 85 | 95 | **108** | **116** |

Derivation: **tallest measured state (which already includes the control
slot), rounded up to a multiple of 4, plus one body line (20px) of headroom.**
Desktop 88 + 20 = 108; mobile 96 + 20 = 116. The 10px desktop/mobile gap is
exactly the control-slot difference (34 vs 44) — the text block itself
measures the same at both breakpoints.

All three screens currently measure identically, so all three reserves are
equal — they keep separate CSS classes only so a future copy change can
diverge per screen. The control slot itself is 34px desktop / 44px mobile and
is rendered **unconditionally**, including for states that reveal no control;
that is why the term screen's revealed `Select` does not measure taller than a
control-less state.

If a copy edit pushes a state past its reserve, **re-measure and raise the
reserve** — never trim it toward the shortest state. The measuring harness
drives the real dev server in Chromium (`/opt/pw-browsers/chromium`), sets
`min-height: 0` on the block, clicks each option and reads the natural height;
`npm run test:wizard` then asserts the committed values so a silent drift
fails the suite.

Mobile constraint: at 390×780 every **question** screen reaches its primary
button without scrolling (tightest is the cost screen — the only three-row
strip — at 689px against 736px of usable height above the sticky preview
bar). Teams and Review do scroll —
Teams is out of scope for this arc, and Review is a read-back of every answer,
which cannot fit one screen by nature.

## Keeper rules config keys

Two independent dimensions. Written by the create-league wizard, editable in
Settings, and read ONLY through `src/lib/keeperRules.js` (never directly).

```js
// ── League type ──
league.draftType = 'snake' | 'auction'   // draft FORMAT. ASKED, never derived.

// ── Keeper rules ──
league.keeperSlots   = 4
league.minKeepers    = 0        // === keeperSlots when mustFillSlots is on
league.mustFillSlots = false    // legacy mirror: league.contractsRequired

league.keeperCostModel = 'slot' | 'picks' | 'auction'

league.pickRules = {            // read only when keeperCostModel === 'picks'
  subModel: 'draftedRound' | 'topSlots',
  escalationPerYear: 1,         // 0 = flat
  waiverRound: 'last',          // NOT ASKED — written silently at creation
  collision: 'earlier' | 'later'   // draftedRound only; omitted for topSlots
}

league.auctionRules = {         // read only when keeperCostModel === 'auction'
  costIncreasePerYear: 5, undraftedStartCost: 5,
  budget: <not asked>, minBid: <not asked>
}

league.termModel = 'none' | 'fixed'
league.termYears = 3 | null      // null when termModel === 'none'
league.termMinYears = null       // RESERVED — "owners choose" not shipped
league.termMaxYears = null       // RESERVED

league.rookieRules = { enabled: false, extraYears: 1, escalationPerYear: 0, freeFirstYear: false }
                                 // NOT ASKED — written disabled at creation

// Legacy mirrors, kept in step with the resolved term so old read sites agree.
league.contractYears = termModel === 'fixed' ? termYears : null
league.keeperTimeCap = termModel === 'fixed' ? termYears : null   // no separate
                                 // consecutive-years ceiling exists; a term
                                 // that runs out sends the player to the draft
league.keeperArchetype = 'auctionPrices' | 'draftPicks' | 'contracts' | null
                                 // null === slot + no term (no legacy
                                 // equivalent). Nothing in the UI names it.
```

**Two values are never asked** and are surfaced only by the Review callout:
`pickRules.waiverRound` (`'last'` — the pick engine needs a round for
undrafted players and the answer is the last round in essentially every
league) and `rookieRules` (disabled — a cross-cutting exception that belongs
to neither dimension, and on the no-term path it produced a live
contradiction by offering "longer term").

**Legacy mapping (read-side only, no migration):** old snake + `contractYears`
→ slot cost + fixed term; old `auctionRules` (or `draftType: 'auction'`) →
auction cost, no term unless `contractYears` says otherwise. The explicit keys
always win, which is what makes preserved-but-inactive rule blocks safe.

## Critical decisions made

1. **Local-first *for now* — server-side persistence is now planned.**
   Today data lives in the browser (README: "your league data lives in
   your own browser"). But single-commissioner persistence + auth is a
   near-term milestone (Roadmap split A; Open items #7/#15) — don't
   treat "backend deferred" as still-true blanket guidance. Still off
   the table: **sharing / collaboration** features that imply *multiple
   users* (Roadmap split B). Don't promise member-facing sharing.
2. **NHL only** for the player directory. Other sports show "Coming soon"
   via `public/mascot-soon.png`. The directory itself now lives inside
   the Set-keepers Eligible Pool ("League" sub-tab) rather than a
   standalone Players tab (see #3).
3. **No standalone Players tab — the directory lives in the keeper
   flow.** The NHL directory is the Eligible Pool's "League" sub-tab in
   the Set-keepers workbench: searching it adds a free agent straight
   to a team's keepers (a keeper entry with contract terms, not just a
   roster row). The old `PlayersTab.jsx` (with its Add-to-roster /
   Make-keeper manage modal) is kept in the tree but no longer routed.
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
8. **PackStats KPI strip is dollar-first** (was "KPI bar"). A row of 4
   monospace numerics — Leagues · Collected · Outstanding · Unpaid —
   center-aligned, summed across the whole league pack (not the current
   filter). The earlier mascot + speech-bubble narration was **removed**
   (see the mascot-speech principle in Visual / design language); the
   numbers are the surface. Phase-4 (pre-draft prep) commissioner
   workflow.
9. **League card is a trading card** (rewritten from the previous
   compact 4-col model). Card body structure:
   1. League name (`typeHeadingHero`)
   2. Pills row — `SportBadge` + rule pill, side by side
   3. Stats footer (Teams · Paid · Pool)

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

   **Rule strings** — composed from the two keeper dimensions, never naming
   an archetype and never reading `draftType` (which is the draft FORMAT):
   - `ruleMod(league)` → `"{cost} · {term}"` via `COST_LABEL` + `termLabel`
     — e.g. `"Auction · 3-yr terms"`, `"Slot only · no term"`.
   - keeper count appended by the card: `${keeperSlots} keepers`.
   - Combined pill: `"Slot only · 3-yr terms · 4 keepers"`,
     `"Auction · no term · 4 keepers"`.
   - The create-league live preview sets `league.keeperRulesAnswered =
     {cost, term}` to hold each half back until its screen is answered
     (`"Keeper league · 4 keepers"` before then). Real leagues never carry
     that key, so they always show both halves.

   Hover: card lifts, holofoil shine sweeps, mascot bobs. Stats are
   `Teams · Paid (X/N) · Pool ($total)`. The Add League slot at grid's
   tail is a binder-empty-slot variant (dashed outline + faded
   greyscale mascot at 12% opacity).

   **Sport filter pills** above the grid carry the sport's color
   even when idle: inactive sport pill uses `cfg.tint` background +
   `cfg.border` border + `cfg.color` text (SportBadge recipe). Active
   pill saturates to solid `cfg.color` + white text. "All Leagues" is
   the neutral option (gray idle, `tokens.info` blue when active).

   Card-level logic lives in `HomeView.jsx` / `components.jsx` helpers:
   - `nextAction(league)` returns `{ kind: 'action'|'waiting'|'ready', label }`
     and drives the hero **action sticker**'s copy + color (the card's
     only narration element — no per-card flavor line)
   - `paymentsOf(league)` returns derived payment totals
   - `ruleMod(league)` returns the rule-pill modifier string
   - `flavorLine` / `leagueFlavor` still exist in `components.jsx` but
     are **no longer rendered** (kept for potential reuse; candidates
     for removal).

## Visual / design language

- **Modern and clean by default.** Layout, typography, structure all
  contemporary. Pixel art is a *subtle accent*, not the dominant
  aesthetic. (Earlier sessions leaned hard pixel-art; we pulled back.)
- **Where pixel art lives**: sport avatars on league cards (40px
  circle), empty-state mascots, achievement / celebration decorations.
  Nowhere else. The nav, headers, modals, tabs, and forms stay clean.
- **Mascot character vs. mascot speaking — two different rules.** The
  pixel-art commissioner/everyman *character* may appear as **art**
  anywhere (league-card hero, empty states, the AddLeague silhouette,
  decorations). But the mascot **speaking** — a voice line, speech
  bubble, narration in the product's "voice" — is allowed **only in
  moments of WAITING, SUCCESS, or HELP**: tooltips, the pick-keepers
  (Set-keepers) view, the keepers-declared celebration, and the future
  loading state. **Never** on scanning/working surfaces (HomeView pack,
  the Overview grid, the keeper workbench tables, settings/forms). This
  is why the PackStats speech-bubble and the per-card flavor line were
  removed — they put the mascot's voice on a scanning surface.
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
| `typeHeadingDisplay` | 34/800/-0.02em | Landing-page headline (steps to 26px under 640px via a media-query override, not a second token) |
| `typeHeadingPage` | 20/800/-0.01em | Page-level title (league detail h1) |
| `typeHeadingHero` | 22/800/-0.01em | Trading-card league name on hero-style cards |
| `typeHeadingCard` | 18/700/-0.01em | Card and modal titles |
| `typeHeadingSection` | 13/600/0.06em UPPERCASE | "KEEPERS", "Prize Structure", section dividers |
| `typeLabelEyebrow` | 11/600/0.06em UPPERCASE | StatBox labels, KPI labels, column headers |
| `typePill` | 11/600/0.03em | Soft pills: DraftBadge, SportBadge, Tag (the "label" pills) |
| `typePillEmphatic` | 11/700/0.05em UPPERCASE | StatusPill ("announcer" pills) |
| `typeBody` | 13/400 | Table cells, body copy, form input text |
| `typeBodyMeta` | 12/400 | Helper / secondary / footer text |
| `typeStatMeta` | 10/500/0.01em | Shared-page stat lines, inline position text, desktop stat cells |
| `typeNumericHero` | 26/700 | SummaryBar values (dashboard hero metrics) |
| `typeNumericCard` | 22/700 | StatBox value (card-level stats) |
| `typeNumericCompact` | 19/800/-0.01em | Stat values inside compact 3-col stat blocks (trading-card stat footer) |
| `typeNumericInline` | 17/700 | League header inline counters |

Shared-page note: the handoff floated a second new token,
`typeRowTitle` (14/700), with the instruction to try `typeBody` at
weight 700 first — the page shipped on `typeBody`+700 and the token
was **not** added. If 13px reads too small on real devices, add
`typeRowTitle` then. The page also composes two one-off styles from
existing tokens (`typeNumericInline`+800 for the league name;
15/800 for the countdown — the one size with no token; tokenize if a
second surface ever needs it).

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
| `mascot-empty.png` | Puzzled everyman — empty states + AddLeagueSlot silhouette (no longer a PackStats fallback — PackStats is numerics-only now) |
| `mascot-soon.png` | Construction-worker everyman — "Coming soon" |
| `mascot-celebrate.png` | Cheering everyman — celebration banners (unused yet) |
| `commissioner.png` | **PENDING & currently unwired.** Was the target PackStats mascot, but PackStats is numerics-only now (no mascot). Ungenerated; candidate home is a mascot-*speech* surface (celebration / help), per the mascot-speech principle. |
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
- **`commissioner.png` (pending, unwired)**: not rendered anywhere —
  PackStats is numerics-only now (no mascot). See the asset inventory
  note above.
- **`mascot-empty.png`**: two live uses (the PackStats fallback is gone) —
  - `KeepersTab.jsx` `KeeperEditModal` empty state, 100px
  - `HomeView.jsx` `AddLeagueSlot` faded silhouette, 120px @ 12%
    opacity + greyscale filter
- **`mascot-soon`**: `PlayersTab.jsx` non-NHL empty state, 140px
- **`mascot-celebrate`**: not yet wired — earmarked for season-complete
  banner

## Ownership: the roster decides, the draft prices

**Where the roster import and the draft import disagree about who has a
player, the ROSTER wins.** The roster is who finished the season on which
team; the draft import only records who paid what. They disagree for every
traded or dropped player.

This was live for a real league (fixed in the ownership PR). `buildTeamPool`
treated a team's whole `priorKeepers` list as that team's pool, so a player
drafted by A and rostered by B appeared as A's to keep — and B, who actually
had him, saw him as an undrafted pickup at the `$5` floor instead of his real
`drafted + $N/yr` cost. **A money bug, not just a display bug**, and one root
cause behind three surfaces: the shared page, the Eligible Pool / Set Keepers,
and `buildStatusIndex`.

The rules, all enforced in `buildTeamPool` (`SetKeepersTab.jsx`) so every
surface that reads it inherits them:

- A team's pool is built from **its roster**; each rostered player's price
  comes from his prior draft record **on whichever team drafted him**.
- A player rostered by another team is **not** in this team's pool.
- A player on **no** roster stays with the team that drafted him — rosters can
  be mid-import, and silently dropping him is worse than showing him.
- A league with **no rosters imported at all** behaves exactly as before, or
  every pool would empty out.
- A **declared keeper** (`team.keepers`) always wins: that's a deliberate
  commissioner action, not an import artifact.

`buildSharedRows`'s `KIND_PRIORITY` dedupe (keeper > contract > rostered) is
about which STATE to show, never about which team owns the player — ownership
is settled upstream in the pool. Any new surface that composes rosters with
draft records goes through `buildTeamPool`; don't re-derive this.

## Build constraints — reuse, don't rebuild

Standing rules for building new surfaces. They exist because a parallel
copy of a component drifts away from the original.

- **Preserve, don't delete — rule changes never destroy keeper data.**
  There is no version history in this app, so anything cleared is
  unrecoverable. All cost-model rule blocks (`auctionRules`, `pickRules`)
  stay on the league row; only the block matching the current
  `keeperCostModel` is ever READ, and the others are inert, not dangerous
  (this is why the explicit `keeperCostModel` must always beat the legacy
  presence checks in `keeperRules.js` — a preserved `auctionRules` block
  must not resurrect the auction cost model). **Never clear anything on a
  keeper row because a rule changed**: a keeper's `contractYear` stays
  stored and unread while the league is in auction mode and is intact if it
  switches back, and the same for dollar values on the reverse trip. If
  preserved data is ever surfaced after a round trip, label it as recovered
  from before the switch rather than presenting it as authoritative. The one
  place this does NOT apply is league CREATION, where there is no prior data
  to preserve and an unused `auctionRules` block would be a misleading
  legacy signal (it is exactly what the shim reads as "this is an auction
  league" for pre-wizard rows, so writing it on a slot-only league would make
  the row genuinely ambiguous) — `buildLeague` writes only the selected
  model's block. **This exception is reviewed and accepted, not an oversight:
  preserve-don't-delete protects data that exists, and at creation there is
  none.** Storage is cheap; the data isn't.
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
- **Overlay depth: one sheet, one modal max — steps within.** A routed
  sheet may open a modal, but a modal must never open another modal —
  multi-stage flows (paste → mapping → confirm) swap the modal's
  content as steps with a Back affordance (see `DraftImportModal`,
  `PicksPasteModal`). Page-sized content (round×team grids, the
  lottery) gets a full-page route, not a sheet. Known dormant
  exception: the unrouted `SeasonSetupWizard` overlay opens import
  modals on top; fix it if that flow is ever revived.
- **Overlay direction: pages open overlays, never the reverse.** A
  full page may open a modal or drawer over itself (the Import page's
  per-team roster modal); a drawer or modal must never navigate to a
  page — a mid-flow overlay that closes itself by changing the route
  is a broken transition (the Import sheet's "Paste Draft" button
  used to do exactly this; Import is a full page now). If an overlay
  needs page-sized content or wants to send the user somewhere, it
  should have been a page.
- **Full pages keep the league nav — no Back buttons.** A full-page
  league view (Picks, Lottery, and any future one) renders the league
  identity card + the Overview/Set-keepers + section-door row exactly
  as the Keepers home does, with its own door active; every door/tab
  navigates directly. Never a "← Back" link as the only way out. (On a
  full page neither sub-tab is highlighted; clicking one routes to
  `…/overview` with that view.)
- **A destructive import asks first, and names what it will destroy.** Any
  bulk import that REPLACES a list (roster, priorKeepers) or contradicts a
  hand-recorded value confirms through `ConfirmBody`/`ConfirmModal` with counts
  from `src/lib/importGuard.js` — never a generic "are you sure", which teaches
  people to click through. State the losses AND what survives; Cancel is the
  safe default (autofocus, Escape, scrim). **Skip the dialog entirely when
  `hasImpact` is false** — a first import has nothing at stake. Because there's
  no undo anywhere in the app, the copy must never imply recoverability.
- **Confirms are `ConfirmBody`, and inside a modal they're a STEP.** The
  overlay depth rule applies to confirms too: a page or sheet may put up
  `ConfirmModal`; a flow already inside a modal renders `ConfirmBody` in place
  of its own content with a "← Back" cancel. Same component underneath.
- **A control that mounts on state change must have its space reserved.**
  Anything that appears next to an input when state flips — the "Edited" mark
  and its reset beside a price field, the wizard's revealed option control —
  steals width from its row when it mounts and moves the thing the user is
  currently typing into. Render it UNCONDITIONALLY and hide it
  (`visibility: hidden` + `aria-hidden` + `tabIndex -1`), never mount it
  conditionally. Prefer hiding the real element over a hand-measured spacer:
  the reserved box is then the real box by construction and can't drift when
  the control's content changes — that's why `PriceMarkSlot` needs no measured
  reserve table while the wizard's text block does. Pin the input itself with
  `flexShrink: 0` too, or the row can still borrow width from it.
- **Never write a price field directly from a UI surface.** Go through
  `src/lib/priceProvenance.js` (`setPrice` / `resetPrice` /
  `refreshComputedPrice`), or the calculated value gets stranded and the
  "Edited" marker silently stops being true. And log the edit — every value
  edit passes through `appendChanges` on the same `onUpdateLeague` call, so a
  new edit path can't quietly skip the record.
- **Imports end on a result, never in silence.** A modal import's last
  step states what it did (counts per team / match rate) with a single
  Done button (`RosterImportModal`, the dormant `DraftImportModal`);
  a PAGE-hosted import lands the user on the populated page under a
  transient success banner instead (the Last Draft page). New import
  flows follow suit.
- **An import flow's home is a page, not a modal-on-sheet.** When
  imported data has a viewing/editing surface, the paste→map→confirm
  steps run as content ON that page (`DraftImportFlow` on the Last
  Draft page) — sheets link to the page rather than opening a modal
  over themselves.

## File map (most-edited)

- `src/App.jsx` — top-level shell, header, view switching, localStorage.
  Holds `leagues` state; `handleAddLeague` appends a wizard-built
  league + navigates into it; `/new` route renders the wizard.
- `src/HomeView.jsx` — My Leagues page (summary tiles + league cards).
  Imports `TradingCard` from `components.jsx` (it no longer lives
  here — see below); renders `PackStats`, `SportFilter`, and the card
  grid.
- `src/CreateLeagueWizard.jsx` — the `/new` create-league flow. Five FIXED
  rail phases (Basics · League type · Keeper rules · Teams · Review) over a
  screen list DERIVED from the answers (`screensOf`) — the rail never grows,
  shrinks or reorders, and there is no "Step N of M" anywhere. `useReducer`
  state; three-column card (left rail · form · right live-`TradingCard`
  preview, `state='building'` until Review flips it to `'ready'`); at ≤760px
  the rail becomes a 5-segment progress bar and the preview column becomes a
  sticky footer summary bar that expands the card as a bottom sheet.
  `OptionStrip` + `OptionDescription` are the reserved-height question
  pattern (see the wizard PR bullet); `CostPath` is the shared beat strip;
  `WizardScreen` maps a screen id to its component so the list and the
  renderer can't drift. Cost-model switches PRESERVE every other model's
  typed values. Exports `screensOf` / `reducer` / `makeInitial` /
  `WizardScreen` as test seams for `scripts/smoke-wizard.mjs`.
  `buildLeague(state, existing)` produces the saved object (the
  `src/data.js` shape; `slugify`'d unique id; `commissionerTeamId` +
  `teams[0].isCommissioner`; snake adds `contractYears`, auction adds
  `auctionRules.{costIncreasePerYear, budget, …}`). Local `Input` /
  `Select` primitives mirror the `KeeperEditModal` styling (value bold,
  unit/suffix regular gray); the `Select` menu portals out of the
  card's `overflow:hidden` so it isn't clipped.
- `src/LeagueView.jsx` — League detail. The **Keepers home** (identity
  card + Overview/Set-keepers toggle + section-door buttons), plus
  `PayoutsTab` and `SettingsPanel` rendered inside a routed
  `SectionPanel` (right slide-in sheet); `ImportPanel` is a **full
  page** now ("Import last season" headline + sub, the Last Season's
  Rosters section whose per-team paste opens `RosterImportModal` over
  the page, and a pointer card linking to Last Draft); Import, Last
  Draft, Picks, and Lottery all render as full-page branches. Holds the Overview↔Set-keepers view state and the selected
  team. `DeadlineLine` (writes `league.keeperDeadline` date +
  `league.keeperDeadlineTime` 'HH:MM'; picking a date defaults the time
  to 23:59, clearing the date clears both; date-only legacy data reads
  as 11:59 PM) and `SubTabs` live here. The two-column Pool & Payouts
  grid stacks to one column at ≤760px (mobile sheet width). The
  Settings sheet stacks: Keeper Rules → **Teams** (`EditableCard` of
  per-team name fields; renames propagate by team id; a blanked field
  keeps the old name) → `ShareLeagueCard` → Season rollover →
  **`DeleteLeagueCard`** (danger-styled soft delete behind an inline
  confirm, same pattern as the share-link regenerate; calls the
  `onDeleteLeague` prop threaded from `App.jsx`). `ShareLeagueCard` is
  the commissioner-side control for the shared page: truncated
  tokenized URL + Copy (SaveToast "Link copied") + "Regenerate link"
  behind an inline danger confirm with the old-link-stops-working
  warning; shows a quiet sign-in note for demo/localStorage leagues
  (no Supabase row = no token).
- `src/components.jsx` — shared UI primitives + `SPORT_CONFIG`,
  `getLeagueStats`, `Tooltip`, `SportLogo`, `makeTheme`, and
  `TradingCard` (extracted from `HomeView`; takes a
  `state?: 'building' | 'ready'` prop for the wizard live-preview —
  `building` pins the BUILDING… sticker + dashed stats, `ready` flips
  to READY FOR DRAFT, undefined keeps the My-Leagues behavior).
- `src/SharedLeaguePage.jsx` — the public shared league page
  (`/l/:token`). `SharedLeagueRoute` (token → RPC → page / invalid
  state) + `SharedLeaguePage`: own header (non-interactive wordmark +
  "Shared league page" kicker), league band with **live countdown**
  (reads `keeperDeadline` + `keeperDeadlineTime`, date-only data =
  11:59 PM; days granularity; hours/minutes ticking inside 48h; quiet
  "🔒 Keepers locked" past deadline; no countdown when no deadline
  set), sticky countdown pill (IntersectionObserver on the band),
  filter rail (`sharedFilterChips`: **Rostered** (all league types; "Final
  keepers" post-lock) · Under contract
  (**term leagues only**) · Expired (snake, only when expired players
  exist) · team chips; default relabels to "Final keepers" post-lock),
  mobile card rows
  (**two deliberate layouts, not one minus content**: hockey =
  headshot + two-line card with stat line + stacked contract/status;
  stats-less leagues (no directory sport) = a COMPACT single-line row,
  name+pos left, price/status inline right, tighter padding — no
  reserved headshot/stat space), and a **desktop (≥1024px, all
  sports) table** — hockey gets the stat table per skater/goalie
  group, stats-less leagues the same `StatTable` with `cats=[]`
  (Player/Contract/Status only, no headshots, single-line player
  cells, no title eyebrow) — sortable stat headers, Player pinned left,
  Contract/Status pinned right, stat columns scroll-snapping between
  them on native horizontal scroll with **edge-fade gradients** at the
  sticky boundaries as the scroll affordance (scroll-position-driven,
  pointer-events none; the old floating chevrons overlapped row content
  and were removed; sticky cells use opaque layered backgrounds so
  scrolled columns can't ghost through — and dim/opacity for eligible
  rows goes on cell CONTENT, never on the sticky `<td>` itself, or the
  ghosting comes back through the faded background). **Contract/Status
  are compact, display-only strings**: contract = `Y1/3` (`Final yr
  Y3/3` red when final, `Expired Y3/3` on the expired view, muted `—`
  for uncontracted — no fake year); status pill = the owner name only,
  color carrying the state (keeper accent for declared keepers and
  under-contract players, readable grey for rostered-only; team-filter
  views show `Keeper` / no pill instead since the name is redundant
  there); auction keeps `Keep for $X` with a quiet `Drafted $Y`
  secondary line when the imported draft carries a price
  (`row.draftedCost` from `buildSharedRows`; the desktop Contract
  column widens 100→132 for auction only so the pair fits inside the
  sticky cell). Same strings on mobile rows.
  **One flat list, never a labelled section**: declared keepers pin to the top
  (`keepersFirst`) and are marked in place (success tint + border, check glyph
  in the On-team pill) — the highlight carries the meaning, matching the
  Eligible Pool. The player search is the table card's header strip
  (`ListSearch`), not a floating control. Team chips are alphabetical
  (`sortTeamsByName`). The grid renders IDENTICALLY on every view — no
  team-tab special casing, no per-view header block; only the row set changes.
  A **Rules** button beside the league name opens `LeagueRulesModal`. Print: filter rail + search hidden, default
  view forced via `beforeprint`, rows `break-inside: avoid`. The
  mascot empty state is the page's one mascot-*speech* surface and
  renders ONLY when there is nothing else to show (no rows at all);
  a populated list with zero declared keepers gets a one-line quiet
  notice instead ("No keepers declared yet — everyone below is still
  eligible.") — mascot speech = waiting surfaces only.
- `src/LeagueRulesModal.jsx` — the member-facing rules modal. **`RulesButton`
  is the only way it should be mounted** — trigger + open state + modal in one
  component, so the render can't drift away from the button that opens it
  (it did once, silently). (`RulesGrid` is
  exported separately so the commissioner's Settings card shows the same cards,
  not a lookalike). Derived facts + the commissioner's free-text sections;
  blank sections are absent, never a bare heading.
- `src/lib/rulesSummary.js` — `keeperRuleFacts(league)` (pure: config → the
  card list) and `ruleNotes` / `hasRuleNotes` for the free text. Derived from
  the same keys the keeper math reads, so member-facing rules can't drift from
  applied rules. Anything the config doesn't model belongs in the notes.
- `supabase/migrations/006_shared_league_rules.sql` — replaces
  `get_shared_league` to project the cost/term config keys + the two note
  fields. No table change. `payouts` / `payoutNote` stay unprojected.
- `supabase/migrations/007_shared_price_provenance.sql` — replaces
  `get_shared_league` again for `keepers.keptForOverridden` (the marker
  boolean; `keptForComputed` stays private — the page is not a diff) and
  `priorKeepers.acquisitionRound` (never projected, which is why the shared
  page's round sort never worked). No table change. Run after 006.
- `src/lib/sharedLeague.js` — data layer for the shared page:
  `fetchSharedLeague(token)` (supabase.rpc `get_shared_league`, works
  with no session), `buildSharedRows(league)` (one deduped row per
  player, priority keeper > contract > rostered > expired, reusing
  **`buildTeamPool`** so eligibility math can't drift from the
  workbench), `STAT_CATEGORIES` defaults + `statCategoriesFor`
  (reads an optional `league.statCategories` override — no settings
  UI), `formatStat`, `sortRowsDefault` (points desc, no-stats last).
- `supabase/migrations/002_share_token.sql` — share_token column +
  `get_shared_league` function + grants (run via Supabase SQL Editor;
  the container can't reach Supabase).
- `supabase/migrations/003_soft_delete.sql` — `deleted_at timestamptz`
  column + `get_shared_league` recreated to exclude soft-deleted
  leagues and project `keeperDeadlineTime`. Run after 002 (same
  run-via-SQL-Editor caveat). RLS untouched; grants survive the
  CREATE OR REPLACE.
- `src/PlayerAutocomplete.jsx` — autocomplete input over **two** directory
  sources behind one component: hockey filters the `loadPlayers` JSON blob in
  memory, football runs a **debounced Supabase typeahead** (`searchDirectory`)
  because 11k NFL rows don't belong in the browser. NFL suggestions are mapped
  into the hockey shape (`{id, name, pos, team}`) plus a `playerId`, so the
  suggestion list, the status lookup, and every caller stay one code path;
  callers that store identity read `picked.playerId`. Takes `disabledNames` to
  block dupes; shows in-league keeper/rostered status next to suggestions.
- `src/lib/nflDirectory.js` — NFL directory **pure** helpers (no network, no
  Supabase, so `scripts/test-nfl-directory.mjs` can run them in plain node):
  `directoryKey` (= `normalizeName`, the join key on both sides),
  `normalizeProTeam` (Yahoo→Sleeper abbreviation aliases: WSH→WAS, JAC→JAX,
  OAK→LV…), `sleeperToRow` / `sleeperPayloadToRows` (payload → table rows,
  raw object preserved in `data`), `summarizeCrossIds` + `pct` (the
  yahoo_id/espn_id fill rates), **`pickDirectoryMatch`** (team → position →
  active-status narrowing; returns `'ambiguous'` rather than guessing, and an
  unhelpful hint never eliminates every candidate), `importFieldsFor`
  (`{playerId, pos, sourceName}` — the fields an import writes), `isNflSport`,
  and the write layer: `chunkRowsByBytes` (byte budget, never a row count —
  an oversized single row still gets its own chunk rather than being dropped),
  **`writeDirectoryRows`** (injected `call`/`sleep`, so the browser and the
  scheduled job share one implementation and the retry/split behavior is
  unit-testable), and `diagnoseWrite` (splits ⇒ requests were too large;
  retries alone ⇒ transient drops).
- `api/refresh-nfl-directory.js` — the daily-cron + manual-override endpoint
  (the app's only serverless function). Service-role client, `CRON_SECRET` or
  a verified user token, opens a `running` log row before writing and patches
  it at the end, returns **501 when unconfigured** so the client can fall back
  to the browser path. Writes through the same `upsert_nfl_players`, so
  preserve-don't-delete holds on the scheduled path identically.
- `supabase/migrations/005_directory_refresh_runs.sql` — `trigger`
  (`scheduled`|`manual`), `finished_at`, `notes` on the run log, plus the
  UPDATE policy that lets a run row be closed. `nfl_players` untouched.
- `src/lib/nflDirectoryStore.js` — the I/O half: `fetchSleeperPlayers`,
  `refreshNflDirectory` (**server first** via `refreshOnServer` → the Vercel
  function; falls back to `refreshInBrowser` only on a missing/501 endpoint,
  and tells the caller which one ran), the run-log open/close pair,
  `isPermanent` (auth/permission errors are marked `fatal` so the writer
  aborts instead of retrying), `fetchDirectoryStatus` (count + last SUCCESSFUL
  run + newest run of ANY kind — they differ exactly when the newest run
  failed or stalled, which is how a broken schedule surfaces),
  `lookupByNames` (batched `in('search_key', …)` → key → candidate rows), and
  `searchDirectory` (typeahead; prefix + active first).
- `src/tabs/NflDirectoryCard.jsx` — the directory's one control surface, on the
  Import page for football leagues: stored player count, last-refresh time
  (warning-tinted past 21 days or when empty), the cross-platform ID fill rates
  from the last run, and the **Refresh from Sleeper** button (disabled when
  signed out — reads work signed out, writes don't).
- `src/lib/players.js` — `loadPlayers(sport)`, `normalizeName`,
  `buildStatusIndex(league)` — **the** util for matching league
  rosters to the player directory. Honors the ownership rule below: a
  `priorKeepers` record never reattributes a player who is on ANOTHER team's
  roster (a declared `keepers` entry still does — that's an explicit act). `normalizeName` treats diacritics,
  punctuation, AND spacing as noise (strips everything non-alphanumeric
  after NFD de-diacriticing) so "A.J."/"AJ"/"A. J.", "O'Reilly"/
  "OReilly", "Pierre-Luc"/"Pierre Luc", "Stützle"/"Stutzle" all
  converge — it's the comparison key on every side, so changes to it
  re-key consistently. Returns `{ teamId, teamName,
  status: 'rostered'|'keeper'|'expired', isExpired, keeperList,
  keeperIdx, tradedTo*, ... }` keyed by normalized name.
  The Settings **Keeper Rules** card is the post-creation editor for the
  cost/term model: **Draft Format is editable** (safe to change any time — it
  only sets vocabulary and how the Last Draft page parses an import, and owns
  no keeper data), while **Keeper Cost locks** once `hasKeeperData(league)` is
  true (any declared keeper or imported prior-draft record). The lock states
  its reason — dollars and rounds have no honest conversion, so switching
  would strand recorded values — rather than allowing it behind a warning.
  Term, the per-cost-model rule fields, and the slot rules are all editable;
  `saveRules` writes only the ACTIVE cost model's rule block and leaves the
  others intact (see the preserve-don't-delete rule).

- `src/lib/keeperRules.js` — **the single read path for keeper cost + term**,
  and the legacy shim. `keeperCostModelOf` (`'slot'|'picks'|'auction'`),
  `termOf` → `{model, years}`, `hasTerm`, `isAuctionCost`, `isPickCost`,
  `draftFormatOf` (draft FORMAT only — never a keeper signal),
  `keeperValueText` / `isFinalYear` (compose both dimensions: an auction
  league with a term shows `$63 · Y2/3`, a slot league with no term shows
  `1 slot`), `keeperArchetypeOf` (null for slot + no term — read sites must
  handle null), `hasKeeperData` (the Settings cost-model lock gate),
  `COST_LABEL` / `termLabel` / `keeperRuleSummary`. Leagues created before
  the wizard carry only `contractYears` / `auctionRules` / `draftType`; every
  read goes through here so both shapes render identically. **Resolution is
  read-time only — nothing is written back**, so no data migration exists or
  is needed. The rule of thumb when touching a keeper surface: a
  `draftType === 'snake'` test almost always meant one of two DIFFERENT
  things — "shows contract years" (now `hasTerm`) or "doesn't show dollars"
  (now `!isAuctionCost`) — and they are no longer complementary.
- `src/lib/priceProvenance.js` — the one read/write path for a dollar value the
  commissioner may have typed over. `priceOf` (the value in force — what every
  cost calculation and every display uses), `computedPriceOf`,
  `isPriceOverridden`, `setPrice` / `resetPrice` (patch objects, so call sites
  can't half-apply the three fields), `refreshComputedPrice` (what a re-imported
  row carries: new calculated value underneath, existing override on top),
  `countOverriddenPrices` / `overriddenPricesIn`. Pure. **Never write `keptFor`
  directly from a UI surface** — see the price-field rule.
- `src/lib/changeLog.js` — `league.changeLog` helpers: `appendChanges` (returns
  a new league, identity when there's nothing to add, capped at
  `CHANGE_LOG_LIMIT` = 500 newest-first), `changeEntry`, `describeChange` (the
  human form, returning parts so the card can weight them), `formatChangeTime`.
  Pure, no schema change — it rides the `data` blob.
- `src/lib/importGuard.js` — what a bulk import is about to destroy, counted
  before it runs: `rosterImportImpact` (rows replaced + **which declared
  keepers the paste is missing**), `draftImportImpact` / `priorKeepersImpact`
  (rows, rounds overwritten, hand-set prices that survive, declared keepers
  untouched), `picksImportImpact` (only the pick trades the paste
  contradicts), and the matching `*GuardLines` — `{tone: 'danger'|'ok', text}`
  bullets, kept here so the wording is testable and two import surfaces can't
  drift. `hasImpact` false = no dialog (a first import never nags). Pure.
- `src/lib/season.js` — `startNewSeason()` (advances keepers' contract
  years, drops expired, resets keepers, etc.). `advanceKeeper` spreads
  the keeper object, so acquisition metadata survives season rollovers
  for free.
- `src/lib/acquisition.js` — acquisition metadata helpers:
  `ACQUISITION_METHODS` / `ACQUISITION_LABEL`, `acquisitionOf(entry)`
  (normalized read — absent fields default to round null / method
  'manual' / rookie false; **no migration needed for old data**), and
  `acquisitionSummary` (readable short form, e.g. "draft R3 · rookie").
  Foundation for the pick-cost keeper archetype; nothing computes rules
  from these fields yet, and **no surface displays or edits them** —
  see the acquisition-visibility rule (all reveal toggles removed; the
  shared `AcquisitionRow` editor sits unwired in `KeepersTab.jsx`;
  imports keep stamping the fields silently).
- `src/lib/draftPicks.js` — draft-pick ownership helpers over the
  SPARSE `league.draftPicks` model (see the pick-ownership PR bullet):
  `getDraftRounds` / `defaultDraftRounds`, `pickOwnerId`,
  `reassignPick` (Picks-grid entry point; round-1 changes patch saved
  `lotteryResults` by team name), `recordLotteryPickTrade` (Lottery
  entry point; team names → ids → round-1 ownership), `tradedPicks`
  (the roll-up list). draftPicks = OWNERSHIP truth; lotteryResults =
  ORDER truth; both write-throughs keep them consistent.
- `src/lib/teamMap.js` — Yahoo-team-name↔GM mapping:
  `resolveYahooTeam` (saved-map lookup, normalized), `suggestTeam`
  (fuzzy suggestion vs team names), `rememberYahooTeams` (accumulate
  confirmed pairs at import time; identity mappings kept on purpose —
  they're what survives a later app-side team rename).
- `src/tabs/DraftResultsTab.jsx` — `LastDraftPanel`, the **full-page**
  Last Draft surface (the "Last Draft" door, both draft types): the
  imported prior-year draft (`team.priorKeepers`) as team chips over
  per-team row sections — headshot, pos chip, in-place
  `PlayerAutocomplete` name cell (local draft, commits on pick/blur),
  inline-editable value (auction `$`/`keptFor`, snake `Rd`/
  `acquisitionRound`), remove ×, unmatched flags when the directory is
  ready (plus the roster-import "directory unavailable" banner).
  Hosts the on-page import: `DraftImportFlow` renders as page content
  (opened by the page's own Paste Draft buttons), completion shows a
  transient success banner. Empty state = "No draft imported yet" +
  Paste Draft.
- `src/tabs/ImportTab.jsx` — `DraftImportFlow` (the paste→map/confirm
  steps, overlay-free — rendered by the Last Draft page; a zero-player
  parse shows a helpful error naming Yahoo's other Draft Results view
  instead of an empty preview) + `DraftImportModal` (thin wrapper:
  flow + result step; **dormant** — only the unrouted
  `SeasonSetupWizard` path uses it). Re-exports `parseDraftResults`
  from `src/lib/draftParse.js`.
- `src/lib/draftParse.js` — the draft-results paste parser, pure JS
  (extracted from ImportTab so it's unit-testable without JSX).
  Handles **both Yahoo Draft Results views, sport-agnostic**: the
  team-by-team TEAM view (team name line, rows below; leading `N.` =
  round) and the flat PICKS view (one selection per line, fantasy
  team at the END of the row; leading `N.` = overall pick, round =
  `ceil(pick / team count)`). View is auto-detected from trailing
  team text on the rows; the `$salary` is the split anchor between
  player block and team name (team names may carry quotes/ellipses/
  emoji/digits); pro-team abbrevs may be mixed case, position lists
  comma/slash-separated; header rows ("Pick Player Salary Team") are
  vocabulary-detected and can never become mappable teams; teams with
  zero players are dropped as noise. Players are NEVER dropped for
  failing a directory match. Unit tests:
  `npm run test:parser` → `scripts/test-draft-parser.mjs` (plain
  node, fixtures for 3 sports × both views + failure modes).
- `src/tabs/DraftPicksTab.jsx` — `DraftPicksPanel`, the **full-page**
  Picks surface (rendered by `LeagueView` in the Lottery full-page
  pattern): intro card with an editable Rounds input ("auto" note when
  derived) + the "Paste from Yahoo" button, the round×team ownership
  grid (sticky round column with opaque layered background — the
  sticky-transparency rule applies here too; click a cell → inline
  team select; traded cells `via {owner}` in warning tint), and the
  Traded Picks roll-up with per-trade undo. Also exports
  `PicksPasteModal` (paste → preview/mapping → confirm, with the
  round-sum and Grid-checksum results shown on the preview step; takes
  `initialText` as a render-test seam) and re-exports
  `parseDraftPicksText` from `src/lib/picksParse.js`.
- `src/lib/picksParse.js` — the Yahoo Draft Picks paste parser, pure JS.
  `parseDraftPicksText(text, {knownNames})` detects the view and
  dispatches: `parsePicksByRound` (the real format — round blocks of
  owner/held pairs, concatenated original-owner names segmented against
  the paste's own owner vocabulary via `segmentTeamNames`, per-round
  one-pick-per-team checks, optional Grid checksum via `parsePicksGrid`),
  `parsePicksByTeam` (the old block format, fallback), and a refusal for
  a Grid-only paste. Returns `{ format, picks, rounds, teams, teamCount,
  totalPicks, tradedCount, issues, grid, error? }`. Tests:
  `scripts/test-picks-parser.mjs` (parser) + `scripts/smoke-picks-paste.mjs`
  (the modal's preview step, both themes).
- `src/tabs/OverviewTab.jsx` — exports **`KeepersOverview`** (the live
  Overview surface) plus the now-dormant `CompactKeeperGrid`.
  **`KeepersOverview`** is a full-width responsive grid
  (`repeat(auto-fill, minmax(320px, 1fr))`) of uniform **`TeamKeeperCard`**s:
  each card is a header (avatar + team name + x/N pill) over a fixed
  K1..N slot list — filled slots show a player headshot + name +
  value (`Y{cy}/{cl}` snake / `${keptFor}` auction), red + "Final yr"
  when `contractYear >= contractLength`; empty slots read "Open slot".
  Clicking a card jumps to Set-keepers for that team (`onOpenTeam`).
  Snake leagues get an **`ExpiringSection`** roll-up below the grid
  ("Expiring after this season" — the back-to-the-draft chips). Grid
  accent follows draft type (blue snake / orange auction).

  **`CompactKeeperGrid`** (the older sticky-table keeper grid —
  pinned Team/Edit columns, stretch-vs-scroll modes, `SampleKeeperCell`
  cells, the `⇄` trade badge and move-popover) is **still in this file
  and exported, but `LeagueView` no longer renders it** — Overview uses
  `KeepersOverview`. The sticky-table notes below describe
  `CompactKeeperGrid` for when/if it's revived or removed.

  Team and Edit
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

  **Grid accent is COST-MODEL-based, not sport- or draft-format-based.**
  `gridAccent = isAuctionCost(league) ? tokens.warning : tokens.info` — blue
  (`#3b8ae6`) for slot/pick costs, orange (`#e8832a`) for dollar costs.
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

  **Header stats:** the old `LeagueView` header stat strip
  (TEAMS / KEEPERS / PAID / POOL / EXPIRING) was **removed** in the
  redesign — the identity card is identity-only. Expiring counts now
  live in the Overview `ExpiringSection`; pool/paid live in the Pool &
  Payouts sheet.
- `src/tabs/PlayersTab.jsx` — NHL directory, search/filter/sort, manage
  modal (Add-to-roster + Make-keeper). **No longer routed** since the
  redesign — its capability moved into the Set-keepers Eligible Pool
  ("League" sub-tab). Kept for reference / potential reuse.
- `src/tabs/KeepersTab.jsx` — `KeeperEditModal` (used by OverviewTab
  + setup wizard). Has duplicate-prevention via `disabledNames` to
  the PlayerAutocomplete.
- `src/tabs/SetupTab.jsx` — `SeasonSetupWizard` (the big "set up next
  season" flow with the Eligible Pool sidebar). Reached from the
  Overview tab "Continue setup" button.
- `src/tabs/SourcesTab.jsx` — `DataSourcesPanel` (roster + contract
  import buttons inside the wizard)
- `src/lib/rosterParse.js` — the Yahoo roster-paste parser, pure JS
  (extracted from RosterImportTab; fixtures in
  `scripts/test-roster-parser.mjs`). **Names only** — Yahoo's leftmost
  column is a lineup slot (BN, IR+, Util…), not a position, so slot
  labels anchor the parse and are discarded; vacant-slot furniture
  ("--empty--", "(Empty)", punctuation-only lines) is skipped via
  `isRosterPlaceholder` (a real basketball import once saved a player
  named "--empty--"). Yahoo's "Buf - QB" line under a name IS captured now,
  as `hint: {proTeam, positions}` — read only to disambiguate a name matching
  more than one directory player, **never** stored as the player's position
  (short lookahead, stopping at the next slot label, because Yahoo prints the
  name twice before that line). `cleanPlayerName`'s status-flag strip requires
  whitespace before the flag (`\s+`) — with `\s*` it truncated names
  ending in K/O/Q/P (Hellebuyck → "Hellebuyc").
- `src/tabs/RosterImportTab.jsx` — the roster-import modal (paste via
  lib/rosterParse + `window.claude.complete` screenshot OCR) plus the
  shared **`RosterEditor`** and its **`RosterEditorModal`** wrapper
  (saved-roster corrections: remove × + add via autocomplete; opened
  from the Import page's per-team "Edit roster" — one component,
  never forked). Paste samples are sport-aware (`ROSTER_SAMPLES`,
  keyed off league.sport). Positions come from the NHL directory match
  (matched rows store `pos` like `LW` via the L/R→LW/RW map, unmatched
  rows store no `pos` and are flagged in the preview for spelling
  fixes). Every preview row and
  the "+ Add player manually" path render the real `PlayerAutocomplete`
  (not a bare input), so an unmatched row is fixed in place by picking
  the directory's suggestion; the × button remains the dismiss path.
  A directory that fails to load **or loads with zero players** is an
  explicit error state — a warning banner ("Player directory
  unavailable…") renders in the modal instead of every name silently
  passing unflagged with no position; importing name-only stays
  allowed.
- `scripts/fetch-players-nhl.mjs` — build-time NHL fetch,
  **roster-based**: a per-team roster sweep is the base population —
  includes players with zero games last season; last-season stats
  (stats REST season-aggregate endpoints, which include hits/blocks)
  merge on by playerId, roster identity fields winning (current team
  beats last-season `teamAbbrevs`); stats-only players not on a
  current roster are appended so coverage never shrinks. No-stat
  records have stat fields **absent** (not zeroed) — readers show "—".
  **Off-season resilience** (the script runs in July too): the team
  list tries `/v1/standings/now` but falls back to the team set found
  in the stats sweep's `teamAbbrevs` (standings can be empty between
  seasons); each team's roster is the UNION of `/roster/{TEAM}/current`
  and `/roster/{TEAM}/{SEASON_ID}` (current wins on shared players —
  "current" can 404 or be a thin next-season skeleton off-season).
  Verbose per-step logging (stats counts, team-list source, per-team
  roster counts per source) so a failing Vercel build pinpoints the
  broken endpoint from the log alone. Emits `ppg`/`ppa` (skaters, from
  summary `ppGoals`/`ppPoints`) and `saves` (goalies) — field names
  match `STAT_CATEGORIES` keys on the shared page. **Failure policy —
  never ship an empty directory silently**: on any fetch error or a
  roster sweep under `MIN_ROSTER_PLAYERS` (500), keep the previous
  good JSON if one exists (non-empty `players`), otherwise **exit 1
  and fail the build** (the committed placeholder counts as no-good —
  a fresh Vercel clone with a failing fetch goes red, not live-empty).
  `loadPlayers` caches the JSON in localStorage under a versioned key
  (`khq_players_{sport}_v5`) and **never caches an empty payload** (so
  a fixed deploy recovers instantly); **bump the version when the
  record shape changes** or browsers serve the old shape for up to the
  12h TTL. Tradeoff (v1): players on neither a current roster nor
  last season's stats list (long-retired, career-AHL) are not
  covered — acceptable; no historical-roster union attempted.

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
app with their real league. **Create-league (#16, PR #10) and the
LeagueView jobs-first redesign (#21) are now shipped — the redesign
was the last big structural FE pass, so the "UI has stopped shifting"
gate (named in split B as the collaboration trigger) is now MET for
the commissioner surfaces. Backend + auth (#7/#15) is the active
milestone.** Responsive (#17) is largely addressed for the surfaces
touched in #21 and continues alongside backend work. See Open items
#7 (backend — active), #15 (account/login — active),
#16 (create-league — shipped), #17 (responsive — largely addressed).

**(B) Multi-user collaboration REMAINS deferred — with one carve-out
now shipped.** League *members* logging in, members picking their own
keepers, in-app trade negotiation between members, the end-user
(league-member) flow: still deferred. **The carve-out: the read-only
shared league page (`/l/:token`) + its Settings share row is
sanctioned and built** — it involves no member identity, no member
writes, and no shared mutable state (it's a tokenized public read).
The old blanket "no share-this-league UI" phrasing is superseded for
exactly that surface and nothing else. The trigger has two halves — **(1) UI has stopped
shifting: now MET** (post-#21), and (2) a clear need for multiple
people to share state: not yet. So collaboration stays deferred on the
*need* half, not the *stability* half.

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
   Also a candidate: the **"Setup complete!"** screen at the end of
   `SeasonSetupWizard` (`src/tabs/SetupTab.jsx` `StepDone`) —
   currently a `Trophy` line icon (post-emoji-swap PR) but its
   celebration-moment nature makes it a natural fit for
   `mascot-celebrate.png`. Ties to audit items G2/G5.
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
6. **NBA / MLB player directories — NFL SHIPPED (this branch's PR), the other
   two still open.** NFL went a different route than the NHL script: not a
   build-time JSON blob but a **stored Supabase table** refreshed by a manual
   button, because its job is identity resolution (stable `player_id` on every
   imported row), not just search. NBA (ESPN unofficial) and MLB (MLB Stats
   API) remain unbuilt — and note the app now has **two** directory patterns;
   pick per sport by whether that sport needs stored identities or just a
   name/position lookup, rather than assuming either is "the" pattern.
7. **Real backend / database — SHIPPED (PR #23).** Supabase
   (Postgres + auth) is live: one `public.leagues` row per league
   (`owner_id`, `id`, `sport`, `data jsonb`), RLS-enforced single
   owner per league. Replaces the localStorage-only mock-data setup
   for signed-in users — a commissioner's data now persists and is
   portable across devices. Still scoped to single-commissioner
   persistence, NOT multi-user collaboration (see Roadmap split A vs
   B). Shipped together with account/login (#15). The data *shape*
   (`src/data.js` / the `league` object) stayed the working model —
   this was about where it's stored, not restructuring it. See the
   "Backend milestone — auth + persistence" section above for the
   full implementation detail.
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
    (A **read-only Yahoo API** application is in review — when approved
    it supplements the paste/OCR path with a direct pull; see #15.)
14. **Draft-pick ownership / validation — FOUNDATION SHIPPED (this
    branch's PR); validation logic still open.** The underlying need —
    knowing **who owns which picks** — is now first-class:
    `league.draftPicks` + the snake-only Picks sheet let the
    commissioner record pick trades by hand and see ownership at a
    glance (see the pick-ownership PR bullet). The **mapping layer
    (Yahoo team name ↔ GM/owner)** also shipped
    (`league.yahooTeamMap`, wired into the draft-paste preview), and the
    **Yahoo Draft Picks paste now reads the real By Round view** with a
    Grid checksum (see the shipped-work bullet). Still open from the
    original item: actual trade *validation* (warning when someone
    trades a pick they no longer own) and a direct API pull of picks.
15. **Account creation + login — SHIPPED (PR #23).** Google SSO is
    live (`AccountMenu` in `src/App.jsx`, `supabase.auth.signInWithOAuth`).
    Tightly coupled with the backend (#7): login identifies the
    commissioner whose data persists server-side. **One owner per
    league** — not member logins (that's the deferred collaboration
    line, Roadmap split B). Yahoo linking remains a later, separate
    auth (it's also the in-season platform many leagues use).
    **Yahoo read-only API is now a real near-term input:** a read-only
    API application is **in review with Yahoo**. Once approved it
    becomes a direct roster/draft import path for the Import flow
    (today's `RosterImportTab` paste/OCR), reducing the manual
    copy-paste step. Still a *separate* auth from the commissioner
    Google SSO — Yahoo linking authorizes reading the user's Yahoo
    league data, not logging into KeeperHQ.
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
17. **Mobile web / responsive — largely addressed for the redesigned
    surfaces; remainder ongoing.** The PR #21 redesign made the Keepers
    home, identity card, Set-keepers workbench, and the Pool & Payouts
    sheet reflow on mobile (single-column stacks, the eligible-pool
    full-screen sheet). Remaining: HomeView pack + any
    `maxWidth`-assuming containers not touched by #21. Continues
    alongside backend work, still a baseline (not a final-polish) bar.
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
22. **Logged-out landing page + new-user onboarding — SHIPPED (PR #24,
    PR #25).** In one line: a logged-out landing (Variation A,
    commissioner hero), demo-browsing framing (banner + per-card Demo
    badges), a new-user empty state (celebrate mascot + speech chip),
    a shared `GoogleButton` + `TextLink`, the `typeHeadingDisplay`
    token, a minimal `Toast` primitive, and card-shaped loading
    skeletons with a min-display floor. Addresses the #19
    "public/logged-out homepage" direction now that #7/#15 (backend +
    login) have shipped. Three surfaces: a centered logged-out landing
    at `/` (headline, Google sign-in, "Explore the demo" link — no My
    Leagues grid shown to logged-out visitors), a demo-browsing framing over
    the existing My-Leagues grid at `/demo` (banner + a "Demo" badge
    per `TradingCard`, reusing the real grid/cards), and a new-user
    empty state for signed-in accounts with zero leagues (welcome card
    + "Create your first league" CTA into the `/new` wizard). The
    follow-up replaced the plain loading spinner with a `LeaguesSkeleton`
    (`HomeView.jsx`) that mirrors the real stat-strip/filter/card-grid
    layout so real data swaps in with zero layout shift, added a
    `useDelayedLoading` debounce (`App.jsx`) so sub-200ms loads show
    nothing and shown loads hold for a ~350ms floor (no flicker), and a
    `kh-fade-in` keyframe (`components.jsx` `CARD_STYLES`) for the
    content swap. Several things deliberately deferred out of the
    original slice:
    - **(a) Multi-sport landing hero — shelved, not killed.** A
      Claude Design "Variation B" concept pitched a sport-lineup hero
      (hockey/basketball/football/baseball side by side). NHL is the
      only sport that's actually live (#6 — NBA/NFL/MLB directories
      are still not built), so today's landing (Variation A + the
      commissioner mascot, sport-agnostic) ships instead. Revisit the
      multi-sport hero once more sports actually ship.
    - **(b) "How it works" / product-tour section — deferred.** A
      below-the-fold section on the logged-out landing (screenshots or
      a short walkthrough) matters once the tool is being opened up to
      other people, not for solo use — and shouldn't be built until
      the surfaces it would depict (Overview, Set-keepers, Payouts)
      have stopped shifting. Not part of this slice.
    - **(c) FUTURE — app-wide micro-animation pass.** Consider adopting
      Motion (motion.dev) as a deliberate single dependency for richer
      motion across the app (card springs, count-up numbers, list
      reordering, page/celebration transitions) to hit the
      Sleeper-energy aesthetic target. Styling-agnostic, works with the
      inline-style/token approach. Deferred until core flows are
      locked; evaluate as its own slice. Component kits like
      kokonutui/reactbits/bklit assume Tailwind/shadcn (a stack this
      app doesn't use) — treat as visual inspiration for Claude Design
      only, not as importable code.
    - **(d) FUTURE — toast/notification visual pass.** The current
      `Toast` primitive (`components.jsx`, shipped in PR #25 for
      "Signed out") reads as a button-like element — solid bordered
      card, bold text — rather than a clearly transient notification.
      Restyle it to read unambiguously as a passive confirmation, not
      a CTA. Do this as a deliberate pass across **all** toast/
      notification UI at once, not a one-off fix to just this
      instance — there's already a second, visually distinct toast
      primitive (`SaveToast`, the dark pill used for save
      acknowledgements) — decide whether the two should converge on
      one shared visual language or stay intentionally distinct, and
      settle that before adding a third.
23. **Shared league page — FUTURE (v1 shipped in PR #27; none of
    this is in scope until the user asks).** From the design handoff's §14 list:
    - **Shared page phase 2 — draft-prep window:** post-lock
      team-cards view, lottery results display, and the true
      draft-pool view (expired + all unkept players once keepers
      lock — v1 deliberately never claims to show the full pool).
    - Sealed mode: submitted keepers hidden until a
      commissioner-triggered pre-draft reveal — the shared page is the
      eventual reveal stage, so don't structurally assume all data is
      always public.
    - Member logins / anonymous keeper declarations (pending
      commissioner confirm); the "x/y declared" count returns then as
      a member motivator (it was deliberately removed from v1 —
      commissioner telemetry, not member info).
    - All-players view sorted by last-season points across every
      roster.
    - Draft lottery reveal animation.
    - GM draft rankings via pairwise comparisons (swipe "this player
      or that one" → personal ranking → aggregate league/global
      rankings weighted by league scoring categories).
    - NFL/NBA player directories + stats — the configurable
      stat-columns model (`STAT_CATEGORIES` /
      `league.statCategories`) applies as-is (rushing/receiving/
      passing yards, TDs, INTs, etc.).

25. **FUTURE — team-tenure keeper leagues (a gap the two-dimension model
    cannot express).** The cost/term model asks "how many keepers" as a
    fixed player count. A real and Yahoo-supported variant instead budgets
    **years of service**: a team protects a fixed number of keeper-YEARS, so
    it could keep ten first-year players, or one player held for ten years,
    or any combination summing to the budget. This breaks the count question
    at its root — the number of keepers becomes variable rather than fixed,
    so `keeperSlots` stops being a meaningful cap and the whole
    count → cost → term sequence needs rethinking for that path. **Not
    being built.** Recorded so the gap is known rather than rediscovered
    when someone asks why a tenure league can't be set up.

26. **Backfill player IDs onto rows imported before the directory existed.**
    Explicitly out of scope for the NFL-directory PR. Every NFL row imported
    from now on carries a `playerId` + `sourceName`; rows already in the blob
    carry neither, and they're exactly the rows a Yahoo join would miss. The
    shape of the fix is known — run the stored names through `lookupByNames` +
    `pickDirectoryMatch` (no team/position hint available, so more rows land
    ambiguous) and write the ids back, with a review surface for the ones that
    don't resolve cleanly. Do it as its own pass, and only against leagues the
    commissioner still cares about.

27. **Nothing reads the cross-platform IDs yet.** `yahoo_id`, `espn_id`, and
    friends are captured on every refresh and used by nothing — deliberately,
    that's the foundation this PR was for. They become live when the Yahoo
    integration (Open item #15) is unblocked. **Measured coverage: 47%
    `yahoo_id` / 45% `espn_id` over 8,579 active players** — see the
    "Cross-platform ID coverage" table above. The consequence is already
    decided: the Yahoo reconciliation is **two-tier** (id join, then
    `search_key` name matching), not a pure join. The open question is only
    how much of the second tier real rosters actually hit — measure that
    against an imported league before sizing the work.

28. **Shared page, post-deadline state: the returning pool is invisible.**
    **PARTIALLY ADDRESSED** by the flat-list change: keepers are highlighted in
    place, so post-lock the returning pool is readable as "the rows without a
    highlight" rather than needing a separate view. What's still owed is the
    post-lock pass itself — the default view still NARROWS to declared keepers
    once locked, so the unkept players aren't on the page at all to be read.
    Original note follows.
    Once keepers lock, the default view narrows to declared keepers — which
    answers "who was kept" but not "who's going back into the draft", and the
    second question is the one that matters for draft prep. The page should
    show both, as separate views: final keepers, and the pool returning to the
    draft (everyone rostered who wasn't kept, plus expired contracts on term
    leagues). Related to Open item #23's "draft-prep window" phase-2 note,
    which describes the same gap from the design-handoff side. Not built.

29. **Shared page: the returning pool has no ranking signal.** Players heading
    back to the draft have no keep cost by definition, so the cost-desc sort
    that orders the keeper view can't order them — they'd land alphabetically,
    which is useless for draft prep. Two candidate signals: last year's drafted
    price (**already in the data** — `priorKeepers[].keptFor`, and already
    threaded to the page as `row.draftedCost`), or last season's fantasy points
    (needs a stats source that isn't wired for football/basketball — the NFL
    directory stores no stats, and `STAT_CATEGORIES` is hockey-only today).
    The first is free and available now; the second is better but is its own
    arc. Decide which before building #28, since the ranking is what makes that
    view usable. User will pick the direction.

30. **Merge instead of replace on every paste import — the real fix behind the
    guards.** Every import replaces the list it targets; the confirm dialogs
    (shipped) only make that visible. The right behaviour is a reconciliation:
    keep what's on file, add what's new, and surface conflicts for a decision —
    the same review-surface shape the Yahoo two-tier reconciliation (#27) will
    need, which is an argument for designing them together rather than twice.
    The price-override carry-forward (`refreshComputedPrice`) is a deliberately
    narrow first instance: one field, merged, everything else still replaced.
    Start from `src/lib/importGuard.js` — it already computes the diff the
    merge would act on.

31. **Snapshots / undo — the missing safety net under everything.** There is no
    version history in this app at all, which is why "preserve, don't delete"
    has to be a standing rule and why every destructive dialog has to say
    "there's no undo". Shape: snapshot the league blob before any bulk import
    or season rollover, keep the last N per league, restore from Settings.
    Cheap because the whole league IS one jsonb blob — a snapshot is a copy of
    a column, not a schema. That would demote every import guard from last line
    of defence to convenience. The change log is NOT this: it records what
    changed, not the state before it.

32. **Shared page: should a hand-set price be marked to members? — DECIDED
    (yes) and SHIPPED.** See the "Member-facing price provenance" bullet in
    Recent shipped work for what landed and why. **`007_shared_price_provenance.sql`
    must be run** in the Supabase SQL Editor or the marker never appears (and
    the round sort stays broken); the price itself was already correct without
    it, which is the whole point of the price-field rule.

24. **FUTURE — dedicated Rosters page.** A full page owning roster
    data + roster import (mirroring the Last Draft page's
    data-has-a-home pattern), dissolving the Import page into two
    proper homes (rosters / draft). Do as a deliberate IA pass, not
    piecemeal — the interim state is the Import page's roster section
    with its per-team Edit-roster modal.

## Cleanup pending

- `public/nav-logo.png` — unused since the wordmark swap. Safe to
  delete. **Note**: `public/keeper-hq-logo.png` is the small-viewport
  nav fallback now; do NOT delete that one (this is the opposite of
  the previous note).
- `public/commissioner.png` — **not yet generated and currently
  unwired.** No longer a PackStats asset (PackStats is numerics-only);
  if generated, its home is a mascot-*speech* surface (celebration /
  help), per the mascot-speech principle — not an automatic drop-in.
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
push directly to `main`. **Only while that branch's PR is still open**
— once it's merged the branch is spent; see the pre-push check below.

### CHECK THE PR IS STILL OPEN — BEFORE PUSHING

**A branch whose PR has already merged cannot carry new work.** Pushing to
it moves the branch and nothing else: the commit sits on a closed PR looking
shipped while `main` never gets it. This has now happened twice (PR #41, and
the price-marker layout fix that should have been in #44 — recovered as a
fresh PR).

The post-push check in the next section did not prevent either one, and
can't: **the push itself is the mistake**, and a check that runs afterwards
can only tell you it already happened. So the check has to come first.

**Before every push, confirm the branch's PR is still open:**

```
mcp__github__list_pull_requests  owner: bshiroky  repo: keeperhq
  head: "bshiroky/<branch>"   state: "all"
```

- No PR yet → fine, push and open one.
- Newest PR **open** → fine, push; it updates that PR.
- Newest PR **closed or merged** → **do not push.** Restart the branch from
  the latest `main` (`git fetch origin main && git reset --hard origin/main`,
  keeping the branch name), cherry-pick any unmerged commits onto it, confirm
  `git diff <old-tip> HEAD` is **empty**, force-with-lease push, and open a
  **new** PR. The old PR is finished and never reopens.

**Read `merged_at`, not `merged`.** On a squash-merged PR this repo's API
responses come back `"merged": false` with `"merged_at"` populated — trusting
the boolean reports a merged PR as still open, which is the exact failure this
check exists to catch. A non-null `merged_at`, or `state: "closed"`, means the
branch is spent.

### VERIFY BEFORE CALLING ANYTHING LANDED

**Never report work as shipped/landed/merged without checking `main` first.**
A push succeeding only proves the branch moved; it says nothing about whether
`main` has the work. Real case: two commits were pushed to a branch minutes
after its PR was squash-merged, so they sat on a closed branch looking shipped
while `main` never had them (recovered in PR #41).

**The check that always works: look for the change itself on `main`.**

```sh
git fetch origin main
git show origin/main:<file> | grep '<a distinctive string from the change>'
```

Present = it landed. Absent = it did not. This is immune to both traps below —
it doesn't care how the merge was performed or how far `main` has moved since.

The two commit-level checks are useful but each proves only one direction, and
**both gave a false "not landed" in this session**:

```sh
git merge-base --is-ancestor <sha> origin/main   # exit 0 PROVES landed
git diff --stat <sha> origin/main                # empty PROVES landed
```

- `--is-ancestor` — a "yes" is conclusive. A **"no" means nothing here**,
  because this repo squash-merges: a squash puts a NEW commit on `main`, so
  every branch commit reports "not on main" whether its PR merged or not.
- `git diff` — an **empty** diff is conclusive: `main` holds exactly that tree.
  A **non-empty** diff means nothing on its own, because it is equally true
  when `main` has simply moved on with later work. (Hit live: `git diff
  20faf6a origin/main` came back non-empty and briefly read as "#41 never
  landed" — #41 had in fact merged, with #42 stacked on top.)

So: **treat a negative from either commit-level check as inconclusive** and go
look for the change itself before telling anyone something is missing. A
positive from either is enough on its own.

(The empty-diff form is what cracked the original #41 case: `main` came back
byte-identical to the branch's second-to-last commit, which located the two
stranded commits precisely.)

**Say it plainly when a push is stranded** — "this is on the branch, but its PR
is already merged, so it is NOT on main" — rather than reporting it as done.
The recovery is: new branch off current `main`, cherry-pick the stranded
commits in order, confirm `git diff <old-tip> HEAD` is empty (the work
transferred exactly), and open a PR.

The same check applies before saying a fix is live for the user to look at:
deployed means merged to `main` AND built, not pushed to a branch.

## Things NOT to do

- Backend / login / accounts for a **single commissioner** are now
  planned (Roadmap split A, Open items #7/#15) — don't reflexively
  block them. Still don't *start* building them without the user
  steering it, but they're on-plan, not off-limits.
- Don't build **multi-user collaboration** (member logins, member
  keeper-picking, in-app trade negotiation) or promise it in copy/UI
  — that's the still-deferred line (Roadmap split B). The **read-only
  shared league page** (`/l/:token`, Settings share row) is the one
  shipped exception; don't extend it with write paths or member
  identity (see Open item #23 for its sanctioned phase 2).
- Don't push to `main` directly.
- Don't bake in API keys (no provider that requires one has been chosen).
- Don't add comments narrating the change ("Added per user request,
  May 16"); WHY-comments only.
- Don't introduce new dependencies unless asked. The stack is React +
  Vite + nothing else.
