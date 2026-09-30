import type { FantasyRound } from "@/lib/types/fantasy";
import { formatDeadline, greetingForHour } from "@/lib/time";
import { pad2 } from "@/lib/team-fixture";

export function Greeting({
  managerName,
  teamName,
  leagueName,
  round,
}: {
  managerName: string;
  teamName: string;
  leagueName: string;
  /** `null` when the league has no active fantasy round yet — no round
   * scheduler exists (Pass 8+), so this is `null` for every league today. */
  round: FantasyRound | null;
}) {
  const greeting = greetingForHour(new Date().getHours());

  return (
    <div>
      <p className="text-sm text-foreground-tertiary">
        {greeting}, {managerName}
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {teamName}
      </h1>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm text-foreground-secondary">
        <span>{leagueName}</span>
        <span className="text-foreground-tertiary">·</span>
        {round ? (
          <>
            <span className="label-system text-xs text-foreground-tertiary">
              MATCHDAY {pad2(round.number)}
            </span>
            {round.deadline && (
              <>
                <span className="text-foreground-tertiary">·</span>
                <span className="label-system text-xs text-foreground-tertiary">
                  LOCKS {formatDeadline(round.deadline)}
                </span>
              </>
            )}
          </>
        ) : (
          <span className="label-system text-xs text-foreground-tertiary">
            NO ACTIVE ROUND
          </span>
        )}
      </p>
    </div>
  );
}
