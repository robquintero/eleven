import { test } from "node:test";
import assert from "node:assert/strict";
import { isSupabaseAdminConfigured } from "./service-role-status.ts";

function withEnv(vars: Record<string, string | undefined>, run: () => void) {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    original[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  try {
    run();
  } finally {
    for (const key of Object.keys(original)) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}

// As of Pass 10.5C.2A, ordinary lineup writes (swap/fill) no longer gate
// on this at all -- see service-role-status.ts's own doc comment. The one
// remaining caller is ensureFirstRoundOpenedAction's round-1 self-heal
// (team/actions.ts), a genuine multi-team system operation.

test("isSupabaseAdminConfigured is false with no relevant env vars at all", () => {
  withEnv(
    { NEXT_PUBLIC_SUPABASE_URL: undefined, SUPABASE_SECRET_KEY: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined },
    () => assert.equal(isSupabaseAdminConfigured(), false)
  );
});

test("isSupabaseAdminConfigured is false with the URL but neither admin key name set -- the exact misconfiguration this pass traces", () => {
  withEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SECRET_KEY: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    },
    () => assert.equal(isSupabaseAdminConfigured(), false)
  );
});

test("isSupabaseAdminConfigured is true with the newer SUPABASE_SECRET_KEY name", () => {
  withEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SECRET_KEY: "secret-key",
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    },
    () => assert.equal(isSupabaseAdminConfigured(), true)
  );
});

test("isSupabaseAdminConfigured is true with the legacy SUPABASE_SERVICE_ROLE_KEY name (.env.example's documented name)", () => {
  withEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SECRET_KEY: undefined,
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    },
    () => assert.equal(isSupabaseAdminConfigured(), true)
  );
});
