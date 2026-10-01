"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  acceptTradeAction,
  cancelTradeAction,
  proposeTradeAction,
  rejectTradeAction,
} from "@/app/(app)/league/trade-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { RosterPlayerOption } from "@/data-access/roster";
import type { Team } from "@/data-access/teams";
import type { TradeView } from "@/data-access/trades";

type TradeResponder = (id: string) => Promise<{ error?: string } | undefined>;

/**
 * Pass 11 manager-to-manager trades. No commissioner veto/voting, no
 * money/picks/FAAB — N-for-M real players only, exactly what
 * `propose_trade`/`accept_trade`/`reject_trade`/`cancel_trade`
 * (supabase/migrations/20261001000000_free_market_and_trades.sql) enforce
 * server-side. Everything here is a thin, truthful view over those RPCs —
 * no client-side trade-legality logic, since acceptance re-validates
 * everything from scratch anyway.
 */
export function TradeCenter({
  leagueId,
  myTeamId,
  myRoster,
  otherTeams,
  rostersByTeamId,
  incoming,
  outgoing,
}: {
  leagueId: string;
  myTeamId: string;
  myRoster: RosterPlayerOption[];
  otherTeams: Team[];
  rostersByTeamId: Record<string, RosterPlayerOption[]>;
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

  return (
    <div className="border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="label-system text-[11px] text-foreground-tertiary">TRADES</p>
        <Button
          size="xs"
          variant="outline"
          onClick={() => setProposeOpen(true)}
          disabled={otherTeams.length === 0}
        >
          Propose Trade
        </Button>
      </div>

      {error && (
        <p className="label-system mt-2 border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-col gap-4">
        <TradeList
          direction="incoming"
          trades={incoming}
          myTeamId={myTeamId}
          pendingId={pendingId}
          renderActions={(trade) => (
            <>
              <Button
                size="xs"
                disabled={pendingId === trade.id}
                onClick={() => respond(acceptTradeAction, trade.id)}
              >
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

      <ProposeTradeDialog
        open={proposeOpen}
        onOpenChange={setProposeOpen}
        leagueId={leagueId}
        myRoster={myRoster}
        otherTeams={otherTeams}
        rostersByTeamId={rostersByTeamId}
        onProposed={() => {
          setProposeOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

/** Exported (Pass 11.5) so Home's compact trade widget can render the same incoming/outgoing cards and accept/reject/cancel actions without a second trade UI — see dashboard/trade-desk.tsx. */
export function TradeList({
  direction,
  trades,
  myTeamId,
  pendingId,
  renderActions,
}: {
  direction: "incoming" | "outgoing";
  trades: TradeView[];
  myTeamId: string;
  pendingId: string | null;
  renderActions: (trade: TradeView) => React.ReactNode;
}) {
  return (
    <div>
      <p className="label-system text-[10px] text-foreground-tertiary">
        {direction === "incoming" ? "INCOMING" : "OUTGOING"}
      </p>
      {trades.length === 0 ? (
        <p className="mt-1 text-sm text-foreground-secondary">
          {direction === "incoming" ? "NO INCOMING TRADES" : "NO OUTGOING TRADES"}
        </p>
      ) : (
        <div className="mt-1.5 flex flex-col gap-2">
          {trades.map((trade) => {
            const counterpartyName =
              trade.receivingTeamId === myTeamId ? trade.proposingTeamName : trade.receivingTeamName;
            const youReceive = trade.receivingTeamId === myTeamId ? trade.offeredPlayers : trade.requestedPlayers;
            const youSend = trade.receivingTeamId === myTeamId ? trade.requestedPlayers : trade.offeredPlayers;

            return (
              <div key={trade.id} className="border border-border p-3">
                <p className="label-system text-[11px] text-foreground-tertiary">
                  {direction === "incoming" ? "FROM" : "TO"} {counterpartyName.toUpperCase()}
                </p>
                <div className="mt-1.5 grid grid-cols-2 gap-3">
                  <div>
                    <p className="label-system text-[10px] text-foreground-tertiary">YOU RECEIVE</p>
                    {youReceive.map((p) => (
                      <p key={p.playerId} className="truncate text-xs text-foreground">
                        {p.playerName} <span className="text-foreground-tertiary">{p.position}</span>
                      </p>
                    ))}
                  </div>
                  <div>
                    <p className="label-system text-[10px] text-foreground-tertiary">YOU SEND</p>
                    {youSend.map((p) => (
                      <p key={p.playerId} className="truncate text-xs text-foreground">
                        {p.playerName} <span className="text-foreground-tertiary">{p.position}</span>
                      </p>
                    ))}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  {pendingId === trade.id ? (
                    <span className="label-system text-[10px] text-foreground-tertiary">PROCESSING…</span>
                  ) : (
                    renderActions(trade)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Exported (Pass 11.5) so Home's compact trade widget can propose a trade inline without a second implementation — see dashboard/trade-desk.tsx. */
export function ProposeTradeDialog({
  open,
  onOpenChange,
  leagueId,
  myRoster,
  otherTeams,
  rostersByTeamId,
  onProposed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leagueId: string;
  myRoster: RosterPlayerOption[];
  otherTeams: Team[];
  rostersByTeamId: Record<string, RosterPlayerOption[]>;
  onProposed: () => void;
}) {
  const [step, setStep] = useState<"manager" | "players" | "review">("manager");
  const [targetTeamId, setTargetTeamId] = useState<string | null>(null);
  const [offeredIds, setOfferedIds] = useState<string[]>([]);
  const [requestedIds, setRequestedIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetTeam = otherTeams.find((t) => t.id === targetTeamId) ?? null;
  const targetRoster = targetTeamId ? (rostersByTeamId[targetTeamId] ?? []) : [];

  function reset() {
    setStep("manager");
    setTargetTeamId(null);
    setOfferedIds([]);
    setRequestedIds([]);
    setError(null);
  }

  function toggle(list: string[], setList: (ids: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  async function submit() {
    if (!targetTeamId) return;
    setSubmitting(true);
    setError(null);
    const result = await proposeTradeAction(leagueId, targetTeamId, offeredIds, requestedIds);
    setSubmitting(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    reset();
    onProposed();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>PROPOSE TRADE</DialogTitle>
          <DialogDescription>
            {step === "manager" && "Choose a manager to trade with."}
            {step === "players" && `Select players to send to and receive from ${targetTeam?.name}.`}
            {step === "review" && "Review before sending — this cannot be undone once accepted."}
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-xs text-destructive">{error}</p>}

        {step === "manager" && (
          <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
            {otherTeams.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTargetTeamId(t.id);
                  setStep("players");
                }}
                className="label-system flex items-center justify-between border border-border px-3 py-2 text-left text-[11px] text-foreground hover:bg-muted"
              >
                {t.name}
              </button>
            ))}
          </div>
        )}

        {step === "players" && targetTeam && (
          <div className="grid max-h-80 grid-cols-2 gap-3 overflow-y-auto">
            <div>
              <p className="label-system text-[10px] text-foreground-tertiary">YOU SEND</p>
              <div className="mt-1 flex flex-col gap-1">
                {myRoster.length === 0 && (
                  <p className="text-xs text-foreground-tertiary">No players on your roster.</p>
                )}
                {myRoster.map((p) => (
                  <label key={p.id} className="flex items-center gap-1.5 text-xs text-foreground">
                    <input
                      type="checkbox"
                      checked={offeredIds.includes(p.id)}
                      onChange={() => toggle(offeredIds, setOfferedIds, p.id)}
                    />
                    {p.name} <span className="text-foreground-tertiary">{p.position}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="label-system text-[10px] text-foreground-tertiary">YOU RECEIVE</p>
              <div className="mt-1 flex flex-col gap-1">
                {targetRoster.length === 0 && (
                  <p className="text-xs text-foreground-tertiary">No players on their roster.</p>
                )}
                {targetRoster.map((p) => (
                  <label key={p.id} className="flex items-center gap-1.5 text-xs text-foreground">
                    <input
                      type="checkbox"
                      checked={requestedIds.includes(p.id)}
                      onChange={() => toggle(requestedIds, setRequestedIds, p.id)}
                    />
                    {p.name} <span className="text-foreground-tertiary">{p.position}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === "review" && targetTeam && (
          <div className="text-xs">
            <p className="label-system text-[11px] text-foreground-tertiary">TO {targetTeam.name.toUpperCase()}</p>
            <p className="mt-2 label-system text-[10px] text-foreground-tertiary">YOU SEND</p>
            {myRoster
              .filter((p) => offeredIds.includes(p.id))
              .map((p) => (
                <p key={p.id} className="text-foreground">
                  {p.name}
                </p>
              ))}
            <p className="mt-2 label-system text-[10px] text-foreground-tertiary">YOU RECEIVE</p>
            {targetRoster
              .filter((p) => requestedIds.includes(p.id))
              .map((p) => (
                <p key={p.id} className="text-foreground">
                  {p.name}
                </p>
              ))}
          </div>
        )}

        <DialogFooter>
          {step === "players" && (
            <>
              <Button variant="outline" onClick={() => setStep("manager")}>
                Back
              </Button>
              <Button
                disabled={offeredIds.length === 0 && requestedIds.length === 0}
                onClick={() => setStep("review")}
              >
                Review
              </Button>
            </>
          )}
          {step === "review" && (
            <>
              <Button variant="outline" onClick={() => setStep("players")} disabled={submitting}>
                Back
              </Button>
              <Button disabled={submitting} onClick={submit}>
                {submitting ? "Sending…" : "Send Trade"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
