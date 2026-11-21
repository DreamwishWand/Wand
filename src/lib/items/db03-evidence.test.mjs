import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {openDb01QuestReferences} from './db03-evidence.ts';
const hash=b=>createHash('sha256').update(b).digest('hex');
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)+'\n');
const SOURCE=hash('DB01 current native items');
const CATEGORY='ActivityItem';
const objective={itemId:5,questId:100,nativeCategory:CATEGORY,referenceKind:'objective_candidate',
  sourceWireSha256:'d'.repeat(64),sourceField:'protobuf.40[0].20[0].50[0]',
  detail:{candidateRole:'alternative',selectorMode:'itemList',sourceObjectiveSha256:'d'.repeat(64),
    sourceField:'protobuf.40[0].20[0].50[0]'}};
const flow={itemId:5,questId:100,nativeCategory:CATEGORY,referenceKind:'item_flow',
  sourceWireSha256:'e'.repeat(64),sourceField:'protobuf.61.1[0].10[0]',
  detail:{flowKind:'additional_reward_loot_candidate',selection:'not_guaranteed',
    nativeWireSha256:'e'.repeat(64),sourceField:'protobuf.61.1[0].10[0]'}};
function fixture(){
  const files={},content=new Map(),loads=[];
  for(let i=0;i<256;i++){
    const name=`id/${i.toString(16).padStart(2,'0')}.json`;
    const records=i===5?[objective,flow]:[];
    const b=bytes(records);content.set(name,b);
    files[name]={bytes:b.length,sha256:hash(b),count:records.length};
  }
  const manifest={schema:'wand.db01.db03-item-quest-references@1',privateOnly:true,
    publicationAuthorized:false,platform:'Steam',db01GameVersion:'1.26.2',
    guideGameVersion:'1.26.1',db01SourceItemsSha256:SOURCE,db01SqliteSha256:'1'.repeat(64),
    guideManifestSha256:'2'.repeat(64),guideObjectivesSha256:'3'.repeat(64),
    guideFlowsSha256:'4'.repeat(64),originalMissionSha256:'5'.repeat(64),
    originalMissionSourceEqual:true, linkCounts:{objectiveCandidates:1,itemFlows:1,total:2,
      oldPartialIndexMissesNowResolved:1},distinctItemIds:1,bucketCount:256,
    staticOnly:true,guaranteedRewardVerified:false,liveStateVerified:false,
    playerProgressVerified:false,files};
  const source={privateOnly:true,platform:'Steam',gameVersion:'1.26.2',sourceItemsSha256:SOURCE};
  const items={5:{itemId:5,nativeCategory:CATEGORY},6:{itemId:6,nativeCategory:CATEGORY}};
  const client={source,async getItem(id){return items[id]??null;}};
  const loader=async p=>{loads.push(p);return content.get(p);};
  const open=()=>{
    const b=bytes(manifest);
    return openDb01QuestReferences(client,b,hash(b),loader);
  };
  return {manifest,client,files,content,loads,open,loader};
}

test('lazy original-Mission-source evidence preserves alternative vs conditional loot roles',async()=>{
  const f=fixture();const db=await f.open();
  assert.equal(db.source.guideGameVersion,'1.26.1');
  assert.equal(db.source.db01GameVersion,'1.26.2');
  assert.equal(db.guaranteedRewardVerified,false);
  const links=await db.getForItem(5);
  assert.equal(links.length,2);
  assert.equal(links[0].detail.candidateRole,'alternative');
  assert.equal(links[1].detail.flowKind,'additional_reward_loot_candidate');
  assert.equal(links[1].detail.selection,'not_guaranteed');
  assert.equal(db.playerProgressVerified,false);
  assert.equal(db.publicationAuthorized,false);
  assert.deepEqual(f.loads,['id/05.json']);
  assert.equal((await db.getForItem(5)).length,2);
  assert.deepEqual(f.loads,['id/05.json']);
  assert.ok(Object.isFrozen(links[0].detail));
});

test('known ID with no reference returns empty array; unknown ID remains null',async()=>{
  const f=fixture();const db=await f.open();
  assert.deepEqual(await db.getForItem(6),[]);
  assert.equal(await db.getForItem(404),null);
  assert.deepEqual(f.loads,['id/06.json']);
});

test('independently expected manifest SHA is mandatory',async()=>{
  const f=fixture(),b=bytes(f.manifest);
  await assert.rejects(openDb01QuestReferences(f.client,b,'0'.repeat(64),f.loader),/MANIFEST_SHA_MISMATCH/);
  await assert.rejects(openDb01QuestReferences(f.client,b,'bad',f.loader),/INDEPENDENT_MANIFEST_PIN_REQUIRED/);
  assert.deepEqual(f.loads,[]);
});

test('old game version or different source items cannot be silently joined',async()=>{
  const f=fixture();f.manifest.db01GameVersion='1.26.3';
  await assert.rejects(f.open(),/DB01_SOURCE_VERSION_MISMATCH/);
  f.manifest.db01GameVersion='1.26.2';f.manifest.db01SourceItemsSha256='0'.repeat(64);
  await assert.rejects(f.open(),/DB01_SOURCE_VERSION_MISMATCH/);
});

test('tampered shard bytes rejected before any cached rows are returned',async()=>{
  const f=fixture();const db=await f.open();
  f.content.set('id/05.json',bytes([{...objective,questId:101}]));
  await assert.rejects(db.getForItem(5),/ASSET_BYTES_MISMATCH|ASSET_SHA_MISMATCH/);
});

test('source-checksummed but semantically forged reward guarantee is blocked',async()=>{
  const f=fixture(); const fake={...flow,detail:{...flow.detail,selection:'guaranteed'}};
  const raw=bytes([objective,fake]); f.content.set('id/05.json',raw);
  f.manifest.files['id/05.json']={bytes:raw.length,sha256:hash(raw),count:2};
  const db=await f.open();
  await assert.rejects(db.getForItem(5),/UNVERIFIED_FLOW/);
});

test('tampered source category is blocked after SHA validation',async()=>{
  const f=fixture();const wrong={...objective,nativeCategory:'Furniture'};
  const raw=bytes([wrong,flow]);f.content.set('id/05.json',raw);
  f.manifest.files['id/05.json']={bytes:raw.length,sha256:hash(raw),count:2};
  const db=await f.open();
  await assert.rejects(db.getForItem(5),/DB01_CATEGORY_MISMATCH/);
});

test('unknown file scope and publication escalation rejected from manifest',async()=>{
  const f=fixture();f.manifest.publicationAuthorized=true;
  await assert.rejects(f.open(),/PRIVATE_STATIC_EVIDENCE_REQUIRED/);
  f.manifest.publicationAuthorized=false;
  delete f.manifest.files['id/aa.json'];
  await assert.rejects(f.open(),/SHARD_COUNT/);
});

test('invalid caller IDs do not fetch files',async()=>{
  const f=fixture(),db=await f.open();
  await assert.rejects(db.getForItem(0),/INVALID_ITEM_ID/);
  await assert.rejects(db.getForItem(1.2),/INVALID_ITEM_ID/);
  assert.deepEqual(f.loads,[]);
});