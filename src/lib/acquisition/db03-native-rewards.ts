/**
 * DB-02 cross-service projection of original game reward candidate references.
 *
 * DB-03 authenticates six user-supplied, owner-local source/equivalence files.
 * Game source records from 1.26.1 were independently shown byte-identical to
 * the corresponding 1.26.2 originals. Changed Conditions.json is NEVER
 * inherited, and these are NOT confirmed awarded, purchasable or available.
 *
 * This module neither fetches nor publishes any private original game bytes.
 */
import {
  loadPinnedPrivateGuideRewardIndex
} from '../guide/private-reward-evidence.ts';
import {
  joinEquivalentCurrentRewardCandidates,
  loadVerifiedRewardSourceEquivalence,
  type CurrentCompatibleRewardReader,
  type CurrentCompatibleGuideReward
} from '../guide/reward-source-equivalence.ts';
import type {ItemOrigin,OriginKind,OriginProvenance} from './origins.ts';
import {GUIDE_FRIENDSHIP_ORIGINAL_SHA} from '../guide/source-composite.ts';

export const DB02_DB03_NATIVE_REWARD_SCHEMA='wand.db02.db03-source-reward-candidates@1' as const;
export interface LocalVerifiedRewardFiles{
  readonly eventLinks:Uint8Array|ArrayBuffer;
  readonly questFlows:Uint8Array|ArrayBuffer;
  readonly friendshipDefaults:Uint8Array|ArrayBuffer;
  readonly guideSourceCompositeV2:Uint8Array|ArrayBuffer;
  readonly protoDbBridge:Uint8Array|ArrayBuffer;
}
export interface Db03NativeRewardCandidateIndex{
  readonly schema:typeof DB02_DB03_NATIVE_REWARD_SCHEMA;
  readonly sourceGameVersion:'1.26.1';
  readonly targetGameVersion:'1.26.2';
  readonly sourceIntegrity:'structure_only'|'pinned_original_sha256_and_original_file_equivalence';
  readonly origins:readonly ItemOrigin[];
  readonly coverage:Readonly<{
    sourceCandidates:618;
    requestedItemIds:number;
    projectedCandidates:number;
    distinctLinkedItemIds:number;
    eventCandidates:number;
    questCandidates:number;
    defaultFriendshipCandidates:number;
    conditionsSourceReused:false;
    guaranteedGrantsVerified:false;
    currentAvailabilityVerified:false;
    playerOwnershipVerified:false;
    complete:false;
  }>;
  getItemCandidates(itemId:number|string):readonly ItemOrigin[];
}
const ID=/^[1-9][0-9]{0,15}$/;
const SHA=/^[a-f0-9]{64}$/;
const MAX_IDS=20000;
/** A structural input cannot forge an authenticated private-file import. */
const AUTHENTICATED=new WeakSet<object>();
export function hasPinnedDb03RewardEvidence(input:unknown):input is Db03NativeRewardCandidateIndex{
  return input!==null&&typeof input==='object'&&AUTHENTICATED.has(input);
}
const PROTO_SHA='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623';
const MISSION_SHA='f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24';
const FAMILY:Readonly<Record<string,{kind:OriginKind;label:string;file:string;fullSha:string}>>=Object.freeze({
  mini_event:{
    kind:'event_reward',label:'Mini-event reward definition',
    file:'ddv_Data/StreamingAssets/protoDb.bin',fullSha:PROTO_SHA
  },
  floating_festival:{
    kind:'event_reward',label:'Floating-festival reward definition',
    file:'ddv_Data/StreamingAssets/protoDb.bin',fullSha:PROTO_SHA
  },
  quest_intro:{
    kind:'quest_reward',label:'Quest introduction grant definition',
    file:'ddv_Data/StreamingAssets/itemlist/Mission.json',fullSha:MISSION_SHA
  },
  quest_loot:{
    kind:'quest_reward',label:'Quest additional reward loot candidate',
    file:'ddv_Data/StreamingAssets/itemlist/Mission.json',fullSha:MISSION_SHA
  },
  friendship_default:{
    kind:'friendship_reward',label:'Default friendship level reward definition',
    file:'ddv_Data/StreamingAssets/friendship_levels_default.json',
    fullSha:GUIDE_FRIENDSHIP_ORIGINAL_SHA
  }
});
function ensure(ok:unknown,reason:string):asserts ok{
  if(!ok)throw new TypeError('DB02_DB03_NATIVE_REWARD_'+reason);
}
function id(raw:number|string):string{
  const value=typeof raw==='number'&&Number.isSafeInteger(raw)?String(raw):raw;
  ensure(typeof value==='string'&&ID.test(value)&&Number.isSafeInteger(Number(value)),
    'ITEM_ID');
  return value;
}
function verified(reader:CurrentCompatibleRewardReader):void{
  ensure(reader?.schema==='wand.db03.current-static-reward-candidates@1'&&
    reader.targetGameVersion==='1.26.2'&&
    reader.originalExtractionVersion==='1.26.1'&&
    reader.coverage?.totalCandidates===618&&
    reader.coverage.eventCandidates===202&&
    reader.coverage.questCandidates===400&&
    reader.coverage.defaultFriendshipCandidates===16&&
    reader.coverage.sourceEquivalenceVerified===true&&
    reader.coverage.liveOrPlayerAvailabilityVerified===false&&
    reader.coverage.conditionCompatibilityAsserted===false&&
    typeof reader.getItemCandidates==='function',
    'VERIFIED_DB03_READER_REQUIRED');
}
function reward(row:CurrentCompatibleGuideReward,requestedId:string,attested:boolean):ItemOrigin{
  ensure(row!==null&&typeof row==='object'&&
    row.itemId===requestedId&&row.original?.itemId===requestedId&&
    row.originalExtractionVersion==='1.26.1'&&row.original.sourceGameVersion==='1.26.1'&&
    row.sourceCompatibleWith==='1.26.2'&&
    row.sourceEquivalence==='EXACT_ORIGINAL_FULL_FILE_SHA256'&&
    row.rewardConfigurationOnly===true&&row.guaranteedGrant===false&&
    row.onlineAvailabilityVerified===false&&row.playerOwnershipVerified===false&&
    row.original.guaranteedGrant===false&&row.original.currentAvailabilityVerified===false&&
    row.original.playerOwnershipVerified===false&&
    row.original.characterSpecificVerified===false&&
    row.original.originId===row.nativeOriginId,
    'SOURCE_CANDIDATE_ASSERTIONS');
  const family=FAMILY[row.original.originFamily];
  ensure(family!==undefined&&row.nativeSourceFile===family.file&&
    row.original.sourceFile===family.file&&
    row.nativeSourceSha256===family.fullSha&&
    SHA.test(row.nativeSourceSha256)&&
    SHA.test(row.original.sourceDefinitionSha256)&&
    typeof row.original.sourceField==='string'&&row.original.sourceField.length>0&&
    typeof row.original.relationId==='string'&&
    /^(event|quest|friendship)\/[0-9]+$/.test(row.original.relationId),
    'NATIVE_SOURCE_IDENTITY');
  const validPrefix=row.original.originFamily==='mini_event'||row.original.originFamily==='floating_festival'?'event':
    row.original.originFamily==='friendship_default'?'friendship':'quest';
  ensure(row.original.relationId.startsWith(validPrefix+'/'),'NATIVE_RELATION_FAMILY');
  const configuredAmount=row.original.amount;
  ensure(configuredAmount===null||
    (Number.isSafeInteger(configuredAmount)&&configuredAmount>=0),
    'NATIVE_REWARD_AMOUNT');
  ensure(row.original.level===null||(
    Number.isSafeInteger(row.original.level)&&row.original.level>=1&&row.original.level<=10
  ),'FRIENDSHIP_LEVEL');
  const originId='db03:source:'+row.original.relationId.replace('/' ,':');
  const source:OriginProvenance=Object.freeze({
    sourceId:(attested?'db03:native:':'db03:structure:')+row.original.originFamily,
    kind:attested?'verified_game_native':'unhashed_structural_candidate',
    // Logical owner-local source locator, not a public download endpoint.
    sourceUrl:'/owner-local/'+row.nativeSourceFile,
    checkedOn:'2026-11-22',gameVersion:'1.26.1',
    sha256:attested?row.nativeSourceSha256:null
  });
  const conditions=[
    'Source-configured reward candidate only; grant and unlock are NOT verified',
    attested?
      'Original native source bytes independently identical across Steam 1.26.1 and 1.26.2':
      'Source-equivalence claim has not been independently byte-verified by this projection',
    'Changed Conditions.json not assumed compatible with previous extraction',
    'Original native origin: '+row.original.originId,
    'Original source field: '+row.original.sourceField,
    'Original definition SHA-256: '+row.original.sourceDefinitionSha256,
    'Item index membership: '+row.original.indexMembership
  ];
  if(row.original.originFamily==='friendship_default')
    conditions.push('Default friendship levels only; not a character-specific reward');
  if(configuredAmount===0)
    conditions.push('Native source configured amount zero (not an awarded quantity)');
  if(row.original.level!==null)conditions.push('Default friendship level: '+row.original.level);
  if(row.original.rewardStage!==null)conditions.push('Reward stage: '+row.original.rewardStage);
  return Object.freeze({
    originId,itemId:requestedId,kind:family.kind,
    routeStatus:'static_candidate_only',campaignId:null,
    name:family.label,productId:null,
    quantity:configuredAmount===0?null:configuredAmount,
    price:null,accessTier:'not_applicable',
    window:Object.freeze({start:null,endExclusive:null}),
    salePeriods:Object.freeze([]),conditions:Object.freeze(conditions),
    source,availability:'not_live_verified'
  });
}
/**
 * Consumer receives exactly the requested source-backed item relationships;
 * no negative acquisition claim for IDs missing from the partial archive.
 * This assumes a reader created by DB-03's pinned local-file loader.
 */
