import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {verifyPublicStarpath} from '../src/lib/guide/public-starpath.mjs';
import {
  STARPATH_EXTRA_RELEASE,STARPATH_EXTRA_CATEGORIES,
  verifyStarpathRewardExtras,loadStarpathRewardExtras,starpathRewardDisplayName
} from '../src/lib/guide/starpath-reward-extras.ts';
import {VERIFIED_STARPATH_REWARD_NAMES,STARPATH_REWARD_NAME_CENSUS,
  verifyStarpathRewardNameCensus} from '../src/lib/guide/starpath-reward-names.ts';
const pub=new URL('../static/guide/public/',import.meta.url);
const read=async name=>readFile(new URL(name,pub));
const hash=buf=>createHash('sha256').update(buf).digest('hex');
const fromBuffer=buf=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength);
test('all previously unresolved 17 source IDs have exact v1.26.2 category and nine fully localized official names',async()=>{
  const raw=await read(STARPATH_EXTRA_RELEASE.file);
  assert.equal(raw.length,STARPATH_EXTRA_RELEASE.bytes);
  assert.equal(hash(raw),STARPATH_EXTRA_RELEASE.sha256);
  const season=verifyPublicStarpath(JSON.parse(await read('starpath-cache-2026-11-22.json')));
  const doc=verifyStarpathRewardExtras(JSON.parse(raw),season);
  assert.equal(Object.keys(doc.rows).length,17);
  assert.equal(Object.entries(doc.rows).filter(([,r])=>r.names!==null).length,9);
  assert.equal(Object.entries(doc.rows).filter(([,r])=>r.category==='TouchOfMagic'&&r.names===null).length,8);
  assert.equal(Object.keys(VERIFIED_STARPATH_REWARD_NAMES).length,43);
  assert.equal(43+9,52);
  assert.equal(doc.source.catalogComplete,false);
  assert.equal(doc.source.privatePackageSha256,STARPATH_EXTRA_RELEASE.privatePackageSha256);
  assert.deepEqual(doc.rows['80100000'].names['en-US'],'Moonstone');
  assert.deepEqual(doc.rows['80100000'].names.ja,'ムーンストーン');
  assert.equal(starpathRewardDisplayName('80100000','ja',doc),'ムーンストーン');
  assert.equal(starpathRewardDisplayName('80100000','en',doc),'Moonstone');
  assert.equal(starpathRewardDisplayName('170000115','ja',doc),'スケルトン・スクルージ');
  assert.equal(starpathRewardDisplayName('120000253','ja',doc),'サル（大尉）');
  assert.equal(starpathRewardDisplayName('20500163','ja',doc),'トリック&トリート・ハウス');
  assert.equal(starpathRewardDisplayName('100000778','ja',doc),'モチーフ（正式名称なし）');
  assert.equal(starpathRewardDisplayName('100000778','en',doc),'Motif (no official display name)');
  assert.equal(starpathRewardDisplayName('100000778','fr',doc),'Motif (no official display name)');
  assert.equal(starpathRewardDisplayName('50800175','ja',doc),'アクアマーメイドバックパック');
  assert.equal(starpathRewardDisplayName('not-id','ja',doc),null);
  assert.equal(starpathRewardDisplayName('__proto__','ja',doc),null);
  assert.equal(starpathRewardDisplayName('80100000','unknown',doc),null);
  const expected=new Set(Object.keys(STARPATH_EXTRA_CATEGORIES));
  assert.deepEqual(new Set(Object.keys(doc.rows)),expected);
  const changed={...doc,rows:{...doc.rows,'80100000':{...doc.rows['80100000'],names:{...doc.rows['80100000'].names,ja:'<svg onload=alert(1)>'}}}};
  assert.throws(()=>verifyStarpathRewardExtras(changed,season),/unsafe original label/);
  const guessed={...doc,rows:{...doc.rows,'100000778':{...doc.rows['100000778'],names:{ja:'fake'}}}};
  assert.throws(()=>verifyStarpathRewardExtras(guessed,season),/must not invent native name/);
  const removed={...doc,rows:Object.fromEntries(Object.entries(doc.rows).slice(1))};
  assert.throws(()=>verifyStarpathRewardExtras(removed,season),/17 source IDs/);
});
test('browser may only use digest-verified reward crosswalk',async()=>{
  const raw=await read(STARPATH_EXTRA_RELEASE.file);
  const season=verifyPublicStarpath(JSON.parse(await read('starpath-cache-2026-11-22.json')));
  const ok=async()=>({ok:true,arrayBuffer:async()=>fromBuffer(raw)});
  assert.equal(Object.keys((await loadStarpathRewardExtras('unused',season,ok)).rows).length,17);
  const altered=Buffer.from(raw);altered[55]^=1;
  await assert.rejects(()=>loadStarpathRewardExtras('unused',season,async()=>({ok:true,arrayBuffer:async()=>fromBuffer(altered)})),/fingerprint mismatch/);
  await assert.rejects(()=>loadStarpathRewardExtras('unused',season,async()=>({ok:false})),/fetch failed/);
});


test('typed reward names retain exact 43 public original names, 17 outside-category IDs, and no player-state claims',()=>{
  const audit=verifyStarpathRewardNameCensus();
  assert.deepEqual(audit,STARPATH_REWARD_NAME_CENSUS);
  assert.equal(audit.verifiedNames,43);
  assert.equal(audit.unresolved,17);
  assert.equal(audit.sourceCandidates,60);
  assert.equal(audit.playerOwnershipVerified,false);
  assert.equal(audit.currentAvailabilityVerified,false);
  assert(Object.isFrozen(audit));
});
test('reward extras loader rejects an apparently complete but unverified 2-season catalogue',async()=>{
  const snapshot=verifyPublicStarpath(JSON.parse(await read('starpath-cache-2026-11-22.json')));
  const data=JSON.parse(await read(STARPATH_EXTRA_RELEASE.file));
  const fake=structuredClone(snapshot);
  fake.source.fileSha256='0'.repeat(64);
  assert.throws(()=>verifyStarpathRewardExtras(data,fake),/provenance/);
  assert.equal(starpathRewardDisplayName('100000778','not-a-language',data),null);
  assert.equal(starpathRewardDisplayName('20500163','ja',null),null);
  assert.equal(starpathRewardDisplayName('__proto__','ja',data),null);
});
