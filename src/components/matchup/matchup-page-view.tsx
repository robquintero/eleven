import { Suspense } from "react";
import { MatchupAnticipation, MatchupCommand } from "@/components/dashboard/matchup-command";
import { MatchupLineups } from "@/components/matchup/matchup-lineups";
import { MatchupPlayerCounts } from "@/components/matchup/matchup-player-counts";
import { formatRoundWindow } from "@/lib/team-fixture";
import { getMatchupFixtureIntelligence, getMatchupSquads, type CurrentMatchup } from "@/data-access/matchups";
import { teamViewHref } from "@/lib/spectator-navigation";

export async function MatchupPageView({ league, matchup }: { league: {name:string}; matchup: CurrentMatchup | null }) {
  const now = new Date();
  // Fixture intelligence is only used by the pre-kickoff anticipation panel.
  const fixturePromise = matchup?.roundStatus === "upcoming" ? getMatchupFixtureIntelligence(matchup, now) : Promise.resolve(null);
  // Observe early rejection; the streamed component still receives the original error.
  void fixturePromise.catch(() => {});
  const squads = matchup ? await getMatchupSquads(matchup) : null;
  const myStarters = squads && !matchup?.isSpectator ? (matchup!.isUserHome ? squads.home.starters : squads.away.starters) : undefined;
  const teamIdsByPlayerId = squads?.teamIdsByPlayerId;

  const historical = matchup && new Date(matchup.roundEndsAt) <= now;
  const current = matchup && new Date(matchup.roundStartsAt) <= now && !historical;
  const homeHref = matchup ? !matchup.isSpectator && matchup.isUserHome && current ? "/team" : teamViewHref(matchup.homeFantasyTeamId, matchup.roundId) : undefined;
  const awayHref = matchup ? !matchup.isSpectator && !matchup.isUserHome && current ? "/team" : teamViewHref(matchup.awayFantasyTeamId, matchup.roundId) : undefined;
  return (
    <div className="core-v2 flex flex-col gap-4">
      <header className="core-matchup-heading">
        <h1 className="v2-page-title">
          Matchup
        </h1>
        <p className="mt-1.5 text-sm text-foreground-secondary [overflow-wrap:anywhere]">{league.name}{matchup && ` · Matchweek ${matchup.roundNumber}`}</p>
        {matchup && <p className="v2-round-range mt-2">{formatRoundWindow(matchup.roundStartsAt, matchup.roundEndsAt)}</p>}
      </header>

      {historical && <p className="text-xs text-foreground-secondary">Stored round lineup. Player details and individual points reflect available player analytics; the official result remains fixed. Historical bench records may be incomplete after roster moves.</p>}
      {/* Pass 13 (§5): tighter rhythm (gap-3, not the page's own gap-6)
          between the score module and the XI below it -- proximity is the
          cheapest, safest way to read "these belong to one matchday
          surface" without merging independently-rendered borders between
          sibling components (DESIGN.md §5's hierarchy order puts
          whitespace ahead of borders for exactly this reason). */}
      <div className="flex flex-col gap-5">
        <MatchupCommand teamLinks={homeHref && awayHref ? { home: homeHref, away: awayHref } : undefined} matchup={matchup} hasLeague now={now} scheduledDetails={<Suspense fallback={<p role="status" className="text-xs text-foreground-secondary">Loading next kickoff…</p>}>
          <FixtureAnticipation fixturePromise={fixturePromise} starters={myStarters} teamIdsByPlayerId={teamIdsByPlayerId} />
        </Suspense>} starters={myStarters} teamIdsByPlayerId={teamIdsByPlayerId} />

        {matchup && squads && (
          <>
            <MatchupPlayerCounts
              myTeamName={matchup.isUserHome ? matchup.homeTeamName : matchup.awayTeamName}
              opponentTeamName={matchup.isUserHome ? matchup.awayTeamName : matchup.homeTeamName}
              mySquad={matchup.isUserHome ? squads.home : squads.away}
              opponentSquad={matchup.isUserHome ? squads.away : squads.home}
            />

            <MatchupLineups
              homeTeamName={matchup.homeTeamName}
              awayTeamName={matchup.awayTeamName}
              isUserHome={matchup.isUserHome}
              isSpectator={matchup.isSpectator}
              homeSquad={squads.home}
              awaySquad={squads.away}
            />
          </>
        )}
      </div>
    </div>
  );
}

async function FixtureAnticipation({ fixturePromise, starters, teamIdsByPlayerId }: {
  fixturePromise: Promise<Awaited<ReturnType<typeof getMatchupFixtureIntelligence>> | null>;
  starters?: import("@/lib/types/fantasy").LineupSlot[];
  teamIdsByPlayerId?: Map<string, string[]>;
}) {
  return <MatchupAnticipation fixtureIntel={await fixturePromise} starters={starters} teamIdsByPlayerId={teamIdsByPlayerId} />;
}
