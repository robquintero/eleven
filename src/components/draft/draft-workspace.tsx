"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PlayerInspector } from "@/components/players/player-inspector";
import { ModuleHeader } from "@/components/ui/module-header";
import { RailModule } from "@/components/ui/rail-module";
import { submitDraftPickAction, resolveExpiredPickAction } from "@/app/(app)/draft/actions";
import type { DraftState } from "@/data-access/drafts";
import { pad2 } from "@/lib/team-fixture";
import type { PlayerDatabasePage } from "@/data-access/players";
import type { Player } from "@/lib/types/fantasy";

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
}: {
  draft: DraftState;
  availablePlayers: PlayerDatabasePage;
  onSearch: (query: string) => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Player | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
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

  async function handleDraft(playerId: string, playerName: string) {
    if (!draft.isMyTurn || pending) return;
    setPending(playerId);
    setError(null);
    const result = await submitDraftPickAction(draft.draftId, playerId);
    setPending(null);
    if (result?.error) {
      setError(result.error);
    } else {
      router.refresh();
    }
    void playerName;
  }

  const myPickCount = useMemo(
    () => draft.picks.filter((p) => p.fantasyTeamId === draft.myFantasyTeamId).length,
    [draft.picks, draft.myFantasyTeamId]
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_0.9fr]">
      <section>
        <ModuleHeader
          title="AVAILABLE_PLAYERS"
          meta={`${availablePlayers.total} FREE`}
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

        <div className="mt-2 divide-y divide-border border border-border">
          {availablePlayers.players.length === 0 ? (
            <p className="p-4 text-center text-sm text-foreground-tertiary">NO AVAILABLE PLAYERS MATCH</p>
          ) : (
            availablePlayers.players.map((player) => (
              <div key={player.id} className="flex items-center gap-3 px-3 py-2">
                <span className="label-system w-9 shrink-0 rounded-md bg-muted py-1 text-center text-[11px] font-semibold text-foreground-secondary">
                  {player.position}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(player);
                    setInspectorOpen(true);
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm font-medium text-foreground">{player.name}</p>
                  <p className="label-system truncate text-[11px] text-foreground-tertiary">
                    {player.club.shortName}
                  </p>
                </button>
                <button
                  type="button"
                  disabled={!draft.isMyTurn || pending !== null}
                  onClick={() => handleDraft(player.id, player.name)}
                  className="label-system shrink-0 rounded-control border border-border px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors enabled:hover:bg-accent enabled:hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pending === player.id ? "DRAFTING…" : "DRAFT"}
                </button>
              </div>
            ))
          )}
        </div>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </section>

      <div className="flex flex-col divide-y divide-border border border-border">
        <RailModule header="DRAFT_STATUS" meta={draft.status === "completed" ? "COMPLETE" : `RD ${pad2(draft.currentRound)}`}>
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

        <RailModule header="MY_ROSTER" meta={`${myPickCount} / ${draft.totalRounds}`}>
          <p className="text-xs text-foreground-tertiary">
            {myPickCount} of {draft.totalRounds} picks made.
          </p>
        </RailModule>

        <RailModule header="RECENT_PICKS">
          {draft.picks.length === 0 ? (
            <p className="text-xs text-foreground-tertiary">NO PICKS YET</p>
          ) : (
            <div className="divide-y divide-border">
              {[...draft.picks].reverse().slice(0, 12).map((pick) => (
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
