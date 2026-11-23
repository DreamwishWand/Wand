import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadPublicSourceCatalog} from '../src/lib/acquisition/public-source-catalog.ts';
import {
  indexStaticCandidateItemSources,indexAllOriginalItemSources,
  DB02_STATIC_CANDIDATE_SOURCE_BROWSER_SCHEMA,
  DB02_ALL_ORIGINAL_SOURCE_BROWSER_SCHEMA,
  hasPinnedStaticCandidateItemSourceEvidence
} from '../src/lib/acquisition/item-source-browser.ts';

const STATIC=new URL('../static/',import.meta.url);
function localFetcher(){
  const calls=[];
  const fetcher=async url=>{
    assert(url.startsWith('/Wand/')&&!url.includes('..'),url);
    calls.push(url);
    try{
      return new Response(readFileSync(new URL(url.slice(6),STATIC)),{status:200});
    }catch{return new Response('missing',{status:404});}
  };
  return {calls,fetcher};
}

test('4239 SHA-pinned original static candidates are globally searchable but never promoted to actual grants',async()=>{
  const {calls,fetcher}=localFetcher();
  const catalog=await loadPublicSourceCatalog('/Wand',fetcher);
  const before=calls.length;
  assert.equal(before,26);
  const promise=catalog.loadStaticCandidateItemSources();
  assert.equal(promise,catalog.loadStaticCandidateItemSources());
  const staticRows=await promise;
  assert.equal(calls.length,before+1,'only original LootTable projection is not already cached');
  assert.equal(calls.filter(x=>x.endsWith('native-loot-candidates-1.26.2.json')).length,1);
  assert.equal(staticRows.candidateSchema,DB02_STATIC_CANDIDATE_SOURCE_BROWSER_SCHEMA);
  assert.equal(staticRows.gameVersion,'1.26.2');
  assert.equal(staticRows.staticCandidatesOnly,true);
  assert.equal(staticRows.actualAcquisitionVerified,false);
  assert.equal(staticRows.gameplayContextVerified,false);
  assert.equal(staticRows.playerOwnershipVerified,false);
  assert.equal(staticRows.sourceEvidenceOnly,true);
  assert.equal(staticRows.originCoverageComplete,false);
  assert.equal(staticRows.liveAvailabilityVerified,false);
  assert.equal(staticRows.coverage.lootTableCandidateRows,3804);
  assert.equal(staticRows.coverage.staticContainerTemplateRows,146);
  assert.equal(staticRows.coverage.defaultInventoryDefinitionRows,289);
  assert.equal(staticRows.coverage.totalCandidateRelations,4239);
  assert.equal(staticRows.coverage.guaranteedDropsVerified,0);
  assert.equal(staticRows.coverage.currentAvailabilityVerified,false);
  assert.equal(staticRows.coverage.scopeOrExclusivityVerified,false);
  assert.equal(staticRows.query().totalOriginRelations,4239);
  assert.equal(staticRows.query({routeStatuses:['static_candidate_only']}).totalOriginRelations,4239);
  assert.equal(staticRows.query({routeStatuses:['confirmed_source_link']}).totalOriginRelations,0);
  assert.equal(staticRows.query({sourceKinds:['verified_game_native']}).totalOriginRelations,4239);
  assert.equal(staticRows.query({sourceIds:['src02:steam1262:loot-table']}).totalOriginRelations,3804);
  assert.equal(staticRows.query({sourceIds:['db02:native:steam-1262:container-template']}).totalOriginRelations,146);
  assert.equal(staticRows.query({sourceIds:['db02:static:default-inventories:steam-1262']}).totalOriginRelations,289);
  assert.equal(staticRows.originKindCounts.reduce((sum,c)=>sum+c.sourceRelations,0),4239);
  assert.equal(staticRows.getKindItemIds('premium_shop').length,0);
  assert.equal(staticRows.getKindItemIds('other').length,288);
  assert(staticRows.getKindItemIds('loot').length>=1100);
  assert.deepEqual(staticRows.knownLinkedItemIds,
    [...staticRows.knownLinkedItemIds].sort((a,b)=>Number(a)-Number(b)));
  assert(Object.isFrozen(staticRows));
  assert(Object.isFrozen(staticRows.coverage));
  assert(Object.isFrozen(staticRows.knownLinkedItemIds));
  assert(hasPinnedStaticCandidateItemSourceEvidence(staticRows));
  assert(!hasPinnedStaticCandidateItemSourceEvidence({...staticRows}));
  assert.equal(catalog.itemSources.query().totalOriginRelations,1255);
});

