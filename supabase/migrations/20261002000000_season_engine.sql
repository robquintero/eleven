-- Pass 12A: the Season engine. Canonical hierarchy:
--   League (permanent) -> Season (one competition) -> Fantasy Round -> Matchup.
--
-- `fantasy_rounds.number` is re-scoped to mean "round N OF THE SEASON"
-- (resets to 1 for a new season) rather than "round N of this league ever"
-- -- this is what lets `pairingsForSeasonRound(cycle, round.number)`
-- (src/domain/fantasy/schedule.ts, unchanged, reused as-is) stay correct
-- with zero changes to the scheduler itself. Every currently-existing
-- league's rounds already started at 1, so this is a no-op renumbering
-- for backfilled data -- see the DO block below.
--
-- `matchups` deliberately gets NO new season_id column: a matchup's
-- season is always derivable via fantasy_round_id -> fantasy_rounds.season_id,
-- and duplicating it would be exactly the "unnecessary data duplication"
-- the brief warns against.

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues (id) on delete cascade,
  season_number smallint not null check (season_number > 0),
  status text not null default 'SETUP' check (status in ('SETUP', 'ACTIVE', 'COMPLETED')),
  -- Round-robin cycles: 1 = play everyone once, 2 = twice (default), 3 =
  -- three times. Immutable once the season leaves SETUP (see
  -- set_season_schedule_format below) -- "no destructive mid-season
  -- format changes."
  schedule_cycles smallint not null default 2 check (schedule_cycles in (1, 2, 3)),
  -- Computed once, from the real team count, the moment the season's
  -- first round actually opens (ACTIVE) -- never recomputed afterward,
  -- and null while still in SETUP (team count isn't final until the
  -- draft completes). This is what lets both the progression engine and
  -- the UI answer "round X of Y" without re-deriving team count every
  -- time.
  total_rounds smallint check (total_rounds is null or total_rounds > 0),
  starts_at timestamptz,
  completed_at timestamptz,
  champion_fantasy_team_id uuid references public.fantasy_teams (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (league_id, season_number)
);

-- At most one ACTIVE season per league, enforced by the database (not
-- just application logic) -- a partial unique index, the same technique
-- already used elsewhere in this schema for "at most one of X in state Y."
create unique index seasons_one_active_per_league on public.seasons (league_id) where (status = 'ACTIVE');

create index seasons_league_id_idx on public.seasons (league_id);

alter table public.fantasy_rounds add column season_id uuid references public.seasons (id) on delete cascade;

-- Backfill: every league that already has fantasy_rounds gets exactly one
-- season (season_number 1), ACTIVE, schedule_cycles defaulted to 2.
-- total_rounds is computed generously (never smaller than the rounds that
-- already exist) so this migration can never retroactively make an
-- in-progress test league look "already complete."
do $$
declare
  v_league record;
  v_season_id uuid;
  v_team_count int;
  v_cycle_length int;
  v_computed_total int;
  v_existing_max_round int;
  v_first_round_starts_at timestamptz;
begin
  for v_league in
    select distinct league_id from public.fantasy_rounds
  loop
    select count(*) into v_team_count from public.fantasy_teams where league_id = v_league.league_id;
    v_cycle_length := case when v_team_count < 2 then 1 when v_team_count % 2 = 0 then v_team_count - 1 else v_team_count end;

    select max(number) into v_existing_max_round from public.fantasy_rounds where league_id = v_league.league_id;
    select min(starts_at) into v_first_round_starts_at from public.fantasy_rounds where league_id = v_league.league_id;
    v_computed_total := greatest(v_cycle_length * 2, coalesce(v_existing_max_round, 0));

    insert into public.seasons (league_id, season_number, status, schedule_cycles, total_rounds, starts_at)
    values (v_league.league_id, 1, 'ACTIVE', 2, v_computed_total, v_first_round_starts_at)
    returning id into v_season_id;

    update public.fantasy_rounds set season_id = v_season_id where league_id = v_league.league_id;
  end loop;
end $$;

-- Every round from here on must belong to a season; the backfill above
-- guarantees every EXISTING row already does.
alter table public.fantasy_rounds alter column season_id set not null;

alter table public.fantasy_rounds drop constraint fantasy_rounds_league_id_number_key;
alter table public.fantasy_rounds add constraint fantasy_rounds_season_id_number_key unique (season_id, number);

create index fantasy_rounds_season_id_idx on public.fantasy_rounds (season_id);

-- ---------------------------------------------------------------------
-- RLS: same "league members can read" convention as every other
-- league-scoped table (20260929141143_rls.sql).
-- ---------------------------------------------------------------------
alter table public.seasons enable row level security;

create policy "members can read seasons in their league"
  on public.seasons for select
  to authenticated
  using (
    exists (
      select 1 from public.league_memberships m
      where m.league_id = seasons.league_id
        and m.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- set_season_schedule_format: the one client-facing season-configuration
-- action for Pass 12A. Commissioner-only (auth.uid() resolved internally,
-- never trusted from the client), and only while the league has no
-- season yet at all -- once a season exists (SETUP or ACTIVE), the format
-- is immutable, matching "no destructive mid-season format changes."
-- Season CREATION itself is not a client RPC: it happens automatically
-- the moment a draft completes (src/lib/fantasy-engine/draft-completion.ts),
-- the same trusted-server-code path that already opens round 1 today.
-- ---------------------------------------------------------------------
create or replace function public.set_season_schedule_format(p_league_id uuid, p_cycles smallint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_cycles not in (1, 2, 3) then
    raise exception 'INVALID_SCHEDULE_FORMAT';
  end if;

  if not exists (
    select 1 from public.league_memberships m
    where m.league_id = p_league_id and m.user_id = v_user_id and m.role = 'commissioner'
  ) then
    raise exception 'NOT_COMMISSIONER';
  end if;

  if exists (select 1 from public.seasons where league_id = p_league_id) then
    raise exception 'SEASON_ALREADY_STARTED';
  end if;

  -- Upsert a SETUP placeholder the league's first real season creation
  -- (maybeOpenFirstRound -> ensureFirstRoundOpened -> openNextRound's
  -- own season bootstrap) will pick up and promote to ACTIVE -- see
  -- resolveOrCreateActiveSeason in src/lib/fantasy-engine/rounds.ts.
  insert into public.seasons (league_id, season_number, status, schedule_cycles)
  values (p_league_id, 1, 'SETUP', p_cycles);
end;
$$;

comment on function public.set_season_schedule_format(uuid, smallint) is
  'Commissioner-only, pre-season-only schedule format control (1/2/3 round-robin cycles). Raises NOT_AUTHENTICATED / INVALID_SCHEDULE_FORMAT / NOT_COMMISSIONER / SEASON_ALREADY_STARTED.';

revoke all on function public.set_season_schedule_format(uuid, smallint) from public;
grant execute on function public.set_season_schedule_format(uuid, smallint) to authenticated;
