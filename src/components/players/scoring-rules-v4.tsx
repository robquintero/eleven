import { SCORING_V4_STATS, SCORING_V4_WEIGHTS } from "@/domain/fantasy/scoring-v4";

/** Canonical V4 rules, rendered from the unchanged scorer constants. */
export function ScoringRulesV4() {
  const categories = [...new Set(SCORING_V4_STATS.map(rule => rule.category))];
  return <section className="min-w-0 border-t border-border pt-3">
    <h3 className="label-system text-[11px] font-semibold text-foreground-secondary">SCORING — ELEVEN STANDARD V4</h3>
    <p className="mt-2 text-xs text-foreground-tertiary">Events stack: Shot + Shot on Target + Goal, Foul Drawn + Penalty Won, and Save + Penalty Saved. No goal or assist milestone bonus applies.</p>
    {categories.map(category => <div key={category} className="mt-3">
      <h4 className="label-system text-[10px] text-foreground-secondary">{category}</h4>
      {SCORING_V4_STATS.filter(rule => rule.category === category).map(rule => <div key={rule.key} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-0.5 text-xs">
        <span className="text-foreground-tertiary">{rule.label}{rule.goalkeeperOnly ? " (GK)" : ""}</span>
        <span className="label-system tabular-nums text-foreground">{rule.positionUnits ? Object.entries(rule.positionUnits).map(([p, units]) => `${p} +${(units / 100).toFixed(2)}`).join(" · ") : `${rule.units > 0 ? "+" : ""}${(rule.units / 100).toFixed(2)}`}</span>
      </div>)}
      {category === "GOALKEEPING" && <p className="mt-1 text-xs text-foreground-tertiary">Clean sheet: GK +{SCORING_V4_WEIGHTS.cleanSheet.GK / 100}, DEF +{SCORING_V4_WEIGHTS.cleanSheet.DEF / 100}, MID +{SCORING_V4_WEIGHTS.cleanSheet.MID / 100}; requires {SCORING_V4_WEIGHTS.cleanSheetMinutesThreshold}+ minutes and your side conceding zero in the whole fixture. FWD earns zero. Leaving before a later concession does not preserve credit; entering after a concession does not restore it.</p>}
      {category === "DISCIPLINE / OTHER" && <p className="mt-1 text-xs text-foreground-tertiary">Appearance: +{SCORING_V4_WEIGHTS.minutes.appearance / 100} at 1–59 minutes, +{SCORING_V4_WEIGHTS.minutes.significant / 100} at 60–89, +{SCORING_V4_WEIGHTS.minutes.fullMatch / 100} at 90+. These tiers replace one another.</p>}
    </div>)}
    <h4 className="label-system mt-3 text-[10px] text-foreground-secondary">POSITIONAL MULTIPLIERS</h4>
    <p className="mt-1 text-xs text-foreground-tertiary">Tackles, interceptions and blocks: GK ×0.50 / DEF ×0.50 / MID ×0.25 / FWD ×0.10 on a +1 base. Duels Won is a separate category with its own positional rate. Missing statistics contribute no points and are shown as unavailable; they are never estimated. Unsupported statistics, including ratings and passing accuracy, are not scored.</p>
  </section>;
}
