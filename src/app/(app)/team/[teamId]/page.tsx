import { notFound, redirect } from "next/navigation";
import { TeamPageView } from "@/components/team/team-page-view";
import { getSpectatorContext, querySpectatorTeam, querySpectatorRound } from "@/data-access/spectator";
import { querySquad } from "@/data-access/roster";
import { queryTeamRoundSquad } from "@/data-access/matchups";
import type { Squad } from "@/lib/types/fantasy";

export const metadata = { title: "League team" };

export default async function Page({ params, searchParams }: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ round?: string | string[] }>;
}) {
  const [{ teamId }, search] = await Promise.all([params, searchParams]);
  const context = await getSpectatorContext();
  if (!context) notFound();
  const team = await querySpectatorTeam(context.supabase, context.league.id, teamId);
  if (!team || Array.isArray(search.round)) notFound();
  const isOwner = team.ownerUserId === context.user.id;
  if (isOwner && !search.round) redirect("/team");

  const round = await querySpectatorRound(context.supabase, context.league.id, search.round);
  if (search.round && !round) notFound();
  const [rawSquad, profile, match] = await Promise.all([
    round
      ? queryTeamRoundSquad(context.supabase, team.id, round, isOwner, team.name)
      : querySquad(context.supabase, context.league.id, team.id),
    context.supabase.from("profiles").select("display_name").eq("id", team.ownerUserId).maybeSingle(),
    round ? context.supabase.from("matchups").select("id")
      .eq("league_id", context.league.id).eq("fantasy_round_id", round.id)
      .or(`home_fantasy_team_id.eq.${team.id},away_fantasy_team_id.eq.${team.id}`).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  // Ownership enrichment comes from the authenticated target, never client props.
  const own = (p: Squad["bench"][number]) => ({
    ...p, ownership: isOwner ? "mine" as const : "owned" as const,
    ownerTeamName: isOwner ? undefined : team.name,
  });
  const squad = {
    ...rawSquad, starters: rawSquad.starters.map(s => ({ ...s, player: own(s.player) })),
    bench: rawSquad.bench.map(own),
  };
  return <>
    {search.round && <p className="mb-3 text-xs text-foreground-secondary">
      Stored round lineup. Historical bench records may be incomplete after roster moves;
      player details and individual points reflect available player analytics.
    </p>}
    <TeamPageView
      team={team} league={context.league} squad={squad} readOnly managerName={profile.data?.display_name}
      contextLink={match.data ? `/matchup/${match.data.id}` : undefined}
      matchup={round ? {
        roundId: round.id, roundNumber: round.number, roundStatus: round.status,
        roundStartsAt: round.startsAt, roundEndsAt: round.endsAt,
      } : null}
    />
  </>;
}
