import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifyPublicQuestIndex,verifyPublicQuestPart} from '../src/lib/guide/public-guide.mjs';
import {verifyPublicQuestTargetsIndex,verifyPublicQuestTargetsPart,loadPublicQuestTargetsPart,itemTargetName,originalTargetLookup} from '../src/lib/guide/public-targets.ts';

const root=new URL('../static/guide/public/',import.meta.url);
const local=name=>new URL(name,root);
const read=async name=>JSON.parse(await readFile(local(name),'utf8'));
let index,guide;
test('quest target publication has source-pinned 733 original quests, 4869 typed objectives and 4897 candidates',async()=>{
  guide=verifyPublicQuestIndex(await read('quest-index.json'));
  index=verifyPublicQuestTargetsIndex(await read('quest-targets-index.json'));
  assert.equal(guide.counts.quests,index.counts.quests);
  assert.equal(index.counts.uniqueCandidateIds,2551);
  assert.equal(index.counts.verifiedPublicItemNames,2059);
  assert.equal(index.counts.unresolvedPublicItemNames,492);
  assert.equal(itemTargetName(index,'30000031','ja'),'ピュアナイトシャード');
  assert.equal(itemTargetName(index,'30000031','en'),'Purified Night Shard');
  assert.equal(itemTargetName(index,'120000000','ja'),null);
});
test('all eight public item-target partitions match authenticated quest objective position/type',async()=>{
  index ||= verifyPublicQuestTargetsIndex(await read('quest-targets-index.json'));
  guide ||= verifyPublicQuestIndex(await read('quest-index.json'));
  let entries=0,candidates=0,referenced=0;
  for(let i=0;i<8;i++){
    const suffix=String(i).padStart(2,'0');
    const details=verifyPublicQuestPart(guide,await read('quest-details-'+suffix+'.json'),i);
    const x=verifyPublicQuestTargetsPart(index,await read('quest-targets-'+suffix+'.json'),i,details);
    entries+=x.targetObjectives;candidates+=x.candidateOccurrences;
    referenced+=Object.keys(x.quests).length;
    const sample=Object.keys(x.quests)[0];
    const lookup=originalTargetLookup(x,sample);
    const target=x.quests[sample][0];
    assert(lookup[`${target.step}:${target.sub}:${target.objective}`]);
  }
  assert.equal(entries,4869);
  assert.equal(candidates,4897);
  assert(referenced>500);
});
test('target overlay refuses a nonmatching objective and tampered lazy part',async()=>{
  index ||= verifyPublicQuestTargetsIndex(await read('quest-targets-index.json'));
  guide ||= verifyPublicQuestIndex(await read('quest-index.json'));
  const details=verifyPublicQuestPart(guide,await read('quest-details-00.json'),0);
  const overlay=await read('quest-targets-00.json');
  const first=Object.keys(overlay.quests)[0],wrong=structuredClone(overlay);
  wrong.quests[first][0].type='UNRELATED_TYPE';
  assert.throws(()=>verifyPublicQuestTargetsPart(index,wrong,0,details),/objective type mismatch/);
  const original=await readFile(local('quest-targets-00.json'));
  const fetcher=async bytes=>({ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
  const good=await loadPublicQuestTargetsPart(index,0,'/guide/public/quest-targets-00.json',details,()=>fetcher(original));
  assert.equal(good.part,0);
  const mutated=Buffer.from(original);mutated[100]^=1;
  await assert.rejects(loadPublicQuestTargetsPart(index,0,'/',details,()=>fetcher(mutated)),/fingerprint/);
});
