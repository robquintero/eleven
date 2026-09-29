import type { PlayerPosition } from "@/domain/football/types";

export const PLAYER_POSITIONS: PlayerPosition[] = ["GK", "DEF", "MID", "FWD"];

/** Eleven currently covers Europe's Big Five leagues. */
export const BIG_FIVE_COMPETITION_CODES = ["ENG", "ESP", "GER", "ITA", "FRA"] as const;

export type BigFiveCompetitionCode = (typeof BIG_FIVE_COMPETITION_CODES)[number];
