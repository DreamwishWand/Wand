/**
 * DB-02 / DB-03 source-exact, public Quest reward Item ID backlinks.
 *
 * Steam 1.26.2 published Mission reward projection is independently byte-
 * and SHA-256-checked by the existing DB-03 loader. No private source files
 * or save state are loaded. Currency configurations and additional Loot Table
 * entries are kept distinct; the latter are NEVER guaranteed awards.
 *
 * This index is separate from native SRC-02 static Loot Table name matching:
 * it does not reinterpret roll counts as item amounts, nor assert that a
 * quest is currently available, completed or grants any of these rewards.
 */
import {verifyPublicQuestIndex} from '../guide/public-guide.ts';
import {
  loadPublicQuestRewards,DB03_QUEST_REWARDS_FILE,
  DB03_QUEST_REWARDS_SHA,DB03_QUEST_REWARDS_SCHEMA,
  type PublicQuestRewardsReader,
  type QuestCurrencyReward,type QuestLootCandidate
} from '../guide/public-quest-rewards.ts';

export const DB02_QUEST_ACQUISITION_SCHEMA='wand.db02.source-quest-acquisitions@1' as const;
const ORIGINAL_MISSION_SHA='f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24';
const ID=/^[1-9][0-9]{0,15}$/;
const BASE=/^\/[A-Za-z0-9_/-]+$/;
const EMPTY=Object.freeze([]) as readonly QuestAcquisitionCandidate[];

