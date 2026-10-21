import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function verifyData(root) {
  const dir=join(root,'public/data'),report=JSON.parse(await readFile(join(dir,'import-report.json'),'utf8'));
  for(const [name,expected]of [['catalog',report.catalog],['texts',report.details.texts],...Array.from({length:16},(_,i)=>['details-'+i.toString(16),report.details[i.toString(16)]])]) {
    const raw=await readFile(join(dir,name+'.json')),compressed=await readFile(join(dir,name+'.json.gz'));
    if(hash(raw)!==expected.sha256 || raw.length!==expected.bytes || compressed.length!==expected.gzipBytes || !gunzipSync(compressed).equals(raw))throw new Error('Generated data integrity failure: '+name);
  }
  for(const [name,expected]of Object.entries(report.members)) {
    const raw=name.endsWith('.ndjson')?gunzipSync(await readFile(join(dir,name+'.gz'))):await readFile(join(dir,name));
    if(hash(raw)!==expected.sha256 || raw.length!==expected.bytes)throw new Error('Original source integrity failure: '+name);
  }
  const reportRaw=await readFile(join(dir,'import-report.json'));
  if(!gunzipSync(await readFile(join(dir,'import-report.json.gz'))).equals(reportRaw))throw new Error('Report gzip mismatch');
  console.log('Verified source checksums, catalog and all 16 detail shards.');return report;
}
