import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { TeamCrest } from "@/components/dashboard/team-crest";
import type { StandingsEntry } from "@/lib/types/fantasy";
import { cn } from "@/lib/utils";

export function StandingsPreview({
  entries,
  highlightTeamId,
}: {
  entries: StandingsEntry[];
  highlightTeamId?: string;
}) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Standings
        </h2>
        <Link
          href="/league"
          className="flex items-center gap-1 text-sm font-medium text-foreground-secondary transition-colors hover:text-foreground"
        >
          Full table
          <ArrowUpRight className="size-3.5" />
        </Link>
      </div>

      <div className="mt-2 divide-y divide-border">
        {entries.map(({ rank, team }) => (
          <div
            key={team.id}
            className={cn(
              "flex items-center gap-3 border-l-2 border-l-transparent py-3 pl-2 transition-colors",
              team.id === highlightTeamId
                ? "border-l-accent bg-accent/5"
                : "hover:bg-surface"
            )}
          >
            <span className="label-system w-4 shrink-0 text-sm font-medium text-foreground-tertiary">
              {rank}
            </span>
            <TeamCrest team={team} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {team.name}
              </p>
              <p className="label-system text-[11px] text-foreground-tertiary">
                {team.wins}-{team.losses}
                {team.draws ? `-${team.draws}` : ""}
              </p>
            </div>
            <span className="label-system shrink-0 text-sm font-semibold text-foreground">
              {team.pointsFor}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
