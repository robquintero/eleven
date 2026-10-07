import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, Trophy } from "lucide-react";
import { StandingsTable } from "@/components/league/standings-table";
import { LeagueMatchups } from "@/components/league/league-matchups";
import { TransitionLink } from "@/components/shell/transition-link";
import { V2Heading, V2Surface } from "@/components/ui/v2";
import "../../v2.css";
import { getActiveLeagueId } from "@/data-access/active-league";
import { getSeasonArchiveDetail } from "@/data-access/seasons";
import { getUserLeagues } from "@/data-access/leagues";
import { getUserTeamInLeague } from "@/data-access/teams";
import { SCHEDULE_CYCLES_LABEL } from "@/domain/fantasy/season";

/**
 * Pass 12B season archive detail — one historical (or current) season's
 * final table, champion, and round-by-round results. Explicitly scoped by
 * `seasonNumber` (never "the current season"), reusing the exact same
 * `StandingsTable`/`LeagueMatchups` components the League page's live view
 * uses, so a completed season's archive renders identically in spirit,
 * just over frozen historical data.
 */
export async function generateMetadata({ params }: { params: Promise<{ number: string }> }): Promise<Metadata> {
  const { number } = await params;
  const seasonNumber = Number(number);
  return { title: Number.isInteger(seasonNumber) && seasonNumber >= 1 ? `Season ${seasonNumber}` : "Season" };
}

export default async function SeasonArchiveDetailPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const seasonNumber = Number(number);
  if (!Number.isInteger(seasonNumber) || seasonNumber < 1) notFound();

  const leagues = await getUserLeagues();
  if (leagues.length === 0) notFound();

  const activeLeagueId = await getActiveLeagueId(leagues);
  if (!activeLeagueId) notFound();

  const [detail, myTeam] = await Promise.all([
    getSeasonArchiveDetail(activeLeagueId, seasonNumber),
    getUserTeamInLeague(activeLeagueId),
  ]);
  if (!detail) notFound();

  return (
    <div className="eleven-v2 archive-v2 flex flex-col gap-6">
      <div>
        <TransitionLink
          href="/league"
          label="League"
          className="v2-link gap-1.5"
        >
          <ArrowLeft className="size-3.5" strokeWidth={1.75} />
          Back to league
        </TransitionLink>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Season {detail.seasonNumber}</h1>
          <span className="label-system text-[11px] text-foreground-tertiary">
            {SCHEDULE_CYCLES_LABEL[detail.scheduleCycles]} · {detail.status}
          </span>
        </div>
        {detail.championTeamName && (
          <div className="mt-2 flex items-center gap-2">
            <Trophy className="size-4 text-accent" strokeWidth={1.75} />
            <p className="text-sm font-medium text-foreground">{detail.championTeamName} — Champion</p>
          </div>
        )}
      </div>

      <V2Surface><V2Heading title={detail.status === "COMPLETED" ? "Final standings" : "Standings"} meta={<span className="v2-meta">{detail.standings.length} teams</span>} />
        <StandingsTable variant="v2" standings={detail.standings} myTeamId={myTeam?.id ?? null} />
      </V2Surface>

      <V2Surface><V2Heading title="Results" meta={<span className="v2-meta">{detail.results.length} matchups</span>} />
        <div className="px-4 pb-4 sm:px-6"><LeagueMatchups variant="v2" compact preserveOrder matchups={detail.results} myTeamId={myTeam?.id ?? null} emptyLabel="No results for this season yet." /></div>
      </V2Surface>
    </div>
  );
}
