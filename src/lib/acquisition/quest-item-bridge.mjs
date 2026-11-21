/**
 * DB-02 x DB-03: exact-source, owner-private quest item reference join.
 * Links static Mission.json references to SRC-02 candidate paths/recipes.
 * No live rewards, progress, conditions, prices, ownership or save writes.
 */
import { PRIVATE_SRC02_BROWSER_CONTRACT } from './private-browser-bundle.mjs';
import { DB02_NATIVE_TAG_PARENT_SHA256 } from './native-tag-evidence.mjs';

export const DB02_QUEST_ACQUISITION_CONTRACT = 'wand.db02.quest-acquisition@1';
// Independent original owner-private Drive artifact bytes, 2026-11-21.
// Changing either requires a separately source-verified new release.
export const DB03_QUEST_FLOWS_SHA256 = '682f5730c614332668ea1b2558622babbc36009d0f6ab305331a9d7091d8ae5a';
export const DB03_MISSION_BRIDGE_SHA256 = 'ce0bfdf4fda1beaf6493659966eb4bc47da9af58cf7f3c3fb0b96d2d8c1b6011';
export const DB03_MISSION_SOURCE_SHA256 = 'f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24';
export const DB03_TARGET_CONDITION_SHA256 = '9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c';
const EXPECTED_COUNTS = Object.freeze({
  intro_item_grant_candidate:70,
  substep_handoff_definition:293,
  post_mission_cleanup_reference:824,
  additional_reward_loot_candidate:330,
});
const ID = /^[1-9][0-9]{0,15}$/;
const SHA = /^[0-9a-f]{64}$/;
const utf8 = new TextDecoder('utf-8', {fatal:true});
const fail = reason => {throw new TypeError('DB02_QUEST_ACQUISITION_'+reason);};
const check = (ok,why) => {if(!ok)fail(why);};
const obj = x => x!==null && typeof x==='object' && !Array.isArray(x);
const validId = value => typeof value==='string' && ID.test(value) &&
  Number.isSafeInteger(Number(value)) && Number(value)>0;
