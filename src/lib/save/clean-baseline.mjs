/**
 * DB-05 clean-save structural baseline. Read-only, anonymous and version-neutral.
 *
 * A reference save must be *declared* clean by the owner. No technical scan can
 * prove that no cheats were used. Save objects may have naturally gained/lost
 * records through gameplay; count differences NEVER mean cheating or corruption.
 *
 * Only fixed field-template labels and structural aggregate counts leave
 * this adapter. Raw saves, IDs, user names, map keys, scalar values, and
 * source references do not enter the stored baseline.
 */
import { inspectDecodedSave } from './registry.mjs';

export const SAVE_CLEAN_BASELINE_CONTRACT = 'wand.db05.clean-save-structural-baseline@1';
const MAX_BRANCH=4096;
const isRecord=value=>value!==null && typeof value==='object' && !Array.isArray(value);
const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
const int=value=>typeof value==='number' && Number.isSafeInteger(value);
const RULES=Object.freeze([
  {id:'list_inventories',path:'/Player/ListInventories',kind:'object'},
  {id:'list_inventory_entry',path:'/Player/ListInventories/{inventoryId}',kind:'object'},
  {id:'list_inventory_slots',path:'/Player/ListInventories/{inventoryId}/Inventory',kind:'object'},
  {id:'list_inventory_compatibility',path:'/Player/ListInventories/{inventoryId}/CompatibleItemType',kind:'string'},
  {id:'container_inventories',path:'/Player/ContainerInventories',kind:'object'},
  {id:'container_entry',path:'/Player/ContainerInventories/{containerId}',kind:'object'},
  {id:'container_slots',path:'/Player/ContainerInventories/{containerId}/Inventory',kind:'array'},
  {id:'container_size',path:'/Player/ContainerInventories/{containerId}/Size',kind:'integer'},
  {id:'collection_sets',path:'/Player/CollectionSets',kind:'array'},
  {id:'collection_group_data',path:'/Player/CollectionSets[]/GroupData',kind:'array'},
  {id:'achievements',path:'/Player/AchievementsData',kind:'array'},
  {id:'achievement_state',path:'/Player/AchievementsData[]/State',kind:'string'},
  {id:'achievement_current',path:'/Player/AchievementsData[]/CurAmount',kind:'integer'},
  {id:'achievement_maximum',path:'/Player/AchievementsData[]/MaxAmount',kind:'integer'},
  {id:'achievement_claimed',path:'/Player/AchievementsData[]/ClaimedRewardMilestone',kind:'integer'},
  {id:'mission_slots',path:'/World/MissionSlots',kind:'object'},
  {id:'quest_info',path:'/World/QuestInfo',kind:'object'},
  {id:'missions_completed',path:'/World/QuestInfo/MissionsCompleted',kind:'array'},
  {id:'world_grids',path:'/World/GridCollection/Grids',kind:'object'},
  {id:'world_diff_grids',path:'/World/GridCollection/DiffGrids',kind:'object'},
  {id:'world_villages',path:'/World/Villages',kind:'array'},
  {id:'world_characters',path:'/World/Characters',kind:'array'},
  {id:'player_houses',path:'/World/PlayerHouses',kind:'array'}
].map(x=>Object.freeze(x)));
const ROOT_TOKENS=/^\{[A-Za-z][A-Za-z0-9]*\}$/;
const kindOf=value=>value===null?'null':Array.isArray(value)?'array':
  isRecord(value)?'object':int(value)?'integer':
  typeof value==='number'?'number':typeof value;
const validKind=new Set(['object','array','string','integer']);
export function getCleanSaveBaselineRules(){return RULES;}

