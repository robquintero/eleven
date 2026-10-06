# Eleven — Fantasy Round Calendar Analysis (Pass 10)

This is the original evidence for Eleven's Tuesday → Monday start day.
The midnight candidates and dataset counts below are historical analysis,
not the current hour-of-day policy. The product now rolls over at fixed
Tuesday 06:00 UTC, end exclusive at the next Tuesday 06:00 UTC.
The brief was explicit: do not assume Wednesday → Tuesday just because it
had been discussed informally — evaluate it against the real, stored
2026/27 fixture calendar the same as every other candidate. The
conclusion below **is** Tuesday → Monday, but arrived at empirically, and
it is not the boundary that was floated going in.

## Method

All 907 stored `fixtures` rows for `season = 2026` across all seven
scoring competitions (ENG/ESP/GER/ITA/FRA + UCL + UEL) were bucketed
under four candidate 7-day windows, each anchored to a different start
day-of-week (all times UTC, matching `fixtures.kickoff_at`'s storage
format):

| Candidate | Window |
|---|---|
| `MON_SUN` | Monday 00:00 → the following Sunday 23:59:59 |
| `TUE_MON` | Tuesday 00:00 → the following Monday 23:59:59 |
| `WED_TUE` | Wednesday 00:00 → the following Tuesday 23:59:59 |
| `THU_WED` | Thursday 00:00 → the following Wednesday 23:59:59 |

Two concrete, measurable defects were checked for, rather than a vague
"which feels right":

