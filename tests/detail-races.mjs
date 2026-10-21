import assert from 'node:assert/strict';
import {packageName} from '../src/domain.js';

// Observe only native platform boundaries. Original callbacks, fetch results,
// JSON values and returned promises still reach the unmodified application.
function observePlatform() {
  const trace=window.__detailRaceTrace=[],record=(event,data={})=>trace.push({sequence:trace.length,event,...data});
  let next=0;
  const add=EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener=function(type,listener,options){
    if(type!=='click'||typeof listener!=='function')return add.call(this,type,listener,options);
    return add.call(this,type,function(...args){
      const label=this.getAttribute?.('data-detail')||this.textContent;
      const result=listener.apply(this,args);
      if(result&&typeof result.then==='function'){
        const operation=++next;record('caller-start',{operation,label});
        result.then(()=>record('caller-settled',{operation,outcome:'fulfilled'}),error=>record('caller-settled',{operation,outcome:'rejected',message:String(error)}));
      }
      return result;
    },options);
  };
  const fetchOriginal=window.fetch;
  window.fetch=function(...args){
    const result=fetchOriginal.apply(this,args);
    result.then(response=>record('http-delivered',{url:response.url,status:response.status}),error=>record('http-rejected',{message:String(error)}));
    return result;
  };
  const json=Response.prototype.json;
  Response.prototype.json=function(...args){
    const result=json.apply(this,args);
    result.then(value=>record('json-delivered',{packages:value?.packages&&!Array.isArray(value.packages)?Object.keys(value.packages):null,limitations:value?.limitations?.length??null}),error=>record('json-rejected',{message:String(error)}));
    return result;
  };
}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const mark=(page,event,data={})=>page.evaluate(({event,data})=>{const trace=window.__detailRaceTrace;trace.push({sequence:trace.length,event,...data});},{event,data});
async function operation(page,label){
  const found=await page.evaluate(label=>window.__detailRaceTrace.filter(e=>e.event==='caller-start'&&e.label===label).at(-1),label);
  assert.ok(found,'Real registered detail click must return its original promise');return found.operation;
}
async function settled(page,id){
  await page.waitForFunction(id=>window.__detailRaceTrace.some(e=>e.event==='caller-settled'&&e.operation===id),id);
  const event=await page.evaluate(id=>window.__detailRaceTrace.find(e=>e.event==='caller-settled'&&e.operation===id),id);
  assert.equal(event.outcome,'fulfilled','Real showDetail caller must settle after handling its result');
}
async function open(page,p){await page.locator('#search').fill(p.id);await page.locator(`[data-detail="${p.id}"]`).click();return operation(page,p.id);}
async function snapshot(page){return {title:await page.locator('#detail-title').textContent(),body:await page.locator('#detail-body').textContent(),html:await page.locator('#detail-body').innerHTML(),limitations:await page.locator('section.limitation > .limitation-text').allTextContents(),open:await page.locator('#detail-dialog').evaluate(d=>d.open)};}
function complete(value,p,texts){assert.equal(value.title,packageName(p));assert.equal(value.open,true);assert.ok(value.body.includes(p.id));assert.deepEqual(value.limitations,p.limitations.map(l=>texts.limitations[l.index].text),'All complete source limitation texts, not snippets');}
async function addCurrent(page,p,other){
  await page.locator('#detail-body > button.primary').click();
  assert.deepEqual(await page.locator('.collection-line').evaluateAll(rows=>rows.map(r=>r.dataset.id)),[p.id],'Surviving actual detail action must add B, not obsolete A');
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('sl.workspace.v1')));
  assert.deepEqual(stored.lines.map(l=>({id:l.id,quantity:l.quantity})),[{id:p.id,quantity:1}]);assert.ok(!stored.lines.some(l=>l.id===other.id));
}

