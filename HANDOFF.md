# Pass 12A — Season Engine Core: Completion Handoff

**Branch:** `feature/pass-12a-season-engine` (off `main` at `78cac33`, the
completed Pass 11.5 state). Not merged, not pushed.

**Status: complete.** League → Season → Fantasy Round → Matchup is now a
real, first-class hierarchy. The soccer-style table (3/1/0 points,
PF/PA/DIFF, the new tiebreak order) is live on the League page. Seasons
self-bootstrap the moment a league's first round opens, the deterministic
round-robin scheduler is reused completely unchanged for ONCE/TWICE/THREE
TIMES schedules (including odd-manager BYEs), and `progressSeason` is the
one idempotent operation that finalizes a round, opens the next one, or
completes the season and crowns a champion. The migration has been applied
to the linked Supabase project. Full validation suite is clean: `npm test`
(338 pass), `npm run test:integration` (55 pass, including 4 new
season-engine tests against the real database), `npx tsc --noEmit`,
`npm run lint`, and `npm run build` all pass.

The one honest gap: no browser automation tool was available in this
environment, so the new League-page season UI (SeasonPanel, the new
standings columns, the commissioner schedule-format control) was verified
by `npx tsc --noEmit` + `npm run build` + an unauthenticated route smoke
test (confirms no server crash, redirects to `/login` as expected) rather
than actual signed-in visual/browser QA. The manual QA checklist at the
bottom of this file is what a human should run through before trusting the
UI completely.

---

## Schema / migrations

One new migration: `supabase/migrations/20261002000000_season_engine.sql`
(applied via `npx supabase db push`). It:

- Creates `public.seasons` (`id, league_id, season_number, status
  ['SETUP'|'ACTIVE'|'COMPLETED'], schedule_cycles [1|2|3], total_rounds,
  starts_at, completed_at, champion_fantasy_team_id, created_at`), with
  `unique(league_id, season_number)` and a **partial unique index**
  `seasons_one_active_per_league on seasons(league_id) where status =
  'ACTIVE'` — "at most one active season per league" enforced by Postgres
  itself, not just application logic.
- Adds `fantasy_rounds.season_id` (FK → `seasons`, `on delete cascade`),
  backfills every league's existing rounds into one new `ACTIVE` season
  (`season_number = 1`, `schedule_cycles = 2`, `total_rounds` computed
  generously so no in-progress test league can retroactively look
  "already complete"), then sets the column `NOT NULL` and swaps the old
  `unique(league_id, number)` constraint for `unique(season_id, number)`.
- Adds RLS: `seasons` gets the same `"members can read X in their league"`
  SELECT policy every other league-scoped table already has.
- Adds `set_season_schedule_format(p_league_id, p_cycles)` — SECURITY
  DEFINER, `search_path = public`, resolves `auth.uid()` internally
  (never trusts a client-supplied identity), checks commissioner role,
  and raises `SEASON_ALREADY_STARTED` if a season row already exists in
  any state. Inserts a `SETUP` placeholder that the next real round-open
  promotes to `ACTIVE`.

`matchups` gets **no new column**. A matchup's season is always derivable
via `fantasy_round_id → fantasy_rounds.season_id` — adding a duplicate
`season_id` there would be exactly the unnecessary duplication the brief
warned against.

`src/lib/supabase/database.types.ts` (hand-maintained) was updated to
match: `fantasy_rounds.season_id`, the new `seasons` table type, and the
`set_season_schedule_format` RPC signature.

---

## Season / schedule / table semantics (exact rules implemented)

- **Round numbering resets per season.** `fantasy_rounds.number` now means
  "round N of THIS season," not "round N of this league ever." This is
  what let the existing scheduler (`src/domain/fantasy/schedule.ts` —
  `generateRoundRobinCycle` + `pairingsForSeasonRound`) be reused with
  **zero code changes**: as long as the round number passed in is
  1-indexed from the season's own start, its cycle-repetition math
  (`cycleIteration = Math.floor(zeroIndexed / cycleLength)`, reversing
  home/away on odd cycles) is already correct for ONCE/TWICE/THREE TIMES.
  19 new tests in `src/domain/fantasy/season.test.ts` prove this against
  the real, unmodified scheduler for team counts 2–6.
- **Schedule length:** `computeCycleLength(teamCount)` = `teamCount - 1`
  for even counts, `teamCount` for odd (one synthetic BYE per manager per
  cycle — never a phantom matchup row). `computeTotalRounds(teamCount,
  cycles)` = cycle length × 1/2/3. Confirmed against the real scheduler
  for 2–6 managers, including the odd-count BYE case, in both the unit
  tests and a dedicated 3-manager integration test.
