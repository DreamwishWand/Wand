import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openPublicSharedGameSources}
  from '../src/lib/game-db/public-sources.ts';
import {
  createDb00NativeLootContextReader,DB00_NATIVE_LOOT_CONTEXT_CONTRACT
} from '../src/lib/game-db/native-loot-context.ts';

const ROOT=new URL('../static/',import.meta.url);
const LOOT='native-loot-candidates-1.26.2.json';
const NAMES='native-loot-name-keys-1.26.2.json';
function local({corruptNames=false,missingNames=false}={}){
  const requests=[];
  const fetcher=async url=>{
    assert(typeof url==='string'&&url.startsWith('/Wand/')&&
      !url.includes('..'));
    requests.push(url);
    if(missingNames&&url.endsWith('/'+NAMES))
      return new Response('not found',{status:404});
    let data;
    try{data=readFileSync(new URL(url.slice(6),ROOT));}
    catch{return new Response('not found',{status:404});}
    if(corruptNames&&url.endsWith('/'+NAMES)){
      data=Buffer.from(data);data[95]^=1;
    }
    return new Response(data,{status:200});
  };
  return {requests,fetcher};
}
let live;
const open=()=>live??=openPublicSharedGameSources('/Wand',local().fetcher);

test('DB-00 lazily shares only two original projection bytes for names, objects and LootTable',async()=>{
  const f=local();
  const pub=await openPublicSharedGameSources('/Wand',f.fetcher);
  const startup=f.requests.length;
  assert(startup>0);
  assert(!f.requests.some(x=>x.endsWith('/'+LOOT)||x.endsWith('/'+NAMES)));
  const context=await pub.loadNativeLootContextSources();
  assert.equal(context,await pub.loadNativeLootContextSources());
  assert.equal(context.contract,DB00_NATIVE_LOOT_CONTEXT_CONTRACT);
  assert.equal(context.snapshotId,pub.snapshotId);
  assert.equal(context.namedOriginalTables,960);
  assert.equal(context.originalNameFamilies,28);
  assert.equal(context.sourceObjectReferences,375);
  assert.equal(context.sourceObjectCandidateRelations,698);
  assert.equal(context.sourceObjectDistinctCandidateIds,356);
  assert.equal(context.originalSourceCandidatesOnly,true);
  assert.equal(context.actualGameplayDropVerified,false);
  assert.equal(context.currentAvailabilityVerified,false);
  assert.equal(context.playerOwnershipVerified,false);
  assert.equal(f.requests.length,startup+2);
  assert.equal(f.requests.filter(x=>x.endsWith('/'+LOOT)).length,1);
  assert.equal(f.requests.filter(x=>x.endsWith('/'+NAMES)).length,1);
  await pub.loadNativeLootCandidateSources();
  await pub.acquisition.loadNamedNativeLootSources();
  await pub.acquisition.loadNativeObjectLootSources();
  assert.equal(f.requests.length,startup+2);
  assert.equal(pub.acquisition.coverage.combinedSourceRoutes,1255);
  assert(Object.isFrozen(context));
});

test('all 960 original native LootTable names remain opaque labels with 28 source families',async()=>{
  const pub=await open();
  const context=await pub.loadNativeLootContextSources();
  const named=await pub.acquisition.loadNamedNativeLootSources();
  assert.deepEqual(context.listFamilies(),named.names.listNativeFamilies());
  assert.equal(context.listFamilies().length,28);
  let names=0,relations=0;
  for(const family of context.listFamilies()){
    const joined=context.getFamily(family);
    const source=named.getFamilySummary(family);
    assert(joined&&source);
    assert.equal(joined.summary,source);
    assert.equal(joined.namedTableCandidates.length,source.candidateRelations);
    assert.equal(joined.sourceNativeFamilyOnly,true);
    assert.equal(joined.gameplayAcquisitionContextVerified,false);
    names+=joined.summary.tables.length;
    relations+=joined.namedTableCandidates.length;
    for(const table of joined.summary.tables){
      const row=context.getTable(table.tableId);
      assert(row);
      assert.equal(row.nativeName,table);
      assert.equal(row.nativeName.originalKeyVerified,true);
      assert.equal(row.nativeName.localizedDisplayNameVerified,false);
      assert.equal(row.gameplayAcquisitionContextVerified,false);
      assert.equal(row.guaranteedDropVerified,false);
    }
  }
  assert.equal(names,960);
  assert.equal(relations,3804);
  assert.equal(context.getTable(2090999999),null);
  assert.equal(context.getFamily('UnrepresentedFamily'),null);
});

