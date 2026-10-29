import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyWorkspace, exportCSV, importCSV, parseCSV, searchPackages, calculate, money, packageName } from '../src/domain.js';
import { appFixture, catalog, index, walk, find, rows, ids, line, button, fire, change, chooseImport } from './app-fixture.mjs';

const sorts=['name','retail','factory'];
const unknownLine={id:'00001234-unknown',quantity:2,label:'Literal unknown <b>label</b>',note:'Original note'};
const unknownFavorite='000000-favorite';
const rowButton=(app,id,attribute)=>find(find(app.get('results'),n=>n.getAttribute('data-id')===id),n=>attribute==='favorite'?n.className==='favorite':n.getAttribute(attribute)===id);

function assertPage(app,sort,scope,page) {
  const matches=searchPackages(index,{sort,scope},app.state().favorites);
  const pages=Math.max(1,Math.ceil(matches.length/40));
  assert.deepEqual(ids(app),matches.slice(page*40,(page+1)*40).map(p=>p.id));
  assert.equal(app.get('results').dataset.matches,matches.length);
  assert.equal(app.get('results').dataset.rendered,Math.min(40,matches.length-page*40));
  assert.equal(app.get('page-info').textContent,`Seite ${page+1} / ${pages}`);
  assert.equal(app.get('previous').disabled,page===0);
  assert.equal(app.get('next').disabled,page+1===pages);
  assert.equal(app.get('result-count').textContent,matches.length.toLocaleString('de-CH')+' von '+catalog.packages.length.toLocaleString('de-CH')+' Packungen · '+new Set(matches.map(p=>p.productId)).size.toLocaleString('de-CH')+' Präparate');
  for(const row of rows(app)) {
    const p=index.packages.get(row.getAttribute('data-id'));
    assert.equal(find(row,n=>n.className==='favorite').getAttribute('aria-pressed'),app.state().favorites.includes(p.id)?'true':null);
    const amounts=walk(find(row,n=>n.className==='pack-prices')).filter(n=>n.className==='amount');
    assert.deepEqual(amounts.map(n=>n.textContent),[money(p.retail),money(p.factory)]);
  }
}

function assertCollection(app) {
  const state=app.state(),calc=calculate(state,index.packages);
  assert.equal(app.get('collection-count').textContent,String(state.lines.length));
  assert.equal(app.get('workspace-note').value,state.note);
  assert.deepEqual(JSON.parse(app.memory.raw),state);
  assert.deepEqual(walk(app.get('totals')).filter(n=>n.className==='amount').map(n=>n.textContent),[money(calc.totals.retail.cents),money(calc.totals.factory.cents)]);
  for(const item of calc.rows) {
    const node=line(app,item.id);
    assert.equal(String(find(node,n=>n.tag==='input').value),String(item.quantity));
    assert.equal(find(node,n=>n.tag==='textarea').value,item.note);
    assert.deepEqual(walk(node).filter(n=>n.className==='amount').map(n=>n.textContent),[money(item.retail),money(item.factory)]);
  }
}

async function retainResults(app,action,{collections=1,writes=1}={}) {
  const before=walk(app.get('results')),text=app.get('results').textContent;
  const metadata=JSON.stringify([app.get('results').dataset,app.get('result-count').textContent,app.get('page-info').textContent,app.get('previous').disabled,app.get('next').disabled]);
  app.resetCounts();await action();
  const after=walk(app.get('results'));
  assert.deepEqual({searches:app.counts.searches,replacements:app.counts.resultReplacements,retained:before.length===after.length&&before.every((node,i)=>node===after[i])},
    {searches:0,replacements:0,retained:true},'Collection-only mutation must not search or replace catalogue nodes');
  assert.equal(app.get('results').textContent,text);
  assert.equal(JSON.stringify([app.get('results').dataset,app.get('result-count').textContent,app.get('page-info').textContent,app.get('previous').disabled,app.get('next').disabled]),metadata);
  assert.equal(app.counts.collectionReplacements,collections);
  assert.equal(app.counts.writes,writes);
}

