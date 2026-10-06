// Actual component/primitives in an isolated browser; every network request is
// blocked. The server action is replaced ONLY in this temporary QA bundle.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=resolve(import.meta.dirname,'..');
const {webpack}=require('next/dist/compiled/webpack/webpack');
const {chromium}=await import(process.env.ELEVEN_PLAYWRIGHT_MODULE??'playwright');
const directory=await mkdtemp(join(tmpdir(),'eleven-league-delete-'));let browser;
try{
  await writeFile(join(directory,'loader.cjs'),`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;};`);
  await writeFile(join(directory,'action.js'),`export const deleteLeagueAction=(...args)=>{window.calls.push(args);return new Promise((resolve,reject)=>{window.finish=resolve;window.fail=reject;});};`);
  await writeFile(join(directory,'navigation.js'),`export const useRouter=()=>({replace:path=>window.destinations.push(path)});`);
  await writeFile(join(directory,'entry.jsx'),`
import React from 'react';import {createRoot} from 'react-dom/client';
import {DeleteLeagueSection} from ${JSON.stringify(join(root,'src/components/league/delete-league-section.tsx'))};
window.calls=[];window.destinations=[];createRoot(document.getElementById('root')).render(<DeleteLeagueSection leagueId="immutable-target" leagueName="Fantastic 4 — Commissioner League With A Readable Long Name"/>);`);
  await new Promise((done,fail)=>webpack({mode:'production',optimization:{minimize:false},context:root,entry:join(directory,'entry.jsx'),output:{path:directory,filename:'bundle.js'},
    resolve:{extensions:['.tsx','.ts','.jsx','.js'],modules:[join(root,'node_modules')],alias:{'@':join(root,'src'),'next/navigation$':join(directory,'navigation.js')}},
    module:{rules:[{test:/\.(tsx?|jsx)$/,exclude:/node_modules/,use:join(directory,'loader.cjs')}]},
    plugins:[new webpack.NormalModuleReplacementPlugin(/app\/\(app\)\/league\/delete-actions/,join(directory,'action.js'))]
  },(error,stats)=>error||stats.hasErrors()?fail(error??new Error(stats.toString({all:false,errors:true}))):done()));
  const {css}=await require('postcss')([require('@tailwindcss/postcss')({base:root})]).process(await readFile(join(root,'src/app/globals.css'),'utf8'),{from:join(root,'src/app/globals.css')});
  browser=await chromium.launch({headless:true,executablePath:process.env.ELEVEN_CHROMIUM_EXECUTABLE});const results=[];
  for(const theme of ['light','dark']) for(const width of [1440,375,320]){
    const page=await browser.newPage({viewport:{width,height:812},reducedMotion:'reduce'});const errors=[],requests=[];
    page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>{requests.push(route.request().url());return route.abort();});
    await page.setContent(`<style>${css}</style><main id="root" style="padding:16px"></main>`);await page.evaluate(theme=>document.documentElement.classList.toggle("dark",theme==="dark"),theme);await page.addScriptTag({path:join(directory,'bundle.js')});
    const trigger=page.getByRole('button',{name:'Delete League',exact:true});await trigger.click();
    const dialog=page.getByRole('dialog'),input=page.getByLabel('Type DELETE to confirm');
    await dialog.waitFor();await page.waitForFunction(()=>document.activeElement?.textContent==='Cancel');assert.equal(await page.getByRole('button',{name:'Cancel',exact:true}).evaluate(e=>e===document.activeElement),true,'Cancel receives initial focus');
    assert.equal(await page.getByRole('button',{name:'Permanently Delete League'}).isEnabled(),false);
    for(const phrase of ['delete','DELETE ',' DELETE']){await input.fill(phrase);assert.equal(await page.getByRole('button',{name:'Permanently Delete League'}).isEnabled(),false);}
    await input.fill('DELETE');assert.equal(await page.getByRole('button',{name:'Permanently Delete League'}).isEnabled(),true);
    await input.press('Enter');assert.equal(await page.evaluate(()=>window.calls.length),0);
    for(let i=0;i<8;i++){await page.keyboard.press('Tab');await page.waitForFunction(()=>!!document.activeElement?.closest('[role=dialog]'));assert.equal(await page.evaluate(()=>!!document.activeElement?.closest('[role=dialog]')),true,'focus remains trapped');}
    await page.screenshot({path:`/tmp/eleven-delete-dialog-${theme}-${width}.png`,fullPage:true});
    const overflow=await dialog.evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth,children:[...e.querySelectorAll('*')].filter(x=>x.getBoundingClientRect().right>e.getBoundingClientRect().right).map(x=>({tag:x.tagName,text:x.textContent,width:x.getBoundingClientRect().width}))}));
    assert.equal(overflow.scroll<=overflow.width+1 && overflow.children.length===0,true,'dialog has no horizontal overflow (allow integer subpixel rounding) '+JSON.stringify({width,...overflow}));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const bounds=await dialog.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width);
    await page.screenshot({path:`/tmp/eleven-delete-dialog-${theme}-${width}.png`,fullPage:true});
    await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});await page.waitForFunction(()=>document.activeElement?.textContent==='Delete League');assert.equal(await trigger.evaluate(e=>e===document.activeElement),true,'focus returns to trigger');
    await trigger.click();assert.equal(await input.inputValue(),'');await input.fill('DELETE');
    await page.getByRole('button',{name:'Permanently Delete League'}).click();assert.equal(await page.getByRole('button',{name:'Deleting…'}).isEnabled(),false);
    await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),true);
    await page.evaluate(()=>window.finish({error:'Isolated forced failure. Nothing deleted.'}));await page.getByRole('alert').waitFor();assert.equal(await dialog.isVisible(),true);
    await page.getByRole('button',{name:'Permanently Delete League'}).click();
    assert.deepEqual(await page.evaluate(()=>window.calls),[['immutable-target','DELETE'],['immutable-target','DELETE']]);
    await page.evaluate(()=>window.finish({success:true}));await dialog.waitFor({state:'hidden'});assert.deepEqual(await page.evaluate(()=>window.destinations),['/']);
    assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);results.push({theme,width,focus:true,confirmation:true,pending:true,rollback:true,success:true,overflow:false,errors:0,requests:0});await page.close();
  }
  console.log(JSON.stringify(results,null,2));
}finally{if(browser)await browser.close();await rm(directory,{recursive:true,force:true});}
