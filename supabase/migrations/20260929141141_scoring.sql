-- Scoring foundation — see src/domain/fantasy/types.ts (ScoringRule,
-- FantasyPlayerScore). Structural persistence only: no score is
-- calculated by this pass. RAW STATS (player_match_stats) -> ELEVEN
-- SCORING RULES (scoring_rules) -> FANTASY PLAYER SCORE
-- (fantasy_player_scores) — see docs/data-flow.md "Real stats -> Eleven
-- scoring." A provider's own fantasy-points field is never canonical
-- (docs/domain-model.md invariant #10) and has no column anywhere in this
-- schema.

create table public.scoring_rules (
  id uuid primary key default gen_random_uuid(),
  -- NULL = Eleven's global default rule set. A non-null value overrides
  -- the default for that one league. Nullable rather than a separate
  -- "default_scoring_rules" table so the same shape/query works for both.
  league_id uuid references public.fantasy_leagues (id) on delete cascade,
  stat text not null check (
    stat in (
      'goals', 'assists', 'shotsOnTarget', 'chancesCreated', 'tackles',
      'interceptions', 'blocks', 'saves', 'cleanSheet', 'yellowCards',
      'redCards', 'minutesPlayed'
    )
  ),
  multiplier numeric(6, 2) not null,
  -- Optional per-position weight override, e.g. clean sheets score more
  -- for a GK than a MID. Shape: Partial<Record<PlayerPosition, number>>.
  position_modifier jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One rule per stat, per league (or per stat globally, when league_id is
-- null) — a plain UNIQUE constraint can't express "unique, treating NULL
-- as a normal value" (Postgres UNIQUE treats NULLs as all-distinct), so
-- this uses a unique index over a NULL-coalescing expression instead.
create unique index scoring_rules_league_stat_idx
  on public.scoring_rules (coalesce(league_id, '00000000-0000-0000-0000-000000000000'::uuid), stat);

create trigger set_scoring_rules_updated_at
  before update on public.scoring_rules
  for each row execute function public.set_updated_at();

create table public.fantasy_player_scores (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  fixture_id uuid not null references public.fixtures (id) on delete cascade,
  fantasy_round_id uuid not null references public.fantasy_rounds (id) on delete cascade,
  points numeric(8, 2) not null default 0,
  -- Partial<Record<ScoringStat, number>> — a per-stat breakdown, not just
  -- the total, for auditability (docs/data-flow.md).
  breakdown jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now(),
  unique (player_id, fixture_id, fantasy_round_id)
);

create index fantasy_player_scores_fantasy_round_id_idx on public.fantasy_player_scores (fantasy_round_id);
