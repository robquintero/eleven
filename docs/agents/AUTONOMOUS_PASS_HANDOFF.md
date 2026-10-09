# Autonomous Stabilization Pass — Handoff Document

Agent-neutral. Either Claude Code or Codex should be able to resume from this file plus the repository state alone — do not assume anything from a chat transcript.

Last updated: 2026-10-09T15:40Z by Claude Code, at the start of the autonomous pass (immediately after Phase A baseline, before any Phase B mutation).

## 1. Current objective

Executing the "ELEVEN — AUTONOMOUS STABILIZATION & PRODUCTION RECOVERY" brief, Phases A–H, in order. Currently starting Phase B (activate the four position overrides + 4-3-3 formation).

## 2. Completed phases

- **Pass 1** (investigation): root-caused the draft-lag/search, Starting-XI-never-initialized, and PLAYER_NOT_FOUND symptoms in "5 Men of Class". See `docs/audits/` is empty of a Pass-1-specific file — findings were delivered in-chat only; summarized in section 8 below since they're not otherwise persisted.
- **Pass 2**: preserved the authoritative draft snapshot (`docs/audits/5-men-of-class-draft-snapshot-2026-10-09.json`, SHA-256 `0fdbd65851c15c48c72753130c9ea5bbcba801910881df9b2b9332737b71e2b9` — verify this before trusting the file), cross-checked all 80 players' positions against real match-appearance data, and produced `docs/audits/5-men-of-class-position-accuracy-audit.md`.
- **Pass 3**: implemented (but did not apply/deploy) the full canonical-position system — `player_position_overrides` table, `players.canonical_position` trigger-maintained column, every gameplay RPC and data-access read site wired to it, the 4-3-3 `update_team_lineup` migration, and the guarded one-off override-insertion script. All verified with real PGlite tests (not mocks) against the actual migration files. Full report: `docs/audits/5-men-of-class-pass3-position-overrides-and-formation-impact.md`. **As of last update, none of this was applied to production or deployed.**

## 3. Remaining phases (at time of writing)

B (activate positions/4-3-3) → C (permanent lineup-init fix + live league repair) → D (PLAYER_NOT_FOUND diagnostics) → E (draft performance) → F (competition filters) → G (5-manager simulation) → H (validation + deploy) — all still to do as of this update. This section will be rewritten, not appended to, at each subsequent update — treat only the LATEST version of this file as current.

## 4. Current Git state

- Branch: `main`. HEAD at pass start: `308f9029bd792dbf2f22dc6e67db0ff9066766ed` (= `origin/main`, confirmed via fetch).
- Uncommitted working-tree changes at pass start (all from Pass 2/3, untested-by-commit but test-suite-verified): see `git status --short` — 8 modified data-access/lineup files, 1 modified generated-types file, 1 modified test fixture, plus new files: 3 new migrations, 2 new domain modules + tests, 2 new DB-backed test files, 1 one-off SQL script, `docs/audits/` (3 files).
- Nothing has been committed yet in this session as of this update.

## 5. Production state

- Supabase project ref: `oknhqdiinaxofrzxphxf`. Migration state as of Pass 1: all 38 pre-Pass-2 migrations applied; the 3 new migrations from Pass 2/3 (`20261014000000`, `20261015000000`, `20261015000100`) are **NOT applied**.
- Vercel: no linked CLI session in this environment (not logged in). Production deployment commit SHA is **not independently verifiable** from here — do not assume it matches `origin/main`. Last known fact (Pass 1): production had been temporarily rolled back to commit `2a4c5a7` after a live-draft incident, with intent to restore later — whether that restoration happened is unconfirmed.

## 6. Database changes

Applied: everything through `20261013000000_pre_draft_acquisition_guard.sql`.
Unapplied (prepared, dry-run tested in PGlite, not yet run against the real Supabase project):
- `20261014000000_position_classification_overrides.sql`
- `20261015000000_canonical_position_resolution.sql`
- `20261015000100_formation_4_3_3_and_canonical_position_lineup.sql`
Unapplied data (not a migration — a guarded one-off script): `scripts/one-off/position-overrides-2026-10-09.sql`.

## 7. Test results (as of last full run, Pass 3)

`npm test`: 755 passing, 0 failing, 104 skipped (integration tests requiring live Supabase credentials). `npx tsc --noEmit`: clean. `eslint` on touched files: clean. No production build (`npm run build`) has been run yet this pass.

## 8. Known issues (carried from Pass 1, not yet fixed as of this update)

- **Starting XI never initialized for "5 Men of Class"**: the league's `fantasy_rounds` row was created ~11 hours *before* the draft started, so `createRoundLineupSlots` ran against 0-player rosters for every team and silently no-opped. No automatic re-trigger exists once a round has "opened" — only a partial Team-page-visit self-heal (`repairIncompleteRoundOne`), which only handles teams with *zero* existing slots, not partially-initialized ones. DB evidence: only 7 of 80 expected `lineup_slots` rows exist league-wide.
- **PLAYER_NOT_FOUND**: traced to the `players.id` lookup inside `sign_player`/`_perform_draft_pick`, never to `update_team_lineup`. The specific trigger (which player ID, which action) was not reproduced from available evidence.
- **Draft lag/search**: root-caused to a hardcoded `sort:"points"` full-catalog query re-run on every keystroke/filter/pick (no server-side bounding), zero Realtime (5s polling + `router.refresh()` only), and no stale-response guard on search.
- **Competition filter**: Players-page dropdown renders raw `competitions.code` instead of `name`; international competition codes are selectable but can never match a player (`players.competition_id` is never set for international rows), so they're misleading zero-result options.
- **West Ham / promotion-relegation**: confirmed currently correctly classified (Premier League, season 2026) — not a live bug, but the schema has no mechanism to ever re-derive a club's division, which is a latent gap.

## 9. Next actions for whichever agent resumes

1. Re-verify this file's "Production state" and "Database changes" sections against the *actual* live Supabase project and Vercel before doing anything — they may be stale by the time you read this.
2. If Phase B hasn't been marked complete below, start there: apply the 3 migrations in order, confirm via the verification query in the one-off script's header, THEN decide deploy-vs-migration ordering before touching `constants.ts` or running the override script (read that script's own header comment for why order matters).
3. Continue sequentially through the phases listed in section 3 above (always trust the LATEST version of this file, not this one, if a newer one exists).

## 10. Safety constraints (do not violate, regardless of which agent is executing)

- Never reset, delete, or restart the "5 Men of Class" draft/league/teams.
- Never reassign player ownership or drop/sign a player on a manager's behalf.
- Never rewrite a settled matchup result or change V4 scoring weights.
- Never run the one-off override script if its own drift guard would fail silently (it raises an exception on drift — if it ever doesn't, stop and investigate rather than trusting it).
- Never apply `20261015000100_formation_4_3_3_and_canonical_position_lineup.sql` to production without the `constants.ts` `FORMATION_RULES` change deployed in the same window — see that migration's header for why.
- Never push to `main` / trigger a deploy with failing tests, a dirty typecheck, or an unreviewed diff.
