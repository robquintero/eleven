# Eleven Standard V4 — implementation and review report

The reviewed V4 foundation migration was applied to production through Supabase migration history during the approved final release. Existing round pins remain V3 and results are unchanged. V4 activation uses a separately scheduled future policy boundary; it never converts existing rounds. No provider requests, historical backfill or weight changes were performed by this release.

The subsequent release-safety pass added active-policy catalog selection and removed exactly 30 proven synthetic football rows under explicit authorization. Its current validation and cleanup evidence is in [scoring-v4-release-safety.md](scoring-v4-release-safety.md); the historical calibration project was cancelled and these earlier partial artifacts were not expanded.

The proposed model is reviewable, but **activation is gated on real advanced-field coverage and full-model calibration**. A provider exposing a nullable field does not establish consistent populated coverage across domestic, European and international fixtures. Newly supported fields are dormant proposed categories, not an approval to enable inconsistent feeds.

## 1. Starting state

Branch `main`; HEAD and origin/main `b16ac67694d0de3f268af7f9727995846565003d`; working tree clean before this pass. Performance Pass 2 remains the baseline. This pass changes scoring/version propagation and its explanation only; it does not revisit the released navigation or lineup mutation implementation.

## 2. Exact current V3 model and disposition

Code and schema, rather than older documentation, are authoritative. Inputs are per-player/per-fixture. All legacy count columns are NOT NULL and the old adapter coalesces provider null/missing to zero. All components and final total are rounded with `Math.round(n * 100) / 100`.

| Category | Stored field | Provider field | V3 weight / formula | Position dependent | Sign | V4 disposition / note |
|---|---|---|---|---|---|---|
| Appearance | minutes | games.minutes | 0 minutes:0; 1–59:+1; 60–89:+2; 90+:+3 | No | + | KEEP, noncumulative |
| Goals | goals | goals.total | GK14 / DEF10 / MID8 / FWD7 | Yes | + | REWEIGHT to7 all positions |
| Goal milestone | goals | goals.total | if goals>=2: goals²−1, otherwise0 | No | + | REMOVE; linear shot+SOT+goal stacking replaces extra bonus |
| Assists | assists | goals.assists | +5 | No | + | REWEIGHT to4 |
| Assist milestone | assists | goals.assists | if assists>=2: assists×(assists+1)/2−1, otherwise0 | No | + | REMOVE; richer event model |
| Shots on target | shots_on_target | shots.on | +0.75 | No | + | REWEIGHT to2 |
| Chances created | chances_created | passes.key | +1 | No | + | REWEIGHT to0.25 and name KEY PASSES |
| Defensive actions | tackles + interceptions + blocks | tackles.total/interceptions/blocks | +0.50 each | No | + | REPLACE grouped component with separately explained positional events |
| Saves | saves | goals.saves | +0.50 | No restriction in V3 scorer | + | REWEIGHT to1; restrict V4 toGK |
| Clean sheet | minutes + fixture scores + club/national team association | games.minutes + fixture goals | GK6 / DEF6 / MID3 / FWD0;60+ min,own-side whole-fixture concessions0 | Yes | + | KEEP DEF/MID/FWD; REWEIGHT GK to7 |
| Yellow | yellow_cards | cards.yellow | −1 | No | − | KEEP |
| Red | red_cards | cards.red | −4 | No | − | KEEP |

The nullable stored `clean_sheet` column is unused in the scorer and was never populated by the current adapter. Penalties saved/missed, fouls committed, goals-conceded deductions and own-goal penalties are **not V3 mechanics**. The raw endpoint has fields the old adapter discarded: absence from storage is not provider unavailability.

V1 was restored from the original repository implementation (`fef5e6f`) with renamed exports; V2 and V3 formulas remain intact. Canonical stored scores remain keyed by `(player_id, fixture_id, scoring_rule_version)`.

## 3. Provider capability audit and complete FFSL coverage matrix

A = direct; B = exactly derivable for the explicitly stated Eleven definition; C = related statistic with different/unverified semantics; D = unavailable in the existing fixture-player payload. "Available field" does not mean uniformly populated. None of the newly preserved counts exists in historical storage, so advanced coverage remains unmeasured.

| FFSL category / weight | A/B/C/D | Endpoint field / type / nullability | Stored before / V3 scored | V4 decision and reason |
|---|---|---|---|---|
| Goal +7 | A | goals.total, integer/null | goals / yes | GOALS +7 |
| Shot +1 | A | shots.total, integer/null | discarded / no | SHOTS +1, proposed coverage gate |
| Shot on target +2 | A | shots.on, integer/null | shots_on_target / yes | SHOTS ON TARGET +2 |
| Assist +4 | A | goals.assists, integer/null | assists / yes | ASSISTS +4 |
| Penalty won +4 | A | penalty.won, integer/null | discarded / no | PENALTIES WON +4, coverage gate |
| Key pass +0.25 | A | passes.key, integer/null | chances_created / yes | KEY PASSES +0.25 |
| Big chance created +0.50 | D | no separate field | no / no | Omit; key pass is not a big chance |
| Accurate cross +0.10 | D | no cross/successful-cross field | no / no | Omit |
| Accurate pass +0.05 | C/unresolved | passes.accuracy, number/string/null | discarded / no | Store raw only; exact count not established |
| Long ball completed +0.10 | D | no attempts/completed long-ball field | no / no | Omit |
| Successful dribble +0.25 | A | dribbles.success, integer/null | discarded / no | SUCCESSFUL DRIBBLES +0.25, coverage gate |
| Foul drawn +0.25 | A | fouls.drawn, integer/null | discarded / no | FOULS DRAWN +0.25, coverage gate |
| Tarries +0.05 | D | touches and possession lost both absent | no / no | Omit, cannot derive |
| Tackles won +1×position | C | tackles.total, generic integer/null | tackles / yes | TACKLES +1×position, no won claim |
| Interceptions +1×position | A | tackles.interceptions, integer/null | interceptions / yes | INTERCEPTIONS +1×position |
| Clearances +1×position | D | no field | no / no | Omit |
| Blocked shots +1×position | C | tackles.blocks, generic integer/null | blocks / yes | BLOCKS +1×position; cannot assert shot-only |
| Aerials won +1×position | D | duels.won is all won duels, not aerials | no / no | Omit aerials; distinct DUELS WON |
| Recoveries +1×position | D | no field | no / no | Omit |
| GK clean sheet +7 | B* | games.minutes + fixture side/scores | derivable / yes | Preserve 60+ min + whole-fixture zero policy; *not exact on-pitch clean sheet |
| Save +1 | A | goals.saves, integer/null | saves / yes | GK SAVES +1 |
| Save inside box +2 | D | saves have no location | no / no | Omit |
| BMI R16/QF/SF/final | C/unresolved stage mapping | league.round string, not stored | discarded / no | Audit only; no multiplier |

