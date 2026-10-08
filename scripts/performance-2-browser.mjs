/** Isolated UI probe: no Next server, env files, database, provider or external
 * requests. Uses installed React/components with fake action promises.
 * Run: ELEVEN_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/performance-2-browser.mjs
 * Playwright is a diagnostic tool only, not an application dependency.
 */
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { webpack } = require("next/dist/compiled/webpack/webpack");
const root = resolve(import.meta.dirname, "..");
const directory = await mkdtemp(join(tmpdir(), "eleven-performance2-"));
// Optional executable override supports an already-installed offline Chromium.
const { chromium } = await import(process.env.ELEVEN_PLAYWRIGHT_MODULE ?? "playwright");
let browser;
try {
  await writeFile(join(directory, "loader.cjs"), `const ts = require(${JSON.stringify(require.resolve("typescript"))}); module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;};`);
  await writeFile(join(directory, "css-loader.cjs"), `module.exports=()=>'';`);
  await writeFile(join(directory, "actions.js"), `
export const swapLineupAction = (...args) => window.action("swap", args);
export const fillEmptySlotsAction = (...args) => window.action("fill", args);
export const signPlayerAction = (...args) => window.action("sign", args);
export const dropPlayerAction = (...args) => window.action("drop", args);
export const getPlayerRecentMatchesAction = () => { window.inspectorReads++; return Promise.resolve([]); };
export const getPlayerScoreBreakdownAction = () => { window.inspectorReads++; return Promise.resolve(null); };
`);
  await writeFile(join(directory, "navigation.jsx"), `
import React from 'react';
export const useRouter = () => ({ push: (...args) => window.navigate(...args) });
export const usePathname = () => '/players';
export const useLinkStatus = () => ({ pending: false });
export default function Link({ children, ...props }) { return <a {...props}>{children}</a>; }
`);
  await writeFile(join(directory, "entry.jsx"), `
import React, { useState, startTransition } from 'react';
import { createRoot } from 'react-dom/client';
import { TeamWorkspace } from ${JSON.stringify(join(root, "src/components/team/team-workspace.tsx"))};
import { PlayersWorkspace } from ${JSON.stringify(join(root, "src/components/players/players-workspace.tsx"))};
import { WorkspaceLoading } from ${JSON.stringify(join(root, "src/components/shell/workspace-loading.tsx"))};
import { DesktopNav } from ${JSON.stringify(join(root, "src/components/shell/desktop-nav.tsx"))};
import { MobileNav } from ${JSON.stringify(join(root, "src/components/shell/mobile-nav.tsx"))};
import { MatchupCommand } from ${JSON.stringify(join(root, "src/components/dashboard/matchup-command.tsx"))};
import { MatchupLineups } from ${JSON.stringify(join(root, "src/components/matchup/matchup-lineups.tsx"))};
import { defaultFilters } from ${JSON.stringify(join(root, "src/lib/players-filters.ts"))};
window.calls=[]; window.inspectorReads=0;
window.action=(kind,args)=>new Promise((resolve,reject)=>{window.calls.push({kind,args});window.actionStart=performance.now();
if(kind==='swap')window.optimisticPaint=new Promise(done=>{const observer=new MutationObserver(()=>{const names=[...document.querySelectorAll('section button p.text-sm')].map(p=>p.textContent);if(names.includes(args[3])&&!names.includes(args[2])){observer.disconnect();requestAnimationFrame(()=>done(performance.now()-window.actionStart));}});observer.observe(document.getElementById('root'),{subtree:true,childList:true,characterData:true});});
window.settle=resolve;window.rejectAction=()=>reject(new Error('network'));});
const club={id:'club',name:'Club',shortName:'CLB',league:'premier-league',crestColor:'#000'};
const player=(id,position)=>({id,externalId:id,name:id,position,club,fantasyPoints:0,ownership:'free',availability:'available'});
const positions=['GK','DEF','DEF','DEF','DEF','MID','MID','MID','MID','FWD','FWD'];
const initial={formation:'4-4-2',starters:positions.map((position,i)=>({id:'entry'+i,position,x:0,y:0,locked:false,player:player('STARTER'+i,position)})),bench:[player('BENCH_DEF','DEF'),player('BENCH_MID','MID'),player('BENCH_GK','GK'),player('BENCH_FWD','FWD'),player('BENCH_DEF2','DEF')]};
const matchup={id:'matchup',isUserHome:false,homeTeamName:'OPPONENT',awayTeamName:'MY TEAM',homeLivePoints:7,awayLivePoints:19,homeFinalPoints:null,awayFinalPoints:null,roundNumber:1,roundStatus:'in_progress',status:'scheduled',scoresUpdatedAt:null};
function Harness(){
 const [squad,setSquad]=useState(initial); const [mode,setMode]=useState('Team'); const [revision,setRevision]=useState(0);
 const [filters,setFilters]=useState(defaultFilters);const [data,setData]=useState({players:initial.bench,total:5,pageSize:50});
 window.mount=(next,missing=false)=>{setMode(next);setRevision(v=>v+1);setSquad(missing?{...initial,starters:initial.starters.filter(s=>s.player.id!=='STARTER1')}:initial);setFilters(defaultFilters);setData({players:initial.bench,total:5,pageSize:50});window.calls=[];window.inspectorReads=0;};
 window.confirm=()=>{const change=window.calls.at(-1).args;startTransition(()=>{setSquad(prev=>{const out=prev.starters.find(s=>s.player.id===change[2]);const incoming=prev.bench.find(p=>p.id===change[3]);return {...prev,starters:prev.starters.map(s=>s===out?{...s,id:'canonical-'+incoming.id,player:{...incoming,fantasyPoints:11}}:s).reverse(),bench:prev.bench.map(p=>p===incoming?out.player:p).reverse()};});window.settle();});};
 window.navigate=(url,options)=>{window.calls.push({kind:'navigate',url,options});startTransition(async()=>{await new Promise(resolve=>window.finishNavigation=resolve);const query=new URL(url,'http://local').searchParams.get('q')??'';setFilters({...defaultFilters,query});setData({players:[],total:0,pageSize:50});});};
 if(mode==='Team')return <TeamWorkspace key={revision} squad={squad} matchdayNumber={1} hasActiveRound leagueId='league' fantasyTeamId='mine'/>;
 if(mode==='Players')return <PlayersWorkspace acquisitionState="allowed" key={revision} data={data} filters={filters} page={1} competitions={[{id:'comp',code:'ENG'}]} clubs={[]} hasActiveLeague leagueId='league' fantasyTeamId='mine'/>;
 if(mode==='Navigation')return <><div className='hidden lg:block'><DesktopNav/></div><MobileNav/></>;
 if(mode==='Matchup')return <><MatchupCommand matchup={matchup} hasLeague now={new Date('2026-10-05T00:00:00Z')}/><MatchupLineups homeTeamName='OPPONENT' awayTeamName='MY TEAM' isUserHome={false} homeSquad={initial} awaySquad={initial}/></>;
 return <WorkspaceLoading destination={mode.replace("Loading", "")}/>;
}
createRoot(document.getElementById('root')).render(<Harness/>);
`);
  await new Promise((done, fail) => webpack({ mode: "production", optimization: { minimize: false }, context: root, entry: join(directory, "entry.jsx"), output: { path: directory, filename: "bundle.js" },
    resolve: { extensions: [".tsx", ".ts", ".jsx", ".js"], modules: [join(root, "node_modules")], alias: { "@": join(root, "src"), "next/navigation$": join(directory, "navigation.jsx"), "next/link$": join(directory, "navigation.jsx") } },
    module: { rules: [{test:/\.css$/,use:join(directory,"css-loader.cjs")},{ test: /\.(tsx?|jsx)$/, exclude: /node_modules/, use: join(directory, "loader.cjs") }] },
    plugins: [new webpack.NormalModuleReplacementPlugin(/app\/\(app\)\/(team|players)\/actions/, join(directory, "actions.js"))],
  }, (error, stats) => error || stats.hasErrors() ? fail(error ?? new Error(stats.toString({ all: false, errors: true }))) : done()));
  // Generate the real Tailwind styles in temp storage for layout/mobile checks.
  const postcss = require("postcss");
  const tailwind = require("@tailwindcss/postcss");
  const { css: baseCss } = await postcss([tailwind({ base: root })]).process(await readFile(join(root, "src/app/globals.css"), "utf8"), { from: join(root, "src/app/globals.css") });
  const css=baseCss+"\n"+await readFile(join(root,"src/components/ui/core-v2.css"),"utf8");
  browser = await chromium.launch({ headless: true, executablePath: process.env.ELEVEN_CHROMIUM_EXECUTABLE });
  const results = [];
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 375, height: 812 }, { width: 320, height: 812 }]) {
    const page = await browser.newPage({ viewport, hasTouch: viewport.width < 768 });
    const errors = []; const requests = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => { requests.push(route.request().url()); return route.abort(); });
    await page.setContent(`<style>${css}</style><script>document.documentElement.classList.add("dark")</script><main class="eleven-v2 app-v2 core-v2" style="padding:16px;max-width:1200px;margin:auto" id="root"></main>`);
    await page.addScriptTag({ path: join(directory, "bundle.js") });
    await page.waitForFunction(() => typeof window.mount === "function");
    const names = () => page.locator('section button p.text-sm').allTextContents();
    const rosterNames = () => page.locator('button p.text-sm').allTextContents();
    const activate = locator => viewport.width < 768 ? locator.tap() : locator.click();
    const click = name => activate(page.getByRole("button").filter({ has: page.getByText(name.replace(/\$$/, ""), { exact: true }) }));
    const before = await names();
    const beforeRoster = await rosterNames();
    await click("STARTER1"); await click("BENCH_DEF$");
    await page.waitForFunction(() => document.querySelector('section')?.textContent.includes('BENCH_DEF'));
    const paint = await page.evaluate(() => window.optimisticPaint);
    assert.equal(new Set(await rosterNames()).size, beforeRoster.length, "no duplicated or missing roster member");
    const optimistic = await names(); assert.ok(optimistic.includes("BENCH_DEF")); assert.ok(!optimistic.includes("STARTER1"));
    assert.equal(await page.evaluate(() => window.calls.length), 1);
    await click("STARTER2"); await click("BENCH_DEF2");
    assert.equal(await page.evaluate(() => window.calls.length), 1, "pending second swap must not call action");
    await page.evaluate(() => window.settle({ error: "PLAYER_LOCKED", kind: "rule" }));
    await page.getByRole("status").filter({ hasText: "PLAYER_LOCKED" }).waitFor();
    assert.deepEqual(await names(), before, "exact rollback");
    assert.deepEqual(await rosterNames(), beforeRoster, "starter and bench rollback exactly");
    for (const failure of ["INVALID_FORMATION", "STALE_STATE", "network"]) {
      await page.evaluate(() => window.mount("Team"));
      await click("BENCH_DEF$"); await click("STARTER1");
      await page.waitForFunction(() => document.querySelector('section')?.textContent.includes('BENCH_DEF'));
      await page.evaluate(failure => failure === "network" ? window.rejectAction() : window.settle({ error: failure, kind: "rule" }), failure);
      await page.waitForFunction(() => !document.querySelector('[role=status]')?.textContent.includes('Saving'));
      assert.deepEqual(await names(), before);
      assert.deepEqual(await rosterNames(), beforeRoster);
    }
    await page.evaluate(() => window.mount("Team"));
    await click("STARTER1"); await click("BENCH_DEF$");
    await page.waitForFunction(() => window.calls.length === 1);
    const confirmedOrder = await names();
    const confirmedRoster = await rosterNames();
    await page.evaluate(() => { window.orderChanges = []; window.observer = new MutationObserver(() => window.orderChanges.push([...document.querySelectorAll('button p.text-sm')].map(p => p.textContent))); window.observer.observe(document.getElementById('root'), { subtree: true, childList: true, characterData: true }); window.confirm(); });
    await page.waitForFunction(() => !document.querySelector('[role=status]')?.textContent.includes('Saving'));
    assert.deepEqual(await names(), confirmedOrder);
    assert.ok((await page.getByRole("button").filter({ has: page.getByText("BENCH_DEF", { exact: true }) }).textContent()).includes("11.0"), "canonical scored data replaces optimistic values");
    for (const order of await page.evaluate(() => window.orderChanges)) assert.deepEqual(order, confirmedRoster, "confirmation must not flicker or reorder");
    await page.evaluate(() => window.observer.disconnect());
    // A second confirmed-direction swap proves canonical roster ids and membership are adopted.
    await click("STARTER1"); await click("BENCH_DEF$");
    await page.waitForFunction(() => window.calls.length === 2);
    await page.evaluate(() => window.settle({ error: "PLAYER_LOCKED", kind: "rule" }));
    await page.waitForFunction(() => !document.querySelector('[role=status]')?.textContent.includes('Saving'));
    assert.deepEqual(await names(), confirmedOrder);
    // Empty fill stays queued until Done; rejection keeps the exact queued choice.
    await page.evaluate(() => window.mount("Team", true));
    await activate(page.getByRole("button", { name: "Empty DEF slot", exact: true })); await click("BENCH_DEF$");
    assert.equal(await page.evaluate(() => window.calls.length), 0);
    assert.ok((await names()).includes("BENCH_DEF"));
    await activate(page.getByRole("button", { name: /Done/ }));
    await page.waitForFunction(() => window.calls.length === 1);
    await page.evaluate(() => window.settle({ error: "INVALID_FORMATION", kind: "rule" }));
    await page.getByRole("button", { name: /Done/ }).waitFor();
    assert.ok((await names()).includes("BENCH_DEF"));
    // Search input stays usable; local inspection does not navigate/refetch the catalog.
    await page.evaluate(() => window.mount("Players"));
    await activate(page.getByText("BENCH_DEF", { exact: true }).first());
    await page.getByText("Player profile", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.calls.length), 0);
    assert.equal(await page.evaluate(() => window.inspectorReads), 2);
    if (viewport.width < 1280) await page.keyboard.press("Escape");
    const input = page.getByPlaceholder("Search player or club…");
    await input.fill("BENCH");
    await page.waitForFunction(() => window.calls.some(call => call.kind === 'navigate'));
    assert.equal(await input.inputValue(), "BENCH");
    await page.getByRole("status").filter({ hasText: "Updating players" }).waitFor();
    assert.equal(await page.evaluate(() => window.calls.filter(call => call.kind === 'navigate').length), 1);
    assert.equal(await page.evaluate(() => window.calls.at(-1).options.scroll), false);
    await page.evaluate(() => window.finishNavigation());
    await page.getByText("No players match these filters", { exact: true }).waitFor();
    if (viewport.width >= 1280) await page.getByText("Player profile", { exact: true }).waitFor();
    await page.evaluate(() => window.mount("Matchup"));
    await page.getByText("MY TEAM", { exact: true }).first().waitFor();
    const teamNames = await page.locator('[title="MY TEAM"],[title="OPPONENT"]').allTextContents();
    assert.equal(teamNames[0], "MY TEAM"); assert.equal(teamNames[1], "OPPONENT");
    for (const destination of ["Home", "Team", "Matchup", "Players", "League", "Draft"]) {
      await page.evaluate(destination => window.mount(destination === "Team" ? "TeamLoading" : destination === "Players" ? "PlayersLoading" : destination === "Matchup" ? "MatchupLoading" : destination), destination);
      // special loading modes map below via harness; ordinary pages were already checked.
      await page.waitForTimeout(30);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${destination} has no horizontal overflow at ${viewport.width}`);
    }
    await page.evaluate(() => window.mount("Navigation"));
    const nav = viewport.width < 768 ? page.getByRole("navigation", { name: "Primary" }) : page.locator("nav").first();
    await nav.locator('a[href="/team"]').waitFor();
    for (const destination of ["Home", "Team", "Matchup", "Players", "League", "Draft"]) {
      assert.equal(await nav.locator(`a[href="/${destination.toLowerCase()}"]`).getAttribute("href"), '/' + destination.toLowerCase());
    }
    // Only test hit target/focus here: Next prefetch is tested structurally,
    // not emulated by this isolated Link binding.
    await page.evaluate(() => document.addEventListener('click', event => { const link=event.target.closest('a');if(link){event.preventDefault();window.clickedHref=link.getAttribute('href');}}, {capture:true}));
    await activate(nav.locator('a[href="/team"]'));
    assert.equal(await page.evaluate(() => window.clickedHref), '/team');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, [], "no external requests from isolated components");
    results.push({ viewport: viewport.width, optimisticPaintMs: Math.round(paint * 10) / 10, rollback: "lock/formation/stale/network exact", confirmation: "canonical data, stable placement, no observed flicker", emptyFill: "queued batch retained", inspector: "two detail reads, zero catalog navigations", primaryNavigation: "six correct destinations; click/touch target verified", outboundRequests: requests.length });
    await page.close();
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser?.close();
  await rm(directory, { recursive: true, force: true });
}