- **Season auto-bootstrap lives inside `openNextRound`**
  (`src/lib/fantasy-engine/rounds.ts`'s new `resolveOrCreateActiveSeason`),
  not as a separate step only triggered by draft completion. This was
  deliberate: ~17 existing call sites (several integration tests that
  never run a draft at all) call `openNextRound` directly, so season
  creation had to be an implementation detail of round-opening itself,
  not a precondition only the production draft-completion path satisfies.
  It promotes an existing `SETUP` row (from a commissioner's pre-season
  `set_season_schedule_format` choice) to `ACTIVE`, or creates a fresh
  `ACTIVE` season defaulting to TWICE. `total_rounds` is computed once,
  from the real team count, the moment the season actually goes active —
  never recomputed afterward (no destructive mid-season format changes).
  Race-safe via the same `23505`-catch-and-refetch pattern `sign_player`
  already uses for its own unique-ownership race.
- **Soccer-style table** (`src/domain/fantasy/standings.ts`, rewritten):
  `StandingsRow` now carries `played` and `leaguePoints` (WIN=3/DRAW=1/
  LOSS=0) alongside the existing `wins/losses/draws/pointsFor/
  pointsAgainst`. Ranking order: 1) league points, 2) fantasy-point
  differential (PF−PA), 3) fantasy points for, 4) head-to-head (only
  finalized matchups between the two tied teams), 5) team id ascending
  (stable, deterministic, non-random final fallback — replaces the old
  points-against-ascending fallback). 8 tests cover every tier including
  the "head-to-head meeting was itself a draw, falls through to team id"
  edge case.
- **`getStandings`** (`src/data-access/matchups.ts`) is now scoped to the
  league's **current (latest) season** — resolved via `seasons` ordered by
  `season_number desc`, then matchups filtered to that season's
  `fantasy_rounds`. Still derives only from `status = 'final'` matchups.
- **League page UI** (`src/components/league/standings-table.tsx`): full
  Rank/Team/P/W/D/L/PF/PA/DIFF/PTS columns, horizontally scrollable on
  narrow screens rather than dropping columns, restrained "YOU" accent
  preserved.
- **Season completion + champion** (`src/lib/fantasy-engine/season.ts`'s
  `progressSeason`): a season completes only when its final scheduled
  round has actually finalized (every non-BYE matchup `status = 'final'`).
  The champion is computed by running the exact same `buildStandingsTable`
  + `rankStandings` the League page itself uses over every final matchup
  in that season — never a second, divergent ranking implementation.
  `champion_fantasy_team_id`, `completed_at`, and `status = 'COMPLETED'`
  are persisted together in one update.
