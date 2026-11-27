import fs from 'node:fs';
import assert from 'node:assert/strict';
import {openPrivateDiagnostic} from './gpu-scene-loader.ts';
import {CpuPoseDiagnostic} from './cpu-diagnostic.ts';
const paths=process.argv.slice(2);assert.ok(paths.length,'Specify private diagnostic GLB paths');let total=0,max=0;
for(const path of paths){const b=fs.readFileSync(path);const raw=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),cpu=new CpuPoseDiagnostic(raw);for(let clip=0;clip<cpu.durations.length;clip++){const {sampler,primitives}=openPrivateDiagnostic(raw,clip);assert.equal(sampler.duration,cpu.durations[clip]);for(const f of [0,.1,.5,.9,1]){const t=sampler.duration*f,palettes=sampler.sample(t),reference=cpu.sample(clip,t);assert.equal(primitives.length,reference.length);for(let j=0;j<primitives.length;j++){const p=primitives[j],mat=palettes[p.skin],points=reference[j].points;for(let i=0;i<p.positions.length/3;i++){for(let r=0;r<3;r++){let v=0;for(let h=0;h<4;h++){const k=p.joints[i*4+h]*16,w=p.weights[i*4+h];v+=w*(mat[k+r]*p.positions[i*3]+mat[k+r+4]*p.positions[i*3+1]+mat[k+r+8]*p.positions[i*3+2]+mat[k+r+12])}max=Math.max(max,Math.abs(v-points[i*3+r]));}}}total++}}}
assert.ok(max<.0001);console.log({total,max});
