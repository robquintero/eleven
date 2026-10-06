-- Player analytics use the current canonical model. Settled fantasy results
-- are a separate immutable record. This migration does NOT activate V4.
create table public.football_provider_snapshots (
  provider text not null,
  endpoint text not null check (endpoint in ('/fixtures', '/fixtures/players')),
  external_id text not null,
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  fetched_at timestamptz not null,
  observed_fixture_status text check (observed_fixture_status in ('scheduled','live','ht','final','postponed')),
  schema_version integer not null default 1 check (schema_version = 1),
  primary key (provider, endpoint, external_id)
);
alter table public.football_provider_snapshots enable row level security;
revoke all on public.football_provider_snapshots from public, anon, authenticated;
grant select, insert, update on public.football_provider_snapshots to service_role;
revoke delete, truncate, references, trigger on public.football_provider_snapshots from service_role;
comment on table public.football_provider_snapshots is
  'Latest complete received player-stat envelope or fixture item, including unmapped players and unused fields. Natural-key corrections replace a snapshot, never duplicate it.';

-- Both old deployed workers and the new application must respect settlement.
create function public.guard_settled_matchup_scores() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target uuid; settled boolean; round_id uuid; round_version text; expected numeric;
begin
  perform pg_catalog.pg_advisory_xact_lock(441104);
  target := case when tg_op = 'INSERT' then new.matchup_id else old.matchup_id end;
  perform 1 from public.matchups where id = target for update;
  select m.status = 'final' or r.status = 'completed' into settled
    from public.matchups m join public.fantasy_rounds r on r.id = m.fantasy_round_id where m.id = target;
  if tg_op <> 'INSERT' then settled := settled or old.final_points is not null; end if;
  if tg_op <> 'DELETE' and new.final_points is not null and not settled then
    select r.id, r.scoring_rule_version into round_id, round_version
      from public.matchups m join public.fantasy_rounds r on r.id = m.fantasy_round_id where m.id = target;
    if round_version = 'ELEVEN_STANDARD_V4' then
      -- No release-window worker can settle stale V3 totals or zero out
      -- known starter performances while V4 evidence is still being filled.
      if exists (
        select 1 from public.lineup_slots l join public.roster_entries re on re.id = l.roster_entry_id
        join public.player_match_stats ps on ps.player_id = re.player_id
        join public.fixtures f on f.id = ps.fixture_id join public.competitions c on c.id = f.competition_id join public.fantasy_rounds r on r.id = l.fantasy_round_id
        where l.fantasy_round_id = round_id and l.starter and re.fantasy_team_id = new.fantasy_team_id
          and f.kickoff_at >= r.starts_at and f.kickoff_at < r.ends_at and f.kickoff_at >= re.acquired_at
          and c.code = any(array['ENG', 'ESP', 'GER', 'ITA', 'FRA', 'UCL', 'UEL', 'FIFA_WC', 'FIFA_WCQ_EUR', 'FIFA_WCQ_AFR', 'FIFA_WCQ_ASIA', 'FIFA_WCQ_CONCACAF', 'FIFA_WCQ_SAM', 'FIFA_WCQ_OFC', 'FIFA_WCQ_PLAYOFF', 'UEFA_EURO', 'UEFA_EURO_Q', 'UEFA_NL', 'COPA_AMERICA', 'AFCON', 'AFCON_Q', 'AFC_ASIAN_CUP', 'AFC_ASIAN_CUP_Q', 'CONCACAF_GOLD_CUP', 'CONCACAF_GOLD_CUP_Q', 'CONCACAF_NL', 'CONCACAF_NL_Q', 'OFC_NATIONS_CUP'])
          and (c.code in ('ENG','ESP','GER','ITA','FRA','UCL','UEL') or f.kickoff_at >= timestamptz '2026-09-24 16:00:00+00')
          and not exists (select 1 from public.fantasy_player_scores s where s.player_id = ps.player_id and s.fixture_id = f.id and s.scoring_rule_version = 'ELEVEN_STANDARD_V4')
      ) then raise exception 'V4_SETTLEMENT_EVIDENCE_NOT_READY'; end if;
      select coalesce(sum(s.points), 0) into expected
        from public.lineup_slots l join public.roster_entries re on re.id = l.roster_entry_id
        join public.fantasy_player_scores s on s.player_id = re.player_id and s.scoring_rule_version = 'ELEVEN_STANDARD_V4'
        join public.fixtures f on f.id = s.fixture_id join public.competitions c on c.id = f.competition_id join public.fantasy_rounds r on r.id = l.fantasy_round_id
        where l.fantasy_round_id = round_id and l.starter and re.fantasy_team_id = new.fantasy_team_id
          and f.kickoff_at >= r.starts_at and f.kickoff_at < r.ends_at and f.kickoff_at >= re.acquired_at
          and c.code = any(array['ENG', 'ESP', 'GER', 'ITA', 'FRA', 'UCL', 'UEL', 'FIFA_WC', 'FIFA_WCQ_EUR', 'FIFA_WCQ_AFR', 'FIFA_WCQ_ASIA', 'FIFA_WCQ_CONCACAF', 'FIFA_WCQ_SAM', 'FIFA_WCQ_OFC', 'FIFA_WCQ_PLAYOFF', 'UEFA_EURO', 'UEFA_EURO_Q', 'UEFA_NL', 'COPA_AMERICA', 'AFCON', 'AFCON_Q', 'AFC_ASIAN_CUP', 'AFC_ASIAN_CUP_Q', 'CONCACAF_GOLD_CUP', 'CONCACAF_GOLD_CUP_Q', 'CONCACAF_NL', 'CONCACAF_NL_Q', 'OFC_NATIONS_CUP'])
          and (c.code in ('ENG','ESP','GER','ITA','FRA','UCL','UEL') or f.kickoff_at >= timestamptz '2026-09-24 16:00:00+00');
      if new.final_points is distinct from expected then raise exception 'V4_SETTLEMENT_TOTAL_MISMATCH'; end if;
    end if;
  end if;
  if settled then
    if tg_op <> 'UPDATE' then raise exception 'SETTLED_FANTASY_RESULT_IMMUTABLE'; end if;
    if (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at')
    then raise exception 'SETTLED_FANTASY_RESULT_IMMUTABLE'; end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger guard_settled_matchup_scores before insert or update or delete on public.matchup_scores
  for each row execute function public.guard_settled_matchup_scores();

create function public.guard_settled_matchups() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.matchup_scores where matchup_id = old.id and final_points is not null) then
    if tg_op = 'DELETE' then raise exception 'SETTLED_FANTASY_MATCHUP_IMMUTABLE'; end if;
    if (to_jsonb(new) - 'updated_at' - 'status') is distinct from (to_jsonb(old) - 'updated_at' - 'status')
    then raise exception 'SETTLED_FANTASY_MATCHUP_IMMUTABLE'; end if;
  end if;
  if tg_op = 'UPDATE' and new.status = 'final' and old.status <> 'final' then
    if (select count(*) from public.matchup_scores where matchup_id = old.id and final_points is not null and fantasy_team_id in(old.home_fantasy_team_id, old.away_fantasy_team_id)) <> 2
    then raise exception 'MATCHUP_SETTLEMENT_INCOMPLETE'; end if;
  end if;
  if old.status = 'final' or exists (select 1 from public.fantasy_rounds where id = old.fantasy_round_id and status = 'completed') then
    if tg_op = 'DELETE' then raise exception 'SETTLED_FANTASY_MATCHUP_IMMUTABLE'; end if;
    if (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at')
    then raise exception 'SETTLED_FANTASY_MATCHUP_IMMUTABLE'; end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger guard_settled_matchups before update or delete on public.matchups
  for each row execute function public.guard_settled_matchups();

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
     or (new.effective_from at time zone 'UTC')::time <> time '00:00:00'
     or exists (select 1 from public.fantasy_rounds where ends_at > new.effective_from)
     or exists (select 1 from public.scoring_version_activations where effective_from >= new.effective_from)
  then raise exception 'ACTIVATION_REQUIRES_NEW_FUTURE_ROUND_BOUNDARY'; end if;
  return new;
end $$;

create or replace function public.pin_round_scoring_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'completed' then raise exception 'SETTLED_FANTASY_ROUND_IMMUTABLE'; end if;
    return old;
  elsif tg_op = 'UPDATE' then
    if new.status = 'completed' and old.status <> 'completed' and exists (
      select 1 from public.matchups m where m.fantasy_round_id = old.id and
        (m.status <> 'final' or (select count(*) from public.matchup_scores s where s.matchup_id = m.id and s.final_points is not null and s.fantasy_team_id in(m.home_fantasy_team_id,m.away_fantasy_team_id)) <> 2)
    ) then raise exception 'ROUND_SETTLEMENT_INCOMPLETE'; end if;
    if old.status = 'completed' and (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at')
    then raise exception 'SETTLED_FANTASY_ROUND_IMMUTABLE'; end if;
    if new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at
    then raise exception 'ROUND_SCORING_AND_WINDOW_IMMUTABLE'; end if;
    if new.scoring_rule_version is distinct from old.scoring_rule_version then
      if new.scoring_rule_version <> public.get_catalog_scoring_version()
         or exists (select 1 from public.matchups m where m.fantasy_round_id = old.id and
           (m.status = 'final' or exists(select 1 from public.matchup_scores s where s.matchup_id = m.id and s.final_points is not null)))
      then raise exception 'SETTLED_OR_NONCANONICAL_ROUND_VERSION'; end if;
    end if;
  else
    perform pg_catalog.pg_advisory_xact_lock(441104);
    select a.scoring_rule_version into new.scoring_rule_version from public.scoring_version_activations a
      where a.effective_from <= greatest(new.starts_at, pg_catalog.statement_timestamp())
      order by a.effective_from desc limit 1;
    if new.scoring_rule_version is null then raise exception 'NO_ROUND_SCORING_POLICY'; end if;
  end if;
  return new;
end $$;
drop trigger pin_round_scoring_version on public.fantasy_rounds;
create trigger pin_round_scoring_version before insert or update or delete on public.fantasy_rounds
  for each row execute function public.pin_round_scoring_version();

-- Explicit trusted release operation, atomic policy + unfinished round switch.
-- A mixed-settlement round requires a separate reviewed treatment; never guess.
create function public.activate_scoring_v4_now() returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare boundary timestamptz := pg_catalog.transaction_timestamp();
begin
  perform pg_catalog.pg_advisory_xact_lock(441104);
  perform 1 from public.fantasy_rounds where status <> 'completed' for update;
  perform 1 from public.matchups m join public.fantasy_rounds r on r.id = m.fantasy_round_id where r.status <> 'completed' for update of m;
  if exists (select 1 from public.matchups m join public.fantasy_rounds r on r.id = m.fantasy_round_id
    where r.status <> 'completed' and (m.status = 'final' or exists(select 1 from public.matchup_scores s where s.matchup_id = m.id and s.final_points is not null)))
  then raise exception 'MIXED_SETTLEMENT_STOP'; end if;
  if public.get_catalog_scoring_version() <> 'ELEVEN_STANDARD_V4' then
    insert into public.scoring_version_activations values (boundary, 'ELEVEN_STANDARD_V4');
  end if;
  update public.fantasy_rounds set scoring_rule_version = 'ELEVEN_STANDARD_V4'
    where status <> 'completed' and scoring_rule_version <> 'ELEVEN_STANDARD_V4';
  return boundary;
end $$;
revoke all on function public.guard_settled_matchup_scores() from public, anon, authenticated;
revoke all on function public.guard_settled_matchups() from public, anon, authenticated;
revoke all on function public.activate_scoring_v4_now() from public, anon, authenticated;
grant execute on function public.activate_scoring_v4_now() to service_role;

-- Provider tournament labels are not all domestic season starting years:
-- AFCON qualifying is 2027; the current CONCACAF campaign is labeled 2025.
-- V4 catalog evaluation includes eligible international performances in the
-- actual 2026–27 date window. V1/V2/V3 retain the exact old season predicate.
create or replace function public.get_player_score_totals(
  p_season int, p_version text, p_player_ids uuid[] default null
) returns table(player_id uuid, total_points numeric, appearances bigint)
language sql stable security invoker set search_path = '' as $$
  select s.player_id, sum(s.points), count(*)
  from public.fantasy_player_scores s
  join public.fixtures f on f.id = s.fixture_id
  join public.competitions c on c.id = f.competition_id
  where s.scoring_rule_version = p_version
    and (p_player_ids is null or s.player_id = any(p_player_ids))
    and (
      (p_version <> 'ELEVEN_STANDARD_V4' and f.season = p_season)
      or (p_version = 'ELEVEN_STANDARD_V4' and (
        (c.code in ('ENG','ESP','GER','ITA','FRA','UCL','UEL') and f.season = p_season)
        or (c.code in ('FIFA_WC','FIFA_WCQ_EUR','FIFA_WCQ_AFR','FIFA_WCQ_ASIA','FIFA_WCQ_CONCACAF','FIFA_WCQ_SAM','FIFA_WCQ_OFC','FIFA_WCQ_PLAYOFF','UEFA_EURO','UEFA_EURO_Q','UEFA_NL','COPA_AMERICA','AFCON','AFCON_Q','AFC_ASIAN_CUP','AFC_ASIAN_CUP_Q','CONCACAF_GOLD_CUP','CONCACAF_GOLD_CUP_Q','CONCACAF_NL','CONCACAF_NL_Q','OFC_NATIONS_CUP')
          and f.kickoff_at >= greatest((pg_catalog.make_date(p_season,7,1)::timestamp at time zone 'UTC'),timestamptz '2026-09-24 16:00:00+00')
          and f.kickoff_at < (pg_catalog.make_date(p_season+1,7,1)::timestamp at time zone 'UTC'))
      ))
    )
  group by s.player_id order by s.player_id;
$$;
revoke all on function public.get_player_score_totals(int,text,uuid[]) from public, anon;
grant execute on function public.get_player_score_totals(int,text,uuid[]) to authenticated, service_role;
