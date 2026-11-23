import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openPublicSharedGameSources} from '../src/lib/game-db/public-sources.ts';
import {
  createDb00NativeCompanionReader,DB00_NATIVE_COMPANIONS_CONTRACT
} from '../src/lib/game-db/native-companions.ts';

const ROOT=new URL('../static/',import.meta.url);
const PET_FILE='pet-source-categories-1.26.2.json';
function sourceFetcher(corrupt=false){
  const calls=[];
  const fetcher=async url=>{
    assert(typeof url==='string'&&url.startsWith('/Wand/')&&!url.includes('..'));
    calls.push(url);
    let bytes;
    try{bytes=readFileSync(new URL(url.slice(6),ROOT));}
    catch{return new Response('not found',{status:404});}
    if(corrupt&&url.endsWith('/'+PET_FILE)){
      bytes=Buffer.from(bytes);bytes[50]^=1;
    }
    return new Response(bytes,{status:200});
  };
  return {calls,fetcher};
}
let loaded;
const shared=()=>loaded??=openPublicSharedGameSources('/Wand',sourceFetcher().fetcher);

test('companion source is lazy, SHA-verified once and carries 134 independently classified native Item IDs',async()=>{
  const {calls,fetcher}=sourceFetcher();
  const app=await openPublicSharedGameSources('/Wand',fetcher);
  assert.equal(calls.length,30);
  assert.equal(calls.filter(url=>url.endsWith('/'+PET_FILE)).length,0);
  const first=await app.loadNativeCompanionSources();
  const next=await app.loadNativeCompanionSources();
  assert.equal(first,next);
  assert.equal(first.contract,DB00_NATIVE_COMPANIONS_CONTRACT);
  assert.equal(first.snapshotId,app.snapshotId);
  assert.equal(first.categoryRows,134);
  assert.equal(first.specificCampaignLinkVerified,false);
  assert.equal(first.playerAcquisitionVerified,false);
  assert.equal(calls.length,31);
  assert.equal(new Set(calls).size,31);
  assert.equal(calls.filter(url=>url.endsWith('/'+PET_FILE)).length,1);
  assert(Object.isFrozen(first));
  const db02=await app.acquisition.loadNativePetSources();
  assert.equal(db02.coverage.explicitSourceRows,134);
  assert.equal(calls.length,31,'DB-00 must share the DB-02 fetched source');
});

test('all six source categories retain ID membership, published status and absence of specific campaign links',async()=>{
  const app=await shared();
  const reader=await app.loadNativeCompanionSources();
  const db02=await app.acquisition.loadNativePetSources();
  const kinds={
    quest:8,timebending:1,event:9,star_path:7,
    premium_shop:95,exclusive_promotion:14
  };
  const collected=new Set();
  for(const [category,count] of Object.entries(kinds)){
    const sourceIds=db02.getCategoryItemIds(category);
    assert.equal(sourceIds.length,count);
    const found=reader.search({category,limit:500});
    assert.equal(found.total,count);
    assert.deepEqual(found.items.map(x=>x.itemId),
      [...sourceIds].sort((a,b)=>Number(a)-Number(b)));
    assert.equal(found.specificCampaignLinkVerified,false);
    assert.equal(found.gameUiCollectionMembershipVerified,false);
    assert.equal(found.allItemTypesCovered,false);
    for(const row of found.items){
      collected.add(row.itemId);
      const source=db02.getItemClassifications(row.itemId);
      assert.deepEqual(row.classifications,source);
      assert.equal(row.sourceClassified,true);
      assert.equal(row.originalSourceField,9);
      assert.equal(row.classifications[0].category,category);
      assert.equal(row.sourceCategoryOnly,true);
      assert.equal(row.specificCampaignLinkVerified,false);
      assert.equal(row.playerAcquisitionVerified,false);
      assert.equal(row.gameUiCollectionMembershipVerified,false);
      assert.deepEqual(row.item,app.getItem(row.itemId));
      assert.equal(row.item.currentlyAvailableVerified,false);
      assert.equal(row.item.playerOwnershipVerified,false);
      assert(Object.isFrozen(row));
      assert(Object.isFrozen(row.classifications));
    }
  }
  assert.equal(collected.size,134);
  assert.equal(reader.search({limit:500}).total,134);
  assert.equal(reader.getItem('120000043').classifications[0].category,
    'exclusive_promotion');
  assert.equal(reader.getItem('120000249').sourceClassified,false);
  assert.deepEqual(reader.getItem('120000249').classifications,[]);
  assert.equal(reader.getItem('120000249').specificCampaignLinkVerified,false);
  assert.equal(reader.getItem('120000249').playerAcquisitionVerified,false);
});

