-- Extensions and shared helpers used by every later migration.

-- gen_random_uuid() is built into Postgres 13+, but gen_random_bytes()
-- (used for invite-code generation, see 20260929141145_functions.sql)
-- requires pgcrypto.
create extension if not exists pgcrypto with schema extensions;

-- Generic "bump updated_at on every UPDATE" trigger, attached to every
-- table below that has an updated_at column. One function, reused
-- everywhere, instead of a bespoke trigger per table.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Sets updated_at = now() on UPDATE. Attach via BEFORE UPDATE trigger to any table with an updated_at column.';
