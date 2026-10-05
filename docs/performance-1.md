# Performance 1: server and data latency

Baseline: `26404e16261d2ac2aa839565fe6cfb84e6dfdc89`, branch `main`.
The corrected RPC migration was subsequently approved and applied to Eleven
production. Release verification is recorded below. No application-data
mutation or provider operation was performed for the release.

## Evidence and limits

**Measured:** the original self-heal functions from the baseline commit and
the current functions execute against the same network-disabled ten-team
fixture in `scripts/performance-1-probe.mjs`. Actual query-builder executions
are counted; no real Supabase client or credentials are used.

```sh
node --conditions=react-server --experimental-strip-types scripts/performance-1-probe.mjs
```

| Scenario | Before reads | After reads | Writes |
| --- | ---: | ---: | ---: |
| Healthy ten-team Round 1 | 25 | 4 | 0 |
| Same league progressed beyond Round 1 | 25 | 3 | 0 |

The first reduction is 84%; the second is 88%. The probe pins its baseline
commit, so subsequent commits do not silently change the comparison.

**Measured in focused tests:** squad read graph: 9 reads; round enrichment:
6 reads; standalone shell starter state: 5 reads; normal Draft poll: 6 DB
reads plus one Auth lookup; engine lineup persistence: exactly one RPC.
These counts assume actual fixtures/players exist for the tested window.
Empty-data branches can do less work; pagination can add reads.

**Static estimates:** with one league membership, a current matchup, healthy
ten-team initialization, normal rosters, no historical inactive starter
identity supplement, and fixtures requiring club labels:

| Path | Before | After |
| --- | --- | --- |
| Team page alone, excluding shell/Auth | 42 DB reads | 20 in Round 1; 19 after progression |
| Team cold render including shell, excluding Auth/proxy | about 60 DB reads | about 26 in Round 1; 25 after progression |
| Matchup page alone, excluding shell/Auth | about 25 DB reads | about 22 |
| Matchup cold render including shell, excluding Auth/proxy | about 43 DB reads | about 27 |
| Team page major serial DB stages | about 38 | about 12 in Round 1; 11 after progression |
| Matchup page major serial DB stages | about 20 | about 11 |

Team page count: memberships/leagues/member count (3), team (1), self-heal
(25 → 4), squad (10 → 9), matchup (3). The shell previously independently
resolved profile (1), leagues (3), team (1), matchup (3), and both squads
(10). Now repeated context is memoized; Team adds profile (1) and its own
starter state (5). Matchup shares its own slot read with the shell, making
the shell's incremental contribution about 5 reads including profile.
These totals describe cold render composition, not every client navigation:
Next can retain a shared layout during navigation.

No production/Vercel↔Supabase latency was timed. The tests use local mocks
and embedded Postgres; their elapsed milliseconds do not predict remote
response time. Real p50/p95 navigation and mutation timings remain to be
measured after migration approval and deployment to a safe environment.

## Changes and preserved semantics

### Round-one recovery

`ensureRoundOneOpenedForSeason` reads the latest round and its window in
one query. Beyond Round 1 it returns without scanning historic rosters.
While still in Round 1, `repairIncompleteRoundOne` pages one batched active
roster read with left-embedded round slots, instead of two serial reads per
team. A team with even one existing slot remains untouched, preserving the
existing protection for manager edits. Zero-slot teams still use the same
automatic initializer, including its international fixture locking.
An error in the completeness read never authorizes a repair.

Missing round creation, completed-season behavior, draft gates and round
windows remain in the existing lifecycle engine. Tests cover healthy,
incomplete, partial, missing and progressed initialization, pagination,
read failure, and successful missing-round recovery.

### Navigation read graphs

* Team: roster and latest round read concurrently, then slots overlap score
  and fixture enrichment. Score IDs/kickoffs now share one fixture read.
* Shared round enrichment: points and display-fixture branches run
  concurrently. Club plus national-team membership remains authoritative;
  fixture priority and acquisition-cutoff calculations are unchanged.