function walk(root,path,receive){
  const tokens=path.slice(1).split('/');
  let nodes=[root],sampled=false,branchIssues=0;
  for(const token of tokens){
    const next=[];
    for(const node of nodes){
      if(ROOT_TOKENS.test(token)){
        if(!isRecord(node)){branchIssues++;continue;}
        const keys=Object.keys(node);
        if(keys.length>MAX_BRANCH)sampled=true;
        for(const key of keys.slice(0,MAX_BRANCH))next.push(node[key]);
      }else if(token.endsWith('[]')){
        if(!isRecord(node)){branchIssues++;continue;}
        const name=token.slice(0,-2);
        if(!own(node,name))continue;
        const value=node[name];
        if(!Array.isArray(value)){branchIssues++;continue;}
        if(value.length>MAX_BRANCH)sampled=true;
        next.push(...value.slice(0,MAX_BRANCH));
      }else{
        if(!isRecord(node)){branchIssues++;continue;}
        if(own(node,token))next.push(node[token]);
      }
      if(next.length>MAX_BRANCH){sampled=true;break;}
    }
    nodes=next.slice(0,MAX_BRANCH);
    if(nodes.length===0)break;
  }
  for(const node of nodes)receive(node);
  return {sampled,branchIssues};
}
function observe(root){
  return Object.freeze(RULES.map(rule=>{
    let observed=0,kindDifferences=0,childCount=0,oversize=false;
    const r=walk(root,rule.path,node=>{
      observed++;
      const kind=kindOf(node);
      if(kind!==rule.kind)kindDifferences++;
      if((kind==='array'||kind==='object')&&kind===rule.kind){
        const size=Array.isArray(node)?node.length:Object.keys(node).length;
        childCount+=size;
        if(size>MAX_BRANCH)oversize=true;
      }
    });
    return Object.freeze({
      id:rule.id,observed,expectedKind:rule.kind,kindDifferences,
      childCount,branchIssues:r.branchIssues,sampled:r.sampled||oversize
    });
  }));
}

/** Internally capture only fixed counts from a strictly decoded owner clean save. */
export function createCleanSaveBaseline(decoded,claim){
  if(!isRecord(claim)||claim.ownerDeclaredClean!==true||
     claim.ownerDeclaredNoCheats!==true||
     claim.ownerDeclaredNoRestrictedObjectEdits!==true)
    throw new TypeError('DB05_CLEAN_BASELINE_OWNER_DECLARATION_REQUIRED');
  if(!inspectDecodedSave(decoded,null).rootShapeValid)
    throw new TypeError('DB05_CLEAN_BASELINE_ROOT_INVALID');
  const baseline=observe(decoded);
  const reference=Object.freeze({
    contract:SAVE_CLEAN_BASELINE_CONTRACT,
    status:'owner_declared_clean_observed',
    fieldCount:RULES.length,
    observations:baseline,
    ownerDeclaredClean:true,
    ownerDeclarationNotTechnicallyVerifiable:true,
    sourceBuildValidated:false,
    encryptedRoundtripValidated:false,
    rawValuesRetained:false,
    rawIdsRetained:false,
    versionUsedAsCompatibilityGate:false,
    writerAuthorized:false,
    exportAuthorized:false
  });
  return Object.freeze({
    contract:SAVE_CLEAN_BASELINE_CONTRACT,
    reference,
    compare(candidate){
      if(!inspectDecodedSave(candidate,null).rootShapeValid)
        throw new TypeError('DB05_CLEAN_BASELINE_CANDIDATE_ROOT_INVALID');
      const current=observe(candidate);
      const missing=[],typeDifferences=[],countDifferences=[],sampled=[];
      for(let i=0;i<baseline.length;i++){
        const previous=baseline[i],next=current[i];
        if(previous.observed && !next.observed)missing.push(previous.id);
        if(next.kindDifferences>previous.kindDifferences ||
           next.branchIssues>previous.branchIssues)typeDifferences.push(next.id);
        if(previous.observed!==next.observed||
           previous.childCount!==next.childCount)countDifferences.push(next.id);
        if(previous.sampled||next.sampled)sampled.push(next.id);
      }
      const state=sampled.length?'sampled_inconclusive':
        typeDifferences.length?'observed_kind_difference':
        missing.length?'optional_fields_not_observed':
        countDifferences.length?'cardinality_drift_only':'observed_shapes_same';
      return Object.freeze({
        contract:SAVE_CLEAN_BASELINE_CONTRACT,
        status:state,
        fieldsCompared:RULES.length,
        optionalFieldsNotObserved:Object.freeze(missing),
        typeDifferenceCandidates:Object.freeze(typeDifferences),
        cardinalityDifferentFields:Object.freeze(countDifferences),
        sampledFields:Object.freeze(sampled),
        rawIdsExposed:false,
        rawValuesExposed:false,
        absenceDoesNotImplyCorruption:true,
        countDriftDoesNotImplyCheats:true,
        countDriftDoesNotImplyUserObjectEdits:true,
        differentSchemaVersionIsNotIncompatibleByItself:true,
        ownerModificationHistoryNotInferred:true,
        completeEditorSchemaVerified:false,
        strictRoundtripVerified:false,
        writerAuthorized:false,
        exportAuthorized:false
      });
    }
  });
}
