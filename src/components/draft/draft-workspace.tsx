"use client";

import { TeamName } from "@/components/ui/team-name";
import { PositionBadge, PositionLabel } from "@/components/players/position-badge";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { PlayerInspector } from "@/components/players/player-inspector";
import { TransitionLink } from "@/components/shell/transition-link";
import { ActionFeedback, type ActionFeedbackKind } from "@/components/ui/action-feedback";
import { CoreHeading, CoreSurface } from "@/components/ui/core-v2";
import { PlayerIdentity } from "@/components/players/player-identity";
import { RailModule } from "@/components/ui/rail-module";
import { submitDraftPickAction, resolveExpiredPickAction } from "@/app/(app)/draft/actions";
import type { DraftPickRecord, DraftState } from "@/data-access/drafts";
import { draftTimeRemaining, type DraftClock } from "@/lib/draft-sync";
import { pad2 } from "@/lib/team-fixture";
import type { PlayerDatabasePage } from "@/data-access/players";
import type { Player, PlayerPosition } from "@/lib/types/fantasy";
import { ROSTER_RULES } from "@/domain/fantasy/constants";
import { draftablePositions, type RosterCounts } from "@/domain/fantasy/roster-rules";

const POSITION_FILTER_OPTIONS = ["ALL", "GK", "DEF", "MID", "FWD"] as const;

/**
 * Ticking countdown to `deadline`, or `null` while not-yet-mounted/no
 * deadline — same pattern as the existing `Countdown` component
 * (src/components/football/countdown.tsx): state only ever changes from
 * inside the interval callback, never synchronously in the effect body,
 * so the first render (server + initial client) stays "—" until the
 * first real tick.
 */
