// Actual remaining product presenters with isolated action results; no credentials/network.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=resolve(import.meta.dirname,'..');
const {webpack}=require('next/dist/compiled/webpack/webpack');
const {chromium}=await import(process.env.ELEVEN_PLAYWRIGHT_MODULE??'playwright');
const directory=await mkdtemp(join(tmpdir(),'eleven-product-v2-'));let browser;
try {
 await writeFile(join(directory,'loader.cjs'),`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;};`);
 await writeFile(join(directory,'css-loader.cjs'),"module.exports=function(){return '';};");
 await writeFile(join(directory,'actions.js'),`const record=(name,data)=>window.calls.push([name,data instanceof FormData?Object.fromEntries(data):data]);export const authAction=async(_,data)=>{record('auth',data);await new Promise(r=>setTimeout(r,100));return window.authResult??{error:'Please check your details and try again.'};};export const resendConfirmationEmail=authAction;export const requestPasswordReset=authAction;export const updatePassword=authAction;export const startDraftAction=()=>{throw Error('Draft must not start during QA');};export const signOut=()=>{throw Error('No sign out during QA');};export const createLeagueAction=async(_,data)=>{record('create',data);return {error:'This invite state is an isolated test. Please try again.'};};export const joinLeagueAction=async(_,data)=>{record('join',data);return {error:'This invite code is invalid.'};};export const updateDisplayNameAction=async(_,data)=>{record('name',data);return {success:true};};export const changePasswordAction=async(_,data)=>{record('password',data);return {error:'The passwords do not match.'};};export const deleteAccountAction=()=>{throw Error('Deletion must not be submitted');};export const deleteLeagueAction=deleteAccountAction;export const getTradeRostersAction=async()=>({});export const proposeTradeAction=deleteAccountAction;export const acceptTradeAction=deleteAccountAction;export const rejectTradeAction=deleteAccountAction;export const cancelTradeAction=deleteAccountAction;export const setSeasonScheduleFormatAction=deleteAccountAction;export const startNextSeasonAction=deleteAccountAction;`);
 await writeFile(join(directory,'navigation.jsx'),`import React from 'react';export const useRouter=()=>({push:path=>window.paths.push(path),replace:path=>window.paths.push(path)});export const useLinkStatus=()=>({pending:false});export default function Link({children,label,...props}){return <a {...props} onClick={e=>{e.preventDefault();props.onClick?.(e);window.paths.push(props.href);}}>{children}</a>;}`);
 await writeFile(join(directory,'entry.jsx'),`
import React from 'react';import {createRoot} from 'react-dom/client';
import {LandingView} from ${JSON.stringify(join(root,'src/components/public/landing-view.tsx'))};
import {PublicShell} from ${JSON.stringify(join(root,'src/components/public/public-shell.tsx'))};
import AuthLayout from ${JSON.stringify(join(root,'src/app/(auth)/layout.tsx'))};
import {AuthForm} from ${JSON.stringify(join(root,'src/components/auth/auth-form.tsx'))};
import {CheckYourEmail} from ${JSON.stringify(join(root,'src/components/auth/check-your-email.tsx'))};
import {ForgotPasswordForm} from ${JSON.stringify(join(root,'src/components/auth/forgot-password-form.tsx'))};
import {ResetPasswordForm} from ${JSON.stringify(join(root,'src/components/auth/reset-password-form.tsx'))};
import {ExpiredRecovery} from ${JSON.stringify(join(root,'src/components/auth/expired-recovery.tsx'))};
import {StartDraftButton} from ${JSON.stringify(join(root,'src/components/draft/start-draft-button.tsx'))};
import {NoLeagueOnboarding} from ${JSON.stringify(join(root,'src/components/shell/no-league-onboarding.tsx'))};
import {ComingSoon} from ${JSON.stringify(join(root,'src/components/shell/coming-soon.tsx'))};
import {AccountView} from ${JSON.stringify(join(root,'src/components/account/account-view.tsx'))};
import {SeasonPanel} from ${JSON.stringify(join(root,'src/components/league/season-panel.tsx'))};
import {ProposeTradeDialog} from ${JSON.stringify(join(root,'src/components/league/trade-center.tsx'))};
import {DeleteLeagueSection} from ${JSON.stringify(join(root,'src/components/league/delete-league-section.tsx'))};
import NotFound from ${JSON.stringify(join(root,'src/app/not-found.tsx'))};
import ErrorPage from ${JSON.stringify(join(root,'src/app/error.tsx'))};
import {StandingsTable} from ${JSON.stringify(join(root,'src/components/league/standings-table.tsx'))};
import {LeagueMatchups} from ${JSON.stringify(join(root,'src/components/league/league-matchups.tsx'))};
import {V2Surface,V2Heading,V2Loading} from ${JSON.stringify(join(root,'src/components/ui/v2.tsx'))};
import {Button} from ${JSON.stringify(join(root,'src/components/ui/button.tsx'))};
import {authAction} from './actions.js';
${['about','contact','data-sources','accessibility','terms','privacy','cookies','disclaimer'].map((route,i)=>`import Public${i} from ${JSON.stringify(join(root,'src/app/(public)/'+route+'/page.tsx'))};`).join('\n')}
const pages={${['about','contact','data-sources','accessibility','terms','privacy','cookies','disclaimer'].map((route,i)=>`'${route}':Public${i}`).join(',')}};
const name='InternationalFootballCollectiveWithoutSpaces';const email='bartholomew.fitzgerald@northwind-industries-holdings.example.com';
const identity={userId:'user',email,displayName:'Aleksandra Wiśniewska-Kowalczyk',leaguesCreatedCount:0};
const leagues=Array.from({length:8},(_,i)=>({id:'league'+i,name:i?['Jo’s League','North London Football Association — Sunday Rivalries'][i%2]:name,role:i?'member':'commissioner',memberCount:i?1:16,maxTeams:16}));
const teams=[{id:'my',name:'Kaka FC',leagueId:'league',ownerUserId:'user',abbreviation:'KFC'},{id:'their',name,leagueId:'league',ownerUserId:'other',abbreviation:'IFC'}];
const rosters={my:Array.from({length:16},(_,i)=>({id:'mine'+i,name:i?'Jo':'Seán O’Brien-Ó Súilleabháin',position:['GK','DEF','MID','FWD'][i%4]})),their:Array.from({length:16},(_,i)=>({id:'theirs'+i,name:i?'Player '+i:'Christopher Alexander Montgomery III',position:['GK','DEF','MID','FWD'][i%4]}))};
window.calls=[];window.paths=[];const renderer=createRoot(document.getElementById('root'));
window.mount=(mode='Landing')=>{window.authResult=null;let content;
 if(mode==='Landing')content=<LandingView/>;
 if(pages[mode])content=<PublicShell document>{React.createElement(pages[mode])}</PublicShell>;
 if(['Login','Signup','CallbackError','AuthError','AuthUnconfirmed','AuthPending','SignupConfirm'].includes(mode)){
  window.authResult=mode==='SignupConfirm'?{awaitingConfirmation:true,email}:mode==='AuthUnconfirmed'?{error:'Confirm your email before signing in.',unconfirmedEmail:email}:null;
  content=<AuthLayout><AuthForm mode={mode==='Signup'||mode==='SignupConfirm'?'sign-up':'sign-in'} action={authAction} callbackError={mode==='CallbackError'?'This confirmation link has expired. Request a new link to continue.':undefined}/></AuthLayout>;
 }
 if(mode==='Confirm')content=<AuthLayout><CheckYourEmail email={email}/></AuthLayout>;
 if(mode==='Forgot'||mode==='ForgotSent'){window.authResult=mode==='ForgotSent'?{sent:true}:null;content=<AuthLayout><ForgotPasswordForm/></AuthLayout>;}
 if(mode==='Reset'||mode==='ResetUpdated'){window.authResult=mode==='ResetUpdated'?{updated:true}:null;content=<AuthLayout><ResetPasswordForm/></AuthLayout>;}
 if(mode==='Expired')content=<AuthLayout><ExpiredRecovery/></AuthLayout>;
 if(mode==='NoLeague')content=<NoLeagueOnboarding/>;
 if(mode==='Waiting')content=<ComingSoon title='Waiting for managers' description='This league needs at least 2 managers before the draft can begin (1 so far). Invite more managers from the League screen.'><a href='/league' className='v2-link'>Open league →</a></ComingSoon>;
 if(mode==='Ready')content=<ComingSoon title='Ready for draft' description='4 of 16 managers have joined. You can start the draft now, or wait for more to join first.'><StartDraftButton leagueId='league'/></ComingSoon>;
 if(mode==='Account'||mode==='AccountEmpty'||mode==='AccountBlocked')content=<AccountView identity={{...identity,leaguesCreatedCount:mode==='AccountBlocked'?1:0}} leagues={mode==='AccountEmpty'?[]:leagues}/>;
 if(mode==='Setup')content=<SeasonPanel season={null} leagueId='league' isCommissioner/>;
 if(mode==='SeasonCompleted')content=<SeasonPanel season={{id:'season',status:'COMPLETED',seasonNumber:1,championTeamName:name,scheduleCycles:2}} leagueId='league' isCommissioner/>;
 if(mode==='NotFound')content=<NotFound/>;
 if(mode==='Error')content=<ErrorPage error={new Error('Expected isolated fixture error')} retry={()=>window.calls.push(['retry'])} reset={()=>window.calls.push(['reset'])}/>;
 if(mode==='Loading')content=<V2Loading title='Account'/>;
 if(mode==='DeleteLeague')content=<DeleteLeagueSection leagueId='league' leagueName={name} v2/>;
 if(mode==='Trade')content=<ProposeTradeDialog open onOpenChange={()=>{}} leagueId='league' myRoster={rosters.my} otherTeams={teams.slice(1)} rostersByTeamId={rosters} onProposed={()=>{}} v2/>;
 if(mode==='Archive')content=<div className='archive-v2 space-y-6'><header><a href='/league' className='v2-link'>Back to league</a><h1 className='v2-page-title'>Season 1</h1><p className='v2-secondary mt-3'>{name} — Champion</p></header><V2Surface><V2Heading title='Final standings'/><StandingsTable variant='v2' myTeamId='my' standings={teams.map((t,i)=>({fantasyTeamId:t.id,teamName:t.name,played:6,wins:3,losses:3,draws:0,pointsFor:i?1234.56:0,pointsAgainst:125.5,leaguePoints:9}))}/></V2Surface><V2Surface><V2Heading title='Results'/><div className='px-4 pb-4'><LeagueMatchups variant='v2' compact preserveOrder myTeamId='my' matchups={[{id:'match',roundId:'round',roundNumber:1,homeTeamId:'my',awayTeamId:'their',homeTeamName:teams[0].name,awayTeamName:name,homePoints:-42.5,awayPoints:1234.56,resultState:'final',roundStartsAt:'2026-09-29T06:00:00Z',roundEndsAt:'2026-10-06T06:00:00Z'}]} emptyLabel='No results yet.'/></div></V2Surface></div>;
 const standalone=mode==='Landing'||pages[mode]||['Login','Signup','CallbackError','AuthError','AuthUnconfirmed','AuthPending','SignupConfirm','Confirm','Forgot','ForgotSent','Reset','ResetUpdated','Expired','NotFound','Error'].includes(mode);
 renderer.render(<React.Fragment key={mode}>{standalone?content:<div className='eleven-v2 app-v2' style={{minHeight:'100dvh',padding:'24px 16px'}}><main id='main-content'>{content}</main></div>}</React.Fragment>);
};window.mount();
`);
 await new Promise((done,fail)=>webpack({mode:'production',optimization:{minimize:false},context:root,entry:join(directory,'entry.jsx'),output:{path:directory,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.jsx','.js'],modules:[join(root,'node_modules')],alias:{'@':join(root,'src'),'next/navigation$':join(directory,'navigation.jsx'),'next/link$':join(directory,'navigation.jsx')}},module:{rules:[{test:/\.css$/,use:join(directory,'css-loader.cjs')},{test:/\.(tsx?|jsx)$/,exclude:/node_modules/,use:join(directory,'loader.cjs')}]},plugins:[new webpack.NormalModuleReplacementPlugin(/data-access\/auth/,join(directory,'actions.js')),new webpack.NormalModuleReplacementPlugin(/app\/\(app\)\/(account\/actions|draft\/actions|league\/(actions|trade-actions|delete-actions|season-actions))/,join(directory,'actions.js'))]},(error,stats)=>error||stats.hasErrors()?fail(error??new Error(stats.toString({all:false,errors:true}))):done()));
 const {css}=await require('postcss')([require('@tailwindcss/postcss')({base:root})]).process(await readFile(join(root,'src/app/globals.css'),'utf8'),{from:join(root,'src/app/globals.css')});
 const extra=await readFile(join(root,'src/app/(app)/league/v2.css'),'utf8')+'\n'+await readFile(join(root,'src/components/ui/core-v2.css'),'utf8');
 browser=await chromium.launch({headless:true,executablePath:process.env.ELEVEN_CHROMIUM_EXECUTABLE});const results=[];
 const modes=['Landing','about','contact','data-sources','accessibility','terms','privacy','cookies','disclaimer','Login','Signup','CallbackError','AuthError','AuthUnconfirmed','AuthPending','SignupConfirm','Confirm','Forgot','ForgotSent','Reset','ResetUpdated','Expired','NoLeague','Waiting','Ready','Account','AccountEmpty','AccountBlocked','Setup','SeasonCompleted','NotFound','Error','Loading','DeleteLeague','Trade','Archive'];
 for(const theme of ['dark','light'])for(const width of process.env.ELEVEN_QA_QUICK?[375]:[1440,375,320]){
  const page=await browser.newPage({viewport:{width,height:1000},hasTouch:width<768}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>{requests.push(route.request().url());return route.abort();});
  await page.setContent('<style>:root{--font-jetbrains-mono:Menlo;}'+css+'\n'+extra+'</style><div id="root"></div>');await page.evaluate(t=>document.documentElement.classList.toggle('dark',t==='dark'),theme);await page.addScriptTag({path:join(directory,'bundle.js')});await page.getByRole('heading',{name:/Your squad/}).waitFor();
  for(const mode of modes){
   await page.evaluate(mode=>window.mount(mode),mode);await page.waitForTimeout(80);
   if(['AuthError','AuthUnconfirmed','AuthPending','SignupConfirm','ForgotSent','ResetUpdated'].includes(mode)){
    if(await page.locator('input[name="email"]').count())await page.locator('input[name="email"]').fill('manager@example.com');
    if(await page.locator('input[name="displayName"]').count())await page.locator('input[name="displayName"]').fill('Aleksandra Wiśniewska-Kowalczyk');
    if(await page.locator('input[name="password"]').count())await page.locator('input[name="password"]').fill('isolated-password');
    if(await page.locator('input[name="confirmPassword"]').count())await page.locator('input[name="confirmPassword"]').fill('isolated-password');
    await page.locator('button[type="submit"]').first().click();
    if(mode==='AuthPending')assert.equal(await page.locator('form[aria-busy="true"]').count(),1);
    await page.waitForTimeout(150);
    if(mode==='AuthError'||mode==='AuthUnconfirmed')assert.equal(await page.getByRole('alert').count(),1);
    if(mode==='SignupConfirm'||mode==='ForgotSent')assert.equal(await page.getByRole('heading',{name:'Check your email',exact:true}).count(),1);
    if(mode==='ResetUpdated')assert.equal(await page.getByRole('heading',{name:'Password updated',exact:true}).count(),1);
   }
   if(mode==='NoLeague'){
    for(const action of ['Create league','Join league']){
     await page.getByRole('button',{name:action,exact:true}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();assert.equal(await dialog.getByRole('form',{name:action,exact:true}).count(),1);
     await page.screenshot({path:'/tmp/eleven-product-'+action.split(' ')[0].toLowerCase()+'-'+theme+'-'+width+'.png',fullPage:true});
     if(action==='Join league'){await dialog.locator('input[name="inviteCode"]').fill('INVALID');await dialog.locator('input[name="teamName"]').fill('NorthLondonFootballCollectiveWithoutSpaces');await dialog.locator('input[name="teamAbbreviation"]').fill('NLFC');await dialog.getByRole('button',{name:'Join league',exact:true}).click();await dialog.getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>window.calls.at(-1)[0]),'join');}
     await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await page.getByRole('button',{name:action,exact:true}).evaluate(el=>el===document.activeElement),true);
    }
   }
   if(mode==='Account'){await page.locator('input[name="displayName"]').fill('Jo');await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved.'}).waitFor();await page.locator('input[name="password"]').fill('isolated-password');await page.locator('input[name="confirmPassword"]').fill('other-password');await page.getByRole('button',{name:'Update password',exact:true}).click();await page.getByRole('alert').waitFor();}
   if(mode==='AccountBlocked')assert.equal(await page.locator('input[name="confirmEmail"]').count(),0);
   if(mode==='DeleteLeague'){await page.getByRole('button',{name:'Delete league',exact:true}).click();await page.getByRole('dialog').waitFor();assert.equal(await page.getByRole('button',{name:'Permanently delete league',exact:true}).isDisabled(),true);await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});await page.getByRole('button',{name:'Delete league',exact:true}).click();await page.getByRole('dialog').waitFor();}
   if(mode==='Trade'){await page.getByRole('button',{name:'InternationalFootballCollectiveWithoutSpaces',exact:true}).click();await page.getByRole('checkbox').first().waitFor();await page.getByRole('checkbox').first().click();assert.equal(await page.getByRole('button',{name:'Review',exact:true}).isDisabled(),true);await page.screenshot({path:'/tmp/eleven-product-trade-selection-'+theme+'-'+width+'.png',fullPage:true});assert.equal(await page.getByRole('group',{name:'You send',exact:true}).getByRole('checkbox').count(),16);assert.equal(await page.getByRole('group',{name:'You receive',exact:true}).getByRole('checkbox').count(),16);await page.getByRole('group',{name:'You receive',exact:true}).getByRole('checkbox').first().click();assert.equal(await page.getByRole('button',{name:'Review',exact:true}).isEnabled(),true);await page.getByRole('button',{name:'Review',exact:true}).click();assert.equal(await page.getByText('Christopher Alexander Montgomery III',{exact:true}).count(),1);await page.screenshot({path:'/tmp/eleven-product-trade-review-'+theme+'-'+width+'.png',fullPage:true});await page.getByRole('button',{name:'Back',exact:true}).click();assert.equal(await page.getByRole('checkbox',{checked:true}).count(),2);}
   if(mode==='Error'){await page.getByRole('button',{name:'Try again',exact:true}).click();assert.equal(await page.evaluate(()=>window.calls.at(-1)[0]),'retry');}
   const overflow=await page.evaluate(()=>({page:document.documentElement.scrollWidth>innerWidth,dialog:Array.from(document.querySelectorAll('[role="dialog"]')).some(el=>el.scrollWidth>el.clientWidth+1)}));if(overflow.page||overflow.dialog){await page.screenshot({path:'/tmp/eleven-product-overflow.png',fullPage:true});console.log(mode,theme,width,await page.locator('body *').evaluateAll(els=>els.filter(el=>el.getBoundingClientRect().right>innerWidth+1).map(el=>({tag:el.tagName,text:el.textContent?.slice(0,80),class:el.className,width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right})).slice(0,25)));}assert.deepEqual(overflow,{page:false,dialog:false},mode+' '+theme+' '+width+' overflow');
   assert.equal(await page.locator('button button,button a,a button').count(),0,mode+' nested controls');
   if(width<768){assert.ok(await page.locator('input:not([type="hidden"]):not([type="radio"]),textarea,select').evaluateAll(els=>els.every(el=>parseFloat(getComputedStyle(el).fontSize)>=16)),mode+' mobile input size');}
   await page.screenshot({path:'/tmp/eleven-product-'+mode.toLowerCase()+'-'+theme+'-'+width+'.png',fullPage:true});
  }
  // Enlarge text on a long-data account and public entrance rather than editing markup.
  for(const mode of ['Account','Landing','Confirm']){await page.evaluate(mode=>window.mount(mode),mode);await page.waitForTimeout(50);await page.addStyleTag({content:'.eleven-v2 {font-size:20px} .account-v2 p,.account-v2 strong,.account-v2 label,.account-v2 button {font-size:20px !important}'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,mode+' enlarged text');}
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);results.push({theme,width,states:modes.length,overflow:false,authStates:true,onboardingFlows:true,accountFeedback:true,destructiveGates:true,requests:0,errors:0});await page.close();
 }
 console.log(JSON.stringify(results,null,2));
} finally {if(browser)await browser.close();await rm(directory,{recursive:true,force:true});}