- **`progressSeason` idempotency:** calling it twice never duplicates a
  round, re-completes a season, or recomputes a champion. Once a season's
  `status` flips to `COMPLETED`, the function's own first query (`.eq
  ("status", "ACTIVE")`) no longer matches it, so a second call
  short-circuits to `{action: "no_active_season"}`. `finalizeRoundIfReady`
  (unmodified, reused as-is) already no-ops on an already-completed round.
  `openNextRound` now also refuses to open a round past `season.
  totalRounds` (`SEASON_COMPLETE`), closing the remaining gap. Proven by a
  dedicated integration test that calls `progressSeason` twice and asserts
  the season row, round count, and champion are byte-for-byte unchanged.
- **League lifecycle** (`src/domain/fantasy/league-lifecycle.ts`): added a
  new `SEASON_COMPLETE` state and an optional `seasonStatus` input field.
  `SEASON_COMPLETE` fires only when the draft is done AND the current
  season's status is `COMPLETED` — deliberately distinct from the
  existing `COMPLETED` (league archived/ended) state, since the league
  itself stays permanent and playable after a season ends. Every existing
  caller that omits `seasonStatus` behaves exactly as before (verified —
  the 4 pre-existing callers in Home/Draft/Matchup/
  `league-status-panel.tsx` were left untouched; only the League page
  passes the real value).
- **Commissioner schedule-format control**
  (`src/components/league/season-panel.tsx` +
  `src/app/(app)/league/season-actions.ts` +
  `src/data-access/seasons.ts`): ONCE/TWICE/THREE TIMES radio control,
  default TWICE, shown only when no season row exists yet and the viewer
  is the commissioner. Once a season exists in any state, the RPC itself
  refuses further changes (`SEASON_ALREADY_STARTED`), so the control is
  simply not rendered rather than rendering a control that would always
  fail. The same panel shows season number/status/format, "ROUND X / Y,"
  and a champion banner once `COMPLETED` — the brief's "minimum first
  League-page completed-season/champion state," not a full archive UI.

---

## Tests and results

**Pure unit tests** (`npm test` — 338 pass, 0 fail, 55 skipped [the
integration files, which require env vars]):
- `src/domain/fantasy/season.test.ts` (new, 19 tests) — schedule-length
  math for 1/2/3 cycles × 2–6 managers, end-to-end against the real
  unmodified scheduler, odd-manager BYE counts, no self-matches, no
  duplicate team-in-round.
- `src/domain/fantasy/standings.test.ts` (rewritten, 8 tests) — league
  points aggregation, every tiebreak tier in order, the "tied head-to-head
  meeting falls through to team id" edge case, empty-league edge case.
- `src/domain/fantasy/league-lifecycle.test.ts` (+2 tests) —
  `SEASON_COMPLETE` fires correctly; omitting `seasonStatus` never changes
  pre-existing behavior.

**Real-database integration tests** (`npm run test:integration` — 55
pass, 0 fail; new file `src/lib/fantasy-engine/season.integration.test.ts`,
4 tests, added to the `test:integration` npm script):
1. `openNextRound` auto-bootstraps a default TWICE `ACTIVE` season on
   first round open, with `total_rounds` computed from the real team
   count (4 managers → 6 rounds).
2. `set_season_schedule_format` is commissioner-only (`NOT_COMMISSIONER`
   for a non-commissioner caller), rejects invalid cycle counts, is
   honored when the season actually goes active, and is blocked a second
   time once a season exists (`SEASON_ALREADY_STARTED`).
3. Odd manager count (3): exactly one real matchup per round across all 3
   rounds of a ONCE cycle, each manager sits out exactly one round — never
   a phantom matchup for the BYE.
4. **The lifecycle smoke test the brief asked for**: 2-manager league →
   commissioner sets ONCE → round 1 opens (the season's only round) →
   `progressSeason` finalizes it and completes the season in one call →
   champion is a real team id, decided correctly by the deterministic
   team-id tiebreak on a genuine 0-0 (zero rostered players) → calling
   `progressSeason` again is a no-op (`no_active_season`), with the
   season row and round count asserted byte-for-byte unchanged.

All 51 pre-existing integration tests (draft engine, market/trades,
players, matchups) still pass unmodified against the live database with
the season engine wired in — confirming the migration and `openNextRound`
changes are fully backward-compatible.

---

## Backward-compatibility decisions

- Every currently-existing league's fantasy rounds already started
  numbering at 1, so re-scoping `number` to "round N of the season" is a
  no-op renumbering for all real data — the backfill DO block simply
  assigns each league's existing rounds to one new season-1 row.
- `total_rounds` for backfilled seasons is computed as
  `max(cycle_length × 2, existing_max_round_number)` — generous on
  purpose, so the migration can never make an in-progress real or test
  league look "already complete" the moment it runs.
- No destructive schema changes: no table dropped, no column removed, no
  existing row's id changed. The old `unique(league_id, number)`
  constraint on `fantasy_rounds` is replaced by `unique(season_id,
  number)` only after every existing row already has a `season_id`.
- `matchups` is untouched at the schema level entirely.

---

## Known limitations (explicitly out of scope per the brief)

- No production cron wiring for `progressSeason` — it exists and is fully
  tested, but nothing calls it on a schedule yet. That's Pass 12B
  ("connects it to the centralized football sync/cron").
- No "Start Next Season / REDRAFT vs KEEP" flow. The data model supports
  it (`seasons.season_number` increments, `status` lifecycle, one-active-
  per-league constraint) but no UI or RPC exists to actually start a
  second season yet.
- No season archive/history UI beyond the single current-season
  champion banner on the League page.
- No actual signed-in browser QA was performed (no browser automation
  tool available in this environment) — see the manual QA checklist below.
- Custom per-week scheduling, playoffs, Captain mechanics, Scoring V2,
  notifications, Club Legacy, etc. were all explicitly out of scope and
  untouched, per the brief's scope guards.

---

## Manual QA checklist

Run through this on the linked Supabase project with a real test league:

- [ ] A league with no season yet shows the commissioner ONCE/TWICE/THREE
      TIMES control (commissioner view only); other managers don't see it.
- [ ] Picking a format, then completing the draft, produces a season whose
      `schedule_cycles` matches the chosen format and whose `total_rounds`
      matches the real manager count (`(N-1) × cycles` for even N, `N ×
      cycles` for odd N).
- [ ] An odd manager count (e.g. 3 or 5) produces exactly one BYE per
      manager per cycle — no manager ever has two matchups or a phantom
      matchup in the same round.
- [ ] Standings show 3 points for a win, 1 for a draw, 0 for a loss — not
      conflated with fantasy points scored (PF).
- [ ] Two teams tied on league points are ordered by point differential,
      then PF, then head-to-head, then team id — in that order.
- [ ] The League page's current round number and "round X of Y" match the
      real schedule.
- [ ] Running the season-progression path (or waiting for real fixtures to
      settle) does not duplicate rounds, matchups, or standings rows if
      triggered more than once.
- [ ] The final scheduled round completing produces exactly one champion,
      and the League page shows a champion banner afterward.
- [ ] After a season completes, its final standings and matchups are still
      fully visible/queryable (nothing archived or hidden).

---

If you're picking this up for **Pass 12B**: start by reading
`src/lib/fantasy-engine/season.ts` (`progressSeason`) and
`src/lib/fantasy-engine/rounds.ts` (`resolveOrCreateActiveSeason`,
`openNextRound`) — those two files are the entire season engine. The
natural next steps are (1) wiring `progressSeason` into a scheduled cron
alongside the existing `football-live-tick` route, and (2) the "Start Next
Season" REDRAFT/KEEP flow, which should insert the next `seasons` row
(`season_number + 1`) and reuse the same `resolveOrCreateActiveSeason`
promotion path.
