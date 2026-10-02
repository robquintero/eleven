-- Pass 14: international football scoring foundation.
--
-- National teams become ordinary `clubs` rows -- the smallest clean
-- extension of the existing schema (fixtures.home_club_id/away_club_id
-- are already NOT NULL FKs to clubs, and this is the exact same pattern
-- already proven safe for non-Big-Five UEFA clubs like Sporting CP:
-- a club outside the draftable universe, distinguished purely by which
-- competition_id it belongs to, invisible to the draftable pool simply
-- because nothing queries players by that competition_id). The ONE new
-- thing a national team genuinely needs that a UEFA club didn't is an
-- explicit, provider-sourced flag -- `is_national_team` -- so application
-- code never has to infer "is this row secretly a country" by checking
-- competition_id membership against a hardcoded list (see
-- docs/international-scoring.md Phase 4).
alter table public.clubs
  add column is_national_team boolean not null default false;

comment on column public.clubs.is_national_team is
  'true for a row representing a national team (fixture participant only -- never a fantasy team, never draftable, never owned), set directly from the provider''s own team.national field. Every UI/query that lists clubs generically (filters, dropdowns) must exclude is_national_team = true unless it explicitly wants national teams.';

-- The generic "discovered via an international competition" bucket a
-- national team's clubs.competition_id points at -- bookkeeping only
-- (which sync first created this row), exactly the same loose meaning
-- competition_id already has for a non-Big-Five UEFA club. The REAL
-- scoring-eligibility gate is a FIXTURE's own competition_id against the
-- Phase 3 allowlist (src/domain/football/competition-eligibility.ts),
-- never clubs.competition_id -- a national team plays across many actual
-- tournaments (World Cup, qualifiers, Nations League...), so there is no
-- single meaningful "home competition" for a country the way there is
-- for a real club.
insert into public.competitions (name, code, country)
values ('International Competitions', 'INTL', 'World')
on conflict (code) do nothing;

-- Player <-> national-team association. Deliberately NOT a players
-- column and NOT a reuse of players.club_id -- a player's canonical club
-- must never be reassigned by national-team ingestion (brief's core
-- safety rule). This is a separate, parallel membership fact, populated
-- only by a new ingestion function that resolves identity read-only via
-- provider_mappings and never creates or updates a `players` row (see
-- src/lib/football-ingestion/sync-national-team-squad.ts).
create table public.player_national_teams (
  player_id uuid not null references public.players (id) on delete cascade,
  national_team_club_id uuid not null references public.clubs (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (player_id, national_team_club_id)
);

create index player_national_teams_club_id_idx on public.player_national_teams (national_team_club_id);

create trigger set_player_national_teams_updated_at
  before update on public.player_national_teams
  for each row execute function public.set_updated_at();

comment on table public.player_national_teams is
  'Pass 14: which national-team club row(s) a canonical player may appear for -- used only to extend fixture-lookup/locking (see createRoundLineupSlots, getNextFixtureByClub, getMatchupFixtureIntelligence) to find a player''s international fixtures. Never implies ownership, draftability, or fantasy-team membership -- see league_player_ownership for the real ownership model, which this table has no relationship to at all.';

-- RLS: read-only for authenticated, same convention as every other
-- football table (20260929141143_rls.sql) -- writes are service-role
-- only, via the ingestion CLI. No explicit grants needed: the default-
-- privileges statements in 20260929150824/20260929200914 already apply
-- SELECT (authenticated) / ALL (service_role) to any new table.
alter table public.player_national_teams enable row level security;

create policy "authenticated can read player_national_teams"
  on public.player_national_teams for select
  to authenticated
  using (true);
