import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const [viewer,original,dir]=process.argv.slice(2);
if(!viewer||!original||!dir)throw Error('Usage: node test_split.mjs <compiled viewer directory> <original GLB> <split package directory>');
const {combine,validateManifest}=await import(new URL('file://'+path.resolve(viewer)+'/split-loader.js'));
const {CpuPoseDiagnostic}=await import(new URL('file://'+path.resolve(viewer)+'/cpu-diagnostic.js'));
const buf=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
const manifest=validateManifest(JSON.parse(await fs.readFile(path.join(dir,'index.json'),'utf8')));
const model=buf(await fs.readFile(path.join(dir,manifest.model.sha256+'.glb')));
const orig=new CpuPoseDiagnostic(buf(await fs.readFile(original)));
assert.equal(manifest.clips.length,orig.durations.length);let count=0;
for(const [i,c] of manifest.clips.entries()){
  const bytes=buf(await fs.readFile(path.join(dir,c.sha256+'.wpa')));
  const merged=new CpuPoseDiagnostic(await combine(model,bytes,manifest,c));
  for(const f of [0,.1,.5,.9,1]){
    const t=orig.durations[i]*f;
    assert.equal(merged.durations[0],orig.durations[i]);
    assert.deepEqual(orig.sample(i,t),merged.sample(0,t));count++;
  }
  if(i===0){const bad=bytes.slice(0);new Uint8Array(bad)[bad.byteLength-1]^=1;await assert.rejects(combine(model,bad,manifest,c),/digest mismatch/)}
}
console.log('identical deformed frames',count);
