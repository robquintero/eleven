# Eleven — Architecture

This document describes where Eleven's code lives today, why it's
organized that way, and what the target architecture looks like once a
real backend exists. See `docs/domain-model.md` for the entities
themselves and `docs/data-flow.md` for how data moves between the layers
described here.

## Layered architecture (target)

```
NEXT.JS UI (App Router, React Server + Client Components)
    ↓
APPLICATION / DOMAIN LAYER  (src/domain, src/lib/selectors)
    ↓
DATA ACCESS  (a future src/data/repositories or similar)
    ↓
SUPABASE / POSTGRESQL
```

**React components must never depend directly on provider schemas, and
must never call a football data API directly.** Every path from the UI to
external data goes through the domain layer's own types
(`src/domain/football`, `src/domain/fantasy`) and, eventually, a data
access layer that hides Supabase/Postgres specifics behind functions the
UI calls (`getFantasyTeam(id)`, not `supabase.from("fantasy_teams")...`
sprinkled through components).

## Football ingestion pipeline (target)

```
FOOTBALL PROVIDER
    ↓
INGESTION            (scheduled job pulls raw provider payloads)
    ↓
NORMALIZATION        (provider shape → Eleven's football domain shape)
    ↓
ELEVEN INTERNAL IDS  (ProviderMapping resolves/creates canonical ids)
    ↓
POSTGRESQL           (Competition/Club/Player/Fixture/PlayerMatchStats tables)
    ↓
APPLICATION          (UI reads only Eleven's own tables/types)
```

The `ProviderMapping` contract (`src/domain/football/types.ts`) is what
makes the ingestion step swappable: normalization always resolves a
provider's external ID to an Eleven internal ID through this table before
anything is written to a canonical table, so switching providers is a
matter of writing a new normalization step, not rebuilding the schema or
the application.

**Status as of Pass 8**: the whole pipeline is real, end to end — see
`docs/football-data-system.md` for the full detail (identity resolution,
idempotency, quota strategy, season/timezone handling, deferred stats).
Ingestion is a manually-invoked CLI (`npm run football:sync`), not a
scheduled job yet, and only a small controlled sample has been ingested,
not the full Big Five — see the Pass 8 final report.

## Football data provider (Pass 7A)

Eleven's chosen football data provider is [API-Football
v3](https://www.api-football.com/documentation-v3). The provider boundary
lives entirely under `src/lib/football-providers/`:

```
API-Football (v3.football.api-sports.io)
    ↓
src/lib/football-providers/api-football/client.ts     (HTTP, auth, timeout, quota parsing, error classification)
    ↓
src/lib/football-providers/api-football/adapter.ts     (raw provider JSON → normalized contracts, pure functions)
    ↓
src/lib/football-providers/types.ts                    (Normalized{Competition,Club,Player,Fixture,FixturePlayerStats} — provider-independent)
    ↓
[Pass 7B] ingestion service                             (resolves externalId → Eleven uuid via provider_mappings, upserts src/domain/football-shaped rows)
    ↓
Supabase (public.competitions/clubs/players/fixtures/player_match_stats)
    ↓
Eleven application                                       (reads only Eleven's own canonical tables — never the provider, never this module)
```

**Module boundary — non-negotiable:**

- `API_FOOTBALL_KEY` is **server-only**. It has no `NEXT_PUBLIC_` prefix,
  is read exactly once (lazily, in `api-football/config.ts`, only when a
  request is about to be made), and `client.ts` carries `import
  "server-only"` so accidentally importing it from a Client Component is
  a build error, not a runtime leak.
- Nothing outside `src/lib/football-providers/api-football/` is allowed
  to import `api-football/types.ts` (the raw provider response shapes).
  Everything else — future ingestion code, and eventually the
  application — only ever sees `src/lib/football-providers/types.ts`'s
  `Normalized*` contracts, or (once Pass 7B exists) `src/domain/football`'s
  canonical types. Provider JSON shapes stop at the adapter.
- `Normalized*` contracts are **not** `src/domain/football` types: they
  carry the provider's `externalId` untouched (never Eleven's own uuid
  `id`), because they exist to be fed into `provider_mappings`
  resolution, not to be mistaken for already-canonical data. See the
  header comment in `src/lib/football-providers/types.ts`.
