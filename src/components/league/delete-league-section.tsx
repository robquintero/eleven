"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { deleteLeagueAction } from "@/app/(app)/league/delete-actions";
import { validLeagueDeleteConfirmation } from "@/lib/league-deletion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function DeleteLeagueSection({ leagueId, leagueName, v2 = false }: { leagueId: string; leagueName: string; v2?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const submitting = useRef(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  function changeOpen(next: boolean) {
    if (submitting.current) return;
    setOpen(next);
    setConfirmation("");
    setError(null);
  }
  function submit() {
    if (submitting.current || !validLeagueDeleteConfirmation(confirmation)) return;
    submitting.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteLeagueAction(leagueId, confirmation);
        if ("error" in result) setError(result.error);
        else { setOpen(false); router.replace("/"); }
      } catch {
        setError("The deletion could not be confirmed. Reload to check the league before trying again.");
      } finally {
        submitting.current = false;
      }
    });
  }

  return (
    <section className={v2 ? "v2-management" : "border-t border-border pt-6"} aria-label="Danger zone">
      <p className={v2 ? "v2-meta" : "label-system text-[11px] text-foreground-secondary"}>{v2 ? "Danger zone" : "DANGER ZONE"}</p>
      <h2 className="mt-2 text-sm font-medium text-foreground">Delete League</h2>
      <p className="mt-1 text-sm text-foreground-secondary">Permanently delete this league and its fantasy data.</p>
      <Dialog open={open} onOpenChange={changeOpen} disablePointerDismissal={pending}>
        <DialogTrigger render={<Button variant="destructive" className="mt-3 rounded-control" />}>Delete League</DialogTrigger>
        <DialogContent showCloseButton={false} initialFocus={cancelRef} className={v2 ? "eleven-v2 v2-dialog sm:max-w-lg" : "sm:max-w-lg"} aria-busy={pending}>
          <DialogTitle className="break-words pr-0 text-sm text-foreground">Delete {leagueName}?</DialogTitle>
          <DialogDescription className="text-foreground-secondary">
            This permanently deletes the league and its fantasy history: teams, rosters, rounds, matchups, results,
            standings, draft state and history, trades, waivers, transactions, events, memberships, lineups and all other league-owned fantasy records.
          </DialogDescription>
          <p className="text-sm text-destructive">This action cannot be undone.</p>
          <p className="text-xs text-foreground-secondary">Accounts, other leagues and shared football data will remain.</p>
          <label className="block text-sm text-foreground" htmlFor="delete-league-confirmation">
            Type <strong>DELETE</strong> to confirm
            <Input id="delete-league-confirmation" className="mt-2" autoComplete="off" spellCheck={false}
              value={confirmation} disabled={pending} onChange={e => setConfirmation(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }} />
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <p role="status" aria-live="polite" className="sr-only">{pending ? "Deleting league. Please wait." : ""}</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button ref={cancelRef} type="button" variant="outline" disabled={pending} onClick={() => changeOpen(false)}>Cancel</Button>
            <Button type="button" variant="destructive" disabled={pending || !validLeagueDeleteConfirmation(confirmation)} onClick={submit}>
              {pending ? "Deleting…" : "Permanently Delete League"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