export interface QuestAcquisitionCandidate {
  readonly originId:string;
  readonly itemId:string;
  readonly questId:string;
  readonly questNameEn:string|null;
  readonly questNameJa:string|null;
  readonly kind:'configured_currency_reward'|'additional_loot_candidate';
  /** Currency range is a configured amount, NOT proof of an actual grant. */
  readonly currency:QuestCurrencyReward|null;
  /** Roll range is number of rolls, NOT the resulting Item quantity. */
  readonly loot:QuestLootCandidate|null;
  readonly originalMissionSha256:typeof ORIGINAL_MISSION_SHA;
  readonly publishedProjectionSha256:typeof DB03_QUEST_REWARDS_SHA;
  readonly sourceExplicitQuestItemReferenceVerified:true;
  readonly staticSourceOnly:true;
  readonly guaranteedGrantVerified:false;
  readonly currentAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface QuestAcquisitionCoverage {
  readonly sourceGameVersion:'1.26.1';
  readonly targetGameVersion:'1.26.2';
  readonly rewardEvidenceQuestRows:247;
  readonly indexedQuestsWithItemIds:number;
  readonly opaqueOverrideQuestRows:4;
  readonly definedQuests:733;
  readonly currencySourceReferences:65;
  readonly additionalLootSourceReferences:330;
  readonly allSourceItemReferences:395;
  readonly distinctReferencedItemIds:number;
  readonly publishedDb00MembershipNotRequired:true;
  readonly originalFileIdentityVerified:true;
  readonly staticOriginOnly:true;
  readonly guaranteedGrantsVerified:false;
  readonly liveAvailabilityVerified:false;
  readonly completeAllQuestRewards:false;
}
export interface QuestAcquisitionIndex {
  readonly schema:typeof DB02_QUEST_ACQUISITION_SCHEMA;
  readonly coverage:QuestAcquisitionCoverage;
  readonly indexedItemIds:readonly string[];
  readonly indexedQuestIds:readonly string[];
  getItemCandidates(itemId:string|number):readonly QuestAcquisitionCandidate[];
  getQuestCandidates(questId:string|number):readonly QuestAcquisitionCandidate[];
  getSourceOrigin(originId:string):QuestAcquisitionCandidate|null;
}

function ensure(ok:unknown,code:string):asserts ok {
  if(!ok)throw new TypeError('DB02_QUEST_ACQUISITION_'+code);
}
function canonicalId(raw:unknown):string {
  const candidate=typeof raw==='number'&&Number.isSafeInteger(raw)?String(raw):raw;
  ensure(typeof candidate==='string'&&ID.test(candidate)&&
    Number.isSafeInteger(Number(candidate)),'INVALID_ID');
  return candidate;
}
function add<K>(map:Map<K,QuestAcquisitionCandidate[]>,
  key:K,row:QuestAcquisitionCandidate):void {
  const group=map.get(key);
  if(group)group.push(row);
  else map.set(key,[row]);
}

/**
 * The constructor stays private so a caller cannot mark unverified arbitrary
 * JSON as a verified native source. Only the SHA-checked DB-03 loader below
 * can reach this projection.
 */
function createIndex(reader:PublicQuestRewardsReader, publicQuestIndex:unknown):QuestAcquisitionIndex {
  ensure(reader?.schema===DB03_QUEST_REWARDS_SCHEMA&&
    reader.coverage?.originalMissionVersion==='1.26.1'&&
    reader.coverage.targetGameVersion==='1.26.2'&&
    reader.coverage.quests===733&&reader.coverage.questRowsWithAnyRewardEvidence===247&&
    reader.coverage.additionalItemOccurrences===330&&
    reader.coverage.currencyOccurrences===65&&reader.coverage.runtimeGrantsVerified===false&&
    reader.coverage.allRewardsKnown===false&&
    reader.questIdsWithEvidence.length===247,'PINNED_DB03_READER_REQUIRED');
  const source=verifyPublicQuestIndex(publicQuestIndex) as {
    quests:readonly {id:string;names:Readonly<Record<string,string>>}[];
  };
  ensure(source.quests.length===733,'SOURCE_QUEST_CENSUS');
  const byQuestName=new Map(source.quests.map(q=>[canonicalId(q.id),q.names]));
  const byItem=new Map<string,QuestAcquisitionCandidate[]>();
  const byQuest=new Map<string,QuestAcquisitionCandidate[]>();
  const byOrigin=new Map<string,QuestAcquisitionCandidate>();
  let currencies=0,lootCandidates=0;
  for(const rawQuestId of reader.questIdsWithEvidence) {
    const questId=canonicalId(rawQuestId);
    const q=reader.getQuest(questId);
    const names=byQuestName.get(questId);
    ensure(q?.questId===questId&&names!==undefined&&
      q.guaranteedGrant===false&&q.staticSourceOnly===true,
      'FOREIGN_OR_UNVERIFIED_QUEST');
    function insert(
      itemId:string,kind:QuestAcquisitionCandidate['kind'],
      originId:string,currency:QuestCurrencyReward|null,loot:QuestLootCandidate|null
    ){
      ensure(!byOrigin.has(originId),'DUPLICATE_NATIVE_REWARD_ORIGIN');
      const row:QuestAcquisitionCandidate=Object.freeze({
        originId,itemId:canonicalId(itemId),questId,
        questNameEn:names!.en??null,questNameJa:names!.ja??null,
        kind,currency,loot,
        originalMissionSha256:ORIGINAL_MISSION_SHA,
        publishedProjectionSha256:DB03_QUEST_REWARDS_SHA,
        sourceExplicitQuestItemReferenceVerified:true,
        staticSourceOnly:true,
        guaranteedGrantVerified:false,currentAvailabilityVerified:false,
        playerOwnershipVerified:false
      });
      byOrigin.set(originId,row);add(byItem,row.itemId,row);add(byQuest,questId,row);
    }
    for(const currency of q.currencies){
      currencies++;
      insert(currency.itemId,'configured_currency_reward',
        'db03:quest:'+questId+':currency:'+canonicalId(currency.itemId),currency,null);
    }
    for(const row of q.lootCandidates){
      lootCandidates++;
      ensure(Number.isSafeInteger(row.tableIndex)&&row.tableIndex>=0&&
        Number.isSafeInteger(row.itemIndex)&&row.itemIndex>=0,
        'INVALID_LOOT_POSITION');
      insert(row.itemId,'additional_loot_candidate',
        'db03:quest:'+questId+':loot:'+row.tableIndex+':'+row.itemIndex,
        null,row);
    }
  }
  ensure(byQuest.size<=247&&currencies===65&&lootCandidates===330&&
    byOrigin.size===395,'PROJECTED_SOURCE_CENSUS');
  for(const rows of [...byItem.values(),...byQuest.values()])Object.freeze(rows);
  const coverage:QuestAcquisitionCoverage=Object.freeze({
    sourceGameVersion:'1.26.1' as const,
    targetGameVersion:'1.26.2' as const,
    rewardEvidenceQuestRows:247 as const,
    indexedQuestsWithItemIds:byQuest.size,
    opaqueOverrideQuestRows:4 as const,definedQuests:733 as const,
    currencySourceReferences:65 as const,
    additionalLootSourceReferences:330 as const,
    allSourceItemReferences:395 as const,
    distinctReferencedItemIds:byItem.size,
    publishedDb00MembershipNotRequired:true as const,
    originalFileIdentityVerified:true as const,
    staticOriginOnly:true as const,guaranteedGrantsVerified:false as const,
    liveAvailabilityVerified:false as const,completeAllQuestRewards:false as const
  });
  return Object.freeze({
    schema:DB02_QUEST_ACQUISITION_SCHEMA,coverage,
    indexedItemIds:Object.freeze([...byItem.keys()].sort((a,b)=>Number(a)-Number(b))),
    indexedQuestIds:Object.freeze([...byQuest.keys()].sort((a,b)=>Number(a)-Number(b))),
    getItemCandidates(raw:string|number){
      return byItem.get(canonicalId(raw))??EMPTY;
    },
    getQuestCandidates(raw:string|number){
      return byQuest.get(canonicalId(raw))??EMPTY;
    },
    getSourceOrigin(raw:string){
      ensure(typeof raw==='string'&&raw.length>0&&raw.length<=128,
        'INVALID_ORIGIN_ID');
      return byOrigin.get(raw)??null;
    }
  });
}

/**
 * Public-only entrypoint. DB-03 verifies reward bytes and original source
 * pin; the Quest identity catalogue is revalidated by DB-03. Use an approved
 * SvelteKit local asset base ('', '/Wand', etc.) only.
 */
export async function loadPublicQuestAcquisitionIndex(
  basePath='',fetcher:typeof fetch=fetch
):Promise<QuestAcquisitionIndex>{
  ensure(basePath===''||
    (typeof basePath==='string'&&BASE.test(basePath)&&
     !basePath.includes('..')&&!basePath.endsWith('/')&&!basePath.includes('//')),
    'INVALID_BASE_PATH');
  const path=basePath+'/guide/public/';
  const res=await fetcher(path+'quest-index.json');
  ensure(res.ok,'QUEST_INDEX_FETCH_FAILED');
  const sourceBytes=await res.arrayBuffer();
  ensure(sourceBytes.byteLength>0&&sourceBytes.byteLength<2*1024*1024,
    'QUEST_INDEX_BYTES');
  let publicQuestIndex:unknown;
  try{
    publicQuestIndex=verifyPublicQuestIndex(
      JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(sourceBytes)));
  }catch{throw new TypeError('DB02_QUEST_ACQUISITION_INVALID_PUBLIC_QUEST_INDEX');}
  const reader=await loadPublicQuestRewards(
    publicQuestIndex,path+DB03_QUEST_REWARDS_FILE,fetcher
  );
  return createIndex(reader,publicQuestIndex);
}
