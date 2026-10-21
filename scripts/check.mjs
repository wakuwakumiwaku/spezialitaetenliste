import {readdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {verifyData} from './verify-data.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
for(const dir of ['src','scripts','tests'])for(const f of await readdir(join(root,dir)))if(/\.(mjs|js)$/.test(f))execFileSync(process.execPath,['--check',join(root,dir,f)],{stdio:'inherit'});
const html=await readFile(join(root,'index.html'),'utf8');if(/https?:.*(?:font|cdn)/i.test(html))throw new Error('External font/runtime dependency');
await verifyData(root);console.log('Syntax and bundled data checks passed.');
