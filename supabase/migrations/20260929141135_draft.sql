-- Draft schema readiness — see src/domain/fantasy/types.ts (Draft,
-- DraftOrder, DraftPick). The draft ENGINE (turn order enforcement, pick
-- timers, autopick) is explicitly out of scope this pass; these tables
-- just give it somewhere to persist to later.

create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  -- Current product assumption: a league runs exactly one draft. Revisit
  -- this UNIQUE constraint before ever supporting re-drafts/supplemental
  -- drafts.
  league_id uuid not null unique references public.fantasy_leagues (id) on delete cascade,
  status text not null default 'scheduled' check (status in ('scheduled', 'in_progress', 'completed')),
  type text not null default 'snake' check (type in ('snake')),
  current_round smallint not null default 1 check (current_round > 0),
  current_pick smallint not null default 1 check (current_pick > 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_drafts_updated_at
  before update on public.drafts
  for each row execute function public.set_updated_at();

create table public.draft_orders (
  draft_id uuid not null references public.drafts (id) on delete cascade,
  fantasy_team_id uuid not null references public.fantasy_teams (id) on delete cascade,
  -- 1-indexed position in round 1; snake order reverses each subsequent
  -- round at the application layer, not stored per-round here.
  position smallint not null check (position > 0),
  primary key (draft_id, fantasy_team_id),
  unique (draft_id, position)
);

create table public.draft_picks (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts (id) on delete cascade,
  round smallint not null check (round > 0),
  pick_number smallint not null check (pick_number > 0),
  fantasy_team_id uuid not null references public.fantasy_teams (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete restrict,
  picked_at timestamptz not null default now(),
  unique (draft_id, pick_number),
  -- A player can only be selected once within a single draft (see
  -- docs/domain-model.md invariant #4 — enforced properly by
  -- league_player_ownership's PK; this is a cheap belt-and-suspenders
  -- check at the draft-record level too).
  unique (draft_id, player_id)
);

create index draft_picks_fantasy_team_id_idx on public.draft_picks (fantasy_team_id);
