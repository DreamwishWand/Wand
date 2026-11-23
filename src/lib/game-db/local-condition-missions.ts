/**
 * DB-00 OWNER-LOCAL, read-only crosswalk for Steam 1.26.2 native
 * Condition -> Mission static references.
 *
 * The original Condition registry is private. DB-03 independently verifies
 * its SHA, Mission equivalence bridge and 5,440-definition/4,960-reference
 * corpus before handing it to this adapter. A mention does NOT prove a
 * prerequisite, a true condition, a quest unlock or player completion.
 */
import {canonicalId} from './model.ts';
import type {Db00QuestDefinition,Db00QuestReader} from './native-quests.ts';
import {
  GUIDE_CONDITION_NATIVE_COUNT,GUIDE_CONDITION_V2_MISSION_REFERENCES,
  GUIDE_CONDITION_SOURCE_SHA,GUIDE_CONDITION_INDEX_V2_SHA,
  type CurrentGuideConditions,type CurrentConditionMention,
} from '../guide/current-conditions.ts';

export const DB00_LOCAL_CONDITION_MISSIONS=
  'wand.game-db.local-condition-mission-mentions@1' as const;
const SHA=/^[0-9a-f]{64}$/;
const OPERATORS=new Set(['AND','OR','NOT']);
const KINDS=new Set([
  'MissionAvailable','MissionCompleted','MissionOngoing',
  'MissionStatus','MissionStepCompleted','MissionStepStatus',
  'MissionObjectiveCompleted','MissionObjectiveStatus',
  'MissionObjectiveSkipped','MissionObjectiveProgression'
]);
function check(ok:unknown,reason:string):asserts ok{
  if(!ok)throw new TypeError('DB00_LOCAL_CONDITION_MISSION_'+reason);
}
export interface Db00LocalConditionMissionMention {
  readonly missionId:string;
  readonly conditionId:string;
  readonly original:Readonly<CurrentConditionMention>;
  readonly originalStaticMentionVerified:true;
  readonly nativeStepIdToGuideStepPositionVerified:false;
  readonly questPrerequisiteVerified:false;
  readonly runtimeTruthVerified:false;
  readonly saveProgressVerified:false;
}
export interface Db00LocalConditionMission {
  readonly missionId:string;
  /** null can mean native Mission is outside the published 733 Quest index. */
  readonly publicQuest:Db00QuestDefinition|null;
  readonly mentions:readonly Db00LocalConditionMissionMention[];
  readonly sourceNativeOnly:true;
  readonly currentQuestStatusVerified:false;
  readonly questPrerequisiteVerified:false;
  readonly playerProgressVerified:false;
}
export interface Db00LocalConditionMissionSearch{
  readonly publicQuestOnly?:true;
  readonly withStepReferencesOnly?:true;
  readonly offset?:number;
  readonly limit?:number;
}
export interface Db00LocalConditionMissionPage{
  readonly snapshotId:string;
  readonly total:number;
  readonly offset:number;
  readonly nextOffset:number|null;
  readonly missions:readonly Db00LocalConditionMission[];
  readonly sourceMentionOnly:true;
  readonly prerequisiteVerified:false;
  readonly playerProgressVerified:false;
}
export interface Db00LocalConditionMissionReader{
  readonly contract:typeof DB00_LOCAL_CONDITION_MISSIONS;
  readonly snapshotId:string;
  readonly gameVersion:'1.26.2';
  readonly sourceConditionDefinitions:5440;
  readonly sourceMissionMentionRelations:4960;
  readonly privateSourceRequired:true;
  readonly publicationAuthorized:false;
  readonly sourceMentionsOnly:true;
  readonly questPrerequisitesVerified:false;
  readonly runtimeTruthVerified:false;
  readonly playerProgressVerified:false;
  readonly distinctSourceMissionIds:number;
  readonly distinctSourceConditionIds:number;
  listReferencedMissionIds():readonly string[];
  listMentionedConditionIds():readonly string[];
  getMission(missionId:string|number):Db00LocalConditionMission;
  getConditionMentions(conditionId:string|number):
    readonly Db00LocalConditionMissionMention[];
  searchMissions(query?:Db00LocalConditionMissionSearch):
    Db00LocalConditionMissionPage;
}

