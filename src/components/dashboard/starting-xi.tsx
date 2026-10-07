"use client";

import { useState } from "react";
import { PlayerInspector } from "@/components/players/player-inspector";
import { PlayerRow } from "@/components/players/player-row";
import { TransitionLink } from "@/components/shell/transition-link";
import { HomeSection } from "./home-overview";
import { sortByStartingPositionOrder } from "@/lib/team-fixture";
import type { Player } from "@/lib/types/fantasy";

/** Pass 14.6.3: same FWD -> MID -> DEF -> GK display order as /matchup (via the one shared `sortByStartingPositionOrder` helper), not whatever order the squad query happened to return. */
export function StartingXI({ players: unorderedPlayers }: { players: Player[] }) {
  const players = sortByStartingPositionOrder(unorderedPlayers);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const selected = players.find((p) => p.id === selectedId) ?? null;

  return (
    <HomeSection title="Starting XI" description={players.length > 0 ? `${players.length} starters · Select a player for details` : "Your matchweek lineup"} className="home-lineup"
        action={
          <TransitionLink href="/team" label="Team" className="v2-link">
            Full squad →
          </TransitionLink>
        }>

      {players.length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-10 text-center">
          <p className="text-sm text-foreground-secondary">No squad yet</p>
          <p className="max-w-xs text-xs text-foreground-tertiary">
            Complete your league draft to build your squad.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {players.map((player) => (
            <PlayerRow
              key={player.id}
              player={player}
              selected={player.id === selectedId && open}
              onSelect={() => {
                setSelectedId(player.id);
                setOpen(true);
              }}
            />
          ))}
        </div>
      )}

      <PlayerInspector player={selected} variant="overlay" open={open} onOpenChange={setOpen} />
    </HomeSection>
  );
}
