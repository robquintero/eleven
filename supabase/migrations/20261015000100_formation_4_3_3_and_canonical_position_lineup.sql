-- Pass 2/3 (4-3-3 + position overrides) -- PREPARED, NOT YET APPLIED to
-- any environment. Supersedes the Pass 2 draft
-- (20261014000100_formation_4_3_3_prep.sql, removed -- its content is
-- folded in here with one more change) now that canonical_position exists
-- (20261015000000_canonical_position_resolution.sql, which this file's
-- timestamp is deliberately placed AFTER -- update_team_lineup here reads
-- players.canonical_position, so the column must exist first).
--
-- Do NOT run `supabase db push` with this file until:
--   1. The squad impact report is reviewed and approved, AND
--   2. The companion TypeScript change to
--      `src/domain/fantasy/constants.ts`'s `FORMATION_RULES` (MID 4->3,
--      FWD 2->3) is applied in the SAME release -- deploying one without
--      the other leaves this RPC and the client-side formation validator
--      disagreeing about what a legal XI is.
-- With the four approved position overrides
-- (20261014000000_position_classification_overrides.sql's table, see
-- docs/audits/ for the exact rows) applied together with this migration,
-- all five "5 Men of Class" teams are 4-3-3-feasible -- see the Pass 3
-- impact report. Applying 4-3-3 alone, without the overrides, would still
-- leave "2 Goals 1 Cup" (2 FWD under raw/uncorrected positions) short one
-- forward.
--
-- The ONLY behavior changes below, vs. the live
-- 20261007000000_performance_lineup_and_score_reads.sql version: (a) the
-- hardcoded starting-XI shape check (GK1/DEF4/MID4/FWD2 ->
-- GK1/DEF4/MID3/FWD3), and (b) every position read is
-- `canonical_position` instead of `position` -- the client-supplied-
-- formation check, the GK/DEF/MID/FWD count, and the slot-label
-- assignment on write. Locking order, ownership/slot validation, and the
-- SLOT_LOCKED/ROSTER_ENTRY_NOT_ON_TEAM/WRITE_FAILED checks are otherwise
-- unchanged. Historical (already-settled) lineup_slots rows are never
-- touched by this function -- it only ever validates and writes the
-- CURRENT round's slots for the requesting team.

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
  select * into v_team from public.fantasy_teams
  where id = p_fantasy_team_id for no key update;
  if v_team.id is null or (not v_service and
      (auth.uid() is null or v_team.owner_user_id <> auth.uid()
        or not public.is_league_member(v_team.league_id))) then
    raise exception 'ROSTER_ENTRY_NOT_ON_TEAM';
  end if;
  if p_round_id is distinct from public._current_round_id(v_team.league_id) then
    raise exception 'ROUND_NOT_FOUND';
  end if;
  if jsonb_typeof(p_changes) is distinct from 'array' then
    raise exception 'WRITE_FAILED';
  end if;

  select coalesce(array_agg(locked.roster_entry_id), '{}'::uuid[])
  into v_owned_entry_ids from (
    select o.roster_entry_id from public.league_player_ownership o
    where o.league_id = v_team.league_id and o.fantasy_team_id = p_fantasy_team_id
    order by o.player_id for update of o nowait
  ) locked;

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

  if p_round_id is distinct from public._current_round_id(v_team.league_id) then
    raise exception 'ROUND_NOT_FOUND';
  end if;

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

  -- Canonical (override-aware) player positions, never a client-supplied
  -- formation claim.
  if exists (
    select 1 from jsonb_to_recordset(p_changes) as c(roster_entry_id uuid, starter boolean, position text)
    join public.roster_entries re on re.id = c.roster_entry_id
    join public.players p on p.id = re.player_id
    where c.starter and c.position is not null and c.position <> p.canonical_position
  ) then raise exception 'INVALID_FORMATION'; end if;
  select count(*), count(*) filter (where p.canonical_position = 'GK'),
    count(*) filter (where p.canonical_position = 'DEF'), count(*) filter (where p.canonical_position = 'MID'),
    count(*) filter (where p.canonical_position = 'FWD')
  into v_total, v_gk, v_def, v_mid, v_fwd
  from public.lineup_slots ls
  join public.roster_entries re on re.id = ls.roster_entry_id
  join public.players p on p.id = re.player_id
  left join jsonb_to_recordset(p_changes) as c(roster_entry_id uuid, starter boolean, position text)
    on c.roster_entry_id = re.id
  where ls.fantasy_round_id = p_round_id and re.fantasy_team_id = p_fantasy_team_id
    and coalesce(c.starter, ls.starter);
  -- 4-3-3 (Pass 2): GK1/DEF4/MID3/FWD3, was GK1/DEF4/MID4/FWD2.
  if v_total <> 11 or v_gk <> 1 or v_def <> 4 or v_mid <> 3 or v_fwd <> 3 then
    raise exception 'INVALID_FORMATION';
  end if;

  update public.lineup_slots ls set
    starter = c.starter, slot = case when c.starter then p.canonical_position else 'BENCH' end
  from jsonb_to_recordset(p_changes) as c(roster_entry_id uuid, starter boolean, position text),
    public.roster_entries re, public.players p
  where ls.roster_entry_id = c.roster_entry_id and ls.fantasy_round_id = p_round_id
    and re.id = ls.roster_entry_id and re.fantasy_team_id = p_fantasy_team_id
    and p.id = re.player_id;
end;
$$;
revoke all on function public.update_team_lineup(uuid, uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.update_team_lineup(uuid, uuid, jsonb, timestamptz) to authenticated, service_role;
