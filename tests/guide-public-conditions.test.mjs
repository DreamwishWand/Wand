import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {
  PUBLIC_QUEST_CONDITIONS_SCHEMA,PUBLIC_QUEST_CONDITIONS_SHA256,
  PUBLIC_QUEST_CONDITIONS_FILE,decodePublicQuestConditions,
  loadPublicQuestConditions,publicConditionText,publicConditionDisplay
} from '../src/lib/guide/public-quest-conditions.ts';
import {verifyPublicQuestIndex} from '../src/lib/guide/public-guide.mjs';

async function source(){
  const [encoded,index]=await Promise.all([
    readFile(new URL('../static/guide/public/'+PUBLIC_QUEST_CONDITIONS_FILE,import.meta.url),'utf8'),
    readFile(new URL('../static/guide/public/quest-index.json',import.meta.url),'utf8')
  ]);
  const data=gunzipSync(Buffer.from(encoded,'base64'));
  return {encoded,doc:JSON.parse(data.toString('utf8')),index:JSON.parse(index)};
}
test('complete source-pinned 1.26.2 public Guide index verifies all 733 native Quest conditions',async()=>{
  const {encoded,doc,index}=await source();
  assert.equal(encoded.length,14704);
  assert.equal(doc.schema,PUBLIC_QUEST_CONDITIONS_SCHEMA);
  assert.equal(doc.counts.quests,733);
  assert.equal(doc.counts.leaves,2515);
  assert.equal(doc.counts.availableWithLeaves,733);
  assert.equal(doc.counts.unlockWithLeaves,311);
  assert.equal(doc.counts.predicatesWithoutSelectedScalars,80);
  assert.equal(verifyPublicQuestIndex(index),index);
  const registry=decodePublicQuestConditions(doc,index);
  assert.equal(registry.coverage.quests,733);
  assert.equal(registry.coverage.leaves,2515);
  assert.equal(registry.coverage.sourceIsStaticNotPlayerProgress,true);
  assert.equal(registry.coverage.runtimePrerequisitesVerified,false);
  assert.equal(registry.sourceProjectionVersion,'1.26.1');
  assert.equal(registry.targetVersion,'1.26.2');
  assert.equal(registry.getQuest('999999999999'),null);
  assert.equal(registry.getQuest('../bad'),null);
  assert.equal(registry.getQuest('2070000701')?.availability?.operator,'AND');
  assert.deepEqual(registry.getQuest('2070000701')?.availability?.clauses.map(x=>x.type==='predicate'?x.kind:'nested'),
    ['MissionCompleted','AreaUnlocked']);
  assert.equal(registry.getQuest('2070000701')?.availability?.clauses[0].sourceFields.missionId,'2070000629');
  assert.equal(registry.getQuest('2070000701')?.unlock?.clauses.length,0);
  assert(Object.isFrozen(registry));
  assert(Object.isFrozen(registry.coverage));
  assert(Object.isFrozen(registry.getQuest('2070000701')?.availability?.clauses));
});
test('production gzip/base64 loader verifies uncompressed bytes and SHA-256 before exposing native IDs',async()=>{
  const {encoded,index}=await source();
  const sha=(await import('node:crypto')).createHash('sha256')
    .update(gunzipSync(Buffer.from(encoded,'base64'))).digest('hex');
  assert.equal(sha,PUBLIC_QUEST_CONDITIONS_SHA256);
  const data=await loadPublicQuestConditions(index,'/guide/public/'+PUBLIC_QUEST_CONDITIONS_FILE,
    async()=>new Response(encoded,{status:200}));
  assert.equal(data.getQuest('2070000620')?.id,'2070000620');
  const wrong=encoded.replace(/.$/,'A');
  await assert.rejects(loadPublicQuestConditions(index,'/test',
    async()=>new Response(wrong,{status:200})));
  await assert.rejects(loadPublicQuestConditions(index,'/test',
    async()=>new Response('not a source bundle',{status:200})),/UNEXPECTED_ASSET_SIZE/);
  await assert.rejects(loadPublicQuestConditions(index,'/test',
    async()=>new Response('',{status:404})),/DOWNLOAD_FAILED/);
});
test('public static source predicates never flatten OR into mandatory prerequisites',async()=>{
  const {doc,index}=await source();
  const reader=decodePublicQuestConditions(doc,index);
  const branchRecord=index.quests.map(r=>reader.getQuest(r.id)).find(r=>
    r?.availability?.operator==='OR'||r?.availability?.clauses.some(x=>x.type==='nested'&&x.tree.operator==='OR'));
  assert(branchRecord,'at least one source Quest retains an OR branch');
  const rendered=publicConditionText(branchRecord.availability,index,'ja');
  assert.match(rendered,/または/);
  assert.match(publicConditionText(null,index),'条件の指定なし');
  const direct=reader.getQuest('2070000701')?.availability?.clauses[0];
  assert.equal(direct.type,'predicate');
  assert.match(publicConditionDisplay(direct,index,'ja'),/完了/);
  assert.match(publicConditionText(reader.getQuest('2070000701')?.availability,index,'ja'),/かつ/);
  assert.equal(Object.isFrozen(direct.sourceFields),true);
});
test('wrong versions, missing Quest rows, changed source counts and unrecognized operators fail closed',async()=>{
  const {doc,index}=await source();
  const a=structuredClone(doc);
  a.target.gameVersion='1.26.3';
  assert.throws(()=>decodePublicQuestConditions(a,index),/WRONG_PROVENANCE/);
  const b=structuredClone(doc);
  b.records.pop();
  assert.throws(()=>decodePublicQuestConditions(b,index),/MISSING_QUESTS/);
  const c=structuredClone(doc);
  c.counts.leaves=2514;
  assert.throws(()=>decodePublicQuestConditions(c,index),/INVALID_SOURCE_CENSUS/);
  const d=structuredClone(doc);
  d.records[0][1][0]=8;
  assert.throws(()=>decodePublicQuestConditions(d,index),/INVALID_BRANCH/);
  const e=structuredClone(doc);
  e.records[0][0]='99999999';
  assert.throws(()=>decodePublicQuestConditions(e,index),/FOREIGN_OR_MISSING_PUBLIC_QUEST/);
});
test('public Guide consumes published quest clauses; no private archives or saves are requested',async()=>{
  const route=await readFile(new URL('../src/routes/guide/quests/+page.svelte',import.meta.url),'utf8');
  const module=await readFile(new URL('../src/lib/guide/public-quest-conditions.ts',import.meta.url),'utf8');
  assert.match(route,/void loadConditions\(catalog\)/);
  assert.match(route,/publicConditionText\(questConditions\.availability,catalog,locale\)/);
  assert.match(route,/publicConditionText\(questConditions\.unlock,catalog,locale\)/);
  assert.match(route,/出現・解放条件/);
  assert.doesNotMatch(module,/Wand-Guide-Steam-v1\.26\.2-private\.zip|FileReader|localStorage|postMessage|save\.json/);
  assert.match(module,/DecompressionStream\('gzip'\)/);
});
