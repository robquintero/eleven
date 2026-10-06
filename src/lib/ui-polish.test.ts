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
    if (id === "@/components/shell/transition-link") return { TransitionLink: (props: Record<string, unknown>) => ({type:"a",props}) };
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

test("normal, compact and inline position labels share one semantic tone without changing badge geometry", () => {
  const { PositionBadge, PositionLabel } = load("src/components/players/position-badge.tsx");
  for (const position of ["GK", "DEF", "MID", "FWD"]) {
    const badge = PositionBadge({ position });
    const compact = PositionBadge({ position, compact: true });
    const label = PositionLabel({ position });
    const tone = `text-position-${position.toLowerCase()}`;
    for (const element of [badge, compact, label]) {
      assert.ok(String(element.props.className).split(" ").includes(tone));
      assert.equal(element.props["aria-label"], position);
    }
    assert.equal(text(label), position);
    assert.match(String(badge.props.className), /w-9 py-1/);
    assert.match(String(compact.props.className), /w-3 py-0\.5/);
  }
  const unknown = PositionLabel({ position: "UNKNOWN" });
  assert.equal(text(unknown), "UNKNOWN");
  assert.equal(unknown.props.className, undefined);
});

test("position text meets 4.5:1 contrast on dark/light surfaces and selected, hover and subtle badge backgrounds", () => {
  const css = readFileSync(resolve(root, "src/app/globals.css"), "utf8");
  type RGB = [number, number, number];
  const rgb = (hex: string): RGB => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as RGB;
  const mix = (front: RGB, back: RGB, alpha: number): RGB => front.map((n, i) => n * alpha + back[i] * (1 - alpha)) as RGB;
  const luminance = (color: RGB) => color.map(n => n / 255).map(n => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4)
    .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
  const contrast = (a: RGB, b: RGB) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
  for (const theme of [":root", ".dark"]) {
    const block = css.slice(css.indexOf(`${theme} {`)).split("}")[0];
    const token = (name: string) => rgb(block.match(new RegExp(`--${name}: (#[0-9a-f]{6});`))![1]);
    const surfaces = ["background", "surface", "surface-elevated"].map(token);
    const rowBackgrounds = surfaces.flatMap(surface => [surface, mix(token("accent"), surface, 0.1), mix(token("warning"), surface, 0.05), mix(token("foreground"), surface, 0.05)]);
    for (const position of ["gk", "def", "mid", "fwd"]) {
      const color = token(`position-${position}`);
      for (const surface of rowBackgrounds) {
        for (const background of [surface, mix(color, surface, 0.1)]) {
          assert.ok(contrast(color, background) >= 4.5, `${theme} ${position}: ${contrast(color, background).toFixed(2)}:1`);
        }
      }
    }
  }
});

test("scoreboard keeps user's full identity and exact score on the left in home and away matchups", () => {
  const { MatchupCommand } = load("src/components/dashboard/matchup-command.tsx");
  for (const isUserHome of [true, false]) {
    for (let i = 0; i < names.length; i++) {
      const mine = names[i], opponent = names[(i + 1) % names.length];
      const matchup = { isUserHome, homeTeamName: isUserHome ? mine : opponent, awayTeamName: isUserHome ? opponent : mine,
        homeLivePoints: isUserHome ? 152.1 : 141.15, awayLivePoints: isUserHome ? 141.15 : 152.1,
        homeFinalPoints: null, awayFinalPoints: null, status: "scheduled", roundStatus: "in_progress", roundNumber: 1, scoresUpdatedAt: null,
        roundStartsAt: "2026-09-29T06:00:00Z", roundEndsAt: "2090-01-03T06:00:00Z" };
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