function projectCandidates(
  reader:CurrentCompatibleRewardReader,
  itemIds:readonly (string|number)[],
  attested:boolean
):Db03NativeRewardCandidateIndex{
  verified(reader);
  ensure(Array.isArray(itemIds)&&itemIds.length<=MAX_IDS,'BATCH_LIMIT');
  const unique=[...new Set(itemIds.map(id))];
  const rows:ItemOrigin[]=[];
  const seen=new Set<string>();
  let events=0,quests=0,friendships=0;
  for(const key of unique){
    const source=reader.getItemCandidates(key);
    ensure(Array.isArray(source),'INVALID_READER_RESULT');
    for(const candidate of source){
      const row=reward(candidate,key,attested);
      ensure(!seen.has(row.originId),'DUPLICATE_SOURCE_CANDIDATE');
      seen.add(row.originId);rows.push(row);
      if(row.kind==='event_reward')events++;
      else if(row.kind==='quest_reward')quests++;
      else friendships++;
    }
  }
  const map=new Map<string,ItemOrigin[]>();
  for(const row of rows){
    const group=map.get(row.itemId)??[];
    group.push(row);map.set(row.itemId,group);
  }
  for(const group of map.values())Object.freeze(group);
  const coverage=Object.freeze({
    sourceCandidates:618 as const,requestedItemIds:unique.length,
    projectedCandidates:rows.length,distinctLinkedItemIds:map.size,
    eventCandidates:events,questCandidates:quests,defaultFriendshipCandidates:friendships,
    conditionsSourceReused:false as const,guaranteedGrantsVerified:false as const,
    currentAvailabilityVerified:false as const,playerOwnershipVerified:false as const,
    complete:false as const
  });
  const empty=Object.freeze([]) as readonly ItemOrigin[];
  return Object.freeze({
    schema:DB02_DB03_NATIVE_REWARD_SCHEMA,sourceGameVersion:'1.26.1',
    targetGameVersion:'1.26.2',
    sourceIntegrity:attested?
      'pinned_original_sha256_and_original_file_equivalence':'structure_only',
    origins:Object.freeze(rows),coverage,
    getItemCandidates(raw:number|string){return map.get(id(raw))??empty;}
  });
}
/**
 * Offline, structure-only projection for source-shape inspection and tests.
 * The reader's claims and SHA strings are NOT treated as authenticated.
 */
