import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { toDraftActionError } from "./errors/draft-action-error.ts";
import { DRAFT_ACTION_ERROR_COPY, DRAFT_ACTION_ERROR_KIND } from "./errors/draft-action-error-copy.ts";

type Action = (...args: unknown[]) => Promise<unknown>;
function load(file: string, mocks: Record<string, unknown>): Record<string, Action> {
  const compiled = { exports: {} };
  const code = ts.transpileModule(readFileSync(resolve(file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  new Function("require", "module", "exports", code)((name: string) => {
    if (!(name in mocks)) throw Error(`Unmocked draft action import: ${name}`);
    return mocks[name];
  }, compiled, compiled.exports);
  return compiled.exports;
}

test("actual pick actions bind attempts to a turn and invalidate only on completion", async () => {
  for (const completed of [false, true]) {
    const calls: Array<[string, unknown]> = [], paths: string[] = [];
    const actions = load("src/app/(app)/draft/actions.ts", {
      "@/data-access/drafts": {}, "@/data-access/players": {},
      "next/cache": { revalidatePath: (path: string) => paths.push(path) },
      "@/lib/supabase/server": { createClient: async () => ({ rpc: async (name: string, args: unknown) => {
        calls.push([name, args]); return { error: null };
      } }) },
      "@/lib/fantasy-engine/draft-completion": { maybeOpenFirstRound: async () => completed },
      "@/lib/errors/draft-action-error": { toDraftActionError },
      "@/lib/errors/draft-action-error-copy": { DRAFT_ACTION_ERROR_COPY, DRAFT_ACTION_ERROR_KIND },
      "@/lib/errors/action-error-diagnostics": {},
    });
    await actions.submitDraftPickAction("draft", "player", 5);
    assert.deepEqual(calls.pop(), ["submit_draft_turn", { p_draft_id: "draft", p_player_id: "player", p_expected_pick: 5 }]);
    assert.deepEqual(paths.splice(0), completed ? ["/draft", "/team"] : []);
    await actions.resolveExpiredPickAction("draft", 6);
    assert.deepEqual(calls.pop(), ["resolve_draft_turn", { p_draft_id: "draft", p_expected_pick: 6 }]);
    assert.deepEqual(paths, completed ? ["/draft", "/team"] : []);
  }
});

test("failed stale picks and not-yet-expired timers cannot advance or initialize another turn", async () => {
  let rpcError = "STALE_DRAFT_TURN", initializations = 0;
  const actions = load("src/app/(app)/draft/actions.ts", {
    "@/data-access/drafts": {}, "@/data-access/players": {},
    "next/cache": { revalidatePath: () => assert.fail("failed picks must not invalidate") },
    "@/lib/supabase/server": { createClient: async () => ({ rpc: async () => ({ error: { message: rpcError } }) }) },
    "@/lib/fantasy-engine/draft-completion": { maybeOpenFirstRound: async () => { initializations++; return true; } },
    "@/lib/errors/draft-action-error": { toDraftActionError },
    "@/lib/errors/draft-action-error-copy": { DRAFT_ACTION_ERROR_COPY, DRAFT_ACTION_ERROR_KIND },
    "@/lib/errors/action-error-diagnostics": { logUnexpectedActionError: () => assert.fail("stale turn is an expected rule outcome") },
  });
  assert.deepEqual(await actions.submitDraftPickAction("draft", "player", 5), {
    error: DRAFT_ACTION_ERROR_COPY.STALE_DRAFT_TURN, kind: "rule", code: "STALE_DRAFT_TURN",
  });
  rpcError = "TIMER_NOT_EXPIRED";
  assert.equal(await actions.resolveExpiredPickAction("draft", 5), undefined);
  assert.equal(initializations, 0);
});

test("first-round completion helper runs lifecycle work only after authoritative completion", async () => {
  for (const status of ["scheduled", "in_progress", "completed"]) {
    let openings = 0;
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { league_id: "league", status } }) };
    const helper = load("src/lib/fantasy-engine/draft-completion.ts", {
      "server-only": {},
      "../supabase/admin.ts": { isSupabaseAdminConfigured: () => true, createAdminClient: () => ({ from: () => query }) },
      "./rounds.ts": { ensureFirstRoundOpened: async () => { openings++; } },
    });
    assert.equal(await helper.maybeOpenFirstRound("draft"), status === "completed");
    assert.equal(openings, status === "completed" ? 1 : 0);
  }
});

test("lobby status uses only the RLS clock read and propagates failures for polling recovery", async () => {
  for (const status of [null, "scheduled", "in_progress", "completed", "failure"]) {
    const calls: unknown[] = [];
    const actions = load("src/app/(app)/draft/actions.ts", {
      "@/data-access/drafts": {}, "@/data-access/players": {}, "next/cache": {},
      "@/lib/supabase/server": { createClient: async () => ({ rpc: (name: string, args: unknown) => {
        calls.push([name, args]);
        return { maybeSingle: async () => ({ data: status ? { status } : null, error: status === "failure" ? { message: "offline" } : null }) };
      } }) },
      "@/lib/fantasy-engine/draft-completion": {},
      "@/lib/errors/draft-action-error": {}, "@/lib/errors/draft-action-error-copy": {},
      "@/lib/errors/action-error-diagnostics": {},
    });
    if (status === "failure") await assert.rejects(actions.getDraftStatusAction("league"), /offline/);
    else assert.equal(await actions.getDraftStatusAction("league"), status);
    assert.deepEqual(calls, [["get_draft_clock", { p_league_id: "league" }]]);
  }
});
