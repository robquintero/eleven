-- Pass 9: the scoring engine needs to know a fixture's final score to
-- credit clean sheets to goalkeepers/defenders — without it, those
-- positions have almost no objective attacking-adjacent signal, which
-- directly conflicts with the brief's "the model should not make center
-- backs/goalkeepers structurally irrelevant." `fixtures` had no score
-- columns at all (see docs/football-data-system.md "Phase 1 — scoring
-- data capability audit").
--
-- Nullable: a scheduled/live fixture has no final score yet, and a
-- postponed one may never get one — this is never fabricated, only ever
-- set from the provider's own `goals.home`/`goals.away` fields.
--
-- Deliberately NOT storing a derived `clean_sheet` flag anywhere: whether
-- a specific player's appearance counts as a clean sheet depends on their
-- position, their club, and how many minutes they played in this fixture
-- — all of which already exist as raw facts (players.position,
-- player_match_stats.minutes, and now fixtures.home_score/away_score).
-- The scoring engine derives clean-sheet credit from these at score-
-- calculation time, which is what keeps scoring "deterministic and
-- reproducible from stored raw football statistics" rather than trusting
-- a second, potentially-stale copy of the same fact.
alter table public.fixtures
  add column home_score smallint,
  add column away_score smallint;

comment on column public.fixtures.home_score is
  'Final (or current live) home-side goals, from the provider. NULL until the fixture has actually kicked off.';
comment on column public.fixtures.away_score is
  'Final (or current live) away-side goals, from the provider. NULL until the fixture has actually kicked off.';
