import { PositionBadge } from "@/components/players/position-badge";
import type { Player } from "@/lib/types/fantasy";

/** The same footballer identity on the scouting and draft boards. */
export function PlayerIdentity({ player }: { player: Player }) {
  return <span className="core-player-identity">
    <PositionBadge position={player.position} />
    <span className="min-w-0"><span className="core-player-name" title={player.name}>{player.name}</span><span className="core-player-club">{player.club.shortName}</span></span>
  </span>;
}
