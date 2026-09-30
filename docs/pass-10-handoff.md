# Pass 10 — Handoff (checkpointed mid-pass, context exhaustion)

This session ran out of context partway through Pass 10 ("Core Fantasy
Game"). This document is the exact state of the world so a fresh Claude
Code session can resume without re-deriving anything. **Nothing in this
pass has been merged, tagged, or reported as complete.** Do not treat
partial progress as a finished pass.

## Branch state

- Branch: `feature/core-fantasy-game`, created from clean `main` (which
  has Pass 9 merged — confirmed at session start: `main` was exactly at
  `origin/main`, tip `2e6f5ab Merge Pass 9: Football Integrity, Scoring
  and Live Data Engine`).
- **Pushed** to `origin/feature/core-fantasy-game` (tracking branch set
  up) as of this checkpoint.
- 5 commits ahead of `main`, in order:
  1. `6e73729` — game rules + fantasy round calendar analysis docs
  2. `3734098` — pure domain layer (round-calendar, lineup-lock, draft-order, schedule)
  3. `857570c` — atomic draft engine (SQL functions)
  4. `e046144` — round/lineup/matchup engine (TypeScript, service-role)
  5. `656eb34` — **WIP**: simulation harness — typechecks/lints but has
     **not been run live yet**. Read this commit's message; it says so
     explicitly.
- Working tree is clean at checkpoint time (verified via `git status
  --short` immediately before writing this doc — no temp `_tmp_*` files,
  nothing uncommitted).
- `npm test` at checkpoint: **216/216 passing**. `npx tsc --noEmit` and
  `npm run lint`: clean.

## What is DONE and LIVE-VALIDATED (high confidence)

Everything below was not just written but actually exercised against the
real Supabase project with real temporary auth users and real 2026/27
stored fixture/score data, then cleaned up. Two genuine bugs were found
this way and fixed (not patched around) before moving on — see "Known
defects" below for the paper trail; both are now fixed and re-verified.

1. **`docs/game-rules.md`** — the full authoritative rules document:
   roster/formation rules, no-captain rule, the chosen round boundary,
   round generation (skip blank international-break weeks), fixture→round
   assignment, postponed/rescheduled fixture policy (never reopen a
   finalized round), multi-fixture player handling, the chosen
   first-kickoff-locks-the-round lineup lock model (with the rejected
   per-fixture alternative documented), league lifecycle/size, draft
   rules, H2H schedule/scoring rules, standings/tiebreak rules.
2. **`docs/fantasy-round-calendar-analysis.md`** — empirical comparison of
   all four candidate boundaries against the real stored fixture
   calendar. **Tuesday→Monday** won decisively (0/18 domestic weekends
   split, 0/7 UEFA matchdays split — every other candidate, including
   Wednesday→Tuesday which had been informally discussed beforehand,
   splits at least one of those). Canonical timezone: **UTC** (no stored
   fixture falls within 3 hours of a UTC midnight; avoids the in-season
   CET/CEST DST transition entirely).
3. **Pure domain layer**, each independently unit-tested, all clock-
   injected (no internal `Date.now()`/`new Date()`):
   - `src/domain/fantasy/round-calendar.ts` — Tue→Mon window math (9 tests)
   - `src/domain/fantasy/lineup-lock.ts` — first-eligible-kickoff locking (8 tests)
   - `src/domain/fantasy/draft-order.ts` — snake pick math + seedable shuffle (9 tests)
   - `src/domain/fantasy/schedule.ts` — round-robin circle method, tested
     against every required size (6/8/10/12) plus odd counts with
     deterministic byes (12 tests)
   - `src/domain/fantasy/auto-lineup.ts` — **simulation-only** automatic
     valid-XI chooser (5 tests) — see its doc comment, never used for a
     real manager's lineup
4. **Draft engine** (`supabase/migrations/20260930024807_draft_engine.sql`):
   `start_draft()`, `make_draft_pick()`, `resolve_expired_pick()`,
   `_perform_draft_pick()` (shared trusted internal core). SECURITY
   DEFINER, same pattern as the pre-existing
   `create_league`/`join_league_by_invite_code`. **Live-verified**:
   commissioner-only start, duplicate-start rejection, correct snake turn
   enforcement, wrong-turn rejection, duplicate-player rejection, a
   genuine **concurrent-call race** (two simultaneous identical requests
   → exactly one succeeds, the other gets a clean `NOT_YOUR_TURN` via the
   `select ... for update` row lock — not a raw constraint error), full
   draft completion via the timer-expiry auto-pick path using an
   **injected future clock** (`resolve_expired_pick`'s `p_as_of`
   parameter) so a whole draft resolves in real seconds with no wall-clock
   waiting.
5. **Round/lineup/matchup engine** (`src/lib/fantasy-engine/{round-eligibility,lineup,rounds}.ts`):
   `openNextRound()`, `createRoundLineupSlots()`, `updateLineup()`,
   `refreshMatchupScores()`, `finalizeRoundIfReady()`. **Live-verified**
   end to end: a 4-team drafted league opened round 1 anchored to a real
   historical window (2026-08-25 → 2026-09-01) with the correct
   round-robin pairing count, 64 lineup slots created; a valid 11-player
   XI was accepted, an invalid one (0 GK) was correctly rejected; after
   setting one team's real lineup and calling `refreshMatchupScores`,
   that team showed a real 21-point total sourced from actual historical
   `fantasy_player_scores`, while every team with no lineup set correctly
   showed exactly 0 (bench points / unset lineups never count); the round
   then finalized correctly once its fixtures were past Pass 9's
   reconciliation window (reused `determineFixtureSyncCadence`'s
   `"settled"` reason as the exact finalization gate).

## What is WRITTEN BUT NOT YET LIVE-VALIDATED

6. **`src/lib/fantasy-engine/simulate.ts`** (`runSimulation()`) — the
   Phase 12 full-lifecycle simulation harness. This is the single most
   important remaining piece of unverified code. It:
   - Creates N real temporary Supabase Auth users + signs each in
   - Creates a real league via the real RPCs, has every manager join
   - Runs the draft to completion via the (already-verified)
     `resolve_expired_pick` injected-clock path
   - For each requested round: `openNextRound`, sets every team's lineup
     via `chooseAutomaticStartingXi` + `updateLineup` (skips a team if its
     roster depth can't reach 11 — logged, not a crash), reads back lock
     counts and fixture counts, `refreshMatchupScores`,
     `finalizeRoundIfReady` with the clock advanced 25h past the round's
     window end (past Pass 9's reconciliation window)
   - After all rounds: computes standings independently
     (`computeStandings`, mirrors `getStandings()`'s derive-never-cache
     convention) and checks 6 invariant classes: ownership violations,
     roster violations (duplicate player on one roster), formation
     violations (an actually-set starter count that isn't a valid
     composition), a **real adversarial check** (attempt to edit an
     already-locked slot long after lock time, confirm it's rejected),
     an independent recomputation of one finalized round's matchup totals
     compared against the stored values, and a standings-mismatch slot
     (currently always 0 — there's only one implementation of standings
     derivation right now, so this check is a placeholder for when/if a
     second independent implementation exists to compare against; **note
     this honestly in the final report rather than presenting it as a
     real second implementation**).
   - Returns a structured `SimulationResult` plus the list of temp user
     ids the CLI (not yet written) is responsible for deleting.
   - **Typechecks and lints cleanly. Has never been executed.** The
     immediate risk areas for a first live run, based on patterns that
     bit earlier code this same session: embedded-relation PostgREST
     query shapes (`roster_entries!inner(...)`) returning a different
     runtime shape than the TypeScript cast assumes — every prior engine
     file needed at least one live-QA round to catch exactly this class
     of issue, and this file has had zero live rounds yet.

## What has NOT been started at all (full remaining Pass 10 scope)

Everything below is still outstanding against the original 61-item final
report the brief asks for. Grouped by the brief's own phases:

- **Simulation CLI** (`npm run fantasy:simulate [-- --managers 8 --rounds 4 ...]`) —
  `simulate.ts`'s `runSimulation()` exists but nothing calls it yet. This
  is the very next piece to write, and the fastest way to get the first
  live signal on `simulate.ts`'s correctness. Follow the existing
  `src/lib/football-ingestion/cli.ts` / `src/lib/scoring/cli.ts`
  conventions (`node --env-file=.env.local --conditions=react-server
  --experimental-strip-types src/lib/fantasy-engine/cli.ts`, relative
  imports for all value imports since path aliases don't resolve under
  plain `node --experimental-strip-types`). Print the
  `ELEVEN FANTASY SIMULATION` report format sketched in the brief. Clean
  up the temp auth users afterward (`admin.auth.admin.deleteUser` for
  each id `runSimulation` returns) and the temp league
  (`fantasy_leagues` delete cascades).
- **Multi-round simulation proof** — once the CLI exists, actually run it
  for several consecutive rounds using the real stored season (there's
  real final data roughly from late August through some point in
  September/October — check via `npm run football:sync -- audit`-style
  queries or just try a few `--rounds` values) and capture the real
  output for the final report. This is the brief's single biggest
  "acceptance requirement" and hasn't produced a single real run yet.
- **Standings tiebreakers beyond wins/pointsFor** — game-rules.md commits
  to "wins, then points-for, then head-to-head if the two tied teams have
  played each other, then points-against ascending." `computeStandings()`
  in `simulate.ts` only sorts by wins/pointsFor today — the head-to-head
  and points-against tiebreakers are undocumented-as-missing, not
  implemented. Needs its own pure, tested function (candidate location:
  `src/domain/fantasy/standings.ts`) rather than inline sort logic, so it
  can be unit tested with constructed tie scenarios independent of a live
  DB.
- **Data-access layer** — nothing in `src/data-access/` has been touched
  or extended this pass. Needed before any UI work:
  - A `drafts.ts` extension (or new `draft.ts`) exposing real draft state
    for the Draft workspace: current pick/round/turn, draft order with
    team names, picks made so far, timer deadline, available-player query
    (reuse `getPlayerDatabase`'s existing filtering with an
    "unowned-in-this-league" filter — `players.ts` already has an
    `ownership` concept for a single active league, check whether it
    already covers this or needs extending).
  - A pick-submission Server Action wrapping `make_draft_pick`/RPC error
    mapping — follow the exact `src/lib/errors/league-action-error.ts` +
    `league-action-error-copy.ts` pattern (write a
    `draft-action-error.ts` with codes matching every `RAISE EXCEPTION`
    message in `draft_engine.sql`: `NOT_AUTHENTICATED`, `DRAFT_NOT_FOUND`,
    `DRAFT_NOT_ACTIVE`, `NOT_LEAGUE_MEMBER`, `NOT_YOUR_TURN`,
    `PLAYER_NOT_FOUND`, `PLAYER_NOT_ACTIVE`, `PLAYER_ALREADY_OWNED`, plus
    `start_draft`'s own `LEAGUE_NOT_FOUND`/`NOT_COMMISSIONER`/
    `LEAGUE_CLOSED`/`DRAFT_ALREADY_EXISTS`/`LEAGUE_NOT_FOUND`).
  - A lineup-editing Server Action wrapping `updateLineup()` from
    `src/lib/fantasy-engine/lineup.ts` (that function already does full
    validation and returns a typed result — the action just needs
    auth/ownership resolution + `revalidatePath`).
  - Extend `src/data-access/matchups.ts`'s `getCurrentMatchup`/
    `getStandings` to read from the now-real `fantasy_rounds`/`matchups`/
    `matchup_scores` rows a real league will have — check whether the
    EXISTING queries there already work once real data exists, or need
    adjustment (they were written in Pass 7.5 against a schema that had
    no writer yet, so their exact query shape has never been exercised
    against real rows).
  - `src/data-access/roster.ts`'s `getUserSquad()` needs to start reading
    `lineup_slots` for the CURRENT round (it currently puts every player
    in `bench`, unconditionally, because no round ever existed — that
    comment is now false for a league that has drafted and opened a
    round).
- **UI** — none of Phases 5/6 (Draft workspace, Team lineup editing) or
  the Phase 11 reconnection of Dashboard/League/Matchup to real game
  state has been started:
  - Draft workspace (new route, e.g. `src/app/(app)/league/draft/` or a
    dedicated `src/app/(app)/draft/`, + `src/components/draft/*`) — the
    brief's detailed layout spec (player database / inspector / draft
    status+timer+queue / activity feed) is in the original Pass 10 prompt
    (not reproduced here — re-read it before starting). Reuse the
    existing Players workspace components per the brief's own
    instruction ("do not duplicate the entire scouting system").
  - `command-palette.tsx`'s disabled "Draft Room" `SOON` stub needs to
    become a real, enabled link once the route exists.
  - Team workspace lineup editing — `team-workspace.tsx`'s doc comment
    currently says "there is no lineup-editing backend yet... deliberately
    has no Edit lineup control" — that's now false; wire it to the new
    Server Action, respecting `isLocked` per slot (already computed and
    stored on `lineup_slots.locked_at`).
  - Matchup workspace — `matchup/page.tsx`'s `ComingSoon` gate
    (`WAITING_FOR_MANAGERS`/`READY_FOR_DRAFT` → "Awaiting league draft")
    needs to actually flip once a league reaches `ACTIVE` for real (it
    will, automatically, once a real `drafts` row completes — verify this
    rather than assuming). Build the real H2H matchup UI per the brief's
    detailed spec (my team/opponent/score/state/starters/bench/etc).
  - Dashboard (`home/page.tsx`) real-state wiring — `OperationsRail`'s
    hardcoded `hasActiveRound: false` / "NO FIXTURE DATA" / "NOT
    SCHEDULED" placeholders need to read the real current round/lock
    state once one exists.
  - League page (`league/page.tsx`) — its inline three-way
    "In progress"/"Completed"/"Not yet available" draft-status string
    switch should be normalized against `LEAGUE_LIFECYCLE_LABEL` (from
    `league-lifecycle.ts`) per the research agent's note, and the
    STANDINGS section needs the new tiebreak-aware standings function.
  - Mobile — nothing has been checked for any of the above yet.
- **Adversarial/edge-case test suite** — the brief's own long list (draft
  concurrency beyond the one race already proven, lineup boundary counts
  10/12/0-GK/2-GK/etc — some proven live in the round-engine QA but not
  as committed automated tests, exact kickoff-boundary instants, fixture
  postponement/reschedule scenarios, H2H tie/zero-score scenarios) has
  **zero committed test coverage** beyond the pure-domain-layer tests
  already listed above. Live QA scripts proved the mechanisms work but
  were deleted after each run per this session's established
  disposable-script convention — **none of those runs are captured as
  regression tests**. This is a real gap: writing committed
  integration/domain tests for these scenarios (not just re-running
  throwaway scripts) is explicitly required by the brief
  ("Do not optimize for an arbitrary test count. Optimize for meaningful
  invariant coverage... Both are required" — unit tests AND simulation).
- **Documentation updates** the brief explicitly lists as in-scope and not
  yet touched this pass: `docs/architecture.md`, `docs/data-flow.md`,
  `docs/product-state.md` all still describe the pre-Pass-10 world
  (no draft engine, no round scheduler, everything resolves to
  `WAITING_FOR_MANAGERS`/`READY_FOR_DRAFT`). These need updating once the
  above lands, not before (so they describe what's actually true).
- **Final validation pass** — `npm test`/`lint`/`tsc`/`build` all currently
  pass, but the brief's fuller final-validation list (complete draft
  simulation, ownership audit, lineup/formation audit, multi-round H2H
  simulation, standings consistency audit, lock-boundary tests,
  duplicate/concurrent draft tests, round-assignment audit) is only
  partially done — see above.
- **The 61-item final report** — not written. Do not write it until the
  actual acceptance criteria (the brief's own "Definition of Done"
  section — a league progressing WAITING_FOR_MANAGERS → READY_FOR_DRAFT →
  DRAFTING → ACTIVE, with real rosters/lineups/rounds/schedule/locks/
  scores/results/standings, replayable via simulation) are genuinely met,
  not merely "the modules exist."

## Known defects

**None currently open.** Two were found and fixed (with regression
understanding, not patches) during this session's live QA, both now
re-verified working:

1. A `smallint`/`integer` `RETURN QUERY` type mismatch in the original
   `make_draft_pick`/`resolve_expired_pick` SQL (Postgres requires exact
   type matches for `RETURNS TABLE`, unlike a normal `SELECT`) — caught
   immediately on first live call, fixed with explicit `::int` casts,
   re-verified.
2. `resolve_expired_pick` originally delegated to `make_draft_pick`,
   which resolves the drafting team from the CALLER's own session — but
   an auto-pick must act on behalf of the EXPIRED team, not whoever
   triggered the timeout check. Refactored into a shared, explicitly-
   team-scoped internal core (`_perform_draft_pick`, not exposed to
   `authenticated`) that both public functions call, each supplying the
   team id however is correct for their own case. Re-verified.
3. The deterministic auto-pick's fallback tier had no upper bound per
   position once minimums were met, and GK sorts first in the priority
   order — a live 6-team draft produced one team with 9 drafted
   goalkeepers and too little outfield depth to ever field a valid
   11-player XI. Fixed with soft depth caps (GK 2, DEF/MID 5, FWD 3,
   matching `FORMATION_RULES`' own starting-XI maximums) so auto-pick can
   never make a valid XI structurally unreachable. Re-verified: a 4-team,
   squadSize-16 draft afterward produced a sane 3/5/5/3 split and a real
   valid XI was then successfully set from it.

No other defects are currently known, but note: `simulate.ts` has never
run, so it may surface new ones — see above.

## Exact next steps for a fresh session

1. `git status` / `git log --oneline main..HEAD` to confirm you're
   resuming exactly this checkpoint (5 commits on
   `feature/core-fantasy-game`, matching the list above).
2. Read this file, then re-read the ORIGINAL Pass 10 user prompt in the
   conversation history in full — it is long and detailed and is not
   fully reproduced here; this handoff is a supplement to it, not a
   replacement.
3. Write `src/lib/fantasy-engine/cli.ts` (a thin wrapper calling
   `runSimulation()` and printing results, plus a cleanup step deleting
   the temp users/league unless a `--keep` flag is passed for
   inspection), and a matching `"fantasy:simulate"` script in
   `package.json` (same `node --env-file=.env.local
   --conditions=react-server --experimental-strip-types` invocation
   pattern as `football:sync`/`scoring:backfill`).
4. Run it for real, for the first time, starting small
   (`--managers 4 --rounds 1`) exactly like this session's manual QA
   scripts did, before trying the full `6/8/10/12`-manager,
   multi-round runs the brief actually asks for. Expect to find and fix
   at least one real bug — every other engine file this session needed
   at least one live-QA round to reach a working state, and this file has
   had none yet. Fix root causes, not symptoms, matching the pattern of
   the three defects already documented above.
5. Once `simulate.ts` is proven live, work through "What has NOT been
   started at all" above roughly in the order listed (standings
   tiebreakers → data-access → UI → adversarial test suite → docs →
   final validation → the 61-item report), since later items depend on
   earlier ones being real.
6. Continue committing incrementally per unit of verified work, exactly
   as this session did (see the 5 commits' messages for the expected
   level of detail and honesty about what was/wasn't live-verified).
7. Do not merge, tag, or begin Draft-adjacent-but-out-of-scope work
   (waivers/trades/FAAB/playoffs beyond basic scheduling/commissioner
   tooling/notifications/native app/keeper) at any point — these remain
   explicitly out of scope per the brief.
