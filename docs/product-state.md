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

**Pass 10 update**: the draft engine (`start_draft`/`make_draft_pick`,
`supabase/migrations/20260930024807_draft_engine.sql`) is real, so
`DRAFTING`/`ACTIVE` are now genuinely reachable — a full league (real
manager count) whose commissioner starts the draft reaches `DRAFTING`
immediately, and `ACTIVE` once every team's roster is complete. No
lifecycle column changed shape to make this true, exactly as this
section originally predicted.

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
  invite code (commissioners only). **Pass 10**: once the league is full
  (`READY_FOR_DRAFT`), a real commissioner-only "Start draft" button
  replaces the old permanent "DRAFT: NOT YET AVAILABLE" copy.

## Screen-by-screen truthful states

| Screen | Real/derived source | Empty state |
|---|---|---|
| Home | `getUserLeagues`, `getUserSquad`, `getCurrentMatchup`, `getStandings`, `getRecentActivity` | No league → onboarding. Not active → `LeagueStatusPanel`. Matchup/standings/activity render their own "not scheduled/no results yet/no activity yet" branch until a real round/result/transaction exists. |
| Team | `getUserTeamInLeague`, `getUserSquad` | No league → onboarding. Pre-draft → "NO SQUAD," 0 starters/bench. **Pass 10**: once drafted, a real "Edit lineup" control persists real swaps via `swapLineupAction` — locked slots and invalid formations are rejected server-side, never silently accepted or silently no-op'd. |
| Draft | `getDraftStatus`, `getDraftState` (**Pass 10, new screen**) | `WAITING_FOR_MANAGERS`/`READY_FOR_DRAFT` → a `ComingSoon` gate (with a real, commissioner-only "Start draft" button once the league is full). `DRAFTING` → the real draft room: real available players, real turn/timer, real picks feed. |
| Matchup | `getCurrentMatchup` behind the league-lifecycle gate | Pre-draft/drafting → "Awaiting league draft." **Pass 10**: once `ACTIVE` with an open round, shows the real `MatchupCommand` (real opponent, real live/final points) instead of always-null. |
| Players | `getPlayerDatabase()` (`public.players`, real, server-side filtered/paginated — see `docs/football-data-system.md`) | `total: 0` and no ingestion has run anywhere → "0 PLAYERS / NO PLAYER DATA AVAILABLE." Real season PTS and Form Tracker per Pass 9. |
| League | `getLeagueDetail`, `getDraftStatus`, `getStandings`, `getRecentActivity` | Real members list, real capacity. **Pass 10**: DRAFT panel now links to the real `/draft` room once one exists; STANDINGS reflects real, tiebreak-ranked results (`src/domain/fantasy/standings.ts`) once at least one round has finalized. |

## Interaction truthfulness

- **Pass 10**: Team's lineup is now genuinely editable — the "Edit
  lineup" control persists real swaps through `swapLineupAction` →
  `updateLineup()`, which re-validates lock state and formation validity
  server-side before writing anything. This is the exact control this
  section previously said had been removed for having "no real system to
  gate" — it now does.
- The command palette's `Waivers` / `Propose Trade` / `Transactions`
  actions stay `disabled` with a `SOON` label — still correct, since
  those systems remain out of scope. `Draft Room` is no longer in that
  list: it's a real, always-enabled nav destination (`/draft`) — see
  `docs/game-rules.md` "Draft."
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
- **Draft engine (Pass 10, landed)** writes `drafts`/`draft_picks`/
  `roster_entries`/`league_player_ownership` via `start_draft`/
  `make_draft_pick` — `getUserSquad()` returns real starters/bench once
  drafted; lifecycle genuinely reaches `DRAFTING`/`ACTIVE`.
- **Round/lineup/matchup engine (Pass 10, landed)** —
  `src/lib/fantasy-engine/{rounds,lineup}.ts` writes
  `fantasy_rounds`/`lineup_slots`/`matchups`/`matchup_scores`. Home's
  round-dependent state and `getCurrentMatchup()` resolve to real data
  once a league is `ACTIVE` and has opened its first round.
- **Scoring engine (Pass 9, landed)** writes `fantasy_player_scores` —
  `getStandings()` returns real, tiebreak-ranked win/loss/points-for/
  points-against records once at least one round has finalized, instead
  of `[]`.
- **Transaction-writing systems** (waivers/trades/drops — still out of
  scope past Pass 10) will write `transactions` → `getRecentActivity()`
  stops being empty for those event types (draft picks already write
  real `transactions` rows as of Pass 10).

Pass 10 did not begin waivers, trades, FAAB, playoffs beyond basic
schedule repetition, commissioner override tooling, notifications, or a
native app — see `docs/game-rules.md` "Out of scope" and the repo's
commit history for the exact boundary.
for later.
