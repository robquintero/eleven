/**
 * Standings derivation — pure, and deliberately NOT cached anywhere
 * (docs/game-rules.md "Standings": "Derived, never cached"). Takes every
 * finalized matchup's final score and produces a ranked soccer-style
 * table.
 *
 * Pass 12A: league POINTS (3 win / 1 draw / 0 loss) are now the primary
 * ranking criterion — never confused with fantasy POINTS (PF/PA), which
 * are a completely separate number. Tiebreak order (brief, "REQUIRED
 * gameplay change," supersedes the previous wins-first order):
 *   1. league points (PTS) descending
 *   2. fantasy-point differential (PF - PA) descending
 *   3. fantasy points scored (PF) descending
 *   4. head-to-head result (only between the two tied teams, only from
 *      finalized matchups actually played between them)
 *   5. team id ascending — a stable, deterministic, non-random final
 *      fallback, never "first inserted" or similar incidental ordering.
 */

const WIN_POINTS = 3;
const DRAW_POINTS = 1;
const LOSS_POINTS = 0;

export interface MatchupOutcome {
  homeTeamId: string;
  awayTeamId: string;
  homePoints: number;
  awayPoints: number;
}

export interface StandingsRow {
  fantasyTeamId: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  pointsFor: number;
  pointsAgainst: number;
  /** League table points (3 win / 1 draw / 0 loss) — NOT fantasy points. */
  leaguePoints: number;
}

/** Aggregates P/W/L/D, fantasy points for/against, and league points per team from every finalized matchup outcome. Unsorted — pass to `rankStandings` for the real table order. */
export function buildStandingsTable(outcomes: MatchupOutcome[]): StandingsRow[] {
  const table = new Map<string, StandingsRow>();

  function ensure(teamId: string): StandingsRow {
    let row = table.get(teamId);
    if (!row) {
      row = { fantasyTeamId: teamId, played: 0, wins: 0, losses: 0, draws: 0, pointsFor: 0, pointsAgainst: 0, leaguePoints: 0 };
      table.set(teamId, row);
    }
    return row;
  }

  for (const outcome of outcomes) {
    const home = ensure(outcome.homeTeamId);
    const away = ensure(outcome.awayTeamId);
    home.played += 1;
    away.played += 1;
    home.pointsFor += outcome.homePoints;
    home.pointsAgainst += outcome.awayPoints;
    away.pointsFor += outcome.awayPoints;
    away.pointsAgainst += outcome.homePoints;

    if (outcome.homePoints > outcome.awayPoints) {
      home.wins += 1;
      home.leaguePoints += WIN_POINTS;
      away.losses += 1;
      away.leaguePoints += LOSS_POINTS;
    } else if (outcome.homePoints < outcome.awayPoints) {
      away.wins += 1;
      away.leaguePoints += WIN_POINTS;
      home.losses += 1;
      home.leaguePoints += LOSS_POINTS;
    } else {
      home.draws += 1;
      home.leaguePoints += DRAW_POINTS;
      away.draws += 1;
      away.leaguePoints += DRAW_POINTS;
    }
  }

  return Array.from(table.values());
}

/** The team that won every head-to-head meeting between `teamA` and `teamB` on aggregate fantasy points, or `null` if they never played or split/tied their meetings (no clean head-to-head edge). */
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
 * Ranks a standings table: league points desc, then fantasy-point
 * differential desc, then fantasy points scored (PF) desc, then
 * head-to-head (only breaks the tie if the two teams have played and one
 * clearly won their meeting(s) on aggregate points), then team id
 * ascending as the final, deterministic, non-random fallback.
 */
export function rankStandings(rows: StandingsRow[], outcomes: MatchupOutcome[]): StandingsRow[] {
  return [...rows].sort((a, b) => {
    if (a.leaguePoints !== b.leaguePoints) return b.leaguePoints - a.leaguePoints;

    const diffA = a.pointsFor - a.pointsAgainst;
    const diffB = b.pointsFor - b.pointsAgainst;
    if (diffA !== diffB) return diffB - diffA;

    if (a.pointsFor !== b.pointsFor) return b.pointsFor - a.pointsFor;

    const winner = headToHeadWinner(outcomes, a.fantasyTeamId, b.fantasyTeamId);
    if (winner === a.fantasyTeamId) return -1;
    if (winner === b.fantasyTeamId) return 1;

    return a.fantasyTeamId < b.fantasyTeamId ? -1 : a.fantasyTeamId > b.fantasyTeamId ? 1 : 0;
  });
}
