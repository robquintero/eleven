import { SCORING_V1_WEIGHTS } from "@/domain/fantasy/scoring-v1";
import { SCORING_V2_WEIGHTS } from "@/domain/fantasy/scoring";

export function HistoricalScoringRules({ version }: { version: "ELEVEN_STANDARD_V1" | "ELEVEN_STANDARD_V2" }) {
  const w = version === "ELEVEN_STANDARD_V1" ? SCORING_V1_WEIGHTS : SCORING_V2_WEIGHTS;
  const rows = [
    ["Appearance (1–59 min)", `+${w.minutes.appearance}`], ["60+ min", `+${w.minutes.significant}`],
    ...Object.entries(w.goalsByPosition).map(([p, points]) => [`Goal — ${p}`, `+${points}`]),
    ["Assist", `+${w.assist}`], ["Shot on target", `+${w.shotOnTarget}`], ["Key pass", `+${w.keyPass}`],
    ["Tackle / interception / block", `+${w.defensiveAction}`], ["Saves", `+1 per ${w.savesPerPoint} (whole groups)`],
    ...Object.entries(w.cleanSheetByPosition).map(([p, points]) => [`Clean sheet — ${p}`, `+${points}`]),
    ["Yellow card", w.yellowCard], ["Red card", w.redCard],
  ];
  return <section className="border-t border-border pt-3">
    <h3 className="label-system text-[11px] text-foreground-secondary">SCORING — {version.replace("ELEVEN_STANDARD_", "")}</h3>
    {rows.map(([label, value]) => <div key={label} className="flex justify-between gap-3 py-0.5 text-xs"><span>{label}</span><span className="tabular-nums">{value}</span></div>)}
    <p className="mt-1 text-xs text-foreground-tertiary">Clean sheet requires {w.cleanSheetMinutesThreshold}+ minutes and the whole fixture ending with no goals conceded by your side.</p>
    {version === "ELEVEN_STANDARD_V2" && <p className="mt-1 text-xs text-foreground-tertiary">2+ goals: bonus goals² − 1. 2+ assists: bonus n(n + 1)/2 − 1.</p>}
  </section>;
}
