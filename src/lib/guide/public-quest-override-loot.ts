/** Source-verifiable Mission override -> native LootTable item candidates.
 * Four previously opaque overrides can be joined to the 1.26.2 LootTable
 * definitions without claiming the reward was granted or is guaranteed.
 * Original owner-private raw data is not distributed by this reader.
 */
import type {PublicQuestRewardsReader} from './public-quest-rewards.ts';

export const DB03_QUEST_OVERRIDE_LOOT_SCHEMA='wand.db03.quest-override-loot-candidates@1' as const;
export const DB03_QUEST_OVERRIDE_LOOT_FILE='quest-override-loot-candidates-1.26.2.json' as const;
export const DB03_QUEST_OVERRIDE_LOOT_SHA='032f8dbeb462d13984de7adba7022500a45eedfbc901a17e215d3effdbc48368' as const;
export const DB03_QUEST_OVERRIDE_LOOT_BYTES=924 as const;
const MISSION_SHA='f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24';
const LOOT_SHA='580db9ed81c37890fd1f8fab121a5d328c967d8c22ee253ff4c2b431d008d99c';
const LOOT_EXTRACT_SHA='f0efea7e7f0140cfd40796c772ee4803389342a080e8a798a3f09979c8d3b8db';
const MAX_UINT64='18446744073709551615';
const SOURCE_SLOTS=Object.freeze([
  ['2070000620','2090000173','31400009','1','1'],
  ['2070001245','2090000612','40004032','1','1'],
  ['2070001248','2090000611','40004033','1','1'],
  ['2070001383','2090000117','30200002',MAX_UINT64,MAX_UINT64]
] as const);
const ITEM_ID=/^[1-9][0-9]{0,15}$/;
const EMPTY=Object.freeze([]) as readonly QuestOverrideLootCandidate[];
function check(condition:unknown,reason:string):asserts condition{
  if(!condition)throw new TypeError('DB03_QUEST_OVERRIDE_LOOT_'+reason);
}
const obj=(value:unknown):value is Record<string,unknown>=>
  value!==null&&typeof value==='object'&&!Array.isArray(value);
