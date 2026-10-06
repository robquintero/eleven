import { TransitionLink } from "@/components/shell/transition-link";
import { RoundWindow } from "@/components/football/round-window";
import { TeamWorkspace } from "@/components/team/team-workspace";
import { ROSTER_RULES } from "@/domain/fantasy/constants";
import { rosterVacancies, type RosterCounts } from "@/domain/fantasy/roster-rules";
import { pad2 } from "@/lib/team-fixture";
import type { Squad } from "@/lib/types/fantasy";
import type { Team } from "@/data-access/teams";
import type { LeagueSummary } from "@/data-access/leagues";
import type { CurrentMatchup } from "@/data-access/matchups";

export function TeamPageView({ team, league, squad, matchup, readOnly = false, managerName, contextLink }: {
  team: Team | null; league: Pick<LeagueSummary, "id" | "name">; squad: Squad;
  matchup: Pick<CurrentMatchup, "roundId" | "roundNumber" | "roundStatus" | "roundStartsAt" | "roundEndsAt"> | null;
  readOnly?: boolean; managerName?: string; contextLink?: string;
}) {
  const squadSize = squad.starters.length + squad.bench.length;

  // Pass 11: rosters may legitimately sit below ROSTER_RULES.squadSize
  // after a drop -- no auto-fill ever happens -- so this is read as
  // intentional vacancy state, never an error, and the market is the
  // only prescribed next action. Pass 11.5: `rosterVacancies` is the one
  // shared definition of "short" (also used by Home) -- never duplicated.
  const positionCounts: RosterCounts = {};
  for (const slot of squad.starters) positionCounts[slot.player.position] = (positionCounts[slot.player.position] ?? 0) + 1;
  for (const player of squad.bench) positionCounts[player.position] = (positionCounts[player.position] ?? 0) + 1;

  const vacancies = rosterVacancies(positionCounts);

  return (
    <div>
      {readOnly && <div className="mb-3 flex flex-wrap gap-4"><TransitionLink href={matchup ? `/league?round=${matchup.roundId}` : "/league"} label="League" className="label-system text-[11px] text-accent">← League</TransitionLink>{contextLink && <TransitionLink href={contextLink} label="Matchup" className="label-system text-[11px] text-accent">← Matchup</TransitionLink>}</div>}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="break-words text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {team?.name ?? league.name}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm text-foreground-secondary">
            <span>{league.name}</span>
            {managerName && <span>· {managerName}</span>}
            <span className="text-foreground-tertiary">·</span>
            <span className="label-system text-xs text-foreground-tertiary">
              {squadSize} / {ROSTER_RULES.squadSize} PLAYERS
            </span>
          </p>
        </div>
      </div>

      <div className="mt-4 flex divide-x divide-border overflow-x-auto border border-border">
        <StripCell label="FORMATION" value={squad.formation} />
        <StripCell label="STARTERS" value={pad2(squad.starters.length)} />
        <StripCell label="BENCH" value={pad2(squad.bench.length)} />
      </div>

      {matchup && (
        <RoundWindow
          className="mt-3"
          round={{ number: matchup.roundNumber, startsAt: matchup.roundStartsAt, endsAt: matchup.roundEndsAt, status: matchup.roundStatus }}
        />
      )}

      {!team && (
        <p className="mt-2 text-xs text-foreground-tertiary">
          You don&apos;t have a fantasy team in this league yet.
        </p>
      )}

      {team && !readOnly && vacancies.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border border-accent/30 bg-accent/5 px-4 py-3">
          <div>
            <p className="label-system text-[11px] text-accent">ROSTER VACANCY</p>
            <p className="mt-0.5 text-xs text-foreground-secondary">
              Short on {vacancies.map((v) => `${v.short} ${v.position}`).join(", ")}. No auto-fill — sign
              replacements from the free market whenever you&apos;re ready.
            </p>
          </div>
          <TransitionLink
            href="/players"
            label="Players"
            className="label-system shrink-0 text-[11px] text-accent hover:underline"
          >
            BROWSE MARKET →
          </TransitionLink>
        </div>
      )}

      <TeamWorkspace
        key={`${league.id}:${team?.id ?? "none"}:${matchup?.roundId ?? "none"}`}
        readOnly={readOnly}
        squad={squad}
        matchdayNumber={matchup?.roundNumber ?? null}
        hasActiveRound={matchup !== null && matchup.roundStatus !== "completed"}
        leagueId={league.id}
        fantasyTeamId={team?.id ?? null}
      />
    </div>
  );
}

function StripCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 px-2.5 py-1.5">
      <span className="label-system text-[10px] text-foreground-tertiary">{label}</span>
      <span className="label-system text-[11px] font-semibold text-foreground-secondary">
        {value}
      </span>
    </div>
  );
}
