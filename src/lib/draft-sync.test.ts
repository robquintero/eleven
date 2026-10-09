import { test } from "node:test";
import assert from "node:assert/strict";
import { createDraftSynchronizer, draftTimeRemaining, sampleDraftClock } from "./draft-sync.ts";
import { currentDraftUpdate } from "./draft-snapshot.ts";
import type { DraftState } from "../data-access/drafts.ts";
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
test("countdown uses database time and monotonic elapsed time despite ±10 minute device skew", () => {
  const server = "2026-10-09T17:00:00Z", deadline = "2026-10-09T17:05:00Z";
  for (const deviceSkew of [-600000,0,600000]) {
    const sample = sampleDraftClock(server, 100, 300);
    assert.equal(draftTimeRemaining(deadline,sample,300),299900);
    assert.equal(draftTimeRemaining(deadline,sample,1300),298900);
    assert.equal(draftTimeRemaining(deadline,sample,400000),0);
    assert.equal(draftTimeRemaining(deadline,sample,300),299900, `device Date.now skew ${deviceSkew} is never consulted`);
  }
});
test("duplicate events coalesce; reconnect hints during a read cause a follow-up, never overlapping reads", async () => {
  let calls=0,active=0,max=0; const releases: Array<()=>void> = [];
  const sync=createDraftSynchronizer(async()=>{calls++;active++;max=Math.max(max,active);await new Promise<void>(r=>releases.push(r));active--;},()=>assert.fail("unexpected failure"),1);
  for(let i=0;i<20;i++)sync.signal(); await pause(5);assert.equal(calls,1);
  sync.signal();sync.signal();await pause(5);releases.shift()!();await pause(5);assert.equal(calls,2);
  releases.shift()!();await pause(5);assert.equal(max,1);sync.dispose();
});
test("polling remains usable after a failed Realtime-triggered read; disposed subscriptions cannot publish more reads", async () => {
  let calls=0,errors=0;const sync=createDraftSynchronizer(async()=>{if(++calls===1)throw Error('offline');},()=>errors++,1);
  await sync.refresh();assert.equal(errors,1);await sync.refresh();assert.equal(calls,2);
  sync.signal();sync.dispose();await pause(5);await sync.refresh();assert.equal(calls,2);
});
test("snapshot reconciliation rejects reordered/missed-event responses and another draft", () => {
  const state={draftId:'draft',status:'in_progress',picks:[{playerId:'p'}]} as DraftState;
  assert.equal(currentDraftUpdate(state,{draft:{...state,picks:[]},ownership:{}}),null);
  assert.equal(currentDraftUpdate(state,{draft:{...state,draftId:'other'},ownership:{}}),null);
  assert.equal(currentDraftUpdate({...state,status:'completed'},{draft:state,ownership:{}}),null);
});
