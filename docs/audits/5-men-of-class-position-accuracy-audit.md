# Position Accuracy & Squad Impact Audit — 5 Men of Class

Pass 2. Generated 2026-10-09T15:27:21.402Z.

Source draft snapshot: `5-men-of-class-draft-snapshot-2026-10-09.json` (SHA-256: `0fdbd65851c15c48c72753130c9ea5bbcba801910881df9b2b9332737b71e2b9`).

Authoritative source: `draft_picks` table (not current roster/ownership state). Integrity: 80/80 selections, 0 issues found.

## Methodology

API-Football's only position field is a broad GK/DEF/MID/FWD-equivalent bucket; no detailed role (CB/LB/CDM/...) is ingested anywhere in Eleven today, and `/fixtures/lineups` (the one endpoint that could carry finer grid/formation detail) has never been called -- this pass did not call it either; see "Unresolved" section below for what a minimal, approved check would look like.

What already exists, at zero additional provider cost: Eleven stores a second, independent broad-bucket signal per real match appearance (`football_provider_snapshots`, endpoint `/fixtures/players`, field `statistics[].games.position`, coded G/D/M/F). This pass cross-checked all 80 drafted players' season-aggregate bucket (`players.position`) against the majority of their own already-ingested match-appearance codes. This can surface genuine disagreements using real match data Eleven already has -- it cannot produce a detailed sub-position.

Confidence labels follow the approved framework, applied conservatively: a disagreement is **LIKELY** only with 5 or more logged appearances AND a 70% or greater majority share; smaller or closer splits are **AMBIGUOUS**; fewer than 3 appearances is **INSUFFICIENT_EVIDENCE**. Nothing reaches **CONFIRMED** from this evidence alone -- per the brief, only an approved manual override or genuinely detailed evidence (neither available today) can reach that tier. No player's position was changed. No correction was auto-applied.

## Summary

- 80/80 players reviewed.
- 75 agree between the two already-stored evidence sources -- no action.
- 1 flagged **LIKELY** (recommend manual-override review): M. Guéhi.
- 3 flagged **AMBIGUOUS** (recommend holding, more match data needed): M. Rogers, Pedro Porro, A. Amaimouni.
- 1 player had zero stored match-appearance evidence (INSUFFICIENT_EVIDENCE, existing classification preserved by default per precedence tier 3).

## Flagged players (detail)

| Player | Team | Club | Current position | Evidence | Confidence | Action |
|---|---|---|---|---|---|---|
| M. Rogers | Expected Toulouse FC | Chelsea | FWD | DISAGREES: majority MID ({"M":5,"F":4}) | AMBIGUOUS | Hold -- insufficient consensus to recommend |
| M. Guéhi | Pressure FC | Manchester City | MID | DISAGREES: majority DEF ({"D":9,"M":1}) | LIKELY | Candidate for manual-override review (not auto-applied) |
| A. Areola | Phantom FC | West Ham | GK | No match-appearance evidence stored | INSUFFICIENT_EVIDENCE | Preserve existing classification |
| Pedro Porro | 75Hard | Tottenham | MID | DISAGREES: majority DEF ({"M":1,"D":2}) | AMBIGUOUS | Hold -- insufficient consensus to recommend |
| A. Amaimouni | 2 Goals 1 Cup | Eintracht Frankfurt | MID | DISAGREES: majority FWD ({"M":1,"F":3}) | AMBIGUOUS | Hold -- insufficient consensus to recommend |

## All 80 drafted players

