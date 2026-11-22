import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  DB03_LOCAL_REWARD_REQUIRED_FILES,loadVerifiedLocalGuideRewards
} from '../src/lib/guide/local-reward-files.ts';
import {DB03_PRIVATE_REWARD_SOURCE} from '../src/lib/guide/private-reward-evidence.ts';
import {GUIDE_SOURCE_COMPOSITE_V2_BYTES} from '../src/lib/guide/source-composite.mjs';

const sizes=Object.values(DB03_LOCAL_REWARD_REQUIRED_FILES);
const mock=(size,name='private.json',read=()=>new ArrayBuffer(size))=>({
  name,size,arrayBuffer:read
});

test('Guide local reward import reuses all five original private source pin sizes',()=>{
  assert.equal(sizes.length,5);
  assert.equal(new Set(sizes).size,5);
  assert.equal(DB03_LOCAL_REWARD_REQUIRED_FILES.eventLinks,DB03_PRIVATE_REWARD_SOURCE.eventLinks.bytes);
  assert.equal(DB03_LOCAL_REWARD_REQUIRED_FILES.questFlows,DB03_PRIVATE_REWARD_SOURCE.questFlows.bytes);
  assert.equal(DB03_LOCAL_REWARD_REQUIRED_FILES.friendshipDefaults,DB03_PRIVATE_REWARD_SOURCE.friendshipDefaults.bytes);
  assert.equal(DB03_LOCAL_REWARD_REQUIRED_FILES.guideSourceCompositeV2,GUIDE_SOURCE_COMPOSITE_V2_BYTES);
  assert.equal(DB03_LOCAL_REWARD_REQUIRED_FILES.protoDbBridge,1470);
  assert.equal(sizes.reduce((sum,size)=>sum+size,0),798478);
  assert(Object.isFrozen(DB03_LOCAL_REWARD_REQUIRED_FILES));
});

test('unrecognized, missing or duplicate source lengths fail before reading any private bytes',async()=>{
  let reads=0;
  const files=sizes.map((size,i)=>mock(size,'file-'+i,()=>{
    reads++;return Promise.resolve(new ArrayBuffer(size));
  }));
  await assert.rejects(()=>loadVerifiedLocalGuideRewards(files.slice(0,4)),
    /REQUIRE_FIVE_FILES/);
  await assert.rejects(()=>loadVerifiedLocalGuideRewards([...files.slice(0,4),files[0]]),
    /DUPLICATE_SOURCE_SIZE/);
  await assert.rejects(()=>loadVerifiedLocalGuideRewards([...files.slice(0,4),mock(32)]),
    /UNKNOWN_SOURCE_SIZE/);
  await assert.rejects(()=>loadVerifiedLocalGuideRewards([...files.slice(0,4),null]),
    /INVALID_FILE/);
  assert.equal(reads,0,'invalid selections must not be opened');
});

test('changing files during local read or unverified bytes cannot be promoted into reward candidates',async()=>{
  const changed=sizes.map(size=>mock(size,'private.json',async()=>new ArrayBuffer(size)));
  changed[1]=mock(sizes[1],'private.json',async()=>new ArrayBuffer(1));
  await assert.rejects(()=>loadVerifiedLocalGuideRewards(changed),
    /SOURCE_CHANGED_DURING_READ/);
  const fake=sizes.map(size=>mock(size));
  await assert.rejects(()=>loadVerifiedLocalGuideRewards(fake),
    /SOURCE_DIGEST_|PINNED_SHA256_MISMATCH/,
    'correct lengths are insufficient: each DB-03 owner-original SHA-256 is mandatory');
});

test('Guide source UI never auto-fetches owner-private original files or turns candidates into guaranteed grants',async()=>{
  const route=await readFile(new URL('../src/routes/guide/source/+page.svelte',import.meta.url),'utf8');
  const loader=await readFile(new URL('../src/lib/guide/local-reward-files.ts',import.meta.url),'utf8');
  assert.match(route,/on:change=\{chooseRewardFiles\}/);
  assert.match(route,/loadVerifiedLocalGuideRewards\(chosen\)/);
  assert.match(route,/getQuestCandidates\(selectedId\)/);
  assert.match(route,/candidate\.original\.relationId/);
  assert.match(route,/rewardEpoch\+\+/,'switching source must invalidate pending file reads');
  assert.match(route,/aria-label="Verified local quest reward candidates"/);
  assert.match(route,/実際の付与、ドロップ確率、入手条件や所持を保証しません/);
  assert.doesNotMatch(loader,/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|FormData/);
  assert.doesNotMatch(loader,/\b(?:upload|postMessage)\s*\(/);
});
