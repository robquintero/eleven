import type { PlayerScoreBreakdown } from "@/data-access/players";
import { ScoringBreakdownV4 } from "./scoring-breakdown-v4";
import { cn } from "@/lib/utils";

/**
 * Pass 12C: "do not make the UI reverse-engineer a score; backend
 * scoring remains authoritative" — renders the stored
 * `fantasy_player_scores.breakdown` jsonb exactly as the scoring engine
 * computed it (src/domain/fantasy/scoring.ts), component by component,
 * for the player's most recently scored match. A modest Player Inspector
 * addition, not a new history browser — one match, not a per-match
 * archive.
 */
const COMPONENT_LABEL: Record<string, string> = {
  minutes: "MINUTES",
  goals: "GOALS",
  goalMilestoneBonus: "GOAL MILESTONE",
  assists: "ASSISTS",
  assistMilestoneBonus: "ASSIST MILESTONE",
  shotsOnTarget: "SHOTS ON TARGET",
  chancesCreated: "CHANCES CREATED",
  defensiveActions: "DEFENSIVE ACTIONS",
  saves: "SAVES",
  cleanSheet: "CLEAN SHEET",
  cards: "CARDS",
  shooting: "SHOTS ON TARGET", creation: "KEY PASSES", defending: "DEFENSIVE ACTIONS", goalkeeping: "SAVES", discipline: "CARDS",
};

const COMPONENT_ORDER = Object.keys(COMPONENT_LABEL);

export function ScoringBreakdown({ breakdown }: { breakdown: PlayerScoreBreakdown | null }) {
  if (!breakdown) {
    return <p className="text-xs text-foreground-tertiary">NO SCORED MATCH YET</p>;
  }

  if (breakdown.detail?.schema === 4) return <ScoringBreakdownV4 detail={breakdown.detail} opponent={breakdown.opponent} kickoffAt={breakdown.kickoffAt} />;

  const entries = COMPONENT_ORDER.map((key) => [key, breakdown.components[key] ?? 0] as const).filter(
    ([, value]) => value !== 0
  );

  return (
    <div>
      <p className="label-system text-[11px] text-foreground-tertiary">
        vs {breakdown.opponent} ({breakdown.isHome ? "H" : "A"}) · {new Date(breakdown.kickoffAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
      </p>
      {entries.length === 0 ? (
        <p className="mt-1.5 text-xs text-foreground-tertiary">No scoring events this match.</p>
      ) : (
        <div className="mt-1.5 space-y-1">
          {entries.map(([key, value]) => (
            <div key={key} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-foreground-secondary">{COMPONENT_LABEL[key]}</span>
              <span
                className={cn(
                  "tabular-nums font-medium",
                  value > 0 ? "text-live" : value < 0 ? "text-destructive" : "text-foreground-tertiary"
                )}
              >
                {value > 0 ? "+" : ""}
                {value}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2 text-sm font-semibold">
        <span className="text-foreground">TOTAL</span>
        <span className="tabular-nums text-foreground">{breakdown.total}</span>
      </div>
    </div>
  );
}
