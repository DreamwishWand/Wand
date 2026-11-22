/**
 * Steam 1.26.2 source-authenticated static Quest reward/currency evidence.
 *
 * A native Loot Table entry is a candidate, NOT a granted/owned reward. Roll
 * counts are table draws, not quantities. The four opaque override lookups are
 * explicitly unresolved and excluded from Item-ID backlinks. No save access.
 */
import {verifyPublicQuestIndex} from './public-guide.mjs';

export const DB03_QUEST_REWARDS_SCHEMA='wand.db03.public-quest-rewards@1' as const;
export const DB03_QUEST_REWARDS_FILE='quest-rewards-1.26.2.json' as const;
export const DB03_QUEST_REWARDS_BYTES=21606 as const;
export const DB03_QUEST_REWARDS_SHA='473c2eab85f294d0f9169306db8630bcdaa47dea080f48dd0303575b0a6f9ae3' as const;
const SOURCE_BUNDLE='9dcf0efbeb4b70fcf4222a295a43690ae6a04fb1ee12a169dc8031f062600d6f';
const ORIGINAL_MISSION='f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24';
const ID=/^[1-9][0-9]{0,15}$/;
const CENSUS=Object.freeze({
  quests:733,questRowsWithAnyRewardEvidence:247,
  distinctAdditionalItemIds:291,distinctCurrencyIds:4,
  questsWithOpaqueOverrides:4,currencyOccurrences:65,
  questsWithCurrencyReward:65,additionalItemOccurrences:330,
  questsWithAdditionalItemCandidates:195,
  questsWithDeclaredAdditionalRewards:243,
  emptyAdditionalLootDefinitions:48,lootTables:328
});
type RawCurrency=readonly [string,number,number];
type RawLoot=readonly [number,number,string,number|null,number|null,number|null,boolean];
export interface QuestCurrencyReward {
  readonly itemId:string;
  readonly amountMin:number;
  readonly amountMax:number;
}
export interface QuestLootCandidate {
  readonly itemId:string;
  readonly tableIndex:number;
  readonly itemIndex:number;
  /** Original Loot Table roll count, NOT quantity of this item. */
  readonly minimumRolls:number|null;
  readonly maximumRolls:number|null;
  readonly tableWeight:number|null;
  readonly hasSourceItemState:boolean;
}
export interface QuestRewardInfo {
  readonly questId:string;
  readonly currencies:readonly QuestCurrencyReward[];
  readonly lootCandidates:readonly QuestLootCandidate[];
  /** An external reward reference exists without an authoritative Item-ID join. */
  readonly opaqueOverrideUnresolved:boolean;
  readonly staticSourceOnly:true;
  readonly guaranteedGrant:false;
}
export interface QuestItemRewardRelation {
  readonly itemId:string;
  readonly questId:string;
  readonly kind:'currency_configuration'|'additional_loot_candidate';
  readonly currency:QuestCurrencyReward|null;
  readonly loot:QuestLootCandidate|null;
  readonly configuredOnly:true;
  readonly guaranteedGrant:false;
  readonly playerOwnershipVerified:false;
}
export interface PublicQuestRewardsReader {
  readonly schema:typeof DB03_QUEST_REWARDS_SCHEMA;
  readonly coverage:Readonly<typeof CENSUS & {
    originalMissionVersion:'1.26.1';
    targetGameVersion:'1.26.2';
    runtimeGrantsVerified:false;
    allRewardsKnown:false;
  }>;
  readonly questIdsWithEvidence:readonly string[];
  /** null means no relevant explicit source evidence, NOT zero in-game rewards. */
  getQuest(questId:string):QuestRewardInfo|null;
  getItemCandidates(itemId:string|number):readonly QuestItemRewardRelation[];
}
function assert(value:unknown,code:string):asserts value{
  if(!value)throw new TypeError('DB03_PUBLIC_QUEST_REWARDS_'+code);
}
const obj=(value:unknown):value is Record<string,unknown>=>
  value!==null&&typeof value==='object'&&!Array.isArray(value);
