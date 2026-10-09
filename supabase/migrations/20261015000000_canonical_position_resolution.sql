-- Pass 3 (position overrides): wire the canonical, override-aware
-- position into every gameplay surface that enforces or counts player
-- position -- draft picks (including future drafts' autopick), free-agent
-- signing, and trade acceptance. NOT YET APPLIED to any environment.
--
-- Mechanism: `players.canonical_position`, a new trigger-maintained
-- column resolved with a fixed precedence: an approved row in
-- `player_position_overrides` wins; otherwise the provider's raw
-- `position` (verified detailed positional evidence is a third tier that
-- exists in the precedence rule but has no concrete source today -- see
-- src/domain/fantasy/position-classification.ts's module doc). Two
-- triggers keep it correct automatically:
--   1. `players` BEFORE INSERT OR UPDATE -- every write (including a
--      future API-Football resync overwriting `position`) recomputes
--      `canonical_position` from the override table, so an override
--      SURVIVES resynchronization (requirement 1) without the sync code
--      needing to know overrides exist at all.
--   2. `player_position_overrides` AFTER INSERT OR UPDATE OR DELETE --
--      an approved override takes effect immediately, and removing one
--      correctly reverts the player to their raw provider position.
--
-- `players.position` itself is NEVER written by anything in this
-- migration -- it stays exactly what provider sync produces, preserving
-- original provider positions (requirement 3). Override audit history
-- (reason, evidence source, confidence, who/when) lives in
-- `player_position_overrides` (20261014000000_position_classification_overrides.sql),
-- untouched by this migration.
--
-- Historical scoring protection (requirement 4): deliberately NOT done by
-- touching scoring code. `src/lib/scoring/backfill.ts`, `replay.ts` and
-- `calibration.ts` continue to read `players.position` exactly as before
-- -- this migration adds no column they select and changes no function
-- they call. A corrected position affects future roster/lineup/draft
-- decisions, never the stats-to-points calculation for a fixture that
-- already happened. See docs/audits/ for the explicit test proving this.
--
-- Below: the column + both triggers, then four functions re-created with
-- the ONLY change being `p.position` / bare `position` -> canonical_position
-- (mechanically extracted and substituted from the live source migrations
-- -- 20260930024807_draft_engine.sql and
-- 20261013000000_pre_draft_acquisition_guard.sql -- verified by diff to
-- contain no other change). `propose_trade` and `start_next_season` are
-- untouched (neither reads player position) so are not re-created here.

alter table public.players add column canonical_position text;
update public.players set canonical_position = position;
alter table public.players alter column canonical_position set not null;
alter table public.players add constraint players_canonical_position_check
  check (canonical_position in ('GK', 'DEF', 'MID', 'FWD'));

comment on column public.players.canonical_position is
  'Override-aware effective position for every gameplay decision (draft, free agency, trades, lineup validation, Players/Team/Draft display). Trigger-maintained -- never written directly by application code. players.position remains the raw, untouched provider value.';

create function public._resolve_canonical_position(p_player_id uuid, p_provider_position text)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select override_position from public.player_position_overrides where player_id = p_player_id),
    p_provider_position
  );
$$;

create function public._sync_player_canonical_position() returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.canonical_position := public._resolve_canonical_position(new.id, new.position);
  return new;
end;
$$;

create trigger sync_canonical_position_on_player_write
  before insert or update on public.players
  for each row execute function public._sync_player_canonical_position();

create function public._apply_position_override_to_player() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.players set canonical_position = position where id = old.player_id;
    return old;
  end if;
  update public.players set canonical_position = new.override_position where id = new.player_id;
  return new;
end;
$$;

create trigger apply_position_override_to_player
  after insert or update or delete on public.player_position_overrides
  for each row execute function public._apply_position_override_to_player();

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

  select p.active, p.canonical_position into v_player_active, v_player_position from public.players p where p.id = p_player_id;
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
    count(*) filter (where p.canonical_position = 'GK'),
    count(*) filter (where p.canonical_position = 'DEF'),
    count(*) filter (where p.canonical_position = 'MID'),
    count(*) filter (where p.canonical_position = 'FWD')
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

  select active, canonical_position into v_player_active, v_player_position
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
  where re.fantasy_team_id = v_team_id and re.status = 'active' and p.canonical_position = v_player_position;

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
    count(*) filter (where p.canonical_position = 'GK'), count(*) filter (where p.canonical_position = 'DEF'),
    count(*) filter (where p.canonical_position = 'MID'), count(*) filter (where p.canonical_position = 'FWD')
    into v_proposing_gk, v_proposing_def, v_proposing_mid, v_proposing_fwd
  from public.roster_entries re join public.players p on p.id = re.player_id
  where re.fantasy_team_id = v_trade.proposing_team_id and re.status = 'active';

  select
    count(*) filter (where p.canonical_position = 'GK'), count(*) filter (where p.canonical_position = 'DEF'),
    count(*) filter (where p.canonical_position = 'MID'), count(*) filter (where p.canonical_position = 'FWD')
    into v_receiving_gk, v_receiving_def, v_receiving_mid, v_receiving_fwd
  from public.roster_entries re join public.players p on p.id = re.player_id
  where re.fantasy_team_id = v_trade.receiving_team_id and re.status = 'active';

  for v_asset in select * from public.trade_assets where trade_id = p_trade_id loop
    select p.canonical_position into v_player_position from public.players p where p.id = v_asset.player_id;

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
