# Eleven — Data Flow

High-level flows through the architecture described in
`docs/architecture.md`, using the entities from `docs/domain-model.md`.
Flow 1 is real as of Pass 8 (see `docs/football-data-system.md` for the
full detail); flows 2 onward remain the target shape for the backend
passes that follow.

## 1. Football API ingestion (Pass 8 — real)

```
API-Football payload
  → npm run football:sync -- <op> [flags] pulls raw data — manually invoked, never scheduled/automatic yet
  → Normalization (api-football/adapter.ts) maps it into Normalized{Competition,Club,Player,Fixture,FixturePlayerStats} shapes
  → planReconciliation() + provider_mappings resolve each external id to an Eleven internal id
    (creating a new canonical row + mapping if this is the first time
    Eleven has seen that provider entity; updating the existing row in
    place otherwise — this is what lets a transferred player's club
    change without a new player being created)
  → Canonical rows are written/updated in Postgres via the service-role
    admin client (src/lib/supabase/admin.ts) — every football table's RLS
    is read-only for `authenticated`
  → The application (src/data-access/players.ts) only ever reads the
    canonical tables, filtered/paginated server-side
```

Nothing downstream of "Canonical rows are written" ever sees a provider's
own ID format or schema shape again. A future scheduled sync job would
call the exact same `sync-*.ts` functions the CLI calls — see
`docs/football-data-system.md` "Future scheduled sync."

## 2. Draft pick → player ownership

```
Manager makes a pick (or the pick timer expires and an autopick runs)
  → Draft engine checks: is this player already owned in this league?
    (query LeaguePlayerOwnership for leagueId + playerId)
  → If free: create DraftPick, RosterEntry, LeaguePlayerOwnership, Transaction (type: draft_pick)
  → If already owned: reject — this is invariant #4
  → Draft.currentPick advances; snake order reverses at the end of each round
```

## 3. Lineup update

```
Manager edits their Starting XI/bench on the Team screen
  → For each affected RosterEntry, upsert a LineupSlot for the current
    FantasyRound (slot, starter: true/false)
  → No global "lock the whole lineup" step — each LineupSlot's lockedAt
    is set independently once *that player's* Fixture kicks off
  → Emit LINEUP_UPDATED (and, later, PLAYER_LOCKED per slot as kickoffs pass)
```

This is the flow `src/lib/selectors/lineup.ts`'s `swapPlayers()` already
models at the UI/view-model level today — the backend version does the
same conceptual swap, just persisted as `LineupSlot` rows instead of
array indices in React state.

## 4. Real stats → Eleven scoring

```
Fixture goes final
  → PlayerMatchStats recorded for every player involved (raw, unweighted)
  → Scoring engine loads the active ScoringRule set
  → For each player: apply each rule's multiplier (+ positionModifier if
    present) to the matching stat, sum the result
  → Write one FantasyPlayerScore per player per fixture, with a
    stat-by-stat breakdown (not just the total) for auditability
```

The frontend never performs this calculation. A provider's own
"fantasy points" field (if one exists) is ignored entirely — see
invariant #10.

## 5. Fantasy score → matchup score

```
FantasyPlayerScore rows exist for a round's fixtures
  → For each FantasyTeam in a Matchup, sum FantasyPlayerScore.points
    across every starting LineupSlot for that round
  → Write/update MatchupScore.livePoints for each side as fixtures
    progress (this can run incrementally, not just once at the end)
  → When every relevant Fixture is final and the FantasyRound closes,
    set MatchupScore.finalPoints and Matchup.status = "final"
  → Emit MATCHUP_STARTED / PLAYER_POINTS_UPDATED / MATCHUP_FINAL /
    ROUND_FINALIZED at the appropriate points along the way
```

`MatchupScore.projectedPoints` is computed separately (and optionally) —
it never blocks or gates the live/final numbers above.

## 6. Waiver processing

```
Manager submits a WaiverClaim (status: pending)
  → On the league's waiver processing schedule:
      - Claims are ordered by priority
      - For each claim, verify targetPlayerId is still a free agent
        (no LeaguePlayerOwnership row) — if not, mark "lost"
      - If free: create RosterEntry + LeaguePlayerOwnership for the
        claiming team; if dropPlayerId was set, remove that player's
        ownership/roster row in the same operation
      - Mark the winning claim "won", losing claims for the same player "lost"
      - Create a Transaction (type: waiver_add) for the winning claim
  → Emit WAIVER_RESOLVED for every claim that was processed
```

## 7. Trade execution

```
Team A proposes a Trade (status: draft → pending) with one or more TradeAssets
  → Team B accepts, rejects, or counters
  → On acceptance (status: accepted):
      - Immediately re-validate every TradeAsset's playerId is still
        owned by the team the asset says it's "fromTeamId" — invariant #7
      - If any asset fails validation, the trade cannot complete; surface
        the conflict rather than partially executing
      - If all assets validate: for each TradeAsset, update
        LeaguePlayerOwnership + RosterEntry to move the player from
        fromTeamId to toTeamId
      - Set Trade.status = "completed", write a Transaction (type: trade)
        referencing the trade
  → Emit TRADE_PROPOSED / TRADE_ACCEPTED / TRADE_REJECTED / TRADE_COMPLETED
    at each transition
```

TradeAsset rows (rather than two fixed player fields on `Trade`) are what
let this flow handle 1-for-1, 2-for-1, or 2-for-2 without a different code
path per shape.

## 8. Operations feed event creation

```
Any of the flows above emits a DomainEvent
  → A feed-formatting step turns select DomainEvents into
    OperationsFeedEntry rows (title/primaryText/secondaryText/status),
    e.g. TRADE_COMPLETED → "Robert FC ⇄ Camden Wolves" / "OUT: Harry Kane" / "IN: Kylian Mbappé"
  → OperationsFeedEntry rows are what a future activity-stream UI reads —
    it never reads raw DomainEvents directly, so feed copy can change
    without touching event payload shapes
```

No feed UI is built in this pass — this flow documents the intended
shape for when one is.
