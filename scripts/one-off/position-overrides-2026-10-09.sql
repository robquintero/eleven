-- PREPARED, NOT EXECUTED. Awaiting explicit approval to run against
-- production (see docs/audits/5-men-of-class-pass3-position-overrides-and-formation-impact.md).
--
-- Requires 20261014000000_position_classification_overrides.sql,
-- 20261015000000_canonical_position_resolution.sql and
-- 20261015000100_formation_4_3_3_and_canonical_position_lineup.sql to be
-- applied first (player_position_overrides table, canonical_position
-- column/triggers, and the 4-3-3-shaped update_team_lineup). Inserting
-- these 4 rows BEFORE applying the 4-3-3 lineup migration would leave
-- "2 Goals 1 Cup" formation-feasible but still validated against the old
-- GK1/DEF4/MID4/FWD2 shape -- the brief's "activate together" requirement.
--
-- The four player UUIDs are taken verbatim from the preserved draft
-- snapshot (docs/audits/5-men-of-class-draft-snapshot-2026-10-09.json,
-- SHA-256 0fdbd65851c15c48c72753130c9ea5bbcba801910881df9b2b9332737b71e2b9)
-- -- never re-looked-up by name. Each INSERT's WHERE-equivalent guard
-- (the DO block below) aborts the whole statement if a player's live,
-- raw `position` has drifted from what Pass 2/3's evidence assumed,
-- rather than silently overriding against a provider position nobody
-- has reviewed.
--
-- Idempotent: ON CONFLICT (player_id) DO UPDATE lets this be re-run
-- safely (e.g. to correct a typo in `reason`) without creating duplicate
-- history rows -- player_position_overrides holds the CURRENT override
-- per player, not a revision log (see that table's own migration
-- comment).
--
-- Preserves: all 80 original draft_picks rows, all roster_entries/
-- league_player_ownership rows, every completed matchup and settled
-- fantasy_player_scores row (none of this touches those tables), and
-- players.position itself (raw provider value, untouched by design).

do $$
declare
  v_guehi_position text; v_porro_position text; v_rogers_position text; v_amaimouni_position text;
begin
  select position into v_guehi_position from public.players where id = '28dd6e50-16dd-4328-a734-a443e8a50902';
  select position into v_porro_position from public.players where id = '33eab8f1-b033-48f1-827f-612b7573e9ac';
  select position into v_rogers_position from public.players where id = '7bff7448-34a8-45d5-afbd-d1586a0c86ba';
  select position into v_amaimouni_position from public.players where id = '75b65172-5451-4341-94e5-58086e5a5792';

  if v_guehi_position is distinct from 'MID' then raise exception 'GUEHI_RAW_POSITION_DRIFTED: expected MID, found %', v_guehi_position; end if;
  if v_porro_position is distinct from 'MID' then raise exception 'PORRO_RAW_POSITION_DRIFTED: expected MID, found %', v_porro_position; end if;
  if v_rogers_position is distinct from 'FWD' then raise exception 'ROGERS_RAW_POSITION_DRIFTED: expected FWD, found %', v_rogers_position; end if;
  if v_amaimouni_position is distinct from 'MID' then raise exception 'AMAIMOUNI_RAW_POSITION_DRIFTED: expected MID, found %', v_amaimouni_position; end if;
end;
$$;

insert into public.player_position_overrides
  (player_id, provider_position_at_override, override_position, reason, evidence_source, confidence, created_by_user_id)
values
  ('28dd6e50-16dd-4328-a734-a443e8a50902', 'MID', 'DEF',
   'Product owner approved, Pass 3: 9 of 10 logged /fixtures/players match appearances show D; Pass 2 cross-check (docs/audits/5-men-of-class-position-accuracy-audit.md).',
   'manual_review', 'CONFIRMED', null),
  ('33eab8f1-b033-48f1-827f-612b7573e9ac', 'MID', 'DEF',
   'Product owner approved, Pass 3: 2 of 3 logged /fixtures/players match appearances show D; Pass 2 cross-check (docs/audits/5-men-of-class-position-accuracy-audit.md).',
   'manual_review', 'CONFIRMED', null),
  ('7bff7448-34a8-45d5-afbd-d1586a0c86ba', 'FWD', 'MID',
   'Product owner approved, Pass 3: 5 of 9 logged /fixtures/players match appearances show M; Pass 2 cross-check (docs/audits/5-men-of-class-position-accuracy-audit.md).',
   'manual_review', 'CONFIRMED', null),
  ('75b65172-5451-4341-94e5-58086e5a5792', 'MID', 'FWD',
   'Product owner approved, Pass 3: 3 of 4 logged /fixtures/players match appearances show F; Pass 2 cross-check (docs/audits/5-men-of-class-position-accuracy-audit.md).',
   'manual_review', 'CONFIRMED', null)
on conflict (player_id) do update set
  override_position = excluded.override_position,
  reason = excluded.reason,
  evidence_source = excluded.evidence_source,
  confidence = excluded.confidence;

-- Verification query to run immediately after (read-only):
-- select p.id, p.name, p.position as raw_provider_position, p.canonical_position,
--        o.override_position, o.confidence, o.created_at
-- from public.players p
-- join public.player_position_overrides o on o.player_id = p.id
-- where p.id in (
--   '28dd6e50-16dd-4328-a734-a443e8a50902', '33eab8f1-b033-48f1-827f-612b7573e9ac',
--   '7bff7448-34a8-45d5-afbd-d1586a0c86ba', '75b65172-5451-4341-94e5-58086e5a5792'
-- );
-- Expected: canonical_position = DEF, DEF, MID, FWD respectively; position (raw) unchanged at MID, MID, FWD, MID.
