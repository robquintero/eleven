-- Pass 10.5: the default pick timer (found too aggressive in manual Pass
-- 10 QA) moves from 60s to 300s (5 minutes) for current testing. This is
-- purely the DEFAULT a new league gets when its commissioner doesn't
-- supply custom settings via create_league()'s p_settings — not a
-- per-league configurable option (out of scope for this pass; see
-- src/domain/fantasy/constants.ts's DEFAULT_LEAGUE_SETTINGS comment).
-- create_league() itself (supabase/migrations/20260929141145_functions.sql)
-- is otherwise unchanged -- only its literal default settings JSONB.
-- Existing leagues created before this migration keep whatever
-- pickTimerSeconds they already have; this only affects leagues created
-- from here on with no explicit settings.

create or replace function public.create_league(
  p_name text,
  p_team_name text,
  p_team_abbreviation text,
  p_settings jsonb default null
)
returns table (
  league_id uuid,
  invite_code text,
  fantasy_team_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_league_id uuid;
  v_invite_code text;
  v_team_id uuid;
  v_attempts int := 0;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Retry on the (astronomically unlikely) invite-code collision rather
  -- than letting the UNIQUE constraint fail the whole operation.
  loop
    v_invite_code := public.generate_invite_code();
    v_attempts := v_attempts + 1;
    exit when not exists (select 1 from public.fantasy_leagues fl where fl.invite_code = v_invite_code);
    if v_attempts > 10 then
      raise exception 'INVITE_CODE_GENERATION_FAILED';
    end if;
  end loop;

  insert into public.fantasy_leagues (name, invite_code, status, created_by_user_id, settings)
  values (
    p_name,
    v_invite_code,
    'active',
    v_user_id,
    coalesce(
      p_settings,
      '{
        "maxTeams": 10,
        "squadSize": 16,
        "starterCount": 11,
        "waiverMode": "priority",
        "playoffEnabled": true,
        "draftType": "snake",
        "pickTimerSeconds": 300
      }'::jsonb
    )
  )
  returning id into v_league_id;

  insert into public.league_memberships (league_id, user_id, role)
  values (v_league_id, v_user_id, 'commissioner');

  insert into public.fantasy_teams (league_id, owner_user_id, name, abbreviation)
  values (v_league_id, v_user_id, p_team_name, p_team_abbreviation)
  returning id into v_team_id;

  insert into public.domain_events (event_type, league_id, actor_user_id, fantasy_team_id, entity_type, entity_id, payload)
  values (
    'LEAGUE_CREATED',
    v_league_id,
    v_user_id,
    v_team_id,
    'fantasy_league',
    v_league_id,
    jsonb_build_object('leagueName', p_name, 'teamName', p_team_name)
  );

  return query select v_league_id, v_invite_code, v_team_id;
end;
$$;

comment on function public.create_league(text, text, text, jsonb) is
  'Atomically creates a league + the caller''s commissioner membership + the caller''s first fantasy team. Raises NOT_AUTHENTICATED if called with no session.';

revoke all on function public.create_league(text, text, text, jsonb) from public;
grant execute on function public.create_league(text, text, text, jsonb) to authenticated;
