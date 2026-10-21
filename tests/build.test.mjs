import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {artifactFiles} from '../scripts/files.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
async function paths(dir,prefix=''){const found=[];for(const entry of await readdir(dir,{withFileTypes:true})){const relative=prefix+entry.name;if(entry.isDirectory())found.push(...await paths(join(dir,entry.name),relative+'/'));else found.push(relative);}return found;}
test('real build contains exactly allowlisted runtime and official data; no giant raw sources or private artifacts',async()=>{
 execFileSync(process.execPath,['scripts/build.mjs'],{cwd:root});
 assert.deepEqual((await paths(join(root,'dist'))).sort(),[...artifactFiles].sort());
 assert.ok(!artifactFiles.some(p=>p.startsWith('sources/')||p.includes('.local')||p.endsWith('.ndjson')||p.endsWith('.zip')));
 const html=await readFile(join(root,'dist/index.html'),'utf8');assert.match(html,/\.\/src\/app\.js/);assert.match(html,/aria-current="page"/);
 const css=await readFile(join(root,'dist/src/styles.css'),'utf8');assert.ok(!css.includes('[truncated]'));assert.match(css,/\.collection\s*\{/);assert.match(css,/\.price-label\s*\{/);assert.equal((css.match(/\{/g)||[]).length,(css.match(/\}/g)||[]).length);
});
