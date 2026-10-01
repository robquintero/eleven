import { starterBuckets } from "@/lib/team-fixture";
import type { Squad } from "@/lib/types/fantasy";

/**
 * "Players remaining/live/completed for each manager" -- derived with the
 * existing `starterBuckets` selector (src/lib/team-fixture.ts), never a
 * second fixture-state tally. Per-side, not combined: knowing how many of
 * YOUR players are still to play vs. the opponent's is the actually
 * useful head-to-head read, not a single pooled number.
 */
export function MatchupPlayerCounts({
  myTeamName,
  opponentTeamName,
  mySquad,
  opponentSquad,
}: {
  myTeamName: string;
  opponentTeamName: string;
  mySquad: Squad;
  opponentSquad: Squad;
}) {
  const mine = starterBuckets(mySquad.starters);
  const theirs = starterBuckets(opponentSquad.starters);

  const rows = [
    { label: myTeamName, buckets: mine },
    { label: opponentTeamName, buckets: theirs },
  ];

  return (
    <div className="border border-border">
      <div className="grid grid-cols-[1fr_3.5rem_3.5rem_3.5rem] items-center gap-2 border-b border-border px-4 py-2 text-right">
        <span />
        <span className="label-system text-[10px] text-foreground-tertiary">LIVE</span>
        <span className="label-system text-[10px] text-foreground-tertiary">DONE</span>
        <span className="label-system text-[10px] text-foreground-tertiary">LEFT</span>
      </div>
      <div className="divide-y divide-border">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[1fr_3.5rem_3.5rem_3.5rem] items-center gap-2 px-4 py-2 text-right">
            <span className="truncate text-left text-xs font-medium text-foreground">{row.label}</span>
            <span className="label-system text-sm font-semibold text-live">{row.buckets.live}</span>
            <span className="label-system text-sm font-semibold text-foreground-secondary">{row.buckets.final}</span>
            <span className="label-system text-sm font-semibold text-foreground">
              {row.buckets.upcoming + row.buckets.locked}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
