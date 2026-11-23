import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openPublicSharedGameSources}
  from '../src/lib/game-db/public-sources.ts';
import {
  createDb00AllOriginalSourceReader,
  DB00_ALL_ORIGINAL_SOURCE_SEARCH_CONTRACT
} from '../src/lib/game-db/all-original-source-search.ts';

const ROOT=new URL('../static/',import.meta.url);
const ASSETS=[
  'recipe-results-1.26.2.json',
  'activity-result-paths-1.26.2.json',
  'native-loot-candidates-1.26.2.json'
];
function localFetcher({corrupt=null}={}){
  const calls=[];
  const fetcher=async url=>{
    assert.equal(typeof url,'string');
    assert(url.startsWith('/Wand/')&&!url.includes('..'));
    calls.push(url);
    let bytes;
    try{bytes=readFileSync(new URL(url.slice(6),ROOT));}
    catch{return new Response('missing',{status:404});}
    if(corrupt&&url.endsWith('/'+corrupt)){
      bytes=Buffer.from(bytes);
      bytes[60]^=1;
    }
    return new Response(bytes,{status:200});
  };
  return {calls,fetcher};
}
let sharedTask;
const shared=()=>sharedTask??=openPublicSharedGameSources(
  '/Wand',localFetcher().fetcher
);

test('all 8,200 source references are lazy and SHA-verified, without duplicate original asset fetches',async()=>{
  const {calls,fetcher}=localFetcher();
  const pub=await openPublicSharedGameSources('/Wand',fetcher);
  const initial=calls.length;
  assert(initial>0);
  assert(ASSETS.every(name=>!calls.some(url=>url.endsWith('/'+name))));
  const reader=await pub.loadAllOriginalSourceSearch();
  assert.equal(reader.contract,DB00_ALL_ORIGINAL_SOURCE_SEARCH_CONTRACT);
  assert.equal(reader.snapshotId,'steam-1.26.2-native-itemlist-v1');
  assert.equal(reader.originalDefinitionReferences,3961);
  assert.equal(reader.unverifiedStaticCandidateReferences,4239);
  assert.equal(reader.indexedSourceRelations,8200);
  assert.equal(reader.completeAcquisitionCoverage,false);
  assert.equal(reader.guaranteedDropVerified,false);
  assert.equal(reader.playerGrantVerified,false);
  assert.equal(reader.currentAvailabilityVerified,false);
  assert.equal(reader,await pub.loadAllOriginalSourceSearch());
  const source=await pub.acquisition.loadAllOriginalItemSources();
  assert.equal(reader.sourceItemIds,
    source.coverage.distinctReferencedItemIds);
  assert.equal(calls.length,initial+3);
  for(const name of ASSETS){
    assert.equal(calls.filter(url=>url.endsWith('/'+name)).length,1);
  }
  await pub.acquisition.loadExpandedNativeItemSources();
  await pub.acquisition.loadStaticCandidateItemSources();
  await pub.loadNativeRecipeSources();
  await pub.loadNativeActivitySources();
  await pub.loadNativeLootCandidateSources();
  assert.equal(calls.length,initial+3);
  assert(Object.isFrozen(reader));
});

