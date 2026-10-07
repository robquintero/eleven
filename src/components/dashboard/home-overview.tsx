import type { ReactNode } from "react";
import type { CurrentMatchup, MatchupFixtureIntelligence, StandingsRow } from "@/data-access/matchups";
import { matchupResultState, MATCHUP_RESULT_LABEL } from "@/domain/fantasy/matchup-result-state";
import { TransitionLink } from "@/components/shell/transition-link";
import { TeamName } from "@/components/ui/team-name";
import { V2Surface } from "@/components/ui/v2";
import { countStartersInFixture, formatKickoff, formatRoundPoints, formatRoundWindow, resolveMatchupSides, starterBuckets } from "@/lib/team-fixture";
import type { LineupSlot, Squad } from "@/lib/types/fantasy";

export function HomeSection({ title, description, action, children, className = "" }: {
  title: string; description?: string; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return <V2Surface className={`home-card ${className}`} label={title}>
    <div className="home-section-header"><div className="min-w-0"><h2>{title}</h2>{description && <p className="home-secondary mt-1">{description}</p>}</div>{action}</div>
    <div className="home-section-body">{children}</div>
  </V2Surface>;
}

export function HomeIdentity({ teamName, leagueName, matchup }: { teamName: string; leagueName: string; matchup: CurrentMatchup | null }) {
  return <div className="home-identity">
    <div><h1><TeamName name={teamName} /></h1><p className="home-secondary">{matchup ? `Matchweek ${matchup.roundNumber} · ` : ""}{leagueName}</p></div>
    {matchup && <p className="home-window">{formatRoundWindow(matchup.roundStartsAt, matchup.roundEndsAt)}</p>}
  </div>;
}

function PlayerProgress({ squad }: { squad: Squad }) {
  const buckets = starterBuckets(squad.starters);
  return <dl className="home-player-progress">
    <div><dt>Live</dt><dd className={buckets.live > 0 ? "home-positive" : ""}>{buckets.live}</dd></div>
    <div><dt>Locked</dt><dd>{buckets.locked + buckets.final}</dd></div>
    <div><dt>Remaining</dt><dd>{buckets.upcoming}</dd></div>
  </dl>;
}

/** Home-only presentation. Same authoritative state, final/known-score gates,
 * side orientation and freshness thresholds as the unchanged Matchup page. */
export function HomeMatchup({ matchup, now, squads, topPerformer }: {
  matchup: CurrentMatchup | null; now: Date;
  squads: { home: Squad; away: Squad } | null;
  topPerformer: { name: string; club: string; points: number } | null;
}) {
  if (!matchup) return <HomeSection title="Your matchup" className="home-hero home-no-matchup">
    <p className="home-empty-title">Your next matchup starts here</p>
    <p className="home-secondary">No matchup has been scheduled for this league yet.</p>
    <TransitionLink href="/league" label="League" className="v2-link">Open league →</TransitionLink>
  </HomeSection>;
  const state = matchupResultState({ status: matchup.status, roundStatus: matchup.roundStatus, startsAt: matchup.roundStartsAt, endsAt: matchup.roundEndsAt }, now);
  const sides = resolveMatchupSides({ isUserHome: matchup.isUserHome, homeTeamName: matchup.homeTeamName, awayTeamName: matchup.awayTeamName, homeScore: matchup.homeFinalPoints ?? matchup.homeLivePoints, awayScore: matchup.awayFinalPoints ?? matchup.awayLivePoints });
  const mineKnown = matchup.isUserHome ? matchup.homeScoreAvailable !== false : matchup.awayScoreAvailable !== false;
  const opponentKnown = matchup.isUserHome ? matchup.awayScoreAvailable !== false : matchup.homeScoreAvailable !== false;
  const mineFinal = matchup.isUserHome ? matchup.homeFinalPoints : matchup.awayFinalPoints;
  const opponentFinal = matchup.isUserHome ? matchup.awayFinalPoints : matchup.homeFinalPoints;
  const mine = state === "upcoming" ? null : state === "final" ? mineFinal : mineKnown ? sides.leftScore : null;
  const opponent = state === "upcoming" ? null : state === "final" ? opponentFinal : opponentKnown ? sides.rightScore : null;
  const updated = matchup.scoresUpdatedAt ? Math.max(0, Math.round((now.getTime() - new Date(matchup.scoresUpdatedAt).getTime()) / 60_000)) : null;
  return <V2Surface className="home-card home-hero" label="Your matchup">
    <div className="home-hero-header"><h2>Your matchup</h2><span className={`home-matchup-state home-state-${state}`}>{state === "live" && <span aria-hidden="true" className="home-live-dot" />}{MATCHUP_RESULT_LABEL[state]}</span></div>
    <div className="home-scoreboard">
      <div className="home-side home-your-side"><p className="home-side-label">Your team</p><h3><TeamName name={sides.leftTeamName} /></h3><p className="home-score" aria-label={`Your score: ${mine === null ? "not available" : formatRoundPoints(mine)}`}>{mine === null ? "—" : formatRoundPoints(mine)}</p>{squads && matchup.roundStatus !== "upcoming" && <PlayerProgress squad={matchup.isUserHome ? squads.home : squads.away} />}</div>
      <div className="home-side"><p className="home-side-label">Opponent</p><h3><TeamName name={sides.rightTeamName} /></h3><p className="home-score" aria-label={`Opponent score: ${opponent === null ? "not available" : formatRoundPoints(opponent)}`}>{opponent === null ? "—" : formatRoundPoints(opponent)}</p>{squads && matchup.roundStatus !== "upcoming" && <PlayerProgress squad={matchup.isUserHome ? squads.away : squads.home} />}</div>
    </div>
    <div className="home-hero-footer"><div className="min-w-0">
      {state === "final" && mine !== null && opponent !== null && <p className="home-result">{mine === opponent ? "Draw" : `Winner · ${mine > opponent ? sides.leftTeamName : sides.rightTeamName}`}</p>}
      {state === "pending" && <p className="home-result home-warning">Week ended · Finalizing result</p>}
      {state === "upcoming" && <p className="home-secondary">Your week is coming up.</p>}
      {state === "active" && <p className="home-secondary">Matchweek in progress</p>}
      {state === "live" && <p className={`home-secondary ${updated !== null && updated > 15 ? "home-warning" : ""}`}>{updated === null ? "Awaiting first score sync" : updated > 15 ? `Score sync is stale · Last updated ${updated}m ago` : updated === 0 ? "Scores updated just now" : `Scores updated ${updated}m ago`}</p>}
      {topPerformer && topPerformer.points > 0 && <p className="home-top-performer">Top performance · {topPerformer.name} <span>({topPerformer.club}) · {formatRoundPoints(topPerformer.points)} pts</span></p>}
    </div><TransitionLink href="/matchup" label="Matchup" className="home-primary-link">View matchup →</TransitionLink></div>
  </V2Surface>;
}

export function HomeFixtureCard({ fixtureIntel, starters, hasActiveRound, teamIdsByPlayerId }: {
  fixtureIntel: MatchupFixtureIntelligence | null; starters: LineupSlot[]; hasActiveRound: boolean; teamIdsByPlayerId?: Map<string, string[]>;
}) {
  const next = fixtureIntel?.nextFixture;
  const involved = countStartersInFixture(starters, next ?? null, teamIdsByPlayerId);
  const buckets = starterBuckets(starters);
  return <HomeSection title="Next lock" className="home-next-lock" action={<TransitionLink href="/team" label="Team" className="v2-link">Manage lineup →</TransitionLink>}>
    {!hasActiveRound ? <p className="home-secondary">No active matchweek. The next lock is not scheduled.</p> : !fixtureIntel?.hasAnyFixtureData ? <p className="home-secondary">Fixture information is not available yet.</p> : next ? <>
      <p className="home-lock-time">{formatKickoff(next.kickoffAt)}</p><p className="home-secondary">{next.homeClubShortName} v {next.awayClubShortName}</p>
      {involved > 0 && <p className="home-involved">{involved} of your starters involved</p>}
    </> : <p className="home-secondary">No more fixtures scheduled this matchweek.</p>}
    {hasActiveRound && <div className="home-fixture-summary"><span>{buckets.upcoming} starters remaining</span><span>{fixtureIntel?.hasAnyFixtureData ? <><strong className={fixtureIntel.liveFixtureCount > 0 ? "home-positive" : ""}>{fixtureIntel.liveFixtureCount}</strong> fixtures live now</> : "Fixtures unavailable"}</span></div>}
  </HomeSection>;
}

/** Uses the existing ordered standings and retains top six + own row. */
export function HomeLeaguePosition({ standings, myTeamId }: { standings: StandingsRow[]; myTeamId: string | null }) {
  const myIndex = myTeamId ? standings.findIndex(row => row.fantasyTeamId === myTeamId) : -1;
  const mine = standings[myIndex];
  const rows = standings.slice(0, 6).map((row, i) => ({ row, rank: i + 1 }));
  if (myIndex >= 6) rows.push({ row: mine, rank: myIndex + 1 });
  return <HomeSection title="League position" className="home-league-position" action={<TransitionLink href="/league" label="League" className="v2-link">Full table →</TransitionLink>}>
    {mine && <div className="home-rank-summary"><p className="home-rank">{myIndex + 1}<span> / {standings.length}</span></p><div><p className="home-record">{mine.wins}W · {mine.draws}D · {mine.losses}L</p><p className="home-secondary">{mine.leaguePoints} league points</p></div></div>}
    {rows.length === 0 ? <p className="home-secondary">No league results yet. Standings follow completed matchups.</p> : <div className="home-standings" role="table" aria-label="League snapshot">
      <div className="home-standing-row home-standing-head" role="row"><span role="columnheader">Rank / team</span><span role="columnheader">W–D–L</span><span role="columnheader">Pts</span></div>
      {rows.map(({ row, rank }) => <div key={row.fantasyTeamId} className={`home-standing-row ${row.fantasyTeamId === myTeamId ? "home-standing-you" : ""}`} role="row"><span className="home-standing-identity" role="cell"><span className="home-standing-rank">{rank}</span><span className="min-w-0"><TeamName name={row.teamName} />{row.fantasyTeamId === myTeamId && <span className="home-you">You</span>}</span></span><span className="home-standing-record" role="cell">{row.wins}–{row.draws}–{row.losses}</span><strong role="cell">{row.leaguePoints}</strong></div>)}
    </div>}
  </HomeSection>;
}

export function HomeLoading() {
  return <div className="home-v2 home-loading" aria-busy="true"><p role="status" className="home-secondary">Loading your matchweek…</p><div className="home-loading-hero" aria-hidden="true"><div className="home-skeleton home-skeleton-label" /><div className="home-loading-scores"><div className="home-skeleton" /><div className="home-skeleton" /></div></div><div className="home-intelligence" aria-hidden="true"><div className="home-loading-card" /><div className="home-loading-card" /></div><div className="home-support-grid"><HomeSection title="Starting XI"><div aria-hidden="true" className="home-skeleton home-loading-lineup" /></HomeSection></div></div>;
}
