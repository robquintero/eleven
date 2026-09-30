/**
 * Player-level lineup locking — docs/game-rules.md "Player locking."
 * A starter's lineup slot locks at the kickoff of their FIRST eligible
 * fixture in the round, not a global weekly deadline, and not
 * independently per fixture (rejected alternative — see the doc). Pure
 * functions; `now` is always explicit (Pass 9/10 clock-injection rule).
 */

/** The instant a lineup slot locks, given every eligible fixture kickoff that player has in the round — `null` if they have none (a zero-appearance starter is never locked; they're just never going to score). */
export function computeLockInstant(fixtureKickoffs: Date[]): Date | null {
  if (fixtureKickoffs.length === 0) return null;
  return new Date(Math.min(...fixtureKickoffs.map((d) => d.getTime())));
}

/** Whether a slot with the given lock instant is locked as of `now`. A `null` lockedAt (no eligible fixture yet known, or the player has none this round) is never locked. */
export function isLocked(lockedAt: Date | null, now: Date): boolean {
  if (!lockedAt) return false;
  return now.getTime() >= lockedAt.getTime();
}
