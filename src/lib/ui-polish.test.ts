import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "../..");
type Element = { type: unknown; props: Record<string, unknown> };
// Inspect the actual presentation tree without a browser, credentials, or data access.
function load(file: string): Record<string, (props: Record<string, unknown>) => Element> {
  const filename = resolve(root, file);
  const compiledModule = { exports: {} };
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const localRequire = (id: string): unknown => {
    if (id.startsWith("@/data-access/") || id.includes("/actions")) throw new Error(`Unexpected server dependency: ${id}`);
    if (id === "lucide-react") return new Proxy({}, { get: () => () => null });
    if (id === "@/components/players/player-avatar") return { PlayerAvatar: () => null };
    if (id.startsWith("@/") || id.startsWith(".")) {
      const path = id.startsWith("@/") ? resolve(root, "src", id.slice(2)) : resolve(dirname(filename), id);
      const target = [path, path + ".tsx", path + ".ts"].find(p => existsSync(p) && /\.(ts|tsx)$/.test(p));
      if (target) return load(target);
    }
    return require(id);
  };
  new Function("require", "module", "exports", code)(localRequire, compiledModule, compiledModule.exports);
  return compiledModule.exports;
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
const names = ["Kaka FC", "75 Hard", "Los Duros FC", "NiceTryBuddy", "Manchester Athletic Collective", "South Florida Football Club"];

test("team identity preserves every complete name and accessible title, including unbroken stress names", () => {
  const { TeamName } = load("src/components/ui/team-name.tsx");
  for (const name of [...names, "InternationalFootballCollectiveWithoutSpaces"]) {
    const element = TeamName({ name });
    assert.equal(text(element), name);
    assert.equal(element.props.title, name);
  }
});

test("all position badges identify the complete role even in compact comparison rows", () => {
  const { PositionBadge } = load("src/components/players/position-badge.tsx");
  for (const [position, letter] of Object.entries({ GK: "G", DEF: "D", MID: "M", FWD: "F" })) {
    assert.equal(text(PositionBadge({ position })), position);
    const compact = PositionBadge({ position, compact: true });
    assert.equal(text(compact), letter);
    assert.equal(compact.props["aria-label"], position);
  }
});

test("scoreboard keeps user's full identity and exact score on the left in home and away matchups", () => {
  const { MatchupCommand } = load("src/components/dashboard/matchup-command.tsx");
  for (const isUserHome of [true, false]) {
    for (let i = 0; i < names.length; i++) {
      const mine = names[i], opponent = names[(i + 1) % names.length];
      const matchup = { isUserHome, homeTeamName: isUserHome ? mine : opponent, awayTeamName: isUserHome ? opponent : mine,
        homeLivePoints: isUserHome ? 152.1 : 141.15, awayLivePoints: isUserHome ? 141.15 : 152.1,
        homeFinalPoints: null, awayFinalPoints: null, status: "scheduled", roundStatus: "in_progress", roundNumber: 1, scoresUpdatedAt: null };
      const tree = MatchupCommand({ matchup, hasLeague: true, now: new Date("2026-10-06T00:00:00Z") });
      const result = text(tree);
      assert.ok(result.indexOf(mine) < result.indexOf(opponent));
      assert.ok(result.indexOf("152.1") < result.indexOf("141.15"));
      assert.match(result, /YOUR TEAM/);
      assert.doesNotMatch(result, /VS/);
      const titles = nodes(tree).filter(node => node.props.title).map(node => node.props.title);
      assert.ok(titles.includes(mine)); assert.ok(titles.includes(opponent));
      const upcoming = text(MatchupCommand({ matchup: { ...matchup, roundStatus: "upcoming" }, hasLeague: true, now: new Date() }));
      assert.match(upcoming, /VS/); assert.doesNotMatch(upcoming, /152.1|141.15/);
    }
  }
});

test("roster presentation retains wrong-position protection and explanatory locked-row interaction", () => {
  const { BenchRow, EmptySlotRow } = load("src/components/team/bench-row.tsx");
  const player = { id: "qa", name: "Very Long Player Identity", position: "DEF", fantasyPoints: 12.35,
    club: { shortName: "CLB" }, fixture: { state: "final", opponent: "OPP", isHome: true } };
  let selected = 0;
  const onSelect = () => { selected++; };
  const locked = nodes(BenchRow({ index: 0, player, editing: true, onSelect })).find(n => n.type === "button")!;
  assert.equal(locked.props.disabled, false);
  assert.match(String(locked.props["aria-label"]), /locked/);
  (locked.props.onClick as () => void)(); assert.equal(selected, 1);
  const wrong = nodes(BenchRow({ index: 0, player, disabled: true, onSelect })).find(n => n.type === "button")!;
  assert.equal(wrong.props.disabled, true);
  assert.match(String(wrong.props["aria-label"]), /wrong position/);
  const empty = nodes(EmptySlotRow({ position: "DEF", editing: false, onSelect })).find(n => n.type === "button")!;
  assert.equal(empty.props.disabled, true);
  assert.equal(empty.props["aria-label"], "Empty DEF slot");
});
