# V4 canonical player analytics and frozen fantasy history

This pass supersedes the delayed October 13 activation. It leaves the V1/V2/V3/V4 scorer implementations and V4 weights unchanged. Starting state: clean `main`, local and origin HEAD `c7c1da52ae02048020099cb62b32f6e175e80fa0`; foundation migration applied; current catalog V3; three unfinished V3 rounds, no settled production matchups.

## Policy and settlement

The additive `20261009000000_scoring_v4_canonical_and_raw_evidence.sql` migration installs an explicit service-only, no-argument `activate_scoring_v4_now()` release operation. Installation alone does not activate a model. The operation appends a transaction-clock V4 policy and switches only unfinished, entirely unsettled rounds atomically under the round-creation advisory lock. A mixed-settlement round stops activation. The old future V4 policy row remains as provenance and is superseded by the immediate policy; it cannot delay the catalog.

Completed round metadata, settled matchup identities/status and official score rows are protected by database triggers, including against older deployed reconciliation workers. Application reconciliation skips completed rounds and settled matchups. Provider corrections update player analytics without updating settled fantasy totals. Finalization refuses incomplete score pairs, unavailable known V4 starter evidence or stale non-V4 totals; application write errors are surfaced rather than treated as successful settlement. Standings/champions continue to derive from frozen final matchup totals.

Game Rules resolves canonical catalog policy independently of a historical round's pinned model. Inspector requests canonical player history independently of the fantasy matchup from which it was opened. V4 season totals include eligible current-season international dates despite provider tournament labels such as AFCON qualifying 2027. Legacy aggregate season predicates remain unchanged.

## Provider scope and evidence

`current-season-v4-cli.ts` exposes explicit plan, metadata, enrich, score and audit phases. It reads supported competition configuration and provider mappings, uses a fixed captured frontier, excludes prior domestic seasons and future/unplayed fixtures, excludes UEFA qualifying rounds and preserves the existing September 24 international scoring epoch. It never creates guessed player identities. Domestic fixture opening dates come from existing full-season schedules; the campaign's first stored legitimate fixture and eligible scoring start are reported separately for international competitions.