Additional audited fields:

| Concept | Field / raw type / nullability | Semantics and historical storage | Proposed handling |
|---|---|---|---|
| Total passes | passes.total integer/null | Attempted/total passes; discarded | Preserve count, not scored |
| Pass accuracy | passes.accuracy number/string/null | Official sources do not establish exact accurate-pass count for fixture payload; historical provenance absent | Preserve raw without percentage/count conversion; do not score |
| Total duels | duels.total integer/null | Total contests, not wins or aerial-only; discarded | Preserve, not scored |
| Duels won | duels.won integer/null | All won duels, distinct from tackles/interceptions/blocks; discarded | Required proposed Eleven category |
| Penalty saved | penalty.saved integer/null | Explicit penalty saves; discarded | +5 GK; coverage gate |
| Penalty missed | penalty.missed integer/null | Explicit missed penalties; discarded | −3; coverage gate |
| Fouls committed | fouls.committed integer/null | Explicit committed fouls; discarded | −0.25; coverage gate |
| Goals conceded | goals.conceded integer/null | Payload counter exists; player/keeper participation and timing meaning not established | Preserve, no negative scoring |
| Minutes | games.minutes integer/null | Reported participation duration; historically coalesced0 | Preserve nullable copy plus unchanged legacy column |
| Cards | cards.yellow/red integer/null | Separate counts; historically coalesced0 | Keep −1/−4; if two yellows and red are reported all apply |
| Own goal | separate fixture events endpoint event detail | Not a current player-stat field/path | Deferred; no additional provider endpoint/calls |
| Penalty scored / committed | penalty.scored / provider-spelled penalty.commited, integer/null | Related counters exist; previously discarded | Scored penalty already counts as a goal. No extra committed-penalty category proposed; committed fouls are scored separately. |
| Dribble attempts / dribbled past | dribbles.attempts / dribbles.past, integer/null | Related volume/opponent-event counters, previously discarded | Score explicit successful dribbles only; no attempted-dribble farming or new dribbled-past penalty. |
| Aerial duels, touches, possession lost, recoveries, crosses, long balls, clearances | no faithful fields in inspected current fixture-player shape | No exact derivation from generic duels/passes/tackles | Omit |

**Sources and limits:** existing code/types and SELECT-only stored data are primary for Eleven. API-Football's [official endpoint guide](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide) and [official nullable response examples](https://www.api-football.com/news/post/how-to-get-all-teams-and-players-from-a-league-id) support field families and nullable responses. The guide's season accuracy discussion does not prove fixture-player `passes.accuracy` is an exact count. Interactive documentation returned a security challenge; no challenge bypass or authenticated provider API request was attempted. There is no evidence of equal advanced-field population across competitions.

## 4. Final proposed Eleven Standard V4 table

Values below are implemented locally, **inactive**, and subject to coverage/full-calibration review. Position order is GK / DEF / MID / FWD. The scorer and Game Rules consume the same configuration.

### ATTACKING

| Category | V4 value | Position multiplier / eligibility | API field | FFSL value | Status | Notes |
|---|---:|---|---|---|---|---|
| GOALS | +7.00 | All positions | `goals.total` | 7 | A; direct; proposed | All positions; stacks with shots/SOT. |
| SHOTS | +1.00 | All positions | `shots.total` | 1 | A; direct; proposed | Total shots; no invented missed-shot deduction. |
| SHOTS ON TARGET | +2.00 | All positions | `shots.on` | 2 | A; direct; proposed | Stacks independently. |

### PLAYMAKING

| Category | V4 value | Position multiplier / eligibility | API field | FFSL value | Status | Notes |
|---|---:|---|---|---|---|---|
| ASSISTS | +4.00 | All positions | `goals.assists` | 4 | A; direct; proposed | Provider assists. |
| PENALTIES WON | +4.00 | All positions | `penalty.won` | 4 | A; direct; proposed | Nullable coverage must be validated. |
| KEY PASSES | +0.25 | All positions | `passes.key` | 0.25 | A; direct; proposed | Former stored label: chances_created. |

### BALL CARRYING

| Category | V4 value | Position multiplier / eligibility | API field | FFSL value | Status | Notes |
|---|---:|---|---|---|---|---|
| SUCCESSFUL DRIBBLES | +0.25 | All positions | `dribbles.success` | 0.25 | A; direct; proposed | Successful, not attempts. |
| FOULS DRAWN | +0.25 | All positions | `fouls.drawn` | 0.25 | A; direct; proposed | May intentionally overlap penalty won. |

### DEFENSE

