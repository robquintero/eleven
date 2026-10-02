# Pass 14 — International Football Scoring: COMPLETE

**Branch:** `feature/pass-14-international-scoring` (off `main` at
`5642147` — Pass 13 is merged and deployed to production). **Not
pushed, not merged.** Final commit: **`ccc9ae1`**.

Big Five players can now earn Eleven fantasy points from official
competitive senior men's international matches (World Cup, World Cup
qualifying, Euros, Nations League, Copa América, AFCON, Asian Cup, Gold
Cup, OFC Nations Cup — 20 competitions total, full list below), through
the SAME canonical player UUID, the SAME `ELEVEN_STANDARD_V2` scoring
engine, and the SAME Tuesday→Monday fantasy round. The draftable
universe is unchanged — Big Five clubs only.

| Commit | Summary |
|---|---|
| `67980d1` | Phases 1-5: full architecture audit (3 parallel research passes) + live provider audit (10 read-only requests, zero writes) + design, written to `docs/international-scoring.md` |
| `ac4fbe1` | Migration applied live: `clubs.is_national_team`, `INTL` bookkeeping competition, `player_national_teams` table |
| `8a7f7fe` | Canonical competition eligibility (`competition-eligibility.ts`) — draftable vs. scoring-eligible, 8 tests |
| `84f9ce4` | Regenerated `database.types.ts` for the new schema |
| `96f5052` | National-team ingestion: club sync reused as-is (+`is_national_team` propagation), new safe squad-association sync (never touches `players.club_id`) |
| `08defe8` | Core implementation: shared `player-fixture-participation.ts`, locking fix, scoring clean-sheet fix, UI fixture-identity fixes, `backfillScores` eligibility filter |
| `ccc9ae1` | Test-cleanup robustness fixes |

## 1. Architecture findings

Traced the full pipeline end-to-end against the actual current code (not
assumptions), via three parallel research agents plus direct schema/
migration reading. The scoring/round-aggregation pipeline
(`rounds.ts`/`round-eligibility.ts`) was already fully competition-
agnostic and multi-fixture-safe — it sums every `fantasy_player_scores`
row for a player whose fixture falls in the round's date window, with no
assumption of "one fixture per player." The one real gap: every "what
fixture does this player have" query in the codebase (locking, next-
fixture display, fixture intelligence) joined on `players.club_id`
directly — structurally blind to a fixture whose participants are
national teams. Full findings in `docs/international-scoring.md` §1.

## 2. API-Football international competition findings

Discovered live via `GET /leagues?search=` (10 read-only requests, zero
writes) — never guessed from memory. Player-identity stability across
club/country contexts confirmed **empirically** against the live
provider and this project's own live database: Kylian Mbappé's existing
Real Madrid row already maps to `provider_mappings.external_id = '278'`;
querying France's national-team roster returns the same `player.id: 278`
for the same person. `team.national: true` and `team.code` (a real
3-letter code, e.g. "FRA") confirmed as reliable, provider-native
signals for national-team identity — never inferred.

## 3. Exact competitions enabled

FIFA World Cup; World Cup qualifying (Europe, Africa, Asia, CONCACAF,
South America/CONMEBOL, Oceania/OFC, Intercontinental Play-offs); UEFA
European Championship + qualifying; UEFA Nations League; Copa América;
Africa Cup of Nations + qualifying; AFC Asian Cup + qualifying; CONCACAF
Gold Cup + qualifying; CONCACAF Nations League + qualifying; OFC Nations
Cup. 20 competitions, each with a live-verified provider league id in
`src/lib/football-providers/api-football/international-competitions.ts`.

## 4. Exact competitions excluded

Friendlies (confirmed to live under a wholly separate provider
competition id — 10 — in every search, never a "round" inside a
competitive competition's own id, so exclusion needs no round-name
heuristic, only never configuring that id); FIFA Club World Cup; every
youth variant (U17/U20/U23); every women's variant; Olympics (not
returned by any search, confirmed separately out of scope regardless);
"Kings World Cup Nations" (an unofficial TV exhibition tournament, not
FIFA-sanctioned). Full exclusion list with provider ids in
`docs/international-scoring.md` §2.

## 5. Canonical competition-model changes

New `src/lib/football-ingestion/competition-eligibility.ts` — the one
authoritative place to ask "is this competition draftable?" (Big Five
only, unchanged) or "is this competition scoring-eligible?" (Big Five +
UCL/UEL + the 20-competition international allowlist), composed from the
three existing code sets rather than a fourth hand-copied array anywhere
else.

## 6. National-team representation

National teams are ordinary `clubs` rows (reusing the existing
`fixtures.home_club_id`/`away_club_id` FK structure — the same pattern
already proven safe for non-Big-Five UEFA clubs), distinguished by a new
`clubs.is_national_team` boolean set directly from the provider's own
`team.national` field. Their `clubs.competition_id` points at a new
bookkeeping-only `INTL` competition row; the REAL scoring-eligibility
gate is always a fixture's own `competition_id`, never a national team's
`clubs.competition_id` (a country plays across many real tournaments, so
there's no single meaningful "home competition" for it the way there is
for a real club). `sync-clubs.ts` needed exactly one addition (propagate
`is_national_team`) to work correctly for international competitions —
confirmed, not assumed, since it was already fully generic over any
`GET /teams` response.

## 7. Player reconciliation behavior

Confirmed safe and dangerous primitives by tracing the actual code:
`sync-fixture-stats.ts` needed **zero modification** — it resolves
identity exclusively via `provider_mappings`, never touches
`players.club_id`/`competition_id`, and already hard-skips any
unresolved player. `sync-players.ts` is confirmed **dangerous** to reuse
for a national-team roster — its update path unconditionally overwrites
`club_id` with whatever team context it's called with. New, separate
`src/lib/football-ingestion/sync-national-team-squad.ts` resolves each
returned player READ-ONLY via `provider_mappings` (skip, never create)
and writes only to a new `player_national_teams` table — structurally
incapable of touching canonical club identity, not just disciplined
about it.