for(const sort of sorts)for(const scope of ['','favorites'])test(`collection callers retain catalogue: ${sort}/${scope||'all'}`,async t=>{
  const workspace=emptyWorkspace();
  workspace.favorites=[...catalog.packages.slice(0,81).map(p=>p.id),unknownFavorite];
  const matches=searchPackages(index,{sort,scope},workspace.favorites),p=matches[40],q=matches[41];
  workspace.lines=[{id:p.id,quantity:2,label:packageName(p),note:'Keep position note'},unknownLine];
  workspace.note='Keep workspace note';
  const app=await appFixture({workspace});
  await change(app,'sort',sort);await change(app,'scope',scope);await fire(app.get('next'));
  assertPage(app,sort,scope,1);
  await t.test('add via catalogue button',async()=>{
    await retainResults(app,()=>fire(rowButton(app,q.id,'data-add')));
    assert.equal(app.state().lines.find(l=>l.id===q.id).quantity,1);assertCollection(app);
  });
  await t.test('increment via the same retained add button',async()=>{
    await retainResults(app,()=>fire(rowButton(app,q.id,'data-add')));
    assert.equal(app.state().lines.find(l=>l.id===q.id).quantity,2);assertCollection(app);
  });
  await t.test('quantity via registered change handler',async()=>{
    const input=find(line(app,p.id),n=>n.tag==='input');input.value='3';
    await retainResults(app,()=>fire(input,'change'));
    assert.equal(app.state().lines.find(l=>l.id===p.id).quantity,3);assertCollection(app);
  });
  await t.test('invalid quantity and latest notes',async()=>{
    const input=find(line(app,p.id),n=>n.tag==='input');input.value='0';
    const previous=app.memory.raw;
    await retainResults(app,()=>fire(input,'change'),{collections:0,writes:0});
    assert.equal(String(input.value),'3');assert.equal(app.memory.raw,previous);
    assert.match(app.get('toast').textContent,/1 bis 9999/);
    const note=find(line(app,p.id),n=>n.tag==='textarea');note.value='Latest literal <b>position</b>';
    await retainResults(app,()=>fire(note,'input'),{collections:0});
    await retainResults(app,()=>change(app,'workspace-note','Latest workspace note','input'),{collections:0});
    assertCollection(app);
  });
  await t.test('remove via registered collection button',async()=>{
    await retainResults(app,()=>fire(button(line(app,p.id),'Entfernen')));
    assert.equal(app.state().lines.some(l=>l.id===p.id),false);
    assert.deepEqual(app.state().lines.find(l=>l.id===unknownLine.id),unknownLine);assertCollection(app);
  });
  await t.test('clear retains known and unknown favorites',async()=>{
    await retainResults(app,()=>fire(app.get('clear')));
    assert.deepEqual(app.state(),{...workspace,lines:[],note:''});assertCollection(app);
  });
  assertPage(app,sort,scope,1);
});

test('detail-dialog collection button also retains the catalogue',async()=>{
  const app=await appFixture(),p=ids(app)[0];
  await fire(rowButton(app,p,'data-detail'));
  assert.equal(app.get('detail-dialog').open,true);
  await retainResults(app,()=>fire(button(app.get('detail-body'),'＋ Zur Sammlung')));
  assert.equal(app.state().lines[0].id,p);assertCollection(app);
});

for(const sort of sorts)test(`every page preserves the complete package order: ${sort}`,async()=>{
  const app=await appFixture(),actual=[];await change(app,'sort',sort);
  let pages=0;
  do {
    const visible=ids(app);assert.ok(visible.length<=40);actual.push(...visible);pages++;
    if(app.get('next').disabled)break;
    await fire(app.get('next'));assert.ok(pages<300,'Pagination must terminate');
  } while(true);
  assert.deepEqual(actual,searchPackages(index,{sort}).map(p=>p.id));
  assert.equal(actual.length,10352);assert.equal(new Set(actual).size,10352);
  assert.equal(pages,259);assert.equal(ids(app).length,32);
  assert.equal(money(0),'CHF 0.00');assert.equal(money(null),'Nicht verfügbar');
});

