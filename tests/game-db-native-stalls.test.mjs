import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openPublicSharedGameSources}
  from '../src/lib/game-db/public-sources.ts';
import {
  createDb00NativeStallReader,DB00_NATIVE_STALL_CONTRACT
} from '../src/lib/game-db/native-stalls.ts';

const ROOT=new URL('../static/',import.meta.url);
const STALL='native-stall-slots-1.26.2.json';
const LOOT='native-loot-candidates-1.26.2.json';
function localFetcher({corrupt=false,missing=false}={}){
  const seen=[];
  const fetcher=async url=>{
    assert(typeof url==='string'&&url.startsWith('/Wand/')&&!url.includes('..'));
    seen.push(url);
    if(missing&&url.endsWith('/'+STALL))
      return new Response('not found',{status:404});
    let bytes;
    try{bytes=readFileSync(new URL(url.slice(6),ROOT));}
    catch{return new Response('missing',{status:404});}
    if(corrupt&&url.endsWith('/'+STALL)){
      bytes=Buffer.from(bytes);bytes[72]^=1;
    }
    return new Response(bytes,{status:200});
  };
  return {seen,fetcher};
}
let currentPromise;
const open=()=>currentPromise??=
  openPublicSharedGameSources('/Wand',localFetcher().fetcher);

test('DB-00 does not fetch 65 native stalls until asked; source loaders share two SHA-pinned HTTP bodies',async()=>{
  const {seen,fetcher}=localFetcher();
  const app=await openPublicSharedGameSources('/Wand',fetcher);
  const startup=seen.length;
  assert(startup>0);
  assert(!seen.some(url=>url.endsWith('/'+STALL)||url.endsWith('/'+LOOT)));
  const reader=await app.loadNativeStallPoolSources();
  assert.equal(reader,await app.loadNativeStallPoolSources());
  assert.equal(reader.contract,DB00_NATIVE_STALL_CONTRACT);
  assert.equal(reader.snapshotId,app.snapshotId);
  assert.equal(reader.staticStalls,65);
  assert.equal(reader.originalSlotReferences,335);
  assert.equal(reader.staticSlotCandidateRelations,1385);
  assert.equal(reader.distinctCandidateItemIds,606);
  assert.equal(reader.staticPoolOnly,true);
  assert.equal(reader.liveShopAvailabilityVerified,false);
  assert.equal(reader.currentPricesVerified,false);
  assert.equal(reader.playerOwnershipVerified,false);
  assert.equal(seen.length,startup+2);
  assert.equal(seen.filter(url=>url.endsWith('/'+STALL)).length,1);
  assert.equal(seen.filter(url=>url.endsWith('/'+LOOT)).length,1);
  assert.equal(await app.loadNativeLootCandidateSources() instanceof Object,true);
  assert.equal(await app.acquisition.loadNativeStallSources() instanceof Object,true);
  assert.equal(seen.length,startup+2);
  assert.equal(app.acquisition.coverage.combinedSourceRoutes,1255);
  assert(Object.isFrozen(reader));
});

