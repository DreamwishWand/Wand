import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {
  DB02_NATIVE_ACTIVITY_FILE,DB02_NATIVE_ACTIVITY_BYTES,
  DB02_NATIVE_ACTIVITY_SHA256,loadPinnedNativeActivityResults,
  hasPinnedNativeActivityEvidence
} from '../src/lib/acquisition/public-native-activities.ts';

const data=readFileSync(new URL('../static/acquisition/public/'+
  DB02_NATIVE_ACTIVITY_FILE,import.meta.url));
function localFetcher(opt={}){
  const seen=[];
  const fetcher=async url=>{
    seen.push(url);
    assert.equal(url,'/Wand/acquisition/public/'+DB02_NATIVE_ACTIVITY_FILE);
    if(opt.missing)return new Response('missing',{status:404});
    const out=Buffer.from(data);
    if(opt.corrupt)out[50]^=1;
    if(opt.short)return new Response(out.subarray(0,-1),{status:200});
    return new Response(out,{status:200});
  };
  return {seen,fetcher};
}
test('fishing/mining/timebending/growing yield 763 pinned original-source candidate paths for 489 result IDs',async()=>{
  assert.equal(data.length,DB02_NATIVE_ACTIVITY_BYTES);
  assert.equal(createHash('sha256').update(data).digest('hex'),
    DB02_NATIVE_ACTIVITY_SHA256);
  const {seen,fetcher}=localFetcher();
  const index=await loadPinnedNativeActivityResults('/Wand',fetcher);
  assert.equal(seen.length,1);
  assert.equal(index.schema,'wand.db02.native-activity-results@1');
  assert.equal(index.coverage.nativeResultPaths,763);
  assert.equal(index.coverage.fishingPaths,282);
  assert.equal(index.coverage.miningPaths,299);
  assert.equal(index.coverage.timebendingPaths,82);
  assert.equal(index.coverage.growingPaths,100);
  assert.equal(index.coverage.distinctResultItemIds,489);
  assert.equal(index.coverage.activityDataDefinitions,2630);
  assert.equal(index.coverage.activityItemDefinitions,4050);
  assert.equal(index.coverage.contextAvailabilityVerified,false);
  assert.equal(index.coverage.playerUnlockVerified,false);
  assert.equal(index.coverage.staticPathsNotGuaranteedDrops,true);
  assert.equal(index.coverage.allAcquisitionRoutesCovered,false);
  assert.equal(index.paths.length,763);
  assert.equal(index.origins.length,763);
  assert.equal(index.listResultItemIds().length,489);
  assert.equal(index.listResultItemIds('fishing').length,239);
  assert.equal(index.listResultItemIds('mining').length,76);
  assert.equal(index.listResultItemIds('timebending').length,76);
  assert.equal(index.listResultItemIds('farming').length,100);
  assert(hasPinnedNativeActivityEvidence(index));
  assert(!hasPinnedNativeActivityEvidence({...index}));
  assert(Object.isFrozen(index)&&Object.isFrozen(index.coverage)&&
    Object.isFrozen(index.paths)&&Object.isFrozen(index.origins));
  for(const origin of index.origins){
    assert.equal(origin.routeStatus,'confirmed_source_link');
    assert.equal(origin.source.kind,'verified_game_native');
    assert.equal(origin.availability,'not_live_verified');
    assert.equal(origin.price,null);
    assert.equal(origin.campaignId,null);
    assert(index.getItemOrigins(origin.itemId).includes(origin));
    assert(Object.isFrozen(origin));
  }
  assert.deepEqual(index.getItemPaths('99999999'),[]);
  assert.deepEqual(index.getItemOrigins('99999999'),[]);
  assert.equal(index.getDefinitionPath(99999999),null);
  assert.equal(index.getSeedPath(99999999),null);
});
test('native method coordinates and seed yield are exact source data, not player state',async()=>{
  const index=await loadPinnedNativeActivityResults('/Wand',localFetcher().fetcher);
  const fish=index.getDefinitionPath('2050100000');
  assert(fish);
  assert.equal(fish.method,'fishing');
  assert.equal(fish.resultItemId,'31000029');
  assert.equal(fish.resultQuantity,null);
  assert.deepEqual(fish.context,{method:'fishing',areaIds:[6],rarity:4});
  assert.equal(fish.occurrenceGuaranteed,false);
  assert.equal(fish.playerUnlockVerified,false);
  assert.equal(fish.currentAvailabilityVerified,false);
  assert.equal(fish.source.sha256,'2b9be2e95fde793ab081429d8a162b96fb7b927cc14635acee321948e4c04296');
  assert(index.getItemPaths('31000029').includes(fish));
  const mining=index.getDefinitionPath(2050200022);
  assert(mining);
  assert.equal(mining.method,'mining');
  assert.equal(mining.resultItemId,'31600022');
  assert.deepEqual(mining.context,{method:'mining',areaId:0,sceneId:null,rarity:3});
  const bending=index.getDefinitionPath(2050400000);
  assert(bending);
  assert.equal(bending.method,'timebending');
  assert.equal(bending.resultItemId,'80000003');
  assert.equal(bending.resultQuantity,null);
  assert.deepEqual(bending.context,{
    method:'timebending',
    locations:[{areaId:null,sceneId:1540000101},
      {areaId:null,sceneId:1540000000}],
    minHourglassLevel:null,
    amountRange:{min:400,max:500}
  });
  const growing=index.getSeedPath(30400010);
  assert(growing);
  assert.equal(growing.method,'farming');
  assert.equal(growing.pathId,'growing:30400010');
  assert.equal(growing.definitionId,'30400010');
  assert.equal(growing.resultItemId,'30200000');
  assert.equal(growing.resultQuantity,1);
  assert.deepEqual(growing.context,{
    method:'farming',seedItemId:'30400010',
    growthSeconds:900,villageAreaIds:[2]
  });
  assert.equal(growing.source.sha256,'4f4d3393887aececfcef16569cebc8dd7df08d03ba7b7c89083fe15bb7309dc2');
  assert.equal(index.getItemOrigins(30200000).find(x=>x.originId==='native:path:growing:30400010')?.kind,'farming');
  assert(Object.isFrozen(growing.context));
});
test('tampering, unsupported family filters, and invalid IDs fail closed',async()=>{
  await assert.rejects(
    loadPinnedNativeActivityResults('/Wand',localFetcher({corrupt:true}).fetcher),
    /DB02_NATIVE_ACTIVITY_SHA/
  );
  await assert.rejects(
    loadPinnedNativeActivityResults('/Wand',localFetcher({short:true}).fetcher),
    /DB02_NATIVE_ACTIVITY_BYTES/
  );
  await assert.rejects(
    loadPinnedNativeActivityResults('/Wand',localFetcher({missing:true}).fetcher),
    /DB02_NATIVE_ACTIVITY_DOWNLOAD_FAILED/
  );
  await assert.rejects(
    loadPinnedNativeActivityResults('/Wand/../secret',localFetcher().fetcher),
    /DB02_NATIVE_ACTIVITY_INVALID_BASE_PATH/
  );
  const index=await loadPinnedNativeActivityResults('/Wand',localFetcher().fetcher);
  assert.throws(()=>index.getItemPaths('0030200000'),/INVALID_ITEM_ID/);
  assert.throws(()=>index.getSeedPath('not_an_id'),/INVALID_ITEM_ID/);
  assert.throws(()=>index.listResultItemIds('premium_shop'),/INVALID_KIND/);
});
