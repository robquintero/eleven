"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";
import { BenchRow } from "@/components/team/bench-row";
import { FormationSelector } from "@/components/team/formation-selector";
import { NextLock } from "@/components/team/next-lock";
import { Pitch, type EmptyPitchSlot, type PitchItem } from "@/components/team/pitch";
import { RoundIntelligence } from "@/components/team/round-intelligence";
import { SquadAvailability } from "@/components/team/squad-availability";
import { PlayerInspector } from "@/components/players/player-inspector";
import { Button } from "@/components/ui/button";
import { ModuleHeader } from "@/components/ui/module-header";
import { RailModule } from "@/components/ui/rail-module";
import { swapLineupAction, changeFormationAction, fillEmptySlotsAction } from "@/app/(app)/team/actions";
import { FORMATION_RULES } from "@/domain/fantasy/constants";
import { SUPPORTED_FORMATIONS, emptySlotCounts, type FormationName } from "@/domain/fantasy/formations";
import { layoutStartingXi } from "@/lib/selectors/pitch-layout";
import { pad2 } from "@/lib/team-fixture";
import type { LineupSlot, Player, PlayerAvailability, PlayerPosition, Squad } from "@/lib/types/fantasy";

const availabilityOrder: PlayerAvailability[] = ["available", "doubtful", "injured", "suspended"];
const POSITION_ORDER: PlayerPosition[] = ["GK", "DEF", "MID", "FWD"];

/**
 * Merges the real persisted starters with any locally-pending (unsaved)
 * fills and, for whatever's still missing, empty-slot placeholders — up
 * to the target formation's own shape (Pass 10.5C). Real starters are
 * NEVER hidden even if they exceed the target count for their position
 * (shouldn't happen via any flow this app offers, but this never drops a
 * real player from view either way). `layoutStartingXi` only needs each
 * item's position to place it, so pending fills are laid out exactly like
 * real starters, and rendered as ordinary `PlayerNode`s on the pitch
 * (`Pitch` distinguishes "player" vs "empty" purely by the presence of a
 * `player` field) — clicking one is handled specially (see
 * `handleSelectStarter`) to unassign it rather than start a swap.
 */
function buildPitchItems(starters: LineupSlot[], pendingFills: Map<string, { position: PlayerPosition; player: Player }>, formation: FormationName): PitchItem[] {
  const entries: { position: PlayerPosition; value: { kind: "player"; slot: LineupSlot } | { kind: "pending"; playerId: string; player: Player } | { kind: "empty"; key: string } }[] = [];
  const filledCounts: Partial<Record<PlayerPosition, number>> = {};

  for (const position of POSITION_ORDER) {
    const real = starters.filter((s) => s.position === position);
    for (const slot of real) entries.push({ position, value: { kind: "player", slot } });

    const pendingAtPosition = Array.from(pendingFills.entries()).filter(([, v]) => v.position === position);
    for (const [playerId, v] of pendingAtPosition) entries.push({ position, value: { kind: "pending", playerId, player: v.player } });

    filledCounts[position] = real.length + pendingAtPosition.length;
  }

  const empty = emptySlotCounts(filledCounts, formation);
  for (const position of POSITION_ORDER) {
    for (let i = 0; i < empty[position]; i++) entries.push({ position, value: { kind: "empty", key: `empty-${position}-${i}` } });
  }

  return layoutStartingXi(entries).map(({ position, value, x, y }): PitchItem => {
    if (value.kind === "player") return { ...value.slot, x, y };
    if (value.kind === "pending") return { id: `pending-${value.playerId}`, position, x, y, player: value.player, locked: false };
    return { id: value.key, position, x, y } satisfies EmptyPitchSlot;
  });
}

