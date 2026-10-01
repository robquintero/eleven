# Pass 11.5 Handoff — Product Surface Consolidation

Written at ~90% context to hand off to a fresh Claude Code session. This file
is a temporary working document for that handoff — delete it once Pass 11.5
is complete and reported on (it's not a permanent docs/ file).

**Branch:** `feature/pass-11-5-surface-consolidation` (created off `main` at
the start of this pass — `main` at that point was at commit `4d696d3`, which
already includes Pass 11 free market/trades, Pass 11.1 nav transitions, and
the nav-loader viewport-centering micro-fix).

**Checkpoint commit:** created by this same handoff turn — see the final
report message for its hash. Do not amend it; make new commits on top.

---

## 1. Full Pass 11.5 scope (verbatim intent, condensed)

A product/UI/information-architecture pass over Eleven's existing surfaces,
run before Pass 12 introduces new systems. Explicit non-goals: do not touch
the fantasy engine, scoring rules, round semantics, roster rules, or add
waivers/new competitive mechanics. Pass 11's free market/trade engine is
authoritative and must stay intact (and *was not modified* in this pass —
every change below is additive UI/data-composition work on top of it).

Target end state, one paragraph per surface:

1. **Home** → true manager command hub: what's happening in my league, what
   needs my attention, matchup status, squad completeness, incoming/outgoing
   trades (with a real propose-trade entry point, not just a link), recent
   activity. Dense, restrained — not a dashboard-card wall.
2. **Matchup** → full head-to-head game center: **both managers' complete
   starting XIs side-by-side in list form** (desktop: two columns; mobile:
   best responsive equivalent, not a squeezed desktop table), each player
   showing real position/club/fixture/points/lock-state, a matchup summary
   above it (scores, remaining/live/completed counts, round), round
   history/navigation preserved if it exists, and — critically — lineup
   truth must come from that round's `lineup_slots` records, never from
   current ownership (a traded/dropped player's historical round must still
   render correctly).
3. **Draft** → (A) mobile: critical decision context (on-the-clock, pick,
   timer, roster composition) must stay visible without scrolling past the
   player pool; (B) available-player list defaults to fantasy points
   descending.
4. **Team** → drop a player directly from Team (not forced through Players),
   reusing the exact Pass 11 `drop_player` RPC/confirmation pattern, with
   authoritative-result-only updates and unchanged locked-player semantics.
5. **Players** → add a points-descending sort and make it the **default**;
   preserve A–Z/Club and all filter/search composition.
6. **League** → refocus as the competition center: standings, current-round
   matchups, recent results, league records derived only from authoritative
   completed data, provisional-only playoff language (Pass 12 owns real
   lifecycle), trades de-emphasized (still accessible, no longer dominant).
7. Cross-cutting: proportional testing, no N+1 patterns, reuse shared
   data-access, serious mobile QA (375–430px) on every surface touched,
   preserve the "Football Command System" visual identity (no bubbly cards,
   no gradients, no ESPN-clone styling).

Full verbatim brief is in the conversation history this session continues
from — not reproduced here in full to save space, but every numbered
section above maps 1:1 to the original brief's numbered sections (1 Home, 2
Matchup, 3 Draft-mobile, 4 Draft-order, 5 Team-drop, 6 Players-sort, 7
League, 8 responsive QA, 9 design, 10 data/architecture, 11 performance, 12
testing, 13 manual QA, 14 completion report).

---

## 2. What has been COMPLETED (verified: tsc clean, lint clean, build clean,
   npm test 360/360 pass as of this checkpoint)

### Players — points sort (brief §6) — DONE
- `src/lib/players-filters.ts`: `SortKey` is now `"points" | "name" | "club"`;
  `defaultFilters.sort` is now `"points"` (was `"name"`); `sortOptions` has
  `{value:"points", label:"POINTS HIGH–LOW"}` first; `isSort`/
  `filtersToSearchParams`'s "omit at default" check updated accordingly.
- `src/lib/players-filters.test.ts`: fixed a test that used `"points"` as its
  *invalid-value* example (now that `"points"` is valid and the new default,
  that test would have been wrong) — now uses `"bogus"` and expects fallback
  to `"points"`.
