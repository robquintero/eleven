import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SITE_URL,
  SITE_TITLE_TEMPLATE,
  CONTACT_EMAIL,
  COPYRIGHT_LINE,
  COPYRIGHT_YEAR,
  ATTRIBUTION_LINE,
  SOCIAL_IMAGE_WIDTH,
  SOCIAL_IMAGE_HEIGHT,
} from "./site-config.ts";

test("SITE_URL is the canonical production origin, not a Vercel/preview URL, with no trailing slash", () => {
  assert.equal(SITE_URL, "https://elevenfantasy.com");
  assert.ok(!SITE_URL.includes("vercel"));
  assert.ok(!SITE_URL.endsWith("/"));
});

test("SITE_TITLE_TEMPLATE interpolates a page title before the site name", () => {
  assert.ok(SITE_TITLE_TEMPLATE.includes("%s"));
  assert.equal(SITE_TITLE_TEMPLATE.replace("%s", "Team"), "Team — Eleven");
});

test("CONTACT_EMAIL is a well-formed address at the verified operator domain", () => {
  assert.match(CONTACT_EMAIL, /^[^\s@]+@quinterodigital\.com$/);
});

test("COPYRIGHT_LINE embeds the current COPYRIGHT_YEAR constant, not a hardcoded duplicate", () => {
  assert.ok(COPYRIGHT_LINE.includes(String(COPYRIGHT_YEAR)));
});

test("ATTRIBUTION_LINE names the real operator, not a placeholder", () => {
  assert.equal(ATTRIBUTION_LINE, "Developed solely by Quintero Digital");
});

test("social image dimensions match the standard Open Graph convention", () => {
  assert.equal(SOCIAL_IMAGE_WIDTH, 1200);
  assert.equal(SOCIAL_IMAGE_HEIGHT, 630);
});
