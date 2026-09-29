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
    <div className="divide-y divide-border">
      {order
        .filter((status) => counts[status] > 0)
        .map((status) => (
          <div key={status} className="flex items-center justify-between py-1.5">
            <span className="flex items-center gap-1.5">
              <span className={cn("size-1.5 rounded-full", dotClass[status])} />
              <span className={cn("label-system text-[11px]", textClass[status])}>
                {availabilityLabel[status]}
              </span>
            </span>
            <span className={cn("label-system text-sm font-semibold tabular-nums", textClass[status])}>
              {counts[status]}
            </span>
          </div>
        ))}
    </div>
  );
}
