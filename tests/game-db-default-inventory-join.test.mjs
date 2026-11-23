import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openPublicSharedGameSources} from '../src/lib/game-db/public-sources.ts';
import {joinCurrentGameSources} from '../src/lib/game-db/source-join.ts';

const root=new URL('../static/',import.meta.url);
const fetcher=async url=>{
  assert(typeof url==='string'&&url.startsWith('/Wand/')&&!url.includes('..'));
  try{return new Response(readFileSync(new URL(url.slice(6),root)),{status:200});}
  catch{return new Response('not found',{status:404});}
};
let pending;
const app=()=>pending??=openPublicSharedGameSources('/Wand',fetcher);

test('289 original default-inventory entries join by exact ID, independently of 1255 origins',async()=>{
  const shared=await app();
  const native=shared.acquisition.defaultInventorySource;
  assert.equal(native.sourceIntegrity,'source_protoDb_and_public_sha256_pinned');
  assert.equal(native.coverage.groups,15);
  assert.equal(native.coverage.configuredEntries,289);
  assert.equal(native.coverage.distinctItemIds,288);
  assert.equal(native.coverage.containerEntries,3);
  assert.equal(native.coverage.listEntries,286);
  assert.equal(native.coverage.newPlayerGrantVerified,false);
  assert.equal(native.coverage.playerInventoryVerified,false);
  assert.equal(native.coverage.onlineOwnershipVerified,false);
  assert.equal(native.coverage.privateSaveIncluded,false);
  assert.equal(shared.acquisition.coverage.combinedSourceRoutes,1255);
  assert.equal(shared.acquisition.coverage.totalPublishedSourceAndStaticCandidateRelations,1690);

  let count=0,published=0,outside=0;
  for(const id of native.linkedItemIds){
    const item=shared.getItem(id);
    const candidates=native.getItemCandidates(id);
    assert.deepEqual(item.configuredDefaultInventoryCandidates,candidates);
    assert.deepEqual(shared.acquisition.lookup(id).configuredDefaultInventoryCandidates,candidates);
    assert.equal(item.configuredDefaultInventoryPlayerOwnershipVerified,false);
    assert.equal(item.configuredDefaultInventoryNewPlayerGrantVerified,false);
    assert.equal(item.playerOwnershipVerified,false);
    assert.equal(item.currentlyAvailableVerified,false);
    assert(Object.isFrozen(item.configuredDefaultInventoryCandidates));
    for(const row of item.configuredDefaultInventoryCandidates){
      assert.equal(row.itemId,id);
      assert.equal(row.kind,'other');
      assert.equal(row.routeStatus,'static_candidate_only');
      assert.equal(row.availability,'not_live_verified');
      assert.equal(row.source.sourceId,'db02:static:default-inventories:steam-1262');
      assert(!item.origins?.some(origin=>origin.originId===row.originId),
        'source configured-default must not be counted as an acquisition');
      count++;
    }
    if(item.catalog)published++;else outside++;
  }
  assert.equal(count,289);
  assert.equal(published+outside,288);
  assert.deepEqual(shared.getItem('99999999').configuredDefaultInventoryCandidates,[]);
});

test('original group filtering is exact and works only on the published native ItemList',async()=>{
  const shared=await app();
  const native=shared.acquisition.defaultInventorySource;
  const published=native.linkedItemIds.filter(id=>shared.getItem(id).catalog!==null);
  const searched=shared.searchItems({configuredDefaultInventoryCandidate:true,limit:500});
  assert.equal(searched.total,published.length);
  assert.deepEqual(searched.items.map(item=>item.itemId),published);
  assert(searched.items.every(item=>
    item.catalogStatus==='current_published_item' &&
    item.configuredDefaultInventoryCandidates?.length>0 &&
    item.configuredDefaultInventoryNewPlayerGrantVerified===false));
  const names=['HomeStorage','Catalog','Wardrobe','Makeup','Trimming','Buildings',
    'Decals','Skins','AvatarFeatures','PhotoMode','MountGear'];
  const matchedAcrossGroups=new Set();
  for(const name of names){
    const sourceIds=native.linkedItemIds.filter(id=>
      native.getItemGroupNames(id).includes(name)&&shared.getItem(id).catalog!==null);
    const query=shared.searchItems({configuredDefaultInventoryGroup:name,limit:500});
    assert.equal(query.total,sourceIds.length);
    assert.deepEqual(query.items.map(row=>row.itemId),sourceIds);
    assert(query.items.every(row=>
      row.configuredDefaultInventoryCandidates.some(entry=>
        entry.originId.startsWith('db02:default-inventory:'+name+':'))));
    for(const id of sourceIds)matchedAcrossGroups.add(id);
  }
  assert.equal(matchedAcrossGroups.size,published.length);

  const first=shared.searchItems({configuredDefaultInventoryCandidate:true,limit:5});
  const second=shared.searchItems({
    configuredDefaultInventoryCandidate:true,offset:first.nextOffset??0,limit:5
  });
  assert.deepEqual([...first.items,...second.items].map(item=>item.itemId),
    published.slice(0,10));
  assert.equal(shared.searchItems({configuredDefaultInventoryGroup:'Backpack'}).total,0);
  assert.equal(shared.searchItems({configuredDefaultInventoryGroup:'Nonexistent'}).total,0);
  assert.equal(shared.searchItems({
    configuredDefaultInventoryCandidate:true,
    configuredDefaultInventoryGroup:'Wardrobe',
    text:'no_possible_item_name_configured_default_123'
  }).total,0);
  assert.throws(()=>shared.searchItems({configuredDefaultInventoryCandidate:false}),
    /DB00_PUBLIC_SEARCH_INVALID_DEFAULT_INVENTORY_FILTER/);
  assert.throws(()=>shared.searchItems({configuredDefaultInventoryGroup:'../private'}),
    /DB00_PUBLIC_SEARCH_INVALID_DEFAULT_INVENTORY_GROUP/);
  assert.throws(()=>shared.searchItems({configuredDefaultInventoryGroup:''}),
    /DB00_PUBLIC_SEARCH_INVALID_DEFAULT_INVENTORY_GROUP/);
  assert(Object.isFrozen(searched));
  assert(Object.isFrozen(searched.items));
});

test('optional source omitted means null, and an unpinned source copy cannot be accepted',async()=>{
  const shared=await app();
  const native=shared.acquisition.defaultInventorySource;
  const itemId=native.linkedItemIds[0];
  const noDefault=joinCurrentGameSources(shared.database,{
    origins:shared.acquisition.origins,rewards:shared.guide,
    staticContainers:shared.acquisition.staticContainerSource,
    questTargets:shared.guideQuestTargets
  });
  assert.equal(noDefault.getItem(itemId).configuredDefaultInventoryCandidates,null);
  assert.equal(noDefault.getItem(itemId).configuredDefaultInventoryPlayerOwnershipVerified,false);
  assert.throws(()=>joinCurrentGameSources(shared.database,{
    defaultInventories:{...native}
  }),/DB02_PINNED_DEFAULT_INVENTORY_SOURCE_REQUIRED/);
  assert.throws(()=>joinCurrentGameSources(shared.database,{
    defaultInventories:{...native,coverage:{...native.coverage,playerInventoryVerified:true}}
  }),/DB02_PINNED_DEFAULT_INVENTORY_SOURCE_REQUIRED/);
  const regular=shared.searchItems({originKinds:['other'],limit:500});
  assert(regular.items.every(row=>row.origins.some(origin=>origin.kind==='other')),
    'configured default must never enter the ordinary other-origin route');
});
