# Eleven Standard V4 — release-candidate safety review

This document records the completed pre-release safety pass. In the subsequent FINALIZE ELEVEN STANDARD V4 release, the product owner confirmed the remaining 21 fixtures synthetic. A guarded production transaction deleted those 21 fixtures, 15 stats and 15 scores (51 rows); protected fantasy history and remaining legacy score hashes were unchanged. All other ambiguous data was preserved. That confirmation resolves the suspected-fixture caveat below. The approved foundation migration was then applied through the normal Supabase CLI; all three existing rounds were pinned V3, catalog policy remained V3, and protected results/legacy score hashes were unchanged. Activation is a separate future-boundary policy operation after deployment verification. See the audit artifact’s `finalReleaseCleanup`.

This safety pass supersedes the cancelled historical calibration plan. No provider requests, historical rich-stat pull/backfill, weight tuning, release, V4 migration application or activation occurred. The only production writes were the explicitly authorized 30-row synthetic football cleanup below. Earlier calibration artifacts remain partial historical evidence, not completed calibration.

## 1. Starting state

- Branch `main`; HEAD and `origin/main` both `b16ac67694d0de3f268af7f9727995846565003d`.
- Started with 53 intentional modified/new V4 files. SHA-256 comparison with the pre-interruption record found zero changes left by the aborted pass. No unrelated changes were present.
- Preserved that implementation. This pass adds the policy selector/RPC, its catalog wiring/tests, a full migration rehearsal, a production-guard regression and these audit records. No dependency/configuration changes.

## 2. Migration safety

**SAFE WITH REHEARSAL CAVEAT**

`migration-rehearsal.test.ts` runs all 34 actual migration files, unchanged, in embedded PostgreSQL with the actual pgcrypto/unaccent extensions. Only Supabase-owned Auth prerequisites are simulated: roles, minimal auth.users, auth.uid/auth.role JWT settings, schema access. The production public schema, policies, functions, grants, indexes and triggers come from the real migrations.

Exercised both clean installation and populated upgrade. Fixture setup includes completed/active/upcoming V3 rounds, 102–98 final matchup results, canonical V3 score/breakdown, 12 roster/ownership/lineup entries and actual league/season/football FKs.

Checks cover:

- Clean chain parses/applies; migration alone returns catalog V3 and installs no V4 activation.
- Populated upgrade leaves canonical scores, matchup results, roster, lineup, ownership, matchups, seasons, transactions and events unchanged. Only intended nullable snapshot columns and V3 round pins are added.
- Completed, active and already-created upcoming rounds retain V3. Future activation assigns V4 to newly created post-boundary rounds even if callers request V1; existing rounds cannot change model/window. Legitimate round-status writes succeed.
- Retroactive/noncanonical/overlapping activation is rejected. Activation and round creation share the advisory transaction lock; native concurrent contention was not exercised.
- Authenticated/service catalog reads succeed; anonymous execution and client policy-table access fail. Service cannot UPDATE policy. Private trigger functions cannot be invoked by clients. Future activation does not switch today's catalog. A rollback-only isolated owner setup exercises an already-effective V4 catalog policy.
- Actual authenticated lineup RPC accepts a valid swap and rejects an invalid formation without changing either slot. Service rich-stat snapshot writes succeed without changing existing results.
- Injected mid-migration failure rolls back columns/table; retry succeeds. Raw replay fails on existing objects and rolls back cleanly. Like the repository's other additive DDL migrations, this is applied once through migration history, not manually replayed as idempotent SQL.

The same rehearsal also passed with an already-available temporary embedded PostgreSQL **17.5**, matching `supabase/config.toml` major 17. The committed test uses the repo's existing PGlite **18.3**. No new DB service, Docker, socket bridge, system installation or framework was introduced.

Limitations: no managed Supabase/PostgREST/Auth integration, production data copy, native multi-session concurrency or production migration execution. Production client integration tests remained guarded/skipped. Auth shims are not a complete Supabase platform. Initial V3 pinning is correct for this repository's existing global V3 round baseline; a different installation with actual V1/V2 rounds needs an audited mapping first.

