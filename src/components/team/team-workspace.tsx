"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";
import { BenchRow } from "@/components/team/bench-row";
import { NextLock } from "@/components/team/next-lock";
import { Pitch } from "@/components/team/pitch";
import { RoundIntelligence } from "@/components/team/round-intelligence";
import { SquadAvailability } from "@/components/team/squad-availability";
import { PlayerInspector } from "@/components/players/player-inspector";
import { Button } from "@/components/ui/button";
import { ModuleHeader } from "@/components/ui/module-header";
import { RailModule } from "@/components/ui/rail-module";
import { swapLineupAction } from "@/app/(app)/team/actions";
import { pad2 } from "@/lib/team-fixture";
import type { LineupSlot, Player, PlayerAvailability, Squad } from "@/lib/types/fantasy";

const availabilityOrder: PlayerAvailability[] = ["available", "doubtful", "injured", "suspended"];

/**
 * Real lineup editing: select a starter or bench player, then select the
 * other side to swap them — persisted via `swapLineupAction`
 * (src/app/(app)/team/actions.ts), which re-validates lock state and
 * formation validity server-side before writing anything. Read-only
 * (no edit affordance at all) when there's no team, matching
 * "Interaction truthfulness" — see docs/product-state.md.
 */
export function TeamWorkspace({
  squad,
  matchdayNumber,
  leagueId,
  fantasyTeamId,
}: {
  squad: Squad;
  matchdayNumber: number | null;
  leagueId: string;
  fantasyTeamId: string | null;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<Player | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<{ side: "starter"; slot: LineupSlot } | { side: "bench"; player: Player } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function trySwap(starterOut: string, benchIn: string) {
    if (!fantasyTeamId || pending) return;
    setPending(true);
    setError(null);
    const result = await swapLineupAction(leagueId, fantasyTeamId, starterOut, benchIn);
    setPending(false);
    setSelected(null);
    if (result?.error) {
      setError(result.error);
    } else {
      router.refresh();
    }
  }

  function handleSelectStarter(slot: LineupSlot) {
    if (!editing) {
      openPlayer(slot.player);
      return;
    }
    if (slot.locked) {
      setError("That player's match has already started — their lineup slot is locked.");
      return;
    }
    if (selected?.side === "bench") {
      trySwap(slot.player.id, selected.player.id);
      return;
    }
    setSelected(selected?.side === "starter" && selected.slot.id === slot.id ? null : { side: "starter", slot });
  }

  function handleSelectBench(player: Player) {
    if (!editing) {
      openPlayer(player);
      return;
    }
    if (selected?.side === "starter") {
      trySwap(selected.slot.player.id, player.id);
      return;
    }
    setSelected(selected?.side === "bench" && selected.player.id === player.id ? null : { side: "bench", player });
  }

  function toggleEditing() {
    setEditing((prev) => !prev);
    setSelected(null);
    setError(null);
  }

  return (
    <div>
      {fantasyTeamId && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-foreground-tertiary">
            {editing
              ? "Select a starter, then a bench player (or vice versa) to swap them."
              : "Selecting a footballer opens their record."}
          </p>
          <Button
            variant={editing ? "outline" : "default"}
            className="rounded-control"
            onClick={toggleEditing}
          >
            {editing ? (
              <>
                <X className="mr-1.5 size-3.5" strokeWidth={2} /> Done
              </>
            ) : (
              <>
                <Pencil className="mr-1.5 size-3.5" strokeWidth={2} /> Edit lineup
              </>
            )}
          </Button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_0.5fr] lg:items-start">
        <section>
          <ModuleHeader title="STARTING_XI" meta={squad.formation} />
          <div className="mt-3">
            <Pitch
              slots={squad.starters}
              formation={squad.formation}
              editing={editing}
              selectedSlotId={selected?.side === "starter" ? selected.slot.id : null}
              swapTargetPosition={selected?.side === "bench" ? selected.player.position : null}
              onSelectSlot={handleSelectStarter}
            />
            {squad.starters.length === 0 && (
              <p className="mt-3 text-center text-sm text-foreground-tertiary">
                {fantasyTeamId ? "NO STARTERS SET" : "NO SQUAD — complete your league draft to build your squad."}
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
                    editing={editing}
                    selected={selected?.side === "bench" && selected.player.id === player.id}
                    swapTarget={selected?.side === "starter"}
                    onSelect={() => handleSelectBench(player)}
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
            <RoundIntelligence starters={squad.starters} hasActiveRound={squad.formation !== "—"} />
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
