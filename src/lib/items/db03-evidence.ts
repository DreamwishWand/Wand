/** Final, private, SHA-verified DB-01 ↔ DB-03 static quest-item reference overlay.
 * The offline producer requires source-identical original Mission.json bytes.
 * No quests are asserted complete, available, required or rewarded at runtime.
 */
import type { Db01CatalogClient } from './index.ts';

export const DB01_DB03_REFERENCES_SCHEMA = 'wand.db01.db03-item-quest-references@1' as const;
export type QuestReferenceKind = 'objective_candidate' | 'item_flow';
export type QuestFlowKind = 'additional_reward_loot_candidate' | 'intro_item_grant_candidate' |
  'post_mission_cleanup_reference' | 'substep_handoff_definition';
export interface Db01QuestReference {
  readonly itemId: number;
  readonly questId: number;
  readonly nativeCategory: string;
  readonly referenceKind: QuestReferenceKind;
  readonly sourceWireSha256: string;
  readonly sourceField: string;
  readonly detail: Readonly<Record<string, unknown>>;
}
export interface QuestReferenceShardFile {
  readonly sha256: string;
  readonly bytes: number;
  readonly count: number;
}
export interface Db01QuestReferenceManifest {
  readonly schema: typeof DB01_DB03_REFERENCES_SCHEMA;
  readonly privateOnly: true;
  readonly publicationAuthorized: false;
  readonly platform: 'Steam';
  readonly db01GameVersion: string;
  readonly guideGameVersion: string;
  readonly db01SourceItemsSha256: string;
  readonly db01SqliteSha256: string;
  readonly guideManifestSha256: string;
  readonly guideObjectivesSha256: string;
  readonly guideFlowsSha256: string;
  readonly originalMissionSha256: string;
  readonly originalMissionSourceEqual: true;
  readonly linkCounts: Readonly<{
    objectiveCandidates: number;
    itemFlows: number;
    total: number;
    oldPartialIndexMissesNowResolved: number;
  }>;
  readonly distinctItemIds: number;
  readonly bucketCount: 256;
  readonly staticOnly: true;
  readonly guaranteedRewardVerified: false;
  readonly liveStateVerified: false;
  readonly playerProgressVerified: false;
  readonly files: Readonly<Record<string, QuestReferenceShardFile>>;
}
export interface Db01QuestReferenceClient {
  readonly source: Readonly<Pick<Db01QuestReferenceManifest,
    'db01GameVersion'|'guideGameVersion'|'originalMissionSha256'|'linkCounts'|'distinctItemIds'>>;
  readonly staticOnly: true;
  readonly publicationAuthorized: false;
  readonly guaranteedRewardVerified: false;
  readonly liveStateVerified: false;
  readonly playerProgressVerified: false;
  /** Null means Item ID is not present in verified DB-01; [] means no static references. */
  getForItem(itemId: number): Promise<readonly Db01QuestReference[] | null>;
}
export type PrivateQuestBytesProvider = (relativePath: string) => Promise<Uint8Array | ArrayBuffer>;
const SHA=/^[0-9a-f]{64}$/;
const VERSION=/^\d+\.\d+\.\d+$/;
const FIELD=/^protobuf\.[A-Za-z0-9_.\[\]]+$/;
const CATEGORY=/^[A-Za-z][A-Za-z0-9]*$/;
const FLOW_KINDS=new Set<QuestFlowKind>([
  'additional_reward_loot_candidate', 'intro_item_grant_candidate',
  'post_mission_cleanup_reference', 'substep_handoff_definition'
]);
const fail=(why: string):never=>{throw new TypeError('DB01_DB03_'+why);};
function check(ok: unknown, reason: string):asserts ok {if(!ok)fail(reason);}
function obj(value: unknown):value is Record<string,unknown>{
  return !!value && typeof value==='object' && !Array.isArray(value);
}
function id(value:unknown):value is number{
  return typeof value==='number' && Number.isSafeInteger(value) && value>0;
}
function validManifest(value:unknown,db:Db01CatalogClient):asserts value is Db01QuestReferenceManifest {
  check(obj(value),'INVALID_MANIFEST');
  const m=value as unknown as Db01QuestReferenceManifest;
  check(m.schema===DB01_DB03_REFERENCES_SCHEMA && m.privateOnly===true &&
    m.publicationAuthorized===false && m.platform==='Steam' &&
    m.originalMissionSourceEqual===true && m.bucketCount===256 &&
    m.staticOnly===true && m.guaranteedRewardVerified===false &&
    m.liveStateVerified===false && m.playerProgressVerified===false, 'PRIVATE_STATIC_EVIDENCE_REQUIRED');
  check(VERSION.test(m.db01GameVersion) && VERSION.test(m.guideGameVersion) &&
    db?.source?.privateOnly===true && db.source.platform==='Steam' &&
    db.source.gameVersion===m.db01GameVersion &&
    db.source.sourceItemsSha256===m.db01SourceItemsSha256, 'DB01_SOURCE_VERSION_MISMATCH');
  for(const key of ['db01SourceItemsSha256','db01SqliteSha256',
    'guideManifestSha256','guideObjectivesSha256','guideFlowsSha256','originalMissionSha256'] as const)
    check(SHA.test(m[key]),'SOURCE_SHA_REQUIRED');
  const n=m.linkCounts;
  check(obj(n) && Number.isSafeInteger(n.objectiveCandidates) && n.objectiveCandidates>=0 &&
    Number.isSafeInteger(n.itemFlows) && n.itemFlows>=0 &&
    Number.isSafeInteger(n.oldPartialIndexMissesNowResolved) && n.oldPartialIndexMissesNowResolved>=0 &&
    n.oldPartialIndexMissesNowResolved<=n.total &&
    n.total===n.objectiveCandidates+n.itemFlows && n.total>0 &&
    id(m.distinctItemIds) && m.distinctItemIds<=n.total,'REFERENCE_COUNTS');
  check(obj(m.files) && Object.keys(m.files).length===256,'SHARD_COUNT');
  let total=0;
  for(let k=0;k<256;k++){
    const path=`id/${k.toString(16).padStart(2,'0')}.json`;
    const meta=m.files[path];
    check(obj(meta) && SHA.test(meta.sha256) &&
      Number.isSafeInteger(meta.bytes) && meta.bytes>=3 &&
      Number.isSafeInteger(meta.count) && meta.count>=0,'SHARD_METADATA');
    total+=meta.count;
  }
  check(total===n.total,'SHARD_REFERENCE_COUNTS');
}
function checkRef(row:unknown,bucket:number):asserts row is Db01QuestReference {
  check(obj(row) && id(row.itemId) && id(row.questId) && row.itemId%256===bucket &&
    typeof row.nativeCategory==='string' && CATEGORY.test(row.nativeCategory) &&
    (row.referenceKind==='objective_candidate' || row.referenceKind==='item_flow') &&
    typeof row.sourceWireSha256==='string' && SHA.test(row.sourceWireSha256) &&
    typeof row.sourceField==='string' && FIELD.test(row.sourceField) &&
    obj(row.detail), 'INVALID_REFERENCE');
  const detail=row.detail;
  check(detail.sourceField===row.sourceField &&
    !Object.hasOwn(detail,'indexMembership') && !Object.hasOwn(detail,'itemId') &&
    !Object.hasOwn(detail,'questId'), 'INVALID_DETAIL_PROVENANCE');
  if(row.referenceKind==='objective_candidate'){
    check(detail.sourceObjectiveSha256===row.sourceWireSha256 &&
      (detail.candidateRole==='direct' && detail.selectorMode==='item' ||
       detail.candidateRole==='alternative' && detail.selectorMode==='itemList'),
       'UNVERIFIED_OBJECTIVE');
  } else {
    check(detail.nativeWireSha256===row.sourceWireSha256 &&
      FLOW_KINDS.has(detail.flowKind as QuestFlowKind) &&
      (detail.flowKind!=='additional_reward_loot_candidate' ||
       detail.selection==='not_guaranteed'), 'UNVERIFIED_FLOW');
  }
}
function freezeDeep<T>(value:T):T {
  if(value && typeof value==='object' && !Object.isFrozen(value)){
    for(const inner of Object.values(value))freezeDeep(inner);
    Object.freeze(value);
  }
  return value;
}
async function hash(bytes: Uint8Array):Promise<string>{
  check(typeof crypto!=='undefined' && !!crypto.subtle,'CRYPTO_UNAVAILABLE');
  const stable=new Uint8Array(bytes.length);stable.set(bytes);
  const raw=await crypto.subtle.digest('SHA-256',stable);
  return Array.from(new Uint8Array(raw),x=>x.toString(16).padStart(2,'0')).join('');
}
function asBytes(value:Uint8Array|ArrayBuffer):Uint8Array{
  check(value instanceof ArrayBuffer || value instanceof Uint8Array, 'BYTES_REQUIRED');
  return value instanceof ArrayBuffer?new Uint8Array(value):value;
}
export async function openDb01QuestReferences(
  db01:Db01CatalogClient,
  manifestBytes:Uint8Array|ArrayBuffer,
  expectedManifestSha256:string,
  loadBytes:PrivateQuestBytesProvider
):Promise<Db01QuestReferenceClient> {
  check(typeof expectedManifestSha256==='string' && SHA.test(expectedManifestSha256),
    'INDEPENDENT_MANIFEST_PIN_REQUIRED');
  check(typeof loadBytes==='function','PRIVATE_LOADER_REQUIRED');
  const bytes=asBytes(manifestBytes);
  check(bytes.length>0 && bytes.length<=1024*1024,'MANIFEST_BYTES');
  check(await hash(bytes)===expectedManifestSha256,'MANIFEST_SHA_MISMATCH');
  let parsed:unknown;
  try {parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch{fail('INVALID_MANIFEST_JSON');}
  validManifest(parsed,db01);
  const manifest=parsed;
  const buckets=new Map<number,Promise<ReadonlyMap<number,readonly Db01QuestReference[]>>>();
  async function loadBucket(bucket:number):Promise<ReadonlyMap<number,readonly Db01QuestReference[]>>{
    const filename=`id/${bucket.toString(16).padStart(2,'0')}.json`;
    const meta=manifest.files[filename];
    const contents=asBytes(await loadBytes(filename));
    check(contents.length===meta.bytes,'ASSET_BYTES_MISMATCH');
    check(await hash(contents)===meta.sha256,'ASSET_SHA_MISMATCH');
    let list:unknown;
    try {list=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(contents));}
    catch{fail('INVALID_ASSET_JSON');}
    check(Array.isArray(list) && list.length===meta.count,'ASSET_COUNT_MISMATCH');
    const group=new Map<number,Db01QuestReference[]>();
    const keys=new Set<string>();
    for(const raw of list){
      checkRef(raw,bucket);
      const uniqueKey=`${raw.referenceKind}:${raw.questId}:${raw.itemId}:${raw.sourceField}:${raw.sourceWireSha256}`;
      check(!keys.has(uniqueKey),'DUPLICATE_REFERENCE');
      keys.add(uniqueKey);
      const rows=group.get(raw.itemId)??[];
      rows.push(freezeDeep(raw));
      group.set(raw.itemId,rows);
    }
    return new Map([...group].map(([key,rows])=>[key,Object.freeze(rows)]));
  }
  return Object.freeze({
    source:Object.freeze({
      db01GameVersion:manifest.db01GameVersion,
      guideGameVersion:manifest.guideGameVersion,
      originalMissionSha256:manifest.originalMissionSha256,
      linkCounts:freezeDeep({...manifest.linkCounts}),
      distinctItemIds:manifest.distinctItemIds,
    }),
    staticOnly:true as const,
    publicationAuthorized:false as const,
    guaranteedRewardVerified:false as const,
    liveStateVerified:false as const,
    playerProgressVerified:false as const,
    async getForItem(itemId:number):Promise<readonly Db01QuestReference[]|null> {
      check(id(itemId),'INVALID_ITEM_ID');
      const item=await db01.getItem(itemId);
      if(!item)return null;
      const bucket=itemId%256;
      if(!buckets.has(bucket)){
        const work=loadBucket(bucket).catch(err=>{buckets.delete(bucket);throw err;});
        buckets.set(bucket,work);
      }
      const rows=(await buckets.get(bucket)!).get(itemId)??[];
      for(const row of rows){
        check(item.nativeCategory===row.nativeCategory,'DB01_CATEGORY_MISMATCH');
      }
      return rows;
    },
  });
}