# Draft stabilization — 2026-10-09

## Scope and release baseline

Continuation of the Claude handoff at local `af0cda0`, main, initially eight
commits ahead of freshly fetched `origin/main` (`308f9029`). Existing phases
A/B/C/D/F/E1 were preserved, not repeated. All eight commits were reviewed:
`3a0ce93`, `2e93483`, `d6221d0`, `87d2b99`, `f74197d`, `c820023`, `dd649d4`,
`af0cda0`.

Read-only production `pg_get_functiondef` comparisons confirmed the deployed
canonical `_perform_draft_pick`, `sign_player`, `accept_trade`, and original
`resolve_expired_pick` bodies exactly matched `20261015000000`; the deployed
`update_team_lineup` matched `20261015000200` exactly. The four existing position/
formation migrations were already recorded remotely and were not rerun.
The dual 4-4-2/4-3-3 acceptance remains for rollout compatibility. Historical
scoring continues using provider positions; canonical positions affect roster
presentation/eligibility, not settled score recalculation.

## Implemented

- Realtime draft/pick/ownership events trigger one authoritative, narrow state
  read. Duplicate bursts coalesce; events during a read schedule a follow-up.
  Five-second polling remains; subscribe/rejoin, online, focus and visibility
  changes reconcile missed events. Completion refreshes once; active picks do
  not invalidate the current Next Flight tree or reload the player ranking.
- Countdown uses database time plus a monotonic receipt anchor and half-RTT
  compensation. A displayed zero calls a server resolver and reconciles actual
  state. A not-yet-expired or failed resolution retries only that same turn;
  a new deadline cannot inherit the previous turn's zero.
- Manual and timer attempts carry the observed overall snake-pick counter.
  New RPCs lock the draft before checking that counter. Delayed requests,
  including adjacent turns for the same manager, cannot silently select on a
  later turn. Manual picks are never automatically retried. Duplicate clicks
  are guarded immediately, before React rerenders.
- Resolver now locks before expiry/roster/candidate reads. Manager-supplied
  `p_as_of` cannot forge expiry; trusted service-role clock injection remains
  compatible. Autopick secures a third forward before spare depth for 4-3-3;
  existing manual squad min/max and draft order remain unchanged.
- Multi-request reads straddling a pick retry up to twice rather than publish
  mismatched turn/history. Confirmed picks overlay lagging ownership reads.
- Search invalidates older requests at the keystroke, including the debounce
  gap. Competition filters page all active players past PostgREST's row cap.
- First-round opening still uses the existing production lifecycle/lineup
  functions and now runs only once a draft is actually completed.

## Necessary additive migration

`20261016000000_draft_synchronization.sql` adds an RLS-respecting INVOKER clock
read, authenticated/member-checked DEFINER turn-bound wrappers, the locked
resolver replacement, and three tables to the existing Realtime publication.
The publication existed but had no tables before this pass. New/read RPC
signatures match the checked-in Supabase types and all application call sites.
Existing RPC signatures remain compatible. Public/anonymous execution is
revoked; the read respects existing table RLS; member wrappers re-check auth.
Function creation/publication membership rewrites no game rows. Real PostgreSQL
reapplication checks preserved all picks and publication membership.

Migration applied through `supabase db push --linked --yes`; dry-run listed only
this migration. Exact post-apply function-body/ACL checks and all three publication
tables passed. Every captured production invariant dataset was byte-equivalent
as parsed JSON before/after: 80 picks, 80 ownership rows, 82 roster/lineup rows,
80 canonical/raw position pairs, four overrides, three final matchups and six
final score rows. Application push/deployment remains the next release step.

## Validation

- Full suite: **779 passed, 0 failed, 104 guarded skips**. Live integration
  guards were not bypassed; no production-backed test suite was run.
- Focused actual server-action/data-access/clock/synchronization suite:
  **21 passed**. Full suite includes position-override SQL, acquisition SQL,
  lineup repair and historical scoring-isolation regressions.
- TypeScript and production build passed. Build used an unreachable loopback
  Supabase URL, empty admin/provider credentials, and made no provider calls.
- Lint: zero errors; only the existing `player-avatar.tsx` img warning.
- Core V2 browser regressions: 1440/375/320, 21 states each, no overflow or
  runtime errors. Existing optimistic-lineup/performance browser suite passed.
