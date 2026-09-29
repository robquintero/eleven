-- Real-football structural tables — see src/domain/football/types.ts and
-- docs/domain-model.md. Empty/minimally seeded until a later ingestion
-- pass; these exist now so the fantasy tables below have something real
-- to reference by foreign key.
--
-- IMPORTANT (docs/domain-model.md invariant #9): provider identifiers are
-- never used as primary keys anywhere in this file. See provider_mappings
-- at the bottom, which is the only place an external id format appears.

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  country text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_competitions_updated_at
  before update on public.competitions
  for each row execute function public.set_updated_at();

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete restrict,
  name text not null,
  short_name text not null,
  code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, code)
);

create index clubs_competition_id_idx on public.clubs (competition_id);

create trigger set_clubs_updated_at
  before update on public.clubs
  for each row execute function public.set_updated_at();

create table public.players (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete restrict,
  competition_id uuid not null references public.competitions (id) on delete restrict,
  name text not null,
  short_name text not null,
  position text not null check (position in ('GK', 'DEF', 'MID', 'FWD')),
  shirt_number smallint check (shirt_number between 1 and 99),
  nationality text,
  active boolean not null default true,
  availability_status text check (availability_status in ('available', 'doubtful', 'injured', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
  -- Deliberately no fantasy-owner column of any kind — see docs/domain-model.md
  -- invariant #1/#2. Ownership lives entirely in league_player_ownership.
);

create index players_club_id_idx on public.players (club_id);
create index players_competition_id_idx on public.players (competition_id);

create trigger set_players_updated_at
  before update on public.players
  for each row execute function public.set_updated_at();

create table public.fixtures (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete restrict,
  home_club_id uuid not null references public.clubs (id) on delete restrict,
  away_club_id uuid not null references public.clubs (id) on delete restrict,
  kickoff_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'ht', 'final', 'postponed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (home_club_id <> away_club_id)
);

create index fixtures_competition_id_idx on public.fixtures (competition_id);
create index fixtures_kickoff_at_idx on public.fixtures (kickoff_at);

create trigger set_fixtures_updated_at
  before update on public.fixtures
  for each row execute function public.set_updated_at();

-- Raw, unweighted stats. NEVER Eleven fantasy points — see
-- docs/data-flow.md "Real stats -> Eleven scoring" and the fantasy_player_scores
-- table in 20260929141141_scoring.sql, which is the only place points live.
create table public.player_match_stats (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  fixture_id uuid not null references public.fixtures (id) on delete cascade,
  minutes smallint not null default 0 check (minutes between 0 and 120),
  goals smallint not null default 0 check (goals >= 0),
  assists smallint not null default 0 check (assists >= 0),
  shots_on_target smallint not null default 0 check (shots_on_target >= 0),
  chances_created smallint not null default 0 check (chances_created >= 0),
  tackles smallint not null default 0 check (tackles >= 0),
  interceptions smallint not null default 0 check (interceptions >= 0),
  blocks smallint not null default 0 check (blocks >= 0),
  saves smallint not null default 0 check (saves >= 0),
  yellow_cards smallint not null default 0 check (yellow_cards between 0 and 2),
  red_cards smallint not null default 0 check (red_cards between 0 and 1),
  clean_sheet boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, fixture_id)
);

create index player_match_stats_fixture_id_idx on public.player_match_stats (fixture_id);

create trigger set_player_match_stats_updated_at
  before update on public.player_match_stats
  for each row execute function public.set_updated_at();

-- Isolates external provider identity from every canonical id in the
-- schema (docs/domain-model.md invariant #9). No provider is selected yet
-- — this table just exists so a later ingestion pass has somewhere to
-- resolve external ids into Eleven's own uuids without ever writing a
-- provider id into a primary key.
--
-- internal_entity_id is deliberately NOT a foreign key: it points at one
-- of four different tables depending on internal_entity_type, and Postgres
-- has no native polymorphic FK. Referential integrity for this column is
-- an application-layer concern for the ingestion pass that eventually
-- writes to this table.
create table public.provider_mappings (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  internal_entity_type text not null check (internal_entity_type in ('competition', 'club', 'player', 'fixture')),
  internal_entity_id uuid not null,
  external_id text not null,
  created_at timestamptz not null default now(),
  -- One external record maps to exactly one internal record...
  unique (provider, internal_entity_type, external_id),
  -- ...and one internal record has exactly one external id per provider,
  -- so the mapping is unambiguous in both directions.
  unique (provider, internal_entity_type, internal_entity_id)
);

create index provider_mappings_internal_entity_idx
  on public.provider_mappings (internal_entity_type, internal_entity_id);
