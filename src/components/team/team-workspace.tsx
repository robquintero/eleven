"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";
import { BenchRow } from "@/components/team/bench-row";
import { NextLock } from "@/components/team/next-lock";
import { Pitch, type EmptyPitchSlot, type PitchItem } from "@/components/team/pitch";
import { RoundIntelligence } from "@/components/team/round-intelligence";
import { SquadAvailability } from "@/components/team/squad-availability";
import { PlayerInspector } from "@/components/players/player-inspector";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ModuleHeader } from "@/components/ui/module-header";
import { RailModule } from "@/components/ui/rail-module";
import { swapLineupAction, fillEmptySlotsAction } from "@/app/(app)/team/actions";
import { dropPlayerAction } from "@/app/(app)/players/actions";
import { FORMATION_RULES } from "@/domain/fantasy/constants";
import { assignToSlots, formationSlots, type FormationSlot } from "@/lib/selectors/pitch-layout";
import { pad2 } from "@/lib/team-fixture";
import type { LineupSlot, Player, PlayerAvailability, PlayerPosition, Squad } from "@/lib/types/fantasy";

const availabilityOrder: PlayerAvailability[] = ["available", "doubtful", "injured", "suspended"];

/**
 * One `PitchItem` per formation slot, in a fixed priority per slot:
 * a locally-queued (unsaved) fill first, then the real persisted
 * starter, then empty. `Pitch` itself only distinguishes "player" vs
 * "empty" by whether a `player` field is present — pending fills are
 * rendered as ordinary `PlayerNode`s, using the SAME slot id as their
 * target slot, so clicking one is unambiguous (see
 * `handleSelectStarterOrPending`).
 */
function buildPitchItems(
  slots: FormationSlot[],
  occupancy: Map<string, LineupSlot>,
  pendingAssignments: Map<string, Player>
): PitchItem[] {
  return slots.map((slot): PitchItem => {
    const pendingPlayer = pendingAssignments.get(slot.id);
    if (pendingPlayer) {
      return { id: slot.id, position: slot.position, x: slot.x, y: slot.y, player: pendingPlayer, locked: false };
    }
    const real = occupancy.get(slot.id);
    if (real) {
      return { id: slot.id, position: slot.position, x: slot.x, y: slot.y, player: real.player, locked: real.locked };
    }
    return { id: slot.id, position: slot.position, x: slot.x, y: slot.y } satisfies EmptyPitchSlot;
  });
}

type Selection =
  | { kind: "starter"; slotId: string; player: Player }
  | { kind: "emptySlot"; slotId: string; position: PlayerPosition }
  | { kind: "bench"; player: Player }
  | null;