test('all 375 source objects preserve 295 referenced LootTables, 698 candidate links, including empty table objects',async()=>{
  const pub=await open();
  const context=await pub.loadNativeLootContextSources();
  const objects=await pub.acquisition.loadNativeObjectLootSources();
  assert.equal(context.listSourceObjectIds().length,375);
  assert.deepEqual(context.listSourceObjectIds(),objects.listSourceObjectItemIds());
  let references=0,relations=0,empty=0;
  const uniqueTables=new Set();
  for(const id of context.listSourceObjectIds()){
    const row=context.getObject(id);
    const sourceRefs=objects.getObjectTableReferences(id);
    assert.equal(row.objectId,id);
    assert.equal(row.object.itemId,id);
    assert.deepEqual(row.tableReferences,sourceRefs);
    assert.equal(row.candidateItems.length,
      objects.getObjectCandidateItems(id).length);
    assert.equal(row.staticSourceReferenceOnly,true);
    assert.equal(row.actualGameplayDropVerified,false);
    assert.equal(row.playerOwnershipVerified,false);
    references+=row.tableReferences.length;
    relations+=row.candidateItems.length;
    if(row.candidateItems.length===0)empty++;
    for(const reference of row.tableReferences){
      uniqueTables.add(reference.lootTableId);
      const table=context.getTable(reference.lootTableId);
      assert(table);
      assert(table.referenceOnlyObjects.includes(reference));
    }
    assert(row.candidateItems.every(link=>
      link.object.itemId===id &&
      link.candidateItem.itemId===link.source.itemId &&
      link.originalSourceLinkOnly===true &&
      link.actualGameplayDropVerified===false));
  }
  assert.equal(references,375);
  assert.equal(relations,698);
  assert.equal(empty,9);
  assert.equal(uniqueTables.size,295);
  assert.deepEqual(context.getObject(99999999).tableReferences,[]);
  assert.deepEqual(context.getObject(99999999).candidateItems,[]);
});

test('1,100 candidate IDs reverse to original table keys and 356 Item IDs to original object referrers',async()=>{
  const pub=await open();
  const context=await pub.loadNativeLootContextSources();
  const named=await pub.acquisition.loadNamedNativeLootSources();
  const objects=await pub.acquisition.loadNativeObjectLootSources();
  const ids=named.listCandidateItemIds();
  assert.equal(ids.length,1100);
  let namedCount=0,objectCount=0,objectIds=0;
  for(const id of ids){
    const row=context.getItem(id);
    assert.equal(row.itemId,id);
    assert.equal(row.shared.itemId,id);
    assert.equal(row.originalSourceCandidatesOnly,true);
    assert.equal(row.liveAvailabilityVerified,false);
    assert.equal(row.collectionUiMembershipVerified,false);
    assert.equal(row.playerOwnershipVerified,false);
    assert.equal(row.namedTableCandidates.length,
      named.getItemNamedCandidates(id).length);
    assert.equal(row.referencedByObjects.length,
      objects.getItemObjectCandidates(id).length);
    namedCount+=row.namedTableCandidates.length;
    objectCount+=row.referencedByObjects.length;
    if(row.referencedByObjects.length)objectIds++;
    assert(row.namedTableCandidates.every(link=>
      link.source.name.nativeNameKey===link.source.nativeNameKey &&
      link.item.itemId===id &&
      link.originalNativeNameOnly===true &&
      link.guaranteedDropVerified===false));
  }
  assert.equal(namedCount,3804);
  assert.equal(objectCount,698);
  assert.equal(objectIds,356);
  assert.deepEqual(context.getItem(99999999).namedTableCandidates,[]);
  assert.deepEqual(context.getItem(99999999).referencedByObjects,[]);
});

