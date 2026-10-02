# Eleven — Auth/User Deletion Contract (Pass 12F)

A full audit of every `public.*` relationship that touches `auth.users`,
performed before any production account was deleted or any Delete Account
UI was built. Queried directly against the live Supabase project via
`pg_constraint` (not inferred from migration files alone, since
`ON DELETE` behavior is authoritative in the database, not in application
code).

## Direct references to `auth.users`

| Table.column | On delete |
|---|---|
| `profiles.id` | **CASCADE** |
| `league_memberships.user_id` | **CASCADE** |
| `fantasy_teams.owner_user_id` | **CASCADE** |
| `fantasy_leagues.created_by_user_id` | **RESTRICT** |
| `transactions.actor_user_id` | **SET NULL** |
| `domain_events.actor_user_id` | **SET NULL** |

**`fantasy_leagues.created_by_user_id` is the one constraint that matters
for deletion safety.** Every other direct reference either cascades
cleanly or just clears an attribution field on an append-only log — never
blocks a deletion, never orphans anything the app reads.

## Transitive cascade from `fantasy_leagues` / `fantasy_teams`

Every one of the following cascades fully from `fantasy_leagues.id`:
`league_memberships`, `fantasy_teams`, `roster_entries`, `fantasy_rounds`,
`matchups`, `drafts`, `waiver_claims`, `trades`, `transactions`,
`domain_events`, `scoring_rules`, `seasons` — and transitively from
those: `league_player_ownership`, `lineup_slots`, `matchup_scores`,
`draft_orders`, `draft_picks`, `trade_assets`, `fantasy_player_scores`
(via `fantasy_rounds`). **Deleting a `fantasy_leagues` row deletes 100%
of that league's fantasy data — no orphans, no second RESTRICT anywhere
in the subtree.**

`fantasy_teams.id` cascades `roster_entries`, `league_player_ownership`,
`matchups` (as home OR away team — see the caveat below),
`matchup_scores`, `draft_orders`, `draft_picks`, `waiver_claims`,
`trades` (as either side), `trade_assets`.

**Caveat worth knowing, not a blocker**: deleting one fantasy team (e.g.
via cascading user deletion) deletes the `matchups` rows that team
participated in — including the OPPONENT's half of that matchup. This
only matters when a league mixes an account being deleted with another
account whose history should be preserved; Pass 12F's own cleanup
explicitly checked for this (see the completion report) before deleting
anything.

## The football universe has zero relationship to `auth.users`

`competitions`, `clubs`, `players`, `fixtures`, `player_match_stats`,
`provider_mappings`, `scoring_rules` definitions, and
`fantasy_player_scores`' canonical (round-independent) rows are never
touched by any user or league deletion, directly or transitively — they
have no foreign key path to `auth.users` at all.

## The resulting deletion contract

1. **A league-creator's account cannot be deleted while their league(s)
   still exist** (the RESTRICT). Self-service account deletion
   (`src/lib/account/delete-account.ts`) therefore only proceeds for an
   account with **zero** `fantasy_leagues.created_by_user_id` rows —
   anyone else is refused with a clear `HAS_LEAGUES` reason, not a raw
   constraint-violation error.
2. **A real commissioner-transfer or consent-based league-deletion flow
   is explicitly deferred.** Deleting a league a user created would
   destroy every other real member's data in it without their knowledge
   — a genuine product decision (who becomes commissioner? what happens
   to an in-progress season?), not a safe default for a one-click "delete
   my account" action. Documented here rather than forced into this pass,
   per the brief's own instruction.
3. **Account deletion uses `auth.admin.deleteUser()`** (the Supabase
   Admin API, service-role only) — never a raw SQL `DELETE FROM
   auth.users`, which the Admin API additionally handles correctly
   (sessions, refresh tokens, identities) beyond what a direct table
   delete would.
4. **Pass 12F's own production cleanup used this exact contract**: 20
   fake leagues (created by fake accounts) were deleted first, then 71
   fake `auth.users` accounts, verified afterward with zero orphaned
   profiles and zero dangling `fantasy_leagues`/`fantasy_teams`
   references. See `HANDOFF.md` for the exact counts and the account
   categorization.
