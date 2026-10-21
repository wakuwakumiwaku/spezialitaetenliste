import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyWorkspace,validateWorkspace,createIndex,searchPackages,normalize,calculate,money,exportCSV,importCSV,parseImport,WorkspaceStore,STORAGE_KEY} from '../src/domain.js';
const catalog=JSON.parse(await readFile(new URL('../public/data/catalog.json',import.meta.url),'utf8')),index=createIndex(catalog),p=index.packages.get('7f41756a-7b21-4f37-a489-12dd3a251e86');
const workspace=()=>({...emptyWorkspace(),lines:[{id:p.id,quantity:3,label:'3TC',note:'Test'}]});
test('real source inventory and exact source identifiers/prices',()=>{assert.equal(catalog.packages.length,10352);assert.equal(catalog.products.length,6749);assert.equal(index.packages.size,10352);assert.equal(p.gtin,'7680536620137');assert.equal(p.swissmedic,'53662013');assert.equal(p.retail,19190);assert.equal(p.factory,16273);assert.ok(catalog.packages.every(p=>p.swissmedic===null || typeof p.swissmedic==='string'));const synthetic={products:[{id:'m'}],packages:[{...p,id:'x',productId:'m',swissmedic:'00012345',gtin:'0000000000001'}]};assert.equal(createIndex(synthetic).packages.get('x').swissmedic,'00012345');assert.equal(searchPackages(createIndex(synthetic),{query:'0000000000001'}).length,1);});
test('normalized full index search and source-backed filters',()=>{
 assert.equal(normalize('Ärztliche Straße'),'arztliche strasse');
 for(const query of ['7680536620137','53662013','3tc 150','Lamivudinum','J05AF05'])assert.ok(searchPackages(index,{query}).some(x=>x.id===p.id));
 for(const [list,n] of Object.entries(catalog.stats.lists))assert.equal(searchPackages(index,{list}).length,n);
 assert.equal(searchPackages(index,{scope:'limitations'}).length,4249);
 assert.equal(searchPackages(index,{scope:'favorites'},[p.id]).length,1);
 assert.ok(searchPackages(index,{manufacturer:p.manufacturer,type:'O',atc:'J'}).some(x=>x.id===p.id));
 assert.deepEqual(searchPackages(index,{query:'no-such-drug-9388575'}),[]);
 for(const kind of ['retail','factory']){const sorted=searchPackages(index,{sort:kind});for(let i=1;i<sorted.length;i++)assert.ok((sorted[i-1][kind]??Infinity)<=(sorted[i][kind]??Infinity));}
});
test('exact integer package totals, independent missing prices, unknown keys',()=>{
 let calc=calculate(workspace(),index.packages);assert.equal(calc.totals.retail.cents,57570n);assert.equal(calc.totals.factory.cents,48819n);assert.equal(money(calc.totals.retail.cents),'CHF 575.70');
 const missing=catalog.packages.find(p=>p.retail===null),v=workspace();v.lines.push({id:missing.id,quantity:2,label:'missing',note:''},{id:'000-unknown',quantity:1,label:'unknown',note:''});calc=calculate(v,index.packages);assert.equal(calc.totals.retail.missing,2);assert.equal(calc.rows[1].retail,null);assert.equal(calc.rows[2].factory,null);assert.equal(money(null),'Nicht verfügbar');
 const huge=new Map([['x',{retail:Number.MAX_SAFE_INTEGER,factory:null}]]);const big=calculate({...emptyWorkspace(),lines:[{id:'x',quantity:9999}]},huge);assert.equal(big.totals.retail.cents,BigInt(Number.MAX_SAFE_INTEGER)*9999n);assert.match(money(big.totals.retail.cents),/\.09$/);
});
test('strict full workspace validation and all-or-nothing imports',()=>{
 const valid=workspace();assert.deepEqual(validateWorkspace(valid),valid);
 for(const mutate of [v=>v.lines.push({...v.lines[0]}),v=>v.lines[0].quantity=0,v=>v.lines[0].quantity=1.5,v=>v.lines[0].quantity=10000,v=>v.lines[0].retail=5,v=>v.note={},v=>v.favorites=['x','x'],v=>v.favorites=[null],v=>v.schema=2,v=>v.unexpected=true,v=>v.lines[0].id='',v=>v.lines[0].label=null,v=>v.snapshot='2026-1-1',v=>v.snapshot='2026-02-31']){const bad=structuredClone(valid);mutate(bad);assert.throws(()=>validateWorkspace(bad));assert.deepEqual(valid,workspace());}
 assert.throws(()=>parseImport('{"schema":1}','bad.json'));
 assert.deepEqual(parseImport(JSON.stringify(valid),'valid.json'),valid);
});
test('real JSON/CSV roundtrip preserves unknown literal codes, newlines, dangerous spreadsheet cells',()=>{
 const v=workspace();v.lines[0].label='=HYPERLINK("x")';v.note="'original\nsecond";v.lines[0].note='@SUM(1,2)\r\n<svg onload=alert(1)>';v.favorites=['00001234'];v.lines.push({id:'00001234',quantity:2,label:'Unbekannt',note:'a,"b"'});
 const csv=exportCSV(v,index.packages);assert.match(csv,/"'=HYPERLINK/);assert.deepEqual(importCSV(csv),v);assert.deepEqual(parseImport(csv,'a.csv'),v);
 for(const bad of [csv.replace('"3"','"-3"'),csv+'"line","bad"',csv.replace('"19190"','"NaN"'),csv.replace('"workspace"','"unknown"'),csv.replace('"2026-10-01"','"2025-01-01"')])assert.throws(()=>importCSV(bad));
 assert.throws(()=>importCSV('"unfinished'));
});
function memory(initial=null){let value=initial;return{getItem(){return value;},setItem(k,v){value=v;},raw(){return value;}};}
test('corrupt storage is preserved until explicit validated recovery',()=>{const m=memory('not json'),store=new WorkspaceStore(m);assert.ok(store.paused);store.replace(workspace());assert.equal(m.raw(),'not json');assert.throws(()=>store.replace({schema:2},true));assert.equal(m.raw(),'not json');assert.equal(store.replace(workspace(),true),true);assert.equal(JSON.parse(m.raw()).lines.length,1);});
test('blocked writes and cross-tab drift never overwrite other raw state',()=>{const m=memory(),store=new WorkspaceStore(m);assert.ok(store.replace(workspace()));const baseline=m.raw();m.setItem(STORAGE_KEY,'new external data');assert.equal(store.replace(emptyWorkspace()),false);assert.equal(m.raw(),'new external data');assert.ok(store.paused);store.replace(workspace());assert.equal(m.raw(),'new external data');const blocked=new WorkspaceStore({getItem(){return baseline;},setItem(){throw new Error('quota');}});assert.equal(blocked.replace(emptyWorkspace()),false);assert.ok(blocked.paused);});
