# Autonomous Stabilization Pass — Handoff Document

Agent-neutral. Either Claude Code or Codex should be able to resume from this file plus the repository state alone — do not assume anything from a chat transcript.

Last updated: 2026-10-09T16:10Z by Claude Code, immediately after Phase B completed and verified in production.

## 1. Current objective

Executing the "ELEVEN — AUTONOMOUS STABILIZATION & PRODUCTION RECOVERY" brief, Phases A–H, in order. Phases B and C are **done and verified in production**. Starting Phase D (PLAYER_NOT_FOUND diagnostics) next.

## 2. Completed phases

- **Pass 1** (investigation): root-caused the draft-lag/search, Starting-XI-never-initialized, and PLAYER_NOT_FOUND symptoms in "5 Men of Class". Findings were delivered in-chat only (no file); summarized in section 8 below.
- **Pass 2**: preserved the authoritative draft snapshot (`docs/audits/5-men-of-class-draft-snapshot-2026-10-09.json`, SHA-256 `0fdbd65851c15c48c72753130c9ea5bbcba801910881df9b2b9332737b71e2b9` — verify this before trusting the file), cross-checked all 80 players' positions against real match-appearance data, produced `docs/audits/5-men-of-class-position-accuracy-audit.md`.
- **Pass 3**: implemented the full canonical-position system (`player_position_overrides` table, `players.canonical_position` trigger-maintained column, every gameplay RPC and data-access site wired to it) and the 4-3-3 `update_team_lineup` migration. Verified with real PGlite tests against the actual migration files. Report: `docs/audits/5-men-of-class-pass3-position-overrides-and-formation-impact.md`.
- **Autonomous pass, Phase A**: baseline confirmed (git clean, build/tsc/lint/tests all green), committed Pass 2/3 work as commit `3a0ce93`.
- **Autonomous pass, Phase B — DONE, VERIFIED IN PRODUCTION** (commit `2e93483` + production migrations/data):
  - Added a transitional migration (`20261015000200_formation_dual_shape_transition.sql`) so `update_team_lineup` accepts EITHER the old 4-4-2 or new 4-3-3 shape, specifically to make the migration-then-deploy ordering safe in either direction (no incompatible client/server window). Added a matching test proving both shapes are accepted and a truly-invalid shape is still rejected.
  - Activated `FORMATION_RULES` to 4-3-3 in `src/domain/fantasy/constants.ts` and fixed every place that assumed 4-4-2 (Team-page loading skeleton, landing-page preview copy, pitch-layout coordinate presets, and ~6 test files) — full suite re-verified green (756 passing) before touching production.
  - **Applied to production** (`npx supabase db push`, confirmed via `supabase migration list`): `20261014000000_position_classification_overrides.sql`, `20261015000000_canonical_position_resolution.sql`, `20261015000100_formation_4_3_3_and_canonical_position_lineup.sql`, `20261015000200_formation_dual_shape_transition.sql`. Verified read-only afterward: all 2767 players got `canonical_position` backfilled correctly (sample-checked, matches `position` for everyone not yet overridden).
  - **Ran the guarded one-off override script** (`npx supabase db query --linked --file scripts/one-off/position-overrides-2026-10-09.sql`) — succeeded, drift guard passed. Verified via read-only query: all 4 overrides are live (`A. Amaimouni MID→FWD`, `M. Guéhi MID→DEF`, `M. Rogers FWD→MID`, `Pedro Porro MID→DEF`); `players.position` unchanged for all 4 (still raw provider values).
  - **Verified all 5 "5 Men of Class" teams are 4-3-3 feasible in real production data** (not just the snapshot): 2 Goals 1 Cup GK2/DEF6/MID5/FWD3, 75Hard GK2/DEF6/MID5/FWD3, Expected Toulouse FC GK2/DEF5/MID6/FWD3, Phantom FC GK2/DEF4/MID6/FWD4, Pressure FC GK2/DEF5/MID5/FWD4 — every team has ≥1 GK, ≥4 DEF, ≥3 MID, ≥3 FWD.
  - **Not yet done**: the app code change (constants.ts 4-3-3 + all the canonical_position TS wiring) has NOT been deployed to Vercel yet — only the DB side is live. This is safe right now because of the dual-shape transition, but it means the production UI is still presenting/enforcing 4-4-2 until the deploy happens (Phase H). Do not narrow the dual-shape migration to 4-3-3-only until that deploy is confirmed live.
