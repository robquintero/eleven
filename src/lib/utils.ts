export { cn } from "cn"

/**
 * Pass 14.7 Phase 1: the one canonical "this row is clickable" treatment —
 * extracted from the Players market page's `PlayerTable`
 * (src/components/players/player-table.tsx), which already had the
 * hover feel every other interactive player row across the app should
 * match, rather than each row hand-rolling its own (or none at all).
 * `focus-visible` is new everywhere, including on `PlayerTable` itself —
 * no interactive player row anywhere previously had a keyboard-visible
 * focus ring, reusing the same ring token `button.tsx` already uses.
 * Callers apply this ONLY to rows that are genuinely clickable (never to
 * a purely informational row) — locked/disabled-for-one-action rows still
 * get it as long as SOME click still does something (e.g. a locked
 * player row that still opens an explanation), per the brief's own "locked
 * does not mean visually dead" rule.
 */
export const INTERACTIVE_ROW_CLASS =
  "cursor-pointer transition-colors hover:bg-surface outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset";
