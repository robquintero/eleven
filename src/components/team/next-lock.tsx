import { Countdown } from "@/components/football/countdown";
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
      return <p className="text-xs text-foreground-tertiary">NOT SCHEDULED</p>;
    }
    if (remainingCount !== undefined && remainingCount > 0) {
      return (
        <p className="text-xs text-foreground-tertiary">
          {remainingCount} starter{remainingCount === 1 ? "" : "s"} remaining — fixture not yet scheduled.
        </p>
      );
    }
    return <p className="text-xs text-foreground-tertiary">NONE REMAINING — every starter is locked for this matchday.</p>;
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {slot.player.name}
        </p>
        <p className="label-system truncate text-[11px] text-foreground-tertiary">
          {playerFixtureParticipantLabel(slot.player)} {fixtureOpponentLabel(slot.player)} ·{" "}
          {formatKickoff(slot.player.fixture.kickoff)}
        </p>
      </div>
      <Countdown
        target={slot.player.fixture.kickoff}
        className="label-system shrink-0 text-sm font-semibold text-accent"
      />
    </div>
  );
}
