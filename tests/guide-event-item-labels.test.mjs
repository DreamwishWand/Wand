import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {
  verifyPublicEventFriendshipRewards,DB03_EVENT_FRIENDSHIP_REWARD_FILE
} from '../src/lib/guide/public-event-friendship-rewards.ts';
import {
  verifyEventRewardItemLabels,loadEventRewardItemLabels,
  DB03_EVENT_ITEM_LABELS_FILE,DB03_EVENT_ITEM_LABELS_BYTES,DB03_EVENT_ITEM_LABELS_SHA,
} from '../src/lib/guide/event-reward-item-labels.ts';
const directory=new URL('../static/guide/public/',import.meta.url);
async function original(){
  const [rewardBytes,labelsBytes]=await Promise.all([
    readFile(new URL(DB03_EVENT_FRIENDSHIP_REWARD_FILE,directory)),
    readFile(new URL(DB03_EVENT_ITEM_LABELS_FILE,directory))
  ]);
  const rewards=verifyPublicEventFriendshipRewards(JSON.parse(rewardBytes.toString('utf8')));
  return {rewards,labelsBytes,raw:JSON.parse(labelsBytes.toString('utf8'))};
}
test('complete 141 source reward Item IDs have exactly 109 SHA-backed DB-00 names and 32 honest unresolved IDs',async()=>{
  const {rewards,raw,labelsBytes}=await original();
  assert.equal(labelsBytes.byteLength,DB03_EVENT_ITEM_LABELS_BYTES);
  assert.equal(createHash('sha256').update(labelsBytes).digest('hex'),DB03_EVENT_ITEM_LABELS_SHA);
  const label=verifyEventRewardItemLabels(raw,rewards);
  assert.equal(label.coverage.rewardItemIds,141);
  assert.equal(label.coverage.verifiedNames,109);
  assert.equal(label.coverage.missingPublishedNames,32);
  assert.equal(label.coverage.publishedImages,0);
  assert.equal(label.coverage.gameScreenCategoriesVerified,false);
  const ids=new Set([
    ...rewards.events.flatMap(e=>e.rewards.map(r=>r.itemId)),
    ...rewards.defaultFriendship.map(r=>r.itemId)
  ]);
  assert.equal(ids.size,141);
  let names=0;
  for(const id of ids){
    const row=label.getItem(id);
    assert(row);assert.equal(row.itemId,id);
    assert.equal(row.publicImageUrl,null);
    assert(Object.isFrozen(row));
    if(row.status==='verified'){
      names++;assert(row.names);assert(Object.isFrozen(row.names));
      assert(label.getDisplayName(id,'ja').length>0);
    }else{
      assert.equal(label.getDisplayName(id,'ja'),id);
      assert.equal(row.names,null);
      assert.equal(row.sourceCategory,null);
    }
  }
  assert.equal(names,109);
  assert.equal(label.getDisplayName('40006319','ja'),'人食い宝箱');
  assert.equal(label.getDisplayName('40006319','en'),'Chomping Chest');
  assert.equal(label.getItem('40006319').sourceCategory,'Furniture');
  assert.equal(label.getItem('80000000').status,'missing');
  assert.equal(label.getItem('80100000').status,'missing');
  assert.equal(label.getDisplayName('999999999999','ja'),'999999999999');
  assert.equal(label.getItem('__proto__'),null);
});
test('public reader is byte-size SHA-256 pinned and rejects edits or inaccessible files',async()=>{
  const {rewards,labelsBytes}=await original();
  const fetcher=async bytes=>new Response(bytes,{status:200});
  const valid=await loadEventRewardItemLabels(rewards,'/Wand/guide/public/'+DB03_EVENT_ITEM_LABELS_FILE,
    ()=>fetcher(labelsBytes));
  assert.equal(valid.coverage.verifiedNames,109);
  const corrupt=Buffer.from(labelsBytes);corrupt[190]^=1;
  await assert.rejects(loadEventRewardItemLabels(rewards,'/',()=>fetcher(corrupt)),/DB03_EVENT_ITEM_LABELS_SHA/);
  await assert.rejects(loadEventRewardItemLabels(rewards,'/',()=>fetcher(Buffer.from('wrong'))),/DB03_EVENT_ITEM_LABELS_BYTES/);
  await assert.rejects(loadEventRewardItemLabels(rewards,'/',()=>new Response('',{status:404})),/DB03_EVENT_ITEM_LABELS_DOWNLOAD_FAILED/);
});
test('reject forged names, invented reward identifiers, forged game-screen category and media provenance',async()=>{
  const {rewards,raw}=await original();
  let altered=structuredClone(raw);
  altered.items['40006319'][2][0]='捏造した名称';
  assert.notEqual(verifyEventRewardItemLabels(altered,rewards).getDisplayName('40006319','ja'),
    '人食い宝箱', 'structural view does not attest mutable input; the SHA-pinned loader must be used');
  altered=structuredClone(raw);
  altered.items['999999999999']=['verified','Furniture',Array(8).fill('Fake')];
  assert.throws(()=>verifyEventRewardItemLabels(altered,rewards),/DB03_EVENT_ITEM_LABELS_CENSUS/);
  altered=structuredClone(raw);
  altered.source.originalGameScreenCategoriesVerified=true;
  assert.throws(()=>verifyEventRewardItemLabels(altered,rewards),/DB03_EVENT_ITEM_LABELS_SOURCE/);
  altered=structuredClone(raw);
  altered.source.publicSourceImagesAvailable=true;
  assert.throws(()=>verifyEventRewardItemLabels(altered,rewards),/DB03_EVENT_ITEM_LABELS_SOURCE/);
  altered=structuredClone(raw);
  altered.items['40006319']=['missing',null,raw.items['40006319'][2]];
  assert.throws(()=>verifyEventRewardItemLabels(altered,rewards),/DB03_EVENT_ITEM_LABELS_UNKNOWN_LABEL_MUST_BE_NULL/);
  altered=structuredClone(raw);
  altered.target.gameVersion='1.26.3';
  assert.throws(()=>verifyEventRewardItemLabels(altered,rewards),/DB03_EVENT_ITEM_LABELS_TARGET/);
});
test('Guide event UI exposes original event rewards and friendship stages without claiming live availability or fabricated images',async()=>{
  const route=await readFile(new URL('../src/routes/guide/events/+page.svelte',import.meta.url),'utf8');
  assert.match(route,/loadPublicEventFriendshipRewards/);
  assert.match(route,/loadEventRewardItemLabels/);
  assert.match(route,/watchWandLanguage/);
  assert.match(route,/if\(event.id==='TestEv'\)return false/);
  assert.match(route,/getDefaultFriendshipRewards\(level\)/);
  assert.match(route,/Item ID \$\{itemId\}/);
  assert.match(route,/画像は公開準備中/);
  assert.match(route,/Oogie Boogie/);
});