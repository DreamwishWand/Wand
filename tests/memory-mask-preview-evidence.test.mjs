import test from 'node:test';
import assert from 'node:assert/strict';
import release from '../data/ddv/media/memory-steam-1.26.2.json' with {type:'json'};
import {MASK_PREVIEW_EVIDENCE,maskPreviewEligible,exactMaskBit,memoryMaskEvidence} from '../src/lib/media/memory-mask-preview-evidence.ts';

test('every Memory row is classified against the exact published mask and shard count',()=>{
  assert.equal(MASK_PREVIEW_EVIDENCE.length,21);
  const excluded=[];
  let count=0;
  for(const [id,row] of Object.entries(release.items)){
    assert.ok(memoryMaskEvidence(row[2],row[4]),id);
    if(maskPreviewEligible(row[2],row[4]))count++;
    else excluded.push(Number(id));
  }
  assert.equal(count,467);
  assert.deepEqual(excluded.sort((a,b)=>a-b),[130000484,130000515,130000516,130000527,130000528]);
  for(const [id,shards,sha,observed,exact,total] of MASK_PREVIEW_EVIDENCE){
    assert.equal(release.items[id][2],sha);
    assert.equal(release.items[id][4],shards);
    assert.equal(release.images[sha].width*release.images[sha].height,total);
    assert.ok(exact>=0&&exact<=total&&observed<=shards);
  }
  assert.equal(maskPreviewEligible('0'.repeat(64),10),false);
});
test('R/G one-hot data samples map to bit values without interpolation',()=>{
  for(let i=0;i<10;i++){
    const bit=1<<i;
    assert.equal(exactMaskBit(bit&255,bit>>8,0,255,10),bit);
  }
  for(const sample of [[0,0,0,255,10],[3,0,0,255,10],[1,1,0,255,10],[1,0,1,255,10],[1,0,0,254,10],[0,1,0,255,8],[1,0,0,255,0],[1.5,0,0,255,10]]){
    assert.equal(exactMaskBit(...sample),null);
  }
});
