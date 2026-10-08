import React from 'react';
import { makeTheme, tokens } from '../components.jsx';
import { planBackfillAll, applyBackfill, ACTION_SET, ACTION_ANCHORED } from '../lib/contractBackfill.js';
import { appendChanges } from '../lib/changeLog.js';

// The contract-anchoring backfill's one control surface.
//
// THREE PROPERTIES THIS CARD EXISTS TO GUARANTEE, in order of importance:
//
// 1. Nothing runs by itself. The plan is computed only when "Preview changes"
//    is clicked. There is no effect, no timer, and no call on mount — loading
//    the app, deploying it, or opening this panel writes nothing.
// 2. The write is a separate, deliberate second action. It appears only after
//    a plan has been read, and it asks once more before it runs. The dry run
//    cannot become a write by clicking the same button twice.
// 3. What you approve is what runs. Apply consumes the exact plan on screen,
//    and applyBackfill writes only the rows that plan marked `set` — a flagged
//    row is excluded by construction, not by a second judgement call.
//
// It lives in the Tweaks panel rather than a league's Settings because the
// report spans EVERY league — confirming that the term-less leagues are
// untouched is half of what the dry run is for, and a per-league surface
// could not show it.
export function ContractBackfillCard({ leagues, isDark, onUpdateLeague }) {
  const t = makeTheme(isDark);
  const [report, setReport] = React.useState(null);
  const [confirming, setConfirming] = React.useState(false);
  const [done, setDone] = React.useState(null);

  // The ONLY entry point. Pure computation — planBackfillAll does not write.
  function preview() {
    setDone(null);
    setConfirming(false);
    setReport(planBackfillAll(leagues));
  }

  function apply() {
    if (!report) return;
    let written = 0;
    let touched = 0;
    for (const plan of report.plans) {
      if (plan.counts.toSet === 0) continue;
      const league = (leagues || []).find(l => l.id === plan.leagueId);
      if (!league) continue;
      const res = applyBackfill(league, plan);
      if (res.written === 0) continue;
      written += res.written;
      touched++;
      // Every write is logged, on the same update call that makes it, so the
      // record of the backfill cannot be lost separately from the backfill.
      onUpdateLeague(appendChanges(res.league, res.changes));
    }
    setConfirming(false);
    setReport(null);
    setDone({ written, touched });
  }

  const box = { border: `1px solid ${t.border}`, borderRadius: tokens.radiusMd, padding: '10px 12px', background: t.sectionBg };
  const btn = (variant) => ({
    background: variant === 'danger' ? 'rgba(232,82,82,0.15)' : 'transparent',
    color: variant === 'danger' ? tokens.danger : t.textPrimary,
    border: `1px solid ${variant === 'danger' ? 'rgba(232,82,82,0.3)' : t.border}`,
    borderRadius: tokens.radiusSm, padding: '6px 10px', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ ...tokens.typeBodyMeta, color: t.textMuted, lineHeight: 1.5 }}>
        Writes each contract's start season onto its record, computed from the league's
        current season and the contract year already stored. Preview is a dry run — it
        writes nothing.
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={preview} style={btn()}>Preview changes (dry run)</button>
      </div>

      {done && (
        <div style={{ ...box, borderColor: tokens.successBorder }}>
          <div style={{ ...tokens.typeBodyMeta, color: t.textPrimary, fontWeight: 700 }}>
            Anchored {done.written} contract{done.written === 1 ? '' : 's'} across {done.touched} league{done.touched === 1 ? '' : 's'}.
          </div>
          <div style={{ ...tokens.typeBodyMeta, color: t.textMuted, marginTop: 4 }}>
            Each one is in that league's change log. Re-run the preview to confirm nothing is left.
          </div>
        </div>
      )}

      {report && <Report report={report} t={t} box={box} btn={btn}
        confirming={confirming} setConfirming={setConfirming} apply={apply} />}
    </div>
  );
}