| Category | V4 value | Position multiplier / eligibility | API field | FFSL value | Status | Notes |
|---|---:|---|---|---|---|---|
| TACKLES | +1.00 | GK ×0.50 / DEF ×0.50 / MID ×0.25 / FWD ×0.10 | `tackles.total` | 1 × position (Tackles Won) | C; provider-accurate name; proposed | Generic tackles, NOT Tackles Won. |
| INTERCEPTIONS | +1.00 | GK ×0.50 / DEF ×0.50 / MID ×0.25 / FWD ×0.10 | `tackles.interceptions` | 1 × position | A; direct; proposed | Direct count. |
| BLOCKS | +1.00 | GK ×0.50 / DEF ×0.50 / MID ×0.25 / FWD ×0.10 | `tackles.blocks` | 1 × position (Blocked Shots) | C; provider-accurate name; proposed | Generic blocks, NOT confirmed Blocked Shots. |

### PHYSICAL

| Category | V4 value | Position multiplier / eligibility | API field | FFSL value | Status | Notes |
|---|---:|---|---|---|---|---|
| DUELS WON | +1.00 | GK ×0.10 / DEF ×0.25 / MID ×0.20 / FWD ×0.15 | `duels.won` | — | A; direct; proposed | Eleven addition, NOT aerials or tackles. |

### GOALKEEPING

| Category | V4 value | Position multiplier / eligibility | API field | FFSL value | Status | Notes |
|---|---:|---|---|---|---|---|
| SAVES | +1.00 | GK only | `goals.saves` | 1 | A; direct; proposed | GK only; penalty save may also be a save. |
| PENALTIES SAVED | +5.00 | GK only | `penalty.saved` | — | A; direct; proposed | GK only; deliberate additional reward. |
| CLEAN SHEET | GK +7 / DEF +6 / MID +3 / FWD 0 | 60+ minutes | `games.minutes` + recorded fixture side + fixture scores | +7 (GK) | B for Eleven whole-fixture rule; proposed | Whole-fixture policy, not on-pitch concessions. |

### DISCIPLINE / OTHER

| Category | V4 value | Position multiplier / eligibility | API field | FFSL value | Status | Notes |
|---|---:|---|---|---|---|---|
| YELLOW CARDS | -1.00 | All positions | `cards.yellow` | — | A; direct; proposed | Keep V3; both yellows + red count if reported. |
| RED CARDS | -4.00 | All positions | `cards.red` | — | A; direct; proposed | Keep V3. |
| FOULS COMMITTED | -0.25 | All positions | `fouls.committed` | — | A; direct; proposed | Eleven downside; missing never penalized. |
| PENALTIES MISSED | -3.00 | All positions | `penalty.missed` | — | A; direct; proposed | Eleven downside; missing never penalized. |
| APPEARANCE | +1 / +2 / +3 | 1–59 / 60–89 / 90+ minutes | `games.minutes` | — | A; keep V3 | Replacing tiers, not cumulative. |


Clean sheets apply separately to every eligible fixture. At least 60 reported minutes and a known actual participating side are required. A player leaving before a later concession loses credit; a player entering after an earlier concession cannot regain it. This preserves the V3 whole-fixture policy rather than pretending to know on-pitch concessions. 90+ and extra-time participation receive the same +3 appearance tier; extra time does not multiply any bonus. FWD clean-sheet points are0.

## 5. Duels Won

Final proposed rates: **GK 0.10 / DEF 0.25 / MID 0.20 / FWD 0.15 per won duel**. No adjustment from the requested starting values. Historical `duels.won` was discarded: observed rows and measured contribution are **unavailable for all four positions**, not a measured average of zero. Seven duels produce0.70/1.75/1.40/1.05 respectively. Category tests cover null,0,1,multiple and every position. Contribution/balance must be measured on preserved real counts before activation.

## 6. Omitted FFSL categories

Accurate passes: ambiguous count/percentage semantics, no exact rounded-percentage derivation. Big chances, accurate crosses, completed long balls, clearances, aerial wins, recoveries, touches, possession lost/Tarries and inside-box saves: no faithful current fixture-player field. Generic tackles/blocks use their actual names, never falsely claim FFSL equivalence. No provider ratings or provider fantasy points are scored.

## 7. V3 rules retained

Appearance tiers distinguish cameo/significant/full participation without continuous passive-minute farming. DEF/MID/FWD clean-sheet weights and threshold preserve existing balance. Yellow−1 and red−4 retain downside. Scoring eligibility, international epoch, acquisition cutoff, locked starters, bench exclusion, formation and lineup rules are unchanged.

## 8. Removed / reweighted rules

Goals7 all positions replace14/10/8/7; assists4 replace5; SOT2 replace0.75; keypasses0.25 replace1; separate defense events have FFSL positional rates instead of flat0.5. Saves1 GK-only replace0.5 unrestricted; GK clean7 replaces6. Goal/assist milestone bonuses are removed in V4 only, because shot+SOT+goal reward is now intentional and linear. New downside is committed foul −0.25 and missed penalty−3; saved penalty+5 is an Eleven addition. No goals-conceded deduction is added without reliable participation semantics. Weight changes were deliberate reference-model choices, not tuned to force equal means on incomplete data.

## 9. Ingestion and storage

`normalizeFixturePlayerStats` → `fixtureStatPersistenceRow` → `player_match_stats.reported_stats` → explicit version dispatcher → canonical `fantasy_player_scores` → persisted structured breakdown → inspector.

New nullable snapshot keys: minutes, goals, assists, shots, shotsOnTarget, keyPasses, tackles, interceptions, blocks, saves, yellowCards, redCards, duelsTotal, duelsWon, successfulDribbles, foulsDrawn, foulsCommitted, penaltiesWon, penaltiesMissed, penaltiesSaved, goalsConceded, passesTotal, passAccuracyRaw. Legacy columns still receive their original zero-coalesced inputs for historical formulas. New actual `participation_club_id` resolves the provider team block, including national teams; `scoring_position` captures the canonical fantasy position on first ingestion and is preserved on corrections. No schema field duplicates an aerial/tackle-won concept.

Official V4 recomputation requires a preserved snapshot and captured scoring position. Legacy rows are rejected; incomplete fallback is available only through the offline calibration option. Unknown actual side produces no clean sheet, not guessed club membership.