* Matchup: both slot reads overlap the active-roster read; enrichment then
  derives both squads. Fixture intelligence runs beside squad work, and
  uses stored round bounds in SQL. Participation identities are reused.
  Locked historical starters outside the active roster receive an extra
  batched identity lookup when needed, without changing their existing
  score/display enrichment. This edge case adds two reads.
* Home: matchup-dependent work begins as soon as the matchup resolves,
  beside standings/activity/intelligence/trades. Current vacancy counts
  use a lightweight active-roster read, instead of loading another full
  own squad. With a matchup, its shared squad supplies Home's lineup.
* Shell: own starter state uses the same historical filtering, fixture
  selection, lock rewrite and squad derivation as Matchup. It fetches no
  scores or opposing squad. Only the summary crosses into StatusBar props.
* League/Home: trade composition rosters are absent from initial renders.
  Opening the dialog triggers one paginated, league-scoped roster read.
  Trade proposals and acceptance still use the existing authoritative RPCs.

### Request context

React `cache` wraps the request Supabase client, verified current user,
profile, memberships, team resolution, current matchup, and reusable squad
and slot reads. The Players/Draft wrappers consume the resolved team rather
than looking it up again. No persistent client, auth, league or ownership
cache was introduced. Each RSC request gets its own React cache; actions
outside that dispatcher construct fresh clients normally. An actual React
server-render test proves duplicate reads share a request result and later
requests/different clients fetch independently. Existing league selection
and auth guard logic stays in place.

### Substitution and atomicity

Before:

```text
Auth → team → round → roster → full lineup validation read
→ outgoing PATCH → incoming PATCH → revalidatePath
→ action Flight render → explicit router.refresh → another Team read graph
```

After:

```text
Auth → team → (round || roster) → one update_team_lineup RPC
→ revalidatePath → fresh action Flight render → confirmed UI
```

The installed Next 16.3.6 action handler (`executeActionAndPrepareForRender`
in `next/dist/server/app-render/action-handler.js`) sets `skipPageRendering`
false after page revalidation and executes invalidations before generating
Flight. Its bundled `revalidatePath` guide explicitly states that Server
Functions update the UI immediately when viewing the affected path.
Therefore the explicit second Team refresh is removed for swaps and fills.
React transitions keep edits guarded until that authoritative payload
commits. No optimistic lineup state was added. Team still re-renders once.

The corrected RPC serializes team lineup batches, locks current ownership
before slots and changed roster records, and validates active status plus
the exact current ownership identity, latest round, membership, locks and
4-4-2 against database state. It then executes one batch UPDATE. Direct
authenticated lineup DML and its old UPDATE policy are removed. Stable
engine/action errors remain. The kickoff threshold
and stored `locked_at` values are unchanged. Managers use the DB clock;
only trusted service-role simulation accepts the explicit injected clock.
The existing golden-path test's authenticated lock rejection now sets its
isolated slot in the real past, matching that manager-facing clock contract.

Embedded Postgres runs the exact migration against an isolated schema.
Tests cover authenticated owner/non-owner/former-member access, service-role
clock injection, exact kickoff lock rejection, formation and canonical
positions, stale roster/missing round/duplicate input, batch fills, and a
trigger failure proving both swap writes roll back. This is local SQL
validation, not a full Supabase/PostgREST or browser integration run.

### Players and Draft

Before points-sort: ownership/context → paginated candidate catalog →
paginated raw season score rows → JS aggregation/sort → page rows →
usage/fixtures plus another page score read.

After: ownership/context → (candidate pages || SQL aggregate pages) →
unchanged JS ordering/pagination → page rows → usage/fixtures, reusing
ranking totals. `get_player_score_totals` returns one unrounded sum and
appearance count per player, scoped to season and scoring version. JavaScript
still rounds totals/averages, including negative half cases. Missing score
keys, Players/Draft name tie-breaking, ownership and page completeness are
preserved. Home now explicitly breaks equal-score ties by player ID instead
of depending on database/Map traversal order. RPC read
errors fail closed instead of exposing a partial ranking.

