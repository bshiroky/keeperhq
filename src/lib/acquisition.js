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

// Readable short form for the quiet "Acquired: …" line, e.g. "draft R3 ·
// rookie", "waiver pickup", "manual entry". Lowercase on purpose — it reads
// as a sentence fragment after the "Acquired:" label, not as a pill.
const SUMMARY_LABEL = {
  draft: 'draft',
  waiver: 'waiver pickup',
  trade: 'trade',
  manual: 'manual entry',
};

export function acquisitionSummary(entry) {
  const acq = acquisitionOf(entry);
  let base = SUMMARY_LABEL[acq.acquisitionMethod];
  if (acq.acquisitionMethod === 'draft' && acq.acquisitionRound != null) {
    base = `draft R${acq.acquisitionRound}`;
  }
  return acq.rookieAtAcquisition ? `${base} · rookie` : base;
}