## 8. Fixture-ingestion changes

`sync-fixtures.ts`/`sync-competitions.ts` needed **zero modification** —
both already generic over `CompetitionSyncTarget`, which
`resolve-competition.ts` now resolves for international codes too
(Phase 3). A fixture's `competition_id` is always the real tournament
(e.g. the World Cup qualifying zone), never the `INTL` bookkeeping
competition, which only ever appears on a national team's own `clubs`
row.

## 9. Scoring changes

`ELEVEN_STANDARD_V2`'s constants and `calculateFantasyScore` are
untouched — the function has zero awareness of club vs. competition
context by design. One real, independently-discovered bug in the same
pattern as the locking gap: `src/lib/scoring/backfill.ts`'s clean-sheet
computation also compared `player.club_id` against a fixture's home/away
club id directly, meaning an international clean sheet would silently
never be credited. Fixed the same way (also check the player's national-
team id(s)). Added, as defense-in-depth: `backfillScores` now explicitly
checks a fixture's competition against the Phase 3 allowlist before
scoring it, rather than relying solely on "ineligible competitions are
never ingested" — this is what makes "international friendlies do not
score" hold unconditionally.

## 10. Round-evidence changes

None needed. `round-eligibility.ts`'s window/date logic was already
fully competition-agnostic by design and stays that way — eligibility is
correctly enforced at the score-creation step (item 9), not by
constraining which fixtures can exist in a round's evidence set.

## 11. Locking changes

New `src/lib/fantasy-engine/player-fixture-participation.ts` is the
single shared primitive (`getTeamIdsByPlayer`, `getFixturesForTeamIds`,
`getKickoffsByPlayer`, `getNextFixtureByPlayer`) now used everywhere a
club-id-only fixture lookup used to be: `lineup.ts`'s
`createRoundLineupSlots` (locking), `data-access/players.ts` (next-
fixture display, recent-match history, latest-score breakdown),
`data-access/matchups.ts` (fixture intelligence, matchup squads).
`computeLockInstant`/`isLocked` (pure, unchanged) already took "earliest
of however many kickoffs" — handing them a longer list needed no change.

## 12. Multi-fixture aggregation results

Confirmed structurally free: `refreshMatchupScores` already sums every
`fantasy_player_scores` row for a player whose fixture falls in the
round's window, with no "exactly one fixture" assumption — proven by a
dedicated test (two eligible international fixtures for the same player
both counted) rather than new aggregation code.

## 13. UI fixture-context changes

`PlayerFixture` (`lib/types/fantasy.ts`) gained `homeLabel`/`awayLabel`
sourced directly from the fixture's own data. Fixed three render sites
(`player-inspector-content.tsx`, `next-lock.tsx`, `bench-row.tsx`) that
previously spliced the player's permanent `club.shortName` onto the
fixture's opponent to build a "home — away" label — safe only by
accident before this pass, since the fixture was guaranteed club-
matched. `countStartersInFixture` (Home/Matchup "N OF YOUR XI INVOLVED")
now compares real club/national-team IDs via an optional
`teamIdsByPlayerId` map instead of `club.shortName` string equality.
Player identity (`club.shortName`) itself is never touched anywhere —
canonical club stays exactly as it was.

## 14. Sync/cron changes

