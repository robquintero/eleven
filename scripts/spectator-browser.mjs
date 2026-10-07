// Real shared components/primitives in an isolated bundle. No credentials or
// server: all network requests are blocked and server actions are test doubles.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=resolve(import.meta.dirname,'..');
const {webpack}=require('next/dist/compiled/webpack/webpack');
const {chromium}=await import(process.env.ELEVEN_PLAYWRIGHT_MODULE??'playwright');
const directory=await mkdtemp(join(tmpdir(),'eleven-spectator-'));let browser;
try {
  await writeFile(join(directory,'loader.cjs'),`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;};`);
  await writeFile(join(directory,'css-loader.cjs'),"module.exports=()=>'';");
  await writeFile(join(directory,'actions.js'),`export const swapLineupAction=(...args)=>{window.calls.push(args);throw Error('Spectator must not mutate');};export const fillEmptySlotsAction=swapLineupAction;export const getPlayerRecentMatchesAction=()=>Promise.resolve([]);export const getPlayerScoreBreakdownAction=()=>Promise.resolve(null);`);
  await writeFile(join(directory,'navigation.jsx'),`import React from 'react';export const useRouter=()=>({push:path=>window.paths.push(path)});export const useLinkStatus=()=>({pending:false});export default function Link({children,label,...props}){return <a {...props} onClick={e=>{e.preventDefault();window.paths.push(props.href);}}>{children}</a>;}`);
  await writeFile(join(directory,'entry.jsx'),`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {TeamPageView} from ${JSON.stringify(join(root,'src/components/team/team-page-view.tsx'))};
import {MatchupCommand} from ${JSON.stringify(join(root,'src/components/dashboard/matchup-command.tsx'))};
import {MatchupLineups} from ${JSON.stringify(join(root,'src/components/matchup/matchup-lineups.tsx'))};
import {LeagueMatchups} from ${JSON.stringify(join(root,'src/components/league/league-matchups.tsx'))};
import {RoundNavigation} from ${JSON.stringify(join(root,'src/components/league/round-navigation.tsx'))};
import {StandingsTable} from ${JSON.stringify(join(root,'src/components/league/standings-table.tsx'))};
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const long='InternationalFootballCollectiveWithoutSpaces';const club={id:'club',name:'Club',shortName:'CLB',league:'premier-league',crestColor:'#000'};
const player=(name,position)=>({id:name,name,externalId:'',position,club,fantasyPoints:3,ownership:'owned',ownerTeamName:long,availability:'available'});
const positions=['GK','DEF','DEF','DEF','DEF','MID','MID','MID','MID','FWD','FWD'];
const squad={formation:'4-4-2',starters:positions.map((position,i)=>({id:'entry'+i,position,x:0,y:0,locked:i===0,player:player('STARTER'+i,position)})),bench:[player('BENCH_DEF','DEF'),player('BENCH_FWD','FWD')]};
const matchup={id:id(8),roundId:id(7),roundNumber:1,roundStartsAt:'2026-09-29T06:00:00Z',roundEndsAt:'2026-10-06T06:00:00Z',roundStatus:'completed',status:'final',isUserHome:true,isSpectator:true,homeFantasyTeamId:id(3),awayFantasyTeamId:id(4),homeTeamName:long,awayTeamName:'South Florida Football Club — Operations',homeLivePoints:99,awayLivePoints:88,homeFinalPoints:12,awayFinalPoints:9,scoresUpdatedAt:null};
const summary={id:id(8),roundNumber:1,roundStartsAt:matchup.roundStartsAt,roundEndsAt:matchup.roundEndsAt,homeTeamId:id(3),awayTeamId:id(4),homeTeamName:long,awayTeamName:matchup.awayTeamName,homePoints:12,awayPoints:9,status:'final',resultState:'final'};
window.calls=[];window.paths=[];
function Harness(){const[mode,setMode]=useState('League');window.mount=next=>{setMode(next);window.paths=[];};
if(mode==='Team'||mode==='Empty')return <TeamPageView team={{id:id(3),name:long}} league={{id:id(1),name:'League'}} managerName='Other Manager' readOnly contextLink={'/matchup/'+id(8)} matchup={matchup} squad={mode==='Empty'?{formation:'—',starters:[],bench:[]}:squad}/>;
if(mode==='Matchup')return <><MatchupCommand matchup={matchup} hasLeague now={new Date('2026-10-07')} teamLinks={{home:'/team/'+id(3)+'?round='+id(7),away:'/team/'+id(4)+'?round='+id(7)}}/><MatchupLineups homeTeamName={long} awayTeamName={matchup.awayTeamName} isUserHome isSpectator homeSquad={squad} awaySquad={squad}/></>;
return <><RoundNavigation rounds={[{id:id(7),number:1},{id:id(9),number:2}]} selectedId={id(7)} currentId={id(9)}/><LeagueMatchups matchups={[summary,{...summary,id:id(9),resultState:'pending',status:'live'},{...summary,id:id(10),resultState:'active',status:'live',homePoints:null,awayPoints:null}]} myTeamId={id(3)} emptyLabel='NO MATCHUPS FOR ROUND'/><StandingsTable standings={[{fantasyTeamId:id(3),teamName:long,played:1,wins:1,draws:0,losses:0,pointsFor:12,pointsAgainst:9,points:3},{fantasyTeamId:id(4),teamName:matchup.awayTeamName,played:1,wins:0,draws:0,losses:1,pointsFor:9,pointsAgainst:12,points:0}]} myTeamId={id(3)}/></>;
}createRoot(document.getElementById('root')).render(<Harness/>);`);
  await new Promise((done,fail)=>webpack({mode:'production',optimization:{minimize:false},context:root,entry:join(directory,'entry.jsx'),output:{path:directory,filename:'bundle.js'},
    resolve:{extensions:['.tsx','.ts','.jsx','.js'],modules:[join(root,'node_modules')],alias:{'@':join(root,'src'),'next/navigation$':join(directory,'navigation.jsx'),'next/link$':join(directory,'navigation.jsx')}},
    module:{rules:[{test:/\.css$/,use:join(directory,'css-loader.cjs')},{test:/\.(tsx?|jsx)$/,exclude:/node_modules/,use:join(directory,'loader.cjs')}]},
    plugins:[new webpack.NormalModuleReplacementPlugin(/app\/\(app\)\/(team|players)\/actions/,join(directory,'actions.js'))]
  },(error,stats)=>error||stats.hasErrors()?fail(error??new Error(stats.toString({all:false,errors:true}))):done()));
  const {css:baseCss}=await require('postcss')([require('@tailwindcss/postcss')({base:root})]).process(await readFile(join(root,'src/app/globals.css'),'utf8'),{from:join(root,'src/app/globals.css')});
  const css=baseCss+'\n'+await readFile(join(root,'src/components/ui/core-v2.css'),'utf8');
  browser=await chromium.launch({headless:true,executablePath:process.env.ELEVEN_CHROMIUM_EXECUTABLE});const results=[];
  for(const theme of ['light','dark'])for(const width of [1440,375,320]) {
    const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>{requests.push(route.request().url());return route.abort();});
    await page.setContent(`<style>${css}</style><main class="eleven-v2 app-v2 core-v2" id="root" style="padding:16px;max-width:1200px;margin:auto"></main>`);await page.evaluate(theme=>document.documentElement.classList.toggle('dark',theme==='dark'),theme);await page.addScriptTag({path:join(directory,'bundle.js')});await page.waitForFunction(()=>typeof window.mount==='function');
    assert.equal(await page.locator('a[href^="/matchup/"]').count(),3);assert.equal(await page.getByText('WINNER · '+ 'InternationalFootballCollectiveWithoutSpaces',{exact:false}).count(),1);
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement?.tagName),'SELECT');await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement?.tagName),'A');
    await page.getByRole('combobox',{name:'Matchweek',exact:true}).selectOption('00000000-0000-4000-8000-000000000009');assert.deepEqual(await page.evaluate(()=>window.paths),['/league?round=00000000-0000-4000-8000-000000000009']);
    for(const mode of ['League','Matchup','Team','Empty']) {
      await page.evaluate(mode=>window.mount(mode),mode);await page.waitForTimeout(40);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,theme+' '+width+' '+mode+' no page overflow');
      await page.screenshot({path:'/tmp/eleven-spectator-'+mode.toLowerCase()+'-'+theme+'-'+width+'.png',fullPage:true});
      if(mode==='Matchup'){assert.ok(await page.getByText('Home XI',{exact:true}).count()>0);assert.ok(await page.getByText('Away XI',{exact:true}).count()>0);assert.equal(await page.getByText('Your team',{exact:true}).count(),0);assert.equal(await page.locator('a[href^="/team/"]').count(),2);}
      if(mode==='Team'){
        assert.equal(await page.getByText('Read-only lineup · Select a player to inspect.').isVisible(),true);assert.equal(await page.getByRole('button',{name:/Done|Drop Player|Substitute|Edit Lineup|Swap/i}).count(),0);
        const starter=page.getByRole('button').filter({has:page.getByText('STARTER1',{exact:true})});await starter.focus();await page.keyboard.press('Enter');const dialog=page.getByRole('dialog');await dialog.waitFor();
        assert.equal(await dialog.getByText('STARTER1',{exact:true}).count()>0,true);assert.equal(await dialog.getByRole('button',{name:/Drop|Substitute|Swap/i}).count(),0);await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
        await page.getByRole('button').filter({has:page.getByText('BENCH_DEF',{exact:true})}).click();await dialog.waitFor();await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.deepEqual(await page.evaluate(()=>window.calls),[]);
      }
      if(mode==='Empty')assert.equal(await page.getByText('No bench players').isVisible(),true);
    }
    assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);results.push({theme,width,league:true,matchup:true,team:true,empty:true,keyboard:true,inspector:true,mutations:0,requests:0,errors:0,overflow:false});await page.close();
  }
  console.log(JSON.stringify(results,null,2));
}finally{if(browser)await browser.close();await rm(directory,{recursive:true,force:true});}
