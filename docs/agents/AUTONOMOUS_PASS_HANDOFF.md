# Autonomous Stabilization Pass — Handoff Document

Agent-neutral. Either Claude Code or Codex should be able to resume from this file plus the repository state alone — do not assume anything from a chat transcript.

Last updated: 2026-10-09T17:05Z by Claude Code, handing off to Codex per the product owner's request. Claude Code has stopped writing files and executing commands as of this update — safe to begin in Codex now.

## 1. Current objective

Executing the "ELEVEN — AUTONOMOUS STABILIZATION & PRODUCTION RECOVERY" brief, Phases A–H, in order. **Phases A, B, C, D, and F are done.** Phase E is partially done (E1 only). **Resume at Phase E2** (Realtime synchronization) — see section 3.

## 2. Completed phases

- **Pass 1** (investigation, chat-only, not in a file): root-caused the draft-lag/search, Starting-XI-never-initialized, and PLAYER_NOT_FOUND symptoms in "5 Men of Class". Summarized in section 8.
- **Pass 2**: preserved the authoritative draft snapshot (`docs/audits/5-men-of-class-draft-snapshot-2026-10-09.json`, SHA-256 `0fdbd65851c15c48c72753130c9ea5bbcba801910881df9b2b9332737b71e2b9` — verify before trusting), cross-checked all 80 players' positions against real match-appearance data, produced `docs/audits/5-men-of-class-position-accuracy-audit.md`.
- **Pass 3**: implemented the full canonical-position system and the 4-3-3 `update_team_lineup` migration, verified with PGlite tests. Report: `docs/audits/5-men-of-class-pass3-position-overrides-and-formation-impact.md`.
- **Phase A** (baseline): confirmed clean before starting; committed Pass 2/3 work as `3a0ce93`.
- **Phase B — DONE, VERIFIED IN PRODUCTION** (commits `2e93483`, `3a0ce93` + production migrations/data):
  - 4-3-3 activated in `constants.ts`; every 4-4-2 assumption fixed (loading skeleton, landing page, pitch-layout presets, ~6 test files).
  - Transitional migration `20261015000200_formation_dual_shape_transition.sql` makes `update_team_lineup` accept EITHER 4-4-2 or 4-3-3, specifically so the DB-migration-vs-Vercel-deploy ordering can never produce an incompatible client/server pair.
  - **Applied to production**: all 4 new migrations (`20261014000000`, `20261015000000`, `20261015000100`, `20261015000200`), confirmed via `supabase migration list`.
  - **Ran the guarded override script** against production (`scripts/one-off/position-overrides-2026-10-09.sql`) — all 4 overrides live, verified by read-only query (`canonical_position` correct, raw `position` untouched for all 4 players).
  - **Verified all 5 "5 Men of Class" teams are 4-3-3-feasible in real production data.**
  - **STILL NOT DONE**: the Vercel app deploy (constants.ts 4-3-3 + canonical_position TS wiring) has **not shipped**. `origin/main` is still behind local `main` as of this update — nothing has been pushed yet. This is safe right now (dual-shape migration covers the gap) but means production is still running pre-this-session app code. Do this at Phase H, not before everything else is validated.
- **Phase C — DONE, VERIFIED IN PRODUCTION** (commit `d6221d0` + a live data repair via script, no new migration):
  - Root cause: `repairIncompleteRoundOne` only ever acted on a team with ZERO `lineup_slots` rows; a team with even one existing slot (all 5 "5 Men of Class" teams, from a manager clicking a starter mid-draft) was skipped forever.
  - Fix: `provisionMissingLineupSlots` (`src/lib/fantasy-engine/lineup.ts`) + pure decision function `planPartialLineupProvisioning` (`src/domain/fantasy/auto-lineup.ts`) — fills only missing roster entries, preserves every existing slot, reports genuine conflicts as a `LINEUP_PROVISIONING_FAILED` domain event instead of swallowing them. 14 new tests.
  - **Repaired the live league**: ran the real, tested function against all 5 teams — all returned `{status: "provisioned", createdCount: 15}`. **Verified in production**: every team now has 16 roster / 11 starters / 5 bench, valid 4-3-3, zero duplicates, pre-existing manual slots byte-for-byte unchanged, `draft_picks` still 80/80, ownership still 80 rows.
