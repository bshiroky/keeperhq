const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const memCache = {};

export async function loadPlayers(sport) {
  if (memCache[sport]) return memCache[sport];
  const key = `khq_players_${sport}_v3`;

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
// priority: keeper > rostered > available. For keepers, tracks whether the
// entry came from the current-season `keepers` list or historical
// `priorKeepers`, plus the index for downstream mutations. If the keeper has
// been traded, exposes the destination team too.
export function buildStatusIndex(league) {
  const idx = new Map();
  const teams = league.teams || [];
  const teamById = new Map(teams.map(t => [t.id, t]));

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
  return idx;
}
