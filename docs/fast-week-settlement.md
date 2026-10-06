# Fast week settlement and pending results

The Tuesday 06:00 UTC calendar, kickoff ownership, acquisition cutoffs,
individual locks and V4 weights are unchanged.

## Why the previous result waited

Before this pass, `finalizeRoundIfReady` required the persisted round to
have ended, then inspected every fixture in its window. Each fixture had
to be postponed or final **and** have `determineFixtureSyncCadence` report
`settled`. That ingestion helper intentionally returns
`recently-final-reconciliation` until **more than 24 hours after kickoff**.
The October 6 02:00 UTC fixture therefore delayed all three old Round 1s
until after October 7 02:00 UTC, despite already being final and having no
participating starters. This was a time gate shared with ingestion, not a
stale Tuesday-midnight calendar rule. Fixture status and the existing V4
score/provenance triggers were separate correctness gates.

League selected the newest unfinished week and only FINAL recent results.
Consequently the closed previous week appeared in neither list. Its stored
scores were never deleted.

## Revised authoritative path

`finalizeRoundIfReady` now reads trusted settlement readiness, validates
known performances with the existing unchanged scorer and pure provider
adapter, then invokes `settle_fantasy_round` with an evidence digest.

`get_round_settlement_readiness` defines the single grace constant:
**persisted `ends_at` + 60 minutes**. At exactly 07:00 UTC a normal week can
settle; the existing minute cron provides the next opportunity. Only
eligible fixtures relevant to starters block settlement. Shared club and
national-team participation rules plus known stat/score provenance cover
international fixtures and recorded appearances after transfers. Each
appearance retains its own acquisition cutoff and pinned scoring version.

Required evidence:

- Relevant fixtures are final or postponed.
- For V4, a full final player envelope includes both mapped participants,
  populated player arrays and no provider error. A starter absent from
  that complete envelope can genuinely have no appearance/points.
- Known/reported appearances have normalized stats, captured GK/DEF/MID/FWD
  scoring position and a finite score under the round's pinned version.
- The unchanged scorer reproduces each score from stored stats and, for
  V4, the latest archived provider counts. This detects both archive→stats
  and stats→score ingestion gaps without unreliable timestamp inference.
  Optional/inapplicable null counts remain valid; strict V4 completeness
  is not a gate.
- Both matchup score sides exist. A team with roster entries cannot lose
  its entire round lineup silently. Truly empty rosters retain zero-score
  behavior. Mixed partial settlement is rejected.

Missing required evidence leaves results PENDING. The existing centralized
reconciliation and `progressSeason` loop keep processing all unfinished
rounds. User requests never perform settlement, ingestion or provider work.

The private service-role-only RPC acquires the existing scoring advisory
lock, locks the round/matchups/scores, and briefly holds evidence tables in
SHARE mode while rechecking readiness and the exact digest. It computes
both team totals from stored eligible pinned-version scores and commits
score sides, FINAL matchup status, completed round status and existing
finalization events together. Errors roll back the entire publication;
retries observe completion without duplicating events. Existing settled
score, matchup and round guard definitions are unchanged. Standings,
W/L/D and PF/PA remain derived exclusively from FINAL results.

The additive migration creates only these two trusted functions and grants;
creation/redeployment itself updates no competition data.

## Presentation and cadence

One presentation helper/status component distinguishes UPCOMING, ACTIVE,
LIVE, PENDING and FINAL. League keeps **all** closed pending matchups visible
alongside up to five recent finalized results, including real stored scores
and UTC round dates. Pending results add no official winner, record or
standings effect. Missing scores render as missing, not fabricated zero.
Closed rows do not link to the unrelated current-matchup route; there is
no historical matchup-by-id route yet. Home/Matchup, round windows and the
shell use the same pending/final meaning.

`vercel.json` is unchanged: live-sync plus season progression **every
minute**, catalog refresh daily at 06:00 UTC. Provider cadence/throttling
and raw archive semantics are unchanged. Ingestion can continue correcting
player analytics in its existing 24-hour window after official fantasy
publication; settled results do not follow those corrections.
