import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadPublicSourceCatalog}
  from '../src/lib/acquisition/public-source-catalog.ts';
import {
  DB02_NATIVE_LOOT_CONTEXT_SEARCH_SCHEMA,indexNativeLootContexts
} from '../src/lib/acquisition/native-loot-context-search.ts';

const STATIC=new URL('../static/',import.meta.url);
function local(){
  const calls=[];
  return {calls,fetcher:async url=>{
    assert(url.startsWith('/Wand/')&&!url.includes('..'),url);
    calls.push(url);
    try{return new Response(readFileSync(
      new URL(url.slice(6),STATIC)),{status:200});
    }catch{return new Response('not found',{status:404});}
  }};
}

test('all 3804 original LootTable candidate paths are linked to exact native name, object and stall references once',async()=>{
  const {calls,fetcher}=local();
  const catalog=await loadPublicSourceCatalog('/Wand',fetcher);
  assert.equal(calls.length,26);
  const p=catalog.loadNativeLootContexts();
  assert.equal(catalog.loadNativeLootContexts(),p);
  const context=await p;
  assert.equal(calls.length,31,'loot, recipe, activity, names and stalls load only on demand');
  assert.equal(new Set(calls).size,calls.length);
  assert.equal(context.schema,DB02_NATIVE_LOOT_CONTEXT_SEARCH_SCHEMA);
  assert.equal(context.gameVersion,'1.26.2');
  assert.equal(context.staticReferenceEvidenceOnly,true);
  assert.equal(context.coverage.originalSourceRelations,8200);
  assert.equal(context.coverage.originalLootTableCandidatePaths,3804);
  assert.equal(context.coverage.nativeLootTableNameRecords,960);
  assert.equal(context.coverage.nativeObjectTableReferences,375);
  assert.equal(context.coverage.nativeStallDefinitions,65);
  assert.equal(context.coverage.originalObjectCandidateEdges,698);
  assert.equal(context.coverage.originalStallSlotCandidateEdges,1385);
  assert.equal(context.coverage.distinctLootCandidateItemIds,1100);
  assert.equal(context.coverage.verifiedGameplayAcquisitionLinks,0);
  assert.equal(context.coverage.guaranteedDropsVerified,0);
  assert.equal(context.coverage.currentAvailabilityVerified,false);
  assert.equal(context.coverage.liveShopStockVerified,false);
  assert.equal(context.coverage.playerOwnershipVerified,false);
  assert.equal(context.coverage.lootPathsWithNoKnownReferrer+
    context.coverage.lootPathsWithAnyKnownReferrer,3804);
  assert(context.coverage.lootPathsWithObjectReference>0);
  assert(context.coverage.lootPathsWithStallReference>0);
  assert(context.coverage.lootPathsWithAnyKnownReferrer<3804);
  assert.equal(context.knownLootCandidateItemIds.length,1100);
  assert.equal(context.listItemIds().length,1100);
  assert.deepEqual(context.knownLootCandidateItemIds,
    [...context.knownLootCandidateItemIds].sort((a,b)=>Number(a)-Number(b)));
  const all=context.query({},{limit:500});
  assert.equal(all.totalLootCandidatePaths,3804);
  assert.equal(all.totalObjectReferenceEdges,698);
  assert.equal(all.totalStallSlotReferenceEdges,1385);
  assert.equal(all.totalItemIds,1100);
  assert.equal(all.items.length,500);
  assert.equal(all.hasMore,true);
  assert.equal(all.actualAcquisitionVerified,false);
  assert.equal(all.currentAvailabilityVerified,false);
  assert(Object.isFrozen(context));
  assert(Object.isFrozen(context.coverage));
  assert(Object.isFrozen(context.knownLootCandidateItemIds));
  assert(Object.isFrozen(all));
  assert(Object.isFrozen(all.items));
});

