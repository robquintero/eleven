"use server";

import { revalidatePath } from "next/cache";
import { setSeasonScheduleFormat, SetSeasonScheduleFormatError, type ScheduleCycles } from "@/data-access/seasons";

export type SeasonScheduleFormState = { error?: string } | undefined;

const ERROR_COPY: Record<string, string> = {
  NOT_AUTHENTICATED: "Sign in to do that.",
  INVALID_SCHEDULE_FORMAT: "Choose ONCE, TWICE, or THREE TIMES.",
  NOT_COMMISSIONER: "Only the league's commissioner can set the schedule format.",
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