Security: activation table remains RLS/private and append-only for service; trigger SECURITY DEFINER functions have empty search_path and qualified relations. New `get_catalog_scoring_version()` is SQL/STABLE/SECURITY DEFINER, has an empty search_path, reads only private policy, uses database statement time and accepts no version/as-of arguments. Only authenticated/service may execute; PUBLIC/anon are revoked. It exposes only the active global model, not scheduled policy/history or any write capability.

Rollback before activation: roll application code back first; remove the pin/activation triggers and their functions, catalog RPC and policy table; drop new round version and stats snapshot/position/participation columns if their new metadata can be discarded. No historical result restoration is needed because migration does not rewrite results. After V4 activation/results, preserve version columns, scorers and V4 history; append an approved future V3 policy rather than deleting V4 or changing existing round pins. Neither rollback was executed.

## 3. Synthetic audit method

SELECT-only audit of **28 production tables**, with deterministic pagination, through a GET/HEAD-only network guard. Inspected football catalog/stats/scores/mappings, national-team links, profiles, leagues/members/teams, seasons/rounds/matchups/results/lineups/rosters/ownership, drafts/orders/picks, waivers/trades/assets, scoring_rules, transactions and domain_events. Reviewed current helpers, migration FK/trigger history, Git history, and earlier simulation/seed references. No seed/demo table or runnable seed file was found.

The full sanitized record-level audit, including every suspicious internal UUID, kickoff, club/competition, provenance, child IDs/counts, classifications and dependencies, is [scoring-v4-synthetic-audit.json](scoring-v4-synthetic-audit.json). Private full before/deletion backups were saved outside the repo in `/tmp` with restrictive permissions; no credentials or emails are in the repository artifact.

Stored provider mappings cover **4,099 fixtures**; all were preserved. This establishes provider-backed provenance, not independent provider re-verification. Missing mapping/date/stat oddity alone never qualified a record for deletion.

## 4. Suspicious families

All six football families have Premier League as their stored competition and no provider fixture ID. None has a direct score-round pointer, any existing round-window usage, or a fixture/stat/score UUID referenced in transactions/events.

| Family / exact kickoff UTC | Fixture / stat / score rows | Reason / classification | Dependencies / action |
| --- | ---: | --- | --- |
| Real Madrid → Arsenal, 2015-03-05 12:00, final | 5 / 5 / 5 | Exact committed test fixture/window, player association and 90-minute/one-goal signature. **PROVEN SYNTHETIC** | Children only; deleted |
| Arsenal → Barcelona, 2015-03-06 12:00, live | 5 / 5 / 5 | Same committed scenario, 45-minute zero-event bench signature. **PROVEN SYNTHETIC** | Children only; deleted |
| Real Madrid → Arsenal, 2016-03-02 12:00, final | 9 / 8 / 8 | Acquisition test explicitly documents an earlier March-2016 leak; source now uses April and no exact earlier literal survives. **LIKELY SYNTHETIC — DO NOT DELETE** | No current round use; preserved |
| Arsenal → Manchester City, 2016-03-06 12:00, final | 9 / 4 / 4 | Same documented earlier leak and goal/assist scenario pattern; exact old provenance incomplete. **LIKELY SYNTHETIC — DO NOT DELETE** | No current round use; preserved |
| Real Madrid → Arsenal, 2091-03-05 12:00, final | 2 / 2 / 2 | Same test signature and documented 2090+ isolation convention; exact 2091 literal absent. **LIKELY SYNTHETIC — DO NOT DELETE** | No current round use; preserved |
| Arsenal → Barcelona, 2091-03-06 12:00, live | 1 / 1 / 1 | Same future-test suspicion. **LIKELY SYNTHETIC — DO NOT DELETE** | No current round use; preserved |
| League `517dd351-95fe-4ab9-9206-ea1be153f097` | 2 teams / 1 round / 1 matchup | Explicit `Eleven Integration Test 1790957945563` factory marker. **PROVEN SYNTHETIC** | Preserved fantasy records/identities; outside selected football cleanup, no candidate fixture lies in its round |
| League `dd27957b-d7cf-46f8-98d5-54eda3681492` | See audit | Generic “Test League” name. **UNKNOWN — DO NOT DELETE** | Preserved; name alone is not proof |

