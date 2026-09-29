import { test } from "node:test";
import assert from "node:assert/strict";
import { planReconciliation } from "./reconcile.ts";

interface FakePlayer {
  externalId: string;
  clubExternalId: string;
  name: string;
}

test("planReconciliation puts every item with no existing mapping in toCreate", () => {
  const items: FakePlayer[] = [
    { externalId: "1", clubExternalId: "50", name: "A" },
    { externalId: "2", clubExternalId: "50", name: "B" },
  ];
  const plan = planReconciliation(items, new Map());

  assert.equal(plan.toCreate.length, 2);
  assert.equal(plan.toUpdate.length, 0);
});

test("planReconciliation routes items with an existing mapping to toUpdate, carrying the resolved internal id", () => {
  const items: FakePlayer[] = [{ externalId: "1", clubExternalId: "50", name: "A" }];
  const existing = new Map([["1", "eleven-uuid-abc"]]);
  const plan = planReconciliation(items, existing);

  assert.equal(plan.toCreate.length, 0);
  assert.equal(plan.toUpdate.length, 1);
  assert.equal(plan.toUpdate[0].internalId, "eleven-uuid-abc");
  assert.equal(plan.toUpdate[0].item.externalId, "1");
});

test("planReconciliation handles a mixed batch — running the same sync twice never re-creates an already-mapped item", () => {
  const items: FakePlayer[] = [
    { externalId: "1", clubExternalId: "50", name: "A" },
    { externalId: "2", clubExternalId: "50", name: "B" },
    { externalId: "3", clubExternalId: "42", name: "C" },
  ];
  const existing = new Map([["1", "uuid-1"]]);

  const firstPass = planReconciliation(items, existing);
  assert.equal(firstPass.toCreate.length, 2);
  assert.equal(firstPass.toUpdate.length, 1);

  // Simulate: items 2 and 3 just got created and mapped by the first pass.
  const afterFirstPass = new Map([...existing, ["2", "uuid-2"], ["3", "uuid-3"]]);
  const secondPass = planReconciliation(items, afterFirstPass);
  assert.equal(secondPass.toCreate.length, 0, "nothing left to create — no duplicates");
  assert.equal(secondPass.toUpdate.length, 3);
});

test("planReconciliation: a player identity survives a club change — same externalId resolves to the same internalId with the new club in the update payload", () => {
  const transferred: FakePlayer = { externalId: "1100", clubExternalId: "42", name: "Player X" };
  const existing = new Map([["1100", "player-uuid-stable"]]);

  const plan = planReconciliation([transferred], existing);

  assert.equal(plan.toCreate.length, 0, "must not create a second player for the same provider id");
  assert.equal(plan.toUpdate[0].internalId, "player-uuid-stable");
  assert.equal(plan.toUpdate[0].item.clubExternalId, "42", "new club flows into the update, not a new identity");
});

test("planReconciliation is empty-input safe", () => {
  const plan = planReconciliation([], new Map());
  assert.deepEqual(plan.toCreate, []);
  assert.deepEqual(plan.toUpdate, []);
});