function useCountdown(deadline: string | null, clock: DraftClock | null) {
  const [tick, setTick] = useState<{ deadline: string; remainingMs: number | null } | null>(null);

  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setTick({ deadline, remainingMs: clock ? draftTimeRemaining(deadline, clock, performance.now()) : null }), 250);
    return () => clearInterval(id);
  }, [deadline, clock]);

  return tick?.deadline === deadline ? tick.remainingMs : null;
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function DraftWorkspace({
  draft,
  availablePlayers,
  onSearch,
  positionFilter,
  onPositionFilterChange,
  clock = null,
  onReconcile,
}: {
  draft: DraftState;
  clock?: DraftClock | null;
  onReconcile?: () => Promise<void>;
  availablePlayers: PlayerDatabasePage;
  onSearch: (query: string) => void;
  positionFilter: PlayerPosition | null;
  onPositionFilterChange: (position: PlayerPosition | null) => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Player | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [submittedPlayerId, setSubmittedPlayerId] = useState<string | null>(null);
  const [expiryRetry, setExpiryRetry] = useState(0);
  const [error, setError] = useState<{ message: string; kind: ActionFeedbackKind } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const remainingMs = useCountdown(draft.status === "in_progress" ? draft.pickDeadline : null, clock);
  const expectedPick = (draft.currentRound - 1) * draft.teamCount + draft.currentPick;
  const turnKey = `${draft.draftId}:${expectedPick}:${draft.pickDeadline}`;
  const expiredCalledRef = useRef<string | null>(null);
  const pickInFlightRef = useRef(false);
  const latestTurnRef = useRef(turnKey);
  useEffect(() => { latestTurnRef.current = turnKey; }, [turnKey]);

  const hasClock = Boolean(clock);
  useEffect(() => {
    if (remainingMs !== null && remainingMs > 0) expiredCalledRef.current = null;
    if (remainingMs !== 0 || !hasClock || draft.status !== "in_progress" || expiredCalledRef.current === turnKey) return;
    expiredCalledRef.current = turnKey;
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    void resolveExpiredPickAction(draft.draftId, expectedPick).then(async result => {
      if (cancelled) return;
      if (result?.error && !["STALE_DRAFT_TURN", "DRAFT_NOT_ACTIVE"].includes(result.code ?? "")) setError({ message: result.error, kind: result.kind });
      await (onReconcile ? onReconcile() : Promise.resolve(router.refresh()));
      // Clock/RTT uncertainty or a transient failure can leave this SAME turn
      // alive. Retry only its expected counter, never the next turn.
      if (!cancelled) retry = setTimeout(() => { if (latestTurnRef.current === turnKey) { expiredCalledRef.current = null; setExpiryRetry(value => value + 1); } }, 2000);
    }).catch(() => {
      if (!cancelled) {
        setError({ message: "Could not confirm the expired turn. Reconnecting to the draft.", kind: "error" });
        retry = setTimeout(() => { expiredCalledRef.current = null; setExpiryRetry(value => value + 1); }, 2000);
      }
    });
    return () => { cancelled = true; clearTimeout(retry); };
  }, [remainingMs, expiryRetry, hasClock, draft.status, draft.draftId, expectedPick, turnKey, onReconcile, router]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isEditable = target instanceof HTMLElement && (target.tagName === "INPUT" || target.isContentEditable);
      if (e.key === "/" && !isEditable) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape" && isEditable) {
        (document.activeElement as HTMLElement | null)?.blur();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const reconciliationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearReconciliationTimeout() {
    if (reconciliationTimeoutRef.current) {
      clearTimeout(reconciliationTimeoutRef.current);
      reconciliationTimeoutRef.current = null;
    }
  }

  /**
   * `pending` is DERIVED, not synced via an effect: `submittedPlayerId` is
   * "the player we most recently tried to draft," and it counts as still
   * pending only while the authoritative `draft.picks` doesn't contain it
   * yet. The moment an authoritative synchronization lands and this player
   * appears in `draft.picks`, this recomputes to `null` on that same
   * render — no separate effect watching for the transition, and no
   * moment where "PROCESSING PICK" clears before the pick is genuinely
   * confirmed (Pass 10.5B fix for the reverse bug: it used to clear the
   * instant the mutation returned, well before confirmation).
   */
  const pending = submittedPlayerId !== null && !draft.picks.some((p) => p.playerId === submittedPlayerId) ? submittedPlayerId : null;

  /**
   * The 10s fallback timeout exists solely so a genuinely failed
   * refresh/reconciliation never leaves the button stuck forever -- it
   * does not fabricate success or failure, it just stops blocking further
   * interaction by resetting `submittedPlayerId` (which, if reconciliation
   * truly never arrives, is otherwise never cleared any other way).
   */
  async function handleDraft(playerId: string) {
    if (!draft.isMyTurn || pending || pickInFlightRef.current) return;
    pickInFlightRef.current = true;
    setSubmittedPlayerId(playerId); setError(null);
    clearReconciliationTimeout();
    try {
      const result = await submitDraftPickAction(draft.draftId, playerId, expectedPick);
      if (result?.error) {
        setSubmittedPlayerId(null);
        setError({ message: result.error, kind: result.kind });
      }
      await (onReconcile ? onReconcile() : Promise.resolve(router.refresh()));
      // No automatic manual-pick retry, even if this manager has the next turn.
      if (!result?.error) reconciliationTimeoutRef.current = setTimeout(() => {
        setSubmittedPlayerId(current => current === playerId ? null : current);
      }, 10000);
    } catch {
      setSubmittedPlayerId(null);
      setError({ message: "Pick confirmation was interrupted. Check the updated draft before selecting again.", kind: "error" });
      if (onReconcile) await onReconcile();
    } finally { pickInFlightRef.current = false; }
  }

  useEffect(() => clearReconciliationTimeout, []);

  const myPicks = useMemo(
    () => draft.picks.filter((p) => p.fantasyTeamId === draft.myFantasyTeamId),
    [draft.picks, draft.myFantasyTeamId]
  );
  const myPickCount = myPicks.length;

  /**
   * Live per-position counts for the caller's own squad, and which
   * positions remain legal to draft right now under the canonical
   * ROSTER_RULES (Pass 10.5) — the same `draftablePositions` the draft
   * engine's own SQL enforces authoritatively (this is a UI courtesy for
   * disabling controls, never the guarantee itself; see
   * src/domain/fantasy/roster-rules.ts). `picksRemainingIncludingNext` is
   * this team's total picks minus what it's already made — the draft's
   * own snake-order gating (`isMyTurn`) is what actually decides whether a
   * button is clickable at all right now, this only decides WHICH
   * position, once it is this team's turn.
   */
  const myCounts: RosterCounts = useMemo(() => {
    const counts: RosterCounts = {};
    for (const pick of myPicks) counts[pick.position] = (counts[pick.position] ?? 0) + 1;
    return counts;
  }, [myPicks]);
  const picksRemainingIncludingNext = draft.totalRounds - myPickCount;
  const legalPositions = useMemo(
    () => new Set(draftablePositions(myCounts, picksRemainingIncludingNext)),
    [myCounts, picksRemainingIncludingNext]
  );

  return (
    <div className="core-v2">
      {draft.status === "in_progress" && <DraftTurn draft={draft} remainingMs={remainingMs} myPickCount={myPickCount} />}
    <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)]">
      <section className="min-w-0">
        {draft.status === "completed" ? (
          <DraftCompleteRecap draft={draft} myPicks={myPicks} myCounts={myCounts} />
        ) : (
          <CoreSurface className="core-draft-board" label="Draft player board">
            <CoreHeading title="Player board" meta={`${availablePlayers.total} players`} />
            <div className="core-search mx-4 flex min-h-11 items-center gap-2 px-3 focus-within:ring-2 focus-within:ring-accent/60">
              <input
                ref={searchRef}
                type="text"
                aria-label="Search available players"
                placeholder="Search player… ( / )"
                onChange={(e) => onSearch(e.target.value)}
                className="w-full bg-transparent text-base text-foreground outline-none placeholder:text-foreground-tertiary sm:text-sm"
              />
            </div>

            <div className="mx-4 my-3 flex flex-wrap items-center gap-2">
              {POSITION_FILTER_OPTIONS.map((option) => {
                const value = option === "ALL" ? null : option;
                const isActive = positionFilter === value;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onPositionFilterChange(value)}
                    aria-pressed={isActive}
                    className={`label-system min-h-11 rounded-control border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      isActive
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border text-foreground-secondary hover:bg-muted"
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>

            <div className="divide-y divide-border">
              {availablePlayers.players.length === 0 ? (
                <p className="p-4 text-center text-sm text-foreground-tertiary">No players match these filters</p>
              ) : (
                availablePlayers.players.map((player) => {
                  // Drafted players stay visible for inspection, with an explicit
                  // ownership label and no pick control. Ownership remains authoritative.
                  const isDrafted = player.ownership != null && player.ownership !== "free";
                  return (
                    <div
                      key={player.id}
                      className={`core-draft-player ${selected?.id === player.id ? "core-row-selected" : ""}`}
                    >

                      <button
                        type="button"
                        onClick={() => {
                          setSelected(player);
                          setInspectorOpen(true);
                        }}
                        className="core-inspect-player min-w-0 flex-1 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
                        aria-label={`Inspect ${player.name}`}
                      >
                        <PlayerIdentity player={player} />
                      </button>
                      <span className="core-draft-points">{player.totalPoints ?? "—"}<span className="core-player-club">points</span></span>
                      {isDrafted ? (
                        <span
                          className="label-system flex shrink-0 cursor-not-allowed items-center gap-1.5 rounded-control border border-border px-2.5 py-1 text-[11px] font-semibold text-foreground-tertiary"
                          aria-label={player.ownership === "mine" ? "Already on your roster" : "Already drafted by another team"}
                        >
                          <Ban className="size-3" strokeWidth={2} aria-hidden="true" />
                          {player.ownership === "mine" ? "Your pick" : "Drafted"}
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={!draft.isMyTurn || pending !== null || !legalPositions.has(player.position)}
                          onClick={() => handleDraft(player.id)}
                          className="label-system flex min-h-11 shrink-0 items-center gap-1.5 rounded-control border border-border px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors enabled:hover:bg-accent enabled:hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {pending === player.id && (
                            <span
                              aria-hidden="true"
                              className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                            />
                          )}
                          {pending === player.id ? "Picking…" : "Draft"}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            {error && <ActionFeedback kind={error.kind} message={error.message} />}
          </CoreSurface>
        )}
      </section>

      <div className="min-w-0 flex flex-col self-start gap-5">
        <RailModule className="core-surface" header="Your squad" meta={`${myPickCount} / ${ROSTER_RULES.squadSize}`}>
          <div className="space-y-1">
            {(["GK", "DEF", "MID", "FWD"] as const).map((position) => {
              const { min, max } = ROSTER_RULES.positionRange[position];
              const count = myCounts[position] ?? 0;
              const belowMin = count < min;
              const atMax = count >= max;
              return (
                <div key={position} className="flex items-center justify-between">
                  <PositionBadge position={position} />
                  <span
                    className={`label-system text-[11px] tabular-nums ${
                      belowMin
                        ? "font-semibold text-accent"
                        : atMax
                          ? "text-foreground-tertiary"
                          : "text-foreground-secondary"
                    }`}
                  >
                    {count} / {min === max ? min : `${min}–${max}`}
                  </span>
                </div>
              );
            })}
          </div>
        </RailModule>

        <RailModule className="core-surface" header={draft.status === "completed" ? "Pick history" : "Recent picks"}>
          {draft.picks.length === 0 ? (
            <p className="text-xs text-foreground-tertiary">No picks yet</p>
          ) : (
            <div className="max-h-128 divide-y divide-border overflow-y-auto">
              {[...draft.picks].reverse().slice(0, draft.status === "completed" ? undefined : 12).map((pick) => (
                <div key={pick.pickNumber} className="flex items-center justify-between py-1.5">
                  <div className="min-w-0">
                    <p className="truncate text-xs text-foreground">{pick.playerName}</p>
                    <p className="label-system truncate text-[10px] text-foreground-tertiary">
                      {pick.teamName} · {pick.clubShortName} · <PositionLabel position={pick.position} />
                    </p>
                  </div>
                  <span className="label-system shrink-0 text-[10px] text-foreground-tertiary">
                    {pad2(pick.round)}.{pad2(pick.pickNumber)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </RailModule>
        <RailModule className="core-surface" header="Manager order" meta="Snake draft">
          <ol className="space-y-3">{draft.order.map(manager => <li key={manager.fantasyTeamId} className="flex min-w-0 items-start gap-3 text-sm"><span className="core-meta shrink-0">{manager.position}</span><TeamName name={manager.teamName} className={manager.fantasyTeamId === draft.currentTeamId ? "text-accent" : "text-foreground-secondary"} /></li>)}</ol>
        </RailModule>
      </div>

      </div>
      <PlayerInspector player={selected} variant="overlay" open={inspectorOpen} onOpenChange={setInspectorOpen} />
    </div>
  );
}

function DraftTurn({ draft, remainingMs, myPickCount }: { draft: DraftState; remainingMs: number | null; myPickCount: number }) {
  return <section aria-label="Active draft turn" className={`core-hero core-draft-turn ${draft.isMyTurn ? "core-draft-own-turn" : ""}`}>
    <div><p className="core-kicker">Round {draft.currentRound} · Pick {draft.currentPick}</p><p className="core-kicker mt-4">On the clock</p><h2><TeamName name={draft.currentTeamName ?? "—"} /></h2><p className="core-draft-turn-note">{draft.isMyTurn ? "Your turn — choose your next player" : "Another manager is picking"}</p></div>
    <div className="core-draft-clock"><p className="core-kicker">Time remaining</p><p className={remainingMs !== null && remainingMs < 10000 ? "text-destructive" : "text-foreground"}>{remainingMs !== null ? formatCountdown(remainingMs) : "—"}</p><span className="core-meta">Your squad · <span className="whitespace-nowrap">{myPickCount} / {ROSTER_RULES.squadSize}</span></span></div>
  </section>;
}

const POSITION_ORDER: Record<PlayerPosition, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

/**
 * Pass 13 (§9): the draft's completed state no longer renders as "an
 * active drafting workspace with the clock stopped" -- the full
 * AVAILABLE_PLAYERS board (search, filters, DRAFT buttons merely
 * disabled) was replacing this `<section>`'s content unconditionally
 * regardless of `draft.status`, so a finished draft looked identical to
 * one in progress. This replaces it with a real recap: the event is over,
 * here's what happened. Free-agent browsing isn't removed, just demoted
 * to a link into `/players` (the real, ongoing free-market surface) —
 * never a dead end.
 */
function DraftCompleteRecap({
  draft,
  myPicks,
  myCounts,
}: {
  draft: DraftState;
  myPicks: DraftPickRecord[];
  myCounts: RosterCounts;
}) {
  const sortedMyPicks = useMemo(
    () => [...myPicks].sort((a, b) => POSITION_ORDER[a.position] - POSITION_ORDER[b.position]),
    [myPicks]
  );

  const picksByTeam = useMemo(() => {
    const order: string[] = [];
    const byTeam = new Map<string, { teamName: string; picks: DraftPickRecord[] }>();
    for (const pick of draft.picks) {
      let entry = byTeam.get(pick.fantasyTeamId);
      if (!entry) {
        entry = { teamName: pick.teamName, picks: [] };
        byTeam.set(pick.fantasyTeamId, entry);
        order.push(pick.fantasyTeamId);
      }
      entry.picks.push(pick);
    }
    return order.map((id) => byTeam.get(id)!);
  }, [draft.picks]);

  return (
    <div className="flex flex-col gap-4">
      <div className="core-hero px-5 py-6">
        <p className="label-system text-[11px] text-foreground-tertiary">Draft complete</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {draft.picks.length} picks · {draft.teamCount} managers
        </p>
      </div>

      <div className="core-surface overflow-hidden">
        <div className="border-b border-border px-4 py-2.5">
          <span className="label-system text-[11px] text-foreground-secondary">Your final squad</span>
        </div>
        {sortedMyPicks.length === 0 ? (
          <p className="p-4 text-center text-sm text-foreground-tertiary">No picks made</p>
        ) : (
          <div className="divide-y divide-border">
            {sortedMyPicks.map((pick) => (
              <div key={pick.pickNumber} className="flex items-center gap-3 px-4 py-2">
                <PositionBadge position={pick.position} />
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{pick.playerName}</p>
                <span className="label-system shrink-0 text-[11px] text-foreground-tertiary">{pick.clubShortName}</span>
                <span className="label-system shrink-0 text-[10px] text-foreground-tertiary">
                  RD {pad2(pick.round)}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-4 py-2.5">
          {(["GK", "DEF", "MID", "FWD"] as const).map((position) => {
            const { min, max } = ROSTER_RULES.positionRange[position];
            const count = myCounts[position] ?? 0;
            return (
              <span key={position} className="label-system text-[10px] text-foreground-secondary">
                <PositionLabel position={position} /> {count}/{min === max ? min : `${min}–${max}`}
              </span>
            );
          })}
        </div>
      </div>

      <div className="core-surface overflow-hidden">
        <div className="border-b border-border px-4 py-2.5">
          <span className="label-system text-[11px] text-foreground-secondary">League draft results</span>
        </div>
        <div className="divide-y divide-border">
          {picksByTeam.map((team) => (
            <div key={team.teamName} className="px-4 py-3">
              <p className="text-sm font-semibold text-foreground"><TeamName name={team.teamName} /></p>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                {team.picks.map((pick) => (
                  <span key={pick.pickNumber} className="label-system text-[11px] text-foreground-tertiary">
                    <PositionLabel position={pick.position} /> <span className="text-foreground-secondary">{pick.playerName}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="core-surface p-5">
        <p className="label-system text-[11px] text-foreground-tertiary">Free agents</p>
        <p className="mt-1 text-sm text-foreground-secondary">
          Undrafted players are still available on the open market.
        </p>
        <TransitionLink
          href="/players"
          label="Players"
          className="label-system mt-1.5 inline-block text-[11px] text-accent hover:underline"
        >
          Browse players →
        </TransitionLink>
      </div>
    </div>
  );
}
