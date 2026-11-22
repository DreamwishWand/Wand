/**
 * DB-02 × DB-03: source-native Mission LootTable name -> static quest candidate.
 *
 * An exact game-native quest code (or its underscore-delimited prefix) in
 * LootTable.nameKey can identify a UNIQUE quest by name convention. It is NOT
 * a source-explicit LootTable -> Quest ID reference. Do not promote these
 * links to confirmed rewards, drops, ownership or game-time availability.
 *
 * Optional independently pinned DB-03 Quest Item Flows prove only that the
 * same quest has a separate native reference to the same Item ID; the
 * reference never proves this LootTable is awarded by that quest.
 *
 * Source game bytes remain owner-local. No production JavaScript added.
 */
import {verifyPublicQuestIndex} from '../guide/public-guide.mjs';
import {
  loadPrivateQuestAcquisitionView,
  type PrivateQuestAcquisitionView,
  type QuestFlowKind
} from './quest-item-bridge.mjs';
import type {PrivateSrc02BrowserBundle} from './private-browser-bundle.mjs';
import {
  hasPinnedSrc02OriginReader,
  type VerifiedSrc02OriginReader
} from './native-origins.ts';
import {
  DB02_NATIVE_LOOT_SOURCE_SCHEMA,
  type NativeLootSourceIndex,
  type NativeLootSourceCandidate
} from './native-loot-source-families.ts';

export const DB02_MISSION_LOOT_QUEST_SCHEMA='wand.db02.mission-loot-quest-candidates@1' as const;
const ID=/^[1-9][0-9]{0,15}$/;
const EMPTY=Object.freeze([]) as readonly MissionLootQuestCandidate[];
const ATTESTED_FLOWS=new WeakSet<object>();
type NameMatch='exact_native_quest_code'|'native_quest_code_prefix';
type Crosscheck='no_private_item_flow_supplied'|'no_matching_quest_item_reference'|
  'same_quest_item_referenced_in_separate_mission_field';
interface QuestRow {
  readonly id:string;
  readonly internalName:string;
  readonly names:Readonly<Record<string,string>>;
}
export interface MissionLootQuestCandidate {
  readonly questId:string;
  readonly questInternalName:string;
  readonly questNameEn:string|null;
  readonly questNameJa:string|null;
  readonly itemId:string;
  readonly lootTableId:string;
  readonly lootGroupIndex:number;
  readonly lootOriginId:string;
  readonly lootNativeNameKey:string;
  readonly nameMatch:NameMatch;
  readonly crosscheck:Crosscheck;
  readonly separateQuestItemFlowKinds:readonly QuestFlowKind[];
  /** The loot table never contains an explicit quest ID in this evidence set. */
  readonly sourceExplicitLootQuestReferenceVerified:false;
  readonly guaranteedRewardVerified:false;
  readonly lootAcquisitionContextVerified:false;
  readonly currentQuestAvailabilityVerified:false;
}
export interface MissionLootQuestCoverage {
  readonly questDefinitions:733;
  readonly nativeMissionLootTables:number;
  readonly uniquelyNamedQuestTables:number;
  readonly unmatchedNativeMissionTables:number;
  readonly ambiguousNativeMissionTables:number;
  readonly namedCandidateRoutes:number;
  readonly namedItemIds:number;
  readonly namedQuestIds:number;
  readonly independentlyCorroboratedQuestItemRows:number;
  readonly explicitLootQuestLinksVerified:0;
  readonly privateQuestItemFlows:'not_supplied'|'pinned_original_sha256';
  readonly nativeNameOnlyNotRuntimeGrant:true;
}
export interface MissionLootQuestIndex {
  readonly schema:typeof DB02_MISSION_LOOT_QUEST_SCHEMA;
  readonly coverage:MissionLootQuestCoverage;
  getQuestCandidates(questId:number|string):readonly MissionLootQuestCandidate[];
  getItemCandidates(itemId:number|string):readonly MissionLootQuestCandidate[];
  getLootTableCandidates(lootTableId:number|string):readonly MissionLootQuestCandidate[];
  getLootOriginCandidate(originId:string):MissionLootQuestCandidate|null;
}
function fail(code:string):never{throw new TypeError('DB02_MISSION_LOOT_QUEST_'+code);}
function ensure(value:unknown,code:string):asserts value{if(!value)fail(code);}
function id(raw:unknown):string {
  const candidate=typeof raw==='number'&&Number.isSafeInteger(raw)?String(raw):raw;
  ensure(typeof candidate==='string'&&ID.test(candidate)&&
    Number.isSafeInteger(Number(candidate)),'INVALID_ID');
  return candidate;
}
function add<K>(map:Map<K,MissionLootQuestCandidate[]>,k:K,v:MissionLootQuestCandidate){
  const old=map.get(k);
  if(old)old.push(v);
  else map.set(k,[v]);
}
function suffix(name:string):string{return name.slice(name.lastIndexOf('!')+1);}
function section(name:string):string{return name.split('!',1)[0];}
function matchSourceName(
  native:string,quest:QuestRow
):NameMatch|null {
  if(!native.startsWith('Mission!')||typeof quest.internalName!=='string')return null;
  const parts=native.split('!');
  if(parts.length<3||parts[1]!==section(quest.internalName))return null;
  const questCode=suffix(quest.internalName),lootCode=suffix(native);
  // Avoid matching generic type tokens and accidental "VLG_Moan_04" -> 040.
  if(questCode.length<8||lootCode.length<8)return null;
  if(lootCode===questCode)return 'exact_native_quest_code';
  if(lootCode.startsWith(questCode+'_'))return 'native_quest_code_prefix';
  return null;
}

