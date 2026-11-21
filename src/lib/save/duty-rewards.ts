/**
 * DB-05 -> DB-01: exact original DutyAch source equality + reward definition lookup.
 *
 * Accepts caller-private DB-03 duties / DB-05 milestone projection and DB-01's
 * SHA-checked private TypeScript read-only client. The result contains only
 * static labels and counts: no item/achievement IDs, names, quantities,
 * currencies, saved values, rewards awarded, or owner information.
 */
import { createSaveDutyMilestoneBridge } from './duty-milestones.mjs';
import type { Db01CatalogClient, Db01Item } from '../items/index.ts';

export const DB05_DB01_DUTY_REWARD_JOIN_CONTRACT =
  'wand.db05.db01-native-duty-reward-lookup@1' as const;

const MAX_DUTY_RECORDS = 100_000;
const MAX_REWARD_REFERENCES = 200_000;
const MAX_UNIQUE_REWARDS = 4096;
const HASH = /^[a-f0-9]{64}$/;
const positiveId = (s: string) => /^[1-9][0-9]*$/.test(s) &&
  Number.isSafeInteger(Number(s)) && String(Number(s)) === s;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
function requireEvidence(condition: unknown, code: string): asserts condition {
  if (!condition) throw new TypeError('DB05_DB01_' + code);
}

interface PrivateGuideRow {
  id:string;
  rawName:string;
  source:{file:string;sha256:string;frameIndex:number};
}
interface PrivateGuide {
  target:{platform:string;gameVersion:string};
  records:PrivateGuideRow[];
}
interface PrivateMilestoneRow {
  id:string;
  evidenceState:'typed_milestone_fields'|'opaque_or_mixed_field13'|'no_field13_observed';
  milestones:Array<{milestone:number;rewardItem:number;rewardAmount:number}>;
}
interface PrivateProjection {
  source:{file:string;sha256:string};
  records:PrivateMilestoneRow[];
}
interface PrivateSnapshot {
  readonly id:number;
  readonly rawName:string;
  readonly sourceSha256:string;
}

export interface Db05Db01DutyRewardEvidence {
  readonly contract:typeof DB05_DB01_DUTY_REWARD_JOIN_CONTRACT;
  readonly status:'native_source_equal_and_catalogued'|
    'some_reward_definitions_not_indexed'|'source_definition_only';
  readonly comparedNativeDutyDefinitions:number;
  readonly sourceIdentitiesMatched:number;
  readonly typedDutyDefinitions:number;
  readonly rewardReferences:number;
  readonly distinctRewardIds:number;
  readonly rewardReferencesWithNativeDefinition:number;
  readonly rewardReferencesWithoutNativeDefinition:number;
  readonly rewardReferencesWithItemDomain:number;
  readonly rewardReferencesWithUnclassifiedDefinition:number;
  readonly distinctRewardIdsWithNativeDefinition:number;
  readonly distinctRewardIdsWithoutNativeDefinition:number;
  readonly distinctRewardIdsWithItemDomain:number;
  readonly distinctRewardIdsWithUnclassifiedDefinition:number;
  readonly zeroRewardIdMarkers:number;
  readonly db01GameVersion:string;
  readonly db03DefinitionGameVersion:string;
  readonly originalDutySourceByteHashEqualAcrossVersions:true;
  readonly exactOriginalDutySourceIdentityMatched:true;
  readonly nativeItemDomainIsNotRewardOwnership:true;
  readonly sourceOriginalBytesRehashedByThisBridge:false;
  readonly db01ShardsShaCheckedByClient:true;
  readonly originalGameSourceAndSaveJointlyVerified:false;
  readonly rewardGrantedVerified:false;
  readonly rewardClaimableVerified:false;
  readonly rewardOwnershipVerified:false;
  readonly itemCollectibilityVerified:false;
  readonly saveStateVerified:false;
  readonly completeRewardSemanticsVerified:false;
  readonly missingSaveRecordsAreNotCorruption:true;
  readonly editorWriterAuthorized:false;
  readonly exportAuthorized:false;
}

