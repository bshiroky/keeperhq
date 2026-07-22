import React from 'react';
import { ArrowLeftRight, Check } from 'lucide-react';
import { makeTheme, tokens, Button } from '../components.jsx';
import { PlayerAutocomplete } from '../PlayerAutocomplete.jsx';
import { normalizeName } from '../lib/players.js';
import { ACQUISITION_METHODS, ACQUISITION_LABEL, acquisitionOf } from '../lib/acquisition.js';
import { getDraftRounds } from '../lib/draftPicks.js';

// Keepers Tab — full management with inline add/edit/remove

function KeeperEditModal({ team, league, accentColor, isDark, onSave, onClose, allTeams, autoAddOnOpen }) {
  const t = makeTheme(isDark);
  const [keepers, setKeepers] = React.useState(() => {
    const initial = JSON.parse(JSON.stringify(team.keepers || []));
    // If asked to auto-add and there's room, append an empty slot so user goes straight to the form
    if (autoAddOnOpen && initial.length < league.keeperSlots) {
      if (league.draftType === 'snake') {
        initial.push({ player: '', contractYear: 1, contractLength: 3, expiresAfter: '', ...acquisitionOf(null) });
      } else {
        initial.push({ player: '', keptFor: 1, yearsKept: 1, ...acquisitionOf(null) });
      }
    }
    return initial;
  });
  const [tradingIdx, setTradingIdx] = React.useState(null);
  const [tradeForm, setTradeForm] = React.useState({ toTeamId: '', note: '' });

  function addKeeper() {
    if (keepers.length >= league.keeperSlots) return;
    if (league.draftType === 'snake') {
      setKeepers([...keepers, { player: '', contractYear: 1, contractLength: 3, expiresAfter: '', ...acquisitionOf(null) }]);
    } else {
      setKeepers([...keepers, { player: '', keptFor: 1, yearsKept: 1, ...acquisitionOf(null) }]);
    }
  }

  function removeKeeper(i) {
    setKeepers(keepers.filter((_, idx) => idx !== i));
  }

  function updateKeeper(i, field, value) {
    const updated = [...keepers];
    updated[i] = { ...updated[i], [field]: value };
    // Auto-calc expiresAfter for snake
    if (league.draftType === 'snake') {
      const yr = parseInt(updated[i].contractYear) || 1;
      const len = parseInt(updated[i].contractLength) || 3;
      const remaining = len - yr;
      const baseYear = 2025;
      updated[i].expiresAfter = `${baseYear + remaining}-${String(baseYear + remaining + 1).slice(2)}`;
    }
    setKeepers(updated);
  }

  function startTrade(i) {
    setTradingIdx(i);
    const existing = keepers[i].tradedTo || '';
    const existingNote = keepers[i].tradeNote || '';
    setTradeForm({ toTeamId: existing, note: existingNote });
  }

  function saveTrade() {
    const updated = [...keepers];
    if (tradeForm.toTeamId) {
      // Append to history (chain of all moves)
      const existing = updated[tradingIdx];
      const history = existing.tradeHistory ? [...existing.tradeHistory] : [];
      history.push({
        toTeamId: tradeForm.toTeamId,
        note: tradeForm.note || '',
        date: new Date().toISOString().slice(0, 10),
      });
      updated[tradingIdx] = {
        ...existing,
        tradedTo: tradeForm.toTeamId,
        tradeNote: tradeForm.note || '',
        tradeHistory: history,
      };
    } else {
      // Clear trade
      const { tradedTo, tradeNote, tradeHistory, ...rest } = updated[tradingIdx];
      updated[tradingIdx] = rest;
    }
    setKeepers(updated);
    setTradingIdx(null);
    setTradeForm({ toTeamId: '', note: '' });
  }

  const teamOptions = (allTeams || []).filter(tm => tm.id !== team.id);
  const teamName = (id) => (allTeams || []).find(tm => tm.id === id)?.name || '?';

  const overlayStyle = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
  };

  return (
    <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: isDark ? '#1c2130' : '#ffffff', border: `1px solid ${t.border}`,
        borderTop: `3px solid ${accentColor}`, borderRadius: 12,
        width: '100%', maxWidth: 620, maxHeight: '85vh', overflow: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
      }}>
        {/* Modal header */}
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: t.textPrimary }}>{team.name}</div>
            <div style={{ fontSize: '12px', color: t.textMuted, marginTop: 2 }}>
              {keepers.length}/{league.keeperSlots} keeper slots used
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        {/* Keeper list */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {keepers.length === 0 && (
            <div style={{ textAlign: 'center', padding: '12px 0 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <img src="/mascot-empty.png" alt="" height={100}
                style={{ height: 100, width: 'auto', display: 'block', imageRendering: 'pixelated', opacity: 0.95 }} />
              <div style={{ color: t.textMuted, fontSize: '13px' }}>No keepers yet. Add one below.</div>
            </div>
          )}
          {keepers.map((k, i) => {
            // Disable any player already kept anywhere in the league (other
            // teams' saved keepers + other slots in this modal). Allow re-
            // selection of this slot's saved value if it had one.
            const disabledNames = new Set();
            (league.teams || []).forEach(tm => {
              const isSelfTeam = tm.id === team.id;
              (tm.keepers || []).forEach((kp, kpIdx) => {
                if (!kp.player) return;
                if (isSelfTeam && kpIdx === i) return; // allow re-selecting own slot's saved value
                disabledNames.add(normalizeName(kp.player));
              });
            });
            keepers.forEach((other, oi) => {
              if (oi !== i && other.player) disabledNames.add(normalizeName(other.player));
            });
            // Always permit the currently-typed value to stay in the input
            if (k.player) disabledNames.delete(normalizeName(k.player));
            return (
            <div key={i} style={{ background: t.sectionBg, border: `1px solid ${t.border}`, borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <PlayerAutocomplete
                    value={k.player}
                    onChange={name => updateKeeper(i, 'player', name)}
                    sport={league.sport}
                    isDark={isDark}
                    placeholder="Player name"
                    league={league}
                    disabledNames={disabledNames}
                    inputStyle={{
                      width: '100%', boxSizing: 'border-box',
                      background: isDark ? '#161a22' : '#f7f9fc',
                      border: `1px solid ${t.border}`, borderRadius: 8,
                      padding: '8px 12px', fontSize: '14px', color: t.textPrimary,
                      outline: 'none', fontFamily: 'inherit',
                    }}
                  />
                </div>
                {league.draftType === 'snake' && (() => {
                  const len = parseInt(k.contractLength) || 3;
                  // Y can be 1..length (Y=length is the last year of contract — still keepable, but flagged as expiring).
                  // Y > length = past contract end = blocked entirely (handled by the rollover filter).
                  const yearOpts = Array.from({ length: len }, (_, idx) => idx + 1);
                  return (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <label style={{ fontSize: '10px', color: t.textMuted, fontWeight: 600 }}>YR</label>
                      <select value={k.contractYear} onChange={e => updateKeeper(i, 'contractYear', parseInt(e.target.value))}
                        style={{ background: isDark ? '#161a22' : '#f7f9fc', border: `1px solid ${t.border}`, borderRadius: 6, padding: '7px 8px', color: t.textPrimary, fontSize: '13px', fontFamily: 'inherit', cursor: 'pointer' }}>
                        {yearOpts.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <label style={{ fontSize: '10px', color: t.textMuted, fontWeight: 600 }}>LEN</label>
                      <select value={k.contractLength} onChange={e => updateKeeper(i, 'contractLength', parseInt(e.target.value))}
                        style={{ background: isDark ? '#161a22' : '#f7f9fc', border: `1px solid ${t.border}`, borderRadius: 6, padding: '7px 8px', color: t.textPrimary, fontSize: '13px', fontFamily: 'inherit', cursor: 'pointer' }}>
                        {[2,3,4,5].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                    {k.expiresAfter && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <label style={{ fontSize: '10px', color: t.textMuted, fontWeight: 600 }}>EXPIRES</label>
                        <div style={{ fontSize: '12px', color: t.textSecondary, padding: '8px 4px', fontWeight: 600 }}>{k.expiresAfter}</div>
                      </div>
                    )}
                  </div>
                  );
                })()}
                {league.draftType === 'auction' && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <label style={{ fontSize: '10px', color: t.textMuted, fontWeight: 600 }}>KEPT FOR</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <span style={{ fontSize: '13px', color: t.textMuted }}>$</span>
                        <input type="number" min="1" value={k.keptFor} onChange={e => updateKeeper(i, 'keptFor', parseInt(e.target.value) || 1)}
                          style={{ width: 64, background: isDark ? '#161a22' : '#f7f9fc', border: `1px solid ${t.border}`, borderRadius: 6, padding: '7px 8px', color: accentColor, fontSize: '13px', fontWeight: 700, fontFamily: 'inherit', textAlign: 'center' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <label style={{ fontSize: '10px', color: t.textMuted, fontWeight: 600 }}>YRS KEPT</label>
                      <select value={k.yearsKept} onChange={e => updateKeeper(i, 'yearsKept', parseInt(e.target.value))}
                        style={{ background: isDark ? '#161a22' : '#f7f9fc', border: `1px solid ${t.border}`, borderRadius: 6, padding: '7px 8px', color: t.textPrimary, fontSize: '13px', fontFamily: 'inherit', cursor: 'pointer' }}>
                        {[1,2,3,4,5,6,7,8].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                  </div>
                )}
                <button onClick={() => startTrade(i)} title={k.tradedTo ? `Traded to ${teamName(k.tradedTo)}` : 'Trade this player'}
                  style={{ background: k.tradedTo ? 'rgba(217,119,87,0.15)' : 'none', border: `1px solid ${k.tradedTo ? '#d97757' : t.border}`, borderRadius: 6, padding: '8px 10px', cursor: 'pointer', color: k.tradedTo ? '#d97757' : t.textMuted, lineHeight: 1, flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>
                  <ArrowLeftRight size={14} strokeWidth={1.75} />
                </button>
                <button onClick={() => removeKeeper(i)} style={{ background: 'rgba(232,82,82,0.12)', border: 'none', borderRadius: 6, padding: '8px 10px', cursor: 'pointer', color: '#e85252', fontSize: 16, lineHeight: 1, flexShrink: 0 }}>×</button>
              </div>

              {/* Acquisition row — quiet bookkeeping fields (foundation for the
                  pick-cost keeper archetype; no rules read these yet). */}
              {(() => {
                const acq = acquisitionOf(k);
                const maxRound = Math.max(getDraftRounds(league), acq.acquisitionRound || 0);
                const acqSelStyle = { background: isDark ? '#161a22' : '#f7f9fc', border: `1px solid ${t.border}`, borderRadius: 6, padding: '4px 6px', color: t.textSecondary, fontSize: '11px', fontFamily: 'inherit', cursor: 'pointer' };
                return (
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '10px', color: t.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Acquisition</span>
                    <select value={acq.acquisitionMethod} onChange={e => updateKeeper(i, 'acquisitionMethod', e.target.value)} style={acqSelStyle} aria-label="Acquisition method">
                      {ACQUISITION_METHODS.map(m => <option key={m} value={m}>{ACQUISITION_LABEL[m]}</option>)}
                    </select>
                    <select value={acq.acquisitionRound ?? ''} onChange={e => updateKeeper(i, 'acquisitionRound', e.target.value === '' ? null : parseInt(e.target.value))} style={acqSelStyle} aria-label="Acquisition round">
                      <option value="">Rd —</option>
                      {Array.from({ length: maxRound }, (_, ri) => ri + 1).map(v => <option key={v} value={v}>Rd {v}</option>)}
                    </select>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '11px', fontWeight: 600, color: t.textMuted, cursor: 'pointer' }}>
                      <input type="checkbox" checked={acq.rookieAtAcquisition} onChange={e => updateKeeper(i, 'rookieAtAcquisition', e.target.checked)} style={{ margin: 0, accentColor }} />
                      Rookie when acquired
                    </label>
                  </div>
                );
              })()}

              {/* Trade indicator badge (when traded but not editing) */}
              {k.tradedTo && tradingIdx !== i && (
                <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(217,119,87,0.08)', border: '1px solid rgba(217,119,87,0.3)', borderRadius: 6, fontSize: 12, color: t.textSecondary, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#d97757', fontWeight: 700 }}>→ Traded to {teamName(k.tradedTo)}</span>
                  {k.tradeNote && <span style={{ color: t.textMuted }}>· {k.tradeNote}</span>}
                </div>
              )}

              {/* Inline trade form */}
              {tradingIdx === i && (
                <div style={{ marginTop: 10, padding: '12px', background: isDark ? '#0f1320' : '#f7f9fc', border: `1px solid ${t.border}`, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Trade {k.player || 'player'} to…</div>
                  <select value={tradeForm.toTeamId} onChange={e => setTradeForm({ ...tradeForm, toTeamId: e.target.value })}
                    style={{ background: isDark ? '#161a22' : '#fff', border: `1px solid ${t.border}`, borderRadius: 6, padding: '8px 10px', color: t.textPrimary, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>
                    <option value="">— Pick a team (or clear trade) —</option>
                    {teamOptions.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
                  </select>
                  <input placeholder="Trade note (optional, e.g. 'For 2026 1st + Pasta')" value={tradeForm.note}
                    onChange={e => setTradeForm({ ...tradeForm, note: e.target.value })}
                    style={{ background: isDark ? '#161a22' : '#fff', border: `1px solid ${t.border}`, borderRadius: 6, padding: '8px 10px', color: t.textPrimary, fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
                  {k.tradeHistory && k.tradeHistory.length > 0 && (
                    <div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.5 }}>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>History:</div>
                      {k.tradeHistory.map((h, hi) => (
                        <div key={hi}>· {h.date} → {teamName(h.toTeamId)}{h.note ? ` (${h.note})` : ''}</div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <Button variant="secondary" size="sm" isDark={isDark} onClick={() => { setTradingIdx(null); setTradeForm({ toTeamId: '', note: '' }); }}>Cancel</Button>
                    <Button variant="primary" size="sm" accent={accentColor} isDark={isDark} onClick={saveTrade}>
                      {tradeForm.toTeamId ? 'Save Trade' : 'Clear Trade'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
            );
          })}

          {keepers.length < league.keeperSlots && (
            <button onClick={addKeeper} style={{
              background: 'none', border: `2px dashed ${t.border}`, borderRadius: 10,
              padding: '12px', cursor: 'pointer', color: t.textMuted, fontSize: '13px', fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = accentColor; e.currentTarget.style.color = accentColor; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.color = t.textMuted; }}
            >
              + Add Keeper
            </button>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: '#e85252', fontWeight: 600 }}>
            {(() => {
              const names = keepers.map(k => normalizeName(k.player)).filter(Boolean);
              const seen = new Set();
              const dups = [];
              for (const n of names) { if (seen.has(n)) dups.push(n); seen.add(n); }
              return dups.length ? `Duplicate keeper${dups.length > 1 ? 's' : ''} — remove before saving.` : '';
            })()}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" size="md" isDark={isDark} onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="md" accent={accentColor} isDark={isDark}
              onClick={() => {
                const names = keepers.map(k => normalizeName(k.player)).filter(Boolean);
                if (new Set(names).size !== names.length) return; // block save
                onSave({ ...team, keepers });
              }}
              disabled={(() => {
                const names = keepers.map(k => normalizeName(k.player)).filter(Boolean);
                return new Set(names).size !== names.length;
              })()}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function KeepersTab({ league, accentColor, isDark, onUpdateLeague }) {
  const t = makeTheme(isDark);
  const [teams, setTeams] = React.useState(league.teams || []);
  const [editingTeam, setEditingTeam] = React.useState(null);

  function handleSave(updatedTeam) {
    const newTeams = teams.map(tm => tm.id === updatedTeam.id ? updatedTeam : tm);
    setTeams(newTeams);
    if (onUpdateLeague) onUpdateLeague({ ...league, teams: newTeams });
    setEditingTeam(null);
  }

  function togglePaid(teamId) {
    const newTeams = teams.map(tm => tm.id === teamId ? { ...tm, paid: !tm.paid } : tm);
    setTeams(newTeams);
    if (onUpdateLeague) onUpdateLeague({ ...league, teams: newTeams });
  }

  if (league.draftType === 'snake') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {editingTeam && (
          <KeeperEditModal
            team={editingTeam} league={league} accentColor={accentColor} isDark={isDark}
            onSave={handleSave} onClose={() => setEditingTeam(null)} allTeams={teams}
          />
        )}
        {teams.map(team => {
          const expiring = (team.keepers || []).filter(k => k.expiresAfter === '2025-26').length;
          return (
            <div key={team.id} style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: t.cardShadow, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: `${accentColor}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: accentColor, flexShrink: 0 }}>
                  {team.name[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: t.textPrimary }}>{team.name}</div>
                  <div style={{ fontSize: '12px', color: t.textMuted, marginTop: 2 }}>
                    {`${(team.keepers||[]).length}/${league.keeperSlots} keepers`}
                    {expiring > 0 && <span style={{ color: '#e85252', marginLeft: 8 }}>· {expiring} expiring</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                  <button onClick={() => togglePaid(team.id)} style={{
                    background: team.paid ? tokens.successBg : 'rgba(232,82,82,0.1)',
                    border: `1px solid ${team.paid ? tokens.successBorder : 'rgba(232,82,82,0.3)'}`,
                    borderRadius: 6, padding: '4px 10px', fontSize: '11px', fontWeight: 700,
                    cursor: 'pointer', color: team.paid ? tokens.success : '#e85252',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>{team.paid ? <><Check size={12} strokeWidth={2} /> Paid</> : 'Unpaid'}</button>
                  {team.keepersSubmitted
                    ? <span style={{ fontSize: '11px', fontWeight: 700, color: accentColor, background: `${accentColor}18`, borderRadius: 6, padding: '4px 10px' }}>Submitted</span>
                    : <span style={{ fontSize: '11px', fontWeight: 600, color: t.textMuted, background: t.sectionBg, borderRadius: 6, padding: '4px 10px' }}>Pending</span>
                  }
                  <button onClick={() => setEditingTeam(team)} style={{
                    background: accentColor, border: 'none', borderRadius: 6, padding: '6px 14px',
                    fontSize: '12px', fontWeight: 600, cursor: 'pointer', color: '#fff',
                  }}>Edit Keepers</button>
                </div>
              </div>
              {(team.keepers || []).length > 0 && (
                <div style={{ borderTop: `1px solid ${t.divider}`, padding: '10px 18px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {team.keepers.map((k, i) => {
                    const exp = k.expiresAfter === '2025-26';
                    return (
                      <div key={i} style={{ background: exp ? 'rgba(232,82,82,0.08)' : t.sectionBg, border: `1px solid ${exp ? 'rgba(232,82,82,0.25)' : t.border}`, borderRadius: 8, padding: '5px 10px', fontSize: '12px' }}>
                        <span style={{ color: exp ? '#e85252' : t.textPrimary, fontWeight: 500 }}>{k.player}</span>
                        <span style={{ color: t.textMuted, marginLeft: 5 }}>Y{k.contractYear}/{k.contractLength}</span>
                        {exp && <span style={{ color: '#e85252', marginLeft: 4, fontSize: '10px', fontWeight: 700 }}>EXP</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Auction keepers
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {editingTeam && (
        <KeeperEditModal
          team={editingTeam} league={league} accentColor={accentColor} isDark={isDark}
          onSave={handleSave} onClose={() => setEditingTeam(null)} allTeams={teams}
        />
      )}
      {teams.map(team => (
        <div key={team.id} style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: t.cardShadow, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: `${accentColor}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: accentColor, flexShrink: 0 }}>
              {team.name[0]}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: t.textPrimary }}>{team.name}</div>
              <div style={{ fontSize: '12px', color: t.textMuted, marginTop: 2 }}>
                {`${(team.keepers||[]).length} of ${league.keeperSlots} keeper slots used`}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
              <button onClick={() => togglePaid(team.id)} style={{
                background: team.paid ? tokens.successBg : 'rgba(232,82,82,0.1)',
                border: `1px solid ${team.paid ? tokens.successBorder : 'rgba(232,82,82,0.3)'}`,
                borderRadius: 6, padding: '4px 10px', fontSize: '11px', fontWeight: 700,
                cursor: 'pointer', color: team.paid ? tokens.success : '#e85252',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>{team.paid ? <><Check size={12} strokeWidth={2} /> Paid</> : 'Unpaid'}</button>
              {team.keepersSubmitted
                ? <span style={{ fontSize: '11px', fontWeight: 700, color: accentColor, background: `${accentColor}18`, borderRadius: 6, padding: '4px 10px' }}>Submitted</span>
                : <span style={{ fontSize: '11px', fontWeight: 600, color: t.textMuted, background: t.sectionBg, borderRadius: 6, padding: '4px 10px' }}>Pending</span>
              }
              <button onClick={() => setEditingTeam(team)} style={{
                background: accentColor, border: 'none', borderRadius: 6, padding: '6px 14px',
                fontSize: '12px', fontWeight: 600, cursor: 'pointer', color: '#fff',
              }}>Edit Keepers</button>
            </div>
          </div>
          {(team.keepers || []).length > 0 && (
            <div style={{ borderTop: `1px solid ${t.divider}`, padding: '10px 18px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {team.keepers.map((k, i) => (
                <div key={i} style={{ background: t.sectionBg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '5px 10px', fontSize: '12px', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ color: t.textPrimary, fontWeight: 500 }}>{k.player}</span>
                  <span style={{ color: accentColor, fontWeight: 700 }}>${k.keptFor}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { KeepersTab, KeeperEditModal });

export { KeeperEditModal, KeepersTab };
