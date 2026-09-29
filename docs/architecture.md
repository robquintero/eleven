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

## Two mock layers — why both exist

This pass added a **second** mock-data location, and it's intentional
that the first one wasn't deleted:

- **`src/lib/mock/*`** — the existing UI-facing mock data
  (`dashboard.ts`, `team.ts`, `players-database.ts`, `fixtures.ts`),
  shaped as the **view models** in `src/lib/types/fantasy.ts`. Every
  screen (`/`, `/team`, `/players`) still runs on this today, unchanged.
  A `Player` here carries a single `ownership` field because, on a
  single-manager screen showing one league, that's the correct
  *presentation* shape — it is not making a claim about the canonical
  data model.
- **`src/data/mocks/*`** — new, small, illustrative sample data shaped
  exactly like `src/domain/football` and `src/domain/fantasy`. It exists
  to prove the canonical types are usable end-to-end (a league, a team, a
  roster, a round, a matchup, a draft pick, a trade, a scoring result)
  and to give a future migration something concrete to seed a Postgres
  schema from. It is not imported by any screen.

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
    mock/              EXISTING — untouched, still powers every live screen
    types/fantasy.ts    EXISTING — the UI's view-model types, untouched
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

## No enterprise cosplay

Deliberately absent, and not planned for a future pass without a concrete
need: dependency injection, a repository abstraction over every table,
service factories, CQRS, event sourcing, a message bus, or generic
"enterprise" interfaces with a single implementation. The domain layer is
plain TypeScript types plus a handful of pure functions — clear, typed,
and extensible without being abstract for its own sake.