If there are S scored performances and U scored players, transferred score
rows fall from S to U; response pages fall from roughly ceil(S/1000) to
ceil(U/1000), with an extra terminal page for exact multiples. Postgres still
aggregates on requests/pages, and catalog sorting still runs in JS. No
materialized result or persistent cache was added; measuring that remaining
SQL work comes before introducing invalidation complexity.

Command search reads only club matching plus six compact player identities;
it does not load scores, usage, fixtures or league ownership. Identity hits
use deterministic name/id order rather than points ranking.

Draft's five-second polling now calls a read-only action for draft state
and league ownership. It does not refresh the route, shell, catalog or
scores on every tick. Polls do not overlap, failed reads retain known state,
and older/different-draft/lifecycle-regressing results cannot supersede fresh
mutation props. Completion still performs an authoritative route refresh.
Pick/timeout mutation refresh behavior is otherwise unchanged.

## Validation and deployment boundary

* Focused tests after safety correction: 37 passing across self-heal, data
  access and local SQL RPCs.
* Broader `npm test`: 500 passing, 104 skipped, zero failures. Supabase
  credentials were removed from the test process; the production guard was
  not bypassed and no configured integration database was contacted.
* Typecheck, affected-code ESLint, full `npm run lint` and production build
  pass. Full lint retains one pre-existing `player-avatar.tsx` img warning;
  zero lint errors. No unrelated avatar change was made.
* Build uses loopback placeholder public credentials and empty admin keys,
  overriding `.env.local` values without editing that file. Authenticated
  routes remain dynamic in the build output.
* `@electric-sql/pglite` is a development-only dependency for in-memory SQL
  tests, not production infrastructure or a client dependency.

Migration: `20261007000000_performance_lineup_and_score_reads.sql` creates
`update_team_lineup(uuid,uuid,jsonb,timestamptz)` and
`get_player_score_totals(int,text,uuid[])`, with restricted execute grants.
It also revokes manager/public/anonymous INSERT/UPDATE/DELETE on lineup slots
and drops the former authenticated owner UPDATE policy, preserving SELECT
and service-role privileges.
It creates no tables/indexes, rewrites no scoring data, changes no roster
rows and performs no backfill. It was initially withheld outside local
in-memory tests pending approval; the approved production application and
release checks are recorded below. The application release depends on both
RPCs being present before deployment.

## Final migration safety review after correction (pre-release)

### Exact function scope

`update_team_lineup` reads/locks the requested fantasy team, reads the
league's latest stored round through the existing `_current_round_id`,
locks current team ownership rows in player-ID order, locks round slots in
slot-ID order, and locks changed roster entries in entry-ID order. It reads
canonical player positions to validate the resulting eleven starters.
Changed entries must be active and match the current ownership record's
roster-entry, league, team and player IDs; a historical team association
alone is insufficient. It writes only `lineup_slots.starter` and `slot` for
the requested entries/round. The existing update trigger updates
`updated_at`. It never writes `locked_at`, roster status, ownership,
rounds, scores or other historical slots.

`get_player_score_totals` reads scores and fixtures only, filtering fixture
season, score version and optional player IDs. It returns player UUID,
unrounded NUMERIC SUM(points) and BIGINT COUNT(*), grouped/ordered by UUID.
It has no write statement. Creating/replacing either function never runs
its body; applying the migration changes function/policy/privilege metadata
only, with no existing-row mutations or backfill.

### Authorization and legitimate writers

Both functions use fixed `search_path=public`, qualified table names, no
dynamic SQL, PUBLIC/anon EXECUTE revocation and authenticated/service-role
EXECUTE grants. The lineup function is SECURITY DEFINER: because it bypasses
table RLS, it explicitly checks the manager's verified `auth.uid()` against
the team owner and `is_league_member`. Service role bypasses manager identity
checks and may inject the simulation clock; it still enforces roster,
ownership, round, formation and lock rules. Managers always use the DB clock.
The score function is STABLE SECURITY INVOKER, retaining caller SELECT/RLS.
Repository grants give managers schema USAGE, not CREATE; the migration
assumes the existing trusted schema/function-owner setup. Live production
ACLs/owners were not inspected, per the no-production-access constraint.

