/**
 * Pass 12F command-palette search: the minimum-query-length gate, pulled
 * out as a pure function so it's actually exercised by `npm test` (that
 * script only globs `src/domain`, `src/lib`, `src/data-access` — a test
 * living next to the "use server" action file in `src/app/*` would never
 * run at all). A 1-character query against 2,767+ players would return a
 * huge, useless result set and cost a real request on every keystroke;
 * below this length, `searchPlayersAction` (src/app/(app)/players/actions.ts)
 * skips the query entirely rather than searching.
 */
export const MIN_PLAYER_SEARCH_LENGTH = 2;

export function shouldSearchPlayers(query: string): boolean {
  return query.trim().length >= MIN_PLAYER_SEARCH_LENGTH;
}
