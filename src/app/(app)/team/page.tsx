import { TransitionLink } from "@/components/shell/transition-link";
import { NoLeagueOnboarding } from "@/components/shell/no-league-onboarding";
import { RoundWindow } from "@/components/football/round-window";
import { TeamWorkspace } from "@/components/team/team-workspace";
import { ensureFirstRoundOpenedAction } from "@/app/(app)/team/actions";
import { getActiveLeagueId } from "@/data-access/active-league";
import { getCurrentMatchup } from "@/data-access/matchups";
import { getUserLeagues } from "@/data-access/leagues";
import { getUserSquad } from "@/data-access/roster";
import { getUserTeamInLeague } from "@/data-access/teams";
import { ROSTER_RULES } from "@/domain/fantasy/constants";
import { rosterVacancies, type RosterCounts } from "@/domain/fantasy/roster-rules";
import { pad2 } from "@/lib/team-fixture";
import type { Squad } from "@/lib/types/fantasy";

export default async function TeamPage() {
  const leagues = await getUserLeagues();
  if (leagues.length === 0) {
    return <NoLeagueOnboarding />;
  }

  const activeLeagueId = await getActiveLeagueId(leagues);
  const league = leagues.find((l) => l.id === activeLeagueId) ?? leagues[0];
  const team = await getUserTeamInLeague(league.id);

  // Pass 10.5C: self-heals a completed draft whose round 1 never got
  // opened (see ensureFirstRoundOpenedAction's own doc comment) --
  // cheap no-op once a round already exists, which is true almost always.
  if (team) await ensureFirstRoundOpenedAction(league.id);

  const [squad, matchup]: [Squad, Awaited<ReturnType<typeof getCurrentMatchup>>] = team
    ? await Promise.all([getUserSquad(league.id, team.id), getCurrentMatchup(league.id, team.id)])
    : [{ formation: "—", starters: [], bench: [] }, null];

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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {team?.name ?? league.name}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm text-foreground-secondary">
            <span>{league.name}</span>
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

      {team && vacancies.length > 0 && (
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
