/**
 * Standings derivation — pure, and deliberately NOT cached anywhere
 * (docs/game-rules.md "Standings": "Derived, never cached"). Takes every
 * finalized matchup's final score and produces a ranked table. Tiebreak
 * order, per docs/game-rules.md: wins, then points-for, then head-to-head
 * result (only if the two tied teams have actually played each other),
 * then points-against ascending.
 */

export interface MatchupOutcome {
  homeTeamId: string;
  awayTeamId: string;
  homePoints: number;
  awayPoints: number;
}

export interface StandingsRow {
  fantasyTeamId: string;
  wins: number;
  losses: number;
  draws: number;
  pointsFor: number;
  pointsAgainst: number;
}

/** Aggregates W/L/D and points for/against per team from every finalized matchup outcome. Unsorted — pass to `rankStandings` for the real table order. */
export function buildStandingsTable(outcomes: MatchupOutcome[]): StandingsRow[] {
  const table = new Map<string, StandingsRow>();

  function ensure(teamId: string): StandingsRow {
    let row = table.get(teamId);
    if (!row) {
      row = { fantasyTeamId: teamId, wins: 0, losses: 0, draws: 0, pointsFor: 0, pointsAgainst: 0 };
      table.set(teamId, row);
    }
    return row;
  }

  for (const outcome of outcomes) {
    const home = ensure(outcome.homeTeamId);
    const away = ensure(outcome.awayTeamId);
    home.pointsFor += outcome.homePoints;
    home.pointsAgainst += outcome.awayPoints;
    away.pointsFor += outcome.awayPoints;
    away.pointsAgainst += outcome.homePoints;

    if (outcome.homePoints > outcome.awayPoints) {
      home.wins += 1;
      away.losses += 1;
    } else if (outcome.homePoints < outcome.awayPoints) {
      away.wins += 1;
      home.losses += 1;
    } else {
      home.draws += 1;
      away.draws += 1;
    }
  }

  return Array.from(table.values());
}

/** The team that won every head-to-head meeting between `teamA` and `teamB`, or `null` if they never played or split/tied their meetings (no clean head-to-head edge). */
function headToHeadWinner(outcomes: MatchupOutcome[], teamA: string, teamB: string): string | null {
  const meetings = outcomes.filter(
    (o) => (o.homeTeamId === teamA && o.awayTeamId === teamB) || (o.homeTeamId === teamB && o.awayTeamId === teamA)
  );
  if (meetings.length === 0) return null;

  let aPoints = 0;
  let bPoints = 0;
  for (const meeting of meetings) {
    const [aScore, bScore] =
      meeting.homeTeamId === teamA ? [meeting.homePoints, meeting.awayPoints] : [meeting.awayPoints, meeting.homePoints];
    aPoints += aScore;
    bPoints += bScore;
  }

  if (aPoints > bPoints) return teamA;
  if (bPoints > aPoints) return teamB;
  return null;
}

/**
 * Ranks a standings table: wins desc, then pointsFor desc, then
 * head-to-head (only breaks the tie if the two teams have played and one
 * clearly won their meeting(s)), then pointsAgainst asc.
 */
export function rankStandings(rows: StandingsRow[], outcomes: MatchupOutcome[]): StandingsRow[] {
  return [...rows].sort((a, b) => {
    if (a.wins !== b.wins) return b.wins - a.wins;
    if (a.pointsFor !== b.pointsFor) return b.pointsFor - a.pointsFor;

    const winner = headToHeadWinner(outcomes, a.fantasyTeamId, b.fantasyTeamId);
    if (winner === a.fantasyTeamId) return -1;
    if (winner === b.fantasyTeamId) return 1;

    return a.pointsAgainst - b.pointsAgainst;
  });
}
