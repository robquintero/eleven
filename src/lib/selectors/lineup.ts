/**
 * Pure lineup-editing logic for the Team screen's `Squad` view-model,
 * extracted out of the page component so it isn't page-local domain logic
 * (see PASS 5 principle: "domain logic must not live inside page
 * components"). Mirrors the eventual backend operation — a `RosterEntry`/
 * `LineupSlot` update within one `FantasyRound` — closely enough to
 * translate directly; see docs/data-flow.md "Lineup update."
 */

import type { LineupSlot, Player, PlayerPosition, Squad } from "@/lib/types/fantasy";

/**
 * Swaps the starter in `slotId` with the bench player `benchPlayerId`,
 * leaving both arrays' length/order otherwise untouched. Returns `squad`
 * unchanged (same reference) if either id isn't found, so callers can use
 * the result directly as a `setState` updater without an extra no-op check.
 */
export function swapPlayers(squad: Squad, slotId: string, benchPlayerId: string): Squad {
  const slotIndex = squad.starters.findIndex((s) => s.id === slotId);
  const benchIndex = squad.bench.findIndex((p) => p.id === benchPlayerId);
  if (slotIndex === -1 || benchIndex === -1) return squad;

  const slot = squad.starters[slotIndex];
  const benchPlayer = squad.bench[benchIndex];

  const nextStarters = [...squad.starters];
  nextStarters[slotIndex] = { ...slot, player: benchPlayer };

  const nextBench = [...squad.bench];
  nextBench[benchIndex] = slot.player;

  return { ...squad, starters: nextStarters, bench: nextBench };
}

/** Finds the starter slot currently holding `playerId`, if any. */
export function findStarterSlotForPlayer(
  squad: Squad,
  playerId: string
): LineupSlot | undefined {
  return squad.starters.find((s) => s.player.id === playerId);
}

/** Finds the first bench player at `position`, if any — powers one-tap "move to bench." */
export function findBenchPlayerAtPosition(
  squad: Squad,
  position: PlayerPosition
): Player | undefined {
  return squad.bench.find((p) => p.position === position);
}

/** Finds the first starter slot at `position`, if any — powers one-tap "move to starting XI." */
export function findStarterSlotAtPosition(
  squad: Squad,
  position: PlayerPosition
): LineupSlot | undefined {
  return squad.starters.find((s) => s.position === position);
}
