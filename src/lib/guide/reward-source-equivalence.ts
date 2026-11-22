/**
 * DB-03 private-static v1.26.1 -> v1.26.2 SOURCE COMPATIBILITY.
 *
 * Owner's exact full-source 1.26.2 audit proves Mission.json, protoDb.bin
 * and default friendship source bytes are equal to the 1.26.1 originals.
 * Their extracted reward candidates therefore remain SOURCE-COMPATIBLE.
 * This is NOT a statement about item ownership, grant probability, player
 * progression, unlock predicates, live event state, or changed Condition.json.
 *
 * Never ship the owner-private audit JSON or automatically fetch it.
 */
import {
  GUIDE_SOURCE_COMPOSITE_V2_SHA,GUIDE_SOURCE_COMPOSITE_V2_BYTES,
  GUIDE_FRIENDSHIP_ORIGINAL_SHA
} from './source-composite.mjs';
import type {PrivateGuideRewardIndex,PrivateGuideRewardCandidate} from './private-reward-evidence';

export const DB03_REWARD_SOURCE_EQUIVALENCE_SCHEMA='wand.db03.reward-source-equivalence@1' as const;
export type GuideRewardSourceFamily='protoDb'|'Mission'|'defaultFriendship';
export interface SourceEquivalentFamily{
  readonly family:GuideRewardSourceFamily;
  readonly originalFile:string;
  readonly sourceSha256:string;
  readonly originalExtractVersion:'1.26.1';
  readonly matchingNativeSourceVersion:'1.26.2';
  readonly comparison:'EXACT_ORIGINAL_FULL_FILE_SHA256';
}
export interface RewardSourceEquivalence{
  readonly schema:typeof DB03_REWARD_SOURCE_EQUIVALENCE_SCHEMA;
  readonly provenance:'structure_only'|'pinned_owner_original_audits_sha256';
  readonly evidence:Readonly<{
    compositeSha256:string;
    protoDbBridgeSha256:string;
    baseline:'1.26.1';
    target:'1.26.2';
  }>;
  readonly families:readonly SourceEquivalentFamily[];
  readonly unchangedConditionSource:false;
  readonly sourceEquivalenceDoesNotVerify:{
    readonly questUnlocks:true;
    readonly rewardsGranted:true;
    readonly currentEventAvailability:true;
    readonly playerProgress:true;
  };
}
export interface CurrentCompatibleGuideReward {
  readonly original:PrivateGuideRewardCandidate;
  readonly itemId:string;
  readonly nativeOriginId:string;
  readonly originalExtractionVersion:'1.26.1';
  readonly sourceCompatibleWith:'1.26.2';
  readonly nativeSourceSha256:string;
  readonly nativeSourceFile:string;
  readonly sourceEquivalence:'EXACT_ORIGINAL_FULL_FILE_SHA256';
  readonly rewardConfigurationOnly:true;
  readonly guaranteedGrant:false;
  readonly onlineAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface CurrentCompatibleRewardReader {
  readonly schema:'wand.db03.current-static-reward-candidates@1';
  readonly targetGameVersion:'1.26.2';
  readonly originalExtractionVersion:'1.26.1';
  readonly coverage:Readonly<{
    eventCandidates:202;
    questCandidates:400;
    defaultFriendshipCandidates:16;
    totalCandidates:618;
    sourceEquivalenceVerified:true;
    liveOrPlayerAvailabilityVerified:false;
    conditionCompatibilityAsserted:false;
  }>;
  getItemCandidates(itemId:string|number):readonly CurrentCompatibleGuideReward[];
  getEventCandidates(family:'mini_event'|'floating_festival',originId:string):readonly CurrentCompatibleGuideReward[];
  getQuestCandidates(questId:string):readonly CurrentCompatibleGuideReward[];
}
const PROTO_SHA='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623';
const MISSION_SHA='f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24';
const BRIDGE_SHA='dcf79a666f16aa64a2cfa9505c4e6f309d160a16db7190c550bd415a3acbeab9';
const BRIDGE_BYTES=1470;
const ID=/^[1-9][0-9]{0,15}$/;
const SHA=/^[a-f0-9]{64}$/;
const EMPTY=Object.freeze([]) as readonly CurrentCompatibleGuideReward[];
function check(value:unknown,code:string):asserts value{
  if(!value)throw new TypeError('DB03_SOURCE_EQUIVALENCE_'+code);
}
function obj(v:unknown):v is Record<string,unknown>{
  return !!v&&typeof v==='object'&&!Array.isArray(v);
}
function itemId(id:string|number):string{
  const value=typeof id==='number'&&Number.isSafeInteger(id)?String(id):id;
  check(typeof value==='string'&&ID.test(value)&&Number.isSafeInteger(Number(value)),'INVALID_ITEM_ID');
  return value;
}
function checkedSha(sha:unknown):sha is string{
  return typeof sha==='string'&&SHA.test(sha);
}
function sourceFamily(row:PrivateGuideRewardCandidate):GuideRewardSourceFamily{
  const file=row.sourceFile;
  if(row.originFamily==='mini_event'||row.originFamily==='floating_festival'){
    check(file==='ddv_Data/StreamingAssets/protoDb.bin','UNVERIFIED_EVENT_SOURCE');
    return 'protoDb';
  }
  if(row.originFamily==='quest_intro'||row.originFamily==='quest_loot'){
    check(file==='ddv_Data/StreamingAssets/itemlist/Mission.json','UNVERIFIED_QUEST_SOURCE');
    return 'Mission';
  }
  check(row.originFamily==='friendship_default'&&
    file==='ddv_Data/StreamingAssets/friendship_levels_default.json',
    'UNVERIFIED_FRIENDSHIP_SOURCE');
  return 'defaultFriendship';
}
const exact={
  protoDb:{family:'protoDb',originalFile:'ddv_Data/StreamingAssets/protoDb.bin',sourceSha256:PROTO_SHA},
  Mission:{family:'Mission',originalFile:'ddv_Data/StreamingAssets/itemlist/Mission.json',sourceSha256:MISSION_SHA},
  defaultFriendship:{family:'defaultFriendship',originalFile:'ddv_Data/StreamingAssets/friendship_levels_default.json',sourceSha256:GUIDE_FRIENDSHIP_ORIGINAL_SHA}
} as const;

/** Structural projection for offline tests; does not claim the files were SHA-attested. */
export function projectRewardSourceEquivalence(
  sourceComposite:unknown,protoDbBridge:unknown
):RewardSourceEquivalence{
  return verifyContent(sourceComposite,protoDbBridge,'structure_only');
}
function verifyContent(
  sourceComposite:unknown,protoDbBridge:unknown,
  provenance:RewardSourceEquivalence['provenance']
):RewardSourceEquivalence{
  check(obj(sourceComposite)&&obj(protoDbBridge),'INVALID_EVIDENCE');
  const c=sourceComposite as any,b=protoDbBridge as any;
  check(c.schema==='wand.db03.guide-source-composite@2'&&
    c.target?.gameVersion==='1.26.2'&&c.target.platform==='Steam'&&
    c.baseline?.gameVersion==='1.26.1'&&c.baseline.platform==='Steam'&&
    c.originalGuideFamilySources?.quests?.reuseMode==='EXACT_ORIGINAL_FULL_FILE_SHA256'&&
    c.originalGuideFamilySources.quests.baselineSha256===MISSION_SHA&&
    c.originalGuideFamilySources.quests.targetSha256===MISSION_SHA&&
    c.originalGuideFamilySources.quests.targetVersion==='1.26.2'&&
    c.originalGuideFamilySources.quests.targetBytes===4373535&&
    c.originalGuideFamilySources.quests.baselineNativeRecords===1030&&
    c.friendshipDefaultSource?.exactFullOriginalFileContentIdentical===true&&
    c.friendshipDefaultSource.baseVersion==='1.26.1'&&
    c.friendshipDefaultSource.targetVersion==='1.26.2'&&
    c.friendshipDefaultSource.nativeSourceSha256===GUIDE_FRIENDSHIP_ORIGINAL_SHA&&
    c.friendshipDefaultSource.records===16&&
    c.staticProtoDb?.originalSha256===PROTO_SHA&&
    c.staticProtoDb.nativeEntries===2246,
    'UNVERIFIED_ORIGINAL_FILES');
  check(b.schema==='wand.db03.protodb-source-bridge@1'&&
    b.status==='IDENTICAL_ARCHIVED_STATIC_SOURCE'&&
    b.proof?.fullOriginalBytesIdentical===true&&
    b.proof.byteComparison==='complete_exact_binary'&&
    b.baseline?.platform==='Steam'&&b.baseline.gameVersion==='1.26.1'&&
    b.target?.platform==='Steam'&&b.target.gameVersion==='1.26.2'&&
    b.baseline.sha256===PROTO_SHA&&b.target.sha256===PROTO_SHA&&
    b.baseline.bytes===1335720&&b.target.bytes===1335720&&
    b.baseline.protoDbEntries===2246&&b.target.protoDbEntries===2246&&
    b.staticCensusReused?.miniEvents===19&&
    b.staticCensusReused?.floatingFestivals===5&&
    b.starPath?.archivedSeasonDefinitions===0&&
    b.starPath.liveSeasonState==='NOT_VERIFIED',
    'UNVERIFIED_PROTO_DB_BRIDGE');
  check(c.originalGuideFamilySources?.conditions?.reuseMode===
    'REEXTRACT_CURRENT_CHANGED_ORIGINAL'&&
    c.originalGuideFamilySources.conditions.baselineSha256!==
    c.originalGuideFamilySources.conditions.targetSha256&&
    c.currentConditions?.nativeDefinitions===5440&&
    c.currentConditions.typedMissionMentions===4960&&
    c.limits?.automaticPrerequisiteGraphVerified===false&&
    c.limits?.playerProgressOrEntitlementVerified===false&&
    c.limits?.currentStarPathOrLiveEventVerified===false,
    'MUST_NOT_MERGE_CHANGED_CONDITIONS');
  const families=Object.freeze(Object.values(exact).map(x=>Object.freeze({
    ...x,originalExtractVersion:'1.26.1' as const,
    matchingNativeSourceVersion:'1.26.2' as const,
    comparison:'EXACT_ORIGINAL_FULL_FILE_SHA256' as const
  })));
  return Object.freeze({
    schema:DB03_REWARD_SOURCE_EQUIVALENCE_SCHEMA,provenance,
    evidence:Object.freeze({
      compositeSha256:GUIDE_SOURCE_COMPOSITE_V2_SHA,
      protoDbBridgeSha256:BRIDGE_SHA,
      baseline:'1.26.1' as const,target:'1.26.2' as const
    }),
    families,
    unchangedConditionSource:false as const,
    sourceEquivalenceDoesNotVerify:Object.freeze({
      questUnlocks:true as const,rewardsGranted:true as const,
      currentEventAvailability:true as const,playerProgress:true as const
    })
  });
}
async function pinnedJson(input:Uint8Array|ArrayBuffer,bytes:number,sha:string):Promise<unknown>{
  const arr=input instanceof ArrayBuffer?new Uint8Array(input):input;
  check(arr instanceof Uint8Array&&arr.byteLength===bytes,'SOURCE_BYTES');
  check(!!globalThis.crypto?.subtle,'CRYPTO_UNAVAILABLE');
  const immutable=new ArrayBuffer(bytes);
  new Uint8Array(immutable).set(arr);
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',immutable)),
    x=>x.toString(16).padStart(2,'0')).join('');
  check(digest===sha,'PINNED_SHA256_MISMATCH');
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(immutable));}
  catch{throw new TypeError('DB03_SOURCE_EQUIVALENCE_INVALID_JSON');}
}
/**
 * Owner-local verification; original JSON never leaves this browser.
 * Independent pinning prevents replacing just the source-provenance claims.
 */