1. **Domestic weekend splitting** — does a boundary ever fall inside a
   real domestic weekend block (Fri/Sat/Sun/Mon, the shape the actual
   data shows Big Five fixtures cluster into — see "Raw kickoff
   distribution" below), separating fixtures that are obviously the same
   round of the same competition into two different Eleven rounds?
2. **UEFA matchday splitting** — UCL and UEL matchdays routinely spread
   across two consecutive nights (Tue+Wed for UCL, Wed+Thu for UEL) that
   are still the *same* matchday number. Does a boundary fall between
   those two nights and split one matchday's fixtures into two different
   Eleven rounds?

For each candidate, every real domestic weekend cluster (18 found) and
every real UEFA midweek cluster (7 found) in the stored data was checked
against that boundary.

## Raw kickoff distribution (why Fri–Mon / Tue–Thu is the real shape)

```
ENG: Fri 8, Sat 109, Sun 45, Mon 7, Wed 17, Tue 3   (Wed/Tue = rearranged fixtures)
ESP: Fri 8, Sat 27,  Sun 114, Mon 10, Wed 6, Thu 6, Tue 4
GER: Fri 11, Sat 93, Sun 22
ITA: Sat 39, Sun 87, Mon 17, Fri 7, Tue 3, Wed 5, Thu 2
FRA: Fri 14, Sat 74, Sun 45, Thu 1
UCL: Tue 51, Wed 51, Thu 6
UEL: Wed 9, Thu 99
```

Every kickoff in the entire stored season falls between UTC 10:00 and
UTC 20:xx — there are zero fixtures within 3 hours of a UTC midnight
boundary under any of the four candidates. Timezone-edge nondeterminism
(the brief's "fixtures near midnight/date boundaries" concern) is not a
live risk for this dataset under a UTC-anchored boundary.

## Results

| Candidate | Domestic weekends split | UEFA matchdays split |
|---|---|---|
| `MON_SUN` | 9 / 18 | 0 / 7 |
| **`TUE_MON`** | **0 / 18** | **0 / 7** |
| `WED_TUE` | 0 / 18 | 6 / 7 |
| `THU_WED` | 0 / 18 | 7 / 7 |

**`TUE_MON` is the only candidate with zero splits on both measures.**
The mechanism is straightforward once you look at the actual shape of a
football week: the real rhythm is *European midweek (Tue/Wed/Thu) →
domestic weekend it precedes (Fri/Sat/Sun/Mon)*. A boundary anchored to
Tuesday keeps that entire natural unit — the midweek European leg,
whichever of Tue/Wed/Thu it happens to land on, followed by the weekend
it precedes — inside one round:

- `MON_SUN` cuts between Sunday and Monday, which sits *inside* the
  domestic weekend block (Monday Night Football fixtures get separated
  from the Fri/Sat/Sun fixtures of the same real weekend) — hence 9/18
  weekends split.
- `WED_TUE` and `THU_WED` both preserve the weekend perfectly (their
  window always contains the full Fri–Mon span), but their boundary falls
  *between* a UCL/UEL matchday's two nights (Tue/Wed, or Wed/Thu),
  splitting a single matchday's fixtures into two different Eleven
  rounds — 6/7 and 7/7 respectively.
- `TUE_MON`'s boundary falls in the one genuinely quiet part of the
  week — between Monday's last domestic fixture and Tuesday's first
  European one — where it cuts nothing.

**Conclusion: Wednesday → Tuesday, the boundary informally discussed
before this analysis, is empirically one of the two worst options** for
UEFA-matchday cohesion. Eleven uses **Tuesday → Monday** instead.

## Round-size distribution (evidence for "unusually sparse/dense rounds")

Bucketing the full season under `TUE_MON` (anchor: Tuesday 2026-08-11
00:00 UTC) produces this real shape:

```
round 0:  5 fixtures   (partial — season openers only, ESP Super Cup week)
round 1:  40            round 2:  52            round 3:  49
round 4:  66 (UCL starts)         round 5:  74 (UEL starts)
round 6:  0 fixtures   ← international break (no club football at all)
round 7:  0 fixtures   ← international break
round 8:  48
round 9:  84 (UCL+UEL)            round 10: 85 (UCL+UEL)
round 11: 58
round 12: 84 (UCL+UEL)
round 13: 0 fixtures   ← international break
round 14: 48
round 15: 84 (UCL+UEL)
round 16: 58
round 17: 84 (UCL+UEL)
round 18: 39            round 19: 10 (partial — holiday fixture backlog)
round 20: 32
```

Three calendar weeks in the stored season have **zero** eligible
fixtures across all seven competitions — genuine international breaks,
not a bug in the boundary. **Eleven's round numbering skips these weeks
entirely** rather than generating an empty round that could only ever
produce a manufactured 0–0 draw for every matchup — see `docs/game-rules.md`
"Round generation" for the exact rule. This keeps "Round 6" meaning
"the 6th real Eleven fantasy round," not "the 6th calendar week of the
season," which is also friendlier to a full-season simulation (no wasted
rounds).

The high end (84–85 fixtures, weeks with a full Big Five slate plus both
UCL and UEL) and the low end (0, international breaks — skipped; 5–10,
season-opening/holiday partial weeks — kept, since real football
happened) are both explained by the real calendar, not a defect in the
chosen boundary.

## Canonical timezone

**UTC.** `fixtures.kickoff_at` is already stored in UTC, every round
boundary comparison happens in UTC, and — confirmed above — zero
fixtures in the real dataset fall close enough to a UTC midnight for the
choice of timezone to change which round a fixture lands in. A
CET-anchored boundary (the "home" timezone of most of these
competitions) was considered and rejected: it buys no correctness benefit
this data can demonstrate, while introducing a real one — CET/CEST's
October DST transition falls inside the 2026/27 season, which would make
"midnight CET" an ambiguous instant twice a year for no benefit. UTC
round-boundary math has no DST to reason about.

This is a boundary-math choice only — individual kickoff times are still
formatted for display in the viewer's own local time via the existing
`formatKickoff`/`formatKickoffTime` helpers, unchanged. **The same
fixture always resolves to the same Eleven round for every user,
everywhere, because round assignment is computed once, in UTC, from the
fixture's own stored `kickoff_at` — never from anything client-local.**

## Chosen boundary

**Tuesday → Monday, rolling over Tuesday 06:00 UTC.** Windows are
`[Tuesday 06:00 UTC, next Tuesday 06:00 UTC)`, independent of DST.
The original midnight comparison above chose the day; the later product
decision deliberately chose 06:00 UTC for U.S. Tuesday-morning readiness.

See `docs/game-rules.md` for how this boundary is implemented
(`src/domain/fantasy/round-calendar.ts`), how fixtures are deterministically
assigned to a round, and how postponements/reschedules are handled without
retroactively changing a finalized round.
