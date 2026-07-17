import { supabase } from './supabase.js';
import { normalizeName } from './players.js';
import { buildTeamPool } from '../tabs/SetKeepersTab.jsx';

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
  const isSnake = league.draftType === 'snake';
  const defaultLen = league.contractYears || 3;
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
    for (const k of team.keepers || []) {
      // A traded keeper displays under the team that owns them now.
      const owner = (k.tradedTo && teamById.get(k.tradedTo)) || team;
      const len = k.contractLength || defaultLen;
      put({
        kind: 'keeper', player: k.player, pos: k.pos,
        teamId: owner.id, teamName: owner.name,
        year: k.contractYear || 1, len,
        final: isSnake && (k.contractYear || 0) >= len,
        cost: k.keptFor,
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
      });
    }
    for (const e of pool.rosteredNoContract) {
      put({
        kind: 'rostered', player: e.player, pos: e.pos,
        teamId: team.id, teamName: team.name,
        year: 1, len: defaultLen, final: !!e.final, cost: e.nextCost,
      });
    }
    if (isSnake) {
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

// Default list order: last-season points desc (hockey), no-stats players
// last alphabetical; goalies rank by wins since they carry no points. Other
// sports have no stat data — alphabetical by team then name.
export function sortRowsDefault(rows, playerMap, isHockey) {
  const sorted = [...rows];
  if (!isHockey || !playerMap) {
    return sorted.sort((a, b) =>
      (a.teamName || '').localeCompare(b.teamName || '') || a.player.localeCompare(b.player));
  }
  const score = (row) => {
    const rec = playerMap.get(normalizeName(row.player));
    if (!rec) return -1;
    return rec.kind === 'goalie' ? (rec.w ?? 0) : (rec.p ?? 0);
  };
  return sorted.sort((a, b) => (score(b) - score(a)) || a.player.localeCompare(b.player));
}