export async function testDetailRaces({browser,url,catalog,texts,report,watch,check,screenshot}) {
  const products=new Map(catalog.products.map(p=>[p.id,p]));
  const a=catalog.packages.find(p=>p.id==='7f41756a-7b21-4f37-a489-12dd3a251e86'),b=catalog.packages.find(p=>p.id==='02a33dd4-a9b0-46dd-a91d-c52e7b3adc75');
  assert.ok(a&&b);const shard=products.get(a.productId).shard;assert.equal(shard,'9');assert.equal(products.get(b.productId).shard,'8');assert.equal(b.limitations.length,10);
  report.detailRaces={boundary:'Native HTTP gate and observational EventTarget/fetch/Response.json wrappers only; no application replacements',cases:[]};
  // Controls run before the desired stale-failure assertion, so OLD also proves them.
  for(const kind of ['stale-success','current-retry','stale-failure']){
    const entry={kind,a:a.id,b:b.id,trace:[]};report.detailRaces.cases.push(entry);
    const context=await browser.newContext({viewport:{width:1024,height:900},acceptDownloads:true});
    let page;const acknowledged=deferred(),release=deferred();let requests=0;
    try{
      await context.addInitScript(observePlatform);page=await context.newPage();watch(page);
      const target=new URL(`data/details-${shard}.json.gz`,url).href;
      if(kind!=='stale-success')report.intentionalHTTPFailures.push({url:target,status:503,scenario:kind});
      await context.route(target,async route=>{
        requests++;
        if(requests!==1)return route.continue();
        await mark(page,'old-request-acknowledged',{url:target});acknowledged.resolve();await release.promise;
        await mark(page,'old-request-released',{status:kind==='stale-success'?200:503});
        if(kind==='stale-success')await route.continue();
        else await route.fulfill({status:503,contentType:'text/plain',body:'controlled '+kind+' detail failure'});
      });
      await page.goto(url);await page.waitForSelector('body[data-ready=true]');
      entry.userAgent=await page.evaluate(()=>navigator.userAgent);
      const oldOperation=await open(page,a);await acknowledged.promise;
      assert.equal(await page.locator('#detail-title').textContent(),packageName(a));
      assert.ok((await page.locator('#detail-body').textContent()).includes('werden geladen'));
      if(kind==='current-retry'){
        release.resolve();await settled(page,oldOperation);
        assert.equal(await page.locator('#detail-title').textContent(),packageName(a));
        assert.equal(await page.locator('#detail-body .error').isVisible(),true);
        assert.ok((await page.locator('#detail-body .error').textContent()).includes('503'));
        const retry=page.locator('#detail-body button').filter({hasText:'Erneut laden'});
        assert.equal(await retry.isVisible(),true);assert.equal(await retry.isEnabled(),true);
        entry.error=await snapshot(page);await screenshot(page,'detail-current-503');
        await retry.click();const retryOperation=await operation(page,'Erneut laden');await settled(page,retryOperation);
        entry.after=await snapshot(page);complete(entry.after,a,texts);assert.equal(requests,2,'Real retry must refetch the failed shard, not retain a rejected cache entry');
        await screenshot(page,'detail-current-retry');await addCurrent(page,a,b);
        check('CURRENT detail 503 stays visible/actionable; native Retry refetches complete correct source',{attempts:requests,package:a.id});
      }else{
        // Wait for the actual native close event as well as the close button before B.
        await page.evaluate(()=>document.querySelector('#detail-dialog').addEventListener('close',()=>{const t=window.__detailRaceTrace;t.push({sequence:t.length,event:'native-close-delivered'});},{once:true}));
        await page.locator('#detail-close').click();
        await page.waitForFunction(()=>window.__detailRaceTrace.some(e=>e.event==='native-close-delivered'));
        assert.equal(await page.locator('#detail-dialog').evaluate(d=>d.open),false);
        const newOperation=await open(page,b);await settled(page,newOperation);
        entry.before=await snapshot(page);complete(entry.before,b,texts);
        await mark(page,'B-completely-rendered',{id:b.id,limitations:entry.before.limitations.length});
        await screenshot(page,`detail-${kind}-before`);
        release.resolve();await settled(page,oldOperation);
        entry.after=await snapshot(page);await screenshot(page,`detail-${kind}-after`);
        entry.trace=await page.evaluate(()=>window.__detailRaceTrace);
        const delivered=entry.trace.find(e=>e.event==='http-delivered'&&e.url===target);
        assert.equal(delivered?.status,kind==='stale-success'?200:503,'Actual old HTTP response must reach the real loader before final assertions');
        const oldSettled=entry.trace.find(e=>e.event==='caller-settled'&&e.operation===oldOperation),fully=entry.trace.find(e=>e.event==='B-completely-rendered');
        assert.ok(delivered.sequence>fully.sequence&&oldSettled.sequence>delivered.sequence,'B renders before old delivery, then actual registered caller settles');
        if(kind==='stale-success')assert.ok(entry.trace.some(e=>e.event==='json-delivered'&&e.packages?.includes(a.id)&&e.sequence>delivered.sequence&&e.sequence<oldSettled.sequence),'Old real decoded JSON producer must finish before its original caller');
        assert.equal(entry.after.title,entry.before.title,'Current B title survives stale '+kind);
        assert.equal(entry.after.body,entry.before.body,'STALE_DETAIL_FAILURE_OWNERSHIP: obsolete failure must not replace fully rendered B body');
        assert.equal(entry.after.html,entry.before.html,'Current B DOM including real actions is preserved');complete(entry.after,b,texts);
        await addCurrent(page,b,a);
        check(kind==='stale-success'?'Delayed OLD success after acknowledged close/B cannot replace B; real action still targets B':'Delayed OLD 503 after acknowledged close/B preserves exact B title/body/all 10 limitations and real B action',{a:a.id,b:b.id,limitations:entry.after.limitations.length});
      }
      entry.status='passed';
    }catch(error){entry.status='failed';entry.failure=String(error.stack||error);throw error;}
    finally{
      release.resolve();
      if(page&&!page.isClosed())entry.trace=await page.evaluate(()=>window.__detailRaceTrace).catch(error=>[{observerError:String(error)}]);
      entry.detailRequests=requests;await context.close();
    }
  }
}
