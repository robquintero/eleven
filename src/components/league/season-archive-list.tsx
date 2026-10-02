import Link from "next/link";
import { Trophy } from "lucide-react";
import type { SeasonListEntry } from "@/data-access/seasons";
import { SCHEDULE_CYCLES_LABEL } from "@/domain/fantasy/season";
import { cn } from "@/lib/utils";

/**
 * Pass 12B's "minimal historical season experience" (brief §1): every
 * season this league has ever had, most recent first, linking into its
 * own detail page. Deliberately NOT a Club Legacy/trophy-cabinet UI —
 * just enough to inspect a completed season's own identity and open its
 * final table/results.
 */
export function SeasonArchiveList({ seasons }: { seasons: SeasonListEntry[] }) {
  if (seasons.length <= 1) {
    return <p className="p-4 text-center text-sm text-foreground-secondary">NO PAST SEASONS YET</p>;
  }

  return (
    <div className="divide-y divide-border">
      {seasons.map((season) => (
        <Link
          key={season.id}
          href={`/league/seasons/${season.seasonNumber}`}
          className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/50"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              Season {season.seasonNumber}
              {season.rosterMode && (
                <span className="label-system ml-2 text-[10px] text-foreground-tertiary">{season.rosterMode.replace("_", " ")}</span>
              )}
            </p>
            <p className="label-system mt-0.5 text-[10px] text-foreground-tertiary">
              {SCHEDULE_CYCLES_LABEL[season.scheduleCycles]}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {season.championTeamName && (
              <span className="flex items-center gap-1 text-xs text-foreground-secondary">
                <Trophy className="size-3.5 text-accent" strokeWidth={1.75} />
                {season.championTeamName}
              </span>
            )}
            <span
              className={cn(
                "label-system text-[10px]",
                season.status === "COMPLETED" ? "text-accent" : season.status === "ACTIVE" ? "text-live" : "text-foreground-tertiary"
              )}
            >
              {season.status}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
