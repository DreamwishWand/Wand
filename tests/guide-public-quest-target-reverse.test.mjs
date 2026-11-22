import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {verifyPublicQuestIndex} from '../src/lib/guide/public-guide.mjs';
import {
  verifyPublicQuestTargetReverse,loadPublicQuestTargetReverse,
  guideQuestTargetItemHref,DB03_QUEST_TARGET_REVERSE_FILE,
  DB03_QUEST_TARGET_REVERSE_BYTES,DB03_QUEST_TARGET_REVERSE_SHA
} from '../src/lib/guide/public-quest-target-reverse.ts';

const folder=new URL('../static/guide/public/',import.meta.url);
async function fixture(){
  const [doc,original]=await Promise.all([
    readFile(new URL(DB03_QUEST_TARGET_REVERSE_FILE,folder)),
    readFile(new URL('quest-index.json',folder),'utf8')
  ]);
  const catalog=verifyPublicQuestIndex(JSON.parse(original));
  return {bytes:doc,catalog,raw:JSON.parse(doc.toString('utf8'))};
}
test('source-pinned Quest target reverse index recovers 4,897 explicit Item-ID positions',async()=>{
  const {bytes,raw,catalog}=await fixture();
  assert.equal(bytes.length,DB03_QUEST_TARGET_REVERSE_BYTES);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),DB03_QUEST_TARGET_REVERSE_SHA);
  const data=verifyPublicQuestTargetReverse(raw,catalog);
  assert.equal(data.coverage.distinctItemIds,2551);
  assert.equal(data.coverage.distinctQuestsWithTargetObjectives,639);
  assert.equal(data.coverage.distinctQuestsWithExplicitCandidates,627);
  assert.equal(data.coverage.directOccurrences,4641);
  assert.equal(data.coverage.alternativeOccurrences,256);
  assert.equal(data.coverage.mandatoryRequirementVerified,false);
  const purified=data.getItemCandidates('30000031');
  assert(purified.some(x=>x.questId==='2070000805'&&x.step===1&&x.objectiveIndex===1));
  assert(purified.every(x=>x.sourceCandidateOnly&&x.playerProgressVerified===false));
  assert(Object.isFrozen(purified));
  assert(Object.isFrozen(purified[0]));
  const ids=data.getItemQuestIds('30000031');
  assert(ids.includes('2070000805'));
  assert.equal(ids.length,new Set(ids).size);
  assert.deepEqual(data.getItemCandidates('00000031'),[]);
  assert.deepEqual(data.getItemQuestIds('__proto__'),[]);
  assert.deepEqual(data.getQuestCandidates('99999999'),[]);
  assert.equal(guideQuestTargetItemHref('30000031','/Wand'),
    '/Wand/guide/quests/?target=30000031');
  assert.equal(guideQuestTargetItemHref('30000031'),
    '/guide/quests/?target=30000031');
  assert.equal(guideQuestTargetItemHref('0'),null);
  assert.throws(()=>guideQuestTargetItemHref('30000031','https://bad.example'),
    /DB03_QUEST_TARGET_REVERSE_BASE/);
});
test('every published reverse relation points back to one exact original selector and candidate position',async()=>{
  const {raw,catalog}=await fixture();
  const data=verifyPublicQuestTargetReverse(raw,catalog);
  let seen=0;
  for(let p=0;p<8;p++){
    const file='quest-targets-'+String(p).padStart(2,'0')+'.json';
    const original=JSON.parse(await readFile(new URL(file,folder),'utf8'));
    for(const [questId,rows] of Object.entries(original.quests)){
      for(const entry of rows){
        for(let si=0;si<entry.selectors.length;si++){
          const selector=entry.selectors[si];
          for(let ci=0;ci<selector.candidates.length;ci++){
            const candidate=selector.candidates[ci];
            const matched=data.getItemCandidates(candidate.id).filter(x=>
              x.questId===questId&&x.step===entry.step&&
              x.subStep===entry.sub&&x.objectiveIndex===entry.objective&&
              x.selectorIndex===si&&x.candidateIndex===ci);
            assert.equal(matched.length,1);
            assert.equal(matched[0].role,candidate.role);
            seen++;
          }
        }
      }
    }
  }
  assert.equal(seen,4897);
});
test('source-backed target loader fails closed when published bytes or provenance change',async()=>{
  const {bytes,raw,catalog}=await fixture();
  const f=(body)=>()=>Promise.resolve(new Response(body,{status:200}));
  const verified=await loadPublicQuestTargetReverse(catalog,'/Wand/guide/public/'+
    DB03_QUEST_TARGET_REVERSE_FILE,f(bytes));
  assert.equal(verified.getItemQuestIds('30000031').length,16);
  const corrupted=Buffer.from(bytes);corrupted[190]^=1;
  await assert.rejects(loadPublicQuestTargetReverse(catalog,'/',f(corrupted)),
    /DB03_QUEST_TARGET_REVERSE_SHA/);
  await assert.rejects(loadPublicQuestTargetReverse(catalog,'/',f('bad')),
    /DB03_QUEST_TARGET_REVERSE_BYTES/);
  let x=structuredClone(raw);
  x.source.originalSourceCandidatesOnly=false;
  assert.throws(()=>verifyPublicQuestTargetReverse(x,catalog),/PROVENANCE/);
  x=structuredClone(raw);x.items['30000031'][0][0]='9999999999';
  assert.throws(()=>verifyPublicQuestTargetReverse(x,catalog),/OBJECTIVE_ROW/);
  x=structuredClone(raw);x.items['30000031'][0][6]=2;
  assert.throws(()=>verifyPublicQuestTargetReverse(x,catalog),/OBJECTIVE_ROW/);
  x=structuredClone(raw);
  x.items['30000031'][1]=structuredClone(x.items['30000031'][0]);
  assert.throws(()=>verifyPublicQuestTargetReverse(x,catalog),/DUPLICATE_SOURCE_POSITION/);
});
test('Quest Guide resolves source Item-ID targets without treating alternative candidates as guaranteed',async()=>{
  const route=await readFile(new URL('../src/routes/guide/quests/+page.svelte',import.meta.url),'utf8');
  assert.match(route,/loadPublicQuestTargetReverse/);
  assert.match(route,/targetReverseIndex=data;restoreAddressSelection\(\)/);
  assert.match(route,/url\.searchParams\.delete\('target'\)/);
  assert.match(route,/targetRequested=params\.getAll\('target'\)/);
  assert.match(route,/目標アイテムの候補に関連するクエスト/);
  assert.match(route,/class:target-item-match/);
});
