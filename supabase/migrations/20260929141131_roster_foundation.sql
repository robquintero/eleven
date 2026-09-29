-- Roster/ownership/lineup foundation — see src/domain/fantasy/types.ts
-- (RosterEntry, LeaguePlayerOwnership, FantasyRound, LineupSlot) and
-- docs/domain-model.md invariants #1-#5. Draft/waiver/trade *engines* are
-- not implemented this pass; these tables exist so ownership has somewhere
-- real to live once they are.

-- A player can pass through many roster_entries over time (added, dropped,
-- re-added) — this table is the historical/audit record of each stint, not
-- the current-ownership answer. That's league_player_ownership, below.
create table public.roster_entries (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues (id) on delete cascade,
  fantasy_team_id uuid not null references public.fantasy_teams (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete restrict,
  acquisition_type text not null check (acquisition_type in ('draft', 'waiver', 'free_agent', 'trade')),
  acquired_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'dropped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Supports the composite FK from league_player_ownership below: lets
  -- that table's (roster_entry_id, league_id, fantasy_team_id, player_id)
  -- reference guarantee an ownership row can never point at a roster entry
  -- from the wrong league/team/player.
  unique (id, league_id, fantasy_team_id, player_id)
);

create index roster_entries_fantasy_team_id_idx on public.roster_entries (fantasy_team_id);
create index roster_entries_league_player_idx on public.roster_entries (league_id, player_id);

create trigger set_roster_entries_updated_at
  before update on public.roster_entries
  for each row execute function public.set_updated_at();

-- THE critical table (docs/domain-model.md invariant #1/#2): the single
-- source of truth for "who owns this player, in this league." Primary key
-- is (league_id, player_id) itself, which is what makes "Harry Kane can
-- only have one owner inside The Boardroom, but a different owner in
-- another league at the same time" a database guarantee rather than an
-- application-level hope.
create table public.league_player_ownership (
  league_id uuid not null,
  player_id uuid not null,
  fantasy_team_id uuid not null references public.fantasy_teams (id) on delete cascade,
  roster_entry_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (league_id, player_id),
  -- One ownership row per roster entry — a single roster_entry can't be
  -- "the" ownership record for two different (league, player) pairs.
  unique (roster_entry_id),
  -- The composite FK: guarantees the roster_entry this row points at
  -- actually belongs to the same league/team/player this row claims.
  -- Contradictory ownership (an ownership row whose roster_entry_id
  -- secretly belongs to a different team or player) is structurally
  -- impossible, not just application-enforced.
  foreign key (roster_entry_id, league_id, fantasy_team_id, player_id)
    references public.roster_entries (id, league_id, fantasy_team_id, player_id)
    on delete cascade
);

create index league_player_ownership_team_idx on public.league_player_ownership (league_id, fantasy_team_id);

comment on table public.league_player_ownership is
  'Single source of truth for current ownership. PRIMARY KEY (league_id, player_id) is what enforces docs/domain-model.md invariant #1: one owner per player per league, while the same player can be owned in a different league at the same time.';

create table public.fantasy_rounds (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues (id) on delete cascade,
  -- Eleven-defined date window, deliberately NOT an official competition
  -- gameweek number — see docs/domain-model.md "Player locking" and the
  -- module comment on FantasyRound in src/domain/fantasy/types.ts.
  number smallint not null check (number > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'upcoming' check (status in ('upcoming', 'in_progress', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, number),
  check (ends_at > starts_at)
);

create index fantasy_rounds_league_id_idx on public.fantasy_rounds (league_id);

create trigger set_fantasy_rounds_updated_at
  before update on public.fantasy_rounds
  for each row execute function public.set_updated_at();

create table public.lineup_slots (
  id uuid primary key default gen_random_uuid(),
  roster_entry_id uuid not null references public.roster_entries (id) on delete cascade,
  fantasy_round_id uuid not null references public.fantasy_rounds (id) on delete cascade,
  slot text not null check (slot in ('GK', 'DEF', 'MID', 'FWD', 'BENCH')),
  starter boolean not null default false,
  -- Eleven uses player-level locking (set the moment *that player's*
  -- fixture kicks off), not one global weekly lock — see "Player locking"
  -- in docs/domain-model.md. Locking behavior itself isn't implemented
  -- this pass; this column just exists so it can be.
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (roster_entry_id, fantasy_round_id)
);

create index lineup_slots_fantasy_round_id_idx on public.lineup_slots (fantasy_round_id);

create trigger set_lineup_slots_updated_at
  before update on public.lineup_slots
  for each row execute function public.set_updated_at();
