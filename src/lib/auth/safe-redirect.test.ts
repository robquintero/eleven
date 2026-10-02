import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNextPath } from "./safe-redirect.ts";

test("null/undefined/empty falls back to /league", () => {
  assert.equal(safeNextPath(null), "/league");
  assert.equal(safeNextPath(undefined), "/league");
  assert.equal(safeNextPath(""), "/league");
});

test("a genuine same-origin relative path is passed through unchanged", () => {
  assert.equal(safeNextPath("/reset-password"), "/reset-password");
  assert.equal(safeNextPath("/league"), "/league");
  assert.equal(safeNextPath("/team?tab=lineup"), "/team?tab=lineup");
});

test("a protocol-relative URL (//evil.com) is rejected, never passed through", () => {
  assert.equal(safeNextPath("//evil.com"), "/league");
  assert.equal(safeNextPath("///evil.com"), "/league");
});

test("an absolute URL to another host is rejected", () => {
  assert.equal(safeNextPath("https://evil.com"), "/league");
  assert.equal(safeNextPath("http://evil.com/phish"), "/league");
});

test("a backslash-leading path (browsers treat \\ as / in some contexts) is rejected", () => {
  assert.equal(safeNextPath("/\\evil.com"), "/league");
});

test("a path with no leading slash at all is rejected", () => {
  assert.equal(safeNextPath("evil.com"), "/league");
  assert.equal(safeNextPath("reset-password"), "/league");
});
