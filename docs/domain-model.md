# Eleven — Domain Model

This document explains Eleven's internal domain model: the entities, how
they relate, and the invariants the backend (built in a later pass) must
enforce. The types described here live in `src/domain/` — see
`docs/architecture.md` for how that relates to the code the UI actually
runs on today.

## The core split: real football vs. fantasy

Eleven models two separate domains that only touch at one deliberate
seam:

- **Real football** (`src/domain/football`) — competitions, clubs,
  players, fixtures, and match stats, exactly as they exist in the real
  world. Nothing in this domain knows what a "fantasy team" is.
- **Fantasy** (`src/domain/fantasy`) — leagues, teams, rosters, drafts,
  trades, scoring. Everything fantasy-specific lives here, layered on top
  of football entities by reference (`playerId`), never by embedding.

**A `Player` does not have a global fantasy owner.** Ownership is
contextual to one `FantasyLeague`, expressed through
`LeaguePlayerOwnership` — not a field on `Player` itself. Concretely:

```
FantasyLeague + Player  →  FantasyTeam   (via LeaguePlayerOwnership)
```

The same real player can be owned by **Robert FC in League A** and
**Camden Wolves in League B** at the same time, because ownership rows
are scoped per league. If `Player` carried a single `ownerTeamId` field,
this would be structurally impossible — which is exactly why it doesn't.

> The current UI's `@/lib/types/fantasy` `Player` type *does* carry an
> `ownership`/`ownerTeamName` field today. That's a deliberate,
> documented simplification of a **view model** for a single-league
> screen (see `docs/architecture.md` "Two mock layers") — it is not the
> canonical shape and must not be read as contradicting the rule above.

## Entity diagram

```
User
  │
  ├── LeagueMembership ──────── FantasyLeague ──── LeagueSettings
  │                                  │
  │                                  ├── FantasyRound ── Matchup ── MatchupScore
  │                                  ├── Draft ── DraftOrder
  │                                  │              └── DraftPick
  │                                  ├── WaiverClaim
  │                                  ├── Trade ── TradeAsset
  │                                  ├── Transaction
  │                                  └── LeaguePlayerOwnership
  │                                         ├── Player (football domain)
  │                                         └── FantasyTeam
  │
  └── FantasyTeam
         ├── RosterEntry ── LineupSlot
         ├── DraftPick (as fantasyTeamId)
         ├── Matchup (as homeFantasyTeamId / awayFantasyTeamId)
         └── Transaction (as fantasyTeamId)


Competition
  │
  └── Club
       │
       └── Player
            ├── PlayerMatchStats (per Fixture)
            └── ProviderMapping


Fixture
  ├── homeClubId → Club
  ├── awayClubId → Club
  └── PlayerMatchStats[]


ScoringRule[]  +  PlayerMatchStats  →  FantasyPlayerScore  →  MatchupScore
```

Read this as: a `User` joins `FantasyLeague`s via `LeagueMembership` and
owns at most one `FantasyTeam` per league; a `FantasyTeam`'s players live
in `RosterEntry` rows, each of which is placed into a `LineupSlot` for a
given `FantasyRound`; ownership itself is asserted separately by
`LeaguePlayerOwnership` so "who owns whom" can be queried without joining
through rosters. On the football side, `Competition → Club → Player` is a
straightforward real-world hierarchy, and `PlayerMatchStats` is the raw
material scoring is calculated from.

## Entity reference

### Real football (`src/domain/football/types.ts`)

| Entity | Purpose |
|---|---|
| `Competition` | One of the Big Five leagues. |
| `Club` | A real club, within one competition. |
| `Player` | A real footballer. No fantasy concept anywhere on this type. |
| `Fixture` | A real match between two clubs. |
| `PlayerMatchStats` | Raw per-player, per-fixture statistics. **Not** fantasy points. |
| `ProviderMapping` | External provider ID → Eleven internal ID. |

### Fantasy (`src/domain/fantasy/types.ts`)

