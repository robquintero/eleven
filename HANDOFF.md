# Pass 11.5 — Completion Handoff

**Branch:** `feature/pass-11-5-surface-consolidation` (off `main`, not merged, not pushed).

**Status: substantially complete.** All seven surfaces in the brief (Home,
Matchup, Draft ×2, Team, Players, League) have real, working implementations.
The one explicit "completion blocker" (Player Inspector responsive/scroll
bug) is fixed. No browser was available in this environment to do actual
visual/mobile QA — that is the one honest gap, called out below and in the
final completion report.

If you're picking this up fresh: read this file, then `git log --oneline`
on this branch for the exact sequence of commits (each one is scoped to a
single concern and has a detailed message). You should not need to re-run
the Home/Matchup/Draft research from the first checkpoint — it's preserved
in this file's "Architecture decisions" section below.

---

## What's done

1. **Players** — points-descending is the default sort, and is now
   *actually* globally correct (see "Bugs found and fixed" below).
2. **Draft** — same points-sort fix inherited automatically (shared
   `getPlayerDatabase`); mobile shows a compact on-the-clock/pick/timer/
   squad strip above the player pool instead of below it.
3. **Team** — drop-from-squad via the player inspector, reusing the exact
   Pass 11 `drop_player` RPC and confirmation pattern.
4. **Home** — roster-vacancy readout + a real trade desk (propose/accept/
   reject/cancel), built from the existing Pass 11 trade components.
5. **Matchup** — full game center: both managers' complete starting XI +
   bench as dense side-by-side lists, a per-manager live/done/remaining
   player-count strip, real per-round points, real fixture/lock state,
   and a dedicated regression test proving historical lineups never
   derive from current ownership.
6. **League** — refocused as a competition center: standings, this
   round's league-wide matchups, recent results, and records derived only
   from completed matchups. Trade tooling moved to a secondary column.
7. **Branding** — the generated "11" SVG mark is gone from the product UI;
   the shell now reads the plain lowercase word "eleven."
8. **Player Inspector** — fixed both the desktop edge-bolted panel/close-
   button problem and the mobile "async content pushes the header
   off-screen" bug (this was called an explicit completion blocker).

## Bugs found and fixed along the way

These weren't in the original ask but were discovered by testing against
the real database and are now fixed + regression-tested:

- **Points sort wasn't actually global.** The Supabase project caps every
  unbounded `.select()` at `max_rows` (1000, `supabase/config.toml`). With
  2767 active players, the points-sort candidate-id query silently saw
  only an arbitrary ~1000 of them. Fixed with a `fetchAllRows` pagination
  helper (`src/data-access/players.ts`) used everywhere an unbounded read
  is needed. Proven against live data: a dedicated regression test
  confirms page 1 is the TRUE top-10 by points across all 2767 players.
- **Club sort was completely broken**, found while fixing the above:
  `.order("short_name", { referencedTable: "clubs" })` is a silent
  PostgREST no-op (it does not order outer rows by an embedded relation's
  column — confirmed live, not just in docs). Fixed the same way as
  points: fetch all candidates, compute the real sort key in JS, paginate.
- **Matchup historical lineups were wrong on the first attempt**: querying
  `roster_entries` filtered by `status = 'active'` silently excludes a
  player who was dropped/traded away after their round locked — exactly
  the bug the brief's "don't derive from current ownership" rule warns
  against. Fixed by querying FROM `lineup_slots` (scoped to the specific
  round) instead, which a later ownership change never touches. Caught by
  a dedicated regression test before it ever shipped.
- **Nearly repeated the embedded-relation-order bug a second time** while
  building `getLeagueCompetitionSummary` (tried `.order("fantasy_rounds
  (number)", ...)`). Caught it myself this time, before running it, and
  sorted in JS instead.

## Architecture decisions worth knowing about

- **`query*` extraction pattern.** `getPlayerDatabase`, `getMatchupSquads`,
  and `getLeagueCompetitionSummary` are now thin wrappers around
  client-injectable cores (`queryPlayerDatabase`, `queryMatchupSquads`,
  `queryLeagueCompetitionSummary`) that take `supabase` as a parameter.
  This exists SPECIFICALLY so these can be called directly from a plain
  Node integration test with the admin client — `getXxx()` itself calls
  `createClient()` (or a `resolveClient()` wrapper that dynamically
  imports it), which needs a live Next.js request's cookies and can't run
  outside one. If you add a new data-access function that needs a real-DB
  regression test, follow this same split rather than inventing a
  different testing strategy.
