import http from 'node:http';
import {readFile,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
import {artifactFiles} from './files.mjs';
const ROOT=fileURLToPath(new URL('../dist/',import.meta.url));
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.gz':'application/gzip','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.svg':'image/svg+xml'};
const allowed=new Set(artifactFiles);
export function createAppServer({root=ROOT,prefix='/spezialitaetenliste/'}={}) {
  root=resolve(root);
  return http.createServer(async(req,res)=>{
    const finish=(status,text)=>{res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8'});res.end(text);};
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-cache');
    const host=(req.headers.host||'').replace(/:\d+$/,'');
    if(!['127.0.0.1','localhost','[::1]'].includes(host))return finish(403,'Host not allowed');
    if(!['GET','HEAD'].includes(req.method))return finish(405,'Method not allowed');
    let path;try{path=decodeURIComponent((req.url||'').split('?')[0]);}catch{return finish(400,'Invalid path');}
    if(path==='/'||path===prefix.slice(0,-1)){res.writeHead(302,{Location:prefix});return res.end();}
    if(!path.startsWith(prefix))return finish(404,'Not found');
    path=path.slice(prefix.length)||'index.html';if(!allowed.has(path))return finish(404,'Not found');
    try{
      const target=await realpath(resolve(root,path));if(!target.startsWith(root+sep))return finish(403,'Outside root');
      const data=await readFile(target);res.writeHead(200,{'Content-Type':MIME[extname(path)]||'application/octet-stream','Content-Length':data.length});res.end(req.method==='HEAD'?undefined:data);
    }catch{return finish(404,'Not found');}
  });
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const port=Number(process.env.PORT||4174);const server=createAppServer();server.listen(port,'127.0.0.1',()=>console.log(`SL Browser: http://127.0.0.1:${server.address().port}/spezialitaetenliste/`));
}
