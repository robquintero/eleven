# Eleven — Game Rules (Pass 10)

The authoritative explanation of Eleven's launch fantasy rules. Game
logic lives in `src/domain/fantasy/*` and `src/lib/fantasy-engine/*` —
this document explains *why* those modules behave the way they do; the
code is the source of truth for exact numbers.

## Player universe

**Draftable**: current, active players (`players.active = true`) whose
club belongs to one of the five Big Five competitions. European
participation never makes a non-Big-Five player draftable — see
`docs/football-data-system.md` "Non-Big-Five opponent clubs."

**Eligible scoring fixtures**: the five Big Five domestic competitions
plus the UEFA Champions League and Europa League **main competitions**
(qualifying rounds excluded — see `docs/football-data-system.md`
"Qualifying rounds are excluded"). Domestic cups, the Conference League,
Super Cups, the Club World Cup, international matches, and friendlies are
never ingested, so they structurally cannot enter scoring.

A Big Five player's eligible performances across domestic **and** UCL/UEL
in the same Eleven round all contribute to that round — this is a
deliberate feature of the format, not an edge case (see "Multi-fixture
players" below).

## Roster rules

Two distinct, non-interchangeable sets of rules govern a team's players —
don't conflate them:

**Squad composition** (the full 16-player roster a team owns — drafted,
and later via free agency/waivers/trades) — `ROSTER_RULES`,
`src/domain/fantasy/constants.ts` (Pass 10.5):

- Squad size: exactly 16.
- GK: exactly 2 (min 2, max 2).
- DEF: 4–6.
- MID: 4–6.
- FWD: 2–4.
- These are core fantasy-domain invariants, not merely Draft UI rules —
  enforced authoritatively server-side in `_perform_draft_pick`
  (`supabase/migrations/20260930024807_draft_engine.sql`), independently
  re-derived from the single authoritative pure-TypeScript domain module
  `src/domain/fantasy/roster-rules.ts` (`isRosterCompositionValid`,
  `isRosterCompletable`, `canDraftPosition`, `draftablePositions`) that
  the Draft UI also uses for disabling controls. That module is meant to
  be reused as-is by future free agency/waivers/trades work — it is not
  draft-specific.
- **Mathematical completability**: a roster must never be allowed to
  reach a state where satisfying the remaining position minimums is
  impossible given the picks left. Example: with 2 draft picks left and
  the team still needing 1 GK and 1 DEF to hit minimums, a MID/FWD pick
  that would consume one of those two remaining slots is rejected
  (`ROSTER_LIMIT_EXCEEDED`), even though MID/FWD aren't individually at
  their own maximum.
- Draft auto-pick (`resolve_expired_pick`) respects the same rules and
  can never construct an invalid squad — it only ever chooses among
  positions that remain legal under the same completability check.

**Starting XI** (which 11 of those 16 are active for a round) —
`FORMATION_RULES`, `src/domain/fantasy/constants.ts` (pre-existing,
unchanged this pass):

- Starting XI: exactly 11.
- Formation: GK exactly 1, DEF 3–5, MID 3–5, FWD 1–3. Enforced by
  `isStarterCompositionValid()` (pre-existing) — validated server-side on
  every lineup write, never trusted from the client.
- Bench: every remaining roster player not in the starting XI (5 of the
  16, once a squad is complete).
- **Post-draft initialization** (Pass 10.5): the moment a team's draft
  completes, Eleven automatically opens the league's first fantasy round
  and picks that team's first starting XI deterministically
  (`chooseAutomaticStartingXi()`, `src/domain/fantasy/auto-lineup.ts` —
  fills each position's minimum first, then rounds through DEF/MID/FWD
  depth; no ratings, projections, or provider-form input of any kind)
  rather than leaving the whole squad on the bench. Since every legally
  drafted squad already has at least 2 GK / 4 DEF / 4 MID / 2 FWD —
  exceeding `FORMATION_RULES`' own starting-XI minimums — this always
  succeeds. A manager can freely rearrange this initial XI afterward
  through the existing Team lineup-editing UI, exactly as if they'd set
  it themselves; the auto-selection only ever runs once, at that
  starting point.

## No captain multiplier

Eleven's launch core game has no captain/multiplier mechanic. Exclusive
single-league ownership already provides scarcity; a captain bonus is
explicitly deferred, not implemented "lightly."

## Fantasy round boundary

**Tuesday → Monday.** Tuesday begins a fresh fantasy week. The fixed weekly
rollover is **Tuesday 06:00 UTC → next Tuesday 06:00 UTC**, with half-open
intervals `[starts_at, ends_at)`. Tuesday 00:00–05:59:59.999 UTC is still
in the previous week; exactly 06:00 UTC begins the new week.

**Canonical timezone: UTC.** The boundary never moves with U.S. daylight
saving time (approximately 02:00 EDT / 01:00 EST). Kickoff display remains
local to the viewer. Fixture ownership uses kickoff, never full time,
provider arrival time, or the reconciliation clock. A match starting before
rollover stays wholly in its old week even if it finishes afterward.

Calendar rollover is independent of settlement: the next week opens when
the previous window ends, while an older round may remain unfinished until
its existing terminal-status, post-FT reconciliation and V4-evidence checks
pass. Closed unfinished windows continue to reconcile against their stored
timestamps. Completed fantasy results remain immutable. There is no global
Tuesday lineup deadline; each player locks at their first eligible kickoff.

## Round generation ("skip blank weeks")

Eleven's round **numbers are dense over weeks that have at least one
eligible fixture** — a calendar week with zero fixtures across all seven
scoring competitions (a genuine international break; three such weeks
exist in the stored 2026/27 season) is skipped entirely, not represented
as an empty round. A fully fixture-less week could only ever produce a
manufactured 0–0 draw for every matchup in the league, which is not worth
representing as a "round" at all.

Concretely (`src/domain/fantasy/round-calendar.ts`):

- `roundWindowContaining(date)` — pure, given any instant returns the
  Tuesday 06:00 UTC window it falls in. No I/O, no league concept.
- `nextRoundWindow(window)` — returns the next canonical recurring window;
  it never carries a legacy midnight anchor into newly-created weeks.
- `findNextEligibleWindow` (`src/lib/fantasy-engine/round-eligibility.ts`) —
  checks stored fixture evidence and skips blank weeks.

**Rounds are created one at a time**, at calendar rollover (or, for round 1,
when the draft completes). Settlement of the previous round may finish later.

The simulation harness (`docs/game-rules.md` "Simulation," `src/lib/fantasy-engine/simulate.ts`)
drives through repeatedly with a controlled clock.

## Fixture → round assignment

A fixture's round membership is a pure function of its own stored
`kickoff_at` and a league's already-created `fantasy_rounds` windows —
never a live "kickoff date vs. today" comparison recomputed indefinitely.
Once a `fantasy_rounds` row exists for a window, every fixture whose
`kickoff_at` falls inside `[starts_at, ends_at)` belongs to that round,
permanently — the row itself is the persisted assignment. A fixture that
didn't exist yet when the round was created (a newly-ingested one, or an
existing one whose kickoff time changes) is (re-)evaluated against
already-created round windows the next time the engine looks at it, but a
round that has already been finalized does not get reopened or have its
totals recomputed because of this — see "Postponed/rescheduled fixtures"
below.

