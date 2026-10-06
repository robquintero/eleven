-- Commissioner deletion: no existing league/data is changed by this migration.
-- Private, transaction-scoped capabilities permit ONLY the exact DELETE rows
-- captured by the authorized RPC. No client-settable GUC, disabled trigger,
-- broad DELETE grant or change to ordinary settlement/update rules.
create schema if not exists eleven_private;
revoke all on schema eleven_private from public, anon, authenticated, service_role;
create table eleven_private.league_deletion_context (
  transaction_id bigint primary key,
  round_ids uuid[] not null,
  matchup_ids uuid[] not null,
  score_ids uuid[] not null
);
revoke all on eleven_private.league_deletion_context from public, anon, authenticated, service_role;

create function eleven_private.authorized_league_delete(p_kind text, p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from eleven_private.league_deletion_context c
    where c.transaction_id = pg_catalog.txid_current()
      and p_id = any(case p_kind when 'round' then c.round_ids
        when 'matchup' then c.matchup_ids when 'score' then c.score_ids else array[]::uuid[] end)
  );
$$;
revoke all on function eleven_private.authorized_league_delete(text,uuid) from public, anon, authenticated, service_role;

create or replace function public.guard_settled_matchup_scores() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target uuid; settled boolean; round_id uuid; round_version text; expected numeric;
begin
  if tg_op = 'DELETE' and eleven_private.authorized_league_delete('score', old.id) then return old; end if;
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

create or replace function public.guard_settled_matchups() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' and eleven_private.authorized_league_delete('matchup', old.id) then return old; end if;
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

create or replace function public.pin_round_scoring_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' and eleven_private.authorized_league_delete('round', old.id) then return old; end if;
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

-- SHARE ROW EXCLUSIVE briefly prevents concurrent writes to the ownership graph
-- while inspecting cross-league references and capturing exact guard exceptions.
-- Acquire the existing settlement advisory lock first, as settlement does.
create function public.delete_fantasy_league(p_league_id uuid, p_confirmation text)
returns uuid language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
declare caller uuid := auth.uid(); owner_id uuid;
begin
  if caller is null or auth.role() is distinct from 'authenticated' then raise exception 'DELETE_LEAGUE_NOT_AUTHENTICATED'; end if;
  if p_confirmation is distinct from 'DELETE' then raise exception 'DELETE_LEAGUE_CONFIRMATION_REQUIRED'; end if;
  select created_by_user_id into owner_id from public.fantasy_leagues where id = p_league_id;
  if not found then raise exception 'DELETE_LEAGUE_NOT_FOUND'; end if;
  if owner_id <> caller or not exists(select 1 from public.league_memberships where league_id=p_league_id and user_id=caller and role='commissioner')
  then raise exception 'DELETE_LEAGUE_FORBIDDEN'; end if;

  perform pg_catalog.pg_advisory_xact_lock(441104);
  lock table public.fantasy_leagues, public.league_memberships, public.fantasy_teams,
    public.seasons, public.roster_entries, public.league_player_ownership,
    public.fantasy_rounds, public.lineup_slots, public.matchups, public.matchup_scores,
    public.drafts, public.draft_orders, public.draft_picks, public.waiver_claims,
    public.trades, public.trade_assets, public.transactions, public.domain_events,
    public.scoring_rules, public.fantasy_player_scores in share row exclusive mode;
  select created_by_user_id into owner_id from public.fantasy_leagues where id=p_league_id for update;
  if not found then raise exception 'DELETE_LEAGUE_NOT_FOUND'; end if;
  if owner_id <> caller or not exists(select 1 from public.league_memberships where league_id=p_league_id and user_id=caller and role='commissioner')
  then raise exception 'DELETE_LEAGUE_FORBIDDEN'; end if;

  -- Existing simple FKs do not enforce every cross-table league equality.
  -- Refuse an inconsistent graph rather than cascade into another league or
  -- SET NULL a shared/global event. Null season/champion/team edges are absent.
  if exists (
    select 1 from (
      select r.league_id a,t.league_id b from public.roster_entries r join public.fantasy_teams t on t.id=r.fantasy_team_id
      union all select o.league_id,t.league_id from public.league_player_ownership o join public.fantasy_teams t on t.id=o.fantasy_team_id
      union all select r.league_id,s.league_id from public.fantasy_rounds r join public.seasons s on s.id=r.season_id
      union all select s.league_id,t.league_id from public.seasons s join public.fantasy_teams t on t.id=s.champion_fantasy_team_id
      union all select r.league_id,e.league_id from public.lineup_slots l join public.fantasy_rounds r on r.id=l.fantasy_round_id join public.roster_entries e on e.id=l.roster_entry_id
      union all select m.league_id,r.league_id from public.matchups m join public.fantasy_rounds r on r.id=m.fantasy_round_id
      union all select m.league_id,t.league_id from public.matchups m join public.fantasy_teams t on t.id in(m.home_fantasy_team_id,m.away_fantasy_team_id)
      union all select m.league_id,t.league_id from public.matchup_scores s join public.matchups m on m.id=s.matchup_id join public.fantasy_teams t on t.id=s.fantasy_team_id
      union all select d.league_id,s.league_id from public.drafts d join public.seasons s on s.id=d.season_id
      union all select d.league_id,t.league_id from public.draft_orders o join public.drafts d on d.id=o.draft_id join public.fantasy_teams t on t.id=o.fantasy_team_id
      union all select d.league_id,t.league_id from public.draft_picks p join public.drafts d on d.id=p.draft_id join public.fantasy_teams t on t.id=p.fantasy_team_id
      union all select w.league_id,t.league_id from public.waiver_claims w join public.fantasy_teams t on t.id=w.fantasy_team_id
      union all select r.league_id,t.league_id from public.trades r join public.fantasy_teams t on t.id in(r.proposing_team_id,r.receiving_team_id)
      union all select r.league_id,t.league_id from public.trade_assets a join public.trades r on r.id=a.trade_id join public.fantasy_teams t on t.id in(a.from_team_id,a.to_team_id)
      union all select x.league_id,t.league_id from public.transactions x join public.fantasy_teams t on t.id=x.fantasy_team_id
      union all select e.league_id,t.league_id from public.domain_events e join public.fantasy_teams t on t.id=e.fantasy_team_id
    ) edges where a is distinct from b and (a=p_league_id or b=p_league_id)
  ) then raise exception 'DELETE_LEAGUE_CROSS_LEAGUE_REFERENCE'; end if;

  insert into eleven_private.league_deletion_context values (
    pg_catalog.txid_current(),
    array(select id from public.fantasy_rounds where league_id=p_league_id),
    array(select id from public.matchups where league_id=p_league_id),
    array(select s.id from public.matchup_scores s join public.matchups m on m.id=s.matchup_id where m.league_id=p_league_id)
  );
  -- ALL owned rows cascade. Canonical player scores have NULL round IDs and
  -- remain untouched; only legacy round-owned scores cascade with their round.
  delete from public.fantasy_leagues where id=p_league_id;
  delete from eleven_private.league_deletion_context where transaction_id=pg_catalog.txid_current();
  return p_league_id;
exception
  when deadlock_detected or lock_not_available then raise exception 'DELETE_LEAGUE_BUSY';
  -- PostgreSQL rolls back the entire function block, including capability rows.
end $$;
revoke all on function public.delete_fantasy_league(uuid,text) from public, anon, service_role;
grant execute on function public.delete_fantasy_league(uuid,text) to authenticated;
