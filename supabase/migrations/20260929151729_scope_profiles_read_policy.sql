-- Tightens `profiles` SELECT from "any authenticated user can read any
-- profile" down to least-privilege: a user can always read their own
-- profile, and can read another user's profile only if they share at
-- least one league. That's the only real use of `profiles` today (league
-- member display names) — an open directory of every Eleven user's
-- display name/avatar was broader than the product needs.
--
-- Uses a SECURITY DEFINER helper (same pattern as
-- 20260929151124_fix_league_membership_rls_recursion.sql) so the
-- self-join through league_memberships doesn't re-trigger RLS evaluation
-- unnecessarily on every row.
--
-- Deliberately additive — a new migration rather than editing the
-- already-applied 20260929141143_rls.sql.

create or replace function public.shares_league_with(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.league_memberships m1
    join public.league_memberships m2 on m1.league_id = m2.league_id
    where m1.user_id = auth.uid() and m2.user_id = p_user_id
  );
$$;

revoke all on function public.shares_league_with(uuid) from public;
grant execute on function public.shares_league_with(uuid) to authenticated;

drop policy "authenticated can read profiles" on public.profiles;
create policy "users can read their own or a shared-league member's profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id or public.shares_league_with(id));
