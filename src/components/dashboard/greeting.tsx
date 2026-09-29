import type { FantasyLeague, FantasyRound } from "@/lib/types/fantasy";
import { formatDeadline, greetingForHour } from "@/lib/time";
import { pad2 } from "@/lib/team-fixture";

export function Greeting({
  managerName,
  teamName,
  league,
  round,
}: {
  managerName: string;
  teamName: string;
  league: FantasyLeague;
  round: FantasyRound;
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
        <span>{league.name}</span>
        <span className="text-foreground-tertiary">·</span>
        <span className="label-system text-xs text-foreground-tertiary">
          MATCHDAY {pad2(round.number)}
        </span>
        <span className="text-foreground-tertiary">·</span>
        <span className="label-system text-xs text-foreground-tertiary">
          LOCKS {formatDeadline(round.deadline)}
        </span>
      </p>
    </div>
  );
}
