import { TeamCrest } from "@/components/dashboard/team-crest";
import { OperationalRow } from "@/components/football/operational-row";
import { pad2, starterBuckets } from "@/lib/team-fixture";
import type { LineupSlot, Matchup } from "@/lib/types/fantasy";

function record(team: Matchup["homeTeam"]) {
  return `${team.wins}-${team.losses}${team.draws ? `-${team.draws}` : ""}`;
}

function TeamColumn({
  team,
  align,
}: {
  team: Matchup["homeTeam"];
  align: "start" | "end";
}) {
  return (
    <div
      className={`flex items-center gap-3 ${
        align === "end" ? "flex-row-reverse text-right" : "text-left"
      }`}
    >
      <TeamCrest team={team} size="lg" className="hidden sm:flex" />
      <TeamCrest team={team} size="md" className="sm:hidden" />
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold text-foreground sm:text-base">
          {team.name}
        </p>
        <p className="text-xs text-foreground-tertiary">
          <span className="label-system tabular-nums">{record(team)}</span>{" "}
          · {team.manager.displayName}
        </p>
      </div>
    </div>
  );
}

/**
 * Dashboard's primary work surface — the matchup, integrated with the
 * round's real lineup-lock data rather than presented as a standalone
 * floating hero. Replaces the old `MatchupHero` + `RoundStatus` split: the
 * score stays the emotional centerpiece, but SCORE/PROJECTED/ACTIVE/
 * REMAINING now live in the same bordered module as aligned readouts.
 */
export function MatchupCommand({
  matchup,
  starters,
  opponentBuckets,
}: {
  matchup: Matchup;
  starters: LineupSlot[];
  opponentBuckets: { live: number; locked: number; upcoming: number };
}) {
  const total = matchup.homeScore + matchup.awayScore || 1;
  const homeShare = (matchup.homeScore / total) * 100;
  const isLive = matchup.status === "live";
  const delta = matchup.homeProjected - matchup.awayProjected;
  const homeBuckets = starterBuckets(starters);

  return (
    <div className="border border-border bg-surface-elevated">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="label-system text-[11px] text-foreground-secondary">
          MATCHUP_COMMAND
        </span>
        <span className="label-system flex items-center gap-1.5 text-[10px] text-foreground-tertiary">
          {isLive ? (
            <>
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-live" />
              </span>
              <span className="font-semibold text-live">LIVE</span>
            </>
          ) : (
            matchup.status.toUpperCase()
          )}
          · MATCHDAY {pad2(matchup.round)}
        </span>
      </div>

      <div className="p-5 sm:p-6">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between sm:gap-4">
          <TeamColumn team={matchup.homeTeam} align="start" />

          <div className="flex items-center gap-3 sm:gap-5">
            <p className="text-5xl font-semibold tracking-tight tabular-nums text-foreground sm:text-6xl">
              {matchup.homeScore}
            </p>
            <span className="text-lg font-medium text-foreground-tertiary sm:text-xl">
              –
            </span>
            <p className="text-5xl font-semibold tracking-tight tabular-nums text-foreground sm:text-6xl">
              {matchup.awayScore}
            </p>
          </div>

          <TeamColumn team={matchup.awayTeam} align="end" />
        </div>

        <div className="relative mt-6 h-1.5 overflow-hidden border border-border bg-muted">
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${homeShare}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-border border-t border-border">
        <div className="px-4 py-3.5">
          <p className="truncate text-sm font-semibold text-foreground">
            {matchup.homeTeam.name}
          </p>
          <div className="mt-1.5">
            <OperationalRow label="PROJECTED" value={matchup.homeProjected} />
            <OperationalRow
              label="ACTIVE"
              value={`${homeBuckets.live} / ${starters.length}`}
            />
            <OperationalRow label="REMAINING" value={homeBuckets.upcoming} />
          </div>
        </div>
        <div className="px-4 py-3.5">
          <p className="truncate text-right text-sm font-semibold text-foreground">
            {matchup.awayTeam.name}
          </p>
          <div className="mt-1.5">
            <OperationalRow label="PROJECTED" value={matchup.awayProjected} />
            <OperationalRow
              label="ACTIVE"
              value={`${opponentBuckets.live} / ${starters.length}`}
            />
            <OperationalRow label="REMAINING" value={opponentBuckets.upcoming} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 border-t border-border px-4 py-2.5">
        <span className="label-system text-[11px] text-foreground-tertiary">
          DELTA
        </span>
        <span
          className={`label-system text-sm font-semibold ${
            delta >= 0 ? "text-live" : "text-destructive"
          }`}
        >
          {delta >= 0 ? "+" : ""}
          {delta}
        </span>
      </div>
    </div>
  );
}
