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
 *
 * EXEMPT: specific Server Action files, listed exactly in
 * `EXEMPT_EXACT_PATHS` below (Pass 10). No fantasy game-state table
 * (`lineup_slots`, `roster_entries`, etc.) has an INSERT/UPDATE policy for
 * `authenticated` — by the same established convention as the SQL
 * SECURITY DEFINER functions (see supabase/migrations/20260929141143_rls.sql's
 * own header comment), a handful of privileged mutations that can't be
 * expressed as one atomic SQL function go through a Server Action that
 * FIRST independently verifies the caller's real ownership via their own
 * RLS-respecting session, THEN uses the admin client for the write itself
 * — never the reverse. Each exempted file's own doc comment explains why.
 *
 * The guard still applies to every actual page/component/data-access
 * module, and to any future file not explicitly listed here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const APPLICATION_ROOTS = ["src/app", "src/components", "src/data-access"];
const EXEMPT_PATH_PREFIXES = ["src/app/api/cron/"];
/** Exact file paths (not prefixes) permitted to import `@/lib/supabase/admin` for a privileged fantasy-engine write — see the module doc comment above. Keep this list narrow; add a file only alongside a doc comment in that file explaining the specific privileged mutation it performs. */
const EXEMPT_EXACT_PATHS = ["src/app/(app)/team/actions.ts", "src/app/(app)/draft/actions.ts"];
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
      if (EXEMPT_EXACT_PATHS.includes(file)) continue;
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

test("every exact-path Server Action exemption actually exists and does explain itself", () => {
  for (const path of EXEMPT_EXACT_PATHS) {
    const contents = readFileSync(path, "utf8");
    assert.ok(contents.includes("@/lib/supabase/admin"), `${path} is listed as exempt but no longer imports the admin client -- remove it from EXEMPT_EXACT_PATHS`);
    assert.ok(/no.*(insert|update).*polic|privileged/i.test(contents), `${path} should document WHY it needs the admin client (no RLS write policy exists, etc.)`);
  }
});
