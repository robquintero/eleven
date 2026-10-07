import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import ts from "typescript";

type Element = { type: unknown; props: Record<string, unknown> };
const require = createRequire(import.meta.url), root = resolve(import.meta.dirname, "../..");
function load(file: string, state?: unknown, pending = false): Record<string, (props: Record<string, unknown>) => Element> {
  const filename = resolve(root, file), compiled = { exports: {} };
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const localRequire = (id: string): unknown => {
    if (id.endsWith(".css")) return {};
    if (id.startsWith("@/data-access/") || id.includes("/actions")) return new Proxy({}, { get: () => () => { throw Error("No action execution in UI inspection"); } });
    if (id === "react") return { ...require(id), useActionState: () => [state, () => {}, pending], useState: (value: unknown) => [value, () => {}], useEffect: () => {} };
    if (id === "next/navigation") return { useRouter: () => ({ push: () => {} }) };
    if (id === "@/components/ui/button") return { Button: (props: Record<string, unknown>) => ({ type: "button", props }) };
    if (id === "next/link" || id === "@/components/shell/transition-link") return { __esModule: true, default: (props: Record<string, unknown>) => ({ type: "a", props }), TransitionLink: (props: Record<string, unknown>) => ({ type: "a", props }) };
    if (id === "@/components/ui/input") return { Input: (props: Record<string, unknown>) => ({ type: "input", props }) };
    if (id === "lucide-react") return new Proxy({}, { get: () => () => null });
    if (id === "@/components/ui/dialog") return new Proxy({}, { get: () => (props: Record<string, unknown>) => ({ type: "div", props }) });
    if (id.startsWith("@/") || id.startsWith(".")) {
      const path = id.startsWith("@/") ? resolve(root, "src", id.slice(2)) : resolve(dirname(filename), id);
      const target = [path, path + ".tsx", path + ".ts"].find(p => existsSync(p) && /\.(ts|tsx)$/.test(p));
      if (target) return load(target, state, pending);
    }
    return require(id);
  };
  new Function("require", "module", "exports", code)(localRequire, compiled, compiled.exports);
  return compiled.exports;
}
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const el = value as Element;
  if (typeof el.type === "function") return nodes(el.type(el.props));
  return [el, ...nodes(el.props.children)];
}
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join("");
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (!value || typeof value !== "object" || !("props" in value)) return "";
  const el = value as Element;
  return text(typeof el.type === "function" ? el.type(el.props) : el.props.children);
}

test("auth forms preserve field names, browser autocomplete and existing signup validation", () => {
  const { AuthForm } = load("src/components/auth/auth-form.tsx");
  for (const mode of ["sign-in", "sign-up"]) {
    const fields = nodes(AuthForm({ mode, action: () => {} })).filter(el => el.type === "input");
    assert.deepEqual(fields.map(el => el.props.name), mode === "sign-in" ? ["email", "password"] : ["displayName", "email", "password"]);
    assert.equal(fields.find(el => el.props.name === "email")?.props.autoComplete, "email");
    const password = fields.find(el => el.props.name === "password")!;
    assert.equal(password.props.autoComplete, mode === "sign-in" ? "current-password" : "new-password");
    assert.equal(password.props.minLength, mode === "sign-in" ? undefined : 8);
  }
});
test("auth callback/server errors are accessible and pending disables submission", () => {
  const { AuthForm } = load("src/components/auth/auth-form.tsx", { error: "Please try again" }, true);
  const tree = AuthForm({ mode: "sign-in", action: () => {}, callbackError: "Expired link" });
  assert.equal(nodes(tree).filter(el => el.props.role === "alert").length, 2);
  assert.equal(nodes(tree).find(el => el.type === "form")?.props["aria-busy"], true);
  assert.equal(nodes(tree).find(el => el.type === "button" && el.props.type === "submit")?.props.disabled, true);
  assert.match(text(tree), /Signing in…/);
});
test("signup confirmation replaces editable fields and preserves the submitted email", () => {
  const email = "bartholomew.fitzgerald@northwind-industries-holdings.example.com";
  const { AuthForm } = load("src/components/auth/auth-form.tsx", { awaitingConfirmation: true, email });
  const tree = AuthForm({ mode: "sign-up", action: () => {} });
  assert.match(text(tree), /Check your email/); assert.ok(text(tree).includes(email));
  assert.equal(nodes(tree).filter(el => el.type === "input" && el.props.type !== "hidden").length, 0);
});
test("password recovery maintains neutral sent state and successful reset navigation", () => {
  const { ForgotPasswordForm } = load("src/components/auth/forgot-password-form.tsx", { sent: true });
  assert.match(text(ForgotPasswordForm({})), /If an account exists for that address/);
  const { ResetPasswordForm } = load("src/components/auth/reset-password-form.tsx", { updated: true });
  assert.match(text(ResetPasswordForm({})), /Password updated/);
  const normal = load("src/components/auth/reset-password-form.tsx").ResetPasswordForm({});
  assert.deepEqual(nodes(normal).filter(el => el.type === "input").map(el => [el.props.name, el.props.autoComplete, el.props.minLength]), [["password", "new-password", 8], ["confirmPassword", "new-password", 8]]);
});
test("onboarding offers both existing flows directly without redirecting both to the same page", () => {
  const { NoLeagueOnboarding } = load("src/components/shell/no-league-onboarding.tsx");
  const tree = NoLeagueOnboarding({});
  assert.match(text(tree), /Find your league/); assert.match(text(tree), /Create league/); assert.match(text(tree), /Join league/);
  assert.equal(nodes(tree).filter(el => el.type === "a").length, 0);
});
test("account deletion remains blocked for commissioners and exact typed-email confirmation stays disabled initially", () => {
  const { DeleteAccountSection } = load("src/components/account/delete-account-section.tsx");
  assert.equal(nodes(DeleteAccountSection({ email: "manager@example.com", blockedReason: "Transfer your league first." })).filter(el => el.type === "input").length, 0);
  const tree = DeleteAccountSection({ email: "manager@example.com", blockedReason: null });
  assert.equal(nodes(tree).find(el => el.type === "button")?.props.disabled, true);
  assert.equal(nodes(tree).find(el => el.type === "input")?.props.name, "confirmEmail");
});
test("account identity and league lists wrap full data and singular league copy stays correct", () => {
  const { AccountView } = load("src/components/account/account-view.tsx");
  const tree = AccountView({ identity: { displayName: "Jo", email: "manager@example.com", leaguesCreatedCount: 1 }, leagues: [{ id: "league", name: "InternationalFootballCollectiveWithoutSpaces", memberCount: 1, maxTeams: 16, role: "commissioner" }] });
  assert.ok(text(tree).includes("InternationalFootballCollectiveWithoutSpaces"));
  assert.match(text(tree), /1 league/); assert.doesNotMatch(text(tree), /1 leagues/);
  assert.equal(nodes(tree).filter(el => el.props.name === "confirmEmail").length, 0);
});
test("landing product proof is explicitly illustrative and uses visible semantic position labels", () => {
  const { LandingView } = load("src/components/public/landing-view.tsx");
  const tree = LandingView({});
  assert.match(text(tree), /Illustrative preview/);
  for (const label of ["GK", "DEF", "MID", "FWD", "Premier League", "La Liga", "Bundesliga", "Serie A", "Ligue 1"]) assert.ok(text(tree).includes(label));
  assert.equal(nodes(tree).filter(el => el.type === "img").length, 0);
});
