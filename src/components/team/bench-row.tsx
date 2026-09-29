import { availabilityLabel, playerFixtureCode } from "@/lib/team-fixture";
import type { Player } from "@/lib/types/fantasy";
import { cn } from "@/lib/utils";

function statusLabel(player: Player) {
  if (player.availability === "injured" || player.availability === "suspended") {
    return { text: availabilityLabel[player.availability], tone: "destructive" as const };
  }
  if (player.availability === "doubtful") {
    return { text: availabilityLabel.doubtful, tone: "warning" as const };
  }

  const fixture = player.fixture;
  if (!fixture) return { text: availabilityLabel.available, tone: "neutral" as const };

  if (fixture.state === "live") {
    return { text: `LIVE ${player.fantasyPoints}`, tone: "live" as const };
  }
  if (fixture.state === "locked") {
    return { text: "LOCKED", tone: "neutral" as const };
  }
  if (fixture.state === "final") {
    return { text: `FT · ${player.fantasyPoints}`, tone: "neutral" as const };
  }
  return { text: availabilityLabel.available, tone: "neutral" as const };
}

const toneClass = {
  destructive: "text-destructive",
  warning: "text-warning",
  live: "text-live",
  neutral: "text-foreground-tertiary",
};

export function BenchRow({
  index,
  player,
  editing = false,
  selected = false,
  swapTarget = false,
  onSelect,
}: {
  index: number;
  player: Player;
  editing?: boolean;
  selected?: boolean;
  swapTarget?: boolean;
  onSelect: () => void;
}) {
  const isFlagged =
    player.availability === "injured" || player.availability === "suspended";
  const isDoubtful = player.availability === "doubtful";
  const status = statusLabel(player);
  const isLive = status.tone === "live";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "grid w-full grid-cols-[1.25rem_2.25rem_1fr_auto] items-center gap-3 rounded-lg py-2.5 pr-2 pl-1 text-left transition-colors sm:grid-cols-[1.25rem_2.25rem_1fr_3rem_4.5rem_5rem]",
        editing && "cursor-pointer",
        selected && "bg-accent/10 ring-1 ring-accent",
        swapTarget && !selected && "bg-accent/5 ring-1 ring-accent/30"
      )}
    >
      <span className="label-system text-[11px] text-foreground-tertiary">
        {String(index + 1).padStart(2, "0")}
      </span>

      <span className="label-system flex w-9 shrink-0 items-center justify-center rounded-md bg-muted py-1 text-[11px] font-semibold text-foreground-secondary">
        {player.position}
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
          {player.name}
          {isFlagged && (
            <span className="size-1.5 shrink-0 rounded-full bg-destructive" />
          )}
          {isDoubtful && (
            <span className="size-1.5 shrink-0 rounded-full bg-warning" />
          )}
        </p>
        <p className="label-system truncate text-[11px] text-foreground-tertiary sm:hidden">
          {player.club.shortName} · {playerFixtureCode(player)}
        </p>
      </div>

      <span className="label-system hidden text-xs text-foreground-tertiary sm:block">
        {player.club.shortName}
      </span>

      <span className="label-system hidden text-xs text-foreground-tertiary sm:block">
        {playerFixtureCode(player)}
      </span>

      <span
        className={cn(
          "label-system flex items-center justify-end gap-1.5 text-xs font-semibold",
          toneClass[status.tone]
        )}
      >
        {isLive && (
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-live" />
          </span>
        )}
        <span className="tabular-nums">{status.text}</span>
      </span>
    </button>
  );
}
