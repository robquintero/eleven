"use client";

import { PositionBadge, PositionLabel } from "@/components/players/position-badge";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import {
  getTradeRostersAction,
  acceptTradeAction,
  cancelTradeAction,
  proposeTradeAction,
  rejectTradeAction,
} from "@/app/(app)/league/trade-actions";
import { ActionFeedback, type ActionFeedbackKind } from "@/components/ui/action-feedback";
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

type TradeResponder = (id: string) => Promise<{ error: string; kind: ActionFeedbackKind } | undefined>;

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
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; kind: ActionFeedbackKind } | null>(null);
  const [proposeOpen, setProposeOpen] = useState(false);

  async function respond(action: TradeResponder, tradeId: string) {
    setError(null);
    setPendingId(tradeId);
    const result = await action(tradeId);
    setPendingId(null);
    if (result?.error) {
      setError({ message: result.error, kind: result.kind });
      return;
    }
    // The trade action revalidates /league; Next supplies canonical Flight.
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

      {error && <ActionFeedback kind={error.kind} message={error.message} />}

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

      <LazyProposeTradeDialog
        open={proposeOpen}
        onOpenChange={setProposeOpen}
        leagueId={leagueId}
        myTeamId={myTeamId}
        otherTeams={otherTeams}
        onProposed={() => {
          setProposeOpen(false);
          // The trade action revalidates /league; Next supplies canonical Flight.
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
                        {p.playerName} <PositionLabel position={p.position} />
                      </p>
                    ))}
                  </div>
                  <div>
                    <p className="label-system text-[10px] text-foreground-tertiary">YOU SEND</p>
                    {youSend.map((p) => (
                      <p key={p.playerId} className="truncate text-xs text-foreground">
                        {p.playerName} <PositionLabel position={p.position} />
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
  const [error, setError] = useState<{ message: string; kind: ActionFeedbackKind } | null>(null);

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
      setError({ message: result.error, kind: result.kind });
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

        {error && <ActionFeedback kind={error.kind} message={error.message} />}

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
          <div className="grid max-h-80 grid-cols-1 gap-4 overflow-y-auto sm:grid-cols-2 sm:gap-3">
            <div>
              <p className="label-system text-[10px] text-foreground-tertiary">YOU SEND</p>
              <div className="mt-1.5 flex flex-col gap-1">
                {myRoster.length === 0 && (
                  <p className="text-xs text-foreground-tertiary">No players on your roster.</p>
                )}
                {myRoster.map((p) => (
                  <TradePlayerRow
                    key={p.id}
                    player={p}
                    selected={offeredIds.includes(p.id)}
                    onToggle={() => toggle(offeredIds, setOfferedIds, p.id)}
                  />
                ))}
              </div>
            </div>
            <div>
              <p className="label-system text-[10px] text-foreground-tertiary">YOU RECEIVE</p>
              <div className="mt-1.5 flex flex-col gap-1">
                {targetRoster.length === 0 && (
                  <p className="text-xs text-foreground-tertiary">No players on their roster.</p>
                )}
                {targetRoster.map((p) => (
                  <TradePlayerRow
                    key={p.id}
                    player={p}
                    selected={requestedIds.includes(p.id)}
                    onToggle={() => toggle(requestedIds, setRequestedIds, p.id)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {step === "players" && targetTeam && <TradeCountHint offeredCount={offeredIds.length} requestedCount={requestedIds.length} />}

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
                disabled={offeredIds.length === 0 || offeredIds.length !== requestedIds.length}
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

/**
 * Pass 12F (§8): a trade player pick, styled like the rest of Eleven's
 * operational surfaces (position badge + label-system type + accent
 * selected state — see the DRAFT board's row pattern in
 * draft-workspace.tsx and the selected-state Check used in
 * shell/league-switcher.tsx) instead of a bare browser checkbox.
 */
function TradePlayerRow({
  player,
  selected,
  onToggle,
}: {
  player: RosterPlayerOption;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={onToggle}
      className={`flex w-full cursor-pointer items-center gap-2 rounded-control border px-2 py-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 ${
        selected ? "border-accent bg-accent/10" : "border-border hover:bg-muted"
      }`}
    >
      <PositionBadge position={player.position} />
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{player.name}</span>
      <Check
        className={`size-3.5 shrink-0 text-accent transition-opacity ${selected ? "opacity-100" : "opacity-0"}`}
        aria-hidden="true"
      />
    </button>
  );
}

/**
 * Pass 12F (§7): live feedback for the canonical "equal player counts on
 * both sides" rule (`propose_trade`'s own authoritative UNEVEN_TRADE
 * check — this is a courtesy mirror of that rule, never the enforcement
 * itself). Shows the real counts on both sides and, while they differ,
 * exactly how many more players from which side would balance the trade.
 */
function TradeCountHint({ offeredCount, requestedCount }: { offeredCount: number; requestedCount: number }) {
  const difference = offeredCount - requestedCount;

  return (
    <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3 text-xs">
      <div className="flex items-center gap-4">
        <span className="label-system text-[10px] text-foreground-tertiary">
          YOUR SIDE <span className="font-semibold text-foreground">{offeredCount}</span>
        </span>
        <span className="label-system text-[10px] text-foreground-tertiary">
          THEIR SIDE <span className="font-semibold text-foreground">{requestedCount}</span>
        </span>
      </div>
      {difference !== 0 && (offeredCount > 0 || requestedCount > 0) && (
        <span className="label-system text-[10px] text-accent">
          {difference > 0
            ? `ADD ${difference} PLAYER${difference === 1 ? "" : "S"} FROM THEIR TEAM`
            : `ADD ${-difference} PLAYER${-difference === 1 ? "" : "S"} FROM YOUR TEAM`}
        </span>
      )}
    </div>
  );
}

/** Trade composition has no data cost until the manager opens it. */
export function LazyProposeTradeDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leagueId: string;
  myTeamId: string;
  otherTeams: Team[];
  onProposed: () => void;
}) {
  const [loaded, setLoaded] = useState<{ leagueId: string; rosters: Record<string, RosterPlayerOption[]> } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    if (!props.open) return;
    let cancelled = false;
    getTradeRostersAction(props.leagueId).then((rosters) => {
      if (!cancelled) setLoaded({ leagueId: props.leagueId, rosters });
    }).catch(() => {
      if (!cancelled) setLoadError("Couldn't load trade rosters. Close and try again.");
    });
    return () => { cancelled = true; };
  }, [props.open, props.leagueId]);
  function onOpenChange(open: boolean) {
    if (!open) { setLoaded(null); setLoadError(null); }
    props.onOpenChange(open);
  }
  if (!loaded || loaded.leagueId !== props.leagueId) {
    return <Dialog open={props.open} onOpenChange={onOpenChange}>
      <DialogContent><DialogHeader><DialogTitle>PROPOSE TRADE</DialogTitle>
        <DialogDescription>{loadError ?? "Loading rosters…"}</DialogDescription>
      </DialogHeader></DialogContent>
    </Dialog>;
  }
  return <ProposeTradeDialog {...props} onOpenChange={onOpenChange}
    onProposed={() => { setLoaded(null); setLoadError(null); props.onProposed(); }}
    myRoster={loaded.rosters[props.myTeamId] ?? []} rostersByTeamId={loaded.rosters} />;
}
