import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {verifyPublicQuestIndex} from '../src/lib/guide/public-guide.ts';
import {verifyPublicQuestRewards} from '../src/lib/guide/public-quest-rewards.ts';
import {verifyPublicQuestOverrideLoot} from '../src/lib/guide/public-quest-override-loot.ts';
import {
  DB03_QUEST_REWARD_LABEL_SCHEMA,DB03_QUEST_REWARD_LABEL_BYTES,
  DB03_QUEST_REWARD_LABEL_SHA,DB03_QUEST_REWARD_LABEL_FILE,
  verifyPublicQuestRewardItemLabels,loadPublicQuestRewardItemLabels
} from '../src/lib/guide/public-quest-reward-item-labels.ts';

const root=new URL('../static/guide/public/',import.meta.url);
const db00=new URL('../static/ddv/game-db/releases/steam-1.26.2-native-itemlist-v1/',import.meta.url);
const read=async(path,folder=root)=>JSON.parse(await readFile(new URL(path,folder),'utf8'));
async function fixture(){
  const index=verifyPublicQuestIndex(await read('quest-index.json'));
  const rewards=verifyPublicQuestRewards(await read('quest-rewards-1.26.2.json'),index);
  const overrides=verifyPublicQuestOverrideLoot(
    await read('quest-override-loot-candidates-1.26.2.json'),rewards);
  const bytes=await readFile(new URL(DB03_QUEST_REWARD_LABEL_FILE,root));
  const raw=JSON.parse(bytes.toString('utf8'));
  return {index,rewards,overrides,bytes,raw,
    labels:verifyPublicQuestRewardItemLabels(raw,rewards,overrides)};
}