- **Phase D — DONE** (commit `f74197d`):
  - Traced the full player-identity flow (search result → draft/sign/drop action → RPC). Found **no identifier-type/serialization bug** — `player.id` flows untransformed everywhere checked. The exact historical PLAYER_NOT_FOUND trigger remains **unreproduced from available evidence** — this is reported honestly, not guessed at.
  - Added `logUnexpectedActionError` (`src/lib/errors/action-error-diagnostics.ts`), wired into `submitDraftPickAction`, `resolveExpiredPickAction`, `signPlayerAction`, `dropPlayerAction` — any RPC failure classified as a genuine error (never an expected rule outcome) is now logged server-side with the action name, error code, and opaque ids. If PLAYER_NOT_FOUND recurs, it will now be observable in Vercel logs.
  - Fixed a real, confirmed stale-response race in the Draft page's player search (`src/lib/search/stale-response-guard.ts`, wired into `draft-page-client.tsx`): an older, slower search response could resolve after a newer one and silently overwrite it with stale data. The Players page's own search goes through router navigation and did not have this bug.
- **Phase E — PARTIALLY DONE (E1 only)** (commit `dd649d4`):
  - **E1 (search performance) — done**: `queryPlayerDatabase`'s `sort:"points"` path (the draft board's hardcoded sort) was aggregating fantasy scores across the ENTIRE active catalog on every keystroke, ignoring whatever search/position/competition filter had already narrowed the candidates. Now resolves the filtered candidate ids first, then scopes the score aggregation to exactly those ids. An unfiltered "browse everyone by points" view is unaffected (correctly still scores everyone). This was the confirmed, measured root cause of "typing a player name triggers expensive scoring work."
  - **E2 (Realtime), E3 (countdown accuracy reconciliation), E4 (pick/autopick race UI handling), E6 (reconnection)** — **NOT STARTED.** E5 (search request races) was already fixed as part of Phase D (the stale-response guard above covers it).
  - No before/after latency measurements have been taken yet for the E1 fix or anything else — see section 9 for what Codex should measure.
- **Phase F — DONE** (commit `c820023`):
  - Confirmed empirically (direct production query): only the 5 domestic Big Five competition codes ever have any players; all 23 other codes (including UCL/UEL, which have zero players too) always returned zero results when selected — `players.competition_id` is never set for international rows.
  - `getCompetitionFilters()` (`src/data-access/players.ts`) now only returns competitions with ≥1 matching player (determined dynamically, not a hardcoded list), and the dropdown renders the competition's real `name` instead of its raw `code`. No competition/historical data was deleted or hidden elsewhere — only this one filter's offered options changed.
  - The deeper Phase F question ("model club-competition vs. international-eligibility vs. bookkeeping as different concepts") was answered in the comment/reasoning but not built as new infrastructure — out of scope for the minimal, evidence-backed fix actually needed. No new UI for browsing international players was added (not asked for).

## 3. Remaining phases — resume here

