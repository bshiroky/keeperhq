import { supabase } from './supabase.js';
import { normalizeName } from './players.js';
import { buildTeamPool } from '../tabs/SetKeepersTab.jsx';
import { hasTerm, termOf, isFinalYear, isAuctionCost } from './keeperRules.js';
import { isPriceOverridden } from './priceProvenance.js';
import { sortTeamsByName } from './teamOrder.js';
import { buildDraftBoard, standingsOf } from './draftOrder.js';

// Data layer for the public shared league page (/l/:token).
//
// The page reads through `get_shared_league(p_token)` — a security-definer
// Postgres function that looks a league up by its share_token and returns a
// jsonb PROJECTION of the league (name/sport/draft config/teams/contracts
// only — no owner, money, or commissioner fields). It runs with the anon key
// and no session; RLS on public.leagues itself stays owner-only.

export async function fetchSharedLeague(token) {
  if (!supabase || !token) return null;
  const { data, error } = await supabase.rpc('get_shared_league', { p_token: token });
  if (error) throw error;
  return data || null;
}

// ── Row derivation ──────────────────────────────────────────────────────────
// One flat row per player, deduped by normalized name with the same priority
// order buildStatusIndex uses (keeper > contract > rostered > expired). The
// eligibility math itself (next contract year, final-year flag, next auction
// cost, expiry) is buildTeamPool — the production Eligible Pool logic — so
// the shared page can never disagree with the commissioner workbench.
//
// Row shape: { kind, player, pos, teamId, teamName, year, len, final, cost }
//   kind 'keeper'   — declared keeper (attributed to tradedTo owner when set)
//   kind 'contract' — under contract from last season, not yet declared
//   kind 'rostered' — on a roster with no contract (fresh Y1 deal if kept)
//   kind 'expired'  — contract ran out; NOT keepable (snake only)

const KIND_PRIORITY = { keeper: 3, contract: 2, rostered: 1, expired: 0 };

export function buildSharedRows(league) {
  // Term and dollar cost are independent — a league can have both, or neither.
  const termed = hasTerm(league);
  const defaultLen = termOf(league).years || league.contractYears || 3;
  const teams = league.teams || [];
  const teamById = new Map(teams.map(t => [t.id, t]));
  const rows = new Map();

  const put = (row) => {
    const key = normalizeName(row.player);
    if (!key) return;
    const cur = rows.get(key);
    if (!cur || KIND_PRIORITY[row.kind] > KIND_PRIORITY[cur.kind]) rows.set(key, row);
  };

  for (const team of teams) {
    // Drafted price (auction): the prior-year record's keptFor — what the
    // player went for at last year's draft (or last year's keep price). Quiet
    // secondary info next to "Keep for $X" on the shared page.
    const priorByName = new Map((team.priorKeepers || []).map(p => [normalizeName(p.player), p]));
    for (const k of team.keepers || []) {
      // A traded keeper displays under the team that owns them now.
      const owner = (k.tradedTo && teamById.get(k.tradedTo)) || team;
      const len = k.contractLength || defaultLen;
      put({
        kind: 'keeper', player: k.player, pos: k.pos,
        teamId: owner.id, teamName: owner.name,
        year: k.contractYear || 1, len,
        final: isFinalYear(league, k),
        cost: k.keptFor,
        // Whether the commissioner set this keep cost directly instead of
        // taking the calculated one. Only ever true on a KEEPER row: a
        // contract row's cost is computed by buildTeamPool from the drafted
        // price, so it always follows the league's stated rule even when that
        // drafted price was itself corrected — nothing visible to explain.
        // Needs migration 007; absent on an un-migrated projection, which
        // simply means no marker (the price shown is still the right one).
        costOverridden: isPriceOverridden(k),
        draftedCost: priorByName.get(normalizeName(k.player))?.keptFor ?? null,
        round: priorByName.get(normalizeName(k.player))?.acquisitionRound ?? null,
      });
    }
  }

  for (const team of teams) {
    const pool = buildTeamPool(league, team);
    for (const e of pool.onContract) {
      put({
        kind: 'contract', player: e.player, pos: e.pos,
        teamId: team.id, teamName: team.name,
        year: e.nextYear, len: e.length, final: !!e.final, cost: e.nextCost,
        draftedCost: e.wasCost ?? null,
        round: e.acquisitionRound ?? null,
      });
    }
    for (const e of pool.rosteredNoContract) {
      put({
        kind: 'rostered', player: e.player, pos: e.pos,
        teamId: team.id, teamName: team.name,
        year: 1, len: defaultLen, final: !!e.final, cost: e.nextCost,
        round: e.acquisitionRound ?? null,
      });
    }
    if (termed) {
      // buildTeamPool's expired entries drop the contract length; recover it
      // from the prior record so the row can render "Expired Y{len}/{len}".
      const priorLen = new Map((team.priorKeepers || []).map(p => [normalizeName(p.player), p.contractLength || defaultLen]));
      for (const e of pool.expired) {
        const len = priorLen.get(normalizeName(e.player)) || defaultLen;
        put({
          kind: 'expired', player: e.player, pos: e.pos,
          teamId: team.id, teamName: team.name,
          year: len, len, final: false,
        });
      }
    }
  }

  return Array.from(rows.values());
}

