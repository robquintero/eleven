import {
  ArrowLeftRight,
  ListChecks,
  Shirt,
  UserMinus,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import type { ActivityItem, ActivityType } from "@/lib/types/fantasy";
import { formatRelativeTime } from "@/lib/time";

const activityIcons: Record<ActivityType, LucideIcon> = {
  "draft-pick": ListChecks,
  "waiver-add": UserPlus,
  "waiver-drop": UserMinus,
  trade: ArrowLeftRight,
  "lineup-set": Shirt,
};

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        Recent activity
      </h2>

      <div className="mt-2 divide-y divide-border">
        {items.map((item) => {
          const Icon = activityIcons[item.type];
          return (
            <div key={item.id} className="flex items-start gap-3 py-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground-secondary">
                <Icon className="size-4" strokeWidth={1.75} />
              </span>
              <p className="min-w-0 flex-1 text-sm text-foreground">
                <span className="font-medium">{item.team.name}</span>{" "}
                <span className="text-foreground-secondary">
                  {item.description}
                </span>
              </p>
              <span className="label-system shrink-0 text-[11px] text-foreground-tertiary">
                {formatRelativeTime(item.timestamp)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