Real players/clubs were never deleted: a player's involvement in a synthetic fixture does not make their identity synthetic. Existing fantasy ownership of those players does not reference these deleted fixtures; all selected kickoffs are outside every surviving fantasy round, and their canonical score round pointers were NULL. Thus deleting these isolated performances does not alter a historical matchup or roster lock.

## 5. Exact cleanup

Reported exact counts before the operation. Executed **one** REST DELETE selecting the ten approved fixture UUIDs; existing ON DELETE CASCADE FKs removed their ten stat rows and ten score rows in the same PostgreSQL transaction. No sequential child/parent writes or new RPC/migration.

| Table | Deleted |
| --- | ---: |
| fixtures | 10 |
| player_match_stats | 10 |
| fantasy_player_scores | 10 |
| Every other table | 0 |
| **Total** | **30** |

Fresh preflight rechecked exact full fixture/stat/score records, mappings, every round window, and event/transaction references. Afterward all ten fixture IDs and all children were absent. Full remaining football-table scans found **zero orphan stats/scores**. Post counts: fixtures 4,120; stats 14,185; scores 36,174. The other 21 suspicious fixtures and their 15 stats/15 scores remain untouched.

Existing fail-closed production integration guard remains. Added a regression invoking the actual `createTestLeague` entry point with a fake production environment and a writer sentinel: rejection occurs before creating any identity/row. No production override was enabled.

## 6. Protected production state

Read-only before/after comparison confirmed substantive fields unchanged in leagues/teams/rounds/seasons, roster/lineup/ownership/memberships, matchup/results, existing transactions/events and mappings.

- Fantastic 4: same four teams (Kaka FC, 75 Hard, Los Duros FC, NiceTryBuddy), 64 roster entries acquired September 29, one September 29–October 6 Round 1, two matchups. No earlier history was added or removed.
- The Room: league `80f9181f-2c11-4dec-bffc-60a22ee0345f`, season `451ef9f0-b4bd-448b-bf54-7129aeb01644`, round `d4116438-42ef-4ed8-a62c-04d8471fa780`; same September 29–October 6 override.
- Audit ran against an active database: live-sync changed matchup/result `updated_at` timestamps and appended two `FOOTBALL_SYNC_LIVE-SYNC-TICK` events between snapshots. Existing score values/history were identical. This pass did not invoke that cron/provider flow; it cannot claim the entire live database was byte-for-byte frozen.

## 7. Catalog behavior

One request-scoped server selector calls the read-only policy RPC. Missing/error/unknown policy fails explicitly rather than silently falling back to V3. Added strict string validation to reject a malformed scalar response.

- Players rankings: selected active model for every aggregate page and enrichment; player DTO carries that version to Inspector. Sorting, current-season scope, ownership, pagination, negative rounding and no-score-versus-zero behavior remain unchanged.
- Free agents/recommendations: same selected model for recent-form scores, season fallback and displayed season totals; DTO carries the same model.
- Inspector: explicit Team/Matchup version stays pinned; unspecified/catalog version resolves the active server policy. Player+version retained-state keys prevent cross-model stale details.
- Historical round reads/results/provider corrections: round pin, never newest model. Corrections regenerate the active catalog model plus any affected pinned historical versions; no historical reinterpretation/backfill occurs.
- Game Rules: current league-round model when present; active catalog policy when no round supplies one. Existing V3/V4 configuration-driven presentation retained.

Migration alone seeds only V3, so deploying this candidate without activation keeps current evaluation V3. An explicit future activation switches new requests/catalog evaluation to V4 without redeploy or V3 history rewrites. Already-loaded client snapshots update on the next ordinary fetch/navigation; no activation broadcast infrastructure is added.

## 8. Ingestion readiness

Offline actual adapter → persistence row → scoring tests exercise positive, explicit zero, null and absent groups. Rich `reported_stats` preserves missing ≠ zero while legacy numeric columns retain old behavior. Participation club resolves actual club/national-team block; first captured fantasy position survives later corrections. V4 official recomputation rejects missing snapshots/position and does not guess clean sheets without participating-team provenance. Idempotent live/final/corrected replacement keeps one player/fixture/version score. No endpoint, ingestion frequency, quota or unsupported category was added.

