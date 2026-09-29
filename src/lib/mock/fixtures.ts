import type { RoundFixture } from "@/lib/types/fantasy";

/**
 * Round 05 fixtures. States are kept consistent with the per-player
 * `fixture` data in `mock/team.ts`: Bastoni/Hernández/Leão's shared INT–MIL
 * fixture is "live" here too; Rüdiger/Bellingham/Mbappé's RMA–SEV fixture
 * (kicked off right at the lineup deadline) is shown at "ht". Everything
 * else is still "scheduled". A few background fixtures with no rostered
 * player round out the "matches complete" count.
 */
export const roundFixtures: RoundFixture[] = [
  {
    id: "fx_int_mil",
    homeClub: "INT",
    awayClub: "MIL",
    kickoff: "2026-10-03T16:30:00.000Z",
    state: "live",
    homeScore: 2,
    awayScore: 1,
    minute: 63,
    featuredPlayer: { name: "Bastoni", points: 6 },
  },
  {
    id: "fx_rma_sev",
    homeClub: "RMA",
    awayClub: "SEV",
    kickoff: "2026-10-04T11:15:00.000Z",
    state: "ht",
    homeScore: 1,
    awayScore: 0,
    featuredPlayer: { name: "Bellingham", points: 16 },
  },
  {
    id: "fx_mci_bha",
    homeClub: "MCI",
    awayClub: "BHA",
    kickoff: "2026-10-03T11:30:00.000Z",
    state: "scheduled",
  },
  {
    id: "fx_liv_eve",
    homeClub: "LIV",
    awayClub: "EVE",
    kickoff: "2026-10-03T14:00:00.000Z",
    state: "scheduled",
  },
  {
    id: "fx_tot_ars",
    homeClub: "TOT",
    awayClub: "ARS",
    kickoff: "2026-10-04T15:30:00.000Z",
    state: "scheduled",
  },
  {
    id: "fx_bay_bvb",
    homeClub: "BAY",
    awayClub: "BVB",
    kickoff: "2026-10-03T16:30:00.000Z",
    state: "scheduled",
  },
  {
    id: "fx_om_psg",
    homeClub: "OM",
    awayClub: "PSG",
    kickoff: "2026-10-04T19:00:00.000Z",
    state: "scheduled",
  },
  {
    id: "fx_bar_val",
    homeClub: "BAR",
    awayClub: "VAL",
    kickoff: "2026-10-04T19:00:00.000Z",
    state: "scheduled",
  },
  {
    id: "fx_b04_rbl",
    homeClub: "B04",
    awayClub: "RBL",
    kickoff: "2026-10-03T13:30:00.000Z",
    state: "scheduled",
  },
  {
    id: "fx_juv_nap",
    homeClub: "JUV",
    awayClub: "NAP",
    kickoff: "2026-10-03T09:00:00.000Z",
    state: "final",
    homeScore: 2,
    awayScore: 1,
  },
  {
    id: "fx_atl_bil",
    homeClub: "ATL",
    awayClub: "BIL",
    kickoff: "2026-10-03T09:00:00.000Z",
    state: "final",
    homeScore: 0,
    awayScore: 0,
  },
  {
    id: "fx_lei_whu",
    homeClub: "LEI",
    awayClub: "WHU",
    kickoff: "2026-10-03T09:00:00.000Z",
    state: "final",
    homeScore: 1,
    awayScore: 3,
  },
];
