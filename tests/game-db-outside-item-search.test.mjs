import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openPublicSharedGameSources} from '../src/lib/game-db/public-sources.ts';

const root=new URL('../static/',import.meta.url);
let cached;
const read=async url=>{
  assert(typeof url==='string'&&url.startsWith('/Wand/')&&!url.includes('..'));
  try{return new Response(readFileSync(new URL(url.slice(6),root)),{status:200});}
  catch{return new Response('not found',{status:404});}
};
const app=()=>cached??=openPublicSharedGameSources('/Wand',read);
function allOutside(db){
  const rows=[];
  for(let offset=0;;){
    const page=db.searchOutsideSourceItems({offset,limit:500});
    rows.push(...page.items);
    if(page.nextOffset===null){
      assert.equal(rows.length,page.total);
      return rows;
    }
    assert(page.nextOffset>offset);
    offset=page.nextOffset;
  }
}
test('DB-00 discovers exact source-linked outside-ItemList IDs without inventing published catalog membership',async()=>{
  const db=await app();
  const rows=allOutside(db);
  assert(rows.length>0);
  assert(new Set(rows.map(row=>row.itemId)).size===rows.length);
  assert.deepEqual(rows.map(row=>Number(row.itemId)),
    rows.map(row=>Number(row.itemId)).sort((a,b)=>a-b));
  const known=new Set([
    ...db.acquisition.origins.listLinkedItemIds(),
    ...db.acquisition.staticContainerSource.linkedItemIds,
    ...db.acquisition.defaultInventorySource.linkedItemIds,
    ...db.guide.itemIds
  ]);
  // Reconstruct the complete native positive-ID universe from the same
  // independently DB-03-validated, public Quest catalogue. This does not
  // treat an omitted ItemList record as a new Collection item.
  const originalQuestIndex=JSON.parse(readFileSync(
    new URL('guide/public/quest-index.json',root),'utf8'
  ));
  assert.equal(originalQuestIndex.quests.length,733);
  let questRefs=0;
  const questItemIds=new Set();
  for(const quest of originalQuestIndex.quests){
    for(const ref of db.guideQuestTargets.getQuestCandidates(quest.id)){
      known.add(ref.itemId);
      questItemIds.add(ref.itemId);
      questRefs++;
    }
  }
  assert.equal(questRefs,4897);
  assert.equal(questItemIds.size,2551);
  const expected=[...known].filter(id=>db.database.getItem(id)===null)
    .sort((a,b)=>Number(a)-Number(b));
  assert.deepEqual(rows.map(row=>row.itemId),expected);
  for(const row of rows){
    assert.equal(row.item.itemId,row.itemId);
    assert.equal(row.item.catalog,null);
    assert.equal(row.item.catalogStatus,'outside_published_item_scope');
    assert.equal(row.publishedItemDefinitionPresent,false);
    assert.equal(row.gameUiMembershipVerified,false);
    assert.equal(row.playerOwnershipVerified,false);
    assert(row.evidenceFamilies.length>0);
    assert(known.has(row.itemId)||row.evidenceFamilies.includes('quest_target_reference'));
    assert(Object.isFrozen(row));
    assert(Object.isFrozen(row.evidenceFamilies));
    assert.deepEqual(row.item,db.getItem(row.itemId));
  }
  assert(Object.isFrozen(db.searchOutsideSourceItems()));
  assert(Object.isFrozen(db.searchOutsideSourceItems().items));
  assert.equal(db.searchOutsideSourceItems().scope,
    'source_linked_outside_published_itemlist');
  assert.equal(db.searchOutsideSourceItems().sourceCoverageComplete,false);
  assert.equal(db.searchOutsideSourceItems().collectionUiMembershipVerified,false);
  assert.equal(db.searchOutsideSourceItems().playerOwnershipVerified,false);
  assert.equal(db.searchOutsideSourceItems().liveAvailabilityVerified,false);
  const published=db.queryItems([],{limit:100}).items;
  assert(published.every(item=>!rows.some(row=>row.itemId===item.id)));
});
test('outside source filters combine exact evidence families, Item ID prefix and source kind',async()=>{
  const db=await app();
  const outside=allOutside(db);
  const families=[
    'acquisition_origin','static_container_template','default_inventory_template',
    'starpath_relation','quest_target_reference'
  ];
  for(const family of families){
    const expected=outside.filter(row=>row.evidenceFamilies.includes(family));
    const res=db.searchOutsideSourceItems({evidenceFamilies:[family],limit:500});
    assert.equal(res.total,expected.length);
    assert.deepEqual(res.items.map(row=>row.itemId),
      expected.slice(0,500).map(row=>row.itemId));
  }
  const origin=outside.find(row=>row.item.origins?.length);
  assert(origin);
  const kind=origin.item.origins[0].kind;
  const filtered=db.searchOutsideSourceItems({
    evidenceFamilies:['acquisition_origin'],originKinds:[kind],limit:500
  });
  assert(filtered.total>0);
  assert(filtered.items.every(row=>row.item.origins?.some(r=>r.kind===kind)));
  assert.equal(db.searchOutsideSourceItems({
    evidenceFamilies:['acquisition_origin'],originKinds:['no_such_origin_kind']
  }).total,0);
  const candidate=outside.find(row=>row.item.questTargetCandidates?.length);
  assert(candidate,'native Mission references Item IDs outside the published ItemList');
  const questId=candidate.item.questTargetCandidates[0].questId;
  const target=db.searchOutsideSourceItems({questTargetQuestId:questId,limit:500});
  assert(target.total>0);
  assert(target.items.some(row=>row.itemId===candidate.itemId));
  assert(target.items.every(row=>row.item.questTargetCandidates.some(
    ref=>ref.questId===questId)));
  const prefix=candidate.itemId.slice(0,3);
  const prefixed=db.searchOutsideSourceItems({idPrefix:prefix,limit:500});
  assert(prefixed.total>0);
  assert(prefixed.items.every(row=>row.itemId.startsWith(prefix)));
  const complex=db.searchOutsideSourceItems({
    idPrefix:prefix,evidenceFamilies:['quest_target_reference'],
    questTargetQuestId:questId
  });
  assert(complex.items.some(row=>row.itemId===candidate.itemId));
  assert.equal(db.searchOutsideSourceItems({idPrefix:'999999999999999'}).total,0);
  assert.throws(()=>db.searchOutsideSourceItems({idPrefix:'00'}),
    /DB00_OUTSIDE_ITEM_SEARCH_INVALID_ID_PREFIX/);
  assert.throws(()=>db.searchOutsideSourceItems({evidenceFamilies:['invalid']}),
    /DB00_OUTSIDE_ITEM_SEARCH_INVALID_EVIDENCE_FAMILIES/);
  assert.throws(()=>db.searchOutsideSourceItems({originKinds:['loot','loot']}),
    /DB00_OUTSIDE_ITEM_SEARCH_INVALID_ORIGIN_KINDS/);
  assert.throws(()=>db.searchOutsideSourceItems({questTargetQuestId:'test'}),
    /DB00_OUTSIDE_ITEM_SEARCH_INVALID_QUEST_ID/);
  assert.throws(()=>db.searchOutsideSourceItems({limit:501}),
    /DB00_OUTSIDE_ITEM_SEARCH_INVALID_PAGE/);
});
test('outside Item IDs are discoverable with no new fetch, source-only evidence and distinct published search',async()=>{
  const calls=[];
  const db=await openPublicSharedGameSources('/Wand',async url=>{
    calls.push(url);
    return read(url);
  });
  const before=calls.length;
  assert.equal(before,30);
  const outside=db.searchOutsideSourceItems({limit:1});
  assert(outside.total>0);
  assert.equal(calls.length,before,'query must not fetch more assets or owner-local originals');
  assert.equal(db.searchItems({text:'80000000'}).total,0,
    'published ItemList search must not silently include outside Item IDs');
  const id='80000000';
  assert.equal(db.getItem(id).catalog,null);
  assert.equal(db.getItem(id).catalogStatus,'outside_published_item_scope');
  const found=db.searchOutsideSourceItems({idPrefix:id});
  assert(found.items.some(row=>row.itemId===id),
    'source-linked Quest currency outside ItemList remains discoverable by ID');
});