test('search supports source category, original Item ID prefix, verified locale name, published-only and paging',async()=>{
  const app=await shared();
  const reader=await app.loadNativeCompanionSources();
  const all=reader.search({limit:500});
  assert.equal(all.total,134);
  assert(Object.isFrozen(all));
  assert(Object.isFrozen(all.items));
  assert.deepEqual(all.items.map(x=>Number(x.itemId)),
    all.items.map(x=>Number(x.itemId)).sort((a,b)=>a-b));
  const page1=reader.search({limit:9});
  const page2=reader.search({offset:page1.nextOffset??0,limit:9});
  assert.deepEqual([...page1.items,...page2.items].map(x=>x.itemId),
    all.items.slice(0,18).map(x=>x.itemId));
  const published=all.items.filter(x=>x.item.catalog!==null);
  const publishedOnly=reader.search({publishedOnly:true,limit:500});
  assert.equal(publishedOnly.total,published.length);
  assert.deepEqual(publishedOnly.items.map(x=>x.itemId),
    published.map(x=>x.itemId));
  const sample=all.items[0];
  const prefixed=reader.search({text:sample.itemId.slice(0,6),limit:500});
  assert(prefixed.items.some(x=>x.itemId===sample.itemId));
  assert(prefixed.items.every(x=>x.itemId.startsWith(sample.itemId.slice(0,6))));
  const named=published.find(x=>typeof x.item.catalog?.names.ja==='string'&&
    x.item.catalog.names.ja.length>=2);
  if(named){
    const needle=named.item.catalog.names.ja.slice(0,2);
    assert(reader.search({locale:'ja',text:needle,limit:500}).items.some(
      x=>x.itemId===named.itemId));
  }
  assert.equal(reader.search({text:'not-a-native-companion_3492'}).total,0);
  assert.throws(()=>reader.search({category:'twitch_drop'}),/INVALID_CATEGORY/);
  assert.throws(()=>reader.search({publishedOnly:false}),/INVALID_PUBLISHED_FILTER/);
  assert.throws(()=>reader.search({locale:'invalid'}),/INVALID_LOCALE/);
  assert.throws(()=>reader.search({text:'bad\ntext'}),/INVALID_TEXT/);
  assert.throws(()=>reader.search({limit:501}),/INVALID_PAGE/);
  assert.throws(()=>reader.getItem('00120000043'),/INVALID_ITEM_ID/);
});

test('source-native premium_shop category cannot become an offer, origin or actual Twitch/code campaign',async()=>{
  const app=await shared();
  const reader=await app.loadNativeCompanionSources();
  const nativePremium=reader.search({category:'premium_shop',limit:500});
  assert.equal(nativePremium.total,95);
  for(const row of nativePremium.items){
    assert.equal(row.specificCampaignLinkVerified,false);
    assert.equal(row.playerAcquisitionVerified,false);
    assert.equal(row.classifications[0].campaignLinkVerified,false);
    assert.deepEqual(row.item.origins,app.getItem(row.itemId).origins);
  }
  assert.equal(app.acquisition.itemSources.getKindItemIds('twitch_drop').length,0);
  assert.equal(app.acquisition.itemSources.getKindItemIds('redeem_code').length,0);
  assert.equal(reader.search({category:'exclusive_promotion'}).total,14);
  const db02=await app.acquisition.loadNativePetSources();
  assert.throws(()=>createDb00NativeCompanionReader(app.database,app.joined,{
    ...db02
  }),/PINNED_NATIVE_PET_SOURCE_REQUIRED/);
});

test('corrupt optional native Companion projection fails SHA verification without breaking ordinary DB-00',async()=>{
  const {calls,fetcher}=sourceFetcher(true);
  const app=await openPublicSharedGameSources('/Wand',fetcher);
  assert.equal(app.queryItems([],{limit:2}).items.length,2);
  assert.equal(calls.filter(url=>url.endsWith('/'+PET_FILE)).length,0);
  await assert.rejects(app.loadNativeCompanionSources(),/DB02_PET_SOURCE_SHA/);
  assert.equal(app.queryItems([],{limit:2}).total,13202);
});
