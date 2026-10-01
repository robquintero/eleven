# Accessibility (Pass 10C)

Target: **WCAG 2.2 AA where reasonably achievable.** Not claimed as
certified, fully compliant, or guaranteed accessible — see `/accessibility`
for the public-facing version of this statement.

## Improvements made this pass
- **Skip-to-content link** in the root layout (`src/app/layout.tsx`),
  landing on `id="main-content"` in every shell (`(app)`'s `AppShell`,
  `(auth)`'s layout, `(public)`'s layout, the landing page itself).
- **Reduced motion:** a global `prefers-reduced-motion: reduce` rule in
  `src/app/globals.css` collapses animation/transition durations
  app-wide (covers every existing `animate-spin`/`animate-ping` use —
  live indicators, processing spinners — without removing the underlying
  state change).
- **Icon-only controls with no accessible name:** `Wordmark`
  (`src/components/shell/wordmark.tsx`) was an icon-only link on mobile
  (text hidden below `sm`) with no accessible name at all — fixed with
  `aria-label` on the link. `CommandPalette`'s search trigger
  (`src/components/command/command-palette.tsx`) had the same mobile gap
  — fixed the same way.
- Audited other icon-only controls across the shell (profile menu,
  mobile nav, bench "clear search", sheet close button) and found them
  already correctly labeled — no change needed there.

## Conventions already in place (preserved, not introduced this pass)
- Semantic landmarks (`header`, `nav`, `main`, `aside`) throughout the
  authenticated shell and public pages.
- `aria-current="page"` on active nav links.
- Visible `focus-visible` rings on all `Button`-based controls
  (`src/components/ui/button.tsx`).
- Status/availability conveyed through text + icon together, never color
  alone (e.g. injured/doubtful indicators pair a colored dot with a text
  label elsewhere in the same row).
- Dialogs/drawers (`Sheet`) already provide `sr-only` title/description
  and a labeled close control.

## Known limitations / TODOs
- No comprehensive assistive-technology (screen reader) testing pass has
  been run across the full authenticated application — this pass fixed
  concretely identified gaps, it did not perform an exhaustive audit of
  every screen.
- Data-dense surfaces (Team pitch, draft board) are visually complex and
  would benefit from a dedicated screen-reader-specific pass in a future
  iteration.
- Color-contrast was not independently re-measured against WCAG
  thresholds in this pass; the existing dark theme's token palette
  (`src/app/globals.css`) was designed with contrast in mind but hasn't
  been formally verified here.

## Reporting a barrier
`/accessibility` directs users to `robert@quinterodigital.com`.