test('known original LootTable, container and default template entries preserve their precise source and candidate status',async()=>{
  const catalog=await loadPublicSourceCatalog('/Wand',localFetcher().fetcher);
  const [browser,loot]=await Promise.all([
    catalog.loadStaticCandidateItemSources(),catalog.loadNativeLootCandidates()
  ]);
  const sourceLoot=loot.getItemStaticOrigins('80000000')[0];
  assert(sourceLoot?.originId.startsWith('native:path:loot:'));
  assert(browser.getItem('80000000').staticCandidates.includes(sourceLoot));
  assert(browser.getItem('80000000').confirmedSourceLinks.length===0);
  const container=catalog.staticContainerSource.origins[0];
  assert(browser.getItem(container.itemId).staticCandidates.includes(container));
  assert.equal(container.routeStatus,'static_candidate_only');
  const firstDefault=catalog.defaultInventorySource.origins[0];
  assert(browser.getItem(firstDefault.itemId).staticCandidates.includes(firstDefault));
  assert.equal(firstDefault.kind,'other');
  const home=browser.getItem('31500006').origins.filter(x=>
    x.originId.startsWith('db02:default-inventory:HomeStorage:'));
  assert.equal(home.length,2,'duplicate configured HomeStorage slots remain distinct');
  assert(home.every(x=>x.routeStatus==='static_candidate_only'));
  assert(browser.getItem('999999999').origins.length===0);
  assert.throws(()=>browser.getItem('00080000000'),/INVALID_ITEM_ID/);
  assert.throws(()=>browser.query({kinds:['unknown']}),/INVALID_KINDS/);
  assert.throws(()=>browser.query({}, {limit:501}),/INVALID_PAGE_RANGE/);
});

test('single all-original browse indexes 8200 relations preserving route status, source IDs and pagination',async()=>{
  const {calls,fetcher}=localFetcher();
  const catalog=await loadPublicSourceCatalog('/Wand',fetcher);
  const start=calls.length;
  const p=catalog.loadAllOriginalItemSources();
  assert.equal(p,catalog.loadAllOriginalItemSources());
  const union=await p;
  assert.equal(calls.length,start+3,'loot, recipe and activity are the only optional assets');
  assert.equal(union.combinedSchema,DB02_ALL_ORIGINAL_SOURCE_BROWSER_SCHEMA);
  assert.equal(union.gameVersion,'1.26.2');
  assert.deepEqual([
    union.coverage.baselinePublishedRoutes,
    union.coverage.nativeRecipeAndActivityRoutes,
    union.coverage.originalSourceRelations,
    union.coverage.staticCandidateRelations,
    union.coverage.combinedSourceRelations
  ],[1255,2706,3961,4239,8200]);
  assert.equal(union.coverage.actualLootGrantedVerified,false);
  assert.equal(union.coverage.completeAcquisitionCoverage,false);
  assert.equal(union.coverage.currentAvailabilityVerified,false);
  assert.equal(union.coverage.playerOwnershipVerified,false);
  assert.equal(union.query().totalOriginRelations,8200);
  assert.equal(union.knownLinkedItemIds.length,union.coverage.distinctReferencedItemIds);
  assert.equal(union.originKindCounts.reduce((n,x)=>n+x.sourceRelations,0),8200);
  assert.equal(union.getKindItemIds('premium_shop').length,
    catalog.itemSources.getKindItemIds('premium_shop').length);
  assert(union.getItem('40001082').origins.some(x=>
    x.originId==='native:recipe:2050300000'&&
    x.routeStatus==='confirmed_source_link'));
  assert(union.getItem('80000000').origins.some(x=>
    x.originId.startsWith('native:path:loot:')&&
    x.routeStatus==='static_candidate_only'));
  assert(union.getItem('31500006').origins.some(x=>
    x.originId.startsWith('db02:default-inventory:')&&
    x.routeStatus==='static_candidate_only'));
  assert.equal(union.query({sourceIds:['src02:steam1262:loot-table']}).totalOriginRelations,3804);
  assert.equal(union.query({kinds:['crafting']}).totalOriginRelations,1318);
  const staticPage=union.query({
    routeStatuses:['static_candidate_only'],
    sourceIds:['db02:static:default-inventories:steam-1262']
  },{offset:10,limit:13});
  assert.equal(staticPage.totalOriginRelations,289);
  assert.equal(staticPage.items.length,13);
  assert.equal(staticPage.offset,10);
  assert(staticPage.items.every(item=>item.origins.every(o=>
    o.routeStatus==='static_candidate_only'&&
    o.source.sourceId==='db02:static:default-inventories:steam-1262')));
  assert(Object.isFrozen(union));
  assert(Object.isFrozen(union.coverage));
  assert.equal(catalog.coverage.combinedSourceRoutes,1255);
  assert.equal(catalog.itemSources.query().totalOriginRelations,1255);
  const same=await catalog.loadExpandedNativeItemSources();
  assert.equal(same.query().totalOriginRelations,3961);
  assert.equal(calls.length,start+3,'other original source clients reuse the same public assets');
});