## 10. Competition coverage

Eligible stored final 2026 sample includes ENG/ESP/FRA/GER/ITA, UCL/UEL, UEFA_NL. No historical reported snapshots exist in any of them. Therefore no measured claims about advanced-stat coverage can be made for domestic, European or senior-international feeds. The machine-readable artifact contains per-competition row/field counts; old counts' apparent population is not reliable coverage evidence because nulls were coalesced0.

Activation prerequisite: collect authorized representative real fixture-player responses across each eligible competition family, verify nullable and explicit-zero behavior for every new scored field, then evaluate full-model distributions. Inconsistent category coverage requires an explicit model/config decision before enabling V4; never fill missing positives or negatives with guessed events. Production activation is not ready on the current evidence.

## 11. Missing versus zero

Explicit valid nonnegative integer0 is retained and known; positive integer is retained; null, missing, invalid/noninteger/negative count is unavailable. Missing groups yield nullable fields. Missing player `statistics[0]` skips the performance rather than fabricating one. Unknown fields add neither positive nor negative points and remain listed as unavailable. An unavailable field's effective0 contribution is not a measured0 performance or proof of fairness across competitions.

## 12. First-class breakdown

Each persisted V4 breakdown stores schema4, model, captured position, integer totalUnits, decimal total, all category components, entries(count/baseweight/multiplier/integercontribution) and unavailable keys. UI category subtotals and total sum integer units. Negative contributions remain visible; zero-contribution entries are omitted in the compact panel. Category/stat names derive from the scorer's configuration and match Game Rules. No UI recomputation of provider events.

## 13. Precision

Per-event arithmetic and performance/matchup aggregation use integer hundredths. Total converts once to points. Existing score/live/final columns are `numeric(8,2)` and already sufficient; no precision/type migration. Breakdown displays2 decimals; shared route totals display2 only when hundredths are needed, otherwise retain1 decimal. No `.1f` rounding away Duels0.15. Raw JSON decimal components are presentation values; integer entries are authoritative for exact summation.

## 14. Calibration dataset and distributions

Snapshot captured **2026-10-06T01:20:41.004Z**, through SELECT-only reads. Total stored stats14,195;25 provider-unmapped rows excluded. **14,170 provider-mapped stored performances** are used, not invented examples. External match events were not independently reverified. Legacy provider null provenance, historical position/side changes and all new rich fields cannot be reconstructed from these rows.

**Every V4 number here is a PARTIAL recomputation using available old counts. It is not a full V4 score or necessarily a lower bound: missing fields include both positive and negative events.** No weight tuning from unavailable data. Quantiles use linear interpolation; distributions includezero-minute bench/nonappearance rows. Eligible-only and appearances-only variants are reported separately.

All provider-mapped stored rows:

| Model | COUNT | MEAN | MEDIAN | P25 | P75 | P90 | P95 | MIN | MAX |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| V3 | 14170 | 4.261 | 3.000 | 0.000 | 6.000 | 11.000 | 13.250 | -5.000 | 50.750 |
| V4 partial | 14170 | 3.902 | 2.500 | 0.000 | 5.750 | 10.500 | 13.000 | -5.000 | 42.500 |

Eligible final 2026 / configured competition / international-epoch rows:

| Model | COUNT | MEAN | MEDIAN | P25 | P75 | P90 | P95 | MIN | MAX |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| V3 | 12967 | 4.163 | 3.000 | 0.000 | 6.000 | 10.750 | 13.000 | -5.000 | 50.750 |
| V4 partial | 12967 | 3.812 | 2.300 | 0.000 | 5.500 | 10.500 | 12.835 | -5.000 | 42.500 |

## 15. Position calibration and viability

Eligible final 2026, includingzero-minute records:

| Position | Count | Mean V3 → partial V4 | Median | P75 | P90 | P95 |
|---|---:|---:|---:|---:|---:|---:|
| GK | 1427 | 2.680 → 3.471 | 0.000 → 0.000 | 5.000 → 7.000 | 9.000 → 11.000 | 10.500 → 13.000 |
| DEF | 4167 | 4.147 → 3.903 | 3.000 → 3.000 | 6.000 → 5.750 | 11.000 → 10.500 | 12.500 → 12.000 |
| MID | 4506 | 4.624 → 3.798 | 3.250 → 2.500 | 7.000 → 5.500 | 11.125 → 9.000 | 14.250 → 12.500 |
| FWD | 2867 | 4.200 → 3.871 | 2.000 → 1.550 | 5.250 → 5.000 | 11.250 → 11.450 | 14.000 → 14.350 |

Appearance-only comparison (9,475 rows, minutes>0):

| Position | Count | Mean V3 → partial V4 | Median | P75 | P90 | P95 |
|---|---:|---:|---:|---:|---:|---:|
| GK | 623 | 6.140 → 7.951 | 5.000 → 7.000 | 9.000 → 10.000 | 10.500 → 13.000 | 11.000 → 14.000 |
| DEF | 2965 | 5.830 → 5.487 | 4.500 → 4.500 | 8.250 → 7.750 | 11.500 → 11.000 | 14.200 → 12.750 |
| MID | 3607 | 5.776 → 4.744 | 4.500 → 3.500 | 7.750 → 6.500 | 12.250 → 10.500 | 15.250 → 13.500 |
| FWD | 2280 | 5.282 → 4.868 | 3.000 → 2.550 | 7.250 → 6.350 | 12.000 → 12.350 | 16.000 → 15.802 |

GK rises substantially from save/clean-sheet weights; actual keepers can receive10 clean-sheet+90min points before saves. This deserves real coverage/calibration review. DEF retains6 clean-sheet points; defensive mids lose flat defense/keypass value but gain proposed duels/dribbles/fouls/total shots—none of those gains can be measured here. FWD top performances remain valuable. Accurate-pass farming is absent because accurate passes are omitted; keeper save farming, wasteful-shot volume and duel dominance remain full-data review questions. Position equality was not forced. Clean sheets/appearance currently dominate much of the partial ordinary-player baseline; richer-event shares must be measured rather than asserted.

