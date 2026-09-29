import type {
  Club,
  Player,
  PlayerAvailability,
  PlayerMatchState,
  PlayerOwnership,
  PlayerPosition,
} from "@/lib/types/fantasy";
import { clubs as teamClubs, allPlayers as myRoster } from "@/lib/mock/team";

/**
 * The full scouting database backing /players. Two sources feed it:
 *  1. `myRoster` (from mock/team.ts) — the 16 players already on Robert FC's
 *     squad, enriched here with season totals/stats and marked `ownership: "mine"`.
 *  2. A locally-seeded set of ~39 additional players covering the rest of
 *     the Big Five, spanning free agents, players owned by other league
 *     managers, waivers, and a few unavailable statuses.
 *
 * Kept as a single typed module, separate from any presentation component,
 * so a future API/DB layer can replace it without touching the UI.
 */

const clubs = {
  ...teamClubs,
  chelsea: {
    id: "clb_chelsea",
    name: "Chelsea",
    shortName: "CHE",
    league: "premier-league",
    crestColor: "#034694",
  },
  manUnited: {
    id: "clb_man_utd",
    name: "Manchester United",
    shortName: "MUN",
    league: "premier-league",
    crestColor: "#DA291C",
  },
  napoli: {
    id: "clb_napoli",
    name: "Napoli",
    shortName: "NAP",
    league: "serie-a",
    crestColor: "#12A0D8",
  },
  atleticoMadrid: {
    id: "clb_atletico",
    name: "Atlético Madrid",
    shortName: "ATM",
    league: "la-liga",
    crestColor: "#CB3524",
  },
  marseille: {
    id: "clb_marseille",
    name: "Olympique de Marseille",
    shortName: "OM",
    league: "ligue-1",
    crestColor: "#2FAEE0",
  },
} as const satisfies Record<string, Club>;

interface ClubFixture {
  opponent: string;
  isHome: boolean;
  kickoff: string;
  state: PlayerMatchState;
}

/** One fixture per club this matchday — every player at a club shares it. */
const clubFixtures: Record<string, ClubFixture> = {
  ARS: { opponent: "TOT", isHome: false, kickoff: "2026-10-04T15:30:00.000Z", state: "upcoming" },
  TOT: { opponent: "ARS", isHome: true, kickoff: "2026-10-04T15:30:00.000Z", state: "upcoming" },
  MCI: { opponent: "BHA", isHome: true, kickoff: "2026-10-03T11:30:00.000Z", state: "upcoming" },
  LIV: { opponent: "EVE", isHome: true, kickoff: "2026-10-03T14:00:00.000Z", state: "upcoming" },
  CHE: { opponent: "NEW", isHome: true, kickoff: "2026-10-04T17:30:00.000Z", state: "upcoming" },
  MUN: { opponent: "WHU", isHome: false, kickoff: "2026-10-03T12:30:00.000Z", state: "upcoming" },
  RMA: { opponent: "SEV", isHome: true, kickoff: "2026-10-04T11:15:00.000Z", state: "locked" },
  BAR: { opponent: "VAL", isHome: true, kickoff: "2026-10-04T19:00:00.000Z", state: "upcoming" },
  ATM: { opponent: "BIL", isHome: true, kickoff: "2026-10-03T09:00:00.000Z", state: "final" },
  BAY: { opponent: "BVB", isHome: true, kickoff: "2026-10-03T16:30:00.000Z", state: "upcoming" },
  BVB: { opponent: "BAY", isHome: false, kickoff: "2026-10-03T16:30:00.000Z", state: "upcoming" },
  B04: { opponent: "RBL", isHome: true, kickoff: "2026-10-03T13:30:00.000Z", state: "upcoming" },
  MIL: { opponent: "INT", isHome: false, kickoff: "2026-10-03T16:30:00.000Z", state: "live" },
  INT: { opponent: "MIL", isHome: true, kickoff: "2026-10-03T16:30:00.000Z", state: "live" },
  NAP: { opponent: "JUV", isHome: false, kickoff: "2026-10-03T09:00:00.000Z", state: "final" },
  JUV: { opponent: "NAP", isHome: true, kickoff: "2026-10-03T09:00:00.000Z", state: "final" },
  PSG: { opponent: "OM", isHome: false, kickoff: "2026-10-04T19:00:00.000Z", state: "upcoming" },
  OM: { opponent: "PSG", isHome: true, kickoff: "2026-10-04T19:00:00.000Z", state: "upcoming" },
};

