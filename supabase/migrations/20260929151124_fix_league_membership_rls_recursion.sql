-- Fixes a second live-integration bug found while testing Pass 6: every
-- league-scoped RLS policy checked membership with a correlated subquery
-- against `league_memberships` itself:
--
--   exists (select 1 from public.league_memberships m
--           where m.league_id = X.league_id and m.user_id = auth.uid())
--
-- On `league_memberships`' OWN select policy, this is directly
-- self-referential: evaluating the policy requires querying the table,
-- which re-evaluates the same policy on every row of that inner query,
-- forever. Postgres surfaces this as `42P17 infinite recursion detected
-- in policy for relation "league_memberships"` — and because every other
-- league-scoped policy also joins through `league_memberships`, the
-- recursion breaks all of them, not just direct reads of that table.
--
-- Fix: two SECURITY DEFINER helper functions. Calling one from inside a
-- policy's USING clause runs its internal query as the function owner,
-- which bypasses RLS for that one lookup and breaks the cycle — the
-- standard, documented Postgres/Supabase pattern for this exact problem.
--
-- Deliberately additive (new migration, drop+recreate policies) rather
-- than editing the already-applied 20260929141143_rls.sql.

create or replace function public.is_league_member(p_league_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.league_memberships
    where league_id = p_league_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_league_commissioner(p_league_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.league_memberships
    where league_id = p_league_id and user_id = auth.uid() and role = 'commissioner'
  );
$$;

revoke all on function public.is_league_member(uuid) from public;
revoke all on function public.is_league_commissioner(uuid) from public;
grant execute on function public.is_league_member(uuid) to authenticated;
grant execute on function public.is_league_commissioner(uuid) to authenticated;

-- league_memberships: the directly self-recursive one.
drop policy "members can read memberships in their leagues" on public.league_memberships;
create policy "members can read memberships in their leagues"
  on public.league_memberships for select
  to authenticated
  using (public.is_league_member(league_id));

-- fantasy_leagues
drop policy "members can read their league" on public.fantasy_leagues;
create policy "members can read their league"
  on public.fantasy_leagues for select
  to authenticated
  using (public.is_league_member(id));

drop policy "commissioners can update their league" on public.fantasy_leagues;
create policy "commissioners can update their league"
  on public.fantasy_leagues for update
  to authenticated
  using (public.is_league_commissioner(id))
  with check (public.is_league_commissioner(id));

-- fantasy_teams
drop policy "members can read teams in their league" on public.fantasy_teams;
create policy "members can read teams in their league"
  on public.fantasy_teams for select
  to authenticated
  using (public.is_league_member(league_id));

-- roster_entries
drop policy "members can read roster_entries in their league" on public.roster_entries;
create policy "members can read roster_entries in their league"
  on public.roster_entries for select
  to authenticated
  using (public.is_league_member(league_id));

-- league_player_ownership
drop policy "members can read ownership in their league" on public.league_player_ownership;
create policy "members can read ownership in their league"
  on public.league_player_ownership for select
  to authenticated
  using (public.is_league_member(league_id));

-- fantasy_rounds
drop policy "members can read rounds in their league" on public.fantasy_rounds;
create policy "members can read rounds in their league"
  on public.fantasy_rounds for select
  to authenticated
  using (public.is_league_member(league_id));

-- lineup_slots (joins roster_entries to resolve league_id first)
drop policy "members can read lineup_slots in their league" on public.lineup_slots;
create policy "members can read lineup_slots in their league"
  on public.lineup_slots for select
  to authenticated
  using (
    exists (
      select 1 from public.roster_entries re
      where re.id = lineup_slots.roster_entry_id
        and public.is_league_member(re.league_id)
    )
  );

-- matchups
drop policy "members can read matchups in their league" on public.matchups;
create policy "members can read matchups in their league"
  on public.matchups for select
  to authenticated
  using (public.is_league_member(league_id));

-- matchup_scores (joins matchups to resolve league_id first)
drop policy "members can read matchup_scores in their league" on public.matchup_scores;
create policy "members can read matchup_scores in their league"
  on public.matchup_scores for select
  to authenticated
  using (
    exists (
      select 1 from public.matchups mu
      where mu.id = matchup_scores.matchup_id
        and public.is_league_member(mu.league_id)
    )
  );

-- drafts
drop policy "members can read drafts in their league" on public.drafts;
create policy "members can read drafts in their league"
  on public.drafts for select
  to authenticated
  using (public.is_league_member(league_id));

-- draft_orders (joins drafts to resolve league_id first)
drop policy "members can read draft_orders in their league" on public.draft_orders;
create policy "members can read draft_orders in their league"
  on public.draft_orders for select
  to authenticated
  using (
    exists (
      select 1 from public.drafts d
      where d.id = draft_orders.draft_id
        and public.is_league_member(d.league_id)
    )
  );

-- draft_picks (joins drafts to resolve league_id first)
drop policy "members can read draft_picks in their league" on public.draft_picks;
create policy "members can read draft_picks in their league"
  on public.draft_picks for select
  to authenticated
  using (
    exists (
      select 1 from public.drafts d
      where d.id = draft_picks.draft_id
        and public.is_league_member(d.league_id)
    )
  );

-- waiver_claims
drop policy "members can read waiver_claims in their league" on public.waiver_claims;
create policy "members can read waiver_claims in their league"
  on public.waiver_claims for select
  to authenticated
  using (public.is_league_member(league_id));

-- trades
drop policy "members can read trades in their league" on public.trades;
create policy "members can read trades in their league"
  on public.trades for select
  to authenticated
  using (public.is_league_member(league_id));

-- trade_assets (joins trades to resolve league_id first)
drop policy "members can read trade_assets in their league" on public.trade_assets;
create policy "members can read trade_assets in their league"
  on public.trade_assets for select
  to authenticated
  using (
    exists (
      select 1 from public.trades t
      where t.id = trade_assets.trade_id
        and public.is_league_member(t.league_id)
    )
  );

-- transactions
drop policy "members can read transactions in their league" on public.transactions;
create policy "members can read transactions in their league"
  on public.transactions for select
  to authenticated
  using (public.is_league_member(league_id));

-- domain_events
drop policy "members can read domain_events in their league" on public.domain_events;
create policy "members can read domain_events in their league"
  on public.domain_events for select
  to authenticated
  using (league_id is not null and public.is_league_member(league_id));

-- scoring_rules
drop policy "authenticated can read global or their league's scoring_rules" on public.scoring_rules;
create policy "authenticated can read global or their league's scoring_rules"
  on public.scoring_rules for select
  to authenticated
  using (league_id is null or public.is_league_member(league_id));

-- fantasy_player_scores (joins fantasy_rounds to resolve league_id first)
drop policy "members can read fantasy_player_scores in their league" on public.fantasy_player_scores;
create policy "members can read fantasy_player_scores in their league"
  on public.fantasy_player_scores for select
  to authenticated
  using (
    exists (
      select 1 from public.fantasy_rounds r
      where r.id = fantasy_player_scores.fantasy_round_id
        and public.is_league_member(r.league_id)
    )
  );