| Legitimate writer | Authorization after correction |
| --- | --- |
| `swapLineupAction` / `fillEmptySlotsAction` → `updateLineup` | Authenticated RPC; independent owner/member/current-roster/game-rule checks |
| `createRoundLineupSlots`, called by opening/recovery/simulation flows | Service-role direct UPSERT; existing privileged grant retained |
| `reconcileFantasyRound` | Service-role direct UPDATE of `locked_at`; existing privileged grant retained |
| `drop_player` → `_release_current_round_slot` | Existing SECURITY DEFINER transaction privileges; real SQL drop tested locally after revocation |
| `sign_player` → `_init_current_round_slot` | Existing SECURITY DEFINER transaction privileges; no authenticated table grant required |
| `accept_trade` → release/init helpers | Existing SECURITY DEFINER transaction privileges; historical locked snapshots retained |
| Test setup/cleanup, simulation setup, trusted account deletion/cascades | Existing service-role or privileged database ownership, unchanged |

The publicly executable release/init helpers are INVOKER functions, not
independent manager DML authorization. Calling the release helper directly
cannot demote an unlocked starter after UPDATE revocation (tested). Within
the authorized market/trade DEFINER transactions they inherit the trusted
execution context. Manager direct INSERT/UPDATE/DELETE is denied, even on
their own slots and even for `locked_at`. The member SELECT policy remains.

### Round and transaction semantics

Both Team actions, squad reads and market/trade helpers select the latest
stored round by descending `number`. The RPC enforces that exact selector
before locking and checks it again after locking. Historical/nonexistent
future/other-league round IDs cannot be supplied. The latest stored round
may start in the future and remains editable before individual kickoff
locks; there is deliberately no invented date, status or season gate.
Service-role lineup edits also target the latest round. Existing simulation
adversarial historical edit attempts remain rejected; simulation progression
edits each round while it is latest.

Every changed starter OR bench slot rejects `locked_at <= authoritative now`.
Unknown lock/slot input fields cannot alter stored locks. Canonical positions
and exactly 1 GK / 4 DEF / 4 MID / 2 FWD are required. Unchanged historical
locked starters still count toward formation and historical scoring; they
are not forcibly removed or demoted. A validation, constraint or trigger
failure rolls back the single UPDATE, including both halves and timestamps.
A transport failure after commit can still leave a committed whole swap;
atomicity never promises that an ambiguous client timeout means no commit.

### Concurrency review

Team serialization uses FOR NO KEY UPDATE, compatible with roster insertion
FK KEY SHARE locks. The mutation then takes ownership → slot → changed
roster locks, matching departure writers, with deterministic row order.
Ownership uses NOWAIT because existing multi-asset trade traversal is not
ordered: contention safely aborts for retry instead of waiting in a possible
cycle. The RPC records exactly which ownership entries it locked; ownership
appearing after that query cannot silently pass validation without a lock.
A controlled local SQL interleaving test covers that late-arrival boundary.
Reconciliation and round initialization write slots with trusted privileges;
their existing operations/transaction structure were not redesigned.

The embedded PGlite harness is one connection; it cannot run concurrent
Postgres sessions. No local `postgres`/`psql` installation was available.
Real multi-session contention/deadlock behavior and PostgREST transport remain
unmeasured, not claimed proven by the deterministic interleaving test.

### Score equivalence and call sites

The sole lineup RPC gateway is `src/lib/fantasy-engine/lineup.ts`:
UUID/string team and round IDs, JSON array of roster-entry UUID / boolean /
nullable position, and ISO timestamptz are compatible. Team swap/fill and
service-role simulation use this gateway. SQL VOID produces no useful
payload; callers inspect only `error`, so the existing `Returns: undefined`
type does not affect behavior. Known SQL exception messages map to existing
error codes; contention/unexpected errors map to WRITE_FAILED.

