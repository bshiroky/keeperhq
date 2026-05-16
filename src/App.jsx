import React from 'react';
import { APP_DATA } from './data.js';
import { HomeView } from './HomeView.jsx';
import { LeagueView } from './LeagueView.jsx';
import { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle } from './TweaksPanel.jsx';

// Root App + Tweaks

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "sportColors": true,
  "cardStyle": "detailed"
}/*EDITMODE-END*/;

function AccountMenu({ isDark }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    function onClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const menuBg = isDark ? '#1c2130' : '#ffffff';
  const menuBorder = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)';
  const itemColor = isDark ? '#e8ecf4' : '#1a1f2e';
  const itemHoverBg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(59,138,230,0.2)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: '#3b8ae6', fontFamily: 'inherit' }}
        title="Account"
      >
        C
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 180, background: menuBg, border: `1px solid ${menuBorder}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', overflow: 'hidden', zIndex: 200 }}>
          {[
            { label: 'Account settings', onClick: () => alert('Account settings coming soon.') },
            { label: 'Sign out', onClick: () => alert('Sign out coming soon (no login yet).') },
          ].map((item, i, arr) => (
            <button
              key={item.label}
              onClick={() => { item.onClick(); setOpen(false); }}
              onMouseEnter={e => { e.currentTarget.style.background = itemHoverBg; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: '10px 14px', fontSize: '13px', fontWeight: 500, color: itemColor, cursor: 'pointer', fontFamily: 'inherit', borderBottom: i < arr.length - 1 ? `1px solid ${menuBorder}` : 'none' }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Persistence: keep league data in localStorage so test edits survive a refresh.
// Replace this with a real backend later.
const STORAGE_KEY = 'keeperhq:leagues:v1';

function loadLeagues() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('[KeeperHQ] Failed to read leagues from localStorage:', e);
  }
  return APP_DATA.leagues;
}

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [leagues, setLeagues] = React.useState(loadLeagues);

  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(leagues));
    } catch (e) {
      console.warn('[KeeperHQ] Failed to persist leagues to localStorage:', e);
    }
  }, [leagues]);
  const [selectedLeague, setSelectedLeague] = React.useState(null);
  const [view, setView] = React.useState('home'); // 'home' | 'league'

  const theme = tweaks.theme || 'light';
  const isDark = theme === 'dark';

  const bg = isDark ? '#0d0f14' : '#f0f3f8';
  const headerBg = isDark ? '#161a22' : '#ffffff';
  const headerBorder = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)';
  const textPrimary = isDark ? '#e8ecf4' : '#1a1f2e';
  const textSecondary = isDark ? '#6b7489' : '#6b7489';

  function handleSelectLeague(league) {
    setSelectedLeague(league);
    setView('league');
  }

  function handleBack() {
    setView('home');
    setSelectedLeague(null);
  }

  function handleAddLeague() {
    alert('Add League flow coming soon!');
  }

  function handleUpdateLeague(updated) {
    setLeagues(prev => prev.map(l => (l.id === updated.id ? updated : l)));
    setSelectedLeague(updated);
  }

  function handleResetData() {
    if (confirm('Reset all league data back to the demo defaults? This clears anything you\'ve changed.')) {
      localStorage.removeItem(STORAGE_KEY);
      setLeagues(APP_DATA.leagues);
      setSelectedLeague(null);
      setView('home');
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: bg, fontFamily: "'Space Grotesk', sans-serif", color: textPrimary, transition: 'background 0.2s' }}>

      {/* Header */}
      <header style={{
        background: headerBg,
        borderBottom: `1px solid ${headerBorder}`,
        padding: '0 24px',
        position: 'sticky', top: 0, zIndex: 100,
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 48 }}>
          <button
            onClick={handleBack}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit' }}
            title="Home"
          >
            <img src="/keeper-hq-logo.png" alt="KeeperHQ" height={44}
              style={{ height: 44, width: 'auto', display: 'block', imageRendering: 'pixelated' }} />
            <div style={{ fontSize: '10px', color: textSecondary, letterSpacing: '0.08em', fontWeight: 600, textTransform: 'uppercase' }}>Commissioner</div>
          </button>

          <AccountMenu isDark={isDark} />
        </div>
      </header>

      {/* Page title bar */}
      <div style={{ background: isDark ? '#111520' : '#e8edf5', borderBottom: `1px solid ${headerBorder}`, padding: '8px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          {view === 'home' && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: textPrimary, letterSpacing: '-0.01em' }}>My Leagues</h2>
              <p style={{ margin: 0, fontSize: '12px', color: textSecondary }}>Overview of all your keeper leagues</p>
            </div>
          )}
          {view === 'league' && selectedLeague && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
              <button onClick={handleBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: textSecondary, fontSize: '12px', fontWeight: 600, padding: 0 }}>Leagues</button>
              <span style={{ color: textSecondary, fontSize: '12px' }}>/</span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: textPrimary }}>{selectedLeague.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <main style={{ padding: '16px 0 40px' }}>
        {view === 'home' && (
          <HomeView
            leagues={leagues}
            onSelectLeague={handleSelectLeague}
            onAddLeague={handleAddLeague}
            sportColors={tweaks.sportColors}
            isDark={isDark}
          />
        )}
        {view === 'league' && selectedLeague && (
          <LeagueView
            league={selectedLeague}
            onBack={handleBack}
            isDark={isDark}
            onUpdateLeague={handleUpdateLeague}
          />
        )}
      </main>

      {/* Tweaks Panel */}
      <TweaksPanel>
        <TweakSection label="Appearance">
          <TweakRadio
            label="Color Mode"
            value={tweaks.theme}
            options={[{value:'dark',label:'Dark'},{value:'light',label:'Light'}]}
            onChange={v => setTweak('theme', v)}
          />
          <TweakToggle
            label="Sport accent colors"
            value={tweaks.sportColors}
            onChange={v => setTweak('sportColors', v)}
          />
        </TweakSection>
        <TweakSection label="Layout">
          <TweakRadio
            label="Card density"
            value={tweaks.cardStyle}
            options={[{value:'detailed',label:'Detailed'},{value:'compact',label:'Compact'}]}
            onChange={v => setTweak('cardStyle', v)}
          />
        </TweakSection>
        <TweakSection label="Data">
          <button
            onClick={handleResetData}
            style={{ background: 'rgba(232,82,82,0.15)', color: '#e85252', border: '1px solid rgba(232,82,82,0.3)', borderRadius: 6, padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Reset to demo data
          </button>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

export default App;
