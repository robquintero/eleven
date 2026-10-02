# Pass 12 — Final Product Engine Pass: Completion Handoff

**Branch:** `feature/pass-12-final` (off `main` at `d621e78`, the merged
Pass 12A state). Not merged, not pushed. Commits, one per phase:

- `d621e78` Pass 12A — Season engine core (completed in the prior session, already on `main`)
- `ce3a1b1` Pass 12B — Multi-season lifecycle
- `4235ed8` Pass 12C — Eleven Standard V2 scoring
- `398dea8` Pass 12D — Production football sync, round progression, Live Matchday, Club Briefing
- `94c2d76` Pass 12E — Account/Settings, hardening

**Status: all four phases (12B–12E) complete.** Full validation is clean:
`npm test` (347 pass, 61 skipped integration files), `npm run
test:integration` (61 pass against the live Supabase project), `npx tsc
--noEmit`, `npm run lint` (0 errors, 1 pre-existing unrelated warning),
and `npm run build` all pass.

If you're picking this up fresh: this file covers 12B–12E. For 12A's own
schema/semantics (seasons, the soccer-style table, `progressSeason`), see
this file's own git history (`git show d621e78:HANDOFF.md`) — that
content isn't repeated here.

---

## 12B — Multi-season lifecycle

**Schema** (`supabase/migrations/20261003000000_multi_season_lifecycle.sql`,
applied to the linked Supabase project):

- `drafts.league_id`'s old `UNIQUE` constraint (Pass 10, explicitly
  flagged "revisit before supporting re-drafts") is replaced by
  `unique(season_id)`. `drafts.season_id` is nullable: the league's very
  first (inaugural) draft keeps it `NULL` forever (created before any
  season row exists — season 1's own bootstrap is unchanged from 12A);
  every REDRAFT's new draft sets it explicitly.
- `seasons.roster_mode` (`'REDRAFT' | 'KEEP_ROSTERS'`, nullable — `NULL`
  for season 1).
- `start_next_season(p_league_id, p_roster_mode, p_schedule_cycles)` —
  commissioner-only SECURITY DEFINER RPC. Requires the league's latest
  season to be `COMPLETED`. Atomically: creates season N+1 (`SETUP`),
  then for REDRAFT releases every roster (same soft-delete semantics as
  `drop_player` — `roster_entries.status = 'dropped'`, ownership rows
  deleted, never a hard delete) and creates a fresh season-scoped draft
  with randomized order (same mechanism `start_draft` uses); for
  KEEP_ROSTERS releases ownership ONLY for players with `players.active =
  false` (no compensation picks, no silent replacement — the vacancy is
  real). Concurrency: `unique(league_id, season_number)` + a
  `unique_violation` catch, the same idiom `resolveOrCreateActiveSeason`
  (12A) already uses — proven via a genuinely concurrent (`Promise.all`)
  integration test, which found (and the test now explicitly accepts)
  two equally-correct ways the loser can fail: an insert-level collision,
  or reading the winner's just-committed row as "already started."

**Engine fixes required by multi-draft support**: `ensureFirstRoundOpened`
(`src/lib/fantasy-engine/rounds.ts`) and `getDraftStatus`/`getDraftState`
(`src/data-access/drafts.ts`) previously assumed "a league has at most
one draft" (a real latent bug the old `drafts.league_id` UNIQUE
constraint had been masking). Fixed: `ensureFirstRoundOpened` now
resolves the draft belonging to the league's CURRENT season specifically
(or the legacy `season_id IS NULL` draft when no season exists yet);
`getDraftStatus`/`getDraftState` resolve the most-recently-created draft
(`order by created_at desc`) rather than assuming a single row.

