-- Pass 8 (Football Data System): the minimal additive schema real
-- ingestion needs beyond Pass 7A's football_foundation.sql. Everything
-- here is additive — no existing column/constraint is changed.

-- ---------------------------------------------------------------------
-- Season context (brief §5 "Current season resolution")
-- ---------------------------------------------------------------------

-- `competitions` is an evergreen entity (Premier League exists across many
-- seasons) — this column is deliberately NOT "the" season a competition
-- belongs to, it's which provider season the competition's currently
-- ingested `clubs`/`players` reflect. Re-ingesting a new season updates
-- this in place; Eleven does not (yet) keep multiple seasons' rosters
-- side by side. Nullable because a competition row can exist (e.g. from
-- resolving a fixture's league) before a full roster sync has run.
alter table public.competitions
  add column season smallint;

comment on column public.competitions.season is
  'Provider season (starting year, e.g. 2026 for 2026-27) that this competition''s currently-ingested clubs/players reflect. Set by the competitions sync — see src/lib/football-ingestion.';

-- `fixtures`, unlike `competitions`, genuinely belongs to exactly one
-- season — persisting it explicitly (rather than only implying it via
-- `kickoff_at`) is what makes "which season is this fixture data" an
-- explicit, queryable fact instead of a date-math inference, and lets
-- ingestion request a specific season's fixtures unambiguously.
-- No DEFAULT (Postgres disallows another column in one anyway): safe as
-- a bare NOT NULL add because `fixtures` has zero rows today — no
-- ingestion has run yet. Every future insert supplies it explicitly.
alter table public.fixtures
  add column season smallint not null;

comment on column public.fixtures.season is
  'Provider season (starting year) this fixture belongs to — always set explicitly by ingestion, never inferred from kickoff_at at read time.';

create index fixtures_competition_id_season_idx on public.fixtures (competition_id, season);

-- ---------------------------------------------------------------------
-- Starter/substitute (briefs §15/§21/§23 — MIN/STARTS columns, start-rate
-- analytics). Genuinely available from the provider's fixture-players
-- endpoint (`games.substitute`) and cheap to persist; everything else
-- listed as "potentially useful" in the Pass 8 brief (rating, passes,
-- duels, dribbles, fouls, penalties) is deliberately NOT added this pass
-- — see docs/football-data-system.md "Stats deliberately not modeled."
-- ---------------------------------------------------------------------

alter table public.player_match_stats
  add column started boolean not null default false;

comment on column public.player_match_stats.started is
  'Whether the player started this fixture (provider: NOT substitute). Powers the Players workspace''s STARTS/start-rate analytics — never used as a fantasy-scoring input by itself.';
