import { test } from "node:test";
import assert from "node:assert/strict";
import { initialsFor, resolveAvatarSource } from "./player-avatar.ts";

test("initialsFor takes the first letter of the first and last name", () => {
  assert.equal(initialsFor("Lamine Yamal"), "LY");
  assert.equal(initialsFor("Cristiano Ronaldo"), "CR");
});

test("initialsFor handles a single-word name with its first two letters", () => {
  assert.equal(initialsFor("Neymar"), "NE");
});

test("initialsFor handles a middle name without using it", () => {
  assert.equal(initialsFor("Kylian Mbappe Lottin"), "KL");
});

test("initialsFor falls back to '?' for empty/whitespace-only input, never throws", () => {
  assert.equal(initialsFor(""), "?");
  assert.equal(initialsFor("   "), "?");
});

test("nationality + valid flag mapping -> flag avatar source", () => {
  const source = resolveAvatarSource("Lamine Yamal", "Spain");
  assert.equal(source.flagUrl, "https://flagcdn.com/es.svg");
  assert.equal(source.flagAlt, "Spain");
  assert.equal(source.initials, "LY", "initials are always computed too, for the onError fallback");
});

test("nationality known but unmapped -> initials avatar source (flagUrl null)", () => {
  const source = resolveAvatarSource("Jane Doe", "Unknown");
  assert.equal(source.flagUrl, null);
  assert.equal(source.flagAlt, null);
  assert.equal(source.initials, "JD");
});

test("missing nationality -> initials avatar source (flagUrl null)", () => {
  const source = resolveAvatarSource("Jane Doe", null);
  assert.equal(source.flagUrl, null);
  assert.equal(source.flagAlt, null);
  assert.equal(source.initials, "JD");

  const sourceUndefined = resolveAvatarSource("Jane Doe", undefined);
  assert.equal(sourceUndefined.flagUrl, null);
});
