import { test } from "node:test";
import assert from "node:assert/strict";
import { authErrorMessage } from "./auth-error.ts";

test("null/undefined error returns the fallback, never a crash", () => {
  assert.equal(authErrorMessage(null, "fallback"), "fallback");
  assert.equal(authErrorMessage(undefined, "fallback"), "fallback");
});

test("an unrecognized code returns the fallback, never a raw/unknown string", () => {
  assert.equal(authErrorMessage({ code: "some_future_code_not_in_the_switch" }, "fallback"), "fallback");
});

test("email_not_confirmed produces distinct, truthful copy -- never confused with a wrong password", () => {
  const message = authErrorMessage({ code: "email_not_confirmed" }, "fallback");
  assert.notEqual(message, "fallback");
  assert.match(message.toLowerCase(), /confirm/);
});

test("invalid_credentials and email_not_confirmed never produce the same message", () => {
  const wrongPassword = authErrorMessage({ code: "invalid_credentials" }, "fallback");
  const unconfirmed = authErrorMessage({ code: "email_not_confirmed" }, "fallback");
  assert.notEqual(wrongPassword, unconfirmed);
});

test("user_already_exists, email_exists, and identity_already_exists all produce the SAME neutral copy -- anti-enumeration", () => {
  const a = authErrorMessage({ code: "user_already_exists" }, "fallback");
  const b = authErrorMessage({ code: "email_exists" }, "fallback");
  const c = authErrorMessage({ code: "identity_already_exists" }, "fallback");
  assert.equal(a, b);
  assert.equal(b, c);
  assert.notEqual(a, "fallback");
});

test("rate-limit codes produce a 'try again later' style message, not a raw Supabase string", () => {
  for (const code of ["over_email_send_rate_limit", "over_request_rate_limit", "over_sms_send_rate_limit"]) {
    const message = authErrorMessage({ code }, "fallback");
    assert.match(message.toLowerCase(), /too many|wait/);
  }
});

test("expired-link codes mention expiry, invalid-link codes mention invalid/already used", () => {
  assert.match(authErrorMessage({ code: "otp_expired" }, "fallback").toLowerCase(), /expired/);
  assert.match(authErrorMessage({ code: "flow_state_expired" }, "fallback").toLowerCase(), /expired/);
  assert.match(authErrorMessage({ code: "flow_state_not_found" }, "fallback").toLowerCase(), /invalid|already/);
  assert.match(authErrorMessage({ code: "bad_code_verifier" }, "fallback").toLowerCase(), /invalid|already/);
});

test("never returns a raw code string verbatim as the message for any mapped code", () => {
  const codes = [
    "email_not_confirmed",
    "invalid_credentials",
    "user_already_exists",
    "over_email_send_rate_limit",
    "weak_password",
    "user_banned",
    "same_password",
    "session_expired",
  ];
  for (const code of codes) {
    const message = authErrorMessage({ code }, "fallback");
    assert.notEqual(message, code, `code "${code}" leaked verbatim instead of being translated`);
  }
});
