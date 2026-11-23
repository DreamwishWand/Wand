import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  createDb00NativeLootReader,DB00_NATIVE_LOOT_CONTRACT
} from '../src/lib/game-db/native-loot.ts';
import {openPublicSharedGameSources}
  from '../src/lib/game-db/public-sources.ts';

const ROOT=new URL('../static/',import.meta.url);
const LOOT='native-loot-candidates-1.26.2.json';
const ACTIVITY='activity-result-paths-1.26.2.json';
const RECIPE='recipe-results-1.26.2.json';
function fetchLocal({corrupt=false,missing=false}={}){
  const urls=[];
  const fetcher=async url=>{
    assert(typeof url==='string'&&url.startsWith('/Wand/')&&!url.includes('..'));
    urls.push(url);
    if(missing&&url.endsWith('/'+LOOT))
      return new Response('missing',{status:404});
    let bytes;
    try{bytes=readFileSync(new URL(url.slice(6),ROOT));}
    catch{return new Response('missing',{status:404});}
    if(corrupt&&url.endsWith('/'+LOOT)){
      bytes=Buffer.from(bytes);bytes[70]^=1;
    }
    return new Response(bytes,{status:200});
  };
  return {urls,fetcher};
}
let cachedApp;
function app(){return cachedApp??=openPublicSharedGameSources('/Wand',
  fetchLocal().fetcher);}

test('static 3,804 candidate reader is SHA-checked and lazy without changing baseline 1,255 sources',async()=>{
  const {urls,fetcher}=fetchLocal();
  const current=await openPublicSharedGameSources('/Wand',fetcher);
  const count=urls.length;
  assert(count>0);
  assert(!urls.some(url=>url.endsWith('/'+LOOT)));
  const reader=await current.loadNativeLootCandidateSources();
  assert.equal(reader,await current.loadNativeLootCandidateSources());
  assert.equal(reader.contract,DB00_NATIVE_LOOT_CONTRACT);
  assert.equal(reader.snapshotId,current.snapshotId);
  assert.equal(reader.originalTables,960);
  assert.equal(reader.originalGroups,2087);
  assert.equal(reader.staticCandidateRelations,3804);
  assert.equal(reader.distinctCandidateItemIds,1100);
  assert.equal(reader.sourceCandidateOnly,true);
  assert.equal(reader.guaranteedDropVerified,false);
  assert.equal(reader.actualGameplayContextVerified,false);
  assert.equal(reader.playerOwnershipVerified,false);
  assert.equal(urls.length,count+1);
  assert.equal(urls.filter(url=>url.endsWith('/'+LOOT)).length,1);
  assert.equal(await current.acquisition.loadNativeLootCandidates() instanceof Object,true);
  assert.equal(urls.length,count+1);
  assert.equal(current.acquisition.coverage.combinedSourceRoutes,1255);
  assert(Object.isFrozen(reader));
});

test('bidirectional LootTable and Item lookups preserve group indices, conditional gates and static status',async()=>{
  const current=await app();
  const reader=await current.loadNativeLootCandidateSources();
  const original=await current.acquisition.loadNativeLootCandidates();
  assert.equal(original.coverage.candidateRelations,3804);
  assert.equal(original.coverage.nativeTables,960);
  assert.equal(original.coverage.conditionalEntryReferences,60);
  assert.equal(original.coverage.dynamicFilterGroups,163);
  assert.equal(original.coverage.eligibilityGateGroups,11);
  const nativeTable=original.tables.find(t=>t.groups.some(g=>g.candidates.length>0));
  assert(nativeTable);
  const table=reader.getTable(nativeTable.tableId);
  assert(table);
  assert.equal(table.originalTable,nativeTable);
  assert.equal(table.groups.length,nativeTable.groups.length);
  assert.equal(table.sourceCandidateOnly,true);
  assert.equal(table.tableUsageContextVerified,false);
  const nativeGroup=nativeTable.groups.find(g=>g.candidates.length>0);
  assert(nativeGroup);
  const group=reader.getGroup(nativeTable.tableId,nativeGroup.groupIndex);
  assert(group);
  assert.equal(group.originalGroup,nativeGroup);
  assert.deepEqual(group.entries.map(x=>x.candidate),nativeGroup.candidates);
  assert.equal(group.groupRuntimeEligibilityVerified,false);
  const candidate=nativeGroup.candidates[0];
  const found=reader.getItem(candidate.itemId);
  assert(found.candidates.includes(candidate));
  assert(found.staticCandidateOrigins.some(o=>
    o.originId==='native:path:'+candidate.pathId &&
    o.routeStatus==='static_candidate_only' &&
    o.kind==='loot' &&
    o.availability==='not_live_verified'));
  assert.equal(found.itemId,candidate.itemId);
  assert.deepEqual(found.item,current.getItem(candidate.itemId));
  assert.equal(found.currentAvailabilityVerified,false);
  assert.equal(found.guaranteedDropVerified,false);
  assert.equal(found.playerOwnershipVerified,false);
  assert.equal(found.collectionUiMembershipVerified,false);
  assert.equal(reader.getTable('999999999'),null);
  assert.equal(reader.getGroup('999999999',0),null);
  assert.deepEqual(reader.getItem('999999999').candidates,[]);
  assert(Object.isFrozen(found)&&Object.isFrozen(group)&&Object.isFrozen(group.entries));
});

