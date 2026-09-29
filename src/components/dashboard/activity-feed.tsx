import {
  ArrowLeftRight,
  ListChecks,
  Shirt,
  UserMinus,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import type { ActivityEntry } from "@/data-access/transactions";
import { formatRelativeTime } from "@/lib/time";

const activityIcons: Record<string, LucideIcon> = {
  draft_pick: ListChecks,
  free_agent_add: UserPlus,
  waiver_add: UserPlus,
  drop: UserMinus,
  trade: ArrowLeftRight,
  commissioner_move: Shirt,
};

const activityLabel: Record<string, string> = {
  draft_pick: "made a draft pick",
  free_agent_add: "added a free agent",
  waiver_add: "won a waiver claim",
  drop: "dropped a player",
  trade: "completed a trade",
  commissioner_move: "made a commissioner move",
};

/** Real `transactions` rows only — `[]` (rendered as "NO ACTIVITY YET") for every league today, since no draft/waiver/trade engine writes any yet. */
export function ActivityFeed({ items }: { items: ActivityEntry[] }) {
  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-foreground-tertiary">NO ACTIVITY YET</p>
    );
  }

  return (
    <div className="divide-y divide-border">
      {items.map((item) => {
        const Icon = activityIcons[item.type] ?? ListChecks;
        return (
          <div key={item.id} className="flex items-start gap-3 py-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground-secondary">
              <Icon className="size-4" strokeWidth={1.75} />
            </span>
            <p className="min-w-0 flex-1 text-sm text-foreground">
              <span className="font-medium">{item.fantasyTeamName ?? "Commissioner"}</span>{" "}
              <span className="text-foreground-secondary">
                {activityLabel[item.type] ?? item.type}
              </span>
            </p>
            <span className="label-system shrink-0 text-[11px] text-foreground-tertiary">
              {formatRelativeTime(item.createdAt)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
