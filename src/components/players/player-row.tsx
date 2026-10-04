import { Lock } from "lucide-react";
import { leagueLabels } from "@/lib/leagues";
import { MarketAction } from "@/components/players/market-action";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { formatRoundPoints, isPlayerLocked, playerStateWord, POSITION_BADGE_CLASS } from "@/lib/team-fixture";
import type { Player } from "@/lib/types/fantasy";
import { cn } from "@/lib/utils";

const toneClass = {
  destructive: "text-destructive",
  warning: "text-warning",
  live: "text-live",
  neutral: "text-foreground-tertiary",
};

/**
 * Pass 11: the Players page is the free-agent market — `onAdd`/`onDrop`
 * are optional specifically so this same row (also used by Home's
 * Starting XI, which has no market context at all) only grows a market
 * action where one is actually wired up. The action button is a nested
 * `<button>` with `stopPropagation` so clicking ADD/DROP never also
 * triggers the row's own `onSelect` (opening the player drawer) —
 * "never expose an action that can't succeed," so OWNED (by someone
 * else) renders a truthful label, never a disabled button pretending an
 * action exists.
 */
export function PlayerRow({
  player,
  selected = false,
  onSelect,
  onAdd,
  onDrop,
  actionPending = false,
}: {
  player: Player;
  selected?: boolean;
  onSelect?: () => void;
  onAdd?: () => void;
  onDrop?: () => void;
  actionPending?: boolean;
}) {
  // Pass 14.5: restrained lock state -- only meaningful where `fixture` is
  // populated (a real current-round starter, e.g. Home's Starting XI);
  // the Players market has no round/fixture context, so `locked` is
  // always false there and this row renders exactly as before.
  const locked = isPlayerLocked(player);
  const state = playerStateWord(player);

  return (
    <div
      className={cn(
        "flex w-full items-center gap-3 border-l-2 border-l-transparent py-3 pr-1 pl-2 transition-colors",
        selected
          ? "border-l-accent bg-accent/10"
          : // Pass 14.7 Phase 1: "locked does not mean visually dead" -- a
            // locked row keeps its own restrained tint AND still responds
            // to hover/focus when it's genuinely clickable (opens the
            // player record), just distinctly from the plain hover state.
            locked
            ? "bg-foreground/2 hover:bg-foreground/5"
            : "hover:bg-surface"
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        <PlayerAvatar name={player.name} nationality={player.nationality} size="sm" />

        <span
          className={cn(
            "label-system flex w-9 shrink-0 items-center justify-center rounded-md py-1 text-[11px] font-semibold",
            POSITION_BADGE_CLASS[player.position]
          )}
        >
          {player.position}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {player.name}
          </p>
          <p className="label-system truncate text-[11px] text-foreground-tertiary">
            {player.club.shortName} · {leagueLabels[player.club.league]}
          </p>
        </div>

        {/* Pass 14.5: round points are the most prominent value on the
            row -- a known "0.0" (not a blank/missing-looking dash) when
            the player's fixture hasn't produced anything yet, with the
            READY/LOCKED/LIVE/FT status as a smaller, secondary line
            underneath so the two concepts never collapse into one
            ambiguous string. */}
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="label-system tabular-nums text-sm font-semibold text-foreground">
            {formatRoundPoints(player.fantasyPoints)}
          </span>
          {player.fixture && (
            <span className={cn("label-system flex items-center gap-1 text-[10px]", toneClass[state.tone])}>
              {state.tone === "live" && (
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-live" />
                </span>
              )}
              {locked && <Lock className="size-2.5" strokeWidth={2} aria-hidden="true" />}
              {state.text}
            </span>
          )}
          {Boolean(player.preAcquisitionPoints) && (
            <span
              className="label-system text-[9px] text-warning"
              title="Points earned before this player joined your squad do not count toward your matchup."
            >
              +{formatRoundPoints(player.preAcquisitionPoints!)} PRE-ACQUISITION
            </span>
          )}
        </div>
      </button>

      {(onAdd || onDrop) && (
        <MarketAction
          player={player}
          onAdd={onAdd ? () => onAdd() : undefined}
          onDrop={onDrop ? () => onDrop() : undefined}
          pending={actionPending}
        />
      )}
    </div>
  );
}
