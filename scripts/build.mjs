import {mkdir,rm,copyFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {runtimeFiles,publicFiles} from './files.mjs';
import {verifyData} from './verify-data.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
await verifyData(root);
const out=join(root,'dist');await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
for(const [base,files] of [[root,runtimeFiles],[join(root,'public'),publicFiles]])for(const path of files){await mkdir(join(out,path,'..'),{recursive:true});await copyFile(join(base,path),join(out,path));}
await writeFile(join(out,'.nojekyll'),'');
console.log('Built dist/ using exact runtime + official data allowlist; source archive and raw NDJSON excluded.');
