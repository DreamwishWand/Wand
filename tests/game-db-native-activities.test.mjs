import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openPublicSharedGameSources} from '../src/lib/game-db/public-sources.ts';
import {
  createDb00NativeActivityReader,DB00_NATIVE_ACTIVITY_CONTRACT
} from '../src/lib/game-db/native-activities.ts';

const ROOT=new URL('../static/',import.meta.url);
const ACTIVITY='activity-result-paths-1.26.2.json';
const RECIPE='recipe-results-1.26.2.json';
function fileFetcher(corrupt=false){
  const calls=[];
  const read=async url=>{
    assert(typeof url==='string'&&url.startsWith('/Wand/')&&!url.includes('..'));
    calls.push(url);
    let bytes;
    try{bytes=readFileSync(new URL(url.slice(6),ROOT));}
    catch{return new Response('not found',{status:404});}
    if(corrupt&&url.endsWith('/'+ACTIVITY)){
      bytes=Buffer.from(bytes);bytes[50]^=1;
    }
    return new Response(bytes,{status:200});
  };
  return {calls,read};
}
let cached;
const open=()=>cached??=openPublicSharedGameSources('/Wand',fileFetcher().read);

test('DB-00 Activity path reader lazily shares exact SHA-verified 763 paths and keeps baseline routes unchanged',async()=>{
  const {calls,read}=fileFetcher();
  const app=await openPublicSharedGameSources('/Wand',read);
  const startup=calls.length;
  assert(startup>0);
  assert.equal(calls.filter(url=>url.endsWith('/'+ACTIVITY)).length,0);
  const original=app.getItem('31000029');
  const reader=await app.loadNativeActivitySources();
  assert.equal(reader,await app.loadNativeActivitySources());
  assert.equal(reader.contract,DB00_NATIVE_ACTIVITY_CONTRACT);
  assert.equal(reader.snapshotId,app.snapshotId);
  assert.equal(reader.sourcePaths,763);
  assert.equal(reader.distinctResultItemIds,489);
  assert.equal(reader.originalSourceOnly,true);
  assert.equal(reader.actualOccurrenceGuaranteed,false);
  assert.equal(reader.playerOwnershipVerified,false);
  assert.equal(calls.length,startup+1);
  assert.equal(calls.filter(url=>url.endsWith('/'+ACTIVITY)).length,1);
  const db02=await app.acquisition.loadNativeActivityResults();
  assert.equal(db02.coverage.nativeResultPaths,763);
  assert.equal(calls.length,startup+1);
  assert.deepEqual(app.getItem('31000029').origins,original.origins);
  assert.equal(app.acquisition.coverage.combinedSourceRoutes,1255);
  assert(Object.isFrozen(reader));
});

test('DB-00 reverse joins fishing, mining, timebending and farming with exact contexts and no ownership claims',async()=>{
  const app=await open();
  const reader=await app.loadNativeActivitySources();
  const fish=reader.getDefinitionPath(2050100000);
  assert(fish);
  assert.equal(fish.sourcePath.method,'fishing');
  assert.equal(fish.sourcePath.resultItemId,'31000029');
  assert.deepEqual(fish.sourcePath.context,{
    method:'fishing',areaIds:[6],rarity:4
  });
  assert.equal(fish.result.itemId,'31000029');
  assert.deepEqual(fish.result.item,app.getItem('31000029'));
  assert(fish.result.sourcePaths.includes(fish.sourcePath));
  assert(fish.result.sourcePathOrigins.some(x=>
    x.originId==='native:path:fishing:2050100000' &&
    x.availability==='not_live_verified'));
  assert.equal(fish.result.actualOccurrenceGuaranteed,false);
  assert.equal(fish.result.playerUnlockVerified,false);
  assert.equal(fish.result.collectionUiMembershipVerified,false);
  assert.equal(fish.sourceConfigurationOnly,true);
  const mining=reader.getDefinitionPath('2050200022');
  assert(mining);
  assert.equal(mining.sourcePath.method,'mining');
  assert.deepEqual(mining.sourcePath.context,{
    method:'mining',areaId:0,sceneId:null,rarity:3
  });
  const bend=reader.getDefinitionPath(2050400000);
  assert(bend);
  assert.equal(bend.sourcePath.method,'timebending');
  assert.deepEqual(bend.sourcePath.context,{
    method:'timebending',
    locations:[{areaId:null,sceneId:1540000101},
      {areaId:null,sceneId:1540000000}],
    minHourglassLevel:null,amountRange:{min:400,max:500}
  });
  const grown=reader.getSeedPath('30400010');
  assert(grown);
  assert.equal(grown.sourcePath.method,'farming');
  assert.equal(grown.sourcePath.resultItemId,'30200000');
  assert.equal(grown.sourcePath.resultQuantity,1);
  assert.deepEqual(grown.sourcePath.context,{
    method:'farming',seedItemId:'30400010',
    growthSeconds:900,villageAreaIds:[2]
  });
  assert.equal(reader.getSeedPath('99999999'),null);
  assert.equal(reader.getDefinitionPath('99999999'),null);
  assert.deepEqual(reader.getItem('99999999').sourcePaths,[]);
  assert(Object.isFrozen(fish)&&Object.isFrozen(fish.result));
});

