import { Countdown } from "@/components/football/countdown";
import { fixtureOpponentLabel, formatKickoff, playerFixtureParticipantLabel } from "@/lib/team-fixture";
import type { LineupSlot } from "@/lib/types/fantasy";

export function NextLock({ slot, hasStarters = true }: { slot: LineupSlot | null; hasStarters?: boolean }) {
  if (!slot?.player.fixture) {
    return (
      <p className="text-xs text-foreground-tertiary">
        {hasStarters ? "All starters are locked in for this matchday." : "NOT SCHEDULED"}
      </p>
    );
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
