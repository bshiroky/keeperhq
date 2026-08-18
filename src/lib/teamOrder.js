// Display order for team chip strips.
//
// Teams are stored in creation order, which is meaningless to a reader — the
// strip is a lookup ("where's my team?"), so it sorts by name. This lives in
// one place because the strip appears on several surfaces (Set keepers, Last
// Draft, the shared page's filter rail) and they drifted apart when each
// mapped `league.teams` directly.
//
// Display order ONLY. Nothing here reorders stored data: teams are addressed
// by id everywhere, so sorting the chips can't affect what a click resolves
// to.
export function sortTeamsByName(teams) {
  return [...(teams || [])].sort((a, b) =>
    (a?.name || '').localeCompare(b?.name || '', undefined, { sensitivity: 'base' }));
}
