import type { FantasyScoreBreakdownV4 } from "@/domain/fantasy/scoring-v4";
import { cn } from "@/lib/utils";

export function ScoringBreakdownV4({ detail, opponent, kickoffAt }: { detail: FantasyScoreBreakdownV4; opponent: string; kickoffAt?: string }) {
  const entries = detail.entries.filter(entry => entry.units !== 0);
  const categories = [...new Set(entries.map(entry => entry.category))];
  return <div className="min-w-0">
    <p className="label-system text-[10px] text-foreground-tertiary">V4 · vs {opponent} · {detail.position}{kickoffAt ? ` · ${new Date(kickoffAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}</p>
    {categories.map(category => <section key={category} className="mt-2">
      <div className="label-system flex justify-between gap-2 text-[10px] text-foreground-secondary"><span>{category}</span><span>{(entries.filter(entry => entry.category === category).reduce((n, entry) => n + entry.units, 0) / 100).toFixed(2)}</span></div>
      {entries.filter(entry => entry.category === category).map(entry => <div key={entry.key} className="flex min-w-0 items-start justify-between gap-2 py-0.5 text-xs">
        <div className="min-w-0"><span className="text-foreground-secondary">{entry.label}</span><p className="text-[10px] text-foreground-tertiary">{entry.key === "minutes" ? `${entry.count} min · appearance tier` : `${entry.count} × ${(entry.unitsPerEvent / 100).toFixed(2)}${entry.multiplier !== 1 ? ` × ${detail.position} ${entry.multiplier.toFixed(2)}` : ""}`}</p></div>
        <span className={cn("shrink-0 tabular-nums", entry.units < 0 ? "text-destructive" : "text-live")}>{entry.units > 0 ? "+" : ""}{(entry.units / 100).toFixed(2)}</span>
      </div>)}
    </section>)}
    {entries.length === 0 && <p className="mt-1 text-xs text-foreground-tertiary">No scoring events this match.</p>}
    {detail.unavailable.length > 0 && <p className="mt-2 text-[10px] text-foreground-tertiary">Some statistics were unavailable. No points were estimated.</p>}
    <div className="mt-2 flex justify-between gap-2 border-t border-border pt-2 text-sm font-semibold"><span>TOTAL</span><span className="tabular-nums">{(detail.totalUnits / 100).toFixed(2)}</span></div>
  </div>;
}
