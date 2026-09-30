-- Pass 10: the authoritative snake draft engine. Follows the exact
-- pattern already established by create_league()/join_league_by_invite_code()
-- (supabase/migrations/20260929141145_functions.sql): SECURITY DEFINER
-- functions doing one atomic transaction per call, explicit RAISE
-- EXCEPTION error codes the application layer pattern-matches on, no new
-- client-facing RLS write policy (see that migration's own rationale for
-- why — "most tables intentionally have no INSERT/UPDATE/DELETE policy
-- for authenticated").
--
-- Draft turn order is derived, never stored redundantly: `drafts.current_round`/
-- `current_pick` are round-local (current_pick resets to 1 each new round,
-- matching FORMATION_RULES.squadSizeApprox-many rounds total, read live
-- from `fantasy_leagues.settings->>'squadSize'` rather than duplicated
-- onto the drafts row). `draft_picks.pick_number` is the OVERALL pick
-- number across the whole draft, computed at insert time.

alter table public.drafts add column current_pick_started_at timestamptz;

comment on column public.drafts.current_pick_started_at is
  'When the CURRENT pick''s timer began. The deadline is this + fantasy_leagues.settings.pickTimerSeconds. Authoritative — refreshing/reconnecting reads this same instant, never a client-local countdown. Null before the draft starts / after it completes.';

comment on column public.drafts.current_round is
  'Round-LOCAL, not overall pick count — resets to 1 whenever a fresh draft starts, increments once current_pick would exceed the league''s team count. Total rounds = fantasy_leagues.settings->>''squadSize'' (not stored redundantly on this row).';

comment on column public.drafts.current_pick is
  'Round-LOCAL pick number (1..team count), NOT the same as draft_picks.pick_number (which is the overall 1..totalPicks count) — see make_draft_pick() for the exact conversion.';

-- ---------------------------------------------------------------------
-- start_draft: commissioner-only, requires at least 2 managers (NOT the
-- league's configured settings.maxTeams target -- a league configured
-- for 10 managers may still start with as few as 2; Eleven never
-- requires filling the configured target before starting, and never
-- auto-starts on reaching the minimum either). Randomizes the team order
-- (via SQL's own `order by random()` rather than trusting a client-
-- supplied order -- the whole point of generating it server-side),
-- persists it as draft_orders, and creates the drafts row with the
-- timer already running for pick 1.
-- ---------------------------------------------------------------------

create or replace function public.start_draft(p_league_id uuid)
returns table (draft_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_league public.fantasy_leagues%rowtype;
  v_member_count int;
  -- 2, not settings.maxTeams (the league's configured TARGET size) --
  -- a commissioner may start the draft as soon as 2 managers have
  -- joined, without waiting to hit the configured target. Mirrors
  -- src/domain/fantasy/constants.ts's MIN_MANAGERS_TO_START_DRAFT;
  -- keep both in sync if this ever changes.
  v_min_managers constant int := 2;
  v_draft_id uuid;
  v_position int := 0;
  v_team record;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_league from public.fantasy_leagues fl where fl.id = p_league_id;
  if v_league.id is null then
    raise exception 'LEAGUE_NOT_FOUND';
  end if;

  if not public.is_league_commissioner(p_league_id) then
    raise exception 'NOT_COMMISSIONER';
  end if;

  if v_league.status not in ('draft', 'active') then
    raise exception 'LEAGUE_CLOSED';
  end if;

  if exists (select 1 from public.drafts d where d.league_id = p_league_id) then
    raise exception 'DRAFT_ALREADY_EXISTS';
  end if;

  select count(*) into v_member_count from public.league_memberships m where m.league_id = p_league_id;

  if v_member_count < v_min_managers then
    raise exception 'LEAGUE_NOT_FULL';
  end if;

  insert into public.drafts (league_id, status, type, current_round, current_pick, started_at, current_pick_started_at)
  values (p_league_id, 'in_progress', 'snake', 1, 1, now(), now())
  returning id into v_draft_id;

  for v_team in
    select ft.id from public.fantasy_teams ft where ft.league_id = p_league_id order by random()
  loop
    v_position := v_position + 1;
    insert into public.draft_orders (draft_id, fantasy_team_id, position) values (v_draft_id, v_team.id, v_position);
  end loop;

  insert into public.domain_events (event_type, league_id, actor_user_id, entity_type, entity_id, payload)
  values ('DRAFT_STARTED', p_league_id, v_user_id, 'draft', v_draft_id, jsonb_build_object('teamCount', v_member_count));

  return query select v_draft_id;
end;
$$;

comment on function public.start_draft(uuid) is
  'Commissioner-only, requires at least 2 managers (not settings.maxTeams). Atomically randomizes and persists the snake draft order, then creates the in_progress drafts row with pick 1''s timer running. Raises NOT_AUTHENTICATED / LEAGUE_NOT_FOUND / NOT_COMMISSIONER / LEAGUE_CLOSED / DRAFT_ALREADY_EXISTS / LEAGUE_NOT_FULL.';

revoke all on function public.start_draft(uuid) from public;
grant execute on function public.start_draft(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- _perform_draft_pick: the shared, trusted core. Takes the drafting
-- TEAM explicitly rather than resolving it from auth.uid() — this is
-- what lets both a real manager's pick (make_draft_pick, which resolves
-- the team from the caller's own session) and a timed-out auto-pick
-- (resolve_expired_pick, which already knows whose turn expired) share
-- one atomic implementation without either one impersonating the other.
-- Not granted to `authenticated` — only reachable through the two public
-- wrappers below, which are responsible for their own authorization.
-- `select ... for update` on the drafts row serializes concurrent calls
-- for the same draft (the standard Postgres pattern for "exactly one of
-- these concurrent transactions may proceed") — this is what makes "two
-- clients draft the same player simultaneously" resolve to exactly one
-- winner. The `league_player_ownership` primary key
-- (league_id, player_id) is the belt-and-suspenders final guarantee even
-- if the row lock were somehow bypassed.
-- ---------------------------------------------------------------------

create or replace function public._perform_draft_pick(
  p_draft_id uuid,
  p_team_id uuid,
  p_player_id uuid,
  p_actor_user_id uuid
)
returns table (
  pick_number int,
  round int,
  fantasy_team_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft public.drafts%rowtype;
  v_league public.fantasy_leagues%rowtype;
  v_team_count int;
  v_total_rounds int;
  v_expected_position int;
  v_team_position int;
  v_overall_pick int;
  v_roster_entry_id uuid;
  v_player_active boolean;
  -- Canonical 16-player squad composition rules (Pass 10.5) --
  -- src/domain/fantasy/constants.ts's ROSTER_RULES and
  -- src/domain/fantasy/roster-rules.ts's isRosterCompletable/
  -- canDraftPosition, re-derived here in SQL because THIS is the actual
  -- atomic enforcement point (see this function's own header comment) --
  -- disabled buttons in the Draft UI are a courtesy, never the guarantee.
  -- GK has no real range, it's fixed at exactly 2.
  v_player_position text;
  v_gk_min constant int := 2; v_gk_max constant int := 2;
  v_def_min constant int := 4; v_def_max constant int := 6;
  v_mid_min constant int := 4; v_mid_max constant int := 6;
  v_fwd_min constant int := 2; v_fwd_max constant int := 4;
  v_gk_count int; v_def_count int; v_mid_count int; v_fwd_count int;
  v_next_gk int; v_next_def int; v_next_mid int; v_next_fwd int;
  v_picks_made int;
  v_picks_remaining_after int;
  v_min_shortfall int;
  v_max_room int;
begin
  select * into v_draft from public.drafts d where d.id = p_draft_id for update;
  if v_draft.id is null then
    raise exception 'DRAFT_NOT_FOUND';
  end if;
  if v_draft.status <> 'in_progress' then
    raise exception 'DRAFT_NOT_ACTIVE';
  end if;

  select * into v_league from public.fantasy_leagues fl where fl.id = v_draft.league_id;
  v_total_rounds := coalesce((v_league.settings ->> 'squadSize')::int, 16);

  select do_.position into v_team_position
  from public.draft_orders do_
  where do_.draft_id = p_draft_id and do_.fantasy_team_id = p_team_id;

  if v_team_position is null then
    raise exception 'NOT_LEAGUE_MEMBER';
  end if;

  select count(*) into v_team_count from public.draft_orders do_ where do_.draft_id = p_draft_id;

  -- Snake math: odd rounds go position 1..N, even rounds go N..1 — the
  -- same rule as src/domain/fantasy/draft-order.ts's
  -- teamPositionForPick(), independently re-derived here because this is
  -- where atomicity/locking actually happens (SQL can't call TypeScript).
  v_expected_position := case
    when v_draft.current_round % 2 = 1 then v_draft.current_pick
    else v_team_count - v_draft.current_pick + 1
  end;

  if v_team_position is distinct from v_expected_position then
    raise exception 'NOT_YOUR_TURN';
  end if;

  select p.active, p.position into v_player_active, v_player_position from public.players p where p.id = p_player_id;
  if v_player_active is null then
    raise exception 'PLAYER_NOT_FOUND';
  end if;
  if not v_player_active then
    raise exception 'PLAYER_NOT_ACTIVE';
  end if;

  if exists (
    select 1 from public.league_player_ownership lpo
    where lpo.league_id = v_draft.league_id and lpo.player_id = p_player_id
  ) then
    raise exception 'PLAYER_ALREADY_OWNED';
  end if;

  -- Roster-limit enforcement (Pass 10.5): reject this pick outright if it
  -- would exceed the picked position's own maximum, OR if it would leave
  -- some OTHER position's minimum mathematically unreachable in the picks
  -- this team has left. Worked example from the brief: 2 picks left, team
  -- still needs 1 GK and 1 DEF to hit minimums -- a MID/FWD pick here must
  -- be rejected even though MID/FWD aren't individually maxed.
  select
    count(*) filter (where p.position = 'GK'),
    count(*) filter (where p.position = 'DEF'),
    count(*) filter (where p.position = 'MID'),
    count(*) filter (where p.position = 'FWD')
    into v_gk_count, v_def_count, v_mid_count, v_fwd_count
  from public.roster_entries re
  join public.players p on p.id = re.player_id
  where re.fantasy_team_id = p_team_id and re.status = 'active';

  v_next_gk := v_gk_count + case when v_player_position = 'GK' then 1 else 0 end;
  v_next_def := v_def_count + case when v_player_position = 'DEF' then 1 else 0 end;
  v_next_mid := v_mid_count + case when v_player_position = 'MID' then 1 else 0 end;
  v_next_fwd := v_fwd_count + case when v_player_position = 'FWD' then 1 else 0 end;

  if v_next_gk > v_gk_max or v_next_def > v_def_max or v_next_mid > v_mid_max or v_next_fwd > v_fwd_max then
    raise exception 'ROSTER_LIMIT_EXCEEDED';
  end if;

  v_picks_made := v_gk_count + v_def_count + v_mid_count + v_fwd_count;
  v_picks_remaining_after := v_total_rounds - v_picks_made - 1;

  v_min_shortfall := greatest(v_gk_min - v_next_gk, 0) + greatest(v_def_min - v_next_def, 0)
    + greatest(v_mid_min - v_next_mid, 0) + greatest(v_fwd_min - v_next_fwd, 0);
  v_max_room := greatest(v_gk_max - v_next_gk, 0) + greatest(v_def_max - v_next_def, 0)
    + greatest(v_mid_max - v_next_mid, 0) + greatest(v_fwd_max - v_next_fwd, 0);

  if v_picks_remaining_after < 0
     or v_min_shortfall > v_picks_remaining_after
     or v_picks_remaining_after > v_max_room then
    raise exception 'ROSTER_LIMIT_EXCEEDED';
  end if;

  v_overall_pick := (v_draft.current_round - 1) * v_team_count + v_draft.current_pick;

  insert into public.roster_entries (league_id, fantasy_team_id, player_id, acquisition_type, status)
  values (v_draft.league_id, p_team_id, p_player_id, 'draft', 'active')
  returning id into v_roster_entry_id;

  begin
    insert into public.league_player_ownership (league_id, player_id, fantasy_team_id, roster_entry_id)
    values (v_draft.league_id, p_player_id, p_team_id, v_roster_entry_id);
  exception when unique_violation then
    raise exception 'PLAYER_ALREADY_OWNED';
  end;

  insert into public.draft_picks (draft_id, round, pick_number, fantasy_team_id, player_id)
  values (p_draft_id, v_draft.current_round, v_overall_pick, p_team_id, p_player_id);

  insert into public.transactions (league_id, type, actor_user_id, fantasy_team_id, reference, metadata)
  values (v_draft.league_id, 'draft_pick', p_actor_user_id, p_team_id, p_player_id::text,
    jsonb_build_object('round', v_draft.current_round, 'pickNumber', v_overall_pick));

  insert into public.domain_events (event_type, league_id, actor_user_id, fantasy_team_id, entity_type, entity_id, payload)
  values ('DRAFT_PICK_MADE', v_draft.league_id, p_actor_user_id, p_team_id, 'player', p_player_id,
    jsonb_build_object('round', v_draft.current_round, 'pickNumber', v_overall_pick));

  if v_draft.current_pick >= v_team_count then
    if v_draft.current_round >= v_total_rounds then
      update public.drafts
        set status = 'completed', completed_at = now(), current_pick_started_at = null
        where id = p_draft_id;

      insert into public.domain_events (event_type, league_id, actor_user_id, entity_type, entity_id, payload)
      values ('DRAFT_COMPLETED', v_draft.league_id, p_actor_user_id, 'draft', p_draft_id, '{}'::jsonb);
    else
      update public.drafts
        set current_round = v_draft.current_round + 1, current_pick = 1, current_pick_started_at = now()
        where id = p_draft_id;
    end if;
  else
    update public.drafts
      set current_pick = v_draft.current_pick + 1, current_pick_started_at = now()
      where id = p_draft_id;
  end if;

  return query select v_overall_pick, v_draft.current_round::int, p_team_id;
end;
$$;

comment on function public._perform_draft_pick(uuid, uuid, uuid, uuid) is
  'Trusted internal core shared by make_draft_pick and resolve_expired_pick — takes the drafting team explicitly rather than resolving it from auth.uid(), so an auto-pick can act on behalf of the team whose turn timed out. Not exposed to `authenticated` directly. Authoritatively enforces the canonical 16-player roster composition rules (GK exactly 2, DEF/MID 4-6, FWD 2-4) — raises ROSTER_LIMIT_EXCEEDED if this pick would exceed a position''s max or make some other position''s minimum mathematically unreachable.';

-- ---------------------------------------------------------------------
-- make_draft_pick: the user-facing entry point. Resolves the caller's
-- own team from auth.uid(), then delegates to the shared core above.
-- ---------------------------------------------------------------------

create or replace function public.make_draft_pick(p_draft_id uuid, p_player_id uuid)
returns table (
  pick_number int,
  round int,
  fantasy_team_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_league_id uuid;
  v_caller_team_id uuid;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select d.league_id into v_league_id from public.drafts d where d.id = p_draft_id;
  if v_league_id is null then
    raise exception 'DRAFT_NOT_FOUND';
  end if;

  select ft.id into v_caller_team_id
  from public.fantasy_teams ft
  where ft.league_id = v_league_id and ft.owner_user_id = v_user_id;

  if v_caller_team_id is null then
    raise exception 'NOT_LEAGUE_MEMBER';
  end if;

  return query select * from public._perform_draft_pick(p_draft_id, v_caller_team_id, p_player_id, v_user_id);
end;
$$;

comment on function public.make_draft_pick(uuid, uuid) is
  'The manager-facing draft pick action. Resolves the caller''s own team in this draft''s league from auth.uid(), then performs the pick atomically via _perform_draft_pick. Raises NOT_AUTHENTICATED / DRAFT_NOT_FOUND / NOT_LEAGUE_MEMBER / DRAFT_NOT_ACTIVE / NOT_YOUR_TURN / PLAYER_NOT_FOUND / PLAYER_NOT_ACTIVE / PLAYER_ALREADY_OWNED / ROSTER_LIMIT_EXCEEDED.';

revoke all on function public.make_draft_pick(uuid, uuid) from public;
grant execute on function public.make_draft_pick(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- resolve_expired_pick: safe to call from ANY connected league member's
-- own countdown poll, or from trusted server-side code (the simulation
-- harness, a future scheduled job) via the service_role key. Authority
-- is the persisted `current_pick_started_at` + pickTimerSeconds deadline
-- this function itself checks against `p_as_of` — never the caller's
-- claim that time is up. `p_as_of` defaults to the real clock in
-- production but is explicitly overridable, the same clock-injection
-- rule as every other time-sensitive function in this pass (see
-- docs/game-rules.md "Clock injection") — extended here into SQL so the
-- simulation harness can drive an entire draft's auto-picks without
-- waiting on real wall-clock pick timers.
-- ---------------------------------------------------------------------

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
  select * into v_draft from public.drafts d where d.id = p_draft_id;
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

  -- Position-deficit auto-pick: among positions that remain LEGAL to pick
  -- right now (would not exceed that position's max, and would not make
  -- any position's minimum mathematically unreachable afterward — the
  -- exact same check _perform_draft_pick itself enforces), prioritize
  -- whichever unmet minimum comes first in fixed GK/DEF/MID/FWD order,
  -- then the first eligible, unowned player at that position ordered by
  -- name. Once every minimum is met, falls back to the first still-legal
  -- position in that same GK/DEF/MID/FWD order. No rating/points-based
  -- recommendation of any kind — see docs/game-rules.md "Draft."
  select count(*) filter (where p.position = 'GK'), count(*) filter (where p.position = 'DEF'),
         count(*) filter (where p.position = 'MID'), count(*) filter (where p.position = 'FWD')
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
    when v_fwd_draftable and v_fwd_count < v_fwd_min then 'FWD'
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
    and p.position = v_deficit_position
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

comment on function public.resolve_expired_pick(uuid, timestamptz) is
  'Callable by any league member (via auth.uid()) or by trusted server code (service_role) — only actually acts once the persisted pick-timer deadline has passed as of `p_as_of` (defaults to real now(), overridable for the simulation harness; else raises TIMER_NOT_EXPIRED). Deterministic auto-pick: among positions that remain legal under the canonical ROSTER_RULES (GK exactly 2, DEF/MID 4-6, FWD 2-4, and never making a minimum mathematically unreachable), fills the drafting team''s biggest unmet minimum first (GK/DEF/MID/FWD priority order, then player name), falling back to the first still-legal position once minimums are satisfied. Can never construct an invalid squad. Delegates to _perform_draft_pick() for the actual atomic pick.';

revoke all on function public.resolve_expired_pick(uuid, timestamptz) from public;
grant execute on function public.resolve_expired_pick(uuid, timestamptz) to authenticated;
grant execute on function public.resolve_expired_pick(uuid, timestamptz) to service_role;
