import type { LeagueRecords } from "@/data-access/matchups";

/**
 * Only records derivable deterministically from completed matchups --
 * each row is omitted entirely (not shown as "—" or a guess) when its
 * underlying record is null, which only happens before any matchup has
 * been finalized. No narrative text, no power rankings, no streaks (not
 * authoritative from the current data model).
 */
export function LeagueRecordsList({ records }: { records: LeagueRecords }) {
  const rows: { label: string; node: React.ReactNode }[] = [];

  if (records.highestScore) {
    rows.push({
      label: "HIGHEST SCORE",
      node: (
        <>
          {records.highestScore.teamName}{" "}
          <span className="text-foreground-tertiary">· {records.highestScore.value.toFixed(1)} (RD {records.highestScore.roundNumber})</span>
        </>
      ),
    });
  }
  if (records.lowestScore) {
    rows.push({
      label: "LOWEST SCORE",
      node: (
        <>
          {records.lowestScore.teamName}{" "}
          <span className="text-foreground-tertiary">· {records.lowestScore.value.toFixed(1)} (RD {records.lowestScore.roundNumber})</span>
        </>
      ),
    });
  }
  if (records.largestMargin) {
    rows.push({
      label: "LARGEST MARGIN",
      node: (
        <>
          {records.largestMargin.teamName} over {records.largestMargin.opponentName}{" "}
          <span className="text-foreground-tertiary">· +{records.largestMargin.value.toFixed(1)}</span>
        </>
      ),
    });
  }
  if (records.closestMatchup) {
    rows.push({
      label: "CLOSEST MATCHUP",
      node: (
        <>
          {records.closestMatchup.teamName} vs {records.closestMatchup.opponentName}{" "}
          <span className="text-foreground-tertiary">· {records.closestMatchup.value.toFixed(1)} margin</span>
        </>
      ),
    });
  }
  if (records.mostPointsFor) {
    rows.push({
      label: "MOST POINTS FOR",
      node: (
        <>
          {records.mostPointsFor.teamName} <span className="text-foreground-tertiary">· {records.mostPointsFor.value.toFixed(1)}</span>
        </>
      ),
    });
  }
  if (records.mostPointsAgainst) {
    rows.push({
      label: "MOST POINTS AGAINST",
      node: (
        <>
          {records.mostPointsAgainst.teamName}{" "}
          <span className="text-foreground-tertiary">· {records.mostPointsAgainst.value.toFixed(1)}</span>
        </>
      ),
    });
  }

  if (rows.length === 0) {
    return <p className="p-4 text-center text-sm text-foreground-secondary">NO RESULTS YET</p>;
  }

  return (
    <div className="divide-y divide-border">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-3 px-4 py-2">
          <span className="label-system text-[10px] text-foreground-tertiary">{row.label}</span>
          <span className="truncate text-xs font-medium text-foreground">{row.node}</span>
        </div>
      ))}
    </div>
  );
}
