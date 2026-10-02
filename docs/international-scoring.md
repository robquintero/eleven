# Pass 14 — International Football Scoring

This document is the Phase 1-5 audit + design record for Pass 14, written
*before* any implementation, per the brief's own "do not implement until
this audit is complete" instruction for both Phase 1 and Phase 2. See
`docs/football-data-system.md` for the pipeline this extends and
`docs/game-rules.md`/`docs/data-flow.md` for the existing round/locking
semantics this must preserve exactly.

## 1. Architecture findings (Phase 1)

Traced the full pipeline (API-Football → competition config → ingestion →
`player_match_stats` → scoring → `fantasy_player_scores` → round evidence
→ locking → matchup aggregation → UI) against the actual current code,
not assumptions. Findings, in the order the brief's audit checklist asks:

1. **Competition representation**: `competitions` (one row per league,
   `code` unique), `clubs.competition_id` (NOT NULL FK), `fixtures.
   competition_id` (NOT NULL FK). Big Five + UCL/UEL config lives in two
   separate files (`big-five-competitions.ts`, `uefa-competitions.ts`),
   deliberately kept apart because only Big Five gates the draftable pool.
2. **Provider ID mapping**: `provider_mappings` (provider,
   internal_entity_type, internal_entity_id, external_id) is the only
   place a provider ID appears, for all four entity types (competition,
   club, player, fixture). Competitions/clubs have a natural key and are
   upserted by it; players/fixtures have none and are resolved purely
   through this table via `reconcile.ts`'s `planReconciliation()`.
3. **Fixture eligibility today**: there is **no competition-id filter
   anywhere in the scoring/round pipeline**. `getEligibleFixtureIds`
   (`src/lib/fantasy-engine/round-eligibility.ts`) is a pure date-range
   query (`kickoff_at` between the round's Tue→Mon bounds), full stop.
   Eligibility today is enforced entirely by *what gets ingested* — only
   Big Five + UCL/UEL fixtures exist in the table at all, so nothing else
   can be summed. This means Pass 14 must be equally disciplined about
   what it ingests, since nothing downstream will catch a mistake.
4. **Player-performance association**: `player_match_stats` keyed
   `(player_id, fixture_id)`, written by `sync-fixture-stats.ts`, which
   resolves `player_id` **only** via `provider_mappings` and silently
   skips (never fabricates) any player it can't resolve. This function
   touches no player-identity column at all — confirmed safe to reuse
   unmodified for international fixtures (see §7 below).
5. **Provider player ID stability across club/country**: **confirmed
   empirically against the live provider and our own live database**,
   not just inferred from code. API-Football's `player.id` is a single,
   global, per-real-person field — `/players?team=` returns it the same
   way whether `team` is a club or (per `team.national: true`) a national
   team. Verified: Kylian Mbappé's existing Eleven row (Real Madrid,
   `6426fa47-5f20-4c9d-a1a2-f1740d9c0f7a`) already maps to
   `provider_mappings.external_id = '278'`; querying France's national
   team roster (`GET /players?team=2&season=2026`) returns Mbappé with
   `player.id: 278` — the exact same id. One real person, one stable
   provider id, confirmed live.
