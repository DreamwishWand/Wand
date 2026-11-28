import test from 'node:test';import assert from 'node:assert/strict';
import {hairSelections,hairSelectionKey,validHairAssetIndex,loadHairAttachments} from '../src/lib/photo-mode/hair-assets.ts';
const c=[.2,.3,.4,1],palette={base:[{index:0,displayOrder:0,baseColor:c,firstColor:c,secondColor:c}],highlight:[{index:0,displayOrder:0,baseColor:c}]};
const index={palette,standard:{male:{itemId:50500020,hairIndex:0,highlightIndex:0},female:{itemId:50500020,hairIndex:0,highlightIndex:0}},items:{50500020:{male:{},female:{}},51600001:{male:{}},51700001:{male:{}}}};
test('saved hair slots use native IDs and never substitute missing or unsupported saved items',()=>{
 assert.deepEqual(hairSelections(index,undefined,'male'),[index.standard.male]);
 const a={avatars:{male:{HairColorIndex:0,HairHighlightColor:0,Clothes:{5:50500020,16:51600001,17:51700001}}}};
 assert.equal(hairSelections(index,a,'male').length,3);
 assert.equal(hairSelectionKey(index,a,'male'),'50500020:0:0|51600001:0:0|51700001:0:0');
 assert.deepEqual(hairSelections(index,a,'male',true),[]);
 assert.deepEqual(hairSelections(index,{avatars:{male:{...a.avatars.male,Clothes:{5:50509999,16:50500020,17:0}}}},'male'),[]);
 assert.deepEqual(hairSelections(index,{avatars:{male:{...a.avatars.male,HairColorIndex:9}}},'male'),[]);
});
test('no asset request without verified optional hair package',async()=>{
 let fetched=0;const fetch=()=>{fetched++;throw Error('unexpected fetch')};
 assert.deepEqual(await loadHairAttachments(undefined,undefined,'male',fetch,new AbortController().signal),[]);
 assert.equal(validHairAssetIndex({...index,gpuColorConversionVerified:false}),false);
 assert.equal(fetched,0);
});