| Pick | Team | Player | Club | Original position | Match-evidence status | Confidence |
|---|---|---|---|---|---|---|
| 1 | Phantom FC | M. Olise | Bayern München | MID | Match evidence agrees ({"F":2,"M":7}) | N/A (no correction candidate) |
| 2 | Pressure FC | Raphinha | Barcelona | FWD | Match evidence agrees ({"F":8}) | N/A (no correction candidate) |
| 3 | 75Hard | Lamine Yamal | Barcelona | FWD | Match evidence agrees ({"M":4,"F":8}) | N/A (no correction candidate) |
| 4 | Expected Toulouse FC | Kylian Mbappé | Real Madrid | FWD | Match evidence agrees ({"F":9}) | N/A (no correction candidate) |
| 5 | 2 Goals 1 Cup | E. Haaland | Manchester City | FWD | Match evidence agrees ({"F":10}) | N/A (no correction candidate) |
| 6 | 2 Goals 1 Cup | J. Bellingham | Real Madrid | MID | Match evidence agrees ({"M":12}) | N/A (no correction candidate) |
| 7 | Expected Toulouse FC | H. Kane | Bayern München | FWD | Match evidence agrees ({"F":9}) | N/A (no correction candidate) |
| 8 | 75Hard | O. Dembélé | Paris Saint Germain | FWD | Match evidence agrees ({"F":9}) | N/A (no correction candidate) |
| 9 | Pressure FC | L. Díaz | Bayern München | MID | Match evidence agrees ({"M":4,"F":1}) | N/A (no correction candidate) |
| 10 | Phantom FC | Nuno Mendes | Paris Saint Germain | DEF | Match evidence agrees ({"D":7}) | N/A (no correction candidate) |
| 11 | Phantom FC | João Cancelo | Barcelona | DEF | Match evidence agrees ({"D":12}) | N/A (no correction candidate) |
| 12 | Pressure FC | Joan García | Barcelona | GK | Match evidence agrees ({"G":7}) | N/A (no correction candidate) |
| 13 | 75Hard | Pau Cubarsí Paredes | Barcelona | DEF | Match evidence agrees ({"D":11}) | N/A (no correction candidate) |
| 14 | Expected Toulouse FC | M. Ødegaard | Arsenal | MID | Match evidence agrees ({"M":10}) | N/A (no correction candidate) |
| 15 | 2 Goals 1 Cup | B. Saka | Arsenal | MID | Match evidence agrees ({"M":9,"F":1}) | N/A (no correction candidate) |
| 16 | 2 Goals 1 Cup | J. Oblak | Atletico Madrid | GK | Match evidence agrees ({"G":12}) | N/A (no correction candidate) |
| 17 | Expected Toulouse FC | C. Palmer | Chelsea | FWD | Match evidence agrees ({"F":4,"M":1}) | N/A (no correction candidate) |
| 18 | 75Hard | Bruno Fernandes | Manchester United | MID | Match evidence agrees ({"M":9}) | N/A (no correction candidate) |
| 19 | Pressure FC | D. Upamecano | Bayern München | DEF | Match evidence agrees ({"D":8}) | N/A (no correction candidate) |
| 20 | Phantom FC | E. Fernández | Manchester City | MID | Match evidence agrees ({"M":5}) | N/A (no correction candidate) |
| 21 | Phantom FC | Vitinha | Paris Saint Germain | MID | Match evidence agrees ({"M":10}) | N/A (no correction candidate) |
| 22 | Pressure FC | K. Kvaratskhelia | Paris Saint Germain | FWD | Match evidence agrees ({"F":9,"M":1}) | N/A (no correction candidate) |
| 23 | 75Hard | A. Hakimi | Paris Saint Germain | DEF | Match evidence agrees ({"D":6}) | N/A (no correction candidate) |
| 24 | Expected Toulouse FC | R. Cherki | Manchester City | MID | Match evidence agrees ({"M":10}) | N/A (no correction candidate) |
| 25 | 2 Goals 1 Cup | V. van Dijk | Liverpool | DEF | Match evidence agrees ({"D":10}) | N/A (no correction candidate) |
| 26 | 2 Goals 1 Cup | K. Adeyemi | Barcelona | FWD | Match evidence agrees ({"M":3,"F":7}) | N/A (no correction candidate) |
| 27 | Expected Toulouse FC | M. Rogers | Chelsea | FWD | DISAGREES: majority MID ({"M":5,"F":4}) | AMBIGUOUS |
| 28 | 75Hard | T. Courtois | Real Madrid | GK | Match evidence agrees ({"G":8}) | N/A (no correction candidate) |
| 29 | Pressure FC | Vinícius Júnior | Real Madrid | MID | Match evidence agrees ({"M":8}) | N/A (no correction candidate) |
| 30 | Phantom FC | J. Kimmich | Bayern München | MID | Match evidence agrees ({"M":7}) | N/A (no correction candidate) |
| 31 | Phantom FC | A. Gordon | Barcelona | FWD | Match evidence agrees ({"M":4,"F":8}) | N/A (no correction candidate) |
| 32 | Pressure FC | D. Szoboszlai | Liverpool | MID | Match evidence agrees ({"M":10}) | N/A (no correction candidate) |
| 33 | 75Hard | F. Valverde | Real Madrid | MID | Match evidence agrees ({"M":8}) | N/A (no correction candidate) |
| 34 | Expected Toulouse FC | D. Rice | Arsenal | MID | Match evidence agrees ({"M":6}) | N/A (no correction candidate) |
| 35 | 2 Goals 1 Cup | K. De Bruyne | Napoli | MID | Match evidence agrees ({"M":9}) | N/A (no correction candidate) |
| 36 | 2 Goals 1 Cup | Dani Olmo | Barcelona | MID | Match evidence agrees ({"M":12}) | N/A (no correction candidate) |
| 37 | Expected Toulouse FC | Gabriel Magalhães | Arsenal | DEF | Match evidence agrees ({"D":6}) | N/A (no correction candidate) |
| 38 | 75Hard | A. Mac Allister | Liverpool | MID | Match evidence agrees ({"M":6}) | N/A (no correction candidate) |
| 39 | Pressure FC | D. Doué | Paris Saint Germain | FWD | Match evidence agrees ({"F":10}) | N/A (no correction candidate) |
| 40 | Phantom FC | Ferran Torres | Paris Saint Germain | FWD | Match evidence agrees ({"F":8}) | N/A (no correction candidate) |
| 41 | Phantom FC | Unai Simón | Athletic Club | GK | Match evidence agrees ({"G":10}) | N/A (no correction candidate) |
| 42 | Pressure FC | M. Guéhi | Manchester City | MID | DISAGREES: majority DEF ({"D":9,"M":1}) | LIKELY |
| 43 | 75Hard | Lautaro Martínez | Inter | FWD | Match evidence agrees ({"F":6}) | N/A (no correction candidate) |
| 44 | Expected Toulouse FC | P. Groß | Brighton | MID | Match evidence agrees ({"M":5}) | N/A (no correction candidate) |
| 45 | 2 Goals 1 Cup | Rúben Dias | Manchester City | DEF | Match evidence agrees ({"D":10}) | N/A (no correction candidate) |
| 46 | 2 Goals 1 Cup | J. Koundé | Barcelona | DEF | Match evidence agrees ({"D":12}) | N/A (no correction candidate) |
| 47 | Expected Toulouse FC | T. Alexander-Arnold | Real Madrid | DEF | Match evidence agrees ({"D":11,"M":1}) | N/A (no correction candidate) |
| 48 | 75Hard | A. Bastoni | Inter | DEF | Match evidence agrees ({"D":9}) | N/A (no correction candidate) |
| 49 | Pressure FC | Aymeric Laporte | Athletic Club | DEF | Match evidence agrees ({"D":10}) | N/A (no correction candidate) |
| 50 | Phantom FC | Marquinhos | Paris Saint Germain | DEF | Match evidence agrees ({"D":6}) | N/A (no correction candidate) |
| 51 | Phantom FC | Álex Grimaldo | Atletico Madrid | DEF | Match evidence agrees ({"D":9,"M":1}) | N/A (no correction candidate) |
| 52 | Pressure FC | M. Akanji | Inter | DEF | Match evidence agrees ({"D":10}) | N/A (no correction candidate) |
| 53 | 75Hard | N. Paz | Como | MID | Match evidence agrees ({"M":6}) | N/A (no correction candidate) |
| 54 | Expected Toulouse FC | J. Gvardiol | Manchester City | DEF | Match evidence agrees ({"D":10}) | N/A (no correction candidate) |
| 55 | 2 Goals 1 Cup | J. Timber | Arsenal | DEF | Match evidence agrees ({"D":5}) | N/A (no correction candidate) |
| 56 | 2 Goals 1 Cup | G. Donnarumma | Manchester City | GK | Match evidence agrees ({"G":10}) | N/A (no correction candidate) |
| 57 | Expected Toulouse FC | J. Tah | Bayern München | DEF | Match evidence agrees ({"D":7}) | N/A (no correction candidate) |
| 58 | 75Hard | M. Caicedo | Chelsea | MID | Match evidence agrees ({"M":1}) | N/A (no correction candidate) |
| 59 | Pressure FC | Lisandro Martínez | Manchester United | DEF | Match evidence agrees ({"D":6}) | N/A (no correction candidate) |
| 60 | Phantom FC | A. Areola | West Ham | GK | No match-appearance evidence stored | INSUFFICIENT_EVIDENCE |
| 61 | Phantom FC | Álex Baena | Atletico Madrid | MID | Match evidence agrees ({"M":7,"F":5}) | N/A (no correction candidate) |
| 62 | Pressure FC | J. Pickford | Everton | GK | Match evidence agrees ({"G":9}) | N/A (no correction candidate) |
| 63 | 75Hard | Pedro Porro | Tottenham | MID | DISAGREES: majority DEF ({"M":1,"D":2}) | AMBIGUOUS |
| 64 | Expected Toulouse FC | K. Tzolakis | Hull City | GK | Match evidence agrees ({"G":9}) | N/A (no correction candidate) |
| 65 | 2 Goals 1 Cup | A. Abdi | Nice | DEF | Match evidence agrees ({"D":3}) | N/A (no correction candidate) |
| 66 | 2 Goals 1 Cup | D. Hancko | Atletico Madrid | DEF | Match evidence agrees ({"D":12}) | N/A (no correction candidate) |
| 67 | Expected Toulouse FC | M. Svilar | AS Roma | GK | Match evidence agrees ({"G":6}) | N/A (no correction candidate) |
| 68 | 75Hard | W. Pacho | Paris Saint Germain | DEF | Match evidence agrees ({"D":6}) | N/A (no correction candidate) |
| 69 | Pressure FC | Fermín | Barcelona | MID | Match evidence agrees ({"M":12}) | N/A (no correction candidate) |
| 70 | Phantom FC | A. Isak | Liverpool | FWD | Match evidence agrees ({"F":7}) | N/A (no correction candidate) |
| 71 | Phantom FC | Gonçalo Ramos | AC Milan | FWD | Match evidence agrees ({"F":10}) | N/A (no correction candidate) |
| 72 | Pressure FC | A. Güler | Real Madrid | MID | Match evidence agrees ({"F":3,"M":7}) | N/A (no correction candidate) |
| 73 | 75Hard | D. Huijsen | Real Madrid | DEF | Match evidence agrees ({"D":12}) | N/A (no correction candidate) |
| 74 | Expected Toulouse FC | M. Belloumi | Hull City | MID | Match evidence agrees ({"F":1,"M":6}) | N/A (no correction candidate) |
| 75 | 2 Goals 1 Cup | A. Akarakiri | Cagliari | MID | Match evidence agrees ({"M":3}) | N/A (no correction candidate) |
| 76 | 2 Goals 1 Cup | A. Amaimouni | Eintracht Frankfurt | MID | DISAGREES: majority FWD ({"M":1,"F":3}) | AMBIGUOUS |
| 77 | Expected Toulouse FC | L. Hall | Newcastle | DEF | Match evidence agrees ({"D":9}) | N/A (no correction candidate) |
| 78 | 75Hard | David Raya | Arsenal | GK | Match evidence agrees ({"G":10}) | N/A (no correction candidate) |
| 79 | Pressure FC | S. Guirassy | Borussia Dortmund | FWD | Match evidence agrees ({"F":7}) | N/A (no correction candidate) |
| 80 | Phantom FC | Rodri | Barcelona | MID | Match evidence agrees ({"M":11}) | N/A (no correction candidate) |