- The provider is replaceable: a second provider would add a sibling
  `src/lib/football-providers/<other-provider>/` with its own
  client/adapter/errors, producing the exact same `Normalized*` contracts
  — nothing upstream of the adapter boundary would need to change.
- UI components and Supabase data-access code (`src/data-access/*`) never
  call the provider client directly, and never will — only a future
  ingestion service (server-side, scheduled) does.
- Raw provider data is never persisted blindly. Everything gets
  normalized (and, from Pass 7B on, id-resolved through
  `provider_mappings`) before it's allowed anywhere near a canonical
  Postgres table.

**Big Five configuration** (`api-football/big-five-competitions.ts`) is the
single place API-Football's numeric league IDs are wired to Eleven's own
competition codes — nowhere else in the codebase hardcodes a provider
league ID. Each entry also carries a `providerSeason` (the season's
*starting* year — API-Football's own convention, since European seasons
span two calendar years) as a best-known default, explicitly **not** a
guarantee: `resolveCurrentSeason()` prefers whatever a live `/leagues`
response actually marks `current`, falling back to the config only when
the provider data doesn't clearly indicate one. All five competitions are
configured; none are ingested yet (Pass 7A is provider-foundation only —
see "Do NOT begin bulk football ingestion" in the Pass 7A brief).

**Coverage awareness** (`api-football/coverage.ts`): not every
league-season has identical data available. `getCompetitionCoverage()`
fetches ONE competition's live coverage flags (fixtures/events/lineups/
player statistics/injuries/standings) from `/leagues` — deliberately never
looped across the whole Big Five automatically. This becomes load-bearing
before the scoring system is designed: Eleven can't build a scoring rule
around a stat a given competition-season doesn't actually report.

**Quota / rate-limit protection**: the client treats provider requests as
a scarce resource on purpose (we're developing against a low daily
allowance). It parses both header conventions API-Football uses
(`x-ratelimit-requests-limit`/`-remaining` for the daily budget,
`x-ratelimit-limit`/`-remaining` for the per-minute one) into a
`ProviderQuota` on every response, classifies HTTP 429 into a distinct
`ApiFootballRateLimitError` carrying that quota, and applies a 10s request
timeout. Pagination (the `page` param on `/players` and `/fixtures`) is
always explicit and caller-supplied — the client never loops through
pages, and there is no "fetch everything" helper anywhere in this module.
A real distributed rate limiter is explicitly deferred; this pass only
builds the defensive foundation a future one sits on top of.

