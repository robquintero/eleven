import type { Metadata } from "next";
import { PlayersWorkspace } from "@/components/players/players-workspace";
import { getActiveLeagueId } from "@/data-access/active-league";
import { getUserLeagues } from "@/data-access/leagues";
import { getClubFilters, getCompetitionFilters, getPlayerDatabase } from "@/data-access/players";
import { getUserTeamInLeague } from "@/data-access/teams";
import { parseFiltersFromSearchParams } from "@/lib/players-filters";

export const metadata: Metadata = { title: "Players" };

export default async function PlayersPage({ searchParams }: PageProps<"/players">) {
  const sp = await searchParams;
  const { filters, page } = parseFiltersFromSearchParams(sp);

  const leagues = await getUserLeagues();
  const activeLeagueId = await getActiveLeagueId(leagues);
  // Pass 11: the Players page is the free-agent market -- ADD/DROP only
  // ever render when the caller actually has a team in the active league
  // (see PlayersWorkspace/MarketAction's own "never expose an action that
  // can't succeed" rule).
  const team = activeLeagueId ? await getUserTeamInLeague(activeLeagueId) : null;

  const [competitions, clubs, data] = await Promise.all([
    getCompetitionFilters(),
    getClubFilters(filters.competitionId !== "ALL" ? filters.competitionId : undefined),
    getPlayerDatabase({
      query: filters.query || undefined,
      position: filters.position !== "ALL" ? filters.position : undefined,
      competitionId: filters.competitionId !== "ALL" ? filters.competitionId : undefined,
      clubId: filters.clubId !== "ALL" ? filters.clubId : undefined,
      availability: filters.availability !== "ALL" ? filters.availability : undefined,
      ownership: filters.ownership !== "ALL" ? filters.ownership : undefined,
      sort: filters.sort,
      page,
      activeLeagueId,
    }),
  ]);

  return (
    <PlayersWorkspace
      key={`${activeLeagueId ?? "none"}:${team?.id ?? "none"}`}
      data={data}
      filters={filters}
      page={page}
      competitions={competitions}
      clubs={clubs}
      hasActiveLeague={Boolean(activeLeagueId)}
      leagueId={activeLeagueId}
      fantasyTeamId={team?.id ?? null}
    />
  );
}