- `src/data-access/players.ts` — `getPlayerDatabase` restructured (see §9
  below for the exact global-correctness mechanism): `PlayerQuery.sort` is
  now `"points" | "name" | "club"`. A new `PlayerRow` interface was added
  (matches Supabase's exact inferred shape for the shared select string —
  note `clubs` and `clubs.competitions` are typed NON-nullable there because
  that's what TS inferred from the schema, even though the enrichment code
  still defensively optional-chains). Filter application was refactored into
  a shared `applyCommonFilters()` closure (used by both the points-sort path
  and the direct-order path) plus hoisted `ownershipIdFilter`/
  `ownershipExcludeIds` resolution — this was necessary so sorting-by-points
  doesn't fork the ownership-filter logic into two copies.
- Toolbar (`player-database-toolbar.tsx`) needed **no changes** — it already
  renders `sortOptions` generically.
- `src/components/players/players-workspace.tsx` / `player-table.tsx`: not
  touched this pass (the "PTS" column header still has no `sortKey` — see
  §13 known limitations).

### Draft — points default + player-row points display (brief §4) — DONE
- `src/app/(app)/draft/page.tsx`: initial `getPlayerDatabase` call now passes
  `sort: "points"`.
- `src/app/(app)/draft/actions.ts`: `getAvailablePlayersAction` (used by the
  live search/filter re-fetch) now also passes `sort: "points"`.
- `src/components/draft/draft-workspace.tsx`: each available-player row now
  shows `· {totalPoints} PTS` appended to the club short-name line, so the
  sort rationale is visible (small addition, not in the original brief's
  letter but directly useful given the new default order — kept minimal).

### Draft — mobile decision context (brief §3) — DONE
- `src/components/draft/draft-workspace.tsx`: added a new compact,
  **non-sticky** block (`lg:hidden`) rendered **above** `AVAILABLE_PLAYERS`'
  `ModuleHeader`/search/filter/list, containing: ON THE CLOCK, PICK, TIME
  (reusing the exact same `draft`/`remainingMs` state already computed in
  this component), "YOUR PICK" flag, then a SQUAD row + GK/DEF/MID/FWD
  compact counts (reusing `myCounts`/`ROSTER_RULES` already computed here —
  no new roster-counting logic). The two `RailModule`s this replaces on
  mobile (`DRAFT_STATUS`, `SQUAD`) were given `className="hidden lg:block"`
  so nothing renders twice; `RECENT_PICKS` stays visible at every breakpoint
  (not required to be "immediately visible" per the brief, fine to remain
  reachable by scrolling past the pool, same as before).
- **Design decision explicitly made and worth restating in the final
  report:** chose "render above the list" over "sticky pinned strip."
  Rationale: the header (`app-shell.tsx`) is already `sticky top-0 z-30`,
  and stacking a second `sticky top-0` element directly under it without
  knowing the header's exact rendered height is a known CSS footgun
  (both would compete for the same stick point / overlap) — rather than
  guess a pixel offset, this fix satisfies the literal requirement
  ("remain visible WITHOUT scrolling below the player pool") by placing
  the block before the pool entirely, which is also a much shorter
  corrective scroll than before (previously: scroll past the ENTIRE
  player list; now: scroll up a few lines). If a true pinned-sticky
  strip is wanted instead, that's a clean follow-up, not a blocker.

### Team — drop directly from squad (brief §5) — DONE
- `src/components/players/player-inspector-content.tsx`: added an optional
  `onRequestDrop?: () => void` prop; when present, renders a "Drop player"
  ghost button under the existing "ON YOUR ROSTER" block (the `ownership ===
  "mine"` branch, which previously had no action at all — just static text).
  Threaded through `player-inspector.tsx` (both `inline` and `overlay`
  variants).
- `src/components/team/team-workspace.tsx`: added `dropTarget`/
  `dropPending`/`dropError` state, `requestDrop(player)` / `confirmDrop()`
  handlers (calling `dropPlayerAction` from `src/app/(app)/players/actions.ts`
  — **the exact same Pass 11 RPC wrapper the Players market page uses, zero
  duplication**), a confirmation `<Dialog>` (same component/pattern as
  `players-workspace.tsx`'s own drop dialog), and wired `onRequestDrop` into
  the existing `<PlayerInspector player={detail} ... />` call (only when
  `canEdit`, i.e. `fantasyTeamId` exists). On success: closes both the
  confirm dialog and the inspector sheet, then `router.refresh()` — **never**
  a local optimistic roster mutation; the squad only changes once the
  server's authoritative result lands and the page re-renders. No new
  lock-blocking logic was added — the button is never disabled based on
  `player.locked`; `drop_player`'s existing Pass 11 semantics (preserve a
  locked slot, demote an unlocked one) are left completely untouched to
  decide what actually happens server-side.
