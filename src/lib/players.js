const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const memCache = {};

export async function loadPlayers(sport) {
  if (memCache[sport]) return memCache[sport];
  // v4: record shape grew ppg/ppa (skaters) + saves (goalies). Bumping the key
  // forces a refetch so stat columns don't sit empty for a cache-TTL window
  // after a deploy changes the directory schema.
  const key = `khq_players_${sport}_v4`;
  try { localStorage.removeItem(`khq_players_${sport}_v3`); } catch {}

  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      const age = Date.now() - new Date(parsed.cachedAt).getTime();
      if (age < CACHE_TTL_MS && parsed.data) {
        memCache[sport] = parsed.data;
        return parsed.data;
      }
    }
  } catch {}

  const res = await fetch(`/players-${sport}.json`);
  if (!res.ok) throw new Error(`Player data unavailable for ${sport}`);
  const data = await res.json();
  memCache[sport] = data;
  try {
    localStorage.setItem(key, JSON.stringify({ cachedAt: new Date().toISOString(), data }));
  } catch {
    // Quota exceeded or storage disabled — memory cache still works.
  }
  return data;
}

export function normalizeName(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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

  for (const t of teams) {
    (t.roster || []).forEach((r, ri) => {
      const k = normalizeName(r.player);
      if (k && !idx.has(k)) idx.set(k, {
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