/**
 * Real lineup editing: select a starter or bench player, then select the
 * other side to swap them — persisted via `swapLineupAction`
 * (src/app/(app)/team/actions.ts), which re-validates lock state and
 * formation validity server-side before writing anything. Read-only
 * (no edit affordance at all) when there's no team, matching
 * "Interaction truthfulness" — see docs/product-state.md.
 *
 * Pass 10.5C also adds: the formation selector stays visible and usable
 * even with an incomplete/empty starting XI (feasibility is always judged
 * against the FULL 16-player roster, not just current starters — see
 * `rosterCounts` below), and the pitch always shows the target
 * formation's full 11 slots, empty ones included, so a manager can select
 * an empty slot and fill it from the bench directly. Selecting a
 * formation from the dropdown still auto-resolves a complete XI via
 * `changeFormationAction` when the roster can supply it in full (Pass
 * 10.5B, unchanged); manual empty-slot fills are queued client-side and
 * only committed once they'd bring the team to exactly 11 (an "editing"
 * state is never itself persisted as a valid lineup — see
 * `fillEmptySlotsAction`'s own doc comment).
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
  const [selected, setSelected] = useState<
    | { side: "starter"; slot: LineupSlot }
    | { side: "bench"; player: Player }
    | { side: "empty"; emptySlotId: string; position: PlayerPosition }
    | null
  >(null);
  const [pendingFills, setPendingFills] = useState<Map<string, { position: PlayerPosition; player: Player }>>(new Map());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openPlayer(player: Player) {
    setDetail(player);
    setDetailOpen(true);
  }

  const allPlayers = [...squad.starters.map((s) => s.player), ...squad.bench];
  // Roster-WIDE counts (starters + bench together) -- formation
  // feasibility is always judged against everything a manager owns, not
  // merely whoever currently happens to be starting (Pass 10.5C).
  const rosterCounts = allPlayers.reduce(
    (acc, player) => {
      acc[player.position] = (acc[player.position] ?? 0) + 1;
      return acc;
    },
    {} as Partial<Record<Player["position"], number>>
  );
  const currentFormation: FormationName | null = (SUPPORTED_FORMATIONS as readonly string[]).includes(squad.formation)
    ? (squad.formation as FormationName)
    : null;
  // The shape the pitch renders against right now -- the real current
  // formation when the XI is already complete and matches one of the 5,
  // else a sensible default (4-4-2 needs DEF4/MID4/FWD2, exactly
  // ROSTER_RULES' own minimums, so every legally-drafted 16-player roster
  // can always supply it) so an incomplete/empty XI still has a concrete
  // 11-slot target to build toward.
  const effectiveFormation: FormationName = currentFormation ?? "4-4-2";

  const visibleBench = squad.bench.filter((p) => !pendingFills.has(p.id));
  const pitchItems = buildPitchItems(squad.starters, pendingFills, effectiveFormation);
  const totalAssigned = squad.starters.length + pendingFills.size;

  async function handleFormationChange(formation: FormationName) {
    if (!fantasyTeamId || pending) return;
    setPendingFills(new Map());
    setSelected(null);
    setPending(true);
    setError(null);
    const result = await changeFormationAction(leagueId, fantasyTeamId, formation);
    setPending(false);
    if (result?.error) {
      setError(result.error);
    } else {
      router.refresh();
    }
  }

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

  /**
   * Queues a bench player against an empty slot's position, client-side
   * only (an "editing" state, never itself a valid persisted lineup — see
   * this component's own doc comment). Auto-commits the WHOLE queued
   * batch the moment it would bring the team to exactly
   * `FORMATION_RULES.startersTotal` (11) -- never before, since
   * `updateLineup()` (via `fillEmptySlotsAction`) only ever accepts a
   * complete, valid composition in one shot.
   */
  async function queueFill(player: Player, position: PlayerPosition) {
    const next = new Map(pendingFills);
    next.set(player.id, { position, player });
    setSelected(null);
    setError(null);

    if (squad.starters.length + next.size >= FORMATION_RULES.startersTotal) {
      if (!fantasyTeamId || pending) return;
      setPending(true);
      const fills = Array.from(next.entries()).map(([playerId, v]) => ({ playerId, position: v.position }));
      const result = await fillEmptySlotsAction(leagueId, fantasyTeamId, fills);
      setPending(false);
      if (result?.error) {
        setError(result.error);
        setPendingFills(next);
      } else {
        setPendingFills(new Map());
        router.refresh();
      }
    } else {
      setPendingFills(next);
    }
  }

  function unqueueFill(playerId: string) {
    const next = new Map(pendingFills);
    next.delete(playerId);
    setPendingFills(next);
  }

  function handleSelectStarter(slot: LineupSlot) {
    if (slot.id.startsWith("pending-")) {
      if (!editing) return;
      unqueueFill(slot.id.slice("pending-".length));
      return;
    }
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

  function handleSelectEmptySlot(emptySlot: EmptyPitchSlot) {
    if (!editing) return;
    if (selected?.side === "bench") {
      if (selected.player.position !== emptySlot.position) {
        setError(`That slot needs a ${emptySlot.position}.`);
        return;
      }
      queueFill(selected.player, emptySlot.position);
      return;
    }
    setSelected(
      selected?.side === "empty" && selected.emptySlotId === emptySlot.id
        ? null
        : { side: "empty", emptySlotId: emptySlot.id, position: emptySlot.position }
    );
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
    if (selected?.side === "empty") {
      if (player.position !== selected.position) {
        setError(`That slot needs a ${selected.position}.`);
        return;
      }
      queueFill(player, selected.position);
      return;
    }
    setSelected(selected?.side === "bench" && selected.player.id === player.id ? null : { side: "bench", player });
  }

  function toggleEditing() {
    setEditing((prev) => !prev);
    setSelected(null);
    setPendingFills(new Map());
    setError(null);
  }

  return (
    <div>
      {fantasyTeamId && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-foreground-tertiary">
            {editing
              ? pendingFills.size > 0
                ? `Building lineup — ${totalAssigned} / ${FORMATION_RULES.startersTotal} selected.`
                : "Select a starter, then a bench player (or vice versa) to swap them — or select an empty slot to fill it from the bench."
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
          <ModuleHeader
            title="STARTING_XI"
            meta={
              fantasyTeamId ? (
                <FormationSelector
                  currentFormation={currentFormation}
                  rosterCounts={rosterCounts}
                  disabled={pending}
                  onChange={handleFormationChange}
                />
              ) : (
                squad.formation
              )
            }
          />
          <div className="mt-3">
            <Pitch
              slots={pitchItems}
              formation={squad.formation}
              editing={editing}
              selectedSlotId={selected?.side === "starter" ? selected.slot.id : null}
              swapTargetPosition={selected?.side === "bench" ? selected.player.position : null}
              onSelectSlot={handleSelectStarter}
              selectedEmptySlotId={selected?.side === "empty" ? selected.emptySlotId : null}
              fillTargetPosition={selected?.side === "bench" ? selected.player.position : null}
              onSelectEmptySlot={handleSelectEmptySlot}
            />
            {!fantasyTeamId && (
              <p className="mt-3 text-center text-sm text-foreground-tertiary">
                NO SQUAD — complete your league draft to build your squad.
              </p>
            )}
          </div>
        </section>

        {/* Pass 10.5B: slightly tighter vertical padding on desktop (lg:)
            only, here in Team's own rail — RailModule's own default is
            unchanged for every other screen that reuses it (e.g. Draft).
            Bench rows (real content, not padding) still take the space
            they need. */}
        <div className="flex flex-col divide-y divide-border border border-border">
          <RailModule header="BENCH" meta={`/ ${pad2(visibleBench.length)}`} className="lg:py-2.5">
            {visibleBench.length === 0 ? (
              <p className="text-xs text-foreground-tertiary">NO BENCH PLAYERS</p>
            ) : (
              <div className="divide-y divide-border">
                {visibleBench.map((player, index) => (
                  <BenchRow
                    key={player.id}
                    index={index}
                    player={player}
                    editing={editing}
                    selected={selected?.side === "bench" && selected.player.id === player.id}
                    swapTarget={selected?.side === "starter" || selected?.side === "empty"}
                    onSelect={() => handleSelectBench(player)}
                  />
                ))}
              </div>
            )}
          </RailModule>

          <RailModule header="SQUAD_STATUS" className="lg:py-2.5">
            {allPlayers.length === 0 ? (
              <p className="text-xs text-foreground-tertiary">NO SQUAD</p>
            ) : (
              <SquadAvailability counts={availabilityCounts} />
            )}
          </RailModule>

          <RailModule header="ROUND_INTELLIGENCE" className="lg:py-2.5">
            <RoundIntelligence starters={squad.starters} hasActiveRound={squad.formation !== "—"} />
          </RailModule>

          <RailModule header="NEXT_LOCK" className="lg:py-2.5">
            <NextLock slot={null} hasStarters={squad.starters.length > 0} />
          </RailModule>

          <RailModule
            header="FIXTURE_FEED"
            meta={matchdayNumber !== null ? `MATCHDAY ${pad2(matchdayNumber)}` : "—"}
            className="lg:py-2.5"
          >
            <p className="text-xs text-foreground-tertiary">NO FIXTURE DATA</p>
          </RailModule>
        </div>
      </div>

      <PlayerInspector player={detail} variant="overlay" open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  );
}
