import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  loadPublicSourceCatalog
} from '../src/lib/acquisition/public-source-catalog.ts';
import {
  DB02_ITEM_SOURCE_BROWSER_SCHEMA,indexItemSourceBrowser
} from '../src/lib/acquisition/item-source-browser.ts';
import {
  createAcquisitionOriginDatabase,starpathOriginRecords
} from '../src/lib/acquisition/origins.ts';

const STATIC=new URL('../static/',import.meta.url);
function staticFetcher(){
  const calls=[];
  return {calls,fetcher:async url=>{
    assert(url.startsWith('/Wand/')&&!url.includes('..'),url);
    calls.push(url);
    let data;
    try{data=readFileSync(new URL(url.slice('/Wand/'.length),STATIC));}
    catch{return new Response('missing',{status:404});}
    return new Response(data,{status:200});
  }};
}
const load=async()=>loadPublicSourceCatalog('/Wand',staticFetcher().fetcher);

test('source browser is immutable, exactly source-ledger-linked and does not infer unavailable Item IDs',async()=>{
  const catalog=await load();
  const index=catalog.itemSources;
  assert.equal(index.schema,DB02_ITEM_SOURCE_BROWSER_SCHEMA);
  assert(Object.isFrozen(index));
  assert(Object.isFrozen(index.knownLinkedItemIds));
  assert(Object.isFrozen(index.originKindCounts));
  assert.equal(index.originCoverageComplete,false);
  assert.equal(index.sourceEvidenceOnly,true);
  assert.equal(index.liveAvailabilityVerified,false);
  assert.equal(index.knownLinkedItemIds.length,catalog.origins.getCoverage().linkedItemIds);
  assert.deepEqual(index.knownLinkedItemIds,catalog.origins.listLinkedItemIds());
  assert(index.knownLinkedItemIds.every((x,i,a)=>i===0||Number(a[i-1])<Number(x)));
  const all=index.query();
  assert.equal(all.totalOriginRelations,1255);
  assert.equal(all.totalItemIds,catalog.coverage.allSourceLinkedItemIds);
  assert.equal(all.limit,100);
  assert.equal(all.items.length,Math.min(100,all.totalItemIds));
  assert.equal(all.originCoverageComplete,false);
  assert.equal(all.liveAvailabilityVerified,false);
  const empty=index.getItem('999999999');
  assert.equal(empty.itemId,'999999999');
  assert.deepEqual(empty.origins,[]);
  assert.equal(empty.availabilityVerified,false);
  assert(index.knownLinkedItemIds.every(id=>index.getItem(id).origins.length>0));
  assert.equal(index.originKindCounts.length,22);
  assert.equal(index.originKindCounts.reduce((n,k)=>n+k.sourceRelations,0),1255);
  assert.equal(index.originKindCounts.reduce((n,k)=>n+k.confirmedSourceLinks+
    k.staticCandidateRelations,0),1255);
  assert(Object.isFrozen(index.originKindCounts[0]));
});
test('premium-shop and purchase-bonus Item ID sets use source-exact routes, not unverified name candidates',async()=>{
  const catalog=await load(),index=catalog.itemSources;
  const shop=index.query({kinds:['premium_shop']},{limit:250});
  const purchase=index.query({kinds:['purchase_bonus']},{limit:200});
  assert.equal(shop.totalItemIds,186);
  assert.equal(shop.totalOriginRelations,284);
  assert.equal(shop.items.length,186);
  assert.equal(purchase.totalItemIds,158);
  assert.equal(purchase.totalOriginRelations,291);
  assert.equal(purchase.items.length,158);
  assert.deepEqual(index.getKindItemIds('premium_shop'),shop.items.map(x=>x.itemId));
  assert.deepEqual(index.getKindItemIds('purchase_bonus'),purchase.items.map(x=>x.itemId));
  assert.equal(index.getKindItemIds('premium_shop','static_candidate_only').length,0);
  assert.equal(index.getKindItemIds('twitch_drop').length,0);
  assert.equal(index.getKindItemIds('redeem_code').length,0);
  assert.equal(index.query({kinds:['twitch_drop','redeem_code']}).totalItemIds,0);
  assert.equal(index.query({kinds:['twitch_drop','redeem_code']}).totalOriginRelations,0);
  assert(shop.items.every(row=>row.origins.every(r=>
    r.kind==='premium_shop'&&r.routeStatus==='confirmed_source_link'&&
    r.availability==='not_live_verified')));
  assert(purchase.items.every(row=>row.origins.every(r=>
    r.kind==='purchase_bonus'&&r.routeStatus==='confirmed_source_link')));
  assert.equal(catalog.nameCandidates.coverage.verifiedOnlineAcquisitionLinks,0);
  assert(index.query({kinds:[]}).totalItemIds===0);
});
test('date and source provenance distinguish 120 historical July IDs from 136 November IDs',async()=>{
  const catalog=await load(),index=catalog.itemSources;
  const jul=index.query({
    kinds:['premium_shop'],sourceIds:['db02:shop-cache:Shop20260715'],
    gameVersion:null
  },{limit:200});
  const nov=index.query({
    kinds:['premium_shop'],sourceIds:['db02:steam-1262:shop-20261118'],
    gameVersion:'1.26.2'
  },{limit:200});
  assert.equal(jul.totalItemIds,120);
  assert.equal(jul.totalOriginRelations,128);
  assert.equal(nov.totalItemIds,136);
  assert.equal(nov.totalOriginRelations,156);
  assert(jul.items.every(row=>row.origins.every(o=>o.source.gameVersion===null&&
    o.window.endExclusive==='2026-07-22T13:00:00Z')));
  assert(nov.items.every(row=>row.origins.every(o=>o.source.gameVersion==='1.26.2')));
  const onlyJuly=jul.items.filter(row=>!nov.items.some(x=>x.itemId===row.itemId));
  assert.equal(onlyJuly.length,50);
  assert.equal(index.query({kinds:['premium_shop'],
    sourceIds:['db02:shop-cache:Shop20260715'],
    gameVersion:'1.26.2'}).totalItemIds,0);
  assert.equal(index.query({kinds:['premium_shop'],routeStatuses:[
    'static_candidate_only']}).totalItemIds,0);
  assert.equal(index.getItem('20500136').origins.some(o=>
    o.campaignId==='native-shop:Shop20260715:HouseSkin_FishermandHouse'),true);
});
test('pagination counts distinct Item IDs, preserves all matched origins, and never mutates sources',async()=>{
  const index=(await load()).itemSources;
  const one=index.query({kinds:['premium_shop']},{offset:0,limit:20});
  const two=index.query({kinds:['premium_shop']},{offset:20,limit:20});
  assert.equal(one.totalItemIds,186);
  assert.equal(one.totalOriginRelations,284);
  assert.equal(one.items.length,20);
  assert.equal(two.items.length,20);
  assert.equal(one.hasMore,true);
  assert.equal(one.offset,0);
  assert.deepEqual(new Set([...one.items,...two.items].map(x=>x.itemId)).size,40);
  const last=index.query({kinds:['premium_shop']},{offset:183,limit:20});
  assert.equal(last.items.length,3);
  assert.equal(last.hasMore,false);
  const beyond=index.query({kinds:['premium_shop']},{offset:10000,limit:100});
  assert.equal(beyond.items.length,0);
  assert.equal(beyond.totalItemIds,186);
  assert.equal(beyond.hasMore,false);
  const c=index.getItem('80100000');
  assert(c.origins.length>2);
  assert.equal(c.origins.length,c.confirmedSourceLinks.length+c.staticCandidates.length);
  assert(Object.isFrozen(c));
  assert(Object.isFrozen(c.origins));
  assert(Object.isFrozen(c.staticCandidates));
  assert(Object.isFrozen(c.confirmedSourceLinks));
  const confirmed=index.query({kinds:['purchase_bonus'],
    routeStatuses:['confirmed_source_link']},{limit:200});
  assert.equal(confirmed.totalItemIds,158);
  assert(confirmed.items.every(x=>x.origins.every(y=>y.routeStatus==='confirmed_source_link')));
  const candidates=index.query({routeStatuses:['static_candidate_only']},{limit:500});
  assert(candidates.totalItemIds>0);
  assert(candidates.items.every(x=>x.confirmedSourceLinks.length===0));
  assert(candidates.items.every(x=>x.staticCandidates.length===x.origins.length));
});
test('filters operate on the same origin, not independently matched routes for one Item ID',()=>{
  const starpath=JSON.parse(readFileSync(new URL(
    '../static/guide/public/starpath-cache-2026-11-22.json',import.meta.url)));
  const {origins,campaigns}=starpathOriginRecords(starpath);
  const original=origins[0];
  const sale={
    ...original,originId:'test:synthetic:shop',kind:'premium_shop',
    campaignId:'test:shop',name:'Synthetic Sale',
    source:{
      sourceId:'test:shop:sale',kind:'verified_sale_snapshot',
      sourceUrl:'https://example.org/test',checkedOn:'2026-11-23',
      gameVersion:'1.26.2',sha256:'a'.repeat(64)
    }
  };
  const shopCampaign={
    ...campaigns[0],campaignId:'test:shop',kind:'premium_shop',
    name:'Synthetic Sale',rewards:[]
  };
  const ledger=createAcquisitionOriginDatabase([...origins,sale],
    [...campaigns,shopCampaign]);
  const index=indexItemSourceBrowser(ledger);
  assert.equal(index.getItem(original.itemId).origins.some(o=>o.kind==='premium_shop'),true);
  assert.equal(index.query({kinds:['premium_shop'],
    sourceKinds:['unhashed_structural_candidate']}).totalItemIds,0);
  assert.equal(index.query({kinds:['premium_shop'],
    sourceKinds:['verified_sale_snapshot']}).totalItemIds,1);
  assert.equal(index.query({kinds:['star_path_free','star_path_premium','star_path_vault'],
    sourceKinds:['verified_sale_snapshot']}).totalItemIds,0);
  const chosen=index.query({kinds:['premium_shop'],
    sourceKinds:['verified_sale_snapshot']}).items[0];
  assert.equal(chosen.origins.length,1);
  assert.equal(chosen.origins[0],sale);
  assert(chosen.confirmedSourceLinks.length===0 ||
    chosen.staticCandidates.length===0);
});
test('invalid pagination, source filters and spoofed ledgers fail closed',async()=>{
  const index=(await load()).itemSources;
  assert.throws(()=>index.query({kinds:['unknown']}),/INVALID_KINDS/);
  assert.throws(()=>index.query({routeStatuses:['available_now']}),
    /INVALID_ROUTE_STATUSES/);
  assert.throws(()=>index.query({sourceKinds:['official_guessed']}),
    /INVALID_SOURCE_KINDS/);
  assert.throws(()=>index.query({sourceIds:['../private']}),/INVALID_SOURCE_IDS/);
  assert.throws(()=>index.query({gameVersion:'1.26'}),/GAME_VERSION/);
  assert.throws(()=>index.query({kinds:['premium_shop']},{offset:-1}),/PAGE_RANGE/);
  assert.throws(()=>index.query({kinds:['premium_shop']},{limit:501}),/PAGE_RANGE/);
  assert.throws(()=>index.query({kinds:['premium_shop']},{limit:0}),/PAGE_RANGE/);
  assert.throws(()=>index.getItem('00020500136'),/INVALID_ITEM_ID/);
  assert.throws(()=>index.getItem(NaN),/INVALID_ITEM_ID/);
  assert.throws(()=>index.getKindItemIds('made_up_kind'),/INVALID_KIND/);
  assert.throws(()=>index.getKindItemIds('premium_shop','made_up_status'),/INVALID_STATUS/);
  assert.throws(()=>indexItemSourceBrowser({schema:'made-up'}),/ORIGIN_LEDGER_REQUIRED/);
});
