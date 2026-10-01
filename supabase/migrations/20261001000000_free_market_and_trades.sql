-- Pass 11: free market (sign/drop) + manager-to-manager trades.
--
-- Follows the exact pattern established by the draft engine
-- (20260930024807_draft_engine.sql): SECURITY DEFINER functions doing one
-- atomic transaction per call, explicit RAISE EXCEPTION error codes the
-- application layer pattern-matches on, no new client-facing RLS
-- INSERT/UPDATE/DELETE policy on roster_entries/league_player_ownership/
-- trades/trade_assets/transactions (those tables still have ONLY their
-- existing SELECT policies -- see 20260929141143_rls.sql). This is a
-- deliberate choice, not an oversight: these are genuinely multi-row,
-- concurrency-sensitive competitive operations (ownership uniqueness
-- races, atomic multi-player trades), and the codebase's own established
-- convention for that class of operation is a trusted RPC that resolves
-- auth.uid() and re-validates authorization internally -- see Pass
-- 10.5C.2A/10.5C.5's own report for why "ordinary RLS write policy" was
-- the RIGHT call for simple single-row lineup swaps, and why a draft pick
-- was NOT solved that way. Free-agent signing and trade acceptance are
-- much closer to a draft pick (ownership races, multi-row atomicity) than
-- to a lineup swap (one manager's own single row).
--
-- REUSES existing scaffolding rather than inventing new concepts:
--   - roster_entries.acquisition_type already has 'free_agent' and
--     'trade' values (20260929141131_roster_foundation.sql) -- added for
--     exactly this, never used until now.
--   - roster_entries.status 'active'/'dropped' is the existing soft-delete
--     mechanism -- a drop NEVER deletes a roster_entries row, so historical
--     lineup_slots (and therefore past scoring) stay intact.
--   - league_player_ownership's PRIMARY KEY (league_id, player_id) is the
--     SAME uniqueness guarantee make_draft_pick already relies on for
--     "exactly one of two concurrent actors wins" -- no new constraint
--     needed, just a new INSERT path that hits the same one.
--   - trades/trade_assets (20260929141137_waivers_trades.sql) already
--     have the exact N-for-M shape and status enum this pass needs; only
--     a SUBSET of that enum ('pending' = PROPOSED, 'accepted', 'rejected',
--     'cancelled') is used here. 'draft'/'countered'/'expired'/'completed'
--     are left genuinely unused, matching the brief's "leave scaffolded-
--     but-unused concepts unused" instruction.
--   - transactions.type already has 'free_agent_add'/'drop'/'trade'.
--   - waiver_claims is NOT touched anywhere in this migration -- waivers
--     are explicitly out of scope for this pass.
--
-- CURRENT-ROUND LOCK INTEGRITY (the critical correctness property this
-- migration exists to prove, not just implement -- see the pass's own
-- completion report for the full reasoning):
--
--   Ownership transactions (drop, sign, trade) are ALWAYS allowed to
--   proceed, including for a player who is the current round's LOCKED
--   starter. Blocking the ownership change itself isn't necessary and
--   isn't requested -- what must never happen is a manager gaining an
--   EXTRA scoring opportunity in the same starting slot for the same
--   round. Two small, existing-pattern-consistent rules close that gap
--   completely, both implemented in _release_current_round_slot and
--   _init_current_round_slot below:
--
--   1. When a player LEAVES a roster (drop, or the "from" side of a
--      trade) and their current-round lineup_slots row is NOT yet locked,
--      it's demoted to bench (starter=false) as part of the same atomic
--      transaction. If it IS already locked, it is left completely
--      untouched -- the locked snapshot (and whatever points it already
--      earned) is exactly the historical record the round/scoring engine
--      already treats as authoritative; dropping the player doesn't erase
--      it, and it was already fixed before this transaction.
--   2. When a player JOINS a roster (sign, or the "to" side of a trade)
--      and a current round already exists for the league, a fresh
--      lineup_slots row is created for them the SAME way
--      createRoundLineupSlots() (src/lib/fantasy-engine/lineup.ts) always
--      creates one for a drafted player: starter=false (bench), and
--      locked_at computed from that player's own real fixture data within
--      the round's window using the exact same rule
--      (computeLockInstant/isLocked, src/domain/fantasy/lineup-lock.ts) --
--      re-derived in SQL here for the same reason the draft engine
--      re-derives its own TypeScript rules (SQL can't call TypeScript).
--      If that player's fixture has ALREADY kicked off this round, their
--      new slot is ALREADY locked the instant it's created -- the
--      existing updateLineup() lock check (team/actions.ts via
--      swapLineupAction/fillEmptySlotsAction) then makes it structurally
--      impossible for the manager to ever flip them to starter for this
--      round. No new lock-blocking logic was needed anywhere else because
--      this one is already authoritative everywhere lineup changes happen.
--
--   Net effect: "start Player A, Player A scores, drop Player A, sign
--   Player B, insert Player B into that same slot, receive both players'
--   points" is structurally impossible -- A's locked slot is untouched
--   (keeps A's points), and B's new slot is either unlocked (B hasn't
--   played, correctly startable going forward) or already locked (B
--   already played too, and can never be started this round either way).

-- ---------------------------------------------------------------------
-- Shared internals (not exposed to `authenticated`)
-- ---------------------------------------------------------------------

create or replace function public._current_round_id(p_league_id uuid)
returns uuid
language sql
stable
set search_path = public
as $$
  select id from public.fantasy_rounds
  where league_id = p_league_id
  order by number desc
  limit 1;
$$;

comment on function public._current_round_id(uuid) is
  'The SAME "latest round by number" selector every other lineup read/write path uses (getUserSquad, swapLineupAction, fillEmptySlotsAction — Pass 10.5C.3''s "one canonical editable-round selector" principle) — re-derived here so market/trade transactions target the identical round those paths do.';

create or replace function public._release_current_round_slot(p_roster_entry_id uuid, p_league_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_round_id uuid := public._current_round_id(p_league_id);
  v_slot public.lineup_slots%rowtype;
begin
  if v_round_id is null then
    return;
  end if;

  select * into v_slot from public.lineup_slots
  where roster_entry_id = p_roster_entry_id and fantasy_round_id = v_round_id;

  if v_slot.id is null then
    return;
  end if;

  -- Locked slots are never touched -- see this migration's own header
  -- comment on why that's exactly what preserves the scoring snapshot.
  if v_slot.locked_at is not null and v_slot.locked_at <= now() then
    return;
  end if;

  if v_slot.starter then
    update public.lineup_slots set starter = false, slot = 'BENCH' where id = v_slot.id;
  end if;
end;
$$;

create or replace function public._init_current_round_slot(p_roster_entry_id uuid, p_player_id uuid, p_league_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_round public.fantasy_rounds%rowtype;
  v_club_id uuid;
  v_locked_at timestamptz;
begin
  select * into v_round from public.fantasy_rounds
  where league_id = p_league_id
  order by number desc
  limit 1;

  if v_round.id is null then
    return;
  end if;

  select club_id into v_club_id from public.players where id = p_player_id;

  select min(f.kickoff_at) into v_locked_at
  from public.fixtures f
  where (f.home_club_id = v_club_id or f.away_club_id = v_club_id)
    and f.kickoff_at >= v_round.starts_at
    and f.kickoff_at < v_round.ends_at;

  insert into public.lineup_slots (roster_entry_id, fantasy_round_id, slot, starter, locked_at)
  values (p_roster_entry_id, v_round.id, 'BENCH', false, v_locked_at)
  on conflict (roster_entry_id, fantasy_round_id) do nothing;
end;
$$;

comment on function public._init_current_round_slot(uuid, uuid, uuid) is
  'Mirrors createRoundLineupSlots()''s own per-player slot creation (src/lib/fantasy-engine/lineup.ts) for a single newly-acquired player joining a league that already has a round open — always bench, locked_at computed from real fixture data exactly like a drafted player''s first slot. `on conflict do nothing` makes this safe to call defensively.';

-- ---------------------------------------------------------------------
-- drop_player: remove the caller's own player from their roster. Never
-- deletes the roster_entries row (soft-drop only) -- see this migration's
-- own header comment on why that's what preserves historical scoring.
-- ---------------------------------------------------------------------

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
  'Manager-facing: drop one of the caller''s own players to the open market. A roster below 16 (or below any position''s normal minimum) is a legitimate temporary MARKET state, not an error -- this function never blocks a drop for that reason, and never auto-fills the vacancy. Raises NOT_AUTHENTICATED / NOT_LEAGUE_MEMBER / PLAYER_NOT_OWNED_BY_TEAM.';

revoke all on function public.drop_player(uuid, uuid) from public;
grant execute on function public.drop_player(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- sign_player: acquire a currently-available player. Ownership-uniqueness
-- race protection is the SAME mechanism make_draft_pick already uses --
-- league_player_ownership's own PRIMARY KEY, with the unique_violation
-- converted to a clean PLAYER_ALREADY_OWNED rather than a raw constraint
-- error. The pre-check below is a fast-path courtesy (avoids starting
-- roster-entry/ownership work for an obviously-taken player); it is NOT
-- what makes two-concurrent-ADDs safe -- the INSERT's own constraint is.
-- ---------------------------------------------------------------------

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

comment on function public.sign_player(uuid, uuid) is
  'Manager-facing: immediate free-agent acquisition, first-come-first-served. Raises NOT_AUTHENTICATED / NOT_LEAGUE_MEMBER / PLAYER_NOT_FOUND / PLAYER_NOT_ACTIVE / PLAYER_ALREADY_OWNED / ROSTER_FULL / ROSTER_LIMIT_EXCEEDED. PLAYER_ALREADY_OWNED from the unique_violation branch is the exact "two managers click ADD simultaneously" race outcome -- the database, not application logic, decides the winner.';

revoke all on function public.sign_player(uuid, uuid) from public;
grant execute on function public.sign_player(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Trades: propose / accept / reject / cancel.
-- ---------------------------------------------------------------------

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
  -- and the EMPTY_TRADE length check below both treat that the same as
  -- an explicit empty array.
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
  'Manager-facing: propose a trade to another team in the same league. Every offered/requested player must actually be owned by the expected team AT PROPOSAL TIME -- re-validated again, from scratch, at acceptance time (accept_trade), since this check alone cannot protect against ownership changing in between. Raises NOT_AUTHENTICATED / NOT_LEAGUE_MEMBER / RECEIVING_TEAM_NOT_FOUND / CANNOT_TRADE_WITH_SELF / EMPTY_TRADE / INVALID_TRADE_ASSET.';

revoke all on function public.propose_trade(uuid, uuid, uuid[], uuid[]) from public;
grant execute on function public.propose_trade(uuid, uuid, uuid[], uuid[]) to authenticated;

create or replace function public.cancel_trade(p_trade_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_trade public.trades%rowtype;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_trade from public.trades where id = p_trade_id for update;
  if v_trade.id is null then
    raise exception 'TRADE_NOT_FOUND';
  end if;

  if not exists (
    select 1 from public.fantasy_teams
    where id = v_trade.proposing_team_id and owner_user_id = v_user_id
  ) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if v_trade.status <> 'pending' then
    raise exception 'TRADE_NOT_PENDING';
  end if;

  update public.trades set status = 'cancelled' where id = p_trade_id;

  insert into public.domain_events (event_type, league_id, actor_user_id, fantasy_team_id, entity_type, entity_id, payload)
  values ('TRADE_CANCELLED', v_trade.league_id, v_user_id, v_trade.proposing_team_id, 'trade', p_trade_id, '{}'::jsonb);
end;
$$;

comment on function public.cancel_trade(uuid) is
  'Only the PROPOSING manager may cancel their own outgoing trade, and only while it is still pending. Raises NOT_AUTHENTICATED / TRADE_NOT_FOUND / NOT_AUTHORIZED / TRADE_NOT_PENDING.';

revoke all on function public.cancel_trade(uuid) from public;
grant execute on function public.cancel_trade(uuid) to authenticated;

create or replace function public.reject_trade(p_trade_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_trade public.trades%rowtype;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

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

  update public.trades set status = 'rejected' where id = p_trade_id;

  insert into public.domain_events (event_type, league_id, actor_user_id, fantasy_team_id, entity_type, entity_id, payload)
  values ('TRADE_REJECTED', v_trade.league_id, v_user_id, v_trade.receiving_team_id, 'trade', p_trade_id, '{}'::jsonb);
end;
$$;

comment on function public.reject_trade(uuid) is
  'Only the RECEIVING manager may reject an incoming trade, and only while it is still pending. A manager can never accept/reject their own outgoing trade as if they were the recipient -- this check (owner of receiving_team_id) makes that structurally impossible. Raises NOT_AUTHENTICATED / TRADE_NOT_FOUND / NOT_AUTHORIZED / TRADE_NOT_PENDING.';

revoke all on function public.reject_trade(uuid) from public;
grant execute on function public.reject_trade(uuid) to authenticated;

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

comment on function public.accept_trade(uuid) is
  'Only the RECEIVING manager may accept, and only while still pending. Re-validates every offered/requested player''s ownership from scratch (never trusting proposal-time state), resulting roster size (<=16) and positional maximums for BOTH teams, then transfers every asset atomically -- either the entire trade succeeds or nothing changes. Raises NOT_AUTHENTICATED / TRADE_NOT_FOUND / NOT_AUTHORIZED / TRADE_NOT_PENDING / TRADE_ASSET_NO_LONGER_OWNED / ROSTER_FULL / ROSTER_LIMIT_EXCEEDED.';

revoke all on function public.accept_trade(uuid) from public;
grant execute on function public.accept_trade(uuid) to authenticated;
