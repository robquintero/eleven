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
  initialPlayers,
}: {
  leagueId: string;
  draft: DraftState;
  hasTeam: boolean;
  initialPlayers: PlayerDatabasePage;
}) {
  const router = useRouter();
  // `null` means "no active search" -- render straight from the server's
  // own fresh `initialPlayers` prop (which changes on every periodic
  // router.refresh(), automatically staying current with no effect
  // needed to resync it). A non-null value is this component's own
  // client-fetched search result, which intentionally persists until the
  // user clears the box.
  const [searchResults, setSearchResults] = useState<PlayerDatabasePage | null>(null);
  const availablePlayers = searchResults ?? initialPlayers;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (draft.status !== "in_progress") return;
    const interval = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(interval);
  }, [draft.status, router]);

  function handleSearch(query: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!query) {
        setSearchResults(null);
        return;
      }
      getAvailablePlayersAction(leagueId, query).then(setSearchResults);
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