export function projectDb03RewardCandidates(
  reader:CurrentCompatibleRewardReader,
  itemIds:readonly (string|number)[]
):Db03NativeRewardCandidateIndex{
  return projectCandidates(reader,itemIds,false);
}

/**
 * Source-authenticated entry point. The private source bytes come from owner
 * selected local Files, are passed directly to DB-03 for hash verification,
 * and are not retained or exported. Empty itemIds means all archived IDs.
 */
export async function loadVerifiedDb03RewardCandidates(
  files:LocalVerifiedRewardFiles,
  itemIds:readonly (string|number)[]=[]
):Promise<Db03NativeRewardCandidateIndex>{
  ensure(files!==null&&typeof files==='object'&&Array.isArray(itemIds),'INPUTS');
  const [archived,equivalence]=await Promise.all([
    loadPinnedPrivateGuideRewardIndex(files),
    loadVerifiedRewardSourceEquivalence(files)
  ]);
  const source=joinEquivalentCurrentRewardCandidates(archived,equivalence);
  const ids=itemIds.length?itemIds:archived.candidates.map(x=>x.itemId);
  const index=projectCandidates(source,ids,true);
  if(!itemIds.length)ensure(index.coverage.projectedCandidates===618&&
    index.coverage.eventCandidates===202&&index.coverage.questCandidates===400&&
    index.coverage.defaultFriendshipCandidates===16,'ALL_SOURCE_CENSUS');
  AUTHENTICATED.add(index);
  return index;
}