- Vacancy-becomes-visible / BROWSE MARKET requirements needed **no new
  code** — `router.refresh()` re-runs `team/page.tsx` (a Server Component),
  which already recomputes `vacancies` and renders the vacancy banner (this
  pass's own `rosterVacancies` helper, see §3 below) every render.

### Shared/cross-cutting data layer
- `src/domain/fantasy/roster-rules.ts`: added `rosterVacancies(counts):
  {position, short}[]` — the one shared definition of "which positions are
  short of their roster MINIMUM" (deliberately never checks maximums; a
  market roster is never required to be "completable" the way a draft-in-
  progress one is — see the function's own doc comment). `src/app/(app)
  /team/page.tsx` was refactored to call this instead of its own inline
  loop (this was pre-existing Pass 11 code, now deduplicated). `src/app
  /(app)/home/page.tsx` (below) calls the same function — this is the
  "don't duplicate roster validation" requirement from brief §10, satisfied.
- `src/components/league/trade-center.tsx`: `TradeList` and
  `ProposeTradeDialog` (previously private, unexported functions) are now
  **exported** — this is the "decompose TradeCenter into reusable pieces"
  the brief explicitly invited, done specifically so Home's trade widget
  needs zero duplicated trade business logic.
- `src/components/dashboard/trade-desk.tsx` (**new file**): `TradeDesk`
  component for Home — composed ENTIRELY from `TradeList` +
  `ProposeTradeDialog` (imported from `trade-center.tsx`) and the same Pass
  11 server actions (`acceptTradeAction`/`rejectTradeAction`/
  `cancelTradeAction` from `src/app/(app)/league/trade-actions.ts`). Shows a
  "N PENDING" / "NO PENDING TRADES" header line, a "Propose Trade" button,
  and (only when `totalPending > 0`) both the incoming and outgoing
  `TradeList`s with full Accept/Reject/Cancel — i.e. Home gets **real**
  review/respond capability, not just a count-and-link.

### Home — manager command hub (brief §1) — DONE (first pass; see §7 for
   what's still arguably missing/could be deepened)
- `src/app/(app)/home/page.tsx`: now also fetches (in the existing top-level
  `Promise.all`, no added waterfall for this part) `getLeagueTeams(league.id)`
  when `team` exists; then, in a second `Promise.all` (genuinely dependent on
  the first — same two-level pattern `/league`'s own page already uses),
  fetches `getTeamRosterPlayers` for the caller + every other team, and
  `getTeamTrades`. Computes `vacancies` via the new shared `rosterVacancies`
  helper. Renders:
  - A roster-vacancy banner (same copy/visual pattern as Team's, written
    inline rather than extracted into a shared component since the
    surrounding layout context differs and it's only a few lines — see
    CLAUDE.md-equivalent guidance against premature abstraction) between
    `MatchupCommand` and `StartingXI`, only when `team` exists and
    `vacancies.length > 0`.
  - A new bordered `TRADE_DESK` box in the right rail, stacked below the
    existing `OperationsRail`, rendering `<TradeDesk>` with all the fetched
    props — only when `team` exists (an existing team is required for ANY
    trade context, exactly like the `/league` page's own gating).
  - Everything else on Home (`Greeting`, `LeagueStatusPanel`,
    `MatchupCommand`, `StartingXI`, `OperationsRail`, `ActivityFeed`/
    `OPERATIONS_FEED`) is **unchanged** — none of those components were
    edited this pass.

---

## 3. What is PARTIALLY implemented or NOT YET STARTED

- **Matchup (brief §2) — NOT STARTED.** This is the single largest
  remaining item. See §5 below for the full research findings; nothing in
  `src/app/(app)/matchup/page.tsx`, `src/components/dashboard/
  matchup-command.tsx`, or `src/data-access/matchups.ts` has been touched.
  A new data-access function returning both teams' full lineup (starters +
  bench, with real fixture/points/lock state) does not exist yet and must
  be built — see §5's "smallest extension" design.
- **League (brief §7) — NOT STARTED.** `src/app/(app)/league/page.tsx` still
  has its Pass 11 shape (league list, league status, members, standings,
  transactions, `TradeCenter`). No standings-as-first-class-surface work,
  no current-round-matchups section, no recent-results section, no league
  records/stats, no playoff-picture section, and trades have not been
  de-emphasized/reordered. Nothing to report here beyond "not started."
- **Draft — a true pinned/sticky version of the mobile status strip** was
  considered and deliberately NOT done (see §2's "design decision" note) —
  the current fix (reorder above the list) satisfies the literal
  requirement but a next session could revisit true stickiness if wanted,
  now that the header's rendered height could be measured via a dev
  server + browser rather than guessed.
- **Players — column-header click-to-sort for the "PTS" column** was not
  added. `PlayerTable`'s `HeaderCell` component already supports
  `sortKey`/`onSort` (used today for NAME and CLUB headers) — the "PTS"
  header (`player-table.tsx` line ~101) currently has no `sortKey` prop.
  The toolbar's SORT dropdown already fully supports selecting "POINTS
  HIGH–LOW" though, so this is a nice-to-have parity gap, not a missing
  requirement (the brief only required the dropdown-level sort + default).
- **Mobile QA (brief §8) — NOT PERFORMED.** No browser-automation tooling
  is available in this environment (confirmed in two prior passes this
  session — no Playwright/Puppeteer installed, no browser tool exposed to
  the agent). Every change above was reasoned through at the code/CSS
  level (breakpoints, flex/grid behavior, existing responsive conventions)
  but **not visually verified in an actual mobile viewport**. This is the
  single most important gap to close manually before considering Pass
  11.5 done — see the final report's "first task for next session."
- **Integration/regression testing against the real Supabase project** —
  NOT RUN this pass. Nothing touched here requires it per the brief's own
  guidance ("Run real database integration tests if this pass materially
  changes shared data-access behavior relied upon by competitive actions"
  — the points-sort change to `getPlayerDatabase` is a read-path
  restructuring, not a competitive-state mutation, and no RPC/migration
  was touched). `npm run test:integration` was NOT run this session:
  recommend running it once before the final Pass 11.5 report, purely as
  a non-regression check on the read path, not because new integration
  tests are expected for this pass.
- **No focused unit tests were added** for the new pure logic this pass
  introduced (`rosterVacancies`, the points-sort ordering/tie-break logic
  in `getPlayerDatabase`). The brief's §12 explicitly asks for "focused
  tests for new pure data logic such as points sorting... any new status
  derivation" — this is an outstanding TODO, not yet done. `rosterVacancies`
  is a small pure function and would be trivial to unit-test
  (`src/domain/fantasy/roster-rules.test.ts` likely doesn't exist yet —
  check before creating). The points-sort tie-break logic
  (`getPlayerDatabase`'s points-descending-then-name-ascending sort) lives
  inside a function that also makes live Supabase calls, so it isn't
  trivially unit-testable in isolation without extracting the comparator
  into its own pure function first — worth doing as a small refactor
  (`function comparePlayersByPointsDesc(a, b, scoresByCandidateId)` or
  similar) specifically so it CAN be unit tested without a DB.

---

## 4. Every file changed this pass (git status as of this checkpoint)

```
 M src/app/(app)/draft/actions.ts
 M src/app/(app)/draft/page.tsx
 M src/app/(app)/home/page.tsx
 M src/app/(app)/team/page.tsx
 M src/components/draft/draft-workspace.tsx
 M src/components/league/trade-center.tsx
 M src/components/players/player-inspector-content.tsx
 M src/components/players/player-inspector.tsx
 M src/components/team/team-workspace.tsx
 M src/data-access/players.ts
 M src/domain/fantasy/roster-rules.ts
 M src/lib/players-filters.test.ts
 M src/lib/players-filters.ts
?? src/components/dashboard/trade-desk.tsx
?? HANDOFF.md   (this file -- delete once Pass 11.5 is reported on)
```

No migrations, no RPCs, no RLS policies, no database schema touched this
pass — everything above is TypeScript/TSX application code plus one test
file. `git diff --stat` (pre-checkpoint-commit): 13 files changed, 434
insertions(+), 85 deletions(-), plus the new `trade-desk.tsx` file.

---

## 5. Research-agent findings (Home / Matchup / Draft) — full detail

Three parallel research agents were run at the start of this pass to avoid
re-deriving this from scratch. Their findings below are condensed but
should contain everything needed to avoid re-reading the whole codebase.

### 5a. Home (research complete, implementation done — see §2)

- Home's existing data-access calls (all real, all already wired):
  `getCurrentProfile`, `getUserLeagues`, `getActiveLeagueId`,
  `getUserTeamInLeague`, `getDraftStatus`, `getUserSquad`,
  `getCurrentMatchup`, `getStandings`, `getRecentActivity`,
  `getMatchupFixtureIntelligence`, `deriveLeagueLifecycle`.
- `src/data-access/matchups.ts` exports exactly: `CurrentMatchup`,
  `getCurrentMatchup(leagueId, fantasyTeamId)`,
  `MatchupFixtureIntelligence`, `getMatchupFixtureIntelligence(matchup,
  now)`, `StandingsRow`, `getStandings(leagueId)`.
- `src/data-access/trades.ts` exports exactly: `TradeAssetView`,
  `TradeView`, `getTeamTrades(leagueId, fantasyTeamId):
  Promise<{incoming: TradeView[]; outgoing: TradeView[]}>` — pending
  trades only (accepted/rejected/cancelled surface via
  `getRecentActivity` instead).
- `src/components/league/trade-center.tsx`'s exact pre-this-pass shape:
  one exported `TradeCenter` component, with two PRIVATE (now exported)
  inner functions `TradeList` and `ProposeTradeDialog`. The `/league`
  page's own composition pattern (now copied into Home, see §2) is:
  ```ts
  const allTeams = await getLeagueTeams(activeLeagueId);
  const otherTeams = allTeams.filter((t) => t.id !== myTeam.id);
  const [myRoster, otherRosters, trades] = await Promise.all([
    getTeamRosterPlayers(activeLeagueId, myTeam.id),
    Promise.all(otherTeams.map((t) => getTeamRosterPlayers(activeLeagueId, t.id))),
    getTeamTrades(activeLeagueId, myTeam.id),
  ]);
  const rostersByTeamId = Object.fromEntries(otherTeams.map((t, i) => [t.id, otherRosters[i]]));
  ```
- No existing "roster vacancy" computation existed before this pass —
  `Squad.bench` is a flat `Player[]` with no vacancy metadata.
  `rosterVacancies` (new, §2) fills this gap.
- Visual conventions confirmed: `.label-system` (mono, uppercase,
  tabular-nums), `ModuleHeader` (standalone section header w/ meta),
  `RailModule` (stacked-in-a-rail header+content, no own border),
  `OperationalRow` (label/value readout row), all-caps `UPPER_SNAKE`
  module names (`MATCHUP_COMMAND`, `ROUND_INTELLIGENCE`, `LIVE_FIXTURES`,
  `NEXT_LOCK`, `LEAGUE_TABLE`, `STARTING_XI`, `OPERATIONS_FEED`), flat
  bordered "instrument panel" aesthetic (no shadows/rounded cards), empty
  states are short/all-caps/truthful ("NO ACTIVITY YET" etc., never
  fabricated).

### 5b. Matchup (research complete, implementation NOT started)

**This is the next session's primary remaining task.** Key findings:

- `src/app/(app)/matchup/page.tsx` (55 lines) is currently just: resolve
  league/team/draft-status/lifecycle → `getCurrentMatchup` → render
  `<MatchupCommand matchup hasLeague />`. That's the ENTIRE page. No
  round selector, no second team's lineup, no pitch, nothing per-player.
- There is **no** `src/components/matchup/` directory at all. The only
  matchup-specific component is `src/components/dashboard/
  matchup-command.tsx` (a scoreboard strip only — no player data).
- `src/data-access/matchups.ts` has exactly 3 exports (`getCurrentMatchup`,
  `getMatchupFixtureIntelligence`, `getStandings`) — **none of them
  return per-player/lineup data.** A new function must be written.
- **The pattern to extend:** `src/data-access/roster.ts`'s
  `getUserSquad(leagueId, fantasyTeamId)` is the ONLY existing function
  that assembles a real starting XI + bench from persisted
  `roster_entries`/`lineup_slots` data, but it's single-team-only, always
  resolves "the latest round" (never a specific round id), and —
  important gap — its internal `toPlayer()` hardcodes `fantasyPoints: 0`
  and never populates `player.fixture` at all.
- **Smallest-extension design** (from the research agent, not yet built):
  a new function, e.g. `getMatchupLineups(fantasyRoundId, homeTeamId,
  awayTeamId)`, that:
  1. Runs the same `roster_entries → players → clubs → competitions` +
     `lineup_slots` query as `getUserSquad`, but `.in("fantasy_team_id",
     [home, away])` for BOTH teams at once, then partitions by team.
  2. Additionally joins `fixtures` (by `players.club_id`, scoped to the
     round's window) to populate `Player.fixture` per player — reuse
     `src/data-access/players.ts`'s private `getNextFixtureByClub()` /
     `FIXTURE_STATUS_TO_MATCH_STATE` mapping table rather than
     reinventing fixture-status logic. Note: that mapping NEVER emits
     `"locked"` — locked state is layered separately via
     `isLocked(lineup_slots.locked_at, now)`
     (`src/domain/fantasy/lineup-lock.ts`, already canonical/pure/
     clock-injected — reuse exactly as-is, never recompute).
  3. Additionally joins `fantasy_player_scores` (by `player_id` +
     fixture_id, filtered `scoring_rule_version = SCORING_RULE_VERSION`)
     to populate real per-round `fantasyPoints` — **critical schema
     note:** `fantasy_player_scores.fantasy_round_id` is NULLABLE and
     effectively unused by the scoring engine today; the correct join is
     via `fixture_id` (filtered to fixtures inside `[round.starts_at,
     round.ends_at)` for the player's club), exactly like
     `players.ts`'s `getFantasyScoreAggregates` already does it — NOT via
     `fantasy_round_id`.
  4. Reuses `layoutStartingXi()` (`src/lib/selectors/pitch-layout.ts`) for
     pitch coordinates on both sides.
  5. Returns something like `{ home: Squad; away: Squad }` (or two
     `Squad`s keyed by team id).
  - This is additive — no schema/migration change needed.
- **Round-id parameterization gap:** NEITHER `getCurrentMatchup` nor
  `getUserSquad` accepts an arbitrary round id today — both always
  resolve "current"/"latest." Round history/navigation (part of the
  brief) does not exist anywhere in the app (grepped — no round
  `searchParams` handling, no round-selector component). Building this
  means: (a) add a round-id parameter to the new lineup-fetching
  function (and probably to `getCurrentMatchup`, or a sibling
  `getMatchupByRoundNumber`/similar) instead of always auto-resolving
  "current"; (b) add a `?round=` URL param + a small selector component
  on the Matchup page.
- **Lineup-truth correctness (brief's explicit concern)** is already
  architecturally sound in the ONE existing pattern (`getUserSquad`):
  it joins `lineup_slots` scoped by a specific `fantasy_round_id`, never
  derives starters from current `roster_entries`/ownership alone. The
  new two-team function must preserve this exact pattern (round-scoped
  `lineup_slots` join, not "whoever currently owns this player").
- **UI components to reuse directly** (read-only mode, no new visual
  language needed): `src/components/team/pitch.tsx` (`Pitch` — supports
  `editing={false}` with all callbacks as no-ops already, i.e. it's
  already usable read-only; instantiate two side-by-side for home/away),
  `src/components/team/player-node.tsx` (`PlayerNode` — its `NodeStatus`
  sub-component already has the exact live/locked/final/upcoming →
  display-copy branches the brief wants: "FT · {pts}", pulsing-dot live,
  Lock-icon "LOCKED", `fixtureOpponentLabel()` for upcoming), and
  `src/components/team/bench-row.tsx` (`BenchRow` — same state-label
  branches, dense list-row pattern for rendering each side's bench).
  `src/components/team/team-workspace.tsx` is NOT directly reusable (it
  owns a whole lineup-EDITING state machine not needed for a read-only
  opponent comparison) but is the structural reference for "how to lay
  out a Pitch + bench + rail together."
- Visual conventions confirmed same as Home (`ModuleHeader`, `RailModule`,
  `.label-system`), plus `MatchupCommand`'s own specific conventions:
  bordered `border-border bg-surface-elevated` shell, pulsing-dot LIVE
  badge, "YOUR TEAM" accent label, `MATCHDAY {pad2(n)}` round label.

### 5c. Draft (research complete, implementation done — see §2)

- Confirmed (before this pass's edit) the mobile bug's exact cause:
  `draft-workspace.tsx`'s root layout was `grid grid-cols-1
  lg:grid-cols-[1.6fr_0.9fr]` with the player-list `<section>` as the
  FIRST DOM child and the `DRAFT_STATUS`/`SQUAD`/`RECENT_PICKS` rail
  `<div>` as the SECOND — on mobile (`grid-cols-1`, pure stacking) this
  meant scrolling the ENTIRE player list before reaching any of that
  context. No `order-*` utilities, no `useMediaQuery`-based restructuring
  existed anywhere in this file prior to this pass.
- Confirmed `totalPoints` was ALREADY populated on every player object
  returned by `getPlayerDatabase` in the draft context too (draft reuses
  the exact same function, no separate draft-specific query) — the only
  missing piece was the `sort: "points"` wiring + the global-correctness
  restructuring in `getPlayerDatabase` itself (done, see §2 and §9).
- Flagged (important, now resolved): a transient build-breaking
  half-finished edit was visible to the Draft research agent mid-flight
  (it ran concurrently with this session's own `players-filters.ts`
  edits) — that transient state no longer exists; `tsc --noEmit` is clean
  as of this checkpoint. No action needed, just noting it in case a
  stale description of it surfaces anywhere else.
- `src/domain/fantasy/roster-rules.ts`'s `draftablePositions` was (and
  remains) the only UI consumer of that module, used ONLY to gate the
  DRAFT button's `disabled` state (`legalPositions.has(player.position)`)
  — never rendered as a standalone visible panel. The SQUAD rail
  module (and the new mobile compact strip) render `ROSTER_RULES`
  directly, not through `roster-rules.ts`'s helper functions — this was
  already true before this pass and remains true; not a bug, just how
  "visible roster counts" vs. "is this pick legal" are implemented
  as two separate, both-correct things.

---

## 6. Players points-sort implementation — exact global-correctness
   mechanism (brief §10's "avoid N+1" concern, addressed)

The naive risk: `getPlayerDatabase` fetches a `.range()`-paginated PAGE
from `players` FIRST (ordered by name/club), THEN joins point aggregates
for just that page's ids. Sorting by points can't reuse that shape directly
— "sort page 1 of 50 alphabetically-first names by their points" is not
"show me the actual top 50 scorers league-wide."

**What was built instead**, only when `query.sort === "points"`:
1. One id+name-only query (`applyCommonFilters` applied to a
   `.select("id, name")` builder) returns EVERY player matching the
   request's filters (search/position/competition/club/availability/
   ownership) — cheap, no joins, no pagination yet.
2. `getFantasyScoreAggregates(supabase, allFilteredIds)` — **the exact
   same function already used for the non-sort-mode enrichment step**,
   just called with the full candidate-id list instead of one page's ids.
   This is the "never a second scoring calculation" requirement: there is
   exactly one function that aggregates `fantasy_player_scores` into
   per-player totals, called from two different places in the same file.
3. Sort the full candidate list in JS: points descending, ties broken by
   name ascending (deterministic, matches the brief's own suggested
   tie-break rule).
4. Slice the SORTED id list to the requested page (`.slice(from, from +
   pageSize)`).
5. Fetch full player rows for just that page's ids (`.in("id", pageIds)`),
   then re-order them in JS to match the sorted order (Supabase `.in()`
   does not guarantee result order).
6. Continue into the SAME downstream enrichment (`getUsageAggregates`,
   `getNextFixtureByClub`, `getFantasyScoreAggregates` again — this third
   call is scoped to just the page's ids, same as the non-points path
   already did) — i.e. steps 5–6 of the "else" branch are shared/
   identical in shape to the pre-existing code.

Total query count for the points-sort path: candidate-id query (1) +
page-scoped aggregate query (1, inside step 2's `getFantasyScoreAggregates`
call) + full-row page query (1) + the 3 existing downstream enrichment
queries (usage/fixture/points-for-display) = 6 queries total, independent
of how many total players exist in the system — bounded, not N+1. The
non-points-sort path (name/club) is **completely unchanged** — still one
single `.order().range()` query plus the same 3 downstream enrichment
queries as before this pass.

The `PlayerRow` interface and `applyCommonFilters` generic-typed helper
(`<T extends {eq, ilike, or, in, not}>`, using `any` for the generic bound
specifically to dodge Supabase's per-`.select()`-shape builder generics
without `as any`-casting every call site) are both new and are the main
things worth re-reading carefully if touching this function again —
`src/data-access/players.ts`, roughly lines 36–52 (interface) and 104–240
(the restructured function body).

---

## 7. Known issues, risks, TODOs

- **No visual/browser QA performed anywhere in this pass** (see §3) — the
  single highest-risk gap. Every mobile-layout claim in this document is a
  code-level deduction (grid/flex classes, breakpoint math), not something
  actually seen rendered. Recommend the next session either gets access to
  a browser tool, or asks the user to manually verify the Draft mobile
  strip and the eventual Matchup two-column layout at a real 375–430px
  width before this pass is reported as done.
- **Matchup is unstarted and is the largest remaining chunk of this pass**
  — likely 40–60% of the total remaining work, given it needs a brand-new
  data-access function, a brand-new page layout, round-history
  navigation, and careful historical-vs-current-ownership correctness
  testing.
- **League is entirely unstarted.**
- The points-sort comparator inside `getPlayerDatabase` is not yet
  extracted into an independently-unit-testable pure function (see §3) —
  low effort, worth doing before writing its unit test.
- `rosterVacancies` has no dedicated unit test yet (trivial to add — pure
  function, no I/O).
- Home's `TradeDesk` was placed directly as a bordered box in `home/
  page.tsx` rather than as its own `RailModule`-wrapped section like
  `OperationsRail`'s internals — this was a deliberate minimal choice
  (TradeDesk already renders its own internal header line) but is worth a
  second look for visual consistency once it can actually be seen
  rendered.
- Nothing in this pass has been committed to git yet as of starting this
  handoff — see the final report for the checkpoint commit hash created
  at the end of this handoff turn.
- `npm run test:integration` was not run this session (see §3) — not
  believed necessary (no RPC/schema/migration touched), but worth a quick
  run before the final Pass 11.5 report as a non-regression sanity check,
  since it touches real Supabase state and costs real time (the full
  suite took ~4 minutes in the Pass 11 session).

---

## 8. Exact recommended implementation order for the next session

1. **Read this file in full first** — avoid re-running the Home/Matchup/
   Draft research agents; everything they found is condensed above.
2. **Matchup (brief §2)** — the biggest remaining item, do it first while
   context is freshest:
   a. Write the new `getMatchupLineups`-style data-access function in
      `src/data-access/matchups.ts`, following §5b's exact design (reuse
      `getNextFixtureByClub`'s fixture-state mapping, `isLocked`,
      `layoutStartingXi`, and the `fixture_id`-not-`fantasy_round_id` join
      for `fantasy_player_scores`).
   b. Build the new Matchup page layout: matchup summary strip (extend/
      reuse `MatchupCommand` or build a richer sibling), then two
      `<Pitch editing={false} .../>` instances side-by-side on desktop
      (reuse `Pitch`/`PlayerNode`/`BenchRow` verbatim), collapsing to a
      stacked or tabbed layout on mobile — choose the smallest responsive
      change consistent with existing conventions (this page currently
      has zero responsive complexity to preserve, so there's more design
      freedom here than on Draft).
   c. Add round-id parameterization + a minimal round selector if time
      allows; if not, at minimum make sure the new function takes an
      explicit round/matchup id rather than silently assuming "current,"
      so round navigation can be added later without re-plumbing.
   d. Mentally re-verify (can't browser-test): a dropped/traded player's
      PAST round still renders from that round's real `lineup_slots`, not
      from current ownership.
3. **League (brief §7)** — standings as first-class surface, current-round
   matchups, recent results, records (only from completed data), de-
   emphasized trades, provisional-only playoff language. Likely smaller
   than Matchup since standings/matchups data mostly already exists
   (`getStandings`, `matchups` table) — the work here is composition/
   layout, not new data-access, except possibly a small "league records"
   derivation helper (brief explicitly says: highest/lowest score, largest
   margin, closest matchup, most PF/PA — all derivable from existing
   `matchups`+`matchup_scores` with `status='final'`, same source
   `getStandings` already reads).
4. **Close remaining small gaps**: extract the points-sort comparator into
   a testable pure function + write its unit test; write a
   `rosterVacancies` unit test; consider the "PTS" column `sortKey` for
   `PlayerTable` (nice-to-have, not required).
5. **Full validation pass**: `npm test`, `npx tsc --noEmit`, `npm run
   lint`, `npm run build`, then `npm run test:integration` as a
   non-regression sanity check (not because new integration tests are
   expected).
6. **Manual QA** (brief §13), including the mobile-width checks §8/§3
   called for — use a real browser if available in that session's
   environment; if not, say so explicitly in the final report rather than
   claiming it was done.
7. **Write the final Pass 11.5 completion report** per the brief's §14
   exact 12-point list, then stop — do not begin Pass 12.
