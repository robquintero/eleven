import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStandingsTable, rankStandings } from "./standings.ts";
import type { MatchupOutcome } from "./standings.ts";

test("buildStandingsTable aggregates played/wins/losses/draws, points for/against, and league points (3/1/0) correctly", () => {
  const outcomes: MatchupOutcome[] = [
    { homeTeamId: "A", awayTeamId: "B", homePoints: 50, awayPoints: 30 },
    { homeTeamId: "B", awayTeamId: "A", homePoints: 40, awayPoints: 40 },
  ];
  const table = buildStandingsTable(outcomes);
  const a = table.find((r) => r.fantasyTeamId === "A")!;
  const b = table.find((r) => r.fantasyTeamId === "B")!;

  assert.equal(a.played, 2);
  assert.equal(a.wins, 1);
  assert.equal(a.losses, 0);
  assert.equal(a.draws, 1);
  assert.equal(a.pointsFor, 90);
  assert.equal(a.pointsAgainst, 70);
  assert.equal(a.leaguePoints, 3 + 1, "1 win (3) + 1 draw (1) = 4 league points");

  assert.equal(b.played, 2);
  assert.equal(b.wins, 0);
  assert.equal(b.losses, 1);
  assert.equal(b.draws, 1);
  assert.equal(b.pointsFor, 70);
  assert.equal(b.pointsAgainst, 90);
  assert.equal(b.leaguePoints, 0 + 1, "1 loss (0) + 1 draw (1) = 1 league point");
});

test("rankStandings sorts by league points first -- a win is worth more than any points-for margin", () => {
  const outcomes: MatchupOutcome[] = [
    { homeTeamId: "A", awayTeamId: "B", homePoints: 10, awayPoints: 0 }, // A: win, 3 pts
    { homeTeamId: "C", awayTeamId: "D", homePoints: 0, awayPoints: 10 }, // D: win, 3 pts
  ];
  const table = buildStandingsTable(outcomes);
  const ranked = rankStandings(table, outcomes);
  assert.ok(ranked[0].leaguePoints === 3 && ranked[1].leaguePoints === 3, "the two winners occupy the top two spots");
  assert.ok(ranked[2].leaguePoints === 0 && ranked[3].leaguePoints === 0, "the two losers occupy the bottom two spots");
});

test("a tie on league points breaks by fantasy-point differential (PF - PA), not raw points-for", () => {
  // A wins 100-90 (diff +10, PF 100). B wins 60-0 (diff +60, PF 60).
  // Both have 1 win = 3 league points, but B has the bigger differential.
  const outcomes: MatchupOutcome[] = [
    { homeTeamId: "A", awayTeamId: "X", homePoints: 100, awayPoints: 90 },
    { homeTeamId: "B", awayTeamId: "Y", homePoints: 60, awayPoints: 0 },
  ];
  const table = buildStandingsTable(outcomes);
  const ranked = rankStandings(table, outcomes).filter((r) => r.fantasyTeamId === "A" || r.fantasyTeamId === "B");
  assert.equal(ranked[0].fantasyTeamId, "B", "B has a larger differential (+60 vs +10) despite a lower points-for total");
});

test("a tie on league points AND differential breaks by points-for (PF) descending", () => {
  // A: win 100-90 (diff +10, PF 100). B: win 30-20 (diff +10, PF 30).
  const outcomes: MatchupOutcome[] = [
    { homeTeamId: "A", awayTeamId: "X", homePoints: 100, awayPoints: 90 },
    { homeTeamId: "B", awayTeamId: "Y", homePoints: 30, awayPoints: 20 },
  ];
  const table = buildStandingsTable(outcomes);
  const a = table.find((r) => r.fantasyTeamId === "A")!;
  const b = table.find((r) => r.fantasyTeamId === "B")!;
  assert.equal(a.leaguePoints, b.leaguePoints);
  assert.equal(a.pointsFor - a.pointsAgainst, b.pointsFor - b.pointsAgainst, "identical +10 differential");

  const ranked = rankStandings(table, outcomes).filter((r) => r.fantasyTeamId === "A" || r.fantasyTeamId === "B");
  assert.equal(ranked[0].fantasyTeamId, "A", "A has the higher points-for (100 vs 30) despite identical league points and differential");
});

