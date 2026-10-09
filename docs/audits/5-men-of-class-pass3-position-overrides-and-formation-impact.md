# Pass 3 — Position Overrides & Formation Impact Report

5 Men of Class. Prepared, not activated. All claims below are backed by either a passing automated test (PGlite, real migrations, real RPCs) or a script run against the preserved draft snapshot — not estimated.

## 1. The four overrides, by verified UUID

| Player | UUID (from draft snapshot) | Team | Raw provider position | Approved override |
|---|---|---|---|---|
| Marc Guéhi | `28dd6e50-16dd-4328-a734-a443e8a50902` | Pressure FC | MID | **DEF** |
| Pedro Porro | `33eab8f1-b033-48f1-827f-612b7573e9ac` | 75Hard | MID | **DEF** |
| Morgan Rogers | `7bff7448-34a8-45d5-afbd-d1586a0c86ba` | Expected Toulouse FC | FWD | **MID** |
| A. Amaimouni | `75b65172-5451-4341-94e5-58086e5a5792` | 2 Goals 1 Cup | MID | **FWD** |

Each UUID was re-verified live against production's `players` table this pass (read-only) and matches the preserved snapshot exactly — no drift, no name-matching used anywhere.

## 2. Mechanism — `players.canonical_position`

A new trigger-maintained column resolves, per player: **approved override** (if one exists in `player_position_overrides`) **else** the provider's raw `position`. Two triggers keep it correct automatically with zero application-code awareness required:

- `players` BEFORE INSERT/UPDATE — recomputes `canonical_position` on every write, including a future API-Football resync. **Proven by test**: inserting an override, then simulating a resync that changes the raw `position` to something else entirely, leaves `canonical_position` unchanged (requirement 1 — survives synchronization).
- `player_position_overrides` AFTER INSERT/UPDATE/DELETE — an approved override takes effect immediately; deleting one correctly reverts the player to their current raw position.

`players.position` itself is **never** written by any part of this (requirement 3 — original provider positions and override history are both preserved; the override table independently stores `provider_position_at_override`, `reason`, `evidence_source`, `confidence`, who approved it, and when).

## 3. Applied globally — exact surfaces wired, and what was deliberately excluded

