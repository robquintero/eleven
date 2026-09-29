import { availabilityLabel } from "@/lib/team-fixture";
import type { PlayerAvailability } from "@/lib/types/fantasy";
import { cn } from "@/lib/utils";

const toneClass: Record<PlayerAvailability, string> = {
  available: "text-foreground-tertiary",
  doubtful: "text-warning",
  injured: "text-destructive",
  suspended: "text-destructive",
};

export function AvailabilityStatus({
  availability,
  className,
}: {
  availability?: PlayerAvailability;
  className?: string;
}) {
  const status = availability ?? "available";
  return (
    <span className={cn("label-system text-xs font-semibold", toneClass[status], className)}>
      {availabilityLabel[status]}
    </span>
  );
}
