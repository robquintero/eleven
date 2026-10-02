# Eleven — Scoring Model V2 (`ELEVEN_STANDARD_V2`)

Pass 12C's scoring revision. This document explains *why* V2 looks the
way it does; the formula itself lives in `src/domain/fantasy/scoring.ts`
(the single source of truth — this table is documentation, not code).

> Philosophy (the brief's own framing): "Eleven should reward the entire
> football performance, while preserving the supremacy of decisive
> actions. Extraordinary performances should produce extraordinary
> fantasy scores." Goals remain king; a strong performance without a
> goal or assist should still be possible for every position.

## 0. Audit — no new raw stat exists

Re-checked `player_match_stats` (`supabase/migrations/20260929141127_football_foundation.sql`)
and `docs/scoring-model.md`'s own V1 coverage audit before changing
anything: the stored field set is unchanged since V1 — `minutes, goals,
assists, shots_on_target, chances_created, tackles, interceptions,
blocks, saves, yellow_cards, red_cards`, plus the derived
`concededByOwnClub` (clean sheet). No provider rating, no total shots, no
pass accuracy, no duels, no fouls, no penalty events are ingested or
available. **V2 changes the formula applied to these same inputs — it
does not score anything new**, because nothing new is reliably ingested
yet.

## 1. What changed from V1

| Component | V1 | V2 | Why |
|---|---|---|---|
| Goals (GK/DEF/MID/FWD) | 10 / 6 / 5 / 4 | **12 / 8 / 7 / 6** | Design target from the brief — goals stay the largest ordinary scoring event, raised across the board, ordering preserved (rarer for defensive positions → worth more). |
| Assists | 3 (flat) | **4 (flat)** | Matter substantially more, stay well below a goal's value everywhere. |
| Goal milestone bonus | none | **`goals² − 1` for 2+ goals** | New — see §2. |
| Assist milestone bonus | none | **`assists(assists+1)/2 − 1` for 2+ assists** | New — see §2. |
| Chances created | 0.5 each | **0.75 each** | A genuinely creative match (4-6 chances) now contributes more clearly toward a "good non-G/A" performance. |
| Defensive actions (tackles+interceptions+blocks) | 0.25/action | **0.3/action** | A busy defensive shift (5-6+ actions) is now more clearly meaningful on its own. |
| Clean sheet (GK/DEF/MID/FWD) | 4 / 4 / 1 / 0 | **5 / 5 / 2 / 0** | A defensive midfielder (an explicitly named archetype) now has a more credible path leaning on clean sheet + defensive actions together. |
| Minutes, shots on target, saves, cards | unchanged | unchanged | Already matched the target texture; no reason found to retune. |

## 2. Goal and assist milestones — closed-form, not a lookup table

The brief is explicit: "do not create a lookup that simply stops at
five," and the marginal bonus should make a hat trick worth more than
simply 3× an isolated goal, while avoiding exponential blow-up.

**Goal milestone bonus:** `f(n) = n² − 1` for `n ≥ 2`, else `0`.

| Goals | Bonus | Running total vs. brief's naming |
|---|---|---|
| 2 | 3 | brace |
| 3 | 8 | hat trick |
| 4 | 15 | |
| 5 | 24 | |
| 6 | 35 | extends naturally — no new branch needed |
| 7 | 48 | |

This is exact for every value the brief names, and because it's a real
formula (not a table), it is *already* correctly defined for 6, 7, 10, or
any goal count — there is no "ceiling" to hit. It is quadratic (constant
second difference of 2 — verified in `scoring.test.ts`), not exponential:
the marginal bonus per additional goal grows linearly, never compounding.
A MID hat trick is `3×7 (flat) + 8 (bonus) = 29`, comfortably more than
`3×7 = 21` (an isolated goal's value times three) — the explicit
requirement — without the runaway growth a `2ⁿ`-style bonus would produce.

**Assist milestone bonus:** `g(n) = n(n+1)/2 − 1` for `n ≥ 2`, else `0`
(triangular numbers, not squares) — deliberately a slower-growing curve
than goals':

| Assists | Bonus |
|---|---|
| 2 | 2 |
| 3 | 5 |
| 4 | 9 |
| 5 | 14 |
| 6 | 20 |

`g(n) < f(n)` at every `n ≥ 2` (verified directly in `scoring.test.ts`),
so assist milestones are always meaningful but never out-escalate goal
milestones — matching "less explosive than goal milestones" exactly.

## 3. Scoring breakdown — every score is fully explainable

`FantasyScoreBreakdown.components` now exposes exactly the fields the
brief lists, nothing more: `minutes, goals, goalMilestoneBonus, assists,
assistMilestoneBonus, shotsOnTarget, chancesCreated, defensiveActions,
saves, cleanSheet, cards`. `total` always equals the sum of every
component (enforced by a dedicated self-consistency test) — the backend
is authoritative; the UI never reverse-engineers a score from `points`
alone. The Player Inspector's new Scoring Breakdown panel
(`src/components/players/scoring-breakdown.tsx`) renders this directly
from the stored `fantasy_player_scores.breakdown` jsonb column — no
separate computation in the UI layer.

## 4. Lightweight empirical calibration (real 2026/27 data, no simulation)

Per the brief's explicit instruction, this was a focused sanity check
against real stored `player_match_stats` for every `final` 2026 fixture
(286 fixtures, 11,517 performances, 8,384 with minutes > 0) — **not**
the previously-discussed large-scale simulation.

| Position | n | mean | median | p90 | p99 | max | zero-or-negative |
|---|---|---|---|---|---|---|---|
| GK | 527 | 3.98 | 3.00 | 8.00 | 9.00 | 12.75 | 0.0% |
| DEF | 2,611 | 4.19 | 3.20 | 8.55 | 16.10 | 22.30 | 1.1% |
| MID | 3,219 | 4.32 | 3.25 | 9.50 | 18.65 | 42.20 | 1.2% |
| FWD | 2,027 | 4.23 | 2.50 | 9.55 | 21.60 | 34.05 | 1.5% |

Checked against the brief's own target texture:

- **"Typical full 90: ~3-5"** — every position's mean sits inside this
  band (3.98-4.32). ✓
- **"Good non-G/A: ~6-9" / zero-G/A performances can still score well** —
  1,116 of 7,212 zero-goal/zero-assist performances (15.5%) scored 5+;
  the strongest non-G/A games (clean-sheet defenders and a deep-lying
  creative midfielder) reached 10.65-11.35, landing in the "excellent"
  band on a genuinely goal-less, assist-less defensive performance —
  confirming a credible explosive path exists without a decisive attacking
  contribution. ✓
- **"Strong one-goal forward: ~9-13"** — a lone FWD goal (6) + minutes (2)
  already reaches 8 before any shots/creation are added; real one-goal
  forward performances in the sample land in this band. ✓
- **"Brace: ~15-20+"** — real braces (e.g., a 2-goal, 1-assist performance)
  reached into the 30s once the assist and its own milestone stack on top
  of the goal bonus — intentionally allowed to exceed the floor of the
  band rather than capped, per "do not artificially cap extraordinary
  performances." ✓
- **"Historic real performance: allowed to create a historic fantasy
  score"** — the real top score in the dataset, M. Olise's 3-goal,
  1-assist match, scored **42.20** — genuinely historic, fully
  explainable component-by-component, never capped. ✓
- Position balance preserved from V1: no position is structurally
  irrelevant (means span a narrow 3.98-4.32 range), goalkeepers remain
  consistent with near-zero variance at the low end (p99 of 9, vs.
  attacking positions' 16-21+), and forwards/midfielders retain the
  highest ceiling — the same "some archetypes explode, others are
  consistent" texture V1 established, now with higher absolute numbers.

No further tuning was applied — the distribution matched every target
band on the first pass with the design-target coefficients, so this pass
deliberately stopped here rather than chasing a "mathematically perfect"
distribution the brief explicitly warns against.

## 5. Migration / version semantics

`fantasy_player_scores` was already built (Pass 9,
`20260930013544_scoring_engine_foundation.sql`) with exactly this
transition in mind: the real uniqueness key is `(player_id, fixture_id,
scoring_rule_version)`, and the column comment literally says "a new
formula version writes NEW rows, it never overwrites scores an older
version produced." **V1 rows are never touched, never deleted, never
rewritten** — every row with `scoring_rule_version = 'ELEVEN_STANDARD_V1'`
remains exactly as it was.

However, every read path in the app (`refreshMatchupScores`, standings
aggregation, the Players workspace, `getPlayerDatabase`) filters
`fantasy_player_scores` by the CURRENT `SCORING_RULE_VERSION` constant —
there is no "show me whichever version exists" fallback. Bumping the
constant to `ELEVEN_STANDARD_V2` without backfilling would mean every
already-played 2026/27 fixture briefly shows **zero** points for
everyone, since no V2 row would exist for them yet. The architecture
explicitly anticipated this ("a future ELEVEN_STANDARD_V2") and provides
the backfill script specifically for this cutover — **this pass ran
`npm run scoring:backfill` against the live Supabase project immediately
after bumping the version constant**, recomputing V2 scores for every
eligible stored performance from the same canonical `player_match_stats`
V1 was computed from. This is a backfill of the CURRENT version's rows
for historical fixtures (exactly what the script is for), not a rewrite
of V1's own stored rows — V1 and V2 now coexist side by side for every
2026/27 performance, distinguished by `scoring_rule_version`.

## 6. Known limitations (unchanged from V1, still accurate)

- No pass-completion, duel, foul, or penalty signal (not ingested).
- Defensive actions aren't differentiated by quality/danger.
- Clean-sheet/minutes thresholds remain conventions, not empirically
  tuned beyond this pass's sanity check.
- `chances_created` (mapped from provider "key passes") inherits whatever
  under/over-counting the provider's own definition produces.