## 16. Average category contributions

Across12,967 eligible stored records, includingzero-minute rows:

| Category | Observed rows | Mean partial contribution | Mean among observed |
|---|---:|---:|---:|
| goals | 12967 | 0.497185 | 0.497185 |
| shots | 0 | UNAVAILABLE | UNAVAILABLE |
| shotsOnTarget | 12967 | 0.460245 | 0.460245 |
| assists | 12967 | 0.207604 | 0.207604 |
| penaltiesWon | 0 | UNAVAILABLE | UNAVAILABLE |
| keyPasses | 12967 | 0.127921 | 0.127921 |
| successfulDribbles | 0 | UNAVAILABLE | UNAVAILABLE |
| foulsDrawn | 0 | UNAVAILABLE | UNAVAILABLE |
| tackles | 12967 | 0.247698 | 0.247698 |
| interceptions | 12967 | 0.153505 | 0.153505 |
| blocks | 12967 | 0.064232 | 0.064232 |
| duelsWon | 0 | UNAVAILABLE | UNAVAILABLE |
| saves | 12967 | 0.153004 | 0.153004 |
| penaltiesSaved | 0 | UNAVAILABLE | UNAVAILABLE |
| yellowCards | 12967 | -0.083520 | -0.083520 |
| redCards | 12967 | -0.013264 | -0.013264 |
| foulsCommitted | 0 | UNAVAILABLE | UNAVAILABLE |
| penaltiesMissed | 0 | UNAVAILABLE | UNAVAILABLE |
| minutes | 12967 | 1.504434 | 1.504434 |
| cleanSheet | 12761 | 0.492635 | 0.500588 |

Reported counts for new categories are all unavailable. Accurate passes, goals-conceded deductions and unsupported FFSL categories are not V4 categories and have no contribution. Duels means by GK/DEF/MID/FWD are null/unmeasured. Mean partial divides known contributions by the entire eligible sample; mean observed divides only rows with known inputs. Legacy numeric counts still lack original nullable provenance; clean-sheet context is unavailable in206 eligible records.

## 17. Real stored archetypes

Role labels use named known-role candidates and canonical stored position, not a new provider subposition inference. Physical striker is a candidate only: no historical duel count proves its physical contribution. Key stored counts and largest partial contributors:

- **eliteGoalscorer: M. Olise**, Bayern München vs Union Berlin, 2026-09-18, MID. minutes=90, goals=3, assists=1, shotsOnTarget=5, keyPasses=2, tackles=3, interceptions=1, blocks=0, saves=0, yellowCards=0, redCards=0, concededByOwnTeam=0. V3 **50.75** → partial V4 **42.50** (-8.25). Largest contributors: GOALS +21.00, SHOTS ON TARGET +10.00, ASSISTS +4.00, APPEARANCE +3.00, CLEAN SHEET +3.00.

- **creativeMidfielder: M. Olise**, Bayern München vs Bodo/Glimt, 2026-09-10, MID. minutes=90, goals=2, assists=1, shotsOnTarget=4, keyPasses=7, tackles=4, interceptions=0, blocks=2, saves=0, yellowCards=0, redCards=0, concededByOwnTeam=0. V3 **43.00** → partial V4 **35.25** (-7.75). Largest contributors: GOALS +14.00, SHOTS ON TARGET +8.00, ASSISTS +4.00, APPEARANCE +3.00, CLEAN SHEET +3.00.

- **defensiveMidfielder: D. Rice**, Sunderland vs Arsenal, 2026-09-12, MID. minutes=81, goals=0, assists=1, shotsOnTarget=0, keyPasses=3, tackles=2, interceptions=0, blocks=1, saves=0, yellowCards=0, redCards=0, concededByOwnTeam=0. V3 **14.50** → partial V4 **10.50** (-4.00). Largest contributors: ASSISTS +4.00, CLEAN SHEET +3.00, APPEARANCE +2.00, KEY PASSES +0.75, TACKLES +0.50.

- **centerBack: A. Bastoni**, France vs Italy, 2026-10-02, DEF. minutes=90, goals=1, assists=0, shotsOnTarget=1, keyPasses=0, tackles=1, interceptions=0, blocks=3, saves=0, yellowCards=1, redCards=0, concededByOwnTeam=1. V3 **14.75** → partial V4 **13.00** (-1.75). Largest contributors: GOALS +7.00, APPEARANCE +3.00, SHOTS ON TARGET +2.00, BLOCKS +1.50, TACKLES +0.50.

- **attackingFullback: A. Davies**, Bayern München vs Bodo/Glimt, 2026-09-10, DEF. minutes=80, goals=1, assists=0, shotsOnTarget=1, keyPasses=1, tackles=1, interceptions=3, blocks=0, saves=0, yellowCards=0, redCards=0, concededByOwnTeam=0. V3 **21.75** → partial V4 **19.25** (-2.50). Largest contributors: GOALS +7.00, CLEAN SHEET +6.00, SHOTS ON TARGET +2.00, APPEARANCE +2.00, INTERCEPTIONS +1.50.

- **goalkeeper: B. Özer**, Toulouse vs Lille, 2026-09-03, GK. minutes=90, goals=0, assists=0, shotsOnTarget=0, keyPasses=0, tackles=0, interceptions=0, blocks=0, saves=9, yellowCards=0, redCards=0, concededByOwnTeam=0. V3 **13.50** → partial V4 **19.00** (+5.50). Largest contributors: SAVES +9.00, CLEAN SHEET +7.00, APPEARANCE +3.00.

