import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {
  DB02_NATIVE_LOOT_FILE,DB02_NATIVE_LOOT_BYTES,DB02_NATIVE_LOOT_SHA256,
  loadPinnedNativeLootCandidates,hasPinnedNativeLootCandidateEvidence
} from '../src/lib/acquisition/public-native-loot.ts';

const file=readFileSync(new URL('../static/acquisition/public/'+
  DB02_NATIVE_LOOT_FILE,import.meta.url));
function localFetch(flags={}){
  const requests=[];
  const fetcher=async url=>{
    requests.push(url);
    assert.equal(url,'/Wand/acquisition/public/'+DB02_NATIVE_LOOT_FILE);
    if(flags.missing)return new Response('missing',{status:404});
    const bytes=Buffer.from(file);
    if(flags.corrupt)bytes[100]^=1;
    if(flags.short)return new Response(bytes.subarray(0,-1),{status:200});
    return new Response(bytes,{status:200});
  };
  return {requests,fetcher};
}
test('Steam original 960 loot tables are 3804 unverified candidates, never guaranteed drops',async()=>{
  assert.equal(file.length,DB02_NATIVE_LOOT_BYTES);
  assert.equal(createHash('sha256').update(file).digest('hex'),DB02_NATIVE_LOOT_SHA256);
  const source=JSON.parse(file);
  assert.equal(source.source.sha256,
    '580db9ed81c37890fd1f8fab121a5d328c967d8c22ee253ff4c2b431d008d99c');
  assert.equal(source.source.bytes,110133);
  const {requests,fetcher}=localFetch();
  const index=await loadPinnedNativeLootCandidates('/Wand',fetcher);
  assert.equal(requests.length,1);
  assert.equal(index.schema,'wand.db02.public-native-loot-candidates@1');
  const c=index.coverage;
  assert.equal(c.nativeTables,960);
  assert.equal(c.nativeGroups,2087);
  assert.equal(c.groupsWithoutExplicitItems,198);
  assert.equal(c.candidateRelations,3804);
  assert.equal(c.distinctCandidateItemIds,1100);
  assert.equal(c.unconditionalEntryReferences,3744);
  assert.equal(c.conditionalEntryReferences,60);
  assert.equal(c.dynamicFilterGroups,163);
  assert.equal(c.eligibilityGateGroups,11);
  assert.equal(c.actualAcquisitionContextsVerified,0);
  assert.equal(c.guaranteedDropsVerified,0);
  assert.equal(c.liveAvailabilityVerified,false);
  assert.equal(c.playerOwnershipVerified,false);
  assert.equal(c.sourceCoverageComplete,false);
  assert.equal(index.tables.length,960);
  assert.equal(index.candidates.length,3804);
  assert.equal(index.staticCandidateOrigins.length,3804);
  assert.equal(index.listTableIds().length,960);
  assert.equal(index.listCandidateItemIds().length,1100);
  assert.equal(new Set(index.candidates.map(x=>x.pathId)).size,3804);
  assert(hasPinnedNativeLootCandidateEvidence(index));
  assert(!hasPinnedNativeLootCandidateEvidence({...index}));
  assert(Object.isFrozen(index)&&Object.isFrozen(index.coverage)&&
    Object.isFrozen(index.tables)&&Object.isFrozen(index.candidates)&&
    Object.isFrozen(index.staticCandidateOrigins));
  for(const item of index.staticCandidateOrigins){
    assert.equal(item.routeStatus,'static_candidate_only');
    assert.equal(item.kind,'loot');
    assert.equal(item.source.kind,'verified_game_native');
    assert.equal(item.availability,'not_live_verified');
    assert.equal(item.campaignId,null);
    assert.equal(item.price,null);
    assert(index.getItemStaticOrigins(item.itemId).includes(item));
    assert(Object.isFrozen(item));
  }
});
test('source native table/group/ordinal/conditional flags retain explicit candidates without runtime inference',async()=>{
  const index=await loadPinnedNativeLootCandidates('/Wand',localFetch().fetcher);
  const table=index.getTable('2090000000');
  assert(table);
  assert.equal(table.tableId,'2090000000');
  assert.equal(table.gameplayContextVerified,false);
  assert.equal(table.groups.length,2);
  assert.deepEqual(table.candidateItemIds,['80000000']);
  const first=index.getGroup(2090000000,0);
  assert(first);
  assert.equal(first.hasDynamicFilters,false);
  assert.equal(first.hasEligibilityGate,false);
  assert.equal(first.guaranteedLoot,false);
  assert.equal(first.candidates.length,1);
  assert.equal(first.candidates[0].itemId,'80000000');
  assert.equal(first.candidates[0].pathId,'loot:2090000000:0:0');
  assert.equal(first.candidates[0].candidateOrdinal,0);
  assert.equal(first.candidates[0].conditionalEntry,false);
  assert.equal(first.candidates[0].routeStatus,'static_candidate_only');
  assert.equal(first.candidates[0].gameplayContextVerified,false);
  assert.equal(first.candidates[0].itemGrantVerified,false);
  const second=index.getGroup(2090000000,1);
  assert(second);
  assert.equal(second.hasDynamicFilters,true);
  assert.equal(second.guaranteedLoot,false);
  assert.equal(second.candidates.length,0);
  assert(index.getItemCandidates('80000000').includes(first.candidates[0]));
  assert.equal(index.getItemStaticOrigins('80000000')[0].originId,
    'native:path:loot:2090000000:0:0');
  const crop=index.getItemCandidates(30200086);
  assert.equal(crop.length,3);
  assert.deepEqual(crop.map(x=>x.tableId),[
    '2090000002','2090000107','2090000130'
  ]);
  const conditional=index.candidates.filter(x=>x.conditionalEntry);
  assert.equal(conditional.length,60);
  assert(conditional.every(x=>x.gameplayContextVerified===false));
  assert(index.tables.some(t=>t.groups.some(g=>g.hasEligibilityGate)));
  assert.equal(index.getTable(2090999999),null);
  assert.equal(index.getGroup(2090000000,50),null);
  assert.deepEqual(index.getItemCandidates(99999999),[]);
  assert.deepEqual(index.getItemStaticOrigins(99999999),[]);
  assert(Object.isFrozen(first)&&Object.isFrozen(first.candidates));
  assert(Object.isFrozen(crop));
});
test('tampered bytes, missing source and invalid IDs fail closed',async()=>{
  await assert.rejects(loadPinnedNativeLootCandidates(
    '/Wand',localFetch({corrupt:true}).fetcher),/DB02_NATIVE_LOOT_SHA/);
  await assert.rejects(loadPinnedNativeLootCandidates(
    '/Wand',localFetch({short:true}).fetcher),/DB02_NATIVE_LOOT_BYTES/);
  await assert.rejects(loadPinnedNativeLootCandidates(
    '/Wand',localFetch({missing:true}).fetcher),/DB02_NATIVE_LOOT_DOWNLOAD_FAILED/);
  await assert.rejects(loadPinnedNativeLootCandidates(
    '/Wand/../private',localFetch().fetcher),/DB02_NATIVE_LOOT_INVALID_BASE_PATH/);
  const index=await loadPinnedNativeLootCandidates('/Wand',localFetch().fetcher);
  assert.throws(()=>index.getItemCandidates('080000000'),/INVALID_ITEM_ID/);
  assert.throws(()=>index.getTable('-3'),/INVALID_ITEM_ID/);
  assert.throws(()=>index.getGroup(2090000000,-1),/INVALID_GROUP_INDEX/);
});
