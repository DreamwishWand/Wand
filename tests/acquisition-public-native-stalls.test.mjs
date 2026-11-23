import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {
  DB02_NATIVE_STALL_FILE,DB02_NATIVE_STALL_BYTES,DB02_NATIVE_STALL_SHA256,
  DB02_NATIVE_STALL_BUILDING_SHA256,DB02_NATIVE_STALL_LOOT_SHA256,
  loadPinnedNativeStallSlots,joinPinnedNativeStallLoot,
  hasPinnedNativeStallSlotEvidence
} from '../src/lib/acquisition/public-native-stalls.ts';
import {
  DB02_NATIVE_LOOT_FILE,loadPinnedNativeLootCandidates
} from '../src/lib/acquisition/public-native-loot.ts';

const root=new URL('../static/acquisition/public/',import.meta.url);
const file=readFileSync(new URL(DB02_NATIVE_STALL_FILE,root));
const loot=readFileSync(new URL(DB02_NATIVE_LOOT_FILE,root));
function localFetcher(opt={}){
  const seen=[];
  const fetcher=async url=>{
    seen.push(url);
    assert(url.startsWith('/Wand/acquisition/public/'),'unexpected request '+url);
    if(opt.missing)return new Response('not found',{status:404});
    const name=url.split('/').at(-1);
    const bytes=name===DB02_NATIVE_STALL_FILE?Buffer.from(file):
      name===DB02_NATIVE_LOOT_FILE?Buffer.from(loot):null;
    assert(bytes,'unexpected public asset '+url);
    if(opt.corrupt&&name===DB02_NATIVE_STALL_FILE)bytes[70]^=1;
    if(opt.short&&name===DB02_NATIVE_STALL_FILE)
      return new Response(bytes.subarray(0,-1),{status:200});
    return new Response(bytes,{status:200});
  };
  return {seen,fetcher};
}
test('65 source-native stall definitions preserve 335 slot table links and source SHA',async()=>{
  assert.equal(file.length,DB02_NATIVE_STALL_BYTES);
  assert.equal(createHash('sha256').update(file).digest('hex'),
    DB02_NATIVE_STALL_SHA256);
  const doc=JSON.parse(file);
  assert.equal(doc.sources.building.sha256,DB02_NATIVE_STALL_BUILDING_SHA256);
  assert.equal(doc.sources.loot.sha256,DB02_NATIVE_STALL_LOOT_SHA256);
  assert.equal(doc.sources.building.bytes,531572);
  assert.equal(doc.sources.loot.bytes,110133);
  const {seen,fetcher}=localFetcher();
  const index=await loadPinnedNativeStallSlots('/Wand',fetcher);
  assert.equal(seen.length,1);
  assert.equal(index.schema,'wand.db02.public-native-stall-slots@1');
  assert.equal(index.gameVersion,'1.26.2');
  assert.equal(index.source.sha256,DB02_NATIVE_STALL_BUILDING_SHA256);
  const c=index.coverage;
  assert.equal(c.nativeBuildingDefinitions,478);
  assert.equal(c.staticStallDefinitions,65);
  assert.equal(c.slotLootTableReferences,335);
  assert.equal(c.distinctReferencedLootTableIds,279);
  assert.equal(c.slotExpandedCandidateRelations,1385);
  assert.equal(c.distinctCandidateItemIds,606);
  assert.equal(c.distinctStallItemPairs,745);
  assert.equal(c.distinctStallTableItemTriples,1173);
  assert.equal(c.conditionalCandidateRelations,0);
  assert.equal(c.liveShopStockVerified,false);
  assert.equal(c.livePurchasePriceVerified,false);
  assert.equal(c.purchasabilityVerified,false);
  assert.equal(c.playerUnlockVerified,false);
  assert.equal(c.staticStorePoolOnly,true);
  assert.equal(index.stalls.length,65);
  assert.equal(new Set(index.stalls.map(x=>x.stallId)).size,65);
  assert.equal(index.stalls.reduce((n,x)=>n+x.slotLootTableIds.length,0),335);
  assert(hasPinnedNativeStallSlotEvidence(index));
  assert(!hasPinnedNativeStallSlotEvidence({...index}));
  assert(Object.isFrozen(index)&&Object.isFrozen(index.stalls)&&
    Object.isFrozen(index.coverage));
});
test('source order and duplicate references in the same stall are preserved exactly',async()=>{
  const source=await loadPinnedNativeStallSlots('/Wand',localFetcher().fetcher);
  const stall=source.getStall(20100000);
  assert(stall);
  assert.equal(stall.nameKey,'Gardening_Stall2_Meadow');
  assert.equal(stall.shopDataKey,'GardeningStall');
  assert.deepEqual(stall.slotLootTableIds,[
    '2090000056','2090000052','2090000057',
    '2090000052','2090000058','2090000052'
  ]);
  assert.equal(stall.shopDataFieldNumber,9);
  assert.equal(stall.slotTableFieldNumber,10);
  assert.equal(stall.liveStockVerified,false);
  assert.equal(stall.currentPricesVerified,false);
  assert(Object.isFrozen(stall)&&Object.isFrozen(stall.slotLootTableIds));
  const shops=source.getShopDataStalls('GardeningStall');
  assert.equal(shops.length,7);
  assert(shops.includes(stall));
  assert(source.listShopDataKeys().includes('GardeningStall'));
  const pool=source.getLootTableStalls('2090000052');
  assert(pool.includes(stall));
  assert.equal(pool.filter(x=>x.stallId===stall.stallId).length,1,
    'multiple same-slot refs do not duplicate stall definitions');
  assert.equal(source.getStall(20109999),null);
  assert.deepEqual(source.getShopDataStalls('MissingStore'),[]);
  assert.deepEqual(source.getLootTableStalls('2090099999'),[]);
});
test('joined public originals yield 1385 slot-expanded candidate relations and 606 distinct Items, never live sale claims',async()=>{
  const {seen,fetcher}=localFetcher();
  const [stalls,loot]=await Promise.all([
    loadPinnedNativeStallSlots('/Wand',fetcher),
    loadPinnedNativeLootCandidates('/Wand',fetcher)
  ]);
  assert.equal(seen.length,2);
  const joined=joinPinnedNativeStallLoot(stalls,loot);
  assert.equal(joined.schema,'wand.db02.native-stall-loot-join@1');
  assert.equal(joined.gameVersion,'1.26.2');
  assert.equal(joined.slotExpandedCandidates.length,1385);
  assert.equal(joined.staticCandidateOrigins.length,1385);
  assert.equal(joined.listCandidateItemIds().length,606);
  assert.equal(joined.coverage.liveShopStockVerified,false);
  assert.equal(joined.coverage.livePurchasePriceVerified,false);
  assert.equal(joined.coverage.purchasabilityVerified,false);
  assert.equal(joined.getStall('20100000')?.slots.length,6);
  const meadow=joined.getStall('20100000');
  assert(meadow);
  assert.equal(meadow.slots[0].lootTableId,'2090000056');
  assert.deepEqual(meadow.slots[0].candidateItemIds,['30400064']);
  assert.equal(meadow.slots[0].candidateRelations[0].itemId,'30400064');
  assert.equal(meadow.slots[0].candidateRelations[0].stallSlotReferenceVerified,true);
  assert.equal(meadow.slots[0].candidateRelations[0].itemInReferencedLootTableVerified,true);
  assert.equal(meadow.slots[0].candidateRelations[0].routeStatus,'static_candidate_only');
  assert.equal(meadow.slots[0].candidateRelations[0].purchaseEligibilityVerified,false);
  assert.deepEqual(meadow.slots[1].candidateItemIds,
    ['30200000','30200002','30200004','30200009','30200048']);
  assert.deepEqual(meadow.slots[1].candidateItemIds,meadow.slots[3].candidateItemIds);
  assert.equal(joined.getTableSlots('2090000052').some(x=>x.stallId==='20100000'),true);
  const item=joined.getItemCandidates('30200000');
  assert(item.some(x=>x.stallId==='20100000'&&x.slotIndex===1));
  assert(item.every(x=>x.liveStockVerified===false&&
    x.livePriceVerified===false&&x.purchaseEligibilityVerified===false));
  const origins=joined.getItemStaticOrigins('30200000');
  assert.equal(origins.length,item.length);
  assert(origins.every(x=>x.routeStatus==='static_candidate_only'&&
    x.kind==='game_shop'&&x.price===null&&
    x.availability==='not_live_verified'&&
    x.campaignId===null));
  assert.equal(new Set(joined.slotExpandedCandidates.map(x=>
    x.stallId+':'+x.itemId)).size,745);
  assert.equal(new Set(joined.slotExpandedCandidates.map(x=>
    x.stallId+':'+x.lootTableId+':'+x.itemId)).size,1173);
  assert(joined.slotExpandedCandidates.every(x=>x.conditionalLootEntry===false));
  assert(Object.isFrozen(joined)&&Object.isFrozen(meadow)&&
    Object.isFrozen(meadow.slots)&&Object.isFrozen(item)&&
    Object.isFrozen(origins)&&Object.isFrozen(joined.slotExpandedCandidates));
  assert.equal(joined.getStall('20109999'),null);
  assert.deepEqual(joined.getItemCandidates(99999999),[]);
  assert.deepEqual(joined.getItemStaticOrigins(99999999),[]);
  assert.deepEqual(joined.getTableSlots(2090999999),[]);
  assert.deepEqual(joined.getShopDataStalls('MissingStore'),[]);
});
test('SHA mismatch, malformed IDs and unpinned sources reject rather than fabricate stall availability',async()=>{
  await assert.rejects(loadPinnedNativeStallSlots(
    '/Wand',localFetcher({corrupt:true}).fetcher),/DB02_NATIVE_STALL_SHA/);
  await assert.rejects(loadPinnedNativeStallSlots(
    '/Wand',localFetcher({short:true}).fetcher),/DB02_NATIVE_STALL_BYTES/);
  await assert.rejects(loadPinnedNativeStallSlots(
    '/Wand',localFetcher({missing:true}).fetcher),/DB02_NATIVE_STALL_DOWNLOAD_FAILED/);
  await assert.rejects(loadPinnedNativeStallSlots(
    '/Wand/../private',localFetcher().fetcher),/DB02_NATIVE_STALL_INVALID_BASE_PATH/);
  const f=localFetcher();
  const [stalls,loot]=await Promise.all([
    loadPinnedNativeStallSlots('/Wand',f.fetcher),
    loadPinnedNativeLootCandidates('/Wand',f.fetcher)
  ]);
  assert.throws(()=>stalls.getStall('020100000'),/INVALID_ITEM_ID/);
  assert.throws(()=>stalls.getShopDataStalls('__Invalid Space'),/INVALID_NATIVE_KEY/);
  assert.throws(()=>joinPinnedNativeStallLoot({...stalls},loot),
    /PINNED_ORIGINAL_SOURCES_REQUIRED/);
  assert.throws(()=>joinPinnedNativeStallLoot(stalls,{...loot}),
    /PINNED_ORIGINAL_SOURCES_REQUIRED/);
});
