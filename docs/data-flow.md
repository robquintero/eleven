# Eleven — Data Flow

High-level flows through the architecture described in
`docs/architecture.md`, using the entities from `docs/domain-model.md`.
Flow 1 is real as of Pass 8 (see `docs/football-data-system.md` for the
full detail). Flow 4 is real as of Pass 9 (see `docs/scoring-model.md`).
Flows 2, 3, and 5 are real as of Pass 10 (see `docs/game-rules.md` for
the exact rules and `src/lib/fantasy-engine/*` for the implementation).
Flows 6 and 7 (waivers, trades) remain the target shape for a future
pass — explicitly out of scope for Pass 10.

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

## 2. Draft pick → player ownership (Pass 10 — real)

```
Manager makes a pick (make_draft_pick RPC), or a client-polled timer
expiry triggers resolve_expired_pick (auto-pick)
  → `select ... for update` on the drafts row serializes concurrent picks
    for the same draft — the real atomicity mechanism, not merely a
    documented invariant (see supabase/migrations/20260930024807_draft_engine.sql)
  → Checks: is it this team's turn (snake math)? Is the player active
    and unowned in this league (LeaguePlayerOwnership PK is the final
    guarantee even if the row lock were somehow bypassed)?
  → If free: create DraftPick, RosterEntry, LeaguePlayerOwnership, Transaction (type: draft_pick) — one atomic transaction
  → If already owned or not this team's turn: reject with a specific error (PLAYER_ALREADY_OWNED / NOT_YOUR_TURN), never a raw constraint error
  → drafts.current_pick advances; snake order reverses each round; the
    final pick transitions status to 'completed'
```

Auto-pick (`resolve_expired_pick`) is deterministic — fills the drafting
team's biggest unmet formation minimum first, then the first eligible
player by name — never a ratings-based recommendation. See
`docs/game-rules.md` "Draft."

## 3. Lineup update (Pass 10 — real)

```
Manager selects a starter then a bench player (or vice versa) on the
Team screen → swapLineupAction (src/app/(app)/team/actions.ts)
  → Verifies the caller actually owns this fantasy team (their own
    RLS-respecting session), then calls updateLineup()
    (src/lib/fantasy-engine/lineup.ts) via the service-role client — no
    authenticated INSERT/UPDATE policy exists on lineup_slots by design
  → All-or-nothing: rejects the whole batch if any touched slot is
    already locked, or if the resulting starter composition wouldn't be
    a valid formation (src/domain/fantasy/constants.ts)
  → No global "lock the whole lineup" step — each LineupSlot's lockedAt
    is computed and stored once, when the round opens, from that
    player's actual eligible fixtures (src/domain/fantasy/lineup-lock.ts)
```

`src/lib/selectors/lineup.ts`'s `swapPlayers()` models the same swap at
the UI/view-model level — `TeamWorkspace`'s edit mode reuses that exact
interaction shape, now persisted for real instead of local React state.

## 4. Real stats → Eleven scoring (Pass 9 — real)

```
Fixture goes final (+ Pass 9's post-FT reconciliation window closes)
  → PlayerMatchStats recorded for every player involved (raw, unweighted)
  → calculateFantasyScore() (src/domain/fantasy/scoring.ts) — a pure,
    versioned function (ELEVEN_STANDARD_V1), NOT the scoring_rules table
    (which stays unused — see docs/scoring-model.md "Tradeoffs" for why
    a hardcoded, tested, versioned formula was chosen over a database-
    driven rule editor for this pass)
  → npm run scoring:backfill upserts one FantasyPlayerScore per player
    per fixture per scoring_rule_version, with a category-by-category
    breakdown (not just the total) for auditability
```

The frontend never performs this calculation. A provider's own
"fantasy points"/rating field is ignored entirely — see invariant #10.

## 5. Fantasy score → matchup score (Pass 10 — real)

```
FantasyPlayerScore rows exist for fixtures in a round's window
  → refreshMatchupScores() (src/lib/fantasy-engine/rounds.ts): for each
    Matchup, sum FantasyPlayerScore.points across every STARTING
    LineupSlot's player, across every eligible fixture that player
    played within the round's window (the double-match-round feature —
    docs/game-rules.md "Multi-fixture players"). Bench points never
    count. Always recomputed from canonical scores, never incremented —
    Pass 9's rule, extended here.
  → Write/update MatchupScore.livePoints for each side (safe to re-run
    any number of times; re-running twice on unchanged data converges to
    identical rows)
  → finalizeRoundIfReady(): only once EVERY fixture in the round's
    window has reached final+settled (or postponed) does it set
    MatchupScore.finalPoints and Matchup.status/FantasyRound.status to
    "final"/"completed" — a single still-reconciling fixture holds the
    whole round open (see docs/game-rules.md "H2H schedule & scoring")
  → Emits ROUND_OPENED / MATCHUP_FINALIZED / ROUND_FINALIZED domain
    events (reusing the existing domain_events table, no new one)
```

`MatchupScore.projectedPoints` remains unused this pass — optional per
the brief, deferred in favor of correctness over charts.

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
