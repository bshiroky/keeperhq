import React from 'react';
import { Loader } from 'lucide-react';
import { Routes, Route, Navigate, Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import { APP_DATA } from './data.js';
import { HomeView, NewUserEmptyState, LeaguesSkeleton } from './HomeView.jsx';
import { LeagueView } from './LeagueView.jsx';
import { CreateLeagueWizard } from './CreateLeagueWizard.jsx';
import { LandingPage } from './LandingPage.jsx';
import { SharedLeagueRoute } from './SharedLeaguePage.jsx';
import { useTweaks, TweaksPanel, TweakSection, TweakRadio } from './TweaksPanel.jsx';
import { SPORT_CONFIG, makeTheme, tokens, GoogleButton, MOTION_STYLES, Toast } from './components.jsx';
import { supabase } from './lib/supabase.js';
import { fetchLeagues, saveLeague, softDeleteLeague, restoreLeague } from './lib/leagueStore.js';

// Neutral loading placeholder — shown while auth is still resolving (before
// we know whether to show the landing or My Leagues, so there's no known
// destination shape to skeleton yet).
function LoadingState({ isDark }) {
  const t = makeTheme(isDark);
  return (
    <div style={{
      minHeight: 'calc(100vh - 168px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Loader size={28} strokeWidth={1.75} className="kh-spin" color={t.textMuted} />
    </div>
  );
}

// Debounces a raw loading boolean two ways so a loading state never flickers:
// - if the load finishes inside `delay`, it never shows at all (sub-threshold
//   loads read as instant, not a flash);
// - once shown, it stays visible for at least `minDuration` even if the load
//   finishes sooner, so it always reads as a deliberate load, not a flicker.
const LOADING_SHOW_DELAY = 200;
const LOADING_MIN_VISIBLE = 350;

function useDelayedLoading(isLoading, delay = LOADING_SHOW_DELAY, minDuration = LOADING_MIN_VISIBLE) {
  const [show, setShow] = React.useState(false);
  const shownAtRef = React.useRef(null);

  React.useEffect(() => {
    let showTimer, hideTimer;
    if (isLoading) {
      showTimer = setTimeout(() => {
        shownAtRef.current = Date.now();
        setShow(true);
      }, delay);
    } else if (shownAtRef.current) {
      const elapsed = Date.now() - shownAtRef.current;
      hideTimer = setTimeout(() => {
        setShow(false);
        shownAtRef.current = null;
      }, Math.max(0, minDuration - elapsed));
    } else {
      setShow(false);
    }
    return () => { clearTimeout(showTimer); clearTimeout(hideTimer); };
  }, [isLoading, delay, minDuration]);

  return show;
}

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
    return <GoogleButton size="sm" isDark={isDark} onClick={onSignIn} />;
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

// Logged out at "/" gets the front door, not the leagues grid; logged in
// gets My Leagues (or the new-user empty state when the account has zero
// leagues yet). `!authReady` is a brief gap while Supabase resolves the
// existing session; `leaguesLoading` is the further gap while a signed-in
// user's real leagues are being fetched — the demo/localStorage leagues
// never render as "my leagues", not even for a frame. Both loading gaps are
// debounced via useDelayedLoading so a fast resolve shows nothing at all
// instead of a flash, and a slower one holds long enough not to flicker.
function RootRoute({ leagues, deletedLeagues, isDark, session, authReady, leaguesLoading, onSignIn, onRestoreLeague }) {
  const navigate = useNavigate();
  const showAuthLoading = useDelayedLoading(!authReady);
  const showLeaguesLoading = useDelayedLoading(!!session && leaguesLoading);

  // Stay on the loading branch for as long as EITHER the raw flag is still
  // true OR the debounced hold hasn't finished — otherwise the branch below
  // exits the instant the raw flag flips, even mid-hold, and the floor in
  // useDelayedLoading never actually gets to do anything.
  if (!authReady || showAuthLoading) return showAuthLoading ? <LoadingState isDark={isDark} /> : null;

  if (!session) {
    return (
      <LandingPage
        isDark={isDark}
        onSignIn={onSignIn}
        onExploreDemo={() => navigate('/demo')}
      />
    );
  }

  if (leaguesLoading || showLeaguesLoading) {
    return showLeaguesLoading ? <LeaguesSkeleton isDark={isDark} /> : null;
  }

  // Zero active leagues but something in Recently deleted still needs the
  // grid page — that section is the only way back to a deleted league.
  if (leagues.length === 0 && deletedLeagues.length === 0) {
    return (
      <NewUserEmptyState
        isDark={isDark}
        onCreateLeague={() => navigate('/new')}
        onBrowseDemo={() => navigate('/demo')}
      />
    );
  }

  return (
    <HomeView
      leagues={leagues}
      deletedLeagues={deletedLeagues}
      onRestoreLeague={onRestoreLeague}
      onSelectLeague={league => navigate(`/league/${league.id}`)}
      onAddLeague={() => navigate('/new')}
      isDark={isDark}
    />
  );
}

// The demo-browsing grid — the same My-Leagues view + cards, framed with a
// banner and per-card "Demo" badges. Logged-out only; a signed-in user has
// their own leagues at "/", so "/demo" bounces them there. This is the only
// route that ever shows the demo leagues — reachable solely via "Explore
// the demo →", so the banner is never skippable.
function DemoRoute({ leagues, deletedLeagues, isDark, session, authReady, onSignIn, onRestoreLeague }) {
  const navigate = useNavigate();
  const showAuthLoading = useDelayedLoading(!authReady);
  if (!authReady || showAuthLoading) return showAuthLoading ? <LoadingState isDark={isDark} /> : null;
  if (session) return <Navigate to="/" replace />;
  return (
    <HomeView
      leagues={leagues}
      deletedLeagues={deletedLeagues}
      onRestoreLeague={onRestoreLeague}
      onSelectLeague={league => navigate(`/league/${league.id}`)}
      onAddLeague={() => navigate('/new')}
      isDark={isDark}
      demo
      onSignIn={onSignIn}
    />
  );
}

function NewLeagueRoute({ leagues, isDark, session, onCreate }) {
  const navigate = useNavigate();
  // Logged-out entry into the wizard only happens from the demo grid
  // ("+ Add League" on /demo) — cancel should return there, not to the
  // marketing landing that now owns "/" for logged-out visitors.
  return (
    <CreateLeagueWizard
      isDark={isDark}
      existingLeagues={leagues}
      onCreate={league => onCreate(league)}
      onCancel={() => navigate(session ? '/' : '/demo')}
    />
  );
}

// 'players' is intentionally absent — the standalone NHL directory was folded
// into the Set-keepers Eligible Pool ('League' sub-tab), so /players redirects
// to overview. 'import' is the rosters/draft-upload panel; 'draft' is the
// Last Draft full page (the imported prior-year draft + its on-page import).
const VALID_TABS = ['overview', 'import', 'draft', 'payouts', 'picks', 'lottery', 'settings'];

function LeagueRoute({ leagues, isDark, onUpdateLeague, onDeleteLeague }) {
  const { leagueId, tab } = useParams();
  // `leagues` here is the active list — a soft-deleted league's routes fall
  // through to the not-found redirect until it's restored.
  const league = leagues.find(l => l.id === leagueId);

  if (!league) return <Navigate to="/" replace />;
  if (!tab) return <Navigate to="overview" replace />;
  if (!VALID_TABS.includes(tab)) return <Navigate to={`/league/${leagueId}/overview`} replace />;
  if ((tab === 'lottery' || tab === 'picks') && league.draftType !== 'snake') {
    return <Navigate to={`/league/${leagueId}/overview`} replace />;
  }

  return (
    <LeagueView
      league={league}
      isDark={isDark}
      onUpdateLeague={onUpdateLeague}
      onDeleteLeague={onDeleteLeague}
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
  // Distinct from authReady: whether the *leagues for the current identity*
  // have finished loading. Logged-out reads are synchronous (localStorage);
  // a signed-in read is an async Supabase fetch, so this flag keeps the
  // stale demo/localStorage leagues from rendering as "my leagues" while
  // that fetch is in flight.
  const [leaguesLoading, setLeaguesLoading] = React.useState(!!supabase);
  const [signOutToast, setSignOutToast] = React.useState(0);
  const navigate = useNavigate();
  const location = useLocation();

  // League-aware top bar: when we're on a /league/:id route, the bar grows a
  // league name beside the brand mark. The section doors live in the Keepers
  // tab row (LeagueView), not here. Match is read from the URL so the header
  // stays in sync with routing (back/forward, refresh, deep links).
  // Soft delete: the `leagues` state holds every league the current identity
  // owns, including soft-deleted ones (localStorage entries carry a
  // `deletedAt` field; Supabase rows surface their deleted_at column the same
  // way via fetchLeagues). Routes and grids only ever see the active split;
  // the deleted split feeds the "Recently deleted" section on My Leagues.
  const activeLeagues = leagues.filter(l => !l.deletedAt);
  const deletedLeagues = leagues.filter(l => l.deletedAt);

  const leagueMatch = location.pathname.match(/^\/league\/([^/]+)/);
  const currentLeague = leagueMatch ? activeLeagues.find(l => l.id === leagueMatch[1]) : null;

  // The public shared league page (/l/:token) is a standalone member-facing
  // surface: it renders its own header (wordmark + "Shared league page"
  // kicker) and footer, works with no session, and shows identically to
  // logged-out and logged-in visitors — so the app chrome (nav header,
  // tweaks panel) stays out of the way entirely.
  const isSharedRoute = location.pathname.startsWith('/l/');

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
  // leaguesLoading stays true for the whole async fetch so RootRoute never
  // renders the leftover demo/localStorage array as the signed-in user's own.
  React.useEffect(() => {
    if (!authReady) return;
    if (session) {
      setLeaguesLoading(true);
      fetchLeagues(session.user.id)
        .then(data => { setLeagues(data); setLeaguesLoading(false); })
        .catch(e => {
          console.warn('[KeeperHQ] Failed to load leagues from Supabase:', e);
          setLeagues([]);
          setLeaguesLoading(false);
        });
    } else {
      setLeagues(loadLeagues());
      setLeaguesLoading(false);
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

  // Explicitly route back to "/" (now logged out → the landing) rather than
  // leaving the user wherever they were — otherwise sign-out from a league
  // page or /demo strands them on a screen that no longer matches who
  // they're signed in as (and /demo reached this way would skip the
  // "browsing demo leagues" banner).
  function handleSignOut() {
    supabase?.auth.signOut().then(() => {
      navigate('/');
      setSignOutToast(Date.now());
    });
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

  // Soft delete + restore. Local state flips the deletedAt field either way;
  // signed-in identities also persist the flip to the deleted_at column (the
  // shared page RPC stops resolving the token while it's set).
  function handleDeleteLeague(league) {
    const when = new Date().toISOString();
    setLeagues(prev => prev.map(l => (l.id === league.id ? { ...l, deletedAt: when } : l)));
    if (session) {
      softDeleteLeague(league.id, when).catch(e => console.warn('[KeeperHQ] Failed to delete league in Supabase:', e));
    }
    navigate('/');
  }

  function handleRestoreLeague(league) {
    setLeagues(prev => prev.map(l => {
      if (l.id !== league.id) return l;
      const { deletedAt, ...rest } = l;
      return rest;
    }));
    if (session) {
      restoreLeague(league.id).catch(e => console.warn('[KeeperHQ] Failed to restore league in Supabase:', e));
    }
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
      {/* Global — the kh-toast motion classes Toast relies on */}
      <style>{MOTION_STYLES}</style>
      <Toast trigger={signOutToast} message="Signed out" isDark={isDark} />

      {/* Header (hidden on the shared league page, which carries its own) */}
      {!isSharedRoute && <header style={{
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
      </header>}

      {/* Main content */}
      <main style={{ padding: isSharedRoute ? 0 : '16px 0 40px' }}>
        <Routes>
          <Route path="/l/:token" element={<SharedLeagueRoute isDark={isDark} />} />
          <Route path="/" element={<RootRoute leagues={activeLeagues} deletedLeagues={deletedLeagues} isDark={isDark} session={session} authReady={authReady} leaguesLoading={leaguesLoading} onSignIn={handleSignIn} onRestoreLeague={handleRestoreLeague} />} />
          <Route path="/demo" element={<DemoRoute leagues={activeLeagues} deletedLeagues={deletedLeagues} isDark={isDark} session={session} authReady={authReady} onSignIn={handleSignIn} onRestoreLeague={handleRestoreLeague} />} />
          {/* NewLeagueRoute gets the FULL list (incl. soft-deleted) so a new
              league's slug can't collide with a deleted league's id. */}
          <Route path="/new" element={<NewLeagueRoute leagues={leagues} isDark={isDark} session={session} onCreate={handleAddLeague} />} />
          <Route path="/league/:leagueId" element={<LeagueRoute leagues={activeLeagues} isDark={isDark} onUpdateLeague={handleUpdateLeague} onDeleteLeague={handleDeleteLeague} />} />
          <Route path="/league/:leagueId/:tab" element={<LeagueRoute leagues={activeLeagues} isDark={isDark} onUpdateLeague={handleUpdateLeague} onDeleteLeague={handleDeleteLeague} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Tweaks Panel (dev affordance — not shown on the public shared page) */}
      {!isSharedRoute && <TweaksPanel>
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
      </TweaksPanel>}
    </div>
  );
}

export default App;
