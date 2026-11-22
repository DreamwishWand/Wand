/**
 * DB-03 native Mission -> CommonConditions -> current Condition -> Mission
 * reference bridge. Only source-explicit IDs and AND/OR/NOT paths are joined.
 * It is NOT an unlock prerequisite DAG or a runtime Condition evaluator.
 *
 * The original 1.26.1 quest record is accepted only after the existing Guide
 * search/shard identity verifier. The 1.26.2 Condition index must come from
 * the existing private current-conditions importer and typed relation reader.
 */
import {guideMissionReferences,guideVerifiedSourceBridge} from './client.mjs';
import {
  DB03_CONDITION_RELATION_SCHEMA,type GuideConditionRelationIndex,
  type GuideConditionMention,type NativeConditionBooleanOperator
} from './condition-relations.ts';

export const DB03_QUEST_CONDITION_CROSSREF_SCHEMA='wand.db03.quest-common-condition-refs@1' as const;
export type QuestConditionRole='availability'|'unlock'|'auto_accept'|'ui_visibility'|'owner_override';

export interface QuestCommonConditionReference {
  /** The original Mission's source-owning branch, never an inferred dependency. */
  readonly role:QuestConditionRole;
  readonly branchIndex:number|null;
  readonly conditionId:string;
  readonly sourcePath:string;
  readonly booleanPath:readonly NativeConditionBooleanOperator[];
  readonly inversed:boolean|null;
  /** Only explicit native Mission leaves within this v1.26.2 Condition ID. */
  readonly currentMissionMentions:readonly GuideConditionMention[];
  readonly missionMentionStatus:'source_mentioned'|'not_in_mission_reference_subset';
  readonly conditionDefinitionExistenceChecked:false;
  readonly prerequisiteVerified:false;
  readonly runtimeTruthVerified:false;
}
export interface QuestConditionCrossrefIndex {
  readonly schema:typeof DB03_QUEST_CONDITION_CROSSREF_SCHEMA;
  readonly questId:string;
  readonly sourceQuestVersion:'1.26.1';
  readonly currentConditionVersion:'1.26.2';
  readonly originalMissionEquivalentToCurrent:boolean;
  readonly currentConditionEvidence:'structure_and_source_fields'|'original_private_sha256';
  readonly pointers:readonly QuestCommonConditionReference[];
  readonly coverage:Readonly<{
    commonConditionOccurrences:number;
    distinctReferencedConditionIds:number;
    occurrencesWithNativeMissionMentions:number;
    distinctCurrentReferencedMissionIds:number;
    directMissionPredicateMentions:number;
    prerequisitesVerified:false;
    currentConditionTruthVerified:false;
    conditionDefinitionMembershipComplete:false;
  }>;
}
interface SourceRecord{readonly id?:unknown;readonly structured?:unknown}
type Obj=Record<string,unknown>;
const ID=/^[1-9][0-9]{0,15}$/;
const OPERATORS=new Set(['AND','OR','NOT']);
const MAX_NODES=10000;
const MAX_DEPTH=24;
function check(ok:unknown,code:string):asserts ok{
  if(!ok)throw new TypeError('DB03_QUEST_CONDITION_'+code);
}
function object(x:unknown):x is Obj{return !!x&&typeof x==='object'&&!Array.isArray(x);}
function nativeId(x:unknown):x is string{
  return typeof x==='string'&&ID.test(x)&&Number.isSafeInteger(Number(x));
}
/**
 * This join does not require all private current Condition definitions to be
 * published; a missing Mission mention is not evidence the Condition ID is
 * missing, nor that a quest requires no predecessor.
 */
