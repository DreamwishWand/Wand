/**
 * DB-03 public Quest reward evidence -> DB-02 ItemOrigin contracts.
 * Public source definitions are only configured candidates. A loot table draw
 * count is not the quantity of any individual item; even exact currency amounts
 * are not proof of a reward actually being granted.
 *
 * This module owns only the cross-service projection. The DB-02 ledger keeps
 * its existing source, validation, deduplication and query semantics.
 */
import {verifyPublicQuestIndex} from './public-guide.mjs';
import {
  loadPublicQuestRewards,DB03_QUEST_REWARDS_FILE,DB03_QUEST_REWARDS_SHA,
  type PublicQuestRewardsReader,type QuestItemRewardRelation
} from './public-quest-rewards.ts';
import type {ItemOrigin,OriginProvenance} from '../acquisition/origins.ts';

export const DB03_QUEST_ACQUISITION_SCHEMA='wand.db03.public-quest-acquisition-origins@1' as const;
const MISSION_SHA='f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24';
const ID=/^[1-9][0-9]{0,15}$/;
const PINNED=new WeakSet<object>();
const EMPTY=Object.freeze([]) as readonly ItemOrigin[];
export interface PublicQuestAcquisitionIndex{
  readonly schema:typeof DB03_QUEST_ACQUISITION_SCHEMA;
  readonly sourceIntegrity:'pinned_public_quest_reward_sha256';
  readonly origins:readonly ItemOrigin[];
  readonly coverage:Readonly<{
    questsWithRewardEvidence:247;
    currencyCandidates:65;
    additionalLootCandidates:330;
    totalItemOriginCandidates:395;
    distinctItemIds:number;
    guaranteedGrantVerified:false;
    completedSeasonCatalog:false;
    allQuestRewardsKnown:false;
  }>;
  getItemCandidates(itemId:string|number):readonly ItemOrigin[];
  getQuestCandidates(questId:string):readonly ItemOrigin[];
}
function ensure(ok:unknown,code:string):asserts ok{
  if(!ok)throw new TypeError('DB03_QUEST_ACQUISITION_'+code);
}
function identifier(x:unknown):string|null{
  const id=typeof x==='number'&&Number.isSafeInteger(x)?String(x):x;
  return typeof id==='string'&&ID.test(id)&&Number.isSafeInteger(Number(id))?id:null;
}
function basePathOk(base:string):boolean{
  return typeof base==='string'&&(base===''||
    /^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(base));
}
function relationOrigin(
  row:QuestItemRewardRelation,questTitle:string,source:OriginProvenance
):ItemOrigin{
  ensure(row.configuredOnly===true&&row.guaranteedGrant===false&&
    row.playerOwnershipVerified===false&&identifier(row.itemId)!==null&&
    identifier(row.questId)!==null,'UNVERIFIED_RELATION');
  const conditionPrefix='Static Mission.json Quest reward configuration only; '+
    'not a guaranteed grant, live availability or owned item';
  const loot=row.loot;
  const currency=row.currency;
  const conditions:string[]=[conditionPrefix,
    'Original Mission.json SHA-256: '+MISSION_SHA,
    'Quest ID: '+row.questId];
  let originId:string;
  if(row.kind==='additional_loot_candidate'){
    ensure(loot!==null&&currency===null&&loot.itemId===row.itemId&&
      Number.isSafeInteger(loot.tableIndex)&&Number.isSafeInteger(loot.itemIndex),
      'INVALID_LOOT_CANDIDATE');
    originId='db03:public:quest:'+row.questId+':loot:'+
      loot.tableIndex+':'+loot.itemIndex;
    conditions.push('Additional Loot Table '+(loot.tableIndex+1)+
      ', entry '+(loot.itemIndex+1));
    if(loot.minimumRolls!==null&&loot.maximumRolls!==null)
      conditions.push('Configured table draws: '+loot.minimumRolls+'–'+
        loot.maximumRolls+' (NOT item quantity)');
    if(loot.tableWeight!==null)
      conditions.push('Source table weight: '+loot.tableWeight+
        ' (not a probability or guaranteed drop)');
    if(loot.hasSourceItemState)
      conditions.push('Additional item state was supplied in source; no runtime evaluation');
  }else{
    ensure(row.kind==='currency_configuration'&&currency!==null&&loot===null&&
      currency.itemId===row.itemId,'INVALID_CURRENCY_CANDIDATE');
    originId='db03:public:quest:'+row.questId+':currency:'+row.itemId;
    conditions.push('Configured currency amount range: '+currency.amountMin+
      '–'+currency.amountMax+' (not proof of award)');
  }
  return Object.freeze({
    originId,itemId:row.itemId,kind:'quest_reward' as const,
    routeStatus:'static_candidate_only' as const,campaignId:null,
    name:'Quest reward candidate: '+questTitle,productId:null,
    quantity:null,price:null,accessTier:'not_applicable' as const,
    window:Object.freeze({start:null,endExclusive:null}),
    salePeriods:Object.freeze([]),conditions:Object.freeze(conditions),
    source,availability:'not_live_verified' as const
  });
}
/**
 * The only trusted constructor is the pinned browser loader. No structural
 * object supplied directly by another module can claim authenticated source.
 */
