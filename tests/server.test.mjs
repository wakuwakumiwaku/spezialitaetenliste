import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,mkdtemp,rm,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import http from 'node:http';
import {createAppServer} from '../scripts/serve.mjs';
test('subpath static server, MIME, method/host/allowlist/traversal/symlink boundaries',async()=>{
 const base=new URL('../.local/',import.meta.url);await mkdir(base,{recursive:true});const root=await mkdtemp(new URL('server-',base).pathname);await writeFile(join(root,'index.html'),'<h1>test</h1>');await mkdir(join(root,'src'));await writeFile(root+'.outside.txt','secret');await symlink(root+'.outside.txt',join(root,'src/domain.js'));
 const server=createAppServer({root});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{
 assert.equal((await fetch(origin+'/spezialitaetenliste/')).status,200);assert.equal((await fetch(origin+'/spezialitaetenliste/')).headers.get('content-type'),'text/html; charset=utf-8');
 for(const path of ['/spezialitaetenliste/sources/private.json','/spezialitaetenliste/secret.txt','/spezialitaetenliste/..%2Fsecret.txt','/other/','/spezialitaetenliste/%00'])assert.equal((await fetch(origin+path)).status,404);
 assert.equal((await fetch(origin+'/spezialitaetenliste/src/domain.js')).status,403);
 assert.equal((await fetch(origin+'/spezialitaetenliste/',{method:'POST'})).status,405);
 const status=await new Promise((resolve,reject)=>{const r=http.get(origin+'/spezialitaetenliste/',{headers:{Host:'evil.invalid'}},res=>{res.resume();resolve(res.statusCode);});r.on('error',reject);});assert.equal(status,403);
 assert.equal((await fetch(origin+'/spezialitaetenliste/',{method:'HEAD'})).headers.get('content-length'),'13');
 }finally{await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});await rm(root+'.outside.txt',{force:true});}
});