const validHash = value => typeof value==='string' && SHA.test(value);
const inputBytes = (input, max) => {
  const b = input instanceof ArrayBuffer?new Uint8Array(input):input;
  check(b instanceof Uint8Array && b.byteLength>0 && b.byteLength<=max,'INVALID_BYTES');
  return b;
};
async function sha256(b) {
  check(!!globalThis.crypto?.subtle,'SHA256_NOT_AVAILABLE');
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',b))]
    .map(n=>n.toString(16).padStart(2,'0')).join('');
}
function decodeJson(b) {
  try {return JSON.parse(utf8.decode(b));}
  catch {fail('INVALID_JSON');}
}
function freezeDeep(root) {
  const seen=new WeakSet(), stack=[root];
  while(stack.length){
    const next=stack.pop();
    if(next===null || typeof next!=='object' || seen.has(next))continue;
    check(Array.isArray(next)||Object.getPrototypeOf(next)===Object.prototype,'INVALID_OBJECT');
    seen.add(next);
    for(const value of Object.values(next))if(value!==null&&typeof value==='object')stack.push(value);
    Object.freeze(next);
  }
  return root;
}
/** Structural validation is independently testable, but does NOT authenticate input. */
export function validateQuestItemFlowStructure(payload) {
  check(obj(payload) && payload.schema==='wand.db03.item-flows@1' &&
    payload.target?.platform==='Steam' && payload.target?.gameVersion==='1.26.1' &&
    payload.indexCoverage==='optional_partial_SRC01_membership_only' &&
    typeof payload.meaning==='string' && payload.meaning.includes('not guaranteed') &&
    Array.isArray(payload.links) && payload.links.length===1517,'WRONG_FLOW_SOURCE');
  const counts=Object.fromEntries(Object.keys(EXPECTED_COUNTS).map(k=>[k,0]));
  const seen=new Set(), quests=new Set(), items=new Set();
  for(const link of payload.links){
    check(obj(link)&&Object.hasOwn(EXPECTED_COUNTS,link.flowKind) &&
      validId(link.questId) && validId(link.itemId) &&
      validHash(link.nativeWireSha256) &&
      typeof link.sourceField==='string' && /^protobuf\.[A-Za-z0-9.[\]]{2,100}$/.test(link.sourceField) &&
      ['present','not_in_supplied_index'].includes(link.indexMembership),
      'INVALID_FLOW_ROW');
    if(link.flowKind==='additional_reward_loot_candidate')
      check(link.selection==='not_guaranteed' &&
        Number.isSafeInteger(link.lootSubtableIndex) && link.lootSubtableIndex>=0,
        'INVALID_REWARD_CANDIDATE');
    if(link.flowKind==='intro_item_grant_candidate')
      check(link.candidateRole==='direct' && link.selectorMode==='item' &&
        obj(link.configuredAmount) && link.configuredAmount.kind==='value' &&
        Number.isSafeInteger(link.configuredAmount.value) && link.configuredAmount.value>=0 &&
        validHash(link.configuredAmount.sourceWireSha256),'INVALID_GRANT_DEFINITION');
    if(link.flowKind==='substep_handoff_definition')
      check(typeof link.keepItems==='boolean' &&
        Number.isSafeInteger(link.configuredAmount) && link.configuredAmount>=0 &&
        (link.stepId===null || validId(link.stepId)) &&
        (link.subStepId===null || validId(link.subStepId)),'INVALID_HANDOFF_DEFINITION');
    // Packed cleanup occurrences are intentionally retained individually.
    const key = JSON.stringify(link);
    check(!seen.has(key),'DUPLICATE_FLOW_ROW');
    seen.add(key); counts[link.flowKind]++;quests.add(link.questId);items.add(link.itemId);
  }
  check(Object.keys(counts).every(k=>counts[k]===EXPECTED_COUNTS[k]) &&
    quests.size===461 && items.size===1352,'FLOW_CENSUS_MISMATCH');
  return Object.freeze({rows:payload.links.length,quests:quests.size,
    distinctItemIds:items.size,byKind:Object.freeze({...counts})});
}
function assertMissionBridge(bridge){
  check(obj(bridge) && bridge.schema==='wand.db03.mission-source-bridge@1' &&
    bridge.status==='PARTIAL_MISSION_BYTES_ONLY' &&
    bridge.baseline?.platform==='Steam' && bridge.baseline.gameVersion==='1.26.1' &&
    bridge.target?.platform==='Steam' && bridge.target.gameVersion==='1.26.2' &&
    bridge.target.missionSourceSha256===DB03_MISSION_SOURCE_SHA256 &&
    bridge.baseline.missionSourceSha256===DB03_MISSION_SOURCE_SHA256 &&
    bridge.target.sourceProbeSha256==='07fd8ebb1c528f852a0e00ce54cf4964f93931b9155bc9e2aab1bd857986d00a' &&
    bridge.target.missionSourceBytes===4373535 &&
    bridge.baseline.nativeMissionRecords===1030 &&
    bridge.evidence?.missionFullFileBytesIdentical===true &&
    bridge.evidence?.missionDefinitionsCanBeReused===true &&
    bridge.evidence?.conditionSourceChanged===true &&
    bridge.evidence?.otherSourceFamilies?.['Condition.json']?.sameSourceBytes===false &&
    bridge.evidence.otherSourceFamilies['Condition.json'].targetSha256===DB03_TARGET_CONDITION_SHA256,
    'UNVERIFIED_MISSION_SOURCE_BRIDGE');
}
function assertAcquisition(acquisition){
  check(acquisition?.contract===PRIVATE_SRC02_BROWSER_CONTRACT &&
    acquisition.verified===true && acquisition.privateSource===true &&
    acquisition.publishable===false && Object.isFrozen(acquisition) &&
    acquisition.manifestSha256===DB02_NATIVE_TAG_PARENT_SHA256 &&
    acquisition.source?.platform==='Steam' && acquisition.source.gameVersion==='1.26.2' &&
    acquisition.currentAvailabilityVerified===false &&
    typeof acquisition.getItem==='function','UNVERIFIED_R5_ACQUISITION');
}
/**
 * Both input byte digests are pinned separately from user-selected files. We
 * require a *Mission-only* exact-source bridge, never reuse changed Conditions.
 * The returned view stays on-device and must not be serialized into Pages.
 */