test('exact original meadow stall duplicates, slot order and reverse Item references never imply stocked products',async()=>{
  const app=await open();
  const reader=await app.loadNativeStallPoolSources();
  const meadow=reader.getStall(20100000);
  assert(meadow);
  assert.equal(meadow.sourceStall.stall.stallId,'20100000');
  assert.equal(meadow.sourceStall.stall.nameKey,'Gardening_Stall2_Meadow');
  assert.equal(meadow.sourceStall.stall.shopDataKey,'GardeningStall');
  assert.equal(meadow.stallItem.itemId,'20100000');
  assert.equal(meadow.slots.length,6);
  assert.deepEqual(meadow.slots.map(s=>s.sourceSlot.lootTableId),[
    '2090000056','2090000052','2090000057',
    '2090000052','2090000058','2090000052'
  ]);
  assert.equal(meadow.slots[0].entries.length,1);
  assert.equal(meadow.slots[0].entries[0].item.itemId,'30400064');
  // Slot entries preserve original LootTable order, NOT sorted Item IDs.
  assert.deepEqual(meadow.slots[1].entries.map(e=>e.item.itemId),
    ['30200009','30200004','30200000','30200002','30200048']);
  // The source slot's candidateItemIds set is separately sorted for filtering.
  assert.deepEqual(meadow.slots[1].sourceSlot.candidateItemIds,
    ['30200000','30200002','30200004','30200009','30200048']);
  assert.deepEqual(meadow.slots[1].entries.map(e=>e.item.itemId),
    meadow.slots[3].entries.map(e=>e.item.itemId));
  const item=reader.getItem(30200000);
  assert(item.staticSlotCandidates.some(candidate=>
    candidate.stallId==='20100000'&&candidate.slotIndex===1));
  assert.equal(item.staticSlotOrigins.length,item.staticSlotCandidates.length);
  assert(item.staticSlotOrigins.every(origin=>
    origin.routeStatus==='static_candidate_only' &&
    origin.kind==='game_shop' && origin.price===null &&
    origin.availability==='not_live_verified'));
  assert.equal(item.currentShopStockVerified,false);
  assert.equal(item.currentPricesVerified,false);
  assert.equal(item.purchasingEligibilityVerified,false);
  assert.equal(item.playerOwnershipVerified,false);
  assert.equal(item.collectionUiMembershipVerified,false);
  assert.equal(meadow.liveShopAvailabilityVerified,false);
  assert.equal(meadow.currentPricesVerified,false);
  assert.equal(meadow.playerUnlockVerified,false);
  const slots=reader.getTableSlots('2090000052');
  assert(slots.filter(slot=>
    slot.sourceSlot.stallId==='20100000').length>=3);
  assert(reader.getShopDataStalls('GardeningStall').length===7);
  assert(reader.listShopDataKeys().includes('GardeningStall'));
  assert.equal(reader.getStall(20109999),null);
  assert.deepEqual(reader.getItem(99999999).staticSlotCandidates,[]);
  assert.deepEqual(reader.getTableSlots('2090099999'),[]);
  assert.deepEqual(reader.getShopDataStalls('MissingStore'),[]);
  assert(Object.isFrozen(meadow)&&Object.isFrozen(meadow.slots)&&
    Object.isFrozen(meadow.slots[0].entries)&&Object.isFrozen(item));
});

test('all 606 unique stall candidate Item IDs preserve 1,385 source positions with pagination and published name search',async()=>{
  const app=await open();
  const reader=await app.loadNativeStallPoolSources();
  const native=await app.acquisition.loadNativeStallSources();
  const result=[];
  for(let offset=0;;){
    const page=reader.searchItems({offset,limit:83});
    assert.equal(page.scope,'original_stall_slot_candidates_only');
    assert.equal(page.total,606);
    assert.equal(page.currentShopStockVerified,false);
    assert.equal(page.currentPricesVerified,false);
    assert.equal(page.purchasingEligibilityVerified,false);
    assert.equal(page.collectionUiMembershipVerified,false);
    result.push(...page.items);
    if(page.nextOffset===null)break;
    assert(page.nextOffset>offset);
    offset=page.nextOffset;
  }
  assert.equal(result.length,606);
  assert.equal(new Set(result.map(item=>item.itemId)).size,606);
  assert.deepEqual(result.map(item=>item.itemId),native.listCandidateItemIds());
  assert.equal(result.reduce((sum,item)=>
    sum+item.staticSlotCandidates.length,0),1385);
  assert(result.every(item=>item.staticSlotCandidates.length===
    item.staticSlotOrigins.length));
  assert(result.every(item=>item.item.itemId===item.itemId));
  const published=reader.searchItems({publishedOnly:true});
  assert(published.total>0&&published.total<=606);
  assert(published.items.every(item=>item.item.catalog!==null));
  const sample=result[0];
  assert(reader.searchItems({text:sample.itemId}).items.some(item=>
    item.itemId===sample.itemId));
  assert.equal(reader.searchItems({text:'absent_unreal_item'}).total,0);
  assert.throws(()=>reader.searchItems({locale:'ko'}),/INVALID_LOCALE/);
  assert.throws(()=>reader.searchItems({publishedOnly:false}),/INVALID_PUBLISHED_FILTER/);
  assert.throws(()=>reader.searchItems({limit:501}),/INVALID_PAGE/);
  assert.throws(()=>reader.searchItems({offset:-1}),/INVALID_PAGE/);
  assert.throws(()=>reader.searchItems({text:'bad\ntext'}),/INVALID_TEXT/);
  assert.throws(()=>reader.getItem('030200000'),/invalid numeric Item ID/);
});

