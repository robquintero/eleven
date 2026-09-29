"use client";

import { useEffect, useState } from "react";
import { FixturesList } from "@/components/football/fixtures-list";
import { BenchRow } from "@/components/team/bench-row";
import { NextLock } from "@/components/team/next-lock";
import { Pitch } from "@/components/team/pitch";
import { RoundIntelligence } from "@/components/team/round-intelligence";
import { SquadAvailability } from "@/components/team/squad-availability";
import { PlayerInspector } from "@/components/players/player-inspector";
import { Button } from "@/components/ui/button";
import {
  currentLeague,
  currentMatchup,
  currentRound,
  currentUserTeam,
} from "@/lib/mock/dashboard";
import { roundFixtures } from "@/lib/mock/fixtures";
import { enrichMine } from "@/lib/mock/players-database";
import { squad as initialSquad } from "@/lib/mock/team";
import {
  findBenchPlayerAtPosition,
  findStarterSlotAtPosition,
  findStarterSlotForPlayer,
  swapPlayers,
} from "@/lib/selectors/lineup";
import { nextLock, pad2 } from "@/lib/team-fixture";
import type {
  LineupSlot,
  Player,
  PlayerAvailability,
  Squad,
} from "@/lib/types/fantasy";

type Pending = { type: "slot" | "bench"; id: string } | null;
type DetailTarget = { player: Player; isStarter: boolean } | null;

const availabilityOrder: PlayerAvailability[] = [
  "available",
  "doubtful",
  "injured",
  "suspended",
];

