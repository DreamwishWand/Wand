import test from 'node:test';
import assert from 'node:assert/strict';
import {STARPATH_SOURCE_SHA,STARPATH_PUBLIC_SHA} from '../guide/public-starpath.ts';
import {
  createDb01StarpathOriginClient,DB01_STARPATH_ORIGIN_QUERY,
} from './starpath-origin-filters.ts';

const SHA='b'.repeat(64);
const baseSource={
  platform:'Steam',gameVersion:'1.26.2',
  sourceItemsSha256:SHA,privateOnly:true,fullCorpusParsed:true,
};
const season1={id:'123',eventId:'event-starpath-123',title:'Test Disney Star Path',
  definitionVersion:1,currencyName:'Star Tokens',
  startUtc:'2026-01-01T00:00:00Z',taskEndUtcExclusive:'2026-02-01T00:00:00Z',
  endUtcExclusive:'2026-02-08T00:00:00Z',
  premiumAccessCurrencyItemId:'9000',premiumAccessCost:2500};
const season2={...season1,id:'456',eventId:'event-starpath-456',
  title:'Another Star Path',premiumAccessCurrencyItemId:'9001'};
function relation(itemId,seasonId,role,slot=null){
  return {
    itemId:String(itemId),seasonId,eventId:seasonId==='123'?
      season1.eventId:season2.eventId,
    role,occurrenceId:slot,occurrence:slot?{
      occurrenceId:slot,seasonId,itemId:String(itemId),
      section:'normal',page:1,slot:1,amount:1,
      premium:true,bonus:false,recurrent:false,
    }:null,
    configuredRewardOnly:true,guaranteedGrant:false,
    currentAvailabilityVerified:false,playerOwnershipVerified:false,
  };
}
function fixture(){
  const ids=[4001,4002,4003,4004,9000];
  const lookup=new Map([
    [4001,[
      relation(4001,'123','configured_reward','123/normal-1/1'),
      relation(4001,'123','configured_reward','123/bonus-1/2'),
    ]],
    [4002,[relation(4002,'123','configured_reward','123/normal-1/2')]],
    [4003,[relation(4003,'123','vault_alternative_candidate','123/vault/1')]],
    [4004,[relation(4004,'456','configured_reward','456/normal-1/1')]],
    [9000,[relation(9000,'123','premium_access_currency')]],
  ]);
  const known=new Map([
    [4001,{itemId:4001,nativeCategory:'Furniture',
      nativeKey:'Furniture!TestOne',sourceSha256:'1'.repeat(64)}],
    [4002,{itemId:4002,nativeCategory:'Clothing',
      nativeKey:'Clothing!TestTwo',sourceSha256:'2'.repeat(64)}],
  ]);
  const route=(originId,kind)=>{
    const sourceId='db02:'+kind;
    return Object.freeze({
      originId,itemId:'4001',kind,
      routeStatus:'confirmed_source_link',campaignId:'campaign-'+kind,
      name:kind,productId:null,quantity:1,price:null,
      accessTier:kind==='premium_shop'?'premium':'free',
      window:{start:null,endExclusive:null},salePeriods:[],
      conditions:[],source:{sourceId,kind:'verified_game_native',
        sourceUrl:'/owner-local/source',checkedOn:'2026-11-22',
        gameVersion:'1.26.2',sha256:'3'.repeat(64)},
      availability:'not_live_verified',
    });
  };
  const starOrigin=route('starpath:123/normal-1/1','star_path_premium');
  const shopOrigin=route('premium-shop:sale-2026','premium_shop');
  const db02={
    schema:'wand.db02.item-origins@1',
    originCoverageComplete:false,
    getItem:id=>({
      itemId:String(id),
      origins:id===4001?[starOrigin,shopOrigin]:[],
      nativeAcquisition:null,
      originCoverageComplete:false,
    }),
  };
  const catalog={
    source:baseSource,
    getItem:async id=>known.get(id)??null,
    getItems:async values=>values.map(id=>known.get(id)??null),
  };
  const guide={
    contract:'wand.db03.reward-relations@1',
    evidence:{
      platform:'Steam',gameVersion:'1.26.2',capturedDate:'2026-11-22',
      liveopsSourceSha256:STARPATH_SOURCE_SHA,
      publicProjectionSha256:STARPATH_PUBLIC_SHA,
      integrity:'pinned_public_sha256',
    },
    coverage:{historicalSeasonCatalogComplete:false,knownSeasonCount:2},
    seasons:[season1,season2],itemIds:ids.map(String),
    getSeason:id=>id==='123'?season1:id==='456'?season2:null,
    getItemRelations:id=>lookup.get(Number(id))??[],
  };
  return {catalog,guide,db02,known,lookup};
}