interface Seed {
  name: string;
  club: Club;
  position: PlayerPosition;
  number: number;
  fantasyPoints: number;
  totalPoints: number;
  form: number[];
  ownership: PlayerOwnership;
  ownerTeamName?: string;
  availability?: PlayerAvailability;
  apps: number;
  mins: number;
  goals: number;
  assists: number;
  cleanSheets?: number;
  saves?: number;
}

function buildPlayer(seed: Seed, idx: number): Player {
  const fixture = clubFixtures[seed.club.shortName];
  return {
    id: `plr_db_${idx}`,
    externalId: `prov_db_${2000 + idx}`,
    name: seed.name,
    club: seed.club,
    position: seed.position,
    number: seed.number,
    fantasyPoints: seed.fantasyPoints,
    totalPoints: seed.totalPoints,
    averagePoints: Math.round((seed.totalPoints / seed.apps) * 10) / 10,
    availability: seed.availability ?? "available",
    ownership: seed.ownership,
    ownerTeamName: seed.ownerTeamName,
    fixture: fixture ? { ...fixture } : undefined,
    recentForm: seed.form,
    seasonStats: {
      appearances: seed.apps,
      minutes: seed.mins,
      goals: seed.goals,
      assists: seed.assists,
      cleanSheets: seed.cleanSheets,
      saves: seed.saves,
    },
  };
}