export function hasPinnedPublicQuestAcquisitionEvidence(
  value:unknown
):value is PublicQuestAcquisitionIndex{
  return value!==null&&typeof value==='object'&&PINNED.has(value);
}
export async function loadPinnedPublicQuestAcquisition(
  basePath='',fetcher:typeof fetch=fetch
):Promise<PublicQuestAcquisitionIndex>{
  ensure(basePathOk(basePath),'INVALID_BASE_PATH');
  const questIndexUrl=basePath+'/guide/public/quest-index.json';
  const rewardUrl=basePath+'/guide/public/'+DB03_QUEST_REWARDS_FILE;
  const indexResponse=await fetcher(questIndexUrl);
  ensure(indexResponse.ok,'QUEST_INDEX_DOWNLOAD_FAILED');
  const rawIndex=await indexResponse.json();
  const index=verifyPublicQuestIndex(rawIndex);
  const reward=await loadPublicQuestRewards(index,rewardUrl,fetcher);
  ensure(reward.schema==='wand.db03.public-quest-rewards@1'&&
    reward.coverage.originalMissionVersion==='1.26.1'&&
    reward.coverage.targetGameVersion==='1.26.2'&&
    reward.coverage.runtimeGrantsVerified===false&&
    reward.coverage.questsWithCurrencyReward===65&&
    reward.coverage.additionalItemOccurrences===330,
    'UNVERIFIED_REWARD_READER');
  const byQuestName=new Map<string,string>();
  for(const row of index.quests){
    byQuestName.set(row.id, row.names?.en??row.internalName??row.id);
  }
  const source:OriginProvenance=Object.freeze({
    sourceId:'db03:steam-1262:public-quest-rewards',
    kind:'verified_game_native',sourceUrl:rewardUrl,
    checkedOn:'2026-11-22',gameVersion:'1.26.2',
    sha256:DB03_QUEST_REWARDS_SHA
  });
  const rows:ItemOrigin[]=[];
  const items=new Map<string,ItemOrigin[]>();
  const quests=new Map<string,ItemOrigin[]>();
  const unique=new Set<string>();
  let currencies=0,loot=0;
  function push(relation:QuestItemRewardRelation){
    const display=byQuestName.get(relation.questId);
    ensure(typeof display==='string'&&display.length>0,'UNKNOWN_SOURCE_QUEST');
    const candidate=relationOrigin(relation,display,source);
    ensure(!unique.has(candidate.originId),'DUPLICATE_QUEST_REWARD_SLOT');
    unique.add(candidate.originId);rows.push(candidate);
    const list=items.get(candidate.itemId)??[];
    list.push(candidate);items.set(candidate.itemId,list);
    const perQuest=quests.get(relation.questId)??[];
    perQuest.push(candidate);quests.set(relation.questId,perQuest);
    if(relation.kind==='currency_configuration')currencies++;
    else loot++;
  }
  // Reverse lookup over every original source relation, once per item ID.
  // Do not collapse two configured slots that happen to refer to the same ID.
  const allIds=new Set<string>();
  for(const id of reward.questIdsWithEvidence){
    const quest=reward.getQuest(id);
    ensure(quest!==null,'MISSING_SOURCE_QUEST');
    for(const cur of quest.currencies)allIds.add(cur.itemId);
    for(const item of quest.lootCandidates)allIds.add(item.itemId);
  }
  for(const id of allIds)for(const relation of reward.getItemCandidates(id))push(relation);
  ensure(rows.length===395&&currencies===65&&loot===330&&
    quests.size<=247&&reward.questIdsWithEvidence.length===247,
    'ORIGIN_CENSUS_MISMATCH');
  for(const collection of [items,quests])
    for(const values of collection.values())Object.freeze(values);
  const originIndex:PublicQuestAcquisitionIndex=Object.freeze({
    schema:DB03_QUEST_ACQUISITION_SCHEMA,
    sourceIntegrity:'pinned_public_quest_reward_sha256' as const,
    origins:Object.freeze(rows),
    coverage:Object.freeze({
      questsWithRewardEvidence:247 as const,
      currencyCandidates:65 as const,additionalLootCandidates:330 as const,
      totalItemOriginCandidates:395 as const,distinctItemIds:items.size,
      guaranteedGrantVerified:false as const,completedSeasonCatalog:false as const,
      allQuestRewardsKnown:false as const
    }),
    getItemCandidates(id:string|number){
      return items.get(identifier(id)??'')??EMPTY;
    },
    getQuestCandidates(id:string){
      return quests.get(identifier(id)??'')??EMPTY;
    }
  });
  PINNED.add(originIndex);
  return originIndex;
}