## Postponed / rescheduled fixtures

Conservative, integrity-preserving rules — a provider-side date change
must never silently rewrite a fantasy result a manager has already seen
finalized:

| Case | Rule |
|---|---|
| **A. Rescheduled before it begins** | If the new kickoff still falls in the same already-open round's window, no effect. If it moves to a different window, it is scored under whichever round's window it now falls into **as of the next time an engine tick reads it** — but see D below for the finalized case. |
| **B. Postponed after round assignment, before kickoff** | Same as A — the fixture simply isn't "final" yet, so it contributes 0 to any locked-but-unplayed starter until it eventually kicks off (in whichever round window its rescheduled `kickoff_at` lands in). |
| **C. Abandoned after beginning** | Scored from whatever `player_match_stats` exist at abandonment — Eleven never fabricates "what would have happened." If the provider later marks it final with a complete record, the normal post-FT reconciliation window (Pass 9, `docs/football-data-system.md`) picks up the corrected stats **as long as the round hasn't finalized yet** (see D). |
| **D. Fixture moves across a round boundary, OR the provider corrects it, AFTER the round already finalized** | **No effect on the finalized round.** Eleven does not reopen a finalized `fantasy_rounds`/`matchups` row. The corrected/moved fixture is picked up by whatever round its (possibly new) `kickoff_at` falls into among rounds that are still open — if that's a round that has already passed and also finalized, the performance is excluded from Eleven scoring entirely rather than retroactively mutating history. This is a deliberate, documented tradeoff (a rare provider correction arriving very late loses fantasy relevance) in exchange for the much more important invariant: **a manager's finalized result never changes underneath them.** |
| **E. Resumed later** (same match, interrupted) | Same fixture id, same round assignment (its `kickoff_at` didn't change) — treated as case C until final. |
| **F. Provider corrects metadata post-finalization** | Same as D — corrections to a fixture whose round has finalized do not reopen that round. |

## Multi-fixture players (the double-match round)

A starter with two eligible fixtures in one round (domestic + UCL/UEL)
has **both** performances' `fantasy_player_scores` summed into that
round's matchup contribution. This requires no special-case code: the
round-aggregation query sums every `fantasy_player_scores` row for that
player whose `fixture_id` falls in the round's fixture set, and a player
can appear in that set twice. A player with zero eligible appearances in
a round contributes exactly 0 — never a fabricated average/projection.

## Player locking

**Individual player locking, not one global weekly deadline** — this was
already the documented domain model (`docs/domain-model.md` "Player
locking") and Pass 10 makes it real. The launch rule, chosen for
simplicity over a more granular alternative (see below):

> **A starter's lineup slot locks at the kickoff of that player's FIRST
> eligible fixture within the current round.** Once locked, that slot
> cannot be moved between starting XI and bench for the rest of the
> round — including around a second eligible fixture the same player has
> later in the same round.

Two models were considered:

1. **Round-level lock at first kickoff** (chosen). Simple, one
   `locked_at` timestamp per `lineup_slots` row per round, computed once
   the round's fixtures are known. Cannot be exploited: once a manager
   has seen how a player's first match goes, they can no longer bench
   them before the second one.
2. **Per-fixture granular lock** (rejected for launch). Would let a
   manager keep managing a double-fixture player's starter/bench status
   between their two matches in the same round — e.g. bench them after a
   poor domestic outing, before their UCL leg. This is strictly more
   management-rich, but also strictly more exploitable in the *other*
   direction (reacting to the first result to protect/chase the second)
   and requires per-fixture lineup state instead of per-round state — a
   materially bigger schema and UI surface for a launch pass. Deferred
   until there's a concrete signal the simple rule is unsatisfying.

Scoring is unaffected by which model is chosen — both eligible
performances count either way; the lock model only governs whether a
manager can *react* to the first one before the second locks.

Implementation: `locked_at` is computed and persisted onto each
`lineup_slots` row the moment the round's eligible fixtures are known
(when the round opens), as `MIN(kickoff_at)` over that player's fixtures
in the round. A slot is "currently locked" iff `now >= locked_at`
(`now` always explicit — see "Clock injection").

## Clock injection

Continuing Pass 9's rule: no fantasy game-rule function reads
`Date.now()`/`new Date()` internally. Every time-sensitive function in
`src/domain/fantasy/*` and `src/lib/fantasy-engine/*` takes `now: Date`
explicitly. Production call sites pass the real clock; tests and the
simulation harness pass a controlled one. This is what makes exact
kickoff-boundary testing (`docs/game-rules.md` "Testing") possible
without waiting for a real clock to cross a real boundary.

## League lifecycle

Unchanged shape from Pass 7.5's `deriveLeagueLifecycle` — Pass 10 makes
`DRAFTING`/`ACTIVE` reachable for real by actually writing `drafts` rows.
No new lifecycle column: the state is still fully derived from
`fantasy_leagues.status` + live membership count vs.
`MIN_MANAGERS_TO_START_DRAFT` + `drafts.status`.

| State | Reached when |
|---|---|
| `NO_LEAGUE` | Caller has no league memberships (resolved by the caller, before this function runs) |
| `WAITING_FOR_MANAGERS` | `memberCount < MIN_MANAGERS_TO_START_DRAFT` (2) |
| `READY_FOR_DRAFT` | `memberCount >= MIN_MANAGERS_TO_START_DRAFT`, no `drafts` row yet |
| `DRAFTING` | A `drafts` row exists with `status = 'in_progress'` |
| `ACTIVE` | A `drafts` row exists with `status = 'completed'` |
| `COMPLETED` | `fantasy_leagues.status` is `completed`/`archived` (not driven by this pass) |

`READY_FOR_DRAFT` — and therefore the commissioner's ability to start the
draft — requires only `MIN_MANAGERS_TO_START_DRAFT` (2) managers, **not**
`settings.maxTeams` (the league's configured target size). A league
configured for 10 managers may start its draft the moment a 2nd manager
joins; Eleven never requires filling the configured target first, and
never auto-starts on reaching the minimum either — starting remains an
explicit commissioner action (`start_draft`). `maxTeams` still gates
*joining* (`join_league_by_invite_code`'s `LEAGUE_FULL` check).

Illegal transitions (e.g. starting a draft with fewer than
`MIN_MANAGERS_TO_START_DRAFT` managers, drafting an already-owned player,
editing a lineup for a league that isn't `ACTIVE`) are rejected
server-side — see each engine function's own validation.

## League size

Eleven supports 6–12 manager leagues as the designed/tested range for a
full season; nothing hardcodes 8. `fantasy_leagues.settings.maxTeams`
(already a real, arbitrary integer in the existing schema) gates
*joining* a league, not starting its draft — see "League lifecycle"
above for the actual `MIN_MANAGERS_TO_START_DRAFT` (2) rule. Odd manager
counts are **allowed**: the round-robin schedule generator
(`src/domain/fantasy/schedule.ts`) uses the standard circle method, which
naturally produces a deterministic bye for whichever team draws the
"ghost" slot in an odd-sized league each round — that team simply has no
`matchups` row that round (not a fabricated result, not a loss/draw).

## Draft

- **Snake order**: generated once when the draft starts, persisted to
  `draft_orders` (`position` 1..N), never reshuffled on refresh/reconnect.
  Round parity determines direction: odd rounds go position 1→N, even
  rounds N→1 — pure function, `src/domain/fantasy/draft-order.ts`.
- **Order randomization**: a Fisher–Yates shuffle seeded from
  `crypto.randomUUID()`-derived entropy at draft-start time, persisted
  immediately as `draft_orders` rows. Once written, that order is
  authoritative — re-running draft start (which can't happen — see below)
  would never re-shuffle an existing draft.
- **Atomicity**: `start_draft()` and `make_draft_pick()` are Postgres
  `SECURITY DEFINER` functions (same pattern as the existing
  `create_league`/`join_league_by_invite_code`), so the read-check-write
  of "is this player free, is it this team's turn, advance the pick" is
  one atomic transaction. Two simultaneous picks for the same player:
  the second transaction's `league_player_ownership` insert hits the
  existing `(league_id, player_id)` primary key and fails with a
  distinct, mapped error the client shows as "player already taken,"
  not a generic failure.
- **Pick timer**: a configurable `pickTimerSeconds` already lives in
  `fantasy_leagues.settings` (default 300s / 5 minutes as of Pass 10.5 —
  deliberately generous for current testing; not yet configurable
  per-league). The timer's deadline is
  `drafts.current_pick_started_at + pickTimerSeconds` (a new, additive
  column — see migrations) — an authoritative persisted timestamp, not a
  browser countdown. Refreshing/reconnecting reads the same deadline. On
  expiry, an **auto-pick** runs: deterministically the first available
  player, ordered by `(position, name)`, matching the drafting team's
  most under-filled canonical roster minimum first (see "Roster rules"
  above), among only the positions that remain legal under the same
  mathematical-completability check `_perform_draft_pick` itself
  enforces — it can never construct an invalid squad. No queue system
  this pass — explicitly deferred, noted as a follow-up (brief §Draft
  timer allows this).
- **Completion**: a draft transitions `in_progress → completed` only once
  every team's roster has reached the target squad size with no
  duplicate/orphan picks (validated server-side in the same function that
  processes the final pick) — then the league lifecycle reads `ACTIVE`
  for the first time. No starting-XI requirement to complete the draft.

## H2H schedule & scoring

- **Schedule**: standard round-robin (circle method), generated once when
  round 1 opens, persisted as `matchups` rows per round. For a season
  longer than one full round-robin cycle, pairings repeat (home/away
  reversed on the second cycle) rather than regenerating randomly.
- **Matchup score** = sum of `fantasy_player_scores.points`
  (`scoring_rule_version = ELEVEN_STANDARD_V1`) for every **starting**
  `lineup_slots` entry's player, across every fixture that player played
  within the round's window. Bench points never count. Unowned/free-agent
  points never count (they're never on any roster in the first place).
  Recomputed from canonical scores on every read — never incremented, so
  duplicate scoring runs or provider corrections converge rather than
  double-count (Pass 9's rule, extended to the round/matchup layer).
- **Matchup states**: `scheduled` (no relevant fixture has kicked off
  yet) → `live` (at least one starter's fixture is currently
  `live`/`ht`) → `final` (the round has been finalized — see below).
  Never inferred from wall-clock date alone.
- **Round closed / result pending / result final**: at Tuesday 06:00 UTC,
  the old scoring window closes and the next week opens independently.
  Closed, unfinished results stay visible in League as **PENDING**, with
  their real stored scores and date range. They do not affect official
  W/L/D, PF/PA, records or standings until final.
- **Finalization**: one fixed **60-minute grace after the persisted round
  end**. A normal completed week is eligible at Tuesday 07:00 UTC; the
  existing every-minute central cron publishes it on a subsequent tick.
  Settlement no longer waits for ingestion's 24-hour correction cadence.
  Only scoring-eligible fixtures relevant to starters (including known
  appearances after transfers) can block it; acquisition cutoffs apply.
  Relevant fixtures must be final or postponed. V4 requires a complete
  final player envelope from both fixture participants, reported stats and
  a captured scoring position for known appearances, plus the round's
  pinned-version scores matching the unchanged scorer. A full final
  envelope can establish non-participation; missing/partial/error responses
  cannot. Optional provider nulls remain valid and are never fabricated.
  Both matchup score sides must exist. Missing required evidence or a
  still-live fixture keeps the result PENDING until normal reconciliation
  resolves it. User page loads never settle competition.
- **Atomic publication**: trusted `settle_fantasy_round` checks the same
  stored evidence again and commits both score sides, final matchup/round
  statuses and finalization events in one transaction. Standings remain
  derived from FINAL rows. Retries do not count results twice. Existing
  immutability triggers remain unchanged; later player analytics cannot
  rewrite an official result.

## Standings

Derived, never cached: wins/losses/draws/points-for/points-against are
computed from finalized `matchups`+`matchup_scores` rows every time
they're read (pre-existing `getStandings()` convention, extended with
points-against). Tiebreak order: **wins, then points-for, then
head-to-head result if the two tied teams have played each other, then
points-against (ascending)**. An unfinished league's standings render
"NO RESULTS YET," never a fabricated 0-0 table.

## Out of scope (unchanged from the brief)

Free agency, waivers, trades, FAAB, playoffs (beyond whatever repeat-cycle
scheduling already supports), commissioner override tooling,
notifications, native app, keeper/dynasty mode. Players render as
`OWNED`/`FREE`; post-draft acquisition stays truthfully disabled.
