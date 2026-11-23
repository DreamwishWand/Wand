import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openPublicSharedGameSources} from '../src/lib/game-db/public-sources.ts';
import {createDb00NativeOnlineReader} from '../src/lib/game-db/native-online-categories.ts';

const ROOT=new URL('../static/',import.meta.url);
const ASSET='online-categories-1.26.2.json';
function localFetcher(corrupt=false){
  const calls=[];
  const fetcher=async url=>{
    assert(typeof url==='string'&&url.startsWith('/Wand/')&&!url.includes('..'));
    calls.push(url);
    let bytes;
    try{bytes=readFileSync(new URL(url.slice(6),ROOT));}
    catch{return new Response('not found',{status:404});}
    if(corrupt&&url.endsWith('/'+ASSET)){
      bytes=Buffer.from(bytes);bytes[80]^=1;
    }
    return new Response(bytes,{status:200});
  };
  return {fetcher,calls};
}
let common;
const shared=()=>common??=openPublicSharedGameSources('/Wand',localFetcher().fetcher);
const FAMILIES=[
  'Furniture','Clothing','Trimming','MountGear','Makeup',
  'Tool','Character','Companion','Skin'
];

test('DB-00 source category is lazily loaded, SHA pinned by DB-02, and not fetched twice',async()=>{
  const {fetcher,calls}=localFetcher();
  const app=await openPublicSharedGameSources('/Wand',fetcher);
  assert.equal(calls.length,30);
  assert.equal(calls.filter(x=>x.endsWith('/'+ASSET)).length,0);
  const reader=await app.loadNativeOnlineCategories();
  assert.equal(reader,await app.loadNativeOnlineCategories());
  assert.equal(reader.contract,'wand.game-db.native-online-category@1');
  assert.equal(reader.sourceFamilies,9);
  assert.equal(reader.sourceRows,2198);
  assert.equal(reader.originalCategoryOnly,true);
  assert.equal(reader.specificOfferOrCampaignVerified,false);
  assert.equal(reader.playerAcquisitionVerified,false);
  assert.equal(calls.filter(x=>x.endsWith('/'+ASSET)).length,1);
  assert.equal(new Set(calls).size,31);
  const source=await app.acquisition.loadNativeOnlineCategories();
  assert.equal(source.rows.length,2198);
  assert.equal(source.coverage.explicitNonzeroCategoryRows,2198);
  assert.equal(source.coverage.singleOfferOrCampaignLinkVerified,false);
  assert.equal(source.coverage.allItemTypesCovered,false);
  assert.equal(calls.length,31);
  assert(Object.isFrozen(reader));
});

test('all 2,198 original OnlineCategory rows from 9 families stay separate from Item origins and shop sale offers',async()=>{
  const app=await shared();
  const reader=await app.loadNativeOnlineCategories();
  const source=await app.acquisition.loadNativeOnlineCategories();
  const seen=new Set();
  for(const category of ['premium','time_limited']){
    const expected=source.getCategoryItemIds(category);
    assert.equal(expected.length,category==='premium'?1830:368);
    const total=reader.search({category,limit:500}).total;
    assert.equal(total,expected.length);
    for(const family of FAMILIES){
      const familyIds=source.getFamilyCategoryItemIds(family,category);
      const items=[];
      for(let offset=0;;){
        const got=reader.search({category,family,offset,limit:500});
        assert.equal(got.total,familyIds.length);
        items.push(...got.items);
        if(got.nextOffset===null)break;
        assert(got.nextOffset>offset);
        offset=got.nextOffset;
      }
      assert.deepEqual(items.map(x=>x.itemId),familyIds);
      for(const row of items){
        assert(!seen.has(row.itemId));
        seen.add(row.itemId);
        assert.equal(row.classifications.length,1);
        assert.deepEqual(row.classifications,source.getItemClassifications(row.itemId));
        assert.equal(row.classifications[0].family,family);
        assert.equal(row.classifications[0].category,category);
        assert.equal(row.classifications[0].originalCategoryOnly,true);
        assert.equal(row.classifications[0].specificOfferOrCampaignVerified,false);
        assert.equal(row.hasExplicitSourceCategory,true);
        assert.equal(row.originalCategoryOnly,true);
        assert.equal(row.specificOfferOrCampaignVerified,false);
        assert.equal(row.currentAvailabilityVerified,false);
        assert.equal(row.playerAcquisitionVerified,false);
        assert.equal(row.gameUiCollectionMembershipVerified,false);
        assert.equal(row.item.currentlyAvailableVerified,false);
        assert.equal(row.item.playerOwnershipVerified,false);
        assert.deepEqual(row.item,app.getItem(row.itemId));
        assert(Object.isFrozen(row));
        assert(Object.isFrozen(row.classifications));
      }
    }
  }
  assert.equal(seen.size,2198);
  const found=reader.getItem('40000152');
  assert.equal(found.classifications[0].family,'Furniture');
  assert.equal(found.classifications[0].category,'premium');
  assert.equal(reader.getItem('99999999').hasExplicitSourceCategory,false);
  assert.deepEqual(reader.getItem('99999999').classifications,[]);
  assert.equal(reader.getItem('99999999').playerAcquisitionVerified,false);
  assert.equal(app.acquisition.coverage.combinedSourceRoutes,1255);
});

