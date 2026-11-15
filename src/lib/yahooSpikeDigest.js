// Yahoo discovery spike — trims a full dump to something small enough to hand
// back in a conversation. Pure (runs in the browser and in node tests).
//
// Every collection keeps its first `keep` entries plus a note of how many were
// dropped, so every SHAPE Yahoo returned survives while the bulk doesn't. The
// spike's own `derived` summaries, step log and fetch log are kept whole —
// they are small and they are the point.

const WHOLE = new Set(['steps', 'startSteps', 'fetchLog', 'derived', 'leagueIndex', 'renewChain', 'notes', 'token', 'request', 'endpoints']);
const isIndex = k => /^\d+$/.test(k);

export function digestValue(value, keep = 2) {
  if (typeof value === 'string') return value.length > 400 ? `${value.slice(0, 400)}… [${value.length} chars]` : value;
  if (Array.isArray(value)) {
    const out = value.slice(0, keep).map(v => digestValue(v, keep));
    if (value.length > keep) out.push(`[digest: ${value.length - keep} more of ${value.length} omitted]`);
    return out;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    const indexed = keys.filter(isIndex);
    // Yahoo's collections are objects keyed "0","1",… plus "count".
    const trim = indexed.length > keep && indexed.length >= keys.length - 1;
    const out = {};
    let kept = 0;
    for (const k of keys) {
      if (trim && isIndex(k) && kept++ >= keep) continue;
      out[k] = digestValue(value[k], keep);
    }
    if (trim) out.__digest = `${indexed.length - keep} more of ${indexed.length} omitted`;
    return out;
  }
  return value;
}

export function digestDump(dump, keep = 2) {
  const walk = node => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== 'object') return node;
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (WHOLE.has(k)) out[k] = v;
      else if (k === 'data') out[k] = digestValue(v, keep);
      else out[k] = walk(v);
    }
    return out;
  };
  return { ...walk(dump), digest: `Trimmed copy: each Yahoo collection keeps its first ${keep} entries. The full file has everything.` };
}
