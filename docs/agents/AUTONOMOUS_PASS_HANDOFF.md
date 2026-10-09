# Autonomous Stabilization Pass — Handoff Document

Agent-neutral. Updated 2026-10-09 by Codex after continuing Claude's handoff.
Detailed evidence: `docs/audits/draft-stabilization-2026-10-09.md`.

## 1. Current objective

Phases A/B/C/D/F/E1 were already complete and have not been repeated.
E2/E3/E4/E6 and G are now implemented and validated. Phase H validation and
review are complete; the sole additive synchronization migration is applied and production
invariants are unchanged. Commit/push and verify Vercel production and read-only
smoke. Never repeat existing position overrides or live lineup repair.

## 2. Completed phases

- A: clean baseline independently confirmed at `af0cda0`, main, eight ahead
  of freshly fetched `origin/main` (`308f9029`). All eight commits reviewed.
- B: canonical position overrides and 4-3-3 support already production.
  Exactly four approved overrides retained, raw provider positions untouched.
  All four prior migrations matched remote history. Production function bodies
  exactly match canonical/dual-shape repository definitions. Dual 4-4-2/4-3-3
  acceptance is retained for rollout compatibility; no narrowing migration.
- C: existing partial-lineup provisioning/repair retained. No production repair
  repeated. Five real XIs remain valid 4-3-3, every active roster 16/11/5;
  manual selections preserved. Simulation uses the actual lifecycle and lineup
  functions, proves partial provisioning and repeated repair are idempotent.
- D/E5: structured action diagnostics and stale-search response protection
  retained. Protection also closes the keystroke-to-debounce gap and unmount.
- E1: scoped score aggregation retained and measured read-only in production;
  one candidate returned one total versus 2,570 whole-catalog totals.
- E2: Realtime events reconcile narrow authoritative state, single-flight and
  duplicate-coalesced. Polling remains every five seconds. No active-pick
  route revalidation/refresh; one completion refresh. Waiting lobby listens for
  draft start, with a compact RLS status read and polling fallback.
- E3: database-clock/monotonic countdown with half-RTT compensation; expired
  display reconciles server state, safely retries the same counter, and never
  carries an old zero into the next deadline. Managers cannot forge expiry.
- E4: row lock before resolver reads; turn-bound manual/timer RPCs handle
  simultaneous picks/autopicks, duplicate clicks, adjacent snake turns, stale
  requests and accurate outcomes. No automatic retry of a manual selection.
- E6: mount, polling, rejoin, focus, visibility and online reconcile missed
  state. Full remount/device reconstruction, disconnection and rejoin tested.
- F: competition names/dead-end filtering retained, corrected to page all
  active players past PostgREST's 1,000-row cap.
- G: two isolated five-manager/80-pick drafts passed using real PostgreSQL 17,
  independent connections and all 44 real migrations. Primary scenario races
  manual/auto picks; second races two resolvers on all 80 autopicks. Ten valid
  4-3-3 XIs total; ownership unique; manual slots and idempotence preserved.
  Autopick now prefers a third forward before spare depth, making all-auto
  squads 4-3-3-feasible without changing manual roster min/max or draft order.

## 3. Remaining phases

Only H application release steps remain: synchronization migration applied
through normal Supabase mechanism; all preserved production rows identical.
Commit intentional continuation, fast-forward
push main, verify GitHub Vercel check AND Production deployment success, run
non-destructive production smoke, and verify clean Git + all invariants again.
Do not infer deployment success from Git push. Record the resulting state here.

## 4. Current Git state

Starting main HEAD `af0cda0`, remote `308f9029`, eight committed local changes.
Continuation is intentionally uncommitted, validated and migration-verified, ready for release.
Existing commits reviewed: `3a0ce93`, `2e93483`, `d6221d0`, `87d2b99`, `f74197d`,
`c820023`, `dd649d4`, `af0cda0`. No unrelated files were found.

## 5. Production state

