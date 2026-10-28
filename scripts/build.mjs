import {mkdir,mkdtemp,rm,copyFile,writeFile,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {runtimeFiles,publicFiles} from './files.mjs';
import {verifyData} from './verify-data.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
await verifyData(root);
const out=join(root,'dist'), staging=await mkdtemp(join(root,'.dist-build-'));
const next=join(staging,'next'), previous=join(staging,'previous');
let retainPrevious=false;
try {
  await mkdir(next);
  for(const [base,files] of [[root,runtimeFiles],[join(root,'public'),publicFiles]])for(const path of files){await mkdir(join(next,path,'..'),{recursive:true});await copyFile(join(base,path),join(next,path));}
  await writeFile(join(next,'.nojekyll'),'');
  let hadPrevious=false;
  try {await rename(out,previous);hadPrevious=true;} catch(error) {if(error.code!=='ENOENT')throw error;}
  try {await rename(next,out);} catch(error) {
    if(hadPrevious) {
      try {await rename(previous,out);} catch(restoreError) {
        // Never remove the last complete artifact if rollback itself fails.
        retainPrevious=true;
        throw new AggregateError([error,restoreError], 'Build publication failed; previous build retained at '+previous);
      }
    }
    throw error;
  }
} finally {if(!retainPrevious)await rm(staging,{recursive:true,force:true});}
console.log('Built dist/ using exact runtime + official data allowlist; source archive and raw NDJSON excluded.');