The sole score RPC gateway is `getFantasyScoreAggregates` in players.ts.
Players and Draft ranking/page enrichment and Home intelligence use it.
Arguments remain CURRENT_SEASON=2026, ELEVEN_STANDARD_V3 and optional UUID
arrays. Numeric/count JSON values are converted with Number, then the same
JS two-decimal rounding expressions are used. Omitted IDs mean all players;
an empty list returns no rows; missing scores remain absent; actual zero
scores count as appearances; SQL points are NOT NULL. Pagination uses the
ordered grouped rows past 1000, and Players/Draft points/name ordering remains
unchanged. Home tied season leaders (and recent averages) now use immutable
player ID as an explicit final tie-breaker, adding no catalog-wide read.

Actual V3 scoring consumes integer stats and produces quarter-point values,
which binary JS sums represent exactly at application-sized totals. Tests
generate 128 real V3 performances across all positions and compare SQL sums,
counts and JS-rounded averages with the old reducer. This equivalence claim
does not extend to arbitrary non-quarter stored values or unbounded sums;
the earlier -3 + 2.05 average discrepancy remains a documented boundary, not
a reason to change current scoring/rounding. Read failures still fail closed,
and multiple aggregate pages do not share one MVCC snapshot during ingestion,
as with the previous raw-row pagination.

### Redeployment, rollback and remaining risks

CREATE OR REPLACE signatures/return types are unchanged; repeating grants,
revokes and DROP POLICY IF EXISTS is safe. A repeat application to the local
test DB left rows/timestamps unchanged and retained the restricted ACLs.
The migration depends on the existing `_current_round_id` migration and must
follow repository migration order. No already-applied migration was edited.

Conceptual rollback only: first stop/roll back callers of the new RPCs, then
drop `public.update_team_lineup(uuid,uuid,jsonb,timestamptz)` and
`public.get_player_score_totals(integer,text,uuid[])` in a new compensating
migration, without CASCADE. Keep the manager DML restriction; temporarily
disable lineup editing or retain the corrected RPC until a safe replacement
is ready. Restoring the legacy UPDATE grant/policy merely to support the old
REST writer would reopen the identified bypass. Rollback never undoes swaps
already committed by legitimate calls. No rollback file/action was created.

* CRITICAL: none identified in the corrected migration/repository boundary.
* HIGH: none identified.
* MEDIUM: none identified as an unresolved correctness/security blocker.
* LOW: concurrent market/trade contention can cause a retryable save failure;
  real multi-session/PostgREST integration remains unrun; runtime migration
  owner/ACL assumptions have not been checked against production; arbitrary
  non-quarter data is outside the proven current-V3 rounding boundary.

The pre-release recommendation was **SAFE TO APPLY WITH MINOR CAVEATS**.
At that review boundary, no migration outside the in-memory test database,
production/provider operations, commit, push or deployment had occurred.

## Approved production migration and release verification

The user explicitly approved applying only this migration, then committing
and fast-forward pushing the complete Performance Pass 1 after verification.

* Pre-flight branch: `main`; local HEAD and `origin/main` both
  `26404e16261d2ac2aa839565fe6cfb84e6dfdc89`.
* Linked production project: Eleven, `oknhqdiinaxofrzxphxf`, ACTIVE_HEALTHY.
  Remote migration history matched all prior local versions. The only pending
  migration was `20261007000000_performance_lineup_and_score_reads.sql`.
* CLI dry-run confirmed that exact single migration, with no seeds or roles.
  Application used `supabase db push --linked --skip-vault --yes`; no vault,
  seed, role, repair, reset, backfill or other migration operation was requested.
* Production history records version `20261007000000`, name
  `performance_lineup_and_score_reads`, eight SQL statements. No newer
  unexpected migration was present at verification.
* Both deployed function bodies match the reviewed SQL (MD5 of `prosrc`):
  lineup `9c55ab5313c3d22b2790613af1770f43`; score
  `18251182555fcbbb78405b5dfb2c220f`. Both are owned by `postgres`, with
  `search_path=public`. Lineup is DEFINER/VOLATILE, score INVOKER/STABLE.
