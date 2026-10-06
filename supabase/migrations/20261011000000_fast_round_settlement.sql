-- Settlement is distinct from provider ingestion's 24h correction cadence.
-- This migration only adds trusted functions; no existing rows/triggers change.
-- One canonical 60-minute grace, measured from the persisted UTC round end.
create or replace function public.get_round_settlement_readiness(p_round_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r public.fantasy_rounds; blockers jsonb; totals jsonb; performances jsonb; eligible_ids uuid[]; eligible_at timestamptz;
begin
  select * into r from public.fantasy_rounds where id = p_round_id;
  if not found then return jsonb_build_object('ready',false,'blockers',jsonb_build_array(jsonb_build_object('code','round_missing'))); end if;
  if r.status = 'completed' then return jsonb_build_object('ready',false,'blockers',jsonb_build_array(jsonb_build_object('code','already_completed'))); end if;
  eligible_at := r.ends_at + interval '60 minutes';
  if pg_catalog.statement_timestamp() < eligible_at then
    return jsonb_build_object('ready',false,'eligible_at',eligible_at,'blockers',jsonb_build_array(jsonb_build_object('code','settlement_grace')));
  end if;

  select coalesce(array_agg(f.id),array[]::uuid[]) into eligible_ids from public.fixtures f join public.competitions c on c.id=f.competition_id
    where f.kickoff_at >= r.starts_at and f.kickoff_at < r.ends_at
      -- Same eligibility/epoch as the existing V4 settled-score guard.
      and c.code = any(array['ENG','ESP','GER','ITA','FRA','UCL','UEL','FIFA_WC','FIFA_WCQ_EUR','FIFA_WCQ_AFR','FIFA_WCQ_ASIA','FIFA_WCQ_CONCACAF','FIFA_WCQ_SAM','FIFA_WCQ_OFC','FIFA_WCQ_PLAYOFF','UEFA_EURO','UEFA_EURO_Q','UEFA_NL','COPA_AMERICA','AFCON','AFCON_Q','AFC_ASIAN_CUP','AFC_ASIAN_CUP_Q','CONCACAF_GOLD_CUP','CONCACAF_GOLD_CUP_Q','CONCACAF_NL','CONCACAF_NL_Q','OFC_NATIONS_CUP'])
      and (c.code in ('ENG','ESP','GER','ITA','FRA','UCL','UEL') or f.kickoff_at >= timestamptz '2026-09-24 16:00:00+00');
  with eligible as (select * from public.fixtures where id=any(eligible_ids)), starters as (
    select re.player_id,re.fantasy_team_id,re.acquired_at,p.club_id
    from public.lineup_slots l join public.roster_entries re on re.id=l.roster_entry_id join public.players p on p.id=re.player_id
    where l.fantasy_round_id=r.id and l.starter
  ), expected as (
    -- Membership predicts possible appearances; known stat/score provenance
    -- also preserves actual appearances after a club transfer. Acquisition
    -- is evaluated per fixture. Bench players cannot block settlement.
    select distinct s.player_id,s.fantasy_team_id,f.id fixture_id,f.status,f.kickoff_at,f.home_club_id,f.away_club_id
    from starters s join eligible f on f.kickoff_at >= s.acquired_at
    where s.club_id in (f.home_club_id,f.away_club_id)
      or exists(select 1 from public.player_national_teams n where n.player_id=s.player_id and n.national_team_club_id in(f.home_club_id,f.away_club_id))
      or exists(select 1 from public.player_match_stats ps where ps.player_id=s.player_id and ps.fixture_id=f.id)
      or exists(select 1 from public.fantasy_player_scores sc where sc.player_id=s.player_id and sc.fixture_id=f.id and sc.scoring_rule_version=r.scoring_rule_version)
  ), envelopes as (
    select f.id fixture_id,a.payload,a.fetched_at,
      -- A full final response from both mapped participants establishes DNP
      -- when a starter is absent. An empty/partial/error envelope cannot.
      coalesce(a.observed_fixture_status='final' and a.fetched_at >= f.kickoff_at
        and jsonb_typeof(a.payload->'response')='array'
        and jsonb_array_length(case when jsonb_typeof(a.payload->'response')='array' then a.payload->'response' else '[]'::jsonb end)=2
        and (a.payload->'errors' is null or a.payload->'errors' in ('[]'::jsonb,'{}'::jsonb))
        and (select count(distinct pm.internal_entity_id) from jsonb_array_elements(case when jsonb_typeof(a.payload->'response')='array' then a.payload->'response' else '[]'::jsonb end) t
          join public.provider_mappings pm on pm.provider=a.provider and pm.internal_entity_type='club' and pm.external_id=t#>>'{team,id}'
          where pm.internal_entity_id in(f.home_club_id,f.away_club_id)
            and jsonb_typeof(t->'players')='array' and jsonb_array_length(case when jsonb_typeof(t->'players')='array' then t->'players' else '[]'::jsonb end)>0)=2,false) complete
    from eligible f left join public.football_provider_snapshots a on a.fixture_id=f.id and a.provider='api-football' and a.endpoint='/fixtures/players'
  ), evidence as (
    select e.*,ps.player_id stat_player,ps.reported_stats,ps.scoring_position,
      sc.player_id score_player,sc.points,coalesce(a.complete,false) envelope_complete,
      exists(select 1 from jsonb_array_elements(case when jsonb_typeof(a.payload->'response')='array' then a.payload->'response' else '[]'::jsonb end) t,
        lateral jsonb_array_elements(case when jsonb_typeof(t->'players')='array' then t->'players' else '[]'::jsonb end) p
        join public.provider_mappings pm on pm.provider='api-football' and pm.internal_entity_type='player' and pm.external_id=p#>>'{player,id}'
        where pm.internal_entity_id=e.player_id) reported_player
    from expected e left join envelopes a on a.fixture_id=e.fixture_id
      left join public.player_match_stats ps on ps.player_id=e.player_id and ps.fixture_id=e.fixture_id
      left join public.fantasy_player_scores sc on sc.player_id=e.player_id and sc.fixture_id=e.fixture_id and sc.scoring_rule_version=r.scoring_rule_version
  ), reasons as (
    select 'fixture_unresolved' code,fixture_id,player_id from evidence where status not in ('final','postponed')
    union all select 'player_envelope_missing',fixture_id,player_id from evidence where status='final' and r.scoring_rule_version='ELEVEN_STANDARD_V4' and not envelope_complete
    union all select 'starter_stats_missing',fixture_id,player_id from evidence where status='final' and reported_player and stat_player is null
    union all select 'starter_v4_provenance_missing',fixture_id,player_id from evidence where status='final' and stat_player is not null and r.scoring_rule_version='ELEVEN_STANDARD_V4'
      and (reported_stats is null or scoring_position is null or scoring_position not in('GK','DEF','MID','FWD'))
    union all select 'starter_score_missing',fixture_id,player_id from evidence where status='final' and (stat_player is not null or reported_player) and score_player is null
    union all select 'starter_score_invalid',fixture_id,player_id from evidence where score_player is not null and (points is null or points::text in('NaN','Infinity','-Infinity'))
    union all select 'score_without_stats',fixture_id,player_id from evidence where score_player is not null and stat_player is null
    union all select 'matchups_missing',null::uuid,null::uuid where not exists(select 1 from public.matchups where fantasy_round_id=r.id)
    union all select 'score_sides_missing',null::uuid,null::uuid from public.matchups m where m.fantasy_round_id=r.id
      and (select count(*) from public.matchup_scores s where s.matchup_id=m.id and s.fantasy_team_id in(m.home_fantasy_team_id,m.away_fantasy_team_id))<>2
    union all select 'lineup_missing',null::uuid,null::uuid from public.matchups m where m.fantasy_round_id=r.id and (
      (exists(select 1 from public.roster_entries re where re.fantasy_team_id=m.home_fantasy_team_id and re.acquired_at<r.ends_at) and not exists(select 1 from public.lineup_slots l join public.roster_entries re on re.id=l.roster_entry_id where l.fantasy_round_id=r.id and re.fantasy_team_id=m.home_fantasy_team_id))
      or (exists(select 1 from public.roster_entries re where re.fantasy_team_id=m.away_fantasy_team_id and re.acquired_at<r.ends_at) and not exists(select 1 from public.lineup_slots l join public.roster_entries re on re.id=l.roster_entry_id where l.fantasy_round_id=r.id and re.fantasy_team_id=m.away_fantasy_team_id)))
    union all select 'mixed_settlement',null::uuid,null::uuid where exists(select 1 from public.matchups m where m.fantasy_round_id=r.id and
      (m.status='final' or exists(select 1 from public.matchup_scores s where s.matchup_id=m.id and s.final_points is not null)))
  ) select coalesce(jsonb_agg(jsonb_build_object('code',code,'fixture_id',fixture_id,'player_id',player_id)),'[]'::jsonb) into blockers from reasons;

  -- Match the existing sum of eligible pinned-version scores, per-fixture
  -- acquisition cutoff and numeric hundredths. Optional provider nulls do
  -- not enter the readiness predicate and never become guessed stat zeros.
  select jsonb_agg(jsonb_build_object('score_id',ms.id,'matchup_id',m.id,'team_id',ms.fantasy_team_id,'points',coalesce((
    select sum(s.points) from public.lineup_slots l join public.roster_entries re on re.id=l.roster_entry_id
    join public.fantasy_player_scores s on s.player_id=re.player_id and s.scoring_rule_version=r.scoring_rule_version
    join public.fixtures f on f.id=s.fixture_id join public.competitions c on c.id=f.competition_id
    where l.fantasy_round_id=r.id and l.starter and re.fantasy_team_id=ms.fantasy_team_id
      and f.kickoff_at>=r.starts_at and f.kickoff_at<r.ends_at and f.kickoff_at>=re.acquired_at
      and f.id=any(eligible_ids)
  ),0)) order by ms.id) into totals from public.matchups m join public.matchup_scores ms on ms.matchup_id=m.id
    and ms.fantasy_team_id in(m.home_fantasy_team_id,m.away_fantasy_team_id) where m.fantasy_round_id=r.id;
  select coalesce(jsonb_agg(jsonb_build_object('stats',to_jsonb(ps),'points',sc.points,'position',p.position,
    'provider_team',(select jsonb_build_object('team',t->'team','players',jsonb_build_array(player))
      from public.football_provider_snapshots a,
      lateral jsonb_array_elements(case when jsonb_typeof(a.payload->'response')='array' then a.payload->'response' else '[]'::jsonb end) t,
      lateral jsonb_array_elements(case when jsonb_typeof(t->'players')='array' then t->'players' else '[]'::jsonb end) player
      join public.provider_mappings pm on pm.provider='api-football' and pm.internal_entity_type='player' and pm.external_id=player#>>'{player,id}'
      where a.fixture_id=ps.fixture_id and a.provider='api-football' and a.endpoint='/fixtures/players' and pm.internal_entity_id=ps.player_id limit 1),
    'conceded',
    case when r.scoring_rule_version='ELEVEN_STANDARD_V4' then
      case when ps.participation_club_id=f.home_club_id then f.away_score when ps.participation_club_id=f.away_club_id then f.home_score else null end
    else case when p.club_id=f.home_club_id or exists(select 1 from public.player_national_teams n where n.player_id=p.id and n.national_team_club_id=f.home_club_id) then f.away_score
      when p.club_id=f.away_club_id or exists(select 1 from public.player_national_teams n where n.player_id=p.id and n.national_team_club_id=f.away_club_id) then f.home_score else null end end)
    order by ps.player_id,ps.fixture_id),'[]'::jsonb) into performances
    from public.player_match_stats ps join public.players p on p.id=ps.player_id join public.fixtures f on f.id=ps.fixture_id
    left join public.fantasy_player_scores sc on sc.player_id=ps.player_id and sc.fixture_id=ps.fixture_id and sc.scoring_rule_version=r.scoring_rule_version
    where f.id=any(eligible_ids) and exists(select 1 from public.lineup_slots l join public.roster_entries re on re.id=l.roster_entry_id
      where l.fantasy_round_id=r.id and l.starter and re.player_id=ps.player_id and f.kickoff_at>=re.acquired_at);
  return jsonb_build_object('ready',jsonb_array_length(blockers)=0,'eligible_at',eligible_at,'blockers',blockers,'totals',coalesce(totals,'[]'::jsonb),'performances',performances,'version',r.scoring_rule_version,
    'evidence_digest',md5(jsonb_build_object('performances',performances,'totals',coalesce(totals,'[]'::jsonb))::text));
end $$;

create or replace function public.settle_fantasy_round(p_round_id uuid,p_evidence_digest text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.fantasy_rounds; evidence jsonb;
begin
  -- Same lock ordering as the immutable score/version guards. A concurrent
  -- worker either settles once or observes the already-completed result.
  perform pg_catalog.pg_advisory_xact_lock(441104);
  select * into r from public.fantasy_rounds where id=p_round_id for update;
  if not found or r.status='completed' or pg_catalog.statement_timestamp()<r.ends_at then
    return public.get_round_settlement_readiness(p_round_id) || jsonb_build_object('finalized',false);
  end if;
  evidence := public.get_round_settlement_readiness(r.id);
  if not (evidence->>'ready')::boolean then return evidence || jsonb_build_object('finalized',false); end if;
  -- Briefly hold stored evidence stable while checking and publishing. These
  -- SHARE locks permit reads and prevent an ingestion gap between stats and
  -- their pinned-version scores from racing official result publication.
  lock table public.fixtures,public.competitions,public.players,public.player_national_teams,
    public.provider_mappings,public.football_provider_snapshots,public.player_match_stats,
    public.fantasy_player_scores,public.lineup_slots,public.roster_entries in share mode;
  perform 1 from public.matchups where fantasy_round_id=r.id order by id for update;
  perform 1 from public.matchup_scores s join public.matchups m on m.id=s.matchup_id where m.fantasy_round_id=r.id order by s.id for update of s;
  evidence := public.get_round_settlement_readiness(r.id);
  if not (evidence->>'ready')::boolean then return evidence || jsonb_build_object('finalized',false); end if;

  if p_evidence_digest is null or p_evidence_digest is distinct from evidence->>'evidence_digest' then
    return jsonb_build_object('finalized',false,'blockers',jsonb_build_array(jsonb_build_object('code','evidence_changed')));
  end if;

  update public.matchup_scores s set live_points=(t->>'points')::numeric,final_points=(t->>'points')::numeric
    from jsonb_array_elements(evidence->'totals') t where s.id=(t->>'score_id')::uuid;
  -- Existing guards independently check V4 totals/provenance, both score
  -- sides, completed-round integrity and all historical immutability.
  update public.matchups set status='final' where fantasy_round_id=r.id;
  update public.fantasy_rounds set status='completed' where id=r.id;
  insert into public.domain_events(event_type,league_id,entity_type,entity_id,payload)
    select 'MATCHUP_FINALIZED',r.league_id,'matchup',m.id,'{}'::jsonb from public.matchups m where m.fantasy_round_id=r.id;
  insert into public.domain_events(event_type,league_id,entity_type,entity_id,payload)
    values('ROUND_FINALIZED',r.league_id,'fantasy_round',r.id,jsonb_build_object('roundNumber',r.number));
  return evidence || jsonb_build_object('finalized',true,'roundId',r.id);
end $$;
revoke all on function public.get_round_settlement_readiness(uuid) from public,anon,authenticated;
revoke all on function public.settle_fantasy_round(uuid,text) from public,anon,authenticated;
grant execute on function public.get_round_settlement_readiness(uuid) to service_role;
grant execute on function public.settle_fantasy_round(uuid,text) to service_role;
