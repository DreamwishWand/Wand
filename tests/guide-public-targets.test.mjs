import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifyPublicQuestIndex,verifyPublicQuestPart} from '../src/lib/guide/public-guide.ts';
import {createHash} from 'node:crypto';
import {verifyPublicQuestTargetReverse,DB03_QUEST_TARGET_REVERSE_SHA} from '../src/lib/guide/public-quest-target-reverse.ts';
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

test('forward eight-part selectors and reverse Item ID graph enumerate exactly the same 4897 source positions',async()=>{
  const catalog=verifyPublicQuestIndex(await read('quest-index.json'));
  const targetIndex=verifyPublicQuestTargetsIndex(await read('quest-targets-index.json'));
  const reverseBytes=await readFile(local('quest-target-reverse-1.26.2.json'));
  assert.equal(createHash('sha256').update(reverseBytes).digest('hex'),DB03_QUEST_TARGET_REVERSE_SHA);
  const reverse=verifyPublicQuestTargetReverse(JSON.parse(reverseBytes),catalog);
  const expected=new Set(),sourceById=new Map();
  let sourceCount=0;
  for(let partNumber=0;partNumber<8;partNumber++){
    const suffix=String(partNumber).padStart(2,'0');
    const details=verifyPublicQuestPart(catalog,await read('quest-details-'+suffix+'.json'),partNumber);
    const part=verifyPublicQuestTargetsPart(targetIndex,await read('quest-targets-'+suffix+'.json'),partNumber,details);
    for(const [questId,objectives] of Object.entries(part.quests)){
      for(const row of objectives){
        for(const [selectorIndex,selector] of row.selectors.entries()){
          for(const [candidateIndex,candidate] of selector.candidates.entries()){
            const id=[candidate.id,questId,row.step,row.sub,row.objective,
              selectorIndex,candidateIndex,candidate.role].join(':');
            assert(!expected.has(id),'duplicate forward native source position');
            expected.add(id);sourceCount++;
            const previous=sourceById.get(candidate.id)||0;
            sourceById.set(candidate.id,previous+1);
          }
        }
      }
    }
  }
  assert.equal(sourceCount,4897);
  assert.equal(expected.size,reverse.coverage.sourceCandidateOccurrences);
  assert.equal(sourceById.size,2551);
  let actualCount=0;
  for(const [itemId,expectedCount] of sourceById){
    const refs=reverse.getItemCandidates(itemId);
    assert.equal(refs.length,expectedCount,itemId);
    for(const ref of refs){
      const id=[ref.itemId,ref.questId,ref.step,ref.subStep,
        ref.objectiveIndex,ref.selectorIndex,ref.candidateIndex,ref.role].join(':');
      assert(expected.delete(id),'unexpected reverse native source position '+id);
      actualCount++;
    }
  }
  assert.equal(actualCount,4897);
  assert.equal(expected.size,0,'forward/reverse quest Item source projections diverged');
});
test('typed Quest target loader rejects forged source indexes, selectors and duplicate target positions',async()=>{
  const index=verifyPublicQuestTargetsIndex(await read('quest-targets-index.json'));
  const forged=structuredClone(index);
  forged.source.missionSha256='0'.repeat(64);
  assert.throws(()=>verifyPublicQuestTargetsIndex(forged),/untrusted original-source overlay/);
  const wrongSha=structuredClone(index);
  wrongSha.partFiles['quest-targets-00.json'].sha256='bad';
  assert.throws(()=>verifyPublicQuestTargetsIndex(wrongSha),/invalid overlay sha\/size/);
  const guide=verifyPublicQuestIndex(await read('quest-index.json'));
  const details=verifyPublicQuestPart(guide,await read('quest-details-00.json'),0);
  const part=await read('quest-targets-00.json');
  const quest=Object.keys(part.quests)[0];
  const badMode=structuredClone(part);
  badMode.quests[quest][0].selectors[0].mode='unsafe';
  assert.throws(()=>verifyPublicQuestTargetsPart(index,badMode,0,details),/invalid selector/);
  const duplicated=structuredClone(part);
  duplicated.quests[quest].push(structuredClone(duplicated.quests[quest][0]));
  assert.throws(()=>verifyPublicQuestTargetsPart(index,duplicated,0,details),
    /duplicate objective target/);
  assert.equal(itemTargetName(index,'__proto__','ja'),null);
  const lookup=originalTargetLookup(verifyPublicQuestTargetsPart(index,part,0,details),'__proto__');
  assert.equal(Object.getPrototypeOf(lookup),null);
  assert.deepEqual(Object.keys(lookup),[]);
});
