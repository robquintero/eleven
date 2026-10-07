import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import ts from "typescript";

const require = createRequire(import.meta.url), root = resolve(import.meta.dirname, "../..");
type Element = { type: unknown; props: Record<string, unknown> };
// Inspect the actual presenters, with no credentials/network/action execution.
function load(file: string): Record<string, (props: Record<string, unknown>) => Element> {
  const filename = resolve(root, file), compiled = { exports: {} };
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const localRequire = (id: string): unknown => {
    if (id.endsWith(".css")) return {};
    if (id.startsWith("@/data-access/") || id.includes("/actions")) throw Error("Unexpected server dependency " + id);
    if (id === "react") return { ...require(id), useState: (value: unknown) => [value, () => {}] };
    if (id === "@/components/ui/button") return { Button: (props: Record<string, unknown>) => ({ type: "button", props }) };
    if (id === "@/components/shell/transition-link") return { TransitionLink: (props: Record<string, unknown>) => ({ type: "a", props }) };
    if (id === "lucide-react") return new Proxy({}, { get: () => () => null });
    if (id.startsWith("@/") || id.startsWith(".")) {
      const path = id.startsWith("@/") ? resolve(root, "src", id.slice(2)) : resolve(dirname(filename), id);
      const target = [path, path + ".tsx", path + ".ts"].find(p => existsSync(p) && /\.(ts|tsx)$/.test(p));
      if (target) return load(target);
    }
    return require(id);
  };
  new Function("require", "module", "exports", code)(localRequire, compiled, compiled.exports);
  return compiled.exports;
}
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const element = value as Element;
  if (typeof element.type === "function") return nodes(element.type(element.props));
  return [element, ...nodes(element.props.children)];
}
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join("");
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (!value || typeof value !== "object" || !("props" in value)) return "";
  const element = value as Element;
  return text(typeof element.type === "function" ? element.type(element.props) : element.props.children);
}
const player = { id: "player", name: "LongFootballerNameWithoutSpaces", position: "MID", club: { id: "club", shortName: "LIV", league: "premier-league" }, availability: "available", ownership: "free" };

test("scouting table exposes native inspect buttons separately from roster actions and preserves unknown/zero points", () => {
  const { PlayerTable } = load("src/components/players/player-table.tsx");
  const tree = PlayerTable({ players: [player, { ...player, id: "zero", totalPoints: 0 }], selectedId: "player", highlightedId: null, sort: "points", onSort: () => {}, onSelect: () => {}, onAdd: () => {} });
  assert.equal(nodes(tree).filter(e => e.type === "table").length, 1);
  assert.equal(nodes(tree).filter(e => e.props["aria-label"] === `Inspect ${player.name}`).length, 2);
  assert.equal(nodes(tree).filter(e => e.type === "div" && e.props.role === "button").length, 0);
  assert.equal(nodes(tree).filter(e => e.type === "button" && nodes(e.props.children).some(child => child.type === "button")).length, 0);
  const points = nodes(tree).filter(e => e.type === "td" && String(e.props.className).includes("core-catalog-points"));
  assert.deepEqual(points.map(e => text(e.props.children)), ["—", "0"]);
});

test("mobile results retain visible position, ownership and points with independent native actions", () => {
  const { PlayerListMobile } = load("src/components/players/player-list-mobile.tsx");
  const tree = PlayerListMobile({ players: [{ ...player, totalPoints: 12.35 }, { ...player, id: "owned", ownership: "owned" }], selectedId: null, onSelect: () => {}, onAdd: () => {} });
  assert.equal(nodes(tree).filter(e => e.type === "li").length, 2);
  assert.equal(nodes(tree).filter(e => e.type === "button" && nodes(e.props.children).some(child => child.type === "button")).length, 0);
  assert.match(text(tree), /MID/); assert.match(text(tree), /12.35/); assert.match(text(tree), /OWNED/);
});

test("Inspector separates missing season data from genuine zero values and has semantic stat groups", () => {
  const { PlayerInspectorContent } = load("src/components/players/player-inspector-content.tsx");
  const missing = PlayerInspectorContent({ player, recentMatches: [], scoreBreakdown: null });
  assert.match(text(missing), /Season performance/); assert.match(text(missing), /Not enough match data/);
  assert.ok(nodes(missing).filter(e => e.type === "dd").every(e => text(e.props.children) === "—"));
  const scored = PlayerInspectorContent({ player: { ...player, totalPoints: 0, averagePoints: 0, seasonStats: { appearances: 0, starts: 0, minutes: 0, goals: 0, assists: 0 } }, recentMatches: [], scoreBreakdown: null });
  assert.ok(nodes(scored).filter(e => e.type === "dd").every(e => text(e.props.children) === "0"));
  assert.ok(nodes(scored).some(e => e.type === "h3" && text(e.props.children) === "Latest score breakdown"));
});

test("Inspector retains read-only ownership actions and disabled drop for a locked own-roster player", () => {
  const { PlayerInspectorContent } = load("src/components/players/player-inspector-content.tsx");
  const inspected = PlayerInspectorContent({ player: { ...player, ownership: "mine", fixture: { state: "locked", kickoff: "2026-10-07T12:00:00Z" } }, recentMatches: [], scoreBreakdown: null });
  assert.equal(nodes(inspected).filter(e => e.type === "button" && /Move to|Drop player/.test(text(e.props.children))).length, 0);
  const editable = PlayerInspectorContent({ player: { ...player, ownership: "mine", fixture: { state: "locked", kickoff: "2026-10-07T12:00:00Z" } }, recentMatches: [], scoreBreakdown: null, onRequestDrop: () => {} });
  const drop = nodes(editable).find(e => e.type === "button" && text(e.props.children) === "Drop player");
  assert.equal(drop?.props.disabled, true);
});