**Wired to `canonical_position`** (gameplay decisions and display):
- Draft: `_perform_draft_pick` and `resolve_expired_pick` (autopick) — roster-limit counting and autopick-candidate selection, for every future draft, not just this league.
- Free agency / trades: `sign_player`, `accept_trade` — position-limit counting.
- Lineup: `update_team_lineup` — the formation-shape check, the "client can't claim a fake position" check, and the written `slot` label.
- Display/data layer: Players page (list + the position filter), Draft board history, Team page roster, trade-asset display, free-agent recommendations, and `createRoundLineupSlots` (the function that auto-picks a team's first-ever Starting XI).

**Deliberately NOT wired** (and why):
- `backfill.ts`, `replay.ts`, `calibration.ts` (scoring) — requirement 4. Settled fixtures must never be revalued by a later position correction. Guarded by a dedicated regression test that fails if anyone ever adds `canonical_position` to these three files.
- `matchups.ts` (historical matchup display) — this function already derives its on-screen formation from a *live* join to `players.position` (a pre-existing characteristic, not something this pass introduced), so wiring it to `canonical_position` would have the same retroactive-look risk for a completed matchup. Left untouched rather than extending that existing behavior further. Net effect: a settled matchup's displayed formation reflects whatever `players.position` was at settlement-adjacent sync time, same as before Pass 3 — not perfectly historically frozen, but no new regression. Flagging this as a pre-existing gap worth a dedicated future fix (freezing position onto `lineup_slots` at write time), separate from this pass.
- `simulate.ts` — the dev/test simulation harness, not a real-manager gameplay path.

## 4. Tests — all real, all passing

- **`src/lib/position-override-db.test.ts`** (6 tests, embedded real Postgres via PGlite, running every actual migration): default resolution, override precedence, resync survival, reversion on delete, `sign_player`'s roster-limit count respecting the override, and `update_team_lineup`'s 4-3-3 shape check + slot-label both respecting the override (with a control case proving the *same* 11 players fail the shape check without it).
- **`src/lib/scoring/position-override-isolation.test.ts`** (3 tests): guards that scoring code never references `canonical_position`.
- **`src/domain/fantasy/position-classification.test.ts`** (10, from Pass 2) and **`formation-feasibility.test.ts`** (5, 1 new this pass) — precedence/confidence logic and the real squad-feasibility numbers below.
- Full existing suite: **755 passing, 0 failing** (one pre-existing test fixture needed a `canonical_position` field added to stay in sync — fixed, not worked around). `tsc --noEmit` and `eslint` both clean.

## 5. Squad impact — recomputed from the preserved snapshot + the 4 overrides

| Team | GK | DEF | MID | FWD | 4-3-3 feasible |
|---|---|---|---|---|---|
| Phantom FC | 2 | 4 | 6 | 4 | yes (unaffected — owns none of the 4 players) |
| Pressure FC | 2 | 5 | 5 | 4 | yes |
| 75Hard | 2 | 6 | 5 | 3 | yes |
| Expected Toulouse FC | 2 | 5 | 6 | 3 | yes |
| **2 Goals 1 Cup** | 2 | 6 | 5 | **3** | **yes — was the one infeasible team pre-correction (2 FWD)** |

**All five teams are now 4-3-3 feasible.** Amaimouni's correction (MID→FWD) gives 2 Goals 1 Cup its third forward, resolving the gap flagged in Pass 2 — with zero roster transaction, zero dropped player, zero reassignment.

## 6. Required migrations (prepared, none applied)

1. `supabase/migrations/20261014000000_position_classification_overrides.sql` (Pass 2) — the override table.
2. `supabase/migrations/20261015000000_canonical_position_resolution.sql` — the `canonical_position` column, both triggers, and `_perform_draft_pick` / `resolve_expired_pick` / `sign_player` / `accept_trade` re-created with the one mechanical substitution each (`p.position` → `p.canonical_position`), verified byte-for-byte against the live source migrations.
3. `supabase/migrations/20261015000100_formation_4_3_3_and_canonical_position_lineup.sql` — `update_team_lineup`, combining the 4-3-3 shape change with the same substitution. Supersedes Pass 2's standalone 4-3-3 draft (removed) now that it has a real dependency on migration #2 and must run after it.
4. `scripts/one-off/position-overrides-2026-10-09.sql` — the actual 4 `INSERT`s, guarded by a live drift check (aborts if any of the 4 players' raw position has changed since this was written), idempotent (`ON CONFLICT ... DO UPDATE`). Dry-run verified against the real migrations in PGlite — correct and idempotent.

**Required release order, as one coordinated deployment** (per the brief's "activate together" instruction): migrations 1 → 2 → 3, then the companion `src/domain/fantasy/constants.ts` `FORMATION_RULES` edit (MID 4→3, FWD 2→3 — still not applied, exact diff documented in the Pass 2 report) deployed in the *same* release, then the one-off script. Applying the overrides before the 4-3-3 lineup migration would leave 2 Goals 1 Cup formation-feasible but still validated against the old 4-4-2 shape; applying 4-3-3 before the overrides would leave it genuinely short a forward. Neither partial state should go live.

## 7. Production mutation plan

**Nothing has been applied, inserted, or deployed.** When you approve:
1. Apply migrations 1–3 above (`supabase db push` or equivalent).
2. Deploy the `constants.ts` formation change in the same release.
3. Run `scripts/one-off/position-overrides-2026-10-09.sql` (the drift guard will abort it safely if anything changed since this was written).
4. Run the verification query at the bottom of that script to confirm all 4 `canonical_position` values before trusting the lineup UI.

## 8. Preserved, unchanged

All 80 original draft picks, draft order, round/pick numbers, timestamps. All roster entries and ownership. Every completed matchup. `players.position` (raw) for all 4 players, and for every other player in the database. No player dropped, added, traded, or reassigned.

## 9. Working tree

11 new files, 8 modified (all data-access/lineup wiring + one test fixture + the generated-types file), nothing committed, nothing pushed, nothing applied to Supabase.

---

**Stopping here per the brief.** Waiting for your go-ahead before any migration is applied or anything is deployed.
