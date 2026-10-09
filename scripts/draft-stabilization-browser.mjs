// Actual DraftPageClient/Workspace, deterministic server snapshots and Realtime
// hints. No credentials; all HTTP is blocked. Measure event-to-visible latency.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {resolve,join} from 'node:path';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=resolve(import.meta.dirname,'..');
const {webpack}=require('next/dist/compiled/webpack/webpack');
const {chromium}=await import(process.env.ELEVEN_PLAYWRIGHT_MODULE??'playwright');
const directory=await mkdtemp(join(tmpdir(),'eleven-draft-sync-'));let browser;
try{
 await writeFile(join(directory,'loader.cjs'),`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(s){return ts.transpileModule(s,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;};`);
 await writeFile(join(directory,'css-loader.cjs'),"module.exports=()=>'';");
 await writeFile(join(directory,'navigation.jsx'),`import React from 'react';const router={refresh:()=>window.refreshes++,push:()=>{}};export const useRouter=()=>router;export const useLinkStatus=()=>({pending:false});export default function Link(p){return <a {...p}/>;}`);
 await writeFile(join(directory,'client.js'),`export function createClient(){return {channel:()=>{const listeners=[];const channel={on:(type,filter,fn)=>{listeners.push({filter,fn});return channel;},subscribe:fn=>{window.realtime={event:()=>listeners.forEach(l=>l.fn({})),status:fn,listeners};queueMicrotask(()=>fn('SUBSCRIBED'));return channel;}};return channel;},removeChannel:async()=>{window.removed++;}};}`);
 await writeFile(join(directory,'actions.js'),`export const getDraftStatusAction=async()=>{if(window.offline)throw Error("offline");return window.lobbyStatus;};export const getDraftUpdateAction=async()=>{window.reads++;if(window.offline)throw Error('offline');const draft=structuredClone(window.authoritative);draft.serverNow=new Date().toISOString();return {draft,ownership:Object.fromEntries(draft.picks.map(p=>[p.playerId,p.fantasyTeamId]))};};export const getAvailablePlayersAction=async(_,q)=>{window.searches.push(q);return new Promise(resolve=>window.searchResolvers[q]=resolve);};export const submitDraftPickAction=async(...args)=>{window.picks.push(args);return new Promise(resolve=>window.pickResolver=resolve);};export const resolveExpiredPickAction=async(...args)=>{window.expiries.push(args);if(window.onExpiry)window.onExpiry(...args);return undefined;};export const getPlayerRecentMatchesAction=async()=>[];export const getPlayerScoreBreakdownAction=async()=>null;`);
 await writeFile(join(directory,'entry.jsx'),`import React from 'react';import {createRoot} from 'react-dom/client';import {DraftPageClient} from ${JSON.stringify(join(root,'src/components/draft/draft-page-client.tsx'))};import {DraftLobbySync} from ${JSON.stringify(join(root,'src/components/draft/draft-lobby-sync.tsx'))};
 const renderer=createRoot(document.getElementById('root'));let revision=0;
 const club={id:'club',name:'Club',shortName:'CLB',league:'premier-league',crestColor:'#444'};
 window.players={players:Array.from({length:20},(_,i)=>({id:'player'+i,name:'Player '+i,position:i<5?'FWD':'MID',club,ownership:'free',totalPoints:20-i})),total:20,page:1,pageSize:30};
 window.initial={draftId:'draft',status:'in_progress',currentRound:1,currentPick:1,currentTeamId:'mine',currentTeamName:'Mine',pickDeadline:new Date(Date.now()+60000).toISOString(),teamCount:5,totalRounds:16,order:[{position:1,fantasyTeamId:'mine',teamName:'Mine',teamAbbreviation:'M'}],picks:[],isMyTurn:true,myFantasyTeamId:'mine'};
 window.authoritative=structuredClone(window.initial);window.reads=0;window.refreshes=0;window.removed=0;window.picks=[];window.expiries=[];window.searches=[];window.searchResolvers={};
 window.advance=(n,myTurn=false)=>{window.authoritative={...window.authoritative,currentPick:n+1,currentTeamId:myTurn?'mine':'other',currentTeamName:myTurn?'Mine':'Other',isMyTurn:myTurn,pickDeadline:new Date(new Date().getTime()+60000).toISOString(),picks:Array.from({length:n},(_,i)=>({pickNumber:i+1,round:1,fantasyTeamId:i===0?'mine':'other',teamName:i===0?'Mine':'Other',playerId:'player'+i,playerName:'Player '+i,position:'FWD',clubShortName:'CLB',pickedAt:new Date().toISOString()}))};};
 window.mount=()=>renderer.render(<DraftPageClient key={++revision} leagueId='league' draft={structuredClone(window.authoritative)} hasTeam initialPlayers={window.players}/>);window.mountLobby=()=>renderer.render(<DraftLobbySync key={++revision} leagueId='league'/>);window.mount();`);
 await new Promise((done,fail)=>webpack({mode:'production',optimization:{minimize:false},context:root,entry:join(directory,'entry.jsx'),output:{path:directory,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.jsx','.js'],modules:[join(root,'node_modules')],alias:{'@':join(root,'src'),'next/navigation$':join(directory,'navigation.jsx'),'next/link$':join(directory,'navigation.jsx'),'@/lib/supabase/client$':join(directory,'client.js')}},module:{rules:[{test:/\.css$/,use:join(directory,'css-loader.cjs')},{test:/\.(tsx?|jsx)$/,exclude:/node_modules/,use:join(directory,'loader.cjs')}]},plugins:[new webpack.NormalModuleReplacementPlugin(/app\/\(app\)\/draft\/actions/,join(directory,'actions.js')),new webpack.NormalModuleReplacementPlugin(/app\/\(app\)\/players\/actions/,join(directory,'actions.js')),new webpack.NormalModuleReplacementPlugin(/lib\/supabase\/client/,join(directory,'client.js'))]},(error,stats)=>error||stats.hasErrors()?fail(error??Error(stats.toString({all:false,errors:true}))):done()));
 const {css}=await require('postcss')([require('@tailwindcss/postcss')({base:root})]).process(await readFile(join(root,'src/app/globals.css'),'utf8'),{from:join(root,'src/app/globals.css')});
 const styles=css+await readFile(join(root,'src/components/ui/core-v2.css'),'utf8');
 browser=await chromium.launch({headless:true,executablePath:process.env.ELEVEN_CHROMIUM_EXECUTABLE});const results=[];
 for(const width of [1440,375]){
  const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'}),errors=[],network=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{network.push(r.request().url());return r.abort();});
  await page.setContent('<style>'+styles+'</style><div id="root"></div>');await page.evaluate(()=>document.documentElement.classList.add('dark'));await page.addScriptTag({path:join(directory,'bundle.js')});
  await page.waitForFunction(()=>document.querySelector('.core-draft-clock')?.textContent.includes('0:'));
  // Date.now ±10 minutes cannot prematurely expire or lengthen this timer.
  await page.evaluate(()=>{window.realNow=Date.now;Date.now=()=>window.realNow()+600000;});await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>window.expiries.length),0);
  await page.evaluate(()=>{Date.now=()=>window.realNow()-600000;});await page.waitForTimeout(300);
  const clock=await page.locator('.core-draft-clock').textContent();assert.match(clock,/0:[45]\d/);await page.evaluate(()=>{Date.now=window.realNow;});
  const started=await page.evaluate(()=>{window.eventAt=performance.now();window.advance(1);for(let i=0;i<10;i++)window.realtime.event();return window.eventAt;});
  await page.waitForFunction(()=>document.querySelector('.core-draft-turn')?.textContent.includes('Other')||document.querySelector('[aria-label="Active draft turn"]')?.textContent.includes('Other'));
  const latency=await page.evaluate(at=>performance.now()-at,started);assert.ok(latency<1000,'Realtime hint reconciles promptly');
  assert.equal(await page.evaluate(()=>window.refreshes),0,'active picks do not reload the route');
  assert.equal(await page.locator('.core-draft-player').filter({hasText:'Player 0'}).first().getByRole('button',{name:'Draft',exact:true}).count(),0);
  // Lost event: periodic fallback restores the next turn without a hint.
  await page.evaluate(()=>{window.advance(2,true);});const pollStart=Date.now();await page.getByRole('button',{name:'Draft',exact:true}).nth(3).waitFor();
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Draft'&&!b.disabled));const polling=Date.now()-pollStart;
  // Manual pick loses to autopick; reconcile but never retry it on the new turn.
  await page.getByRole('button',{name:'Draft',exact:true}).nth(3).click();await page.waitForFunction(()=>window.picks.length===1);
  assert.equal(await page.evaluate(()=>window.picks[0][2]),3);
  await page.evaluate(()=>{window.advance(3,true);window.pickResolver({error:'That turn has already finished. The draft has been updated; your selection was not retried.',kind:'rule',code:'STALE_DRAFT_TURN'});});
  await page.getByText(/your selection was not retried/).waitFor();await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.picks.length),1);
  // Search response arriving in the next keystroke's debounce gap is stale.
  const input=page.getByRole('textbox',{name:'Search available players'});await input.fill('Old');await page.waitForFunction(()=>window.searches.includes('Old'));await input.fill('New');
  await page.evaluate(()=>window.searchResolvers.Old({...window.players,players:[{...window.players.players[19],name:'Stale Search Result'}]}));await page.waitForTimeout(50);assert.equal(await page.getByText('Stale Search Result',{exact:true}).count(),0);
  await page.waitForFunction(()=>window.searches.includes('New'));await page.evaluate(()=>window.searchResolvers.New(window.players));
  // Offline/Rejoin reads missed picks; full remount/device refresh starts current.
  await page.evaluate(()=>{window.offline=true;window.realtime.status('CHANNEL_ERROR');});await page.getByText(/Draft connection interrupted/).waitFor();
  await page.evaluate(()=>{window.advance(4,false);window.offline=false;window.realtime.status('SUBSCRIBED');});await page.waitForFunction(()=>!document.body.textContent.includes('Draft connection interrupted'));
  await page.evaluate(()=>window.mount());await page.waitForTimeout(300);assert.ok(await page.evaluate(()=>window.removed>=1));assert.ok(await page.getByRole('button',{name:'Draft',exact:true}).evaluateAll(bs=>bs.every(b=>b.disabled)));
  // An expired display is not proof of an autopick. Retry the same counter
  // after reconciling; a newly advanced deadline must not inherit zero.
  await page.evaluate(()=>{window.authoritative.pickDeadline=new Date(new Date().getTime()-1000).toISOString();window.realtime.event();});
  await page.waitForFunction(()=>window.expiries.length>=1);assert.equal(await page.evaluate(()=>window.authoritative.picks.length),4);
  await page.waitForFunction(()=>window.expiries.length>=2);assert.ok(await page.evaluate(()=>window.expiries.every(args=>args[1]===5)));
  await page.evaluate(()=>{window.onExpiry=()=>window.advance(5,true);});await page.waitForFunction(()=>window.authoritative.picks.length===5);
  const expiryCount=await page.evaluate(()=>window.expiries.length);await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>window.expiries.length),expiryCount,'new deadline does not inherit old expiry');
  // A double click submits once and stays pending until the canonical pick.
  await page.getByRole('button',{name:'Draft',exact:true}).nth(3).dblclick();await page.waitForFunction(()=>window.picks.length===2);
  assert.equal(await page.evaluate(()=>window.picks[1][2]),6);
  await page.evaluate(()=>{window.advance(6,false);window.pickResolver(undefined);});await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>window.picks.length),2);
  assert.equal(await page.evaluate(()=>window.refreshes),0);
  await page.evaluate(()=>{window.advance(80);Object.assign(window.authoritative,{status:'completed',currentRound:16,currentPick:5,pickDeadline:null});window.realtime.event();});
  await page.waitForFunction(()=>window.refreshes===1);await page.evaluate(()=>window.realtime.event());await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.refreshes),1,'completion refresh occurs once');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
  await page.screenshot({path:'/tmp/eleven-draft-stabilization-'+width+'.png',fullPage:true});
  // Non-commissioners in the lobby also wake up on the start event, once.
  await page.evaluate(()=>{window.lobbyStatus='scheduled';window.mountLobby();});await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>window.refreshes),1);
  await page.evaluate(()=>{window.lobbyStatus='in_progress';for(let i=0;i<10;i++)window.realtime.event();});await page.waitForFunction(()=>window.refreshes===2);
  await page.evaluate(()=>window.realtime.event());await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.refreshes),2);
  assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
  results.push({width,eventToVisibleMs:latency,pollingFallbackMs:polling,clockSkewMs:600000,blindRetries:0,routeRefreshesDuringActivePicks:0,readOnlyNetworkRequests:0,errors:0});await page.close();
 }
 await writeFile('/tmp/eleven-stabilization-browser-result.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{if(browser)await browser.close();await rm(directory,{recursive:true,force:true});}
