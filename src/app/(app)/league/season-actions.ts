"use server";

import { revalidatePath } from "next/cache";
import { setSeasonScheduleFormat, SetSeasonScheduleFormatError, startNextSeason, type ScheduleCycles, type RosterMode } from "@/data-access/seasons";
import { activateKeptRosterSeason } from "@/lib/fantasy-engine/season";
import { SeasonActionError } from "@/lib/errors/season-action-error";

export type SeasonScheduleFormState = { error?: string } | undefined;

const ERROR_COPY: Record<string, string> = {
  NOT_AUTHENTICATED: "Sign in to do that.",
  INVALID_SCHEDULE_FORMAT: "Choose ONCE, TWICE, or THREE TIMES.",
  INVALID_ROSTER_MODE: "Choose REDRAFT or KEEP ROSTERS.",
  NOT_COMMISSIONER: "Only the league's commissioner can do that.",
  LEAGUE_NOT_FOUND: "That league couldn't be found.",
  NO_SEASON_TO_FOLLOW: "This league doesn't have a season yet.",
  SEASON_NOT_COMPLETE: "The current season hasn't finished yet.",
  SEASON_ALREADY_STARTED: "This league's season has already started — the format can't change now.",
  UNKNOWN: "Something went wrong. Try again.",
};

export async function setSeasonScheduleFormatAction(
  _prevState: SeasonScheduleFormState,
  formData: FormData
): Promise<SeasonScheduleFormState> {
  const leagueId = String(formData.get("leagueId") ?? "");
  const cycles = Number(formData.get("cycles")) as ScheduleCycles;
  if (!leagueId || ![1, 2, 3].includes(cycles)) return { error: "Choose ONCE, TWICE, or THREE TIMES." };

  try {
    await setSeasonScheduleFormat(leagueId, cycles);
  } catch (err) {
    const code = err instanceof SetSeasonScheduleFormatError ? err.code : "UNKNOWN";
    return { error: ERROR_COPY[code] };
  }

  revalidatePath("/league");
  return undefined;
}

/**
 * Pass 12B: "Start Next Season" — commissioner picks a schedule format and
 * a roster mode (REDRAFT or KEEP_ROSTERS) in one submission. The RPC
 * (`start_next_season`) does the season creation + ownership-mode side
 * effects atomically; for KEEP_ROSTERS specifically, this action then
 * immediately opens the season's first round via the fantasy-engine layer
 * (never imported directly here — `activateKeptRosterSeason` is the one
 * admin-client call site for this flow, matching the same
 * Server-Action-calls-engine-layer pattern `draft/actions.ts` already uses
 * for `maybeOpenFirstRound`). For REDRAFT, nothing further is needed here:
 * the new draft is already live, and it completing re-enters the existing
 * draft-completion round-open chain unchanged.
 */
export async function startNextSeasonAction(
  _prevState: SeasonScheduleFormState,
  formData: FormData
): Promise<SeasonScheduleFormState> {
  const leagueId = String(formData.get("leagueId") ?? "");
  const rosterMode = String(formData.get("rosterMode") ?? "") as RosterMode;
  const cycles = Number(formData.get("cycles")) as ScheduleCycles;

  if (!leagueId) return { error: "Something went wrong. Try again." };
  if (!["REDRAFT", "KEEP_ROSTERS"].includes(rosterMode)) return { error: ERROR_COPY.INVALID_ROSTER_MODE };
  if (![1, 2, 3].includes(cycles)) return { error: ERROR_COPY.INVALID_SCHEDULE_FORMAT };

  try {
    await startNextSeason(leagueId, rosterMode, cycles);
    if (rosterMode === "KEEP_ROSTERS") {
      await activateKeptRosterSeason(leagueId);
    }
  } catch (err) {
    const code = err instanceof SeasonActionError ? err.code : "UNKNOWN";
    return { error: ERROR_COPY[code] };
  }

  revalidatePath("/league");
  revalidatePath("/draft");
  revalidatePath("/team");
  revalidatePath("/home");
  return undefined;
}
