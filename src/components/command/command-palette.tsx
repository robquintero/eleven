"use client";

import { PositionLabel } from "@/components/players/position-badge";

import { useEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Command as CommandPrimitive } from "cmdk";
import { Search, Trophy, Users } from "lucide-react";
import { searchPlayersAction, type PlayerSearchResult } from "@/app/(app)/players/actions";
import { useNavigationTransition } from "@/components/shell/navigation-transition";
import { shouldSearchPlayers } from "@/lib/search/player-search";
import { primaryNav } from "@/lib/navigation";

/**
 * Pass 12F: two real, navigable actions — both land on a surface that
 * genuinely does the thing, never a dead end. "Waivers" was dropped
 * entirely rather than kept as a placeholder: Eleven has no waiver
 * system and none is planned (see the Pass 12 scope guards) — a command
 * for a feature that will never exist is worse than no command at all.
 */
const actions = [
  { id: "propose-trade", label: "Propose trade", href: "/league" },
  { id: "transactions", label: "Transactions", href: "/home" },
] as const;

const SEARCH_DEBOUNCE_MS = 200;

const groupHeadingClassName =
  "**:[[cmdk-group-heading]]:label-system **:[[cmdk-group-heading]]:px-2.5 **:[[cmdk-group-heading]]:pt-3 **:[[cmdk-group-heading]]:pb-1.5 **:[[cmdk-group-heading]]:text-[10px] **:[[cmdk-group-heading]]:text-foreground-tertiary";

