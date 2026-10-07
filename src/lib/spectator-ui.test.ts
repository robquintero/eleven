import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import ts from "typescript";
const require=createRequire(import.meta.url),root=resolve(import.meta.dirname,"../..");
type Element={type:unknown;props:Record<string,unknown>};
function load(file:string,mocks:Record<string,unknown>={}):Record<string,(props:Record<string,unknown>)=>Element|Promise<Element>>{
  const filename=resolve(root,file),compiled={exports:{}};
  const code=ts.transpileModule(readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  new Function("require","module","exports",code)((id:string)=>{
    if(id.endsWith(".css")) return {};
    if(id in mocks)return mocks[id];
    if(id==='next/navigation')return {notFound:()=>{throw Error("NOT_FOUND");},redirect:(url:string)=>{throw Error("REDIRECT "+url);},useRouter:()=>({push:()=>{}})};
    if(id==='@/components/shell/transition-link')return {TransitionLink:(props:Record<string,unknown>)=>({type:"a",props})};
    if(id.startsWith('@/data-access/')||id.includes('/actions'))throw Error("Unmocked server dependency "+id);
    if(id==='lucide-react')return new Proxy({},{get:()=>()=>null});
    if(id.startsWith('@/')||id.startsWith('.')){
      const path=id.startsWith('@/')?resolve(root,'src',id.slice(2)):resolve(dirname(filename),id);
      const target=[path,path+'.tsx',path+'.ts'].find(p=>existsSync(p)&&/\.(ts|tsx)$/.test(p));if(target)return load(target,mocks);
    }
    return require(id);
  },compiled,compiled.exports);return compiled.exports;
}
function nodes(value:unknown):Element[]{
  if(Array.isArray(value))return value.flatMap(nodes);if(!value||typeof value!=='object'||!('props'in value))return[];
  const e=value as Element;if(typeof e.type==='function')return nodes(e.type(e.props));return[e,...nodes(e.props.children)];
}
const text=(value:unknown):string=>nodes(value).filter(e=>e.type!=='fragment').map(e=> typeof e.props.children==='string'||typeof e.props.children==='number'?String(e.props.children):Array.isArray(e.props.children)?e.props.children.filter(v=>typeof v==='string'||typeof v==='number').join(''):'').join(' ');
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const base={id:id(8),roundId:id(7),roundNumber:1,roundStartsAt:'2026-09-29T06:00:00Z',roundEndsAt:'2026-10-06T06:00:00Z',roundStatus:'completed',status:'final',isUserHome:true,isSpectator:true,homeTeamName:'Home',awayTeamName:'Away',homeFantasyTeamId:id(3),awayFantasyTeamId:id(4),homeLivePoints:99,awayLivePoints:88,homeFinalPoints:12,awayFinalPoints:9,scoresUpdatedAt:null};
test("matchup presentation retains own-away ordering, neutral home ordering, UUID links and fixed official finals",async()=>{
  const {MatchupCommand}=load('src/components/dashboard/matchup-command.tsx');
  for(const isSpectator of [true,false]){
    const m={...base,isSpectator,isUserHome:isSpectator};
    const tree=await MatchupCommand({matchup:m,hasLeague:true,now:new Date('2026-10-07'),teamLinks:{home:`/team/${id(3)}?round=${id(7)}`,away:`/team/${id(4)}?round=${id(7)}`}});
    const links=nodes(tree).filter(e=>e.type==='a');assert.equal(links[0].props.href,`/team/${id(isSpectator?3:4)}?round=${id(7)}`);assert.equal(links[1].props.href,`/team/${id(isSpectator?4:3)}?round=${id(7)}`);
    assert.match(text(tree),/12/);assert.match(text(tree),/9/);assert.doesNotMatch(text(tree),/99|88/);assert.match(text(tree),/Winner/i);
    assert.match(text(tree),isSpectator?/League matchup/i:/Your team/i);
  }
  const missing=await MatchupCommand({matchup:{...base,status:'live',roundStatus:'in_progress',homeFinalPoints:null,awayFinalPoints:null,homeScoreAvailable:false,awayScoreAvailable:false},hasLeague:true,now:new Date('2026-10-01')});assert.match(text(missing),/—/);assert.doesNotMatch(text(missing),/99|88|Winner/i);
});
test("every league pairing is one keyboard link; ACTIVE/PENDING/FINAL/missing scores preserve semantics",async()=>{
  const {LeagueMatchups}=load('src/components/league/league-matchups.tsx');
  const summary={id:id(8),roundNumber:1,roundStartsAt:base.roundStartsAt,roundEndsAt:base.roundEndsAt,homeTeamId:id(3),awayTeamId:id(4),homeTeamName:'Home',awayTeamName:'Away',homePoints:12,awayPoints:9,status:'final',resultState:'final'};
  for(const state of ['active','pending','final']){
    const tree=await LeagueMatchups({matchups:[{...summary,resultState:state,status:state==='final'?'final':'live'},{...summary,id:id(9),homeTeamId:id(5),awayTeamId:id(6),homePoints:null,awayPoints:null,resultState:state}],myTeamId:id(3),emptyLabel:'NO MATCHUPS FOR ROUND'});
    assert.equal(nodes(tree).filter(e=>e.type==='a').length,2);assert.match(text(tree),/YOUR MATCHUP/);assert.match(text(tree),/—/);
    if(state==='final')assert.match(text(tree),/WINNER · Home/);else assert.doesNotMatch(text(tree),/WINNER/);
    if(state==='pending')assert.match(text(tree),/Finalizing result/);
  }
  assert.match(text(await LeagueMatchups({matchups:[],myTeamId:null,emptyLabel:'NO MATCHUPS FOR ROUND'})),/NO MATCHUPS FOR ROUND/);
});
test("standings and round selectors expose canonical destinations and only stored rounds",async()=>{
  const {StandingsTable}=load('src/components/league/standings-table.tsx');
  const rows=[3,4].map(n=>({fantasyTeamId:id(n),teamName:'Team '+n,played:1,wins:0,draws:0,losses:1,pointsFor:0,pointsAgainst:0,points:0}));
  const links=nodes(await StandingsTable({standings:rows,myTeamId:id(3)})).filter(e=>e.type==='a');assert.deepEqual(links.map(e=>e.props.href),['/team',`/team/${id(4)}`]);
  const {RoundNavigation}=load('src/components/league/round-navigation.tsx');const tree=await RoundNavigation({rounds:[{id:id(7),number:1,seasonNumber:1},{id:id(9),number:1,seasonNumber:2}],selectedId:id(7),currentId:id(9)});
  assert.equal(nodes(tree).filter(e=>e.type==='option').length,2);assert.deepEqual(nodes(tree).filter(e=>e.type==='a').map(e=>e.props.href),[`/league?round=${id(9)}`]);assert.match(text(tree),/Matchweek 1 · Season 1/);assert.match(text(tree),/Matchweek 1 · Season 2/);
  const single=await RoundNavigation({rounds:[{id:id(7),number:1,seasonNumber:1},{id:id(9),number:2,seasonNumber:1}],selectedId:id(9),currentId:id(9),v2:true});
  assert.deepEqual(nodes(single).filter(e=>e.type==='option').map(e=>text(e)),['Matchweek 1','Matchweek 2']);assert.doesNotMatch(text(single),/Fantasy round|S1|Current/);
});
test("team direct route validates before manager reads, redirects owner to editable route and keeps explicit history read-only",async()=>{
  let target:unknown={id:id(3),ownerUserId:id(2),leagueId:id(1),name:'Other'};let context:unknown={user:{id:id(1)},league:{id:id(1),name:'League'},supabase:{from:()=>{reads++;const chain={select:()=>chain,eq:()=>chain,or:()=>chain,maybeSingle:()=>Promise.resolve({data:null})};return chain;}}};let reads=0,roundRead=0;
  const squad={formation:'—',starters:[],bench:[]};const mocks={
    '@/data-access/spectator':{getSpectatorContext:async()=>context,querySpectatorTeam:async()=>target,querySpectatorRound:async()=>{roundRead++;return {id:id(7),number:1,status:'completed',startsAt:base.roundStartsAt,endsAt:base.roundEndsAt};}},
    '@/data-access/roster':{querySquad:()=>{throw Error('Historical fallback forbidden');}},'@/data-access/matchups':{queryTeamRoundSquad:async()=>squad},
    '@/components/team/team-page-view':{TeamPageView:(props:Record<string,unknown>)=>({type:'view',props})}};
  const {default:Page}=load('src/app/(app)/team/[teamId]/page.tsx',mocks);
  const args={params:Promise.resolve({teamId:id(3)}),searchParams:Promise.resolve({round:id(7)})};
  const a=await Page(args),b=await Page(args);const view=nodes(a).find(e=>e.type==='view')!;assert.equal(view.props.readOnly,true);assert.deepEqual(view.props.squad,squad);assert.deepEqual(a,b);
  target=null;reads=0;await assert.rejects(async()=>await Page(args),/NOT_FOUND/);assert.equal(reads,0,'no manager or lineup read before authorization');
  context=null;await assert.rejects(async()=>await Page(args),/NOT_FOUND/);context={user:{id:id(1)},league:{id:id(1)},supabase:{}};target={id:id(3),ownerUserId:id(1)};roundRead=0;
  await assert.rejects(async()=>await Page({params:args.params,searchParams:Promise.resolve({})}),/REDIRECT \/team/);assert.equal(roundRead,0);
});
test("matchup direct route resolves the same authorized immutable resource and rejects null/foreign targets",async()=>{
  let m:unknown=base;const mocks={ '@/data-access/spectator':{getSpectatorContext:async()=>({user:{id:id(1)},league:{id:id(1)},supabase:{}}),querySpectatorMatchup:async()=>m},'@/data-access/teams':{getUserTeamInLeague:async()=>null},'@/components/matchup/matchup-page-view':{MatchupPageView:(props:Record<string,unknown>)=>({type:'view',props})}};
  const {default:Page}=load('src/app/(app)/matchup/[matchupId]/page.tsx',mocks);const args={params:Promise.resolve({matchupId:id(8)})};assert.deepEqual(await Page(args),await Page(args));m=null;await assert.rejects(async()=>await Page(args),/NOT_FOUND/);
});