| Entity | Purpose |
|---|---|
| `User` | A person using Eleven. |
| `FantasyLeague` / `LeagueSettings` | A private league and its configuration. |
| `LeagueMembership` | A user's membership + role in a league. |
| `FantasyTeam` | One manager's team within one league. |
| `RosterEntry` | A player on a team's roster, with how/when they were acquired. |
| `LineupSlot` | Where a roster entry sits for one fantasy round (starter/bench, position). |
| `LeaguePlayerOwnership` | The single source of truth for "who owns this player in this league." |
| `FantasyRound` | An Eleven-defined scoring window (not an official gameweek). |
| `Matchup` / `MatchupScore` | One head-to-head fixture between two fantasy teams for one round. |
| `Draft` / `DraftOrder` / `DraftPick` | A league's snake draft and its picks. |
| `WaiverClaim` | A pending/resolved waiver request. |
| `Trade` / `TradeAsset` | A proposed or completed trade; `TradeAsset` rows allow N-for-M trades. |
| `Transaction` | A generic, auditable record of any roster-affecting action. |
| `ScoringRule` / `FantasyPlayerScore` | The scoring formula and its computed result per player/fixture. |

### System (`src/domain/events/types.ts`)

| Entity | Purpose |
|---|---|
| `DomainEvent` | A typed record of a meaningful action (pick made, trade completed, etc.). |
| `OperationsFeedEntry` | A display-ready row derived from events, for a future activity feed. |

## Player locking

Eleven uses **player-level locking**, not one global weekly lineup lock.
`LineupSlot.lockedAt` is set independently for each roster entry the
moment *that specific player's* real-world `Fixture` kicks off. Two
players in the same lineup can lock at completely different times over
the same weekend. This is already how the current UI presents fixtures
(`PlayerMatchState`: `upcoming → locked → live → final`, per-player) —
the domain model formalizes the same idea.

## Formation rules

Documented as configuration, not enforced logic, in
`src/domain/fantasy/constants.ts`:

- Starting XI: exactly 11 players.
- `GK`: exactly 1
- `DEF`: 3–5
- `MID`: 3–5
- `FWD`: 1–3
- Squad size: approximately 16.

`isStarterCompositionValid()` checks a count-by-position object against
these ranges. It does not know about specific players, bench eligibility,
or derive a formation *name* (4-3-3 vs. 4-4-2) — that's deliberately out
of scope for this pass.

## Projections are not canonical

`MatchupScore.projectedPoints` is optional and explicitly non-canonical —
it's derived/estimated data, not something the domain model depends on
being present or correct. Only `livePoints` and `finalPoints` (once set)
are truth.

## System invariants

1. One player may only have one owner per `FantasyLeague`.
2. The same player may have different owners in different
   `FantasyLeague`s.
3. One player cannot appear twice on the same roster.
4. A draft cannot select an already-owned player within the league.
5. A player locks at their fixture's kickoff — not at a global weekly
   deadline.
6. Completed draft picks and transactions must remain auditable (never
   deleted, only ever appended to).
7. Trade ownership must be validated immediately before execution — a
   trade proposed against a roster that has since changed must fail
   cleanly, not silently succeed against stale state.
8. Transactions must never create duplicate ownership (see #1 — the
   future Postgres schema enforces this with `UNIQUE (leagueId,
   playerId)` on `LeaguePlayerOwnership`).
9. Provider IDs are not canonical Eleven IDs — every reference to
   external data goes through `ProviderMapping`.
10. Fantasy scoring must be reproducible from raw `PlayerMatchStats` +
    Eleven's own `ScoringRule`s — never trust a provider's own
    fantasy-points field as canonical.

## Timestamp convention

Every timestamp in the domain layer is an ISO 8601 string in UTC (e.g.
`"2026-10-04T11:15:00.000Z"`). This matches the existing UI mock data and
is the wire format Postgres/Supabase will use, so no conversion layer is
needed when the backend lands.