/**
 * Caller supplies the same independently SHA-authenticated SRC-02 reader as
 * the current catalog, plus the two original private DB-03 files. This
 * reuses the existing strict Mission-only source equivalence validation.
 */
export async function loadPinnedQuestItemReferenceEvidence(
  flowBytes:Uint8Array|ArrayBuffer,
  missionBridgeBytes:Uint8Array|ArrayBuffer,
  src02:VerifiedSrc02OriginReader
):Promise<PrivateQuestAcquisitionView>{
  ensure(hasPinnedSrc02OriginReader(src02),'PINNED_SRC02_REQUIRED');
  const data=await loadPrivateQuestAcquisitionView(
    flowBytes,missionBridgeBytes,
    src02 as PrivateSrc02BrowserBundle
  );
  ensure(data.verified===true&&data.privateSource===true&&
    data.publishable===false&&data.coverage.rows===1517&&
    data.guideMissionBytesIdenticalToAcquisitionVersion===true&&
    data.conditionDefinitionsEquivalent===false,
    'PINNED_MISSION_REFERENCES_REQUIRED');
  ATTESTED_FLOWS.add(data);
  return data;
}

/**
 * Both inputs are existing first-party indices. Public Quest index structure
 * is validated by DB-03. The Loot index preserves verified/static source
 * provenance from DB-02; this name convention join itself remains a candidate.
 * No missing row is evidence that an item or a quest cannot be obtained.
 */
