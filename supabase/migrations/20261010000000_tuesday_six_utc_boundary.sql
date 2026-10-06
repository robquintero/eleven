-- Future scheduled scoring policies share the Tuesday 06:00 UTC calendar.
-- Metadata-only: no round, activation, score, roster or fixture rows change.
-- Preserve the existing immediate-V4 exception and all settlement guards.
create or replace function public.guard_scoring_activation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then raise exception 'SCORING_ACTIVATIONS_APPEND_ONLY'; end if;
  perform pg_catalog.pg_advisory_xact_lock(441104);
  -- An exact transaction-clock V4 activation supersedes the old delay;
  -- arbitrary past timestamps are still forbidden. Existing future V4
  -- rows remain as harmless provenance rather than being deleted.
  if new.effective_from = pg_catalog.transaction_timestamp() and new.scoring_rule_version = 'ELEVEN_STANDARD_V4' then
    if exists (select 1 from public.scoring_version_activations where effective_from > new.effective_from and scoring_rule_version <> 'ELEVEN_STANDARD_V4')
    then raise exception 'CONFLICTING_FUTURE_SCORING_POLICY'; end if;
    return new;
  end if;
  if new.effective_from <= now()
     or extract(isodow from new.effective_from at time zone 'UTC') <> 2
     or (new.effective_from at time zone 'UTC')::time <> time '06:00:00'
     or exists (select 1 from public.fantasy_rounds where ends_at > new.effective_from)
     or exists (select 1 from public.scoring_version_activations where effective_from >= new.effective_from)
  then raise exception 'ACTIVATION_REQUIRES_NEW_FUTURE_ROUND_BOUNDARY'; end if;
  return new;
end $$;