test('full real original source index retains 8,200 original references and all source-only Item IDs',async()=>{
  const pub=await shared();
  const r=await pub.loadAllOriginalSourceSearch();
  const source=await pub.acquisition.loadAllOriginalItemSources();
  const ids=[],origins=new Set();
  let candidateCount=0,originalCount=0,outside=0,known=0;
  for(let offset=0;;){
    const page=r.search({offset,limit:120});
    assert.equal(page.totalSourceRelations,8200);
    assert.equal(page.totalItemIds,source.coverage.distinctReferencedItemIds);
    assert.equal(page.scope,'original_definition_and_unverified_static_candidates');
    assert.equal(page.completeAcquisitionCoverage,false);
    assert.equal(page.actualLootOrHarvestVerified,false);
    assert.equal(page.guaranteedDropVerified,false);
    assert.equal(page.playerGrantVerified,false);
    assert.equal(page.currentAvailabilityVerified,false);
    assert.equal(page.gameCollectionUiMembershipVerified,false);
    for(const row of page.items){
      ids.push(row.itemId);
      assert.deepEqual(row.original,source.getItem(row.itemId));
      assert.deepEqual(row.shared,pub.getItem(row.itemId));
      assert.equal(row.noIndexedSourceEvidence,false);
      assert.equal(row.originalSourceOnly,true);
      assert.equal(row.guaranteedDropVerified,false);
      assert.equal(row.playerGrantVerified,false);
      assert.equal(row.currentAvailabilityVerified,false);
      assert.equal(row.gameCollectionUiMembershipVerified,false);
      assert(Object.isFrozen(row));
      if(row.shared.catalog===null)outside++;else known++;
      for(const relation of row.original.origins){
        assert(!origins.has(relation.originId));
        origins.add(relation.originId);
      }
      originalCount+=row.confirmedDefinitionReferences;
      candidateCount+=row.unverifiedStaticCandidates;
    }
    if(page.nextOffset===null)break;
    assert(page.nextOffset>offset);
    offset=page.nextOffset;
  }
  assert.deepEqual(ids,source.knownLinkedItemIds);
  assert.equal(origins.size,8200);
  assert.equal(originalCount+candidateCount,8200);
  assert.equal(known+outside,source.coverage.distinctReferencedItemIds);
  const unknown=r.getItem('99999999');
  assert.equal(unknown.noIndexedSourceEvidence,true);
  assert.equal(unknown.original.origins.length,0);
  assert.equal(unknown.confirmedDefinitionReferences,0);
  assert.equal(unknown.unverifiedStaticCandidates,0);
  assert.equal(unknown.currentAvailabilityVerified,false);
});

test('same-relation source filters preserve confirmed links versus unverified static candidates',async()=>{
  const pub=await shared();
  const r=await pub.loadAllOriginalSourceSearch();
  const source=await pub.acquisition.loadAllOriginalItemSources();
  const selections=[
    {kinds:['cooking']},
    {kinds:['crafting'],routeStatuses:['confirmed_source_link']},
    {kinds:['fishing'],sourceKinds:['verified_game_native']},
    {kinds:['loot'],routeStatuses:['static_candidate_only']},
    {kinds:['other'],routeStatuses:['static_candidate_only']},
    {routeStatuses:['confirmed_source_link']},
    {routeStatuses:['static_candidate_only']},
    {kinds:['loot'],routeStatuses:['confirmed_source_link']},
    {sourceKinds:['official_publication']}
  ];
  for(const selection of selections){
    const original=source.query(selection,{offset:0,limit:500});
    const page=r.search({source:selection,limit:120});
    assert.equal(page.totalItemIds,original.totalItemIds);
    assert.equal(page.totalSourceRelations,original.totalOriginRelations);
    const ids=[];
    for(let offset=0;;){
      const part=r.search({source:selection,offset,limit:97});
      assert.equal(part.totalItemIds,original.totalItemIds);
      ids.push(...part.items.map(x=>x.itemId));
      for(const x of part.items){
        assert(x.original.origins.every(origin=>
          (selection.kinds===undefined||selection.kinds.includes(origin.kind))&&
          (selection.routeStatuses===undefined||
            selection.routeStatuses.includes(origin.routeStatus))&&
          (selection.sourceKinds===undefined||
            selection.sourceKinds.includes(origin.source.kind))));
      }
      if(part.nextOffset===null)break;
      offset=part.nextOffset;
    }
    const expected=[];
    for(let offset=0;;){
      const part=source.query(selection,{offset,limit:500});
      expected.push(...part.items.map(x=>x.itemId));
      if(!part.hasMore)break;
      offset+=part.items.length;
    }
    assert.deepEqual(ids,expected);
  }
  const loot=r.search({source:{
    kinds:['loot'],routeStatuses:['static_candidate_only']
  }});
  assert(loot.items.length>0);
  assert(loot.items.every(x=>x.confirmedDefinitionReferences===0&&
    x.unverifiedStaticCandidates>0&&
    x.guaranteedDropVerified===false));
});

