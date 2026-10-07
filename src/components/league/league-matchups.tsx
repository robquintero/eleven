import { TeamName } from "@/components/ui/team-name";
import { formatRoundPoints } from "@/lib/team-fixture";
import type { LeagueMatchupSummary } from "@/data-access/matchups";
import { TransitionLink } from "@/components/shell/transition-link";
import { pad2 } from "@/lib/team-fixture";
import { MatchupStatus } from "@/components/football/matchup-status";
import { formatRoundWindow } from "@/lib/team-fixture";

/** A single, unambiguous matchup link; team links live on its detail view. */
function MatchupRow({ matchup, myTeamId }: { matchup: LeagueMatchupSummary; myTeamId: string | null }) {
  const isMine = myTeamId !== null && (matchup.homeTeamId === myTeamId || matchup.awayTeamId === myTeamId);
  const final = matchup.resultState === "final" && matchup.homePoints !== null && matchup.awayPoints !== null;
  const winner = final ? matchup.homePoints === matchup.awayPoints ? "DRAW" : `WINNER · ${matchup.homePoints! > matchup.awayPoints! ? matchup.homeTeamName : matchup.awayTeamName}` : null;
  return <TransitionLink href={`/matchup/${matchup.id}`} label={`${matchup.homeTeamName} vs ${matchup.awayTeamName}`} className={`block transition-colors hover:bg-foreground/5 ${isMine ? "bg-accent/5" : ""}`}>
    <div className="flex min-h-11 items-center gap-2.5 px-3 py-2.5 sm:px-4">
      <span className="label-system w-10 shrink-0 text-[10px] text-foreground-tertiary">RD {pad2(matchup.roundNumber)}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2"><TeamName name={matchup.homeTeamName} className="text-sm text-foreground" /><span className="label-system shrink-0 text-sm font-semibold tabular-nums text-foreground">{matchup.homePoints === null ? "—" : formatRoundPoints(matchup.homePoints)}</span></div>
        <div className="mt-0.5 flex items-center justify-between gap-2"><TeamName name={matchup.awayTeamName} className="text-sm text-foreground" /><span className="label-system shrink-0 text-sm font-semibold tabular-nums text-foreground">{matchup.awayPoints === null ? "—" : formatRoundPoints(matchup.awayPoints)}</span></div>
        {isMine && <span className="label-system text-[9px] text-accent">YOUR MATCHUP</span>}
      </div>
      <MatchupStatus state={matchup.resultState} />
    </div>
    {(winner || matchup.resultState === "pending") && <p className="label-system px-3 pb-2.5 text-[9px] leading-relaxed text-foreground-tertiary [overflow-wrap:anywhere] sm:px-4">
      {formatRoundWindow(matchup.roundStartsAt, matchup.roundEndsAt)} · {winner ?? "Finalizing result"}
    </p>}
  </TransitionLink>;
}

/** Container-sized proportional display keeps large scores readable at 320px. */
function ScoreDisplay({ points, alignRight = false }: { points: number | null; alignRight?: boolean }) {
  const value = points === null ? "—" : formatRoundPoints(points);
  return <div className={`v2-score-cell ${alignRight ? "text-right" : ""}`}><span className={`v2-display v2-score ${value.length > 6 ? "v2-score-wide" : ""}`}>{value}</span></div>;
}

/** Score-led sports presentation; the archive's default rows remain unchanged. */
function MatchupScoreCard({ matchup, myTeamId, compact }: { matchup: LeagueMatchupSummary; myTeamId: string | null; compact: boolean }) {
  const isMine = myTeamId !== null && (matchup.homeTeamId === myTeamId || matchup.awayTeamId === myTeamId);
  const final = matchup.resultState === "final" && matchup.homePoints !== null && matchup.awayPoints !== null;
  const result = final ? matchup.homePoints === matchup.awayPoints ? "Draw"
    : `Winner · ${matchup.homePoints! > matchup.awayPoints! ? matchup.homeTeamName : matchup.awayTeamName}` : null;
  return <TransitionLink href={`/matchup/${matchup.id}`} label={`${matchup.homeTeamName} vs ${matchup.awayTeamName}`}
    className={`v2-matchup ${isMine ? "v2-matchup-own" : ""} ${compact ? "v2-matchup-compact" : ""}`}>
    <div className="flex items-center justify-between gap-3">
      <span className={isMine ? "text-[13px] font-medium text-[var(--v2-accent)]" : "v2-meta"}>{isMine ? "Your matchup" : `Round ${matchup.roundNumber}`}</span>
      <MatchupStatus state={matchup.resultState} />
    </div>
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-5 gap-y-3">
      <TeamName name={matchup.homeTeamName} className="block text-[15px] font-medium leading-snug" />
      <TeamName name={matchup.awayTeamName} className="block text-right text-[15px] font-medium leading-snug" />
      <ScoreDisplay points={matchup.homePoints} />
      <ScoreDisplay points={matchup.awayPoints} alignRight />
    </div>
    <div className="v2-matchup-footer">
      {result ?? (matchup.resultState === "pending" ? "Finalizing result" : matchup.resultState === "upcoming" ? "Awaiting kickoff" : "View matchup →")}
      {compact && <p className="v2-meta mt-1">{formatRoundWindow(matchup.roundStartsAt, matchup.roundEndsAt)}</p>}
    </div>
  </TransitionLink>;
}

export function LeagueMatchups({
  matchups,
  myTeamId,
  emptyLabel,
  variant = "default",
  compact = false,
}: {
  matchups: LeagueMatchupSummary[];
  myTeamId: string | null;
  emptyLabel: string;
  variant?: "default" | "v2";
  compact?: boolean;
}) {
  if (matchups.length === 0) {
    return <p className={variant === "v2" ? "v2-secondary py-6" : "p-4 text-center text-sm text-foreground-secondary"}>{emptyLabel}</p>;
  }
  if (variant === "v2") {
    const ordered = [...matchups].sort((a, b) => {
      const mine = (m: LeagueMatchupSummary) => m.homeTeamId === myTeamId || m.awayTeamId === myTeamId;
      return Number(mine(b)) - Number(mine(a));
    });
    return <div className={compact ? "v2-results-list" : "v2-matchup-grid"}>{ordered.map(m => <MatchupScoreCard key={m.id} matchup={m} myTeamId={myTeamId} compact={compact} />)}</div>;
  }
  return (
    <div className="divide-y divide-border">
      {matchups.map((m) => (
        <MatchupRow key={m.id} matchup={m} myTeamId={myTeamId} />
      ))}
    </div>
  );
}
