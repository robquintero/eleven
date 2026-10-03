-- Pass 14.6: new canonical game rule -- "if a player on your roster is
-- locked for the current fantasy round, you cannot drop that player."
--
-- This DELIBERATELY changes the behavior Pass 11's own
-- 20261001000000_free_market_and_trades.sql documented and shipped:
-- that migration's header comment explains, at length, why a drop was
-- always allowed to proceed even for an already-locked starter (the
-- ownership change itself was never the risk -- only "gaining an EXTRA
-- scoring opportunity in the same slot" was, and `_release_current_round_
-- slot` already closes that gap by leaving a locked slot's historical
-- snapshot untouched). That reasoning is still correct for WHY the old
-- behavior was safe; Pass 14.6 is a product decision to additionally
-- block the drop transaction itself once a player is locked, not a
-- correctness fix to a bug in the old behavior.
--
-- Enforced HERE (not just in the UI) because the authoritative
-- transaction/drop path is this RPC -- every client (Team page, Players
-- market) calls the exact same `drop_player`, so this is what makes the
-- rule hold "regardless of where the drop action originates" (brief
-- §Phase 6), not merely a UI affordance that a direct RPC call could
-- bypass.

create or replace function public.drop_player(p_league_id uuid, p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_team_id uuid;
  v_ownership public.league_player_ownership%rowtype;
  v_round_id uuid;
  v_slot public.lineup_slots%rowtype;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select ft.id into v_team_id from public.fantasy_teams ft
  where ft.league_id = p_league_id and ft.owner_user_id = v_user_id;
  if v_team_id is null then
    raise exception 'NOT_LEAGUE_MEMBER';
  end if;

  select * into v_ownership from public.league_player_ownership
  where league_id = p_league_id and player_id = p_player_id
  for update;

  if v_ownership.player_id is null or v_ownership.fantasy_team_id <> v_team_id then
    raise exception 'PLAYER_NOT_OWNED_BY_TEAM';
  end if;

  -- Pass 14.6: block the drop outright once this player's CURRENT-round
  -- lineup slot has locked -- same "current round" selector every other
  -- lineup read/write path uses (`_current_round_id`), same lock
  -- definition (`locked_at` in the past) the application layer's
  -- `isLocked`/`isPlayerLocked` use. A roster entry with no slot at all
  -- for the current round (e.g. no round has opened yet) is never locked.
  v_round_id := public._current_round_id(p_league_id);
  if v_round_id is not null then
    select * into v_slot from public.lineup_slots
    where roster_entry_id = v_ownership.roster_entry_id and fantasy_round_id = v_round_id;

    if v_slot.id is not null and v_slot.locked_at is not null and v_slot.locked_at <= now() then
      raise exception 'PLAYER_LOCKED';
    end if;
  end if;

  perform public._release_current_round_slot(v_ownership.roster_entry_id, p_league_id);

  delete from public.league_player_ownership
  where league_id = p_league_id and player_id = p_player_id;

  update public.roster_entries set status = 'dropped'
  where id = v_ownership.roster_entry_id;

  insert into public.transactions (league_id, type, actor_user_id, fantasy_team_id, reference, metadata)
  values (p_league_id, 'drop', v_user_id, v_team_id, p_player_id::text, jsonb_build_object('playerId', p_player_id));

  insert into public.domain_events (event_type, league_id, actor_user_id, fantasy_team_id, entity_type, entity_id, payload)
  values ('PLAYER_DROPPED', p_league_id, v_user_id, v_team_id, 'player', p_player_id, '{}'::jsonb);
end;
$$;

comment on function public.drop_player(uuid, uuid) is
  'Manager-facing: drop one of the caller''s own players to the open market. A roster below 16 (or below any position''s normal minimum) is a legitimate temporary MARKET state, not an error -- this function never blocks a drop for that reason, and never auto-fills the vacancy. Pass 14.6: blocks the drop entirely once the player''s current-round lineup slot has locked. Raises NOT_AUTHENTICATED / NOT_LEAGUE_MEMBER / PLAYER_NOT_OWNED_BY_TEAM / PLAYER_LOCKED.';

revoke all on function public.drop_player(uuid, uuid) from public;
grant execute on function public.drop_player(uuid, uuid) to authenticated;
