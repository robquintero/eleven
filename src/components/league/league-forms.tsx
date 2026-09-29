"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { createLeagueAction, joinLeagueAction, type LeagueFormState } from "@/app/(app)/league/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TerminalPanel, TerminalPanelSection } from "@/components/ui/terminal-panel";

function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p className="flex items-start gap-2 text-xs text-destructive">
      <AlertCircle className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
      {error}
    </p>
  );
}

export function CreateLeagueForm() {
  const [state, formAction, pending] = useActionState<LeagueFormState, FormData>(
    createLeagueAction,
    undefined
  );

  return (
    <TerminalPanel header="CREATE_LEAGUE">
      <TerminalPanelSection>
        <form action={formAction} className="space-y-3">
          <label className="block">
            <span className="label-system text-[11px] text-foreground-tertiary">
              League name
            </span>
            <Input name="name" required className="mt-1.5" placeholder="The Boardroom" />
          </label>
          <label className="block">
            <span className="label-system text-[11px] text-foreground-tertiary">
              Your team name
            </span>
            <Input name="teamName" required className="mt-1.5" placeholder="Robert FC" />
          </label>
          <label className="block">
            <span className="label-system text-[11px] text-foreground-tertiary">
              Abbreviation
            </span>
            <Input
              name="teamAbbreviation"
              required
              minLength={2}
              maxLength={5}
              className="mt-1.5 uppercase"
              placeholder="RFC"
            />
          </label>
          <FieldError error={state?.error} />
          <Button type="submit" disabled={pending} className="w-full rounded-control">
            {pending ? "Creating…" : "Create league"}
          </Button>
        </form>
      </TerminalPanelSection>
    </TerminalPanel>
  );
}

export function JoinLeagueForm() {
  const [state, formAction, pending] = useActionState<LeagueFormState, FormData>(
    joinLeagueAction,
    undefined
  );

  return (
    <TerminalPanel header="JOIN_LEAGUE">
      <TerminalPanelSection>
        <form action={formAction} className="space-y-3">
          <label className="block">
            <span className="label-system text-[11px] text-foreground-tertiary">
              Invite code
            </span>
            <Input
              name="inviteCode"
              required
              className="mt-1.5 uppercase"
              placeholder="ABCD2345"
            />
          </label>
          <label className="block">
            <span className="label-system text-[11px] text-foreground-tertiary">
              Your team name
            </span>
            <Input name="teamName" required className="mt-1.5" placeholder="Camden Wolves" />
          </label>
          <label className="block">
            <span className="label-system text-[11px] text-foreground-tertiary">
              Abbreviation
            </span>
            <Input
              name="teamAbbreviation"
              required
              minLength={2}
              maxLength={5}
              className="mt-1.5 uppercase"
              placeholder="CW"
            />
          </label>
          <FieldError error={state?.error} />
          <Button type="submit" disabled={pending} className="w-full rounded-control">
            {pending ? "Joining…" : "Join league"}
          </Button>
        </form>
      </TerminalPanelSection>
    </TerminalPanel>
  );
}
