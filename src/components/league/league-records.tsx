import { formatRoundPoints } from "@/lib/team-fixture";
import type { LeagueRecords } from "@/data-access/matchups";

/** Official final-only records. Null records are omitted, never invented. */
export function LeagueRecordsList({ records }: { records: LeagueRecords }) {
  const rows: { label: string; value: string; team: string; detail?: string }[] = [];
  const { highestScore: high, lowestScore: low, largestMargin: margin, closestMatchup: close, mostPointsFor: pointsFor, mostPointsAgainst: against } = records;
  if (high) rows.push({ label: "Highest score", value: formatRoundPoints(high.value), team: high.teamName, detail: `Round ${high.roundNumber} · vs ${high.opponentName}` });
  if (low) rows.push({ label: "Lowest score", value: formatRoundPoints(low.value), team: low.teamName, detail: `Round ${low.roundNumber} · vs ${low.opponentName}` });
  if (margin) rows.push({ label: "Biggest win", value: `+${formatRoundPoints(margin.value)}`, team: margin.teamName, detail: `Over ${margin.opponentName}` });
  if (close) rows.push({ label: "Closest matchup", value: formatRoundPoints(close.value), team: close.teamName, detail: `Margin · vs ${close.opponentName}` });
  if (pointsFor) rows.push({ label: "Most points for", value: formatRoundPoints(pointsFor.value), team: pointsFor.teamName });
  if (against) rows.push({ label: "Most points against", value: formatRoundPoints(against.value), team: against.teamName });
  if (!rows.length) return <p className="v2-secondary px-5 pb-6">Records appear after the first official result.</p>;
  return <div className="v2-records">{rows.map(row => <div key={row.label} className="v2-record">
    <p className="v2-secondary">{row.label}</p><p className="v2-record-value v2-number">{row.value}</p>
    <p className="text-[13px] font-medium [overflow-wrap:anywhere]">{row.team}</p>{row.detail && <p className="v2-meta mt-1 [overflow-wrap:anywhere]">{row.detail}</p>}
  </div>)}</div>;
}
