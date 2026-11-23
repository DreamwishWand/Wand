/** Source-pinned public Steam 1.26.2 names for native Quest reward candidates.
 * A published Item definition is not proof of a granted reward, possession,
 * CollectionSet membership, unlock status, or runtime Loot Table outcome.
 *
 * The 281 records are a compact projection from the already-public DB-00
 * release; 15 native reward IDs have no published matching Item definition.
 * No private originals or save data are loaded or published here.
 */
import {collectionItemHref} from '../collection/item-permalink.ts';
import type {PublicQuestRewardsReader} from './public-quest-rewards.ts';
import type {QuestOverrideLootIndex} from './public-quest-override-loot.ts';

export const DB03_QUEST_REWARD_LABEL_SCHEMA='wand.db03.public-quest-reward-item-labels@1' as const;
export const DB03_QUEST_REWARD_LABEL_FILE='quest-reward-item-labels-1.26.2.json' as const;
export const DB03_QUEST_REWARD_LABEL_BYTES=65884 as const;
export const DB03_QUEST_REWARD_LABEL_SHA='b572a2b7a4ed66c5243f93ad9760086ea194ac66ef4d8bdd3110f1f173d153be' as const;
const DB00_INDEX_SHA='06912b156823d920d1b3a2b937ebff3d06e1ca670043db616c907c683b46599f';
const DB00_NATIVE_SHA='496782625e68fb53e018659bbabf0d8bb8bdc55f12037f4c568a7d32321f515b';
const QUEST_REWARDS_SHA='473c2eab85f294d0f9169306db8630bcdaa47dea080f48dd0303575b0a6f9ae3';
const QUEST_OVERRIDE_SHA='032f8dbeb462d13984de7adba7022500a45eedfbc901a17e215d3effdbc48368';
const LOCALES=['ja','en','fr','it','de','es-ES','zh-CN','pt-BR'] as const;
export type QuestRewardLocale=typeof LOCALES[number];
const ITEM=/^[1-9][0-9]{0,15}$/;
const EMPTY=Object.freeze([]) as readonly string[];
type LocalNames=Readonly<Record<QuestRewardLocale,string>>;

