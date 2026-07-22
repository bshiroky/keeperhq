// Acquisition metadata — how a player arrived on a team. Foundation for the
// pick-cost keeper archetype (keeping a player consumes the draft round he was
// taken in), rookie rules, and trade validation. No rules logic reads these
// fields yet — this is bookkeeping only.
//
// The three fields live on player entries (keepers / priorKeepers) inside the
// league blob, next to the existing contract fields:
//   acquisitionRound:    integer draft round, or null for non-drafted
//   acquisitionMethod:   'draft' | 'waiver' | 'trade' | 'manual'
//   rookieAtAcquisition: boolean
// Absent fields read as the defaults below — old data needs no migration.

export const ACQUISITION_METHODS = ['draft', 'waiver', 'trade', 'manual'];

export const ACQUISITION_LABEL = {
  draft: 'Draft',
  waiver: 'Waiver',
  trade: 'Trade',
  manual: 'Manual',
};

// Normalized read: always returns all three fields, defaulting absent ones.
export function acquisitionOf(entry) {
  const method = entry?.acquisitionMethod;
  return {
    acquisitionRound: entry?.acquisitionRound ?? null,
    acquisitionMethod: ACQUISITION_METHODS.includes(method) ? method : 'manual',
    rookieAtAcquisition: !!entry?.rookieAtAcquisition,
  };
}

// Short display string for the quiet acquisition line, e.g. "Draft R3 · Rookie",
// "Waiver", "Manual".
export function acquisitionSummary(entry) {
  const acq = acquisitionOf(entry);
  const base = acq.acquisitionMethod === 'draft' && acq.acquisitionRound != null
    ? `Draft R${acq.acquisitionRound}`
    : ACQUISITION_LABEL[acq.acquisitionMethod];
  return acq.rookieAtAcquisition ? `${base} · Rookie` : base;
}
