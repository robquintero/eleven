-- Pass 9's production scoring engine needs somewhere to write canonical
-- per-(player, fixture) fantasy scores RIGHT NOW, independent of any
-- fantasy league's rounds — which don't exist yet (no round scheduler,
-- no draft engine; see docs/product-state.md). But
-- `fantasy_player_scores.fantasy_round_id` is NOT NULL and FK'd to
-- `fantasy_rounds`, which is empty for every league today. Inserting a
-- score is impossible without either fabricating a fantasy_rounds row
-- (a fake product-state object Pass 7.5's rule forbids) or loosening this
-- constraint.
--
-- The deeper reason this constraint doesn't fit: a player's canonical
-- fantasy score for a real fixture is a property of (player, fixture,
-- scoring rule version) alone — it must be IDENTICAL no matter which
-- Eleven league asks about it (docs/football-data-system.md "Fantasy
-- scoring must be deterministic and reproducible"). `fantasy_rounds` is
-- inherently per-league (`fantasy_rounds.league_id` is NOT NULL), so a
-- league-scoped round was never the right place to anchor the canonical
-- score anyway — aggregating canonical scores into "this league's round N
-- total" is a separate, later, League-scoped concern (explicitly out of
-- scope this pass: "do not begin Draft / H2H fantasy-round
-- implementation yet").
--
-- Deliberately additive/loosening, not a redesign: the table keeps every
-- existing column (including fantasy_round_id, nullable now, ready to be
-- populated by a future round-aggregation pass without another
-- migration) and gains exactly one new column.

alter table public.fantasy_player_scores
  alter column fantasy_round_id drop not null;

-- The original uniqueness (player_id, fixture_id, fantasy_round_id) is
-- meaningless once fantasy_round_id is always NULL here (Postgres treats
-- NULL as distinct from NULL for uniqueness purposes) — replaced with the
-- constraint that actually matches the new canonical-score meaning:
-- one score per player per fixture per RULE VERSION, so a future
-- ELEVEN_STANDARD_V2 can coexist with (never silently overwrite) every
-- V1 score already calculated.
alter table public.fantasy_player_scores
  drop constraint if exists fantasy_player_scores_player_id_fixture_id_fantasy_round_id_key;

alter table public.fantasy_player_scores
  add column scoring_rule_version text not null default 'ELEVEN_STANDARD_V1';

create unique index fantasy_player_scores_player_fixture_version_idx
  on public.fantasy_player_scores (player_id, fixture_id, scoring_rule_version);

comment on column public.fantasy_player_scores.scoring_rule_version is
  'Which versioned Eleven scoring formula (src/domain/fantasy/scoring.ts) produced this row — e.g. "ELEVEN_STANDARD_V1". Historical scores stay reproducible: a new formula version writes NEW rows, it never overwrites scores an older version produced.';

comment on column public.fantasy_player_scores.fantasy_round_id is
  'Nullable — no round scheduler exists yet (Pass 10+). A canonical player/fixture score is round- and league-independent; this column is reserved for a future per-league round-aggregation pass, not populated by the scoring engine itself.';
