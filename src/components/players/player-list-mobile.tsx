"use client";

import { PlayerIdentity } from "@/components/players/player-identity";
import { AvailabilityStatus } from "@/components/players/availability-status";
import { MarketAction } from "@/components/players/market-action";
import { leagueLabels } from "@/lib/leagues";
import type { Player } from "@/lib/types/fantasy";
import { cn } from "@/lib/utils";

export function PlayerListMobile({ players, selectedId, onSelect, onAdd, onDrop, pendingPlayerId }: {
  players: Player[]; selectedId: string | null; onSelect: (player: Player) => void;
  onAdd?: (player: Player) => void; onDrop?: (player: Player) => void; pendingPlayerId?: string | null;
}) {
  return <ul className="core-surface core-results divide-y divide-border" aria-label="Player results">{players.map(player => <li key={player.id} id={`player-row-${player.id}`} className={cn("core-mobile-result",player.id === selectedId && "core-row-selected")}>
    <button type="button" className="core-inspect-player" onClick={() => onSelect(player)} aria-label={`Inspect ${player.name}`} aria-pressed={player.id === selectedId}>
      <PlayerIdentity player={player} />
      <span className="core-player-club">{leagueLabels[player.club.league]}{player.availability && player.availability !== "available" && <> · <AvailabilityStatus availability={player.availability} /></>}</span>
    </button>
    <div className="core-mobile-result-action"><p className="core-catalog-points">{player.totalPoints ?? "—"}<span className="core-player-club">points</span></p><MarketAction player={player} onAdd={onAdd} onDrop={onDrop} pending={pendingPlayerId === player.id} /></div>
  </li>)}</ul>;
}
