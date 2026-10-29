// Structural DOM model, not browser/focus/layout acceptance. Runs the actual app
// startup and registered handlers; only platform I/O and timers are synthetic.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as domain from '../src/domain.js';

export const catalog=JSON.parse(await readFile(new URL('../public/data/catalog.json',import.meta.url),'utf8'));
export const index=domain.createIndex(catalog);
const source=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
let executable=source;
for(const line of [
  "import {STORAGE_KEY,SNAPSHOT,collator,WorkspaceStore,validateWorkspace,createIndex,searchPackages,packageName,money,calculate,exportCSV,parseImport} from './domain.js';\n",
  "import {loadCatalog,loadJSON} from './catalog.js';\n",
]) {
  assert.equal(executable.split(line).length,2,'App import boundary must be unambiguous');
  executable=executable.replace(line,'');
}

export function walk(node) {return [node,...node.children.flatMap(walk)];}
export function find(node,predicate) {
  const found=walk(node).find(predicate);
  assert.ok(found,'Expected real rendered control');
  return found;
}
export function rows(app) {return walk(app.get('results')).filter(n=>n.className==='pack-row');}
export function ids(app) {return rows(app).map(n=>n.getAttribute('data-id'));}
export function line(app,id) {return find(app.get('collection-lines'),n=>n.getAttribute('data-id')===id);}
export function button(node,text) {return find(node,n=>n.tag==='button'&&n.textContent===text);}
export async function fire(node,type='click') {
  assert.ok(node,'Expected registered event target');
  if(type==='click')assert.equal(node.disabled,false,'Cannot click a disabled control');
  const handlers=[node['on'+type],...(node.listeners[type]??[])].filter(Boolean);
  assert.ok(handlers.length,'Expected a real registered '+type+' handler');
  for(const handler of handlers)await handler({target:node});
}
export async function change(app,id,value,type='change') {
  app.get(id).value=value;
  await fire(app.get(id),type);
}
export async function chooseImport(app,value) {
  const text=JSON.stringify(value),node=app.get('import-file');
  node.files=[{name:'workspace.json',size:Buffer.byteLength(text),text:async()=>text}];
  await fire(node,'change');
}

export async function appFixture({workspace,raw=workspace?JSON.stringify(workspace):null,blockedRead=false,blockedWrite=false}={}) {
  const counts={searches:0,resultReplacements:0,collectionReplacements:0,writes:0};
  const downloads=[];
  class ModelNode {
    constructor(tag,text=null) {
      Object.assign(this,{tag,text,children:[],attrs:{},listeners:{},dataset:{},className:'',value:'',disabled:false,hidden:false,open:false,parentNode:null});
    }
    append(...nodes) {
      for(const value of nodes) {
        const node=value instanceof ModelNode?value:new ModelNode('#text',String(value));
        node.remove();node.parentNode=this;this.children.push(node);
      }
    }
    remove() {
      if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);
      this.parentNode=null;
    }
    replaceChildren(...nodes) {
      if(this.id==='results')counts.resultReplacements++;
      if(this.id==='collection-lines')counts.collectionReplacements++;
      for(const child of this.children)child.parentNode=null;
      this.children=[];this.text=null;this.append(...nodes);
    }
    setAttribute(key,value) {this.attrs[key]=String(value);if(key==='class')this.className=String(value);}
    getAttribute(key) {return key==='class'?this.className:this.attrs[key]??null;}
    addEventListener(type,handler) {(this.listeners[type]??=[]).push(handler);}
    get textContent() {return this.text??this.children.map(n=>n.textContent).join('');}
    set textContent(value) {this.replaceChildren();this.text=String(value);}
    showModal() {this.open=true;}
    close() {this.open=false;}
    scrollIntoView() {}
    click() {if(this.tag!=='a')throw new Error('Unexpected synthetic click');}
  }
  const nodes=new Map();
  for(const [,tag,attrs,id] of html.matchAll(/<([\w-]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const node=new ModelNode(tag);node.id=id;
    node.hidden=/\bhidden\b/.test(attrs);node.disabled=/\bdisabled\b/.test(attrs);
    nodes.set(id,node);
  }
  const get=id=>{assert.ok(nodes.has(id),'Unknown document ID: '+id);return nodes.get(id);};
  get('sort').value='name';
  const memory={raw,blockedRead,blockedWrite,getItem(key) {
    assert.equal(key,domain.STORAGE_KEY);
    if(this.blockedRead)throw new Error('Synthetic read refusal');
    return this.raw;
  },setItem(key,value) {
    assert.equal(key,domain.STORAGE_KEY);counts.writes++;
    if(this.blockedWrite)throw new Error('Synthetic write refusal');
    this.raw=value;
  }};
  const windowListeners={};
  const document={getElementById:get,createElement:tag=>new ModelNode(tag),createTextNode:text=>new ModelNode('#text',String(text)),activeElement:null,body:new ModelNode('body')};
  const context=vm.createContext({...domain,
    searchPackages(...args) {counts.searches++;return domain.searchPackages(...args);},
    loadCatalog:async()=>catalog,
    loadJSON:async name=>JSON.parse(await readFile(new URL('../public/data/'+name+'.json',import.meta.url),'utf8')),
    Node:ModelNode,document,window:{localStorage:memory,addEventListener(type,handler) {(windowListeners[type]??=[]).push(handler);}},
    performance,structuredClone,Blob,
    URL:{createObjectURL(blob) {downloads.push(blob);return 'blob:fixture';},revokeObjectURL() {}},
    setTimeout() {return 1;},clearTimeout() {},confirm:()=>true,
  });
  await vm.runInContext(executable,context,{filename:'src/app.js'});
  assert.equal(document.body.dataset.ready,'true',get('load-error').textContent);
  return {get,memory,counts,downloads,document,
    state:()=>structuredClone(vm.runInContext('store.value',context)),
    store:()=>structuredClone(vm.runInContext('({raw:store.raw,paused:store.paused,problem:store.problem})',context)),
    async storageEvent(key=domain.STORAGE_KEY) {for(const handler of windowListeners.storage??[])await handler({key});},
    resetCounts() {for(const key of Object.keys(counts))counts[key]=0;},
  };
}
