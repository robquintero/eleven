import { test } from "node:test";
import assert from "node:assert/strict";
import { createLineupMutationGuard, optimisticLineupSwap, queueLineupFill, reconcileSquadOrder } from "./optimistic-lineup.ts";
import type { Player, Squad } from "@/lib/types/fantasy";

function player(id: string, position: Player["position"] = "DEF"): Player {
  return { id, externalId: id, name: id, position, fantasyPoints: 0,
    club: { id: "club", name: "Club", shortName: "CLB", league: "premier-league", crestColor: "#000" } };
}
function squad(): Squad {
  return { formation: "4-4-2", starters: ["a", "b"].map(id => ({ id: `entry-${id}`, player: player(id), position: "DEF", x: 20, y: 35, locked: false })),
    bench: [player("c"), player("d"), player("e", "MID")] };
}

test("occupied substitution exchanges both players without duplicates or changing formation/other slots", () => {
  const before = squad();
  const after = optimisticLineupSwap(before, { starterOut: "a", benchIn: "c" });
  assert.deepEqual(after.starters.map(slot => slot.player.id), ["c", "b"]);
  assert.deepEqual(after.bench.map(player => player.id), ["a", "d", "e"]);
  assert.equal(after.formation, before.formation);
  assert.equal(after.starters[1], before.starters[1]);
  const ids = [...after.starters.map(slot => slot.player.id), ...after.bench.map(player => player.id)];
  assert.equal(new Set(ids).size, ids.length);
  // Both click directions normalize to the same starter-out / bench-in operation.
  assert.deepEqual(optimisticLineupSwap(after, { starterOut: "c", benchIn: "a" }), before);
});

test("missing/stale membership, duplicate membership and wrong positions cannot create a partial optimistic swap", () => {
  const before = squad();
  for (const change of [{ starterOut: "missing", benchIn: "c" }, { starterOut: "a", benchIn: "missing" }, { starterOut: "a", benchIn: "e" }]) {
    assert.equal(optimisticLineupSwap(before, change), before);
  }
  const duplicate = { ...before, bench: [...before.bench, before.starters[0].player] };
  assert.equal(optimisticLineupSwap(duplicate, { starterOut: "a", benchIn: "c" }), duplicate);
});

test("slot locks and fixture locks on either side remain non-movable", () => {
  for (const state of ["locked", "live", "final"] as const) {
    const before = squad();
    before.bench[0].fixture = { state } as Player["fixture"];
    assert.equal(optimisticLineupSwap(before, { starterOut: "a", benchIn: "c" }), before);
    before.bench[0].fixture = undefined;
    before.starters[0].player.fixture = { state } as Player["fixture"];
    assert.equal(optimisticLineupSwap(before, { starterOut: "a", benchIn: "c" }), before);
  }
  const before = squad(); before.starters[0].locked = true;
  assert.equal(optimisticLineupSwap(before, { starterOut: "a", benchIn: "c" }), before);
});

test("optimistic overlay never mutates the rollback snapshot, including rejected PLAYER_LOCKED/formation/network outcomes", () => {
  const before = squad(); const snapshot = structuredClone(before);
  optimisticLineupSwap(before, { starterOut: "a", benchIn: "c" });
  assert.deepEqual(before, snapshot);
});

test("canonical confirmation retains placement but uses canonical ids, scores, locks and membership", () => {
  const preferred = optimisticLineupSwap(squad(), { starterOut: "a", benchIn: "c" });
  const canonical = structuredClone(preferred);
  canonical.starters.reverse(); canonical.bench.reverse();
  canonical.starters.find(slot => slot.player.id === "c")!.id = "entry-c";
  canonical.starters.find(slot => slot.player.id === "c")!.player.fantasyPoints = 19;
  canonical.starters.find(slot => slot.player.id === "c")!.locked = true;
  const reconciled = reconcileSquadOrder(canonical, preferred);
  assert.deepEqual(reconciled.starters.map(slot => slot.player.id), ["c", "b"]);
  assert.deepEqual(reconciled.bench.map(player => player.id), ["a", "d", "e"]);
  assert.equal(reconciled.starters[0].id, "entry-c");
  assert.equal(reconciled.starters[0].player.fantasyPoints, 19);
  assert.equal(reconciled.starters[0].locked, true);
  // Another server update can remove/add players; presentation ordering must not restore old membership.
  canonical.bench = [player("new")];
  assert.deepEqual(reconcileSquadOrder(canonical, preferred).bench.map(player => player.id), ["new"]);
});

test("empty fills queue by stable slot without mutating canonical squad or duplicating a queued bench player", () => {
  const before = squad(); const assignments = new Map<string, Player>();
  const queued = queueLineupFill(before, assignments, "DEF-2", "DEF", before.bench[0]);
  assert.equal(queued.get("DEF-2")?.id, "c");
  assert.equal(assignments.size, 0); assert.equal(before.bench[0].id, "c");
  assert.equal(queueLineupFill(before, queued, "DEF-3", "DEF", before.bench[0]), queued);
  assert.equal(queueLineupFill(before, assignments, "DEF-0", "DEF", before.bench[0]), assignments);
  assert.equal(queueLineupFill(before, assignments, "DEF-2", "DEF", before.bench[2]), assignments);
});

test("canonical Flight arriving before the action settles keeps the optimistic row placement", () => {
  const before = squad(); const change = { starterOut: "a", benchIn: "c" };
  const preview = optimisticLineupSwap(before, change);
  const canonical = { ...preview, starters: [...preview.starters].reverse(), bench: [...preview.bench].reverse() };
  assert.deepEqual(reconcileSquadOrder(canonical, before, change).starters.map(slot => slot.player.id), ["c", "b"]);
  assert.deepEqual(reconcileSquadOrder(canonical, before, change).bench.map(player => player.id), ["a", "d", "e"]);
  assert.deepEqual(reconcileSquadOrder(before, before, change), before, "the alias leaves the rollback snapshot untouched");
  assert.deepEqual(reconcileSquadOrder(before, preview, change), before, "action result arriving before Flight also keeps prior placement");
});

test("pending guard blocks overlapping mutations synchronously and allows the next after completion", () => {
  const guard = createLineupMutationGuard();
  assert.equal(guard.begin(), true); assert.equal(guard.isPending(), true);
  assert.equal(guard.begin(), false);
  guard.finish(); assert.equal(guard.isPending(), false); assert.equal(guard.begin(), true);
});
