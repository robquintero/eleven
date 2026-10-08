// Actual authenticated frame and route presenters with isolated fixtures.
// No environment/credentials; all network is blocked, mutations fail closed.
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
 await writeFile(join(directory,'css-loader.cjs'),"module.exports=function(){return '';};");
 await writeFile(join(directory,'actions.js'),`const record=(name,...args)=>window.calls.push([name,...args]);export const createLeagueAction=async(_,data)=>{record('create',Object.fromEntries(data));return {error:'Isolated create validation'};};export const joinLeagueAction=async(_,data)=>{record('join',Object.fromEntries(data));return {error:'Isolated join validation'};};export const setActiveLeagueAction=data=>record('switch',data.get('leagueId'));export const deleteLeagueAction=()=>{throw Error('Deletion must not be submitted');};export const getTradeRostersAction=async()=>({});export const acceptTradeAction=async id=>{record('accept',id);return {error:'Isolated trade validation',kind:'error'};};export const rejectTradeAction=acceptTradeAction;export const cancelTradeAction=acceptTradeAction;export const proposeTradeAction=acceptTradeAction;export const setSeasonScheduleFormatAction=async()=>{};export const createSeasonAction=async()=>{};export const startNextSeasonAction=createSeasonAction;export const searchPlayersAction=async query=>query==='fixturelong'?[{id:'long',name:'Christopher Alexander Montgomery III',position:'MID',clubShortName:'NorthLondonFootballCollective'}]:[];export const signOut=()=>{throw Error('No sign out during QA');};export const swapLineupAction=signOut;export const fillEmptySlotsAction=signOut;export const signPlayerAction=signOut;export const dropPlayerAction=signOut;export const submitDraftPickAction=signOut;export const resolveExpiredPickAction=signOut;export const getPlayerRecentMatchesAction=async()=>[];export const getPlayerScoreBreakdownAction=async()=>null;`);
 await writeFile(join(directory,'navigation.jsx'),`import React from 'react';export const usePathname=()=>window.routePath??'/league';export const useRouter=()=>({push:path=>window.paths.push(path),replace:path=>window.paths.push(path)});export const useLinkStatus=()=>({pending:false});export const notFound=()=>{throw Error('NOT_FOUND');};export default function Link({children,label,...props}){return <a {...props} onClick={e=>{e.preventDefault();props.onClick?.(e);window.paths.push(props.href);}}>{children}</a>;}`);
 await writeFile(join(directory,'entry.jsx'),`
import React from 'react';import {createRoot} from 'react-dom/client';
import {LeagueOverview} from ${JSON.stringify(join(root,'src/components/league/league-overview.tsx'))};
import * as Sections from ${JSON.stringify(join(root,'src/components/league/league-sections.tsx'))};
import {AppFrame} from ${JSON.stringify(join(root,'src/components/shell/app-frame.tsx'))};
import {StatusBar} from ${JSON.stringify(join(root,'src/components/shell/status-bar.tsx'))};
import {GameRulesDialog} from ${JSON.stringify(join(root,'src/components/shell/game-rules-dialog.tsx'))};
import {TeamPageView} from ${JSON.stringify(join(root,'src/components/team/team-page-view.tsx'))};
import {MatchupCommand} from ${JSON.stringify(join(root,'src/components/dashboard/matchup-command.tsx'))};
import {MatchupLineups} from ${JSON.stringify(join(root,'src/components/matchup/matchup-lineups.tsx'))};
import {StartingXI} from ${JSON.stringify(join(root,'src/components/dashboard/starting-xi.tsx'))};
import {OperationsRail} from ${JSON.stringify(join(root,'src/components/dashboard/operations-rail.tsx'))};
import {PlayersWorkspace} from ${JSON.stringify(join(root,'src/components/players/players-workspace.tsx'))};
import {DraftWorkspace} from ${JSON.stringify(join(root,'src/components/draft/draft-workspace.tsx'))};
import {WorkspaceLoading} from ${JSON.stringify(join(root,'src/components/shell/workspace-loading.tsx'))};
import {defaultFilters} from ${JSON.stringify(join(root,'src/lib/players-filters.ts'))};
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
const club={id:'club',name:'Liverpool',shortName:'LIV',league:'premier-league',crestColor:'#333'};
const positions=['GK','DEF','DEF','DEF','DEF','MID','MID','MID','MID','FWD','FWD'];
const player=(position,i)=>({id:'player'+i,name:'Player '+i,externalId:'',position,club,fantasyPoints:12.35,ownership:'free',availability:'available',fixture:{id:'fixture',kickoff:'2099-10-10T14:00:00Z',opponent:'ARS',isHome:true,state:'upcoming'}});
const squad={formation:'4-4-2',starters:positions.map((position,i)=>({id:'slot'+i,position,x:0,y:0,locked:false,player:player(position,i)})),bench:[player('DEF',11),player('MID',12),player('FWD',13),player('GK',14)]};
const matchup={id:id(51),roundId:id(4),roundNumber:2,roundStartsAt:rounds[1].startsAt,roundEndsAt:rounds[1].endsAt,roundStatus:'in_progress',status:'live',isUserHome:true,homeTeamName:names[0],awayTeamName:names[3],homeLivePoints:67.45,awayLivePoints:50.2,homeFinalPoints:null,awayFinalPoints:null,scoresUpdatedAt:null};
const availablePlayers={players:positions.map(player),total:11,page:1,pageSize:30};
const draft={draftId:id(77),status:'completed',currentRound:15,currentPick:60,currentTeamId:null,currentTeamName:null,pickDeadline:null,teamCount:4,totalRounds:15,order:teams.map((t,i)=>({fantasyTeamId:t.id,teamName:t.name,position:i+1})),isMyTurn:false,myFantasyTeamId:id(10),picks:positions.map((position,i)=>({pickNumber:i+1,round:1,fantasyTeamId:teams[i%4].id,teamName:teams[i%4].name,playerId:'player'+i,playerName:'Player '+i,position,clubShortName:'LIV',pickedAt:'2026-10-01'}))};
window.calls=[];window.paths=[];const renderer=createRoot(document.getElementById('root'));
window.mount=async(mode='normal')=>{
 const cp=Promise.resolve(mode==='empty'?{...competition,rounds:[],currentRoundId:null,allRoundMatchups:[],currentRoundMatchups:[],recentResults:[],records:Object.fromEntries(Object.keys(records).map(k=>[k,null]))}:mode==='wide'?{...competition,allRoundMatchups:matches.map(m=>m.id===id(51)?{...m,homePoints:1234.56,awayPoints:-100.25}:m)}:competition);
 const tp=Promise.resolve({myTeamId:id(10),otherTeams:teams.slice(1),incoming:mode==='trade'?[trade]:[],outgoing:[]});
 const requestedRound=mode==='previous'?id(3):undefined;
 const matchweek=await Sections.LeagueMatchweek({competitionPromise:cp,myTeamId:id(10),requestedRound});
 const props={membershipKey:mode==='joined'?'new-membership':'initial',league:mode==='member'?{...league,role:'member'}:league,season,lifecycleLabel:'ACTIVE',draftStatus:'completed',standings:mode==='empty'?[]:standings,myTeamId:id(10),allowDelete:mode!=='member',matchweek,records:await Sections.LeagueRecords({competitionPromise:cp}),results:await Sections.LeagueResults({competitionPromise:cp,myTeamId:id(10)}),activity:await Sections.LeagueTransactions({activityPromise:Promise.resolve(mode==='empty'?[]:[{id:'activity',summary:'Kaka FC added Rúben Dias',createdAt:'2026-10-07T12:00:00Z'}])}),trades:await Sections.LeagueTrades({canAcquire:true,leagueId:id(1),tradePromise:tp}),managers:await Sections.LeagueManagers({league,myTeam:teams[0],tradePromise:tp}),archive:null};
 let content=<LeagueOverview {...props}/>;
 if(mode==='Home')content=<div className='flex flex-col gap-6'><h1 className='text-3xl font-semibold'>Home</h1><div className='grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]'><div><MatchupCommand matchup={matchup} hasLeague now={new Date('2026-10-07')}/><StartingXI players={squad.starters.map(slot=>slot.player)}/></div><OperationsRail starters={squad.starters} standings={standings} hasActiveRound myTeamId={id(10)} fixtureIntel={null}/></div></div>;
 if(mode==='Team')content=<TeamPageView team={teams[0]} league={league} squad={squad} matchup={matchup}/>;
 if(mode==='Matchup')content=<div className='space-y-6'><h1 className='text-3xl font-semibold'>Matchup</h1><MatchupCommand matchup={matchup} hasLeague now={new Date('2026-10-07')}/><MatchupLineups homeTeamName={names[0]} awayTeamName={names[3]} isUserHome homeSquad={squad} awaySquad={squad}/></div>;
 if(mode==='Players')content=<PlayersWorkspace acquisitionState="allowed" data={availablePlayers} filters={defaultFilters} page={1} competitions={[]} clubs={[]} hasActiveLeague leagueId={id(1)} fantasyTeamId={id(10)}/>;
 if(mode==='Draft')content=<><h1 className='text-3xl font-semibold mb-6'>Draft</h1><DraftWorkspace draft={draft} availablePlayers={availablePlayers} onSearch={()=>{}} positionFilter={null} onPositionFilterChange={()=>{}}/></>;
 if(mode.startsWith('Loading'))content=<WorkspaceLoading destination={mode.slice(7)}/>;
 window.routePath='/'+(mode.startsWith('Loading')?mode.slice(7):mode==='normal'?'League':mode).toLowerCase();
 renderer.render(<AppFrame key={mode} profile={{id:id(20),displayName:'Robert Quintero'}} leagues={mode==='none'?[]:[league,{...league,id:id(99),name:'SecondLeagueWithAnExtremelyLongUnbrokenName'}]} activeLeagueId={id(1)} rules={<GameRulesDialog/>} status={<StatusBar data={{roundNumber:2,resultState:'active',roundStatus:'in_progress',liveCount:0,lockedCount:2,remainingCount:9,nextLockKickoff:'2026-10-10T13:30:00Z'}}/>}>{<div className={['Team','Matchup','Players','Draft'].includes(mode)?'core-v2':''}>{content}</div>}</AppFrame>);

};window.mount();`);
 await new Promise((done,fail)=>webpack({mode:'production',optimization:{minimize:false},context:root,entry:join(directory,'entry.jsx'),output:{path:directory,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.jsx','.js'],modules:[join(root,'node_modules')],alias:{'@':join(root,'src'),'next/navigation$':join(directory,'navigation.jsx'),'next/link$':join(directory,'navigation.jsx')}},module:{rules:[{test:/\.css$/,use:join(directory,'css-loader.cjs')},{test:/\.(tsx?|jsx)$/,exclude:/node_modules/,use:join(directory,'loader.cjs')}]},plugins:[new webpack.NormalModuleReplacementPlugin(/data-access\/auth/,join(directory,'actions.js')),new webpack.NormalModuleReplacementPlugin(/app\/\(app\)\/(league\/(actions|trade-actions|delete-actions|season-actions)|team\/actions|players\/actions|draft\/actions|actions)/,join(directory,'actions.js'))]},(error,stats)=>error||stats.hasErrors()?fail(error??new Error(stats.toString({all:false,errors:true}))):done()));
 const {css}=await require('postcss')([require('@tailwindcss/postcss')({base:root})]).process(await readFile(join(root,'src/app/globals.css'),'utf8'),{from:join(root,'src/app/globals.css')});
 const v2=await readFile(join(root,'src/app/(app)/league/v2.css'),'utf8')+'\n'+await readFile(join(root,'src/components/ui/core-v2.css'),'utf8');
 browser=await chromium.launch({headless:true,...(process.env.ELEVEN_CHROMIUM_EXECUTABLE?{executablePath:process.env.ELEVEN_CHROMIUM_EXECUTABLE}:{})});const results=[];
 for(const theme of ['dark','light'])for(const width of [1440,375,320,2200]) {
  const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>{requests.push(route.request().url());return route.abort();});
  await page.setContent('<style>:root{--font-jetbrains-mono:Menlo;}'+css+'\n'+v2+'</style><div id="root"></div>');await page.evaluate(t=>document.documentElement.classList.toggle('dark',t==='dark'),theme);await page.addScriptTag({path:join(directory,'bundle.js')});await page.getByRole('heading',{name:'FANTASTIC 4',exact:true}).waitFor();
  for(const route of ['Home','Matchup','Team','Draft','Players','League','LoadingHome','LoadingTeam','LoadingMatchup','LoadingPlayers','LoadingDraft','none']) {
   await page.evaluate(mode=>window.mount(mode==='League'?'normal':mode),route);await page.waitForTimeout(80);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)console.log(theme,width,route,await page.evaluate(()=>Array.from(document.querySelectorAll('*')).filter(el=>{const r=el.getBoundingClientRect();return r.right>innerWidth+1&&r.width>0;}).slice(0,20).map(el=>({tag:el.tagName,cls:el.className,width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right,text:el.textContent.slice(0,55)}))));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,theme+' '+width+' '+route+' page overflow');
   if(!route.startsWith('Loading')&&route!=='none'){
    const nav=width>=1024?page.locator('.v2-desktop-nav'):page.locator('.v2-mobile-nav');
    assert.equal(await nav.locator('a[aria-current="page"]').getAttribute('href'),'/'+route.toLowerCase());
    assert.equal(await nav.locator('a').count(),6);await page.keyboard.press('Tab');await nav.locator('a[aria-current="page"]').focus();
    assert.ok(await nav.locator('a[aria-current="page"]').evaluate(el=>getComputedStyle(el).outlineStyle!=='none'),'focus indication');
   }
   const fits=await page.locator('.v2-shell-toolbar :is(button,a)').evaluateAll(elements=>elements.every(el=>{const r=el.getBoundingClientRect();return r.width===0&&r.height===0||r.width>=44&&r.height>=44&&r.left>=0&&r.right<=innerWidth;}));if(!fits)console.log(theme,width,route,await page.locator('.v2-shell-toolbar :is(button,a)').evaluateAll(els=>els.map(el=>({text:el.textContent,label:el.getAttribute('aria-label'),width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right}))));assert.ok(fits,'unclipped 44px shell targets');
   if(width>=1024){
    const sidebar=await page.locator('.v2-sidebar').evaluate(el=>({left:el.getBoundingClientRect().left,width:el.getBoundingClientRect().width,bg:getComputedStyle(el).backgroundColor}));assert.equal(sidebar.left,0);assert.equal(sidebar.width,240);
    if(!route.startsWith('Loading')&&route!=='none')assert.equal(await page.locator('.v2-nav-link[aria-current="page"]').evaluate(el=>getComputedStyle(el).boxShadow),'none');
    if(await page.locator('.v2-status-summary').count()){const summary=await page.locator('.v2-status-summary').innerText();assert.match(summary,/Matchweek 2/);assert.equal((summary.match(/live/g)||[]).length,1);}
   }
   await page.screenshot({path:'/tmp/eleven-shell-'+route.toLowerCase()+'-'+theme+'-'+width+'.png',fullPage:true});
   if(route==='Players'){await page.getByRole('button',{name:'Inspect Player 0',exact:true}).click();await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'/tmp/eleven-inspector-'+theme+'-'+width+'.png',fullPage:true});if(width<1280){await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});}}
  }
  await page.evaluate(()=>window.mount('normal'));
  const leagueTrigger=page.getByRole('button',{name:'Active league: FANTASTIC 4'});
  await leagueTrigger.click();assert.equal(await page.getByRole('option',{name:/FANTASTIC 4/}).evaluate(el=>el===document.activeElement),true);await page.keyboard.press('End');assert.equal(await page.getByRole('option',{name:/SecondLeague/}).evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Escape');await page.getByRole('listbox').waitFor({state:'hidden'});assert.equal(await leagueTrigger.evaluate(el=>el===document.activeElement),true);await leagueTrigger.click();await page.getByRole('option',{name:/SecondLeague/}).click();assert.equal(await page.evaluate(()=>window.calls.at(-1)[0]),'switch');
  const profileTrigger=page.getByRole('button',{name:'Robert Quintero profile'});
  await profileTrigger.click();assert.equal(await page.getByRole('menuitem',{name:'Account settings'}).evaluate(el=>el===document.activeElement),true);await page.keyboard.press('ArrowDown');assert.equal(await page.getByRole('menuitem',{name:'Sign out'}).evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Escape');await page.getByRole('menu').waitFor({state:'hidden'});assert.equal(await profileTrigger.evaluate(el=>el===document.activeElement),true);await profileTrigger.click();await page.getByRole('menuitem',{name:'Account settings'}).click();assert.equal(await page.evaluate(()=>window.paths.at(-1)),'/account');
  await page.getByRole('button',{name:'Search',exact:true}).click();await page.getByRole('dialog').waitFor();assert.equal(await page.getByRole('dialog').getByText('Navigation',{exact:true}).count(),1);assert.equal(await page.locator('.v2-command').evaluate(el=>getComputedStyle(el).transitionProperty),'none');await page.getByRole('combobox',{name:'Search players, pages, or actions'}).fill('fixturelong');await page.getByRole('option',{name:/Christopher Alexander/}).waitFor();assert.equal(await page.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth),true);await page.screenshot({path:'/tmp/eleven-command-long-'+theme+'-'+width+'.png',fullPage:true});await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Eleven game rules',exact:true}).click();await page.getByRole('dialog').waitFor();assert.equal(await page.getByRole('heading',{name:'Eleven game rules',exact:true}).count(),1);await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.keyboard.press('g');await page.keyboard.press('t');assert.equal(await page.evaluate(()=>window.paths.at(-1)),'/team');
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);results.push({theme,width,routes:6,loadingStates:5,overflow:false,menus:true,search:true,rules:true,shortcuts:true,errors:0,requests:0});await page.close();
 }
 console.log(JSON.stringify(results,null,2));
} finally {if(browser)await browser.close();await rm(directory,{recursive:true,force:true});}