export function createQuestConditionCrossrefs(
  record:SourceRecord,questSearch:unknown,conditions:GuideConditionRelationIndex
):QuestConditionCrossrefIndex{
  // Existing, source-validated direct Mission predicate extractor rejects
  // alien quest records, wrong wire hashes, unsupported native record kinds.
  check((questSearch as {target?:{platform?:unknown;gameVersion?:unknown}})?.target?.platform==='Steam'&&
    (questSearch as {target?:{platform?:unknown;gameVersion?:unknown}}).target?.gameVersion==='1.26.1',
    'ARCHIVED_MISSION_SOURCE_REQUIRED');
  const direct=guideMissionReferences(record,questSearch,'en');
  const questId=record?.id;
  check(nativeId(questId),'INVALID_QUEST_ID');
  check(conditions?.schema===DB03_CONDITION_RELATION_SCHEMA&&
    conditions.coverage?.gameVersion==='1.26.2'&&
    conditions.coverage.referenceDirection==='STATIC_SOURCE_MENTION_NOT_PREREQUISITE'&&
    conditions.coverage.conditionTruthEvaluated===false&&
    conditions.coverage.currentQuestAvailabilityVerified===false&&
    conditions.coverage.saveProgressVerified===false&&
    typeof conditions.getConditionReferences==='function',
    'CURRENT_CONDITION_INDEX_REQUIRED');
  const typed=object(record.structured)?record.structured:{};
  const roots=object(typed.conditions)?typed.conditions:{};
  const policies=object(typed.activationPolicies)?typed.activationPolicies:{};
  const pointers:QuestCommonConditionReference[]=[];
  let visited=0;
  function walk(
    input:unknown,role:QuestConditionRole,branchIndex:number|null,
    sourcePath:string,operators:readonly NativeConditionBooleanOperator[],depth:number
  ):void{
    if(input===null||input===undefined)return;
    check(depth<=MAX_DEPTH&&object(input)&&Array.isArray(input.conditions)&&
      typeof input.operator==='string'&&OPERATORS.has(input.operator)&&
      input.conditions.length<=256,'INVALID_SOURCE_AST');
    const trail=[...operators,input.operator as NativeConditionBooleanOperator];
    for(const [index,child] of input.conditions.entries()){
      visited++;check(visited<=MAX_NODES,'SOURCE_AST_LIMIT');
      check(object(child),'INVALID_SOURCE_LEAF');
      const path=sourcePath+'.conditions['+index+']';
      if(child.type==='SubConditions'){
        walk(child.nested,role,branchIndex,path+'.SubConditions',trail,depth+1);
        continue;
      }
      if(child.type!=='CommonConditions')continue;
      // A source-omitted ID remains unknown, never a fabricated default.
      if(child.conditionId===undefined||child.conditionId===null)continue;
      check(nativeId(child.conditionId),'INVALID_COMMON_CONDITION_ID');
      check(child.inversed===undefined||typeof child.inversed==='boolean',
        'INVALID_SOURCE_INVERSION');
      const current=conditions.getConditionReferences(child.conditionId);
      check(Array.isArray(current)&&current.every(x=>x.conditionId===child.conditionId),
        'CONDITION_REFERENCE_IDENTITY');
      pointers.push(Object.freeze({
        role,branchIndex,conditionId:child.conditionId,sourcePath:path,
        booleanPath:Object.freeze(trail),inversed:child.inversed??null,
        currentMissionMentions:Object.freeze([...current]),
        missionMentionStatus:current.length
          ?'source_mentioned' as const:'not_in_mission_reference_subset' as const,
        conditionDefinitionExistenceChecked:false as const,
        prerequisiteVerified:false as const,runtimeTruthVerified:false as const
      }));
    }
  }
  walk(roots.availableConditions,'availability',null,'conditions.availableConditions',[],0);
  walk(roots.unlockConditions,'unlock',null,'conditions.unlockConditions',[],0);
  for(const [key,role] of [
    ['autoAcceptOptions','auto_accept'],
    ['uiUnlockConditions','ui_visibility'],
    ['ownerOverrides','owner_override']
  ] as const){
    const entries=policies[key];
    if(entries===undefined)continue;
    check(Array.isArray(entries)&&entries.length<=200,'INVALID_POLICY_BRANCHES');
    entries.forEach((entry:unknown,i:number)=>{
      check(object(entry),'INVALID_POLICY');
      walk(entry.conditions,role,i,'activationPolicies.'+key+'['+i+']',[],0);
    });
  }
  const ids=new Set(pointers.map(p=>p.conditionId));
  const missionIds=new Set(pointers.flatMap(p=>p.currentMissionMentions.map(r=>r.missionId)));
  const coverage=Object.freeze({
    commonConditionOccurrences:pointers.length,
    distinctReferencedConditionIds:ids.size,
    occurrencesWithNativeMissionMentions:pointers.filter(p=>p.currentMissionMentions.length>0).length,
    distinctCurrentReferencedMissionIds:missionIds.size,
    directMissionPredicateMentions:direct.length,
    prerequisitesVerified:false as const,currentConditionTruthVerified:false as const,
    conditionDefinitionMembershipComplete:false as const
  });
  return Object.freeze({
    schema:DB03_QUEST_CONDITION_CROSSREF_SCHEMA,
    questId,sourceQuestVersion:'1.26.1' as const,
    currentConditionVersion:'1.26.2' as const,
    originalMissionEquivalentToCurrent:guideVerifiedSourceBridge(questSearch)!==null,
    currentConditionEvidence:conditions.coverage.provenance,
    pointers:Object.freeze(pointers),coverage
  });
}
