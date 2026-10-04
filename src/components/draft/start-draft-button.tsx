"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ActionFeedback, type ActionFeedbackKind } from "@/components/ui/action-feedback";
import { startDraftAction } from "@/app/(app)/draft/actions";

export function StartDraftButton({ leagueId }: { leagueId: string }) {
  const [error, setError] = useState<{ message: string; kind: ActionFeedbackKind } | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div>
      <Button
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await startDraftAction(leagueId);
            if (result?.error) setError({ message: result.error, kind: result.kind });
            else router.refresh();
          });
        }}
      >
        {isPending ? "Starting…" : "Start draft"}
      </Button>
      {error && <ActionFeedback kind={error.kind} message={error.message} />}
    </div>
  );
}
