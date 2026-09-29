/**
 * Architecture guard for docs/product-state.md's core rule: MOCKS TEST
 * ELEVEN, MOCKS DO NOT POWER ELEVEN. Fails the suite if any production
 * runtime module (app routes, components, data-access) imports a mock
 * dataset — deliberately a plain source-scan, not a real dependency-graph
 * analyzer, since that's all this needs (see Pass 7.5 brief §16: "Do not
 * create a fragile dependency-analysis system just for this").
 *
 * `src/data/mocks/*` is exempt from the *usage* check below because it is
 * itself the one allowed non-test illustrative fixture (see its own module
 * doc comment) — this guard instead asserts nothing imports it, which is
 * the same rule from the other direction.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PRODUCTION_ROOTS = ["src/app", "src/components", "src/data-access"];
const FORBIDDEN_SPECIFIERS = ["@/lib/mock", "@/data/mocks"];

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

test("no production runtime module imports a mock dataset", () => {
  const offenders: string[] = [];

  for (const root of PRODUCTION_ROOTS) {
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
