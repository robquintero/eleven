-- Fixes a live-integration bug found while testing Pass 6 against the
-- real Supabase project: RLS policies control which ROWS a role can see,
-- but Postgres separately requires base table-level GRANTs before RLS is
-- even evaluated. Tables created via Studio get these automatically;
-- tables created via SQL migrations (all of ours) do not. Every
-- `authenticated`-role SELECT in 20260929141143_rls.sql was failing with
-- `permission denied for table X` until this migration.
--
-- Deliberately additive — a new migration rather than editing the
-- already-applied RLS/schema migrations (do not rewrite applied history).

grant usage on schema public to authenticated;

-- SELECT is safe to grant broadly: RLS policies (20260929141143_rls.sql)
-- still gate which rows come back per table, including zero rows for
-- tables with no `authenticated` SELECT policy at all (e.g.
-- provider_mappings). This just clears the table-level prerequisite.
grant select on all tables in schema public to authenticated;

-- The three tables with an `authenticated` UPDATE policy also need the
-- matching table-level grant.
grant update on public.profiles to authenticated;
grant update on public.fantasy_leagues to authenticated;
grant update on public.fantasy_teams to authenticated;

-- Applies the same baseline to any table a future migration adds, so this
-- class of bug can't recur silently.
alter default privileges in schema public grant select on tables to authenticated;
