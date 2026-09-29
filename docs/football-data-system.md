# Eleven — Football Data System (Pass 8)

This document covers the real football-data ingestion pipeline: how
API-Football data becomes Eleven's own canonical rows, how it stays
idempotent and quota-safe, and how the Players workspace reads it. See
`docs/architecture.md` for where this sits in the overall layering and
`docs/product-state.md` for the "never fabricate product state" rule this
pipeline exists to satisfy truthfully (real data, not mock data).

> **The provider is not Eleven's database.** API-Football IDs are never
> canonical. Every canonical row is an Eleven UUID; every provider
> identifier lives in `provider_mappings`, resolved once and reused.

## Pipeline

```
API-Football (v3.football.api-sports.io)
  ↓  src/lib/football-providers/api-football/client.ts     (Pass 7A — HTTP, auth, quota, errors)
  ↓  src/lib/football-providers/api-football/adapter.ts     (Pass 7A/8 — raw JSON → Normalized* contracts)
  ↓  src/lib/football-ingestion/identity.ts                 (Pass 8 — provider_mappings resolution)
  ↓  src/lib/football-ingestion/sync-*.ts                   (Pass 8 — reconcile + write canonical rows)
  ↓  Supabase (competitions/clubs/players/fixtures/player_match_stats/provider_mappings)
  ↓  src/data-access/players.ts                             (real reads, server-side filtered/paginated)
  ↓  Players workspace UI
```

Nothing downstream of `sync-*.ts` ever sees a provider ID format or raw
provider JSON again — see `src/lib/football-providers/types.ts`'s module
comment for the `Normalized*` boundary this was already true of in Pass
7A.

## Provider boundary (unchanged from Pass 7A, now actually used)

- `API_FOOTBALL_KEY` is read once, lazily, in `api-football/config.ts`.
  Server-only, never `NEXT_PUBLIC_`, never logged.
- `src/lib/football-providers/api-football/types.ts` (raw provider JSON
  shapes) is never imported outside that folder.
- `src/lib/football-ingestion/*` is the **only** code that calls the
  provider client. `src/lib/no-provider-imports-in-app.test.ts` fails the
  suite if `src/app`, `src/components`, or `src/data-access` ever import
  the provider client, its raw types, the ingestion layer, or the admin
  Supabase client — see "UI reads Supabase only" below.

## The admin (service-role) Supabase client

Every football table's RLS policy is **read-only** for `authenticated`
(see `supabase/migrations/20260929141143_rls.sql`) — writing
competitions/clubs/players/fixtures/player_match_stats/provider_mappings
requires `service_role`. `src/lib/supabase/admin.ts` is the one privileged
client in the codebase, reading `SUPABASE_SECRET_KEY` (or
`SUPABASE_SERVICE_ROLE_KEY` for compatibility) from the environment —
never `NEXT_PUBLIC_`, never committed, never printed by any script here.
It is used **exclusively** by `src/lib/football-ingestion/*` (the CLI). If
that key isn't in `.env.local`, every `npm run football:sync` command
fails fast with a clear message rather than silently doing nothing.

## The `service_role` grants gotcha

Live validation against the real project immediately hit `permission
denied for table competitions` on the very first write — `service_role`
bypasses RLS by design, but (like `authenticated` before it, see
`20260929150824_grant_authenticated_privileges.sql`) still needs base
table-level GRANTs first, and every table here was created via SQL
migration rather than Studio, so those grants were never applied
automatically. `20260929200914_grant_service_role_privileges.sql` fixes
this the same way, granted broadly (all tables/sequences/functions, plus
default privileges for future ones) since `service_role` is the one
fully-trusted backend role every future engine (draft, waivers, trades,
scoring) will also need unrestricted access through.

## Provider/data limitations discovered

Live validation surfaced one real provider-plan constraint not visible
from fixtures/docs alone: **the account's current plan only serves
`/teams`, `/players`, and `/fixtures` data for seasons 2022–2024** — a
2026 request to those endpoints (season resolved as "current" by
`/leagues`, which has no such restriction) returned `"Free plans do not
have access to this season, try from 2022 to 2024."` and zero data. This
is an account/plan limitation, not a bug in Eleven's ingestion code — the
provider boundary already isolates it cleanly: the error surfaces as a
normal `SyncResult.errors` entry, and nothing crashes or fabricates data.

