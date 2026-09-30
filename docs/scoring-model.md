# Eleven — Scoring Model (ELEVEN_STANDARD_V1)

This is the scoring-analysis artifact the Pass 9 brief asks for: what raw
data is actually available, what was selected, what was rejected, the
empirical distributions the real 2026/27 dataset produces, and the
resulting versioned formula. The formula itself lives in
`src/domain/fantasy/scoring.ts` — this document explains *why* it looks
the way it does, not the implementation.

> Historical fantasy scores must remain reproducible according to the
> scoring rule version that generated them. A new formula writes a new
> `scoring_rule_version`; it never overwrites a prior version's rows.

## Available raw fields (Phase 1 coverage audit)

Measured against all 11,530 `player_match_stats` rows from the 2026/27
population (see `docs/football-data-system.md` for how that data was
built):

| Field | % non-zero | Notes |
|---|---|---|
| `minutes` | 73.0% have minutes > 0 | The rest are squad members who didn't feature in that fixture |
| `started` | 57.0% | |
| `goals` | 6.1% | Rare, as real football is |
| `assists` | 4.7% | |
| `shots_on_target` | 16.9% | FWD 30.8%, GK/DEF near-zero — good positional signal |
| `chances_created` (mapped from provider "key passes") | 30.3% | Highest for MID (41.9%) |
| `tackles` | 39.3% | Highest for DEF (47.5%) and MID (49.1%) |
| `interceptions` | 26.7% | Highest for DEF (39.0%) |
| `blocks` | 13.0% | Highest for DEF (21.8%) |
| `saves` | 4.3% overall, but 40.3% *of goalkeeper appearances* — cleanly GK-exclusive (0% for every other position) |
| `yellow_cards` | 8.3% | |
| `red_cards` | 0.3% | Rare, as expected |
| `clean_sheet` (the stored column) | 0% populated — **never set by ingestion, always NULL** | See below |

Coverage does not meaningfully differ between domestic (Big Five) and
UEFA (UCL/UEL) fixtures for any of the above fields — both draw from the
same provider endpoint (`/fixtures/players`) with the same field set.

**`player_match_stats.clean_sheet` is never populated** — Pass 8's
ingestion declared the column but no normalization path ever set it
(`NormalizedFixturePlayerStats.cleanSheet` was optional and unused). This
pass found the real reason it can't be set at ingestion time: whether a
specific appearance counts as a clean sheet depends on the player's
position, their minutes, *and* their club's result — none of which
`player_match_stats` (which is per-player, per-fixture, with no notion of
"my club's other 10 players' result") can determine alone. Fixed by
adding `fixtures.home_score`/`away_score` (a new migration this pass) and
computing clean-sheet credit **at scoring time**, not at ingestion time —
see `ScoringInput.concededByOwnClub` in `scoring.ts`. The stored
`clean_sheet` column is now dead weight (left in place; not worth a
migration to drop something inert) — the scoring engine never reads it.

**Fields NOT available and NOT used**: provider rating, total shots
(only shots-on-target is stored), pass completion/accuracy, duels, fouls,
penalty events. These were deliberately not ingested in Pass 8 (see
`docs/football-data-system.md` "Stats deliberately not modeled") and
remain out of scope — see "Rejected inputs" below.

## Fields selected for scoring

Every field with meaningful, position-differentiated coverage above:
`minutes`, `goals`, `assists`, `shots_on_target`, `chances_created`,
`tackles`, `interceptions`, `blocks`, `saves`, `yellow_cards`,
`red_cards`, plus the derived `concededByOwnClub` (→ clean sheet).

## Rejected inputs