function snapPrivateSource(guide:unknown,projection:unknown):{
  duties:readonly PrivateSnapshot[];
  rewardIds:readonly number[];
  rewardReferenceCounts:ReadonlyMap<number,number>;
  typedDutyDefinitions:number;
  originalHash:string;
  version:string;
  zeroRewardIdMarkers:number;
} {
  // The previous DB-05 bridge validates both full private indexes, their
  // cross-file SHA metadata, all frame/wire hashes, monotone typed tiers and
  // total aggregates. No records are leaked by its public return type.
  createSaveDutyMilestoneBridge(guide,projection);
  const g=guide as PrivateGuide;
  const p=projection as PrivateProjection;
  requireEvidence(g.records.length<=MAX_DUTY_RECORDS,'DUTY_LIMIT_EXCEEDED');
  const duties:PrivateSnapshot[]=g.records.map(row=>Object.freeze({
    id:Number(row.id),rawName:row.rawName,sourceSha256:row.source.sha256
  }));
  let references=0,zeroRewardIdMarkers=0,typedDutyDefinitions=0;
  const counts=new Map<number,number>();
  for(const row of p.records) {
    if(row.evidenceState!=='typed_milestone_fields')continue;
    typedDutyDefinitions++;
    for(const milestone of row.milestones) {
      // Zero sentinel is not an item reference, not a missing DB-01 entry.
      if(milestone.rewardItem===0) {zeroRewardIdMarkers++;continue;}
      references++;
      requireEvidence(references<=MAX_REWARD_REFERENCES,'TOO_MANY_REWARD_REFERENCES');
      counts.set(milestone.rewardItem,(counts.get(milestone.rewardItem)??0)+1);
      requireEvidence(counts.size<=MAX_UNIQUE_REWARDS,'TOO_MANY_UNIQUE_REWARDS');
    }
  }
  requireEvidence(p.source.sha256===duties[0]?.sourceSha256 &&
    HASH.test(p.source.sha256),'SOURCE_HASH_INVALID');
  const rewardIds=Object.freeze([...counts.keys()]);
  return {
    duties:Object.freeze(duties),
    rewardIds,
    rewardReferenceCounts:counts,
    typedDutyDefinitions,
    originalHash:p.source.sha256,
    version:g.target.gameVersion,
    zeroRewardIdMarkers
  };
}

/**
 * Source ID join is *cross-version only when exact original DutyAch file SHA
 * and every DutyAch native ID/name match*. A shared version number alone
 * does not suffice. DB-01 native IDs can resolve to both item and other
 * source-definition families; "definition_unclassified" stays distinct.
 *
 * This API never consumes a save and therefore cannot verify owner progress.
 */