- **physicalStrikerCandidate: E. Haaland**, Norway vs Denmark, 2026-09-24, FWD. minutes=90, goals=2, assists=0, shotsOnTarget=4, keyPasses=1, tackles=0, interceptions=0, blocks=0, saves=0, yellowCards=0, redCards=0, concededByOwnTeam=2. V3 **24.00** → partial V4 **25.25** (+1.25). Largest contributors: GOALS +14.00, SHOTS ON TARGET +8.00, APPEARANCE +3.00, KEY PASSES +0.25.

- **lowEventStarter: K. Diks**, Borussia Mönchengladbach vs SV Elversberg, 2026-09-05, DEF. minutes=90, goals=0, assists=0, shotsOnTarget=0, keyPasses=0, tackles=0, interceptions=0, blocks=0, saves=0, yellowCards=1, redCards=0, concededByOwnTeam=4. V3 **2.00** → partial V4 **2.00** (+0.00). Largest contributors: APPEARANCE +3.00, YELLOW CARDS -1.00.

- **substitute: D. Doué**, France vs Belgium, 2026-10-05, FWD. minutes=18, goals=1, assists=2, shotsOnTarget=1, keyPasses=2, tackles=1, interceptions=0, blocks=0, saves=0, yellowCards=0, redCards=0, concededByOwnTeam=1. V3 **23.25** → partial V4 **18.60** (-4.65). Largest contributors: ASSISTS +8.00, GOALS +7.00, SHOTS ON TARGET +2.00, APPEARANCE +1.00, KEY PASSES +0.50.

## 18. Excellent-performance sanity check

| Player | Fixture | Date | Position | V3 | Partial V4 |
|---|---|---|---|---:|---:|
| M. Olise | Bayern München vs Union Berlin | 2026-09-18 | MID | 50.75 | 42.50 |
| Kylian Mbappé | Real Madrid vs Real Sociedad | 2026-08-26 | FWD | 40.75 | 38.85 |
| Bruno Fernandes | Manchester United vs Ipswich | 2026-08-30 | MID | 46.75 | 35.50 |
| M. Olise | Bayern München vs Bodo/Glimt | 2026-09-10 | MID | 43.00 | 35.25 |
| Franco Mastantuono | Venezia vs Fiorentina | 2026-09-11 | MID | 42.75 | 34.50 |
| B. Brobbey | Manchester City vs Sunderland | 2026-09-20 | FWD | 36.00 | 32.25 |
| O. Dembélé | Paris Saint Germain vs Slovan Bratislava | 2026-09-09 | FWD | 40.75 | 31.80 |
| Raphinha | Barcelona vs Racing Santander | 2026-09-16 | FWD | 35.50 | 31.35 |

These are the highest **partial** V4 scores in the eligible stored sample, not a ranking under full V4. Dominant performances remain large; the top observed partial score42.50 does not justify arbitrary compression. New positive/negative volume may change ordering and upper tails substantially.

## 19. Low-performance checks

- poor90: **Reinildo**, Sunderland vs Arsenal (2026-09-12), 90 minutes; V3 -1.50 → partial V4 -1.50. Own side conceded 2; saves 0; yellow/red 2/1.
- cards: **O. Óskarsson**, Valencia vs Real Sociedad (2026-09-20), 35 minutes; V3 -5.00 → partial V4 -5.00. Own side conceded 2; saves 0; yellow/red 2/1.
- concedingKeeper: **S. Pizzignacco**, Inter vs Monza (2026-08-22), 90 minutes; V3 3.50 → partial V4 4.00. Own side conceded 4; saves 1; yellow/red 0/0.
- quietSubstitute: **Abdoul Karim Coulibaly**, Strasbourg vs Monaco (2026-09-12), 1 minutes; V3 1.00 → partial V4 1.00. Own side conceded 1; saves 0; yellow/red 0/0.
- Wasteful shooter: **not measurable**. Historical total shots were discarded; shots on target cannot identify total-shot inefficiency.

Cards can produce negative performances; a quiet cameo retains+1, a9zero-minute low-event player+3 before discipline. Heavy concession alone does not create a new V4 penalty because no such V3 rule existed and player concession semantics remain unproven. Total-shot inefficiency cannot be validated from historical SOT alone; this is an activation caveat, not invented evidence.

## 20. Correlated-event audit

Intentional overlaps: shot+SOT+goal; foul drawn+penalty won when both are independently reported; save+penalty saved. Goals include scored penalties, so no separate scored-penalty bonus. Duels won is a distinct provider counter and may correlate with tackles/dribbles, but is never relabeled as aerials/tackles-won. Each configured raw counter is scored exactly once. Removed milestones avoid another goal/assist-driven quadratic stack. No generic field is reused to fabricate unsupported FFSL events.

## 21. Historical immutability

Pre-pass rounds had no persisted scoring version; aggregation always selected global V3. The migration adds a required checked round version default V3 and an immutable trigger. Existing official score/result rows are not updated. Existing rounds, including already-created upcoming rounds, remain V3. A client/service caller cannot override a new round's version; the trigger chooses the activation policy at starts_at. Updates cannot switch model or shift the window after creation. Status/lifecycle updates remain allowed.

Embedded PostgreSQL executes the exact migration and asserts the102–98 fixture result stays102–98, active/completedV3 remain V3, future policy-createdV4 is pinned, retroactive/mid-round activation is rejected, and clients lack activation privileges. Same-version reconciliation is tested against actual engine code. On installations with genuine pre-existing V1/V2 official rounds, their pinning needs an explicit audited migration amendment before application; this production baseline's authoritative model isV3.

## 22. Provider corrections

A rule upgrade cannot switch a historical round's formula. A real corrected source count may still change a completed result under its original model, preserving current reconciliation behavior. Live sync resolves all round versions touched by changed fixture kickoffs, including completed rounds, and recomputes canonical rows for each version. Matchup refresh/finalization and the local simulation score diagnostic filter by the round's pinned version, never globally newest. The mutation-capable simulation CLI was not executed in this pass. Scoring errors defer reconciliation.