test('native category searches filter published names, Item IDs, family, and page without leaking private source',async()=>{
  const app=await shared();
  const reader=await app.loadNativeOnlineCategories();
  const first=reader.search({limit:500});
  assert.equal(first.total,2198);
  assert.equal(first.items.length,500);
  const second=reader.search({offset:first.nextOffset??0,limit:500});
  assert.equal(second.total,2198);
  assert.equal(second.items[0].itemId,reader.search({limit:500,offset:500}).items[0].itemId);
  assert(!first.items.some(x=>second.items.some(y=>x.itemId===y.itemId)));
  assert(Object.isFrozen(first));
  assert(Object.isFrozen(first.items));
  assert.equal(first.scope,'native_online_category_source_only');
  assert.equal(first.allItemTypesCovered,false);
  const publishedOnly=reader.search({publishedOnly:true,limit:500});
  assert(publishedOnly.total>0);
  assert(publishedOnly.total<=2198);
  assert(publishedOnly.items.every(x=>x.item.catalog!==null));
  const candidate=publishedOnly.items[0];
  const prefix=candidate.itemId.slice(0,5);
  const idQuery=reader.search({text:prefix,limit:500});
  assert(idQuery.total>0);
  assert(idQuery.items.every(x=>x.itemId.startsWith(prefix)));
  const name=publishedOnly.items.find(x=>typeof x.item.catalog?.names.ja==='string' &&
    x.item.catalog.names.ja.length>1);
  if(name){
    const needle=name.item.catalog.names.ja.slice(0,2);
    assert(reader.search({locale:'ja',text:needle,limit:500}).items.some(
      x=>x.itemId===name.itemId));
  }
  assert.equal(reader.search({text:'impossible-name_zzzz'}).total,0);
  assert.throws(()=>reader.search({category:'premium_shop'}),/INVALID_CATEGORY/);
  assert.throws(()=>reader.search({family:'All'}),/INVALID_FAMILY/);
  assert.throws(()=>reader.search({publishedOnly:false}),/INVALID_PUBLISHED_FILTER/);
  assert.throws(()=>reader.search({locale:'ko'}),/INVALID_LOCALE/);
  assert.throws(()=>reader.search({text:'bad\ntext'}),/INVALID_TEXT/);
  assert.throws(()=>reader.search({offset:-1}),/INVALID_PAGE/);
  assert.throws(()=>reader.search({limit:501}),/INVALID_PAGE/);
  assert.throws(()=>reader.getItem('040000152'),/invalid numeric Item ID/);
});

test('native OnlineCategory Premium and TimeLimited never imply online offer, entitlement or acquisition',async()=>{
  const app=await shared();
  const reader=await app.loadNativeOnlineCategories();
  const premium=reader.search({category:'premium',limit:30});
  assert.equal(premium.total,1830);
  for(const row of premium.items){
    assert.equal(row.classifications[0].category,'premium');
    assert.equal(row.classifications[0].specificOfferOrCampaignVerified,false);
    assert.deepEqual(row.item.origins,app.getItem(row.itemId).origins);
    assert(!Object.hasOwn(row,'salePeriods'));
    assert(!Object.hasOwn(row,'reportedMoonstonePrice'));
  }
  const limited=reader.search({category:'time_limited',limit:20});
  assert.equal(limited.total,368);
  assert(limited.items.every(x=>x.specificOfferOrCampaignVerified===false));
  const db02=await app.acquisition.loadNativeOnlineCategories();
  assert.throws(()=>createDb00NativeOnlineReader(app.database,app.joined,{
    ...db02,coverage:{...db02.coverage,singleOfferOrCampaignLinkVerified:true}
  }),/EXACT_DB02_CATEGORY_READER_REQUIRED/);
});

test('corrupted optional online-category projection fails closed without breaking the base shared DB',async()=>{
  const {fetcher,calls}=localFetcher(true);
  const app=await openPublicSharedGameSources('/Wand',fetcher);
  assert.equal(calls.length,30);
  assert.equal(app.getItem('40000152').currentlyAvailableVerified,false);
  await assert.rejects(app.loadNativeOnlineCategories(),/DB02_NATIVE_ONLINE_CATEGORY_SHA/);
  assert.equal(app.database.itemCount,13202);
});
