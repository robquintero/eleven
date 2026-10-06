# League spectator views

`/team` and `/matchup` keep the manager's own workflows. UUID routes
`/team/[teamId]` and `/matchup/[matchupId]` share their existing presentation.
League standings link to teams; every competition/archive matchup links to its
canonical matchup. `/league?round=[roundId]` selects an existing league round,
including previous seasons, without changing current-season records or standings.

The authenticated selected league is resolved against real memberships. Target
reads additionally filter by that league, using the ordinary request client and
existing RLS. Foreign, missing and malformed targets fail closed. Matchup reads
also verify the embedded round and both teams belong to the selected league.
No schema, RLS, write grants or gameplay policies change.

Own matchups retain own-team-left ordering. Neutral matchups use stored home-left
ordering. Both team identities link to their canonical roster; closed and future
round links include `?round=[roundId]`. Own current team links use editable `/team`.
An owner UUID without explicit round redirects there; an explicit-round team view
is read-only even for the owner.

Spectator team rows open the existing Player Inspector. Editing controls are not
rendered and mutation entry points are guarded. Historical views start from stored
round slots, never fall back to today's XI, and retain locked entries after roster
moves. Historical bench records can be incomplete because released unlocked slots
are not a complete roster snapshot. Current catalog identity/club details may have
changed. Individual round analytics use the round's pinned model and each roster
entry's acquisition cutoff; official matchup totals always use stored final scores.
There is no reconstruction or write of historical fantasy results.

Missing team score rows display an em dash. Pending results show stored points and
no winner; only final results with both official scores declare a winner/draw.
Empty rounds and lineups remain empty. BYE is inferred only from a complete odd-team
pairing under the existing scheduler, never from an incomplete or absent schedule.
There is no independent historical team-membership snapshot to reconstruct a bye
if the retained team set no longer describes that round.

Reads remain bounded by league/round/player IDs, with shared batched score and
fixture enrichment; no per-player reads, render repairs, provider calls or refreshes
are introduced. Competition data adds one metadata query for real rounds and one
selected-round query only when opening an older season. Existing loading boundaries,
streamed secondary content and native Link pending feedback remain in place.

## Offline verification

- `npm test` includes spectator queries, routes, presentation, historical context,
  query counts and embedded PostgreSQL tests using all existing migrations/RLS.
  Production integration guards remain enabled.
- `ELEVEN_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/spectator-browser.mjs`
  checks real shared UI at 1440/375/320 in light/dark themes, long names, keyboard
  navigation, read-only Inspector access and empty lineups. It blocks all network
  requests and substitutes server actions only in its temporary test bundle.
- `scripts/performance-2-browser.mjs` continues to verify own-team optimistic swaps,
  deterministic rollback and stable canonical confirmation.

Production smoke is read-only: League → another matchup → both teams, standings →
another team, own Team/Matchup, and a historical final where available. Do not use
production substitutions, roster operations, provider ingestion or league deletion
as a spectator smoke test.
