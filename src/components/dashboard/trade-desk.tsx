"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  acceptTradeAction,
  cancelTradeAction,
  rejectTradeAction,
} from "@/app/(app)/league/trade-actions";
import { LazyProposeTradeDialog, TradeList } from "@/components/league/trade-center";
import { Button } from "@/components/ui/button";
import type { Team } from "@/data-access/teams";
import type { TradeView } from "@/data-access/trades";

type TradeResponder = (id: string) => Promise<{ error?: string } | undefined>;

/**
 * Home's trade entry point (Pass 11.5) — "Home should not require the
 * manager to know that trades live under League." Composed entirely from
 * the same pieces `TradeCenter` (src/components/league/trade-center.tsx)
 * uses on /league: `TradeList` for incoming/outgoing cards and
 * `ProposeTradeDialog` for proposing one, both wired to the exact same
 * Pass 11 server actions. No trade business logic is duplicated here —
 * only the layout differs (a single compact rail module instead of a
 * full page section), matching Home's "command hub" restraint.
 */
export function TradeDesk({
  leagueId,
  myTeamId,
  otherTeams,
  incoming,
  outgoing,
}: {
  leagueId: string;
  myTeamId: string;
  otherTeams: Team[];
  incoming: TradeView[];
  outgoing: TradeView[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proposeOpen, setProposeOpen] = useState(false);

  async function respond(action: TradeResponder, tradeId: string) {
    setError(null);
    setPendingId(tradeId);
    const result = await action(tradeId);
    setPendingId(null);
    if (result?.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  const totalPending = incoming.length + outgoing.length;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="label-system text-[11px] text-foreground-tertiary">
          {totalPending > 0 ? `${totalPending} PENDING` : "NO PENDING TRADES"}
        </span>
        <Button size="xs" variant="outline" onClick={() => setProposeOpen(true)} disabled={otherTeams.length === 0}>
          Propose Trade
        </Button>
      </div>

      {error && (
        <p className="label-system mt-2 border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
          {error}
        </p>
      )}

      {totalPending > 0 && (
        <div className="mt-2.5 flex flex-col gap-3">
          <TradeList
            direction="incoming"
            trades={incoming}
            myTeamId={myTeamId}
            pendingId={pendingId}
            renderActions={(trade) => (
              <>
                <Button size="xs" disabled={pendingId === trade.id} onClick={() => respond(acceptTradeAction, trade.id)}>
                  Accept
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={pendingId === trade.id}
                  onClick={() => respond(rejectTradeAction, trade.id)}
                >
                  Reject
                </Button>
              </>
            )}
          />
          <TradeList
            direction="outgoing"
            trades={outgoing}
            myTeamId={myTeamId}
            pendingId={pendingId}
            renderActions={(trade) => (
              <Button
                size="xs"
                variant="ghost"
                disabled={pendingId === trade.id}
                onClick={() => respond(cancelTradeAction, trade.id)}
              >
                Cancel
              </Button>
            )}
          />
        </div>
      )}

      <LazyProposeTradeDialog
        open={proposeOpen}
        onOpenChange={setProposeOpen}
        leagueId={leagueId}
        myTeamId={myTeamId}
        otherTeams={otherTeams}
        onProposed={() => {
          setProposeOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}
