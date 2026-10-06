import { test } from "node:test";
import assert from "node:assert/strict";
import { currentSeasonV4Plan, type HistoricalFixture } from "./current-season-v4.ts";
const fixture=(overrides:Partial<HistoricalFixture>={}):HistoricalFixture=>({id:"f",code:"ENG",season:2026,kickoffAt:"2026-08-21T19:00:00Z",status:"final",externalId:"100",...overrides});
test("current-season manifest excludes previous seasons, future/unplayed, unsupported competitions and pre-epoch internationals",()=>{
 const plan=currentSeasonV4Plan([fixture(),fixture({season:2025}),fixture({code:"FRIENDLY"}),fixture({id:"future",kickoffAt:"2026-10-10T00:00:00Z"}),fixture({id:"unplayed",status:"scheduled"}),fixture({code:"FIFA_WC",kickoffAt:"2026-07-19T19:00:00Z"}),fixture({code:"UEFA_NL",kickoffAt:"2026-09-24T16:00:00Z"})],"2026-10-06T03:00:00Z",false);
 assert.deepEqual(plan.flatMap(c=>c.fixtures.map(f=>f.code)),["ENG","UEFA_NL"]);
 assert.equal(plan[0].from,"2026-08-21T19:00:00Z");
});
test("current CONCACAF provider-labeled 2025 requires explicit selection and still excludes older fixtures",()=>{
 const rows=[fixture({code:"CONCACAF_NL",season:2025,kickoffAt:"2026-09-25T00:00:00Z"}),fixture({code:"CONCACAF_NL",season:2025,kickoffAt:"2025-03-01T00:00:00Z"})];
 assert.equal(currentSeasonV4Plan(rows,"2026-10-06T03:00:00Z",false).length,0);
 assert.equal(currentSeasonV4Plan(rows,"2026-10-06T03:00:00Z",true)[0].fixtures.length,1);
});