test('281 published native Quest reward Item names have exact 8-language and Collection links',async()=>{
  const {rewards,overrides,bytes,labels}=await fixture();
  assert.equal(DB03_QUEST_REWARD_LABEL_SCHEMA,
    'wand.db03.public-quest-reward-item-labels@1');
  assert.equal(bytes.length,DB03_QUEST_REWARD_LABEL_BYTES);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),DB03_QUEST_REWARD_LABEL_SHA);
  assert.equal(labels.coverage.sourceRewardItemIds,296);
  assert.equal(labels.coverage.publishedVerifiedNames,281);
  assert.equal(labels.coverage.unresolvedSourceItemIds,15);
  assert.equal(labels.coverage.sourceRewardOccurrences,399);
  assert.equal(labels.coverage.guaranteedGrantVerified,false);
  assert.equal(labels.coverage.playerOwnershipVerified,false);
  assert(Object.isFrozen(labels.coverage));
  assert(Object.isFrozen(labels.publishedItemIds));
  assert.equal(labels.publishedItemIds.length,281);
  assert.equal(labels.getDisplayName('40004032','ja'),'ポップコーンバケット（荷車）');
  assert.equal(labels.getDisplayName(40004032,'en'),'Mine Cart Popcorn Bucket');
  assert.equal(labels.getCollectionHref('40004032','/Wand'),
    '/Wand/collection/?item=40004032');
  assert.equal(labels.getCollectionHref(30200002),'/collection/?item=30200002');
  assert.equal(labels.getDisplayName('30200002','ja'),'リンゴ');
  assert.equal(labels.getDisplayName('80000000','ja'),null);
  assert.equal(labels.getCollectionHref('80000000','/Wand'),null);
  assert.equal(labels.getDisplayName('120000051','ja'),null);
  for(const unpublished of [
    '80000000','80300000','100000166','120000051','80000003',
    '150100035','170000029','80000010','120000159','110800052',
    '120000192','210600006','110800057','120000203','2050301460'
  ]){
    assert.equal(labels.getDisplayName(unpublished,'ja'),null,unpublished);
    assert.equal(labels.getCollectionHref(unpublished,'/Wand'),null,unpublished);
  }
  for(const input of ['0','0040004032','__proto__','999999999999999','99999999999999999',null]){
    assert.equal(labels.getDisplayName(input,'ja'),null);
    assert.equal(labels.getCollectionHref(input,'/Wand'),null);
  }
  for(const bad of ['//evil','../private','https://example.org']){
    assert.throws(()=>labels.getCollectionHref('40004032',bad),/COLLECTION_INVALID_ITEM_LINK/);
  }
  let occurrences=0;
  const ids=new Set();
  for(const questId of rewards.questIdsWithEvidence){
    const row=rewards.getQuest(questId);
    for(const cur of row.currencies){ids.add(cur.itemId);occurrences++;}
    for(const item of row.lootCandidates){ids.add(item.itemId);occurrences++;}
  }
  for(const item of overrides.candidates){ids.add(item.itemId);occurrences++;}
  assert.equal(occurrences,399);
  assert.equal(ids.size,296);
  assert.deepEqual([...ids].filter(id=>labels.getDisplayName(id,'ja')!==null).length,281);
});
test('every published localized label exactly matches the pinned DB-00 release sharded Item records',async()=>{
  const {labels}=await fixture();
  const rawIndex=await read('index.json',db00);
  const originalIndexBytes=await readFile(new URL('index.json',db00));
  assert.equal(createHash('sha256').update(originalIndexBytes).digest('hex'),
    '06912b156823d920d1b3a2b937ebff3d06e1ca670043db616c907c683b46599f');
  assert.equal(rawIndex.id,'steam-1.26.2-native-itemlist-v1');
  assert.equal(rawIndex.count,13202);
  const known=new Set(labels.publishedItemIds);
  const found=new Set();
  for(const shard of rawIndex.shards){
    const bytes=await readFile(new URL(shard.file,db00));
    assert.equal(bytes.length,shard.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),shard.sha256);
    const part=JSON.parse(bytes.toString('utf8'));
    for(const item of part.items){
      if(!known.has(item.id))continue;
      assert.equal(item.nameStatus,'verified');
      assert(!found.has(item.id));found.add(item.id);
      for(const locale of ['ja','en','fr','it','de','es-ES','zh-CN','pt-BR']){
        assert.equal(labels.getDisplayName(item.id,locale),item.names[locale],
          'native published Item label mismatch: '+item.id+'/'+locale);
      }
    }
  }
  assert.equal(found.size,281,'some claimed published Items do not exist in DB-00');
});
test('changed, foreign or incomplete reward label projections cannot be trusted',async()=>{
  const {rewards,overrides,raw,bytes}=await fixture();
  const edited=()=>structuredClone(raw);
  let forged=edited();forged.source.db00ReleaseIndexSha256='0'.repeat(64);
  assert.throws(()=>verifyPublicQuestRewardItemLabels(forged,rewards,overrides),/PROVENANCE/);
  forged=edited();forged.target.gameVersion='1.26.3';
  assert.throws(()=>verifyPublicQuestRewardItemLabels(forged,rewards,overrides),/TARGET/);
  forged=edited();const item=forged.items['40004032'];
  delete forged.items['40004032'];forged.items['80000000']=item;
  assert.throws(()=>verifyPublicQuestRewardItemLabels(forged,rewards,overrides),/PUBLISHED_MEMBERSHIP/,
    'an unpublished native currency ID cannot be spoofed as a published Item');
  forged=edited();delete forged.items['40004032'];
  forged.items['999999999']=item;
  assert.throws(()=>verifyPublicQuestRewardItemLabels(forged,rewards,overrides),/PUBLISHED_ITEM/,
    'an Item ID absent from the source graph cannot enter the crosswalk');
  forged=edited();forged.items['40004032'][0]='';
  assert.throws(()=>verifyPublicQuestRewardItemLabels(forged,rewards,overrides),/PUBLISHED_ITEM/);
  assert.throws(()=>verifyPublicQuestRewardItemLabels(raw,{schema:'forged'},overrides),/ORIGINAL_SOURCE_REQUIRED/);
  assert.throws(()=>verifyPublicQuestRewardItemLabels(raw,rewards,{schema:'forged'}),/ORIGINAL_SOURCE_REQUIRED/);
  const fetcher=async contents=>new Response(contents,{status:200});
  const loaded=await loadPublicQuestRewardItemLabels(rewards,overrides,'/Wand/guide/public/'+
    DB03_QUEST_REWARD_LABEL_FILE,()=>fetcher(bytes));
  assert.equal(loaded.publishedItemIds.length,281);
  const changed=Buffer.from(bytes);changed[300]^=1;
  await assert.rejects(loadPublicQuestRewardItemLabels(rewards,overrides,'/x',
    ()=>fetcher(changed)),/DB03_QUEST_REWARD_LABEL_SHA/);
  await assert.rejects(loadPublicQuestRewardItemLabels(rewards,overrides,'/x',
    ()=>fetcher('bad')),/DB03_QUEST_REWARD_LABEL_BYTES/);
  await assert.rejects(loadPublicQuestRewardItemLabels(rewards,overrides,'/x',
    ()=>new Response('',{status:404})),/DB03_QUEST_REWARD_LABEL_DOWNLOAD_FAILED/);
});
test('Quest Svelte view displays published names only after source verification and keeps optional failure isolated',async()=>{
  const page=await readFile(new URL('../src/routes/guide/quests/+page.svelte',import.meta.url),'utf8');
  assert.match(page,/loadPublicQuestRewardItemLabels\(data,verified/);
  assert.match(page,/rewardLabels=labels/);
  assert.match(page,/rewardItemName\(reward.itemId,'アイテム'\)/);
  assert.match(page,/rewardCollectionHref\(reward.itemId\)/);
  assert.match(page,/rewardItemName\(questOverrideInfo.itemId,'アイテム'\)/);
});