const itemClassName =
  "group flex cursor-default items-center gap-3 rounded-control px-2.5 py-2 text-sm text-foreground outline-none data-[selected=true]:bg-accent/10";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [playerResults, setPlayerResults] = useState<PlayerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const { navigate } = useNavigationTransition();
  const keyBuffer = useRef<{ key: string; time: number } | null>(null);

  // Reacting to the query changing by resetting player-search state during
  // render (React's documented "adjusting state when a prop changes"
  // pattern via a previous-value comparison) rather than synchronously
  // inside the effect below — the effect itself then only ever calls
  // setState from inside its genuinely async callbacks (the debounce
  // timer, the resolved search promise), never synchronously in its body.
  const [prevQuery, setPrevQuery] = useState(query);
  if (query !== prevQuery) {
    setPrevQuery(query);
    if (!shouldSearchPlayers(query)) {
      setPlayerResults([]);
      setSearching(false);
    } else {
      setSearching(true);
    }
  }

  // Pass 12F: real player search — the same accent-insensitive
  // `getPlayerDatabase` the Players workspace itself uses
  // (`searchPlayersAction`, src/app/(app)/players/actions.ts), debounced
  // so every keystroke doesn't fire a request. `cancelled` guards against
  // an out-of-order response (a slow early request resolving after a
  // faster later one) ever clobbering newer results.
  useEffect(() => {
    const trimmed = query.trim();
    if (!shouldSearchPlayers(trimmed)) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      searchPlayersAction(trimmed).then((results) => {
        if (!cancelled) {
          setPlayerResults(results);
          setSearching(false);
        }
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        handleOpenChange(!open);
        return;
      }

      if (open || isEditable) return;

      const now = Date.now();
      const buffered = keyBuffer.current;
      if (buffered && buffered.key === "g" && now - buffered.time < 600) {
        const match = primaryNav.find(
          (item) => item.shortcutKey === e.key.toLowerCase()
        );
        if (match) {
          e.preventDefault();
          navigate(match.href, match.label);
        }
        keyBuffer.current = null;
        return;
      }

      if (e.key.toLowerCase() === "g" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        keyBuffer.current = { key: "g", time: now };
      } else {
        keyBuffer.current = null;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, navigate]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery("");
      setPlayerResults([]);
    }
  }

  function go(href: string, label: string) {
    handleOpenChange(false);
    navigate(href, label);
  }

  function goToPlayer(player: PlayerSearchResult) {
    handleOpenChange(false);
    const href = `/players?q=${encodeURIComponent(player.name)}`;
    navigate(href, player.name);
  }

  const normalizedQuery = query.trim().toLowerCase();
  const filteredNav = normalizedQuery
    ? primaryNav.filter((item) => item.label.toLowerCase().includes(normalizedQuery))
    : primaryNav;
  const filteredActions = normalizedQuery
    ? actions.filter((action) => action.label.toLowerCase().includes(normalizedQuery))
    : actions;
  const hasAnyResults = filteredNav.length > 0 || filteredActions.length > 0 || playerResults.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        aria-label="Search"
        className="v2-shell-control size-11 outline-none focus-visible:ring-2 focus-visible:ring-accent sm:w-auto"
      >
        <Search className="size-3.5" strokeWidth={2} aria-hidden="true" />
        <span className="hidden sm:inline" aria-hidden="true">Search</span>
        <span className="hidden rounded border border-border px-1 py-0.5 text-[10px] text-foreground-tertiary sm:inline">
          ⌘K
        </span>
      </button>

      <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/60" />
          <DialogPrimitive.Popup className="eleven-v2 app-v2-overlay v2-command fixed top-[16vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-soft border border-border bg-surface-elevated shadow-2xl shadow-black/40 outline-none">
            <DialogPrimitive.Title className="sr-only">
              Search Eleven
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Jump to a screen, find a player, or run an action.
            </DialogPrimitive.Description>

            {/* `shouldFilter={false}`: every group here is already filtered
                deliberately above (simple substring match for Navigation/
                Actions, a real server search for Players) -- cmdk's own
                built-in fuzzy filter would otherwise re-filter (and could
                silently drop) results we've already decided are correct,
                especially the accent-insensitive player matches. */}
            <CommandPrimitive shouldFilter={false} className="flex flex-col">
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                <span className="v2-command-heading hidden shrink-0 text-foreground-secondary sm:inline">
                  Search Eleven
                </span>
                <CommandPrimitive.Input
                  autoFocus
                  value={query}
                  onValueChange={setQuery}
                  aria-label="Search players, pages, or actions"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="Search players, pages, or actions…"
                  className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-tertiary"
                />
                <span className="label-system shrink-0 text-[10px] text-foreground-tertiary">
                  ESC
                </span>
              </div>

              <CommandPrimitive.List className="max-h-[60vh] overflow-y-auto p-2">
                {!hasAnyResults && !searching && (
                  <p className="px-3 py-6 [overflow-wrap:anywhere] text-center text-sm text-foreground-tertiary">
                    No results{query.trim() ? ` for "${query.trim()}"` : ""}.
                  </p>
                )}

                {filteredNav.length > 0 && (
                  <CommandPrimitive.Group heading="Navigation" className={groupHeadingClassName}>
                    {filteredNav.map((item) => {
                      const Icon = item.icon;
                      return (
                        <CommandPrimitive.Item
                          key={item.href}
                          value={item.label}
                          onSelect={() => go(item.href, item.label)}
                          className={itemClassName}
                        >
                          <Icon
                            className="size-4 shrink-0 text-foreground-tertiary group-data-[selected=true]:text-accent"
                            strokeWidth={1.75}
                          />
                          <span className="flex-1">{item.label}</span>
                          <span className="label-system text-[10px] text-foreground-tertiary">
                            G {item.shortcutKey.toUpperCase()}
                          </span>
                        </CommandPrimitive.Item>
                      );
                    })}
                  </CommandPrimitive.Group>
                )}

                {shouldSearchPlayers(query) && (playerResults.length > 0 || searching) && (
                  <CommandPrimitive.Group heading="Players" className={groupHeadingClassName}>
                    {searching && playerResults.length === 0 ? (
                      <p className="px-2.5 py-2 text-xs text-foreground-tertiary">Searching…</p>
                    ) : (
                      playerResults.map((player) => (
                        <CommandPrimitive.Item
                          key={player.id}
                          value={`player-${player.id}`}
                          onSelect={() => goToPlayer(player)}
                          className={itemClassName}
                        >
                          <Users
                            className="size-4 shrink-0 text-foreground-tertiary group-data-[selected=true]:text-accent"
                            strokeWidth={1.75}
                          />
                          <span className="command-player-name flex-1" title={player.name}>{player.name}</span>
                          <span className="command-club shrink-0 text-foreground-tertiary">
                            <PositionLabel position={player.position} /> · {player.clubShortName}
                          </span>
                        </CommandPrimitive.Item>
                      ))
                    )}
                  </CommandPrimitive.Group>
                )}

                {filteredActions.length > 0 && (
                  <CommandPrimitive.Group heading="Actions" className={groupHeadingClassName}>
                    {filteredActions.map((action) => (
                      <CommandPrimitive.Item
                        key={action.id}
                        value={action.label}
                        onSelect={() => go(action.href, action.label)}
                        className={itemClassName}
                      >
                        <Trophy
                          className="size-4 shrink-0 text-foreground-tertiary group-data-[selected=true]:text-accent"
                          strokeWidth={1.75}
                        />
                        <span className="flex-1">{action.label}</span>
                      </CommandPrimitive.Item>
                    ))}
                  </CommandPrimitive.Group>
                )}
              </CommandPrimitive.List>
            </CommandPrimitive>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
