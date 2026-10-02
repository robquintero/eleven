import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trophy } from "lucide-react";
import { StandingsTable } from "@/components/league/standings-table";
import { LeagueMatchups } from "@/components/league/league-matchups";
import { ModuleHeader } from "@/components/ui/module-header";
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
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/league" className="label-system flex items-center gap-1.5 text-[11px] text-foreground-tertiary hover:text-foreground">
          <ArrowLeft className="size-3.5" strokeWidth={1.75} />
          BACK TO LEAGUE
        </Link>
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

      <section className="border border-border">
        <div className="border-b border-border px-4 py-2.5">
          <ModuleHeader title="FINAL_TABLE" meta={`${detail.standings.length} TEAMS`} />
        </div>
        <StandingsTable standings={detail.standings} myTeamId={myTeam?.id ?? null} />
      </section>

      <section className="border border-border">
        <div className="border-b border-border px-4 py-2.5">
          <ModuleHeader title="RESULTS" meta={`${detail.results.length} MATCHUPS`} />
        </div>
        <LeagueMatchups matchups={detail.results} myTeamId={myTeam?.id ?? null} emptyLabel="NO RESULTS FOR THIS SEASON" />
      </section>
    </div>
  );
}