## Squad-by-squad 4-3-3 feasibility (original positions, no corrections applied)

4-3-3 requires at least: GK 1, DEF 4, MID 3, FWD 3 (11 starters from a 16-player squad; bench unchanged at 5).

| Team | GK | DEF | MID | FWD | Total | 4-4-2 feasible | 4-3-3 feasible | Shortfall |
|---|---|---|---|---|---|---|---|---|
| Phantom FC | 2 | 4 | 6 | 4 | 16 | yes | yes | none |
| Pressure FC | 2 | 4 | 6 | 4 | 16 | yes | yes | none |
| 75Hard | 2 | 5 | 6 | 3 | 16 | yes | yes | none |
| Expected Toulouse FC | 2 | 5 | 5 | 4 | 16 | yes | yes | none |
| 2 Goals 1 Cup | 2 | 6 | 6 | 2 | 16 | yes | **NO** | FWD short by 1 |

**2 Goals 1 Cup** cannot field a legal 4-3-3 under current positions (2 FWD, needs 3). Notably, this team also owns **A. Amaimouni**, flagged above as AMBIGUOUS/candidate-FWD (3 of 4 logged match appearances as F, provider bucket currently MID). If that specific correction is reviewed and approved, it would resolve this team's shortfall without any roster transaction -- but the evidence sample (4 appearances) is too small to recommend auto-applying it, and it must not be fast-tracked merely because it is structurally convenient.

## Unresolved classifications requiring a decision

- M. Guéhi (LIKELY DEF, 9/10): recommend product-owner review and, if approved, a manual override -- not an automatic write.
- M. Rogers, Pedro Porro, A. Amaimouni (AMBIGUOUS): recommend holding. More logged match appearances (which accrue automatically as the season continues, zero new API cost) would raise or lower confidence without any code change.
- Whether to request a small, explicitly-approved live check against `/fixtures/lineups` for these 4 players specifically, to see if grid/formation data exists and is reliable enough to add detailed-role evidence. Not yet requested or executed.

