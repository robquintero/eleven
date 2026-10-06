import { test } from "node:test";
import assert from "node:assert/strict";
import { finalizeRoundIfReady } from "./rounds.ts";
import { result, testClient } from "../performance/test-client.ts";
const round={ends_at:"2026-10-06T06:00:00Z",status:"in_progress"};
const ready={ready:true,version:"ELEVEN_STANDARD_V4",evidence_digest:"verified",performances:[]};
test("normal lifecycle stays pending for missing evidence, then publishes through the atomic RPC when it arrives",async()=>{
  let available=false;
  const {client,calls}=testClient(q=>{
    if(q.table==="fantasy_rounds")return result(round);
    if(q.table==="get_round_settlement_readiness")return result(available?ready:{ready:false,blockers:[{code:"starter_score_missing"}]});
    if(q.table==="settle_fantasy_round"){assert.deepEqual(q.payload,{p_round_id:"old",p_evidence_digest:"verified"});return result({finalized:true});}
    throw new Error(q.table);
  });
  const clock=new Date("2026-10-06T07:00Z");
  assert.deepEqual(await finalizeRoundIfReady(client,"old",clock),{finalized:false});assert.ok(!calls.some(q=>q.table==="settle_fantasy_round"));
  available=true;assert.deepEqual(await finalizeRoundIfReady(client,"old",clock),{finalized:true,roundId:"old"});
  assert.ok(calls.every(q=>q.operation==="select" || q.operation==="rpc"));
});
test("changed evidence remains pending; unexpected RPC failures propagate rather than fabricate a result",async()=>{
  for(const fail of [false,true]){
    const {client}=testClient(q=>q.table==="fantasy_rounds"?result(round):q.table==="get_round_settlement_readiness"?result(ready):q.table==="settle_fantasy_round"?fail?{data:null,error:{message:"DB_FAILURE"}}:result({finalized:false,blockers:[{code:"evidence_changed"}]}):(()=>{throw new Error(q.table);})());
    if(fail)await assert.rejects(finalizeRoundIfReady(client,"old",new Date("2026-10-06T07:00Z")),/DB_FAILURE/);
    else assert.deepEqual(await finalizeRoundIfReady(client,"old",new Date("2026-10-06T07:00Z")),{finalized:false});
  }
});
