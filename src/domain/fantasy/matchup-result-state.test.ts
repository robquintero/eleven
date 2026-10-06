import { test } from "node:test";
import assert from "node:assert/strict";
import { matchupResultState } from "./matchup-result-state.ts";
const round = { startsAt: "2026-09-29T06:00:00Z", endsAt: "2026-10-06T06:00:00Z", roundStatus: "in_progress" as const };
test("closed week is PENDING at 06:00, 06:30 and later until authoritative finality; live fixtures do not make old weeks current", () => {
  for (const clock of ["06:00:00", "06:30:00", "07:00:00"]) {
    assert.equal(matchupResultState({ ...round, status: "live" }, new Date(`2026-10-06T${clock}Z`)), "pending");
  }
  assert.equal(matchupResultState({ ...round, status: "final" }, new Date("2026-10-06T06:30Z")), "final");
  assert.equal(matchupResultState(round, new Date("2026-10-06T05:59:59Z")), "active");
  assert.equal(matchupResultState({ ...round, status: "live" }, new Date("2026-10-06T05:59:59Z")), "live");
});
test("new round is ACTIVE while old is PENDING; UTC boundary is independent of local DST", () => {
  const clock = new Date("2026-10-06T02:30:00-04:00");
  assert.equal(matchupResultState(round, clock), "pending");
  assert.equal(matchupResultState({ startsAt:round.endsAt,endsAt:"2026-10-13T06:00:00Z" },clock),"active");
});
