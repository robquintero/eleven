"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createLeague, joinLeagueByInviteCode } from "@/data-access/leagues";
import { LeagueActionError } from "@/lib/errors/league-action-error";
import { LEAGUE_ACTION_ERROR_COPY } from "@/lib/errors/league-action-error-copy";

export type LeagueFormState = { error?: string } | undefined;

export async function createLeagueAction(
  _prevState: LeagueFormState,
  formData: FormData
): Promise<LeagueFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const teamName = String(formData.get("teamName") ?? "").trim();
  const teamAbbreviation = String(formData.get("teamAbbreviation") ?? "")
    .trim()
    .toUpperCase();

  if (name.length < 2) return { error: "League name must be at least 2 characters." };
  if (!teamName) return { error: "Enter your team name." };
  if (teamAbbreviation.length < 2 || teamAbbreviation.length > 5) {
    return { error: "Team abbreviation must be 2-5 characters." };
  }

  try {
    await createLeague({ name, teamName, teamAbbreviation });
  } catch (err) {
    const code = err instanceof LeagueActionError ? err.code : "UNKNOWN";
    return { error: LEAGUE_ACTION_ERROR_COPY[code] };
  }

  revalidatePath("/league");
  redirect("/league");
}

export async function joinLeagueAction(
  _prevState: LeagueFormState,
  formData: FormData
): Promise<LeagueFormState> {
  const inviteCode = String(formData.get("inviteCode") ?? "").trim();
  const teamName = String(formData.get("teamName") ?? "").trim();
  const teamAbbreviation = String(formData.get("teamAbbreviation") ?? "")
    .trim()
    .toUpperCase();

  if (!inviteCode) return { error: "Enter an invite code." };
  if (!teamName) return { error: "Enter your team name." };
  if (teamAbbreviation.length < 2 || teamAbbreviation.length > 5) {
    return { error: "Team abbreviation must be 2-5 characters." };
  }

  try {
    await joinLeagueByInviteCode({ inviteCode, teamName, teamAbbreviation });
  } catch (err) {
    const code = err instanceof LeagueActionError ? err.code : "UNKNOWN";
    return { error: LEAGUE_ACTION_ERROR_COPY[code] };
  }

  revalidatePath("/league");
  redirect("/league");
}