`syncCompetition()` gained an optional `seasonOverride` parameter
(CLI: `--season`) specifically so a competition's `clubs`/`players`/
`fixtures` syncs can be pinned to a season the account can actually pull,
independent of whichever season `/leagues` reports as current. The
production default (`providerSeason: 2026` in `big-five-competitions.ts`)
is untouched — this is a per-sync override, not a config change — and
becomes moot the moment the account's plan (or the calendar) makes 2026
data available.

## Canonical identity: `provider_mappings`

`provider_mappings` (`provider`, `internal_entity_type`, `internal_entity_id`,
`external_id`) is the only place a provider ID format appears. Two
identity patterns are used, depending on whether the entity already has a
natural unique key:

- **Competitions and clubs** have one (`competitions.code`;
  `clubs.(competition_id, code)`). They're upserted by that key directly
  (idempotent by the DB constraint itself), and `provider_mappings` is
  backfilled afterward for whichever rows don't have a mapping yet.
- **Players and fixtures** have no natural unique key — by design (brief
  §12: a player's identity must survive a club transfer; a fixture has no
  business key besides the provider's own ID). Create-vs-update is decided
  by `src/lib/football-ingestion/reconcile.ts`'s `planReconciliation()`: it
  takes the normalized batch plus whatever `provider_mappings` already
  resolves, and returns exactly two lists — `toCreate` and `toUpdate` (with
  the resolved internal UUID). This is pure and unit-tested
  (`reconcile.test.ts`), including the specific "same provider id, new
  club" transfer scenario.

**Player identity survives a club change** because `sync-players.ts`
always looks the player up by `provider_mappings` first: if found, it
`UPDATE`s that existing row's `club_id` (and other fields) in place; it
never creates a second `players` row for a provider ID it already knows.

## Season resolution

`competitions.season` (added in `20260929193838_football_season_and_stats.sql`)
records which provider season a competition's currently-ingested
clubs/players reflect — set by `sync competitions` via the same
current-season resolution Pass 7A already built
(`resolveCurrentSeason()`/the season-picking logic inlined in
`normalizeCompetition()`: prefer whatever the provider marks `current`,
fall back to the Big Five config's best-known default). `clubs`/`players`
syncs read this column rather than re-resolving the season on every call,
so it's explicit which season a competition's roster represents — never
silently mixed.

`fixtures.season` is set explicitly and independently per fixture (from
the same resolved season), because a fixture — unlike a competition —
genuinely belongs to exactly one season; it's never inferred from
`kickoff_at` at read time.

## Timezone strategy

Every `kickoff_at` is stored as UTC (`timestamptz`), exactly matching
`docs/domain-model.md`'s existing timestamp convention. Localized
presentation is a UI-layer concern (`Intl.DateTimeFormat`,
`src/lib/team-fixture.ts`), never a stored value.

## Multiple fixtures per fantasy round

Nothing in this pass's schema or ingestion code assumes "one player = one
fixture per fantasy round." `fixtures` has no relationship to
`fantasy_rounds` at all yet — a fantasy round's eligible fixtures are a
future (Pass 9+) many-to-many concern, deliberately left unconstrained
here so domestic + cup + European fixtures (or a genuine double-fixture
week) can all belong to the same round later without a schema change.
`player_match_stats` is keyed `(player_id, fixture_id)` — a player can have
any number of stat rows across any number of fixtures, with no assumption
that they land in disjoint rounds.

## Idempotency

Running any `sync-*` command twice must never duplicate a row. Mechanisms,
by entity:

| Entity | Idempotency mechanism |
|---|---|
| `competitions` | UNIQUE `code`, upsert by that key |
| `clubs` | UNIQUE `(competition_id, code)`, upsert by that key |
| `players` | No natural key — `provider_mappings` + `planReconciliation()` |
| `fixtures` | No natural key — `provider_mappings` + `planReconciliation()` |
| `player_match_stats` | UNIQUE `(player_id, fixture_id)`, upsert by that key |
| `provider_mappings` itself | UNIQUE `(provider, internal_entity_type, external_id)` and `(provider, internal_entity_type, internal_entity_id)` — only ever inserted for an external id `getExistingMappings` didn't already resolve |

Covered by `reconcile.test.ts` (create-vs-update decisions, including
"running the same sync twice never re-creates an already-mapped item") and
`adapter.test.ts` (normalization is pure and deterministic).

## Quota / rate-limit strategy

- Every `sync-*` operation makes **exactly one** provider request (the
  `competitions` operation with no `--code` makes one *per enabled
  competition*, sequentially, checking quota between each).
- `src/lib/football-ingestion/quota.ts`'s `shouldStopForQuota()` — pure,
  unit-tested — stops a multi-request loop (currently only the
  all-competitions case) once daily-remaining is at or below a 1-request
  safety margin, or per-minute remaining hits zero. `undefined` quota
  fields never trigger a stop (the provider didn't report a figure, that's
  not the same as zero — see `ProviderQuota`'s own doc comment).
- `ApiFootballRateLimitError` (HTTP 429) is caught at the CLI's top level
  and stops the run cleanly — no retry loop.
- **No ingestion ever runs on page load, app boot, build, login, or a
  Players page visit.** It only runs via `npm run football:sync -- <op>
  [flags]`, a manually-invoked developer command — see
  `src/lib/football-ingestion/cli.ts`'s own module doc comment.

## Bounded, resumable development sync

Every operation is scoped to one competition/club/fixture-page/fixture at
a time — there is no "sync everything" command. Recommended low-quota
sequence to populate a small sample (see the Pass 8 final report for the
actual requests spent validating this):

```
npm run football:sync -- competitions --code ENG --season 2023   # 1 request (--season only needed if your plan restricts the current season — see below)
npm run football:sync -- clubs --code ENG                        # 1 request
npm run football:sync -- players --code ENG --club MCI           # 1 request (one page, one club)
npm run football:sync -- fixtures --code ENG --from 2023-08-11 --to 2023-08-20   # 1 request
npm run football:sync -- fixture-stats --fixture 1035037         # 1 request, only for a FINAL fixture
```

Add `--page 2` to `players`/`fixtures` to continue a paginated sync later
— nothing loops pages automatically. Re-running any command is safe
(idempotent) and will reconcile rather than duplicate. This exact sequence
is what Pass 8's live validation ran — see the Pass 8 final report for the
actual result counts.

## Sync observability

Every `sync-*` call's result (`SyncResult`: created/updated/skipped/failed
counts, requests used, quota, pagination, errors — never hidden partial
failure) is printed by the CLI and recorded as a `domain_events` row
(`src/lib/football-ingestion/record-sync-event.ts`, `event_type:
"FOOTBALL_SYNC_<OPERATION>"`) rather than a new sync-state table — see
`docs/product-state.md`-style reasoning: `domain_events` is already
exactly "an append-only log of meaningful actions." These rows have
`league_id: null` (a sync isn't league-scoped), so they're only readable
via the service-role admin client today — there is no sync-history UI in
this pass.

## Future scheduled sync

Nothing here is wired to a cron/schedule yet — brief §19 asks only that
the architecture make this straightforward later, not that it exist now.
A future scheduled job would call the exact same `sync-*.ts` functions
this CLI calls (`syncCompetition`, `syncClubs`, `syncPlayersForClub`,
`syncFixtures`, `syncFixtureStats`) from a scheduled trigger instead of
`process.argv`, reusing `createAdminClient()` and every idempotency/quota
guarantee unchanged. No logic would need to move or duplicate.

## UI reads Supabase only

Opening `/players`, `/team`, `/home`, `/matchup`, or `/league` never calls
API-Football, regardless of how many users open them simultaneously.
`src/data-access/players.ts` is the only read path the Players workspace
uses, and it queries Supabase directly. Enforced by
`src/lib/no-provider-imports-in-app.test.ts`.

## Players workspace performance

`getPlayerDatabase()` filters, sorts, and paginates **in the Supabase
query** — position/competition/club/availability/ownership are all
`.eq()`/`.in()` filters, search is `.ilike()`, sort is `.order()` (on
`players.name` or the joined `clubs.short_name`), and results are
`.range()`-limited (default page size 50). The Players page passes the
current filters/page through the URL (`src/lib/players-filters.ts`'s
`parseFiltersFromSearchParams`/`filtersToSearchParams` — pure, unit-tested,
round-trip-tested), so every filter/sort/page change is a real navigation
that re-runs the server query, never a client-side re-filter of an
already-fetched array. `players.club_id`/`players.competition_id` already
had indexes from Pass 7A; `fixtures (competition_id, season)` got one in
this pass's migration.

## Stats deliberately not modeled

`player_match_stats` gained exactly one new column this pass (`started`,
for the workspace's STARTS/start-rate analytics — genuinely available via
the provider's `games.substitute` field). Everything else the provider's
`/fixtures/players` endpoint returns — rating, total shots (vs. shots on
target), passes/pass accuracy, duels, dribbles, fouls, penalty events — is
**not** mapped or persisted this pass. Reasons: (1) most of it has no
consumer yet (no scoring engine, no analytics view asks for it), (2)
adding unused columns "just in case" is exactly what `docs/architecture.md`
"No enterprise cosplay" warns against, (3) it can be added additively,
field by field, the moment a real feature needs it, without touching
anything already ingested. `src/lib/football-providers/api-football/types.ts`'s
`ApiFootballFixturePlayerStats` intentionally only declares the fields
`adapter.ts` actually reads, same convention Pass 7A established.

## Scouting analytics — implemented vs. deferred

**Implemented**: `src/lib/selectors/usage-trend.ts`'s `getUsageTrend()` —
pure, unit-tested — turns a player's real recent `player_match_stats` rows
(via `getPlayerRecentMatches()`) into a minutes-per-match series, average
minutes, starts, and start rate. Renders as "INSUFFICIENT MATCH DATA" with
zero match history, never a guessed trend. This is what powers the Player
Inspector's "Recent_usage" section — see brief §23's "Availability /
Minutes Trend."

**Deferred: Market Risers.** A cross-player "who's trending up" ranking
needs real match-history depth to mean anything — with the small,
intentionally bounded sample this pass validates against (one club, one
date range, one fixture's stats), any such ranking would be noise from an
n≈1 sample, not signal. The underlying data/selector
(`getPlayerRecentMatches` + `getUsageTrend`) is already real and ready;
building the ranking view is deferred until real match history
accumulates via further `football:sync` runs, per brief §23's own
"defer and document why" allowance.

**Deferred: Production × Minutes.** Optional per brief §25; not built this
pass for the same reason (insufficient real data volume yet to be useful
rather than decorative) — revisit once fixture/stat history is deeper.

**Not built: Form Tracker.** Explicitly Pass 9 (brief §24) — it's Eleven
fantasy production over recent rounds, which requires the scoring engine.
This pass only prepares the real recent-match data/selectors it will need.

## Fantasy scoring is intentionally absent

Nothing in this pass computes an Eleven fantasy point. `players.ts`'s
`Player.fantasyPoints` stays `0` for every real player (an honest "not yet
computed" default, not a guess). `player_match_stats` holds raw,
unweighted football stats only — see `docs/data-flow.md` "Real stats →
Eleven scoring," which remains Pass 9's job.

## Testing

Automated tests never touch the live provider or a live database —
`api-football/__fixtures__/*.json` (Pass 7A's sanitized fixtures, plus
this pass's `fixture-players.json`) and in-memory maps/arrays are the only
inputs `npm test` uses. Covered: normalization (adapter.test.ts, including
the new `/fixtures/players` mapping), reconciliation/idempotency/duplicate
prevention/player-identity-survives-club-change (reconcile.test.ts), quota
stop / pagination-continuation logic (quota.test.ts), the usage-trend
selector (usage-trend.test.ts), and the Players URL↔filters mapping
(players-filters.test.ts). The two architecture guards
(`no-runtime-mock-imports.test.ts`, `no-provider-imports-in-app.test.ts`)
assert the runtime-mock and provider-isolation rules by source scan.

Live database writes (the actual `sync-*.ts` Supabase calls) are not unit
tested, consistent with this codebase's existing convention that
Supabase-touching `data-access`/write code is exercised manually rather
than mocked — see the Pass 8 final report's "Controlled live validation"
section for what was actually run against the real project.
