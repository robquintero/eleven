-- Auditable transaction log + lightweight domain events — see
-- src/domain/fantasy/types.ts (Transaction) and src/domain/events/types.ts
-- (DomainEvent). NOT event sourcing: Postgres tables above remain the
-- source of truth, this is a side channel for "tell someone something
-- happened" — see the module comment in src/domain/events/types.ts and
-- docs/architecture.md "Domain events — not event sourcing."

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues (id) on delete cascade,
  type text not null check (
    type in ('draft_pick', 'free_agent_add', 'waiver_add', 'drop', 'trade', 'commissioner_move')
  ),
  actor_user_id uuid references auth.users (id) on delete set null,
  fantasy_team_id uuid references public.fantasy_teams (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Free-form pointer back to the source record, e.g. a trade or
  -- draft-pick id. Not a foreign key: the source table varies by `type`.
  reference text,
  metadata jsonb
);

create index transactions_league_id_created_at_idx on public.transactions (league_id, created_at desc);

create table public.domain_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  league_id uuid references public.fantasy_leagues (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  fantasy_team_id uuid references public.fantasy_teams (id) on delete set null,
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index domain_events_league_id_created_at_idx on public.domain_events (league_id, created_at desc);

comment on table public.domain_events is
  'Append-only log of meaningful actions. Will eventually drive an OPERATIONS_FEED UI (OperationsFeedEntry in src/domain/events/types.ts is a separate, presentation-shaped view over this data, not persisted here directly) — no feed UI reads this table yet.';
