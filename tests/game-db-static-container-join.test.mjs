import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openPublicSharedGameSources} from '../src/lib/game-db/public-sources.ts';
import {joinCurrentGameSources} from '../src/lib/game-db/source-join.ts';

const STATIC=new URL('../static/',import.meta.url);
const fetcher=async url=>{
  assert(typeof url==='string' && url.startsWith('/Wand/'));
  const path=url.slice('/Wand/'.length);
  assert(!path.includes('..')&&!path.includes('.zip'));
  try{return new Response(readFileSync(new URL(path,STATIC)),{status:200});}
  catch{return new Response('not found',{status:404});}
};
let loading;
const open=()=>loading??=openPublicSharedGameSources('/Wand',fetcher);

test('DB-00 preserves all 146 source-native container template candidates separate from 1255 origins',async()=>{
  const app=await open();
  const source=app.acquisition.staticContainerSource;
  assert.equal(source.coverage.populatedSourceSlots,146);
  assert.equal(source.coverage.distinctItemIds,115);
  assert.equal(source.coverage.guaranteedLootVerified,false);
  assert.equal(source.coverage.liveContentsVerified,false);
  assert.equal(source.coverage.containerSpawnVerified,false);
  assert.equal(source.coverage.personalSaveContentsIncluded,false);
  assert.equal(app.acquisition.coverage.combinedSourceRoutes,1255);
  assert.equal(app.acquisition.coverage.totalPublishedOriginAndContainerCandidateRoutes,1401);

  let templateRows=0,inside=0,outside=0;
  for(const id of source.linkedItemIds){
    const row=app.getItem(id);
    const sourceRows=source.getItemCandidates(id);
    templateRows+=sourceRows.length;
    assert.deepEqual(row.staticContainerCandidates,sourceRows);
    assert.equal(row.staticContainerLiveContentsVerified,false);
    assert.equal(row.currentlyAvailableVerified,false);
    assert.equal(row.playerOwnershipVerified,false);
    assert(row.staticContainerCandidates.length>0);
    assert(row.staticContainerCandidates.every(origin=>
      origin.kind==='loot'&&origin.routeStatus==='static_candidate_only'&&
      origin.source.sourceId==='db02:native:steam-1262:container-template'&&
      origin.availability==='not_live_verified'));
    assert(!row.origins?.some(origin=>
      row.staticContainerCandidates.some(slot=>slot.originId===origin.originId)),
      'template slots must not be silently promoted to the DB-02 origin ledger');
    if(row.catalog)inside++;
    else outside++;
  }
  assert.equal(templateRows,146);
  assert.equal(inside+outside,115);
  assert.equal(app.getItem('99999999').staticContainerCandidates.length,0);
  assert(Object.isFrozen(app.getItem(source.linkedItemIds[0]).staticContainerCandidates));
});

test('optional source evidence and fail-closed source authenticity preserve DB-00 contracts',async()=>{
  const app=await open();
  const plain=joinCurrentGameSources(app.database,{
    origins:app.acquisition.origins,rewards:app.guide
  });
  const sample=app.acquisition.staticContainerSource.linkedItemIds[0];
  assert.equal(plain.getItem(sample).staticContainerCandidates,null);
  assert.equal(plain.getItem(sample).staticContainerLiveContentsVerified,false);
  assert.throws(()=>joinCurrentGameSources(app.database,{
    origins:app.acquisition.origins,
    staticContainers:{
      ...app.acquisition.staticContainerSource,
      coverage:app.acquisition.staticContainerSource.coverage
    }
  }),/DB02_PINNED_STATIC_CONTAINER_SOURCE_REQUIRED/,
  'a forged but structurally matching object must not inherit a SHA-pinned verification brand');
  assert.equal(app.acquisition.lookup(sample).staticContainerCandidates.length,
    app.getItem(sample).staticContainerCandidates.length);
});

test('source-verified static container search excludes unsourced Item IDs and paginates only published matches',async()=>{
  const app=await open();
  const source=app.acquisition.staticContainerSource;
  const publishedIds=source.linkedItemIds.filter(id=>app.getItem(id).catalog!==null);
  const matches=app.searchItems({staticContainerCandidate:true,limit:500});
  assert.equal(matches.scope,'current_published_itemlist');
  assert.equal(matches.total,publishedIds.length);
  assert.deepEqual(matches.items.map(item=>item.itemId),publishedIds);
  assert(matches.items.every(item=>
    item.catalogStatus==='current_published_item' &&
    (item.staticContainerCandidates?.length??0)>0));
  assert.equal(matches.liveAvailabilityVerified,false);
  assert.equal(matches.playerOwnershipVerified,false);
  assert.equal(matches.sourceCoverageComplete,false);

  const half=app.searchItems({staticContainerCandidate:true,offset:0,limit:3});
  const rest=app.searchItems({staticContainerCandidate:true,offset:half.nextOffset??0,limit:500});
  if(publishedIds.length>3){
    assert.equal(half.nextOffset,3);
    assert.deepEqual([...half.items,...rest.items].map(row=>row.itemId),publishedIds);
  }
  assert.equal(app.searchItems({
    staticContainerCandidate:true,text:'no_such_container_opaque_name_123123'
  }).total,0);
  assert.throws(()=>app.searchItems({staticContainerCandidate:false}),
    /INVALID_CONTAINER_TEMPLATE_FILTER/);
  assert.throws(()=>app.searchItems({staticContainerCandidate:1}),
    /INVALID_CONTAINER_TEMPLATE_FILTER/);
  // Same Item ID may have independent quest/shop routes; the template slot is
  // never automatically counted as an ordinary 'loot' origin by DB-00.
  const normalLoot=app.searchItems({originKinds:['loot'],limit:500});
  assert(normalLoot.items.every(row=>
    row.origins?.some(origin=>origin.kind==='loot')));
  assert(Object.isFrozen(matches));
  assert(Object.isFrozen(matches.items));
});
