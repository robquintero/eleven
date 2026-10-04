import { test } from "node:test";
import assert from "node:assert/strict";
import { assertMutationTestsAllowedAgainstThisProject, PRODUCTION_SUPABASE_PROJECT_REF } from "./test-production-guard.ts";

const ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ALLOW_INTEGRATION_TESTS_AGAINST_PRODUCTION"] as const;

/** Snapshots and restores the exact env vars this guard reads -- plain `npm test` never touches real Supabase, so these tests are free to set fake values here without any risk. */
function withEnv(overrides: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>, fn: () => void) {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  try {
    for (const key of ENV_KEYS) {
      if (overrides[key] === undefined) delete process.env[key];
      else process.env[key] = overrides[key];
    }
    fn();
  } finally {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

test("assertMutationTestsAllowedAgainstThisProject: no admin credentials configured at all -- nothing to guard, never throws", () => {
  withEnv({}, () => {
    assert.doesNotThrow(() => assertMutationTestsAllowedAgainstThisProject());
  });
});

test("assertMutationTestsAllowedAgainstThisProject: configured and pointed at the known PRODUCTION ref, no override -- fails closed", () => {
  withEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
      SUPABASE_SECRET_KEY: "fake-key-for-this-unit-test-only",
    },
    () => {
      assert.throws(() => assertMutationTestsAllowedAgainstThisProject(), /PRODUCTION Supabase project/);
    }
  );
});

test("assertMutationTestsAllowedAgainstThisProject: production ref WITH the explicit override set -- allowed", () => {
  withEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
      SUPABASE_SECRET_KEY: "fake-key-for-this-unit-test-only",
      ALLOW_INTEGRATION_TESTS_AGAINST_PRODUCTION: "true",
    },
    () => {
      assert.doesNotThrow(() => assertMutationTestsAllowedAgainstThisProject());
    }
  );
});

test("assertMutationTestsAllowedAgainstThisProject: a DIFFERENT, non-production project ref is allowed with no override needed", () => {
  withEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://some-other-staging-project.supabase.co",
      SUPABASE_SECRET_KEY: "fake-key-for-this-unit-test-only",
    },
    () => {
      assert.doesNotThrow(() => assertMutationTestsAllowedAgainstThisProject());
    }
  );
});

test("assertMutationTestsAllowedAgainstThisProject: an unparseable URL cannot confidently be distinguished from production -- fails closed too", () => {
  withEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: "not-a-real-url",
      SUPABASE_SECRET_KEY: "fake-key-for-this-unit-test-only",
    },
    () => {
      assert.throws(() => assertMutationTestsAllowedAgainstThisProject(), /could not determine the Supabase project ref/);
    }
  );
});

test("assertMutationTestsAllowedAgainstThisProject: SUPABASE_SERVICE_ROLE_KEY (legacy name) alone is still enough to be 'configured'", () => {
  withEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: "fake-legacy-key-for-this-unit-test-only",
    },
    () => {
      assert.throws(() => assertMutationTestsAllowedAgainstThisProject(), /PRODUCTION Supabase project/);
    }
  );
});
