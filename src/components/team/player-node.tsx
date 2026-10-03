import { Lock } from "lucide-react";
import { PlayerAvatar } from "@/components/players/player-avatar";
import type { Player } from "@/lib/types/fantasy";
import { cn } from "@/lib/utils";
import { availabilityLabel, formatRoundPoints, fixtureOpponentLabel, surnameFor } from "@/lib/team-fixture";

/**
 * Pass 14.5: round points are the node's most prominent datum (brief
 * §Phase 1 "the most important number on each player row is CURRENT
 * FANTASY POINTS"), with the READY/LOCKED/LIVE/FT word as a smaller
 * second line underneath — never merged into one string the way the pre-
 * Pass-14.5 version did ("FT · 4.5").
 */
function NodeStatus({ player }: { player: Player }) {
  if (player.availability === "injured" || player.availability === "suspended") {
    return (
      <span className="label-system text-[9px] font-semibold text-destructive">
        {availabilityLabel[player.availability]}
      </span>
    );
  }

  const fixture = player.fixture;
  const points = (
    <span className="text-xs font-semibold tabular-nums text-foreground">{formatRoundPoints(player.fantasyPoints)}</span>
  );

  if (!fixture) {
    return <span className="flex flex-col items-center">{points}</span>;
  }

  if (fixture.state === "live") {
    return (
      <span className="flex flex-col items-center gap-0.5">
        {points}
        <span className="flex items-center gap-1 text-[9px] font-semibold text-live">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-live" />
          </span>
          LIVE
        </span>
      </span>
    );
  }

  if (fixture.state === "locked") {
    return (
      <span className="flex flex-col items-center gap-0.5">
        {points}
        <span className="label-system flex items-center gap-1 text-[9px] text-foreground-tertiary">
          <Lock className="size-2.5" strokeWidth={2} />
          LOCKED
        </span>
      </span>
    );
  }

  if (fixture.state === "final") {
    return (
      <span className="flex flex-col items-center gap-0.5">
        {points}
        <span className="label-system text-[9px] text-foreground-tertiary">FT</span>
      </span>
    );
  }

  return (
    <span className="flex flex-col items-center gap-0.5">
      {points}
      <span className="label-system text-[9px] text-foreground-tertiary">
        {fixtureOpponentLabel(player)}
      </span>
    </span>
  );
}

export function PlayerNode({
  player,
  editing = false,
  selected = false,
  swapTarget = false,
  substituting = false,
  locked = false,
  onSelect,
}: {
  player: Player;
  editing?: boolean;
  selected?: boolean;
  swapTarget?: boolean;
  /** Pass 10.5C.5A: this exact node is the outgoing half of an in-flight substitution — the authenticated write hasn't resolved yet, so the real player/status stay exactly as they are underneath a restrained processing treatment, never an optimistic swap to the replacement. */
  substituting?: boolean;
  /** Pass 14.5: this starter's lineup slot has already locked (brief §Phase 1: "locked players must not visually imply they are draggable/selectable/swappable" while editing). Presentation only -- `team-workspace.tsx` already enforces the real rule server-side; this never disables the click itself, since the parent still needs it to fire its explanatory error. */
  locked?: boolean;
  onSelect: () => void;
}) {
  const isFlagged =
    player.availability === "injured" || player.availability === "suspended";
  const isDoubtful = player.availability === "doubtful";

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={substituting}
      title={player.name}
      aria-busy={substituting}
      className={cn(
        "flex w-16 flex-col items-center gap-1 rounded-xl py-1 text-center transition-all sm:w-20",
        editing && !substituting && !locked && "cursor-pointer",
        editing && locked && "cursor-not-allowed",
        substituting && "cursor-wait",
        selected && "ring-2 ring-accent ring-offset-2 ring-offset-surface-elevated",
        swapTarget && !selected && !locked && "ring-2 ring-accent/40"
      )}
    >
      <span className={cn("relative flex shrink-0 transition-opacity duration-200", substituting && "opacity-50")}>
        <PlayerAvatar name={player.name} nationality={player.nationality} size="pitch" />
        {substituting ? (
          <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <span className="size-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </span>
        ) : (
          <>
            {isFlagged && (
              <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-surface-elevated bg-destructive" />
            )}
            {isDoubtful && !isFlagged && (
              <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-surface-elevated bg-warning" />
            )}
            {locked && !isFlagged && !isDoubtful && (
              <span className="absolute -top-0.5 -right-0.5 flex size-2.5 items-center justify-center rounded-full border-2 border-surface-elevated bg-muted">
                <Lock className="size-1.5 text-foreground-tertiary" strokeWidth={3} aria-hidden="true" />
              </span>
            )}
          </>
        )}
      </span>

      <span className="w-full truncate text-xs font-semibold text-foreground sm:text-sm">
        {surnameFor(player.name)}
      </span>

      <span className="label-system w-full truncate text-[9px] text-foreground-tertiary">
        {player.club.shortName} · {player.position}
      </span>

      {substituting ? (
        <span className="label-system flex items-center gap-1 text-[9px] font-semibold text-accent">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
          </span>
          SUBSTITUTING
        </span>
      ) : (
        <NodeStatus player={player} />
      )}
    </button>
  );
}
