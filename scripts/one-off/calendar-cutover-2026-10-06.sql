-- Authorized immediate calendar cutover. Run once via Supabase db query.
-- Does not finalize results, change scores/rosters, or fetch football data.
-- The temporary guard exception is invisible outside this transaction and
-- is restored before COMMIT; completed-result guards remain enabled throughout.
begin;
select pg_catalog.pg_advisory_xact_lock(441104);
lock table public.fantasy_rounds, public.matchups, public.matchup_scores,
  public.lineup_slots in share row exclusive mode;
create temporary table calendar_cutover_audit(kind text, id uuid, before_row jsonb, after_row jsonb) on commit drop;
do $cutover$
declare
  original_guard text;
  temporary_guard text;
  original_check text := 'if new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at
    then raise exception ''ROUND_SCORING_AND_WINDOW_IMMUTABLE''; end if;';
  affected uuid[] := array[
    'ea80c33d-8d80-41d6-9267-fb303bc3e576'::uuid,
    'd4116438-42ef-4ed8-a62c-04d8471fa780'::uuid,
    '7d81b42a-18fd-4f74-a09a-458eb98588f4'::uuid
  ];
  cutover_at timestamptz := '2026-10-06 06:00:00+00';
  n integer;
begin
  if statement_timestamp() < cutover_at or statement_timestamp() >= cutover_at + interval '7 days'
  then raise exception 'CUTOVER_CLOCK_OUTSIDE_APPROVED_WEEK'; end if;
  if (select count(*) from public.fantasy_rounds where id=any(affected)) <> 3
  then raise exception 'CUTOVER_ROUND_SET_CHANGED'; end if;
  if exists(select 1 from public.fantasy_rounds where id=any(affected) and (status<>'in_progress' or scoring_rule_version<>'ELEVEN_STANDARD_V4' or number<>1))
     or exists(select 1 from public.matchups m join public.matchup_scores s on s.matchup_id=m.id where m.fantasy_round_id=any(affected) and s.final_points is not null)
     or exists(select 1 from public.matchups where fantasy_round_id=any(affected) and status='final')
  then raise exception 'CUTOVER_UNEXPECTED_SETTLED_OR_VERSION_STATE'; end if;
  -- Fail closed on rerun rather than repeating any production adjustment.
  if (select count(*) from public.fantasy_rounds where id=any(affected) and ends_at=cutover_at) = 3
  then raise exception 'CUTOVER_ALREADY_APPLIED'; end if;
  if (select count(*) from public.fantasy_rounds where id in(affected[1],affected[2]) and starts_at='2026-09-29 00:00:00+00' and ends_at='2026-10-06 00:00:00+00') <> 2
     or not exists(select 1 from public.fantasy_rounds where id=affected[3] and starts_at='2026-10-06 00:00:00+00' and ends_at='2026-10-13 00:00:00+00')
     or exists(select 1 from public.fantasy_rounds where season_id in(select season_id from public.fantasy_rounds where id=any(affected)) and number<>1)
  then raise exception 'CUTOVER_EXPECTED_WINDOWS_CHANGED'; end if;
  if (select count(*) from public.lineup_slots where fantasy_round_id=affected[3] and locked_at>=cutover_at) <> 15
     or exists(select 1 from public.lineup_slots where fantasy_round_id=affected[3] and locked_at>=cutover_at and locked_at<=statement_timestamp())
  then raise exception 'CUTOVER_EXPECTED_FUTURE_LOCKS_CHANGED'; end if;

  original_guard := pg_catalog.pg_get_functiondef('public.pin_round_scoring_version()'::regprocedure);
  if strpos(original_guard,original_check)=0 then raise exception 'CUTOVER_GUARD_DEFINITION_CHANGED'; end if;
  temporary_guard := replace(original_guard,original_check,
    'if new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at then
       if not (old.id in (''ea80c33d-8d80-41d6-9267-fb303bc3e576''::uuid,''d4116438-42ef-4ed8-a62c-04d8471fa780''::uuid,''7d81b42a-18fd-4f74-a09a-458eb98588f4''::uuid)
         and old.status = ''in_progress'' and new.ends_at = timestamptz ''2026-10-06 06:00:00+00''
         and (to_jsonb(new)-''ends_at''-''updated_at'') = (to_jsonb(old)-''ends_at''-''updated_at''))
       then raise exception ''ROUND_SCORING_AND_WINDOW_IMMUTABLE''; end if;
     end if;');
  execute temporary_guard;
  insert into calendar_cutover_audit select 'fantasy_rounds',id,to_jsonb(r),null from public.fantasy_rounds r where id=any(affected);
  update public.fantasy_rounds set ends_at=cutover_at where id=any(affected);
  get diagnostics n = row_count;
  if n<>3 then raise exception 'CUTOVER_ROUND_COUNT_MISMATCH'; end if;
  execute original_guard;
  if pg_catalog.pg_get_functiondef('public.pin_round_scoring_version()'::regprocedure)<>original_guard
  then raise exception 'CUTOVER_GUARD_NOT_RESTORED'; end if;
  insert into calendar_cutover_audit select 'lineup_slots',id,to_jsonb(s),null from public.lineup_slots s where fantasy_round_id=affected[3] and locked_at>=cutover_at;
  update public.lineup_slots set locked_at=null where fantasy_round_id=affected[3] and locked_at>=cutover_at;
  get diagnostics n = row_count;
  if n<>15 then raise exception 'CUTOVER_SLOT_COUNT_MISMATCH'; end if;
  update calendar_cutover_audit a set after_row=to_jsonb(r) from public.fantasy_rounds r where a.kind='fantasy_rounds' and r.id=a.id;
  update calendar_cutover_audit a set after_row=to_jsonb(s) from public.lineup_slots s where a.kind='lineup_slots' and s.id=a.id;
end $cutover$;
select kind,id,before_row,after_row from calendar_cutover_audit order by kind,id;
commit;
