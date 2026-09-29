-- Row Level Security for every table created so far. General intent (see
-- the brief this migration implements):
--   - Public football data: authenticated users may READ, never write
--     directly (writes are a trusted server/ingestion concern, later).
--   - A league member may read their own league's data.
--   - Sensitive multi-row mutations (create/join a league) happen through
--     the SECURITY DEFINER functions in 20260929141145_functions.sql, not
--     direct table writes — so most tables below intentionally have no
--     INSERT/UPDATE/DELETE policy at all for `authenticated`. RLS denies
--     by default when no policy matches, which is exactly what we want:
--     the Data API can't be used to bypass the trusted functions.
--   - service_role (used only from trusted server code, never the
--     browser) bypasses RLS entirely, by Postgres/Supabase design — no
--     policy is needed to let backend ingestion/processing write later.

-- ---------------------------------------------------------------------
-- Public football data — read-only for authenticated users
-- ---------------------------------------------------------------------

alter table public.competitions enable row level security;
alter table public.clubs enable row level security;
alter table public.players enable row level security;
alter table public.fixtures enable row level security;
alter table public.player_match_stats enable row level security;

create policy "authenticated can read competitions"
  on public.competitions for select
  to authenticated
  using (true);

create policy "authenticated can read clubs"
  on public.clubs for select
  to authenticated
  using (true);

create policy "authenticated can read players"
  on public.players for select
  to authenticated
  using (true);

create policy "authenticated can read fixtures"
  on public.fixtures for select
  to authenticated
  using (true);

create policy "authenticated can read player_match_stats"
  on public.player_match_stats for select
  to authenticated
  using (true);

-- provider_mappings is internal ingestion plumbing, not "public football
-- data" a client ever needs to read directly — RLS is enabled with no
-- policy at all, so only service_role (which bypasses RLS) can touch it.
alter table public.provider_mappings enable row level security;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------

alter table public.profiles enable row level security;

-- display_name/avatar_url aren't sensitive, and league co-members need to
-- see each other's names, so read access is open to any signed-in user
-- rather than requiring a league-membership join for every profile read.
create policy "authenticated can read profiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- No INSERT policy: rows are created exclusively by the
-- on_auth_user_created trigger (20260929141145_functions.sql), which runs
-- SECURITY DEFINER and so bypasses RLS. No DELETE policy: not a supported
-- flow this pass.

-- ---------------------------------------------------------------------
-- fantasy_leagues / league_memberships / fantasy_teams
-- ---------------------------------------------------------------------

alter table public.fantasy_leagues enable row level security;
alter table public.league_memberships enable row level security;
alter table public.fantasy_teams enable row level security;

create policy "members can read their league"
  on public.fantasy_leagues for select
  to authenticated
  using (
    exists (
      select 1 from public.league_memberships m
      where m.league_id = fantasy_leagues.id
        and m.user_id = auth.uid()
    )
  );

create policy "commissioners can update their league"
  on public.fantasy_leagues for update
  to authenticated
  using (
    exists (
      select 1 from public.league_memberships m
      where m.league_id = fantasy_leagues.id
        and m.user_id = auth.uid()
        and m.role = 'commissioner'
    )
  )
  with check (
    exists (
      select 1 from public.league_memberships m
      where m.league_id = fantasy_leagues.id
        and m.user_id = auth.uid()
        and m.role = 'commissioner'
    )
  );

-- No INSERT policy: leagues are created exclusively via create_league().

create policy "members can read memberships in their leagues"
  on public.league_memberships for select
  to authenticated
  using (
    exists (
      select 1 from public.league_memberships self
      where self.league_id = league_memberships.league_id
        and self.user_id = auth.uid()
    )
  );

-- No write policy: memberships are created exclusively via
-- create_league()/join_league_by_invite_code().

create policy "members can read teams in their league"
  on public.fantasy_teams for select
  to authenticated
  using (
    exists (
      select 1 from public.league_memberships m
      where m.league_id = fantasy_teams.league_id
        and m.user_id = auth.uid()
    )
  );

create policy "owners can update their own team"
  on public.fantasy_teams for update
  to authenticated
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

-- No INSERT policy: teams are created exclusively via
-- create_league()/join_league_by_invite_code().

-- ---------------------------------------------------------------------
-- Everything else: league-scoped read-only for members. Every one of
-- these tables backs a system whose *engine* (draft/waivers/trades/
-- scoring/locking) isn't built yet, so there is deliberately no write
-- policy for `authenticated` on any of them — see the brief's "Do not
-- attempt to encode every future draft/trade/waiver permission directly
-- into client RLS yet." Writes happen from trusted server code
-- (service_role) once those engines exist.
-- ---------------------------------------------------------------------

