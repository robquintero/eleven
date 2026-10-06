import { TeamPageView } from "@/components/team/team-page-view";
import type { Metadata } from "next";
import { NoLeagueOnboarding } from "@/components/shell/no-league-onboarding";
import { ensureFirstRoundOpenedAction } from "@/app/(app)/team/actions";
import { getActiveLeagueId } from "@/data-access/active-league";
import { getCurrentMatchup } from "@/data-access/matchups";
import { getUserLeagues } from "@/data-access/leagues";
import { getUserSquad } from "@/data-access/roster";
import { getUserTeamInLeague } from "@/data-access/teams";
import type { Squad } from "@/lib/types/fantasy";

export const metadata: Metadata = { title: "Team" };

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

  return <TeamPageView team={team} league={league} squad={squad} matchup={matchup} />;
}