// ── Filter rail ─────────────────────────────────────────────────────────────
// The chips above the list. Pure so the rules are testable without rendering
// the page.
//
// There is deliberately NO "drafted last year" chip on a league with no term:
// its row set (declared keepers + players carrying a prior price) is very
// nearly the whole league, so it duplicated the default view while implying a
// distinction that doesn't exist where keeping costs dollars and nothing else.
// Where a TERM exists, being under contract is a real, separate state, so the
// chip stays there.
export function sharedFilterChips({ league, locked, termed, hasExpired, teams = [] }) {
  return [
    // "Rostered", not "All players" (it isn't everyone) and not "Eligible" /
    // "Keepable" (a keeper-eligibility cutoff is coming, so eligibility becomes
    // something a ROW shows rather than something the tab claims). One label
    // for every league type on purpose: a termed league's default view holds
    // the same thing an auction league's does — last season's rosters — and
    // the cutoff rule will contradict an eligibility claim in either.
    { id: 'keepable', label: locked ? 'Final keepers' : 'Rostered' },
    ...(termed ? [{ id: 'contracts', label: 'Under contract' }] : []),
    ...(hasExpired ? [{ id: 'expired', label: 'Expired', danger: true }] : []),
    // Alphabetical: the strip is a lookup ("where's my team?"), and stored
    // creation order tells a reader nothing.
    ...sortTeamsByName(teams).map(tm => ({ id: `team:${tm.id}`, label: tm.name })),
  ];
}

// Column headers for the two pinned right-hand columns. "Contract" is only
// honest where a term exists (the cell holds "Y1/3"); where keeping costs
// dollars the cell holds a price, so the header says so.
export function costColumnLabel(league) {
  return isAuctionCost(league) ? 'Cost to keep' : 'Contract';
}

// Whose roster the player is on. NOT "Kept by": before the deadline nobody has
// kept anyone, and post-deadline the row highlight already marks who's kept, so
// the column never needs to carry that claim. It also degrades correctly — if
// free agents ever appear here, "on team" is legitimately blank for them.
export const OWNER_COLUMN_LABEL = 'On team';

// Kept players pin to the top of whatever list they're in — on a team tab
// that's the team's keepers, on the default view it's every declared keeper in
// the league. The highlight on the row carries the meaning, so the list stays
// FLAT: no section headers, and nothing labelled by its absence ("Eligible,
// not protected" only existed to explain why the rest were listed below).
// Same shape as the commissioner's Eligible Pool, where selected players are
// marked in place rather than moved into their own section.
//
// Stable: the incoming sort (cost desc / points desc / round asc) is preserved
// inside each group, so this only lifts the keepers.
export function keepersFirst(list, pick = x => x) {
  const kept = [], rest = [];
  for (const item of list || []) {
    (pick(item)?.kind === 'keeper' ? kept : rest).push(item);
  }
  return [...kept, ...rest];
}

// ── Stat categories (desktop table) ────────────────────────────────────────
// League-configurable with defaults. A league may carry an override at
// league.statCategories = { skaters: ['gp','g',…], goalies: [...] } — keys
// into the player-directory record. No settings UI for this yet; defaults
// rule unless the data says otherwise.

