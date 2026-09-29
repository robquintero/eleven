-- Head-to-head matchups — see src/domain/fantasy/types.ts (Matchup,
-- MatchupScore). Scoring itself is not implemented this pass; these
-- tables exist so it has somewhere real to write to later.

create table public.matchups (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues (id) on delete cascade,
  fantasy_round_id uuid not null references public.fantasy_rounds (id) on delete cascade,
  home_fantasy_team_id uuid not null references public.fantasy_teams (id) on delete cascade,
  away_fantasy_team_id uuid not null references public.fantasy_teams (id) on delete cascade,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'final')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (home_fantasy_team_id <> away_fantasy_team_id),
  -- A team appears at most once as the home side, and at most once as the
  -- away side, per round. (Doesn't prevent a team being home in one
  -- matchup and away in a *different* matchup the same round, which
  -- shouldn't happen in a single round-robin round but isn't this pass's
  -- scheduling logic to enforce.)
  unique (fantasy_round_id, home_fantasy_team_id),
  unique (fantasy_round_id, away_fantasy_team_id)
);

create index matchups_fantasy_round_id_idx on public.matchups (fantasy_round_id);
create index matchups_league_id_idx on public.matchups (league_id);

create trigger set_matchups_updated_at
  before update on public.matchups
  for each row execute function public.set_updated_at();

create table public.matchup_scores (
  id uuid primary key default gen_random_uuid(),
  matchup_id uuid not null references public.matchups (id) on delete cascade,
  fantasy_team_id uuid not null references public.fantasy_teams (id) on delete cascade,
  live_points numeric(8, 2) not null default 0,
  -- Derived/optional — never canonical, see docs/domain-model.md
  -- "Projections are not canonical."
  projected_points numeric(8, 2),
  final_points numeric(8, 2),
  updated_at timestamptz not null default now(),
  unique (matchup_id, fantasy_team_id)
);

create trigger set_matchup_scores_updated_at
  before update on public.matchup_scores
  for each row execute function public.set_updated_at();
