-- Real defect found live during Pass 9 Phase 7 QA: the Players workspace
-- showed "—" for every player's season points despite fantasy_player_scores
-- being fully populated (11,517 real rows). Root cause was RLS, not the
-- data-access query.
--
-- The original policy ("members can read fantasy_player_scores in their
-- league", supabase/migrations/20260929141143_rls.sql) only matches rows
-- that join through fantasy_rounds -> league_memberships. That was correct
-- when fantasy_round_id was NOT NULL and every score belonged to some
-- league's round. Pass 9's scoring_engine_foundation migration made
-- fantasy_round_id nullable precisely because a canonical (player, fixture,
-- scoring_rule_version) score is round- and league-independent — every row
-- the Pass 9 scoring engine writes has fantasy_round_id = NULL. Against
-- that original policy, `r.id = fantasy_player_scores.fantasy_round_id`
-- can never be true for a NULL fantasy_round_id, so literally no
-- authenticated user could read ANY canonical score row. The migration
-- that loosened the column didn't loosen the policy that assumed it was
-- always populated — this fixes that mismatch.
--
-- A canonical score (fantasy_round_id IS NULL) is derived entirely from
-- public real-football data (player_match_stats, fixtures) the exact same
-- way player_match_stats itself is — see that table's own
-- "authenticated can read player_match_stats" `using (true)` policy. It is
-- not league-private, so every authenticated user may read it, same as the
-- raw stats it's computed from.
--
-- The original league-scoped policy is left in place, not replaced: RLS
-- policies are OR'd together, so a future round-scoped score row (once a
-- round scheduler exists) stays correctly restricted to that league's
-- members, while every current canonical row becomes visible via this new
-- policy instead.
create policy "authenticated can read canonical fantasy_player_scores"
  on public.fantasy_player_scores for select
  to authenticated
  using (fantasy_round_id is null);