test('ActivityItem and Furniture Item ID referrers remain exact original definitions, not verified drops',async()=>{
  const catalog=await loadPublicSourceCatalog('/Wand',local().fetcher);
  const ctx=await catalog.loadNativeLootContexts();
  const item=ctx.getItem('31700017');
  const origin=item.paths.find(x=>x.lootPathId==='loot:2090000003:0:0');
  assert(origin);
  assert.equal(origin.nativeTableName.originalKeyVerified,true);
  assert.equal(origin.nativeTableName.gameplayAcquisitionContextVerified,false);
  assert.equal(origin.nativeNameOnlyNotGameplayContext,true);
  assert.equal(origin.routeStatus,'static_candidate_only');
  assert(origin.objectReferences.some(x=>
    x.sourceObjectItemId==='31300003'&&
    x.sourceFamily==='ActivityItem'&&
    x.sourceWirePath==='protobuf.9'&&
    x.lootTableId==='2090000003'&&
    x.objectTableReferenceVerified===true&&
    x.actualDropVerified===false));
  assert(item.originalSourceEvidence.staticCandidates.includes(origin.originalCandidateOrigin));
  assert.equal(origin.actualDropVerified,false);
  assert.equal(origin.liveShopStockVerified,false);
  assert.equal(item.actualAcquisitionVerified,false);
  assert(Object.isFrozen(item)&&Object.isFrozen(item.paths));
  const refs=ctx.query({
    sourceObjectItemId:'31300003',sourceObjectFamily:'ActivityItem'
  });
  assert.equal(refs.totalLootCandidatePaths,4);
  assert.equal(refs.totalItemIds,4);
  assert(refs.items.some(x=>x.itemId==='31700017'));
  assert(refs.items.every(x=>x.paths.every(path=>
    path.objectReferences.some(x=>
      x.sourceObjectItemId==='31300003'&&x.sourceFamily==='ActivityItem'))));
  const furniture=ctx.query({sourceObjectItemId:'40600000',sourceObjectFamily:'Furniture'});
  assert(furniture.totalLootCandidatePaths>0);
  assert(furniture.items.every(row=>row.paths.every(path=>
    path.objectReferences.some(x=>x.sourceFamily==='Furniture'&&
      x.sourceObjectItemId==='40600000'))));
  assert.equal(ctx.query({sourceObjectItemId:'31300003',
    sourceObjectFamily:'Furniture'}).totalLootCandidatePaths,0);
  assert.equal(ctx.query({sourceObjectItemId:'31300003',
    lootTableId:'2090000000'}).totalLootCandidatePaths,0);
});

test('original stall slot associations support reverse Item search without simulating current stock or prices',async()=>{
  const catalog=await loadPublicSourceCatalog('/Wand',local().fetcher);
  const ctx=await catalog.loadNativeLootContexts();
  const result=ctx.getItem('30200000');
  assert(result.paths.some(path=>path.stallReferences.some(x=>
    x.stallId==='20100000'&&x.slotIndex===1&&
    x.shopDataKey==='GardeningStall'&&
    x.itemInReferencedLootTableVerified===true&&
    x.liveStockVerified===false&&
    x.livePriceVerified===false&&
    x.purchaseEligibilityVerified===false)));
  const listing=ctx.query({
    stallId:'20100000',shopDataKey:'GardeningStall'
  },{limit:500});
  assert(listing.totalLootCandidatePaths>0);
  assert(listing.items.some(item=>item.itemId==='30200000'));
  assert(listing.items.every(item=>item.paths.every(path=>
    path.stallReferences.some(ref=>
      ref.stallId==='20100000'&&ref.shopDataKey==='GardeningStall'))));
  assert.equal(listing.currentAvailabilityVerified,false);
  const wrong=ctx.query({stallId:'20100000',shopDataKey:'NoSuchStall'});
  assert.equal(wrong.totalLootCandidatePaths,0);
  const names=ctx.query({lootTableId:'2090000000',nativeSourceFamily:'Chest'});
  assert.equal(names.totalLootCandidatePaths,1);
  assert.equal(names.items[0].itemId,'80000000');
  assert.equal(names.items[0].paths[0].nativeTableName.nativeNameKey,'Chest!LootPresent1');
});

test('filters operate on a single original LootTable candidate path and preserve candidate-only provenance',async()=>{
  const catalog=await loadPublicSourceCatalog('/Wand',local().fetcher);
  const ctx=await catalog.loadNativeLootContexts();
  const objects=ctx.query({reference:'object'});
  const shops=ctx.query({reference:'stall'});
  const linked=ctx.query({reference:'either'});
  const unlinked=ctx.query({reference:'unlinked'});
  assert.equal(linked.totalLootCandidatePaths+unlinked.totalLootCandidatePaths,3804);
  assert(objects.totalLootCandidatePaths<=698);
  assert(shops.totalLootCandidatePaths<=1385);
  assert(objects.totalLootCandidatePaths<=linked.totalLootCandidatePaths);
  assert(shops.totalLootCandidatePaths<=linked.totalLootCandidatePaths);
  assert.equal(objects.totalLootCandidatePaths,ctx.coverage.lootPathsWithObjectReference);
  assert.equal(shops.totalLootCandidatePaths,ctx.coverage.lootPathsWithStallReference);
  assert.equal(linked.totalLootCandidatePaths,ctx.coverage.lootPathsWithAnyKnownReferrer);
  assert.equal(unlinked.totalLootCandidatePaths,ctx.coverage.lootPathsWithNoKnownReferrer);
  for(const kind of ['any','object','stall','either','unlinked']){
    const ids=ctx.listItemIds(kind);
    assert(Object.isFrozen(ids));
    assert(ids.every(id=>ctx.getItem(id).itemId===id));
  }
  assert.equal(ctx.listItemIds('object').length,objects.totalItemIds);
  assert.equal(ctx.listItemIds('stall').length,shops.totalItemIds);
  assert.equal(ctx.listItemIds('unlinked').length,unlinked.totalItemIds);
  const page=ctx.query({reference:'stall'},{offset:5,limit:12});
  assert.equal(page.offset,5);
  assert.equal(page.limit,12);
  assert.equal(page.items.length,12);
  assert(page.items.every(item=>item.paths.every(path=>
    path.routeStatus==='static_candidate_only'&&
    path.stallReferences.length>0&&path.actualDropVerified===false)));
  assert.equal(ctx.getItem('999999999').paths.length,0);
  assert.equal(ctx.getItem('999999999').unknownBecauseNoLootTableReference,true);
  assert.equal(ctx.getItem('40001082').originalSourceEvidence.origins.some(
    x=>x.originId==='native:recipe:2050300000'),true);
  assert.equal(catalog.coverage.combinedSourceRoutes,1255);
  assert.equal((await catalog.loadDistributionScopes()).coverage.indexedOriginalSourceRoutes,3961);
});

