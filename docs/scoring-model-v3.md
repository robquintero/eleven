# Eleven — Scoring Model V3 (`ELEVEN_STANDARD_V3`)

Pass 14.5's scoring revision. This document explains *why* V3 looks the
way it does; the formula itself lives in `src/domain/fantasy/scoring.ts`
(the single source of truth, alongside the preserved V2 formula — this
table is documentation, not code).

> Brief's framing: V2 is "too strict/compressed." The real example cited:
> Michael Olise's France v Italy performance (90 minutes, 1 goal, 2 shots
> on target, 2 chances created, 4 interceptions) scored 12.7 under V2.
> Goal: "materially healthier scores" — ordinary starters contribute
> meaningful points, good games are clearly rewarded, elite games can
> swing a matchup, defensive players and goalkeepers can matter, negative
> performances still hurt, and scores retain enough variance to make
> drafting/lineup decisions meaningful.

## 0. Audit — still no new reliable raw stat (re-confirmed for V3)

Re-checked `player_match_stats`'s real columns, the API-Football
ingestion adapter (`src/lib/football-providers/api-football/adapter.ts`),
and `docs/football-data-system.md`'s own "stats deliberately not
modeled" list before designing anything. The stored field set is
**unchanged since V1**: `minutes, started, goals, assists,
shots_on_target, chances_created, tackles, interceptions, blocks, saves,
yellow_cards, red_cards`, plus the derived `concededByOwnClub`. The
`clean_sheet` column exists but is dead (never populated by ingestion,
never read by scoring — clean sheet is independently derived from the
fixture's final score, same as V1/V2).

Confirmed NOT reliably available, so NOT used: provider rating, total
shots (only shots *on target*), pass completion/accuracy, duels, dribbles,
fouls, or any penalty event (scored/missed/saved/won/committed), and no
per-player goals-conceded field (only derivable at the fixture+club
level, which is exactly what `concededByOwnClub` already does). **V3
changes the formula and weights applied to the SAME inputs V2 used — it
does not score a new category of event**, because nothing new is
reliably ingested. The "more statistical texture" the brief asks for
comes from recalibrating these same inputs, not from inventing a stat.

## 1. What changed from V2

| Component | V2 | V3 | Why |
|---|---|---|---|
| Minutes | 2 tiers: 1 (1-59min) / 2 (60+min) | **3 tiers: 1 (1-59) / 2 (60-89) / 3 (90+)** | New "full match" tier (brief: "meaningful minutes thresholds / full-match participation") — a 90-minute shift is now worth more than a 65-minute one, not identical. |
| Goals (GK/DEF/MID/FWD) | 12 / 8 / 7 / 6 | **14 / 10 / 8 / 7** | Raised ~15-20%, ordering preserved (rarer for defensive positions → worth more) — goals stay the largest single ordinary event, elite attacking games still swing a matchup more than a merely good one. |
| Assists | 4 (flat) | **5 (flat)** | Raised, stays below a goal's value everywhere. |
| Goal/assist milestone bonus | `goals²−1` / `n(n+1)/2−1` | **unchanged formulas** | Already closed-form and well-calibrated (V2's own audit) — no reason to retune the shape, only the flat per-event base it sits on top of. |
| Shot on target | 0.5 | **0.75** | The only shooting signal Eleven has (no "shots total" field) — raised to carry more weight given that constraint. |
| Chance created | 0.75 | **1.0** | The only passing/creation signal Eleven has (no pass-accuracy field) — same reasoning. |
| Defensive action (tackle+interception+block, summed) | 0.3/action | **0.5/action** | The single biggest lever for "defensive players can matter" without duels/recoveries data — a 5-6 action shift now contributes 2.5-3 points on its own, not under 2. |
| Saves | `floor(saves/3)` (1pt per 3 saves — stepped) | **`saves × 0.5`** (continuous) | Brief: "goalkeeper saves should create meaningful scoring opportunities." V2's floor meant a keeper's 4th and 5th save added literally nothing until the 6th; V3's 4th/5th save each visibly contribute. |
| Clean sheet (GK/DEF/MID/FWD) | 5 / 5 / 2 / 0 | **6 / 6 / 3 / 0** | Raised, same shape/threshold (60+ minutes, 0 real conceded) — still the clearest "positional value" signal alongside goals. |
| Yellow card | −1 | **−1 (unchanged)** | Already correctly modest. |
| Red card | −3 | **−4** | "Negative performances still hurt" — a sending-off is now a harsher outcome. |

Deliberately **not** changed: the goal/assist milestone formulas
themselves (still `goals²−1` / `n(n+1)/2−1`), the clean-sheet
minutes/result threshold, and the basic shape of position-sensitivity
(goals and clean sheet scaled by position; shooting/creation/defending
flat across positions, same as V2) — "keep the system understandable...
avoid dozens of arbitrary hidden exceptions" (brief). A continuous saves
rate was chosen over a saves milestone bonus for the same reason: one new
rate is simpler than a new stepped exception.

## 2. FFSL reference

No FFSL (or any other external proprietary fantasy scoring) ruleset
exists anywhere in this repository's code, docs, or fixtures — searched
by filename and full-text, nothing found. Per the brief's own
instruction ("if external FFSL rules are not already available locally,
do NOT fabricate exact FFSL values... use the FFSL philosophy requested
here"), V3 is designed from the stated **philosophy** only (granular
event scoring, materially higher/less compressed totals than V2) and
derived transparently from the statistics Eleven actually possesses —
not from any specific, unverifiable external weight table.

## 3. Calibration — real stored `player_match_stats`, zero provider calls

Ran both formulas against **every row currently stored** in
`player_match_stats` (13,790 real performances across every ingested
Big Five + UEFA + eligible-international fixture), via a read-only
script making zero provider requests.

### Overall

| | n | mean | median | p25 | p75 | p90 | p95 | max |
|---|---|---|---|---|---|---|---|---|
| V2 | 13,790 | 3.21 | 2.20 | 0 | 4.30 | 8.25 | 10.35 | 42.20 |
| V3 | 13,790 | 4.26 | 3.00 | 0 | 6.00 | 11.00 | 13.25 | 50.75 |

### By position

| Position | n | V2 mean | V3 mean | V2 median | V3 median | V2 p90 | V3 p90 | V2 max | V3 max |
|---|---|---|---|---|---|---|---|---|---|
| GK | 1,453 | 1.78 | 2.71 | 0 | 0 | 7.00 | 9.00 | 12.75 | 16.50 |
| DEF | 4,500 | 3.14 | 4.30 | 2.30 | 3.50 | 8.20 | 11.00 | 22.30 | 28.75 |
| MID | 4,794 | 3.56 | 4.69 | 2.60 | 3.50 | 8.50 | 11.25 | 42.20 | 50.75 |
| FWD | 3,043 | 3.45 | 4.25 | 2.00 | 2.00 | 9.10 | 11.25 | 34.05 | 40.75 |

Goalkeepers see the largest relative mean increase (+52%) — the direct
result of the saves-rate change, the position's main non-clean-sheet
lever. Defenders (+37%) and midfielders (+32%) both gain substantially
from the defensive-action and creation/shooting raises. Forwards see the
smallest relative increase (+23%), consistent with "goals stay king" —
attacking output was already the best-rewarded category under V2. Every
position's ceiling (max) rises by a comparable, non-absurd ~18-30%,
preserving relative headroom rather than compressing it.

### Representative real performances (found by querying the stored data for each archetype, not fabricated)

| Archetype | Real player | V2 | V3 | Notable inputs |
|---|---|---|---|---|
| 90-min quiet starter (GK, no stats) | R. Zentner | 7.00 | 9.00 | 90min, clean sheet, 0 saves needed |
| Substitute (23 min, 1 chance created) | K. De Bruyne | 1.75 | 2.00 | |
| Scorer + assist | Rodri | 16.75 | 21.75 | 90min, 1G 1A, 3 SOT, 5 defensive actions |
| Creative midfielder (0G/0A, 6 chances created) | N. Amiri | 8.50 | 12.00 | |
| Strong defensive performance (5 actions, DEF) | Álex Jiménez | 4.00 | 5.50 | also carried a yellow card |
| Clean-sheet defender | C. Arcus | 8.65 | 10.50 | 78min, 3 defensive actions |
| Goalkeeper, multiple saves | David de Gea | 3.00 | 4.50 | 3 saves, conceded 3 (no clean sheet) |
| Red-card performance | C. Makosso | −1.40 | −2.00 | 35min, 2 defensive actions, red card |
| Elite performance (brace) | E. Haaland | 19.50 | 22.50 | 80min, 2 goals, 2 SOT |

### The real Michael Olise France v Italy performance (the brief's own anchor)

Real stored row: MID, 90 minutes, 1 goal, 0 assists, 2 shots on target, 2
chances created, 0 tackles, 4 interceptions, 0 blocks, conceded 1 (no
clean sheet).

| | Total | minutes | goals | SOT | chances | defending |
|---|---|---|---|---|---|---|
| V2 | **12.70** | 2 | 7 | 1.00 | 1.50 | 1.20 |
| V3 | **16.50** | 3 | 8 | 1.50 | 2.00 | 2.00 |

A +30% increase for a genuinely good (not historic) performance — exactly
the brief's target shape: meaningfully healthier, not inflated into
absurdity. The objective was never "make Olise equal exactly X"; this is
reported as the brief's own calibration anchor, not a target score.

No further tuning was applied beyond the single design pass above — the
distribution met every qualitative target (raised floor, raised ceiling,
goalkeepers/defenders meaningfully more relevant, discipline harsher,
Olise's real performance healthier without inflation) on the first
real-data pass.

## 4. Migration / version semantics

Same pattern V1→V2 already established
(`20260930013544_scoring_engine_foundation.sql`'s uniqueness key
`(player_id, fixture_id, scoring_rule_version)`): **V2 rows are never
touched, deleted, or rewritten.** `calculateFantasyScoreV2`/
`SCORING_RULE_VERSION_V2` remain exported and fully tested
(`scoring.test.ts`, unchanged, now pinned explicitly to V2). The generic
names every call site already imports — `calculateFantasyScore` /
`SCORING_RULE_VERSION` — now resolve to V3 (`calculateFantasyScoreV3` /
`SCORING_RULE_VERSION_V3`), which is the entire cutover: zero other files
needed to change. `backfillScores` recomputed V3 rows for every eligible
stored performance in the current season (season 2026) from the same
canonical `player_match_stats` V2 was computed from — this is a backfill
of the new current version's rows, not a rewrite of V2's.

## 5. Known limitations (unchanged from V1/V2, still accurate)

- No pass-completion, duel, foul, or penalty signal (not ingested).
- Defensive actions aren't differentiated by quality/danger.
- Clean-sheet/minutes thresholds remain conventions, not independently
  re-tuned for V3 beyond carrying V2's shape forward at higher values.
- `chances_created` (mapped from provider "key passes") inherits whatever
  under/over-counting the provider's own definition produces.
- No FFSL (or other external proprietary system's) exact weights were
  available to verify against — V3 is Eleven's own transparent design,
  built on FFSL's stated *philosophy* only (see §2).
