import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const [viewer,dir]=process.argv.slice(2);
if(!viewer||!dir)throw Error('Usage: node test_pet_pair.mjs <compiled viewer directory> <private pair directory>');
const {CpuPoseDiagnostic}=await import(pathToFileURL(path.resolve(viewer,'cpu-diagnostic.js')));
const load=file=>{const b=fs.readFileSync(file);return new CpuPoseDiagnostic(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength))};
let count=0;
for(const f of fs.readdirSync(dir).filter(x=>x.endsWith('-pair.glb'))){const player=load(path.join(dir,f.replace('-pair.glb','-player.glb'))),pair=load(path.join(dir,f));const pcount=player.sample(0,0).length;let motion=0,first;
for(let k=0;k<=10;k++){const t=player.durations[0]*k/10,a=player.sample(0,t),b=pair.sample(0,t);assert.deepEqual(a,b.slice(0,pcount));const pet=b.slice(pcount);assert.ok(pet.length);if(!first)first=pet;else for(let j=0;j<pet.length;j++)for(let i=0;i<pet[j].points.length;i++)motion=Math.max(motion,Math.abs(pet[j].points[i]-first[j].points[i]));count++}assert.ok(motion>0.0001);console.log(f,'player primitives',pcount,'pet primitives',pair.sample(0,0).length-pcount,'pet world displacement',motion)}
assert.ok(count>0,'no paired GLBs');console.log('paired frames, exact unchanged player:',count)