## 23. Live scoring

Existing scheduler/quota/fixture-state behavior is retained. Scheduled fixtures follow existing eligibility/no-score behavior; live/halftime/final snapshots are full replacement recomputations, not additive increments. Missing counts remain unavailable. Same snapshot twice yields the same per-player/fixture/version row; final/corrected snapshots replace that row. Stale failures do not silently become a successful fantasy reconciliation. New score versions add DB recomputation only, no new provider endpoint or poll frequency.

## 24. Multiple fixtures, acquisition and locks

Round aggregation preserves all eligible post-acquisition fixture performances using half-open starts/ends and the existing kickoff>=acquired_at boundary. Only starters contribute; bench exclusion and locked historical starter semantics remain. Integer hundredths sum fixtureA+B+C. No roster, ownership, acquisition, formation, lock or substitution-rule changes. Offline actual-engine tests cover3 fixtures, cutoff equality, pre-acquisition exclusion, starter predicate, pinned-model reads and completion; existing lock/acquisition unit regressions run. Guarded external Supabase integration tests are not bypassed.

## 25. Game Rules

New V4 table derives from `SCORING_V4_STATS`/weights, lists only implemented statistics, separates physical Duels Won, shows actual positional rates, event stacking, appearance tiers and whole-fixture clean-sheet limitation. Dialog selects the viewed current round's model through existing streamed shell status context; catalog fallback follows the authoritative active policy (currently V3). V1/V2 explanations are supported without rewriting their formulas. No released route loading/navigation logic was changed.

## 26. Player Inspector

Latest per-fixture persisted breakdown is compactly grouped with subtotals, signed points, count×base×position rate, captured position, opponent/date/model and exact total. Retained inspector detail state is keyed by player+model so switching models cannot show cached mismatched details. Team/Matchup requests follow round model; Players market/catalog follows the authoritative active policy (currently V3), switching only after explicit activation. V4 recent/opponent display uses participating-team provenance where recorded. This is not a full round analytics dashboard; its existing latest-performance scope is preserved.

## 27. BMI audit

**DO NOT RECOMMEND BMI YET**

Provider `league.round` is a free-form label but is not persisted. No authoritative normalized R16/QF/SF/final mapping spans UCL/UEL and international competitions; qualifiers, group/league phases and future expansion increase ambiguity. Multiplying an entire performance would inflate both positive and negative totals and needs separate policy/calibration. Domestic-equity policy is undecided. No BMI code or dormant multiplier was added.

## 28. Database migration and safety

Draft: `supabase/migrations/20261008000000_scoring_v4_foundation.sql` — **NOT APPLIED**.

- `player_match_stats`: nullable JSON object snapshot, nullable participating-clubFK (`ON DELETE RESTRICT`), nullable checked fantasy scoring position. Existing row values remainnull; legacy columns unchanged.
- `fantasy_rounds`: checked NOT NULL scoring_rule_version default V3. Applying gives existing roundsV3 metadata; does not recompute points/results.
- New `scoring_version_activations`: effective timestampPK + checked version; one `-infinity, V3` baseline row. No V4 activation entry.
- Two trigger-only `SECURITY DEFINER` functions with empty search_path and qualified relation references. PUBLIC/anon/authenticated execute revoked. Activation table has RLS and client permissions revoked; service hasSELECT/INSERT, no UPDATE/DELETE/TRUNCATE. Owner/admin can bypass or alter policy as a trusted DB operator; ordinary clients cannot.
- Activation requires futureTuesday00UTC, no existing round ending after boundary, monotonic policy and advisory transaction lock441104 shared with round creation. The checks repeat after acquiring lock.
- Read-only `get_catalog_scoring_version()` SQL/STABLE/SECURITY DEFINER RPC uses empty search_path, fully qualified policy table and database statement time; no caller clock/version argument. Only authenticated/service may execute. It does not expose the future activation ledger or change rows. Missing/unknown policy fails closed in the server selector.
- No new index; existing primary policy timestamp covers lookup. No score/breakdown precision/type change; structured breakdown uses existingJSONB.
- Additive schema but migration is **run once through repository Supabase history**, not manually re-executable idempotent SQL (`ADD COLUMN`/`CREATE` intentionally fail on duplicate objects). Transactional migration application failure should roll back; do not manually run fragments.
- Deployment coupling: new application selects reference these columns, so a separately approved release must apply dormant foundation before new code, then verify allV3 routes/scoring before any V4 policy.

Conceptual rollback before activation: restore baseline code, remove both triggers/functions, drop policy table and new metadata columns/constraint/FK. No score restore/backfill needed because this migration does not rewrite score data. AfterV4 rounds exist, retain V4 scorer/metadata for history; append a future V3 policy at an allowed boundary if needed rather than deleting policy/relabeling completed rounds. Rollback is not executed or generated in this pass.

## 29. Historical provider backfill estimate — NOT EXECUTED

New total shots,duels,dribbles,fouls and penalty counts need provider re-ingestion to enrich old performances. Original-null provenance and participating-side/captured-position metadata cannot be reconstructed exactly from the old columns alone. Future ingestion is sufficient for future V4 rounds; do not backfill merely for completeness.

Hypothetical eligible-final 2026 sample: **364 fixtures, minimum364 fixture-player requests,12,967 existing stat rows**, 2026-08-15T17:30:00+00:00 through 2026-10-05T18:45:00+00:00. Successful replay could also update related canonical versioned scores if explicitly requested; that would require separate scope/approval.

| Competition | Fixtures / minimum requests | Expected existing stat rows |
|---|---:|---:|
| ENG | 50 | 2000 |
| ESP | 69 | 3147 |
| FRA | 45 | 1794 |
| GER | 36 | 1442 |
| ITA | 50 | 2399 |
| UCL | 17 | 467 |
| UEFA_NL | 84 | 1447 |
| UEL | 13 | 271 |

