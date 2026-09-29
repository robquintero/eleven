import { test } from "node:test";
import assert from "node:assert/strict";
import { getApiKey } from "./config.ts";
import { ApiFootballConfigError } from "./errors.ts";

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

test("getApiKey throws ApiFootballConfigError (never a raw fetch) when API_FOOTBALL_KEY is missing", () => {
  withEnv({ API_FOOTBALL_KEY: undefined }, () => {
    assert.throws(() => getApiKey(), (err: unknown) => {
      assert.ok(err instanceof ApiFootballConfigError);
      assert.match(err.message, /API_FOOTBALL_KEY is missing/);
      return true;
    });
  });
});

test("getApiKey throws for an empty-string key too", () => {
  withEnv({ API_FOOTBALL_KEY: "" }, () => {
    assert.throws(() => getApiKey(), ApiFootballConfigError);
  });
});

test("getApiKey returns the configured key without altering it", () => {
  withEnv({ API_FOOTBALL_KEY: "test-key-value" }, () => {
    assert.equal(getApiKey(), "test-key-value");
  });
});

test("getApiKey's own error message never echoes back a real key value", () => {
  withEnv({ API_FOOTBALL_KEY: undefined }, () => {
    try {
      getApiKey();
      assert.fail("expected getApiKey to throw");
    } catch (err) {
      assert.ok(err instanceof Error);
      assert.doesNotMatch(err.message, /[a-f0-9]{20,}/i);
    }
  });
});