export async function loadPrivateQuestAcquisitionView(flowBytes,bridgeBytes,acquisition){
  assertAcquisition(acquisition);
  const flow=inputBytes(flowBytes,2*1024*1024), bridge=inputBytes(bridgeBytes,256*1024);
  check(await sha256(flow)===DB03_QUEST_FLOWS_SHA256,'FLOW_SHA256_MISMATCH');
  check(await sha256(bridge)===DB03_MISSION_BRIDGE_SHA256,'BRIDGE_SHA256_MISMATCH');
  const proof=decodeJson(bridge), data=decodeJson(flow);
  assertMissionBridge(proof);
  const coverage=validateQuestItemFlowStructure(data);
  freezeDeep(data);freezeDeep(proof);
  const byQuest=new Map(),byItem=new Map();
  for(const [index,row] of data.links.entries()){
    const canonical=Object.freeze({index,questId:row.questId,itemId:row.itemId,
      sourceFlow:row, staticDefinitionOnly:true, guaranteedGrant:false,
      currentAvailabilityVerified:false, playerProgressVerified:false});
    if(!byQuest.has(row.questId))byQuest.set(row.questId,[]);
    if(!byItem.has(row.itemId))byItem.set(row.itemId,[]);
    byQuest.get(row.questId).push(canonical);byItem.get(row.itemId).push(canonical);
  }
  for(const map of [byQuest,byItem])
    for(const [key,value] of map)map.set(key,Object.freeze(value));
  function withAcquisition(row){
    const db=acquisition.getItem(Number(row.itemId));
    const resolved=!!db && db.status!=='unresolved_or_no_verified_link';
    const recipes=resolved?db.madeBy??[]:[];
    const paths=resolved?db.acquisitionPaths??[]:[];
    return Object.freeze({...row,
      acquisitionIndexCoverage:resolved?'linked_static_source_candidates':'unresolved_in_partial_acquisition_index',
      sourceRecipeIds:Object.freeze(recipes.map(r=>r.recipeId)),
      sourceAcquisitionPathIds:Object.freeze(paths.map(p=>p.pathId)),
      staticShopCandidateOnly:resolved?(db.possibleStalls?.length??0)>0:false,
      currentShopOfferVerified:false, itemOwnershipVerified:false});
  }
  const getRows=(map,id) => {
    check(validId(id),'INVALID_QUERY_ID');
    return Object.freeze((map.get(id)??[]).map(withAcquisition));
  };
  return Object.freeze({
    contract:DB02_QUEST_ACQUISITION_CONTRACT,
    verified:true,privateSource:true,publishable:false,
    acquisitionGameVersion:'1.26.2',guideMissionSourceVersion:'1.26.1',
    guideMissionBytesIdenticalToAcquisitionVersion:true,
    conditionDefinitionsEquivalent:false,
    missionSourceSha256:DB03_MISSION_SOURCE_SHA256,
    flowsSha256:DB03_QUEST_FLOWS_SHA256,missionBridgeSha256:DB03_MISSION_BRIDGE_SHA256,
    coverage,currentAvailabilityVerified:false,currentRewardsVerified:false,
    playerProgressVerified:false,saveWritingAuthorized:false,
    getQuestItemReferences:questId=>getRows(byQuest,questId),
    getItemQuestReferences:itemId=>getRows(byItem,itemId)
  });
}
