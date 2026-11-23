import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyPublicQuestIndex,filterPublicQuests,findPublicQuestByLink,verifyPublicQuestPart,loadPublicQuestPart,formatPublicGuideText} from '../src/lib/guide/public-guide.ts';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
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
test('public quest deep links resolve only exactly one authenticated native quest ID',async()=>{
  index ||= verifyPublicQuestIndex(JSON.parse(await readFile(local('quest-index.json'),'utf8')));
  const match=findPublicQuestByLink(index,'?utm_source=collection&quest=2070000620');
  assert.equal(match?.id,'2070000620');
  assert.equal(findPublicQuestByLink(index,'?quest=2070000620&quest=2070000688'),null);
  assert.equal(findPublicQuestByLink(index,'?quest=9999999999999999'),null);
  assert.equal(findPublicQuestByLink(index,'?quest=2070000620%20'),null);
  assert.equal(findPublicQuestByLink(index,'?quest=<script>'),null);
  assert.equal(findPublicQuestByLink(index,'?unrelated=1'),null);
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

test('all eight published Quest details match their source-pinned SHA-256 and native 733/7878/11782 census',async()=>{
  const catalog=verifyPublicQuestIndex(JSON.parse(await readFile(local('quest-index.json'))));
  let quests=0,steps=0,objectives=0;
  for(let part=0;part<8;part++){
    const filename='quest-details-'+String(part).padStart(2,'0')+'.json';
    const bytes=await readFile(local(filename));
    assert.equal(bytes.byteLength,catalog.detailFiles[filename].bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),
      catalog.detailFiles[filename].sha256);
    const response=()=>({ok:true,arrayBuffer:async()=>bytes.buffer.slice(
      bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
    const decoded=await loadPublicQuestPart(catalog,part,filename,async()=>response());
    quests+=decoded.quests.length;
    for(const row of decoded.quests){
      steps+=row.steps.length;
      objectives+=row.objectiveCount;
    }
  }
  assert.deepEqual({quests,steps,objectives},
    {quests:733,steps:7878,objectives:11782});
});
test('source-only typed Quest index rejects counterfeit groups, characters, names and manifest digests',async()=>{
  const source=verifyPublicQuestIndex(JSON.parse(await readFile(local('quest-index.json'))));
  const changed=edit=>{const v=structuredClone(source);edit(v);return v;};
  const invalid=[
    [v=>{v.quests[0].id='__proto__'},/bad or duplicate quest/],
    [v=>{v.quests[0].characterId='100000000000'},/foreign source character\/group/],
    [v=>{v.quests[0].groupId='100000000000'},/foreign source character\/group/],
    [v=>{v.quests[1].id=v.quests[0].id},/bad or duplicate quest/],
    [v=>{v.quests[0].names.ru='unverified'},/bad or duplicate quest/],
    [v=>{v.quests[0].detailPart=8},/bad or duplicate quest/],
    [v=>{v.detailFiles['quest-details-01.json'].sha256='0'.repeat(63)},/invalid detail SHA manifest/],
    [v=>{v.provenance.sourceIsStaticNotPlayerProgress=false},/unsupported original-source quest catalogue/]
  ];
  for(const [edit,expected] of invalid)
    assert.throws(()=>verifyPublicQuestIndex(changed(edit)),expected);
  assert.equal(source.quests.filter(row=>Object.keys(row.names).length===0).length,26,
    'unresolved native display names must not be fabricated');
  assert.equal(filterPublicQuests(source,{section:'all',offset:733,limit:40}).rows.length,0);
  assert.throws(()=>filterPublicQuests(source,{limit:101}),/invalid search/);
  assert.equal(findPublicQuestByLink(source,'?quest=2070000620&quest=2070000620'),null);
});
test('verified public Quest shard rejects same-size tampering before decoding and invalid source positions',async()=>{
  const catalog=verifyPublicQuestIndex(JSON.parse(await readFile(local('quest-index.json'))));
  const raw=await readFile(local('quest-details-00.json'));
  const changed=Buffer.from(raw);changed[58]^=1;
  const fetcher=bytes=>async()=>({ok:true,arrayBuffer:async()=>bytes.buffer.slice(
    bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
  await assert.rejects(()=>loadPublicQuestPart(catalog,0,'test',fetcher(changed)),
    /detail fingerprint mismatch/);
  assert.throws(()=>verifyPublicQuestPart(catalog,
    {...JSON.parse(raw),part:8},0),/wrong quest part/);
  const parsed=JSON.parse(raw);
  const mutated=structuredClone(parsed);
  mutated.quests[0].steps[0].subSteps[0].objectives[0].text={ja:'ok',unsafe:'X'};
  assert.throws(()=>verifyPublicQuestPart(catalog,mutated,0),/invalid objective text/);
});