**Live provider checks are manual only.** `npm run football:check` runs
one cheap `GET /status` request and prints a plain-text connectivity
summary (provider/status/quota) — never the API key, never raw response
headers. It's not a route, not wired into any page, and nothing in `npm
test` touches the network; every adapter/quota/error test runs against
static fixture JSON under `api-football/__fixtures__/`.

## Future responsibilities

| Component | Responsibility |
|---|---|
| **Supabase Auth** | User identity, session management. Maps to `User.id` in the fantasy domain — the domain layer doesn't care how a session was established, only that a `userId` is available. |
| **PostgreSQL** | Canonical storage for every entity in `src/domain/*`. Enforces the invariants in `docs/domain-model.md` (e.g. `UNIQUE (leagueId, playerId)` on `LeaguePlayerOwnership`) at the database level, not just in application code. |
| **Supabase Realtime** | Pushes live score/matchup/draft-pick updates to connected clients without polling — a transport concern layered on top of the domain events described below, not a replacement for them. |
| **Scheduled sync jobs** | Run the ingestion pipeline above on a cadence tied to real fixture kickoffs; also resolve waivers and finalize rounds/matchups once their windows close. |
| **Scoring engine** | Backend-owned. Applies `ScoringRule[]` to `PlayerMatchStats` to produce `FantasyPlayerScore`, then aggregates into `MatchupScore`. Never runs in the browser — see `docs/data-flow.md` "Real stats → Eleven scoring." |
| **Draft engine** | Enforces snake ordering, pick timers, and the "no re-drafting an owned player" invariant; turns each pick into a `DraftPick` + `RosterEntry` + `LeaguePlayerOwnership` row plus a `Transaction`. |
| **Transaction processing** | The thing that actually executes waivers/trades/drops — validates invariants immediately before writing, then creates the `Transaction` audit record. |
| **Operations feed** | Subscribes to `DomainEvent`s and renders them as `OperationsFeedEntry` rows for an activity-stream UI (not built this pass). |

## Mock data — test/illustration only, never runtime (Pass 7.5)

**Pass 7.5 deleted `src/lib/mock/*`.** Every screen (`/home`, `/team`,
`/players`, the League page, the shell) now reads real (possibly empty)
data through `src/data-access/*` — see `docs/product-state.md` for the
full rule and the screen-by-screen source table. There is no "mock/demo"
fallback mode left in the production runtime.

**`src/data/mocks/*`** remains: small, illustrative sample data shaped
exactly like `src/domain/football` and `src/domain/fantasy`. It exists to
prove the canonical types are usable end-to-end (a league, a team, a
roster, a round, a matchup, a draft pick, a trade, a scoring result) and
is explicitly not imported by any screen — a `Player` here does not
represent a real footballer. `src/lib/no-runtime-mock-imports.test.ts`
enforces this by failing the suite if any production module imports it.

The **selectors** in `src/lib/selectors/` (`player.ts`, `lineup.ts`) are
the adapter layer between these: pure functions like
`getOwnershipLabel(player)` or `swapPlayers(squad, ...)` that used to live
inline in page components. When the backend lands, the plan is that these
selectors' *inputs* migrate from `src/lib/mock/*` view models to values
derived from `src/domain/*` canonical entities (e.g. a
`toPlayerDatabaseViewModel(player, ownership)` adapter feeding the same
`getOwnershipLabel` call) — the UI components themselves shouldn't need
to change, because they already only ever talked to selectors, not to
mock data directly.

## Domain events — not event sourcing

`src/domain/events/types.ts`'s `DomainEvent` is a lightweight product
event model: one typed shape (`id`, `type`, `leagueId?`, `actorUserId?`,
`entityType?`, `entityId?`, `createdAt`, `payload`) that meaningful
actions can emit for logging, notifications, or the operations feed.
This is explicitly **not** Kafka, CQRS, or event sourcing — there's no
event store that state is replayed from, no bus, no schema registry.
Postgres tables remain the source of truth; events are a side channel for
"tell someone something happened," not "this is how state is derived."

## Folder structure

```
src/
  domain/
    football/
      types.ts       Competition, Club, Player, Fixture, PlayerMatchStats, ProviderMapping
      constants.ts    PLAYER_POSITIONS, BIG_FIVE_COMPETITION_CODES
    fantasy/
      types.ts        User, FantasyLeague, FantasyTeam, RosterEntry, Draft, Trade, ... (see domain-model.md)
      constants.ts     FORMATION_RULES, DEFAULT_LEAGUE_SETTINGS, isStarterCompositionValid()
    events/
      types.ts        DomainEvent, OperationsFeedEntry

  data/
    mocks/
      football.ts     Small canonical-shaped sample data (not wired into the UI)
      fantasy.ts

  lib/
    selectors/
      player.ts       getOwnershipLabel, getNextFixtureLabel, getRecentFormAverage, getDatabaseSummary
      lineup.ts        swapPlayers, findStarterSlotForPlayer, findBenchPlayerAtPosition, ...
    types/fantasy.ts    EXISTING — the UI's view-model types (Pass 7.5: real data-access
                        modules under src/data-access/ now populate these shapes;
                        src/lib/mock/ was deleted — see docs/product-state.md)
    team-fixture.ts, players-filters.ts, leagues.ts, time.ts, utils.ts   EXISTING helpers

  components/, app/    EXISTING UI — unchanged by this pass except for
                       importing the two selector modules above in place
                       of logic that used to be inline in page components
                       (Team's lineup-swap handlers, Players' summary tally)
```

`src/lib/formatters/` from the suggested layout was deliberately not
created — there wasn't enough distinct formatting-only logic (as opposed
to selection/derivation logic) to justify a second folder next to
`selectors/`, and `src/lib/time.ts` already covers the one general-purpose
formatting concern (relative time, deadlines) the app has. Add it when a
real need shows up rather than pre-creating an empty folder.

**Added in Pass 7A:**

```
src/lib/
  football-providers/
    types.ts                       NormalizedCompetition/Club/Player/Fixture/FixturePlayerStats, ProviderCoverage/Quota/Pagination
    api-football/
      client.ts                    The one controlled HTTP client (server-only)
      config.ts                    getApiKey() — split out so "missing key" is unit-testable
      errors.ts                    ApiFootballConfigError/NetworkError/RateLimitError/ResponseError
      response-helpers.ts          parseQuotaHeaders, extractPagination, ensureSuccessfulStatus, hasProviderErrors — pure, unit-tested
      types.ts                     Raw API-Football v3 response shapes — never imported outside this folder
      adapter.ts                   Raw → Normalized*, pure functions, unit-tested against __fixtures__/
      big-five-competitions.ts     BIG_FIVE_COMPETITIONS config, resolveCurrentSeason()
      coverage.ts                  getCompetitionCoverage() — one competition at a time, never a loop
      check-connectivity.ts        npm run football:check — manual, server-only, prints no secrets
      __fixtures__/                Sanitized sample JSON the test suite runs against (no network, no secrets)
```

**Added in Pass 8** (see `docs/football-data-system.md` for the full detail):

```
src/lib/
  football-ingestion/               server-only, never imported by application code
    reconcile.ts                    planReconciliation() — pure create-vs-update logic, unit-tested
    quota.ts                        shouldStopForQuota(), hasMorePages() — pure, unit-tested
    identity.ts                     provider_mappings reads/writes
    types.ts                        SyncResult
    sync-competitions.ts            sync-clubs.ts / sync-players.ts / sync-fixtures.ts / sync-fixture-stats.ts
    record-sync-event.ts            writes a domain_events row per sync run
    cli.ts                          npm run football:sync -- <op> [flags] — the only entry point
  supabase/
    admin.ts                        the one service-role (RLS-bypassing) Supabase client — ingestion-only
  selectors/
    usage-trend.ts                  getUsageTrend() — pure, unit-tested; powers the Player Inspector's recent-usage section

src/data-access/
  players.ts                        rewritten: server-side filtered/paginated getPlayerDatabase(), getCompetitionFilters(), getClubFilters(), getPlayerRecentMatches()
```

Several files split pure logic (`config.ts`, `response-helpers.ts`) out of
the actual network-calling `client.ts` (which carries `"server-only"`) —
same reasoning as Pass 6's `src/lib/errors/league-action-error.ts` split
from `src/data-access/leagues.ts`: `"server-only"` can't be resolved by
plain `node --test`, so anything meant to be unit-tested needs to live
where that guard isn't in its import chain.

**Added in Pass 10** (see `docs/game-rules.md` for the full rules detail):

```
src/domain/fantasy/
  round-calendar.ts                  the Tue->Mon window as pure calendar math — no I/O, no league concept
  lineup-lock.ts                     first-eligible-kickoff locking (computeLockInstant/isLocked)
  draft-order.ts                     snake pick math + seedable-RNG shuffle
  schedule.ts                        round-robin circle method (byes for odd counts)
  standings.ts                       buildStandingsTable/rankStandings — wins, points-for, head-to-head, points-against
  auto-lineup.ts                     SIMULATION-ONLY deterministic valid-XI chooser, never a real manager's lineup

src/lib/fantasy-engine/               server-only, mirrors football-ingestion's conventions
  round-eligibility.ts                finds the next non-blank fixture window; getEligibleFixtureIds
  lineup.ts                          createRoundLineupSlots (locks computed/stored at round-open), updateLineup (all-or-nothing)
  rounds.ts                          openNextRound / refreshMatchupScores / finalizeRoundIfReady
  simulate.ts                        runSimulation() — the full-lifecycle harness (real temp auth users + league)
  cli.ts                              npm run fantasy:simulate [-- --managers N --rounds N ...]
  draft-engine.integration.test.ts    COMMITTED integration tests against the real DB — npm run test:integration

supabase/migrations/20260930024807_draft_engine.sql
                                      start_draft / make_draft_pick / resolve_expired_pick / _perform_draft_pick
                                      (SECURITY DEFINER, same pattern as create_league/join_league_by_invite_code)

src/app/(app)/draft/                 new route: the real draft room (gated through WAITING_FOR_MANAGERS/READY_FOR_DRAFT/DRAFTING)
src/app/(app)/team/actions.ts        swapLineupAction — the one narrow, tested exemption to the
                                      no-admin-client-in-app guard (no RLS write policy exists for lineup_slots by design)
src/components/draft/                the draft workspace UI (reuses PlayerInspector from the Players workspace)
src/lib/errors/draft-action-error*.ts mirrors league-action-error.ts for every draft RPC failure mode
```

## No enterprise cosplay

Deliberately absent, and not planned for a future pass without a concrete
need: dependency injection, a repository abstraction over every table,
service factories, CQRS, event sourcing, a message bus, or generic
"enterprise" interfaces with a single implementation. The domain layer is
plain TypeScript types plus a handful of pure functions — clear, typed,
and extensible without being abstract for its own sake.

## Pass 7 roadmap

Football data integration is split across several passes on purpose —
each one is small enough to land, verify, and stop:

| Pass | Scope |
|---|---|
| **7A** | Provider foundation — API-Football client/adapter/errors, normalized contracts, Big Five config, coverage discovery, quota awareness, manual connectivity check. No ingestion, no UI change. |
| **7.5** | Product Reality — removed the fantasy-side mock layer (`src/lib/mock/*`), made Dashboard/Team/Players/League read real Supabase data. Did not touch football ingestion. |
| **8** | Football data system — the real ingestion pipeline (`src/lib/football-ingestion/*`, `npm run football:sync`): competitions/clubs/players/fixtures/player_match_stats, provider identity resolution, idempotency, quota discipline. Restored the full Players scouting workspace on real data. Later followed by a full Big Five population pass. |
| **9** | Fantasy scoring + live data engine — `ELEVEN_STANDARD_V1` (`src/domain/fantasy/scoring.ts`, versioned, pure), historical backfill, a replay harness, a fixture-aware live-sync foundation, and real Players-workspace fantasy output (season PTS, Form Tracker). Landed and merged. |
| **10** | Core fantasy game — the draft engine (`start_draft`/`make_draft_pick`/`resolve_expired_pick`, SECURITY DEFINER SQL, see `supabase/migrations/20260930024807_draft_engine.sql`), the fantasy round calendar (`src/domain/fantasy/round-calendar.ts`, an empirically-chosen Tuesday→Monday boundary — see `docs/fantasy-round-calendar-analysis.md`), per-player lineup locking, H2H round-robin scheduling, matchup scoring/finalization, standings, and a full-lifecycle simulation harness (`npm run fantasy:simulate`) proving the whole chain end to end against real stored 2026/27 data with a controlled clock. See `docs/game-rules.md` for the exact rules. **This pass.** |

Pass 9 did not begin Pass 10's game engine — no draft/round/lineup/matchup
logic existed before it. Pass 10 did not begin waivers, trades, FAAB,
playoffs beyond basic schedule repetition, commissioner tooling,
notifications, or a native app — see `docs/game-rules.md` "Out of scope."
