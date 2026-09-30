/**
 * Architecture guard for Pass 8 brief §26: "UI must read Supabase only."
 * Opening /players, /team, /home, /matchup, /league must never trigger an
 * API-Football request — every provider call happens exclusively inside
 * `src/lib/football-ingestion/*` (the manually-invoked sync CLI, or the one
 * documented exception below). This fails the suite if any application
 * module imports the provider client, its raw types, or the ingestion
 * layer itself — a plain source scan, same approach as
 * `no-runtime-mock-imports.test.ts`.
 *
 * EXEMPT: `src/app/api/cron/**` (Pass 9 §Phase 6). A Next.js route handler
 * under `api/cron` is never reached by a page load — it's the production
 * job entry point a deployed cron calls, authenticated by `CRON_SECRET`
 * (see its own module doc comment). It legitimately needs
 * `runLiveSyncTick` from the ingestion layer; that's its entire purpose.
 * The guard still applies to every actual page/component/data-access
 * module, and to any future `src/app/api/*` route NOT under `api/cron`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const APPLICATION_ROOTS = ["src/app", "src/components", "src/data-access"];
const EXEMPT_PATH_PREFIXES = ["src/app/api/cron/"];
const FORBIDDEN_SPECIFIERS = [
  "@/lib/football-providers/api-football",
  "@/lib/football-ingestion",
  "@/lib/supabase/admin",
];

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      collectFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

test("no application module imports the football provider client, raw provider types, the ingestion layer, or the admin Supabase client", () => {
  const offenders: string[] = [];

  for (const root of APPLICATION_ROOTS) {
    let files: string[];
    try {
      files = collectFiles(root);
    } catch {
      continue;
    }

    for (const file of files) {
      if (EXEMPT_PATH_PREFIXES.some((prefix) => file.startsWith(prefix))) continue;
      const contents = readFileSync(file, "utf8");
      for (const specifier of FORBIDDEN_SPECIFIERS) {
        if (contents.includes(specifier)) {
          offenders.push(`${file} imports "${specifier}"`);
        }
      }
    }
  }

  assert.deepEqual(offenders, []);
});

test("the api/cron exemption is exactly one route, not a broad carve-out", () => {
  const cronFiles = collectFiles("src/app/api/cron");
  assert.deepEqual(cronFiles, ["src/app/api/cron/football-live-tick/route.ts"]);
});
