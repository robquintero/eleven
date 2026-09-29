/**
 * Pure round-name classification for UEFA-style competitions (Champions
 * League, Europa League), whose season structure includes qualifying
 * rounds before the main competition proper — see
 * docs/football-data-system.md "UCL/UEL qualifying boundary." Domestic
 * Big Five leagues use a flat "Regular Season - N" round naming with no
 * qualifying concept at all, so this only ever matters for UEFA syncs.
 *
 * Verified live against the real provider (`GET /fixtures/rounds`) for
 * the 2026/27 season before this was written — round names are exactly
 * "1st/2nd/3rd Qualifying Round", "Play-offs", then "League Stage - N".
 * Matched by substring rather than an exact list so a differently-numbered
 * qualifying round (a competition with only two qualifying rounds, say)
 * still classifies correctly without a code change.
 */
export function isQualifyingRound(round: string): boolean {
  return /qualifying|play-?offs?/i.test(round);
}
