-- Non-draft acquisitions require the latest draft to be completed.
-- No existing rows are rewritten. Keep RPC signatures, authorization,
-- ownership constraints, roster limits and draft-pick logic intact.
-- Latest draft also covers REDRAFT; KEEP_ROSTERS intentionally reuses the
-- last completed draft, matching getDraftStatus and existing market behavior.
create or replace function public._assert_player_acquisition_allowed(p_league_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_league_status text;
  v_draft_status text;
begin
  -- Hold the league boundary through the acquisition transaction.
  -- start_next_season takes the conflicting lock below, so a REDRAFT
  -- cannot release rosters/start a new draft midway through acquisition.
  select status into v_league_status from public.fantasy_leagues
  where id = p_league_id for share;

  select status into v_draft_status from public.drafts
  where league_id = p_league_id order by created_at desc limit 1;

  -- League product ACTIVE is derived from a completed draft, even when
  -- the legacy league status still reads 'draft' (deriveLeagueLifecycle).
  -- No lifecycle writer currently changes that column upon draft completion.
  if v_league_status is null or v_league_status not in ('draft', 'active') then
    raise exception 'LEAGUE_NOT_ACTIVE';
  end if;
  if v_draft_status is distinct from 'completed' then
    raise exception 'DRAFT_NOT_COMPLETED';
  end if;
end;
$$;
-- Invoker-only internal helper. Public authenticated RPCs invoke it as
-- their existing SECURITY DEFINER owner; clients cannot call it directly.
revoke all on function public._assert_player_acquisition_allowed(uuid) from public, anon, authenticated;


create or replace function public.sign_player(p_league_id uuid, p_player_id uuid)
returns table (roster_entry_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_team_id uuid;
  v_player_active boolean;
  v_player_position text;
  v_current_count int;
  v_position_count int;
  v_position_max int;
  v_roster_entry_id uuid;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select ft.id into v_team_id from public.fantasy_teams ft
  where ft.league_id = p_league_id and ft.owner_user_id = v_user_id;
  if v_team_id is null then
    raise exception 'NOT_LEAGUE_MEMBER';
  end if;

  perform public._assert_player_acquisition_allowed(p_league_id);

  select active, position into v_player_active, v_player_position
  from public.players where id = p_player_id;
  if v_player_active is null then
    raise exception 'PLAYER_NOT_FOUND';
  end if;
  if not v_player_active then
    raise exception 'PLAYER_NOT_ACTIVE';
  end if;

  if exists (
    select 1 from public.league_player_ownership
    where league_id = p_league_id and player_id = p_player_id
  ) then
    raise exception 'PLAYER_ALREADY_OWNED';
  end if;

  select count(*) into v_current_count from public.roster_entries
  where fantasy_team_id = v_team_id and status = 'active';
  if v_current_count >= 16 then
    raise exception 'ROSTER_FULL';
  end if;

  select count(*) into v_position_count from public.roster_entries re
  join public.players p on p.id = re.player_id
  where re.fantasy_team_id = v_team_id and re.status = 'active' and p.position = v_player_position;

  v_position_max := case v_player_position
    when 'GK' then 2
    when 'DEF' then 6
    when 'MID' then 6
    when 'FWD' then 4
  end;
  -- Market acquisition validation (category B in the pass's own report)
  -- is deliberately looser than draft-time validation: only the position
  -- MAXIMUM is enforced here, never a "would this make some other
  -- position's minimum unreachable" check -- that reachability rule only
  -- makes sense when a draft has a fixed, final number of remaining
  -- picks. A manager can freely make several market moves over time to
  -- correct a shortfall; one single sign/drop is never required to leave
  -- the roster "completable."
  if v_position_count >= v_position_max then
    raise exception 'ROSTER_LIMIT_EXCEEDED';
  end if;

  insert into public.roster_entries (league_id, fantasy_team_id, player_id, acquisition_type, status)
  values (p_league_id, v_team_id, p_player_id, 'free_agent', 'active')
  returning id into v_roster_entry_id;

  begin
    insert into public.league_player_ownership (league_id, player_id, fantasy_team_id, roster_entry_id)
    values (p_league_id, p_player_id, v_team_id, v_roster_entry_id);
  exception when unique_violation then
    raise exception 'PLAYER_ALREADY_OWNED';
  end;

  perform public._init_current_round_slot(v_roster_entry_id, p_player_id, p_league_id);

  insert into public.transactions (league_id, type, actor_user_id, fantasy_team_id, reference, metadata)
  values (p_league_id, 'free_agent_add', v_user_id, v_team_id, p_player_id::text, jsonb_build_object('playerId', p_player_id));

  insert into public.domain_events (event_type, league_id, actor_user_id, fantasy_team_id, entity_type, entity_id, payload)
  values ('PLAYER_ADDED', p_league_id, v_user_id, v_team_id, 'player', p_player_id, '{}'::jsonb);

  return query select v_roster_entry_id;
end;
$$;

create or replace function public.propose_trade(
  p_league_id uuid,
  p_receiving_team_id uuid,
  p_offered_player_ids uuid[],
  p_requested_player_ids uuid[]
)
returns table (trade_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_proposing_team_id uuid;
  v_trade_id uuid;
  v_player_id uuid;
begin
  -- A client omitting one side entirely (a pure give or pure request)
  -- arrives as NULL, not an empty array -- normalize so the FOREACH loops
  -- and the EMPTY_TRADE/UNEVEN_TRADE length checks below both treat that
  -- the same as an explicit empty array.
  p_offered_player_ids := coalesce(p_offered_player_ids, '{}');
  p_requested_player_ids := coalesce(p_requested_player_ids, '{}');

  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select ft.id into v_proposing_team_id from public.fantasy_teams ft
  where ft.league_id = p_league_id and ft.owner_user_id = v_user_id;
  if v_proposing_team_id is null then
    raise exception 'NOT_LEAGUE_MEMBER';
  end if;

  perform public._assert_player_acquisition_allowed(p_league_id);

  if not exists (select 1 from public.fantasy_teams where id = p_receiving_team_id and league_id = p_league_id) then
    raise exception 'RECEIVING_TEAM_NOT_FOUND';
  end if;

  if p_receiving_team_id = v_proposing_team_id then
    raise exception 'CANNOT_TRADE_WITH_SELF';
  end if;

  if coalesce(array_length(p_offered_player_ids, 1), 0) = 0
     and coalesce(array_length(p_requested_player_ids, 1), 0) = 0 then
    raise exception 'EMPTY_TRADE';
  end if;

  -- Pass 12F: the canonical equal-count rule. Checked after EMPTY_TRADE
  -- (so a genuinely empty 0-for-0 submission still gets that more
  -- specific message, not this one) and before any per-player ownership
  -- validation (an uneven trade is rejected on shape alone, regardless of
  -- whether the listed players are even valid).
  if coalesce(array_length(p_offered_player_ids, 1), 0) <> coalesce(array_length(p_requested_player_ids, 1), 0) then
    raise exception 'UNEVEN_TRADE';
  end if;

  foreach v_player_id in array p_offered_player_ids loop
    if not exists (
      select 1 from public.league_player_ownership
      where league_id = p_league_id and player_id = v_player_id and fantasy_team_id = v_proposing_team_id
    ) then
      raise exception 'INVALID_TRADE_ASSET';
    end if;
  end loop;

  foreach v_player_id in array p_requested_player_ids loop
    if not exists (
      select 1 from public.league_player_ownership
      where league_id = p_league_id and player_id = v_player_id and fantasy_team_id = p_receiving_team_id
    ) then
      raise exception 'INVALID_TRADE_ASSET';
    end if;
  end loop;

  insert into public.trades (league_id, proposing_team_id, receiving_team_id, status)
  values (p_league_id, v_proposing_team_id, p_receiving_team_id, 'pending')
  returning id into v_trade_id;

  foreach v_player_id in array p_offered_player_ids loop
    insert into public.trade_assets (trade_id, from_team_id, to_team_id, player_id)
    values (v_trade_id, v_proposing_team_id, p_receiving_team_id, v_player_id);
  end loop;

  foreach v_player_id in array p_requested_player_ids loop
    insert into public.trade_assets (trade_id, from_team_id, to_team_id, player_id)
    values (v_trade_id, p_receiving_team_id, v_proposing_team_id, v_player_id);
  end loop;

  insert into public.domain_events (event_type, league_id, actor_user_id, fantasy_team_id, entity_type, entity_id, payload)
  values ('TRADE_PROPOSED', p_league_id, v_user_id, v_proposing_team_id, 'trade', v_trade_id, '{}'::jsonb);

  return query select v_trade_id;
end;
$$;

create or replace function public.accept_trade(p_trade_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_trade public.trades%rowtype;
  v_asset record;
  v_ownership public.league_player_ownership%rowtype;
  v_new_roster_entry_id uuid;
  v_player_position text;
  -- A trade always involves exactly these two teams -- no need for
  -- generic N-team bookkeeping. Each pair tracks that team's current
  -- active roster size and per-position counts, adjusted by every asset
  -- leaving/joining it, before anything is actually written.
  v_proposing_count int;
  v_receiving_count int;
  v_proposing_gk int; v_proposing_def int; v_proposing_mid int; v_proposing_fwd int;
  v_receiving_gk int; v_receiving_def int; v_receiving_mid int; v_receiving_fwd int;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Lock the trade row first so two near-simultaneous accept attempts on
  -- the SAME trade (e.g. a double-click) serialize rather than race.
  select * into v_trade from public.trades where id = p_trade_id for update;
  if v_trade.id is null then
    raise exception 'TRADE_NOT_FOUND';
  end if;

  if not exists (
    select 1 from public.fantasy_teams
    where id = v_trade.receiving_team_id and owner_user_id = v_user_id
  ) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if v_trade.status <> 'pending' then
    raise exception 'TRADE_NOT_PENDING';
  end if;

  perform public._assert_player_acquisition_allowed(v_trade.league_id);

  -- Re-validate EVERY asset from scratch -- never trust state from
  -- proposal time. Locking each ownership row (for update) as we go
  -- serializes this against a DIFFERENT, concurrently-accepted trade
  -- touching the same player: whichever transaction gets there first
  -- wins the lock, commits, and the second transaction's own re-check
  -- (after it acquires the lock) finds the ownership already changed.
  for v_asset in select * from public.trade_assets where trade_id = p_trade_id loop
    select * into v_ownership from public.league_player_ownership
    where league_id = v_trade.league_id and player_id = v_asset.player_id
    for update;

    if v_ownership.player_id is null or v_ownership.fantasy_team_id <> v_asset.from_team_id then
      raise exception 'TRADE_ASSET_NO_LONGER_OWNED';
    end if;
  end loop;

  -- Resulting roster size + positional-maximum validation (market rules,
  -- not draft rules -- see sign_player's own comment on why only maximums
  -- apply here) for BOTH teams, computed from their CURRENT state plus
  -- every asset's effect, before touching anything.
  select count(*) into v_proposing_count from public.roster_entries
  where fantasy_team_id = v_trade.proposing_team_id and status = 'active';
  select count(*) into v_receiving_count from public.roster_entries
  where fantasy_team_id = v_trade.receiving_team_id and status = 'active';

  select
    count(*) filter (where p.position = 'GK'), count(*) filter (where p.position = 'DEF'),
    count(*) filter (where p.position = 'MID'), count(*) filter (where p.position = 'FWD')
    into v_proposing_gk, v_proposing_def, v_proposing_mid, v_proposing_fwd
  from public.roster_entries re join public.players p on p.id = re.player_id
  where re.fantasy_team_id = v_trade.proposing_team_id and re.status = 'active';

  select
    count(*) filter (where p.position = 'GK'), count(*) filter (where p.position = 'DEF'),
    count(*) filter (where p.position = 'MID'), count(*) filter (where p.position = 'FWD')
    into v_receiving_gk, v_receiving_def, v_receiving_mid, v_receiving_fwd
  from public.roster_entries re join public.players p on p.id = re.player_id
  where re.fantasy_team_id = v_trade.receiving_team_id and re.status = 'active';

  for v_asset in select * from public.trade_assets where trade_id = p_trade_id loop
    select p.position into v_player_position from public.players p where p.id = v_asset.player_id;

    if v_asset.from_team_id = v_trade.proposing_team_id then
      v_proposing_count := v_proposing_count - 1;
      case v_player_position
        when 'GK' then v_proposing_gk := v_proposing_gk - 1;
        when 'DEF' then v_proposing_def := v_proposing_def - 1;
        when 'MID' then v_proposing_mid := v_proposing_mid - 1;
        when 'FWD' then v_proposing_fwd := v_proposing_fwd - 1;
      end case;
      v_receiving_count := v_receiving_count + 1;
      case v_player_position
        when 'GK' then v_receiving_gk := v_receiving_gk + 1;
        when 'DEF' then v_receiving_def := v_receiving_def + 1;
        when 'MID' then v_receiving_mid := v_receiving_mid + 1;
        when 'FWD' then v_receiving_fwd := v_receiving_fwd + 1;
      end case;
    else
      v_receiving_count := v_receiving_count - 1;
      case v_player_position
        when 'GK' then v_receiving_gk := v_receiving_gk - 1;
        when 'DEF' then v_receiving_def := v_receiving_def - 1;
        when 'MID' then v_receiving_mid := v_receiving_mid - 1;
        when 'FWD' then v_receiving_fwd := v_receiving_fwd - 1;
      end case;
      v_proposing_count := v_proposing_count + 1;
      case v_player_position
        when 'GK' then v_proposing_gk := v_proposing_gk + 1;
        when 'DEF' then v_proposing_def := v_proposing_def + 1;
        when 'MID' then v_proposing_mid := v_proposing_mid + 1;
        when 'FWD' then v_proposing_fwd := v_proposing_fwd + 1;
      end case;
    end if;
  end loop;

  if v_proposing_count > 16 or v_receiving_count > 16 then
    raise exception 'ROSTER_FULL';
  end if;
  if v_proposing_gk > 2 or v_proposing_def > 6 or v_proposing_mid > 6 or v_proposing_fwd > 4
     or v_receiving_gk > 2 or v_receiving_def > 6 or v_receiving_mid > 6 or v_receiving_fwd > 4 then
    raise exception 'ROSTER_LIMIT_EXCEEDED';
  end if;

  -- Everything validated -- perform every ownership transfer.
  for v_asset in select * from public.trade_assets where trade_id = p_trade_id loop
    select * into v_ownership from public.league_player_ownership
    where league_id = v_trade.league_id and player_id = v_asset.player_id;

    perform public._release_current_round_slot(v_ownership.roster_entry_id, v_trade.league_id);

    delete from public.league_player_ownership
    where league_id = v_trade.league_id and player_id = v_asset.player_id;

    update public.roster_entries set status = 'dropped' where id = v_ownership.roster_entry_id;

    insert into public.roster_entries (league_id, fantasy_team_id, player_id, acquisition_type, status)
    values (v_trade.league_id, v_asset.to_team_id, v_asset.player_id, 'trade', 'active')
    returning id into v_new_roster_entry_id;

    insert into public.league_player_ownership (league_id, player_id, fantasy_team_id, roster_entry_id)
    values (v_trade.league_id, v_asset.player_id, v_asset.to_team_id, v_new_roster_entry_id);

    perform public._init_current_round_slot(v_new_roster_entry_id, v_asset.player_id, v_trade.league_id);
  end loop;

  update public.trades set status = 'accepted', accepted_at = now(), completed_at = now() where id = p_trade_id;

  insert into public.transactions (league_id, type, actor_user_id, fantasy_team_id, reference, metadata)
  values (v_trade.league_id, 'trade', v_user_id, v_trade.receiving_team_id, p_trade_id::text,
    jsonb_build_object('tradeId', p_trade_id, 'proposingTeamId', v_trade.proposing_team_id, 'receivingTeamId', v_trade.receiving_team_id));

  insert into public.domain_events (event_type, league_id, actor_user_id, fantasy_team_id, entity_type, entity_id, payload)
  values ('TRADE_ACCEPTED', v_trade.league_id, v_user_id, v_trade.receiving_team_id, 'trade', p_trade_id, '{}'::jsonb);
end;
$$;

-- Serialize the already-existing season/redraft boundary with acquisitions.
-- This is only a row-lock addition; roster mode, picks/order and lifecycle
-- writes below are identical to the existing start_next_season implementation.

create or replace function public.start_next_season(
  p_league_id uuid,
  p_roster_mode text,
  p_schedule_cycles smallint
)
returns table (season_id uuid, season_number int, draft_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_league public.fantasy_leagues%rowtype;
  v_latest public.seasons%rowtype;
  v_new_season_id uuid;
  v_new_season_number int;
  v_new_draft_id uuid;
  v_position int := 0;
  v_team record;
  v_released_count int;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_roster_mode not in ('REDRAFT', 'KEEP_ROSTERS') then
    raise exception 'INVALID_ROSTER_MODE';
  end if;

  if p_schedule_cycles not in (1, 2, 3) then
    raise exception 'INVALID_SCHEDULE_FORMAT';
  end if;

  select * into v_league from public.fantasy_leagues fl where fl.id = p_league_id for update;
  if v_league.id is null then
    raise exception 'LEAGUE_NOT_FOUND';
  end if;

  if not public.is_league_commissioner(p_league_id) then
    raise exception 'NOT_COMMISSIONER';
  end if;

  select * into v_latest from public.seasons
  where league_id = p_league_id
  order by season_number desc
  limit 1;

  if v_latest.id is null then
    raise exception 'NO_SEASON_TO_FOLLOW';
  end if;

  if v_latest.status <> 'COMPLETED' then
    raise exception 'SEASON_NOT_COMPLETE';
  end if;

  v_new_season_number := v_latest.season_number + 1;

  begin
    insert into public.seasons (league_id, season_number, status, schedule_cycles, roster_mode)
    values (p_league_id, v_new_season_number, 'SETUP', p_schedule_cycles, p_roster_mode)
    returning id into v_new_season_id;
  exception when unique_violation then
    raise exception 'SEASON_ALREADY_STARTED';
  end;

  if p_roster_mode = 'REDRAFT' then
    -- Release every currently-owned player in the league -- same
    -- soft-delete semantics as drop_player (roster_entries.status set to
    -- 'dropped', never deleted; league_player_ownership rows removed).
    -- No `_release_current_round_slot` call is needed: a season only
    -- reaches COMPLETED once every one of its rounds is finalized, so
    -- there is no "current round" lineup_slots row left to release.
    update public.roster_entries
    set status = 'dropped'
    where league_id = p_league_id and status = 'active';

    get diagnostics v_released_count = row_count;

    delete from public.league_player_ownership where league_id = p_league_id;

    insert into public.transactions (league_id, type, actor_user_id, metadata)
    values (p_league_id, 'commissioner_move', v_user_id,
      jsonb_build_object('action', 'SEASON_RESET_REDRAFT', 'seasonNumber', v_new_season_number, 'playersReleased', v_released_count));

    insert into public.drafts (league_id, season_id, status, type, current_round, current_pick, started_at, current_pick_started_at)
    values (p_league_id, v_new_season_id, 'in_progress', 'snake', 1, 1, now(), now())
    returning id into v_new_draft_id;

    for v_team in
      select ft.id from public.fantasy_teams ft where ft.league_id = p_league_id order by random()
    loop
      v_position := v_position + 1;
      insert into public.draft_orders (draft_id, fantasy_team_id, position) values (v_new_draft_id, v_team.id, v_position);
    end loop;

    insert into public.domain_events (event_type, league_id, actor_user_id, entity_type, entity_id, payload)
    values ('DRAFT_STARTED', p_league_id, v_user_id, 'draft', v_new_draft_id,
      jsonb_build_object('seasonNumber', v_new_season_number, 'rosterMode', p_roster_mode));
  else
    -- KEEP_ROSTERS: release ownership only for players who are no longer
    -- part of Eleven's draftable universe (players.active = false) --
    -- never a silent replacement, never a compensation pick. The
    -- resulting vacancy is real and visible; the manager fills it through
    -- the existing free market, same as any other roster gap.
    update public.roster_entries re
    set status = 'dropped'
    from public.players p
    where re.league_id = p_league_id
      and re.status = 'active'
      and re.player_id = p.id
      and p.active = false;

    get diagnostics v_released_count = row_count;

    delete from public.league_player_ownership lpo
    using public.players p
    where lpo.league_id = p_league_id
      and lpo.player_id = p.id
      and p.active = false;

    if v_released_count > 0 then
      insert into public.transactions (league_id, type, actor_user_id, metadata)
      values (p_league_id, 'commissioner_move', v_user_id,
        jsonb_build_object('action', 'SEASON_RESET_INELIGIBLE_RELEASE', 'seasonNumber', v_new_season_number, 'playersReleased', v_released_count));
    end if;
  end if;

  insert into public.domain_events (event_type, league_id, actor_user_id, entity_type, entity_id, payload)
  values ('SEASON_STARTED', p_league_id, v_user_id, 'season', v_new_season_id,
    jsonb_build_object('seasonNumber', v_new_season_number, 'rosterMode', p_roster_mode, 'scheduleCycles', p_schedule_cycles));

  return query select v_new_season_id, v_new_season_number, v_new_draft_id;
end;
$$;

-- CREATE OR REPLACE retains existing ACLs; explicitly restate the public
-- entry-point permissions using the repository's normal migration pattern.
revoke all on function public.sign_player(uuid, uuid) from public;
grant execute on function public.sign_player(uuid, uuid) to authenticated;
revoke all on function public.propose_trade(uuid, uuid, uuid[], uuid[]) from public;
grant execute on function public.propose_trade(uuid, uuid, uuid[], uuid[]) to authenticated;
revoke all on function public.accept_trade(uuid) from public;
grant execute on function public.accept_trade(uuid) to authenticated;
revoke all on function public.start_next_season(uuid, text, smallint) from public;
grant execute on function public.start_next_season(uuid, text, smallint) to authenticated;
