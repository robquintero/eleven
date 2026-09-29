/**
 * Architecture guard for Pass 8 brief §26: "UI must read Supabase only."
 * Opening /players, /team, /home, /matchup, /league must never trigger an
 * API-Football request — every provider call happens exclusively inside
 * `src/lib/football-ingestion/*` (the manually-invoked sync CLI). This
 * fails the suite if any application module imports the provider client,
 * its raw types, or the ingestion layer itself — a plain source scan, same
 * approach as `no-runtime-mock-imports.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const APPLICATION_ROOTS = ["src/app", "src/components", "src/data-access"];
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
