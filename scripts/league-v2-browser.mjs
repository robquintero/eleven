// Actual League V2 presentation and dialogs; offline actions, all network blocked.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=resolve(import.meta.dirname,'..');
const {webpack}=require('next/dist/compiled/webpack/webpack');
const {chromium}=await import(process.env.ELEVEN_PLAYWRIGHT_MODULE??'playwright');
const directory=await mkdtemp(join(tmpdir(),'eleven-league-v2-'));let browser;
try {
 await writeFile(join(directory,'loader.cjs'),`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;};`);
 await writeFile(join(directory,'actions.js'),`const record=(name,...args)=>window.calls.push([name,...args]);export const createLeagueAction=async(_,data)=>{record('create',Object.fromEntries(data));return {error:'Isolated create validation'};};export const joinLeagueAction=async(_,data)=>{record('join',Object.fromEntries(data));return {error:'Isolated join validation'};};export const setActiveLeagueAction=data=>record('switch',data.get('leagueId'));export const deleteLeagueAction=()=>{throw Error('Deletion must not be submitted');};export const getTradeRostersAction=async()=>({});export const acceptTradeAction=async id=>{record('accept',id);return {error:'Isolated trade validation',kind:'error'};};export const rejectTradeAction=acceptTradeAction;export const cancelTradeAction=acceptTradeAction;export const proposeTradeAction=acceptTradeAction;export const setSeasonScheduleFormatAction=async()=>{};export const createSeasonAction=async()=>{};export const startNextSeasonAction=createSeasonAction;`);
 await writeFile(join(directory,'navigation.jsx'),`import React from 'react';export const useRouter=()=>({push:path=>window.paths.push(path),replace:path=>window.paths.push(path)});export const useLinkStatus=()=>({pending:false});export const notFound=()=>{throw Error('NOT_FOUND');};export default function Link({children,label,...props}){return <a {...props} onClick={e=>{e.preventDefault();window.paths.push(props.href);}}>{children}</a>;}`);
 await writeFile(join(directory,'entry.jsx'),`
import React from 'react';import {createRoot} from 'react-dom/client';
import {LeagueOverview} from ${JSON.stringify(join(root,'src/components/league/league-overview.tsx'))};
import * as Sections from ${JSON.stringify(join(root,'src/components/league/league-sections.tsx'))};
import {LeagueSwitcher} from ${JSON.stringify(join(root,'src/components/shell/league-switcher.tsx'))};
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const names=['Kaka FC','75 Hard','Los Duros FC','InternationalFootballCollectiveWithoutSpaces'];
const teams=names.map((name,i)=>({id:id(i+10),leagueId:id(1),ownerUserId:id(i+20),name,abbreviation:'FC'}));
const league={id:id(1),name:'FANTASTIC 4',createdByUserId:id(20),role:'commissioner',memberCount:4,maxTeams:4,inviteCode:'ABCD2345',members:teams.map((t,i)=>({userId:t.ownerUserId,displayName:['Robert','Camden','Martin','Nico'][i],teamName:t.name,role:i?'member':'commissioner',joinedAt:'2026-09-01'}))};
const rounds=[{id:id(3),number:1,seasonNumber:1,startsAt:'2026-09-29T06:00:00Z',endsAt:'2026-10-06T06:00:00Z',status:'completed'},{id:id(4),number:2,seasonNumber:1,startsAt:'2026-10-06T06:00:00Z',endsAt:'2026-10-13T06:00:00Z',status:'in_progress'},{id:id(5),number:3,seasonNumber:1,startsAt:'2026-10-13T06:00:00Z',endsAt:'2026-10-20T06:00:00Z',status:'upcoming'}];
const summary=(n,a,b,r,state,hp,ap)=>({id:id(n),roundId:r.id,roundNumber:r.number,roundStartsAt:r.startsAt,roundEndsAt:r.endsAt,roundStatus:r.status,homeTeamId:teams[a].id,awayTeamId:teams[b].id,homeTeamName:names[a],awayTeamName:names[b],homePoints:hp,awayPoints:ap,status:state==='final'?'final':'live',resultState:state});
const matches=[summary(50,2,3,rounds[1],'active',null,null),summary(51,0,1,rounds[1],'active',67.45,50.2),summary(52,0,2,rounds[0],'final',150.85,92.4),summary(53,1,3,rounds[0],'pending',137.8,122.35),summary(54,0,3,rounds[2],'upcoming',null,null)];
const score={value:150.85,teamName:names[0],opponentName:names[2],roundNumber:1};
const records={highestScore:score,lowestScore:{...score,value:92.4,teamName:names[2]},largestMargin:{...score,value:58.45},closestMatchup:{...score,value:15.45},mostPointsFor:score,mostPointsAgainst:{...score,value:137.8,teamName:names[3]}};
const competition={rounds,currentRoundId:id(4),allRoundMatchups:matches,currentRoundMatchups:matches.slice(0,2),recentResults:matches.slice(2,4),records,teams};
const standings=teams.map((t,i)=>({fantasyTeamId:t.id,teamName:t.name,played:1,wins:i===0?1:0,draws:0,losses:i===0?0:1,pointsFor:i===0?150.85:92.4,pointsAgainst:i===0?92.4:150.85,leaguePoints:i===0?3:0}));
const season={id:id(2),seasonNumber:1,status:'active',totalRounds:6,currentRoundNumber:2,currentRoundStartsAt:rounds[1].startsAt,currentRoundEndsAt:rounds[1].endsAt,currentRoundStatus:'in_progress'};
const trade={id:id(70),proposingTeamId:id(11),proposingTeamName:names[1],receivingTeamId:id(10),receivingTeamName:names[0],offeredPlayers:[{playerId:'p1',playerName:'Rúben Dias',position:'DEF'}],requestedPlayers:[{playerId:'p2',playerName:'Mohamed Salah',position:'FWD'}],createdAt:'2026-10-07'};
window.calls=[];window.paths=[];const renderer=createRoot(document.getElementById('root'));
window.mount=async(mode='normal')=>{
 const cp=Promise.resolve(mode==='empty'?{...competition,rounds:[],currentRoundId:null,allRoundMatchups:[],currentRoundMatchups:[],recentResults:[],records:Object.fromEntries(Object.keys(records).map(k=>[k,null]))}:competition);
 const tp=Promise.resolve({myTeamId:id(10),otherTeams:teams.slice(1),incoming:mode==='trade'?[trade]:[],outgoing:[]});
 const requestedRound=mode==='previous'?id(3):undefined;
 const matchweek=await Sections.LeagueMatchweek({competitionPromise:cp,myTeamId:id(10),requestedRound});
 const props={league:mode==='member'?{...league,role:'member'}:league,season,lifecycleLabel:'ACTIVE',draftStatus:'completed',standings:mode==='empty'?[]:standings,myTeamId:id(10),allowDelete:mode!=='member',matchweek,records:await Sections.LeagueRecords({competitionPromise:cp}),results:await Sections.LeagueResults({competitionPromise:cp,myTeamId:id(10)}),activity:await Sections.LeagueTransactions({activityPromise:Promise.resolve(mode==='empty'?[]:[{id:'activity',summary:'Kaka FC added Rúben Dias',createdAt:'2026-10-07T12:00:00Z'}])}),trades:await Sections.LeagueTrades({leagueId:id(1),tradePromise:tp}),managers:await Sections.LeagueManagers({league,myTeam:teams[0],tradePromise:tp}),archive:null};
 renderer.render(<><div style={{marginBottom:20,maxWidth:300}}><LeagueSwitcher leagues={[league,{...league,id:id(99),name:'Second league'}]} activeLeagueId={id(1)}/></div><LeagueOverview key={mode} {...props}/></>);
};window.mount();`);
 await new Promise((done,fail)=>webpack({mode:'production',optimization:{minimize:false},context:root,entry:join(directory,'entry.jsx'),output:{path:directory,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.jsx','.js'],modules:[join(root,'node_modules')],alias:{'@':join(root,'src'),'next/navigation$':join(directory,'navigation.jsx'),'next/link$':join(directory,'navigation.jsx')}},module:{rules:[{test:/\.(tsx?|jsx)$/,exclude:/node_modules/,use:join(directory,'loader.cjs')}]},plugins:[new webpack.NormalModuleReplacementPlugin(/app\/\(app\)\/(league\/(actions|trade-actions|delete-actions|season-actions)|actions)/,join(directory,'actions.js'))]},(error,stats)=>error||stats.hasErrors()?fail(error??new Error(stats.toString({all:false,errors:true}))):done()));
 const {css}=await require('postcss')([require('@tailwindcss/postcss')({base:root})]).process(await readFile(join(root,'src/app/globals.css'),'utf8'),{from:join(root,'src/app/globals.css')});
 const v2=await readFile(join(root,'src/app/(app)/league/v2.css'),'utf8');
 browser=await chromium.launch({headless:true});const results=[];
 for(const theme of ['dark','light'])for(const width of [1440,375,320]) {
  const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>{requests.push(route.request().url());return route.abort();});
  await page.setContent('<style>:root{--font-sans:Arial,sans-serif;--font-mono:monospace;}'+css+'\n'+v2+'</style><main id="root" style="padding:16px;max-width:1200px;margin:auto"></main>');await page.evaluate(t=>document.documentElement.classList.toggle('dark',t==='dark'),theme);await page.addScriptTag({path:join(directory,'bundle.js')});await page.getByRole('heading',{name:'FANTASTIC 4',exact:true}).waitFor();
  assert.ok(await page.getByRole('heading',{name:'FANTASTIC 4',exact:true}).evaluate(el=>el.getBoundingClientRect().width>=220),'League title has usable width');
  assert.equal(await page.locator('.v2-focus .v2-matchup').first().getAttribute('href'),'/matchup/00000000-0000-4000-8000-000000000051');
  assert.equal(await page.locator('.v2-focus .v2-matchup').last().getByText('—',{exact:true}).count(),2);
  assert.equal(await page.locator('.v2-matchup').filter({hasText:'Finalizing result'}).getByText(/Winner/).count(),0);
  assert.equal(await page.locator('.v2-table tbody tr').count(),4);assert.equal(await page.locator('.v2-table tbody tr').first().innerText().then(s=>s.includes('150.85')&&s.includes('+58.45')),true);
  assert.equal(await page.locator('.v2-record').count(),6);assert.equal(await page.getByText('Kaka FC added Rúben Dias',{exact:true}).count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,theme+' '+width+' page overflow');
  await page.screenshot({path:'/tmp/eleven-v2-'+theme+'-'+width+'.png',fullPage:true});
  if(width===1440&&theme==='dark'){await page.evaluate(()=>document.body.style.filter='grayscale(1)');await page.screenshot({path:'/tmp/eleven-v2-grayscale.png',fullPage:true});await page.evaluate(()=>document.body.style.filter='');}
  await page.getByRole('button',{name:'Active league: FANTASTIC 4'}).click();await page.getByRole('option',{name:/Second league/}).click();assert.deepEqual(await page.evaluate(()=>window.calls.at(-1)),['switch','00000000-0000-4000-8000-000000000099']);
  for(const flow of ['Create','Join']) {
   const trigger=page.getByRole('button',{name:flow+' league',exact:true});await trigger.focus();await page.keyboard.press('Enter');const dialog=page.getByRole('dialog');await dialog.waitFor();
   assert.equal(await dialog.locator('input').count(),flow==='Create'?3:3);await dialog.getByLabel(flow==='Create'?'League name':'Invite code').fill(flow==='Create'?'Local league':'ABCD2345');await dialog.getByLabel('Your team name').fill('Local team');await dialog.getByLabel('Abbreviation').fill('LFC');
   await dialog.getByRole('button',{name:flow+' league',exact:true}).click();await dialog.getByText('Isolated '+flow.toLowerCase()+' validation',{exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'dialog overflow');await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(await trigger.evaluate(el=>el===document.activeElement),true,'dialog focus return');
  }
  await page.getByText('League management',{exact:true}).click();await page.getByRole('button',{name:'Delete League',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();assert.equal(await dialog.getByRole('button',{name:'Permanently Delete League'}).isDisabled(),true);await dialog.getByLabel(/Type DELETE/).fill('DELETE');assert.equal(await dialog.getByRole('button',{name:'Permanently Delete League'}).isEnabled(),true);await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await dialog.waitFor({state:'hidden'});
  await page.getByLabel('Fantasy round').selectOption('00000000-0000-4000-8000-000000000003');assert.equal(await page.evaluate(()=>window.paths.at(-1)),'/league?round=00000000-0000-4000-8000-000000000003');
  for(const mode of ['previous','member','empty','trade']) {await page.evaluate(mode=>window.mount(mode),mode);await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,mode+' overflow');if(mode==='member')assert.equal(await page.getByText('League management',{exact:true}).count(),0);if(mode==='previous'){assert.equal(await page.getByRole('heading',{name:'Matchweek 1'}).count(),1);await page.getByRole('link',{name:/Next/}).click();assert.equal(await page.evaluate(()=>window.paths.at(-1)),'/league?round=00000000-0000-4000-8000-000000000004');}if(mode==='empty')assert.equal(await page.getByText('Records appear after the first official result.').count(),1);if(mode==='trade'){await page.getByRole('button',{name:'Accept',exact:true}).click();await page.getByText('Isolated trade validation').waitFor();assert.deepEqual(await page.evaluate(()=>window.calls.at(-1)),['accept','00000000-0000-4000-8000-000000000070']);await page.screenshot({path:'/tmp/eleven-v2-trade-'+theme+'-'+width+'.png',fullPage:true});}}
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);results.push({theme,width,overflow:false,dialogs:true,focusReturn:true,rounds:true,switcher:true,standings:true,trades:true,errors:0,networkRequests:0});await page.close();
 }
 console.log(JSON.stringify(results,null,2));
} finally {if(browser)await browser.close();await rm(directory,{recursive:true,force:true});}
