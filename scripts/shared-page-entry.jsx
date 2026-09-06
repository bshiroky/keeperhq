// Bundle entry for the shared-page tests (npm run test:shared). The page's
// row derivation and rail rules are pure, but they sit behind imports that
// need a bundler (JSX, import.meta.env), so esbuild flattens them for node.
export {
  buildSharedRows, sortRowsDefault, sharedFilterChips, costColumnLabel, OWNER_COLUMN_LABEL,
  keepersFirst, sharedDraftBoard,
} from '../src/lib/sharedLeague.js';
export { sortTeamsByName } from '../src/lib/teamOrder.js';
export { buildTeamPool, EligiblePool } from '../src/tabs/SetKeepersTab.jsx';
export { setContractYear, clearContractOnUnkeep } from '../src/lib/contractYear.js';
export { teamPicks, teamTradedAwayPicks, formatPickNumber } from '../src/lib/draftOrder.js';
export { buildStatusIndex } from '../src/lib/players.js';
export { SharedLeaguePage } from '../src/SharedLeaguePage.jsx';
export { keeperRuleFacts, ruleNotes, hasRuleNotes } from '../src/lib/rulesSummary.js';
export { keeperCostModelOf, hasAuctionRulesBlock } from '../src/lib/keeperRules.js';
export { LeagueRulesModal, RulesGrid, RulesButton } from '../src/LeagueRulesModal.jsx';
export { InvalidLinkPage } from '../src/SharedLeaguePage.jsx';