6. **Club-identity assumption in code**: **yes, pervasively** — the
   single biggest finding of this audit. Every "what fixture does this
   player have" query in the codebase joins on `players.club_id`
   directly:
   - `src/lib/fantasy-engine/lineup.ts:66-72` (`createRoundLineupSlots`,
     the function that computes and stores `lineup_slots.locked_at`)
   - `src/data-access/players.ts:505-510` (`getNextFixtureByClub`, feeds
     `Player.fixture` everywhere it's shown)
   - `src/data-access/matchups.ts:197-201` and `:471-476`
     (`getMatchupFixtureIntelligence` / recent-match lookups)

   All three build `clubIds` from `players.club_id` and then query
   `fixtures where home_club_id in (clubIds) or away_club_id in
   (clubIds)`. A fixture whose participants are national teams (not the
   player's own club) is **structurally invisible** to every one of
   these, not merely mislabeled.
7. **Fixture-intelligence club-only assumption**: confirmed, same root
   cause — `countStartersInFixture` (`src/lib/team-fixture.ts`, written
   in Pass 13) compares `player.club.shortName` against the fixture's
   home/away club short names, which can never match for an
   international fixture even for a player who IS playing in it.
8. **Round evidence scope**: `findNextEligibleWindow`/
   `getEligibleFixtureIds` (`round-eligibility.ts`) are generic — "any
   stored fixture in this date range," no competition_id or club
   restriction. Once international fixtures are ingested with real
   `kickoff_at` values, they participate in round-opening/evidence
   automatically, with zero changes needed there.
9. **Locking depends on club membership, not fixture participation**:
   confirmed, this is the same finding as #6 — `lineup.ts`'s lock
   computation is club_id-keyed, so a player whose only eligible match
   this round is international currently gets `locked_at = null` (never
   locks), and a player with both a club and an earlier international
   fixture would lock at the wrong (later, club-only) instant. **This is
   the one piece of existing logic that must change** — everything else
   (scoring engine, round aggregation, backfill idempotency) already
   generalizes for free.
10. **Backfill/duplication risk**: `sync-fixture-stats.ts` upserts on
    `(player_id, fixture_id)` — re-running it is already idempotent by
    construction. The scoring backfill (`src/lib/scoring/backfill.ts`)
    keys on `(player_id, fixture_id, scoring_rule_version)` — also
    already idempotent. No new duplication risk from repeated sync, as
    long as the new national-team-squad sync (§5 below) never creates a
    second player row (see §7's "confirmed safe" / "confirmed dangerous"
    split).

## 2. API-Football international competition findings (Phase 2)

Discovered live via `GET /leagues?search=<name>` (one request per search
term, 10 requests total, zero writes) — never guessed. Cross-checked the
player-identity claim above against real data rather than relying on
provider documentation alone.

### Exact competitions enabled (men's senior competitive)

| Brief's name | Provider `league.id` | Provider `league.name` |
|---|---|---|
| FIFA World Cup | **1** | World Cup |
| FIFA World Cup qualifying — Europe | **32** | World Cup - Qualification Europe |
| FIFA World Cup qualifying — Africa | **29** | World Cup - Qualification Africa |
| FIFA World Cup qualifying — Asia | **30** | World Cup - Qualification Asia |
| FIFA World Cup qualifying — CONCACAF | **31** | World Cup - Qualification CONCACAF |
| FIFA World Cup qualifying — South America (= CONMEBOL WC qualifying) | **34** | World Cup - Qualification South America |
| FIFA World Cup qualifying — Oceania (= OFC WC qualifying) | **33** | World Cup - Qualification Oceania |
| FIFA World Cup qualifying — Intercontinental Play-offs | **37** | World Cup - Qualification Intercontinental Play-offs |
| UEFA European Championship | **4** | Euro Championship |
| UEFA European Championship qualifying | **960** | Euro Championship - Qualification |
| UEFA Nations League | **5** | UEFA Nations League |
| Copa América | **9** | Copa America |
| Africa Cup of Nations | **6** | Africa Cup of Nations |
| AFCON qualifying | **36** | Africa Cup of Nations - Qualification |
| AFC Asian Cup | **7** | Asian Cup |
| AFC Asian Cup qualifying | **35** | Asian Cup - Qualification |
| CONCACAF Gold Cup | **22** | CONCACAF Gold Cup |
| CONCACAF Gold Cup qualifying | **858** | CONCACAF Gold Cup - Qualification |
| CONCACAF Nations League | **536** | CONCACAF Nations League |
| CONCACAF Nations League qualifying | **808** | CONCACAF Nations League - Qualification (stale — current season tag is 2018; included for correctness, likely dormant) |
| OFC Nations Cup | **806** | OFC Nations Cup |

All 15 competitions named explicitly in the brief resolved to an exact
provider id (CONMEBOL/CONCACAF/OFC World Cup qualifying are the same
confederation-qualifying ids already listed under "FIFA World Cup
qualifying"). Two additional stages were found and included under the
brief's own "equivalent official senior competitive qualification
stages" allowance: the WC intercontinental play-off (**37**) and Gold Cup
qualifying (**858**).

### Exact competitions excluded

Every sibling result returned by the same searches that is explicitly out
of scope, confirmed present in the provider's data (so exclusion is a
deliberate choice, not an oversight):

- **Friendlies — id 10** (`Friendlies`), plus `Friendlies Women` (666),
  `Friendlies Clubs` (667). This is the critical one: friendlies are a
  **wholly separate competition id** from every competitive tournament
  above, in every single search — never a "round" or "stage" inside a
  competitive competition's own id. This means exclusion needs **no
  round-name heuristic at all** (confirmed in §1 of the architecture
  audit that the existing `isQualifyingRound()` round-name regex doesn't
  generalize to friendly-detection) — a friendly fixture simply never
  gets ingested in the first place because its competition id is never
  configured/enabled.
- **FIFA Club World Cup (15)** and its Play-In (1186) — club competition,
  not international.
- **Youth**: World Cup U20 (490)/U17 (587)/U20 Women (920)/U17 Women
  (950), AFCON U20 (538), all Asian Cup U23/U20/U17 variants (532, 952,
  965, 1012, 1070, 1101, 1153, 1161).
- **Women's**: World Cup Women (8) + its qualifiers (927, 880), Copa
  America Femenina (926), AFCON Women (922), Asian Cup Women (897) +
  qualifying (894), Gold Cup Women (1057) + qualifying (1046), UEFA
  Nations League Women (1040).
- **Unofficial/exhibition**: "Kings World Cup Nations" (1213) — a TV
  exhibition tournament, not a FIFA-sanctioned competition.
- **Olympics**: not returned by any search above; confirmed separately
  not configured (brief explicitly excludes it regardless).

### Player/team identity confirmation

`GET /teams?league=1&season=2026` confirms every national team is a
normal `team` object with `team.national: true`, `team.code` (a real
3-letter code — `"FRA"`, `"BEL"`, `"CRO"`, directly usable as a club-style
`code`/`short_name`, never invented), and a stable `team.id` (France =
`2`) — the exact same shape `getTeams()` already returns for clubs, just
with `national: true` where a club's is `false`/absent. `player.id`
stability confirmed live in §1 item 5 above.

**`ApiFootballLeagueItem`/`ApiFootballTeamItem` types extended** in
`src/lib/football-providers/api-football/client.ts`/`types.ts` only as
far as this audit needed (`getLeagues` gained `search`/`country`/`type`
params; `national` will be added to `ApiFootballTeamItem` when the real
club-sync code reads it in Phase 6/4 implementation) — no other
speculative fields added, per this codebase's "declare only what's read"
convention.

## 3. Canonical competition eligibility (Phase 3 design)

Two classifications, kept explicitly separate (never let one imply the
other):

- **Draftable**: Big Five only. Unchanged — `players.competition_id` in
  the five Big Five competition ids. This pass does not touch it.
- **Scoring-eligible**: Big Five + UCL + UEL + the 20-competition
  international allowlist above. A fixture's `competition_id` being in
  this set is what makes a fixture's `player_match_stats` legitimately
  scoreable — enforced where fixtures/stats are actually ingested (since,
  per §1 item 3, nothing downstream re-checks it), plus one explicit,
  tested allowlist function as a second line of defense rather than
  relying on "we just never configure the wrong id" alone.

One new domain module, `src/domain/football/international-competitions.ts`
(config, mirrors `uefa-competitions.ts`'s shape exactly — `code`, `name`,
`providerLeagueId`, `providerSeason`, `enabled`) plus
`src/domain/football/competition-eligibility.ts` (pure, no I/O): exports
`isScoringEligibleCompetitionCode(code)` composed from the three existing
code unions (Big Five ∪ UEFA ∪ International) — one authoritative
definition, never a second hand-copied array in a cron job or a query.

## 4. National-team / fixture representation (Phase 4 design)

**Smallest clean extension, reusing the existing model exactly as the
brief asks.** `fixtures.home_club_id`/`away_club_id` are NOT NULL FKs to
`clubs` — there is no other way to represent a fixture's participants in
the current schema, and inventing a parallel `fixtures_v2`/polymorphic
participant table would be the "redesign the entire football schema"
the brief explicitly says not to do.

National teams become ordinary `clubs` rows — exactly the same pattern
already proven safe for non-Big-Five UEFA clubs (e.g. Sporting CP already
lives in `clubs` with a non-Big-Five `competition_id`, and is already
correctly invisible to the draftable pool purely because nothing queries
players by that `competition_id`). One new column makes the distinction
explicit rather than implicit (per the brief's "do NOT silently insert
national teams and pretend they are clubs without documenting... the
consequences"):

```sql
alter table public.clubs add column is_national_team boolean not null default false;
```

Populated directly from the provider's own `team.national` field — never
inferred. A national team's `competition_id` points at a new, single
`competitions` row (`code: 'INTL'`) used only as FK bookkeeping (which
competition's sync first discovered this club row — the same loose
meaning `competition_id` already has for a non-Big-Five UEFA club); the
REAL eligibility gate for any given fixture is the fixture's own
`competition_id` against the Phase 3 allowlist, never `clubs.
competition_id`. National teams are never fantasy teams, never draftable,
never owned — confirmed nothing in `league_player_ownership`/
`fantasy_teams` ever reads `clubs` at all, so no further schema guard is
needed there.

**Consequence requiring explicit handling** (flagged exactly because the
brief asks to document and validate consequences, not silently accept
them): any UI/query that lists `clubs` without a competition/draftability
filter (e.g. `getClubFilters()` on the Players page's "ALL competitions"
option) would start showing national teams as selectable "clubs" once
they exist as rows. Phase 12 must audit and fix every such unscoped
`clubs` read, not just add the column and hope.

## 5. Player reconciliation (Phase 5 design — the most important part)

**Confirmed safe primitive**: `sync-fixture-stats.ts` needs zero
modification to be pointed at international fixtures — it writes only to
`player_match_stats` keyed `(player_id, fixture_id)`, resolves `player_id`
exclusively via `provider_mappings`, and already hard-skips any
unresolved player rather than fabricating one. This one function is 90%
of "run international performances through the same pipeline."

**Confirmed dangerous primitive, never to be reused as-is**:
`sync-players.ts`'s update path unconditionally sets `club_id` to
whatever club context it's invoked with — calling it against a national
team's roster would silently overwrite every called-up player's canonical
club to their country. This function must never be pointed at a national
team.

**The missing piece**: nothing today associates a player with "which
national team(s) he might appear for" — correctly, since that's not
`players.club_id`'s job and must never become it. New table:

```sql
create table public.player_national_teams (
  player_id uuid not null references public.players (id) on delete cascade,
  national_team_club_id uuid not null references public.clubs (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (player_id, national_team_club_id)
);
```

A new, separate ingestion function (`sync-national-team-squad.ts` —
**not** a modified `sync-players.ts`) calls the exact same `getPlayers
({team, season})` endpoint already used for clubs, but for a national
team's provider `team.id`, and for every returned player: resolve via
`provider_mappings` (read-only — skip, never create, exactly like
`sync-fixture-stats.ts` already does for unmapped players), then upsert
into `player_national_teams`. It never writes to `players` at all. A
player can belong to at most one `player_national_teams` row realistically
at a time in practice (upserting on the primary key replaces the row if a
player's eligible nation ever changed); the schema doesn't need to forbid
more than one since nothing breaks if it happened.

This directly satisfies the brief's test list: accents/duplicate names
are irrelevant (identity is resolved by provider id, never by name);
"players changing clubs" is already proven safe (existing reconcile.ts
transfer test); "national-team appearance while club membership stays
unchanged" is exactly what this design guarantees structurally (the
write path that CAN change `club_id` is never invoked); a player with no
existing `provider_mappings` row (not yet known to Eleven at all) is
correctly skipped, never fabricated as a new "international-only" player
— this pass does not expand the player universe, only what a known
player can score from.

---

## 6. Fixture ingestion, player-fixture participation, and locking (implementation)

`sync-fixtures.ts`/`sync-fixture-stats.ts`/`sync-competitions.ts` needed
**zero modification** to work correctly for international competitions —
confirmed by code inspection, not assumption: all three are already
generic over `CompetitionSyncTarget` (`resolve-competition.ts` already
resolves international codes, Phase 3), write `fixtures.competition_id`
to whatever the REAL competition is (never the `INTL` bookkeeping
competition — that only ever appears on a national team's own
`clubs.competition_id`), and `sync-fixture-stats.ts` resolves player
identity exclusively via `provider_mappings`, confirmed safe in Phase 1.

The one real architectural gap (confirmed by the Phase 1 audit): every
"what fixture does this player have" query in the codebase joined on
`players.club_id` directly, structurally unable to find an international
fixture. New `src/lib/fantasy-engine/player-fixture-participation.ts` is
the single shared primitive now used everywhere that mattered:

- `getTeamIdsByPlayer` — a player's club_id plus any national-team
  membership(s), batched (2 queries total, never N+1).
- `getFixturesForTeamIds` — every scoring-eligible fixture (checked
  against `competition-eligibility.ts` as a defense-in-depth filter,
  even though nothing non-eligible should ever be ingested) for a set of
  team ids, optionally window/status-bounded.
- `getKickoffsByPlayer` — feeds `lineup.ts`'s `createRoundLineupSlots`
  lock computation; replaces the old club-id-only kickoff lookup.
  `computeLockInstant` (unchanged) already took "the earliest of however
  many kickoffs," so handing it a longer list needed no change there.
- `getNextFixtureByPlayer` — feeds the Players market and Player
  Inspector's "next fixture" display; carries the fixture's own real
  `homeLabel`/`awayLabel`, never re-derived from the player's permanent
  `club.shortName`.

Updated to use this shared primitive instead of their own club-id
queries: `lineup.ts` (locking), `data-access/players.ts`
(`getPlayerDatabase`'s next-fixture column, `getPlayerRecentMatches`,
`getPlayerLatestScoreBreakdown`), `data-access/matchups.ts`
(`getMatchupFixtureIntelligence`, `getMatchupSquads`). `PlayerFixture`
(`lib/types/fantasy.ts`) gained `homeLabel`/`awayLabel` fields so render
code (`player-inspector-content.tsx`, `next-lock.tsx`, `bench-row.tsx`)
stops splicing the player's own club onto the fixture's opponent to
build a "home — away" label. `countStartersInFixture`
(`lib/team-fixture.ts`) now compares real club/national-team IDs instead
of `club.shortName` string equality, via an optional
`teamIdsByPlayerId` map (falls back to the starter's own `club.id` when
omitted, preserving exact prior behavior for any caller not yet
updated).

**A second, independent instance of the same bug class was found and
fixed**: `src/lib/scoring/backfill.ts`'s clean-sheet computation
(`concededByOwnClub`) also compared `player.club_id` against a fixture's
home/away club id directly — meaning a player's international clean
sheet would silently never be credited (always resolving to `null`, no
clean-sheet points) even once stats were correctly ingested. Fixed the
same way: also check the player's national-team id(s)
(`player_national_teams`, batched-fetched once per backfill run, not
per player). `ELEVEN_STANDARD_V2`'s constants and `calculateFantasyScore`
itself are untouched — the function has zero awareness of club vs.
competition context by design (`ScoringInput` carries only raw stats +
position + `concededByOwnClub`), so once the INPUT is computed correctly
for an international fixture, scoring is provably identical to a club
performance with the same stat line.

Club-facing generic queries audited for national-team leakage (Phase
11/Step 11): only `getClubFilters()` (Players page's club filter
dropdown) needed an explicit `is_national_team = false` filter — every
other generic `clubs` read is either scoped by a specific fixture's own
home/away ids (where a national team is a legitimate, intended result)
or scoped by a real player's own `club_id` (which structurally never
resolves to a national team).

## 7. Sync/cron volume (Step 12/14)

`runLiveSyncTick`/`determineFixtureSyncCadence` needed **zero
modification**. Both are already fully fixture-driven and competition-
agnostic: the live-tick reads every non-settled stored fixture
regardless of competition, groups the ones needing attention by their
real `competitions.code`, and calls `resolveCompetition(code)` per
distinct competition — which already resolves international codes
(Phase 3). Cost scales with real fixture proximity/liveness, exactly as
it already did for Big Five + UEFA; expanding the competition universe
to ~27 configured competitions does not change this function's shape at
all.

**Expected request volume, reasoned from the existing design** (no live
international fixtures exist yet to measure against directly):

- **Normal day** (no international competitive fixtures near kickoff):
  unchanged from Pass 12D's existing, already-measured behavior (0
  requests on a quiet day; cost scales only with real Big Five/UEFA
  activity).
- **International window** (a FIFA match week — the ~6–8 weeks/year
  when qualifiers/tournaments are live): the dominant cost driver is
  `syncFixtureStats`, which re-syncs EVERY live/newly-final fixture on
  EVERY one-minute tick for as long as it stays live — this is the
  existing, already-proven-safe design for Big Five Saturday afternoons
  (5–10+ simultaneous top-5-league kickoffs are routine and already
  shown safe within the 7,500/day budget), now applied to a wider
  competition set. Worst-case reasoning: a dense international date
  (e.g. UEFA qualifiers) realistically clusters at most ~12–14
  simultaneous kickoffs per confederation per slot; even a pessimistic
  ~40–60 simultaneous live fixtures across all confederations sustained
  for a ~100-minute match, at 1 request/fixture/tick, is a similar order
  of magnitude to a busy Big Five Saturday's multi-league overlap, not a
  new category of cost.
- **Worst plausible day**: the existing `shouldStopForQuota` circuit
  breaker (checked before every `syncFixtures`/`syncFixtureStats` call,
  `DEFAULT_QUOTA_SAFETY_MARGIN` = 200) is the real safety net here, not
  a precise volume prediction — if a day's real fixture density ever
  approaches the 7,500/day budget, the tick stops early and reports
  `stoppedForQuota: true` rather than erroring or exceeding quota. This
  is graceful degradation (that day's live-score freshness lags until
  quota resets), never a failure.
- **Recommendation, not implemented this pass**: once real international
  fixtures are flowing and a genuinely busy date is observed, re-run
  `npm run football:sync -- sync-health` during it to replace this
  reasoned estimate with a measured one — exactly the same "measure
  before activating further" discipline Pass 12D already used for the
  Big Five + UEFA cron activation.

## 8. Backfill policy (Step 13/15)

**Confirmed structurally safe, by tracing the actual code**: a completed
fantasy round's `matchup_scores` can never be silently altered by
ingesting/scoring historical international fixtures. `backfillScores`
(`lib/scoring/backfill.ts`) writes only to `fantasy_player_scores`
(keyed `player_id, fixture_id, scoring_rule_version` — canonical,
round/league-independent) and never touches `matchup_scores` at all.
The only function that aggregates `fantasy_player_scores` into a
fantasy team's round total, `refreshMatchupScores`, is only ever called
(via `progressSeason`) for a league's CURRENT round, and only when that
round's own status is not yet `'completed'` — a completed round is
simply never revisited by the normal sync/progression flow, regardless
of what new `fantasy_player_scores` rows later appear for fixtures whose
`kickoff_at` happens to fall inside that round's historical window.

**This pass's actual policy**: no historical international backfill was
performed. No international fixtures have been ingested into the live
database at all yet (Phase 2's provider audit was read-only — 10
`GET /leagues` discovery requests, zero writes). The primary requirement
("correct scoring going forward") is satisfied by the ingestion/scoring/
locking fixes above; a future population of historical international
fixture data, if ever desired for football-statistical completeness,
would be a separate, explicitly-scoped action — never run automatically
as a side effect of this pass.

Phases 16–18 (tests, simulation, final validation) and the complete
commit history are tracked in `HANDOFF.md`.
