import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {
  DB02_ONLINE_CATEGORY_FILE,DB02_ONLINE_CATEGORY_BYTES,
  DB02_ONLINE_CATEGORY_SHA256,loadPinnedNativeOnlineCategories,
  hasPinnedNativeOnlineCategoryEvidence
} from '../src/lib/acquisition/public-online-categories.ts';

const path=new URL('../static/acquisition/public/'+DB02_ONLINE_CATEGORY_FILE,import.meta.url);
const bytes=readFileSync(path);
const expected={
  Furniture:[929,197],Clothing:[541,109],Trimming:[33,17],
  MountGear:[7,5],Makeup:[15,5],Tool:[86,17],
  Character:[2,0],Companion:[111,11],Skin:[106,7]
};
function fetcher(opts={}){
  const urls=[];
  return {
    urls,
    fetcher:async url=>{
      urls.push(url);
      assert.equal(url,'/Wand/acquisition/public/'+DB02_ONLINE_CATEGORY_FILE);
      if(opts.missing)return new Response('missing',{status:404});
      const body=Buffer.from(bytes);
      if(opts.corrupt)body[90]^=1;
      return new Response(body,{status:200});
    }
  };
}
test('9 native families provide exactly 2198 source categories, no shop or campaign claims',async()=>{
  assert.equal(bytes.length,DB02_ONLINE_CATEGORY_BYTES);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),
    DB02_ONLINE_CATEGORY_SHA256);
  const data=JSON.parse(bytes);
  assert.equal(data.families.length,9);
  assert.equal(data.coverage.sourceDefinitionRecords,10109);
  const index=await loadPinnedNativeOnlineCategories('/Wand',fetcher().fetcher);
  assert.equal(index.schema,'wand.db02.native-online-category@1');
  assert(hasPinnedNativeOnlineCategoryEvidence(index));
  assert(!hasPinnedNativeOnlineCategoryEvidence({...index}));
  assert.equal(index.nativeEnum,'Definitions.Items.OnlineCategory');
  assert.equal(index.coverage.sourceFamilies,9);
  assert.equal(index.coverage.explicitNonzeroCategoryRows,2198);
  assert.equal(index.coverage.premiumCategoryRows,1830);
  assert.equal(index.coverage.timeLimitedCategoryRows,368);
  assert.equal(index.coverage.singleOfferOrCampaignLinkVerified,false);
  assert.equal(index.coverage.playerAcquisitionVerified,false);
  assert.equal(index.coverage.currentAvailabilityVerified,false);
  assert.equal(index.coverage.allItemTypesCovered,false);
  assert.equal(index.rows.length,2198);
  assert.equal(new Set(index.rows.map(x=>x.itemId)).size,2198);
  assert(Object.isFrozen(index)&&Object.isFrozen(index.rows));
  assert.equal(index.getCategoryItemIds('premium').length,1830);
  assert.equal(index.getCategoryItemIds('time_limited').length,368);
  assert(Object.isFrozen(index.getCategoryItemIds('premium')));
  for(const [family,counts] of Object.entries(expected)){
    assert.deepEqual(
      ['premium','time_limited'].map(kind=>
        index.getFamilyCategoryItemIds(family,kind).length),
      counts,family);
    for(const kind of ['premium','time_limited']){
      const ids=index.getFamilyCategoryItemIds(family,kind);
      assert(Object.isFrozen(ids));
      assert(ids.every((id,i)=>i===0||Number(id)>Number(ids[i-1])));
      assert(ids.every(id=>index.getItemCategories(id).includes(kind)));
    }
  }
  const premium=index.getItemClassifications('40000152')[0];
  assert.equal(premium.category,'premium');
  assert.equal(premium.family,'Furniture');
  assert.equal(premium.categoryFieldNumber,52);
  assert.equal(premium.originalCategoryOnly,true);
  assert.equal(premium.specificOfferOrCampaignVerified,false);
  assert.equal(premium.currentAvailabilityVerified,false);
  assert.equal(premium.playerAcquisitionVerified,false);
  assert(Object.isFrozen(premium));
  const pet=index.getItemClassifications(120000043)[0];
  assert.equal(pet.category,'premium');
  assert.equal(pet.categoryFieldNumber,27);
  const skin=index.getItemClassifications(170100004)[0];
  assert.equal(skin.categoryFieldNumber,17);
  const character=index.getItemClassifications('10000049')[0];
  assert.equal(character.family,'Character');
  assert.equal(character.category,'premium');
  assert.deepEqual(index.getItemCategories('40000152'),['premium']);
  assert.deepEqual(index.getItemCategories('40001569'),['time_limited']);
  assert.deepEqual(index.getItemCategories('99999999'),[]);
  assert.deepEqual(index.getItemClassifications('99999999'),[]);
});
test('wrong version/family, invalid IDs and a tampered source fail closed',async()=>{
  await assert.rejects(
    loadPinnedNativeOnlineCategories('/Wand',fetcher({corrupt:true}).fetcher),
    /DB02_NATIVE_ONLINE_CATEGORY_SHA/
  );
  await assert.rejects(
    loadPinnedNativeOnlineCategories('/Wand',fetcher({missing:true}).fetcher),
    /DB02_NATIVE_ONLINE_CATEGORY_DOWNLOAD_FAILED/
  );
  await assert.rejects(
    loadPinnedNativeOnlineCategories('/Wand/../private',fetcher().fetcher),
    /DB02_NATIVE_ONLINE_CATEGORY_INVALID_BASE_PATH/
  );
  const index=await loadPinnedNativeOnlineCategories('/Wand',fetcher().fetcher);
  assert.throws(()=>index.getItemClassifications('040000152'),/INVALID_ITEM_ID/);
  assert.throws(()=>index.getCategoryItemIds('twitch_drop'),/INVALID_CATEGORY/);
  assert.throws(()=>index.getFamilyCategoryItemIds('Nonexistent','premium'),
    /INVALID_FAMILY/);
});
