const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const memCache = {};

export async function loadPlayers(sport) {
  if (memCache[sport]) return memCache[sport];
  const key = `khq_players_${sport}_v1`;

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

// Build a name → {teamName, status} map from the league. Status priority:
// keeper > rostered > available. Keeper covers both current-season keepers
// and active (non-expired) prior keeper contracts.
export function buildStatusIndex(league) {
  const idx = new Map();
  const teams = league.teams || [];

  for (const t of teams) {
    for (const r of (t.roster || [])) {
      const k = normalizeName(r.player);
      if (k && !idx.has(k)) idx.set(k, { teamName: t.name, status: 'rostered' });
    }
  }
  for (const t of teams) {
    for (const k of (t.keepers || [])) {
      const key = normalizeName(k.player);
      if (key) idx.set(key, { teamName: t.name, status: 'keeper' });
    }
    for (const pk of (t.priorKeepers || [])) {
      if (pk.expired) continue;
      const key = normalizeName(pk.player);
      if (key) idx.set(key, { teamName: t.name, status: 'keeper' });
    }
  }
  return idx;
}
