"use client";

import { useState } from "react";
import { signPlayerAction } from "@/app/(app)/players/actions";
import { FormSparkline } from "@/components/football/form-sparkline";
import { MarketAction } from "@/components/players/market-action";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { PlayerInspector } from "@/components/players/player-inspector";
import { ActionFeedback, type ActionFeedbackKind } from "@/components/ui/action-feedback";
import type { HotFreeAgent } from "@/data-access/intelligence";
import { formatRoundPoints, POSITION_BADGE_CLASS } from "@/lib/team-fixture";
import type { Player } from "@/lib/types/fantasy";
import { cn, INTERACTIVE_ROW_CLASS } from "@/lib/utils";

/**
 * Pass 14.7 Phase 3: "Who should I be paying attention to right now" --
 * free agents with the best recent real V3 form (see
 * `src/data-access/intelligence.ts`'s own doc comment for exactly how
 * that's computed and when it falls back to season totals). Entirely
 * derived from stored data the engine already computed; this component
 * only renders it and wires the existing free-agent-add action
 * (`signPlayerAction`, the SAME one Players market uses) -- no new
 * transaction logic. Renders nothing at all if there's genuinely no
 * truthful recommendation to show (an empty module is worse than no
 * module), matching "do not add a decorative chart simply to fill space."
 */
export function FormIntelligence({
  agents,
  leagueId,
  canTransact,
}: {
  agents: HotFreeAgent[];
  leagueId: string | null;
  canTransact: boolean;
}) {
  const [selected, setSelected] = useState<Player | null>(null);
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; kind: ActionFeedbackKind } | null>(null);

  async function handleAdd(player: Player) {
    if (!leagueId) return;
    setError(null);
    setPendingId(player.id);
    const result = await signPlayerAction(leagueId, player.id);
    setPendingId(null);
    if (result?.error) {
      setError({ message: result.error, kind: result.kind });
      return;
    }
    // Installed Next returns current-route Flight after this action revalidates.
  }

  if (agents.length === 0) return null;

  return (
    <div className="border border-border p-4">
      <div className="flex items-center justify-between">
        <p className="label-system text-[11px] text-foreground-tertiary">FORM_INTELLIGENCE</p>
        <p className="label-system text-[10px] text-foreground-tertiary">FREE AGENTS</p>
      </div>
      {error && <ActionFeedback kind={error.kind} message={error.message} />}
      <div className="mt-2.5 divide-y divide-border">
        {agents.map((agent) => (
          <div key={agent.player.id} className="flex w-full items-center gap-2.5 py-2">
            <button
              type="button"
              onClick={() => {
                setSelected(agent.player);
                setOpen(true);
              }}
              className={cn("flex min-w-0 flex-1 items-center gap-2.5 rounded-sm px-1 text-left", INTERACTIVE_ROW_CLASS)}
            >
              <PlayerAvatar name={agent.player.name} nationality={agent.player.nationality} size="sm" />

              <span
                className={cn(
                  "label-system flex w-7 shrink-0 items-center justify-center rounded-md py-1 text-[10px] font-semibold",
                  POSITION_BADGE_CLASS[agent.player.position]
                )}
              >
                {agent.player.position}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{agent.player.name}</p>
                <p className="label-system truncate text-[11px] text-foreground-tertiary">
                  {agent.player.club.shortName}
                </p>
              </div>

              {agent.player.recentForm && agent.player.recentForm.length > 0 && (
                <FormSparkline
                  values={agent.player.recentForm}
                  barHeightClass="h-5"
                  barWidthClass="w-1.5"
                  gapClass="gap-1"
                  showLabels={false}
                />
              )}

              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="label-system tabular-nums text-xs font-semibold text-foreground">
                  {formatRoundPoints(agent.recentAveragePoints)}
                </span>
                <span className="label-system text-[9px] text-foreground-tertiary">
                  {agent.basis === "recent-form" ? "L3 AVG" : "SEASON AVG"}
                </span>
              </div>
            </button>

            {canTransact && (
              <MarketAction player={agent.player} onAdd={handleAdd} pending={pendingId === agent.player.id} />
            )}
          </div>
        ))}
      </div>

      <PlayerInspector player={selected} variant="overlay" open={open} onOpenChange={setOpen} />
    </div>
  );
}