function Report({ report, t, box, btn, confirming, setConfirming, apply }) {
  const { plans, totals } = report;
  const flagged = plans.flatMap(p => p.records.filter(r => r.flag).map(r => ({ ...r, leagueName: p.leagueName })));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={box}>
        <div style={{ ...tokens.typeLabelEyebrow, color: t.textMuted }}>Dry run — nothing written</div>
        <div style={{ ...tokens.typeBodyMeta, color: t.textPrimary, marginTop: 6, lineHeight: 1.6 }}>
          {totals.leagues} league{totals.leagues === 1 ? '' : 's'} read · {totals.termedLeagues} with contracts ·{' '}
          <strong>{totals.untouchedLeagues} untouched</strong> (no fixed term)
          <br />
          <strong>{totals.toSet}</strong> record{totals.toSet === 1 ? '' : 's'} would be anchored
          {totals.anchored > 0 && ` · ${totals.anchored} already anchored`}
          {totals.archived > 0 && ` · ${totals.archived} ended contract${totals.archived === 1 ? '' : 's'} skipped`}
          {totals.flagged > 0 && (
            <> · <span style={{ color: tokens.warning, fontWeight: 700 }}>{totals.flagged} flagged, not written</span></>
          )}
        </div>
      </div>

      {plans.map(p => (
        <div key={p.leagueId || p.leagueName} style={box}>
          <div style={{ ...tokens.typeBodyMeta, color: t.textPrimary, fontWeight: 700 }}>
            {p.leagueName} <span style={{ color: t.textMuted, fontWeight: 500 }}>· {p.season || 'no season set'} · {p.teams} teams</span>
          </div>
          {p.skipped ? (
            <div style={{ ...tokens.typeBodyMeta, color: t.textMuted, marginTop: 4, lineHeight: 1.5 }}>
              <strong style={{ color: tokens.success }}>Untouched.</strong> {p.skipped}
            </div>
          ) : (
            <>
              <div style={{ ...tokens.typeBodyMeta, color: t.textMuted, marginTop: 4 }}>
                {p.counts.toSet} to anchor · {p.counts.anchored} already anchored · {p.counts.flagged} flagged
                {p.counts.archived > 0 && ` · ${p.counts.archived} ended`}
              </div>
              {p.records.length > 0 && (
                <div style={{ marginTop: 8, maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {p.records.map((r, i) => (
                    <div key={i} style={{ ...tokens.typeBodyMeta, color: r.flag ? tokens.warning : t.textBody, lineHeight: 1.5, display: 'flex', gap: 6 }}>
                      <span style={{ color: t.textMuted, flexShrink: 0 }}>{r.teamName}</span>
                      <span style={{ fontWeight: 600 }}>{r.player}</span>
                      <span style={{ color: t.textMuted }}>
                        {r.array === 'keepers' ? 'keeper' : 'prior'} · yr {r.contractYear ?? '—'}/{r.contractLength ?? '—'}
                      </span>
                      <span>
                        {r.action === ACTION_SET && <>→ startSeason <strong>{r.proposedStartSeason}</strong></>}
                        {r.action === ACTION_ANCHORED && <span style={{ color: t.textMuted }}>already {r.currentStartSeason}</span>}
                        {r.flag && <>⚠ {r.flag}</>}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ))}

      {flagged.length > 0 && (
        <div style={{ ...box, borderColor: tokens.warningBorder }}>
          <div style={{ ...tokens.typeBodyMeta, color: tokens.warning, fontWeight: 700 }}>
            {flagged.length} record{flagged.length === 1 ? '' : 's'} flagged — these will NOT be written
          </div>
          <div style={{ ...tokens.typeBodyMeta, color: t.textMuted, marginTop: 4, lineHeight: 1.5 }}>
            Each one is something I could not compute confidently. They keep working exactly as they
            do today (the app reads their stored contract year); fix them by hand if the values are wrong.
          </div>
        </div>
      )}

      {/* The write. A separate, deliberate second action, and it asks again. */}
      {totals.toSet > 0 && (
        confirming ? (
          <div style={{ ...box, borderColor: 'rgba(232,82,82,0.3)' }}>
            <div style={{ ...tokens.typeBodyMeta, color: t.textPrimary, lineHeight: 1.5 }}>
              Write <strong>{totals.toSet}</strong> anchor{totals.toSet === 1 ? '' : 's'} to league data now?
              Nothing else on the records changes and the contract years stay as they are, but
              there is no undo — the change log records each write, it does not reverse it.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button autoFocus onClick={() => setConfirming(false)} style={btn()}>Cancel</button>
              <button onClick={apply} style={btn('danger')}>Yes, write {totals.toSet}</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirming(true)} style={btn('danger')}>
            Apply to league data ({totals.toSet})
          </button>
        )
      )}
    </div>
  );
}