function id(value:unknown):string|null{
  const x=typeof value==='number'&&Number.isSafeInteger(value)?String(value):value;
  return typeof x==='string'&&ITEM_ID.test(x)&&Number.isSafeInteger(Number(x))?x:null;
}
export interface QuestOverrideLootCandidate{
  readonly questId:string;
  readonly lootTableId:string;
  readonly itemId:string;
  readonly sourceGroupIndex:0;
  readonly sourceCandidateIndex:0;
  /** Number of original Loot Table draws, not the quantity of this item. */
  readonly rollCount:'single_draw'|'native_unbounded_sentinel';
  readonly itemQuantityVerified:false;
  readonly guaranteedGrant:false;
  readonly ownershipVerified:false;
  readonly staticSourceOnly:true;
}
export interface QuestOverrideLootIndex {
  readonly schema:typeof DB03_QUEST_OVERRIDE_LOOT_SCHEMA;
  readonly gameVersion:'1.26.2';
  readonly coverage:Readonly<{
    overrideQuests:4;
    resolvedSourceLootTables:4;
    candidateOccurrences:4;
    distinctCandidateItemIds:4;
    unboundedSentinelReferences:1;
    allRewardsKnown:false;
    runtimeGrantVerified:false;
  }>;
  readonly candidates:readonly QuestOverrideLootCandidate[];
  getQuest(questId:string):QuestOverrideLootCandidate|null;
  getItemCandidates(rawId:unknown):readonly QuestOverrideLootCandidate[];
}
/** Structure verification only; use the SHA-pinned loader for remote data. */
export function verifyPublicQuestOverrideLoot(
  doc:unknown,rewards:PublicQuestRewardsReader
):QuestOverrideLootIndex{
  check(rewards?.schema==='wand.db03.public-quest-rewards@1'&&
    rewards.coverage?.targetGameVersion==='1.26.2'&&
    rewards.coverage?.questsWithOpaqueOverrides===4&&
    rewards.coverage?.runtimeGrantsVerified===false&&
    typeof rewards.getQuest==='function','REWARD_INDEX_REQUIRED');
  check(obj(doc)&&doc.schema===DB03_QUEST_OVERRIDE_LOOT_SCHEMA&&
    obj(doc.target)&&doc.target.platform==='Steam'&&
    doc.target.gameVersion==='1.26.2','SOURCE_VERSION');
  const source=doc.source,counts=doc.counts;
  check(obj(source)&&source.missionOriginalVersion==='1.26.1'&&
    source.missionSha256===MISSION_SHA&&
    source.originalLootTableSha256===LOOT_SHA&&
    source.src02LootProjectionSha256===LOOT_EXTRACT_SHA&&
    source.staticCandidatesOnly===true&&source.originalRewardGrantsVerified===false&&
    source.currentAvailabilityVerified===false,'SOURCE_PROVENANCE');
  check(obj(counts)&&counts.overrideQuestDefinitions===4&&
    counts.resolvedLootTableReferences===4&&counts.candidateOccurrences===4&&
    counts.distinctCandidateItemIds===4&&
    counts.unboundedRollSentinelOccurrences===1&&
    Array.isArray(doc.rows)&&doc.rows.length===4,'SOURCE_CENSUS');
  const candidates:QuestOverrideLootCandidate[]=[];
  const byQuest=new Map<string,QuestOverrideLootCandidate>();
  const byItem=new Map<string,QuestOverrideLootCandidate[]>();
  for(let i=0;i<SOURCE_SLOTS.length;i++){
    const row=(doc.rows as unknown[])[i],original=SOURCE_SLOTS[i];
    check(Array.isArray(row)&&row.length===5&&
      original.every((expected,k)=>row[k]===expected)&&
      id(row[0])===original[0]&&id(row[1])===original[1]&&
      id(row[2])===original[2],'NATIVE_LOOT_IDENTITY');
    const [questId,lootTableId,itemId,minRoll,maxRoll]=original;
    const existing=rewards.getQuest(questId);
    check(existing!==null&&existing.opaqueOverrideUnresolved===true&&
      existing.staticSourceOnly===true&&existing.guaranteedGrant===false,
      'SOURCE_OVERRIDE_MISMATCH');
    check(!byQuest.has(questId),'DUPLICATE_QUEST');
    const bounded=minRoll==='1'&&maxRoll==='1';
    check(bounded||(minRoll===MAX_UINT64&&maxRoll===MAX_UINT64),
      'LOOT_ROLL_SENTINEL');
    const candidate:QuestOverrideLootCandidate=Object.freeze({
      questId,lootTableId,itemId,
      sourceGroupIndex:0 as const,sourceCandidateIndex:0 as const,
      rollCount:bounded?'single_draw' as const:'native_unbounded_sentinel' as const,
      itemQuantityVerified:false as const,guaranteedGrant:false as const,
      ownershipVerified:false as const,staticSourceOnly:true as const
    });
    byQuest.set(questId,candidate);candidates.push(candidate);
    const refs=byItem.get(itemId)??[];refs.push(candidate);byItem.set(itemId,refs);
  }
  check(byQuest.size===4&&byItem.size===4&&candidates.length===4&&
    candidates.filter(row=>row.rollCount==='native_unbounded_sentinel').length===1,
    'RECOMPUTED_CENSUS');
  for(const rows of byItem.values())Object.freeze(rows);
  return Object.freeze({
    schema:DB03_QUEST_OVERRIDE_LOOT_SCHEMA,gameVersion:'1.26.2' as const,
    coverage:Object.freeze({overrideQuests:4 as const,resolvedSourceLootTables:4 as const,
      candidateOccurrences:4 as const,distinctCandidateItemIds:4 as const,
      unboundedSentinelReferences:1 as const,allRewardsKnown:false as const,
      runtimeGrantVerified:false as const}),
    candidates:Object.freeze(candidates),
    getQuest(questId:string){return typeof questId==='string'?byQuest.get(questId)??null:null;},
    getItemCandidates(rawId:unknown){return byItem.get(id(rawId)??'')??EMPTY;}
  });
}
/** Pin exact public bytes before trusting any four-way Item-ID join. */
export async function loadPublicQuestOverrideLoot(
  rewards:PublicQuestRewardsReader,url:string,fetcher:typeof fetch=fetch
):Promise<QuestOverrideLootIndex>{
  check(typeof url==='string'&&url.length>0&&url.length<2048,'URL');
  const response=await fetcher(url);check(response.ok,'DOWNLOAD_FAILED');
  const bytes=await response.arrayBuffer();
  check(bytes.byteLength===DB03_QUEST_OVERRIDE_LOOT_BYTES,'BYTES');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(n=>n.toString(16).padStart(2,'0')).join('');
  check(digest===DB03_QUEST_OVERRIDE_LOOT_SHA,'SHA');
  return verifyPublicQuestOverrideLoot(
    JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),rewards);
}
