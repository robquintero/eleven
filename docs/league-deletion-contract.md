# Commissioner league deletion

Deletion targets the immutable UUID of the selected league. The Server Action
verifies the session and resolves the current selection using the existing
membership/cookie resolver. Its request-authenticated Supabase client invokes
`delete_fantasy_league(uuid, text)`; there is no service-role escalation.
The RPC requires an authenticated JWT, exact `DELETE`, the league creator and
an actual commissioner membership on that target. It rechecks authorization
after locking. A deleted or duplicate target returns `DELETE_LEAGUE_NOT_FOUND`.

## Audited ownership graph

All existing ownership foreign keys cascade from `fantasy_leagues`:

| Owned table | Ownership / deletion path |
| --- | --- |
| `league_memberships` | league |
| `fantasy_teams` | league |
| `seasons` | league |
| `roster_entries` | league / team |
| `league_player_ownership` | composite roster FK / team |
| `fantasy_rounds` | league / season |
| `lineup_slots` | roster / round |
| `matchups` | league / round / teams |
| `matchup_scores` | matchup / team |
| `drafts` | league / nullable season |
| `draft_orders`, `draft_picks` | draft / team |
| `waiver_claims` | league / team |
| `trades` | league / teams |
| `trade_assets` | trade / teams |
| `transactions`, `domain_events` | league; team references also SET NULL |
| `scoring_rules` | non-null league overrides only |
| `fantasy_player_scores` | non-null round-owned legacy scores only |

Standings, winners and records are derived from these results; there is no
separate stored standings table. Round scoring-version metadata disappears
with its round. All fantasy event writers inspected supply `league_id`; global
null-league events survive. Polymorphic event/transaction pointers are not FKs
and do not imply ownership of global records.

Shared tables survive: `auth.users` (and its identities/sessions), `profiles`,
`competitions`, `clubs`, `players`, `fixtures`, `player_match_stats`,
`provider_mappings`, `player_national_teams`, `football_provider_snapshots`,
`scoring_version_activations`, null-league `scoring_rules`, null-round canonical
`fantasy_player_scores`, null-league `domain_events`, and every other league's
fantasy records. No football FK points from shared data into the league graph.

## Atomicity and historical protection

The RPC issues one root DELETE; no explicit fantasy child cleanup is needed.
A private transaction-ID capability records the exact round, matchup and score
UUIDs in the target graph. The three historical guards have only one added
DELETE-specific check for that capability. Their existing INSERT/UPDATE,
settlement, V4 and historical rules remain unchanged. Clients cannot read/write
the capability table or execute its helper. No client-settable setting can
unlock history. No trigger is disabled and no table DELETE grant is added.
The capability is removed before the RPC returns, or rolls back with the entire
operation on any error, including an injected late cascade failure.

The existing settlement advisory lock is acquired first. SHARE ROW EXCLUSIVE
locks briefly serialize writes to the audited graph (including player scores)
while references are checked and the cascade executes. This rare destructive
operation can briefly block writes in other leagues/ingestion, but does not
change their rows. A five-second lock timeout/deadlock returns a busy error and
rolls everything back. Existing simple FKs permit some inconsistent cross-league
references; the RPC explicitly refuses those involving the target, including
SET NULL edges into global/other-league events. It never repairs such data.
Subsequent draft/trade/waiver/lineup writes cannot recreate deleted parents;
existing authorization and foreign keys reject them.

## UI and selected context

Only the selected creator/commissioner sees the bottom Danger Zone. The existing
modal primitives provide focus trapping, Escape and focus restoration; initial
focus is Cancel. Exact text is checked on both client and database, Enter in the
input does nothing, pending submissions cannot duplicate or dismiss, and errors
retain the dialog. Success clears the selected cookie, invalidates the shared
layout using the existing league-switching behavior, and softly navigates home.
The existing resolver selects a remaining real membership or no-league UI.
Other former members' stale cookies fall back on their next server render;
already-open pages update on their next navigation/refresh, without new realtime
infrastructure.

## Validation and release safety

Destructive tests use PGlite with all actual migrations and populated active and
completed fantasy state. Tests cover authorization, exact text, all ownership
paths, another league, shared data, cascade rollback, duplicates, unchanged
ordinary historical guards and post-delete FK/mutation rejection. The real
component browser harness replaces the action in a temporary bundle, blocks
all requests and checks 1440/375/320 widths, keyboard/focus, pending, failure and
success. Production smoke may open/type/cancel only, never submit deletion.
The migration is additive DDL, changes no existing data, and is applied once
through normal Supabase migration history. Raw replay is intentionally not
supported, like existing create-table migrations.