export const STAT_CATEGORIES = {
  skater: [
    { key: 'gp', label: 'GP' },
    { key: 'g', label: 'G' },
    { key: 'a', label: 'A' },
    { key: 'p', label: 'PTS' },
    { key: 'plusMinus', label: '+/-' },
    { key: 'ppg', label: 'PPG' },
    { key: 'ppa', label: 'PPA' },
    { key: 'sog', label: 'SOG' },
    { key: 'hit', label: 'Hits' },
    { key: 'blk', label: 'Blocks' },
  ],
  goalie: [
    { key: 'w', label: 'W' },
    { key: 'gaa', label: 'GAA', decimals: 2, asc: true },
    { key: 'svPct', label: 'SV%', pct: true },
    { key: 'so', label: 'SO' },
    { key: 'saves', label: 'Saves' },
  ],
};

export function statCategoriesFor(league, group) {
  const defaults = STAT_CATEGORIES[group];
  const override = league?.statCategories?.[group === 'skater' ? 'skaters' : 'goalies'];
  if (!Array.isArray(override) || override.length === 0) return defaults;
  const byKey = new Map(defaults.map(c => [c.key, c]));
  return override.map(k => byKey.get(k) || { key: k, label: String(k).toUpperCase() });
}

export function formatStat(cat, rec) {
  const v = rec?.[cat.key];
  if (v == null) return '—';
  if (cat.pct) return Number(v).toFixed(3).replace(/^0\./, '.');
  if (cat.decimals != null) return Number(v).toFixed(cat.decimals);
  return String(v);
}

// Default list order: last-season points desc for hockey (goalies rank by
// wins; no-stats players last, alphabetical). Stats-less leagues sort on the
// VALUE axis instead — keep cost desc on auction (matching the Last Draft
// page's value sorting), draft round asc on snake where rounds exist —
// alphabetical only as tiebreak/final fallback.
export function sortRowsDefault(rows, playerMap, league) {
  const sorted = [...rows];
  const isHockey = league?.sport === 'hockey';
  if (isHockey && playerMap) {
    const score = (row) => {
      const rec = playerMap.get(normalizeName(row.player));
      if (!rec) return -1;
      return rec.kind === 'goalie' ? (rec.w ?? 0) : (rec.p ?? 0);
    };
    return sorted.sort((a, b) => (score(b) - score(a)) || a.player.localeCompare(b.player));
  }
  if (isAuctionCost(league)) {
    return sorted.sort((a, b) => ((b.cost ?? -1) - (a.cost ?? -1)) || a.player.localeCompare(b.player));
  }
  return sorted.sort((a, b) => {
    const ra = a.round ?? Infinity;
    const rb = b.round ?? Infinity;
    return (ra - rb) || a.player.localeCompare(b.player);
  });
}

// ── Draft board (shared page) ───────────────────────────────────────────────
// The board is DERIVED on the page from the projected inputs (standings,
// draft-order settings, the lottery draw, pick ownership — migration 008)
// by the same pure function the commissioner's pages use, so the member view
// can't drift from the commissioner view. Team names are attached here
// because the views render names, not ids. Returns the board with `ok: false`
// and a `reason` when it can't be built (no standings, a tie still to break,
// an auction league) — the page decides what to show for each.
//
// No member UI renders this yet; it exists so those views can be built
// against a real projection. `standings` is exposed alongside because a
// standings table is the obvious first view and it needs no computation.
export function sharedDraftBoard(league) {
  const teams = league?.teams || [];
  const nameOf = id => (id ? (teams.find(tm => tm.id === id)?.name || null) : null);
  const board = buildDraftBoard(league);
  const standings = standingsOf(league);
  return {
    ...board,
    picks: board.picks.map(p => ({ ...p, originalTeamName: nameOf(p.originalTeamId), ownerTeamName: nameOf(p.ownerTeamId) })),
    round1: (board.round1 || []).map(s => ({ ...s, originalTeamName: nameOf(s.originalTeamId) })),
    lotteryEligibleNames: (board.lotteryEligible || []).map(nameOf),
    standings: standings
      ? [...standings.rows].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)).map(r => ({ ...r, teamName: nameOf(r.teamId) }))
      : null,
  };
}