- Actual draft client browser harness: 1440/375, ±10-minute wall-clock skew,
  duplicate events, lost-event polling, stale search, stale manual outcome,
  repeated expired-timer reconciliation, duplicate clicks, canonical success,
  reconnect/remount and one-time completion refresh. No HTTP requests allowed. Waiting-lobby draft-start events trigger one
  authoritative status read/route refresh without loading player rankings.
- Real PostgreSQL 17 applied all **44 migrations** in a temporary
  loopback-only cluster with independent manager connections. Primary five-
  manager draft completed **80 picks**, **80 unique ownerships**,
  **21 rejected race losers**, **5 rejected late attempts**,
  **80 searches**, **8 reconnects**, **80 snapshot refreshes**. The manual/auto
  split varies with real scheduler races (latest 74/6).
- Second five-manager draft completed **80 autopicks** with **80 duplicate
  resolver races**. Both scenarios produced five 16-player squads, five valid
  11-starter/5-bench 4-3-3 lineups. Partial provisioning preserved the existing
  manual GK row byte-for-byte and was idempotent on repetition.

## Measured performance (not production end-to-end latency)

Actual draft client with local deterministic snapshots: Realtime hint to
visible turn **70.3 ms at 1440px**, **72.7 ms at 375px**;
missed events recovered in **3.29–3.27s** from the test's
position in the five-second polling interval. Zero active-pick route refreshes.
Local PostgreSQL pick p50 **0.79 ms**, p95
**23.08 ms**, including intentionally queued row-lock
races; not representative of Vercel↔Supabase network latency.

Read-only production EXPLAIN ANALYZE for V4 2026 score totals (three alternating
runs) compared the old whole-catalog scope with the Guehi search scope:

| Run | All players: DB ms / rows | Guehi candidate: DB ms / rows |
| --- | --- | --- |
| 1 | 3884.085 / 2570 | 199.166 / 1 |
| 2 | 72.051 / 2570 | 24.708 / 1 |
| 3 | 66.786 / 2570 | 39.582 / 1 |

First-run cache effects are substantial; do not claim a cold-start speedup from
ordered samples. Warm scoped reads were 25–40ms versus 67–72ms; score-result
payload shrank from 2,570 rows to one. This isolates score aggregation and does
not measure the entire search action, candidate lookup, rendering or network.
Production catalog contains 2,735 active players. Candidate-filter/ranking and
ordering correctness remain covered by row-cap and scoring-version tests.

## Production preservation / limitations

The original 80 picks match the preserved snapshot, including pick number,
round, team, player and picked timestamp; snapshot SHA-256 remains
`0fdbd65851c15c48c72753130c9ea5bbcba801910881df9b2b9332737b71e2b9`.
Baseline capture contains 80 ownership rows, 80 active roster entries plus two
historical dropped entries, 82 lineup rows, four overrides, three final
matchups and six final score rows. Read-only XI query confirmed every actual
team has 16 active/11 starters/5 bench, counts 1 GK/4 DEF/3 MID/3 FWD, no wrong
slots or duplicate players. Preserve all rows, including inactive history.

No provider requests, production simulated picks, production roster repairs or
settled score changes are part of this continuation. PLAYER_NOT_FOUND's exact
historical cause remains unreproduced; handed-off structured diagnostics are
retained. A manually drafted two-forward squad still satisfies unchanged roster
rules but cannot field 4-3-3; the existing conflict path reports it rather than
changing a manager's selections. Live five-manager network fanout cannot be
measured against the existing completed production draft without creating a
new real draft; isolated testing covers behavior and production publication/RLS
checks cover configuration.

## Reproduction

No repository dependency changes. Install the local PostgreSQL runtime outside
the repo, then run the isolated script:

```sh
npm install --prefix /tmp/eleven-stabilization-postgres-runtime embedded-postgres@17.9.0-beta.17 pg --no-audit --no-fund
ELEVEN_EMBEDDED_POSTGRES_MODULE=/tmp/eleven-stabilization-postgres-runtime/node_modules/embedded-postgres/dist/index.js node --conditions=react-server --experimental-strip-types scripts/draft-stabilization-simulation.mjs
```

Browser scripts use `ELEVEN_PLAYWRIGHT_MODULE` and
`ELEVEN_CHROMIUM_EXECUTABLE` for an external installed Playwright/runtime;
`node scripts/draft-stabilization-browser.mjs` blocks all HTTP and needs no
Supabase credentials. Both scripts clean up temporary environments.
