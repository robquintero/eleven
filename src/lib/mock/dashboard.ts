import type {
  ActivityItem,
  Club,
  FantasyLeague,
  FantasyRound,
  FantasyTeam,
  Matchup,
  Player,
  StandingsEntry,
} from "@/lib/types/fantasy";

export const clubs = {
  liverpool: {
    id: "clb_liverpool",
    name: "Liverpool",
    shortName: "LIV",
    league: "premier-league",
    crestColor: "#C8102E",
  },
  manCity: {
    id: "clb_man_city",
    name: "Manchester City",
    shortName: "MCI",
    league: "premier-league",
    crestColor: "#6CABDD",
  },
  arsenal: {
    id: "clb_arsenal",
    name: "Arsenal",
    shortName: "ARS",
    league: "premier-league",
    crestColor: "#EF0107",
  },
  realMadrid: {
    id: "clb_real_madrid",
    name: "Real Madrid",
    shortName: "RMA",
    league: "la-liga",
    crestColor: "#FEBE10",
  },
  barcelona: {
    id: "clb_barcelona",
    name: "Barcelona",
    shortName: "BAR",
    league: "la-liga",
    crestColor: "#A50044",
  },
  bayern: {
    id: "clb_bayern",
    name: "Bayern Munich",
    shortName: "BAY",
    league: "bundesliga",
    crestColor: "#DC052D",
  },
  dortmund: {
    id: "clb_dortmund",
    name: "Borussia Dortmund",
    shortName: "BVB",
    league: "bundesliga",
    crestColor: "#FDE100",
  },
  interMilan: {
    id: "clb_inter",
    name: "Inter Milan",
    shortName: "INT",
    league: "serie-a",
    crestColor: "#0068A8",
  },
  juventus: {
    id: "clb_juventus",
    name: "Juventus",
    shortName: "JUV",
    league: "serie-a",
    crestColor: "#1A1A1A",
  },
  psg: {
    id: "clb_psg",
    name: "Paris Saint-Germain",
    shortName: "PSG",
    league: "ligue-1",
    crestColor: "#004170",
  },
} as const satisfies Record<string, Club>;

export const players = {
  alisson: {
    id: "plr_alisson",
    externalId: "prov_00417",
    name: "Alisson Becker",
    club: clubs.liverpool,
    position: "GK",
    number: 1,
    fantasyPoints: 7,
  },
  vanDijk: {
    id: "plr_van_dijk",
    externalId: "prov_00118",
    name: "Virgil van Dijk",
    club: clubs.liverpool,
    position: "DEF",
    number: 4,
    fantasyPoints: 11,
  },
  hakimi: {
    id: "plr_hakimi",
    externalId: "prov_00922",
    name: "Achraf Hakimi",
    club: clubs.psg,
    position: "DEF",
    number: 2,
    fantasyPoints: 9,
  },
  bastoni: {
    id: "plr_bastoni",
    externalId: "prov_01187",
    name: "Alessandro Bastoni",
    club: clubs.interMilan,
    position: "DEF",
    number: 95,
    fantasyPoints: 6,
  },
  rudiger: {
    id: "plr_rudiger",
    externalId: "prov_00655",
    name: "Antonio Rüdiger",
    club: clubs.realMadrid,
    position: "DEF",
    number: 22,
    fantasyPoints: 8,
  },
  bellingham: {
    id: "plr_bellingham",
    externalId: "prov_01502",
    name: "Jude Bellingham",
    club: clubs.realMadrid,
    position: "MID",
    number: 5,
    fantasyPoints: 16,
  },
  musiala: {
    id: "plr_musiala",
    externalId: "prov_01344",
    name: "Jamal Musiala",
    club: clubs.bayern,
    position: "MID",
    number: 42,
    fantasyPoints: 13,
  },
  saka: {
    id: "plr_saka",
    externalId: "prov_00981",
    name: "Bukayo Saka",
    club: clubs.arsenal,
    position: "MID",
    number: 7,
    fantasyPoints: 10,
  },
  haaland: {
    id: "plr_haaland",
    externalId: "prov_00276",
    name: "Erling Haaland",
    club: clubs.manCity,
    position: "FWD",
    number: 9,
    fantasyPoints: 19,
  },
  mbappe: {
    id: "plr_mbappe",
    externalId: "prov_00193",
    name: "Kylian Mbappé",
    club: clubs.realMadrid,
    position: "FWD",
    number: 10,
    fantasyPoints: 14,
  },
  dembele: {
    id: "plr_dembele",
    externalId: "prov_00842",
    name: "Ousmane Dembélé",
    club: clubs.psg,
    position: "FWD",
    number: 11,
    fantasyPoints: 12,
  },
} as const satisfies Record<string, Player>;

