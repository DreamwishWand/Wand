import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {verifyPublicEventFriendshipRewards}
  from '../src/lib/guide/public-event-friendship-rewards.ts';
import {verifyEventRewardItemLabels}
  from '../src/lib/guide/event-reward-item-labels.ts';
import {
  selectNewPublishedEventRewardNames,loadNewPublishedEventRewardNames,
  DB03_EVENT_PUBLIC_NAME_REFRESH_SCHEMA
} from '../src/lib/guide/public-event-reward-db00-refresh.ts';

const guide=new URL('../static/guide/public/',import.meta.url);
const db=new URL('../static/ddv/game-db/',import.meta.url);
const source=verifyPublicEventFriendshipRewards(JSON.parse(readFileSync(
  new URL('event-friendship-rewards-1.26.2.json',guide),'utf8')));
const labels=verifyEventRewardItemLabels(JSON.parse(readFileSync(
  new URL('event-reward-item-labels-1.26.2.json',guide),'utf8')),source);

function updatedDb(items){
  return {
    id:'steam-1.26.2-public-reissue-test-fixture',
    target:{platform:'Steam',gameVersion:'1.26.2',buildId:null,
      sourceSha256:'a'.repeat(64)},
    sources:[{id:'public-fixture',sha256:'b'.repeat(64),
      visibility:'public_reference'}],items
  };
}
function item(id,names,status='verified',category='Furniture'){
  return {id,names,nameStatus:status,category,worlds:[],universes:[],
    contentIds:[],releaseIds:[],relations:[],sourceRefs:['public-fixture']};
}
test('published DB-00 baseline has 32 genuinely absent Guide reward Item IDs',()=>{
  const missing=Object.keys(JSON.parse(readFileSync(
    new URL('event-reward-item-labels-1.26.2.json',guide),'utf8')).items)
    .filter(id=>labels.getItem(id).status==='missing');
  assert.equal(missing.length,32);
  const seen=new Set();
  const release=new URL('releases/steam-1.26.2-native-itemlist-v1/',db);
  for(let part=0;part<14;part++){
    const rows=JSON.parse(readFileSync(new URL(
      'items-'+String(part).padStart(3,'0')+'.json',release),'utf8')).items;
    for(const row of rows)if(missing.includes(row.id))seen.add(row.id);
  }
  assert.deepEqual([...seen],[],
    'no owner-private source names can be silently promoted from current public DB-00');
});
test('future SHA-verified public reissue can fill only previously missing Item IDs',()=>{
  const names=selectNewPublishedEventRewardNames(source,labels,updatedDb([
    item('100000652',{ja:'公開テスト名',en:'Published test-only name'},'verified','Currency'),
    item('80000000',{},'unverified',null),
    item('40006319',{ja:'絶対に上書きしない',en:'must not overwrite'}),
    item('999999999',{ja:'無関係な名称',en:'unrelated test record'})
  ]));
  assert(names);
  assert.equal(names.schema,DB03_EVENT_PUBLIC_NAME_REFRESH_SCHEMA);
  assert.equal(names.newVerifiedItemIds.length,1);
  assert.equal(names.newVerifiedItemIds[0],'100000652');
  assert.equal(names.getDisplayName('100000652','ja'),'公開テスト名');
  assert.equal(names.getDisplayName('100000652','fr'),'Published test-only name');
  assert.equal(names.getSourceCategory('100000652'),'Currency');
  assert.equal(names.getDisplayName('40006319','ja'),null);
  assert.equal(names.getDisplayName('80000000','ja'),null);
  assert.equal(names.getDisplayName('999999999','ja'),null);
  assert.equal(labels.getDisplayName('40006319','ja'),'人食い宝箱');
  assert.equal(labels.getDisplayName('100000652','ja'),'100000652');
  assert.equal(names.privateSourceUsed,false);
  assert.equal(names.playerOwnershipVerified,false);
  assert.equal(names.currentVersionOnly,true);
  assert(Object.isFrozen(names));
  assert(Object.isFrozen(names.newVerifiedItemIds));
  assert.equal(selectNewPublishedEventRewardNames(source,labels,
    updatedDb([item('80000000',{},'unverified')])),null);
});
test('never admit unpinned private-source, wrong game version or malformed synthetic labels',()=>{
  const wrong=updatedDb([item('100000652',{ja:'sample'})]);
  wrong.sources[0].visibility='private';
  assert.throws(()=>selectNewPublishedEventRewardNames(source,labels,wrong),
    /PUBLISHED_DB00_REQUIRED/);
  wrong.sources[0].visibility='public_reference';
  wrong.target.gameVersion='1.26.3';
  assert.throws(()=>selectNewPublishedEventRewardNames(source,labels,wrong),
    /PUBLISHED_DB00_REQUIRED/);
  wrong.target.gameVersion='1.26.2';
  wrong.id='steam-1.26.2-native-itemlist-v1';
  assert.throws(()=>selectNewPublishedEventRewardNames(source,labels,wrong),
    /PUBLISHED_DB00_REQUIRED/);
  wrong.id='new-public-test-fixture';
  wrong.items[0].names={ja:''};
  assert.throws(()=>selectNewPublishedEventRewardNames(source,labels,wrong),
    /VERIFIED_NAME_MALFORMED/);
  wrong.items[0].names={invalid:'some-name'};
  assert.throws(()=>selectNewPublishedEventRewardNames(source,labels,wrong),
    /VERIFIED_NAME_MALFORMED/);
  wrong.items[0].names={ja:'valid'};
  wrong.items.push(item('100000652',{ja:'duplicate'}));
  assert.throws(()=>selectNewPublishedEventRewardNames(source,labels,wrong),
    /DUPLICATE_ITEM/);
});
test('baseline release makes only one cheap active-pointer request and no 6MB DB fetch',async()=>{
  const bytes=readFileSync(new URL('active.json',db));
  const calls=[];
  const fetcher=async url=>{
    calls.push(url);
    assert.equal(url,'/Wand/ddv/game-db/active.json');
    return new Response(bytes,{status:200});
  };
  const changed=await loadNewPublishedEventRewardNames(source,labels,'/Wand',fetcher);
  assert.equal(changed,null);
  assert.deepEqual(calls,['/Wand/ddv/game-db/active.json']);
  const future=JSON.parse(bytes.toString('utf8'));
  future.snapshot='new-patch-from-1.26.3';
  future.target.gameVersion='1.26.3';
  const futureCalls=[];
  const blocked=await loadNewPublishedEventRewardNames(source,labels,'/Wand',
    async url=>{futureCalls.push(url);return new Response(JSON.stringify(future))});
  assert.equal(blocked,null);
  assert.equal(futureCalls.length,1);
});
test('Event Guide uses public release only as an optional missing-name overlay',async()=>{
  const route=await readFile(new URL('../src/routes/guide/events/+page.svelte',import.meta.url),'utf8');
  assert.match(route,/loadNewPublishedEventRewardNames/);
  assert.match(route,/if\(source===read&&labels===loaded\)refreshedNames=overlay/);
  assert.match(route,/refreshedNames\?\.getDisplayName\(itemId,locale\)/);
  assert.match(route,/publishedRefresh\?\.getDisplayName\(reward.itemId,language\)/);
  assert.match(route,/Item ID \$\{itemId\}/,
    'IDs stay visible when no publicly verified labels exist');
});