export async function inspectDb05DutyRewardsInDb01(
  catalog:Db01CatalogClient, privateDuties:unknown,
  privateMilestones:unknown
):Promise<Readonly<Db05Db01DutyRewardEvidence>> {
  requireEvidence(object(catalog) && object(catalog.source) &&
    catalog.source.privateOnly===true &&
    catalog.source.platform==='Steam' &&
    catalog.source.fullCorpusParsed===true &&
    typeof catalog.getCategory==='function' &&
    typeof catalog.getItems==='function', 'PRIVATE_DB01_CATALOG_REQUIRED');

  // All caller-private values are copied synchronously *before* any await;
  // caller changes cannot re-target a later async DB-01 request.
  const input=snapPrivateSource(privateDuties,privateMilestones);
  const g=privateDuties as PrivateGuide;
  requireEvidence(g.target.platform==='Steam','SOURCE_PLATFORM_UNSUPPORTED');

  const sourceRows=await catalog.getCategory('DutyAch');
  requireEvidence(sourceRows.length===input.duties.length,
    'SOURCE_COVERAGE_DIFFERENCE');
  const definitions=new Map<number,Readonly<Db01Item>>();
  for(const row of sourceRows) {
    requireEvidence(row.nativeCategory==='DutyAch' &&
      row.catalogDomain==='definition_unclassified' &&
      Number.isSafeInteger(row.itemId) && row.itemId>0 &&
      !definitions.has(row.itemId),'SOURCE_DEFINITION_CONFLICT');
    definitions.set(row.itemId,row);
  }
  for(const original of input.duties) {
    const current=definitions.get(original.id);
    requireEvidence(current!==undefined &&
      current.nativeKey===original.rawName &&
      current.sourceSha256===input.originalHash &&
      original.sourceSha256===input.originalHash,
      'SOURCE_HASH_OR_NATIVE_IDENTITY_MISMATCH');
  }
  // A DB-01 release may have a different gameVersion, but only an exact
  // original DutyAch file hash (and all native ID/name rows) authorizes join.
  const matches=await catalog.getItems(input.rewardIds);
  requireEvidence(matches.length===input.rewardIds.length,
    'REWARD_RESULT_COUNT_MISMATCH');
  let found=0,missing=0,itemDomain=0,unclassified=0;
  let distinctFound=0,distinctMissing=0,distinctItem=0,distinctOther=0;
  for(let i=0;i<matches.length;i++){
    const id=input.rewardIds[i],row=matches[i],count=input.rewardReferenceCounts.get(id)!;
    if(row===null){missing+=count;distinctMissing++;continue;}
    requireEvidence(row.itemId===id && (
      row.catalogDomain==='item' ||
      row.catalogDomain==='definition_unclassified'),
      'REWARD_IDENTITY_MISMATCH');
    found+=count;distinctFound++;
    if(row.catalogDomain==='item'){itemDomain+=count;distinctItem++;}
    else{unclassified+=count;distinctOther++;}
  }
  const status=input.rewardIds.length===0?'source_definition_only':
    missing>0?'some_reward_definitions_not_indexed':
      'native_source_equal_and_catalogued';
  return Object.freeze({
    contract:DB05_DB01_DUTY_REWARD_JOIN_CONTRACT,
    status,
    comparedNativeDutyDefinitions:input.duties.length,
    sourceIdentitiesMatched:input.duties.length,
    typedDutyDefinitions:input.typedDutyDefinitions,
    rewardReferences:found+missing,
    distinctRewardIds:input.rewardIds.length,
    rewardReferencesWithNativeDefinition:found,
    rewardReferencesWithoutNativeDefinition:missing,
    rewardReferencesWithItemDomain:itemDomain,
    rewardReferencesWithUnclassifiedDefinition:unclassified,
    distinctRewardIdsWithNativeDefinition:distinctFound,
    distinctRewardIdsWithoutNativeDefinition:distinctMissing,
    distinctRewardIdsWithItemDomain:distinctItem,
    distinctRewardIdsWithUnclassifiedDefinition:distinctOther,
    zeroRewardIdMarkers:input.zeroRewardIdMarkers,
    db01GameVersion:catalog.source.gameVersion,
    db03DefinitionGameVersion:input.version,
    originalDutySourceByteHashEqualAcrossVersions:true,
    exactOriginalDutySourceIdentityMatched:true,
    nativeItemDomainIsNotRewardOwnership:true,
    sourceOriginalBytesRehashedByThisBridge:false,
    db01ShardsShaCheckedByClient:true,
    originalGameSourceAndSaveJointlyVerified:false,
    rewardGrantedVerified:false,
    rewardClaimableVerified:false,
    rewardOwnershipVerified:false,
    itemCollectibilityVerified:false,
    saveStateVerified:false,
    completeRewardSemanticsVerified:false,
    missingSaveRecordsAreNotCorruption:true,
    editorWriterAuthorized:false,
    exportAuthorized:false
  });
}