**Season Archive**: `/league/seasons/[number]` + a League-page list
(`listSeasons`/`getSeasonArchiveDetail`, `src/data-access/seasons.ts`).
Explicitly season-id-scoped — `getStandingsForSeason`/
`getSeasonMatchupResults` (`src/data-access/matchups.ts`) take a
`seasonId` directly and never resolve "the current season" internally,
so a historical season's archive can never be affected by anything
happening in a newer one (verified by a dedicated immutability test).
`queryLeagueCompetitionSummary` (the League page's live view) was also
fixed to scope to the CURRENT season specifically — before 12B this was
scoped only by `league_id`, which was correct when a league could only
ever have one season, and would have silently blended an old season's
matchups into "current round"/"recent results"/"records" the moment a
second season existed.

**Tests**: 6 new integration tests (`multi-season-lifecycle.integration.test.ts`)
— authorization (commissioner-only, `NO_SEASON_TO_FOLLOW`,
`SEASON_NOT_COMPLETE`), REDRAFT (ownership release + draft creation +
idempotent double-click), REDRAFT's draft completing through the
unmodified canonical round-open chain with round numbering reset to 1,
KEEP_ROSTERS (retention + ineligible release + no draft), historical
immutability, and genuine concurrency. All pass against the live
database.

---

## 12C — Eleven Standard V2 scoring

**No new raw stat.** Re-audited `player_match_stats` before touching
anything — the stored field set is identical to V1's own documented
coverage (`docs/scoring-model.md`). V2 retunes the formula applied to the
same inputs; full design rationale and real-data calibration in the new
`docs/scoring-model-v2.md`.

**What changed** (`src/domain/fantasy/scoring.ts`, `SCORING_RULE_VERSION
= "ELEVEN_STANDARD_V2"`):

| | V1 | V2 |
|---|---|---|
| Goals (GK/DEF/MID/FWD) | 10/6/5/4 | **12/8/7/6** |
| Assists | 3 | **4** |
| Goal milestone bonus | none | **`goals² − 1`** for 2+ goals (exact for brace=3/hat-trick=8/4-goals=15/5-goals=24, and already correct past 5 — a real formula, not a lookup table) |
| Assist milestone bonus | none | **`n(n+1)/2 − 1`** for 2+ assists — provably smaller than the goal bonus at every count |
| Chances created | 0.5 | 0.75 |
| Defensive actions | 0.25 | 0.3 |
| Clean sheet (GK/DEF/MID/FWD) | 4/4/1/0 | 5/5/2/0 |

`FantasyScoreBreakdown.components` now matches the brief's own listed
breakdown exactly: `minutes, goals, goalMilestoneBonus, assists,
assistMilestoneBonus, shotsOnTarget, chancesCreated, defensiveActions,
saves, cleanSheet, cards`.

**New UI**: a Scoring Breakdown panel in the Player Inspector
(`src/components/players/scoring-breakdown.tsx`) renders the player's
most recently scored match's stored breakdown verbatim — never
recomputed in the UI.

**Calibration**: real 2026/27 data, 8,384 eligible performances, no
synthetic simulation. Every target texture band matched on the first
pass (means 3.98–4.32 across positions; a real hat-trick scored 42.20;
non-G/A clean-sheet defenders reached 10–11). Full numbers in
`docs/scoring-model-v2.md` §4.

**Migration**: V1 rows are never touched — `fantasy_player_scores`'s
`(player_id, fixture_id, scoring_rule_version)` key was built in Pass 9
specifically for this cutover. Ran `npm run scoring:backfill` against the
live project immediately after bumping the version constant (every app
read path filters by the CURRENT version, so skipping this would have
shown zero points for the whole season). V1 and V2 now coexist, 11,517
rows each.

**Bug found and fixed**: `players.integration.test.ts`'s points-sort
regression test hardcoded its own local `"ELEVEN_STANDARD_V1"` constant
instead of importing the live one — invisible until the version actually
bumped, at which point its independent "true ranking" oracle silently
diverged from the app. Now imports the real constant.

---

## 12D — Production football sync, round progression, Live Matchday, Club Briefing

**Production cron activated.** A real, single-request `npm run
football:check` against the live API-Football account (no secrets
printed) confirmed **7,500 requests/day, 300/minute** — comfortably
enough for minute-level live refresh, given `runLiveSyncTick`'s
already-proven (Pass 9) zero-cost-when-nothing-is-near behavior. Added
`vercel.json` (`{"crons":[{"path":"/api/cron/football-live-tick","schedule":"* * * * *"}]}`),
tightened `LIVE_INTERVAL_MINUTES` 10→1 (`src/domain/football/sync-cadence.ts`),
and raised `DEFAULT_QUOTA_SAFETY_MARGIN` 1→200
(`src/lib/football-ingestion/quota.ts` — a margin of 1 was fine for a
single supervised manual run, not for an unattended per-minute cron).

**The one step this pass cannot perform itself**: setting the real
`CRON_SECRET` value in the Vercel project's environment variables and
deploying (no Vercel access from this environment). Exact command
documented in `docs/football-data-system.md` "Production cron
activation." Vercel's own Cron Jobs feature automatically sends
`Authorization: Bearer ${CRON_SECRET}` once that env var exists — exactly
what the route already checks, so no further code change is needed.
Verified live (dev server, no `CRON_SECRET` set) that the route fails
closed with a 503 and makes zero provider requests, as designed.

**Round progression wired to the cron**: the route now calls
`progressAllActiveSeasons` (`src/lib/fantasy-engine/season.ts`) right
after `runLiveSyncTick`, which calls the unmodified Pass 12A
`progressSeason` once per league with an ACTIVE season — "football sync →
stats/scoring reconciliation → evaluate current round → finalize if
ready → progress season" is now a real, automated chain, never a second
round-lifecycle implementation.

**Real bug found and fixed**: `progressSeason` only ever recomputed
`matchup_scores` right before finalizing a round (inside
`finalizeRoundIfReady`, gated on every fixture being settled) — meaning
`live_points` never actually updated *during* a live match. Now calls
`refreshMatchupScores` unconditionally on every call, so Live Matchday
scores are genuinely live.

**Live Matchday**: `CurrentMatchup` now carries `scoresUpdatedAt`,
surfaced on the existing MatchupCommand as "UPDATED Xm AGO" / "SYNC
STALE" next to the LIVE badge — never implying freshness the data
doesn't actually have. `MatchupCommand` takes an explicit `now: Date`
prop (React's purity rule forbids `Date.now()` inside a component body;
this follows the same clock-injection convention
`determineFixtureSyncCadence` already established).

**Second real gap found and fixed**: `getCurrentMatchup` only matched
`in_progress`/`upcoming` rounds — the moment a round finalized, it
returned `null` until the next round opened, showing "NOT SCHEDULED"
exactly when there's a real result most worth showing (the brief's
"ROUND FINAL" Club Briefing state). Now falls back to the current
season's most recently `completed` round (season-id-scoped, so an old
season's stale result can never outrank a new season's genuinely more
recent one).

