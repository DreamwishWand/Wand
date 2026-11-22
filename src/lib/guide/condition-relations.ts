/**
 * DB-03 shared, read-only Steam v1.26.2 Condition -> native Mission reference
 * index. Reuses the SHA/census-verified legacy parser rather than duplicating
 * its native protobuf interpretation. The optional private originals remain
 * only in the browser File objects supplied by their owner.
 *
 * References are NOT quest unlock requirements, dependency edges, true
 * predicates, character rewards, or player/save state.
 */
import {
  importCurrentGuideConditions,
  GUIDE_CONDITION_SOURCE_SHA,GUIDE_CONDITION_INDEX_V2_SHA,
  GUIDE_CONDITION_V2_MISSION_REFERENCES,GUIDE_CONDITION_NATIVE_COUNT
} from './current-conditions.mjs';

export const DB03_CONDITION_RELATION_SCHEMA='wand.db03.condition-mission-references@1' as const;
export type NativeMissionConditionKind=
  'MissionAvailable'|'MissionCompleted'|'MissionOngoing'|'MissionStatus'|
  'MissionStepCompleted'|'MissionStepStatus'|'MissionObjectiveCompleted'|
  'MissionObjectiveStatus'|'MissionObjectiveSkipped'|'MissionObjectiveProgression';
export type NativeConditionBooleanOperator='AND'|'OR'|'NOT';

export interface GuideConditionMention{
  /** Original game source identity; never converted to a new Wand ID. */
  readonly missionId:string;
  readonly conditionId:string;
  readonly sourceName:string;
  readonly conditionWireSha256:string;
  readonly sourcePath:string;
  readonly operator:NativeConditionBooleanOperator;
  readonly kind:NativeMissionConditionKind;
  readonly stepId?:number;
  readonly subStepId?:number;
  readonly objectiveId?:number;
  readonly inversed?:boolean;
  readonly statusCode?:number;
  readonly status?:string;
  readonly missionStateCode?:number;
  readonly missionState?:string;
  readonly comparisonOperatorCode?:number;
  readonly comparisonOperator?:string;
  readonly omittedSourceFields?:readonly string[];
}

