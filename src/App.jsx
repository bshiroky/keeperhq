import React from 'react';
import { Routes, Route, Navigate, Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import { Upload, DollarSign, Ticket, Settings as SettingsIcon, LayoutGrid } from 'lucide-react';
import { APP_DATA } from './data.js';
import { HomeView } from './HomeView.jsx';
import { LeagueView } from './LeagueView.jsx';
import { CreateLeagueWizard } from './CreateLeagueWizard.jsx';
import { useTweaks, TweaksPanel, TweakSection, TweakRadio } from './TweaksPanel.jsx';
import { makeTheme, tokens, SPORT_CONFIG } from './components.jsx';

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

// Section doors — the supporting surfaces reached from the league top bar
// (Import / Pool / Lottery / Settings). Lottery is snake-only, mirroring the
// route gate in LeagueRoute. They render as <Link>s so deep-linking and
// refresh-to-panel keep working; the matching panel is drawn by LeagueView.
function sectionDoorsFor(league) {
  return [
    { id: 'import',   label: 'Import',   Icon: Upload },
    { id: 'payouts',  label: 'Pool',     Icon: DollarSign },
    ...(league.draftType === 'snake' ? [{ id: 'lottery', label: 'Lottery', Icon: Ticket }] : []),
    { id: 'settings', label: 'Settings', Icon: SettingsIcon },
  ];
}

function SectionDoors({ league, currentSection, isDark, layout = 'top' }) {
  const t = makeTheme(isDark);
  const accent = (SPORT_CONFIG[league.sport] || SPORT_CONFIG.hockey).color;
  const base = `/league/${league.id}`;

  if (layout === 'bottom') {
    // Mobile bottom tab bar: Keepers home + the section doors.
    const items = [{ id: 'overview', label: 'Keepers', Icon: LayoutGrid }, ...sectionDoorsFor(league)];
    return (
      <nav className="kh-bottom-bar" style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 100,
        display: 'none', alignItems: 'stretch', justifyContent: 'space-around',
        background: isDark ? '#161a22' : '#ffffff',
        borderTop: `1px solid ${t.border}`,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {items.map(d => {
          const active = currentSection === d.id;
          return (
            <Link key={d.id} to={`${base}/${d.id}`} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
              padding: '8px 4px', textDecoration: 'none',
              color: active ? accent : t.textMuted,
            }}>
              <d.Icon size={20} strokeWidth={active ? 2.25 : 1.75} />
              <span style={{ ...tokens.typePill, fontSize: 10 }}>{d.label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  // Top bar (desktop): a row of pill buttons by the account avatar. Clicking the
  // active door again closes its panel by routing back to the Keepers home.
  return (
    <div className="kh-top-doors" style={{ display: 'flex', alignItems: 'center', gap: tokens.space2xs }}>
      {sectionDoorsFor(league).map(d => {
        const active = currentSection === d.id;
        return (
          <Link key={d.id} to={active ? `${base}/overview` : `${base}/${d.id}`} title={d.label}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: tokens.radiusPill,
              ...tokens.typePill,
              textDecoration: 'none', whiteSpace: 'nowrap',
              background: active ? `${accent}1f` : 'transparent',
              border: `1px solid ${active ? `${accent}55` : 'transparent'}`,
              color: active ? accent : t.textSecondary,
              transition: 'background 0.15s, color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { if (!active) { e.currentTarget.style.background = t.sectionBg; e.currentTarget.style.color = t.textPrimary; } }}
            onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = t.textSecondary; } }}
          >
            <d.Icon size={15} strokeWidth={1.75} />
            <span className="kh-door-label">{d.label}</span>
          </Link>
        );
      })}
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
  const navigate = useNavigate();
  const location = useLocation();

  // League-aware top bar: when we're on a /league/:id/:section route, the bar
  // grows a league name + the section doors. The match is read from the URL so
  // the header stays in sync with routing (back/forward, refresh, deep links).
  const leagueMatch = location.pathname.match(/^\/league\/([^/]+)(?:\/([^/]+))?/);
  const currentLeague = leagueMatch ? leagues.find(l => l.id === leagueMatch[1]) : null;
  const currentSection = leagueMatch ? (leagueMatch[2] || 'overview') : null;

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

  function handleUpdateLeague(updated) {
    setLeagues(prev => prev.map(l => (l.id === updated.id ? updated : l)));
  }

  function handleAddLeague(league) {
    setLeagues(prev => [...prev, league]);
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

          {/* Right: section doors (on a league) + account */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            {currentLeague && <SectionDoors league={currentLeague} currentSection={currentSection} isDark={isDark} layout="top" />}
            <AccountMenu isDark={isDark} />
          </div>
        </div>
        <style>{`
          @media (max-width: 640px) {
            .kh-nav-wordmark { display: none !important; }
            .kh-nav-icon { display: block !important; }
          }
          /* Below 720px the top doors collapse to icon-only; the bottom bar
             takes over as the primary section nav. */
          @media (max-width: 860px) {
            .kh-door-label { display: none !important; }
          }
          @media (max-width: 720px) {
            .kh-top-doors { display: none !important; }
            .kh-bottom-bar { display: flex !important; }
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

      {/* Mobile bottom tab bar — hidden on desktop via media query */}
      {currentLeague && <SectionDoors league={currentLeague} currentSection={currentSection} isDark={isDark} layout="bottom" />}

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