alter table public.roster_entries enable row level security;
alter table public.league_player_ownership enable row level security;
alter table public.fantasy_rounds enable row level security;
alter table public.lineup_slots enable row level security;
alter table public.matchups enable row level security;
alter table public.matchup_scores enable row level security;
alter table public.drafts enable row level security;
alter table public.draft_orders enable row level security;
alter table public.draft_picks enable row level security;
alter table public.waiver_claims enable row level security;
alter table public.trades enable row level security;
alter table public.trade_assets enable row level security;
alter table public.transactions enable row level security;
alter table public.domain_events enable row level security;
alter table public.scoring_rules enable row level security;
alter table public.fantasy_player_scores enable row level security;

create policy "members can read roster_entries in their league"
  on public.roster_entries for select
  to authenticated
  using (
    exists (
      select 1 from public.league_memberships m
      where m.league_id = roster_entries.league_id
        and m.user_id = auth.uid()
    )
  );

create policy "members can read ownership in their league"
  on public.league_player_ownership for select
  to authenticated
  using (
    exists (
      select 1 from public.league_memberships m
      where m.league_id = league_player_ownership.league_id
        and m.user_id = auth.uid()
    )
  );

create policy "members can read rounds in their league"
  on public.fantasy_rounds for select
  to authenticated
  using (
    exists (
      select 1 from public.league_memberships m
      where m.league_id = fantasy_rounds.league_id
        and m.user_id = auth.uid()
    )
  );

create policy "members can read lineup_slots in their league"
  on public.lineup_slots for select
  to authenticated
  using (
    exists (
      select 1 from public.roster_entries re
      join public.league_memberships m on m.league_id = re.league_id
      where re.id = lineup_slots.roster_entry_id
        and m.user_id = auth.uid()
    )
  );

create policy "members can read matchups in their league"
  on public.matchups for select
  to authenticated
  using (
    exists (
      select 1 from public.league_memberships m
      where m.league_id = matchups.league_id
        and m.user_id = auth.uid()
    )
  );

create policy "members can read matchup_scores in their league"
  on public.matchup_scores for select
  to authenticated
  using (
    exists (
      select 1 from public.matchups mu
      join public.league_memberships m on m.league_id = mu.league_id
      where mu.id = matchup_scores.matchup_id
        and m.user_id = auth.uid()
    )
  );

create policy "members can read drafts in their league"
  on public.drafts for select
  to authenticated
  using (
    exists (
      select 1 from public.league_memberships m
      where m.league_id = drafts.league_id
        and m.user_id = auth.uid()
    )
  );

create policy "members can read draft_orders in their league"
  on public.draft_orders for select
  to authenticated
  using (
    exists (
      select 1 from public.drafts d
      join public.league_memberships m on m.league_id = d.league_id
      where d.id = draft_orders.draft_id
        and m.user_id = auth.uid()
    )
  );

create policy "members can read draft_picks in their league"
  on public.draft_picks for select
  to authenticated
  using (
    exists (
      select 1 from public.drafts d
      join public.league_memberships m on m.league_id = d.league_id
      where d.id = draft_picks.draft_id
        and m.user_id = auth.uid()
    )
  );

create policy "members can read waiver_claims in their league"
  on public.waiver_claims for select
  to authenticated
  using (
    exists (
      select 1 from public.league_memberships m
      where m.league_id = waiver_claims.league_id
        and m.user_id = auth.uid()
    )
  );

create policy "members can read trades in their league"
  on public.trades for select
  to authenticated
  using (
    exists (
      select 1 from public.league_memberships m
      where m.league_id = trades.league_id
        and m.user_id = auth.uid()
    )
  );

create policy "members can read trade_assets in their league"
  on public.trade_assets for select
  to authenticated
  using (
    exists (
      select 1 from public.trades t
      join public.league_memberships m on m.league_id = t.league_id
      where t.id = trade_assets.trade_id
        and m.user_id = auth.uid()
    )
  );

create policy "members can read transactions in their league"
  on public.transactions for select
  to authenticated
  using (
    exists (
      select 1 from public.league_memberships m
      where m.league_id = transactions.league_id
        and m.user_id = auth.uid()
    )
  );

create policy "members can read domain_events in their league"
  on public.domain_events for select
  to authenticated
  using (
    league_id is not null
    and exists (
      select 1 from public.league_memberships m
      where m.league_id = domain_events.league_id
        and m.user_id = auth.uid()
    )
  );

create policy "authenticated can read global or their league's scoring_rules"
  on public.scoring_rules for select
  to authenticated
  using (
    league_id is null
    or exists (
      select 1 from public.league_memberships m
      where m.league_id = scoring_rules.league_id
        and m.user_id = auth.uid()
    )
  );

create policy "members can read fantasy_player_scores in their league"
  on public.fantasy_player_scores for select
  to authenticated
  using (
    exists (
      select 1 from public.fantasy_rounds r
      join public.league_memberships m on m.league_id = r.league_id
      where r.id = fantasy_player_scores.fantasy_round_id
        and m.user_id = auth.uid()
    )
  );