- **Provider rating.** Explicitly excluded by the brief ("do not use
  provider rating as a substitute for our own fantasy model") and by
  Eleven's own invariant (`docs/domain-model.md` #10 — never trust a
  provider's own scoring-adjacent field as canonical). It also isn't
  stored in `player_match_stats` at all.
- **Raw shots (vs. shots on target).** Not ingested — only
  shots-on-target exists in the schema. Adding it would require a new
  migration + re-ingestion for marginal signal on top of shots-on-target;
  deferred, not rejected outright.
- **Passes/pass accuracy, duels, fouls, penalty events.** Not ingested
  (see `docs/football-data-system.md`). Could strengthen the model later
  (fouls-drawn for attackers, duel-win-rate for defenders/midfielders),
  but "do not score a field merely because it exists" cuts the other way
  too: don't gate a working V1 on ingestion work outside this pass's
  scope.

## Candidate models considered

1. **Flat per-stat multiplier, no position weighting** (a goal is worth
   the same 4-5 points regardless of position). Rejected: this is the
   textbook failure mode the brief warns against — it makes goals the
   only thing that matters and defenders/goalkeepers structurally
   irrelevant, since they almost never score. Confirmed empirically: with
   flat goal weighting, GK/DEF mean points would drop by roughly a third
   relative to what defensive-actions + clean-sheet credit currently
   contributes.
2. **Provider-rating-anchored model** (scale the provider's own 1-10
   rating into fantasy points). Rejected outright per the brief and
   `docs/domain-model.md` invariant #10 — not reproducible from Eleven's
   own raw stats, and the provider's rating methodology is opaque.
3. **Position-weighted goals/clean-sheets + flat creative/defensive
   action bonuses + threshold-based minutes** — the chosen model. Every
   raw input is directly observable and auditable; every position has a
   credible path to a good score without relying on the same events as
   every other position.

## Empirical distributions (2026/27 dataset, eligible performances = minutes > 0, n=8,401)

| Position | n | mean | median | stdDev | p90 | p99 | max | zero-or-negative |
|---|---|---|---|---|---|---|---|---|
| GK | 541 | 3.72 | 3 | 1.86 | 7 | 8 | 10.5 | 0.0% |
| DEF | 2,634 | 3.64 | 3 | 2.63 | 7.25 | 13 | 17.5 | 1.2% |
| MID | 3,203 | 3.53 | 3 | 2.72 | 7.5 | 13 | 25.5 | 1.3% |
| FWD | 2,023 | 3.37 | 2.25 | 3.00 | 7.5 | 14.25 | 21.25 | 1.5% |

**No position is structurally irrelevant** — mean points span a narrow
3.37–3.72 range, with GK actually highest (consistent saves + clean
sheets). **Elite attackers still matter** — FWD has the highest standard
deviation and the highest p99, meaning attacking output is what creates
the biggest single-match spikes, exactly the "some archetypes explode,
others are consistent" texture a draft game wants. Top averages by
position (≥3 appearances) are genuinely competitive across positions:
DEF's best (Miguel Gutiérrez, 9.56 pts/app) sits between MID's and FWD's
best (13.10 and 12.56 respectively) — defenders aren't a tier below,
they're a different, still-viable archetype. The top 10% of individual
performances account for 27.2% of all points scored — real concentration
among standout games, not a flat, undifferentiated distribution.

Sanity-checked named examples: M. Olise (MID) and Bruno Fernandes (MID)
lead the highest single-match scores; Raphinha and Lamine Yamal (both
FWD, Barcelona) lead forward points-per-appearance; goalkeepers cluster
tightly around 3-5.7 pts/app with zero negative appearances, matching
real-world keeper reliability.

## Tradeoffs

- **Simplicity over configurability.** One centralized, versioned
  TypeScript formula rather than a database-driven per-league rule editor
  (the existing `scoring_rules` table remains unused — a reasonable
  future extension point for per-league customization, not needed yet;
  no commissioner tooling exists to edit it anyway).
- **Season-total minutes threshold, not FPL's exact bonus-point-system
  complexity.** Deliberately simpler than every real product's full rule
  set — this is a V1, not a copy of an existing game.
- **Defensive actions are summed, not weighted individually** (a tackle
  and an interception score the same 0.25). A future version could weight
  them differently if data suggests one is a stronger predictor of
  defensive quality; V1 treats them as roughly equivalent "defensive
  work."

## Chosen initial model: `ELEVEN_STANDARD_V1`

| Component | Rule |
|---|---|
| Minutes | 1 pt for 1+ minutes, 2 pts total for 60+ minutes (threshold, not linear) |
| Goals | GK 10 · DEF 6 · MID 5 · FWD 4 |
| Assists | 3 (flat) |
| Shots on target | 0.5 each |
| Chances created | 0.5 each |
| Defending (tackles + interceptions + blocks) | 0.25 per action |
| Goalkeeping (saves) | 1 pt per 3 saves (floor) |
| Clean sheet (60+ min, own club conceded 0) | GK 4 · DEF 4 · MID 1 · FWD 0 |
| Discipline | Yellow −1 · Red −3 |

See `src/domain/fantasy/scoring.ts` for the exact, tested implementation
— this table is documentation, not the source of truth; the code is.

## Why recompute, never increment

`calculateFantasyScore()` is a pure function of a `ScoringInput` snapshot.
The backfill/replay process always **recomputes the full score from the
current canonical raw stats** and upserts (never `points = points + delta`).
This is what makes duplicate provider polling safe: re-ingesting the same
`player_match_stats` row twice, or re-running the score backfill twice,
converges to the identical stored row rather than double-counting — see
`docs/football-data-system.md`-style idempotency proof in the Pass 9
final report.

## Historical backfill (Phase 4)

`npm run scoring:backfill` (`src/lib/scoring/backfill.ts`) computes and
upserts `fantasy_player_scores` for every eligible stored performance.
Eligibility is structural, not a separate filter list — see the
function's doc comment for exactly why `fixtures.season = 2026 AND
fixtures.status = 'final'` is sufficient on its own to exclude 2023
validation fixtures, incomplete fixtures, qualifying-round UCL/UEL
fixtures (never ingested), and non-Big-Five players (never given a
`players` row).

Run against the live 2026/27 dataset on 2026-09-29:

| Metric | Value |
|---|---|
| Eligible performances | 11,517 |
| Scored | 11,517 |
| Skipped | 0 |
| Failed | 0 |
| Scoring rule version | `ELEVEN_STANDARD_V1` |
| By position | GK 1,236 · DEF 3,714 · MID 4,010 · FWD 2,557 |
| By competition | ESP 3,146 · ENG 2,000 · ITA 2,399 · FRA 1,794 · GER 1,440 · UCL 467 · UEL 271 |

**Idempotency proof**: ran the backfill a second time immediately after
the first, against unchanged source data. Result counts were identical
(11,517 / 11,517 / 0 / 0). A full snapshot of every
`(player_id, fixture_id, scoring_rule_version, points, breakdown)` row
taken before the second run and compared byte-for-byte (JSON-serialized)
against a snapshot taken after was **exactly identical**, and a
duplicate-key scan across `(player_id, fixture_id, scoring_rule_version)`
found zero duplicates. Recomputing from unchanged canonical raw stats
converges to the same stored rows rather than double-counting.

One accepted limitation surfaced by this backfill: `players.club_id` is
the player's CURRENT club, not necessarily the club they represented in
a specific historical fixture. `concededByOwnClub` (and therefore
clean-sheet credit) is only computed when the player's current club
matches one side of that fixture; if neither matches (a transfer since
that match), the row is still scored but with no clean-sheet component,
rather than guessing which side they played for.

## Known limitations

- No pass-completion, duel, foul, or penalty signal (not ingested this
  pass — see "Rejected inputs").
- Defensive actions aren't differentiated by quality/danger (a tackle in
  your own box scores the same as a tackle in midfield).
- The clean-sheet minutes threshold (60) is a reasonable convention, not
  empirically tuned against Eleven-specific data (there isn't enough
  matches-per-player history yet to tune it meaningfully).
- Provider coverage for `chances_created` (mapped from "key passes") may
  under-count genuine creative output depending on how the provider
  itself defines a "key pass" — inherited from Pass 8, not re-verified
  against a second provider in this pass.
