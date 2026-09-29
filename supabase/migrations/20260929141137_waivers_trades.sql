-- Waivers and trades schema readiness — see src/domain/fantasy/types.ts
-- (WaiverClaim, Trade, TradeAsset). Processing engines are out of scope
-- this pass.

create table public.waiver_claims (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues (id) on delete cascade,
  fantasy_team_id uuid not null references public.fantasy_teams (id) on delete cascade,
  target_player_id uuid not null references public.players (id) on delete restrict,
  drop_player_id uuid references public.players (id) on delete restrict,
  priority smallint not null check (priority > 0),
  status text not null default 'pending' check (status in ('pending', 'won', 'lost', 'cancelled')),
  submitted_at timestamptz not null default now(),
  processed_at timestamptz,
  check (drop_player_id is null or drop_player_id <> target_player_id)
);

create index waiver_claims_league_status_idx on public.waiver_claims (league_id, status);
create index waiver_claims_fantasy_team_id_idx on public.waiver_claims (fantasy_team_id);

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues (id) on delete cascade,
  proposing_team_id uuid not null references public.fantasy_teams (id) on delete cascade,
  receiving_team_id uuid not null references public.fantasy_teams (id) on delete cascade,
  status text not null default 'draft' check (
    status in ('draft', 'pending', 'accepted', 'rejected', 'countered', 'cancelled', 'expired', 'completed')
  ),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  check (proposing_team_id <> receiving_team_id)
);

create index trades_league_id_idx on public.trades (league_id);

-- One `trades` row + many `trade_assets` rows (rather than fixed
-- player_a_id/player_b_id columns on `trades`) is what lets a single trade
-- express 1-for-1, 2-for-1, 2-for-2, and any future N-for-M shape without
-- a different schema per shape — see docs/data-flow.md "Trade execution."
create table public.trade_assets (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades (id) on delete cascade,
  from_team_id uuid not null references public.fantasy_teams (id) on delete cascade,
  to_team_id uuid not null references public.fantasy_teams (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete restrict,
  check (from_team_id <> to_team_id),
  unique (trade_id, player_id)
);

create index trade_assets_trade_id_idx on public.trade_assets (trade_id);