/**
 * Real lineup editing (Pass 10.5C.2 — see the pass's own report for the
 * full design rationale):
 *
 * - Every rendered pitch slot has a STABLE id ("DEF-0".."DEF-3", etc. —
 *   `formationSlots()`), not a generically-recomputed left-to-right
 *   position. A player assigned to a specific slot stays there for the
 *   rest of the editing session regardless of what's assigned elsewhere
 *   afterward.
 * - Clicking an EMPTY, editable slot automatically enters edit mode and
 *   selects that exact slot — no separate "Edit lineup" click required
 *   first. Locked slots are never affected (they're never empty; the
 *   explicit "Edit lineup" button remains for the swap flow on occupied
 *   slots).
 * - Once an empty slot is selected, the bench is filtered to that slot's
 *   position — everyone else stays visible but is genuinely disabled
 *   (`BenchRow`'s own `disabled` prop), never merely dimmed by color.
 * - Manually-built fills are purely local (`pendingAssignments`) until
 *   Done: there is exactly one authoritative persistence point
 *   (`handleDoneOrEdit`), never an automatic save mid-build (Pass
 *   10.5C.1's fix, preserved here) — see that function's own comment.
 * - Starter↔bench swaps: select an occupied slot, then a compatible
 *   bench player (or vice versa), persisted immediately via
 *   `swapLineupAction`, re-validated server-side. Genuinely persists as
 *   of Pass 10.5C.5 -- the authenticated client had the RLS UPDATE policy
 *   from 10.5C.2A but was missing the underlying `GRANT UPDATE` every
 *   other writable table already had, so every swap/fill write was
 *   silently failing with "permission denied" while `updateLineup()`
 *   still reported success (see
 *   supabase/migrations/20260930060000_grant_lineup_slots_update.sql and
 *   that function's own comment).
 *
 * Eleven V1 is 4-4-2 only (Pass 10.5C.5) -- there is no formation
 * selection; `formationSlots()` always returns the same fixed 11 slots.
 *
 * Read-only (no edit affordance at all) when there's no team, matching
 * "Interaction truthfulness" — see docs/product-state.md. Lineup writes go
 * through the ordinary authenticated request-scoped client now (Pass
 * 10.5C.2A — see `team/actions.ts`), not a service-role admin client, so
 * there's no separate "is the server configured for this" gate anymore.
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
  const [selected, setSelected] = useState<Selection>(null);
  const [pendingAssignments, setPendingAssignments] = useState<Map<string, Player>>(new Map());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Pass 10.5C.5A: which pitch slot's authenticated write is in flight, if
  // any -- NEVER reset back to null (trySwap only ever overwrites it at
  // the start of its next call), so wherever this is rendered it must be
  // gated by `substitutionBusy` below, not read raw (see the <Pitch>
  // usage's own comment -- Pass 10.5C.5B fixed a bug where it wasn't).
  // `isRefreshing` tracks the router.refresh() that follows a successful
  // write via useTransition. `substitutionBusy` stays true across BOTH
  // the action call (`pending`) and that follow-up refresh, so the
  // processing state -- and the guard against a second, conflicting
  // lineup mutation -- lasts until the NEW server-confirmed squad has
  // actually landed, never just the instant the action call itself
  // returns.
  const [substitutingSlotId, setSubstitutingSlotId] = useState<string | null>(null);
  const [isRefreshing, startRefreshTransition] = useTransition();
  const substitutionBusy = pending || isRefreshing;

  // Pass 11.5: drop-from-Team, reusing the exact same `drop_player` RPC
  // (via `dropPlayerAction`) and confirmation-dialog pattern the Players
  // market page already uses — never a second drop implementation, and
  // never a locally-optimistic removal: the squad only ever changes once
  // `router.refresh()` lands the server's authoritative result.
  const [dropTarget, setDropTarget] = useState<Player | null>(null);
  const [dropPending, setDropPending] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);

  const canEdit = Boolean(fantasyTeamId);

  function openPlayer(player: Player) {
    setDetail(player);
    setDetailOpen(true);
  }

  const allPlayers = [...squad.starters.map((s) => s.player), ...squad.bench];

  // Eleven V1 is 4-4-2 only (Pass 10.5C.5) -- one fixed set of 11 slots,
  // no formation selection.
  const slots = formationSlots();
  const occupancy = assignToSlots(squad.starters, slots);
  const pendingPlayerIds = new Set(Array.from(pendingAssignments.values()).map((p) => p.id));
  const visibleBench = squad.bench.filter((p) => !pendingPlayerIds.has(p.id));
  const pitchItems = buildPitchItems(slots, occupancy, pendingAssignments);
  const totalAssigned = occupancy.size + pendingAssignments.size;
  const benchFilterPosition = selected?.kind === "emptySlot" ? selected.position : null;

  const availabilityCounts = allPlayers.reduce(
    (acc, player) => {
      const status = player.availability ?? "available";
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    },
    Object.fromEntries(availabilityOrder.map((s) => [s, 0])) as Record<PlayerAvailability, number>
  );

  /**
   * Pass 10.5C.5A: immediate processing feedback for the authenticated
   * write's real (roughly 1-2s) latency, without ever showing the
   * replacement before the server confirms it. `outSlotId` is the
   * OUTGOING starter's pitch slot -- the one `PlayerNode` that shows the
   * restrained spinner/pulse treatment while this resolves. The picker
   * (`selected`) closes immediately, before the request even starts.
   * `substitutionBusy` (`pending || isRefreshing`) stays true until the
   * POST-success `router.refresh()` transition itself settles, so the
   * processing state stays visible through the full round-trip, not just
   * the action call -- see this component's own state-declaration comment
   * for why no effect is needed to "clear" it afterward.
   */
  async function trySwap(outSlotId: string, starterOut: string, benchIn: string) {
    if (!fantasyTeamId || substitutionBusy) return;
    setSelected(null);
    setError(null);
    setPending(true);
    setSubstitutingSlotId(outSlotId);
    const result = await swapLineupAction(leagueId, fantasyTeamId, starterOut, benchIn);
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    startRefreshTransition(() => {
      router.refresh();
    });
  }

  /** Queues a bench player against a SPECIFIC slot id, purely client-side — see this component's own doc comment and `handleDoneOrEdit`. */
  function queueFill(slotId: string, player: Player) {
    setPendingAssignments((prev) => {
      const next = new Map(prev);
      next.set(slotId, player);
      return next;
    });
    setSelected(null);
    setError(null);
  }

  function unqueueFill(slotId: string) {
    setPendingAssignments((prev) => {
      const next = new Map(prev);
      next.delete(slotId);
      return next;
    });
  }

  function handleSelectStarterOrPending(item: LineupSlot) {
    if (!editing && !substitutionBusy) {
      openPlayer(item.player);
      return;
    }
    // Pass 10.5C.5A: a substitution write (or its follow-up refresh) is
    // already in flight -- never a conflicting second lineup mutation
    // while it resolves. The pitch itself isn't visually frozen (only the
    // one node mid-substitution shows processing), this just makes every
    // OTHER click a no-op until the authoritative result lands.
    if (substitutionBusy) return;
    if (pendingAssignments.has(item.id)) {
      unqueueFill(item.id);
      return;
    }
    if (item.locked) {
      setError("That player's match has already started — their lineup slot is locked.");
      return;
    }
    if (selected?.kind === "bench") {
      trySwap(item.id, item.player.id, selected.player.id);
      return;
    }
    setSelected(selected?.kind === "starter" && selected.slotId === item.id ? null : { kind: "starter", slotId: item.id, player: item.player });
  }

  function handleSelectEmptySlot(emptySlot: EmptyPitchSlot) {
    if (!canEdit || substitutionBusy) return;
    // An obviously-interactive empty slot doesn't require "Edit lineup"
    // first (Pass 10.5C.2) -- clicking it activates editing directly.
    if (!editing) setEditing(true);
    if (selected?.kind === "bench") {
      if (selected.player.position !== emptySlot.position) {
        setError(`That slot needs a ${emptySlot.position}.`);
        return;
      }
      queueFill(emptySlot.id, selected.player);
      return;
    }
    setSelected(
      selected?.kind === "emptySlot" && selected.slotId === emptySlot.id
        ? null
        : { kind: "emptySlot", slotId: emptySlot.id, position: emptySlot.position }
    );
  }

  function handleSelectBench(player: Player) {
    if (!editing && !substitutionBusy) {
      openPlayer(player);
      return;
    }
    if (substitutionBusy) return;
    if (selected?.kind === "starter") {
      trySwap(selected.slotId, selected.player.id, player.id);
      return;
    }
    if (selected?.kind === "emptySlot") {
      if (player.position !== selected.position) {
        setError(`That slot needs a ${selected.position}.`);
        return;
      }
      queueFill(selected.slotId, player);
      return;
    }
    setSelected(selected?.kind === "bench" && selected.player.id === player.id ? null : { kind: "bench", player });
  }

  /**
   * The ONE authoritative persistence point for manually-built empty-slot
   * fills (Pass 10.5C.1, preserved here — see `queueFill`'s comment).
   * Entering edit mode is unconditional and always starts clean. Exiting
   * it (Done):
   *   - with no pending fills queued, just exits — nothing to save.
   *   - with pending fills queued, attempts to save them FIRST, through
   *     the same `fillEmptySlotsAction` → `updateLineup()` path as
   *     before; that validation ("exactly 11, valid formation, no locked
   *     slot") is untouched and remains fully authoritative. Only on
   *     success does this clear the pending state and exit edit mode. On
   *     failure, edit mode and every queued selection stay exactly as
   *     they were, with the existing error treatment shown — never a
   *     silent discard.
   *
   * Fills are sent in slot-sequence order for readability only — the
   * database has no durable column to persist exactly which slot each
   * starter occupies (see `roster.ts`'s own comment and this pass's
   * report), so a refresh currently re-derives a stable but not
   * necessarily identical layout. This session's own placements (via
   * `pendingAssignments`/`formationSlots()`) stay exact for as long as the
   * editor is open, which is what this comment previously conflated with
   * post-refresh persistence.
   */
  async function handleDoneOrEdit() {
    if (!editing) {
      if (!canEdit) return;
      setEditing(true);
      setSelected(null);
      setPendingAssignments(new Map());
      setError(null);
      return;
    }

    if (pendingAssignments.size === 0) {
      setEditing(false);
      setSelected(null);
      setError(null);
      return;
    }

    if (!fantasyTeamId || substitutionBusy) return;
    setPending(true);
    setError(null);
    const fills = slots
      .filter((slot) => pendingAssignments.has(slot.id))
      .map((slot) => ({ playerId: pendingAssignments.get(slot.id)!.id, position: slot.position }));
    const result = await fillEmptySlotsAction(leagueId, fantasyTeamId, fills);
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setPendingAssignments(new Map());
    setSelected(null);
    setEditing(false);
    router.refresh();
  }

  function requestDrop(player: Player) {
    setDropError(null);
    setDropTarget(player);
  }

  async function confirmDrop() {
    if (!leagueId || !dropTarget) return;
    const player = dropTarget;
    setDropError(null);
    setDropPending(true);
    const result = await dropPlayerAction(leagueId, player.id);
    setDropPending(false);
    if (result?.error) {
      setDropError(result.error);
      return;
    }
    setDropTarget(null);
    setDetailOpen(false);
    router.refresh();
  }

  return (
    <div>
      {fantasyTeamId && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-foreground-tertiary">
            {editing
              ? pendingAssignments.size > 0
                ? `Building lineup — ${totalAssigned} / ${FORMATION_RULES.startersTotal} selected. Click Done to save.`
                : "Select a starter, then a bench player (or vice versa) to swap them — or select an empty slot to fill it from the bench."
              : "Selecting a footballer opens their record. Select an empty pitch slot to start building your XI."}
          </p>
          <Button
            variant={editing ? "outline" : "default"}
            className="rounded-control"
            onClick={handleDoneOrEdit}
            disabled={substitutionBusy || (!editing && !canEdit)}
          >
            {editing ? (
              <>
                <X className="mr-1.5 size-3.5" strokeWidth={2} /> {substitutionBusy ? "Saving…" : "Done"}
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
              slots={pitchItems}
              formation={squad.formation}
              editing={editing}
              selectedSlotId={selected?.kind === "starter" ? selected.slotId : null}
              swapTargetPosition={selected?.kind === "bench" ? selected.player.position : null}
              onSelectSlot={handleSelectStarterOrPending}
              selectedEmptySlotId={selected?.kind === "emptySlot" ? selected.slotId : null}
              fillTargetPosition={selected?.kind === "bench" ? selected.player.position : null}
              onSelectEmptySlot={handleSelectEmptySlot}
              // Gated by substitutionBusy, not the raw state: `substitutingSlotId`
              // itself is never reset to null anywhere (see its own
              // declaration comment -- trySwap overwrites it the next
              // time it runs, nothing clears it after success). Passing
              // it unconditionally to Pitch left the just-substituted
              // slot showing the processing animation forever once
              // substitutionBusy went false. This is the actual
              // authoritative-success boundary: the moment pending AND
              // isRefreshing are both false, the refreshed squad prop has
              // already landed (startRefreshTransition keeps isRefreshing
              // true until that commit), so clearing the DISPLAYED value
              // here is correct without any extra effect/cleanup.
              substitutingSlotId={substitutionBusy ? substitutingSlotId : null}
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
                    selected={selected?.kind === "bench" && selected.player.id === player.id}
                    swapTarget={selected?.kind === "starter" || selected?.kind === "emptySlot"}
                    disabled={benchFilterPosition !== null && player.position !== benchFilterPosition}
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

      <PlayerInspector
        player={detail}
        variant="overlay"
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onRequestDrop={canEdit && detail ? () => requestDrop(detail) : undefined}
      />

      <Dialog
        open={dropTarget !== null}
        onOpenChange={(open) => {
          if (!open && !dropPending) setDropTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>DROP {dropTarget?.name.toUpperCase()}</DialogTitle>
            <DialogDescription>
              This removes {dropTarget?.name} from your roster immediately and returns them to the free
              market. Any current-round lineup points already locked in are unaffected, but you will lose
              the player&apos;s remaining-round points if they haven&apos;t kicked off yet.
            </DialogDescription>
          </DialogHeader>
          {dropError && <p className="text-xs text-destructive">{dropError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDropTarget(null)} disabled={dropPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDrop} disabled={dropPending}>
              {dropPending ? "Dropping…" : "Drop Player"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