One date-bounded completed-only `/fixtures` request per included competition refreshes fixture status/results and archives its received useful fixture payload. One `/fixtures/players` call per fixture without a known final raw snapshot obtains all player evidence. These filters follow the [provider's documented completed-fixture request strategy](https://www.api-football.com/news/post/how-to-get-all-fixtures-data-from-one-league). There are no additional events/lineups/team-stat endpoint calls. Those fields are retained if received in the existing responses.

`football_provider_snapshots` keeps the complete received player-stat envelope (including unmapped players and unused fields) or complete fixture item as JSONB. Provider, endpoint, external fixture ID form its primary key; internal fixture ID, fetched time, observed fixture status and schema provenance accompany the payload. Updates deterministically replace the same latest snapshot. Normal ingestion also archives responses going forward. The table is private to the service role under RLS; client access and destructive service privileges are revoked. No missing numeric provider count is converted to zero in V4 snapshots. Existing legacy zero-coalesced columns retain their old representation.

Normalized `reported_stats`, actual participating side and captured fantasy position feed the unchanged V4 scorer. Later position changes do not overwrite an existing captured position. Player score upserts use the existing player/fixture/version key. Missing evidence is skipped and reported; individual unavailable fields remain null and visible as unavailable, with no estimated points. A completed raw envelope does not imply every optional provider statistic is populated.

## Release evidence

Production migration `20261009000000` was applied through the normal linked Supabase migration mechanism. Immediate activation was committed at **2026-10-06 03:45:38.256057 UTC** (October 5, 11:45:38 pm EDT). Canonical/catalog policy and all three unfinished round pins are V4. The October 13 row remains superseded provenance. Raw archives and the explicit activation operation are confirmed inaccessible to anonymous/authenticated clients.

### Interrupted-command checkpoint and provider requests

The interrupted final command completed the metadata phase, not the player enrichment phase: **10 `/fixtures` requests succeeded**, refreshing 492 existing fixture rows and storing 492 full fixture payloads. At resumption there were zero `/fixtures/players` archives and 111 existing rich normalized records. No metadata phase was replayed.

The initial played manifest had 488 fixtures. Refreshed/normal ingestion identified four further completed CONCACAF matches with kickoff before the unchanged frontier, bringing the final eligible manifest to **492**. Three had metadata archives; the last finalized after the bulk refresh. One additional completed-only, October-6-only CONCACAF metadata request archived that missing fixture item without rewriting fixtures. Exactly **492 `/fixtures/players` requests** then succeeded, one per unarchived fixture. No requests failed, no response was empty, and no player lacked a statistics array.

Known pass requests: **10 before resumption + 493 after resumption = 503 total**. These counts exclude independently running ordinary production cron traffic; fluctuating provider quota headers are not used to infer request counts. The final enrichment header reported 5,664/7,500 daily requests remaining, above the 200-request stop margin. There were no events, lineups, team-stat, prior-domestic-season or unrelated-competition requests.

### Exact scope

Captured kickoff frontier: `2026-10-06T03:45:38.256057Z`. UEFA qualifying fixtures and pre-epoch international player performances are excluded. Provider campaign labels are preserved: AFCON qualifying is 2027; the current CONCACAF campaign is labeled 2025 but these fixtures are September–October 2026. No March-2026 AFCON player history or 2025–26 domestic season was requested.

| Competition | Provider season | First stored campaign fixture (UTC) | Eligible request start (UTC) | Fixtures | Rich mapped performances |
| --- | ---: | --- | --- | ---: | ---: |
| ENG | 2026 | 2026-08-21T19:00:00+00:00 | 2026-08-21T19:00:00+00:00 | 50 | 1999 |
| ESP | 2026 | 2026-08-15T17:30:00+00:00 | 2026-08-15T17:30:00+00:00 | 69 | 3141 |
| GER | 2026 | 2026-08-28T18:30:00+00:00 | 2026-08-28T18:30:00+00:00 | 36 | 1440 |
| ITA | 2026 | 2026-08-22T16:30:00+00:00 | 2026-08-22T16:30:00+00:00 | 50 | 2398 |
| FRA | 2026 | 2026-08-21T18:45:00+00:00 | 2026-08-21T18:45:00+00:00 | 45 | 1789 |
| UCL | 2026 | 2026-09-08T16:45:00+00:00 | 2026-09-08T16:45:00+00:00 | 18 | 466 |
| UEL | 2026 | 2026-09-16T16:45:00+00:00 | 2026-09-16T16:45:00+00:00 | 18 | 272 |
| UEFA_NL | 2026 | 2026-09-24T16:00:00+00:00 | 2026-09-24T16:00:00.000Z | 94 | 1448 |
| AFCON_Q | 2027 | 2026-03-25T16:00:00+00:00 | 2026-09-24T16:00:00.000Z | 46 | 287 |
| CONCACAF_NL | 2025 | 2026-09-23T19:00:00+00:00 | 2026-09-24T19:00:00+00:00 | 66 | 52 |

### Coverage and unavailable evidence

**985 full raw archive records** are stored: 493 fixture items and 492 player-stat envelopes. Every selected fixture has both archives. The extra fixture item is the September 24, 13:00 UTC AFCON qualifier returned by the date-granular metadata request; it predates the existing 16:00 scoring epoch, has no player-stat refetch in this pass and contributes no V4 score.

The envelopes preserve **21,108 player performances**. All 13,292 mapped responses are normalized with rich evidence and captured position. 7,816 unmapped performances from 3,179 distinct provider players remain intact in raw archives; no guessed identities or player catalog expansion occurred. Unmapped coverage:

| Competition | Unmapped performances | Distinct provider players |
| --- | ---: | ---: |
| AFCON_Q | 1787 | 859 |
| CONCACAF_NL | 2296 | 687 |
| ENG | 1 | 1 |
| ESP | 6 | 3 |
| FRA | 11 | 3 |
| ITA | 1 | 1 |
| UCL | 332 | 328 |
| UEFA_NL | 2859 | 998 |
| UEL | 523 | 514 |

There are **13,315 stored scoped stat rows**: 13,292 enriched rows plus 23 older legacy-only rows not represented with usable rich evidence in the refreshed responses. These 23 remain untouched and unscored under V4; no fallback legacy valuation is presented as complete V4 evidence. No unfinished eligible starter performance depends on those missing V4 scores. The scoped rows represent 2,576 local players; 2,570 players have canonical V4 catalog totals.

**Strict complete/incomplete counts: 0 / 13,315** when all 18 configured V4 event fields must be explicitly reported. All 13,292 persisted V4 breakdowns also have at least one unavailable field. This deliberately stringent definition includes goalkeeper fields on outfield players and missing bench statistics; it does not mean an archive failed or every active player lacks core match statistics. Missing provider counts remain null, contribute no invented points and are shown as unavailable. There are 3,014 missing reported minute values and 23 rows without participating-side provenance (the legacy-only rows). No model calibration or weights were changed.

| V4 field | Missing/null scoped rows |
| --- | ---: |
| assists | 3024 |
| blocks | 9752 |
| duelsWon | 4351 |
| foulsCommitted | 7232 |
| foulsDrawn | 7453 |
| goals | 10491 |
| interceptions | 8159 |
| keyPasses | 7744 |
| penaltiesMissed | 2166 |
| penaltiesSaved | 12792 |
| penaltiesWon | 13276 |
| redCards | 23 |
| saves | 10687 |
| shots | 7833 |
| shotsOnTarget | 9268 |
| successfulDribbles | 8631 |
| tackles | 6778 |
| yellowCards | 23 |

### Scoring and fantasy result safety

Provider-free scoring recomputed/upserted **13,292 V4 player analytics rows**, skipped the 23 unavailable legacy rows and had zero failures. Current season totals, rankings, averages and Inspector history resolve canonical V4. All three unfinished fantasy rounds were reconciled under their V4 pins without lock changes. Independent SQL starter/acquisition/round aggregation matched all eight persisted team totals exactly (zero mismatches). No unfinished known starter lacked V4 evidence.

The completed-round, settled-matchup, settled-score, W/L/tie/PF/PA and completed-season snapshots are identical before activation, during enrichment and after recomputation. Production had **zero settled results at baseline**, so this production invariant is an empty-history comparison, not evidence of preserving nonempty real league history. The populated offline migration/reconciliation tests separately preserve the official 102–98 result and its winner/standings inputs after revaluing its player to 999 under V4 and reject attempts to change settled records.

Invariant snapshot SHA-256 (before and after, timestamp excluded): `50c2a4c84a017f5d2146d1d1eddc9df9f2114a611178991bf46866c27e18aef6`. No completed fantasy total, winner or standings input was rewritten.

### Final local validation

- Focused release/scoring/ingestion/UI/migration tests: **115 passed, zero failures**.
- Full suite: **625 passed, 104 production-guarded skips, zero failures**. Guards were not bypassed.
- V1/V2/V3 regression: **511,020 comparisons, zero differences** across 14,195 saved input rows; scorer implementations and weights unchanged.
- Typecheck and production build passed. Build used isolated Supabase/provider overrides.
- Lint: zero errors; only the known avatar `no-img-element` warning.
- `git diff --check` passed. Exact deployment and post-release smoke results are reported separately after pushing this intentional release.

Final data outcome: **V4 ACTIVE WITH PROVIDER COVERAGE CAVEATS — FANTASY RESULTS PRESERVED**.