export interface GuideConditionReferenceWindow{
  readonly total:number;
  readonly rows:readonly GuideConditionMention[];
}
export interface GuideConditionCoverage{
  readonly gameVersion:'1.26.2';
  readonly platform:'Steam';
  readonly definitions:5440;
  readonly missionMentions:4960;
  readonly distinctMentionedMissionIds:number;
  readonly conditionsWithMissionMentions:number;
  readonly sourceOriginalSha256:string;
  readonly indexedProjectionSha256:string;
  readonly provenance:'structure_and_source_fields'|'original_private_sha256';
  readonly referenceDirection:'STATIC_SOURCE_MENTION_NOT_PREREQUISITE';
  readonly conditionTruthEvaluated:false;
  readonly currentQuestAvailabilityVerified:false;
  readonly saveProgressVerified:false;
}
export interface GuideConditionRelationIndex{
  readonly schema:typeof DB03_CONDITION_RELATION_SCHEMA;
  readonly coverage:Readonly<GuideConditionCoverage>;
  getMissionReferences(missionId:string|number,limit?:number,offset?:number):GuideConditionReferenceWindow;
  getMissionStepReferences(missionId:string|number,nativeStepId:number):readonly GuideConditionMention[];
  getConditionReferences(conditionId:string|number):readonly GuideConditionMention[];
  getMissionReferenceKinds(missionId:string|number):Readonly<Partial<Record<NativeMissionConditionKind,number>>>;
}
export interface RawCurrentConditionMention{
  readonly conditionId:string;
  readonly sourceName:string;
  readonly conditionWireSha256:string;
  readonly sourcePath:string;
  readonly operator:string;
  readonly kind:string;
  readonly stepId?:number;
  readonly subStepId?:number;
  readonly objectiveId?:number;
  readonly inversed?:boolean;
  readonly statusCode?:number;
  readonly status?:string;
  readonly missionStateCode?:number;
  readonly missionState?:string;
  readonly comparisonOperatorCode?:number;
  readonly comparisonOperator?:string;
  readonly omittedSourceFields?:readonly string[];
}
export interface VerifiedCurrentConditionRegistry{
  readonly byMission:Map<string,readonly RawCurrentConditionMention[]>;
  readonly count:number;
  readonly missionReferenceCount:number;
  readonly formatVersion:number;
  readonly targetVersion:string;
  readonly sourceSha256:string;
  readonly indexSha256:string;
  readonly evaluation:string;
}
const KINDS:ReadonlySet<string>=new Set([
  'MissionAvailable','MissionCompleted','MissionOngoing','MissionStatus',
  'MissionStepCompleted','MissionStepStatus','MissionObjectiveCompleted',
  'MissionObjectiveStatus','MissionObjectiveSkipped','MissionObjectiveProgression'
]);
const SHA=/^[0-9a-f]{64}$/;
const ID=/^[1-9][0-9]{0,15}$/;
const PATH=/^conditions(?:\.children\[\d+\](?:\.nested)*)+$/;
const EMPTY=Object.freeze([]) as readonly GuideConditionMention[];
function check(ok:unknown,code:string):asserts ok{
  if(!ok)throw new TypeError('DB03_CONDITION_REF_'+code);
}
function nativeId(value:string|number):string{
  const text=typeof value==='number'&&Number.isSafeInteger(value)?String(value):value;
  check(typeof text==='string'&&ID.test(text)&&Number.isSafeInteger(Number(text)),'INVALID_NATIVE_ID');
  return text;
}
function boundedLimit(limit:number,offset:number){
  check(Number.isSafeInteger(limit)&&limit>=1&&limit<=500 &&
    Number.isSafeInteger(offset)&&offset>=0,'INVALID_PAGE');
}
function numberIfPresent(row:RawCurrentConditionMention,field:keyof RawCurrentConditionMention){
  const value=row[field];
  check(value===undefined||(Number.isSafeInteger(value)&&
    typeof value==='number'&&value>=0),'INVALID_SOURCE_NUMERIC_FIELD');
}
function validateMention(x:RawCurrentConditionMention){
  check(x!==null&&typeof x==='object'&&
    nativeId(x.conditionId)&&
    typeof x.sourceName==='string'&&x.sourceName.length>0&&x.sourceName.length<=1024&&
    SHA.test(x.conditionWireSha256)&&
    typeof x.sourcePath==='string'&&x.sourcePath.length<=512&&PATH.test(x.sourcePath)&&
    ['AND','OR','NOT'].includes(x.operator)&&
    typeof x.kind==='string'&&KINDS.has(x.kind),'INVALID_MENTION');
  for(const field of ['stepId','subStepId','objectiveId','statusCode',
    'missionStateCode','comparisonOperatorCode'] as const)numberIfPresent(x,field);
  check(x.inversed===undefined||typeof x.inversed==='boolean','INVALID_INVERSION');
  check(x.status===undefined||typeof x.status==='string','INVALID_STATUS');
  check(x.missionState===undefined||typeof x.missionState==='string','INVALID_MISSION_STATE');
  check(x.comparisonOperator===undefined||typeof x.comparisonOperator==='string',
    'INVALID_COMPARISON');
  check(x.omittedSourceFields===undefined||
    (Array.isArray(x.omittedSourceFields)&&
      x.omittedSourceFields.every(s=>['missionId','stepId','statusCode'].includes(s))),
    'INVALID_OMITTED_FIELDS');
  check(x.kind!=='MissionStepStatus'||Array.isArray(x.omittedSourceFields),
    'INCOMPLETE_STEP_STATUS');
}

/**
 * Structural adapter for an already verified current-conditions.mjs result.
 * Unlike loadVerifiedGuideConditionRelations, it does not attest byte hashes.
 * Suitable for a registry returned by the existing Guide UI import path.
 */
