-- Pass 10.5B: accent/diacritic-insensitive player search ("mbappe" must
-- find "Mbappé") for both the Players database and the Draft workspace
-- (both go through the same src/data-access/players.ts getPlayerDatabase()
-- query builder, so this one change covers both surfaces).
--
-- Postgres's own `unaccent()` (contrib extension) is what actually strips
-- accents server-side, but it's marked STABLE, not IMMUTABLE, so it can't
-- be used directly in a `GENERATED ALWAYS AS ... STORED` column expression
-- -- the standard, safe workaround (used everywhere this problem comes up)
-- is a thin wrapper function explicitly declared IMMUTABLE: `unaccent`'s
-- behavior only depends on its (fixed, never-reloaded-at-runtime) text
-- search dictionary, so this is a safe claim to make.
--
-- The generated column is compared against the search TERM after the SAME
-- normalization is applied in JS (src/lib/search-normalize.ts) -- both
-- sides must be stripped of accents the same way, or matching silently
-- breaks. No new search index: the existing `ilike` search on `name` has
-- never been indexed either (leading-wildcard `ilike` isn't helped by a
-- plain btree anyway), so this doesn't change that performance profile.

create extension if not exists unaccent with schema extensions;

create or replace function public.immutable_unaccent(text)
returns text
language sql
immutable
parallel safe
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, $1)
$$;

comment on function public.immutable_unaccent(text) is
  'IMMUTABLE wrapper around extensions.unaccent() so it can be used in GENERATED ALWAYS AS ... STORED column expressions (unaccent() itself is only STABLE). Safe: its behavior depends only on the fixed "unaccent" text search dictionary, never on runtime state.';

alter table public.players add column name_unaccented text
  generated always as (public.immutable_unaccent(name)) stored;

alter table public.clubs add column name_unaccented text
  generated always as (public.immutable_unaccent(name)) stored;

alter table public.clubs add column short_name_unaccented text
  generated always as (public.immutable_unaccent(short_name)) stored;

comment on column public.players.name_unaccented is
  'Accent-stripped copy of name (e.g. "Mbappe" for "Mbappé"), auto-maintained. Search matches against this, never the raw name, so diacritic-insensitive search works both ways regardless of whether the stored name or the search term has the accent.';