test("a tie on league points, differential, AND points-for breaks by head-to-head result", () => {
  // A and B each finish 1W-1L with identical league points, differential,
  // and points-for, but A beat B in their own meeting.
  const outcomes: MatchupOutcome[] = [
    { homeTeamId: "A", awayTeamId: "B", homePoints: 12, awayPoints: 8 },
    { homeTeamId: "A", awayTeamId: "X", homePoints: 8, awayPoints: 12 },
    { homeTeamId: "B", awayTeamId: "Y", homePoints: 12, awayPoints: 8 },
  ];
  const table = buildStandingsTable(outcomes);
  const a = table.find((r) => r.fantasyTeamId === "A")!;
  const b = table.find((r) => r.fantasyTeamId === "B")!;
  assert.equal(a.leaguePoints, b.leaguePoints, "sanity: equal league points (1W1L each)");
  assert.equal(a.pointsFor - a.pointsAgainst, b.pointsFor - b.pointsAgainst, "sanity: equal differential");
  assert.equal(a.pointsFor, b.pointsFor, "sanity: equal points-for");

  const ranked = rankStandings(table, outcomes);
  const aIndex = ranked.findIndex((r) => r.fantasyTeamId === "A");
  const bIndex = ranked.findIndex((r) => r.fantasyTeamId === "B");
  assert.ok(aIndex < bIndex, "A ranks above B purely on head-to-head");
});

test("a full tie with no head-to-head meeting falls back to team id ascending -- a stable, deterministic, non-random order", () => {
  const outcomes: MatchupOutcome[] = [
    { homeTeamId: "zebra", awayTeamId: "X", homePoints: 20, awayPoints: 10 },
    { homeTeamId: "alpha", awayTeamId: "Y", homePoints: 20, awayPoints: 10 },
  ];
  const table = buildStandingsTable(outcomes);
  const ranked = rankStandings(table, outcomes).filter((r) => r.fantasyTeamId === "zebra" || r.fantasyTeamId === "alpha");
  assert.equal(ranked[0].fantasyTeamId, "alpha", "identical in every other respect -- 'alpha' < 'zebra' lexically, the deterministic final fallback");
});

test("head-to-head does not break a tie when the two tied teams split/tied their meeting -- falls through to team id", () => {
  const outcomes: MatchupOutcome[] = [
    { homeTeamId: "bravo", awayTeamId: "alpha", homePoints: 10, awayPoints: 10 }, // exact tie in their only meeting
    { homeTeamId: "alpha", awayTeamId: "X", homePoints: 5, awayPoints: 0 },
    { homeTeamId: "bravo", awayTeamId: "Y", homePoints: 5, awayPoints: 0 },
  ];
  const table = buildStandingsTable(outcomes);
  const a = table.find((r) => r.fantasyTeamId === "alpha")!;
  const b = table.find((r) => r.fantasyTeamId === "bravo")!;
  assert.equal(a.leaguePoints, b.leaguePoints);
  assert.equal(a.pointsFor - a.pointsAgainst, b.pointsFor - b.pointsAgainst);
  assert.equal(a.pointsFor, b.pointsFor);

  const ranked = rankStandings(table, outcomes);
  const aIndex = ranked.findIndex((r) => r.fantasyTeamId === "alpha");
  const bIndex = ranked.findIndex((r) => r.fantasyTeamId === "bravo");
  assert.ok(aIndex < bIndex, "'alpha' < 'bravo' lexically once head-to-head is a wash");
});

test("an unfinished league (no outcomes at all) produces an empty standings table", () => {
  assert.deepEqual(buildStandingsTable([]), []);
  assert.deepEqual(rankStandings([], []), []);
});
