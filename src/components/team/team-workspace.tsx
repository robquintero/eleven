"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";
import { BenchRow, EmptySlotRow } from "@/components/team/bench-row";
import { NextLock } from "@/components/team/next-lock";
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
import { isPlayerLocked, nextLock, pad2, starterBuckets } from "@/lib/team-fixture";
import type { LineupSlot, Player, PlayerAvailability, PlayerPosition, Squad } from "@/lib/types/fantasy";

const availabilityOrder: PlayerAvailability[] = ["available", "doubtful", "injured", "suspended"];

type Selection =
  | { kind: "starter"; slotId: string; player: Player }
  | { kind: "emptySlot"; slotId: string; position: PlayerPosition }
  | { kind: "bench"; player: Player }
  | null;

interface XiRow {
  slotId: string;
  position: PlayerPosition;
  /** Real starter or a locally-queued (unsaved) fill; `null` for a genuinely empty slot. */
  player: Player | null;
  /** Only meaningful for a REAL persisted starter -- a pending fill or empty slot is always movable. */
  locked: boolean;
}

/**
 * Pass 14.6: replaces `buildPitchItems` -- same priority per formation
 * slot (a locally-queued fill first, then the real persisted starter,
 * then empty), now producing plain rows instead of pitch-positioned
 * nodes. `formationSlots()`'s STABLE slot ids ("DEF-0".."DEF-3", etc.) are
 * unchanged and still what keeps a player in the same row for the rest of
 * an editing session regardless of what else gets assigned afterward.
 */
function buildXiRows(slots: FormationSlot[], occupancy: Map<string, LineupSlot>, pendingAssignments: Map<string, Player>): XiRow[] {
  return slots.map((slot): XiRow => {
    const pendingPlayer = pendingAssignments.get(slot.id);
    if (pendingPlayer) return { slotId: slot.id, position: slot.position, player: pendingPlayer, locked: false };
    const real = occupancy.get(slot.id);
    if (real) return { slotId: slot.id, position: slot.position, player: real.player, locked: real.locked ?? false };
    return { slotId: slot.id, position: slot.position, player: null, locked: false };
  });
}