test('all source stalls and slots exhaust 335 original refs and 1,385 candidates with source order',async()=>{
  const app=await open();
  const reader=await app.loadNativeStallPoolSources();
  const raw=await app.acquisition.loadNativeStallSources();
  let slots=0,entries=0;
  for(const sourceStall of raw.stallDefinitions.stalls){
    const stall=reader.getStall(sourceStall.stallId);
    assert(stall);
    assert.equal(stall.sourceStall.stall,sourceStall);
    assert.equal(stall.slots.length,sourceStall.slotLootTableIds.length);
    for(let i=0;i<stall.slots.length;i++){
      const slot=stall.slots[i];
      const rawSlot=stall.sourceStall.slots[i];
      assert.equal(slot.sourceSlot,rawSlot);
      assert.equal(slot.entries.length,rawSlot.candidateRelations.length);
      for(let k=0;k<slot.entries.length;k++){
        const entry=slot.entries[k];
        assert.equal(entry.candidate,rawSlot.candidateRelations[k]);
        assert.equal(entry.item.itemId,entry.candidate.itemId);
        assert.equal(entry.currentShopStockVerified,false);
        assert.equal(entry.currentPricesVerified,false);
        assert.equal(entry.staticPoolOnly,true);
      }
      slots++;entries+=slot.entries.length;
    }
  }
  assert.equal(slots,335);
  assert.equal(entries,1385);
  assert.equal(new Set(raw.slotExpandedCandidates.map(x=>
    x.stallId+':'+x.itemId)).size,745);
});

test('one Item evidence query adds only 2 optional source URLs and never promotes static offers to live stock',async()=>{
  const {seen,fetcher}=localFetcher();
  const app=await openPublicSharedGameSources('/Wand',fetcher);
  const start=seen.length;
  const original=app.getItem(30200000);
  const lookup=await app.getNativeStallCandidateEvidence(30200000);
  assert.equal(seen.length,start+2);
  assert.equal(lookup.itemId,'30200000');
  assert.deepEqual(lookup.shared,original);
  assert.equal(lookup.stalls.itemId,lookup.itemId);
  assert(lookup.staticStallSlotCandidateCount>0);
  assert.equal(lookup.staticStallSlotCandidateCount,
    lookup.stalls.staticSlotCandidates.length);
  assert.equal(lookup.staticStorePoolOnly,true);
  assert.equal(lookup.liveShopStockVerified,false);
  assert.equal(lookup.livePurchasePriceVerified,false);
  assert.equal(lookup.purchasingEligibilityVerified,false);
  assert.equal(lookup.playerOwnershipVerified,false);
  assert.deepEqual(app.getItem(30200000).origins,original.origins);
  assert(Object.isFrozen(lookup));
  const next=await app.getNativeStallCandidateEvidence(30200000);
  assert.equal(next.staticStallSlotCandidateCount,
    lookup.staticStallSlotCandidateCount);
  assert.equal(seen.length,start+2);
  await assert.rejects(app.getNativeStallCandidateEvidence('bad-id'),
    /invalid numeric Item ID/);
  assert.equal(seen.length,start+2);
});

test('fabricated source index and corrupted native stall bytes fail closed',async()=>{
  const app=await open();
  const original=await app.acquisition.loadNativeStallSources();
  assert.throws(()=>createDb00NativeStallReader(
    app.database,app.joined,{
      ...original,stallDefinitions:{...original.stallDefinitions}
    }
  ),/PINNED_DB02_STALL_SOURCE_REQUIRED/);
  const {seen,fetcher}=localFetcher({corrupt:true});
  const bad=await openPublicSharedGameSources('/Wand',fetcher);
  await assert.rejects(bad.loadNativeStallPoolSources(),
    /DB02_NATIVE_STALL_SHA/);
  await assert.rejects(bad.getNativeStallCandidateEvidence('30200000'),
    /DB02_NATIVE_STALL_SHA/);
  assert.equal(seen.filter(url=>url.endsWith('/'+STALL)).length,1);
  const missing=await openPublicSharedGameSources('/Wand',
    localFetcher({missing:true}).fetcher);
  await assert.rejects(missing.loadNativeStallPoolSources(),
    /DB02_NATIVE_STALL_DOWNLOAD_FAILED/);
  assert.equal(missing.database.itemCount,13202);
});
