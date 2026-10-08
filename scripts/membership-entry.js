// Bundle entry for `npm run test:membership` — sharedLeague.js sits behind the
// supabase import, so esbuild flattens it for plain node.
export { buildTeamPool } from '../src/lib/teamPool.js';
export { buildStatusIndex } from '../src/lib/players.js';
export { buildSharedRows } from '../src/lib/sharedLeague.js';
export { rosterImportImpact, rosterGuardLines } from '../src/lib/importGuard.js';
export { hasRosterOnFile, withRosterEdit, withRosterImport, recordedRemovals, draftOnlyRecords } from '../src/lib/rosterMembership.js';