**Home → Club Briefing**: `OperationsRail`'s LEAGUE_TABLE now highlights
the manager's own row (and shows it even when outside the top 6 —
"league rank/record"). Home now also renders the existing
`MatchupPlayerCounts` component (reused as-is, no new implementation) and
a "TOP PERFORMANCE" line for the live/final round states, derived from
real per-round squad data (`getMatchupSquads`), never a manufactured
projection. No streaks/XP/coins/gambling mechanics were added.

---

## 12E — Account/Settings + hardening

**Account page** (`/account`, reached from the existing profile dropdown's
new "Account settings" entry — not a new primary nav item): email
identity, an editable display name (a plain RLS-respecting `UPDATE`
through the existing `"users can update their own profile"` policy — no
new RPC needed), the account's leagues with role, sign out, and a product
status line ("LIVE BETA · v0.1.0"). No notifications, no broad
preferences system.

**Security/concurrency review** of every mutation 12B–12D touched
(`start_next_season`, the roster-mode branches inside it, the cron sync
endpoint, automated progression) found the established
commissioner-check / `auth.uid()` / `search_path = public` conventions
already followed throughout — confirmed, not just assumed, via the new
concurrency test above.

**Responsive fixes**: the season archive list's champion team name had no
truncation at all (a real overflow risk on narrow screens) — now capped
and truncated. Audited `OperationsRail`'s new rank/record row and the
Scoring Breakdown panel; both already follow the codebase's established
`truncate`/`min-w-0`/`shrink-0` pattern correctly.

