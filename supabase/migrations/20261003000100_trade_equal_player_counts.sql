-- Pass 12F: trades must contain the same number of players on both sides
-- (1-for-1, 2-for-2, 3-for-3, ... -- never 2-for-1, 3-for-2, etc.).
-- Eleven has no budget/cash-balancing mechanism, so an uneven trade has
-- no principled "fair value" check behind it at all; prohibiting it
-- outright keeps roster integrity simple and unambiguous.
--
-- Enforced ONLY in `propose_trade` -- the single, authoritative write path
-- into `trades`/`trade_assets` (neither table has an INSERT policy for
-- `authenticated`; every row is created exclusively by this SECURITY
-- DEFINER function, the same established convention every other
-- fantasy-game-state table in this schema follows). `accept_trade`
-- operates only on trade_assets rows that already passed this check at
-- proposal time, so it needs no additional enforcement of its own --
-- there is no other path that could ever produce an uneven pending trade
-- for it to accept.
--
-- Verified against the live database before writing this migration: zero
-- existing trades are already uneven, so this is a pure forward-looking
-- constraint -- no historical trade record is reinterpreted or rewritten.
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

comment on function public.propose_trade(uuid, uuid, uuid[], uuid[]) is
  'Manager-facing: propose a trade to another team in the same league. Both sides must offer the SAME NUMBER of players (1-for-1, 2-for-2, ... -- never uneven; Pass 12F) -- checked on shape alone before any ownership validation. Every offered/requested player must actually be owned by the expected team AT PROPOSAL TIME -- re-validated again, from scratch, at acceptance time (accept_trade), since this check alone cannot protect against ownership changing in between. Raises NOT_AUTHENTICATED / NOT_LEAGUE_MEMBER / RECEIVING_TEAM_NOT_FOUND / CANNOT_TRADE_WITH_SELF / EMPTY_TRADE / UNEVEN_TRADE / INVALID_TRADE_ASSET.';

revoke all on function public.propose_trade(uuid, uuid, uuid[], uuid[]) from public;
grant execute on function public.propose_trade(uuid, uuid, uuid[], uuid[]) to authenticated;
