"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { startDraftAction } from "@/app/(app)/draft/actions";

export function StartDraftButton({ leagueId }: { leagueId: string }) {
  const [error, setError] = useState<string | null>(null);
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
            if (result?.error) setError(result.error);
            else router.refresh();
          });
        }}
      >
        {isPending ? "Starting…" : "Start draft"}
      </Button>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
