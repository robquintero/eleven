import type { ReactNode } from "react";
import type { LeagueDetail } from "@/data-access/leagues";
import type { SeasonSummary } from "@/data-access/seasons";
import type { StandingsRow } from "@/data-access/matchups";
import { TransitionLink } from "@/components/shell/transition-link";
import { V2Heading, V2Surface } from "@/components/ui/v2";
import { LeagueFormActions } from "./league-form-actions";
import { StandingsTable } from "./standings-table";
import { SeasonPanel } from "./season-panel";
import { DeleteLeagueSection } from "./delete-league-section";
import { standingsEmptyContext } from "@/domain/fantasy/season";

/** Presentation only: streams are supplied by the existing server page loaders. */
export function LeagueOverview({ league, season, lifecycleLabel, draftStatus, standings, myTeamId, allowDelete, membershipKey,
  matchweek, records, results, activity, trades, managers, archive }: {
  league: LeagueDetail | null; season: SeasonSummary | null; lifecycleLabel: string | null;
  draftStatus: string | null; standings: StandingsRow[]; myTeamId: string | null; allowDelete: boolean;
  membershipKey?: string; matchweek: ReactNode; records: ReactNode; results: ReactNode; activity: ReactNode;
  trades: ReactNode; managers: ReactNode; archive: ReactNode;
}) {
  const commissioner = league?.members.find(member => member.userId === league.createdByUserId);
  return <div className="eleven-v2 v2-league space-y-6">
    <header className="flex flex-col items-start justify-between gap-5 sm:flex-row">
      <div className="min-w-0 w-full flex-1 sm:w-auto">
        <div className="mb-2 flex flex-wrap items-center gap-2"><span className="v2-meta">Your league</span>{lifecycleLabel && <span className="v2-status">· {lifecycleLabel.toLowerCase()}</span>}</div>
        <h1 className="v2-page-title">{league?.name ?? "Start your league"}</h1>
        {league ? <>
          <p className="v2-secondary mt-2">{season ? `Season ${season.seasonNumber} · ` : ""}{league.memberCount} / {league.maxTeams} managers{season?.currentRoundNumber !== null && season?.currentRoundNumber !== undefined ? ` · Round ${season.currentRoundNumber}${season.totalRounds ? ` of ${season.totalRounds}` : ""}` : ""}</p>
          {commissioner && <p className="v2-meta mt-1">Commissioner: {commissioner.displayName}</p>}
        </> : <p className="v2-secondary mt-2">Create a league or join your friends with an invite code.</p>}
      </div>
      <LeagueFormActions key={`${league?.id ?? "none"}:${membershipKey ?? ""}`} />
    </header>
    {league && <>
      {matchweek}
      <SeasonPanel season={season} leagueId={league.id} isCommissioner={league.role === "commissioner"} />
      <V2Surface className="v2-standings"><V2Heading title="Standings" description="Based on official completed matchups." />
        <StandingsTable variant="v2" standings={standings} myTeamId={myTeamId} emptyContext={standingsEmptyContext(season && { status: season.status, currentRoundNumber: season.currentRoundNumber })} />
      </V2Surface>
      {records}
      {results}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">{activity}{trades}</div>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {managers}
        <div className="min-w-0 space-y-6">
          <V2Surface><V2Heading title="Draft" meta={<span className="v2-meta">{draftStatus === "completed" ? "Completed" : draftStatus === "in_progress" ? "In progress" : "Not yet available"}</span>} />
            {draftStatus ? <div className="px-5 pb-4"><TransitionLink href="/draft" label="Draft" className="v2-link">{draftStatus === "completed" ? "View draft results →" : "Open draft room →"}</TransitionLink></div> : <p className="v2-secondary px-5 pb-5">Your draft will appear here when it is ready.</p>}
          </V2Surface>
          {archive}
        </div>
      </div>
      {league.role === "commissioner" && <details className="v2-management">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">League management</summary>
        <p className="v2-secondary mt-3 mb-5">Invite code <span className="v2-number ml-2 select-all text-[var(--v2-text)]">{league.inviteCode}</span></p>
        {allowDelete && <DeleteLeagueSection key={league.id} leagueId={league.id} leagueName={league.name} v2 />}
      </details>}
    </>}
  </div>;
}
