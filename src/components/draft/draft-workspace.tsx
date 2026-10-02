"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { PlayerInspector } from "@/components/players/player-inspector";
import { TransitionLink } from "@/components/shell/transition-link";
import { ModuleHeader } from "@/components/ui/module-header";
import { RailModule } from "@/components/ui/rail-module";
import { submitDraftPickAction, resolveExpiredPickAction } from "@/app/(app)/draft/actions";
import type { DraftPickRecord, DraftState } from "@/data-access/drafts";
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
function useCountdown(deadline: string | null) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    if (!deadline) return;
    const target = new Date(deadline).getTime();
    const id = setInterval(() => setRemainingMs(Math.max(0, target - Date.now())), 1000);
    return () => clearInterval(id);
  }, [deadline]);

  return remainingMs;
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
}: {
  draft: DraftState;
  availablePlayers: PlayerDatabasePage;
  onSearch: (query: string) => void;
  positionFilter: PlayerPosition | null;
  onPositionFilterChange: (position: PlayerPosition | null) => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Player | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [submittedPlayerId, setSubmittedPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const remainingMs = useCountdown(draft.status === "in_progress" ? draft.pickDeadline : null);
  const expiredCalledRef = useRef(false);

  useEffect(() => {
    if (remainingMs === 0 && !expiredCalledRef.current) {
      expiredCalledRef.current = true;
      resolveExpiredPickAction(draft.draftId).then(() => {
        router.refresh();
      });
    }
    if (remainingMs !== null && remainingMs > 0) expiredCalledRef.current = false;
  }, [remainingMs, draft.draftId, router]);

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
   * yet. The moment `router.refresh()`'s new props land and this player
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
    if (!draft.isMyTurn || pending) return;
    setSubmittedPlayerId(playerId);
    setError(null);
    const result = await submitDraftPickAction(draft.draftId, playerId);
    if (result?.error) {
      setSubmittedPlayerId(null);
      setError(result.error);
      return;
    }
    router.refresh();
    clearReconciliationTimeout();
    reconciliationTimeoutRef.current = setTimeout(() => {
      setSubmittedPlayerId((current) => (current === playerId ? null : current));
    }, 10000);
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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_0.9fr]">
      <section>
        {/* Pass 11.5: compact mobile-only decision strip -- on mobile the
            full DRAFT_STATUS/SQUAD rail below sits AFTER the entire
            player pool, which forced managers to scroll past every
            available player just to see whose turn it is or what their
            roster needs. This renders the same real draft/`draft`+
            `myCounts` state ABOVE the pool instead, restrained to a few
            lines (never a half-screen sticky header) -- the two
            RailModules it replaces are hidden below `lg:` (see below) so
            nothing is shown twice. */}
        <div className="mb-3 border border-border px-3 py-2.5 lg:hidden">
          {draft.status === "completed" ? (
            <p className="text-xs text-foreground-secondary">Draft complete — {draft.picks.length} picks made.</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="label-system text-[10px] text-foreground-tertiary">ON THE CLOCK</span>
                <span className="truncate text-xs font-semibold text-foreground">{draft.currentTeamName ?? "—"}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="label-system text-[10px] text-foreground-tertiary">PICK</span>
                <span className="label-system text-xs font-semibold tabular-nums text-foreground">
                  {pad2(draft.currentRound)}.{pad2(draft.currentPick)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="label-system text-[10px] text-foreground-tertiary">TIME</span>
                <span
                  className={`label-system text-xs font-semibold tabular-nums ${remainingMs !== null && remainingMs < 10000 ? "text-destructive" : "text-foreground"}`}
                >
                  {remainingMs !== null ? formatCountdown(remainingMs) : "—"}
                </span>
              </div>
              {draft.isMyTurn && (
                <p className="label-system mt-1 text-[10px] font-semibold text-accent">YOUR PICK</p>
              )}
            </>
          )}
          <div className="mt-2 flex items-center justify-between border-t border-border pt-1.5">
            <span className="label-system text-[10px] text-foreground-tertiary">SQUAD</span>
            <span className="label-system text-xs font-semibold tabular-nums text-foreground">
              {myPickCount} / {ROSTER_RULES.squadSize}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-1">
            {(["GK", "DEF", "MID", "FWD"] as const).map((position) => {
              const { min, max } = ROSTER_RULES.positionRange[position];
              const count = myCounts[position] ?? 0;
              const belowMin = count < min;
              const atMax = count >= max;
              return (
                <span
                  key={position}
                  className={`label-system text-[10px] tabular-nums ${
                    belowMin ? "font-semibold text-accent" : atMax ? "text-foreground-tertiary" : "text-foreground-secondary"
                  }`}
                >
                  {position} {count}/{min === max ? min : `${min}+`}
                </span>
              );
            })}
          </div>
        </div>

        {draft.status === "completed" ? (
          <DraftCompleteRecap draft={draft} myPicks={myPicks} myCounts={myCounts} />
        ) : (
          <>
            <ModuleHeader
              title="AVAILABLE_PLAYERS"
              meta={`${availablePlayers.total} PLAYERS`}
            />
            <div className="mt-2 flex items-center gap-2 border border-border px-2.5 py-1.5">
              <input
                ref={searchRef}
                type="text"
                placeholder="Search player… ( / )"
                onChange={(e) => onSearch(e.target.value)}
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-tertiary"
              />
            </div>

            <div className="mt-2 flex items-center gap-1.5">
              {POSITION_FILTER_OPTIONS.map((option) => {
                const value = option === "ALL" ? null : option;
                const isActive = positionFilter === value;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onPositionFilterChange(value)}
                    className={`label-system rounded-control border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
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

            <div className="mt-2 divide-y divide-border border border-border">
              {availablePlayers.players.length === 0 ? (
                <p className="p-4 text-center text-sm text-foreground-tertiary">NO AVAILABLE PLAYERS MATCH</p>
              ) : (
                availablePlayers.players.map((player) => {
                  // Pass 10.5C: a drafted player stays on the board (context/
                  // history), never disappears -- dimmed + struck-through +
                  // an explicit textual DRAFTED/YOUR PICK state, never
                  // interactive as a pick, and never relying on color alone
                  // (the strike-through + Ban icon + text all carry the same
                  // meaning independently). `ownership` reflects the real,
                  // authoritative `league_player_ownership` state (Pass
                  // 10.5B's getPlayerDatabase), so this updates correctly the
                  // moment polling refreshes it -- for a pick made by this
                  // manager (isMyTurn's own team) or by any other manager.
                  const isDrafted = player.ownership != null && player.ownership !== "free";
                  return (
                    <div
                      key={player.id}
                      className={`flex items-center gap-3 px-3 py-2 ${isDrafted ? "opacity-50" : ""}`}
                    >
                      <span className="label-system w-9 shrink-0 rounded-md bg-muted py-1 text-center text-[11px] font-semibold text-foreground-secondary">
                        {player.position}
                      </span>
                      <PlayerAvatar name={player.name} nationality={player.nationality} size="sm" />
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(player);
                          setInspectorOpen(true);
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p
                          className={`truncate text-sm font-medium text-foreground ${isDrafted ? "line-through decoration-2 decoration-foreground-tertiary" : ""}`}
                        >
                          {player.name}
                        </p>
                        <p className="label-system truncate text-[11px] text-foreground-tertiary">
                          {player.club.shortName}
                          {player.totalPoints !== undefined && ` · ${player.totalPoints} PTS`}
                        </p>
                      </button>
                      {isDrafted ? (
                        <span
                          className="label-system flex shrink-0 cursor-not-allowed items-center gap-1.5 rounded-control border border-border px-2.5 py-1 text-[11px] font-semibold text-foreground-tertiary"
                          aria-label={player.ownership === "mine" ? "Already on your roster" : "Already drafted by another team"}
                        >
                          <Ban className="size-3" strokeWidth={2} aria-hidden="true" />
                          {player.ownership === "mine" ? "YOUR PICK" : "DRAFTED"}
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={!draft.isMyTurn || pending !== null || !legalPositions.has(player.position)}
                          onClick={() => handleDraft(player.id)}
                          className="label-system flex shrink-0 items-center gap-1.5 rounded-control border border-border px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors enabled:hover:bg-accent enabled:hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {pending === player.id && (
                            <span
                              aria-hidden="true"
                              className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                            />
                          )}
                          {pending === player.id ? "PROCESSING PICK" : "DRAFT"}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
          </>
        )}
      </section>

      <div className="flex flex-col divide-y divide-border border border-border">
        {/* Pass 11.5: redundant with the compact mobile strip above the
            player pool now -- desktop-only here, where the rail sits
            beside (not below) the pool and the original scroll problem
            doesn't exist. */}
        <RailModule
          className="hidden lg:block"
          header="DRAFT_STATUS"
          meta={draft.status === "completed" ? "COMPLETE" : `RD ${pad2(draft.currentRound)}`}
        >
          {draft.status === "completed" ? (
            <p className="text-sm text-foreground-secondary">Draft complete — {draft.picks.length} picks made.</p>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <span className="label-system text-[11px] text-foreground-tertiary">ON THE CLOCK</span>
                <span className="text-sm font-semibold text-foreground">{draft.currentTeamName ?? "—"}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="label-system text-[11px] text-foreground-tertiary">PICK</span>
                <span className="label-system text-sm font-semibold tabular-nums text-foreground">
                  {pad2(draft.currentRound)}.{pad2(draft.currentPick)}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="label-system text-[11px] text-foreground-tertiary">TIMER</span>
                <span className={`label-system text-sm font-semibold tabular-nums ${remainingMs !== null && remainingMs < 10000 ? "text-destructive" : "text-foreground"}`}>
                  {remainingMs !== null ? formatCountdown(remainingMs) : "—"}
                </span>
              </div>
              {draft.isMyTurn && (
                <p className="label-system pt-1 text-[11px] font-semibold text-accent">YOUR PICK</p>
              )}
            </div>
          )}
        </RailModule>

        <RailModule className="hidden lg:block" header="SQUAD" meta={`${myPickCount} / ${ROSTER_RULES.squadSize}`}>
          <div className="space-y-1">
            {(["GK", "DEF", "MID", "FWD"] as const).map((position) => {
              const { min, max } = ROSTER_RULES.positionRange[position];
              const count = myCounts[position] ?? 0;
              const belowMin = count < min;
              const atMax = count >= max;
              return (
                <div key={position} className="flex items-center justify-between">
                  <span className="label-system text-[11px] text-foreground-tertiary">{position}</span>
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

        <RailModule header={draft.status === "completed" ? "DRAFT_ORDER" : "RECENT_PICKS"}>
          {draft.picks.length === 0 ? (
            <p className="text-xs text-foreground-tertiary">NO PICKS YET</p>
          ) : (
            <div className="max-h-128 divide-y divide-border overflow-y-auto">
              {[...draft.picks].reverse().slice(0, draft.status === "completed" ? undefined : 12).map((pick) => (
                <div key={pick.pickNumber} className="flex items-center justify-between py-1.5">
                  <div className="min-w-0">
                    <p className="truncate text-xs text-foreground">{pick.playerName}</p>
                    <p className="label-system truncate text-[10px] text-foreground-tertiary">
                      {pick.teamName} · {pick.clubShortName} · {pick.position}
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
      </div>

      <PlayerInspector player={selected} variant="overlay" open={inspectorOpen} onOpenChange={setInspectorOpen} />
    </div>
  );
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
      <div className="border border-border bg-surface-elevated px-5 py-6 text-center">
        <p className="label-system text-[11px] text-foreground-tertiary">DRAFT COMPLETE</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {draft.picks.length} picks · {draft.teamCount} managers
        </p>
      </div>

      <div className="border border-border">
        <div className="border-b border-border px-4 py-2.5">
          <span className="label-system text-[11px] text-foreground-secondary">YOUR_FINAL_SQUAD</span>
        </div>
        {sortedMyPicks.length === 0 ? (
          <p className="p-4 text-center text-sm text-foreground-tertiary">NO PICKS MADE</p>
        ) : (
          <div className="divide-y divide-border">
            {sortedMyPicks.map((pick) => (
              <div key={pick.pickNumber} className="flex items-center gap-3 px-4 py-2">
                <span className="label-system w-9 shrink-0 rounded-md bg-muted py-1 text-center text-[11px] font-semibold text-foreground-secondary">
                  {pick.position}
                </span>
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
                {position} {count}/{min === max ? min : `${min}–${max}`}
              </span>
            );
          })}
        </div>
      </div>

      <div className="border border-border">
        <div className="border-b border-border px-4 py-2.5">
          <span className="label-system text-[11px] text-foreground-secondary">LEAGUE_DRAFT_RESULTS</span>
        </div>
        <div className="divide-y divide-border">
          {picksByTeam.map((team) => (
            <div key={team.teamName} className="px-4 py-3">
              <p className="text-sm font-semibold text-foreground">{team.teamName}</p>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                {team.picks.map((pick) => (
                  <span key={pick.pickNumber} className="label-system text-[11px] text-foreground-tertiary">
                    {pick.position} <span className="text-foreground-secondary">{pick.playerName}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border border-border p-4">
        <p className="label-system text-[11px] text-foreground-tertiary">FREE_AGENTS</p>
        <p className="mt-1 text-sm text-foreground-secondary">
          Undrafted players are still available on the open market.
        </p>
        <TransitionLink
          href="/players"
          label="Players"
          className="label-system mt-1.5 inline-block text-[11px] text-accent hover:underline"
        >
          BROWSE PLAYERS ↗
        </TransitionLink>
      </div>
    </div>
  );
}
