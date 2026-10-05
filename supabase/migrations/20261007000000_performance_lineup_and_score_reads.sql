-- Performance 1: two narrowly scoped RPCs and removal of manager DML.
-- No backfill, new tables/columns or existing-row writes at migration time.
-- A lineup batch needs ONE transaction; separate REST PATCHes cannot
-- roll back an earlier write when a later write fails.
create or replace function public.update_team_lineup(
  p_fantasy_team_id uuid,
  p_round_id uuid,
  p_changes jsonb,
  p_now timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team public.fantasy_teams%rowtype;
  v_now timestamptz;
  v_service boolean := coalesce(auth.role() = 'service_role', false);
  v_owned_entry_ids uuid[];
  v_gk int; v_def int; v_mid int; v_fwd int; v_total int;
begin
  -- Serialize lineup batches without blocking the KEY SHARE FK locks used
  -- when market/trade operations insert a new roster entry for this team.
  select * into v_team from public.fantasy_teams
  where id = p_fantasy_team_id for no key update;
  if v_team.id is null or (not v_service and
      (auth.uid() is null or v_team.owner_user_id <> auth.uid()
        or not public.is_league_member(v_team.league_id))) then
    raise exception 'ROSTER_ENTRY_NOT_ON_TEAM';
  end if;
  -- Same selector as both Team actions and _current_round_id. No extra
  -- date/status/season gate: the latest created round may be pre-kickoff.
  if p_round_id is distinct from public._current_round_id(v_team.league_id) then
    raise exception 'ROUND_NOT_FOUND';
  end if;
  if jsonb_typeof(p_changes) is distinct from 'array' then
    raise exception 'WRITE_FAILED';
  end if;

  -- Market/drop/trade writers acquire ownership before slots, then roster
  -- records. Follow that order. Trades may lock multiple assets in their
  -- stored traversal order, so NOWAIT avoids a multi-asset lock cycle with
  -- them: a busy ownership row safely aborts this whole batch for retry.
  select coalesce(array_agg(locked.roster_entry_id), '{}'::uuid[])
  into v_owned_entry_ids from (
    select o.roster_entry_id from public.league_player_ownership o
    where o.league_id = v_team.league_id and o.fantasy_team_id = p_fantasy_team_id
    order by o.player_id for update of o nowait
  ) locked;

  -- Lock every slot contributing to formation, including historical slots.
  -- Do not erase or rewrite departed players' historical scoring snapshots.
  perform ls.id from public.lineup_slots ls
  join public.roster_entries re on re.id = ls.roster_entry_id
  where ls.fantasy_round_id = p_round_id and re.fantasy_team_id = p_fantasy_team_id
  order by ls.id for update of ls;
  if not found then raise exception 'ROUND_NOT_FOUND'; end if;

  perform re.id from public.roster_entries re
  join jsonb_to_recordset(p_changes) as c(roster_entry_id uuid, starter boolean, position text)
    on c.roster_entry_id = re.id
  where re.fantasy_team_id = p_fantasy_team_id
  order by re.id for update of re;

  -- Recheck after locks in case a round advanced while the batch waited.
  if p_round_id is distinct from public._current_round_id(v_team.league_id) then
    raise exception 'ROUND_NOT_FOUND';
  end if;

  -- Only trusted service-role tests/simulation may inject a clock.
  -- Managers cannot bypass kickoff locking by sending a historic p_now.
  v_now := case when v_service then coalesce(p_now, clock_timestamp()) else clock_timestamp() end;

  if exists (
    select 1 from jsonb_to_recordset(p_changes) as c(roster_entry_id uuid, starter boolean, position text)
    left join public.roster_entries re on re.id = c.roster_entry_id
    left join public.lineup_slots ls on ls.roster_entry_id = re.id and ls.fantasy_round_id = p_round_id
    left join public.league_player_ownership o on o.roster_entry_id = re.id
      and o.league_id = v_team.league_id and o.fantasy_team_id = p_fantasy_team_id
      and o.player_id = re.player_id
    where re.id is null or re.fantasy_team_id <> p_fantasy_team_id
      or re.league_id <> v_team.league_id or re.status <> 'active'
      or o.roster_entry_id is null or ls.id is null
      -- An acquisition committed AFTER the ownership lock query is not
      -- locked by this transaction. Fail stale input rather than allowing
      -- a subsequent drop/trade to race a newly appeared ownership row.
      or not (re.id = any(v_owned_entry_ids))
  ) then raise exception 'ROSTER_ENTRY_NOT_ON_TEAM'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_changes) as c(roster_entry_id uuid, starter boolean, position text)
    group by c.roster_entry_id having count(*) > 1
  ) or exists (
    select 1 from jsonb_to_recordset(p_changes) as c(roster_entry_id uuid, starter boolean, position text)
    where c.starter is null
  ) then raise exception 'WRITE_FAILED'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_changes) as c(roster_entry_id uuid, starter boolean, position text)
    join public.lineup_slots ls on ls.roster_entry_id = c.roster_entry_id and ls.fantasy_round_id = p_round_id
    where ls.locked_at is not null and ls.locked_at <= v_now
  ) then raise exception 'SLOT_LOCKED'; end if;

  -- Canonical player positions, never a client-supplied formation claim.
  if exists (
    select 1 from jsonb_to_recordset(p_changes) as c(roster_entry_id uuid, starter boolean, position text)
    join public.roster_entries re on re.id = c.roster_entry_id
    join public.players p on p.id = re.player_id
    where c.starter and c.position is not null and c.position <> p.position
  ) then raise exception 'INVALID_FORMATION'; end if;
  select count(*), count(*) filter (where p.position = 'GK'),
    count(*) filter (where p.position = 'DEF'), count(*) filter (where p.position = 'MID'),
    count(*) filter (where p.position = 'FWD')
  into v_total, v_gk, v_def, v_mid, v_fwd
  from public.lineup_slots ls
  join public.roster_entries re on re.id = ls.roster_entry_id
  join public.players p on p.id = re.player_id
  left join jsonb_to_recordset(p_changes) as c(roster_entry_id uuid, starter boolean, position text)
    on c.roster_entry_id = re.id
  where ls.fantasy_round_id = p_round_id and re.fantasy_team_id = p_fantasy_team_id
    and coalesce(c.starter, ls.starter);
  if v_total <> 11 or v_gk <> 1 or v_def <> 4 or v_mid <> 4 or v_fwd <> 2 then
    raise exception 'INVALID_FORMATION';
  end if;

  update public.lineup_slots ls set
    starter = c.starter, slot = case when c.starter then p.position else 'BENCH' end
  from jsonb_to_recordset(p_changes) as c(roster_entry_id uuid, starter boolean, position text),
    public.roster_entries re, public.players p
  where ls.roster_entry_id = c.roster_entry_id and ls.fantasy_round_id = p_round_id
    and re.id = ls.roster_entry_id and re.fantasy_team_id = p_fantasy_team_id
    and p.id = re.player_id;
