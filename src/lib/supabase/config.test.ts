import { test } from "node:test";
import assert from "node:assert/strict";
import { isSupabaseConfigured } from "./config.ts";

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

test("isSupabaseConfigured is false when both env vars are missing", () => {
  withEnv(
    { NEXT_PUBLIC_SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined },
    () => assert.equal(isSupabaseConfigured(), false)
  );
});

test("isSupabaseConfigured is false when only one env var is present", () => {
  withEnv(
    { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined },
    () => assert.equal(isSupabaseConfigured(), false)
  );
});

test("isSupabaseConfigured is true when both env vars are present", () => {
  withEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    },
    () => assert.equal(isSupabaseConfigured(), true)
  );
});
