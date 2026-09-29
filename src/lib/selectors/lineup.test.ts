import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findBenchPlayerAtPosition,
  findStarterSlotAtPosition,
  findStarterSlotForPlayer,
  swapPlayers,
} from "./lineup.ts";
import type { Club, Player, Squad } from "@/lib/types/fantasy";

const club: Club = {
  id: "clb_test",
  name: "Test Town",
  shortName: "TST",
  league: "premier-league",
  crestColor: "#000000",
};

function makePlayer(id: string, position: Player["position"]): Player {
  return {
    id,
    externalId: `ext_${id}`,
    name: `Player ${id}`,
    club,
    position,
    fantasyPoints: 0,
  };
}

function makeSquad(): Squad {
  return {
    formation: "4-3-3",
    starters: [
      { id: "slot_gk", position: "GK", x: 50, y: 10, player: makePlayer("starter-gk", "GK") },
      { id: "slot_def_1", position: "DEF", x: 20, y: 30, player: makePlayer("starter-def", "DEF") },
      { id: "slot_mid_1", position: "MID", x: 50, y: 55, player: makePlayer("starter-mid", "MID") },
    ],
    bench: [makePlayer("bench-def", "DEF"), makePlayer("bench-mid", "MID")],
  };
}

test("swapPlayers exchanges a starter and a bench player", () => {
  const squad = makeSquad();
  const next = swapPlayers(squad, "slot_def_1", "bench-def");

  const defSlot = next.starters.find((s) => s.id === "slot_def_1");
  assert.equal(defSlot?.player.id, "bench-def");
  assert.ok(next.bench.some((p) => p.id === "starter-def"));
  assert.equal(next.bench.some((p) => p.id === "bench-def"), false);
});

test("swapPlayers preserves slot metadata (id/position/x/y), only the player changes", () => {
  const squad = makeSquad();
  const next = swapPlayers(squad, "slot_mid_1", "bench-mid");
  const midSlot = next.starters.find((s) => s.id === "slot_mid_1");

  assert.equal(midSlot?.position, "MID");
  assert.equal(midSlot?.x, 50);
  assert.equal(midSlot?.y, 55);
});

test("swapPlayers returns the same squad reference when the slot id is unknown", () => {
  const squad = makeSquad();
  const next = swapPlayers(squad, "nonexistent-slot", "bench-def");
  assert.equal(next, squad);
});

test("swapPlayers returns the same squad reference when the bench player id is unknown", () => {
  const squad = makeSquad();
  const next = swapPlayers(squad, "slot_def_1", "nonexistent-bench-player");
  assert.equal(next, squad);
});

test("swapPlayers does not mutate the original squad", () => {
  const squad = makeSquad();
  swapPlayers(squad, "slot_def_1", "bench-def");
  assert.equal(squad.starters.find((s) => s.id === "slot_def_1")?.player.id, "starter-def");
  assert.ok(squad.bench.some((p) => p.id === "bench-def"));
});

test("findStarterSlotForPlayer locates the slot holding a given player", () => {
  const squad = makeSquad();
  assert.equal(findStarterSlotForPlayer(squad, "starter-mid")?.id, "slot_mid_1");
  assert.equal(findStarterSlotForPlayer(squad, "bench-mid"), undefined);
});

test("findBenchPlayerAtPosition finds the first bench player at a position", () => {
  const squad = makeSquad();
  assert.equal(findBenchPlayerAtPosition(squad, "DEF")?.id, "bench-def");
  assert.equal(findBenchPlayerAtPosition(squad, "FWD"), undefined);
});

test("findStarterSlotAtPosition finds the first starter slot at a position", () => {
  const squad = makeSquad();
  assert.equal(findStarterSlotAtPosition(squad, "GK")?.id, "slot_gk");
  assert.equal(findStarterSlotAtPosition(squad, "FWD"), undefined);
});
