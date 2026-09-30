/**
 * Snake draft ordering — pure math over an already-persisted
 * `draft_orders` position assignment. Generating/shuffling the initial
 * order and mapping a pick number to whose turn it is are kept as
 * separate pure functions so the shuffle (the only non-deterministic
 * part) is isolated and injectable in tests.
 */

/** Fisher-Yates, with an injectable RNG so tests can assert a specific, reproducible shuffle. Production calls this with `Math.random` (the default). */
export function shuffleOrder<T>(items: T[], randomFn: () => number = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Which 1-indexed draft-order `position` picks at 1-indexed overall
 * `pickNumber`, for a `teamCount`-team snake draft. Odd rounds go
 * 1..N, even rounds go N..1 — this is the entire snake rule.
 */
export function teamPositionForPick(pickNumber: number, teamCount: number): number {
  const round = Math.ceil(pickNumber / teamCount);
  const indexInRound = pickNumber - (round - 1) * teamCount; // 1-indexed, 1..teamCount
  return round % 2 === 1 ? indexInRound : teamCount - indexInRound + 1;
}

/** Which 1-indexed round a given 1-indexed overall pick number falls in. */
export function roundForPick(pickNumber: number, teamCount: number): number {
  return Math.ceil(pickNumber / teamCount);
}

/** Total picks in a full snake draft: one pick per team per round. */
export function totalPicks(teamCount: number, totalRounds: number): number {
  return teamCount * totalRounds;
}
