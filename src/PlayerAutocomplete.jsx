import React from 'react';
import { makeTheme } from './components.jsx';
import { loadPlayers, normalizeName } from './lib/players.js';

// Autocomplete text input backed by the player directory for the league's sport.
// Falls back to a plain input if the directory isn't available (e.g. sports not
// yet supported, or the JSON failed to load).
export function PlayerAutocomplete({ value, onChange, sport, isDark, placeholder, inputStyle, autoFocus }) {
  const t = makeTheme(isDark);
  const [players, setPlayers] = React.useState(null);
  const [open, setOpen] = React.useState(false);
  const [focused, setFocused] = React.useState(-1);
  const containerRef = React.useRef(null);

  const supported = sport === 'hockey' || sport === 'nhl';

  React.useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    loadPlayers('nhl')
      .then(d => { if (!cancelled) setPlayers(d.players || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [supported]);

  React.useEffect(() => {
    function onDoc(e) {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const suggestions = React.useMemo(() => {
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
  }, [players, value]);

  function selectSuggestion(p) {
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
          {suggestions.map((p, i) => (
            <div key={p.id}
              onMouseDown={e => { e.preventDefault(); selectSuggestion(p); }}
              onMouseEnter={() => setFocused(i)}
              style={{
                padding: '6px 10px', fontSize: 12,
                background: i === focused ? t.sectionBg : 'transparent',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <span style={{ color: t.textPrimary, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
              <span style={{ fontSize: 10, color: t.textMuted, flexShrink: 0 }}>{p.pos} · {p.team || '—'}</span>
            </div>
          ))}
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
