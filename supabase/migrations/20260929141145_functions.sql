-- Trusted server-side functions: profile auto-creation, and the two
-- atomic multi-row league operations (create/join). All three run
-- SECURITY DEFINER so they can write across tables that otherwise have no
-- direct INSERT policy for `authenticated` (see 20260929141143_rls.sql) —
-- authorization is checked explicitly inside each function body instead of
-- being delegated to RLS, which is the "trusted server-side application
-- functions" pattern the brief calls for around sensitive mutations.

-- ---------------------------------------------------------------------
-- Profile creation: database trigger on auth.users, chosen over an
-- explicit application-side "create profile after signup" call because
-- it's the simpler robust option — a profile row can never be missing
-- for a real auth user, regardless of which client/flow created them
-- (email/password today, an OAuth provider later, the Supabase dashboard,
-- etc).
-- ---------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

comment on function public.handle_new_user() is
  'Creates the public.profiles row for a newly-created auth.users row. display_name defaults to the signup form value (raw_user_meta_data.display_name) or the local part of the email.';

-- ---------------------------------------------------------------------
-- Invite codes: an 8-character code from an unambiguous 32-character
-- alphabet (no 0/O/1/I), drawn from pgcrypto's gen_random_bytes rather
-- than plain random() for a cryptographically-sound source of the
-- randomness that makes the code hard to guess.
-- ---------------------------------------------------------------------

create or replace function public.generate_invite_code(p_length int default 8)
returns text
language plpgsql
set search_path = public, extensions
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..p_length loop
    result := result || substr(alphabet, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % length(alphabet)), 1);
  end loop;
  return result;
end;
$$;

-- ---------------------------------------------------------------------
-- create_league: creates the league, makes the caller its commissioner
-- member, and gives the caller their first fantasy team — one atomic
-- operation (a single function body is one transaction; any failure
-- rolls back everything, so there's no half-created league state).
-- ---------------------------------------------------------------------

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
        "pickTimerSeconds": 60
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

-- ---------------------------------------------------------------------
-- join_league_by_invite_code: validates the code, league capacity, and
-- membership state, then creates the caller's membership + team — again
-- one atomic operation. Every failure mode raises a specific message the
-- application layer pattern-matches on to show a precise error state
-- (see src/data-access/leagues.ts).
-- ---------------------------------------------------------------------

create or replace function public.join_league_by_invite_code(
  p_invite_code text,
  p_team_name text,
  p_team_abbreviation text
)
returns table (
  league_id uuid,
  fantasy_team_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_league public.fantasy_leagues%rowtype;
  v_member_count int;
  v_max_teams int;
  v_team_id uuid;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_league
  from public.fantasy_leagues fl
  where fl.invite_code = upper(trim(p_invite_code));

  if v_league.id is null then
    raise exception 'INVALID_CODE';
  end if;

  if v_league.status not in ('draft', 'active') then
    raise exception 'LEAGUE_CLOSED';
  end if;

  if exists (
    select 1 from public.league_memberships m
    where m.league_id = v_league.id and m.user_id = v_user_id
  ) then
    raise exception 'ALREADY_MEMBER';
  end if;

  if exists (
    select 1 from public.fantasy_teams ft
    where ft.league_id = v_league.id and ft.owner_user_id = v_user_id
  ) then
    raise exception 'ALREADY_OWNS_TEAM';
  end if;

  select count(*) into v_member_count
  from public.league_memberships m
  where m.league_id = v_league.id;

  v_max_teams := coalesce((v_league.settings ->> 'maxTeams')::int, 10);

  if v_member_count >= v_max_teams then
    raise exception 'LEAGUE_FULL';
  end if;

  insert into public.league_memberships (league_id, user_id, role)
  values (v_league.id, v_user_id, 'manager');

  insert into public.fantasy_teams (league_id, owner_user_id, name, abbreviation)
  values (v_league.id, v_user_id, p_team_name, p_team_abbreviation)
  returning id into v_team_id;

  insert into public.domain_events (event_type, league_id, actor_user_id, fantasy_team_id, entity_type, entity_id, payload)
  values (
    'TEAM_CREATED',
    v_league.id,
    v_user_id,
    v_team_id,
    'fantasy_team',
    v_team_id,
    jsonb_build_object('teamName', p_team_name, 'via', 'invite_code')
  );

  return query select v_league.id, v_team_id;
end;
$$;

comment on function public.join_league_by_invite_code(text, text, text) is
  'Atomically validates an invite code (existence, open status, not-already-a-member, not-already-owning-a-team, capacity) then creates the caller''s membership + team. Raises NOT_AUTHENTICATED / INVALID_CODE / LEAGUE_CLOSED / ALREADY_MEMBER / ALREADY_OWNS_TEAM / LEAGUE_FULL.';

revoke all on function public.join_league_by_invite_code(text, text, text) from public;
grant execute on function public.join_league_by_invite_code(text, text, text) to authenticated;
