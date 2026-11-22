/** Native v1.26.2 event/friendship reward Item ID -> DB-00 published labels.
 * Only source-verified, source-published names are displayed. DB-00 category
 * is a source definition category, NOT an in-game Collection screen category.
 * The exact source has no published, image-backed media for these Item IDs.
 */
import type {PublicEventFriendshipRewards} from './public-event-friendship-rewards.ts';

export const DB03_EVENT_ITEM_LABELS_SCHEMA='wand.db03.event-reward-item-labels@1' as const;
export const DB03_EVENT_ITEM_LABELS_FILE='event-reward-item-labels-1.26.2.json' as const;
export const DB03_EVENT_ITEM_LABELS_BYTES=29585 as const;
export const DB03_EVENT_ITEM_LABELS_SHA='bddb880086542c027f524c5d5cbd36ef3095385e302bf18f3265f225053e2dac' as const;
const ORIGINAL_DB00_INDEX='06912b156823d920d1b3a2b937ebff3d06e1ca670043db616c907c683b46599f';
const ORIGINAL_DB00_NATIVE='496782625e68fb53e018659bbabf0d8bb8bdc55f12037f4c568a7d32321f515b';
const ORIGINAL_REWARD_PROJECTION='9b8857dfaa557a458a8e922ea4145895bc698e50d8d1ce0ad68017492f18b5c9';
const LOCALES=['ja','en','fr','it','de','es-ES','zh-CN','pt-BR'] as const;
export type GuideRewardLocale=typeof LOCALES[number];
export type RewardLabelStatus='verified'|'missing';
export interface EventRewardItemLabel {
  readonly itemId:string;
  readonly status:RewardLabelStatus;
  /** DB-00 native source grouping: not a UI Collection category. */
  readonly sourceCategory:string|null;
  readonly names:Readonly<Record<GuideRewardLocale,string|null>>|null;
  readonly publicImageUrl:null;
}
export interface EventRewardItemLabelIndex {
  readonly schema:typeof DB03_EVENT_ITEM_LABELS_SCHEMA;
  readonly gameVersion:'1.26.2';
  readonly coverage:Readonly<{
    rewardItemIds:141;
    verifiedNames:109;
    missingPublishedNames:32;
    publishedImages:0;
    gameScreenCategoriesVerified:false;
  }>;
  getItem(id:string|number):EventRewardItemLabel|null;
  getDisplayName(id:string|number,locale:GuideRewardLocale):string;
}
const ID=/^[1-9][0-9]{0,15}$/;
const missing=(code:string):never=>{throw new TypeError('DB03_EVENT_ITEM_LABELS_'+code);};
function check(ok:unknown,code:string):asserts ok{if(!ok)missing(code);}
const obj=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function canonical(value:string|number):string|null{
  const id=typeof value==='number'&&Number.isSafeInteger(value)?String(value):value;
  return typeof id==='string'&&ID.test(id)&&Number.isSafeInteger(Number(id))?id:null;
}
export function verifyEventRewardItemLabels(
  value:unknown,rewards:PublicEventFriendshipRewards
):EventRewardItemLabelIndex{
  check(rewards?.schema==='wand.db03.public-event-friendship-rewards@1'&&
    rewards.coverage.sourceNativeEvents===24&&
    rewards.coverage.eventRewardCandidates===202&&
    rewards.coverage.defaultFriendshipRewardCandidates===16&&
    rewards.coverage.distinctAllItemIds===141,'REWARD_SOURCE_REQUIRED');
  check(obj(value)&&value.schema===DB03_EVENT_ITEM_LABELS_SCHEMA&&
    obj(value.target)&&value.target.platform==='Steam'&&
    value.target.gameVersion==='1.26.2'&&
    value.target.release==='steam-1.26.2-native-itemlist-v1','TARGET');
  const source=value.source,counts=value.counts;
  check(obj(source)&&source.db00IndexSha256===ORIGINAL_DB00_INDEX&&
    source.db00NativeSourceSha256===ORIGINAL_DB00_NATIVE&&
    source.eventRewardProjectionSha256===ORIGINAL_REWARD_PROJECTION&&
    source.verifiedNamesOnly===true&&
    source.originalGameScreenCategoriesVerified===false&&
    source.publicSourceImagesAvailable===false,'SOURCE');
  check(obj(counts)&&counts.rewardItemIds===141&&counts.foundInPublicDb00===109&&
    counts.verifiedNames===109&&counts.unverifiedOrMissing===32&&
    counts.actualPublicMediaPaths===0&&
    Array.isArray(value.locales)&&value.locales.length===8&&
    value.locales.every((x:unknown,i:number)=>x===LOCALES[i])&&
    obj(value.items)&&Object.keys(value.items).length===141,'CENSUS');
  const itemIds=new Set<string>();
  for(const event of rewards.events)for(const row of event.rewards)itemIds.add(row.itemId);
  for(const row of rewards.defaultFriendship)itemIds.add(row.itemId);
  check(itemIds.size===141,'REWARD_IDS');
  const byId=new Map<string,EventRewardItemLabel>();
  let verified=0;
  for(const [key,entry] of Object.entries(value.items)){
    check(canonical(key)===key&&itemIds.has(key)&&
      Array.isArray(entry)&&entry.length===3,'UNKNOWN_ITEM');
    const status=entry[0];
    const category=entry[1];
    const names=entry[2];
    check(status==='verified'||status==='missing','ITEM_STATUS');
    if(status==='verified'){
      check(typeof category==='string'&&category.length>0&&category.length<=120&&
        Array.isArray(names)&&names.length===8&&
        names.every((name:unknown)=>typeof name==='string'&&name.trim().length>0&&name.length<=240),
        'VERIFIED_LABEL');
      verified++;
    }else{
      check(category===null&&names===null,'UNKNOWN_LABEL_MUST_BE_NULL');
    }
    const localized=status==='verified'?
      Object.freeze(Object.fromEntries(LOCALES.map((l,i)=>[l,names[i]])) as
        Record<GuideRewardLocale,string>):null;
    byId.set(key,Object.freeze({itemId:key,status,
      sourceCategory:status==='verified'?category:null,
      names:localized,publicImageUrl:null}));
  }
  check(verified===109&&byId.size===141,'VERIFIED_CENSUS');
  return Object.freeze({
    schema:DB03_EVENT_ITEM_LABELS_SCHEMA,gameVersion:'1.26.2' as const,
    coverage:Object.freeze({rewardItemIds:141 as const,verifiedNames:109 as const,
      missingPublishedNames:32 as const,publishedImages:0 as const,
      gameScreenCategoriesVerified:false as const}),
    getItem(value:string|number){return byId.get(canonical(value)??'')??null;},
    getDisplayName(value:string|number,locale:GuideRewardLocale){
      const id=canonical(value),row=id?byId.get(id):null;
      return (row?.names?.[LOCALES.includes(locale)?locale:'ja'])||id||'';
    }
  });
}
export async function loadEventRewardItemLabels(
  rewards:PublicEventFriendshipRewards,url:string,fetcher:typeof fetch=fetch
):Promise<EventRewardItemLabelIndex>{
  check(typeof url==='string'&&url.length>0&&url.length<2048,'URL');
  const res=await fetcher(url);
  check(res.ok,'DOWNLOAD_FAILED');
  const bytes=await res.arrayBuffer();
  check(bytes.byteLength===DB03_EVENT_ITEM_LABELS_BYTES,'BYTES');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(x=>x.toString(16).padStart(2,'0')).join('');
  check(digest===DB03_EVENT_ITEM_LABELS_SHA,'SHA');
  return verifyEventRewardItemLabels(
    JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),rewards);
}
