import test from 'node:test';
import assert from 'node:assert/strict';
import {presetHeader,filterSessionPresets,validPresetName} from '../src/lib/world/preset-session-format.ts';
const h=(v)=>presetHeader(JSON.stringify(v));
test('classifies every backup scope without accepting native saves',()=>{
 for(const scope of ['room','floor','building'])assert.equal(h({schema:'wand.preset.indoor-decoration@1',gameVersion:'1.26.2',scope,rooms:[]}).kind,scope);
 assert.equal(h({schema:'wand.preset.region-decoration@1',region:{},world:{gameVersion:'1.26.2'}}).version,'1.26.2');
 assert.equal(h({schema:'wand.preset.world-decoration@1',areas:[]}).kind,'world');
 assert.equal(h({schema:'wand.preset.whole-area-design@1',kind:'biome',design:{}}).kind,'biome');
 assert.throws(()=>h({GameInfo:{Version:643},World:{PlayerHouses:[]}}));
 assert.throws(()=>h({schema:'wand.preset.indoor-decoration@1',scope:'unknown',rooms:[]}));
 assert.throws(()=>h({schema:'wand.preset.scene@1'}));
});
test('filters by context and search, preserves distinct names and orders latest first',()=>{
 const rows=[{id:1,name:'Morning',schema:'wand.preset.indoor-decoration@1',kind:'room'},{id:2,name:'Morning',schema:'wand.preset.indoor-decoration@1',kind:'floor'},{id:3,name:'Evening',schema:'wand.preset.scene@1',kind:'scene'}];
 assert.deepEqual(filterSessionPresets(rows,['wand.preset.indoor-decoration@1'],'morning',['room']).map(e=>e.id),[1]);
 assert.deepEqual(filterSessionPresets(rows,[],'morning').map(e=>e.id),[2,1]);
 assert.equal(validPresetName(' '),false);assert.equal(validPresetName('庭のデザイン'),true);
});
