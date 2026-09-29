import { TeamCrest } from "@/components/dashboard/team-crest";
import { pad2 } from "@/lib/team-fixture";
import type { Matchup } from "@/lib/types/fantasy";

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

export function MatchupHero({ matchup }: { matchup: Matchup }) {
  const total = matchup.homeScore + matchup.awayScore || 1;
  const homeShare = (matchup.homeScore / total) * 100;
  const isLive = matchup.status === "live";
  const delta = matchup.homeProjected - matchup.awayProjected;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-surface-elevated p-6 sm:p-8">
      <div
        className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-accent/10 blur-3xl"
        aria-hidden
      />

      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isLive ? (
            <span className="label-system flex items-center gap-1.5 text-xs font-semibold text-live">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-live" />
              </span>
              LIVE
            </span>
          ) : (
            <span className="label-system text-xs font-semibold text-foreground-tertiary">
              {matchup.status}
            </span>
          )}
          <span className="label-system text-xs text-foreground-tertiary">
            · MATCHDAY {pad2(matchup.round)}
          </span>
        </div>
        <span className="label-system text-xs text-foreground-tertiary">
          Head-to-head
        </span>
      </div>

      <div className="relative mt-6 flex flex-col items-center gap-6 sm:mt-8 sm:flex-row sm:justify-between sm:gap-4">
        <TeamColumn team={matchup.homeTeam} align="start" />

        <div className="flex items-center gap-3 sm:gap-5">
          <div className="text-center">
            <p className="text-5xl font-semibold tracking-tight tabular-nums text-foreground sm:text-6xl">
              {matchup.homeScore}
            </p>
            <p className="label-system mt-1 text-[11px] text-foreground-tertiary">
              Proj {matchup.homeProjected}
            </p>
          </div>
          <span className="text-lg font-medium text-foreground-tertiary sm:text-xl">
            –
          </span>
          <div className="text-center">
            <p className="text-5xl font-semibold tracking-tight tabular-nums text-foreground sm:text-6xl">
              {matchup.awayScore}
            </p>
            <p className="label-system mt-1 text-[11px] text-foreground-tertiary">
              Proj {matchup.awayProjected}
            </p>
          </div>
        </div>

        <TeamColumn team={matchup.awayTeam} align="end" />
      </div>

      <div className="relative mt-8 h-1.5 overflow-hidden border border-border bg-muted">
        <div
          className="h-full bg-accent transition-all"
          style={{ width: `${homeShare}%` }}
        />
      </div>

      <div className="relative mt-3 flex items-center justify-center">
        <span className="label-system text-[11px] text-foreground-tertiary">
          DELTA{" "}
          <span
            className={
              delta >= 0 ? "font-semibold text-live" : "font-semibold text-destructive"
            }
          >
            {delta >= 0 ? "+" : ""}
            {delta}
          </span>
        </span>
      </div>
    </section>
  );
}