export default function TeamPage() {
  const [squad, setSquad] = useState<Squad>(initialSquad);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [detail, setDetail] = useState<DetailTarget>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const record = `${currentUserTeam.wins}-${currentUserTeam.losses}${
    currentUserTeam.draws ? `-${currentUserTeam.draws}` : ""
  }`;

  function swap(slotId: string, benchPlayerId: string) {
    setSquad((prev) => swapPlayers(prev, slotId, benchPlayerId));
  }

  function toggleEditing() {
    setEditing((v) => !v);
    setPending(null);
  }

  function handleSlotClick(slot: LineupSlot) {
    if (!editing) {
      setDetail({ player: enrichMine(slot.player), isStarter: true });
      setDetailOpen(true);
      return;
    }

    if (pending?.type === "bench") {
      const benchPlayer = squad.bench.find((p) => p.id === pending.id);
      if (benchPlayer && benchPlayer.position === slot.position) {
        swap(slot.id, benchPlayer.id);
        setPending(null);
        return;
      }
      setPending({ type: "slot", id: slot.id });
      return;
    }

    setPending((current) =>
      current?.type === "slot" && current.id === slot.id
        ? null
        : { type: "slot", id: slot.id }
    );
  }

  function handleBenchClick(player: Player) {
    if (!editing) {
      setDetail({ player: enrichMine(player), isStarter: false });
      setDetailOpen(true);
      return;
    }

    if (pending?.type === "slot") {
      const slot = squad.starters.find((s) => s.id === pending.id);
      if (slot && slot.position === player.position) {
        swap(slot.id, player.id);
        setPending(null);
        return;
      }
      setPending({ type: "bench", id: player.id });
      return;
    }

    setPending((current) =>
      current?.type === "bench" && current.id === player.id
        ? null
        : { type: "bench", id: player.id }
    );
  }

  function handleMoveToBench(player: Player) {
    const slot = findStarterSlotForPlayer(squad, player.id);
    const benchTarget = findBenchPlayerAtPosition(squad, player.position);
    if (!slot || !benchTarget) return;
    swap(slot.id, benchTarget.id);
    setDetailOpen(false);
  }

  function handleMoveToStarting(player: Player) {
    const slot = findStarterSlotAtPosition(squad, player.position);
    if (!slot) return;
    swap(slot.id, player.id);
    setDetailOpen(false);
  }

  const pendingSlot =
    pending?.type === "slot"
      ? (squad.starters.find((s) => s.id === pending.id) ?? null)
      : null;
  const pendingBenchPlayer =
    pending?.type === "bench"
      ? (squad.bench.find((p) => p.id === pending.id) ?? null)
      : null;

  const availabilityCounts = [...squad.starters.map((s) => s.player), ...squad.bench].reduce(
    (acc, player) => {
      const status = player.availability ?? "available";
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    },
    Object.fromEntries(availabilityOrder.map((s) => [s, 0])) as Record<
      PlayerAvailability,
      number
    >
  );

  const detailCanSwap = detail
    ? detail.isStarter
      ? squad.bench.some((p) => p.position === detail.player.position)
      : squad.starters.some((s) => s.position === detail.player.position)
    : false;

  const upcomingLock = nextLock(squad.starters);

  useEffect(() => {
    if (!editing) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (pending) {
        setPending(null);
      } else {
        setEditing(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editing, pending]);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {currentUserTeam.name}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm text-foreground-secondary">
            <span>{currentLeague.name}</span>
            <span className="text-foreground-tertiary">·</span>
            <span className="label-system text-xs tabular-nums">{record}</span>
            <span className="text-foreground-tertiary">·</span>
            <span className="label-system text-xs text-foreground-tertiary">
              MATCHDAY {pad2(currentRound.number)}
            </span>
          </p>
        </div>
        <Button variant={editing ? "default" : "outline"} size="sm" onClick={toggleEditing}>
          {editing ? "Done" : "Edit lineup"}
        </Button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {editing && (
          <span className="label-system flex items-center gap-1.5 border border-l-2 border-accent/40 border-l-accent bg-accent/5 px-2 py-1 text-[10px] font-semibold text-accent">
            LINEUP_MODE / EDIT
          </span>
        )}
        <p className="text-xs text-foreground-tertiary">
          {editing
            ? "Tap a starter, then a bench player in the same position to swap. Esc to cancel."
            : "Lineup locks progressively as player matches begin."}
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-12">
        <section>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Starting XI
          </h2>
          <div className="mt-3">
            <Pitch
              slots={squad.starters}
              formation={squad.formation}
              editing={editing}
              selectedSlotId={pendingSlot?.id ?? null}
              swapTargetPosition={pendingBenchPlayer?.position ?? null}
              onSelectSlot={handleSlotClick}
            />
          </div>
        </section>

        <div className="space-y-8">
          <section>
            <div className="flex items-baseline gap-2">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Bench
              </h2>
              <span className="label-system text-xs text-foreground-tertiary">
                / {pad2(squad.bench.length)}
              </span>
            </div>

            <div className="hidden gap-3 px-1 pt-3 pb-1 sm:grid sm:grid-cols-[1.25rem_2.25rem_1fr_3rem_4.5rem_5rem]">
              <span />
              <span className="label-system text-[10px] text-foreground-tertiary">
                POS
              </span>
              <span className="label-system text-[10px] text-foreground-tertiary">
                PLAYER
              </span>
              <span className="label-system text-[10px] text-foreground-tertiary">
                CLUB
              </span>
              <span className="label-system text-[10px] text-foreground-tertiary">
                FIXTURE
              </span>
              <span className="label-system text-right text-[10px] text-foreground-tertiary">
                STATUS
              </span>
            </div>

            <div className="mt-1 divide-y divide-border sm:mt-0">
              {squad.bench.map((player, index) => (
                <BenchRow
                  key={player.id}
                  index={index}
                  player={player}
                  editing={editing}
                  selected={pending?.type === "bench" && pending.id === player.id}
                  swapTarget={editing && pendingSlot?.position === player.position}
                  onSelect={() => handleBenchClick(player)}
                />
              ))}
            </div>
          </section>

          <SquadAvailability counts={availabilityCounts} />

          <RoundIntelligence starters={squad.starters} matchup={currentMatchup} />

          <NextLock slot={upcomingLock} />

          <section>
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              Round {pad2(currentRound.number)} fixtures
            </h2>
            <div className="mt-2">
              <FixturesList fixtures={roundFixtures} />
            </div>
          </section>
        </div>
      </div>

      <PlayerInspector
        player={detail?.player ?? null}
        variant="overlay"
        open={detailOpen}
        onOpenChange={setDetailOpen}
        lineupContext={
          detail
            ? {
                isStarter: detail.isStarter,
                canSwap: detailCanSwap,
                onMoveToBench: () => handleMoveToBench(detail.player),
                onMoveToStarting: () => handleMoveToStarting(detail.player),
              }
            : undefined
        }
      />
    </div>
  );
}
