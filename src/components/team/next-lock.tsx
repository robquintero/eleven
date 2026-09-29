import { Countdown } from "@/components/football/countdown";
import { fixtureOpponentLabel, formatKickoff } from "@/lib/team-fixture";
import type { LineupSlot } from "@/lib/types/fantasy";

export function NextLock({ slot }: { slot: LineupSlot | null }) {
  return (
    <section>
      <h2 className="text-sm font-semibold tracking-tight text-foreground">Next lock</h2>
      {slot?.player.fixture ? (
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {slot.player.name}
            </p>
            <p className="label-system truncate text-[11px] text-foreground-tertiary">
              {slot.player.club.shortName} {fixtureOpponentLabel(slot.player)} ·{" "}
              {formatKickoff(slot.player.fixture.kickoff)}
            </p>
          </div>
          <Countdown
            target={slot.player.fixture.kickoff}
            className="label-system shrink-0 text-sm font-semibold text-accent"
          />
        </div>
      ) : (
        <p className="mt-2 text-sm text-foreground-tertiary">
          All starters are locked in for this matchday.
        </p>
      )}
    </section>
  );
}