const validId=(id:unknown):id is string=>typeof id==='string'&&ID.test(id)&&
  Number.isSafeInteger(Number(id));
const safe=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0;
function canonicalId(v:string|number):string|null{
  const id=typeof v==='number'&&Number.isSafeInteger(v)?String(v):v;
  return validId(id)?id:null;
}
const EMPTY=Object.freeze([]) as readonly QuestItemRewardRelation[];
const freeze=<T extends object>(value:T):Readonly<T>=>Object.freeze(value);

/** Consumes a checked public Quest catalogue and source-pinned reward projection. */
export function verifyPublicQuestRewards(
  doc:unknown,publicQuestIndex:unknown
):PublicQuestRewardsReader {
  const quests=verifyPublicQuestIndex(publicQuestIndex);
  assert(obj(doc)&&doc.schema===DB03_QUEST_REWARDS_SCHEMA&&
    obj(doc.target)&&doc.target.platform==='Steam'&&doc.target.gameVersion==='1.26.2',
    'SCHEMA_OR_GAME_VERSION');
  const p=doc.provenance;
  assert(obj(p)&&p.bundleSha256===SOURCE_BUNDLE&&
    p.originalMissionSha256===ORIGINAL_MISSION&&p.originalMissionVersion==='1.26.1'&&
    p.staticCandidatesOnly===true&&p.notConfirmedGrantsOrPlayerProgress===true&&
    p.opaqueOverridesNotResolved===true,'SOURCE_PROVENANCE');
  assert(obj(doc.counts)&&Object.entries(CENSUS).every(([key,value])=>doc.counts[key]===value),
    'SOURCE_CENSUS');
  assert(obj(doc.rows)&&Object.keys(doc.rows).length===CENSUS.questRowsWithAnyRewardEvidence,
    'ROW_CENSUS');
  const expectedIds=new Set(quests.quests.map((q:{id:string})=>q.id));
  const rows=new Map<string,QuestRewardInfo>();
  const inverse=new Map<string,QuestItemRewardRelation[]>();
  const ids=new Set<string>();
  const currencies=new Set<string>();
  const calculated={currency:0,additional:0,opaque:0,currencyQuests:0,lootQuests:0};
  function link(itemId:string,questId:string,kind:QuestItemRewardRelation['kind'],
    currency:QuestCurrencyReward|null,loot:QuestLootCandidate|null){
    const row:QuestItemRewardRelation=freeze({itemId,questId,kind,currency,loot,
      configuredOnly:true as const,guaranteedGrant:false as const,
      playerOwnershipVerified:false as const});
    const a=inverse.get(itemId)??[];a.push(row);inverse.set(itemId,a);
  }
  for(const [questId,entry] of Object.entries(doc.rows)){
    assert(validId(questId)&&expectedIds.has(questId)&&obj(entry),'FOREIGN_QUEST_ID');
    assert(Object.keys(entry).every(k=>['currency','additionalLoot','opaqueOverrideUnresolved'].includes(k)),
      'UNKNOWN_REWARD_FIELD');
    const rawCurrency=entry.currency??[];const rawLoot=entry.additionalLoot??[];
    assert(Array.isArray(rawCurrency)&&Array.isArray(rawLoot),'INVALID_REWARD_ARRAYS');
    const currencyRecords:QuestCurrencyReward[]=[];
    const lootRecords:QuestLootCandidate[]=[];
    for(const tuple of rawCurrency as RawCurrency[]){
      assert(Array.isArray(tuple)&&tuple.length===3&&validId(tuple[0])&&
        safe(tuple[1])&&safe(tuple[2])&&tuple[1]<=tuple[2]&&tuple[2]<=1_000_000_000,
        'INVALID_CURRENCY_ROW');
      const cur=freeze({itemId:tuple[0],amountMin:tuple[1],amountMax:tuple[2]});
      currencyRecords.push(cur);currencies.add(cur.itemId);
      link(cur.itemId,questId,'currency_configuration',cur,null);calculated.currency++;
    }
    const positions=new Set<string>();
    for(const tuple of rawLoot as RawLoot[]){
      assert(Array.isArray(tuple)&&tuple.length===7&&
        safe(tuple[0])&&safe(tuple[1])&&validId(tuple[2])&&
        (tuple[3]===null||safe(tuple[3]))&&
        (tuple[4]===null||safe(tuple[4]))&&
        (tuple[3]===null)===(tuple[4]===null)&&
        (tuple[3]===null||tuple[4]!==null&&tuple[3]<=tuple[4]&&tuple[4]<=10000)&&
        (tuple[5]===null||safe(tuple[5])&&tuple[5]<=1_000_000)&&
        typeof tuple[6]==='boolean','INVALID_LOOT_ROW');
      const pos=tuple[0]+'/'+tuple[1];
      assert(!positions.has(pos),'DUPLICATE_LOOT_SLOT');positions.add(pos);
      const loot=freeze({tableIndex:tuple[0],itemIndex:tuple[1],itemId:tuple[2],
        minimumRolls:tuple[3],maximumRolls:tuple[4],
        tableWeight:tuple[5],hasSourceItemState:tuple[6]});
      lootRecords.push(loot);ids.add(loot.itemId);
      link(loot.itemId,questId,'additional_loot_candidate',null,loot);
      calculated.additional++;
    }
    const unresolved=entry.opaqueOverrideUnresolved===true;
    assert(entry.opaqueOverrideUnresolved===undefined||unresolved,'INVALID_OVERRIDE_FLAG');
    assert(currencyRecords.length+lootRecords.length>0||unresolved,'EMPTY_REWARD_EVIDENCE');
    if(currencyRecords.length)calculated.currencyQuests++;
    if(lootRecords.length)calculated.lootQuests++;
    if(unresolved)calculated.opaque++;
    rows.set(questId,freeze({questId,currencies:freeze(currencyRecords),
      lootCandidates:freeze(lootRecords),opaqueOverrideUnresolved:unresolved,
      staticSourceOnly:true as const,guaranteedGrant:false as const}));
  }
  assert(calculated.currency===65&&calculated.additional===330&&
    calculated.currencyQuests===65&&calculated.lootQuests===195&&
    calculated.opaque===4&&ids.size===291&&currencies.size===4&&
    ['80000000','80000003','80000010','80300000'].every(k=>currencies.has(k)),
    'RECOMPUTED_CENSUS');
  for(const [id,refs] of inverse)inverse.set(id,freeze(refs) as QuestItemRewardRelation[]);
  const allIds=freeze([...rows.keys()].sort((a,b)=>Number(a)-Number(b)));
  const coverage=freeze({...CENSUS,originalMissionVersion:'1.26.1' as const,
    targetGameVersion:'1.26.2' as const,runtimeGrantsVerified:false as const,
    allRewardsKnown:false as const});
  return freeze({schema:DB03_QUEST_REWARDS_SCHEMA,coverage,
    questIdsWithEvidence:allIds,
    getQuest:(id:string)=>rows.get(id)??null,
    getItemCandidates:(id:string|number)=>inverse.get(canonicalId(id)??'')??EMPTY});
}

/** Only this entry point pins the published byte stream before parsing. */
export async function loadPublicQuestRewards(
  publicQuestIndex:unknown,url:string,fetcher:typeof fetch=fetch
):Promise<PublicQuestRewardsReader>{
  assert(typeof url==='string'&&url.length>0&&url.length<2048,'INVALID_URL');
  const response=await fetcher(url);
  assert(response.ok,'DOWNLOAD_FAILED');
  const bytes=await response.arrayBuffer();
  assert(bytes.byteLength===DB03_QUEST_REWARDS_BYTES,'PUBLISHED_BYTES_MISMATCH');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(v=>v.toString(16).padStart(2,'0')).join('');
  assert(digest===DB03_QUEST_REWARDS_SHA,'PUBLISHED_SHA_MISMATCH');
  return verifyPublicQuestRewards(
    JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),publicQuestIndex);
}