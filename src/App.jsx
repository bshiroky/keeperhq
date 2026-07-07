import React from 'react';
import { Routes, Route, Navigate, Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import { APP_DATA } from './data.js';
import { HomeView } from './HomeView.jsx';
import { LeagueView } from './LeagueView.jsx';
import { CreateLeagueWizard } from './CreateLeagueWizard.jsx';
import { useTweaks, TweaksPanel, TweakSection, TweakRadio } from './TweaksPanel.jsx';
import { SPORT_CONFIG, makeTheme, tokens } from './components.jsx';
import { supabase } from './lib/supabase.js';
import { fetchLeagues, saveLeague } from './lib/leagueStore.js';

// Root App + Tweaks

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light"
}/*EDITMODE-END*/;

function AccountMenu({ isDark, session, onSignIn, onSignOut }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  const t = makeTheme(isDark);

  React.useEffect(() => {
    if (!open) return;
    function onClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (!session) {
    return (
      <button
        onClick={onSignIn}
        style={{ ...tokens.typeBody, fontWeight: 600, color: tokens.info, background: tokens.infoBg, border: `1px solid ${tokens.infoBorder}`, borderRadius: tokens.radiusMd, padding: `${tokens.spaceXs}px ${tokens.spaceSm}px`, cursor: 'pointer', fontFamily: 'inherit' }}
      >
        Sign in with Google
      </button>
    );
  }

  const email = session.user?.email || '';
  const initial = email[0]?.toUpperCase() || '?';

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: 32, height: 32, borderRadius: '50%', background: tokens.infoBg, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: tokens.info, fontFamily: 'inherit' }}
        title={email}
      >
        {initial}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 200, background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: tokens.radiusMd, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', overflow: 'hidden', zIndex: 200 }}>
          <div style={{ ...tokens.typeBodyMeta, color: t.textMuted, padding: '10px 14px', borderBottom: `1px solid ${t.border}`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {email}
          </div>
          <button
            onClick={() => { setOpen(false); onSignOut(); }}
            onMouseEnter={e => { e.currentTarget.style.background = t.sectionBg; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: '10px 14px', ...tokens.typeBody, fontWeight: 500, color: t.textPrimary, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Sign out
          </button>
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

function HomeRoute({ leagues, isDark }) {
  const navigate = useNavigate();
  return (
    <HomeView
      leagues={leagues}
      onSelectLeague={league => navigate(`/league/${league.id}`)}
      onAddLeague={() => navigate('/new')}
      isDark={isDark}
    />
  );
}

function NewLeagueRoute({ leagues, isDark, onCreate }) {
  const navigate = useNavigate();
  return (
    <CreateLeagueWizard
      isDark={isDark}
      existingLeagues={leagues}
      onCreate={league => onCreate(league)}
      onCancel={() => navigate('/')}
    />
  );
}

// 'players' is intentionally absent — the standalone NHL directory was folded
// into the Set-keepers Eligible Pool ('League' sub-tab), so /players redirects
// to overview. 'import' is the new rosters/draft-upload panel.
const VALID_TABS = ['overview', 'import', 'payouts', 'lottery', 'settings'];

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
  const [session, setSession] = React.useState(null);
  // No Supabase configured (e.g. this container) means we're always logged out.
  const [authReady, setAuthReady] = React.useState(!supabase);
  const navigate = useNavigate();
  const location = useLocation();

  // League-aware top bar: when we're on a /league/:id route, the bar grows a
  // league name beside the brand mark. The section doors live in the Keepers
  // tab row (LeagueView), not here. Match is read from the URL so the header
  // stays in sync with routing (back/forward, refresh, deep links).
  const leagueMatch = location.pathname.match(/^\/league\/([^/]+)/);
  const currentLeague = leagueMatch ? leagues.find(l => l.id === leagueMatch[1]) : null;

  React.useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Source of truth switches with auth state: logged out reads the demo/
  // localStorage leagues, logged in reads (and owns) the user's Supabase rows.
  React.useEffect(() => {
    if (!authReady) return;
    if (session) {
      fetchLeagues(session.user.id)
        .then(setLeagues)
        .catch(e => console.warn('[KeeperHQ] Failed to load leagues from Supabase:', e));
    } else {
      setLeagues(loadLeagues());
    }
  }, [session, authReady]);

  React.useEffect(() => {
    if (session) return; // Supabase is the store while logged in
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(leagues));
    } catch (e) {
      console.warn('[KeeperHQ] Failed to persist leagues to localStorage:', e);
    }
  }, [leagues, session]);

  function handleSignIn() {
    supabase?.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
  }

  function handleSignOut() {
    supabase?.auth.signOut();
  }

  const theme = tweaks.theme || 'light';
  const isDark = theme === 'dark';

  const bg = isDark ? '#0d0f14' : '#f0f3f8';
  const headerBg = isDark ? '#161a22' : '#ffffff';
  const headerBorder = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)';
  const textPrimary = isDark ? '#e8ecf4' : '#1a1f2e';

  function handleUpdateLeague(updated) {
    setLeagues(prev => prev.map(l => (l.id === updated.id ? updated : l)));
    if (session) {
      saveLeague(session.user.id, updated).catch(e => console.warn('[KeeperHQ] Failed to save league to Supabase:', e));
    }
  }

  function handleAddLeague(league) {
    setLeagues(prev => [...prev, league]);
    if (session) {
      saveLeague(session.user.id, league).catch(e => console.warn('[KeeperHQ] Failed to save league to Supabase:', e));
    }
    navigate(`/league/${league.id}/overview`);
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
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64, gap: 16 }}>
          {/* Left: brand mark + (on a league) the league name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <Link
              to="/"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit', textDecoration: 'none', flexShrink: 0 }}
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
            {currentLeague && (
              <>
                <span style={{ width: 1, height: 22, background: headerBorder, flexShrink: 0 }} />
                <span className="kh-nav-league" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: (SPORT_CONFIG[currentLeague.sport] || SPORT_CONFIG.hockey).color, flexShrink: 0 }} />
                  <span style={{ fontSize: 15, fontWeight: 700, color: textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentLeague.name}</span>
                </span>
              </>
            )}
          </div>

          {/* Right: account (section doors live in the Keepers tab row) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <AccountMenu isDark={isDark} session={session} onSignIn={handleSignIn} onSignOut={handleSignOut} />
          </div>
        </div>
        <style>{`
          @media (max-width: 640px) {
            .kh-nav-wordmark { display: none !important; }
            .kh-nav-icon { display: block !important; }
          }
          @keyframes kh-spin { to { transform: rotate(360deg); } }
          .kh-spin { animation: kh-spin 1s linear infinite; transform-origin: center; }
        `}</style>
      </header>

      {/* Main content */}
      <main style={{ padding: '16px 0 40px' }}>
        <Routes>
          <Route path="/" element={<HomeRoute leagues={leagues} isDark={isDark} />} />
          <Route path="/new" element={<NewLeagueRoute leagues={leagues} isDark={isDark} onCreate={handleAddLeague} />} />
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
        {!session && (
          <TweakSection label="Data">
            <button
              onClick={handleResetData}
              style={{ background: 'rgba(232,82,82,0.15)', color: '#e85252', border: '1px solid rgba(232,82,82,0.3)', borderRadius: 6, padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Reset to demo data
            </button>
          </TweakSection>
        )}
      </TweaksPanel>
    </div>
  );
}

export default App;
