import { PlayersWorkspace } from "@/components/players/players-workspace";
import { getActiveLeagueId } from "@/data-access/active-league";
import { getUserLeagues } from "@/data-access/leagues";
import { getClubFilters, getCompetitionFilters, getPlayerDatabase } from "@/data-access/players";
import { parseFiltersFromSearchParams } from "@/lib/players-filters";

export default async function PlayersPage({ searchParams }: PageProps<"/players">) {
  const sp = await searchParams;
  const { filters, page } = parseFiltersFromSearchParams(sp);

  const leagues = await getUserLeagues();
  const activeLeagueId = await getActiveLeagueId(leagues);

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
      data={data}
      filters={filters}
      page={page}
      competitions={competitions}
      clubs={clubs}
      hasActiveLeague={Boolean(activeLeagueId)}
    />
  );
}
