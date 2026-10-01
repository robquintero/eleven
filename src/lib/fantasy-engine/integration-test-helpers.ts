/**
 * Shared real-Supabase integration-test helpers (temporary leagues/users,
 * draft-to-completion drivers). Originally local to
 * `draft-engine.integration.test.ts` (Pass 10); extracted in Pass 11 so
 * `market-trades.integration.test.ts` can build its own real leagues and
 * drive them to a completed draft without duplicating this setup code.
 * Not itself a `.test.ts` file, so it is never picked up by `npm test`'s
 * glob or executed directly — it only ever runs as code imported by an
 * actual integration test.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../supabase/admin.ts";
import { maybeOpenFirstRound } from "./draft-completion.ts";
import type { Database } from "../supabase/database.types.ts";
import type { PlayerPosition } from "../../domain/football/types.ts";

export interface TestLeague {
  leagueId: string;
  teamIds: string[];
  userIds: string[];
  clients: SupabaseClient<Database>[];
}

/**
 * Supabase Auth rate-limits sign-ups/sign-ins per project; running
 * multiple integration test files back-to-back (each spinning up several
 * temporary users per test) can transiently exceed it mid-suite even
 * though no individual test is doing anything wrong. Retried with
 * exponential backoff rather than failing outright — this is purely an
 * infra-pacing concern, not a correctness assertion.
 */
async function withRateLimitRetry<T extends { error: { message: string } | null }>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  for (;;) {
    const result = await fn();
    if (!result.error || !/rate limit/i.test(result.error.message) || attempt >= 5) return result;
    attempt += 1;
    await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt));
  }
}

export async function createTestLeague(
  admin: ReturnType<typeof createAdminClient>,
  managers: number,
  squadSize = 16
): Promise<TestLeague> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const password = "Pass10-Integration-Test!" + Math.random().toString(36).slice(2);

  const userIds: string[] = [];
  const clients: SupabaseClient<Database>[] = [];
  for (let i = 0; i < managers; i++) {
    const email = `eleven-integration-test-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}@example.invalid`;
    const { data, error } = await withRateLimitRetry(() => admin.auth.admin.createUser({ email, password, email_confirm: true }));
    if (error || !data.user) throw new Error(`failed to create test user: ${error?.message}`);
    userIds.push(data.user.id);
    const client = createClient<Database>(url, anonKey);
    const { error: signInError } = await withRateLimitRetry(() => client.auth.signInWithPassword({ email, password }));
    if (signInError) throw new Error(`failed to sign in test user: ${signInError.message}`);
    clients.push(client);
  }

  const { data: created, error: createErr } = await clients[0].rpc("create_league", {
    p_name: `Eleven Integration Test ${Date.now()}`,
    p_team_name: "Team 0",
    p_team_abbreviation: "TM0",
    p_settings: {
      maxTeams: managers,
      squadSize,
      starterCount: 11,
      waiverMode: "priority",
      playoffEnabled: true,
      draftType: "snake",
      pickTimerSeconds: 60,
    },
  });
  if (createErr || !created?.[0]) throw new Error(`create_league failed: ${createErr?.message}`);
  const leagueId = created[0].league_id;
  const teamIds = [created[0].fantasy_team_id];

  for (let i = 1; i < managers; i++) {
    const { data: joined, error } = await clients[i].rpc("join_league_by_invite_code", {
      p_invite_code: created[0].invite_code,
      p_team_name: `Team ${i}`,
      p_team_abbreviation: `TM${i}`,
    });
    if (error || !joined?.[0]) throw new Error(`join failed: ${error?.message}`);
    teamIds.push(joined[0].fantasy_team_id);
  }

  return { leagueId, teamIds, userIds, clients };
}

export async function cleanupTestLeague(admin: ReturnType<typeof createAdminClient>, league: TestLeague) {
  await admin.from("fantasy_leagues").delete().eq("id", league.leagueId);
  for (const userId of league.userIds) {
    await admin.auth.admin.deleteUser(userId);
  }
}

/**
 * Drives a draft to exactly ONE pick remaining via the real auto-pick RPC
 * (`resolve_expired_pick` — itself genuine production code for timer
 * expiry, not a test-only shortcut), then submits that REAL final pick
 * explicitly through the actual drafting team's own authenticated client
 * and `make_draft_pick` — the exact RPC a real manager's click invokes —
 * and immediately calls the REAL, unmodified `maybeOpenFirstRound`
 * (Pass 10.5C.3's own exported function, not a reimplementation of it;
 * see its own module doc comment). This is the real completion path
 * production actually uses: `submitDraftPickAction`'s entire body is
 * `make_draft_pick` RPC + this same `maybeOpenFirstRound` call +
 * `revalidatePath` (irrelevant to DB state, and untestable outside a
 * Next.js request — see draft-completion.ts's own comment on why it was
 * split out). Calling `openNextRound`/`ensureFirstRoundOpened` directly
 * here would NOT prove anything about whether the real trigger chain
 * actually reaches them — see this pass's own report on why isolated
 * calls to those lower-level functions previously masked a real gap in
 * this exact chain.
 */
