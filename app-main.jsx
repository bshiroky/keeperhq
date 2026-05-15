// Root App + Tweaks

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "sportColors": true,
  "cardStyle": "detailed"
}/*EDITMODE-END*/;

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [leagues, setLeagues] = React.useState(window.APP_DATA.leagues);
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #3b8ae6, #6b4de6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🏆</div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: textPrimary, letterSpacing: '-0.02em', lineHeight: 1 }}>KeeperHQ</div>
              <div style={{ fontSize: '10px', color: textSecondary, letterSpacing: '0.08em', fontWeight: 600, textTransform: 'uppercase' }}>Commissioner</div>
            </div>
          </div>

          <nav style={{ display: 'flex', gap: 4 }}>
            {['home'].map(v => (
              <button key={v} onClick={() => { setView(v); setSelectedLeague(null); }} style={{
                background: view === v ? 'rgba(59,138,230,0.15)' : 'none',
                border: 'none', borderRadius: 8, padding: '6px 14px',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                color: view === v ? '#3b8ae6' : textSecondary,
              }}>
                Leagues
              </button>
            ))}
            <button style={{ background: 'none', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: textSecondary, opacity: 0.4 }}>Standings</button>
            <button style={{ background: 'none', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: textSecondary, opacity: 0.4 }}>Settings</button>
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: '12px', color: textSecondary, fontWeight: 600 }}>2026-27 Season</div>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(59,138,230,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: '#3b8ae6' }}>C</div>
          </div>
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
      </TweaksPanel>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
