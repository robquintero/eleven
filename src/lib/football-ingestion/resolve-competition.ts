import { BIG_FIVE_COMPETITIONS, getBigFiveCompetition } from "../football-providers/api-football/big-five-competitions.ts";
import type { BigFiveCompetitionCode } from "../../domain/football/constants.ts";
import { getUefaCompetition, isUefaCompetitionCode } from "../football-providers/api-football/uefa-competitions.ts";
import {
  getInternationalCompetition,
  isInternationalCompetitionCode,
} from "../football-providers/api-football/international-competitions.ts";
import type { CompetitionSyncTarget } from "./types.ts";

export { BIG_FIVE_COMPETITIONS };

/** Resolves a competition `code` against any of the three config lists — Big Five, UEFA, or Pass 14's international allowlist — never guessing/hardcoding a provider id inline at a call site. Shared by cli.ts and live-sync.ts. */
export function resolveCompetition(code: string): CompetitionSyncTarget {
  if (isUefaCompetitionCode(code)) return getUefaCompetition(code);
  if (isInternationalCompetitionCode(code)) return getInternationalCompetition(code);
  return getBigFiveCompetition(code as BigFiveCompetitionCode);
}