Supabase project `oknhqdiinaxofrzxphxf`. Before continuation release, all
migrations through `20261016000000` applied. Realtime publication now includes
drafts, draft_picks and league_player_ownership; it previously had zero tables. Original 80 picks match snapshot exactly including timestamps.
All five teams have 16 active players, 11 starters and 5 bench, valid 4-3-3,
no duplicate players/wrong slots. 80 ownership rows; two inactive historical
roster rows and corresponding historical slots are preserved, not deleted.
Four approved overrides, all roster/slot rows, raw/canonical positions, and
final matchup/score rows unchanged in the post-migration comparison.
Application changes have not yet been pushed/deployed at this checkpoint.

## 6. Database changes

Already applied; DO NOT rerun:
`20261014000000_position_classification_overrides.sql`,
`20261015000000_canonical_position_resolution.sql`,
`20261015000100_formation_4_3_3_and_canonical_position_lineup.sql`,
`20261015000200_formation_dual_shape_transition.sql`, and
`scripts/one-off/position-overrides-2026-10-09.sql`.

Sole new migration (applied once): `20261016000000_draft_synchronization.sql`. INVOKER clock
read respects existing RLS; DEFINER wrappers check authenticated membership and
expected turn under row lock; resolver locks first and uses the database clock
for managers. Adds drafts/draft_picks/league_player_ownership to existing
supabase_realtime publication, idempotently. Existing signatures compatible;
no table-data rewrite, roster repair, position change or settled score update.

## 7. Test results

779 passed / 0 failed / 104 guarded skips. Focused synchronization/action/
data-access suite: 21 passed. TypeScript clean. Lint: existing player-avatar img
warning only. Production build passed with unreachable loopback Supabase URL
and empty admin/provider credentials. Core V2 and optimistic lineup browser
regressions passed at 1440/375/320; actual draft browser harness passed at
1440/375 with skew, races, expired timer retry, completion, search/reconnect.
Real PostgreSQL concurrency simulation passed; migration reapplication preserved
picks. Never run the production-writing integration suite.

## 8. Known issues / limits

- Historical PLAYER_NOT_FOUND root cause remains unreproduced; structured
  diagnostics retained. No fabricated cause or speculative identity rewrite.
- Manual roster minimum permits two FWD, whereas 4-3-3 needs three. Existing
  feasibility/conflict reporting preserves selections. Autopick now secures
  three. All five real repaired teams are already feasible and valid.
- Live future-draft fanout cannot be exercised on a completed real draft
  without production gameplay writes; isolated browser/database tests cover it.
- Measured local event-to-visible updates: approximately 70–73ms; lost events
  recover via five-second fallback. Warm production SQL scoped aggregation:
  25–40ms versus 67–72ms whole catalog, one versus 2,570 totals. These are
  separate DB/local measurements, not Vercel end-to-end latency claims.
- Club-competition promotion/relegation infrastructure and historical matchup
  position presentation remain out of scope, unchanged.

## 9. Next actions

Follow section 3 exactly. Recheck Git/remote, do not reapply recorded migrations
or recovery scripts, do not simulate against production. Use deployment check
and Production deployment status for the exact pushed SHA, then safe read-only
smoke. Preserve all completed work and report an exact blocker if release fails.
Replace this checkpoint's release state after verification; do not start a new
optimization, scoring, provider or design pass.

## 10. Safety constraints

- Never reset, delete, restart or redraft any real league.
- Preserve all original 80 draft picks, every current ownership/roster/slot and
  intentional manual choice. Never sign/drop/reassign players for managers.
- Preserve four canonical overrides and all settled scores/results/history.
- No scoring weights/provider fetches/historical refetches or destructive DDL.
- Never run `npm run test:integration` with production credentials. Simulations
  accept only a temporary loopback PostgreSQL runtime, never a production URL.
- Do not rerun completed migrations or existing override/lineup repairs.
- Do not narrow the deployed dual-shape lineup compatibility window.
- Never release failing/unreviewed code or force a non-fast-forward push.
- Verify Vercel deployment independently and final Git state/invariants.