test('combined search filters source families, object referrers and localized Item names without claiming acquisition',async()=>{
  const pub=await open();
  const context=await pub.loadNativeLootContextSources();
  const named=await pub.acquisition.loadNamedNativeLootSources();
  const family=context.listFamilies().find(f=>
    (named.getFamilySummary(f)?.candidateRelations??0)>0);
  assert(family);
  const all=[];
  for(let offset=0;;){
    const page=context.searchItems({offset,limit:107});
    assert.equal(page.scope,'source_native_loot_name_and_object_references_only');
    assert.equal(page.actualGameplayDropVerified,false);
    assert.equal(page.currentAvailabilityVerified,false);
    all.push(...page.items);
    if(page.nextOffset===null)break;
    offset=page.nextOffset;
  }
  assert.equal(all.length,1100);
  assert.deepEqual(all.map(x=>x.itemId),named.listCandidateItemIds());
  const sourceOnly=context.searchItems({sourceObjectReferencedOnly:true});
  assert.equal(sourceOnly.total,356);
  assert(sourceOnly.items.every(x=>x.referencedByObjects.length>0));
  const byFamily=context.searchItems({family});
  assert(byFamily.total>0&&byFamily.total<=1100);
  assert(byFamily.items.every(x=>
    x.namedTableCandidates.some(candidate=>
      candidate.source.nativeSourceFamily===family)));
  const selected=all[0];
  assert(context.searchItems({text:selected.itemId}).items.some(x=>
    x.itemId===selected.itemId));
  assert(context.searchItems({text:selected.namedTableCandidates[0].source.nativeNameKey})
    .items.some(x=>x.itemId===selected.itemId));
  const published=context.searchItems({publishedOnly:true,locale:'ja'});
  assert(published.total>0&&published.items.every(x=>x.shared.catalog!==null));
  assert.throws(()=>context.searchItems({locale:'ko'}),/INVALID_LOCALE/);
  assert.throws(()=>context.searchItems({limit:501}),/INVALID_PAGE/);
  assert.throws(()=>context.searchItems({publishedOnly:false}),
    /INVALID_PUBLISHED_FILTER/);
  assert.throws(()=>context.searchItems({sourceObjectReferencedOnly:false}),
    /INVALID_OBJECT_FILTER/);
  assert.throws(()=>context.searchItems({family:'fake_family'}),
    /INVALID_FAMILY_FILTER/);
});

test('per-Item shared context is lazy, validates ID before loading and rejects corrupted names',async()=>{
  const f=local();
  const pub=await openPublicSharedGameSources('/Wand',f.fetcher);
  const start=f.requests.length;
  await assert.rejects(pub.getNativeLootContextEvidence('01'),
    /invalid numeric Item ID/);
  assert.equal(f.requests.length,start);
  const lookup=await pub.getNativeLootContextEvidence('30200000');
  assert.equal(lookup.itemId,'30200000');
  assert.equal(lookup.shared.itemId,'30200000');
  assert.equal(lookup.originalSourceCandidatesOnly,true);
  assert.equal(lookup.actualGameplayDropVerified,false);
  assert.equal(f.requests.length,start+2);
  await pub.getNativeLootContextEvidence('30200000');
  assert.equal(f.requests.length,start+2);
  assert(Object.isFrozen(lookup));
  const [named,objects]=await Promise.all([
    pub.acquisition.loadNamedNativeLootSources(),
    pub.acquisition.loadNativeObjectLootSources()
  ]);
  const forged={...named,names:{...named.names}};
  assert.throws(()=>createDb00NativeLootContextReader(
    pub.database,pub.joined,forged,objects
  ),/PINNED_DB02_NAME_OBJECT_LOOT_SOURCES_REQUIRED/);
  const bad=await openPublicSharedGameSources('/Wand',
    local({corruptNames:true}).fetcher);
  await assert.rejects(bad.loadNativeLootContextSources(),
    /DB02_NATIVE_LOOT_NAME_SHA/);
  const missing=await openPublicSharedGameSources('/Wand',
    local({missingNames:true}).fetcher);
  await assert.rejects(missing.loadNativeLootContextSources(),
    /DB02_NATIVE_LOOT_NAME_DOWNLOAD_FAILED/);
});