const seeds: Seed[] = [
  // Goalkeepers
  { name: "David Raya", club: clubs.arsenal, position: "GK", number: 1, fantasyPoints: 5, totalPoints: 34, form: [7, 4, 8, 6], ownership: "owned", ownerTeamName: "North Bank Ballers", apps: 5, mins: 450, goals: 0, assists: 0, cleanSheets: 3, saves: 11 },
  { name: "Marc-André ter Stegen", club: clubs.barcelona, position: "GK", number: 1, fantasyPoints: 6, totalPoints: 29, form: [5, 6, 4, 8], ownership: "free", apps: 5, mins: 450, goals: 0, assists: 0, cleanSheets: 2, saves: 15 },
  { name: "Manuel Neuer", club: clubs.bayern, position: "GK", number: 1, fantasyPoints: 4, totalPoints: 31, form: [6, 7, 5, 9], ownership: "free", apps: 5, mins: 450, goals: 0, assists: 0, cleanSheets: 3, saves: 9 },
  { name: "Gianluigi Donnarumma", club: clubs.psg, position: "GK", number: 50, fantasyPoints: 7, totalPoints: 36, form: [8, 6, 9, 6], ownership: "owned", ownerTeamName: "Tactically Naive", apps: 5, mins: 450, goals: 0, assists: 0, cleanSheets: 4, saves: 8 },
  { name: "Mike Maignan", club: clubs.acMilan, position: "GK", number: 16, fantasyPoints: 5, totalPoints: 27, form: [4, 5, 7, 5], ownership: "waivers", apps: 5, mins: 450, goals: 0, assists: 0, cleanSheets: 2, saves: 13 },
  { name: "Jan Oblak", club: clubs.atleticoMadrid, position: "GK", number: 13, fantasyPoints: 3, totalPoints: 33, form: [7, 8, 5, 6], ownership: "free", apps: 5, mins: 450, goals: 0, assists: 0, cleanSheets: 3, saves: 12 },

  // Defenders
  { name: "Rúben Dias", club: clubs.manCity, position: "DEF", number: 3, fantasyPoints: 8, totalPoints: 38, form: [7, 9, 6, 8], ownership: "owned", ownerTeamName: "False Nine Academy", apps: 5, mins: 450, goals: 0, assists: 1, cleanSheets: 3, saves: undefined, },
  { name: "William Saliba", club: clubs.arsenal, position: "DEF", number: 2, fantasyPoints: 6, totalPoints: 35, form: [8, 6, 7, 9], ownership: "free", apps: 5, mins: 450, goals: 1, assists: 0, cleanSheets: 3 },
  { name: "Reece James", club: clubs.chelsea, position: "DEF", number: 24, fantasyPoints: 5, totalPoints: 22, form: [3, 6, 5, 4], ownership: "free", availability: "doubtful", apps: 4, mins: 310, goals: 0, assists: 2, cleanSheets: 1 },
  { name: "Jules Koundé", club: clubs.barcelona, position: "DEF", number: 23, fantasyPoints: 7, totalPoints: 33, form: [6, 7, 5, 8], ownership: "owned", ownerTeamName: "Park the Bus", apps: 5, mins: 450, goals: 0, assists: 1, cleanSheets: 2 },
  { name: "Dayot Upamecano", club: clubs.bayern, position: "DEF", number: 2, fantasyPoints: 6, totalPoints: 30, form: [5, 8, 6, 7], ownership: "free", apps: 5, mins: 450, goals: 1, assists: 0, cleanSheets: 3 },
  { name: "Kim Min-jae", club: clubs.bayern, position: "DEF", number: 3, fantasyPoints: 5, totalPoints: 26, form: [4, 6, 7, 5], ownership: "free", apps: 5, mins: 420, goals: 0, assists: 0, cleanSheets: 3 },
  { name: "Milan Škriniar", club: clubs.psg, position: "DEF", number: 37, fantasyPoints: 4, totalPoints: 24, form: [5, 4, 6, 3], ownership: "waivers", apps: 5, mins: 390, goals: 0, assists: 0, cleanSheets: 4 },
  { name: "Gabriel Magalhães", club: clubs.arsenal, position: "DEF", number: 6, fantasyPoints: 9, totalPoints: 41, form: [8, 9, 7, 10], ownership: "owned", ownerTeamName: "Galáctico Gang", apps: 5, mins: 450, goals: 2, assists: 0, cleanSheets: 3 },
  { name: "Trent Alexander-Arnold", club: clubs.realMadrid, position: "DEF", number: 12, fantasyPoints: 7, totalPoints: 32, form: [6, 5, 9, 7], ownership: "free", apps: 5, mins: 440, goals: 0, assists: 3, cleanSheets: 2 },
  { name: "Marquinhos", club: clubs.psg, position: "DEF", number: 5, fantasyPoints: 6, totalPoints: 29, form: [5, 7, 6, 6], ownership: "free", apps: 5, mins: 450, goals: 1, assists: 0, cleanSheets: 4 },

  // Midfielders
  { name: "Martin Ødegaard", club: clubs.arsenal, position: "MID", number: 8, fantasyPoints: 9, totalPoints: 44, form: [9, 8, 10, 7], ownership: "owned", ownerTeamName: "Camden Wolves", apps: 5, mins: 450, goals: 3, assists: 4 },
  { name: "Kevin De Bruyne", club: clubs.napoli, position: "MID", number: 17, fantasyPoints: 10, totalPoints: 47, form: [8, 11, 9, 10], ownership: "free", apps: 5, mins: 420, goals: 2, assists: 6 },
  { name: "Federico Valverde", club: clubs.realMadrid, position: "MID", number: 15, fantasyPoints: 8, totalPoints: 39, form: [7, 9, 8, 6], ownership: "owned", ownerTeamName: "Tactically Naive", apps: 5, mins: 450, goals: 2, assists: 2 },
  { name: "Lamine Yamal", club: clubs.barcelona, position: "MID", number: 19, fantasyPoints: 11, totalPoints: 52, form: [10, 12, 9, 11], ownership: "free", apps: 5, mins: 440, goals: 4, assists: 5 },
  { name: "Declan Rice", club: clubs.arsenal, position: "MID", number: 41, fantasyPoints: 7, totalPoints: 36, form: [6, 8, 7, 7], ownership: "free", apps: 5, mins: 450, goals: 1, assists: 3 },
  { name: "Enzo Fernández", club: clubs.chelsea, position: "MID", number: 5, fantasyPoints: 6, totalPoints: 31, form: [5, 7, 6, 8], ownership: "owned", ownerTeamName: "North Bank Ballers", apps: 5, mins: 450, goals: 1, assists: 2 },
  { name: "Vitinha", club: clubs.psg, position: "MID", number: 17, fantasyPoints: 7, totalPoints: 34, form: [6, 8, 5, 9], ownership: "free", apps: 5, mins: 450, goals: 1, assists: 3 },
  { name: "Frenkie de Jong", club: clubs.barcelona, position: "MID", number: 21, fantasyPoints: 5, totalPoints: 27, form: [4, 6, 5, 7], ownership: "waivers", availability: "doubtful", apps: 4, mins: 300, goals: 0, assists: 2 },
  { name: "Nicolò Barella", club: clubs.interMilan, position: "MID", number: 23, fantasyPoints: 8, totalPoints: 37, form: [7, 8, 6, 9], ownership: "free", apps: 5, mins: 450, goals: 2, assists: 3 },
  { name: "Khvicha Kvaratskhelia", club: clubs.psg, position: "MID", number: 7, fantasyPoints: 9, totalPoints: 40, form: [8, 7, 11, 8], ownership: "owned", ownerTeamName: "False Nine Academy", apps: 5, mins: 430, goals: 3, assists: 3 },
  { name: "İlkay Gündoğan", club: clubs.manCity, position: "MID", number: 19, fantasyPoints: 5, totalPoints: 26, form: [4, 5, 6, 5], ownership: "free", apps: 5, mins: 380, goals: 1, assists: 1 },

  // Forwards
  { name: "Harry Kane", club: clubs.bayern, position: "FWD", number: 9, fantasyPoints: 13, totalPoints: 58, form: [11, 14, 10, 15], ownership: "owned", ownerTeamName: "Camden Wolves", apps: 5, mins: 450, goals: 8, assists: 2 },
  { name: "Victor Osimhen", club: clubs.napoli, position: "FWD", number: 9, fantasyPoints: 10, totalPoints: 45, form: [9, 12, 8, 10], ownership: "free", apps: 5, mins: 420, goals: 6, assists: 1 },
  { name: "Lautaro Martínez", club: clubs.interMilan, position: "FWD", number: 10, fantasyPoints: 11, totalPoints: 49, form: [10, 9, 13, 11], ownership: "owned", ownerTeamName: "Galáctico Gang", apps: 5, mins: 450, goals: 7, assists: 2 },
  { name: "Vinícius Júnior", club: clubs.realMadrid, position: "FWD", number: 7, fantasyPoints: 12, totalPoints: 53, form: [11, 10, 14, 9], ownership: "owned", ownerTeamName: "Park the Bus", apps: 5, mins: 440, goals: 7, assists: 4 },
  { name: "Mohamed Salah", club: clubs.liverpool, position: "FWD", number: 11, fantasyPoints: 14, totalPoints: 61, form: [12, 15, 11, 16], ownership: "free", apps: 5, mins: 450, goals: 9, assists: 5 },
  { name: "Robert Lewandowski", club: clubs.barcelona, position: "FWD", number: 9, fantasyPoints: 9, totalPoints: 44, form: [8, 10, 7, 12], ownership: "owned", ownerTeamName: "Tactically Naive", apps: 5, mins: 430, goals: 6, assists: 1 },
  { name: "Bradley Barcola", club: clubs.psg, position: "FWD", number: 29, fantasyPoints: 8, totalPoints: 33, form: [6, 9, 7, 6], ownership: "free", apps: 5, mins: 400, goals: 4, assists: 2 },
  { name: "Marcus Rashford", club: clubs.manUnited, position: "FWD", number: 10, fantasyPoints: 6, totalPoints: 28, form: [5, 7, 4, 8], ownership: "waivers", apps: 5, mins: 410, goals: 3, assists: 2 },
  { name: "Antoine Griezmann", club: clubs.atleticoMadrid, position: "FWD", number: 7, fantasyPoints: 7, totalPoints: 35, form: [6, 8, 5, 9], ownership: "free", apps: 5, mins: 440, goals: 4, assists: 4 },
  { name: "Karim Adeyemi", club: clubs.dortmund, position: "FWD", number: 27, fantasyPoints: 5, totalPoints: 24, form: [4, 6, 3, 7], ownership: "free", availability: "injured", apps: 3, mins: 190, goals: 2, assists: 1 },
  { name: "Mason Greenwood", club: clubs.marseille, position: "FWD", number: 10, fantasyPoints: 9, totalPoints: 39, form: [8, 7, 11, 8], ownership: "owned", ownerTeamName: "North Bank Ballers", apps: 5, mins: 450, goals: 5, assists: 3 },
  { name: "Dušan Vlahović", club: clubs.juventus, position: "FWD", number: 9, fantasyPoints: 6, totalPoints: 30, form: [5, 4, 8, 6], ownership: "free", availability: "suspended", apps: 4, mins: 320, goals: 4, assists: 0 },
];

