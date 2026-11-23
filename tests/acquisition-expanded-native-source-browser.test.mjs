import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadPublicSourceCatalog}
  from '../src/lib/acquisition/public-source-catalog.ts';
import {
  indexExpandedNativeItemSourceBrowser,
  DB02_NATIVE_EXPANDED_SOURCE_BROWSER_SCHEMA
} from '../src/lib/acquisition/item-source-browser.ts';

const STATIC=new URL('../static/',import.meta.url);
function publicFetcher(){
  const requests=[];
  return {requests,fetcher:async url=>{
    assert(url.startsWith('/Wand/')&&!url.includes('..'),url);
    requests.push(url);
    try{
      return new Response(readFileSync(
        new URL(url.slice('/Wand/'.length),STATIC)),{status:200});
    }catch{return new Response('not found',{status:404});}
  }};
}

test('opt-in source browser indexes 3961 exact native recipe, activity and existing published routes without inventing acquisition',async()=>{
  const {requests,fetcher}=publicFetcher();
  const catalog=await loadPublicSourceCatalog('/Wand',fetcher);
  const startup=requests.length;
  assert.equal(startup,26);
  assert.equal(catalog.itemSources.query().totalOriginRelations,1255);
  assert.equal(requests.some(x=>x.endsWith('/recipe-results-1.26.2.json')),false);
  assert.equal(requests.some(x=>x.endsWith('/activity-result-paths-1.26.2.json')),false);
  const a=catalog.loadExpandedNativeItemSources();
  const b=catalog.loadExpandedNativeItemSources();
  assert.equal(a,b,'the two source assets must be fetched only once');
  const expanded=await a;
  assert.equal(requests.length,startup+2);
  assert.equal(new Set(requests).size,requests.length);
  assert.equal(expanded.nativeExpansionSchema,DB02_NATIVE_EXPANDED_SOURCE_BROWSER_SCHEMA);
  assert.equal(expanded.gameVersion,'1.26.2');
  assert.equal(expanded.coverage.baselineLedgerSourceRoutes,1255);
  assert.equal(expanded.coverage.originalRecipeDefinitionRoutes,1943);
  assert.equal(expanded.coverage.originalActivityResultRoutes,763);
  assert.equal(expanded.coverage.combinedSourceRoutes,3961);
  assert.equal(expanded.coverage.currentAvailabilityVerified,false);
  assert.equal(expanded.coverage.playerRecipeUnlockVerified,false);
  assert.equal(expanded.coverage.actualLootOrHarvestVerified,false);
  assert.equal(expanded.coverage.originalSourceCoverageComplete,false);
  assert.equal(expanded.originCoverageComplete,false);
  assert.equal(expanded.liveAvailabilityVerified,false);
  assert.equal(expanded.sourceEvidenceOnly,true);
  assert.equal(expanded.query().totalOriginRelations,3961);
  assert.equal(expanded.knownLinkedItemIds.length,expanded.coverage.distinctLinkedItemIds);
  assert(Object.isFrozen(expanded));
  assert(Object.isFrozen(expanded.coverage));
  assert(Object.isFrozen(expanded.knownLinkedItemIds));
  assert(expanded.knownLinkedItemIds.every(
    (id,i,ids)=>i===0||Number(ids[i-1])<Number(id)));
  assert.equal(expanded.originKindCounts.reduce((sum,x)=>sum+x.sourceRelations,0),3961);
  assert.equal(catalog.itemSources.query().totalOriginRelations,1255);
  assert.equal(catalog.coverage.combinedSourceRoutes,1255);
  assert.equal(catalog.itemSources.getKindItemIds('crafting').length,0);
  assert.equal(catalog.itemSources.getKindItemIds('fishing').length,0);
  assert.equal(expanded.getKindItemIds('redeem_code').length,0);
  assert.equal(expanded.getKindItemIds('twitch_drop').length,0);
  assert.equal(catalog.nameCandidates.coverage.verifiedOnlineAcquisitionLinks,0);
});

