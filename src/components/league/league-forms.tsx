"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { createLeagueAction, joinLeagueAction, type LeagueFormState } from "@/app/(app)/league/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
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
    <form action={formAction} aria-label="Create league" aria-busy={pending} className="v2-form">
      <label className="block">
        <span className="block">
          League name
        </span>
        <Input name="name" required className="mt-1.5" placeholder="The Boardroom" />
      </label>
      <label className="block">
        <span className="block">
          Your team name
        </span>
        <Input name="teamName" required className="mt-1.5" placeholder="Robert FC" />
      </label>
      <label className="block">
        <span className="block">
          Abbreviation
        </span>
        <Input
          name="teamAbbreviation"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          required
          minLength={2}
          maxLength={5}
          className="mt-1.5 uppercase"
          placeholder="RFC"
        />
      </label>
      <FieldError error={state?.error} />
      <Button type="submit" disabled={pending} className="v2-primary w-full">
        {pending ? "Creating…" : "Create league"}
      </Button>
    </form>
  );
}

export function JoinLeagueForm() {
  const [state, formAction, pending] = useActionState<LeagueFormState, FormData>(
    joinLeagueAction,
    undefined
  );

  return (
    <form action={formAction} aria-label="Join league" aria-busy={pending} className="v2-form">
      <label className="block">
        <span className="block">
          Invite code
        </span>
        <Input
          name="inviteCode"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          required
          className="mt-1.5 uppercase"
          placeholder="ABCD2345"
        />
      </label>
      <label className="block">
        <span className="block">
          Your team name
        </span>
        <Input name="teamName" required className="mt-1.5" placeholder="Camden Wolves" />
      </label>
      <label className="block">
        <span className="block">
          Abbreviation
        </span>
        <Input
          name="teamAbbreviation"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          required
          minLength={2}
          maxLength={5}
          className="mt-1.5 uppercase"
          placeholder="CW"
        />
      </label>
      <FieldError error={state?.error} />
      <Button type="submit" disabled={pending} className="v2-primary w-full">
        {pending ? "Joining…" : "Join league"}
      </Button>
    </form>
  );
}
