import { PlayerAvatar } from "@/components/players/player-avatar";
import { playerStatusLabel } from "@/lib/team-fixture";
import type { Player, PlayerPosition } from "@/lib/types/fantasy";
import { cn } from "@/lib/utils";

const POSITION_LETTER: Record<PlayerPosition, string> = { GK: "G", DEF: "D", MID: "M", FWD: "F" };

const toneClass = {
  destructive: "text-destructive",
  warning: "text-warning",
  live: "text-live",
  neutral: "text-foreground-tertiary",
};

/**
 * Pass 12F: the narrow-viewport row for the Matchup page's head-to-head
 * comparison — designed to sit in a HALF-width column on a normal phone
 * (so both teams stay side by side, per the brief's explicit requirement)
 * without horizontal scroll or illegible text. Deliberately sheds detail
 * `BenchRow` shows at full width (club name, full position word, a wider
 * status string) rather than shrinking the same layout until it breaks —
 * a single position letter, a small avatar, the name, and a compact
 * points/status readout. Tapping still opens the exact same
 * `PlayerInspector` every other row uses — nothing here is lost, only
 * deferred one tap away. Reuses `playerStatusLabel` (src/lib/team-fixture.ts)
 * so the status shown is never a second, divergent truth from `BenchRow`'s
 * own full-width row.
 */
export function MatchupCompactRow({ player, onSelect }: { player: Player; onSelect: () => void }) {
  const status = playerStatusLabel(player);
  const isLive = status.tone === "live";
  const isFlagged = player.availability === "injured" || player.availability === "suspended";
  const isDoubtful = player.availability === "doubtful";

  // The full status string ("LIVE 12.5", "FT · 12.5") is too wide for a
  // ~140px column — shown in full via the accessible label, but visually
  // only the number (or a compact fallback) renders in the row itself.
  const compactStatus = isLive || status.text.startsWith("FT") ? (player.fantasyPoints ?? 0).toFixed(1) : status.tone === "neutral" && status.text === "LOCKED" ? "🔒" : "–";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`${player.name}, ${player.position}, ${status.text}`}
      className="flex w-full items-center gap-1 rounded-md px-1 py-1.5 text-left transition-colors active:bg-muted/60"
    >
      <span className="label-system w-2.5 shrink-0 text-center text-[8px] font-semibold text-foreground-tertiary">
        {POSITION_LETTER[player.position]}
      </span>
      <PlayerAvatar name={player.name} nationality={player.nationality} size="sm" />
      <span className="flex min-w-0 flex-1 items-center gap-1 truncate text-[11px] font-medium text-foreground">
        {player.name}
        {isFlagged && <span className="size-1 shrink-0 rounded-full bg-destructive" />}
        {isDoubtful && <span className="size-1 shrink-0 rounded-full bg-warning" />}
      </span>
      <span className={cn("label-system flex shrink-0 items-center gap-0.5 text-[10px] font-semibold tabular-nums", toneClass[status.tone])}>
        {isLive && (
          <span className="relative flex size-1">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-75" />
            <span className="relative inline-flex size-1 rounded-full bg-live" />
          </span>
        )}
        {compactStatus}
      </span>
    </button>
  );
}