export function createStructuralGuideConditionRelations(
  registry:VerifiedCurrentConditionRegistry
):GuideConditionRelationIndex {
  return buildGuideConditionRelations(registry,'structure_and_source_fields');
}
function buildGuideConditionRelations(
  registry:VerifiedCurrentConditionRegistry,
  provenance:GuideConditionCoverage['provenance']
):GuideConditionRelationIndex{
  check(registry?.formatVersion===2&&registry.count===GUIDE_CONDITION_NATIVE_COUNT&&
    registry.missionReferenceCount===GUIDE_CONDITION_V2_MISSION_REFERENCES&&
    registry.targetVersion==='1.26.2'&&
    registry.sourceSha256===GUIDE_CONDITION_SOURCE_SHA&&
    registry.indexSha256===GUIDE_CONDITION_INDEX_V2_SHA&&
    registry.evaluation==='static_native_definitions_only'&&
    registry.byMission instanceof Map,'V1262_SOURCE_REQUIRED');
  const byMission=new Map<string,readonly GuideConditionMention[]>();
  const byCondition=new Map<string,GuideConditionMention[]>();
  const countsByMission=new Map<string,Readonly<Partial<Record<NativeMissionConditionKind,number>>>>();
  let sum=0;
  for(const [id,rawMentions] of registry.byMission){
    const missionId=nativeId(id);
    check(Array.isArray(rawMentions)&&rawMentions.length>0&&!byMission.has(missionId),
      'DUPLICATE_OR_EMPTY_MISSION');
    const mentions:GuideConditionMention[]=[];
    const counts:Partial<Record<NativeMissionConditionKind,number>>={};
    for(const raw of rawMentions){
      validateMention(raw);
      const mention=Object.freeze({
        ...raw,missionId,operator:raw.operator as NativeConditionBooleanOperator,
        kind:raw.kind as NativeMissionConditionKind,
        ...(raw.omittedSourceFields===undefined?{}:
          {omittedSourceFields:Object.freeze([...raw.omittedSourceFields])})
      }) as GuideConditionMention;
      mentions.push(mention);
      const origins=byCondition.get(mention.conditionId)??[];
      origins.push(mention);
      byCondition.set(mention.conditionId,origins);
      counts[mention.kind]=(counts[mention.kind]??0)+1;
      sum++;
    }
    byMission.set(missionId,Object.freeze(mentions));
    countsByMission.set(missionId,Object.freeze(counts));
  }
  check(sum===GUIDE_CONDITION_V2_MISSION_REFERENCES,'MENTION_CENSUS');
  for(const [id,refs] of byCondition)byCondition.set(id,Object.freeze(refs) as GuideConditionMention[]);
  const coverage:GuideConditionCoverage=Object.freeze({
    gameVersion:'1.26.2',platform:'Steam',definitions:5440,missionMentions:4960,
    distinctMentionedMissionIds:byMission.size,
    conditionsWithMissionMentions:byCondition.size,
    sourceOriginalSha256:GUIDE_CONDITION_SOURCE_SHA,
    indexedProjectionSha256:GUIDE_CONDITION_INDEX_V2_SHA,
    provenance,referenceDirection:'STATIC_SOURCE_MENTION_NOT_PREREQUISITE',
    conditionTruthEvaluated:false,currentQuestAvailabilityVerified:false,
    saveProgressVerified:false
  });
  return Object.freeze({
    schema:DB03_CONDITION_RELATION_SCHEMA,
    coverage,
    getMissionReferences:(missionId:string|number,limit=40,offset=0):GuideConditionReferenceWindow=>{
      const key=nativeId(missionId);
      boundedLimit(limit,offset);
      const rows=byMission.get(key)??EMPTY;
      return Object.freeze({total:rows.length,rows:Object.freeze(rows.slice(offset,offset+limit))});
    },
    getMissionStepReferences:(missionId:string|number,nativeStepId:number)=>{
      const key=nativeId(missionId);
      check(Number.isSafeInteger(nativeStepId)&&nativeStepId>=0,'INVALID_NATIVE_STEP_ID');
      return Object.freeze((byMission.get(key)??EMPTY).filter(m=>m.stepId===nativeStepId));
    },
    getConditionReferences:(conditionId:string|number)=>byCondition.get(nativeId(conditionId))??EMPTY,
    getMissionReferenceKinds:(missionId:string|number)=>countsByMission.get(nativeId(missionId))??Object.freeze({})
  });
}

/**
 * Full trust boundary: existing parser independently checks BOTH owner-private
 * original file byte digests and all 5440 source records and 4960 references.
 * Caller provides local files and original verified Mission/locale bridge.
 */
export async function loadVerifiedGuideConditionRelations(
  conditionIndexFile:File,conditionManifestFile:File,verifiedMissionLocaleBridge:unknown
):Promise<GuideConditionRelationIndex>{
  check(conditionIndexFile?.name==='condition-native-index-v2.json'&&
    conditionManifestFile?.name==='condition-native-index-manifest-v2.json',
    'PRIVATE_V2_FILES_REQUIRED');
  const registry=await importCurrentGuideConditions(
    conditionIndexFile,conditionManifestFile,verifiedMissionLocaleBridge);
  return buildGuideConditionRelations(registry,'original_private_sha256');
}