export function indexMissionLootQuestCandidates(
  loot:NativeLootSourceIndex,
  publicQuestIndex:unknown,
  privateQuestRefs:PrivateQuestAcquisitionView|null=null
):MissionLootQuestIndex{
  ensure(loot?.schema===DB02_NATIVE_LOOT_SOURCE_SCHEMA&&
    typeof loot.getFamilyCandidates==='function',
    'NATIVE_LOOT_INDEX_REQUIRED');
  if(privateQuestRefs!==null)
    ensure(ATTESTED_FLOWS.has(privateQuestRefs),'PINNED_PRIVATE_QUEST_REFERENCES_REQUIRED');
  const index=verifyPublicQuestIndex(publicQuestIndex) as {
    quests:readonly QuestRow[];
  };
  const quests=index.quests;
  const native=loot.getFamilyCandidates('Mission');
  const byName=new Map<string,NativeLootSourceCandidate[]>();
  for(const row of native){
    ensure(row.sourceFamily==='Mission'&&row.acquisitionContextVerified===false&&
      row.routeStatus==='static_candidate_only'&&
      row.nativeNameKey.startsWith('Mission!'),
      'UNVERIFIED_MISSION_LOOT');
    const key=id(row.lootTableId);
    const list=byName.get(key);
    if(list){
      ensure(list[0].nativeNameKey===row.nativeNameKey,'CONFLICTING_NATIVE_LOOT_NAMES');
      list.push(row);
    }else byName.set(key,[row]);
  }
  const byQuest=new Map<string,MissionLootQuestCandidate[]>();
  const byItem=new Map<string,MissionLootQuestCandidate[]>();
  const byTable=new Map<string,MissionLootQuestCandidate[]>();
  const byOrigin=new Map<string,MissionLootQuestCandidate>();
  let matchedTables=0,ambiguous=0,independent=0;
  for(const [tableId,rows] of byName){
    const name=rows[0].nativeNameKey;
    const matching=quests.map(q=>({q,mode:matchSourceName(name,q)}))
      .filter((entry):entry is {q:QuestRow;mode:NameMatch}=>entry.mode!==null);
    if(matching.length>1){ambiguous++;continue;}
    if(matching.length===0)continue;
    const {q,mode}=matching[0];
    matchedTables++;
    for(const row of rows){
      const refs=privateQuestRefs?.getItemQuestReferences(row.itemId)
        .filter(ref=>ref.questId===q.id)??[];
      const types=Object.freeze([...new Set(refs.map(ref=>ref.sourceFlow.flowKind))]);
      const cooccurrence=refs.length>0;
      if(cooccurrence)independent++;
      const candidate:MissionLootQuestCandidate=Object.freeze({
        questId:q.id,questInternalName:q.internalName,
        questNameEn:q.names.en??null,questNameJa:q.names.ja??null,
        itemId:row.itemId,lootTableId:tableId,
        lootGroupIndex:row.groupIndex,lootOriginId:row.originId,
        lootNativeNameKey:name,nameMatch:mode,
        crosscheck:privateQuestRefs===null?'no_private_item_flow_supplied':
          cooccurrence?'same_quest_item_referenced_in_separate_mission_field':
          'no_matching_quest_item_reference',
        separateQuestItemFlowKinds:types,
        sourceExplicitLootQuestReferenceVerified:false,
        guaranteedRewardVerified:false,
        lootAcquisitionContextVerified:false,
        currentQuestAvailabilityVerified:false
      });
      const uniqueKey=row.originId+'\0'+row.itemId;
      ensure(!byOrigin.has(uniqueKey),'DUPLICATE_LOOT_ORIGIN_ITEM');
      byOrigin.set(uniqueKey,candidate);
      add(byQuest,q.id,candidate);
      add(byItem,row.itemId,candidate);
      add(byTable,tableId,candidate);
    }
  }
  for(const map of [byQuest,byItem,byTable])
    for(const rows of map.values())Object.freeze(rows);
  const coverage:MissionLootQuestCoverage=Object.freeze({
    questDefinitions:733,
    nativeMissionLootTables:byName.size,
    uniquelyNamedQuestTables:matchedTables,
    unmatchedNativeMissionTables:byName.size-matchedTables-ambiguous,
    ambiguousNativeMissionTables:ambiguous,
    namedCandidateRoutes:byOrigin.size,
    namedItemIds:byItem.size,
    namedQuestIds:byQuest.size,
    independentlyCorroboratedQuestItemRows:independent,
    explicitLootQuestLinksVerified:0,
    privateQuestItemFlows:privateQuestRefs===null?'not_supplied':'pinned_original_sha256',
    nativeNameOnlyNotRuntimeGrant:true
  });
  return Object.freeze({
    schema:DB02_MISSION_LOOT_QUEST_SCHEMA,coverage,
    getQuestCandidates(raw:string|number){return byQuest.get(id(raw))??EMPTY;},
    getItemCandidates(raw:string|number){return byItem.get(id(raw))??EMPTY;},
    getLootTableCandidates(raw:string|number){return byTable.get(id(raw))??EMPTY;},
    getLootOriginCandidate(originId:string){
      if(typeof originId!=='string'||!originId||originId.length>160)
        fail('INVALID_ORIGIN_ID');
      const matches=[...byOrigin].filter(([key])=>key.startsWith(originId+'\0'));
      if(matches.length>1)fail('AMBIGUOUS_ORIGIN_ID');
      return matches[0]?.[1]??null;
    }
  });
}

/** Fetch only public DB-03 quest names, never the owner-private Mission/flow files. */
export async function loadMissionLootQuestCandidates(
  loot:NativeLootSourceIndex,
  basePath='',
  fetcher:typeof fetch=fetch,
  questRefs:PrivateQuestAcquisitionView|null=null
):Promise<MissionLootQuestIndex>{
  ensure(basePath===''||(typeof basePath==='string'&&
    /^\/[A-Za-z0-9_/-]+$/.test(basePath)&&!basePath.includes('..')&&
    !basePath.endsWith('/')),'INVALID_BASE_PATH');
  const response=await fetcher(basePath+'/guide/public/quest-index.json');
  ensure(response.ok,'PUBLIC_QUEST_FETCH_FAILED');
  const bytes=await response.arrayBuffer();
  ensure(bytes.byteLength>0&&bytes.byteLength<2*1024*1024,'PUBLIC_QUEST_BYTES');
  let parsed:unknown;
  try{parsed=JSON.parse(new TextDecoder().decode(bytes));}
  catch{fail('PUBLIC_QUEST_JSON');}
  return indexMissionLootQuestCandidates(loot,parsed,questRefs);
}
