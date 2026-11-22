import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  openPublicSharedGameSources
} from '../src/lib/game-db/public-sources.ts';

const STATIC=new URL('../static/',import.meta.url);
const fetcher=async url=>{
  assert(typeof url==='string'&&url.startsWith('/Wand/'));
  try{return new Response(readFileSync(new URL(url.slice(6),STATIC)),{status:200});}
  catch{return new Response('not found',{status:404});}
};
let cached;
const app=()=>cached??=openPublicSharedGameSources('/Wand',fetcher);

test('public item search combines localized exact names and ID-prefix queries with stable paging',async()=>{
  const source=await app();
  const id=source.queryItems([],{limit:1}).items[0].id;
  const direct=source.getItem(id);
  const idResult=source.searchItems({text:id,limit:20});
  assert.equal(idResult.scope,'current_published_itemlist');
  assert.equal(idResult.snapshotId,source.snapshotId);
  assert(idResult.items.some(item=>item.itemId===id));
  assert.equal(idResult.liveAvailabilityVerified,false);
  assert.equal(idResult.sourceCoverageComplete,false);
  assert.equal(idResult.playerOwnershipVerified,false);
  assert.ok(Object.isFrozen(idResult));
  assert.ok(Object.isFrozen(idResult.items));

  const first=source.queryItems([],{limit:500}).items.find(item=>
    typeof item.names.en==='string'&&item.names.en.length>=4);
  assert(first,'real SHA-pinned public Items must have an English name');
  const name=first.names.en;
  const query=name.slice(0,Math.min(name.length,9)).toUpperCase();
  const byEnglishName=source.searchItems({locale:'en',text:query,limit:500});
  assert(byEnglishName.items.some(item=>item.itemId===first.id),
    'English name substring case folding');
  const japanese=source.queryItems([],{limit:500}).items.find(item=>
    typeof item.names.ja==='string'&&item.names.ja.length>=3);
  assert(japanese,'real SHA-pinned Items must have a Japanese name');
  const byJapaneseName=source.searchItems({
    locale:'ja',text:japanese.names.ja.slice(0,3),limit:500
  });
  assert(byJapaneseName.items.some(item=>item.itemId===japanese.id));

  const pageOne=source.searchItems({limit:5});
  assert.equal(pageOne.total,13202);
  assert.equal(pageOne.items.length,5);
  assert.equal(pageOne.nextOffset,5);
  const pageTwo=source.searchItems({offset:pageOne.nextOffset,limit:5});
  assert.equal(pageTwo.total,13202);
  assert.equal(pageTwo.nextOffset,10);
  assert.deepEqual(pageTwo.items.map(x=>x.itemId),
    source.queryItems([],{offset:5,limit:5}).items.map(x=>x.id));
  assert(pageOne.items.every(item=>
    !pageTwo.items.some(next=>next.itemId===item.itemId)));
  assert.equal(source.searchItems({offset:13202,limit:10}).items.length,0);
  assert.equal(source.searchItems({offset:13202,limit:10}).nextOffset,null);
  assert.equal(direct.playerOwnershipVerified,false);
});

test('published acquisition search finds original Premium Shop and IAP source links, not name guesses or live stock',async()=>{
  const source=await app();
  const shop=source.searchItems({originKinds:['premium_shop'],limit:500});
  assert(shop.total>0);
  const shopExample=shop.items.find(item=>item.origins?.some(origin=>
    origin.kind==='premium_shop'&&origin.routeStatus==='confirmed_source_link'));
  assert(shopExample,'published source offer must retain source-exact Item ID');
  const shopId=shopExample.itemId;
  assert(shop.items.every(item=>item.origins?.some(origin=>
    origin.kind==='premium_shop'&&origin.availability==='not_live_verified')));
  const confirmed=source.searchItems({
    originKinds:['premium_shop'],routeStatus:'confirmed_source_link',
    text:shopId,limit:10
  });
  assert(confirmed.items.some(item=>item.itemId===shopId));
  assert.equal(confirmed.liveAvailabilityVerified,false);
  assert.equal(source.searchItems({
    originKinds:['premium_shop'],routeStatus:'static_candidate_only',
    text:shopId
  }).total,0,'source configured shop offers are not speculative item-name matches');

  const iap=source.searchItems({originKinds:['purchase_bonus'],limit:500});
  assert(iap.total>0);
  const iapExample=iap.items.find(item=>item.origins?.some(row=>
    row.kind==='purchase_bonus'));
  assert(iapExample);
  assert(source.searchItems({
    originKinds:['purchase_bonus'],text:iapExample.itemId
  }).items.some(item=>item.itemId===iapExample.itemId));
  assert.equal(source.getItem('170600007').catalog,null,
    'source-linked IDs outside the published ItemList remain available only by direct lookup');
  const onlyCandidate=source.searchItems({
    originKinds:['twitch_drop'],text:'50400102'
  });
  assert.equal(onlyCandidate.total,0,
    'online campaign name-only candidate cannot become an ItemOrigin relation');
  assert(source.acquisition.lookup('50400102').onlineNameCandidates.some(
    value=>value.acquisitionLinkVerified===false));
  const quest=source.searchItems({originKinds:['quest_reward'],
    routeStatus:'static_candidate_only',limit:100});
  assert(quest.total>0);
  assert(quest.items.every(item=>item.origins.some(origin=>
    origin.kind==='quest_reward'&&origin.routeStatus==='static_candidate_only')));
});

test('Star Path season filtering uses only DB-03 primary configured rewards and rejects invented player state',async()=>{
  const source=await app();
  const season=source.guide.seasons[0];
  const scoped=source.searchItems({starPathSeasonId:season.id,limit:500});
  assert(scoped.total>0);
  assert(scoped.items.every(item=>
    source.guide.getItemAcquisitionCandidates(item.itemId).some(relation=>
      relation.seasonId===season.id&&relation.role==='configured_reward')));
  assert(scoped.items.every(item=>
    item.currentlyAvailableVerified===false&&
    item.playerOwnershipVerified===false));
  assert.equal(source.searchItems({
    starPathSeasonId:'UnknownSeason2026'
  }).total,0);
  const combined=source.searchItems({
    starPathSeasonId:season.id,
    originKinds:['star_path_free','star_path_premium','star_path_vault'],
    limit:100
  });
  assert(combined.items.every(item=>
    item.origins.some(origin=>
      ['star_path_free','star_path_premium','star_path_vault'].includes(origin.kind))));
  assert(combined.total<=scoped.total);
});

test('public search validates locale, origin status, ID search and bounded pagination',async()=>{
  const source=await app();
  for(const invalid of [
    {locale:'ko'}, {text:'bad\ntext'}, {text:'x'.repeat(121)},
    {originKinds:[]}, {originKinds:['invalid-kind']},
    {originKinds:['premium_shop','premium_shop']},
    {routeStatus:'live'}, {starPathSeasonId:'../private'},
    {limit:501}, {limit:0}, {offset:-1}
  ]){
    assert.throws(()=>source.searchItems(invalid),/DB00_PUBLIC_SEARCH_/);
  }
  assert.equal(source.searchItems({text:'not a possible exact game item name 2026!'}).total,0);
  assert.equal(source.database.itemCount,13202);
});
