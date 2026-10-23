import assert from 'node:assert/strict';
import {emptyWorkspace} from '../src/domain.js';

// Hold only delivery of an older native File.text() result. The real File,
// text bytes, change handler, parser, preview, confirmation and storage run.
function observeImportReads() {
  const trace=window.__importRaceTrace=[],record=(event,data={})=>trace.push({sequence:trace.length,event,...data});
  const text=Blob.prototype.text;
  Blob.prototype.text=function(...args){
    const result=text.apply(this,args);
    if(!(this instanceof File)||this.name!=='older.json')return result;
    return result.then(value=>{
      record('older-native-read-complete');
      return new Promise(resolve=>{window.__releaseImportRead=()=>{record('older-read-released');resolve(value);};});
    });
  };
  const add=EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener=function(type,listener,options){
    if(type!=='change'||this.id!=='import-file'||typeof listener!=='function')return add.call(this,type,listener,options);
    return add.call(this,type,function(...args){
      const name=this.files?.[0]?.name;record('caller-start',{name});
      const result=listener.apply(this,args);
      assertPromise(result);
      result.then(()=>record('caller-settled',{name,outcome:'fulfilled'}),error=>record('caller-settled',{name,outcome:'rejected',message:String(error)}));
      return result;
    },options);
  };
  function assertPromise(value){if(!value||typeof value.then!=='function')throw new Error('Original import change handler must return its promise');}
}
const fixture=(note,count)=>({...emptyWorkspace(),note,lines:Array.from({length:count},(_,i)=>({id:'synthetic-import-'+i,quantity:i+1,label:'Synthetic fixture '+i,note:''}))});
const select=(page,name,text)=>page.locator('#import-file').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(text)});
async function settled(page,name,count=1){
  await page.waitForFunction(({name,count})=>window.__importRaceTrace.filter(e=>e.event==='caller-settled'&&e.name===name).length>=count,{name,count});
  const events=await page.evaluate(name=>window.__importRaceTrace.filter(e=>e.event==='caller-settled'&&e.name===name),name);
  assert.equal(events.at(-1).outcome,'fulfilled','Actual import caller must handle its result');
}
const raw=page=>page.evaluate(()=>localStorage.getItem('sl.workspace.v1'));

export async function testImportRaces({browser,url,report,watch,check}) {
  const newer=fixture('newer selected backup',2),older=fixture('older superseded backup',1),failures=[];
  report.importRaces={boundary:'Native File.text delivery gate and observational registered change-handler wrapper; synthetic workspaces only',cases:[]};
  for(const kind of ['current-controls','stale-valid','stale-invalid']){
    const context=await browser.newContext({viewport:{width:1024,height:900},acceptDownloads:true});
    const entry={kind};report.importRaces.cases.push(entry);let page;
    try{
      await context.addInitScript(observeImportReads);page=await context.newPage();watch(page);
      await page.goto(url);await page.waitForSelector('body[data-ready=true]');
      assert.equal(await raw(page),null);
      if(kind==='current-controls'){
        await select(page,'invalid.json','{"schema":');await settled(page,'invalid.json');
        assert.ok((await page.locator('#toast').textContent()).startsWith('Import abgelehnt:'));
        assert.equal(await page.locator('#import-dialog').evaluate(d=>d.open),false);
        assert.equal(await raw(page),null);
        await select(page,'newer.json',JSON.stringify(newer));await settled(page,'newer.json');
        assert.equal(await page.locator('#import-confirm').isEnabled(),true);
        await page.locator('#import-cancel').click();
        assert.equal(await raw(page),null);assert.equal(await page.locator('#import-dialog').evaluate(d=>d.open),false);
        await select(page,'newer.json',JSON.stringify(newer));await settled(page,'newer.json',2);
      }else{
        await select(page,'older.json',kind==='stale-valid'?JSON.stringify(older):'{"schema":');
        await page.waitForFunction(()=>window.__importRaceTrace.some(e=>e.event==='older-native-read-complete'));
        await select(page,'newer.json',JSON.stringify(newer));await settled(page,'newer.json');
        assert.equal(await page.locator('#import-dialog').evaluate(d=>d.open),true);
        assert.ok((await page.locator('#import-summary').textContent()).startsWith('2 Position(en)'));
        assert.equal(await raw(page),null,'Preview must not write');
        entry.newerSummary=await page.locator('#import-summary').textContent();
        await page.evaluate(()=>window.__releaseImportRead());await settled(page,'older.json');
        entry.afterOlderSummary=await page.locator('#import-summary').textContent();
        entry.afterOlderToast=await page.locator('#toast').textContent();
        entry.trace=await page.evaluate(()=>window.__importRaceTrace);
        const newerSettled=entry.trace.find(e=>e.event==='caller-settled'&&e.name==='newer.json'),released=entry.trace.find(e=>e.event==='older-read-released'),olderSettled=entry.trace.find(e=>e.event==='caller-settled'&&e.name==='older.json');
        assert.ok(newerSettled.sequence<released.sequence&&released.sequence<olderSettled.sequence,'Newer preview completes before actual older read and caller finish');
      }
      await page.locator('#import-confirm').click();
      entry.imported=JSON.parse(await raw(page));
      assert.deepEqual(entry.imported,newer,'IMPORT_READ_OWNERSHIP: confirming the latest preview must import the latest selected file, not an obsolete read or nothing');
      assert.equal(await page.locator('#import-dialog').evaluate(d=>d.open),false);
      assert.equal(await page.locator('.collection-line').count(),2);
      if(kind!=='current-controls'){
        assert.equal(entry.afterOlderSummary,entry.newerSummary,'Obsolete completion must preserve the exact latest preview');
        assert.ok(!entry.afterOlderToast.startsWith('Import abgelehnt:'),'Obsolete parse errors must not announce rejection of the current valid file');
      }
      await page.reload();await page.waitForSelector('body[data-ready=true]');
      assert.deepEqual(JSON.parse(await raw(page)),newer,'Persisted latest selection survives a fresh document');
      assert.equal(await page.locator('.collection-line').count(),2);
      entry.status='passed';check('Native import ownership: '+kind,{lines:2,restored:true});
    }catch(error){entry.status='failed';entry.failure=String(error.stack||error);failures.push(error);}
    finally{
      if(page&&!page.isClosed()&&!entry.trace)entry.trace=await page.evaluate(()=>window.__importRaceTrace).catch(error=>[{observerError:String(error)}]);
      await context.close();
    }
  }
  if(failures.length)throw new AggregateError(failures,'Native import ownership regression failed in '+failures.length+' case(s)');
}
