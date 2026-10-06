/** Offline UI review probe. Uses installed Playwright only as optional tooling.
 * No Next server, credentials, database or provider. All network is blocked. */
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=resolve(import.meta.dirname,'..');
const {webpack}=require('next/dist/compiled/webpack/webpack');
const directory=await mkdtemp(join(tmpdir(),'eleven-v4-ui-'));
const {chromium}=await import(process.env.ELEVEN_PLAYWRIGHT_MODULE??'playwright');
let browser;
try {
 await writeFile(join(directory,'loader.cjs'),`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;`);
 await writeFile(join(directory,'entry.jsx'),`
 import React from 'react';import {createRoot} from 'react-dom/client';
 import {ScoringRulesV4} from ${JSON.stringify(join(root,'src/components/players/scoring-rules-v4.tsx'))};
 import {ScoringBreakdownV4} from ${JSON.stringify(join(root,'src/components/players/scoring-breakdown-v4.tsx'))};
 import {calculateFantasyScoreV4} from ${JSON.stringify(join(root,'src/domain/fantasy/scoring-v4.ts'))};
 const detail=calculateFantasyScoreV4({position:'MID',stats:{minutes:90,goals:1,shots:4,shotsOnTarget:2,assists:1,keyPasses:3,interceptions:4,duelsWon:7,foulsCommitted:3,yellowCards:1},concededByOwnTeam:null});
 window.detail=detail;createRoot(document.getElementById('root')).render(<div className='grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2'><ScoringRulesV4/><div className='min-w-0 border border-border p-4'><ScoringBreakdownV4 detail={detail} opponent='REVIEW TEST'/></div></div>);
 `);
 await new Promise((done,fail)=>webpack({mode:'production',optimization:{minimize:false},context:root,entry:join(directory,'entry.jsx'),output:{path:directory,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.jsx','.js'],modules:[join(root,'node_modules')],alias:{'@':join(root,'src')}},module:{rules:[{test:/\.(tsx?|jsx)$/,exclude:/node_modules/,use:join(directory,'loader.cjs')}]}},(error,stats)=>error||stats.hasErrors()?fail(error??new Error(stats.toString({all:false,errors:true}))):done()));
 const postcss=require('postcss'),tailwind=require('@tailwindcss/postcss');
 const {css}=await postcss([tailwind({base:root})]).process(await readFile(join(root,'src/app/globals.css'),'utf8'),{from:join(root,'src/app/globals.css')});
 browser=await chromium.launch({headless:true,executablePath:process.env.ELEVEN_CHROMIUM_EXECUTABLE});
 for(const width of [375,1440]) {
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>{requests.push(route.request().url());return route.abort();});
  await page.setContent(`<style>${css}</style><main id='root' style='padding:16px;max-width:1200px;margin:auto'></main>`);
  await page.addScriptTag({path:join(directory,'bundle.js')});await page.getByText('TOTAL',{exact:true}).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
  assert.equal(await page.getByText('DUELS WON',{exact:true}).count(),2);
  assert.ok((await page.locator('#root').innerText()).includes('-1.00'));
  assert.equal(await page.evaluate(()=>window.detail.entries.reduce((n,e)=>n+e.units,0)),await page.evaluate(()=>window.detail.totalUnits));
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  await page.screenshot({path:`/tmp/eleven-v4-ui-${width}.png`,fullPage:true});
  console.log(JSON.stringify({viewport:width,total:await page.evaluate(()=>window.detail.total),horizontalOverflow:false,runtimeErrors:errors.length,outboundRequests:requests.length}));await page.close();
 }
} finally {await browser?.close();await rm(directory,{recursive:true,force:true});}