end;
$$;
revoke all on function public.update_team_lineup(uuid, uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.update_team_lineup(uuid, uuid, jsonb, timestamptz) to authenticated, service_role;

-- Managers must use the validated RPC; the old table grant/policy allowed
-- PATCHes to bypass formation and kickoff rules, even rewriting locked_at.
-- SELECT/RLS remain intact. Existing service-role grants and SECURITY
-- DEFINER market helpers still authorize initialization/reconciliation/DML.
revoke insert, update, delete on public.lineup_slots from public, anon, authenticated;
drop policy if exists "team owners can update their own lineup_slots" on public.lineup_slots;

-- Aggregate on Postgres, transfer one row per player instead of every
-- performance. INVOKER preserves canonical-score RLS. No cached ownership.
create or replace function public.get_player_score_totals(
  p_season int, p_version text, p_player_ids uuid[] default null
)
returns table(player_id uuid, total_points numeric, appearances bigint)
language sql stable security invoker set search_path = public
as $$
  select s.player_id, sum(s.points), count(*)
  from public.fantasy_player_scores s
  join public.fixtures f on f.id = s.fixture_id
  where f.season = p_season and s.scoring_rule_version = p_version
    and (p_player_ids is null or s.player_id = any(p_player_ids))
  group by s.player_id
  order by s.player_id;
$$;
revoke all on function public.get_player_score_totals(int, text, uuid[]) from public, anon;
grant execute on function public.get_player_score_totals(int, text, uuid[]) to authenticated, service_role;
