import { notFound } from "next/navigation";
import { MatchupPageView } from "@/components/matchup/matchup-page-view";
import { getSpectatorContext, querySpectatorMatchup } from "@/data-access/spectator";
import { getUserTeamInLeague } from "@/data-access/teams";
export const metadata = { title: "League matchup" };
export default async function Page({ params }: { params: Promise<{ matchupId: string }> }) {
  const { matchupId } = await params;
  const context = await getSpectatorContext();
  if (!context) notFound();
  const myTeam = await getUserTeamInLeague(context.league.id);
  const matchup = await querySpectatorMatchup(context.supabase, context.league.id, matchupId, myTeam?.id ?? null);
  if (!matchup) notFound();
  return <MatchupPageView league={context.league} matchup={matchup} />;
}
