-- Application profile, one row per auth.users row. Supabase Auth owns
-- authentication identity (password hashes, email, etc. all stay in
-- auth.users) — this table only ever holds Eleven-specific presentation
-- fields. Row creation is handled by a trigger, added in
-- 20260929141145_functions.sql (after auth.users exists, which it always
-- does — it's Supabase's own schema — but the trigger is grouped with the
-- rest of Eleven's functions for readability).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per auth.users row. Created automatically by the on_auth_user_created trigger (20260929141145_functions.sql) — never insert here directly.';

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