**Phase E, continued (E2, E3, E4, E6 — not started):**
- **E2 Realtime**: no `postgres_changes`/Realtime subscription exists anywhere in the app (confirmed by repo-wide grep in Pass 1 — re-verify this is still true before building). The draft page currently polls every 5s (`src/components/draft/draft-page-client.tsx`'s `poll()` function) and calls `router.refresh()` after every pick. The brief wants Realtime as an ENHANCEMENT (faster turn/pick/timer/autopick updates) with polling kept as the fallback — the server/DB stays authoritative either way. Suggested scope: subscribe to `postgres_changes` on `draft_picks` (INSERT) and `drafts` (UPDATE) for the current draft id, and on receiving an event, just trigger the SAME poll function early (don't rebuild the reconciliation logic — `currentDraftUpdate`/`draft-snapshot.ts` already exists and is tested) rather than inventing a second state-merge path. Needs a migration to add `draft_picks`/`drafts` to the `supabase_realtime` publication if not already present — check `select * from pg_publication_tables where pubname = 'supabase_realtime'` read-only first.
- **E3 countdown accuracy**: `draft-workspace.tsx`'s countdown is client-clock-based against a server-stored deadline (`current_pick_started_at` + `pickTimerSeconds`) — this part is already correct per Pass 1. What's missing: explicit clock-skew compensation (compare the server's `now()` from a response against the client's `Date.now()` at receipt and store an offset) and *not* treating an expired-looking client timer as proof the server has autopicked (the brief's own warning) — check whether `resolveExpiredPickAction` is already safe here (it re-checks the server deadline itself, so it likely already is) before adding anything.
- **E4 pick/autopick races**: Pass 1 found the DB layer already handles this correctly (row-locked, no double-ownership possible) but a losing manual click surfaces as a raw `NOT_YOUR_TURN` error with no automatic retry/explanation. Brief says "never blindly retry the same selection against the next pick" — so the fix is better UX/messaging on that specific error, not a retry loop.
- **E6 reconnection**: no work done. Need to verify a full page reload mid-draft correctly reconstructs state from the server (it likely mostly does already, since the page is server-rendered + polls) — this is more of a verification task than a build task; document what's already correct vs. what needs fixing.
- Take real before/after latency measurements for whatever gets changed (brief explicitly warns against unmeasured performance claims) — there is no load-testing harness in this repo; a simple timed script against a local dev server, or `console.time` instrumentation removed before commit, would satisfy this.

**Phase G (five-manager integration simulation) — NOT STARTED.** Brief requires an ISOLATED test environment, never the production league. This repo already has a simulation harness (`src/lib/fantasy-engine/simulate.ts`, CLI via `npm run fantasy:simulate`) and a PGlite pattern (see `src/lib/position-override-db.test.ts`, `src/lib/player-acquisition-db.test.ts` for the exact harness — spins up embedded real Postgres, runs every real migration, no live Supabase needed). The most reliable approach is extending that PGlite pattern to drive a full 80-pick draft with concurrent/latency-simulated picks rather than inventing a new environment. Required coverage per the brief: normal selections, autopicks, last-second selections, concurrent submissions, search during others' picks, repeated refreshes, disconnection/reconnection, position constraints, duplicate-ownership prevention, draft completion, automatic Starting XI initialization (now fixed in Phase C — this is the regression test that should have caught the original bug), partial lineup provisioning + repeated provisioning attempts.

**Phase H (validation and release) — NOT STARTED.**
- Run full `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` after Phase E/G work lands (all currently green as of this update — re-run, don't assume still green after further changes).
- **Deploy**: `git push origin main` (nothing has been pushed yet this entire session — verify with `git log origin/main..HEAD` before pushing, there should be ~8 local commits ahead as of this update). This is the actual Vercel-triggering action; no Vercel CLI session exists in this environment to independently verify the deploy afterward — curl `https://www.elevenfantasy.com/` and check for a build-id/asset hash change, or ask the product owner to confirm via the Vercel dashboard.
- Once the app deploy is confirmed live, consider (separately, forward-only migration) narrowing `update_team_lineup` back to 4-3-3-only, closing the Phase B dual-shape compatibility window — not urgent, the dual-shape acceptance is harmless to leave in place indefinitely if in doubt.
- Re-verify every "Production invariants" bullet in the original brief's section 10 before declaring done.

## 4. Current Git state

- Branch: `main`. Local HEAD as of this update: `dd649d4` ("Scope draft-board score aggregation to the actual search results").
- `origin/main` is still at the PRE-SESSION commit (`308f9029`) — **nothing has been pushed yet**. Run `git log origin/main..HEAD --oneline` to see the full list (should be 8 commits: `3a0ce93`, `2e93483`, `d6221d0`, `87d2b99`, `f74197d`, `c820023`, `dd649d4`, plus this handoff-doc-only commit if one follows).
- Working tree is clean (confirmed via `git status --short` immediately before this handoff was written).

## 5. Production state

- Supabase project ref: `oknhqdiinaxofrzxphxf`. All migrations through `20261015000200_formation_dual_shape_transition.sql` are applied (re-verify with `npx supabase migration list`).
- All 4 position overrides are live in `player_position_overrides`.
- "5 Men of Class" league: all 5 teams have correct 16/11/5 rosters with valid 4-3-3 lineups (verified, see Phase C above).
- Vercel: **app code has NOT been deployed** — production is still running whatever commit was live before this session (last known fact, unconfirmed since: a prior rollback to `2a4c5a7` after a live-draft incident). No Vercel CLI session available in this environment; the next agent likely won't have one either unless the product owner provides one.

## 6. Database changes

Applied (all confirmed in production): `20261014000000_position_classification_overrides.sql`, `20261015000000_canonical_position_resolution.sql`, `20261015000100_formation_4_3_3_and_canonical_position_lineup.sql`, `20261015000200_formation_dual_shape_transition.sql`. Applied data: `scripts/one-off/position-overrides-2026-10-09.sql` (already run — do NOT re-run expecting a different effect; it's idempotent/guarded but there's nothing further for it to do). No further migrations needed unless Phase E2 requires enabling Realtime on `draft_picks`/`drafts` (check first, don't assume).

## 7. Test results (as of this update, full run)

`npm test`: 769 passing, 0 failing, 104 skipped (integration tests requiring live Supabase credentials — do NOT run `npm run test:integration`, it writes to the real production project via `.env.local`). `npx tsc --noEmit`: clean. `npm run lint`: clean except one pre-existing, unrelated warning (`player-avatar.tsx`'s `<img>` usage). `npm run build`: last run clean during Phase A; re-run before deploying.

## 8. Known issues

**Fixed this pass**: Starting XI initialization (Phase C), the 4-3-3/position-override activation (Phase B), the draft-board full-catalog score aggregation (Phase E1), the competition-filter dead-end options (Phase F), the search stale-response race (Phase D/E5).

**Confirmed but NOT fixed / not applicable to fix**:
- PLAYER_NOT_FOUND's exact historical trigger (Phase D) — diagnostics added, root cause not reproducible from available evidence.
- No Realtime anywhere (Phase E2) — polling (5s) + `router.refresh()` is the only sync mechanism today.
- Client-clock countdown has no explicit skew compensation (Phase E3), though the server-side deadline check is already authoritative.
- A losing manual pick in a pick/autopick race surfaces as a raw `NOT_YOUR_TURN` error, not a friendly reconciliation message (Phase E4).
- No promotion/relegation mechanism exists for club-competition membership (Pass 1 finding, West Ham specifically confirmed NOT currently affected, but the structural gap is real and out of scope for this pass).
- Historical matchup display (`src/data-access/matchups.ts`) deliberately NOT wired to `canonical_position` (Pass 3 decision) — it already derives formation from a live `players.position` join, a pre-existing characteristic, not a new risk, but also not improved.

## 9. Next actions for Codex (be specific, don't re-investigate what's already answered above)

1. Read this entire file first. Then re-verify section 4 and 5 (git/production state) against the real repo and Supabase project — they are accurate as of 2026-10-09T17:05Z but may have drifted.
2. Do NOT re-run Phase B/C production mutations (migrations, the override script, the live-league repair) — they are done and verified. Re-running the override script is harmless (idempotent) but pointless; re-running any form of the OLD lineup-repair logic is unnecessary since Phase C's fix is already live and already fixed the league.
3. Start at Phase E2 (Realtime) per the scoping notes in section 3, or re-order to Phase G (simulation) first if that feels lower-risk to build before touching Realtime — both are legitimate next steps and the brief doesn't strictly require E-before-G, only that both happen before Phase H.
4. Take real before/after measurements for anything performance-related; do not claim improvement without a number.
5. Phase H's deploy step (`git push origin main`) is the first action in this entire pass that will actually change what production serves to real users. Do it only after Phase E/G work is merged, tested, and typechecked — and re-read this file's section 10 safety constraints first.
6. Update this document again before stopping, following the same structure, replacing (not appending to) sections 1–3 and 7–9 with the new current state.

## 10. Safety constraints (do not violate, regardless of which agent is executing)

- Never reset, delete, or restart the "5 Men of Class" draft/league/teams, or any other league.
- Never reassign player ownership or drop/sign a player on a manager's behalf.
- Never rewrite a settled matchup result or change V4 scoring weights.
- Never run `npm run test:integration` or any script that writes to the real production Supabase project except a narrowly-scoped, pre-verified repair identical in spirit to Phases B/C above (read current state first, compute expected effect, verify after).
- Never apply a migration that narrows `update_team_lineup` back to 4-3-3-only until the Vercel app deploy carrying the matching `constants.ts` change is confirmed live.
- Never push to `main` / trigger a deploy with failing tests, a dirty typecheck, or an unreviewed diff.
- Never build Phase G's simulation against the real "5 Men of Class" league or any other real league — isolated environment only (PGlite or equivalent).
