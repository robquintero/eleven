import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { canDeleteLeague, validLeagueDeleteConfirmation } from "./league-deletion.ts";
import { resolveActiveLeagueId } from "./active-league-selection.ts";

const require=createRequire(import.meta.url);
function load(path:string,mocks:Record<string,unknown>) {
  const code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const compiled={exports:{}};
  new Function('require','module','exports',code)((name:string)=>{
    if(name in mocks)return mocks[name];
    if(name==='@/lib/league-deletion')return {canDeleteLeague,validLeagueDeleteConfirmation,leagueDeletionError:()=> 'Deletion failed safely.'};
    if(name.startsWith('@/components/ui/'))return new Proxy({},{get:(_,key)=>String(key)});
    if(name.startsWith('@/'))throw new Error(`Unmocked dependency ${name}`);
    return require(name);
  },compiled,compiled.exports);
  return compiled.exports as Record<string,(...args:unknown[])=>unknown>;
}
type Element={type:string;props:Record<string,unknown>};
function nodes(value:unknown):Element[]{if(Array.isArray(value))return value.flatMap(nodes);if(!value||typeof value!=='object'||!('props' in value))return [];const element=value as Element;return [element,...nodes(element.props.children)];}
function text(value:unknown):string{if(Array.isArray(value))return value.map(text).join('');if(typeof value==='string')return value;if(value&&typeof value==='object'&&'props' in value)return text((value as Element).props.children);return '';}
function ui(action:(...args:unknown[])=>Promise<unknown>) {
  const state:unknown[]=[];const refs:unknown[]=[];let cursor=0,refCursor=0,pending=false,job:Promise<unknown>=Promise.resolve();const destinations:string[]=[];
  const component=load('../components/league/delete-league-section.tsx',{
    react:{useState:(initial:unknown)=>{const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],(value:unknown)=>{state[i]=value;}];},useRef:(initial:unknown)=>{const i=refCursor++;return refs[i]??(refs[i]={current:initial});},useTransition:()=>[pending,(callback:()=>Promise<unknown>)=>{pending=true;job=callback().finally(()=>{pending=false;});}]},
    'next/navigation':{useRouter:()=>({replace:(path:string)=>destinations.push(path)})},
    '@/app/(app)/league/delete-actions':{deleteLeagueAction:action},
  }).DeleteLeagueSection;
  const render=()=>{cursor=0;refCursor=0;return nodes(component({leagueId:'target-id',leagueName:'Actual Commissioner League'}));};
  const find=(type:string,label?:string)=>{const node=render().find(n=>n.type===type&&(!label||text(n.props.children)===label));assert.ok(node,`${type} ${label}`);return node.props;};
  return {find,render,done:()=>job,destinations};
}