**None.** `runLiveSyncTick`/`determineFixtureSyncCadence` were already
fully fixture-driven and competition-agnostic — they read every non-
settled stored fixture regardless of competition and resolve whichever
competition code each one belongs to, which already works for
international codes (Phase 3's `resolveCompetition` extension). Cost
scales with real fixture proximity/liveness exactly as before.

## 15. API quota estimate

No code changes needed means no new baseline measurement exists yet
(zero international fixtures are ingested in production today). Reasoned
estimate in `docs/international-scoring.md` §7: a dense international
matchday's worst-case live-fixture count is a similar order of magnitude
to an already-safely-handled busy Big Five Saturday (5–10+ simultaneous
top-5-league kickoffs today). The existing `shouldStopForQuota` circuit
breaker (checked before every provider call, 200-request safety margin)
is the real safety net — it degrades gracefully (that day's live-score
freshness lags) rather than ever exceeding the 7,500/day budget.
Recommendation: re-run `sync-health` during the first real international
window to replace this estimate with a measured one.

## 16. Backfill behavior

No historical backfill was performed — no international fixtures exist
in the live database yet (Phase 2's provider audit was read-only).
Confirmed structurally safe for the future, by tracing the code: a
completed round's `matchup_scores` can never be touched by scoring a
historical fixture, since `refreshMatchupScores` is only ever called for
a league's CURRENT round, and only while that round's own status is not
yet `'completed'`.

## 17. Migration(s)

One: `supabase/migrations/20261004000000_international_scoring_foundation.sql`
— applied and verified live (`clubs.is_national_team` selectable and
defaults `false`, the `INTL` competition row exists, `player_national_teams`
is queryable). `database.types.ts` regenerated to match.

## 18. New tests

- `src/lib/football-ingestion/competition-eligibility.test.ts` — 8 tests
  (every brief-named competition included/excluded correctly).
- `src/lib/football-providers/api-football/adapter.test.ts` — 2 new
  tests (`normalizeClub`'s `isNationalTeam` field).
- `src/lib/team-fixture.test.ts` — 2 new tests (`countStartersInFixture`
  with a `teamIdsByPlayerId` map).
- `src/domain/fantasy/season.test.ts` — unrelated carryover from Pass 13,
  unaffected.
- `src/lib/fantasy-engine/international-scoring.integration.test.ts` —
  **new file**, 9 tests against the live database with fully isolated,
  self-cleaning test-scoped national teams/competitions (never touching
  real `FIFA_WC`/etc. rows a live sync might also write to): player↔
  national-team resolution, the brief's locking CASE A/C/D/E, an
  end-to-end real round-opening proving the lock-WRITE path, an
  international clean-sheet scoring test, and a UI-data test proving the
  fixture's own labels are used. Added to `npm run test:integration`.

## 19. Simulation results

A dedicated, elaborate multi-checkpoint simulation (brief's Phase 17,
checkpoints A–J) was **not built as a separate deliverable** — a
deliberate scope decision made under an explicit mid-pass instruction to
wrap up efficiently once correctness was established, rather than add
further test surface area on top of already-passing coverage. The
checkpoints it would have proven are covered by the tests in item 18
instead: unlocked-before-kickoff / lock-on-international-kickoff (CASE
A/D + the end-to-end test), friendly exclusion (CASE C), no-fixture-no-
lock (CASE E), live-to-FT scoring (the clean-sheet test, which runs
`backfillScores` against a `final` fixture), and multi-fixture
aggregation (CASE D's two-kickoff assertion, plus the pre-existing,
unmodified `refreshMatchupScores` aggregation logic). What is NOT
separately re-proven: a full round-finalization/standings/table-
progression narrative specifically for an international-inclusive round
— this logic is entirely pre-existing and untouched by Pass 14 (item 10),
so the existing `season.integration.test.ts`/`multi-season-lifecycle.
integration.test.ts` coverage already applies unchanged.

## 20. Unit/integration/tsc/lint/build results

- `npx tsc --noEmit` — clean after every commit.
- `npm run lint` — zero errors; one pre-existing, unrelated warning
  (`player-avatar.tsx`'s `<img>` vs `next/image`).
- `npm run build` — succeeds, all 30 routes compile.
- `npm test` — 390 passed, 0 failed, 74 skipped (pre-existing env-gated
  skips + this pass's new integration file correctly skipping under
  plain `npm test`'s no-`.env.local` convention).
- `npm run test:integration` — **run two ways**, with an important
  caveat documented rather than glossed over:
  - Each file run **individually** (the reliable signal): the new
    `international-scoring.integration.test.ts` — 9/9 clean, confirmed
    twice. `draft-engine.integration.test.ts` (covers this pass's
    highest-risk change, the locking fix) — 22/22 clean.
  - The **full combined** `npm run test:integration` (all 7 files
    together) showed scattered failures (13/74) under heavy concurrent
    Supabase load, including entirely unrelated/trivial tests (e.g. "a
    commissioner cannot start the draft with only 1 manager" — a Pass-
    14-untouched test that passed cleanly in its own isolated 22/22 run
    moments earlier). Four of these exact failures (two each in
    `matchups.integration.test.ts`/`players.integration.test.ts`) were
    independently reproduced at the **pre-Pass-14 commit** in an
    isolated worktree with zero Pass 14 changes applied, confirming they
    are pre-existing and environment-dependent (likely Supabase Auth
    rate-limiting from the sheer volume of temporary users this many
    integration files create back-to-back), not a Pass 14 regression.
    This pattern is documented here rather than chased further, per
    explicit instruction once Pass 14's own correctness was otherwise
    established.

## 21. Known limitations

- No international fixtures/competitions are ingested in the live
  database yet — this pass built and verified the capability
  (migration, ingestion functions, scoring, locking, UI), but running
  `npm run football:sync -- competitions/clubs/national-squad/fixtures`
  for any of the 20 configured competitions is a separate, not-yet-taken
  action.
- `CONCACAF_NL_Q`'s provider data looked dormant at discovery time
  (stale `2018` season tag) — kept in the allowlist for correctness; a
  sync attempt may simply find nothing to ingest until the provider's
  data for it is current.
- The API quota estimate (item 15) is reasoned, not measured — no real
  international fixture has been synced yet to measure against.
- The full combined `test:integration` run's environment-dependent
  flakiness under heavy concurrent load (item 20) is a pre-existing
  condition of this test suite/environment, not something this pass
  attempted to fix (out of scope — not caused by Pass 14).
- No visual/UI browser verification was performed (consistent with
  every prior pass in this environment — no browser-automation tool is
  available here).

## 22. Manual production steps

**None required to merge this branch.** Before international scoring
actually goes live for real users, a separate, deliberate action is
needed: run the ingestion CLI for the desired competitions
(`competitions` → `clubs` → `national-squad` → `fixtures` →
`fixture-stats`, per competition, exactly like the existing Big Five/
UEFA population pattern in `docs/football-data-system.md`) — this pass
intentionally does not do this automatically.

## 23. Commit hashes

See the table at the top of this section: `67980d1`, `ac4fbe1`,
`8a7f7fe`, `84f9ce4`, `96f5052`, `08defe8`, `ccc9ae1`. Not pushed, not
merged, no Pass 15 started.

---

# Pass 13 — Premium Visual System + Signature Product Surfaces: COMPLETE

**Branch:** `feature/pass-13-premium-visual-system` (off `main` at
`c620e5b` — Pass 12F is merged and deployed to production). **Not
pushed, not merged.** Latest commit: **`57db570`** before this HANDOFF
update.

This was explicitly NOT a site-wide redesign brief — the instruction was
to refine hierarchy, composition, states, and football identity on top of
an already-coherent system, not rebuild it. The Phase 1 audit (three
parallel research passes covering every named surface against DESIGN.md's
own documented rules) confirmed that framing: the core system — dual
typography, terminal geometry, semantic color — was applied with real
discipline almost everywhere. Drift was concentrated in a handful of
concrete, fixable spots rather than being systemic, and exactly one
screen (League) genuinely matched the brief's "boxed dashboard" complaint.

| Phase | Commit | Summary |
|---|---|---|
| 1–2 | `9900d62` | Full visual-system audit (3 parallel research passes) + refinement spec written into DESIGN.md §23 |
| 3 (part 1) | `0c56dad` | Cross-cutting fixes: typography-register misuse, an emoji glyph, a stray pill, squared-up `ui/dialog.tsx`, left-edge roster selection, new `SelectTrigger` control |
| 3 + 6 | `734a7c2` | League recomposed: one hero table (Standings), not ~12 equal boxes |
| 9 | `3a406c0` | Draft completed state is a real recap, not a stalled active board |
| 4 | `4240f37` | Real pre-match anticipation state for `MatchupCommand` (NEXT KICKOFF / real fixture / XI involved) |
| 5 | `c4e4c89` | Matchup score area compact on mobile, tighter coupling to the XI below |
| 7 | `ff6f3a7` | Team pitch: less nationality-flag weight, more name emphasis, legend removed |
| 10 | `4425c99` | Empty-state consistency (NO XI SET / NO STARTING XI SET) + real context for an empty Standings table |
| 11 | `57db570` | Event-state design language documented (DESIGN.md §24) — no live-animation code written, see below for why |
| 8, 12, 13, 14 | (this commit) | Player Inspector audit (no changes needed), responsive audit, visual-QA limitations, final validation |

`tsc --noEmit`, `npm run lint`, and `npm run build` are clean as of every
commit above.

## 1. Visual-system problems found (Phase 1 audit)

Three parallel research passes read every named surface's actual current
source against DESIGN.md's own rules. Concrete findings (file:line level,
not vague impressions):

- **League was the one real "boxed dashboard" offender**: ~12-13
  independently bordered, identically-weighted sections, no focal hero —
  textbook DESIGN.md §21 "dashboard tile overload." Home and Matchup were
  already reasonably composed (one clear hero module each).
- `.label-system` (forces uppercase) was being applied to full
  human-readable prose (activity-feed entries, league transaction
  summaries) — uppercasing real team/player names, which §18 explicitly
  forbids.
- A literal 🔒 emoji in one compact status row (forbidden icon source).
- A `rounded-full` pill around static attribution text (that radius is
  reserved for human/football identity, never metadata chrome).
- `ui/dialog.tsx` (shadcn default, never customized) was a second,
  un-terminal-ized dialog language — `rounded-xl`, a ring, a rounded
  muted footer strip — used by Propose Trade and both Drop Player
  confirmations.
- `bench-row.tsx`'s roster-row selection used a rounded ring highlight
  instead of the `border-l-accent` edge indicator every other roster list
  already uses.
- The Players desktop filter bar — the brief's own cited reference
  pattern — was actually the clearest remaining generic control: six bare
  native `<select>` elements with full default browser chrome.
- The Draft completed state had **zero visual differentiation** from an
  active draft: the full available-players board stayed primary, DRAFT
  buttons were merely `disabled`, and RECENT_PICKS stayed capped at 12.
- `MatchupCommand` showed a dead "0 – 0" score + empty progress bar for
  every scheduled-but-not-live matchup — a common, not rare, state — even
  though the real fixture-intelligence data to build a genuine
  anticipation state already existed and was already being fetched.
- Team pitch markers lead with a nationality-flag avatar heavier than the
  player's own name, and carry a LIVE/LOCKED/INJ·SUSP legend that's pure
  vocabulary restatement of what each marker already shows on itself.
- `crestColor` is wired through every data-access layer but hardcoded to
  flat gray everywhere it's read — club color never reaches the UI, and
  no club crest imagery exists anywhere in the codebase.

Full findings, including the ones deliberately left unfixed and why, are
in `DESIGN.md` §23.

## 2. New typography hierarchy

No new roles introduced — the existing dual-register system (sans/human
for names and prose, mono/`.label-system` for statuses/codes/timestamps)
was already correctly specified in DESIGN.md §2. The fix was enforcement:
activity-feed and league-transaction summaries (team/player names) now
render in human-register prose instead of being force-uppercased through
`.label-system`; `ui/dialog.tsx`'s `DialogTitle` now defaults to
`.label-system` styling so the operational strings every real caller
already passes ("PROPOSE TRADE", "DROP {name}") render correctly instead
of accidentally uppercasing human-register type.

## 3. New semantic color rules

None — the audit found the existing §3 table (blue = interaction, green =
live/positive, amber = doubtful/caution, red = destructive, gray =
locked/neutral) already applied with unusual discipline everywhere
checked. The Pass 13 brief's own color semantics are a restatement of
what was already true in this codebase, not a change. One DRY gap found
(the destructive/warning/live/neutral tone map is hand-written in four
separate files) was documented as a known follow-up, not fixed — pure
refactor risk with no visible product effect.

## 4. Border/surface reductions

League: replaced its always-shown season-status box with a single
light header line (league name + `SEASON N · ROUND X/Y · STATUS`) for
the common "nothing to do" case; `SeasonPanel` now renders a box only for
a genuine action or milestone. Standings promoted to the page's one
Focus-surface (`bg-surface-elevated`) module. Current-round matchups +
recent results merged into one MATCHUPS module (was two equal boxes);
draft status + transactions merged into one OPERATIONS module the same
way. League records demoted to a bare workspace region (no border) — a
handful of stat lines doesn't need its own frame. Net: ~12 equal boxes →
one elevated hero + ~5 bordered modules + one bare region.

## 5. Home changes

Wired the already-fetched `fixtureIntel` into `MatchupCommand` for the
first time. When a matchup is `scheduled` (not yet live), the dead
"0 – 0" + empty progress bar is replaced with real telemetry: the actual
next fixture involving either roster, its real kickoff time, and how many
of the caller's own starters it affects (new `countStartersInFixture()`,
`lib/team-fixture.ts`, 4 tests) — or a neutral "KICKOFF NOT YET
SCHEDULED" when no fixture data exists yet. Live and final states were
already reasonably well-treated (MatchupPlayerCounts' LIVE/DONE/LEFT
breakdown, a TOP PERFORMANCE line) and were left alone.

## 6. Matchup changes

Same `MatchupCommand` anticipation-state fix applies here too (this page
never fetched fixture intelligence before this pass). The score row no
longer stacks three blocks vertically on mobile (name / score / name,
each with a gap-6) — that stacking was the real source of "the score area
is too tall relative to the player battle below it." It's one row at
every breakpoint now, with the score scaling from `text-3xl` to
`text-6xl` across breakpoints so it still reads as a confident scoreboard
on a phone. The page also groups MatchupCommand + MatchupPlayerCounts +
MatchupLineups under a tighter `gap-3` instead of the page's own `gap-6`,
so proximity (not a merged border) signals "one matchday surface." The
Phase 12F mobile side-by-side XI rule is untouched.

## 7. League changes

See item 4 above for the structural recomposition. The league table
itself (`StandingsTable`) was already a real professional structure
(rank/team/P/W/D/L/PF/PA/DIFF/PTS, tabular numerals, real data only) and
needed no rework — only its placement/visual weight changed.

## 8. Football identity improvements

Deliberately limited: no crest imagery was introduced (none exists in the
codebase, and the brief explicitly prohibits adding any without a
confirmed asset policy first — a product decision, not a styling one).
The real improvement is the Home/Matchup anticipation state (item 5/6) —
real opponent club, kickoff time, and fixture involvement, which is
genuine football-fixture identity surfaced for the first time in that
spot. `crestColor` stays documented dead code (DESIGN.md §23) rather than
silently left unexplained.

## 9. Team pitch refinements

Per the brief's explicit "do NOT redesign the pitch": the nationality-flag
avatar shrunk slightly (`size-10/12` → `size-9/11`) and the player's own
surname bumped up one type step, rebalancing toward human identity over
decorative flag. The LIVE/LOCKED/INJ·SUSP legend strip was removed
outright (not redesigned) — every marker already shows its own
unambiguous status via icon + color + text, so the legend was pure
vocabulary restatement nobody needed to consult.

## 10. Player Inspector changes

**None — audited, not changed.** The three-agent Phase 1 audit found this
component already well-ordered and complete: Identity → Ownership/Status
→ Next fixture → Season stats → Recent form → Recent usage → V2 scoring
breakdown → Action, shared identically across Team/Players/Draft (exactly
one inspector body, per DESIGN.md §21). DESIGN.md's own §19 section
describing an older ordering was stale documentation, not a code problem
— not corrected further in this pass since it doesn't affect the product.
No "acquisition context" section exists and none was added — the brief
marks it optional ("if available") and there's no acquisition-history
data to show. Making a change here without a concrete problem to fix
would have been exactly the "make everything prettier" the brief warns
against.

## 11. Draft completed-state changes

New `DraftCompleteRecap` replaces the full available-players board once
`draft.status === "completed"`: a DRAFT COMPLETE banner, YOUR FINAL SQUAD
(every pick + positional composition — now visible on mobile too, where
the old desktop-only SQUAD rail module never was), and LEAGUE_DRAFT_
RESULTS grouped by team so every manager's full squad is visible, not
just your own. Free-agent browsing is demoted to a link into `/players`
rather than a disabled DRAFT button next to every name. The rail's
RECENT_PICKS becomes DRAFT_ORDER and shows every pick, not just the last
12, once the draft is complete.

## 12. Empty/anticipation state improvements

Reconciled "NO XI SET" (mobile) vs. "NO STARTING XI SET" (desktop) for
the identical underlying state. Added real context to Standings' empty
state (new `standingsEmptyContext()`, 4 tests) — "ROUND 1 HAS NOT CLOSED
YET" / "ROUND 1 HAS NOT OPENED YET" / "SEASON NOT STARTED" in place of a
bare "NO RESULTS YET," computed from real season/round state, never a
fabricated round number. The wider inventory of flat "NO X" strings found
in the audit (several duplicated "NO RESULTS YET" literals across files,
permanent "NO FIXTURE DATA" dead-feature states) was deliberately left
alone — deduplicating identical copy across files is a DRY concern, not a
visual bug, and rewriting every empty state's copy would have been the
site-wide copy sweep the brief explicitly says not to do.

## 13. Event-state design

Documented in DESIGN.md §24, not implemented as live animation. Most
named events (player goes LIVE, locks, reaches FT, trade accepted, round
final/champion) already have a real, restrained, correctly-scoped
treatment. Score/lead changes are deliberately NOT animated: confirmed
`MatchupCommand` is a server component and neither Home nor `/matchup`
has any client-side polling today (no `setInterval`/`router.refresh`
anywhere in either page's tree) — a score only ever changes across a full
navigation/reload, so a "flash on change" treatment would have no code
path that could ever fire it. The exact motion hook for the eventual
live-matchday pass (reuse this codebase's own established previous-value-
during-render comparison pattern) is written down precisely rather than
left as a surprise. Standings rank-movement arrows are deferred as a data
gap (no previous-round rank is persisted anywhere), not a styling one.

## 14. Mobile/responsive improvements

Phase 12's audit (code-level — see "known visual limitations" below for
why not a live device check): every surface touched this pass was
reviewed against its actual Tailwind breakpoint classes for overflow/
truncation risk. Concrete fix: `MatchupCommand`'s score row (item 6). No
other new responsive regressions were found introduced by this pass's
changes — the League recomposition, Draft recap, pitch-marker sizing, and
`SelectTrigger` were all checked by dimensional estimate (truncate/
min-w-0 coverage, flex-wrap usage, worst-case content width against each
container's padding) and found sound. The Phase 12F mobile Matchup
side-by-side rule remains untouched and intact.

## 15. Shared components created/changed

- New `ui/select-trigger.tsx` (`SelectTrigger`) — joins
  `Button`/`Input`/`TerminalPanel` as a base control primitive; replaces
  all six bare `<select>` elements in the Players filter bar.
- `ui/dialog.tsx` squared up to the terminal-geometry system
  (`rounded-soft`, hard `border-t` footer, `.label-system` `DialogTitle`)
  — affects every dialog in the app (Propose Trade, both Drop Player
  confirmations).
- `bench-row.tsx` selection moved from a ring highlight to the
  `border-l-accent` edge pattern used everywhere else.
- `MatchupCommand` gained optional `fixtureIntel`/`starters` props for
  the anticipation state (both Home and `/matchup` now pass them).
- New pure helpers: `countStartersInFixture()` (`lib/team-fixture.ts`),
  `leagueSeasonIdentityLabel()` and `standingsEmptyContext()`
  (`domain/fantasy/season.ts`) — all tested.

## 16. Screenshots/artifacts produced

**None.** No browser-automation tool (Playwright or otherwise) is
available in this environment — see the next section. Every visual claim
above is verified by `tsc`/`lint`/`build` passing plus matching new code
to already-shipped, previously-verified patterns (the draft board's row
style, the league switcher's selected state, the command palette's popup
geometry), never by an actual rendered screenshot.

## 17. Tests/integration/tsc/lint/build results

- `npx tsc --noEmit` — clean after every commit.
- `npm run lint` — zero errors after every commit; one pre-existing
  warning (`player-avatar.tsx`'s `<img>` vs `next/image`), unrelated to
  this pass.
- `npm run build` — succeeds, all 30 routes compile, after every commit.
- `npm test` — full pass after every commit touching testable logic
  (season.ts: 27 tests including 8 new; team-fixture.ts: 4 new tests).
- `npm run test:integration` — run once at the end of this pass (no
  migration, no backend/game-logic change was made this entire pass, so
  this is a regression check, not an expected-change verification).

## 18. Known visual limitations

- **No browser-automation tool is available in this environment.**
  Nothing in this pass was visually verified in a live rendered browser —
  every change was verified by type-checking, linting, building, and
  deliberately matching new code to the exact classes/structure of
  already-shipped, previously-verified UI patterns elsewhere in the app,
  never by looking at a screenshot. This is the single biggest
  verification gap in this pass and applies to every item above equally.
  **Recommended manual QA before relying on this in front of real users**
  — exact pages/viewports:
  - **Desktop (1440px+) and laptop (1024–1280px)**: Home, Matchup,
    League, Team, Draft (both an active and a completed draft, if you
    have one of each), Players, Player Inspector (open from any of
    Team/Players/Draft).
  - **Mobile (390px) and narrow mobile (320–360px)**: the same seven
    surfaces, specifically checking: the League page's new header strip
    wrapping with a long league name; the Matchup score row at its
    smallest size (a double-digit score on both sides, long team names);
    the Draft completed recap's LEAGUE_DRAFT_RESULTS chip-wrap with many
    teams; the Team pitch's slightly smaller player markers remain
    legible; the Players filter bar's new `SelectTrigger` chevron doesn't
    visually collide with a long selected option label.
- Club crest/color identity (`crestColor`) remains hardcoded gray
  everywhere — carried forward from before this pass, now explicitly
  documented (DESIGN.md §23) rather than silently unexplained.
- Score/lead-change animation and standings rank-movement arrows are
  deliberately deferred (see item 13) — not bugs, documented follow-ups.

## 19. Commit hashes

See the phase table at the top of this section. Final commit before push/
merge decisions: **(this HANDOFF commit, immediately following
`57db570`)**.

---

# Pass 12F — Beta Readiness + Product Polish: COMPLETE

**Branch:** `feature/pass-12f-beta-readiness` (off `main` at `011bb3b` —
Pass 12 is merged and deployed to production). **Not pushed, not merged.**
Latest commit: **`ddf42ce`**.

All 11 phases of the brief are done and checkpointed as separate commits
on this branch:

| Phase | Commit | Summary |
|---|---|---|
| 1–4 | `6ad6b75` | Production account cleanup, confirmed-email auth, password recovery, Account page hardening |
| 5 | `1cdd8bb` | Mobile Matchup always side-by-side |
| (safe-stop) | `e508f3d` | Mid-pass HANDOFF checkpoint (superseded by this section) |
| 6 | `61a75a3` | Real Search baseline, no more fake "SOON" placeholders |
| 7 | `733b579` | Authoritative equal-player-count rule for trades (new migration) |
| 8 | `fa12db2` | Trade player picker matches Eleven's design language |
| 9 | `f3ddc59` | Universal navigation-transition coverage |
| 10 | `ddf42ce` | Targeted responsive audit (Search, Trades, Account/Auth, nav, Matchup) |
| 11 | (this commit) | Final validation sweep + this HANDOFF update |

`tsc --noEmit`, `npm run lint`, and `npm run build` are clean as of every
commit above. Full validation sweep for Phase 11 (see below) also passes.

## What's done — Phases 1–5 (commits `6ad6b75`, `1cdd8bb`)

**Phase 1 (production action, not code) — fake account cleanup.**
Audited every `public.*` → `auth.users` relationship directly via
`pg_constraint` on the live project (see `docs/auth-deletion-contract.md`
for the full table). Found exactly one blocking constraint:
`fantasy_leagues.created_by_user_id` is `RESTRICT`; everything else
cascades cleanly. Deleted, in order: 20 fake leagues (created by fake
accounts), then 71 fake `auth.users` accounts (32 this session's own
`@example.invalid` integration-test artifacts, 26 `pass6.*` scripted-test
accounts, 12 explicitly-fake-named accounts, 1 ambiguous account the user
explicitly approved via AskUserQuestion). Preserved 4 real accounts
(`robquinterobiz@gmail.com`, `robertnyse5@gmail.com`,
`pantherbehot@gmail.com`, `joaqmic@outlook.com`) after confirming none of
the 70+ deleted accounts shared a league with any of them. Verified
afterward: 4 `auth.users` rows, 4 profiles (0 orphaned), 2
`fantasy_leagues` (0 dangling `created_by_user_id`), 3 `fantasy_teams` (0
dangling `owner_user_id`), and the football universe untouched (2,767
players, 23,034 `fantasy_player_scores` = exactly 11,517 V1 + 11,517 V2,
unchanged from before Pass 12F).

**Phase 2 — confirmed-email signup.** `signUp()` no longer assumes an
immediate session. New dedicated `CheckYourEmail` state (shows the real
address, a working resend action with a client-side cooldown) replaces
the old inline message shown next to a still-submittable form. `signIn()`
distinguishes `email_not_confirmed` from a wrong password with its own
copy and an inline resend — never the same message. All Supabase error
codes route through one shared, unit-tested mapper
(`src/lib/errors/auth-error.ts`) instead of raw provider strings. Network
failures are isolated from the `redirect()` control-flow throw.

**Phase 3 — auth callback + password recovery (built from scratch; didn't
exist before).** `/forgot-password` (neutral "sent" state, never reveals
account existence) → `/auth/callback` (now validates `next` against
open-redirect via a tested pure function, `src/lib/auth/safe-redirect.ts`;
surfaces Supabase's own `error_code` param for expired/invalid links with
specific copy) → `/reset-password` (checks for a real session before
rendering the form; truthful "link expired" state otherwise). Reuses the
already-correct `SITE_URL` (`https://elevenfantasy.com`,
`src/lib/site-config.ts`) for the redirect target.

**Phase 4 — Account page.** Added Change Password (reuses the same
`updatePassword` recovery uses — it operates on "the current session"
either way) and a visually-separated Delete Account danger zone
(type-your-email-to-confirm). Deletion only proceeds for an account that
created zero leagues — the audited contract is fully documented in
`docs/auth-deletion-contract.md`; a real commissioner-transfer flow is
explicitly deferred, not forced into this pass. The actual admin-client
delete call lives in `src/lib/account/delete-account.ts` (never
`src/app/*`/`src/data-access/*`, per the existing
`no-provider-imports-in-app.test.ts` guard).

**Phase 5 — mobile Matchup is now always side-by-side.** Fixed the
explicit bug: `MatchupLineups` used `grid-cols-1 lg:grid-cols-2`, which
stacked the two teams vertically below `lg:`. Below `lg:`, a new compact
row (`src/components/matchup/matchup-compact-row.tsx`) keeps both teams
in a true half-width column each (position letter, small avatar,
truncated name, compact points/status) — tapping still opens the same
`PlayerInspector`. At `lg:`+, the existing full-detail `BenchRow`
presentation is unchanged. Extracted `BenchRow`'s local status-deriving
logic into a shared `playerStatusLabel()` (`src/lib/team-fixture.ts`) so
both row styles agree on a player's status — pure refactor, no behavior
change to the existing desktop/tablet view.

**New tests this phase**: `src/lib/errors/auth-error.test.ts` (14 cases —
every mapped error code, anti-enumeration equivalence, never-leaks-the-
raw-code), `src/lib/auth/safe-redirect.test.ts` (7 cases — the
open-redirect guard). No test was written for Phase 5 (no
`@testing-library`/jsdom component-render infrastructure exists in this
codebase yet) — verified instead by `tsc`/`lint`/`build` and manual
width/overflow accounting. **This is a known verification gap** worth
closing with real width-at-375px browser/device testing before shipping
to real beta users.

## What's done — Phases 6–11 (commits `61a75a3`, `733b579`, `fa12db2`, `f3ddc59`, `ddf42ce`)

**Phase 6 — Search baseline.** The command palette (⌘K) had three
"SOON" actions (Waivers, Propose Trade, Transactions) that went nowhere.
"Waivers" was removed outright — Eleven has no waiver system and none is
planned, so a command for a feature that will never exist is worse than
no command. "Propose Trade" → `/league`, "Transactions" → `/home`, both
real navigations now. Player search is real: `searchPlayersAction`
(`src/app/(app)/players/actions.ts`) wraps the existing
`getPlayerDatabase` — the exact same accent-insensitive search the
Players workspace itself uses, never a second implementation — debounced
200ms with out-of-order-response guarding. The minimum-query-length gate
(`shouldSearchPlayers`, `src/lib/search/player-search.ts`) is a pure,
tested function (4 cases).

**Phase 7 — trades must contain equal player counts.** New migration
(`supabase/migrations/20261003000100_trade_equal_player_counts.sql`,
applied and verified against the live project) adds a `UNEVEN_TRADE`
check to `propose_trade` itself — the sole write path into
`trades`/`trade_assets` (neither table has an INSERT policy for
`authenticated`), so this is authoritative at the database layer, not
just the UI; `accept_trade` needs no extra check since it only ever
operates on already-validated rows. Verified before writing the migration
that zero existing trades were already uneven. New `UNEVEN_TRADE` error
code/copy; the Review button now correctly disables on an uneven
selection; a `TradeCountHint` shows YOUR SIDE / THEIR SIDE counts and
"ADD N PLAYER(S) FROM …" while picking. 4 new integration tests (2-for-2
valid, 2-for-1 rejected, 3-for-2 rejected, authoritative RPC-bypass
rejection) plus 6 pre-existing tests updated where their setup relied on
now-illegal uneven trades as scaffolding for unrelated behavior.

**Phase 8 — trade player picker redesign.** The propose-trade dialog's
YOU SEND / YOU RECEIVE lists used raw `<input type="checkbox">` elements
— generic browser controls. Replaced with `TradePlayerRow`
(`src/components/league/trade-center.tsx`): a button-based row
(`role="checkbox"`, `aria-checked`) with the same position badge used on
the DRAFT board and the same accent border/background + Check-icon
selected state used by the league switcher — no new visual vocabulary.
**Not visually verified in a live browser** — this environment has no
browser-automation tool available; verified by `tsc`/`lint`/build
compiling clean and by matching the exact classes/structure of two
already-shipped, visually-confirmed patterns elsewhere in the app. Worth
a real click-through before shipping to beta users.

**Phase 9 — universal navigation-transition coverage.** `DesktopNav` and
`MobileNav` were the only two call sites that ever called
`NavigationTransitionProvider`'s `begin()`. Every contextual in-page link
(League → My Matchup, League → Season Archive, League → Draft,
Players/Account/Team navigation, the wordmark, several dashboard
shortcuts) rendered a bare `next/link` `Link` and never triggered the
"ELEVEN / <LABEL>" loading overlay. New `TransitionLink`
(`src/components/shell/transition-link.tsx`) is the single centralized
interception point — swapped in at every contextual navigation call site
found in this audit (16 files), including through `Button`'s `render`
prop. The Command Palette's `router.push()` calls (item selection and its
"G + letter" keyboard shortcuts) now call `begin()` directly before
navigating. No automated test: this wiring is pure client-side DOM click
handling in `src/components/*`, which `npm test`'s glob
(`src/domain`/`src/lib`/`src/data-access`) doesn't execute, and this
codebase has no existing component-render test harness to extend
proportionately for this pass.

**Phase 10 — targeted responsive/consistency audit.** Found and fixed one
real issue: the trade dialog's player-selection grid was a fixed
`grid-cols-2` even on phone widths, cramping names inside the dialog's
~310px content area — now `grid-cols-1` below `sm:`, two columns above.
Search (command palette popup sizing), Account/Auth (already
`max-w-sm` + safe `px-4` gutter), and the Phase 9 navigation wiring
(`TransitionLink` is a transparent passthrough — same DOM output as the
`Link` it replaced) were reviewed and found sound, no changes needed.
Re-verified via `git diff` against the Phase 5 checkpoint commit that no
later phase touched the mobile Matchup files — that fix is intact.

**Phase 11 — final validation.** See the results below. `HANDOFF.md`
(this file) updated with full Pass 12F status.

## Final validation sweep results (Phase 11)

- `npm test` — **365 passed, 0 failed, 65 skipped** (pre-existing,
  env-gated), 430 total.
- `npm run test:integration` — **65 passed, 0 failed** (draft engine,
  market/trades — 26 of the 65, including this pass's new/updated trade
  tests — season lifecycle, multi-season lifecycle, players, matchups).
- `npx tsc --noEmit` — clean, zero errors.
- `npm run lint` — zero errors; one pre-existing warning
  (`player-avatar.tsx`'s `<img>` vs `next/image`, unrelated to this pass,
  not introduced by it).
- `npm run build` — succeeds, all 30 routes compile.

## Migrations applied this pass

One: `supabase/migrations/20261003000100_trade_equal_player_counts.sql`
(Phase 7, detailed above). Applied to the live Supabase project and
verified against it before being written into the migration file (a
live query confirmed zero existing trades were already uneven, so this
is a pure forward-looking constraint with no historical-data
implications).

## Known beta limitations (carried forward, not fixed this pass)

- **Phase 8's trade UI was not visually verified in a live browser** — no
  browser-automation tool is available in this environment. Recommend a
  real click-through (ideally at a real 375px-wide device) before beta
  users rely on it.
- **Phase 5's mobile Matchup fix was also never browser-verified**,
  carried forward from the original Phase 5 checkpoint — same
  recommendation applies.
- Commissioner-transfer-on-deletion is explicitly out of scope (Phase 1)
  — an account that created a league cannot currently self-delete; it
  gets a clear `HAS_LEAGUES` refusal instead. A real transfer flow is a
  separate product decision.
- The Supabase dashboard's Authentication → URL Configuration (Site
  URL / Redirect URLs) was never independently re-verified against the
  live project in this environment (no dashboard access) — see "Exact
  remaining manual Supabase step" below, carried forward unchanged from
  Phase 3.

## Production state (already executed, do not repeat)

- 20 fake leagues + 71 fake accounts deleted from the LIVE Supabase
  project (Phase 1) — this is done, verified, and irreversible. Do not
  attempt it again or assume it still needs doing.
- One migration applied this pass (Phase 7, see above). Phases 1–6 and
  8–10 needed none.
- `main` already has Pass 12 (A–E) merged and deployed to production
  (Vercel Pro). This branch (`feature/pass-12f-beta-readiness`) is based
  on that current `main`. **This branch has not been pushed or merged.**

## Exact remaining manual Supabase step (from Pass 12F Phase 3)

Set `CRON_SECRET` in Vercel's production env (Pass 12D's own leftover
step, still not done) is UNRELATED to Phase 3's auth work. For Phase 3
specifically: confirm in the Supabase dashboard (Authentication → URL
Configuration) that **Site URL** = `https://elevenfantasy.com` and
**Redirect URLs** includes `https://elevenfantasy.com/auth/callback`
(plus a `localhost:3000/auth/callback` entry for local dev testing) — this
was not independently re-verified against the live dashboard this pass
(no Supabase dashboard access from this environment); it's inferred from
`SITE_URL` already being correct in code. Confirm this manually before
relying on real confirmation/recovery emails working end-to-end in
production.

---

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
