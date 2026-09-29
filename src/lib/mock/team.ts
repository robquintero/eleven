import type { Club, Player, Squad } from "@/lib/types/fantasy";
import { clubs as dashboardClubs, players as dashboardPlayers } from "@/lib/mock/dashboard";

export const clubs = {
  ...dashboardClubs,
  acMilan: {
    id: "clb_ac_milan",
    name: "AC Milan",
    shortName: "MIL",
    league: "serie-a",
    crestColor: "#FB090B",
  },
  leverkusen: {
    id: "clb_leverkusen",
    name: "Bayer Leverkusen",
    shortName: "B04",
    league: "bundesliga",
    crestColor: "#E32221",
  },
} as const satisfies Record<string, Club>;

const starters = {
  alisson: {
    ...dashboardPlayers.alisson,
    availability: "available",
    fixture: {
      opponent: "EVE",
      isHome: true,
      kickoff: "2026-10-03T14:00:00.000Z",
      state: "upcoming",
    },
    recentForm: [4, 6, 3, 5],
  },
  hakimi: {
    ...dashboardPlayers.hakimi,
    availability: "available",
    fixture: {
      opponent: "OM",
      isHome: false,
      kickoff: "2026-10-04T19:00:00.000Z",
      state: "upcoming",
    },
    recentForm: [6, 5, 8, 9],
  },
  vanDijk: {
    ...dashboardPlayers.vanDijk,
    availability: "available",
    fixture: {
      opponent: "EVE",
      isHome: true,
      kickoff: "2026-10-03T14:00:00.000Z",
      state: "upcoming",
    },
    recentForm: [8, 7, 9, 6],
  },
  bastoni: {
    ...dashboardPlayers.bastoni,
    availability: "doubtful",
    fixture: {
      opponent: "MIL",
      isHome: true,
      kickoff: "2026-10-03T16:30:00.000Z",
      state: "live",
    },
    recentForm: [5, 4, 6, 3],
  },
  rudiger: {
    ...dashboardPlayers.rudiger,
    availability: "available",
    fixture: {
      opponent: "SEV",
      isHome: true,
      kickoff: "2026-10-04T11:15:00.000Z",
      state: "locked",
    },
    recentForm: [7, 6, 8, 8],
  },
  bellingham: {
    ...dashboardPlayers.bellingham,
    availability: "available",
    fixture: {
      opponent: "SEV",
      isHome: true,
      kickoff: "2026-10-04T11:15:00.000Z",
      state: "locked",
    },
    recentForm: [12, 9, 15, 11],
  },
  musiala: {
    ...dashboardPlayers.musiala,
    availability: "available",
    fixture: {
      opponent: "BVB",
      isHome: true,
      kickoff: "2026-10-03T16:30:00.000Z",
      state: "upcoming",
    },
    recentForm: [10, 8, 14, 9],
  },
  saka: {
    ...dashboardPlayers.saka,
    availability: "available",
    fixture: {
      opponent: "TOT",
      isHome: false,
      kickoff: "2026-10-04T15:30:00.000Z",
      state: "upcoming",
    },
    recentForm: [9, 11, 7, 10],
  },
  haaland: {
    ...dashboardPlayers.haaland,
    availability: "available",
    fixture: {
      opponent: "BHA",
      isHome: true,
      kickoff: "2026-10-03T11:30:00.000Z",
      state: "upcoming",
    },
    recentForm: [16, 22, 11, 18],
  },
  mbappe: {
    ...dashboardPlayers.mbappe,
    availability: "available",
    fixture: {
      opponent: "SEV",
      isHome: true,
      kickoff: "2026-10-04T11:15:00.000Z",
      state: "locked",
    },
    recentForm: [13, 15, 10, 17],
  },
  dembele: {
    ...dashboardPlayers.dembele,
    availability: "available",
    fixture: {
      opponent: "OM",
      isHome: false,
      kickoff: "2026-10-04T19:00:00.000Z",
      state: "upcoming",
    },
    recentForm: [11, 8, 13, 10],
  },
} as const satisfies Record<string, Player>;

