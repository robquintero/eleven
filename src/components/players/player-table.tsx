"use client";

import { ArrowDown } from "lucide-react";
import { PlayerIdentity } from "@/components/players/player-identity";
import { AvailabilityStatus } from "@/components/players/availability-status";
import { MarketAction } from "@/components/players/market-action";
import { leagueCode } from "@/lib/leagues";
import type { SortKey } from "@/lib/players-filters";
import { playerFixtureCode } from "@/lib/team-fixture";
import type { Player } from "@/lib/types/fantasy";
import { cn } from "@/lib/utils";

export function PlayerTable({ players, selectedId, highlightedId, sort, onSort, onSelect, onAdd, onDrop, pendingPlayerId }: {
  players: Player[]; selectedId: string | null; highlightedId: string | null;
  sort: SortKey; onSort: (key: SortKey) => void; onSelect: (player: Player) => void;
  onAdd?: (player: Player) => void; onDrop?: (player: Player) => void; pendingPlayerId?: string | null;
}) {
  function sortHeading(label: string, key: SortKey) {
    return <button type="button" onClick={() => onSort(key)} className="core-sort-heading">{label}{sort === key && <ArrowDown className="size-3" aria-hidden="true" />}</button>;
  }
  return <div className="core-surface core-results @container">
    <table className="core-player-table">
      <caption className="sr-only">Player scouting results. Select a player to inspect; roster actions are separate controls.</caption>
      <thead><tr><th scope="col">{sortHeading("Player", "name")}</th><th scope="col" className="core-catalog-context">{sortHeading("Club / next", "club")}</th><th scope="col" className="core-catalog-minutes">Minutes</th><th scope="col" className="core-catalog-starts">Starts</th><th scope="col" className="core-numeric">Points</th><th scope="col" className="core-market-cell">Roster</th></tr></thead>
      <tbody>{players.map(player => <tr key={player.id} id={`player-row-${player.id}`} className={cn(player.id === selectedId && "core-row-selected", player.id !== selectedId && player.id === highlightedId && "core-row-highlighted")}>
        <td><button type="button" onClick={() => onSelect(player)} className="core-inspect-player" aria-label={`Inspect ${player.name}`} aria-pressed={player.id === selectedId}><PlayerIdentity player={player} />{player.availability && player.availability !== "available" && <AvailabilityStatus availability={player.availability} />}</button></td>
        <td className="core-catalog-context"><span className="core-player-club">{player.club.shortName} · {leagueCode[player.club.league]}</span><span className="core-player-club">{playerFixtureCode(player)}</span></td>
        <td className="core-catalog-minutes core-numeric">{player.seasonStats ? player.seasonStats.minutes : "—"}</td>
        <td className="core-catalog-starts core-numeric">{player.seasonStats ? player.seasonStats.starts : "—"}</td>
        <td className="core-numeric core-catalog-points">{player.totalPoints ?? "—"}</td>
        <td className="core-market-cell"><MarketAction player={player} onAdd={onAdd} onDrop={onDrop} pending={pendingPlayerId === player.id} /></td>
      </tr>)}</tbody>
    </table>
  </div>;
}