const managers = {
  robert: { id: "mgr_robert", displayName: "Robert", initials: "RQ" },
  alex: { id: "mgr_alex", displayName: "Alex Chen", initials: "AC" },
  priya: { id: "mgr_priya", displayName: "Priya Nair", initials: "PN" },
  marcus: { id: "mgr_marcus", displayName: "Marcus Webb", initials: "MW" },
  sofia: { id: "mgr_sofia", displayName: "Sofia Marín", initials: "SM" },
  dan: { id: "mgr_dan", displayName: "Dan O'Leary", initials: "DO" },
  yuki: { id: "mgr_yuki", displayName: "Yuki Tanaka", initials: "YT" },
};

export const currentUserTeam: FantasyTeam = {
  id: "team_robert_fc",
  name: "Robert FC",
  manager: managers.robert,
  crestColor: "#2997FF",
  wins: 4,
  losses: 1,
  draws: 0,
  pointsFor: 412,
  pointsAgainst: 356,
};

const opponentTeam: FantasyTeam = {
  id: "team_camden_wolves",
  name: "Camden Wolves",
  manager: managers.alex,
  crestColor: "#FF9F0A",
  wins: 3,
  losses: 2,
  draws: 0,
  pointsFor: 389,
  pointsAgainst: 401,
};

export const currentMatchup: Matchup = {
  id: "mtc_round5_robert_camden",
  round: 5,
  homeTeam: currentUserTeam,
  awayTeam: opponentTeam,
  homeScore: 58,
  awayScore: 51,
  homeProjected: 84,
  awayProjected: 79,
  status: "live",
};

const otherTeams: FantasyTeam[] = [
  {
    id: "team_north_bank_ballers",
    name: "North Bank Ballers",
    manager: managers.priya,
    crestColor: "#FF453A",
    wins: 4,
    losses: 1,
    draws: 0,
    pointsFor: 428,
    pointsAgainst: 370,
  },
  {
    id: "team_tactically_naive",
    name: "Tactically Naive",
    manager: managers.marcus,
    crestColor: "#32D74B",
    wins: 3,
    losses: 1,
    draws: 1,
    pointsFor: 401,
    pointsAgainst: 380,
  },
  {
    id: "team_false_nine_academy",
    name: "False Nine Academy",
    manager: managers.sofia,
    crestColor: "#BF5AF2",
    wins: 3,
    losses: 2,
    draws: 0,
    pointsFor: 395,
    pointsAgainst: 392,
  },
  {
    id: "team_park_the_bus",
    name: "Park the Bus",
    manager: managers.dan,
    crestColor: "#64D2FF",
    wins: 2,
    losses: 3,
    draws: 0,
    pointsFor: 360,
    pointsAgainst: 388,
  },
  {
    id: "team_galactico_gang",
    name: "Galáctico Gang",
    manager: managers.yuki,
    crestColor: "#FFD60A",
    wins: 1,
    losses: 4,
    draws: 0,
    pointsFor: 338,
    pointsAgainst: 415,
  },
];

export const standings: StandingsEntry[] = [
  currentUserTeam,
  opponentTeam,
  ...otherTeams,
]
  .sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor)
  .map((team, index) => ({ rank: index + 1, team }));

export const activity: ActivityItem[] = [
  {
    id: "act_1",
    type: "waiver-add",
    description: "added Alphonso Davies off waivers",
    team: otherTeams[1],
    timestamp: "2026-09-28T09:14:00.000Z",
  },
  {
    id: "act_2",
    type: "lineup-set",
    description: "set their starting XI for Matchday 5",
    team: opponentTeam,
    timestamp: "2026-09-28T07:40:00.000Z",
  },
  {
    id: "act_3",
    type: "trade",
    description: "proposed a trade to Galáctico Gang",
    team: otherTeams[0],
    timestamp: "2026-09-27T21:05:00.000Z",
  },
  {
    id: "act_4",
    type: "waiver-drop",
    description: "dropped Declan Rice",
    team: currentUserTeam,
    timestamp: "2026-09-27T18:22:00.000Z",
  },
  {
    id: "act_5",
    type: "draft-pick",
    description: "drafted Victor Osimhen with pick 34",
    team: otherTeams[2],
    timestamp: "2026-09-24T15:03:00.000Z",
  },
];

export const currentRound: FantasyRound = {
  number: 5,
  label: "Matchday 5",
  deadline: "2026-10-04T11:30:00.000Z",
  status: "in-progress",
};

export const leagues: FantasyLeague[] = [
  { id: "lg_boardroom", name: "The Boardroom", memberCount: 8 },
  { id: "lg_sunday_legends", name: "Sunday League Legends", memberCount: 10 },
];

export const currentLeague: FantasyLeague = leagues[0];