const bench = {
  ederson: {
    id: "plr_ederson",
    externalId: "prov_00512",
    name: "Ederson",
    club: clubs.manCity,
    position: "GK",
    number: 31,
    fantasyPoints: 0,
    availability: "available",
    fixture: {
      opponent: "BHA",
      isHome: true,
      kickoff: "2026-10-03T11:30:00.000Z",
      state: "upcoming",
    },
    recentForm: [5, 3, 6, 4],
  },
  theoHernandez: {
    id: "plr_theo_hernandez",
    externalId: "prov_00733",
    name: "Theo Hernández",
    club: clubs.acMilan,
    position: "DEF",
    number: 19,
    fantasyPoints: 0,
    availability: "available",
    fixture: {
      opponent: "INT",
      isHome: false,
      kickoff: "2026-10-03T16:30:00.000Z",
      state: "live",
    },
    recentForm: [6, 7, 5, 8],
  },
  pedri: {
    id: "plr_pedri",
    externalId: "prov_01098",
    name: "Pedri",
    club: clubs.barcelona,
    position: "MID",
    number: 8,
    fantasyPoints: 0,
    availability: "available",
    fixture: {
      opponent: "VAL",
      isHome: true,
      kickoff: "2026-10-04T19:00:00.000Z",
      state: "upcoming",
    },
    recentForm: [9, 10, 8, 12],
  },
  wirtz: {
    id: "plr_wirtz",
    externalId: "prov_01266",
    name: "Florian Wirtz",
    club: clubs.leverkusen,
    position: "MID",
    number: 10,
    fantasyPoints: 0,
    availability: "injured",
    fixture: {
      opponent: "RBL",
      isHome: true,
      kickoff: "2026-10-03T13:30:00.000Z",
      state: "upcoming",
    },
    recentForm: [11, 13, 7, 9],
  },
  leao: {
    id: "plr_leao",
    externalId: "prov_00877",
    name: "Rafael Leão",
    club: clubs.acMilan,
    position: "FWD",
    number: 17,
    fantasyPoints: 0,
    availability: "suspended",
    fixture: {
      opponent: "INT",
      isHome: false,
      kickoff: "2026-10-03T16:30:00.000Z",
      state: "live",
    },
    recentForm: [8, 6, 10, 5],
  },
} as const satisfies Record<string, Player>;

export const squad: Squad = {
  formation: "4-3-3",
  starters: [
    { id: "slot_gk", position: "GK", x: 50, y: 10, player: starters.alisson },
    { id: "slot_def_1", position: "DEF", x: 12, y: 28, player: starters.rudiger },
    { id: "slot_def_2", position: "DEF", x: 38, y: 28, player: starters.vanDijk },
    { id: "slot_def_3", position: "DEF", x: 62, y: 28, player: starters.bastoni },
    { id: "slot_def_4", position: "DEF", x: 88, y: 28, player: starters.hakimi },
    { id: "slot_mid_1", position: "MID", x: 25, y: 54, player: starters.musiala },
    { id: "slot_mid_2", position: "MID", x: 50, y: 58, player: starters.bellingham },
    { id: "slot_mid_3", position: "MID", x: 75, y: 54, player: starters.saka },
    { id: "slot_fwd_1", position: "FWD", x: 18, y: 78, player: starters.dembele },
    { id: "slot_fwd_2", position: "FWD", x: 50, y: 84, player: starters.haaland },
    { id: "slot_fwd_3", position: "FWD", x: 82, y: 78, player: starters.mbappe },
  ],
  bench: [bench.ederson, bench.theoHernandez, bench.pedri, bench.wirtz, bench.leao],
};

/** Flat roster — starters + bench — used for search surfaces like the command palette. */
export const allPlayers: Player[] = [
  ...squad.starters.map((slot) => slot.player),
  ...squad.bench,
];