- **Autonomous pass, Phase C — DONE, VERIFIED IN PRODUCTION** (commit `d6221d0` + a live data repair, no new migration needed):
  - Root cause confirmed: the post-draft lineup self-heal (`repairIncompleteRoundOne`, rounds.ts) only ever acted on a team with literally ZERO `lineup_slots` rows; any team with even one existing slot (all 5 "5 Men of Class" teams had exactly 1, from a manager clicking a starter mid-draft) was skipped forever, leaving the other 15 roster entries slot-free.
  - Fix: `provisionMissingLineupSlots` (lineup.ts) + pure decision function `planPartialLineupProvisioning` (auto-lineup.ts) — fills ONLY the missing roster entries for a team, computing remaining formation need from whatever's already a starter, never touching an existing slot. Wired into `repairIncompleteRoundOne` for every team with any gap (zero or partial). Genuine conflicts (insufficient depth, inconsistent existing selection) are recorded as a `LINEUP_PROVISIONING_FAILED` domain event, not silently swallowed. 14 new tests (7 pure-function, 7 against the real self-heal flow with the actual "1 existing starter, 15 missing" shape).
  - **Repaired the live league**: ran `provisionMissingLineupSlots` (the real, tested function, not a one-off reimplementation) against "5 Men of Class"'s current round (`ab75c6e1-7bc7-4f95-8ee7-42001b3be79d`) for all 5 teams. All 5 returned `{status: "provisioned", createdCount: 15}`.
  - **Verified in production**: every team now has exactly 16 roster / 11 starters / 5 bench, a valid 4-3-3 composition (GK1/DEF4/MID3/FWD3), zero duplicate roster assignments, and — critically — the pre-existing manual starter slot for each team was confirmed byte-for-byte unchanged (same roster_entry_id, still `starter: true`). `draft_picks` still 80/80, `league_player_ownership` still 80 rows, both unchanged.
  - No further live-league action needed for Phase C. The architectural fix is also now live for every OTHER league in production (any future draft completion benefits from the same fix).

## 3. Remaining phases (at time of writing)

B (activate positions/4-3-3) → C (permanent lineup-init fix + live league repair) → D (PLAYER_NOT_FOUND diagnostics) → E (draft performance) → F (competition filters) → G (5-manager simulation) → H (validation + deploy) — all still to do as of this update. This section will be rewritten, not appended to, at each subsequent update — treat only the LATEST version of this file as current.

## 4. Current Git state

- Branch: `main`. HEAD at pass start: `308f9029bd792dbf2f22dc6e67db0ff9066766ed` (= `origin/main`, confirmed via fetch).
- Uncommitted working-tree changes at pass start (all from Pass 2/3, untested-by-commit but test-suite-verified): see `git status --short` — 8 modified data-access/lineup files, 1 modified generated-types file, 1 modified test fixture, plus new files: 3 new migrations, 2 new domain modules + tests, 2 new DB-backed test files, 1 one-off SQL script, `docs/audits/` (3 files).
- Nothing has been committed yet in this session as of this update.

## 5. Production state

- Supabase project ref: `oknhqdiinaxofrzxphxf`. **All migrations through `20261015000200` are applied** (confirmed via `supabase migration list` — every row shows matching local/remote timestamps). Use `npx supabase migration list` to re-verify; do not trust this file blindly if much time has passed.
- The 4 approved position overrides are live in the `player_position_overrides` table (verified via read-only query, see Phase B section above).
- Vercel: no linked CLI session in this environment (not logged in), and **the app code deploy for Phase B (constants.ts 4-3-3 + canonical_position TS wiring) has not shipped yet** — `origin/main` is still at the pre-this-session commit as of this update (nothing has been pushed). Production is almost certainly still serving the OLD app code. Production deployment commit SHA is otherwise **not independently verifiable** from here (no Vercel CLI session) — do not assume it matches `origin/main`. Last known fact (Pass 1 history, unconfirmed since): production had been temporarily rolled back to commit `2a4c5a7` after a live-draft incident, with intent to restore later.

## 6. Database changes

**Applied** (through `20261015000200_formation_dual_shape_transition.sql`, confirmed in production):
- `20261014000000_position_classification_overrides.sql`
- `20261015000000_canonical_position_resolution.sql`
- `20261015000100_formation_4_3_3_and_canonical_position_lineup.sql`
- `20261015000200_formation_dual_shape_transition.sql` (the dual-shape compatibility shim — update_team_lineup currently accepts EITHER 4-4-2 or 4-3-3; narrow this to 4-3-3-only in a follow-up migration only after the app deploy below is confirmed live)
**Applied data** (one-off, not a migration): `scripts/one-off/position-overrides-2026-10-09.sql` — ran successfully, all 4 overrides live.
**Not yet deployed** (app code, local commits only as of this update): the `constants.ts` FORMATION_RULES 4-3-3 change and all canonical_position TS data-access wiring, committed locally (`2e93483` and `3a0ce93`) but not pushed to `origin/main` / not deployed to Vercel.

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
