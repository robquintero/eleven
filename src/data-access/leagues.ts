import "server-only";
import { cache } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { LeagueActionError, toLeagueActionError } from "@/lib/errors/league-action-error";
import type { LeagueSettings } from "@/domain/fantasy/types";

export { LeagueActionError, type LeagueActionErrorCode } from "@/lib/errors/league-action-error";

export interface LeagueSummary {
  id: string;
  name: string;
  inviteCode: string;
  status: "draft" | "active" | "completed" | "archived";
  memberCount: number;
  maxTeams: number;
  role: "manager" | "commissioner";
}

/** Reads `maxTeams` out of the `LeagueSettings` JSONB column, defaulting to the same 10 the create_league() function defaults to when a league has no explicit override. */
function maxTeamsFromSettings(settings: unknown): number {
  if (settings && typeof settings === "object" && "maxTeams" in settings) {
    const value = (settings as { maxTeams?: unknown }).maxTeams;
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  }
  return 10;
}

/**
 * Every league the signed-in user belongs to, with a live member count.
 * `[]` if signed out, unconfigured, or a member of nothing — the League
 * Switcher / league hub render an empty state ("no active leagues") for
 * that case rather than an error.
 */
export const getUserLeagues = cache(async function getUserLeagues(): Promise<LeagueSummary[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return [];

  const { data: memberships, error: membershipError } = await supabase
    .from("league_memberships")
    .select("league_id, role")
    .eq("user_id", user.id);

  if (membershipError || !memberships || memberships.length === 0) return [];

  const leagueIds = memberships.map((m) => m.league_id);

  const { data: leagues, error: leaguesError } = await supabase
    .from("fantasy_leagues")
    .select("id, name, invite_code, status, settings")
    .in("id", leagueIds);

  if (leaguesError || !leagues) return [];

  // Member counts, one query per league is fine at this scale (a user
  // belongs to a handful of leagues, not hundreds) — avoids a Postgres
  // function just to get a count this pass doesn't need elsewhere.
  const counts = await Promise.all(
    leagueIds.map(async (id) => {
      const { count } = await supabase
        .from("league_memberships")
        .select("*", { count: "exact", head: true })
        .eq("league_id", id);
      return [id, count ?? 0] as const;
    })
  );
  const countByLeagueId = new Map(counts);
  const roleByLeagueId = new Map(memberships.map((m) => [m.league_id, m.role]));

  return leagues.map((league) => ({
    id: league.id,
    name: league.name,
    inviteCode: league.invite_code,
    // The DB CHECK constraint on this column guarantees the value is one
    // of these four — the generated column type is a plain `string`
    // because Postgres CHECK constraints (unlike native enums) don't
    // carry literal-union information into introspection.
    status: league.status as LeagueSummary["status"],
    memberCount: countByLeagueId.get(league.id) ?? 0,
    maxTeams: maxTeamsFromSettings(league.settings),
    role: (roleByLeagueId.get(league.id) ?? "manager") as LeagueSummary["role"],
  }));
});

export interface LeagueMember {
  userId: string;
  displayName: string;
  role: "manager" | "commissioner";
  joinedAt: string;
  teamName: string | null;
}

export interface LeagueDetail extends LeagueSummary {
  createdByUserId: string;
  members: LeagueMember[];
}

/**
 * Full league detail for the League page: the summary fields plus the real
 * member roster (profile display names + their team names, if any). `null`
 * if the league doesn't exist or the caller isn't a member — RLS would
 * return no rows in that case regardless, this just makes the "not found"
 * path explicit for the page to render a truthful 404-equivalent state.
 */
export async function getLeagueDetail(leagueId: string): Promise<LeagueDetail | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();

  const { data: league, error: leagueError } = await supabase
    .from("fantasy_leagues")
    .select("id, name, invite_code, status, settings, created_by_user_id")
    .eq("id", leagueId)
    .maybeSingle();

  if (leagueError || !league) return null;

  const { data: memberships, error: membershipError } = await supabase
    .from("league_memberships")
    .select("user_id, role, joined_at")
    .eq("league_id", leagueId)
    .order("joined_at", { ascending: true });

  if (membershipError || !memberships) return null;

  const userIds = memberships.map((m) => m.user_id);

  const [{ data: profiles }, { data: teams }] = await Promise.all([
    supabase.from("profiles").select("id, display_name").in("id", userIds),
    supabase.from("fantasy_teams").select("owner_user_id, name").eq("league_id", leagueId),
  ]);

  const displayNameByUserId = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
  const teamNameByUserId = new Map((teams ?? []).map((t) => [t.owner_user_id, t.name]));

  const user = await getCurrentUser();
  const callerRole = memberships.find((m) => m.user_id === user?.id)?.role ?? "manager";

  return {
    id: league.id,
    name: league.name,
    inviteCode: league.invite_code,
    status: league.status as LeagueSummary["status"],
    memberCount: memberships.length,
    maxTeams: maxTeamsFromSettings(league.settings),
    role: callerRole as LeagueSummary["role"],
    createdByUserId: league.created_by_user_id,
    members: memberships.map((m) => ({
      userId: m.user_id,
      displayName: displayNameByUserId.get(m.user_id) ?? "Unknown manager",
      role: m.role as LeagueMember["role"],
      joinedAt: m.joined_at,
      teamName: teamNameByUserId.get(m.user_id) ?? null,
    })),
  };
}

export interface CreateLeagueInput {
  name: string;
  teamName: string;
  teamAbbreviation: string;
  settings?: Partial<LeagueSettings>;
}

export interface CreateLeagueResult {
  leagueId: string;
  inviteCode: string;
  fantasyTeamId: string;
}

/** Atomically creates a league + the caller's commissioner membership + their first team. See create_league() in the functions migration. */
export async function createLeague(input: CreateLeagueInput): Promise<CreateLeagueResult> {
  if (!isSupabaseConfigured()) {
    throw new LeagueActionError("NOT_AUTHENTICATED", "Supabase is not configured.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_league", {
    p_name: input.name,
    p_team_name: input.teamName,
    p_team_abbreviation: input.teamAbbreviation,
    p_settings: input.settings ?? null,
  });

  if (error || !data || data.length === 0) throw toLeagueActionError(error?.message);

  const row = data[0];
  return { leagueId: row.league_id, inviteCode: row.invite_code, fantasyTeamId: row.fantasy_team_id };
}

export interface JoinLeagueInput {
  inviteCode: string;
  teamName: string;
  teamAbbreviation: string;
}

export interface JoinLeagueResult {
  leagueId: string;
  fantasyTeamId: string;
}

/** Atomically validates an invite code and, on success, creates the caller's membership + team. See join_league_by_invite_code() in the functions migration. */
export async function joinLeagueByInviteCode(input: JoinLeagueInput): Promise<JoinLeagueResult> {
  if (!isSupabaseConfigured()) {
    throw new LeagueActionError("NOT_AUTHENTICATED", "Supabase is not configured.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_league_by_invite_code", {
    p_invite_code: input.inviteCode,
    p_team_name: input.teamName,
    p_team_abbreviation: input.teamAbbreviation,
  });

  if (error || !data || data.length === 0) throw toLeagueActionError(error?.message);

  const row = data[0];
  return { leagueId: row.league_id, fantasyTeamId: row.fantasy_team_id };
}