test('source-pinned Star Path filter preserves all occurrences of the same Item ID',async()=>{
  const f=fixture(),api=createDb01StarpathOriginClient(
    f.catalog,f.guide,f.db02);
  assert.equal(api.contract,DB01_STARPATH_ORIGIN_QUERY);
  assert.equal(api.getSeasons().length,2);
  assert.equal(api.source.gameVersion,'1.26.2');
  assert.equal(api.source.historicalSeasonCatalogComplete,false);
  const page=await api.querySeason('123');
  assert.deepEqual(page.itemIds,[4001,4002]);
  assert.equal(page.total,2);
  assert.equal(page.items[0].starpathSourceRelations.length,2);
  assert.equal(page.items[0].originalDefinition.itemId,4001);
  assert.equal(page.configuredRewardSourceOnly,true);
  assert.equal(page.historicalSeasonCatalogComplete,false);
  assert.equal(page.premiumShopReissueHistoryComplete,false);
  assert.equal(page.currentAvailabilityVerified,false);
});

test('a reissued Premium Shop purchase stays a second independent route',async()=>{
  const f=fixture(),api=createDb01StarpathOriginClient(
    f.catalog,f.guide,f.db02);
  const item=await api.getItem(4001);
  assert.deepEqual(item.otherAcquisitionRoutes.map(o=>o.kind),
    ['star_path_premium','premium_shop']);
  assert.equal(item.otherAcquisitionRoutes[0].originId,'starpath:123/normal-1/1');
  assert.equal(item.otherAcquisitionRoutes[1].originId,'premium-shop:sale-2026');
  assert.equal(item.starpathSourceRelations.length,2);
  assert.equal(item.shopReissueItemIdLinkVerifiedByThisQuery,false);
  assert.equal(item.currentAvailabilityVerified,false);
  assert.equal(item.playerOwnershipVerified,false);
  assert.equal(item.historicalOriginsComplete,false);
});

test('vault alternatives must be requested; premium access currency is never a reward',async()=>{
  const f=fixture(),api=createDb01StarpathOriginClient(
    f.catalog,f.guide);
  assert.deepEqual((await api.querySeason('123')).itemIds,[4001,4002]);
  const withAlternatives=await api.querySeason('123',{
    includeVaultAlternativeCandidates:true,
  });
  assert.deepEqual(withAlternatives.itemIds,[4001,4002,4003]);
  assert.equal(withAlternatives.items[2].originalDefinition,null);
  assert.equal(withAlternatives.items[2].otherAcquisitionRoutes,null);
  const currency=await api.getItem(9000);
  assert.equal(currency.starpathSourceRelations[0].role,'premium_access_currency');
  assert.equal(currency.originalDefinition,null);
  assert.equal(await api.getItem(9999999),null);
});

test('native classes and pagination never hide source-alt IDs without requested filter',async()=>{
  const f=fixture(),api=createDb01StarpathOriginClient(
    f.catalog,f.guide);
  const page=await api.querySeason('123',{nativeCategories:['Furniture']});
  assert.deepEqual(page.itemIds,[4001]);
  const page2=await api.querySeason('123',{offset:1,limit:1});
  assert.deepEqual(page2.itemIds,[4002]);
  assert.equal(page2.total,2);
  assert.equal(page2.hasMore,false);
  const empty=await api.querySeason('456',{nativeCategories:['Furniture']});
  assert.equal(empty.total,0);
  assert.deepEqual((await api.querySeason('456')).itemIds,[4004]);
});

test('wrong LiveOps hash, unverified structural snapshot, wrong version or corrupt DB02 fail closed',()=>{
  const f=fixture();
  assert.throws(()=>createDb01StarpathOriginClient(f.catalog,{
    ...f.guide,evidence:{...f.guide.evidence,
      integrity:'source_structure_only'},
  }),/SOURCE_VERSION_OR_LIVEOPS_INTEGRITY/);
  assert.throws(()=>createDb01StarpathOriginClient(f.catalog,{
    ...f.guide,evidence:{...f.guide.evidence,
      publicProjectionSha256:'0'.repeat(64)},
  }),/SOURCE_VERSION_OR_LIVEOPS_INTEGRITY/);
  assert.throws(()=>createDb01StarpathOriginClient({
    ...f.catalog,source:{...f.catalog.source,gameVersion:'1.27.0'},
  },f.guide),/SOURCE_VERSION_OR_LIVEOPS_INTEGRITY/);
  assert.throws(()=>createDb01StarpathOriginClient(f.catalog,f.guide,{
    ...f.db02,schema:'unauthenticated',
  }),/DB02_ORIGIN_CONTRACT/);
});

test('invented season, invalid pagination and out-of-range Item ID rejected',async()=>{
  const f=fixture(),api=createDb01StarpathOriginClient(
    f.catalog,f.guide,f.db02);
  await assert.rejects(api.querySeason('unseen'),/UNKNOWN_SEASON/);
  await assert.rejects(api.querySeason('123',{limit:10000}),/QUERY_PAGING/);
  await assert.rejects(api.querySeason('123',{nativeCategories:['for ged']}),
    /NATIVE_CLASS_SELECTION/);
  await assert.rejects(api.getItem(0),/ITEM_ID/);
});
