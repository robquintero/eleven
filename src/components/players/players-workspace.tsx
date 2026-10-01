"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMediaQuery } from "@base-ui/react/unstable-use-media-query";
import { dropPlayerAction, signPlayerAction } from "@/app/(app)/players/actions";
import { PlayerDatabaseToolbar } from "@/components/players/player-database-toolbar";
import { PlayerInspector } from "@/components/players/player-inspector";
import { PlayerListMobile } from "@/components/players/player-list-mobile";
import { PlayerTable } from "@/components/players/player-table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ClubFilterOption, CompetitionFilterOption, PlayerDatabasePage } from "@/data-access/players";
import { clubDisplayLabel } from "@/lib/club-display";
import { defaultFilters, filtersToSearchParams, type PlayerFilters } from "@/lib/players-filters";
import type { Player } from "@/lib/types/fantasy";

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable)
  );
}

/**
 * The interactive scouting-terminal shell. Filtering/sorting/pagination all
 * live in the URL and are executed server-side by `getPlayerDatabase`
 * (src/data-access/players.ts) — this component only holds truly-local UI
 * state (selection, highlight, inspector open/closed) and never filters a
 * fetched array further client-side. Changing a filter navigates to a new
 * URL, which re-runs the server query for the new page/scope.
 */
export function PlayersWorkspace({
  data,
  filters,
  page,
  competitions,
  clubs,
  hasActiveLeague,
  leagueId,
  fantasyTeamId,
}: {
  data: PlayerDatabasePage;
  filters: PlayerFilters;
  page: number;
  competitions: CompetitionFilterOption[];
  clubs: ClubFilterOption[];
  hasActiveLeague: boolean;
  leagueId: string | null;
  fantasyTeamId: string | null;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [queryDraft, setQueryDraft] = useState(filters.query);
  const [pendingPlayerId, setPendingPlayerId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<Player | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canTransact = Boolean(leagueId && fantasyTeamId);

  async function handleAdd(player: Player) {
    if (!leagueId) return;
    setActionError(null);
    setPendingPlayerId(player.id);
    const result = await signPlayerAction(leagueId, player.id);
    setPendingPlayerId(null);
    if (result?.error) {
      setActionError(result.error);
      return;
    }
    router.refresh();
  }

  function requestDrop(player: Player) {
    setActionError(null);
    setDropTarget(player);
  }

  async function confirmDrop() {
    if (!leagueId || !dropTarget) return;
    const player = dropTarget;
    setActionError(null);
    setPendingPlayerId(player.id);
    const result = await dropPlayerAction(leagueId, player.id);
    setPendingPlayerId(null);
    setDropTarget(null);
    if (result?.error) {
      setActionError(result.error);
      return;
    }
    router.refresh();
  }

  const isDesktopTable = useMediaQuery("(min-width: 768px)", { defaultMatches: true });
  const isInlineInspector = useMediaQuery("(min-width: 1280px)", { defaultMatches: false });

  const players = data.players;
  const selectedPlayer = players.find((p) => p.id === selectedId) ?? null;
  const selectedIndex = selectedPlayer ? players.findIndex((p) => p.id === selectedPlayer.id) : undefined;
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  function navigate(nextFilters: PlayerFilters, nextPage: number) {
    const params = filtersToSearchParams(nextFilters, nextPage);
    const qs = params.toString();
    router.push(qs ? `/players?${qs}` : "/players");
  }

  function updateFilters(patch: Partial<PlayerFilters>) {
    navigate({ ...filters, ...patch }, 1);
  }

  function onQueryChange(value: string) {
    setQueryDraft(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => updateFilters({ query: value }), 350);
  }

  function goToPage(nextPage: number) {
    navigate(filters, Math.min(Math.max(1, nextPage), totalPages));
  }

  function selectPlayer(player: Player) {
    setSelectedId(player.id);
    setHighlightedId(player.id);
    if (!isInlineInspector) setInspectorOpen(true);
  }

  function openHighlighted() {
    if (!highlightedId) return;
    const player = players.find((p) => p.id === highlightedId);
    if (player) selectPlayer(player);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "/" && !isEditableTarget(e.target)) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (isEditableTarget(e.target)) return;

      if (e.key === "Enter") {
        openHighlighted();
        return;
      }

      if (e.key === "Escape") {
        if (inspectorOpen) {
          setInspectorOpen(false);
        } else if (highlightedId) {
          setHighlightedId(null);
        }
        return;
      }

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (players.length === 0) return;
        e.preventDefault();
        const currentIndex = players.findIndex((p) => p.id === highlightedId);
        const nextIndex =
          e.key === "ArrowDown"
            ? Math.min(currentIndex + 1, players.length - 1)
            : Math.max(currentIndex - 1, 0);
        const next = players[currentIndex === -1 ? 0 : nextIndex];
        setHighlightedId(next.id);
        document.getElementById(`player-row-${next.id}`)?.scrollIntoView({ block: "nearest" });
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, highlightedId, inspectorOpen, isInlineInspector]);

  if (data.total === 0 && !hasAnyFilterOrIngestedData(filters, competitions)) {
    return (
      <div>
        <Header total={0} />
        <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
          <p className="label-system text-sm text-foreground-secondary">NO PLAYER DATA AVAILABLE</p>
          <p className="max-w-sm text-xs text-foreground-tertiary">
            Football data synchronization has not been completed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header total={data.total} />

      <div className="mt-4">
        <PlayerDatabaseToolbar
          filters={{ ...filters, query: queryDraft }}
          onChange={(patch) => {
            if ("query" in patch && patch.query !== undefined) {
              onQueryChange(patch.query);
            } else {
              updateFilters(patch);
            }
          }}
          onReset={() => {
            setQueryDraft("");
            navigate(defaultFilters, 1);
          }}
          resultCount={players.length}
          totalCount={data.total}
          searchInputRef={searchInputRef}
          clubOptions={[
            { value: "ALL", label: "ALL" },
            ...clubs
              .filter((c) => filters.competitionId === "ALL" || c.competitionId === filters.competitionId)
              .map((c) => ({ value: c.id, label: clubDisplayLabel(c) })),
          ]}
          competitionOptions={[{ value: "ALL", label: "ALL" }, ...competitions.map((c) => ({ value: c.id, label: c.code }))]}
          showOwnershipFilter={hasActiveLeague}
        />
      </div>

      {actionError && (
        <p className="label-system mt-3 border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
          {actionError}
        </p>
      )}

      <div
        className={
          isInlineInspector && selectedPlayer
            ? "mt-4 grid grid-cols-[1fr_360px] items-start divide-x divide-border"
            : "mt-4"
        }
      >
        <div className={isInlineInspector && selectedPlayer ? "pr-4" : undefined}>
          {players.length > 0 ? (
            isDesktopTable ? (
              <PlayerTable
                players={players}
                selectedId={selectedId}
                highlightedId={highlightedId}
                sort={filters.sort}
                onSort={(sort) => updateFilters({ sort })}
                onSelect={selectPlayer}
                onAdd={canTransact ? handleAdd : undefined}
                onDrop={canTransact ? requestDrop : undefined}
                pendingPlayerId={pendingPlayerId}
              />
            ) : (
              <PlayerListMobile
                players={players}
                selectedId={selectedId}
                onSelect={selectPlayer}
                onAdd={canTransact ? handleAdd : undefined}
                onDrop={canTransact ? requestDrop : undefined}
                pendingPlayerId={pendingPlayerId}
              />
            )
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
              <p className="label-system text-sm text-foreground-secondary">No players match these filters</p>
              <button
                type="button"
                onClick={() => {
                  setQueryDraft("");
                  navigate(defaultFilters, 1);
                }}
                className="label-system text-xs text-accent hover:underline"
              >
                Reset filters
              </button>
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => goToPage(page - 1)}
                className="label-system text-[11px] text-foreground-secondary hover:text-foreground disabled:opacity-40"
              >
                ← PREV
              </button>
              <span className="label-system text-[11px] text-foreground-tertiary">
                PAGE {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => goToPage(page + 1)}
                className="label-system text-[11px] text-foreground-secondary hover:text-foreground disabled:opacity-40"
              >
                NEXT →
              </button>
            </div>
          )}
        </div>

        {isInlineInspector && selectedPlayer && (
          <PlayerInspector
            player={selectedPlayer}
            index={selectedIndex}
            variant="inline"
            open
            onOpenChange={() => {}}
          />
        )}
      </div>

      {!isInlineInspector && (
        <PlayerInspector
          player={selectedPlayer}
          index={selectedIndex}
          variant="overlay"
          open={inspectorOpen}
          onOpenChange={setInspectorOpen}
        />
      )}

      <Dialog
        open={dropTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDropTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>DROP {dropTarget?.name.toUpperCase()}</DialogTitle>
            <DialogDescription>
              This removes {dropTarget?.name} from your roster immediately and returns them to the free
              market. Any current-round lineup points already locked in are unaffected, but you will lose
              the player&apos;s remaining-round points if they haven&apos;t kicked off yet.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDropTarget(null)} disabled={pendingPlayerId !== null}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDrop} disabled={pendingPlayerId !== null}>
              {pendingPlayerId !== null ? "Dropping…" : "Drop Player"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Header({ total }: { total: number }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1 border-b border-border pb-3">
      <div>
        <h1 className="label-system text-sm font-semibold text-foreground">PLAYER_DATABASE</h1>
        <p className="label-system mt-0.5 text-[11px] text-foreground-tertiary">Big Five</p>
      </div>
      <div className="text-right">
        <p className="label-system text-sm font-semibold text-foreground">{total} players</p>
      </div>
    </div>
  );
}

/** True zero-data (nothing ingested at all) vs. zero results from an active filter — only the former shows the "sync hasn't run" empty state. */
function hasAnyFilterOrIngestedData(filters: PlayerFilters, competitions: CompetitionFilterOption[]) {
  const filtersActive =
    filters.query.trim() !== "" ||
    filters.position !== "ALL" ||
    filters.competitionId !== "ALL" ||
    filters.clubId !== "ALL" ||
    filters.ownership !== "ALL" ||
    filters.availability !== "ALL";
  return filtersActive || competitions.length > 0;
}
