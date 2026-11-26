import test from 'node:test';
import assert from 'node:assert/strict';
import {compactPresetFile,readPresetText,presetFilename} from '../src/lib/presets/preset-file.ts';
test('portable file picks the smallest lossless representation and accepts legacy JSON',async()=>{
 const small='{"a":1}',large=JSON.stringify({schema:'wand.preset.world-decoration@1',areas:Array.from({length:5000},(_,i)=>({itemId:40000001,x:i%100,y:Math.floor(i/100),orientation:2}))});
 for(const raw of [small,large,'{"name":"庭のデザイン","x":2}']){
  const file=await compactPresetFile(raw,'example.json');
  assert.equal(file.name,'example.wandpreset');assert.ok(file.size<=new Blob([raw]).size);
  assert.equal(await readPresetText(file),raw);
  assert.equal(await readPresetText(new Blob([raw])),raw);
 }
 const packed=await compactPresetFile(large,'world.json');
 assert.ok(packed.size<new Blob([large]).size/5);
 await assert.rejects(readPresetText(packed,packed.size+1),/EXPANSION_LIMIT/);
 assert.equal(presetFilename('old.json.gz'),'old.wandpreset');
});
test('malformed gzip and invalid UTF8 are rejected',async()=>{
 await assert.rejects(readPresetText(new Blob([new Uint8Array([31,139,1,2])])));
 await assert.rejects(readPresetText(new Blob([new Uint8Array([255,255])])));
});
