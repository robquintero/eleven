-- Same class of bug as 20260929150824_grant_authenticated_privileges.sql,
-- discovered live while running Pass 8's ingestion CLI against the real
-- project: `service_role` bypasses RLS by design, but — like every other
-- role — still needs base table-level GRANTs first, and tables created via
-- SQL migration (all of ours) don't get those automatically the way
-- Studio-created tables do. Every `service_role` write in
-- src/lib/football-ingestion/* was failing with `permission denied for
-- table X` until this migration.
--
-- Deliberately additive — a new migration rather than editing the
-- already-applied grant/RLS migrations.
--
-- Granted broadly (all tables, not just the football ones) because
-- `service_role` is the one fully-trusted backend role by design (see the
-- "service_role bypasses RLS entirely" note in
-- 20260929141143_rls.sql) — every future backend engine (draft, waivers,
-- trades, scoring) will need the same unrestricted access this grants, not
-- just this pass's football tables.

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

-- Applies the same baseline to any table a future migration adds, so this
-- class of bug can't recur silently — mirrors the `authenticated`-facing
-- default-privileges statement already in
-- 20260929150824_grant_authenticated_privileges.sql.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;