- **`next/headers` and relative imports.** `src/data-access/players.ts`
  and `src/data-access/matchups.ts` both had their internal `@/...`
  aliased imports converted to relative (`../lib/...ts`) imports, matching
  the pre-existing convention in `src/lib/fantasy-engine/*.ts`. This is
  REQUIRED for plain-Node testability — `@/...` aliases only resolve under
  Next.js/webpack, not `node --experimental-strip-types`. `createClient`
  itself (which pulls in `next/headers`) is never a static import in
  either file anymore; it's dynamically imported inside a small
  `resolveClient()` helper, called only from the thin `getXxx()` wrappers.
  If you add new data-access functions to these files and want them
  testable the same way, follow this pattern; if a file doesn't need
  real-DB testing, don't bother converting its imports.
- **Matchup lineups are dense LISTS, not the Team page's pitch diagram.**
  The brief was explicit about "LIST FORM" — `MatchupLineups`
  (`src/components/matchup/matchup-lineups.tsx`) reuses `BenchRow` for
  every starter AND bench player on both sides, never `<Pitch>`. This was
  a deliberate choice, not an oversight — don't "fix" it into a pitch
  diagram without re-reading the brief's exact wording.
- **Locked-state override in `getMatchupSquads` is conditional, not
  blanket.** A starter's `fixture.state` is only overridden to `"locked"`
  when the real fixture is STILL `"upcoming"` (a brief sync-lag window
  right at kickoff). Once the real fixture is already `"live"` or
  `"final"`, that is kept as-is — it's strictly more informative on a
  live-scoring page than a generic "locked" label, and overriding it
  unconditionally was an actual bug I caught and fixed during this same
  pass (see `buildMatchupTeamSquad`'s own comment).
- **No playoff section on League.** Eleven has no playoff lifecycle at
  all today (that's explicitly Pass 12's job per the brief's own scope
  guard). Inventing "provisional" playoff language with zero backing data
  seemed more likely to confuse than help, so it was omitted entirely
  rather than stubbed in.
- **`TerminalPanel` gained an opt-in `stickyHeader` prop** (default
  `false`, so its other two callers — auth-form, league-forms — are
  unaffected). Used only by the Player Inspector's overlay variant, so its
  "PLAYER_RECORD" header (and the close button now rendered inside it)
  stays reachable while the body scrolls beneath it.
- **`Sheet`'s `right`/`left`/`bottom`/`top` variants are now viewport-
  bounded with `dvh` units** instead of `h-full`/`h-auto` with no cap, and
  `right`/`left` are inset from the screen edges (`inset-y-4 ... -4`)
  instead of flush. `Sheet` has exactly one consumer (`PlayerInspector`),
  so this had zero blast radius elsewhere.

## Known gaps / honest limitations

- **No actual browser-based mobile QA was performed.** No Playwright/
  Puppeteer/browser tool was available in this environment across this
  entire pass. Every mobile-layout claim (Draft's compact strip, the
  Player Inspector's `dvh` sizing, Matchup's stacked lists, League's
  grid) is a careful code-level deduction, not something seen rendered.
  **This is the single most important thing to verify before calling
  Pass 11.5 fully done** — at minimum, check the Player Inspector at
  375/390/430px with a player that has a long recent-match history.
- **`PlayerTable`'s "PTS" column header has no `sortKey`** (click-to-sort
  isn't wired for points there, only the SORT dropdown). Not a brief
  requirement, just a nice-to-have parity gap.
- **League records testing covers the "nothing final yet" path, not the
  "records computed from real finalized matchups" path** — that would
  need a fully-scored round (real fixtures with real final scores), which
  wasn't practical to set up deterministically in the time available.
  The derivation logic was read-reviewed carefully and mirrors
  `getStandings`'s own well-tested patterns, but it doesn't have its own
  dedicated "here's a real finalized record" regression test yet.
- **The points-sort/club-sort comparator logic lives inside a function
  that also makes live Supabase calls** rather than being extracted into
  an independently pure-unit-testable function. The real-database
  integration tests cover it thoroughly, but there's no fast `npm test`
  (non-integration) coverage of the comparator itself.

## Exact next step if resuming

1. If you have browser access: QA the Player Inspector at 375/390/430px
   per "Known gaps" above. This is the one item explicitly called a
   completion blocker in the brief.
2. Otherwise: nothing is blocking. Validation (`npm test`, `npx tsc
   --noEmit`, `npm run lint`, `npm run build`, `npm run test:integration`)
   all pass as of the final commit on this branch. Read the final
   completion report (delivered in chat at the end of this pass) for the
   full file list and section-by-section detail.
3. Do not begin Pass 12 from this branch. Do not merge/push without the
   user's explicit instruction.