## 9. Scoring table

Candidate `scoring-v4.ts` SHA-256 is unchanged from the starting V4 record. No weights were tuned.

Goals +7, shots +1, SOT +2, assists/penalty won +4; key pass/successful dribble/foul drawn +0.25. Tackle/interception/block +1 × GK/DEF .50, MID .25, FWD .10. Duels won GK .10, DEF .25, MID .20, FWD .15. Save +1, penalty saved +5. Clean sheet GK +7/DEF +6/MID +3/FWD 0 with 60+ minutes. Yellow −1, red −4, foul committed −.25, penalty missed −3. Appearance 1–59 +1, 60–89 +2, 90+ +3. Intended stacking retained; BMI/unsupported categories absent.

## 10. Legacy versioning

Re-ran stored-input parity against original V1 (`fef5e6f`) and starting-HEAD V2/V3: 14,195 saved input rows × four positions × three conceded contexts × three scorers = **511,020 comparisons; zero differences**, 170,340 per version. This was a pure regression check, not V3-vs-V4 statistical calibration or provider research. Completed/current/upcoming pins, corrections, multi-fixture cent aggregation, acquisition cutoff and starter/bench semantics are covered by focused tests.

## 11. Validation

- Focused tests: **211 passed**, zero failed.
- Full suite: **618 passed, 104 guarded integration tests skipped**, zero failed (722 total). No external Supabase integration battery or expensive simulation was run.
- PG18 and supplementary PG17: both clean-chain/populated-upgrade cases passed.
- Offline browser 375px/1440px: V4 rules/duels/rates/breakdown sum and 23.40 sample total; no overflow/runtime errors/outbound requests.
- Performance 2 actual-component browser regression: immediate swap paint (~11–14 ms in isolated local probe), deterministic lock/formation/stale/network rollback, stable canonical placement, queued fill, two Inspector detail reads, six navigation targets, zero outbound requests. These timings are not production latency measurements.

## 12. Typecheck / lint / build

Typecheck passed. Lint: zero errors; one pre-existing player-avatar `<img>` warning. Production Next build passed with loopback dummy public configuration and blank admin/provider keys, preserving dynamic authenticated route compilation without production data access. `git diff --check` passed.

## 13. Provider requests

**0 requests made by this pass.** Existing production live-sync continued independently, observed in read-only event records. No calibration/backfill/connectivity script or provider endpoint was invoked.

## 14. Production mutations

Exactly the 30 deletions in section 5. No migration, activation, scoring recomputation, league/season/round/window/standings/roster/ownership modification. No commit, push or deployment.

## 15. Remaining caveats

- **MEDIUM:** embedded DB/Auth-shim rehearsal is not managed Supabase/PostgREST or native concurrent verification. Migration must precede application deployment; new readers/writers require its columns/RPC. This pass did not apply it.
- **MEDIUM:** 21 suspected synthetic fixtures remain; provenance is insufficient for authorized deletion. Their remaining 15 stat/15 score rows may contaminate current-season catalog totals. Resolve provenance separately, without treating missing mappings as proof.
- **MEDIUM:** V4 catalog totals initially cover only stored V4 scores after activation/corrections. No automatic legacy-score fallback/mixing and no historical backfill; sparse coverage is represented honestly.
- **MEDIUM:** rich live provider coverage has not been empirically reverified in this zero-provider pass; earlier partial calibration remains incomplete. Future activation requires a separately approved boundary and must respect every existing round, including preserved test rounds.
- **LOW:** active production timestamps/events moved during audit; substantive protected history and all cleanup dependencies were verified unchanged. Database was not paused.
- **LOW:** existing avatar lint warning and already-loaded-client policy snapshots update on ordinary subsequent data requests.

## 16. Release status

**READY FOR V4 RELEASE REVIEW WITH CAVEATS**

Stopped for review. No release, production V4 migration or activation is authorized by this pass.
