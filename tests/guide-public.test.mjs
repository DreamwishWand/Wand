import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyPublicQuestIndex,filterPublicQuests,verifyPublicQuestPart,loadPublicQuestPart,formatPublicGuideText} from '../src/lib/guide/public-guide.mjs';
import {readFile} from 'node:fs/promises';
const fixture=new URL('../static/guide/public/', import.meta.url);
const local=name=>new URL(name,fixture);
let index;
test('actual original-derived public catalog has 733 named missions, 8 locale contracts and 8 digest-pinned lazy partitions',async()=>{
  index=verifyPublicQuestIndex(JSON.parse(await readFile(local('quest-index.json'),'utf8')));
  assert.equal(index.quests.length,733);
  assert.equal(index.counts.objectives,11782);
  assert.equal(index.counts.steps,7878);
  assert.equal(filterPublicQuests(index,{query:'ドリームライトバレーへようこそ'}).total,1);
  assert(filterPublicQuests(index,{query:'Welcome to Dreamlight Valley',locale:'ja'}).total>=1);
  assert.equal(filterPublicQuests(index,{objective:'__NEVER__'}).total,0);
});
test('all eight original-derived public detail parts have exact native census and record membership',async()=>{
  index ||= verifyPublicQuestIndex(JSON.parse(await readFile(local('quest-index.json'),'utf8')));
  let q=0,objective=0,step=0;
  for(let p=0;p<8;p++){
    const detail=verifyPublicQuestPart(index,JSON.parse(await readFile(local(`quest-details-${String(p).padStart(2,'0')}.json`),'utf8')),p);
    q+=detail.quests.length;
    for(let r of detail.quests){objective+=r.objectiveCount;step+=r.steps.length;}
  }
  assert.deepEqual([q,objective,step],[733,11782,7878]);
});
test('foreign detail ID and mutated objective census are rejected',async()=>{
  index ||= verifyPublicQuestIndex(JSON.parse(await readFile(local('quest-index.json'),'utf8')));
  const d=JSON.parse(await readFile(local('quest-details-00.json'),'utf8'));
  let altered=structuredClone(d);altered.quests[0].id='999999';assert.throws(()=>verifyPublicQuestPart(index,altered,0),/foreign/);
  altered=structuredClone(d);altered.quests[0].objectiveCount++;assert.throws(()=>verifyPublicQuestPart(index,altered,0),/census/);
});
test('detail download hash rejects post-publication mutation',async()=>{
  index ||= verifyPublicQuestIndex(JSON.parse(await readFile(local('quest-index.json'),'utf8')));
  const file=await readFile(local('quest-details-00.json'));
  const fetcher=async()=>({ok:true,arrayBuffer:async()=>file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength)});
  assert.equal((await loadPublicQuestPart(index,0,'/guide/public/quest-details-00.json',fetcher)).part,0);
  const altered=Buffer.from(file);altered[44]^=1;
  await assert.rejects(loadPublicQuestPart(index,0,'/',async()=>({ok:true,arrayBuffer:async()=>altered.buffer.slice(altered.byteOffset,altered.byteOffset+altered.byteLength)})),/fingerprint/);
});

test('source objective formatting stays readable without injecting HTML or inventing placeholder values',()=>{
  assert.equal(formatPublicGuideText('<ActivityItem>リンゴ</ActivityItem>を集めよう'),'リンゴを集めよう');
  assert.equal(formatPublicGuideText('A<nbsp>B'), 'A B');
  assert.equal(formatPublicGuideText('{ItemName}を{TargetAmount}個'),'{ItemName}を{TargetAmount}個');
  assert.equal(formatPublicGuideText('<nobr>日本語</nobr>\u200b<smallcaps>表記</smallcaps>'),'日本語表記');
  assert.equal(formatPublicGuideText(null),'');
});
