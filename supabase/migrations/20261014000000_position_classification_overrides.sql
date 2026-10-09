-- Pass 2 (position accuracy): additive-only canonical position system.
--
-- Does NOT touch players.position -- that column remains exactly what it
-- always was, raw provider evidence, never overwritten. A correction is
-- recorded here instead, as a separate, auditable override. Nothing reads
-- this table yet (no RPC, no UI, no scoring/draft/lineup code path is
-- wired to it in this migration) -- adding it changes no live behavior.
-- See src/domain/fantasy/position-classification.ts for the precedence
-- rule any future caller must use: approved override > verified detailed
-- evidence (none exists today) > provider broad classification > explicit
-- unresolved state. NOT YET APPLIED to any environment as of this commit.

create table public.player_position_overrides (
  player_id uuid primary key references public.players (id) on delete cascade,
  -- Snapshot of players.position at the moment the override was recorded.
  -- Provenance only -- never re-derived, never used to compute the
  -- resolved position (that's always override_position while this row
  -- exists). Lets a reviewer see what the provider said vs. what was
  -- overridden, even after a later provider resync changes players.position.
  provider_position_at_override text not null
    check (provider_position_at_override in ('GK', 'DEF', 'MID', 'FWD')),
  override_position text not null
    check (override_position in ('GK', 'DEF', 'MID', 'FWD')),
  reason text not null,
  evidence_source text not null
    check (evidence_source in (
      'match_appearance_majority',
      'detailed_lineup_evidence',
      'manual_review'
    )),
  confidence text not null
    check (confidence in ('CONFIRMED', 'LIKELY', 'AMBIGUOUS')),
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_player_position_overrides_updated_at
  before update on public.player_position_overrides
  for each row execute function public.set_updated_at();

comment on table public.player_position_overrides is
  'Approved manual corrections to a player''s canonical fantasy position. One row per player (upserted on correction, never duplicated) -- the current override, not a revision history. players.position is never overwritten; resolve the effective position via src/domain/fantasy/position-classification.ts''s precedence rule.';

alter table public.player_position_overrides enable row level security;
revoke all on public.player_position_overrides from public, anon, authenticated;
-- Read-only for authenticated clients: any future canonical-position
-- resolution in app code needs to see active overrides. No insert/update/
-- delete grant to authenticated yet -- this pass ships no RPC to write
-- one; that's deliberately a separate, explicitly-approved change.
grant select on public.player_position_overrides to authenticated;
grant select, insert, update on public.player_position_overrides to service_role;
revoke delete, truncate, references, trigger on public.player_position_overrides from service_role;

create policy player_position_overrides_select_authenticated
  on public.player_position_overrides for select
  to authenticated
  using (true);