Both request and affected-row estimates exceed100. **No operation was executed. Explicit separate approval is required before any such backfill.** Provider polling, partial reruns, quota metadata and unmatched new players may make actual request/row scope differ. A smaller authorized representative sample could inform coverage without this full-history backfill; none was requested in this pass.

## 30. Proposed activation procedure — NOT EXECUTED

1. Review table, new-negative rules, whole-fixture clean sheets and incomplete-calibration caveats. Establish uniform advanced-field coverage using explicitly authorized data and full V4 recalibration; do not enable inconsistent categories by assumption.
2. Separately approve/apply dormant migration; deploy reviewed version-aware app/ingestion. Verify existing V3 round/model/result reads. Capture future rich statistics naturally without rewriting history.
3. Choose a **futureTuesday00UTC boundary at or after every already-created round's ends_at**, using fresh actual round data. Existing next/upcomingV3 rounds finishV3. No fixed date is hardcoded here.
4. Explicitly approve and insert a future V4 activation policy using authorized service/operator tooling. Never UPDATE an existing round version.
5. When new rounds are created with starts_at>=boundary, trigger pinsV4; earlier/already-created rounds stayV3. All later newly-created rounds use the policy until an explicit future change.
6. Verify real V4 snapshot completeness, canonical model rows, aggregation, Game Rules and inspector. Catalog/market scoring remainsV3 in this pass: decide its eventual display transition explicitly; simply activating round policy does not silently retag season totals.

Manual scoring tools require explicit `--version ELEVEN_STANDARD_Vn`; no default-to-newest backfill exists. These tools were **not run against production**.

## 31. Tests

Full unit suite: **715 total / 611 passed / 104 guarded integration skips / 0 failures**. Focused V4/V3/V2 scoring, versioning, pipeline, adapter, data-access and UI regression suite: **202 passed / 0 failed**. Integration skips retain repository production guards.

Exact-migration embeddedPostgres, network-free actual-engine query recorders, adapter→actual storage-row→real backfill tests and offline actual-component rendering were used. This does not replace a separate dedicated local-Supabase integration run before production release; no production credentials or integration guard bypass was used.

A stored-data regression compared current V3 with baseline V3 for 14,195 inputs under three own-side contexts (null/0/2), **42,585 comparisons, 0 differences**. A broader check then evaluated every stored input across all four positions and those three contexts for V1, V2 and V3: **170,340 comparisons per version; 511,020 total; zero differences** against the original V1 and starting-commit V2/V3 implementations. Legacy scorer golden cases coverV1/V2/V3; originalV3 tests remain. New pure tests exercise every configured statistic×all 4 positions, zero/null/missing, stacking, minute/clean-sheet boundaries, negatives and deterministic exact-unit totals.

## 32. Typecheck / lint / build / UI

Typecheck passed. Lint: 0 errors, 1 pre-existing player-avatar `<img>` warning. Production build passed. `git diff --check` passed. Offline desktop/mobile probes passed with 0 outbound requests and0 runtime exceptions.

Offline browser probes at375/1440 verify actualV4 rules/breakdown, exact total, signed values and no horizontal overflow/runtime errors/network requests. Performance Pass2 probes verify immediate swaps, duplicate-submit protection, deterministic rollback, stable canonical confirmation and retained inspector state. Production build used loopback dummy Supabase config and blank private/provider keys; it does not validate deployed PostgREST or authenticated production behavior.

## 33. Provider request count

**0 API-Football/provider API requests**. Public documentation browsing only; no authenticated/quota-consuming provider endpoints. Local browser probes block all outbound requests.

## 34. Production mutations / repository state

**0 production mutations.** Calibration used read-only SELECTs only. Migration not applied;V4 not active;active round untouched;no production recomputation/backfill;no commit,push or deploy. Local intentional implementation/tests/docs are uncommitted. HEAD remains the startingbaseline. No unrelated changes or package/lockfile changes.

## 35. Remaining risks

- **HIGH — coverage/fairness and incomplete full-model calibration:** required new events have no stored history. Unequal feed population can bias competitions. Do not activate before evidence/model decision. Duels balance, keeper-save farming and wasteful-shot volume cannot be resolved with current partial rows.
- **MEDIUM — rollout coupling:** code requires new columns/triggers; release must sequence dormant migration before application. Embedded migration tests cannot prove all deployed Supabase privileges/defaults/extensions; separate migration safety review and isolated full-schema rehearsal required.
- **MEDIUM — historical initial pinning:** defaultV3 reflects this baseline's global authoritative round model. Other installations with actualV1/V2 rounds require audited mapping; legacy null/position/team provenance remains irrecoverable. V4 preserves new snapshots/position/side rather than claiming past reconstruction.
- **MEDIUM — keeper/clean-sheet balance:** appearance-only partial GK mean7.95 vsV3 6.14; clean sheet + full match = 10 before saves. Whole-fixture clean sheet is deterministic but differs from on-pitch concession policy. This is deliberate and visible.
- **MEDIUM — new negative/correlated rules:** saved penalty+save and penalty won+foul drawn are intentional; foul −0.25/missed penalty −3 require rule approval and full-data evaluation.
- **LOW — pass-accuracy uncertainty:** safely omitted; raw field preserved for evidence. UnsupportedFFSL/BMI fields omitted, not proxied.
- **LOW — active/catalog version difference after eventual activation:** round-based scores are pinned, catalog remainsV3 until separate explicit display decision. This must be communicated at activation review.

No production risk is introduced by the current uncommitted inactive local state; these are review/release risks.

## 36. Final status

**READY FOR V4 REVIEW WITH CAVEATS**

Implemented and validated locally for review. **Not approved for migration application, release or V4 activation.** Full rich-stat calibration and competition-coverage evidence remain activation prerequisites. Stop after this report.
