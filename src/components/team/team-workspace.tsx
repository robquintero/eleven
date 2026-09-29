"use client";

import { useState } from "react";
import { BenchRow } from "@/components/team/bench-row";
import { NextLock } from "@/components/team/next-lock";
import { Pitch } from "@/components/team/pitch";
import { RoundIntelligence } from "@/components/team/round-intelligence";
import { SquadAvailability } from "@/components/team/squad-availability";
import { PlayerInspector } from "@/components/players/player-inspector";
import { ModuleHeader } from "@/components/ui/module-header";
import { RailModule } from "@/components/ui/rail-module";
import { pad2 } from "@/lib/team-fixture";
import type { LineupSlot, Player, PlayerAvailability, Squad } from "@/lib/types/fantasy";

const availabilityOrder: PlayerAvailability[] = ["available", "doubtful", "injured", "suspended"];

/**
 * Read-only squad view. There is no lineup-editing backend yet (no draft
 * engine has ever populated `roster_entries`/`lineup_slots` — see
 * src/data-access/roster.ts), so this deliberately has no "Edit lineup"
 * control and no local lineup mutation — see docs/product-state.md
 * "Interaction truthfulness." Selecting a player only opens the shared,
 * real, read-only inspector.
 */
export function TeamWorkspace({ squad, matchdayNumber }: { squad: Squad; matchdayNumber: number | null }) {
  const [detail, setDetail] = useState<Player | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  function openPlayer(player: Player) {
    setDetail(player);
    setDetailOpen(true);
  }

  const allPlayers = [...squad.starters.map((s) => s.player), ...squad.bench];
  const availabilityCounts = allPlayers.reduce(
    (acc, player) => {
      const status = player.availability ?? "available";
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    },
    Object.fromEntries(availabilityOrder.map((s) => [s, 0])) as Record<PlayerAvailability, number>
  );

  return (
    <div>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_0.5fr] lg:items-start">
        <section>
          <ModuleHeader title="STARTING_XI" meta={squad.formation} />
          <div className="mt-3">
            <Pitch
              slots={squad.starters}
              formation={squad.formation}
              editing={false}
              selectedSlotId={null}
              swapTargetPosition={null}
              onSelectSlot={(slot: LineupSlot) => openPlayer(slot.player)}
            />
            {squad.starters.length === 0 && (
              <p className="mt-3 text-center text-sm text-foreground-tertiary">
                NO SQUAD — complete your league draft to build your squad.
              </p>
            )}
          </div>
        </section>

        <div className="flex flex-col divide-y divide-border border border-border">
          <RailModule header="BENCH" meta={`/ ${pad2(squad.bench.length)}`}>
            {squad.bench.length === 0 ? (
              <p className="text-xs text-foreground-tertiary">NO BENCH PLAYERS</p>
            ) : (
              <div className="divide-y divide-border">
                {squad.bench.map((player, index) => (
                  <BenchRow
                    key={player.id}
                    index={index}
                    player={player}
                    onSelect={() => openPlayer(player)}
                  />
                ))}
              </div>
            )}
          </RailModule>

          <RailModule header="SQUAD_STATUS">
            {allPlayers.length === 0 ? (
              <p className="text-xs text-foreground-tertiary">NO SQUAD</p>
            ) : (
              <SquadAvailability counts={availabilityCounts} />
            )}
          </RailModule>

          <RailModule header="ROUND_INTELLIGENCE">
            <RoundIntelligence starters={squad.starters} hasActiveRound={false} />
          </RailModule>

          <RailModule header="NEXT_LOCK">
            <NextLock slot={null} hasStarters={squad.starters.length > 0} />
          </RailModule>

          <RailModule
            header="FIXTURE_FEED"
            meta={matchdayNumber !== null ? `MATCHDAY ${pad2(matchdayNumber)}` : "—"}
          >
            <p className="text-xs text-foreground-tertiary">NO FIXTURE DATA</p>
          </RailModule>
        </div>
      </div>

      <PlayerInspector player={detail} variant="overlay" open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  );
}
