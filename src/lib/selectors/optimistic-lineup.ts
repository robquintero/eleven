import type { Player, PlayerPosition, Squad } from "@/lib/types/fantasy";
import { isPlayerLocked } from "../team-fixture.ts";
import { findStarterSlotForPlayer, swapPlayers } from "./lineup.ts";
import { assignToSlots, formationSlots } from "./pitch-layout.ts";

export interface LineupSwap { starterOut: string; benchIn: string }

/** Presentation only. The unchanged server action/RPC still validates all
 * ownership, round, formation and lock rules against the database. */
export function optimisticLineupSwap(squad: Squad, { starterOut, benchIn }: LineupSwap): Squad {
  const slot = findStarterSlotForPlayer(squad, starterOut);
  const incoming = squad.bench.find(player => player.id === benchIn);
  const ids = [...squad.starters.map(entry => entry.player.id), ...squad.bench.map(player => player.id)];
  if (!slot || !incoming || new Set(ids).size !== ids.length || slot.locked ||
      isPlayerLocked(slot.player) || isPlayerLocked(incoming) || slot.position !== incoming.position) return squad;
  return swapPlayers(squad, slot.id, benchIn);
}

/** Preserve session row placement, never stale player objects/membership.
 * New canonical players not in the preferred ordering are appended. */
export function reconcileSquadOrder(canonical: Squad, preferred: Squad, placement?: LineupSwap | null): Squad {
  function order<T>(items: T[], previous: T[], id: (item: T) => string, alias?: { from: string; to: string }): T[] {
    const ranks = new Map(previous.map((item, index) => [id(item), index]));
    // Flight may commit before the action's awaited result. Give BOTH
    // sides of the latest exchange the same presentation rank across either
    // commit order, without adding/removing any canonical player.
    const rank = alias ? ranks.get(alias.from) ?? ranks.get(alias.to) : undefined;
    if (alias && rank !== undefined) { ranks.set(alias.from, rank); ranks.set(alias.to, rank); }
    return [...items].sort((a, b) => (ranks.get(id(a)) ?? previous.length) - (ranks.get(id(b)) ?? previous.length));
  }
  return { ...canonical,
    starters: order(canonical.starters, preferred.starters, slot => slot.player.id, placement ? { from: placement.starterOut, to: placement.benchIn } : undefined),
    bench: order(canonical.bench, preferred.bench, player => player.id, placement ? { from: placement.benchIn, to: placement.starterOut } : undefined),
  };
}

/** Empty slots retain their existing queued-batch/Done persistence model. */
export function queueLineupFill(squad: Squad, assignments: Map<string, Player>, slotId: string, position: PlayerPosition, player: Player) {
  const slots = formationSlots();
  if (!slots.some(slot => slot.id === slotId && slot.position === position) ||
      assignToSlots(squad.starters, slots).has(slotId) || assignments.has(slotId) ||
      player.position !== position || isPlayerLocked(player) || !squad.bench.some(entry => entry.id === player.id) ||
      [...assignments.values()].some(entry => entry.id === player.id)) return assignments;
  return new Map(assignments).set(slotId, player);
}

/** Synchronous protection before React has rendered its pending state. */
export function createLineupMutationGuard() {
  let pending = false;
  return {
    begin() { if (pending) return false; pending = true; return true; },
    finish() { pending = false; },
    isPending() { return pending; },
  };
}
