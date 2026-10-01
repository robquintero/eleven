"use client";

import { useState } from "react";
import { BenchRow } from "@/components/team/bench-row";
import { PlayerInspector } from "@/components/players/player-inspector";
import { pad2 } from "@/lib/team-fixture";
import type { LineupSlot, Player, Squad } from "@/lib/types/fantasy";

/**
 * One manager's side of the head-to-head comparison -- a dense LIST (per
 * the brief's own "MY XI / OPPONENT XI, player / player" spec), not the
 * Team page's graphical pitch diagram: this is an operational read, not a
 * lineup-editing surface, and the existing `BenchRow` already renders
 * exactly the real name/position/club/fixture-state/points/lock
 * information needed per row, reused as-is (never a second status-label
 * implementation -- see BenchRow's own `statusLabel()`).
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
          {squad.starters.map((slot: LineupSlot, index) => (
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
 * The Matchup page's primary surface -- both managers' complete starting
 * XI + bench, side by side on desktop/tablet and stacked full-width on
 * mobile (`grid-cols-1 lg:grid-cols-2` -- two half-width lists would be
 * illegible at 375px, so mobile gets each full-width list in turn rather
 * than a squeezed side-by-side table). Read-only: selecting a player opens
 * the same `PlayerInspector` overlay every other screen uses, never a
 * second player-detail implementation.
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
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