/** Accept ONLY the DB-03 private v2 importer output and DB-00 public Quest reader. */
export function joinDb00LocalCurrentConditionMissions(
  quests:Db00QuestReader,
  current:CurrentGuideConditions
):Db00LocalConditionMissionReader {
  check(quests?.contract==='wand.game-db.native-quest-evidence@1' &&
    quests.snapshotId==='steam-1.26.2-native-itemlist-v1' &&
    quests.originalQuests===733 &&
    quests.playerProgressVerified===false &&
    quests.runtimePrerequisitesVerified===false &&
    quests.guaranteedRewardVerified===false &&
    typeof quests.getQuest==='function' &&
    current?.targetVersion==='1.26.2' &&
    current.formatVersion===2 &&
    current.count===GUIDE_CONDITION_NATIVE_COUNT &&
    current.missionReferenceCount===GUIDE_CONDITION_V2_MISSION_REFERENCES &&
    current.sourceSha256===GUIDE_CONDITION_SOURCE_SHA &&
    current.indexSha256===GUIDE_CONDITION_INDEX_V2_SHA &&
    current.evaluation==='static_native_definitions_only' &&
    current.byMission instanceof Map,
    'PINNED_CURRENT_CONDITION_AND_PUBLIC_QUEST_REQUIRED');

  const byMission=new Map<string,readonly Db00LocalConditionMissionMention[]>();
  const byCondition=new Map<string,Db00LocalConditionMissionMention[]>();
  let relations=0;
  for(const [missionId,source] of current.byMission){
    check(typeof missionId==='string' &&
      canonicalId(missionId)===missionId &&
      Array.isArray(source) && source.length>0 &&
      !byMission.has(missionId),
      'SOURCE_MISSION_ID_OR_ARRAY_INVALID');
    const entries:Db00LocalConditionMissionMention[]=[];
    for(const row of source){
      check(row!==null && typeof row==='object' &&
        typeof row.conditionId==='string' &&
        canonicalId(row.conditionId)===row.conditionId &&
        typeof row.sourceName==='string' &&
        row.sourceName.length>0 && row.sourceName.length<=1024 &&
        typeof row.conditionWireSha256==='string' &&
        SHA.test(row.conditionWireSha256) &&
        typeof row.sourcePath==='string' &&
        row.sourcePath.length>0 && row.sourcePath.length<=2048 &&
        OPERATORS.has(row.operator) &&
        KINDS.has(row.kind) &&
        (row.stepId===undefined ||
          Number.isSafeInteger(row.stepId)&&row.stepId>=0) &&
        (row.subStepId===undefined ||
          Number.isSafeInteger(row.subStepId)&&row.subStepId>=0) &&
        (row.objectiveId===undefined ||
          Number.isSafeInteger(row.objectiveId)&&row.objectiveId>=0) &&
        (row.inversed===undefined||typeof row.inversed==='boolean') &&
        (row.omittedSourceFields===undefined||
          Array.isArray(row.omittedSourceFields)&&
          row.omittedSourceFields.every(s=>typeof s==='string')),
        'SOURCE_CONDITION_MENTION_MALFORMED');
      const original:Readonly<CurrentConditionMention>=Object.freeze({
        ...row,
        ...(row.omittedSourceFields===undefined?{}:{
          omittedSourceFields:Object.freeze([...row.omittedSourceFields])
        })
      });
      const link:Db00LocalConditionMissionMention=Object.freeze({
        missionId,conditionId:row.conditionId,original,
        originalStaticMentionVerified:true as const,
        nativeStepIdToGuideStepPositionVerified:false as const,
        questPrerequisiteVerified:false as const,
        runtimeTruthVerified:false as const,
        saveProgressVerified:false as const
      });
      entries.push(link);
      const inverse=byCondition.get(row.conditionId);
      if(inverse)inverse.push(link);
      else byCondition.set(row.conditionId,[link]);
      relations++;
      check(relations<=GUIDE_CONDITION_V2_MISSION_REFERENCES,
        'TOO_MANY_SOURCE_MENTIONS');
    }
    byMission.set(missionId,Object.freeze(entries));
  }
  check(relations===GUIDE_CONDITION_V2_MISSION_REFERENCES &&
    byMission.size>0&&byCondition.size>0 &&
    byMission.size<=GUIDE_CONDITION_NATIVE_COUNT &&
    byCondition.size<=GUIDE_CONDITION_NATIVE_COUNT,
    'SOURCE_CONDITION_MENTION_CENSUS_DRIFT');
  for(const links of byCondition.values())Object.freeze(links);
  const missionIds=Object.freeze(
    [...byMission.keys()].sort((a,b)=>Number(a)-Number(b))
  );
  const conditionIds=Object.freeze(
    [...byCondition.keys()].sort((a,b)=>Number(a)-Number(b))
  );
  function getMission(raw:string|number):Db00LocalConditionMission {
    const missionId=canonicalId(raw);
    const publicQuest=quests.getQuest(missionId);
    check(publicQuest===null || (
      publicQuest.questId===missionId &&
      publicQuest.staticGameDefinitionOnly===true &&
      publicQuest.playerProgressVerified===false &&
      publicQuest.questUnlockedVerified===false
    ),'PUBLIC_QUEST_MISSION_ID_OR_STATE_MISMATCH');
    return Object.freeze({
      missionId,publicQuest,mentions:byMission.get(missionId)??Object.freeze([]),
      sourceNativeOnly:true as const,
      currentQuestStatusVerified:false as const,
      questPrerequisiteVerified:false as const,
      playerProgressVerified:false as const
    });
  }
  function searchMissions(query:Db00LocalConditionMissionSearch={}):
    Db00LocalConditionMissionPage{
    check(query!==null && typeof query==='object' && !Array.isArray(query) &&
      (query.publicQuestOnly===undefined||query.publicQuestOnly===true) &&
      (query.withStepReferencesOnly===undefined||
        query.withStepReferencesOnly===true),
      'INVALID_SEARCH_FILTER');
    const offset=query.offset??0,limit=query.limit??80;
    check(Number.isSafeInteger(offset)&&offset>=0&&
      Number.isSafeInteger(limit)&&limit>0&&limit<=250,
      'INVALID_PAGE');
    const ids=missionIds.filter(id=>
      (!query.publicQuestOnly||quests.getQuest(id)!==null) &&
      (!query.withStepReferencesOnly||
        byMission.get(id)!.some(row=>row.original.stepId!==undefined)));
    const missions=Object.freeze(ids.slice(offset,offset+limit).map(getMission));
    const next=offset+missions.length;
    return Object.freeze({
      snapshotId:quests.snapshotId,total:ids.length,offset,
      nextOffset:next<ids.length?next:null,missions,
      sourceMentionOnly:true as const,
      prerequisiteVerified:false as const,
      playerProgressVerified:false as const
    });
  }
  return Object.freeze({
    contract:DB00_LOCAL_CONDITION_MISSIONS,
    snapshotId:quests.snapshotId,
    gameVersion:'1.26.2' as const,
    sourceConditionDefinitions:5440 as const,
    sourceMissionMentionRelations:4960 as const,
    privateSourceRequired:true as const,
    publicationAuthorized:false as const,
    sourceMentionsOnly:true as const,
    questPrerequisitesVerified:false as const,
    runtimeTruthVerified:false as const,
    playerProgressVerified:false as const,
    distinctSourceMissionIds:byMission.size,
    distinctSourceConditionIds:byCondition.size,
    listReferencedMissionIds:()=>missionIds,
    listMentionedConditionIds:()=>conditionIds,
    getMission,
    getConditionMentions:(id:string|number)=>
      byCondition.get(canonicalId(id))??Object.freeze([]),
    searchMissions
  });
}
