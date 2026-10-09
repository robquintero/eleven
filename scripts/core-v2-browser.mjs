// Core V2 state matrix: actual presenters, isolated data and fail-closed actions.
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
 await writeFile(join(directory,'data.js'),`export const getMatchupSquads=async()=>{window.reads.push('squads');return {home:window.qaSquad,away:window.qaSquad,teamIdsByPlayerId:new Map()};};export const getMatchupFixtureIntelligence=async()=>{window.reads.push('fixtures');return null;};`);
 await writeFile(join(directory,'actions.js'),`const record=(name,...args)=>window.calls.push([name,...args]);export const createLeagueAction=async(_,data)=>{record('create',Object.fromEntries(data));return {error:'Isolated create validation'};};export const joinLeagueAction=async(_,data)=>{record('join',Object.fromEntries(data));return {error:'Isolated join validation'};};export const setActiveLeagueAction=data=>record('switch',data.get('leagueId'));export const deleteLeagueAction=()=>{throw Error('Deletion must not be submitted');};export const getTradeRostersAction=async()=>({});export const acceptTradeAction=async id=>{record('accept',id);return {error:'Isolated trade validation',kind:'error'};};export const rejectTradeAction=acceptTradeAction;export const cancelTradeAction=acceptTradeAction;export const proposeTradeAction=acceptTradeAction;export const setSeasonScheduleFormatAction=async()=>{};export const createSeasonAction=async()=>{};export const startNextSeasonAction=createSeasonAction;export const searchPlayersAction=async()=>[];export const signOut=()=>{throw Error('No sign out during QA');};export const swapLineupAction=signOut;export const fillEmptySlotsAction=signOut;export const signPlayerAction=signOut;export const dropPlayerAction=signOut;export const submitDraftPickAction=signOut;export const resolveExpiredPickAction=signOut;export const getPlayerRecentMatchesAction=async()=>[];export const getPlayerScoreBreakdownAction=async()=>null;`);
 await writeFile(join(directory,'navigation.jsx'),`import React from 'react';export const usePathname=()=>window.routePath??'/league';export const useRouter=()=>({push:path=>window.paths.push(path),replace:path=>window.paths.push(path)});export const useLinkStatus=()=>({pending:false});export const notFound=()=>{throw Error('NOT_FOUND');};export default function Link({children,label,...props}){return <a {...props} onClick={e=>{e.preventDefault();props.onClick?.(e);window.paths.push(props.href);}}>{children}</a>;}`);
 await writeFile(join(directory,'entry.jsx'),`
import React from 'react';import {createRoot} from 'react-dom/client';
import {LeagueOverview} from ${JSON.stringify(join(root,'src/components/league/league-overview.tsx'))};
import * as Sections from ${JSON.stringify(join(root,'src/components/league/league-sections.tsx'))};
import {AppFrame} from ${JSON.stringify(join(root,'src/components/shell/app-frame.tsx'))};
import {StatusBar} from ${JSON.stringify(join(root,'src/components/shell/status-bar.tsx'))};
import {GameRulesDialog} from ${JSON.stringify(join(root,'src/components/shell/game-rules-dialog.tsx'))};
import {TeamPageView} from ${JSON.stringify(join(root,'src/components/team/team-page-view.tsx'))};
import {MatchupPageView} from ${JSON.stringify(join(root,'src/components/matchup/matchup-page-view.tsx'))};
import {ComingSoon} from ${JSON.stringify(join(root,'src/components/shell/coming-soon.tsx'))};
import {Swords} from 'lucide-react';
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
const positions=['GK','DEF','DEF','DEF','DEF','MID','MID','MID','FWD','FWD','FWD'];
const player=(position,i)=>({id:'player'+i,name:'Player '+i,externalId:'',position,club,fantasyPoints:12.35,totalPoints:120.35,averagePoints:8.45,seasonStats:{appearances:14,starts:12,minutes:1070,goals:3,assists:5},ownership:i===1?'mine':i===2?'owned':'free',ownerTeamName:names[2],availability:i===2?'doubtful':'available',fixture:{id:'fixture',kickoff:'2099-10-10T14:00:00Z',opponent:'ARS',isHome:true,homeLabel:'LIV',awayLabel:'ARS',state:i<2?'final':'upcoming'}});
const squad={formation:'4-3-3',starters:positions.map((position,i)=>({id:'slot'+i,position,x:0,y:0,locked:false,player:player(position,i)})),bench:[player('DEF',11),player('MID',12),player('FWD',13),player('GK',14),player('MID',15)]};
const matchup={id:id(51),roundId:id(4),roundNumber:2,roundStartsAt:rounds[1].startsAt,roundEndsAt:rounds[1].endsAt,roundStatus:'in_progress',status:'live',isUserHome:true,homeTeamName:names[0],awayTeamName:names[3],homeLivePoints:67.45,awayLivePoints:50.2,homeFinalPoints:null,awayFinalPoints:null,scoresUpdatedAt:null};
const availablePlayers={players:positions.map(player),total:11,page:1,pageSize:30};
const draft={draftId:id(77),status:'completed',currentRound:15,currentPick:60,currentTeamId:null,currentTeamName:null,pickDeadline:null,teamCount:4,totalRounds:16,order:teams.map((t,i)=>({fantasyTeamId:t.id,teamName:t.name,position:i+1})),isMyTurn:false,myFantasyTeamId:id(10),picks:positions.map((position,i)=>({pickNumber:i+1,round:1,fantasyTeamId:teams[i%4].id,teamName:teams[i%4].name,playerId:'player'+i,playerName:'Player '+i,position,clubShortName:'LIV',pickedAt:'2026-10-01'}))};
window.calls=[];window.paths=[];const renderer=createRoot(document.getElementById('root'));
async function materialize(element){if(!element||typeof element!=='object')return element;if(Array.isArray(element))return Promise.all(element.map(materialize));if(!element.props)return element;if(typeof element.type==='function'&&element.type.constructor.name==='AsyncFunction')return materialize(await element.type(element.props));return React.cloneElement(element,{},await materialize(element.props.children));}
window.mount=async(mode='normal')=>{
 window.reads=[];window.qaSquad=squad;
 const viewedMatchup={...matchup,homeFantasyTeamId:id(10),awayFantasyTeamId:id(13)};
 if(mode.includes('Final')||mode.includes('Historical'))Object.assign(viewedMatchup,{status:'final',roundStatus:'completed',roundEndsAt:'2026-10-06T06:00:00Z',homeFinalPoints:90.25,awayFinalPoints:123.45});
 if(mode.includes('Pending'))viewedMatchup.roundEndsAt='2026-10-06T06:00:00Z';
 if(mode.includes('Upcoming'))Object.assign(viewedMatchup,{status:'scheduled',roundStatus:'upcoming',roundStartsAt:'2099-10-06T06:00:00Z',roundEndsAt:'2099-10-13T06:00:00Z'});
 if(mode.includes('Spectator'))viewedMatchup.isSpectator=true;
 if(mode.includes('Away'))viewedMatchup.isUserHome=false;
 if(mode.includes('Long'))Object.assign(viewedMatchup,{homeTeamName:'AnotherInternationalFootballCollectiveWithAVeryLongUnbrokenName',homeLivePoints:1234.56,awayLivePoints:-100.25});
 const cp=Promise.resolve(mode==='empty'?{...competition,rounds:[],currentRoundId:null,allRoundMatchups:[],currentRoundMatchups:[],recentResults:[],records:Object.fromEntries(Object.keys(records).map(k=>[k,null]))}:mode==='wide'?{...competition,allRoundMatchups:matches.map(m=>m.id===id(51)?{...m,homePoints:1234.56,awayPoints:-100.25}:m)}:competition);
 const tp=Promise.resolve({myTeamId:id(10),otherTeams:teams.slice(1),incoming:mode==='trade'?[trade]:[],outgoing:[]});
 const requestedRound=mode==='previous'?id(3):undefined;
 const matchweek=await Sections.LeagueMatchweek({competitionPromise:cp,myTeamId:id(10),requestedRound});
 const props={membershipKey:mode==='joined'?'new-membership':'initial',league:mode==='member'?{...league,role:'member'}:league,season,lifecycleLabel:'ACTIVE',draftStatus:'completed',standings:mode==='empty'?[]:standings,myTeamId:id(10),allowDelete:mode!=='member',matchweek,records:await Sections.LeagueRecords({competitionPromise:cp}),results:await Sections.LeagueResults({competitionPromise:cp,myTeamId:id(10)}),activity:await Sections.LeagueTransactions({activityPromise:Promise.resolve(mode==='empty'?[]:[{id:'activity',summary:'Kaka FC added Rúben Dias',createdAt:'2026-10-07T12:00:00Z'}])}),trades:await Sections.LeagueTrades({canAcquire:true,leagueId:id(1),tradePromise:tp}),managers:await Sections.LeagueManagers({league,myTeam:teams[0],tradePromise:tp}),archive:null};
 let content=<LeagueOverview {...props}/>;
 if(mode==='Home')content=<div className='flex flex-col gap-6'><h1 className='text-3xl font-semibold'>Home</h1><div className='grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]'><div><MatchupCommand matchup={matchup} hasLeague now={new Date('2026-10-07')}/><StartingXI players={squad.starters.map(slot=>slot.player)}/></div><OperationsRail starters={squad.starters} standings={standings} hasActiveRound myTeamId={id(10)} fixtureIntel={null}/></div></div>;
 const teamSquad=mode==='TeamLong'?{...squad,starters:squad.starters.map((slot,i)=>({...slot,player:{...slot.player,name:i===9?'Christopher Alexander Montgomery III':i===10?'JeanPhilippeMatetaFootballPlayerWithoutSpaces':slot.player.name,fantasyPoints:i===9?1234.56:i===10?-100.25:slot.player.fantasyPoints}})),bench:squad.bench.map((p,i)=>({...p,name:i===0?'Aleksandra Wiśniewska-Kowalczyk':p.name,fantasyPoints:i===0?1234.56:p.fantasyPoints}))}:squad;
 if(mode.startsWith('Team'))content=<TeamPageView acquisitionState={mode==='TeamPreDraft'?'draft_pending':'allowed'} team={mode.includes('Long')?{...teams[0],name:names[3]}:teams[0]} league={league} squad={teamSquad} matchup={viewedMatchup} readOnly={mode.includes('Spectator')||mode.includes('Historical')} managerName='Camden' contextLink={'/matchup/'+id(51)}/>;
 if(mode.startsWith('Matchup'))content=await materialize(await MatchupPageView({league,matchup:mode.includes('Empty')?null:viewedMatchup}));
 if(mode.startsWith('Players'))content=<PlayersWorkspace acquisitionState={mode==='PlayersPreDraft'?'draft_pending':'allowed'} data={mode.includes('Empty')?{...availablePlayers,players:[],total:0}:mode.includes('Long')?{...availablePlayers,players:availablePlayers.players.map(p=>({...p,name:names[3]}))}:availablePlayers} filters={mode.includes('Empty')?{...defaultFilters,query:'no match'}:defaultFilters} page={1} competitions={[{id:'comp',code:'ENG'}]} clubs={[]} hasActiveLeague leagueId={id(1)} fantasyTeamId={id(10)}/>;
 if(mode.startsWith('Draft')){const active={...draft,status:'in_progress',currentRound:2,currentPick:12,currentTeamId:id(mode.includes('Other')?11:10),currentTeamName:mode.includes('Long')?names[3]:'Kaka FC',pickDeadline:new Date(Date.now()+120000).toISOString(),isMyTurn:!mode.includes('Other')};content=mode.includes('Waiting')?<ComingSoon icon={Swords} title='Waiting for managers' description='Invite managers from the League screen.'/>:<><h1 className='v2-page-title mb-6'>Draft</h1><DraftWorkspace clock={{serverAtReceipt:Date.now(),monotonicAtReceipt:performance.now()}} draft={mode.includes('Completed')?draft:active} availablePlayers={availablePlayers} onSearch={query=>window.paths.push('draft-search:'+query)} positionFilter={null} onPositionFilterChange={position=>window.paths.push('draft-position:'+position)}/></>;}
 if(mode.startsWith('Loading'))content=<WorkspaceLoading destination={mode.slice(7)}/>;
 const route=mode.match(/^(Team|Matchup|Players|Draft)/)?.[1]??(mode.startsWith('Loading')?mode.slice(7):'League');window.routePath='/'+route.toLowerCase();
 renderer.render(<AppFrame key={mode} profile={{id:id(20),displayName:'Robert Quintero'}} leagues={mode==='none'?[]:[league,{...league,id:id(99),name:'SecondLeagueWithAnExtremelyLongUnbrokenName'}]} activeLeagueId={id(1)} rules={<GameRulesDialog/>} status={<StatusBar data={{roundNumber:2,resultState:'active',roundStatus:'in_progress',liveCount:0,lockedCount:2,remainingCount:9,nextLockKickoff:'2026-10-10T13:30:00Z'}}/>}>{<div className={/^(Team|Matchup|Players|Draft)/.test(mode)?'core-v2':''}>{content}</div>}</AppFrame>);

};window.mount();`);
 await new Promise((done,fail)=>webpack({mode:'production',optimization:{minimize:false},context:root,entry:join(directory,'entry.jsx'),output:{path:directory,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.jsx','.js'],modules:[join(root,'node_modules')],alias:{'@':join(root,'src'),'next/navigation$':join(directory,'navigation.jsx'),'next/link$':join(directory,'navigation.jsx')}},module:{rules:[{test:/\.css$/,use:join(directory,'css-loader.cjs')},{test:/\.(tsx?|jsx)$/,exclude:/node_modules/,use:join(directory,'loader.cjs')}]},plugins:[new webpack.NormalModuleReplacementPlugin(/data-access\/matchups/,join(directory,'data.js')),new webpack.NormalModuleReplacementPlugin(/data-access\/auth/,join(directory,'actions.js')),new webpack.NormalModuleReplacementPlugin(/app\/\(app\)\/(league\/(actions|trade-actions|delete-actions|season-actions)|team\/actions|players\/actions|draft\/actions|actions)/,join(directory,'actions.js'))]},(error,stats)=>error||stats.hasErrors()?fail(error??new Error(stats.toString({all:false,errors:true}))):done()));
 const {css}=await require('postcss')([require('@tailwindcss/postcss')({base:root})]).process(await readFile(join(root,'src/app/globals.css'),'utf8'),{from:join(root,'src/app/globals.css')});
 const v2=await readFile(join(root,'src/app/(app)/league/v2.css'),'utf8')+'\n'+await readFile(join(root,'src/components/ui/core-v2.css'),'utf8');
 browser=await chromium.launch({headless:true,...(process.env.ELEVEN_CHROMIUM_EXECUTABLE?{executablePath:process.env.ELEVEN_CHROMIUM_EXECUTABLE}:{})});const results=[];
 for(const theme of ['dark','light'])for(const width of [1440,375,320]) {
  const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>{requests.push(route.request().url());return route.abort();});
  await page.setContent('<style>:root{--font-jetbrains-mono:Menlo;}'+css+'\n'+v2+'</style><div id="root"></div>');await page.evaluate(t=>document.documentElement.classList.toggle('dark',t==='dark'),theme);await page.addScriptTag({path:join(directory,'bundle.js')});await page.getByRole('heading',{name:'FANTASTIC 4',exact:true}).waitFor();
  for(const mode of ['MatchupLive','MatchupAway','MatchupSpectator','MatchupPending','MatchupFinal','MatchupHistoricalFinal','MatchupUpcoming','MatchupLong','MatchupEmpty','Team','TeamPreDraft','TeamSpectator','TeamHistorical','TeamLong','Players','PlayersPreDraft','PlayersEmpty','PlayersLong','DraftMyTurn','DraftOtherTurn','DraftCompleted','DraftWaiting','DraftLong']) {
   await page.evaluate(mode=>window.mount(mode),mode);await page.waitForTimeout(80);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,theme+' '+width+' '+mode+' overflow');
   const reads=await page.evaluate(()=>window.reads);assert.equal(reads.length,new Set(reads).size,'no duplicate reads');
   if(mode.startsWith('Matchup')&&!mode.includes('Empty')){
    assert.ok(await page.locator('.core-score').evaluateAll(elements=>elements.every(el=>el.scrollWidth<=el.clientWidth+1)),'score fits '+width+' '+mode);
    assert.equal(await page.locator('.core-team-name a').count(),2);
    assert.equal(await page.locator('.core-versus').count(),0);
    assert.equal(await page.getByRole('link',{name:'← League',exact:true}).count(),0);
    assert.equal(await page.locator('.core-matchup-heading .v2-round-range').count(),1);
    assert.match(await page.locator('.core-matchup-heading').innerText(),/Matchweek 2/);
    assert.ok(await page.locator('.core-matchup-heading .v2-round-range').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=14));
    if(mode.includes('Pending')){assert.equal(await page.getByText(/Finalizing result/).count(),1);assert.equal(await page.getByText(/Winner ·/).count(),0);}
    if(mode.includes('Final'))assert.equal(await page.getByText('Winner · InternationalFootballCollectiveWithoutSpaces',{exact:true}).count(),1);
    if(mode.includes('Upcoming'))assert.deepEqual(await page.locator('.core-score').allTextContents(),['—','—']);
    if(mode.includes('Away'))assert.equal(await page.locator('.core-team-name').first().textContent(),'InternationalFootballCollectiveWithoutSpaces');
    if(mode.includes('Spectator'))assert.equal(await page.locator('.core-team-name').first().textContent(),'Kaka FC');
   }
   if(mode.startsWith('Team')){
    const alignment=await page.locator('.core-xi,.core-bench').evaluateAll(sections=>sections.map(section=>{
     const rows=Array.from(section.querySelectorAll('.core-player-row'));
     const scores=rows.flatMap(row=>Array.from(row.querySelectorAll('.core-player-points')));
     return {right: scores.map(score=>score.getBoundingClientRect().right),fits:scores.every(score=>score.scrollWidth<=score.clientWidth+1),height:rows.map(row=>row.getBoundingClientRect().height)};
    }));
    for(const section of alignment){assert.ok(section.right.length>0);assert.ok(Math.max(...section.right)-Math.min(...section.right)<1,'score column aligned');assert.ok(section.fits,'large player scores fit');if(mode==='Team'){assert.ok(section.height.every(height=>height<=61),'normal rows retain density');}}
    assert.equal(await page.getByText(/T−|MATCHDAY|NO ACTIVE ROUND/).count(),0);
   }
   if(mode==='TeamSpectator'||mode==='TeamHistorical'){assert.equal(await page.getByText(/Read-only lineup/).count(),1);await page.getByRole('button').filter({has:page.getByText('Player 9',{exact:true})}).click();await page.getByRole('dialog').waitFor();assert.equal(await page.getByRole('dialog').getByRole('button',{name:/Move to|Drop player/}).count(),0);await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});}
   if(mode==='PlayersPreDraft'){
    assert.equal(await page.getByRole('button',{name:'Add',exact:true}).count(),0);
    assert.equal(await page.getByText("Players become available after your league's draft.",{exact:true}).count(),1);
    assert.equal(await page.getByRole('link',{name:'Go to draft →',exact:true}).getAttribute('href'),'/draft');
    await page.getByRole('button',{name:'Inspect Player 0',exact:true}).click();await page.waitForTimeout(80);assert.equal(await page.locator('.core-inspector').count(),1);
    assert.equal(await page.locator('.core-inspector').getByRole('button',{name:/^(Add player|Propose trade|Claim player)$/}).count(),0);
    assert.equal(await page.locator('.core-inspector').getByText("Players become available after your league's draft.",{exact:true}).count(),1);
    if(width<1280){await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});}
   }
   if(mode==='TeamPreDraft'){
    assert.equal(await page.getByText(/sign replacements from the free market/).count(),0);
    assert.equal(await page.getByRole('link',{name:'Go to draft →',exact:true}).getAttribute('href'),'/draft');
   }
   if(mode==='Players'){
    await page.getByRole('button',{name:'Inspect Player 0',exact:true}).click();await page.waitForTimeout(80);assert.equal(await page.locator('.core-inspector').count(),1);await page.screenshot({path:'/tmp/eleven-core-inspector-'+theme+'-'+width+'.png',fullPage:true});
    if(width<1280){const dialog=page.getByRole('dialog');await dialog.waitFor();await dialog.locator('button[aria-label="Close player record"]').click();await dialog.waitFor({state:'hidden'});}
    await page.getByRole('combobox',{name:'Position',exact:true}).selectOption('MID');assert.ok((await page.evaluate(()=>window.paths.at(-1))).includes('pos=MID'));
   }
   if(mode==='PlayersEmpty')assert.equal(await page.getByText('No players match these filters',{exact:true}).count(),1);
   if(mode==='DraftMyTurn'||mode==='DraftOtherTurn'){assert.equal(await page.getByLabel('Active draft turn').count(),1);const picks=page.getByRole('button',{name:'Draft',exact:true});assert.ok(await picks.count()>0);if(mode==='DraftOtherTurn')assert.ok(await picks.evaluateAll(buttons=>buttons.every(button=>button.disabled)));await page.getByRole('button',{name:'MID',exact:true}).click();assert.equal(await page.evaluate(()=>window.paths.at(-1)),'draft-position:MID');await page.getByRole('button',{name:'Inspect Player 0',exact:true}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});}
   if(mode==='DraftCompleted'){assert.equal(await page.getByLabel('Active draft turn').count(),0);assert.equal(await page.getByText('Draft complete',{exact:true}).count(),1);assert.equal(await page.getByRole('button',{name:'Draft',exact:true}).count(),0);}
   if(mode==='DraftMyTurn'||mode==='DraftOtherTurn'){await page.waitForFunction(()=>document.querySelector('.core-draft-clock > p:nth-child(2)')?.textContent.includes(':'));}
   await page.screenshot({path:'/tmp/eleven-core-'+mode.toLowerCase()+'-'+theme+'-'+width+'.png',fullPage:true});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);results.push({theme,width,states:21,overflow:false,inspector:true,filters:true,draftGating:true,scoreSemantics:true,errors:0,requests:0});await page.close();
 }
 console.log(JSON.stringify(results,null,2));
} finally {if(browser)await browser.close();await rm(directory,{recursive:true,force:true});}
