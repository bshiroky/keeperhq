const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const memCache = {};

export async function loadPlayers(sport) {
  if (memCache[sport]) return memCache[sport];
  // v5: directory became roster-based — new no-stat records (stat fields
  // absent entirely) and players who missed last season. Bumping the key
  // forces a refetch so the new population doesn't wait out the cache TTL.
  const key = `khq_players_${sport}_v5`;
  try {
    localStorage.removeItem(`khq_players_${sport}_v3`);
    localStorage.removeItem(`khq_players_${sport}_v4`);
  } catch {}

  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      const age = Date.now() - new Date(parsed.cachedAt).getTime();
      // Never serve a cached EMPTY directory — an empty payload means a
      // broken deploy, and caching it would pin the breakage for the TTL
      // even after a fixed build ships.
      if (age < CACHE_TTL_MS && parsed.data && (parsed.data.players || []).length > 0) {
        memCache[sport] = parsed.data;
        return parsed.data;
      }
    }
  } catch {}

  const res = await fetch(`/players-${sport}.json`);
  if (!res.ok) throw new Error(`Player data unavailable for ${sport}`);
  const data = await res.json();
  const hasPlayers = (data.players || []).length > 0;
  // Empty payloads are returned (callers decide how to degrade) but never
  // cached, so recovery is instant once a good build deploys.
  if (hasPlayers) memCache[sport] = data;
  try {
    if (hasPlayers) {
      localStorage.setItem(key, JSON.stringify({ cachedAt: new Date().toISOString(), data }));
    }
  } catch {
    // Quota exceeded or storage disabled — memory cache still works.
  }
  return data;
}

// Name-matching key: diacritics, punctuation, AND spacing are all noise —
// "A.J. Greer" = "AJ Greer" = "A. J. Greer", "O'Reilly" = "OReilly",
// "Stützle" = "Stutzle", "Pierre-Luc" = "Pierre Luc". Collapsing whitespace
// entirely (not just normalizing it) is what makes the initials/hyphen
// variants converge; real Yahoo pastes and the NHL directory disagree on
// exactly these. Used as the map key everywhere names are compared, so any
// change here re-keys all sides consistently.
export function normalizeName(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// Build a name → {teamId, teamName, status, …} map from the league. Status
// priority for the primary "what is this player" answer:
//   keeper > rostered > expired > (none = free agent)
// Plus an isExpired flag is attached to any entry whose name appears in any
// team's priorKeepers with expired:true — used to block keeper assignment for
// contracts that have run their course.
export function buildStatusIndex(league) {
  const idx = new Map();
  const teams = league.teams || [];
  const teamById = new Map(teams.map(t => [t.id, t]));

  // Pre-collect expired-contract holders so we can both (a) flag entries that
  // have other statuses and (b) create a top-level "expired" entry for players
  // who'd otherwise be free agents.
  const expiredHolders = new Map(); // key → { teamId, teamName }
  for (const t of teams) {
    for (const pk of (t.priorKeepers || [])) {
      if (!pk.expired || !pk.player) continue;
      const key = normalizeName(pk.player);
      if (!expiredHolders.has(key)) expiredHolders.set(key, { teamId: t.id, teamName: t.name });
    }
  }

  // Who rosters a player is the ownership truth (see buildTeamPool). Keep a
  // separate index of it so the priorKeepers pass below can't reattribute a
  // player to the team that merely DRAFTED him.
  const rosterOwner = new Map();
  for (const t of teams) {
    (t.roster || []).forEach((r, ri) => {
      const k = normalizeName(r.player);
      if (!k) return;
      if (!rosterOwner.has(k)) rosterOwner.set(k, t.id);
      if (!idx.has(k)) idx.set(k, {
        teamId: t.id, teamName: t.name, status: 'rostered',
        rosterIdx: ri,
      });
    });
  }
  for (const t of teams) {
    const keeperSets = [
      { list: 'keepers', entries: t.keepers || [] },
      { list: 'priorKeepers', entries: t.priorKeepers || [] },
    ];
    for (const { list, entries } of keeperSets) {
      entries.forEach((kp, ki) => {
        if (kp.expired) return;
        const key = normalizeName(kp.player);
        if (!key) return;
        // A prior DRAFT record on another team's books doesn't make the player
        // theirs — if someone else's roster has him, that team owns him and
        // this record only supplies his price. A declared keeper is different:
        // it's an explicit commissioner action, so it still wins.
        const rosteredBy = rosterOwner.get(key);
        if (list === 'priorKeepers' && rosteredBy && rosteredBy !== t.id) return;
        const entry = {
          teamId: t.id, teamName: t.name, status: 'keeper',
          keeperList: list, keeperIdx: ki,
        };
        if (kp.tradedTo && teamById.has(kp.tradedTo)) {
          entry.tradedToTeamId = kp.tradedTo;
          entry.tradedToTeamName = teamById.get(kp.tradedTo).name;
        }
        idx.set(key, entry);
      });
    }
  }

  // Apply expired information last.
  for (const [key, ex] of expiredHolders) {
    if (idx.has(key)) {
      const entry = idx.get(key);
      entry.isExpired = true;
      entry.expiredFromTeamName = ex.teamName;
    } else {
      idx.set(key, {
        teamId: ex.teamId, teamName: ex.teamName, status: 'expired',
        isExpired: true,
      });
    }
  }

  return idx;
}