export async function loadVerifiedRewardSourceEquivalence(files:{
  guideSourceCompositeV2:Uint8Array|ArrayBuffer;
  protoDbBridge:Uint8Array|ArrayBuffer;
}):Promise<RewardSourceEquivalence>{
  check(obj(files),'INPUTS_REQUIRED');
  const [composite,proto]=await Promise.all([
    pinnedJson(files.guideSourceCompositeV2,GUIDE_SOURCE_COMPOSITE_V2_BYTES,
      GUIDE_SOURCE_COMPOSITE_V2_SHA),
    pinnedJson(files.protoDbBridge,BRIDGE_BYTES,BRIDGE_SHA)
  ]);
  return verifyContent(composite,proto,'pinned_owner_original_audits_sha256');
}

/**
 * The source record exists unchanged in both game versions; the *candidate*
 * remains owned by its 1.26.1 native source extraction, with no fictitious
 * 1.26.2 re-extraction or claim of a live/guaranteed acquisition route.
 */
export function joinEquivalentCurrentRewardCandidates(
  archived:PrivateGuideRewardIndex,
  proof:RewardSourceEquivalence
):CurrentCompatibleRewardReader{
  check(archived?.contract==='wand.db03.private-reward-evidence@1'&&
    archived.coverage.sourceGameVersion==='1.26.1'&&
    archived.coverage.sourceIntegrity==='pinned_original_sha256'&&
    archived.coverage.eventRewardCandidates===202&&
    archived.coverage.questRewardCandidates===400&&
    archived.coverage.defaultFriendshipRewardCandidates===16,
    'OWNER_PRIVATE_ARCHIVE_REQUIRED');
  check(proof?.schema===DB03_REWARD_SOURCE_EQUIVALENCE_SCHEMA&&
    proof.provenance==='pinned_owner_original_audits_sha256'&&
    proof.evidence.compositeSha256===GUIDE_SOURCE_COMPOSITE_V2_SHA&&
    proof.evidence.protoDbBridgeSha256===BRIDGE_SHA&&
    proof.unchangedConditionSource===false&&
    proof.families.length===3&&
    Object.entries(exact).every(([name,f])=>proof.families.some(x=>
      x.family===name&&x.originalFile===f.originalFile&&x.sourceSha256===f.sourceSha256)),
    'OWNER_SOURCE_PROOF_REQUIRED');
  const map=(rows:readonly PrivateGuideRewardCandidate[])=>Object.freeze(rows.map(row=>{
    check(row.sourceGameVersion==='1.26.1','MIXED_REWARD_SOURCE_VERSION');
    const native=exact[sourceFamily(row)];
    return Object.freeze({
      original:row,itemId:row.itemId,nativeOriginId:row.originId,
      originalExtractionVersion:'1.26.1' as const,
      sourceCompatibleWith:'1.26.2' as const,
      nativeSourceSha256:native.sourceSha256,nativeSourceFile:native.originalFile,
      sourceEquivalence:'EXACT_ORIGINAL_FULL_FILE_SHA256' as const,
      rewardConfigurationOnly:true as const,guaranteedGrant:false as const,
      onlineAvailabilityVerified:false as const,playerOwnershipVerified:false as const
    });
  }));
  return Object.freeze({
    schema:'wand.db03.current-static-reward-candidates@1' as const,
    targetGameVersion:'1.26.2' as const,
    originalExtractionVersion:'1.26.1' as const,
    coverage:Object.freeze({
      eventCandidates:202 as const,questCandidates:400 as const,
      defaultFriendshipCandidates:16 as const,totalCandidates:618 as const,
      sourceEquivalenceVerified:true as const,liveOrPlayerAvailabilityVerified:false as const,
      conditionCompatibilityAsserted:false as const
    }),
    getItemCandidates:(id:string|number)=>{
      const key=itemId(id);return map(archived.getItemCandidates(key));
    },
    getEventCandidates:(family:'mini_event'|'floating_festival',originId:string)=>
      map(archived.getEventCandidates(family,originId)),
    getQuestCandidates:(questId:string)=>map(archived.getQuestCandidates(questId))
  });
}