const scoutedPlayers: Player[] = seeds.map(buildPlayer);

/** Robert FC's own squad, enriched with season totals so it reads consistently
 * alongside the rest of the scouting database. */
interface SeasonStatsSeed {
  apps: number;
  mins: number;
  goals: number;
  assists: number;
  cleanSheets?: number;
  saves?: number;
}

const mineStats: Record<string, SeasonStatsSeed> = {
  plr_alisson: { apps: 5, mins: 450, goals: 0, assists: 0, cleanSheets: 3, saves: 14 },
  plr_van_dijk: { apps: 5, mins: 450, goals: 1, assists: 0, cleanSheets: 3 },
  plr_hakimi: { apps: 5, mins: 440, goals: 1, assists: 3, cleanSheets: 2 },
  plr_bastoni: { apps: 5, mins: 450, goals: 0, assists: 1, cleanSheets: 2 },
  plr_rudiger: { apps: 5, mins: 450, goals: 1, assists: 0, cleanSheets: 3 },
  plr_bellingham: { apps: 5, mins: 450, goals: 4, assists: 3 },
  plr_musiala: { apps: 5, mins: 420, goals: 3, assists: 4 },
  plr_saka: { apps: 5, mins: 450, goals: 2, assists: 3 },
  plr_haaland: { apps: 5, mins: 450, goals: 9, assists: 1 },
  plr_mbappe: { apps: 5, mins: 440, goals: 6, assists: 2 },
  plr_dembele: { apps: 5, mins: 410, goals: 4, assists: 3 },
  plr_ederson: { apps: 5, mins: 450, goals: 0, assists: 0, cleanSheets: 3, saves: 9 },
  plr_theo_hernandez: { apps: 5, mins: 430, goals: 1, assists: 2, cleanSheets: 1 },
  plr_pedri: { apps: 5, mins: 400, goals: 1, assists: 3 },
  plr_wirtz: { apps: 4, mins: 280, goals: 2, assists: 2 },
  plr_leao: { apps: 4, mins: 320, goals: 2, assists: 1 },
};

/** Enriches a raw squad player (from `mock/team.ts`) with the ownership/
 * stats fields the scouting database shows — reused by Team/Dashboard so a
 * squad player opened via the shared Player Inspector shows the same
 * MINE/season data as browsing the same player on `/players`. */
export function enrichMine(player: Player): Player {
  const stats = mineStats[player.id];
  const totalPoints = (player.recentForm?.reduce((sum, n) => sum + n, 0) ?? 0) + player.fantasyPoints;
  const apps = stats?.apps ?? (player.recentForm?.length ?? 4) + 1;
  return {
    ...player,
    ownership: "mine",
    totalPoints,
    averagePoints: Math.round((totalPoints / apps) * 10) / 10,
    seasonStats: stats
      ? {
          appearances: stats.apps,
          minutes: stats.mins,
          goals: stats.goals,
          assists: stats.assists,
          cleanSheets: stats.cleanSheets,
          saves: stats.saves,
        }
      : undefined,
  };
}

const rosteredPlayers: Player[] = myRoster.map(enrichMine);

export const playerDatabase: Player[] = [...rosteredPlayers, ...scoutedPlayers];