export async function draftToCompletionViaRealFinalPick(
  admin: ReturnType<typeof createAdminClient>,
  league: TestLeague,
  draftId: string,
  managers: number,
  squadSize: number
): Promise<void> {
  const farFuture = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
  const totalPicks = managers * squadSize;
  for (let i = 0; i < totalPicks - 1; i++) {
    const { data: status } = await admin.from("drafts").select("status").eq("id", draftId).single();
    if (status?.status === "completed") throw new Error(`draft completed early at pick ${i}, expected to stop at ${totalPicks - 1}`);
    const { error } = await admin.rpc("resolve_expired_pick", { p_draft_id: draftId, p_as_of: farFuture });
    if (error) throw new Error(`auto-pick ${i} failed: ${error.message}`);
  }

  const { data: ownedBefore } = await admin.from("league_player_ownership").select("player_id").eq("league_id", league.leagueId);
  const ownedIds = new Set((ownedBefore ?? []).map((o) => o.player_id));

  let submitted = false;
  for (const position of ["GK", "DEF", "MID", "FWD"] as const) {
    const { data: candidates } = await admin.from("players").select("id").eq("active", true).eq("position", position).order("name").limit(200);
    const playerId = candidates?.find((c) => !ownedIds.has(c.id))?.id;
    if (!playerId) continue;
    for (const client of league.clients) {
      const { error } = await client.rpc("make_draft_pick", { p_draft_id: draftId, p_player_id: playerId });
      if (!error) {
        submitted = true;
        break;
      }
    }
    if (submitted) break;
  }
  if (!submitted) throw new Error("could not submit the real final pick with any available player/position");

  const { data: finalStatus } = await admin.from("drafts").select("status").eq("id", draftId).single();
  if (finalStatus?.status !== "completed") throw new Error(`draft did not reach 'completed' after the real final pick (status: ${finalStatus?.status})`);

  // === THE REAL PRODUCTION TRIGGER ===
  await maybeOpenFirstRound(draftId);
}

export async function draftToCompletion(
  admin: ReturnType<typeof createAdminClient>,
  draftId: string,
  managers: number,
  squadSize: number
) {
  const farFuture = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
  const maxPicks = managers * squadSize + 5;
  for (let i = 0; i < maxPicks; i++) {
    const { data: status } = await admin.from("drafts").select("status").eq("id", draftId).single();
    if (status?.status === "completed") return;
    const { error } = await admin.rpc("resolve_expired_pick", { p_draft_id: draftId, p_as_of: farFuture });
    if (error) throw new Error(`auto-pick failed: ${error.message}`);
  }
  throw new Error("draft did not complete within the expected number of picks");
}

/**
 * Drafts the first still-eligible player at `position` on behalf of
 * `teamClient`'s team, auto-resolving any intervening OTHER team's turn
 * (via resolve_expired_pick with a far-future `p_as_of`, same trick as
 * draftToCompletion) until it's actually this team's turn. Returns the
 * RPC error from the team's own attempt (e.g. ROSTER_LIMIT_EXCEEDED), or
 * `null` on success — never throws for that outcome, only for
 * infrastructure failures (no eligible player left, too many auto-skips).
 */
export async function draftFirstAvailableAtPosition(
  admin: ReturnType<typeof createAdminClient>,
  teamClient: SupabaseClient<Database>,
  draftId: string,
  leagueId: string,
  position: PlayerPosition
): Promise<{ message: string } | null> {
  const farFuture = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
  for (let i = 0; i < 20; i++) {
    const { data: owned } = await admin.from("league_player_ownership").select("player_id").eq("league_id", leagueId);
    const ownedIds = new Set((owned ?? []).map((o) => o.player_id));
    const { data: candidates } = await admin.from("players").select("id").eq("active", true).eq("position", position).order("name").limit(50);
    const playerId = candidates?.find((c) => !ownedIds.has(c.id))?.id;
    if (!playerId) throw new Error(`no eligible ${position} player left to test with`);

    const { error } = await teamClient.rpc("make_draft_pick", { p_draft_id: draftId, p_player_id: playerId });
    if (!error) return null;
    if (error.message !== "NOT_YOUR_TURN") return error;

    const { error: autoErr } = await admin.rpc("resolve_expired_pick", { p_draft_id: draftId, p_as_of: farFuture });
    if (autoErr) throw new Error(`auto-advance failed: ${autoErr.message}`);
  }
  throw new Error("too many auto-advances waiting for this team's turn");
}