test('native recipe, fish, mining, timebending and seed output are indexed with original source IDs, not simulated reward grants',async()=>{
  const catalog=await loadPublicSourceCatalog('/Wand',publicFetcher().fetcher);
  const browser=await catalog.loadExpandedNativeItemSources();
  const crafting=browser.query({kinds:['crafting'],routeStatuses:[
    'confirmed_source_link'],sourceKinds:['verified_game_native']
  },{limit:500});
  const cooking=browser.query({kinds:['cooking']},{limit:500});
  assert.equal(crafting.totalOriginRelations,1318);
  assert.equal(cooking.totalOriginRelations,625);
  assert.equal(browser.getKindItemIds('crafting').length,1294,
    '1,318 recipe rows include 24 repeated result Item IDs');
  assert.equal(browser.getKindItemIds('cooking').length>0,true);
  assert(crafting.items.every(item=>item.origins.every(origin=>
    origin.kind==='crafting'&&origin.routeStatus==='confirmed_source_link'&&
    origin.source.kind==='verified_game_native'&&
    origin.availability==='not_live_verified')));
  const originalCraft=browser.getItem('40001082').origins.find(x=>
    x.originId==='native:recipe:2050300000');
  assert(originalCraft);
  assert.equal(originalCraft.quantity,1);
  assert.equal(originalCraft.source.gameVersion,'1.26.2');
  assert.equal(browser.getItem('30300010').origins.some(x=>
    x.originId==='native:recipe:2050000009'&&x.quantity===null),true);
  assert.equal(browser.getItem('31000029').origins.some(x=>
    x.originId==='native:path:fishing:2050100000'&&x.kind==='fishing'),true);
  assert.equal(browser.getItem('31600022').origins.some(x=>
    x.originId==='native:path:mining:2050200022'&&x.kind==='mining'),true);
  assert.equal(browser.getItem('80000003').origins.some(x=>
    x.originId==='native:path:timebending:2050400000'&&x.kind==='timebending'),true);
  assert.equal(browser.getItem('30200000').origins.some(x=>
    x.originId==='native:path:growing:30400010'&&x.kind==='farming'&&x.quantity===1),true);
  const base=browser.query({kinds:['premium_shop'],sourceIds:[
    'db02:shop-cache:Shop20260715'],gameVersion:null
  },{limit:200});
  assert.equal(base.totalOriginRelations,128);
  assert.equal(base.totalItemIds,120);
  assert(browser.query({kinds:['fishing'],sourceKinds:[
    'verified_sale_snapshot']}).totalOriginRelations===0);
  assert(browser.query({kinds:['premium_shop'],sourceKinds:[
    'verified_game_native']}).totalOriginRelations===0);
  assert.equal(browser.getItem('999999999').origins.length,0);
  assert.throws(()=>browser.query({kinds:['unknown']}),/INVALID_KINDS/);
  assert.throws(()=>browser.query({}, {limit:501}),/INVALID_PAGE_RANGE/);
});

test('pagination retains all matching routes and original relation references; mixed filters evaluate one row',async()=>{
  const catalog=await loadPublicSourceCatalog('/Wand',publicFetcher().fetcher);
  const [browser,recipes,activities]=await Promise.all([
    catalog.loadExpandedNativeItemSources(),
    catalog.loadNativeRecipeResults(),catalog.loadNativeActivityResults()
  ]);
  assert.equal(browser.knownLinkedItemIds.length,
    new Set([...catalog.itemSources.knownLinkedItemIds,
      ...recipes.listResultItemIds(),...activities.listResultItemIds()]).size);
  const output=browser.getItem('40001082');
  assert(output.origins.includes(recipes.getResultOrigins('40001082')[0]),
    'expanded browser retains original pinned ItemOrigin objects');
  assert(Object.isFrozen(output)&&Object.isFrozen(output.origins));
  const all=browser.query({}, {limit:500});
  assert.equal(all.totalOriginRelations,3961);
  assert.equal(all.items.length,500);
  assert(all.hasMore);
  const page=browser.query({kinds:['cooking']},{offset:5,limit:25});
  assert.equal(page.items.length,25);
  assert.equal(page.offset,5);
  assert.equal(page.limit,25);
  assert.equal(page.totalOriginRelations,625);
  assert(page.items.every(r=>r.origins.every(x=>x.kind==='cooking')));
  const none=browser.query({kinds:['cooking'],sourceKinds:[
    'verified_liveops_cache']});
  assert.equal(none.totalOriginRelations,0);
  assert.equal(none.totalItemIds,0);
  assert.equal(browser.getKindItemIds('premium_shop').length,
    catalog.itemSources.getKindItemIds('premium_shop').length);
  assert.equal(catalog.itemSources.getItem('40001082').origins.length,0);
});

test('tampered or spoofed native indexes are refused; no source import is allowed without pinned originals',async()=>{
  const catalog=await loadPublicSourceCatalog('/Wand',publicFetcher().fetcher);
  const [recipes,activities]=await Promise.all([
    catalog.loadNativeRecipeResults(),catalog.loadNativeActivityResults()
  ]);
  assert.throws(()=>indexExpandedNativeItemSourceBrowser(
    catalog.origins,{...recipes},activities),/PINNED_NATIVE_SOURCE_REQUIRED/);
  assert.throws(()=>indexExpandedNativeItemSourceBrowser(
    catalog.origins,recipes,{...activities}),/PINNED_NATIVE_SOURCE_REQUIRED/);
  assert.throws(()=>indexExpandedNativeItemSourceBrowser(
    {...catalog.origins,schema:'forged'},recipes,activities),
  /ORIGIN_LEDGER_REQUIRED/);
  const browser=indexExpandedNativeItemSourceBrowser(catalog.origins,recipes,activities);
  assert.equal(browser.query().totalOriginRelations,3961);
  assert.throws(()=>browser.getItem('00040001082'),/INVALID_ITEM_ID/);
});