test('catalog caches contextual original source joins and single-Item lookups without extra fetching',async()=>{
  const {fetcher,calls}=local();
  const catalog=await loadPublicSourceCatalog('/Wand',fetcher);
  const before=calls.length;
  const merged=await catalog.lookupWithNativeLootContexts('31700017');
  assert.equal(merged.itemId,'31700017');
  assert.equal(merged.nativeLootContextsLoaded,true);
  assert.equal(merged.nativeLootContexts.itemId,'31700017');
  assert(merged.nativeLootContexts.paths.length>0);
  assert.equal(merged.actualDropVerified,false);
  assert.equal(merged.liveStallStockVerified,false);
  assert.equal(calls.length,before+5);
  const source=await catalog.loadNativeLootContexts();
  assert.equal(source.getItem('31700017').paths,
    merged.nativeLootContexts.paths);
  const second=await catalog.lookupWithNativeLootContexts('30200000');
  assert(second.nativeLootContexts.paths.some(x=>x.stallReferences.length>0));
  await Promise.all([
    catalog.loadNativeLootCandidates(),catalog.loadNativeLootNames(),
    catalog.loadNativeStallSources(),catalog.loadNamedNativeLootSources(),
    catalog.loadNativeObjectLootSources(),catalog.loadAllOriginalItemSources()
  ]);
  assert.equal(calls.length,before+5,'all consumers share original assets');
  assert(Object.isFrozen(merged));
  assert(Object.isFrozen(merged.nativeLootContexts));
  assert(Object.isFrozen(second));
});

test('unverified, unbranded or tampered source browser cannot create an original referrer join',async()=>{
  const catalog=await loadPublicSourceCatalog('/Wand',local().fetcher);
  const [all,loot,names,stalls]=await Promise.all([
    catalog.loadAllOriginalItemSources(),catalog.loadNativeLootCandidates(),
    catalog.loadNativeLootNames(),catalog.loadNativeStallSlots()
  ]);
  const mk=(a,b,c,d)=>indexNativeLootContexts(a,b,c,d);
  assert.throws(()=>mk({...all},loot,names,stalls),/PINNED_SOURCE_REQUIRED/);
  assert.throws(()=>mk(all,{...loot},names,stalls),/PINNED_SOURCE_REQUIRED/);
  assert.throws(()=>mk(all,loot,{...names},stalls),/PINNED_SOURCE_REQUIRED/);
  assert.throws(()=>mk(all,loot,names,{...stalls}),/PINNED_SOURCE_REQUIRED/);
  const ctx=mk(all,loot,names,stalls);
  assert.throws(()=>ctx.getItem('031700017'),/INVALID_ITEM_ID/);
  assert.throws(()=>ctx.query({reference:'verified_live_drop'}),/INVALID_REFERENCE_FILTER/);
  assert.throws(()=>ctx.query({nativeSourceFamily:'bad family'}),/INVALID_NATIVE_FAMILY/);
  assert.throws(()=>ctx.query({sourceObjectFamily:'Building'}),/INVALID_OBJECT_FAMILY/);
  assert.throws(()=>ctx.query({stallId:0}),/INVALID_ITEM_ID/);
  assert.throws(()=>ctx.query({}, {limit:501}),/INVALID_PAGE/);
  assert.throws(()=>ctx.listItemIds('complete'),/INVALID_REFERENCE_FILTER/);
});
