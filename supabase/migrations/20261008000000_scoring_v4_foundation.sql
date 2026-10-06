-- Dormant V4 infrastructure. NO V4 activation, score update or provider backfill.
-- Existing rounds are pinned to the currently authoritative V3 model. Review
-- legacy rounds before applying on an installation with genuine V1/V2 rounds.
alter table public.player_match_stats
  add column reported_stats jsonb,
  add column participation_club_id uuid references public.clubs(id) on delete restrict,
  add column scoring_position text check (scoring_position in ('GK','DEF','MID','FWD')),
  add constraint player_match_stats_reported_object check (reported_stats is null or jsonb_typeof(reported_stats) = 'object');
comment on column public.player_match_stats.reported_stats is
  'Nullable per-fixture provider counts in normalized names, including explicit zeros. NULL means unavailable, not zero. Legacy columns remain unchanged for V1-V3 reproducibility.';
comment on column public.player_match_stats.scoring_position is
  'Canonical fantasy position captured at first ingestion with V4 fields; preserved on later polls/corrections.';

alter table public.fantasy_rounds
  add column scoring_rule_version text not null default 'ELEVEN_STANDARD_V3'
  check (scoring_rule_version in ('ELEVEN_STANDARD_V1','ELEVEN_STANDARD_V2','ELEVEN_STANDARD_V3','ELEVEN_STANDARD_V4'));

create table public.scoring_version_activations (
  effective_from timestamptz primary key,
  scoring_rule_version text not null check (scoring_rule_version in ('ELEVEN_STANDARD_V1','ELEVEN_STANDARD_V2','ELEVEN_STANDARD_V3','ELEVEN_STANDARD_V4'))
);
insert into public.scoring_version_activations values ('-infinity', 'ELEVEN_STANDARD_V3');
alter table public.scoring_version_activations enable row level security;
revoke all on public.scoring_version_activations from public, anon, authenticated;
grant select, insert on public.scoring_version_activations to service_role;
-- Undo broad service-role default privileges: policy is append-only.
revoke update, delete, truncate, references, trigger on public.scoring_version_activations from service_role;

create function public.guard_scoring_activation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then raise exception 'SCORING_ACTIVATIONS_APPEND_ONLY'; end if;
  if new.effective_from <= now()
     or extract(isodow from new.effective_from at time zone 'UTC') <> 2
     or (new.effective_from at time zone 'UTC')::time <> time '00:00:00'
     or exists (select 1 from public.fantasy_rounds r where r.ends_at > new.effective_from)
     or exists (select 1 from public.scoring_version_activations a where a.effective_from >= new.effective_from)
  then raise exception 'ACTIVATION_REQUIRES_NEW_FUTURE_ROUND_BOUNDARY'; end if;
  -- Serialize activation with round creation; repeat the check after lock.
  perform pg_catalog.pg_advisory_xact_lock(441104);
  if exists (select 1 from public.fantasy_rounds r where r.ends_at > new.effective_from)
     or exists (select 1 from public.scoring_version_activations a where a.effective_from >= new.effective_from)
  then raise exception 'ACTIVATION_REQUIRES_NEW_FUTURE_ROUND_BOUNDARY'; end if;
  return new;
end $$;

create function public.pin_round_scoring_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.scoring_rule_version is distinct from old.scoring_rule_version
       or new.starts_at is distinct from old.starts_at
       or new.ends_at is distinct from old.ends_at
    then raise exception 'ROUND_SCORING_AND_WINDOW_IMMUTABLE'; end if;
  else
    perform pg_catalog.pg_advisory_xact_lock(441104);
    select a.scoring_rule_version into new.scoring_rule_version
      from public.scoring_version_activations a where a.effective_from <= new.starts_at
      order by a.effective_from desc limit 1;
    if new.scoring_rule_version is null then raise exception 'NO_ROUND_SCORING_POLICY'; end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_scoring_activation() from public, anon, authenticated;
revoke all on function public.pin_round_scoring_version() from public, anon, authenticated;
create trigger guard_scoring_activation before insert or update or delete on public.scoring_version_activations
  for each row execute function public.guard_scoring_activation();
create trigger pin_round_scoring_version before insert or update on public.fantasy_rounds
  for each row execute function public.pin_round_scoring_version();
-- Existing football-table RLS/grants are unchanged. No index or precision
-- changes: points/live_points/final_points already use numeric(8,2).

-- Read-only public projection of the private policy. Callers cannot supply
-- an as-of clock or observe scheduled future activations through this RPC.
create function public.get_catalog_scoring_version() returns text
language sql stable security definer set search_path = '' as $$
  select a.scoring_rule_version from public.scoring_version_activations a
  where a.effective_from <= pg_catalog.statement_timestamp()
  order by a.effective_from desc limit 1;
$$;
revoke all on function public.get_catalog_scoring_version() from public, anon, authenticated;
grant execute on function public.get_catalog_scoring_version() to authenticated, service_role;
