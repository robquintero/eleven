"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DraftWorkspace } from "@/components/draft/draft-workspace";
import { getAvailablePlayersAction, getDraftUpdateAction } from "@/app/(app)/draft/actions";
import type { DraftState } from "@/data-access/drafts";
import type { PlayerDatabasePage } from "@/data-access/players";
import type { PlayerPosition } from "@/lib/types/fantasy";
import { currentDraftUpdate } from "@/lib/draft-snapshot";

/** Owns player search and polls changing draft/ownership state without reloading the catalog. */
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
  const [update, setUpdate] = useState<Awaited<ReturnType<typeof getDraftUpdateAction>> | null>(null);
  const acceptedUpdate = currentDraftUpdate(draft, update);
  const currentDraft = acceptedUpdate?.draft ?? draft;
  // `null` means "no active search" -- render straight from the server's
  // own fresh `initialPlayers` prop. A non-null value is this component's own
  // client-fetched search result, which intentionally persists until the
  // user clears the box.
  const [searchResults, setSearchResults] = useState<PlayerDatabasePage | null>(null);
  const [query, setQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState<PlayerPosition | null>(null);
  const basePlayers = searchResults ?? initialPlayers;
  const availablePlayers = acceptedUpdate ? {
    ...basePlayers,
    players: basePlayers.players.map((player) => ({ ...player, ownership: acceptedUpdate.ownership[player.id]
      ? acceptedUpdate.ownership[player.id] === currentDraft.myFantasyTeamId ? "mine" as const : "owned" as const
      : "free" as const })),
  } : basePlayers;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (currentDraft.status !== "in_progress") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await getDraftUpdateAction(leagueId);
        if (!cancelled) {
          if (next.draft?.status === "completed") router.refresh();
          else if (next.draft) setUpdate(next);
        }
      } finally {
        if (!cancelled) timer = setTimeout(() => { void poll().catch(() => {}); }, 5000);
      }
    }
    timer = setTimeout(() => { void poll().catch(() => {}); }, 5000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [currentDraft.status, currentDraft.draftId, leagueId, router]);

  function runSearch(nextQuery: string, nextPosition: PlayerPosition | null) {
    if (!nextQuery && !nextPosition) {
      setSearchResults(null);
      return;
    }
    getAvailablePlayersAction(leagueId, nextQuery, nextPosition ?? undefined).then(setSearchResults);
  }

  function handleSearch(nextQuery: string) {
    setQuery(nextQuery);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(nextQuery, positionFilter), 250);
  }

  /** Immediate, not debounced -- a filter tap should apply right away, unlike free-text typing. */
  function handlePositionFilterChange(next: PlayerPosition | null) {
    setPositionFilter(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    runSearch(query, next);
  }

  return (
    <div className="core-v2">
      <div>
        <h1 className="v2-page-title">Draft</h1>
        <p className="mt-1.5 text-sm text-foreground-secondary">
          {!hasTeam && "You don't have a team in this league — spectating only. "}
          {draft.teamCount} managers · {draft.totalRounds} rounds
        </p>
      </div>
      <div className="mt-4">
        <DraftWorkspace
          draft={currentDraft}
          availablePlayers={availablePlayers}
          onSearch={handleSearch}
          positionFilter={positionFilter}
          onPositionFilterChange={handlePositionFilterChange}
        />
      </div>
    </div>
  );
}
