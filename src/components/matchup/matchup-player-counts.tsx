import { starterBuckets } from "@/lib/team-fixture";
import type { Squad } from "@/lib/types/fantasy";

/**
 * "Players live/locked/remaining for each manager" -- derived with the
 * existing `starterBuckets` selector (src/lib/team-fixture.ts), never a
 * second fixture-state tally. Per-side, not combined: knowing how many of
 * YOUR players are still to play vs. the opponent's is the actually
 * useful head-to-head read, not a single pooled number.
 *
 * Pass 14.6: previously showed LIVE/DONE/LEFT, where DONE meant only
 * `buckets.final` (an eligible fixture has actually finished) and LEFT
 * meant `buckets.upcoming + buckets.locked` -- silently LUMPING an
 * already-locked-but-not-yet-final player in with a genuinely still-
 * movable one under "LEFT". That produced "0 LIVE / 1 DONE / 10 LEFT"
 * for the exact same XI the status bar correctly called "0 LIVE / 9
 * LOCKED / 2 REMAINING" one scroll away. Now uses the SAME exclusive
 * three-way split as the status bar/Round Intelligence everywhere else:
 * LOCKED = `locked + final` (immovable, whether or not the fixture itself
 * has finished), REMAINING = `upcoming` (not yet locked). The three
 * columns always sum to the starting XI size.
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
        <span className="label-system text-[10px] text-foreground-tertiary">LOCKED</span>
        <span className="label-system text-[10px] text-foreground-tertiary">REMAINING</span>
      </div>
      <div className="divide-y divide-border">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[1fr_3.5rem_3.5rem_3.5rem] items-center gap-2 px-4 py-2 text-right">
            <span className="truncate text-left text-xs font-medium text-foreground">{row.label}</span>
            <span className="label-system text-sm font-semibold text-live">{row.buckets.live}</span>
            <span className="label-system text-sm font-semibold text-foreground-secondary">
              {row.buckets.locked + row.buckets.final}
            </span>
            <span className="label-system text-sm font-semibold text-foreground">{row.buckets.upcoming}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