for(const sort of sorts)test(`favorite callers refresh current buttons and clamp last page: ${sort}`,async()=>{
  const workspace=emptyWorkspace();
  workspace.favorites=[...catalog.packages.slice(0,41).map(p=>p.id),unknownFavorite];
  const app=await appFixture({workspace});await change(app,'sort',sort);
  const p=ids(app)[0];
  for(let i=0;i<2;i++) {
    const before=rows(app)[0],was=app.state().favorites.includes(p);
    app.resetCounts();await fire(rowButton(app,p,'favorite'));
    assert.equal(app.counts.searches,1);assert.equal(app.counts.resultReplacements,1);
    assert.notEqual(rows(app)[0],before);assert.equal(app.state().favorites.includes(p),!was);
    assertPage(app,sort,'',0);assertCollection(app);
  }
  await change(app,'scope','favorites');await fire(app.get('next'));
  assert.equal(ids(app).length,1);const last=ids(app)[0];
  app.resetCounts();await fire(rowButton(app,last,'favorite'));
  assert.equal(app.counts.searches,1);assert.equal(app.counts.resultReplacements,1);
  assert.equal(app.state().favorites.includes(last),false);
  assert.ok(app.state().favorites.includes(unknownFavorite));
  assertPage(app,sort,'favorites',0);assertCollection(app);
});

for(const sort of sorts)for(const scope of ['','favorites'])test(`confirmed import independently refreshes both panels: ${sort}/${scope||'all'}`,async()=>{
  const workspace={...emptyWorkspace(),favorites:catalog.packages.slice(0,81).map(p=>p.id),note:'Before import'};
  const app=await appFixture({workspace});await change(app,'sort',sort);await change(app,'scope',scope);
  await fire(app.get('next'));await fire(app.get('next'));
  const p=catalog.packages.find(p=>p.retail===null),imported={...emptyWorkspace(),snapshot:'2025-01-01',
    lines:[{id:p.id,quantity:3,label:'Imported label never overrides source price',note:'Imported position'},unknownLine],
    favorites:[p.id,unknownFavorite],note:'Replaced workspace'};
  const before=app.memory.raw;
  await retainResults(app,()=>chooseImport(app,imported),{collections:0,writes:0});
  assert.equal(app.get('import-dialog').open,true);assert.equal(app.get('import-confirm').disabled,true);
  assert.equal(app.memory.raw,before);assert.deepEqual(app.state(),workspace);
  await fire(app.get('backup-before-import'));
  assert.equal(await app.downloads.at(-1).text(),before);
  assert.equal(app.get('import-confirm').disabled,false);
  app.resetCounts();await fire(app.get('import-confirm'));
  assert.deepEqual(app.counts,{searches:1,resultReplacements:1,collectionReplacements:1,writes:1});
  assert.equal(app.get('import-dialog').open,false);assert.deepEqual(app.state(),imported);
  assertCollection(app);assertPage(app,sort,scope,scope?0:2);
  assert.match(app.get('totals').textContent,/Unvollständige Teilsumme/);
  assert.match(app.get('totals').textContent,/2025-01-01/);
  const reloaded=await appFixture({raw:app.memory.raw});assert.deepEqual(reloaded.state(),imported);assertCollection(reloaded);
  // Replacing favorites with an empty list must remove the final visible row.
  await change(app,'scope','favorites');
  await chooseImport(app,emptyWorkspace());await fire(app.get('backup-before-import'));
  app.resetCounts();await fire(app.get('import-confirm'));
  assert.equal(app.counts.searches,1);assertPage(app,sort,'favorites',0);assert.equal(ids(app).length,0);
});

