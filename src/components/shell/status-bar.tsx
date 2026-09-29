"use client";

import { Countdown } from "@/components/football/countdown";
import { currentRound } from "@/lib/mock/dashboard";
import { roundFixtures } from "@/lib/mock/fixtures";
import { squad } from "@/lib/mock/team";
import { nextLock, pad2 } from "@/lib/team-fixture";

/** Desktop-only operational strip — system status for the active round. */
export function StatusBar() {
  const complete = roundFixtures.filter((f) => f.state === "final").length;
  const live = roundFixtures.filter((f) => f.state === "live" || f.state === "ht").length;
  const lock = nextLock(squad.starters);

  return (
    <div className="hidden items-center gap-5 border-t border-border px-4 py-1.5 lg:flex lg:px-8">
      <span className="label-system text-[10px] text-foreground-tertiary">
        MATCHDAY {pad2(currentRound.number)}
      </span>
      <span className="label-system text-[10px] text-foreground-tertiary">
        {complete} / {roundFixtures.length} FIXTURES COMPLETE
      </span>
      <span className="label-system flex items-center gap-1.5 text-[10px] text-foreground-tertiary">
        {live > 0 && (
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-live" />
          </span>
        )}
        LIVE {pad2(live)}
      </span>
      {lock?.player.fixture && (
        <span className="label-system ml-auto flex items-center gap-1.5 text-[10px] text-foreground-tertiary">
          NEXT LOCK
          <Countdown
            target={lock.player.fixture.kickoff}
            className="text-foreground-secondary"
          />
        </span>
      )}
    </div>
  );
}
