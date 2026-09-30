/**
 * Round-robin H2H schedule generation — the standard "circle method":
 * fix one team, rotate the rest. Produces exactly one full cycle where
 * every team plays every other team exactly once, deterministically (no
 * randomness — the draft order/team list order is the only input).
 *
 * Odd team counts get a synthetic BYE slot (`null`): whichever real team
 * is paired against it that cycle-round simply has no pairing that round
 * (docs/game-rules.md "League size").
 */

export interface MatchupPairing {
  /** 1-indexed round within ONE cycle of the round-robin (a season longer than one cycle repeats these — see `docs/game-rules.md` "H2H schedule & scoring"). */
  cycleRound: number;
  homeTeamId: string;
  awayTeamId: string;
}

/** One full round-robin cycle: `teamIds.length - 1` (or `teamIds.length` if odd, due to the bye) rounds, each an array of that round's pairings. A team with a bye that round simply doesn't appear in any pairing. */
export function generateRoundRobinCycle(teamIds: string[]): MatchupPairing[][] {
  if (teamIds.length < 2) return [];

  const isOdd = teamIds.length % 2 !== 0;
  const slots: (string | null)[] = isOdd ? [...teamIds, null] : [...teamIds];
  const size = slots.length;
  const roundsCount = size - 1;
  const rounds: MatchupPairing[][] = [];

  let arr = [...slots];
  for (let r = 0; r < roundsCount; r++) {
    const pairings: MatchupPairing[] = [];
    for (let i = 0; i < size / 2; i++) {
      const a = arr[i];
      const b = arr[size - 1 - i];
      if (a !== null && b !== null) {
        // Alternate which side is "home" by round parity so no team is
        // permanently stuck as always-home or always-away against a
        // fixed-position opponent.
        const [home, away] = r % 2 === 0 ? [a, b] : [b, a];
        pairings.push({ cycleRound: r + 1, homeTeamId: home, awayTeamId: away });
      }
    }
    rounds.push(pairings);

    // Rotate: keep slots[0] fixed, rotate everyone else by one position.
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop()!);
    arr = [fixed, ...rest];
  }

  return rounds;
}

/**
 * The pairings for the Nth (1-indexed) Eleven fantasy round of a league's
 * season, cycling through the round-robin and reversing home/away on
 * every repeat of the cycle (so a season longer than one cycle doesn't
 * replay identical home/away assignments indefinitely).
 */
export function pairingsForSeasonRound(cycle: MatchupPairing[][], seasonRoundNumber: number): MatchupPairing[] {
  if (cycle.length === 0) return [];
  const cycleLength = cycle.length;
  const zeroIndexed = seasonRoundNumber - 1;
  const cycleIteration = Math.floor(zeroIndexed / cycleLength);
  const roundWithinCycle = zeroIndexed % cycleLength;
  const pairings = cycle[roundWithinCycle];
  const reverseHomeAway = cycleIteration % 2 === 1;
  return pairings.map((p) =>
    reverseHomeAway
      ? { ...p, homeTeamId: p.awayTeamId, awayTeamId: p.homeTeamId }
      : p
  );
}