test('published-only and localized name/Item ID text filters are applied after the actual source predicates',async()=>{
  const pub=await shared(),r=await pub.loadAllOriginalSourceSearch();
  const source=await pub.acquisition.loadAllOriginalItemSources();
  const published=source.knownLinkedItemIds.filter(id=>
    pub.database.getItem(id)!==null);
  const subset=r.search({publishedOnly:true,limit:120});
  assert.equal(subset.totalItemIds,published.length);
  assert(subset.items.every(x=>x.shared.catalog!==null));
  const id=published.find(x=>pub.database.getItem(x)?.names.ja?.length>=3);
  assert(id);
  const text=pub.database.getItem(id).names.ja.slice(0,3);
  const nameResult=r.search({locale:'ja',text});
  assert(nameResult.totalItemIds>0);
  const allNames=[];
  for(let offset=0;;){
    const p=r.search({locale:'ja',text,offset,limit:120});
    allNames.push(...p.items.map(x=>x.itemId));
    if(p.nextOffset===null)break;
    offset=p.nextOffset;
  }
  assert(allNames.includes(id));
  assert(allNames.every(x=>x.startsWith(text.toLowerCase())||
    pub.database.getItem(x)?.names.ja?.normalize('NFKC')
      .toLocaleLowerCase().includes(text.normalize('NFKC').toLowerCase())));
  const idPrefix=published[0].slice(0,5);
  const searched=r.search({text:idPrefix});
  assert(searched.totalItemIds>0);
  assert(searched.items.some(x=>x.itemId.startsWith(idPrefix)));
  assert.equal(r.search({text:'__never_existing_source_name__'}).totalItemIds,0);
  const filtered=r.search({source:{
    kinds:['cooking']},publishedOnly:true,offset:0,limit:120});
  const expected=source.query({kinds:['cooking']},{limit:500});
  assert(filtered.totalItemIds<=expected.totalItemIds);
  assert(filtered.items.every(x=>x.shared.catalog!==null&&
    x.original.origins.every(o=>o.kind==='cooking')));
  const after=r.search({source:{
    routeStatuses:['confirmed_source_link']
  },text:idPrefix,publishedOnly:true});
  assert(after.items.every(x=>x.shared.catalog!==null&&
    x.original.origins.every(y=>
      y.routeStatus==='confirmed_source_link')));
});

test('malformed requests, wrong source census and corrupted native original asset fail closed',async()=>{
  const pub=await shared(),r=await pub.loadAllOriginalSourceSearch();
  assert.throws(()=>r.search({source:{kinds:['not_real']}}),
    /DB02_ITEM_SOURCE_BROWSER_/);
  assert.throws(()=>r.search({source:{routeStatuses:['owned']}}),
    /DB02_ITEM_SOURCE_BROWSER_/);
  assert.throws(()=>r.search({source:{sourceKinds:['guess']}}),
    /DB02_ITEM_SOURCE_BROWSER_/);
  assert.throws(()=>r.search({text:'bad\nname'}),/INVALID_TEXT/);
  assert.throws(()=>r.search({locale:'ko'}),/INVALID_LOCALE/);
  assert.throws(()=>r.search({limit:121}),/INVALID_PAGING/);
  assert.throws(()=>r.search({offset:-1}),/INVALID_PAGING/);
  assert.throws(()=>r.search({publishedOnly:false}),/INVALID_PUBLISHED_FILTER/);
  assert.throws(()=>r.getItem('0400000001'),/invalid numeric Item ID/);
  const original=await pub.acquisition.loadAllOriginalItemSources();
  assert.throws(()=>createDb00AllOriginalSourceReader(
    pub.database,pub.joined,{
      ...original,coverage:{
        ...original.coverage,staticCandidateRelations:4238
      }
    }
  ),/SOURCE_AUTHENTICATED_CURRENT_SNAPSHOT_REQUIRED/);
  const fake=await openPublicSharedGameSources('/Wand',
    localFetcher({corrupt:'native-loot-candidates-1.26.2.json'}).fetcher);
  const error=await fake.loadAllOriginalSourceSearch()
    .then(()=>null,e=>e);
  assert(error instanceof Error);
  assert(/SHA|INTEGRITY|HASH/i.test(error.message));
});
