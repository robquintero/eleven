-- Draft synchronization only. No existing picks, rosters, positions, lineups
-- or results are rewritten. Existing RPC signatures remain compatible.

-- RLS applies to this INVOKER read. Return database time alongside the
-- authoritative turn/deadline origin in the same statement.
create or replace function public.get_draft_clock(p_league_id uuid)
returns table(id uuid, status text, current_round int, current_pick int, current_pick_started_at timestamptz, server_now timestamptz)
language sql volatile security invoker set search_path = public
as $$
  select d.id,d.status,d.current_round::int,d.current_pick::int,d.current_pick_started_at,clock_timestamp()
  from public.drafts d where d.league_id=p_league_id
  order by d.created_at desc limit 1;
$$;
revoke all on function public.get_draft_clock(uuid) from public, anon;
grant execute on function public.get_draft_clock(uuid) to authenticated, service_role;

-- Lock BEFORE expiry checks, roster/position counts and candidate selection.
-- The underlying pick function takes the same lock (reentrant), so two
-- resolvers cannot compute candidates against an already-advanced turn.
create or replace function public.resolve_expired_pick(p_draft_id uuid, p_as_of timestamptz default now())
returns table (
  pick_number int,
  round int,
  fantasy_team_id uuid,
  player_id uuid,
  auto_picked boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_draft public.drafts%rowtype;
  v_league public.fantasy_leagues%rowtype;
  v_timer_seconds int;
  v_team_count int;
  v_total_rounds int;
  v_expected_position int;
  v_team_id uuid;
  v_chosen_player_id uuid;
  -- Canonical 16-player squad composition rules (Pass 10.5) — the SAME
  -- ROSTER_RULES numbers _perform_draft_pick enforces, not the looser
  -- starting-XI FORMATION_RULES minimums this used before. Auto-pick must
  -- never construct a roster _perform_draft_pick would itself reject, so
  -- it re-derives the exact same isRosterCompletable/canDraftPosition
  -- math (src/domain/fantasy/roster-rules.ts) to choose ONLY among
  -- positions that stay legal, rather than relying on _perform_draft_pick
  -- to bail out after the fact (which would surface as an unhandled
  -- auto-pick failure instead of a safe, deterministic choice).
  v_gk_min constant int := 2; v_gk_max constant int := 2;
  v_def_min constant int := 4; v_def_max constant int := 6;
  v_mid_min constant int := 4; v_mid_max constant int := 6;
  v_fwd_min constant int := 2; v_fwd_max constant int := 4;
  v_gk_count int; v_def_count int; v_mid_count int; v_fwd_count int;
  v_picks_made int;
  v_picks_remaining_incl int;
  v_remaining_after int;
  v_next_gk int; v_next_def int; v_next_mid int; v_next_fwd int;
  v_min_shortfall int;
  v_max_room int;
  v_gk_draftable boolean; v_def_draftable boolean; v_mid_draftable boolean; v_fwd_draftable boolean;
  v_deficit_position text;
begin
  select * into v_draft from public.drafts d where d.id = p_draft_id for update;
  if v_draft.id is null then
    raise exception 'DRAFT_NOT_FOUND';
  end if;

  if v_user_id is null and auth.role() <> 'service_role' then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if v_user_id is not null and not public.is_league_member(v_draft.league_id) then
    raise exception 'NOT_LEAGUE_MEMBER';
  end if;

  if v_draft.status <> 'in_progress' then
    raise exception 'DRAFT_NOT_ACTIVE';
  end if;

  select * into v_league from public.fantasy_leagues fl where fl.id = v_draft.league_id;
  -- 300s (5 min) fallback -- keep in sync with src/domain/fantasy/constants.ts's
  -- DEFAULT_LEAGUE_SETTINGS.pickTimerSeconds and create_league()'s own
  -- SQL default (supabase/migrations/20260929141145_functions.sql) if this
  -- ever changes.
  v_timer_seconds := coalesce((v_league.settings ->> 'pickTimerSeconds')::int, 300);
  v_total_rounds := coalesce((v_league.settings ->> 'squadSize')::int, 16);

  -- Only trusted service simulations may inject time. Managers use the
  -- database clock AFTER taking the row lock, never a forged client clock.
  if auth.role() is distinct from 'service_role' then
    p_as_of := clock_timestamp();
  end if;

  if v_draft.current_pick_started_at is null
     or p_as_of < v_draft.current_pick_started_at + make_interval(secs => v_timer_seconds) then
    raise exception 'TIMER_NOT_EXPIRED';
  end if;

  select count(*) into v_team_count from public.draft_orders do_ where do_.draft_id = p_draft_id;
  v_expected_position := case
    when v_draft.current_round % 2 = 1 then v_draft.current_pick
    else v_team_count - v_draft.current_pick + 1
  end;

  select do_.fantasy_team_id into v_team_id
  from public.draft_orders do_
  where do_.draft_id = p_draft_id and do_.position = v_expected_position;

  -- Secure a third forward for the approved 4-3-3 before spare depth.
  -- This changes autopick preference only; manual roster min/max remain intact.
  -- Position-deficit auto-pick: among positions that remain LEGAL to pick
  -- right now (would not exceed that position's max, and would not make
  -- any position's minimum mathematically unreachable afterward — the
  -- exact same check _perform_draft_pick itself enforces), prioritize
  -- whichever unmet minimum comes first in fixed GK/DEF/MID/FWD order,
  -- then the first eligible, unowned player at that position ordered by
  -- name. Once every minimum is met, falls back to the first still-legal
  -- position in that same GK/DEF/MID/FWD order. No rating/points-based
  -- recommendation of any kind — see docs/game-rules.md "Draft."
  select count(*) filter (where p.canonical_position = 'GK'), count(*) filter (where p.canonical_position = 'DEF'),
         count(*) filter (where p.canonical_position = 'MID'), count(*) filter (where p.canonical_position = 'FWD')
    into v_gk_count, v_def_count, v_mid_count, v_fwd_count
  from public.roster_entries re join public.players p on p.id = re.player_id
  where re.fantasy_team_id = v_team_id and re.status = 'active';

  v_picks_made := v_gk_count + v_def_count + v_mid_count + v_fwd_count;
  v_picks_remaining_incl := v_total_rounds - v_picks_made;
  v_remaining_after := v_picks_remaining_incl - 1;

  v_next_gk := v_gk_count + 1;
  v_min_shortfall := greatest(v_gk_min - v_next_gk, 0) + greatest(v_def_min - v_def_count, 0)
    + greatest(v_mid_min - v_mid_count, 0) + greatest(v_fwd_min - v_fwd_count, 0);
  v_max_room := greatest(v_gk_max - v_next_gk, 0) + greatest(v_def_max - v_def_count, 0)
    + greatest(v_mid_max - v_mid_count, 0) + greatest(v_fwd_max - v_fwd_count, 0);
  v_gk_draftable := v_next_gk <= v_gk_max and v_min_shortfall <= v_remaining_after and v_remaining_after <= v_max_room;

  v_next_def := v_def_count + 1;
  v_min_shortfall := greatest(v_gk_min - v_gk_count, 0) + greatest(v_def_min - v_next_def, 0)
    + greatest(v_mid_min - v_mid_count, 0) + greatest(v_fwd_min - v_fwd_count, 0);
  v_max_room := greatest(v_gk_max - v_gk_count, 0) + greatest(v_def_max - v_next_def, 0)
    + greatest(v_mid_max - v_mid_count, 0) + greatest(v_fwd_max - v_fwd_count, 0);
  v_def_draftable := v_next_def <= v_def_max and v_min_shortfall <= v_remaining_after and v_remaining_after <= v_max_room;

  v_next_mid := v_mid_count + 1;
  v_min_shortfall := greatest(v_gk_min - v_gk_count, 0) + greatest(v_def_min - v_def_count, 0)
    + greatest(v_mid_min - v_next_mid, 0) + greatest(v_fwd_min - v_fwd_count, 0);
  v_max_room := greatest(v_gk_max - v_gk_count, 0) + greatest(v_def_max - v_def_count, 0)
    + greatest(v_mid_max - v_next_mid, 0) + greatest(v_fwd_max - v_fwd_count, 0);
  v_mid_draftable := v_next_mid <= v_mid_max and v_min_shortfall <= v_remaining_after and v_remaining_after <= v_max_room;

  v_next_fwd := v_fwd_count + 1;
  v_min_shortfall := greatest(v_gk_min - v_gk_count, 0) + greatest(v_def_min - v_def_count, 0)
    + greatest(v_mid_min - v_mid_count, 0) + greatest(v_fwd_min - v_next_fwd, 0);
  v_max_room := greatest(v_gk_max - v_gk_count, 0) + greatest(v_def_max - v_def_count, 0)
    + greatest(v_mid_max - v_mid_count, 0) + greatest(v_fwd_max - v_next_fwd, 0);
  v_fwd_draftable := v_next_fwd <= v_fwd_max and v_min_shortfall <= v_remaining_after and v_remaining_after <= v_max_room;

  v_deficit_position := case
    when v_gk_draftable and v_gk_count < v_gk_min then 'GK'
    when v_def_draftable and v_def_count < v_def_min then 'DEF'
    when v_mid_draftable and v_mid_count < v_mid_min then 'MID'
    when v_fwd_draftable and v_fwd_count < greatest(v_fwd_min, 3) then 'FWD'
    when v_gk_draftable then 'GK'
    when v_def_draftable then 'DEF'
    when v_mid_draftable then 'MID'
    when v_fwd_draftable then 'FWD'
    else null
  end;

  if v_deficit_position is null then
    raise exception 'NO_ELIGIBLE_PLAYER';
  end if;

  select p.id into v_chosen_player_id
  from public.players p
  where p.active = true
    and p.canonical_position = v_deficit_position
    and not exists (
      select 1 from public.league_player_ownership lpo
      where lpo.league_id = v_draft.league_id and lpo.player_id = p.id
    )
  order by p.name
  limit 1;

  if v_chosen_player_id is null then
    raise exception 'NO_ELIGIBLE_PLAYER';
  end if;

  return query
    select pp.pick_number, pp.round, pp.fantasy_team_id, v_chosen_player_id, true
    from public._perform_draft_pick(p_draft_id, v_team_id, v_chosen_player_id, null) pp;
end;
$$;
revoke all on function public.resolve_expired_pick(uuid,timestamptz) from public,anon;
grant execute on function public.resolve_expired_pick(uuid,timestamptz) to authenticated,service_role;

-- Bind an attempt to the overall pick the client actually saw. In a snake
-- draft the same manager can have adjacent turns; membership alone cannot
-- distinguish a delayed previous-turn request from a deliberate new pick.
create or replace function public.submit_draft_turn(p_draft_id uuid,p_player_id uuid,p_expected_pick int)
returns table(pick_number int,round int,fantasy_team_id uuid)
language plpgsql security definer set search_path=public
as $$
declare d public.drafts%rowtype; n int;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into d from public.drafts where id=p_draft_id for update;
  if d.id is null then raise exception 'DRAFT_NOT_FOUND'; end if;
  if not public.is_league_member(d.league_id) then raise exception 'NOT_LEAGUE_MEMBER'; end if;
  if d.status <> 'in_progress' then raise exception 'DRAFT_NOT_ACTIVE'; end if;
  select count(*) into n from public.draft_orders where draft_id=p_draft_id;
  if p_expected_pick is null or p_expected_pick <> (d.current_round-1)*n+d.current_pick then
    raise exception 'STALE_DRAFT_TURN';
  end if;
  return query select * from public.make_draft_pick(p_draft_id,p_player_id);
end;
$$;
revoke all on function public.submit_draft_turn(uuid,uuid,int) from public,anon;
grant execute on function public.submit_draft_turn(uuid,uuid,int) to authenticated;

create or replace function public.resolve_draft_turn(p_draft_id uuid,p_expected_pick int)
returns table(pick_number int,round int,fantasy_team_id uuid,player_id uuid,auto_picked boolean)
language plpgsql security definer set search_path=public
as $$
declare d public.drafts%rowtype; n int;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into d from public.drafts where id=p_draft_id for update;
  if d.id is null then raise exception 'DRAFT_NOT_FOUND'; end if;
  if not public.is_league_member(d.league_id) then raise exception 'NOT_LEAGUE_MEMBER'; end if;
  if d.status <> 'in_progress' then raise exception 'DRAFT_NOT_ACTIVE'; end if;
  select count(*) into n from public.draft_orders where draft_id=p_draft_id;
  if p_expected_pick is null or p_expected_pick <> (d.current_round-1)*n+d.current_pick then
    raise exception 'STALE_DRAFT_TURN';
  end if;
  return query select * from public.resolve_expired_pick(p_draft_id);
end;
$$;
revoke all on function public.resolve_draft_turn(uuid,int) from public,anon;
grant execute on function public.resolve_draft_turn(uuid,int) to authenticated;

-- Supabase creates this publication. Embedded test databases may omit it.
-- Additive and redeploy-safe; existing tables/replica identity/RLS untouched.
do $$
declare t text;
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    foreach t in array array['drafts','draft_picks','league_player_ownership'] loop
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
        execute format('alter publication supabase_realtime add table public.%I',t);
      end if;
    end loop;
  end if;
end;
$$;