test('lookupWithOriginalSourceEvidence is item-based and does not alter established acquisition or distribution scopes',async()=>{
  const {calls,fetcher}=localFetcher();
  const catalog=await loadPublicSourceCatalog('/Wand',fetcher);
  const before=calls.length;
  const old=catalog.lookup('80000000');
  const joined=await catalog.lookupWithOriginalSourceEvidence('80000000');
  assert.equal(joined.originalSourceEvidenceLoaded,true);
  assert.equal(joined.itemId,old.itemId);
  assert.deepEqual(joined.origins,old.origins);
  assert(joined.originalSourceEvidence.origins.some(x=>x.originId.startsWith('native:path:loot:')));
  assert(Object.isFrozen(joined));
  assert(Object.isFrozen(joined.originalSourceEvidence));
  const scopes=await catalog.loadDistributionScopes();
  assert.equal(scopes.coverage.indexedOriginalSourceRoutes,3961);
  assert.equal(scopes.coverage.existingSourceOriginRoutes,1255);
  assert(scopes.getItem('80000000').evidence.every(e=>
    e.evidenceKind!=='configured_item_origin'||
    !e.relation.originId.startsWith('native:path:loot:')),
    'candidate table records cannot fabricate ordinary gameplay acquisition');
  assert.equal(calls.length,before+5,'two metadata sources plus three optional native sources');
  const another=await catalog.lookupWithOriginalSourceEvidence('40001082');
  assert(another.originalSourceEvidence.origins.some(x=>x.kind==='crafting'));
  assert.equal(calls.length,before+5);
});

test('spoofed original candidate assets or an unbranded candidate view fail closed',async()=>{
  const catalog=await loadPublicSourceCatalog('/Wand',localFetcher().fetcher);
  const [loot,original,candidates]=await Promise.all([
    catalog.loadNativeLootCandidates(),
    catalog.loadExpandedNativeItemSources(),
    catalog.loadStaticCandidateItemSources()
  ]);
  const container=catalog.staticContainerSource;
  const defaults=catalog.defaultInventorySource;
  assert.throws(()=>indexStaticCandidateItemSources({...loot},container,defaults),
    /PINNED_CANDIDATE_SOURCE_REQUIRED/);
  assert.throws(()=>indexStaticCandidateItemSources(loot,{...container},defaults),
    /PINNED_CANDIDATE_SOURCE_REQUIRED/);
  assert.throws(()=>indexStaticCandidateItemSources(loot,container,{...defaults}),
    /PINNED_CANDIDATE_SOURCE_REQUIRED/);
  assert.throws(()=>indexAllOriginalItemSources({...original},candidates),
    /PINNED_COMBINED_SOURCE_REQUIRED/);
  assert.throws(()=>indexAllOriginalItemSources(original,{...candidates}),
    /PINNED_COMBINED_SOURCE_REQUIRED/);
});
