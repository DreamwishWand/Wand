import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveOceanComposition,oceanChannelMatrix,loadOceanComposition} from '../src/lib/media/ocean-composition.ts';
const source=JSON.parse(readFileSync(new URL('../data/ddv/media/keepsake-sea-composition-steam-1.26.2.json',import.meta.url),'utf8'));
const map={id:'MapVillageExpansion4',worldCandidate:'exp4',parts:source.parts.filter(p=>p.kind==='sprite').map(p=>({...p,url:'https://media.dreamwishwand.com/images/'+p.sha256+'.webp'}))};
const activation={state:'published',canonicalMetadataVerified:true,referenceComparisonVerified:true,referenceSha256:source.referenceSha256,
  transfer:{channel:'a',table:Array.from({length:256},(_,i)=>i/255)},
  images:Object.fromEntries(source.parts.filter(p=>p.kind==='sdf').map(p=>[p.sha256,{width:p.width,height:p.height,bytes:p.bytes}]))};
test('unpublished ocean does not activate or fetch assets',async()=>{
  assert.equal(resolveOceanComposition(source,{state:'unpublished'},map),null);
  assert.equal(await loadOceanComposition(map),null);
});
test('all 45 positive layout layers preserve source order when supplied verified synthetic activation',()=>{
  const result=resolveOceanComposition(source,activation,map);
  assert.equal(result.parts.length,45);
  assert.deepEqual(result.parts.map(p=>p.kind),source.parts.map(p=>p.kind));
  assert.deepEqual(result.parts.map(p=>p.imageToCanvas),source.parts.map(p=>p.imageToCanvas));
  assert.equal(result.width,10975);assert.equal(result.height,11085);
  assert.deepEqual(oceanChannelMatrix('a').split(' ').map(Number).slice(-5),[0,0,0,1,0]);
  assert.deepEqual(oceanChannelMatrix('r').split(' ').map(Number).slice(-5),[1,0,0,0,0]);
});
test('unverified comparison, wrong polarity, missing receipts and reverse transfer cannot activate',()=>{
  assert.throws(()=>resolveOceanComposition(source,{...activation,referenceComparisonVerified:false},map));
  assert.throws(()=>resolveOceanComposition({...source,polarity:'negative'},activation,map));
  assert.throws(()=>resolveOceanComposition(source,{...activation,images:{}},map));
  assert.throws(()=>resolveOceanComposition(source,{...activation,transfer:{channel:'a',table:[...activation.transfer.table].reverse()}},map));
});