test('only selected commissioner AND owner is eligible; exact case-sensitive confirmation',()=>{
  assert.equal(canDeleteLeague('commissioner','u','u'),true);
  assert.equal(canDeleteLeague('manager','u','u'),false);
  assert.equal(canDeleteLeague('commissioner','owner','other'),false);
  for(const value of ['',null,'delete','Delete',' DELETE','DELETE ','DELETE\n'])assert.equal(validLeagueDeleteConfirmation(value),false);
  assert.equal(validLeagueDeleteConfirmation('DELETE'),true);
});
test('dialog: actual name, exact phrase gating, Enter suppressed, cancel/reset and pending duplicate protection',async()=>{
  let calls=0,finish!:(value:unknown)=>void;const view=ui(async()=>{calls++;return new Promise(resolve=>{finish=resolve;});});
  const open=view.find('Dialog').onOpenChange as (value:boolean)=>void;open(true);
  assert.equal(text(view.find('DialogTitle').children),'Delete Actual Commissioner League?');
  assert.equal(view.find('Button','Permanently Delete League').disabled,true);
  const input=view.find('Input');let prevented=false;(input.onKeyDown as (e:unknown)=>void)({key:'Enter',preventDefault:()=>{prevented=true;}});assert.equal(prevented,true);
  for(const value of ['delete',' DELETE','DELETE ']){(input.onChange as (e:unknown)=>void)({target:{value}});assert.equal(view.find('Button','Permanently Delete League').disabled,true);}
  (input.onChange as (e:unknown)=>void)({target:{value:'DELETE'}});
  assert.equal(view.find('Button','Permanently Delete League').disabled,false);
  (view.find('Button','Cancel').onClick as ()=>void)();assert.equal(view.find('Dialog').open,false);assert.equal(view.find('Input').value,'');
  open(true);(input.onChange as (e:unknown)=>void)({target:{value:'DELETE'}});
  const submit=view.find('Button','Permanently Delete League').onClick as ()=>void;submit();submit();assert.equal(calls,1);
  assert.equal(view.find('Button','Deleting…').disabled,true);assert.equal(view.find('Button','Cancel').disabled,true);
  open(false);assert.equal(view.find('Dialog').open,true);
  assert.ok(view.render().some(n=>n.props.role==='status'&&text(n.props.children).includes('Deleting league')));
  finish({error:'Atomic failure — nothing deleted'});await view.done();
  assert.equal(view.find('Dialog').open,true);assert.ok(view.render().some(n=>n.props.role==='alert'&&text(n.props.children).includes('Atomic failure')));
});
test('dialog success closes and soft-navigates home; transport failure stays open',async()=>{
  for(const succeeds of [true,false]){
    const view=ui(async(league,phrase)=>{assert.equal(league,'target-id');assert.equal(phrase,'DELETE');if(!succeeds)throw new Error('transport');return {success:true};});
    (view.find('Dialog').onOpenChange as (value:boolean)=>void)(true);
    (view.find('Input').onChange as (e:unknown)=>void)({target:{value:'DELETE'}});
    (view.find('Button','Permanently Delete League').onClick as ()=>void)();await view.done();
    assert.equal(view.find('Dialog').open,!succeeds);assert.deepEqual(view.destinations,succeeds?['/']:[]);
  }
});
test('actual server action validates auth/selected UUID, calls user RPC, clears cookie and invalidates context only on success',async()=>{
  const target='00000000-0000-4000-8000-000000000003';let selected:string|null=target,user:unknown={id:'u'},response:unknown={data:target,error:null};const calls:unknown[]=[];
  const action=load('../app/(app)/league/delete-actions.ts',{
    'next/headers':{cookies:async()=>({delete:(key:string)=>calls.push(['cookie',key])})},'next/cache':{revalidatePath:(...args:unknown[])=>calls.push(['revalidate',...args])},
    '@/data-access/active-league':{ACTIVE_LEAGUE_COOKIE:'eleven_active_league',getActiveLeagueId:async()=>selected},
    '@/data-access/leagues':{getUserLeagues:async()=>[]},
    '@/lib/supabase/server':{getCurrentUser:async()=>user,createClient:async()=>({rpc:async(...args:unknown[])=>{calls.push(['rpc',...args]);return response;}})},
  }).deleteLeagueAction;
  for(const [id,phrase] of [[target,'delete'],['invalid','DELETE']])assert.ok('error' in (await action(id,phrase) as object));
  user=null;assert.ok('error' in (await action(target,'DELETE') as object));user={id:'u'};
  selected='other';assert.ok('error' in (await action(target,'DELETE') as object));assert.equal(calls.length,0);selected=target;
  response={data:null,error:{message:'failure'}};assert.ok('error' in (await action(target,'DELETE') as object));assert.equal(calls.length,1);calls.length=0;
  response={data:target,error:null};assert.deepEqual(await action(target,'DELETE'),{success:true});
  assert.deepEqual(calls,[['rpc','delete_fantasy_league',{p_league_id:target,p_confirmation:'DELETE'}],['cookie','eleven_active_league'],['revalidate','/','layout']]);
});
test('deleted selected membership resolves remaining league or no-league without invented defaults',()=>{
  const league={id:'remaining',name:'B',inviteCode:'B',role:'manager' as const,status:'active' as const,memberCount:1,maxTeams:10};
  assert.equal(resolveActiveLeagueId([league],'deleted'),'remaining');assert.equal(resolveActiveLeagueId([],'deleted'),null);
});