/** Attacking-to-defensive section order, matching the brief's own example structure -- "who occupies each positional slot" should be obvious at a glance. */
const XI_SECTIONS: { label: string; position: PlayerPosition }[] = [
  { label: "FORWARDS", position: "FWD" },
  { label: "MIDFIELD", position: "MID" },
  { label: "DEFENCE", position: "DEF" },
  { label: "GOALKEEPER", position: "GK" },
];

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
  hasActiveRound = false,
  leagueId,
  fantasyTeamId,
}: {
  squad: Squad;
  matchdayNumber: number | null;
  /** Pass 14.5: the round's own authoritative lifecycle state (`fantasy_rounds.status !== "completed"`), never inferred from `squad.formation` (a roster-composition fact, not a round-lifecycle one). */
  hasActiveRound?: boolean;
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
  // `isRefreshing` tracks the router.refresh() that follows a successful
  // write via useTransition. `substitutionBusy` stays true across BOTH the
  // action call (`pending`) and that follow-up refresh, so the processing
  // state -- and the guard against a second, conflicting lineup mutation --
  // lasts until the NEW server-confirmed squad has actually landed, never
  // just the instant the action call itself returns. Every row's handler
  // early-returns on `substitutionBusy`, and the Done/Edit button itself
  // shows "Saving…" for the duration.
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
  const xiRows = buildXiRows(slots, occupancy, pendingAssignments);
  const totalAssigned = occupancy.size + pendingAssignments.size;
  // Pass 14.6: the position a bench row must match to be an ELIGIBLE swap
  // target, whichever kind of thing is currently selected (an empty slot
  // to fill, or an occupied starter to swap out) -- used to give bench AND
  // starter rows symmetric, position-aware swapTarget/disabled treatment
  // ("clearly indicate eligible swap targets, never make users guess").
  const activeSwapPosition = selected?.kind === "emptySlot" ? selected.position : selected?.kind === "starter" ? selected.player.position : null;

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
   * replacement before the server confirms it -- the picker (`selected`)
   * closes immediately, before the request even starts, and the Done/Edit
   * button shows "Saving…" for the duration. `substitutionBusy` (`pending
   * || isRefreshing`) stays true until the POST-success `router.refresh()`
   * transition itself settles, so every row's handler stays guarded
   * against a second, conflicting lineup mutation through the full
   * round-trip, not just the action call.
   */
  async function trySwap(starterOut: string, benchIn: string) {
    if (!fantasyTeamId || substitutionBusy) return;
    setSelected(null);
    setError(null);
    setPending(true);
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

  function handleSelectStarterOrPending(row: XiRow & { player: Player }) {
    if (!editing && !substitutionBusy) {
      openPlayer(row.player);
      return;
    }
    // Pass 10.5C.5A: a substitution write (or its follow-up refresh) is
    // already in flight -- never a conflicting second lineup mutation
    // while it resolves. Only the one row mid-substitution shows
    // processing, this just makes every OTHER click a no-op until the
    // authoritative result lands.
    if (substitutionBusy) return;
    if (pendingAssignments.has(row.slotId)) {
      unqueueFill(row.slotId);
      return;
    }
    if (row.locked) {
      setError("That player's match has already started — their lineup slot is locked.");
      return;
    }
    if (selected?.kind === "bench") {
      if (selected.player.position !== row.position) {
        setError(`${selected.player.name} is a ${selected.player.position} and can't fill a ${row.position} slot.`);
        return;
      }
      trySwap(row.player.id, selected.player.id);
      return;
    }
    setSelected(selected?.kind === "starter" && selected.slotId === row.slotId ? null : { kind: "starter", slotId: row.slotId, player: row.player });
  }

  function handleSelectEmptySlot(emptySlot: { slotId: string; position: PlayerPosition }) {
    if (!canEdit || substitutionBusy) return;
    // An obviously-interactive empty slot doesn't require "Edit lineup"
    // first (Pass 10.5C.2) -- clicking it activates editing directly.
    if (!editing) setEditing(true);
    if (selected?.kind === "bench") {
      if (selected.player.position !== emptySlot.position) {
        setError(`That slot needs a ${emptySlot.position}.`);
        return;
      }
      queueFill(emptySlot.slotId, selected.player);
      return;
    }
    setSelected(
      selected?.kind === "emptySlot" && selected.slotId === emptySlot.slotId
        ? null
        : { kind: "emptySlot", slotId: emptySlot.slotId, position: emptySlot.position }
    );
  }

  function handleSelectBench(player: Player) {
    if (!editing && !substitutionBusy) {
      openPlayer(player);
      return;
    }
    if (substitutionBusy) return;
    // Pass 14.6: a locked bench player cannot enter the lineup -- same
    // "immovable for the rest of the round" fact as a locked starter, with
    // the same explicit, non-guessable error (`handleSelectStarterOrPending`
    // already does this for starters; `BenchRow` deliberately still lets
    // this click fire for a locked player rather than silently no-op'ing
    // via native `disabled`, specifically so this message can show).
    if (editing && isPlayerLocked(player)) {
      setError("That player's match has already started — they can't enter your lineup until the round ends.");
      return;
    }
    if (selected?.kind === "starter") {
      trySwap(selected.player.id, player.id);
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
              : "Selecting a footballer opens their record. Select an empty slot to start building your XI."}
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
          {/* Pass 14.6: the pitch concept is removed entirely -- a dense,
              row-based squad workspace, consistent with every other list
              in Eleven (BenchRow, PlayerRow), grouped into the 4 formation
              sections so "who occupies each positional slot" is obvious at
              a glance without a spatial field metaphor. */}
          <div className="mt-3 flex flex-col gap-4">
            {XI_SECTIONS.map(({ label, position }) => {
              const rows = xiRows.filter((r) => r.position === position);
              const occupied = rows.filter((r) => r.player !== null).length;
              return (
                <div key={position} className="border border-border">
                  <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
                    <span className="label-system text-[10px] font-semibold text-foreground-secondary">{label}</span>
                    <span className="label-system text-[10px] text-foreground-tertiary">
                      {occupied} / {rows.length}
                    </span>
                  </div>
                  <div className="divide-y divide-border">
                    {rows.map((row, i) =>
                      row.player ? (
                        <BenchRow
                          key={row.slotId}
                          index={i}
                          player={row.player}
                          editing={editing}
                          selected={selected?.kind === "starter" && selected.slotId === row.slotId}
                          swapTarget={selected?.kind === "bench" && selected.player.position === row.position}
                          disabled={selected?.kind === "bench" && selected.player.position !== row.position}
                          onSelect={() => handleSelectStarterOrPending(row as XiRow & { player: Player })}
                        />
                      ) : (
                        <EmptySlotRow
                          key={row.slotId}
                          position={row.position}
                          editing={editing}
                          selected={selected?.kind === "emptySlot" && selected.slotId === row.slotId}
                          fillTarget={selected?.kind === "bench" && selected.player.position === row.position}
                          onSelect={() => handleSelectEmptySlot({ slotId: row.slotId, position: row.position })}
                        />
                      )
                    )}
                  </div>
                </div>
              );
            })}
            {!fantasyTeamId && (
              <p className="text-center text-sm text-foreground-tertiary">
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
                    swapTarget={activeSwapPosition !== null && player.position === activeSwapPosition}
                    disabled={activeSwapPosition !== null && player.position !== activeSwapPosition}
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
            <RoundIntelligence starters={squad.starters} hasActiveRound={hasActiveRound} />
          </RailModule>

          <RailModule header="NEXT_LOCK" className="lg:py-2.5">
            <NextLock
              slot={nextLock(squad.starters)}
              hasStarters={squad.starters.length > 0}
              remainingCount={starterBuckets(squad.starters).upcoming}
            />
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