export interface PublicQuestRewardItemLabels {
  readonly schema:typeof DB03_QUEST_REWARD_LABEL_SCHEMA;
  readonly gameVersion:'1.26.2';
  readonly coverage:Readonly<{
    sourceRewardItemIds:296;
    publishedVerifiedNames:281;
    unresolvedSourceItemIds:15;
    sourceRewardOccurrences:399;
    staticSourceOnly:true;
    playerOwnershipVerified:false;
    guaranteedGrantVerified:false;
  }>;
  readonly publishedItemIds:readonly string[];
  getDisplayName(itemId:string|number,locale:string):string|null;
  getCollectionHref(itemId:string|number,base?:string):string|null;
}
function ensure(value:unknown,code:string):asserts value{
  if(!value)throw new TypeError('DB03_QUEST_REWARD_LABEL_'+code);
}
function obj(value:unknown):value is Record<string,unknown>{
  return value!==null&&typeof value==='object'&&!Array.isArray(value);
}
function id(raw:unknown):string|null{
  const val=typeof raw==='number'&&Number.isSafeInteger(raw)?String(raw):raw;
  return typeof val==='string'&&ITEM.test(val)&&Number.isSafeInteger(Number(val))?val:null;
}
function originalRewardIds(
  reader:PublicQuestRewardsReader,override:QuestOverrideLootIndex
):ReadonlySet<string>{
  ensure(reader?.schema==='wand.db03.public-quest-rewards@1'&&
    reader.coverage?.quests===733&&
    reader.coverage?.currencyOccurrences===65&&
    reader.coverage?.additionalItemOccurrences===330&&
    reader.coverage?.runtimeGrantsVerified===false&&
    typeof reader.getQuest==='function'&&
    Array.isArray(reader.questIdsWithEvidence)&&
    override?.schema==='wand.db03.quest-override-loot-candidates@1'&&
    override.gameVersion==='1.26.2'&&
    override.coverage?.candidateOccurrences===4&&
    override.coverage?.runtimeGrantVerified===false&&
    Array.isArray(override.candidates),'ORIGINAL_SOURCE_REQUIRED');
  const ids=new Set<string>();
  let count=0;
  for(const questId of reader.questIdsWithEvidence){
    const reward=reader.getQuest(questId);
    ensure(reward?.questId===questId&&reward.staticSourceOnly===true&&
      reward.guaranteedGrant===false,'ORIGINAL_REWARD_ROW');
    for(const currency of reward.currencies){
      ensure(id(currency.itemId)===currency.itemId,'ORIGINAL_CURRENCY_ID');
      ids.add(currency.itemId);count++;
    }
    for(const item of reward.lootCandidates){
      ensure(id(item.itemId)===item.itemId,'ORIGINAL_LOOT_ID');
      ids.add(item.itemId);count++;
    }
  }
  for(const item of override.candidates){
    ensure(id(item.itemId)===item.itemId&&item.staticSourceOnly===true&&
      item.guaranteedGrant===false&&item.ownershipVerified===false&&
      reader.getQuest(item.questId)?.opaqueOverrideUnresolved===true,'ORIGINAL_OVERRIDE_ROW');
    ids.add(item.itemId);count++;
  }
  ensure(count===399&&ids.size===296,'ORIGINAL_REWARD_CENSUS');
  return ids;
}
export function verifyPublicQuestRewardItemLabels(
  raw:unknown,reader:PublicQuestRewardsReader,
  override:QuestOverrideLootIndex
):PublicQuestRewardItemLabels{
  const sourceIds=originalRewardIds(reader,override);
  ensure(obj(raw)&&raw.schema===DB03_QUEST_REWARD_LABEL_SCHEMA&&
    obj(raw.target)&&raw.target.platform==='Steam'&&
    raw.target.gameVersion==='1.26.2'&&
    raw.target.release==='steam-1.26.2-native-itemlist-v1','TARGET');
  const source=raw.source,counts=raw.counts;
  ensure(obj(source)&&source.db00ReleaseIndexSha256===DB00_INDEX_SHA&&
    source.db00NativeItemSourceSha256===DB00_NATIVE_SHA&&
    source.questRewardProjectionSha256===QUEST_REWARDS_SHA&&
    source.questOverrideProjectionSha256===QUEST_OVERRIDE_SHA&&
    source.verifiedNamesOnly===true&&source.originalStaticCandidatesOnly===true&&
    source.guaranteedGrantVerified===false&&source.playerOwnershipVerified===false,'PROVENANCE');
  ensure(obj(counts)&&counts.rewardItemIds===296&&
    counts.publishedVerifiedNames===281&&counts.unresolvedPublishedNames===15&&
    counts.nativeQuestRewardOccurrences===395&&counts.overrideLootOccurrences===4&&
    Array.isArray(raw.locales)&&raw.locales.length===8&&
    raw.locales.every((x:unknown,i:number)=>x===LOCALES[i])&&
    obj(raw.items)&&Object.keys(raw.items).length===281,'SOURCE_CENSUS');
  const byId=new Map<string,LocalNames>();
  for(const [key,value] of Object.entries(raw.items)){
    ensure(id(key)===key&&sourceIds.has(key)&&
      Array.isArray(value)&&value.length===8&&
      value.every(name=>typeof name==='string'&&name.trim().length>0&&
        name.length<=240),'PUBLISHED_ITEM');
    const names=Object.freeze(Object.fromEntries(LOCALES.map((locale,i)=>[locale,value[i]])) as
      Record<QuestRewardLocale,string>);
    byId.set(key,names);
  }
  ensure(byId.size===281&&sourceIds.size-byId.size===15,'RECOMPUTED_CENSUS');
  const publishedItemIds=Object.freeze([...byId.keys()]);
  return Object.freeze({
    schema:DB03_QUEST_REWARD_LABEL_SCHEMA,gameVersion:'1.26.2' as const,
    coverage:Object.freeze({
      sourceRewardItemIds:296 as const,publishedVerifiedNames:281 as const,
      unresolvedSourceItemIds:15 as const,sourceRewardOccurrences:399 as const,
      staticSourceOnly:true as const,playerOwnershipVerified:false as const,
      guaranteedGrantVerified:false as const
    }),
    publishedItemIds,
    getDisplayName(rawId:string|number,locale:string):string|null{
      const value=id(rawId);
      const names=value?byId.get(value):null;
      return names?.[LOCALES.includes(locale as QuestRewardLocale)?
        locale as QuestRewardLocale:'en']??null;
    },
    getCollectionHref(rawId:string|number,base=''):string|null{
      const value=id(rawId);
      if(!value||!byId.has(value))return null;
      return collectionItemHref(base,Number(value));
    }
  });
}
/** Byte and SHA-256 verification before interpreting any published crosswalk. */
export async function loadPublicQuestRewardItemLabels(
  reader:PublicQuestRewardsReader,override:QuestOverrideLootIndex,
  url:string,fetcher:typeof fetch=fetch
):Promise<PublicQuestRewardItemLabels>{
  ensure(typeof url==='string'&&url.length>0&&url.length<2048,'URL');
  const response=await fetcher(url);
  ensure(response.ok,'DOWNLOAD_FAILED');
  const bytes=await response.arrayBuffer();
  ensure(bytes.byteLength===DB03_QUEST_REWARD_LABEL_BYTES,'BYTES');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(byte=>byte.toString(16).padStart(2,'0')).join('');
  ensure(hash===DB03_QUEST_REWARD_LABEL_SHA,'SHA');
  return verifyPublicQuestRewardItemLabels(
    JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),reader,override);
}
