/**
 * Manual, opt-in connectivity check — run with `npm run football:check`.
 * NOT a route, NOT wired into any page or API endpoint. Makes exactly one
 * cheap request (`GET /status`) and prints only non-secret summary
 * fields — never the API key, never raw response headers.
 *
 * This is intentionally the only place in the codebase that's expected
 * to be run manually against the live provider outside of real
 * ingestion code (which doesn't exist yet — see docs/architecture.md).
 */

import { getStatus } from "./client.ts";

async function main() {
  console.log("provider: api-football");

  try {
    const { data, meta } = await getStatus();
    const account = data.response[0];

    console.log("status: connected");
    console.log("request successful: yes");

    if (account?.subscription) {
      console.log(`plan: ${account.subscription.plan} (active: ${account.subscription.active})`);
    }

    if (meta.quota.dailyRemaining !== undefined) {
      const limit = meta.quota.dailyLimit !== undefined ? ` / ${meta.quota.dailyLimit}` : "";
      console.log(`quota remaining (daily, from headers): ${meta.quota.dailyRemaining}${limit}`);
    } else if (account?.requests) {
      const remaining = account.requests.limit_day - account.requests.current;
      console.log(`quota remaining (daily, from response body): ${remaining} / ${account.requests.limit_day}`);
    } else {
      console.log("quota remaining: not reported on this response");
    }

    if (meta.quota.minuteRemaining !== undefined) {
      const limit = meta.quota.minuteLimit !== undefined ? ` / ${meta.quota.minuteLimit}` : "";
      console.log(`quota remaining (per-minute, from headers): ${meta.quota.minuteRemaining}${limit}`);
    }
  } catch (err) {
    console.log("status: failed");
    console.log("request successful: no");
    console.log(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}

main();
