"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DraftWorkspace } from "@/components/draft/draft-workspace";
import { getAvailablePlayersAction } from "@/app/(app)/draft/actions";
import type { DraftState } from "@/data-access/drafts";
import type { PlayerDatabasePage } from "@/data-access/players";

/** Root client island for /draft — owns the debounced player search and periodically refreshes the server-rendered draft state so turn changes made by OTHER managers (or an auto-pick) show up without a manual reload. */
export function DraftPageClient({
  leagueId,
  draft,
  hasTeam,
}: {
  leagueId: string;
  draft: DraftState;
  hasTeam: boolean;
}) {
  const router = useRouter();
  const [availablePlayers, setAvailablePlayers] = useState<PlayerDatabasePage>({ players: [], total: 0, page: 1, pageSize: 30 });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getAvailablePlayersAction(leagueId, "").then(setAvailablePlayers);
  }, [leagueId]);

  useEffect(() => {
    if (draft.status !== "in_progress") return;
    const interval = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(interval);
  }, [draft.status, router]);

  function handleSearch(query: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      getAvailablePlayersAction(leagueId, query).then(setAvailablePlayers);
    }, 250);
  }

  return (
    <div>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Draft</h1>
        <p className="mt-1.5 text-sm text-foreground-secondary">
          {!hasTeam && "You don't have a team in this league — spectating only. "}
          {draft.teamCount} managers · {draft.totalRounds} rounds
        </p>
      </div>
      <div className="mt-4">
        <DraftWorkspace draft={draft} availablePlayers={availablePlayers} onSearch={handleSearch} />
      </div>
    </div>
  );
}
