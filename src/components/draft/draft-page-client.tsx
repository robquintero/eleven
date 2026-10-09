"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DraftWorkspace } from "@/components/draft/draft-workspace";
import { getAvailablePlayersAction, getDraftUpdateAction } from "@/app/(app)/draft/actions";
import type { DraftState } from "@/data-access/drafts";
import type { PlayerDatabasePage } from "@/data-access/players";
import type { PlayerPosition } from "@/lib/types/fantasy";
import { createClient } from "@/lib/supabase/client";
import { createDraftSynchronizer, sampleDraftClock, type DraftClock } from "@/lib/draft-sync";
import { currentDraftUpdate } from "@/lib/draft-snapshot";
import { createLatestOnlyGuard } from "@/lib/search/stale-response-guard";

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
  const [clock, setClock] = useState<DraftClock | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const serverDraftRef = useRef(draft);
  const reconcile = useCallback(() => refreshRef.current(), []);
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
  // A stale, slower search response (e.g. a broad "G" query that takes
  // longer than the narrower "Gu" typed right after it) must never
  // overwrite a newer one's results -- see stale-response-guard.ts.
  const searchGuardRef = useRef(createLatestOnlyGuard());

  useEffect(() => { serverDraftRef.current = draft; }, [draft]);

  useEffect(() => {
    if (draft.status === "completed") return;
    let cancelled = false, completionRefreshed = false;
    const sync = createDraftSynchronizer(async () => {
      const started = performance.now();
      const next = await getDraftUpdateAction(leagueId);
      const received = performance.now();
      if (cancelled || !currentDraftUpdate(serverDraftRef.current, next)) return;
      setUpdate(previous => currentDraftUpdate(previous?.draft ?? serverDraftRef.current, next) ? next : previous);
      if (next.draft?.serverNow) setClock(sampleDraftClock(next.draft.serverNow, started, received));
      setSyncFailed(false);
      if (next.draft?.status === "completed" && !completionRefreshed) {
        completionRefreshed = true;
        router.refresh(); // One completion refresh; active picks use narrow reads.
      }
    }, () => { if (!cancelled) setSyncFailed(true); });
    refreshRef.current = sync.refresh;
    void sync.refresh(); // Mount/reload must not wait five seconds.
    const timer = setInterval(() => { void sync.refresh(); }, 5000);
    const wake = () => { if (document.visibilityState !== "hidden") void sync.refresh(); };
    window.addEventListener("online", wake);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    const supabase = createClient();
    const channel = supabase.channel(`draft:${leagueId}:${draft.draftId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "draft_picks", filter: `draft_id=eq.${draft.draftId}` }, sync.signal)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "drafts", filter: `id=eq.${draft.draftId}` }, sync.signal)
      .on("postgres_changes", { event: "*", schema: "public", table: "league_player_ownership", filter: `league_id=eq.${leagueId}` }, sync.signal)
      .subscribe(status => {
        if (status === "SUBSCRIBED") void sync.refresh(); // Includes rejoin: fetch missed events.
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") sync.signal();
      });
    return () => {
      cancelled = true; sync.dispose(); clearInterval(timer);
      refreshRef.current = async () => {};
      window.removeEventListener("online", wake); window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
      void supabase.removeChannel(channel);
    };
  }, [draft.status, draft.draftId, leagueId, router]);

  useEffect(() => () => { clearTimeout(debounceRef.current ?? undefined); searchGuardRef.current.start(); }, []);

  function runSearch(nextQuery: string, nextPosition: PlayerPosition | null) {
    if (!nextQuery && !nextPosition) {
      searchGuardRef.current.start();
      setSearchResults(null);
      return;
    }
    const token = searchGuardRef.current.start();
    getAvailablePlayersAction(leagueId, nextQuery, nextPosition ?? undefined).then((response) => {
      if (searchGuardRef.current.isLatest(token)) setSearchResults(response);
    }).catch(() => { if (searchGuardRef.current.isLatest(token)) setSyncFailed(true); });
  }

  function handleSearch(nextQuery: string) {
    searchGuardRef.current.start(); // Invalidate immediately, including the debounce window.
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
      {syncFailed && <p role="status" className="mt-3 text-sm text-foreground-secondary">Draft connection interrupted. Retrying automatically; picks remain server-confirmed.</p>}
      <div className="mt-4">
        <DraftWorkspace
          draft={currentDraft}
          clock={clock}
          onReconcile={reconcile}
          availablePlayers={availablePlayers}
          onSearch={handleSearch}
          positionFilter={positionFilter}
          onPositionFilterChange={handlePositionFilterChange}
        />
      </div>
    </div>
  );
}
