import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createElement, type ReactNode } from "react";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "../../..");
const { renderToReadableStream } = require("next/dist/compiled/react-server-dom-webpack/server.node.js");

// Transpile the actual TSX in memory; no build artifacts, Next server,
// credentials or network. Only data-access and client framework bindings
// are substituted. Unlisted data-access imports fail closed.
function load(file: string, mocks: Record<string, unknown> = {}): Record<string, unknown> {
  const filename = resolve(root, file);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const compiled = { exports: {} };
  const localRequire = (id: string): unknown => {
    if (id in mocks) return mocks[id];
    if (id.startsWith("@/data-access/")) throw new Error(`Unmocked data access: ${id}`);
    if (id.startsWith("@/") || id.startsWith(".")) {
      const path = id.startsWith("@/") ? resolve(root, "src", id.slice(2)) : resolve(dirname(filename), id);
      const target = /\.(tsx|ts)$/.test(path) ? path : [path + ".tsx", path + ".ts"].find(path => { try { readFileSync(path); return true; } catch { return false; } });
      if (target) return load(target, mocks);
    }
    return require(id);
  };
  new Function("require", "module", "exports", code)(localRequire, compiled, compiled.exports);
  return compiled.exports;
}
async function flight(element: ReactNode): Promise<string> {
  const stream = await renderToReadableStream(element, {});
  return new Response(stream).text();
}

test("Game Rules V4 renders every real configuration rate and omits unsupported FFSL categories", async () => {
  const { ScoringRulesV4 } = load("src/components/players/scoring-rules-v4.tsx");
  const result = await flight(createElement(ScoringRulesV4 as () => ReactNode));
  const { SCORING_V4_STATS } = await import("../../domain/fantasy/scoring-v4.ts");
  for (const rule of SCORING_V4_STATS) assert.ok(result.includes(rule.label));
  assert.match(result, /Shot.*Shot on Target.*Goal/);
  assert.match(result, /MID.*0.20/); assert.match(result, /FWD.*0.15/);
  assert.doesNotMatch(result, /TARRIES|AERIALS WON|TACKLES WON|ACCURATE PASSES|BIG CHANCES CREATED|SAVES INSIDE BOX/);
});
test("actual Game Rules dialog reports canonical V4 by default and keeps historical rules readable", async () => {
  const { GameRulesDialog } = load("src/components/shell/game-rules-dialog.tsx", {
    react: { useState: () => [true, () => {}] },
    "lucide-react": { Info: () => createElement("svg") },
    "@/components/ui/dialog": new Proxy({}, { get: () => ({ children }: { children?: ReactNode }) => createElement("div", {}, children) }),
  });
  const v4 = await flight(createElement(GameRulesDialog as () => ReactNode, { version: "ELEVEN_STANDARD_V4" }));
  assert.match(v4, /SCORING.*V4/); assert.match(v4, /DUELS WON/); assert.doesNotMatch(v4, /V3 scores only/);
  const current = await flight(createElement(GameRulesDialog as () => ReactNode));
  assert.match(current, /SCORING.*V4/); assert.match(current, /DUELS WON/);
  const historical = await flight(createElement(GameRulesDialog as () => ReactNode, { version: "ELEVEN_STANDARD_V3" }));
  assert.match(historical, /SCORING.*V3/); assert.doesNotMatch(historical, /DUELS WON/);
});
test("inspector V4 groups exact persisted contributions, negatives and positional multipliers without zero noise", async () => {
  const { calculateFantasyScoreV4 } = await import("../../domain/fantasy/scoring-v4.ts");
  const detail = calculateFantasyScoreV4({ position: "MID", stats: { duelsWon: 7, interceptions: 4, yellowCards: 1 }, concededByOwnTeam: null });
  const { ScoringBreakdown } = load("src/components/players/scoring-breakdown.tsx");
  const result = await flight(createElement(ScoringBreakdown as () => ReactNode, { breakdown: { fixtureId: "f", opponent: "OPP", isHome: true, kickoffAt: "2026-10-07T00:00:00Z", total: detail.total, components: detail.components, detail } }));
  assert.match(result, /DUELS WON/); assert.match(result, /MID 0.20/); assert.match(result, /MID 0.25/);
  assert.match(result, /-1.00/); assert.match(result, /1.40/); assert.doesNotMatch(result.split("\n").filter(line => /^[a-f0-9]+:\[/.test(line)).join("\n"), /SHOTS ON TARGET/);
  assert.equal(detail.entries.reduce((n, e) => n + e.units, 0), detail.totalUnits);
});

test("Inspector opened from a settled V3 matchup requests canonical history, never the matchup's old model", async () => {
  const requests: unknown[][] = [];
  const { PlayerInspector } = load("src/components/players/player-inspector.tsx", {
    react: { useEffect: (run: () => unknown) => run(), useState: () => [null, () => {}] },
    "@base-ui/react/unstable-use-media-query": { useMediaQuery: () => true },
    "@/components/players/player-inspector-content": { PlayerInspectorContent: () => createElement("div") },
    "@/components/ui/sheet": new Proxy({}, { get: () => ({ children }: { children?: ReactNode }) => createElement("div", {}, children) }),
    "@/app/(app)/players/actions": {
      getPlayerRecentMatchesAction: (...args: unknown[]) => { requests.push(args); return Promise.resolve([]); },
      getPlayerScoreBreakdownAction: (...args: unknown[]) => { requests.push(args); return Promise.resolve(null); },
    },
  });
  await flight(createElement(PlayerInspector as () => ReactNode, { player: { id: "historical-player", scoringRuleVersion: "ELEVEN_STANDARD_V3" }, variant: "inline", open: true, onOpenChange: () => {} }));
  assert.deepEqual(requests, [["historical-player"], ["historical-player"]]);
});