test('DB-00 source Activity search keeps all 489 IDs, all 763 definitions and independently verified method counts',async()=>{
  const app=await open();
  const reader=await app.loadNativeActivitySources();
  const db02=await app.acquisition.loadNativeActivityResults();
  const results=[];
  for(let offset=0;;){
    const page=reader.search({offset,limit:137});
    assert.equal(page.scope,'original_activity_result_paths_only');
    assert.equal(page.currentAvailabilityVerified,false);
    assert.equal(page.actualOccurrenceGuaranteed,false);
    assert.equal(page.playerOwnershipVerified,false);
    assert.equal(page.collectionUiMembershipVerified,false);
    results.push(...page.items);
    if(page.nextOffset===null)break;
    assert(page.nextOffset>offset);
    offset=page.nextOffset;
  }
  assert.equal(results.length,489);
  assert.equal(new Set(results.map(r=>r.itemId)).size,489);
  assert.deepEqual(results.map(r=>r.itemId),db02.listResultItemIds());
  assert.equal(results.reduce((n,r)=>n+r.sourcePaths.length,0),763);
  for(const [method,total] of [
    ['fishing',239],['mining',76],['timebending',76],['farming',100]
  ]){
    const page=reader.search({method,limit:500});
    assert.equal(page.total,total);
    assert.equal(page.items.length,total);
    assert(page.items.every(item=>
      item.sourcePaths.some(path=>path.method===method)));
    assert.deepEqual(page.items.map(item=>item.itemId),
      db02.listResultItemIds(method));
  }
  const published=reader.search({publishedOnly:true});
  assert(published.total>0&&published.total<=489);
  assert(published.items.every(row=>row.item.catalog!==null));
  assert(reader.search({text:'31000029'}).items.some(row=>
    row.itemId==='31000029'));
  assert.equal(reader.search({text:'zz_not_a_game_item_zz'}).total,0);
  assert.throws(()=>reader.search({method:'premium_shop'}),/INVALID_METHOD/);
  assert.throws(()=>reader.search({publishedOnly:false}),/INVALID_PUBLISHED_FILTER/);
  assert.throws(()=>reader.search({locale:'ko'}),/INVALID_LOCALE/);
  assert.throws(()=>reader.search({limit:501}),/INVALID_PAGE/);
  assert.throws(()=>reader.search({offset:-1}),/INVALID_PAGE/);
  assert.throws(()=>reader.search({text:'bad\nname'}),/INVALID_TEXT/);
  assert.throws(()=>reader.getItem('031000029'),/invalid numeric Item ID/);
});

test('DB-00 combined native acquisition reads two lazy source files once, never merges static paths with live origins',async()=>{
  const {calls,read}=fileFetcher();
  const app=await openPublicSharedGameSources('/Wand',read);
  const base=calls.length;
  assert(!calls.some(url=>url.endsWith('/'+ACTIVITY)||
    url.endsWith('/'+RECIPE)));
  const combined=await app.getNativeAcquisitionEvidence('40001082');
  assert.equal(calls.length,base+2);
  assert.equal(calls.filter(url=>url.endsWith('/'+ACTIVITY)).length,1);
  assert.equal(calls.filter(url=>url.endsWith('/'+RECIPE)).length,1);
  assert.equal(combined.itemId,'40001082');
  assert.deepEqual(combined.shared,app.getItem('40001082'));
  assert.equal(combined.recipes.itemId,combined.itemId);
  assert.equal(combined.activities.itemId,combined.itemId);
  assert(combined.recipes.recipes.some(recipe=>
    recipe.recipeId==='2050300000'));
  assert.equal(combined.nativeResultDefinitionCount,
    combined.recipes.recipes.length+combined.activities.sourcePaths.length);
  assert.equal(combined.staticSourceOnly,true);
  assert.equal(combined.acquisitionRouteCoverageComplete,false);
  assert.equal(combined.currentAvailabilityVerified,false);
  assert.equal(combined.playerOwnershipVerified,false);
  assert.equal(combined.collectionUiMembershipVerified,false);
  assert.equal(combined.shared.catalog?.facts.acquisition.state,'unverified');
  const fish=await app.getNativeAcquisitionEvidence(31000029);
  assert(fish.activities.sourcePaths.some(path=>
    path.definitionId==='2050100000'));
  assert.equal(calls.length,base+2);
  assert.equal(await app.loadNativeRecipeSources() instanceof Object,true);
  assert.equal(await app.loadNativeActivitySources() instanceof Object,true);
  assert(Object.isFrozen(combined));
  await assert.rejects(app.getNativeAcquisitionEvidence('not-an-id'),
    /invalid numeric Item ID/);
  assert.equal(calls.length,base+2);
});

test('DB-00 rejects fabricated Activity index and fails closed on tampered optional source bytes',async()=>{
  const app=await open();
  const upstream=await app.acquisition.loadNativeActivityResults();
  assert.throws(()=>createDb00NativeActivityReader(app.database,app.joined,{
    ...upstream,coverage:{...upstream.coverage}
  }),/PINNED_DB02_ACTIVITY_SOURCE_REQUIRED/);
  const {calls,read}=fileFetcher(true);
  const fresh=await openPublicSharedGameSources('/Wand',read);
  await assert.rejects(fresh.loadNativeActivitySources(),
    /DB02_NATIVE_ACTIVITY_SHA/);
  await assert.rejects(fresh.getNativeAcquisitionEvidence('31000029'),
    /DB02_NATIVE_ACTIVITY_SHA/);
  assert.equal(calls.filter(url=>url.endsWith('/'+ACTIVITY)).length,1);
  assert.equal(fresh.database.itemCount,13202);
});
