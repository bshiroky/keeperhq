import React from 'react';
import { Routes, Route, Navigate, Link, useLocation, useParams, useNavigate } from 'react-router-dom';
import { APP_DATA } from './data.js';
import { HomeView } from './HomeView.jsx';
import { LeagueView } from './LeagueView.jsx';
import { useTweaks, TweaksPanel, TweakSection, TweakRadio } from './TweaksPanel.jsx';

// Root App + Tweaks

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light"
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

function PageTitleBar({ leagues, isDark, textPrimary, textSecondary, headerBorder }) {
  const location = useLocation();
  const leagueMatch = location.pathname.match(/^\/league\/([^/]+)/);
  const league = leagueMatch ? leagues.find(l => l.id === leagueMatch[1]) : null;

  return (
    <div style={{ background: isDark ? '#111520' : '#e8edf5', borderBottom: `1px solid ${headerBorder}`, padding: '8px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        {!league && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: textPrimary, letterSpacing: '-0.01em' }}>My Leagues</h2>
            <p style={{ margin: 0, fontSize: '12px', color: textSecondary }}>Overview of all your keeper leagues</p>
          </div>
        )}
        {league && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
            <Link to="/" style={{ background: 'none', border: 'none', cursor: 'pointer', color: textSecondary, fontSize: '12px', fontWeight: 600, padding: 0, textDecoration: 'none' }}>Leagues</Link>
            <span style={{ color: textSecondary, fontSize: '12px' }}>/</span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: textPrimary }}>{league.name}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function HomeRoute({ leagues, isDark }) {
  const navigate = useNavigate();
  return (
    <HomeView
      leagues={leagues}
      onSelectLeague={league => navigate(`/league/${league.id}`)}
      onAddLeague={() => alert('Add League flow coming soon!')}
      isDark={isDark}
    />
  );
}

const VALID_TABS = ['overview', 'lottery', 'players', 'payouts', 'settings'];

function LeagueRoute({ leagues, isDark, onUpdateLeague }) {
  const { leagueId, tab } = useParams();
  const league = leagues.find(l => l.id === leagueId);

  if (!league) return <Navigate to="/" replace />;
  if (!tab) return <Navigate to="overview" replace />;
  if (!VALID_TABS.includes(tab)) return <Navigate to={`/league/${leagueId}/overview`} replace />;
  if (tab === 'lottery' && league.draftType !== 'snake') {
    return <Navigate to={`/league/${leagueId}/overview`} replace />;
  }

  return (
    <LeagueView
      league={league}
      isDark={isDark}
      onUpdateLeague={onUpdateLeague}
      activeTab={tab}
    />
  );
}

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [leagues, setLeagues] = React.useState(loadLeagues);
  const navigate = useNavigate();

  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(leagues));
    } catch (e) {
      console.warn('[KeeperHQ] Failed to persist leagues to localStorage:', e);
    }
  }, [leagues]);

  const theme = tweaks.theme || 'light';
  const isDark = theme === 'dark';

  const bg = isDark ? '#0d0f14' : '#f0f3f8';
  const headerBg = isDark ? '#161a22' : '#ffffff';
  const headerBorder = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)';
  const textPrimary = isDark ? '#e8ecf4' : '#1a1f2e';
  const textSecondary = isDark ? '#6b7489' : '#6b7489';

  function handleUpdateLeague(updated) {
    setLeagues(prev => prev.map(l => (l.id === updated.id ? updated : l)));
  }

  function handleResetData() {
    if (confirm('Reset all league data back to the demo defaults? This clears anything you\'ve changed.')) {
      localStorage.removeItem(STORAGE_KEY);
      setLeagues(APP_DATA.leagues);
      navigate('/');
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
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <Link
            to="/"
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit', textDecoration: 'none' }}
            title="Home"
          >
            <img className="kh-nav-icon" src="/keeper-hq-logo.png" alt="KeeperHQ" height={32}
              style={{ height: 32, width: 'auto', display: 'none', imageRendering: 'pixelated' }} />
            <span className="kh-nav-wordmark" style={{
              fontSize: 24, fontWeight: 800, letterSpacing: '0.02em',
              color: textPrimary, lineHeight: 1,
            }}>
              KEEPER<span style={{ color: '#3ca96b', marginLeft: 4 }}>HQ</span>
            </span>
          </Link>

          <AccountMenu isDark={isDark} />
        </div>
        <style>{`
          @media (max-width: 640px) {
            .kh-nav-wordmark { display: none !important; }
            .kh-nav-icon { display: block !important; }
          }
        `}</style>
      </header>

      <PageTitleBar
        leagues={leagues}
        isDark={isDark}
        textPrimary={textPrimary}
        textSecondary={textSecondary}
        headerBorder={headerBorder}
      />

      {/* Main content */}
      <main style={{ padding: '16px 0 40px' }}>
        <Routes>
          <Route path="/" element={<HomeRoute leagues={leagues} isDark={isDark} />} />
          <Route path="/league/:leagueId" element={<LeagueRoute leagues={leagues} isDark={isDark} onUpdateLeague={handleUpdateLeague} />} />
          <Route path="/league/:leagueId/:tab" element={<LeagueRoute leagues={leagues} isDark={isDark} onUpdateLeague={handleUpdateLeague} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
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