* Authenticated/service EXECUTE is granted; anon/PUBLIC EXECUTE is absent.
  Authenticated lineup INSERT/UPDATE/DELETE and column UPDATE privileges are
  absent. The old UPDATE policy is absent. RLS and the original member SELECT
  policy remain enabled/unchanged. Service-role INSERT/UPDATE/DELETE and
  BYPASSRLS remain available. Public schema CREATE is denied to anon/authenticated.
* An explicitly READ ONLY transaction with an existing member's local JWT
  claims and authenticated role successfully read 16 lineup slots and 2,561
  grouped player-score rows, then rolled back. No credentials or user identity
  were exposed; no game rows were written.
* PostgREST read smoke returned HTTP 200 from the score RPC with an empty-ID
  filter. The actual `queryPlayerDatabase` points path returned one requested
  player from a catalog of 2,735. A request guard allowed only GETs and the
  read-only score RPC POST: 13 reads, zero mutation/provider requests.
* Public Home/Team/Matchup/Players HTTP checks reached the expected login page
  with HTTP 200 and no server-error page. Computer-use permission was disabled;
  the user independently confirmed all four authenticated pages were "all good".
* Final focused tests: 37 passed, zero failures. Typecheck, full lint and
  production build passed. Lint retained one pre-existing avatar img warning.
  The build again used loopback placeholder credentials and empty admin/provider
  keys. Mutation-capable production integration tests were not run; their guard
  was not bypassed. Earlier full suite remains 500 passed / 104 skipped.

Production application rows intentionally modified by the migration: **zero**.
Migration-history and function/policy/privilege metadata changed as approved.
Provider requests made by the agent: **zero**. No real lineup mutation was
used as a smoke test. Multi-session contention and production mutation
transport remain covered by reasoning/isolated regression tests rather than
a production write test. Commit, push and deployment results are reported
with the release response; no Performance Pass 2 or Scoring V4 work is included.

## Remaining work for Pass 2

Measure actual authenticated p50/p95 response and mutation timings. Add
loading/Suspense boundaries and assess dynamic-route prefetch, since the
app still has no `loading.tsx`. Design safe optimistic substitutions and
rollback separately. Team still revalidates/renders after a write; broad
visited-route invalidation remains the installed Next behavior. Draft
pick/timeout and trade mutations still contain refresh calls worth auditing.
Fixture/participation work overlaps but is not completely deduplicated across
shell, squad and intelligence; standings/intelligence and per-league member
counts remain additional work. SQL grouping and catalog sorting still run
on fresh ranking requests. Any cross-request catalog cache needs explicit
score-version/freshness/invalidation rules and measurements first.

## Changed files

```text
docs/performance-1.md
package-lock.json
package.json
scripts/performance-1-probe.mjs
src/app/(app)/draft/actions.ts
src/app/(app)/home/page.tsx
src/app/(app)/layout.tsx
src/app/(app)/league/page.tsx
src/app/(app)/league/trade-actions.ts
src/app/(app)/matchup/page.tsx
src/app/(app)/players/actions.ts
src/app/(app)/team/actions.ts
src/components/dashboard/trade-desk.tsx
src/components/draft/draft-page-client.tsx
src/components/league/trade-center.tsx
src/components/shell/app-shell.tsx
src/components/team/team-workspace.tsx
src/data-access/drafts.ts
src/data-access/intelligence.ts
src/data-access/leagues.ts
src/data-access/matchups.ts
src/data-access/performance.test.ts
src/data-access/players.ts
src/data-access/profiles.ts
src/data-access/roster.ts
src/data-access/teams.ts
src/lib/draft-snapshot.ts
src/lib/fantasy-engine/golden-path.integration.test.ts
src/lib/fantasy-engine/draft-engine.integration.test.ts
src/lib/fantasy-engine/lineup.ts
src/lib/fantasy-engine/performance-rpcs.test.ts
src/lib/fantasy-engine/rounds.performance.test.ts
src/lib/fantasy-engine/rounds.ts
src/lib/performance/test-client.ts
src/lib/supabase/database.types.ts
src/lib/supabase/server.ts
src/lib/supabase/service-role-status.ts
supabase/migrations/20261007000000_performance_lineup_and_score_reads.sql
```
