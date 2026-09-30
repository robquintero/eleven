import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStandingsTable, rankStandings } from "./standings.ts";
import type { MatchupOutcome } from "./standings.ts";

test("buildStandingsTable aggregates wins/losses/draws and points for/against correctly", () => {
  const outcomes: MatchupOutcome[] = [
    { homeTeamId: "A", awayTeamId: "B", homePoints: 50, awayPoints: 30 },
    { homeTeamId: "B", awayTeamId: "A", homePoints: 40, awayPoints: 40 },
  ];
  const table = buildStandingsTable(outcomes);
  const a = table.find((r) => r.fantasyTeamId === "A")!;
  const b = table.find((r) => r.fantasyTeamId === "B")!;

  assert.equal(a.wins, 1);
  assert.equal(a.losses, 0);
  assert.equal(a.draws, 1);
  assert.equal(a.pointsFor, 90);
  assert.equal(a.pointsAgainst, 70);

  assert.equal(b.wins, 0);
  assert.equal(b.losses, 1);
  assert.equal(b.draws, 1);
  assert.equal(b.pointsFor, 70);
  assert.equal(b.pointsAgainst, 90);
});

test("rankStandings sorts by wins first", () => {
  const outcomes: MatchupOutcome[] = [
    { homeTeamId: "A", awayTeamId: "B", homePoints: 10, awayPoints: 0 },
    { homeTeamId: "C", awayTeamId: "D", homePoints: 0, awayPoints: 10 },
  ];
  const table = buildStandingsTable(outcomes);
  const ranked = rankStandings(table, outcomes);
  assert.deepEqual(
    ranked.map((r) => r.fantasyTeamId).sort(),
    ["A", "D"].concat(["B", "C"]).sort() // just confirm winners rank above losers, order among the two winners doesn't matter here
  );
  assert.ok(ranked[0].wins === 1 && ranked[1].wins === 1);
  assert.ok(ranked[2].wins === 0 && ranked[3].wins === 0);
});

test("a tie on wins breaks by points-for", () => {
  const outcomes: MatchupOutcome[] = [
    { homeTeamId: "A", awayTeamId: "X", homePoints: 100, awayPoints: 0 },
    { homeTeamId: "B", awayTeamId: "Y", homePoints: 60, awayPoints: 0 },
  ];
  const table = buildStandingsTable(outcomes);
  const ranked = rankStandings(table, outcomes).filter((r) => r.fantasyTeamId === "A" || r.fantasyTeamId === "B");
  assert.equal(ranked[0].fantasyTeamId, "A", "A has more points-for despite identical win counts (1 each)");
});

test("a tie on wins AND points-for breaks by head-to-head result when the two teams played each other", () => {
  // A and B each finish 1W-1L with identical points-for (20), but A beat
  // B in their own meeting -- A must rank above B on that tiebreak alone.
  const outcomes: MatchupOutcome[] = [
    { homeTeamId: "A", awayTeamId: "B", homePoints: 12, awayPoints: 8 }, // A beats B: A +12PF/1W, B +8PF/1L
    { homeTeamId: "A", awayTeamId: "X", homePoints: 8, awayPoints: 20 }, // A loses to X: A +8PF/1L -> A total 20PF, 1W1L
    { homeTeamId: "B", awayTeamId: "Y", homePoints: 12, awayPoints: 0 }, // B beats Y: B +12PF/1W -> B total 20PF, 1W1L
  ];
  const table = buildStandingsTable(outcomes);
  const a = table.find((r) => r.fantasyTeamId === "A")!;
  const b = table.find((r) => r.fantasyTeamId === "B")!;
  assert.equal(a.wins, b.wins, "sanity: A and B have equal wins in this constructed scenario");
  assert.equal(a.pointsFor, b.pointsFor, "sanity: A and B have equal points-for in this constructed scenario");

  const ranked = rankStandings(table, outcomes);
  const aIndex = ranked.findIndex((r) => r.fantasyTeamId === "A");
  const bIndex = ranked.findIndex((r) => r.fantasyTeamId === "B");
  assert.ok(aIndex < bIndex, "A ranks above B on head-to-head despite identical wins and points-for");
});

test("a tie on wins, points-for, AND no head-to-head meeting falls back to points-against ascending", () => {
  const outcomes: MatchupOutcome[] = [
    { homeTeamId: "A", awayTeamId: "X", homePoints: 20, awayPoints: 10 }, // A: 1W, 20PF, 10PA
    { homeTeamId: "B", awayTeamId: "Y", homePoints: 20, awayPoints: 5 }, // B: 1W, 20PF, 5PA
  ];
  const table = buildStandingsTable(outcomes);
  const ranked = rankStandings(table, outcomes).filter((r) => r.fantasyTeamId === "A" || r.fantasyTeamId === "B");
  assert.equal(ranked[0].fantasyTeamId, "B", "B has fewer points-against (5 < 10), so ranks first despite never having played A");
});

test("head-to-head does not break a tie when the two tied teams split their meetings (no clean winner)", () => {
  const outcomes: MatchupOutcome[] = [
    { homeTeamId: "A", awayTeamId: "B", homePoints: 10, awayPoints: 10 }, // exact tie in their only meeting
    { homeTeamId: "A", awayTeamId: "X", homePoints: 5, awayPoints: 0 },
    { homeTeamId: "B", awayTeamId: "Y", homePoints: 5, awayPoints: 3 }, // B has 3 more points-against than A overall -> A should rank first via points-against fallback
  ];
  const table = buildStandingsTable(outcomes);
  const a = table.find((r) => r.fantasyTeamId === "A")!;
  const b = table.find((r) => r.fantasyTeamId === "B")!;
  // A: draw(10-10) + win(5-0) = 1W1D, 15PF, 10PA. B: draw(10-10) + win(5-3) = 1W1D, 15PF, 13PA.
  assert.equal(a.wins, b.wins);
  assert.equal(a.pointsFor, b.pointsFor);
  const ranked = rankStandings(table, outcomes);
  const aIndex = ranked.findIndex((r) => r.fantasyTeamId === "A");
  const bIndex = ranked.findIndex((r) => r.fantasyTeamId === "B");
  assert.ok(aIndex < bIndex, "falls through to points-against ascending since their head-to-head meeting was an exact tie");
});

test("an unfinished league (no outcomes at all) produces an empty standings table", () => {
  assert.deepEqual(buildStandingsTable([]), []);
  assert.deepEqual(rankStandings([], []), []);
});