test('all 1,100 unique candidate IDs page in numerical order and retain 3,804 exact original links',async()=>{
  const current=await app();
  const reader=await current.loadNativeLootCandidateSources();
  const original=await current.acquisition.loadNativeLootCandidates();
  const rows=[];
  for(let offset=0;;){
    const page=reader.search({offset,limit:113});
    assert.equal(page.scope,'original_static_loot_candidates_only');
    assert.equal(page.total,1100);
    assert.equal(page.guaranteedDropVerified,false);
    assert.equal(page.actualGameplayContextVerified,false);
    assert.equal(page.playerOwnershipVerified,false);
    rows.push(...page.items);
    if(page.nextOffset===null)break;
    assert(page.nextOffset>offset);
    offset=page.nextOffset;
  }
  assert.equal(rows.length,1100);
  assert.equal(new Set(rows.map(row=>row.itemId)).size,1100);
  assert.deepEqual(rows.map(row=>row.itemId),
    original.listCandidateItemIds());
  assert.equal(rows.reduce((sum,row)=>sum+row.candidates.length,0),3804);
  assert(rows.every(row=>row.candidates.length===row.staticCandidateOrigins.length));
  const published=reader.search({publishedOnly:true});
  assert(published.total>0&&published.total<=1100);
  assert(published.items.every(row=>row.item.catalog!==null));
  const first=rows[0];
  assert(reader.search({text:first.itemId}).items.some(row=>
    row.itemId===first.itemId));
  assert.equal(reader.search({text:'not_a_real_item'}).total,0);
  assert.throws(()=>reader.search({publishedOnly:false}),/INVALID_PUBLISHED_FILTER/);
  assert.throws(()=>reader.search({locale:'ko'}),/INVALID_LOCALE/);
  assert.throws(()=>reader.search({offset:-1}),/INVALID_PAGE/);
  assert.throws(()=>reader.search({limit:501}),/INVALID_PAGE/);
  assert.throws(()=>reader.search({text:'invalid\ntext'}),/INVALID_TEXT/);
  assert.throws(()=>reader.getItem('000123'),/invalid numeric Item ID/);
});

test('optional all-native source view fetches 3 files once and keeps LootTable links separate from recipes/routes',async()=>{
  const {urls,fetcher}=fetchLocal();
  const current=await openPublicSharedGameSources('/Wand',fetcher);
  const starting=urls.length;
  for(const name of [LOOT,RECIPE,ACTIVITY])
    assert(!urls.some(url=>url.endsWith('/'+name)));
  const loot=await current.acquisition.loadNativeLootCandidates();
  const id=loot.listCandidateItemIds()[0];
  const evidence=await current.getAllNativeAcquisitionEvidence(id);
  assert.equal(urls.length,starting+3);
  assert.equal(evidence.itemId,id);
  assert.equal(evidence.recipes.itemId,id);
  assert.equal(evidence.activities.itemId,id);
  assert.equal(evidence.loot.itemId,id);
  assert.equal(evidence.staticLootCandidateCount,loot.getItemCandidates(id).length);
  assert.equal(evidence.nativeResultDefinitionCount,
    evidence.recipes.recipes.length+evidence.activities.sourcePaths.length);
  assert.equal(evidence.guaranteedLootDropVerified,false);
  assert.equal(evidence.actualLootContextVerified,false);
  assert.equal(evidence.staticSourceOnly,true);
  assert.equal(evidence.acquisitionRouteCoverageComplete,false);
  assert.equal(evidence.playerOwnershipVerified,false);
  assert.equal(evidence.collectionUiMembershipVerified,false);
  for(const name of [LOOT,RECIPE,ACTIVITY])
    assert.equal(urls.filter(url=>url.endsWith('/'+name)).length,1);
  assert.deepEqual(current.getItem(id).origins,evidence.shared.origins);
  const next=await current.getAllNativeAcquisitionEvidence(id);
  assert.equal(next.staticLootCandidateCount,evidence.staticLootCandidateCount);
  assert.equal(urls.length,starting+3);
  assert(Object.isFrozen(evidence));
  await assert.rejects(current.getAllNativeAcquisitionEvidence('wrong'),
    /invalid numeric Item ID/);
  assert.equal(urls.length,starting+3);
});

test('reject fabricated DB-02 source, tampered public bytes and missing 1.26.2 release',async()=>{
  const current=await app();
  const original=await current.acquisition.loadNativeLootCandidates();
  assert.throws(()=>createDb00NativeLootReader(
    current.database,current.joined,{...original,coverage:{...original.coverage}}
  ),/PINNED_DB02_LOOT_SOURCE_REQUIRED/);
  const bad=await openPublicSharedGameSources('/Wand',
    fetchLocal({corrupt:true}).fetcher);
  await assert.rejects(bad.loadNativeLootCandidateSources(),
    /DB02_NATIVE_LOOT_SHA/);
  await assert.rejects(bad.getAllNativeAcquisitionEvidence('31000029'),
    /DB02_NATIVE_LOOT_SHA/);
  const missing=await openPublicSharedGameSources('/Wand',
    fetchLocal({missing:true}).fetcher);
  await assert.rejects(missing.loadNativeLootCandidateSources(),
    /DB02_NATIVE_LOOT_DOWNLOAD_FAILED/);
  assert.equal(missing.database.itemCount,13202);
});
