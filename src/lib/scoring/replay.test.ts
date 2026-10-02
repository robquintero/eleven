/**
 * Replay/simulation scenario tests (brief §Phase 5). These use SYNTHETIC
 * `ScoringInput` snapshots constructed in-memory — never real provider
 * responses, never written to a database. Real football doesn't expose
 * minute-by-minute stat snapshots (only a fixture's final numbers), so a
 * "provider re-polled mid-match and the numbers changed" scenario can only
 * be exercised with explicit TEST FIXTURES, kept clearly separate from
 * production data (brief: "do NOT claim synthetic snapshots are real").
 *
 * These tests exercise the RECOMPUTE-NEVER-INCREMENT contract at a
 * scenario level (each one tells a small story: "the provider polled
 * again," "a stat got corrected," "the fixture went final") — narrower
 * pure-function edge cases already live in scoring.test.ts, and the
 * real-data determinism proof (backfill run twice, byte-identical rows)
 * lives in docs/scoring-model.md's Phase 4 section.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateFantasyScore } from "../../domain/fantasy/scoring.ts";
import type { ScoringInput } from "../../domain/fantasy/scoring.ts";

function synthetic(overrides: Partial<ScoringInput> = {}): ScoringInput {
  return {
    position: "MID",
    minutes: 0,
    goals: 0,
    assists: 0,
    shotsOnTarget: 0,
    chancesCreated: 0,
    tackles: 0,
    interceptions: 0,
    blocks: 0,
    saves: 0,
    yellowCards: 0,
    redCards: 0,
    concededByOwnClub: null,
    ...overrides,
  };
}

test("scenario: fixture moves scheduled -> live -> final; each stage recomputes cleanly from the stats known at that moment", () => {
  // TEST FIXTURE (synthetic) — not a real fixture's stat history.
  const scheduled = synthetic({ minutes: 0 }); // kickoff hasn't happened
  const live = synthetic({ minutes: 35, goals: 1, shotsOnTarget: 2 }); // mid-match snapshot
  const final = synthetic({ minutes: 90, goals: 1, assists: 1, shotsOnTarget: 3, concededByOwnClub: 0 });

  const scheduledScore = calculateFantasyScore(scheduled);
  const liveScore = calculateFantasyScore(live);
  const finalScore = calculateFantasyScore(final);

  assert.equal(scheduledScore.total, 0, "before kickoff, no points yet");
  assert.ok(liveScore.total > scheduledScore.total, "in-progress stats produce a provisional score above zero");
  assert.ok(finalScore.total > liveScore.total, "the final snapshot (more minutes, more output, clean sheet) scores higher than the mid-match one");
  // Each recompute is independent — never scheduled + live + final summed together.
  assert.notEqual(finalScore.total, scheduledScore.total + liveScore.total);
});

test("scenario: the provider re-polls with an IDENTICAL snapshot — recomputing must not double-count", () => {
  // TEST FIXTURE (synthetic) — simulates two polls of an unchanged fixture.
  const pollOne = synthetic({ minutes: 90, goals: 2, assists: 1 });
  const pollTwo = synthetic({ minutes: 90, goals: 2, assists: 1 }); // identical re-poll

  const scoreOne = calculateFantasyScore(pollOne);
  const scoreTwo = calculateFantasyScore(pollTwo);

  assert.deepEqual(scoreOne, scoreTwo, "an unchanged snapshot recomputes to the exact same score, not an incremented one");
});

test("scenario: a stat correction (the provider removes a previously-reported assist) recomputes DOWN by exactly one assist's value", () => {
  // TEST FIXTURE (synthetic) — simulates the provider correcting an over-report.
  const beforeCorrection = synthetic({ minutes: 90, goals: 1, assists: 1 });
  const afterCorrection = synthetic({ minutes: 90, goals: 1, assists: 0 }); // assist retracted

  const before = calculateFantasyScore(beforeCorrection);
  const after = calculateFantasyScore(afterCorrection);

  assert.ok(after.total < before.total, "removing a credited assist must lower the recomputed score");
  assert.equal(before.total - after.total, 4, "the drop equals exactly one assist's point value (4, ELEVEN_STANDARD_V2) — nothing else changed, and going from 1 assist to 0 never crosses the 2+ milestone threshold either way");
});

test("scenario: a stat correction that ADDS a previously-missed card recomputes DOWN by the discipline penalty", () => {
  // TEST FIXTURE (synthetic) — simulates the provider adding a card it missed on the first poll.
  const firstPoll = synthetic({ minutes: 90, tackles: 2 });
  const corrected = synthetic({ minutes: 90, tackles: 2, yellowCards: 1 });

  const before = calculateFantasyScore(firstPoll);
  const after = calculateFantasyScore(corrected);

  assert.equal(before.total - after.total, 1, "a newly-recorded yellow card lowers the score by exactly 1, independent of every other component");
});

test("scenario: duplicate ingestion of the same stat line at two different 'poll times' converges to one identical result, not an accumulated one", () => {
  // TEST FIXTURE (synthetic) — simulates the same underlying stats being
  // recomputed 5 times in a row (e.g. an overlapping cron tick + a manual
  // replay both firing for the same fixture).
  const stats = synthetic({ position: "FWD", minutes: 90, goals: 2, assists: 1, shotsOnTarget: 4 });
  const results = Array.from({ length: 5 }, () => calculateFantasyScore(stats));

  for (const result of results) {
    assert.deepEqual(result, results[0], "every recompute of the same stats is byte-identical — no accumulation across repeated calls");
  }
});

test("scenario: a missed polling interval (the live snapshot is skipped, only the final snapshot ever arrives) still produces the correct final score", () => {
  // TEST FIXTURE (synthetic) — proves the engine doesn't need every
  // intermediate snapshot to reach the right answer; only the final
  // canonical stats matter, since scoring is computed from current
  // state, not accumulated deltas across polls.
  const onlyFinalSnapshotEverSeen = synthetic({
    position: "DEF",
    minutes: 90,
    tackles: 4,
    interceptions: 2,
    concededByOwnClub: 0,
  });
  const asIfEveryPollHadArrived = synthetic({
    position: "DEF",
    minutes: 90,
    tackles: 4,
    interceptions: 2,
    concededByOwnClub: 0,
  });

  assert.deepEqual(
    calculateFantasyScore(onlyFinalSnapshotEverSeen),
    calculateFantasyScore(asIfEveryPollHadArrived),
    "the final score depends only on the final stat line, never on how many intermediate polls happened to be observed"
  );
});