for(const mode of ['read-refused','write-refused','corrupt','drift','storage-event'])test(`real collection/favorite callers preserve storage refusal semantics: ${mode}`,async()=>{
  const workspace={...emptyWorkspace(),lines:[unknownLine],note:'Original work'};
  const raw=mode==='corrupt'?'{literal-corrupt-original':JSON.stringify(workspace);
  const app=await appFixture({raw,blockedRead:mode==='read-refused',blockedWrite:mode==='write-refused'});
  const original=app.state(),p=ids(app)[0];
  if(mode==='drift'||mode==='storage-event')app.memory.raw='exact foreign raw bytes';
  if(mode==='storage-event')await app.storageEvent();
  const protectedRaw=app.memory.raw;
  await retainResults(app,()=>fire(rowButton(app,p,'data-add')),{writes:mode==='write-refused'?1:0});
  assert.equal(app.memory.raw,protectedRaw);assert.equal(app.store().raw,mode==='read-refused'?null:raw);
  assert.equal(app.store().paused,true);assert.equal(app.get('storage-warning').hidden,false);
  assert.deepEqual(app.state(),{...original,lines:[...original.lines,{id:p,quantity:1,label:packageName(index.packages.get(p)),note:''}]});
  assert.equal(app.get('toast').textContent,'Packung zur Sammlung hinzugefügt.');
  assert.equal(app.get('collection-count').textContent,String(app.state().lines.length));
  if(mode==='drift') {
    // The first edit detecting drift is retained in RAM/export, never persisted.
    await fire(app.get('export-json'));
    assert.deepEqual(JSON.parse(await app.downloads.at(-1).text()),app.state());
    await fire(app.get('export-csv'));
    assert.deepEqual(importCSV(await app.downloads.at(-1).text()),app.state());
    await retainResults(app,()=>fire(rowButton(app,p,'data-add')),{writes:0});
    assert.deepEqual(app.state(),{...original,lines:[...original.lines,{id:p,quantity:2,label:packageName(index.packages.get(p)),note:''}]},'A later paused edit continues the retained draft');
    assert.equal(app.memory.raw,protectedRaw);assert.equal(app.store().raw,raw);
    assert.equal(app.get('toast').textContent,'Packung zur Sammlung hinzugefügt.');
  }
  app.resetCounts();await fire(rowButton(app,p,'favorite'));
  assert.equal(app.counts.searches,1);assert.equal(app.counts.resultReplacements,1);assert.equal(app.counts.writes,0);
  assert.ok(app.state().favorites.includes(p));assert.equal(app.memory.raw,protectedRaw);
  assertPage(app,'name','',0);
});

for(const mode of ['write-refused','drift'])test(`confirmed import refusal leaves both panels and working state unchanged: ${mode}`,async()=>{
  const workspace={...emptyWorkspace(),lines:[unknownLine],note:'Keep current work'};
  const app=await appFixture({workspace}),before=app.memory.raw;
  await chooseImport(app,{...emptyWorkspace(),favorites:[catalog.packages[0].id],note:'Must not apply'});
  await fire(app.get('backup-before-import'));assert.equal(await app.downloads[0].text(),before);
  if(mode==='write-refused')app.memory.blockedWrite=true;else app.memory.raw='foreign bytes after preview';
  const protectedRaw=app.memory.raw;
  await retainResults(app,()=>fire(app.get('import-confirm')),{collections:0,writes:mode==='write-refused'?1:0});
  assert.equal(app.memory.raw,protectedRaw);assert.deepEqual(app.state(),workspace);
  assert.equal(app.get('import-dialog').open,false);assert.match(app.get('toast').textContent,/Import nicht gespeichert/);
  assert.equal(app.get('toast').textContent.includes('Geprüfte Sammlung übernommen'),false);
});
