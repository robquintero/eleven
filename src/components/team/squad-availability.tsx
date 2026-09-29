import { availabilityLabel } from "@/lib/team-fixture";
import type { PlayerAvailability } from "@/lib/types/fantasy";
import { cn } from "@/lib/utils";

const order: PlayerAvailability[] = ["available", "doubtful", "injured", "suspended"];

const dotClass: Record<PlayerAvailability, string> = {
  available: "bg-foreground-tertiary",
  doubtful: "bg-warning",
  injured: "bg-destructive",
  suspended: "bg-destructive",
};

const textClass: Record<PlayerAvailability, string> = {
  available: "text-foreground-secondary",
  doubtful: "text-warning",
  injured: "text-destructive",
  suspended: "text-destructive",
};

export function SquadAvailability({
  counts,
}: {
  counts: Record<PlayerAvailability, number>;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold tracking-tight text-foreground">
        Squad availability
      </h2>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2">
        {order
          .filter((status) => counts[status] > 0)
          .map((status) => (
            <div key={status} className="flex items-center gap-1.5">
              <span className={cn("size-1.5 rounded-full", dotClass[status])} />
              <span className={cn("label-system text-xs", textClass[status])}>
                <span className="tabular-nums">{counts[status]}</span>{" "}
                {availabilityLabel[status]}
              </span>
            </div>
          ))}
      </div>
    </section>
  );
}
