-- Fantasy leagues, memberships, and teams — see src/domain/fantasy/types.ts
-- (FantasyLeague, LeagueSettings, LeagueMembership, FantasyTeam).
--
-- Writes to all three tables happen exclusively through the
-- create_league()/join_league_by_invite_code() functions in
-- 20260929141145_functions.sql, not direct client inserts — see
-- 20260929141143_rls.sql for why (atomicity + authorization live in one
-- trusted place instead of three separate RLS policies that would need to
-- agree with each other).

-- League settings: a restrained JSONB field (option B from the brief),
-- not seven individual columns. Chosen because every current setting
-- (maxTeams/squadSize/starterCount/waiverMode/playoffEnabled/draftType/
-- pickTimerSeconds) is a configuration knob the app reads/writes as a
-- whole object (LeagueSettings in src/domain/fantasy/types.ts) and none of
-- them need row-level SQL filtering or indexing yet. Revisit as explicit
-- columns if a setting ever needs to be queried/filtered directly.
create table public.fantasy_leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  invite_code text not null unique,
  status text not null default 'draft' check (status in ('draft', 'active', 'completed', 'archived')),
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  settings jsonb not null default '{
    "maxTeams": 10,
    "squadSize": 16,
    "starterCount": 11,
    "waiverMode": "priority",
    "playoffEnabled": true,
    "draftType": "snake",
    "pickTimerSeconds": 60
  }'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.fantasy_leagues.settings is
  'LeagueSettings (src/domain/fantasy/types.ts) as JSONB — see the comment above this table for why.';

create trigger set_fantasy_leagues_updated_at
  before update on public.fantasy_leagues
  for each row execute function public.set_updated_at();

-- No synthetic id: (league_id, user_id) is the natural key, and making it
-- the primary key gives the "one membership per user per league"
-- invariant for free instead of needing a separate UNIQUE constraint.
create table public.league_memberships (
  league_id uuid not null references public.fantasy_leagues (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'manager' check (role in ('manager', 'commissioner')),
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

create index league_memberships_user_id_idx on public.league_memberships (user_id);

create table public.fantasy_teams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  abbreviation text not null check (char_length(abbreviation) between 2 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Current product assumption: exactly one fantasy team per user per
  -- league. Revisit this constraint before ever supporting multiple teams
  -- per manager in one league.
  unique (league_id, owner_user_id),
  unique (league_id, name)
);

create index fantasy_teams_league_id_idx on public.fantasy_teams (league_id);

create trigger set_fantasy_teams_updated_at
  before update on public.fantasy_teams
  for each row execute function public.set_updated_at();