**Performance audit** of this pass's own data-access additions
(`listSeasons`, `getSeasonArchiveDetail`, the Home page's new
Club-Briefing fetches) found no new N+1 patterns — champion/team names
are always batch-resolved via `.in("id", [...])`, never fetched per-row
in a loop.

---

## Known limitations / explicitly out of scope

Per the brief's own "EXPLICITLY DEFERRED" list, none of the following
were touched: selectable formations, waivers/FAAB, budgets/prices,
playoffs, a custom schedule builder, a massive V2 simulation battery, a
full Inspector 2.0, notifications, Club Legacy/Legends, player-club
tenure/history, My Club, championship squad preservation, historical
milestones, rivalry history, a league-records system, Captain/Vice
Captain/Captain Impact, gamification (streaks/coins/XP), a native app, or
a broad visual redesign.

Additionally:

- No authenticated browser visual QA was performed (no browser automation
  tool available in this environment) — verified instead via
  `tsc`/`lint`/`build`, the full integration suite against the live
  database, and one live, unauthenticated route smoke test of the cron
  endpoint. See the manual QA checklist below for what a human should
  verify.
- The production cron is code-complete but not yet LIVE — it needs the
  one manual `CRON_SECRET` + deploy step described above.
- No `seasons.id` is exposed for "Start Next Season" format
  reconfiguration after creation — roster mode and schedule format are
  chosen together, once, when starting the next season (matching the
  brief's "commissioner chooses exactly one" framing); there's no
  separate "change your mind" flow, consistent with "no partial keeper
  system" simplicity.
- Account page's product-version line is a static string
  (`package.json`'s own version), not wired to a build/commit identifier.

---

## Manual QA checklist

1. **Completed season**: finalize a season's last round (or use the
   existing simulation/test tooling) and confirm the League page shows a
   champion banner.
2. **Season archive**: from the League page, open a past season via the
   archive list; confirm its final table and results render, and that
   they don't change after a new season starts.
3. **Start Next Season**: as commissioner, after a season completes,
   confirm the "Start Next Season" control appears (and does NOT appear
   for a non-commissioner).
4. **REDRAFT path**: choose REDRAFT; confirm every roster is empty
   afterward and a fresh draft is immediately in progress (visible on
   /draft).
5. **KEEP ROSTERS path**: choose KEEP ROSTERS; confirm rosters carry over
   unchanged (except any genuinely ineligible player, which should show
   as a real roster vacancy) and the new season activates without a
   draft.
6. **League table reset**: confirm the new season's standings start at
   0-0-0 / 0 points, independent of the previous season's table.
7. **Historical season remains intact**: after starting season 2, re-open
   season 1's archive and confirm nothing changed.
8. **Player V2 score/breakdown**: open the Player Inspector for a
   recently-scored player; confirm the Scoring Breakdown panel shows
   real, non-zero components that sum to the displayed total.
9. **Live Matchup state**: during/near a real live fixture, confirm the
   Matchup page's LIVE badge is accompanied by a real "updated Xm ago"
   line (or "SYNC STALE" if the cron truly hasn't run recently — this is
   the current truthful state until `CRON_SECRET` is set and deployed).
10. **Club Briefing**: check Home before, during, and after a round —
    confirm league rank/record, next matchup/lock, live player counts,
    and top performance each appear in the right state and never show
    fabricated data.
11. **Account/settings**: visit `/account`, edit the display name, confirm
    it persists and updates elsewhere (e.g., the profile dropdown); test
    sign out.
12. **Mobile**: check League (including the season archive list and the
    Start Next Season form), Matchup, and Home at a narrow viewport —
    confirm no horizontal overflow, especially around team/champion
    names.
13. **Existing Draft/Team/Players regressions**: run through a normal
    draft, team lineup edit, and the Players points-sort to confirm
    nothing from 12B–12D (the drafts-table schema change, the scoring
    version bump) broke them.
