import React from 'react';
import { makeTheme } from './components.jsx';
import { loadPlayers, normalizeName, buildStatusIndex } from './lib/players.js';
import { isNflSport } from './lib/nflDirectory.js';
import { searchDirectory } from './lib/nflDirectoryStore.js';

// Autocomplete text input backed by the player directory for the league's sport.
// Falls back to a plain input if the directory isn't available (e.g. sports not
// yet supported, or the JSON failed to load).
//
// Optional props:
// - league: if given, suggestions show keeper / rostered status from this
//   league and any player that's already a keeper is grayed + non-selectable.
// - disabledNames: extra Set of normalized names to disable (e.g. other slots
//   in a multi-row editor that aren't saved yet).
export function PlayerAutocomplete({ value, onChange, sport, isDark, placeholder, inputStyle, autoFocus, league, disabledNames }) {
  const t = makeTheme(isDark);
  const [players, setPlayers] = React.useState(null);
  const [open, setOpen] = React.useState(false);
  const [focused, setFocused] = React.useState(-1);
  const containerRef = React.useRef(null);

  // Two directory sources, one input. Hockey ships as a build-time JSON blob
  // that's filtered locally; NFL lives in Supabase and is queried per
  // keystroke (11k rows is too many to ship to the browser, and the query is
  // indexed). Everything else has no directory and falls back to a plain
  // input.
  const nfl = isNflSport(sport);
  const nhl = sport === 'hockey' || sport === 'nhl';
  const supported = nfl || nhl;
  const [remote, setRemote] = React.useState([]);

  React.useEffect(() => {
    if (!nhl) return;
    let cancelled = false;
    loadPlayers('nhl')
      .then(d => { if (!cancelled) setPlayers(d.players || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [nhl]);

  // NFL: debounced remote search. Rows are mapped into the same shape the
  // hockey directory uses ({id, name, pos, team}) so the suggestion list and
  // the status lookup below stay one code path; `playerId` rides along for
  // callers that store the resolved identity.
  React.useEffect(() => {
    if (!nfl) return;
    const q = value || '';
    if (normalizeName(q).length < 2) { setRemote([]); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchDirectory(q, 8)
        .then(rows => {
          if (cancelled) return;
          setRemote(rows.map(r => ({
            id: r.player_id, playerId: r.player_id,
            name: r.full_name || [r.first_name, r.last_name].filter(Boolean).join(' '),
            pos: r.pos || '', team: r.team || '', status: r.status,
          })));
        })
        .catch(() => { if (!cancelled) setRemote([]); });
    }, 180);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [nfl, value]);

  React.useEffect(() => {
    function onDoc(e) {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const statusIndex = React.useMemo(() => league ? buildStatusIndex(league) : null, [league]);

  function metaFor(p) {
    const key = normalizeName(p.name);
    const entry = statusIndex?.get(key);
    // Disabling is fully driven by the caller: it knows which names to allow
    // (e.g. the slot's own previous value when editing).
    const isDisabled = !!(disabledNames && disabledNames.has(key));
    let statusLabel = null;
    if (entry?.status === 'keeper') statusLabel = `Keeper · ${entry.teamName}`;
    else if (entry?.status === 'rostered') statusLabel = entry.teamName;
    return { isDisabled, statusLabel };
  }

  const suggestions = React.useMemo(() => {
    if (nfl) return remote;
    if (!players || !value || value.length < 2) return [];
    const q = normalizeName(value);
    const out = [];
    for (const p of players) {
      if (normalizeName(p.name).includes(q)) {
        out.push(p);
        if (out.length >= 8) break;
      }
    }
    return out;
  }, [players, value, nfl, remote]);

  function selectSuggestion(p) {
    const { isDisabled } = metaFor(p);
    if (isDisabled) return;
    onChange(p.name, p);
    setOpen(false);
    setFocused(-1);
  }

  function handleKey(e) {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(i => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocused(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && focused >= 0) { e.preventDefault(); selectSuggestion(suggestions[focused]); }
    else if (e.key === 'Escape') { setOpen(false); setFocused(-1); }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={value || ''}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={e => { onChange(e.target.value); setOpen(true); setFocused(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKey}
        style={inputStyle}
        autoComplete="off"
      />
      {supported && open && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 2, zIndex: 30,
          background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 6,
          boxShadow: '0 6px 20px rgba(0,0,0,0.18)', maxHeight: 280, overflowY: 'auto',
        }}>
          {suggestions.map((p, i) => {
            const { isDisabled, statusLabel } = metaFor(p);
            return (
              <div key={p.id}
                onMouseDown={e => { e.preventDefault(); if (!isDisabled) selectSuggestion(p); }}
                onMouseEnter={() => !isDisabled && setFocused(i)}
                style={{
                  padding: '6px 10px', fontSize: 12,
                  background: i === focused && !isDisabled ? t.sectionBg : 'transparent',
                  cursor: isDisabled ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8,
                  opacity: isDisabled ? 0.5 : 1,
                }}
              >
                <span style={{
                  color: t.textPrimary, fontWeight: 600, flex: 1, minWidth: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  textDecoration: isDisabled ? 'line-through' : 'none',
                }}>{p.name}</span>
                <span style={{ fontSize: 10, color: t.textMuted, flexShrink: 0 }}>{p.pos} · {p.team || '—'}</span>
                {statusLabel && (
                  <span style={{ fontSize: 10, color: '#9d8cf0', fontWeight: 700, flexShrink: 0 }}>{statusLabel}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Map NHL position codes ('C','L','R','D','G') to roster position labels used
// throughout the app ('C','LW','RW','D','G').
export function posForRoster(nhlPos) {
  if (nhlPos === 'L') return 'LW';
  if (nhlPos === 'R') return 'RW';
  return nhlPos || '';
}
