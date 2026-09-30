-- Pass 10.5C.2A: lineup editing (swap / fill-empty-slots / change-formation)
-- is an ordinary authenticated manager operation on their OWN team, not
-- system administration -- it was only ever using the service-role admin
-- client because no RLS write policy existed for `lineup_slots` at all
-- (see 20260929141143_rls.sql's own now-stale comment: "no write policy
-- for `authenticated` ... Writes happen from trusted server code
-- (service_role) once those engines exist" -- the lineup engine now
-- exists and is genuinely a per-user-authorized operation).
--
-- This adds the missing UPDATE policy, scoped to team ownership, mirroring
-- the existing "owners can update their own team" precedent on
-- `fantasy_teams`. `updateLineup()` (src/lib/fantasy-engine/lineup.ts)
-- only ever does `update ... set starter, slot where id = <row>` -- never
-- inserts or deletes a `lineup_slots` row (those come from
-- `createRoundLineupSlots`, a genuine multi-team lifecycle operation that
-- correctly stays on service_role) -- so only an UPDATE policy is needed.
--
-- All lock/formation validation remains entirely in application code
-- (`updateLineup`, unchanged) -- this policy only answers "does the caller
-- own the row at all", exactly like the existing manual ownership check
-- the calling Server Actions already perform, now enforced again at the
-- database layer too.
create policy "team owners can update their own lineup_slots"
  on public.lineup_slots for update
  to authenticated
  using (
    exists (
      select 1 from public.roster_entries re
      join public.fantasy_teams ft on ft.id = re.fantasy_team_id
      where re.id = lineup_slots.roster_entry_id
        and ft.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.roster_entries re
      join public.fantasy_teams ft on ft.id = re.fantasy_team_id
      where re.id = lineup_slots.roster_entry_id
        and ft.owner_user_id = auth.uid()
    )
  );
