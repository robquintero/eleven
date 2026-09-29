"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMediaQuery } from "@base-ui/react/unstable-use-media-query";
import { PlayerDatabaseToolbar } from "@/components/players/player-database-toolbar";
import { PlayerInspector } from "@/components/players/player-inspector";
import { PlayerListMobile } from "@/components/players/player-list-mobile";
import { PlayerTable } from "@/components/players/player-table";
import { currentRound } from "@/lib/mock/dashboard";
import { playerDatabase } from "@/lib/mock/players-database";
import { defaultFilters, filterAndSortPlayers, type PlayerFilters } from "@/lib/players-filters";
import { getDatabaseSummary } from "@/lib/selectors/player";
import { pad2 } from "@/lib/team-fixture";
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

export default function PlayersPage() {
  const [filters, setFilters] = useState<PlayerFilters>(defaultFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // No `noSsr` here: this value picks between two different DOM structures
  // in the initial render (table vs. mobile list), so it must go through
  // the hook's default SSR-safe double-render (defaultMatches first, real
  // value after mount) rather than risk a hydration mismatch.
  const isDesktopTable = useMediaQuery("(min-width: 768px)", {
    defaultMatches: true,
  });
  const isInlineInspector = useMediaQuery("(min-width: 1280px)", {
    defaultMatches: false,
  });

  const filtered = useMemo(() => filterAndSortPlayers(playerDatabase, filters), [filters]);
  const selectedPlayer = playerDatabase.find((p) => p.id === selectedId) ?? null;
  const selectedIndex = selectedPlayer
    ? (() => {
        const inFiltered = filtered.findIndex((p) => p.id === selectedPlayer.id);
        return inFiltered !== -1
          ? inFiltered
          : playerDatabase.findIndex((p) => p.id === selectedPlayer.id);
      })()
    : undefined;

  const summary = useMemo(() => {
    return getDatabaseSummary(playerDatabase);
  }, []);

  function updateFilters(patch: Partial<PlayerFilters>) {
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  function selectPlayer(player: Player) {
    setSelectedId(player.id);
    setHighlightedId(player.id);
    if (!isInlineInspector) setInspectorOpen(true);
  }

  function openHighlighted() {
    if (!highlightedId) return;
    const player = filtered.find((p) => p.id === highlightedId);
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
        if (filtered.length === 0) return;
        e.preventDefault();
        const currentIndex = filtered.findIndex((p) => p.id === highlightedId);
        const nextIndex =
          e.key === "ArrowDown"
            ? Math.min(currentIndex + 1, filtered.length - 1)
            : Math.max(currentIndex - 1, 0);
        const next = filtered[currentIndex === -1 ? 0 : nextIndex];
        setHighlightedId(next.id);
        document
          .getElementById(`player-row-${next.id}`)
          ?.scrollIntoView({ block: "nearest" });
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, highlightedId, inspectorOpen, isInlineInspector]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1 border-b border-border pb-3">
        <div>
          <h1 className="label-system text-sm font-semibold text-foreground">
            PLAYER_DATABASE
          </h1>
          <p className="label-system mt-0.5 text-[11px] text-foreground-tertiary">
            Big Five · Matchday {pad2(currentRound.number)}
          </p>
        </div>
        <div className="text-right">
          <p className="label-system text-sm font-semibold text-foreground">
            {playerDatabase.length} players
          </p>
          <p className="label-system mt-0.5 text-[11px] text-foreground-tertiary">Mock data</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
        <span className="label-system text-[11px] text-foreground-secondary">
          <span className="font-semibold text-foreground">{summary.free}</span> free agents
        </span>
        <span className="label-system text-[11px] text-foreground-secondary">
          <span className="font-semibold text-foreground">{summary.owned}</span> owned
        </span>
        <span className="label-system text-[11px] text-foreground-secondary">
          <span className="font-semibold text-foreground">{summary.waivers}</span> waivers
        </span>
        <span className="label-system text-[11px] text-destructive">
          <span className="font-semibold">{summary.flagged}</span> inj / susp
        </span>
      </div>

      <div className="mt-4">
        <PlayerDatabaseToolbar
          filters={filters}
          onChange={updateFilters}
          onReset={() => setFilters(defaultFilters)}
          resultCount={filtered.length}
          totalCount={playerDatabase.length}
          searchInputRef={searchInputRef}
        />
      </div>

      <div
        className={
          isInlineInspector && selectedPlayer
            ? "mt-4 grid grid-cols-[1fr_360px] items-start divide-x divide-border"
            : "mt-4"
        }
      >
        <div className={isInlineInspector && selectedPlayer ? "pr-4" : undefined}>
          {filtered.length > 0 ? (
            isDesktopTable ? (
              <PlayerTable
                players={filtered}
                selectedId={selectedId}
                highlightedId={highlightedId}
                sort={filters.sort}
                onSort={(sort) => updateFilters({ sort })}
                onSelect={selectPlayer}
              />
            ) : (
              <PlayerListMobile
                players={filtered}
                selectedId={selectedId}
                onSelect={selectPlayer}
              />
            )
          ) : (
            <EmptyState
              reason={filters.query.trim() ? "query" : "filters"}
              onReset={() => setFilters(defaultFilters)}
            />
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
    </div>
  );
}

function EmptyState({
  reason,
  onReset,
}: {
  reason: "query" | "filters";
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
      <p className="label-system text-sm text-foreground-secondary">
        {reason === "query" ? "No players match query" : "No players match active filters"}
      </p>
      <button
        type="button"
        onClick={onReset}
        className="label-system text-xs text-accent hover:underline"
      >
        Reset filters
      </button>
    </div>
  );
}
