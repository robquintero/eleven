import { fixtureOpponentLabel, formatKickoff, playerFixtureParticipantLabel } from "@/lib/team-fixture";
import type { LineupSlot } from "@/lib/types/fantasy";

/**
 * Pass 14.6: `remainingCount` (REAL, from `starterBuckets`) is what
 * decides the no-upcoming-lock message, never `slot === null` alone --
 * those used to be treated as the same case ("All starters are locked in
 * for this matchday"), which was flatly wrong whenever a starter was
 * genuinely still REMAINING but Eleven doesn't yet know their fixture's
 * kickoff (no eligible fixture stored for them yet this round) --
 * `nextLock()` can only find a lock instant for a player it has fixture
 * data for, so "no computable next lock" is NOT the same fact as "zero
 * starters remain unlocked."
 */
export function NextLock({
  slot,
  hasStarters = true,
  remainingCount,
}: {
  slot: LineupSlot | null;
  hasStarters?: boolean;
  /** Real REMAINING count (`starterBuckets(starters).upcoming`) -- the authoritative source for whether anyone is actually still unlocked. */
  remainingCount?: number;
}) {
  if (!slot?.player.fixture) {
    if (!hasStarters) {
      return <p className="text-xs text-foreground-secondary">Not scheduled</p>;
    }
    if (remainingCount !== undefined && remainingCount > 0) {
      return (
        <p className="text-xs text-foreground-tertiary">
          {remainingCount} starter{remainingCount === 1 ? "" : "s"} remaining — fixture not yet scheduled.
        </p>
      );
    }
    return <p className="text-xs text-foreground-secondary">No remaining locks. Every starter is locked for this matchweek.</p>;
  }

  return (
    <div>
      <p className="text-lg font-semibold text-foreground">{formatKickoff(slot.player.fixture.kickoff)}</p>
      <div className="min-w-0">
        <p className="mt-1 text-sm font-medium text-foreground [overflow-wrap:anywhere]">
          {slot.player.name}
        </p>
        <p className="mt-1 text-xs text-foreground-secondary [overflow-wrap:anywhere]">
          {playerFixtureParticipantLabel(slot.player)} {fixtureOpponentLabel(slot.player)}
        </p>
      </div>
    </div>
  );
}
