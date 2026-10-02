-- Pass 12B: multi-season lifecycle. "Your league is permanent. Your
-- seasons aren't." Adds the ability for a league to start Season N+1
-- inside itself (REDRAFT or KEEP ROSTERS) once Season N has COMPLETED,
-- and the schema fix required to let a league run more than one draft
-- over its lifetime.
--
-- `drafts.league_id` was UNIQUE (Pass 10) under the explicit assumption
-- "a league runs exactly one draft ever" -- that migration's own comment
-- flagged this for revisit "before ever supporting re-drafts." This pass
-- lifts it: `drafts` gains a nullable `season_id`. The league's very
-- first (inaugural) draft keeps `season_id = NULL` forever -- it is
-- created BEFORE any season row exists (a season only comes into being
-- when its first round opens; this is Pass 12A's own design and is not
-- being redesigned here). Every REDRAFT's new draft explicitly sets
-- `season_id` to the season it belongs to. `unique(season_id)` enforces
-- "at most one draft per season" for every draft created from here on
-- (Postgres UNIQUE never treats two NULLs as colliding, so the one
-- legacy season_id-NULL draft per league is unaffected).

alter table public.drafts drop constraint drafts_league_id_key;
alter table public.drafts add column season_id uuid references public.seasons (id) on delete cascade;
alter table public.drafts add constraint drafts_season_id_key unique (season_id);

-- Backfill: every league's existing (inaugural) draft belongs to its
-- season 1, if that season row already exists (it will for any league
-- whose draft completed and opened round 1 -- see Pass 12A's own
-- backfill). Left NULL for the rare self-heal edge case where a draft
-- completed but no round/season was ever created -- the app layer
-- already treats a NULL season_id draft as "this league's inaugural
-- draft" regardless of whether this backfill could resolve one.
update public.drafts d
set season_id = (
  select s.id from public.seasons s
  where s.league_id = d.league_id
  order by s.season_number asc
  limit 1
)
where exists (select 1 from public.seasons s where s.league_id = d.league_id);

-- seasons.roster_mode: null for season 1 (the inaugural season always
-- begins from a fresh draft -- there is no "previous season" roster to
-- redraft or keep). Populated only by start_next_season below.
alter table public.seasons add column roster_mode text check (roster_mode in ('REDRAFT', 'KEEP_ROSTERS'));

comment on column public.seasons.roster_mode is
  'How this season''s rosters were established: REDRAFT (fresh snake draft) or KEEP_ROSTERS (carried over from the previous season, minus ineligible players). NULL for season 1, which always begins from a fresh draft by definition.';

-- ---------------------------------------------------------------------
-- start_next_season: the one commissioner-only entry point for "Your
-- league is permanent, your seasons aren't." Atomically creates Season
-- N+1 (SETUP) and applies the chosen roster mode's side effects in the
-- SAME transaction, so there is never a window where a season exists in
-- a half-configured state:
--
--   REDRAFT: release every current roster_entries/league_player_ownership
--   row for the league (same soft-delete semantics drop_player already
--   uses -- roster_entries.status = 'dropped', never deleted, preserving
--   every historical lineup_slots/matchups reference), then create a
--   fresh drafts row for the new season with freshly randomized
--   draft_orders -- the exact same mechanism start_draft already uses
--   for a league's inaugural draft, just tied to Season N+1 instead.
--
--   KEEP_ROSTERS: release ownership ONLY for players whose
--   `players.active` has gone false since the previous season (the
--   canonical "no longer part of Eleven's draftable universe" flag --
--   see players.active's own existing use everywhere else in this
--   schema). Every other roster_entries/league_player_ownership row is
--   left completely untouched -- "keep rosters" needs no action at all
--   for an eligible player, since nothing about their ownership record
--   changes between seasons.
--
-- Neither branch opens Season N+1's first round here -- that remains
-- the job of the existing `openNextRound`/`resolveOrCreateActiveSeason`
-- engine (src/lib/fantasy-engine/rounds.ts), unchanged: for REDRAFT, the
-- season activates the moment the new draft completes (the same
-- draft-completion -> ensureFirstRoundOpened chain season 1 already
-- uses); for KEEP_ROSTERS, the calling server action invokes
-- `openNextRound` directly right after this RPC succeeds, since there is
-- no draft-completion event to hang the trigger on.
--
-- Concurrency: "impossible to create two active/setup next seasons" is
-- enforced the same way `resolveOrCreateActiveSeason`'s own season
-- bootstrap already is -- `unique(league_id, season_number)` turns a
-- concurrent double-click into a clean SEASON_ALREADY_STARTED for
-- whichever call loses the race, never a duplicate row.
-- ---------------------------------------------------------------------

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

  select * into v_league from public.fantasy_leagues fl where fl.id = p_league_id;
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

comment on function public.start_next_season(uuid, text, smallint) is
  'Commissioner-only. Creates Season N+1 (SETUP) inside the same permanent league once Season N has COMPLETED, applying REDRAFT (release all ownership + start a fresh draft) or KEEP_ROSTERS (release only players who are no longer eligible) atomically. Raises NOT_AUTHENTICATED / INVALID_ROSTER_MODE / INVALID_SCHEDULE_FORMAT / LEAGUE_NOT_FOUND / NOT_COMMISSIONER / NO_SEASON_TO_FOLLOW / SEASON_NOT_COMPLETE / SEASON_ALREADY_STARTED.';

revoke all on function public.start_next_season(uuid, text, smallint) from public;
grant execute on function public.start_next_season(uuid, text, smallint) to authenticated;

-- 'SEASON_STARTED' needs no new domain_events.event_type check -- that
-- column is free-text (see 20260929141139_transactions_events.sql), not
-- constrained to an enum.
