"use client";

import { useState } from "react";
import { BenchRow } from "@/components/team/bench-row";
import { MatchupCompactRow } from "@/components/matchup/matchup-compact-row";
import { PlayerInspector } from "@/components/players/player-inspector";
import { pad2, sortStartersForMatchupDisplay } from "@/lib/team-fixture";
import type { LineupSlot, Player, Squad } from "@/lib/types/fantasy";

/**
 * One manager's side of the head-to-head comparison, full-width detail —
 * the desktop/tablet (`lg:`+) presentation, using the real `BenchRow`
 * (name/position/club/fixture-state/points/lock, reused as-is). Never
 * shown below `lg:`, where there isn't room for two of these side by side
 * without either horizontal scroll or illegible text — see
 * `MatchupCompactColumn` for that viewport instead.
 */
function TeamLineupColumn({
  label,
  teamName,
  isUserTeam,
  squad,
  onSelect,
}: {
  label: string;
  teamName: string;
  isUserTeam: boolean;
  squad: Squad;
  onSelect: (player: Player) => void;
}) {
  return (
    <div className="border border-border">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <p className="label-system text-[11px] text-foreground-secondary">{label}</p>
          <p className="truncate text-sm font-semibold text-foreground">
            {teamName}
            {isUserTeam && <span className="label-system ml-2 text-[10px] text-accent">YOUR TEAM</span>}
          </p>
        </div>
        <span className="label-system shrink-0 text-[10px] text-foreground-tertiary">{squad.formation}</span>
      </div>

      {squad.starters.length === 0 ? (
        <p className="p-4 text-center text-sm text-foreground-tertiary">NO STARTING XI SET</p>
      ) : (
        <div className="divide-y divide-border">
          {sortStartersForMatchupDisplay(squad.starters).map((slot: LineupSlot, index) => (
            <BenchRow key={slot.id} index={index} player={slot.player} onSelect={() => onSelect(slot.player)} />
          ))}
        </div>
      )}

      <div className="border-t border-border bg-surface px-4 py-1.5">
        <span className="label-system text-[10px] text-foreground-tertiary">BENCH / {pad2(squad.bench.length)}</span>
      </div>
      {squad.bench.length === 0 ? (
        <p className="p-4 text-center text-xs text-foreground-tertiary">NO BENCH PLAYERS</p>
      ) : (
        <div className="divide-y divide-border">
          {squad.bench.map((player, index) => (
            <BenchRow key={player.id} index={index} player={player} onSelect={() => onSelect(player)} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One manager's side of the head-to-head comparison, compact — the
 * below-`lg:` presentation (phones and most tablets in portrait). Sits in
 * a true half-width column so MY XI and OPPONENT XI stay side by side,
 * exactly as the brief requires ("my player <-> their player," never
 * stacked, never a horizontal-scroll escape hatch). Team name is
 * abbreviated to fit a narrow header rather than wrapping/truncating
 * awkwardly — the full names are already visible in MatchupCommand above
 * this component on the page, so this header's job is just "which side is
 * which," not re-stating the name in full.
 */
function MatchupCompactColumn({
  label,
  teamName,
  isUserTeam,
  squad,
  onSelect,
}: {
  label: string;
  teamName: string;
  isUserTeam: boolean;
  squad: Squad;
  onSelect: (player: Player) => void;
}) {
  return (
    <div className="border border-border">
      <div className="border-b border-border px-1.5 py-1.5">
        <p className="label-system truncate text-[9px] text-foreground-secondary">{label}</p>
        <p className="truncate text-[11px] font-semibold text-foreground">
          {teamName}
          {isUserTeam && <span className="ml-1 text-accent">●</span>}
        </p>
      </div>

      {squad.starters.length === 0 ? (
        <p className="p-3 text-center text-[11px] text-foreground-tertiary">NO STARTING XI SET</p>
      ) : (
        <div className="divide-y divide-border">
          {sortStartersForMatchupDisplay(squad.starters).map((slot: LineupSlot) => (
            <MatchupCompactRow key={slot.id} player={slot.player} onSelect={() => onSelect(slot.player)} />
          ))}
        </div>
      )}

      <div className="border-t border-border bg-surface px-1.5 py-1">
        <span className="label-system text-[8px] text-foreground-tertiary">BENCH / {pad2(squad.bench.length)}</span>
      </div>
      {squad.bench.length > 0 && (
        <div className="divide-y divide-border">
          {squad.bench.map((player) => (
            <MatchupCompactRow key={player.id} player={player} onSelect={() => onSelect(player)} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The Matchup page's primary surface — both managers' complete starting
 * XI + bench, ALWAYS side by side (Pass 12F — this was previously
 * `grid-cols-1 lg:grid-cols-2`, which stacked the two teams vertically on
 * mobile; that stacking is exactly the bug this pass fixes). Below `lg:`,
 * a compact, mobile-composed row (`MatchupCompactColumn`) keeps both
 * columns legible in half the viewport width; at `lg:` and above, the
 * full-detail `BenchRow` presentation (unchanged from before). Only one
 * of the two is ever actually in the accessibility tree / tab order at a
 * time (the other is `hidden`, not just visually collapsed), so this
 * never doubles screen-reader output or keyboard stops. Read-only:
 * selecting a player opens the same `PlayerInspector` overlay every other
 * screen uses, never a second player-detail implementation.
 */
export function MatchupLineups({
  homeTeamName,
  awayTeamName,
  isUserHome,
  homeSquad,
  awaySquad,
}: {
  homeTeamName: string;
  awayTeamName: string;
  isUserHome: boolean;
  homeSquad: Squad;
  awaySquad: Squad;
}) {
  const [selected, setSelected] = useState<Player | null>(null);
  const [open, setOpen] = useState(false);

  function handleSelect(player: Player) {
    setSelected(player);
    setOpen(true);
  }

  const mySquad = isUserHome ? homeSquad : awaySquad;
  const opponentSquad = isUserHome ? awaySquad : homeSquad;
  const myTeamName = isUserHome ? homeTeamName : awayTeamName;
  const opponentTeamName = isUserHome ? awayTeamName : homeTeamName;

  return (
    <>
      <div className="grid grid-cols-2 gap-1.5 lg:hidden">
        <MatchupCompactColumn label="MY XI" teamName={myTeamName} isUserTeam squad={mySquad} onSelect={handleSelect} />
        <MatchupCompactColumn
          label="OPPONENT"
          teamName={opponentTeamName}
          isUserTeam={false}
          squad={opponentSquad}
          onSelect={handleSelect}
        />
      </div>

      <div className="hidden grid-cols-2 gap-6 lg:grid">
        <TeamLineupColumn label="MY XI" teamName={myTeamName} isUserTeam squad={mySquad} onSelect={handleSelect} />
        <TeamLineupColumn
          label="OPPONENT XI"
          teamName={opponentTeamName}
          isUserTeam={false}
          squad={opponentSquad}
          onSelect={handleSelect}
        />
      </div>

      <PlayerInspector player={selected} variant="overlay" open={open} onOpenChange={setOpen} />
    </>
  );
}
