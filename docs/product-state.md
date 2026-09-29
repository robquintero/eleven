# Eleven — Product State (Pass 7.5)

> **PRODUCTION RUNTIME MUST NEVER FABRICATE PRODUCT STATE.**
>
> **MOCKS TEST ELEVEN. MOCKS DO NOT POWER ELEVEN.**

This document is the durable record of the rule Pass 7.5 established and
the architecture that enforces it. Read this before adding any new
data-driven surface to Eleven.

## Why this pass happened

Through Pass 7A, every primary screen (`/`, `/team`, `/players`, the
shell's status bar and command palette) ran entirely on hand-authored mock
data (`src/lib/mock/*`) regardless of whether a visitor was signed in, had
a league, or had drafted a squad. Real Supabase auth and league
creation/joining existed (Pass 6) but nothing downstream of them was
truthful — a brand-new, zero-league account saw the exact same populated
"Robert FC" fantasy dashboard as a fully set-up one. Pass 7.5 removed that
fictional layer without touching the still-deferred backend systems
(draft engine, scoring engine, football ingestion).

## PUBLIC vs AUTHENTICATED boundary

- `src/app/page.tsx` — the public landing page. Signed-out visitors land
  here; it introduces the product and links to `/login`/`/signup`, nothing
  else. A signed-in visitor is redirected to `/home`.
- `src/app/(app)/*` — the authenticated application (Home, Team, Matchup,
  Players, League). `src/app/(app)/layout.tsx` is the auth boundary: it
  checks the Supabase session server-side and `redirect("/login")`s before
  `AppShell` or any page renders. No authenticated route, or any workstation
  chrome, is ever reachable by a signed-out request.
- `src/app/(auth)/*` — `/login`, `/signup`. Chrome-free, no `AppShell`.

## Runtime mock prohibition

Every visible piece of product data comes from one of:

1. persisted Eleven data (Supabase, via `src/data-access/*`),
2. deterministic derivation from persisted data (`src/domain/fantasy/league-lifecycle.ts`, `src/lib/selectors/*`),
3. real external football data ingested into Eleven (Pass 8 — see `docs/football-data-system.md`; only a small controlled sample is ingested so far, not the full Big Five),
4. legitimate application/system metadata.

`src/lib/mock/*` (the pre-7.5 mock layer that powered every screen) was
**deleted** in this pass — nothing production imports it. `src/data/mocks/*`
remains: it is illustrative sample data proving the `src/domain/*` type
shapes are usable, explicitly documented as not wired into any screen (see
its own module doc comments), and is exempt from the "no mock" rule the
same way Pass 7A's API-Football fixtures are — **test/illustration
fixtures, not runtime data**.

`src/lib/no-runtime-mock-imports.test.ts` is the automated guard: it scans
`src/app`, `src/components`, and `src/data-access` for any import of
`@/lib/mock` or `@/data/mocks` and fails the suite if one exists. It is a
plain source scan, not a dependency-graph analyzer, by design.

## League lifecycle: persisted vs derived

`src/domain/fantasy/league-lifecycle.ts` derives one of `NO_LEAGUE` /
`WAITING_FOR_MANAGERS` / `READY_FOR_DRAFT` / `DRAFTING` / `ACTIVE` /
`COMPLETED` from data that already exists — **no new lifecycle column was
added**:

| State | Derived from |
|---|---|
| `NO_LEAGUE` | `getUserLeagues()` returns `[]` |
| `WAITING_FOR_MANAGERS` | `memberCount < maxTeams` (from `league_memberships` count vs. `fantasy_leagues.settings.maxTeams`) |
| `READY_FOR_DRAFT` | `memberCount >= maxTeams` and no `drafts` row exists |
| `DRAFTING` | a `drafts` row exists with `status = 'in_progress'` |
| `ACTIVE` | a `drafts` row exists with `status = 'completed'` |
| `COMPLETED` | `fantasy_leagues.status` is `completed`/`archived` |

Because the draft engine is Pass 8+, no league in the product today can
reach `DRAFTING`/`ACTIVE` through real data — every real league resolves to
`WAITING_FOR_MANAGERS` or `READY_FOR_DRAFT`. The states exist so the model
doesn't need to change shape once the draft engine lands.

## Active league context

`src/data-access/active-league.ts`'s `getActiveLeagueId()` resolves which
of the caller's real leagues (`getUserLeagues()`) is active: a persisted
`eleven_active_league` cookie (httpOnly, set by
`src/app/(app)/actions.ts`'s `setActiveLeagueAction`, which re-validates
membership server-side before writing it), falling back to the first
membership. `[]` leagues resolves to `null` — no active league, no
fabricated one. Switching leagues (`LeagueSwitcher`, or the League page)
re-validates and re-sets the cookie, then `revalidatePath("/", "layout")`s
so every league-scoped surface reflects the new context on next render. No
global client state — the active league is server-derived from a cookie +
a real membership check on every request.

## No-league / league-setup experience

- Zero leagues: `src/components/shell/no-league-onboarding.tsx` — "No
  active league," links to the real create/join forms on `/league`. Shown
  by Home, Team, and Matchup pages alike; never a populated dashboard.
- A league that exists but isn't `ACTIVE`:
  `src/components/dashboard/league-status-panel.tsx` on Home, and the
  `LEAGUE_STATUS` section on `/league` — real member count/capacity, real
  invite code (commissioners only), "DRAFT: NOT YET AVAILABLE."

## Screen-by-screen truthful states

| Screen | Real/derived source | Empty state |
|---|---|---|
| Home | `getUserLeagues`, `getUserSquad`, `getCurrentMatchup`, `getStandings`, `getRecentActivity` | No league → onboarding. Not active → `LeagueStatusPanel`. Matchup/standings/activity always render their own "not scheduled/no results yet/no activity yet" branch while empty. |
| Team | `getUserTeamInLeague`, `getUserSquad` | No league → onboarding. Squad empty (always, pre-draft) → "NO SQUAD," 0 starters/bench, no "Edit lineup" control (nothing to persist edits to). |
| Matchup | `getCurrentMatchup` behind the league-lifecycle gate | Pre-draft → "Awaiting league draft." Otherwise the same nullable `MatchupCommand` as Home. |
| Players | `getPlayerDatabase()` (`public.players`, real, server-side filtered/paginated — see `docs/football-data-system.md`) | `total: 0` and no ingestion has run anywhere → "0 PLAYERS / NO PLAYER DATA AVAILABLE." Once Pass 8's `football:sync` has ingested real data, the full scouting workspace (search/filter/sort/pagination/inspector) activates on it — never a mock roster. |
| League | `getLeagueDetail`, `getDraftStatus`, `getStandings`, `getRecentActivity` | Real members list, real capacity, "NOT YET AVAILABLE" draft, "NO RESULTS YET" / "NO TRANSACTIONS YET." |

## Interaction truthfulness

- Team's lineup used to be edited in local React state and presented as if
  saved. There is no persistence path for that yet (no `lineup_slots` are
  ever written), so the "Edit lineup" control and the local-mutation state
  machine were **removed**, not disabled-with-a-tooltip — the control
  didn't correspond to any real system to gate.
- The command palette's `Draft Room` / `Waivers` / `Propose Trade` /
  `Transactions` actions stay `disabled` with a `SOON` label (pre-existing,
  correct pattern) — never fake-functional.
- Player search in the command palette was removed rather than wired to an
  empty player list that would silently never match anything.

## Loading/empty/error conventions

Eleven's state grammar stays in the register DESIGN.md §10/§19 already
established: `NO ACTIVE LEAGUE`, `NO SQUAD`, `NO RESULTS YET`, `NO
ACTIVITY YET`, `NOT SCHEDULED`, `NOT YET AVAILABLE`, `NO PLAYER DATA
AVAILABLE`. No playful/SaaS empty-state copy. Every data-driven module
answers "what is true right now," never "what would this look like if
populated."

## Future systems that activate these states

- **Pass 8 (football ingestion, landed)** populates `players`/`clubs`/`fixtures`
  via `npm run football:sync` — see `docs/football-data-system.md`. Players
  stops being empty exactly where ingestion has run; `getPlayerDatabase()`'s
  shape didn't change when real rows started appearing. Full Big Five
  population is a separate, explicitly-approved future step.
- **Draft engine** writes `drafts`/`draft_picks`/`roster_entries`/
  `league_player_ownership` → `getUserSquad()` starts returning real
  starters/bench; lifecycle starts reaching `DRAFTING`/`ACTIVE`.
- **Round scheduler** writes `fantasy_rounds`/`lineup_slots` → Home's
  "NO ACTIVE ROUND" and Team's "NOT SCHEDULED" next-lock resolve to real
  data; `getCurrentMatchup()`'s shape does not change.
- **Scoring engine** writes `matchup_scores`/`fantasy_player_scores` →
  `getStandings()` starts returning real win/loss records instead of `[]`.
- **Transaction-writing systems** (waivers/trades/drops, once built) write
  `transactions` → `getRecentActivity()` stops being empty.

None of the above is implemented in this pass — see the repo's commit
history for what Pass 7.5 actually shipped versus what it deliberately left
for later.
