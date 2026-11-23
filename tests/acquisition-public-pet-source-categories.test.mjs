import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {
  DB02_PET_SOURCE_FILE,DB02_PET_SOURCE_BYTES,DB02_PET_SOURCE_SHA,
  loadPinnedNativePetSourceCategories,hasPinnedNativePetSourceEvidence
} from '../src/lib/acquisition/public-pet-source-categories.ts';

const PATH=new URL('../static/acquisition/public/'+DB02_PET_SOURCE_FILE,import.meta.url);
const SOURCE=readFileSync(PATH);
const EXPECTED={
  quest:8,timebending:1,event:9,star_path:7,
  premium_shop:95,exclusive_promotion:14
};

function localFetcher({corrupt=false}={}){
  return async url=>{
    assert.equal(url,'/Wand/acquisition/public/'+DB02_PET_SOURCE_FILE);
    const bytes=Buffer.from(SOURCE);
    if(corrupt)bytes[50]^=1;
    return new Response(bytes,{status:200});
  };
}

test('exact 1.26.2 pet source groups are byte-verified and separately categorized',async()=>{
  assert.equal(SOURCE.byteLength,DB02_PET_SOURCE_BYTES);
  assert.equal(createHash('sha256').update(SOURCE).digest('hex'),
    DB02_PET_SOURCE_SHA);
  const index=await loadPinnedNativePetSourceCategories('/Wand',localFetcher());
  assert(hasPinnedNativePetSourceEvidence(index));
  assert(Object.isFrozen(index));
  assert(Object.isFrozen(index.classifications));
  assert.equal(index.coverage.explicitSourceRows,134);
  assert.equal(index.coverage.nativePremiumStorePetIds,95);
  assert.equal(index.coverage.nativeExclusivePromotionPetIds,14);
  assert.equal(index.coverage.specificOnlineCampaignLinksVerified,0);
  assert.equal(index.coverage.allItemTypesCovered,false);
  assert.equal(index.coverage.playerAcquisitionVerified,false);
  assert.equal(index.originalSha256,
    '62008c61bf0b407c40d0adf417db043ab058f4ec0ca2764355e176a3532c2219');
  for(const [kind,count] of Object.entries(EXPECTED)){
    const ids=index.getCategoryItemIds(kind);
    assert.equal(ids.length,count,kind);
    assert(Object.isFrozen(ids));
    assert(ids.every((id,i)=>i===0||Number(id)>Number(ids[i-1])));
    assert(ids.every(id=>index.getItemCategories(id).includes(kind)));
  }
  assert.equal(index.getItemCategories('120000043')[0],'exclusive_promotion');
  assert.equal(index.getItemCategories('120000252')[0],'exclusive_promotion');
  assert.equal(index.getItemCategories('120000249').length,0);
  assert.equal(index.getItemCategories('40005840').length,0);
  assert.equal(index.getCategoryItemIds('exclusive_promotion').includes('120000252'),true);
  const item=index.getItemClassifications('120000043')[0];
  assert(item);
  assert(Object.isFrozen(item));
  assert.equal(item.originalFieldNumber,9);
  assert.equal(item.sourceCategoryOnly,true);
  assert.equal(item.campaignLinkVerified,false);
  assert.equal(item.playerAcquisitionVerified,false);
  assert.deepEqual(index.getItemClassifications('120000249'),[]);
  assert(!hasPinnedNativePetSourceEvidence({ ...index }));
});

test('corruption and unsupported source categories fail closed',async()=>{
  await assert.rejects(
    loadPinnedNativePetSourceCategories('/Wand',localFetcher({corrupt:true})),
    /DB02_PET_SOURCE_SHA/
  );
  await assert.rejects(
    loadPinnedNativePetSourceCategories('/bad/../x',localFetcher()),
    /DB02_PET_SOURCE_INVALID_BASE_PATH/
  );
  const index=await loadPinnedNativePetSourceCategories('/Wand',localFetcher());
  assert.throws(()=>index.getItemCategories('0120000043'),/INVALID_ITEM_ID/);
  assert.throws(()=>index.getCategoryItemIds('twitch_drop'),/INVALID_CATEGORY/);
});
