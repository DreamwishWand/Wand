import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openPublicSharedGameSources} from '../src/lib/game-db/public-sources.ts';
import {joinCurrentGameSources} from '../src/lib/game-db/source-join.ts';

const STATIC=new URL('../static/',import.meta.url);
function sourceFetcher(tamper=false){
  const calls=[];
  return {
    calls,
    fetcher:async url=>{
      assert(typeof url==='string' && url.startsWith('/Wand/'));
      calls.push(url);
      let bytes;
      try{bytes=readFileSync(new URL(url.slice(6),STATIC));}
      catch{return new Response('not found',{status:404});}
      if(tamper&&url.endsWith('/quest-target-reverse-1.26.2.json')){
        bytes=Buffer.from(bytes);bytes[80]^=1;
      }
      return new Response(bytes,{status:200});
    }
  };
}
let loaded;
const open=()=>loaded??=openPublicSharedGameSources('/Wand',sourceFetcher().fetcher);

test('DB-00 reuses Quest index response and attaches 4897 pinned Quest target candidates',async()=>{
  const {fetcher,calls}=sourceFetcher();
  const db=await openPublicSharedGameSources('/Wand',fetcher);
  assert.equal(db.guideQuestTargets.schema,'wand.db03.public-quest-target-reverse@1');
  assert.equal(db.guideQuestTargets.coverage.knownQuests,733);
  assert.equal(db.guideQuestTargets.coverage.sourceCandidateOccurrences,4897);
  assert.equal(db.guideQuestTargets.coverage.distinctItemIds,2551);
  assert.equal(db.guideQuestTargets.coverage.directOccurrences,4641);
  assert.equal(db.guideQuestTargets.coverage.alternativeOccurrences,256);
  assert.equal(db.guideQuestTargets.coverage.mandatoryRequirementVerified,false);
  assert.equal(db.guideQuestTargets.coverage.playerProgressVerified,false);
  assert.equal(calls.length,30);
  assert.equal(new Set(calls).size,30);
  assert.equal(calls.filter(x=>x.endsWith('/quest-index.json')).length,1);
  assert.equal(calls.filter(x=>x.endsWith('/quest-target-reverse-1.26.2.json')).length,1);
  assert.equal(calls.filter(x=>x.endsWith('/active.json')).length,1);
  const filtered=db.searchItems({questTargetCandidate:true,limit:500});
  assert(filtered.total>0);
  assert.equal(filtered.sourceCoverageComplete,false);
  assert.equal(filtered.playerOwnershipVerified,false);
  assert(filtered.items.every(item=>item.questTargetCandidates?.length));
  const sample=filtered.items[0];
  assert.deepEqual(sample.questTargetCandidates,
    db.guideQuestTargets.getItemCandidates(sample.itemId));
  assert.equal(sample.questTargetRequirementsVerified,false);
  assert.equal(sample.questTargetPlayerProgressVerified,false);
  assert(sample.questTargetCandidates.every(candidate=>
    candidate.sourceCandidateOnly &&
    !candidate.mandatoryRequirementVerified &&
    !candidate.playerProgressVerified));
  const direct=db.getItem(sample.itemId);
  assert.deepEqual(direct.questTargetCandidates,sample.questTargetCandidates);
  assert(Object.isFrozen(sample.questTargetCandidates));
  assert(Object.isFrozen(sample));
  assert(Object.isFrozen(filtered));
  assert.equal(db.getItem('99999999').questTargetRequirementsVerified,false);
});

test('Quest target search combines quest/role, preserves alternative status and post-filter pagination',async()=>{
  const db=await open();
  const target=db.guideQuestTargets;
  // Enumerate ONLY published ItemList IDs. An original Quest target may live
  // outside this published subset and must still be directly addressable.
  let total=0,direct=0,alternative=0;
  let sampleQuest=null;
  let directItem=null;
  let alternativeItem=null;
  for(let offset=0;offset<db.database.itemCount;offset+=500){
    const page=db.database.queryItems([],{offset,limit:500});
    for(const item of page.items){
      const rows=target.getItemCandidates(item.id);
      if(rows.length)total++;
      if(rows.some(row=>row.role==='direct')){
        direct++;directItem??=item.id;
      }
      if(rows.some(row=>row.role==='alternative')){
        alternative++;alternativeItem??=item.id;
      }
      sampleQuest??=rows[0]?.questId??null;
    }
  }
  assert(total>0&&direct>0&&alternative>0&&sampleQuest);
  assert.equal(db.searchItems({questTargetCandidate:true,limit:1}).total,total);
  assert.equal(db.searchItems({questTargetRole:'direct',limit:1}).total,direct);
  assert.equal(db.searchItems({questTargetRole:'alternative',limit:1}).total,alternative);
  const questRows=db.searchItems({questTargetQuestId:sampleQuest,limit:500});
  assert(questRows.total>0);
  assert(questRows.items.every(item=>item.questTargetCandidates?.some(
    row=>row.questId===sampleQuest)));
  const directRow=db.searchItems({questTargetRole:'direct',text:directItem,limit:500});
  assert(directRow.items.some(item=>item.itemId===directItem));
  const alternativeRow=db.searchItems({
    questTargetRole:'alternative',text:alternativeItem,limit:500
  });
  assert(alternativeRow.items.some(item=>item.itemId===alternativeItem));
  const all=db.searchItems({questTargetCandidate:true,limit:500});
  const first=db.searchItems({questTargetCandidate:true,limit:7});
  const second=db.searchItems({
    questTargetCandidate:true,offset:first.nextOffset??0,limit:7
  });
  assert.deepEqual(first.items.map(x=>x.itemId),all.items.slice(0,7).map(x=>x.itemId));
  assert.deepEqual(second.items.map(x=>x.itemId),all.items.slice(7,14).map(x=>x.itemId));
  assert(first.items.every(item=>!second.items.some(next=>next.itemId===item.itemId)));
  assert.equal(db.searchItems({questTargetQuestId:'999999999',limit:100}).total,0);
  assert.throws(()=>db.searchItems({questTargetCandidate:false}),
    /DB00_PUBLIC_SEARCH_INVALID_QUEST_TARGET_FILTER/);
  assert.throws(()=>db.searchItems({questTargetRole:'required'}),
    /DB00_PUBLIC_SEARCH_INVALID_QUEST_TARGET_ROLE/);
  assert.throws(()=>db.searchItems({questTargetQuestId:'test-quest'}),
    /DB00_PUBLIC_SEARCH_INVALID_QUEST_TARGET_QUEST_ID/);
});

test('unsupplied target source is null, but a real verified empty index is an empty array',async()=>{
  const db=await open();
  const plain=joinCurrentGameSources(db.database,{
    origins:db.acquisition.origins,rewards:db.guide,
    staticContainers:db.acquisition.staticContainerSource
  });
  const sample=db.searchItems({questTargetCandidate:true,limit:1}).items[0].itemId;
  assert.equal(plain.getItem(sample).questTargetCandidates,null);
  assert.equal(plain.getItem(sample).questTargetRequirementsVerified,false);
  assert.deepEqual(db.getItem('99999999').questTargetCandidates,[]);
  assert.throws(()=>joinCurrentGameSources(db.database,{
    questTargets:{
      ...db.guideQuestTargets,
      coverage:{...db.guideQuestTargets.coverage,
        mandatoryRequirementVerified:true}
    }
  }),/DB03_QUEST_TARGET_SOURCE_REQUIRED/);
  await assert.rejects(
    openPublicSharedGameSources('/Wand',sourceFetcher(true).fetcher),
    /DB03_QUEST_TARGET_REVERSE_SHA/
  );
});
