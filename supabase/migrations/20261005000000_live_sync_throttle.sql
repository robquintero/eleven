-- Gate 1 finding (Pass 14 go-live): the live-sync cron's own
-- `suggestedIntervalMinutes` (sync-cadence.ts) was never actually
-- enforced anywhere -- every fixture within its "approaching kickoff" or
-- "recently final" window got re-synced on literally every one-minute
-- tick, for the full duration of that window (up to ~22 hours of
-- redundant per-minute `GET /fixtures/players` calls per finished
-- fixture). A single real Big Five matchday was calculated to cost
-- ~16,000+ provider requests against the 7,500/day budget this way --
-- over double the daily allowance from ONE league's ONE day, before any
-- international load. This column is the durable state (a Vercel cron
-- invocation has no in-memory state between ticks) needed to actually
-- throttle to the already-intended interval. See
-- src/domain/football/sync-cadence.ts's `isDueForSync` and
-- src/lib/football-ingestion/live-sync.ts.
alter table public.fixtures
  add column last_live_sync_at timestamptz null;
