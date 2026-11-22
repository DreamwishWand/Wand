/** DB-03 public-only missing-name refresh for independently reissued DB-00.
 *
 * The existing compact 141-ID guide label index remains the default. Only if
 * DB-00 publishes a NEW validated Steam 1.26.2 snapshot do we load its
 * SHA-checked public items and fill previously missing names. Owner-private
 * source files, unpublished names, and unverified labels are never consulted.
 */
import {loadActivePointer,loadCurrentGameDatabase} from '../game-db/client.ts';
import type {DbSnapshot} from '../game-db/model.ts';
import type {PublicEventFriendshipRewards} from './public-event-friendship-rewards.ts';
import type {EventRewardItemLabelIndex,GuideRewardLocale} from './event-reward-item-labels.ts';

export const DB03_EVENT_PUBLIC_NAME_REFRESH_SCHEMA='wand.db03.public-reward-name-refresh@1' as const;
export const DB03_EVENT_LABEL_BASELINE_SNAPSHOT='steam-1.26.2-native-itemlist-v1' as const;
const LOCALES=['ja','en','fr','it','de','es-ES','zh-CN','pt-BR'] as const;
type PublicItemSource=Pick<DbSnapshot,'id'|'target'|'sources'|'items'>;
export interface PublicEventRewardNameRefresh {
  readonly schema:typeof DB03_EVENT_PUBLIC_NAME_REFRESH_SCHEMA;
  readonly snapshotId:string;
  readonly newVerifiedItemIds:readonly string[];
  readonly currentVersionOnly:true;
  readonly privateSourceUsed:false;
  readonly playerOwnershipVerified:false;
  getDisplayName(itemId:string,locale:GuideRewardLocale):string|null;
  getSourceCategory(itemId:string):string|null;
}
function ensure(value:unknown,reason:string):asserts value {
  if(!value)throw new TypeError('DB03_EVENT_PUBLIC_NAME_REFRESH_'+reason);
}
export function selectNewPublishedEventRewardNames(
  source:PublicEventFriendshipRewards,
  labels:EventRewardItemLabelIndex,
  database:PublicItemSource
):PublicEventRewardNameRefresh|null{
  ensure(source?.schema==='wand.db03.public-event-friendship-rewards@1'&&
    source.coverage?.distinctAllItemIds===141&&
    labels?.schema==='wand.db03.event-reward-item-labels@1'&&
    labels.coverage?.rewardItemIds===141&&
    labels.coverage?.missingPublishedNames===32,'GUIDE_SOURCE_REQUIRED');
  ensure(database&&database.id!==DB03_EVENT_LABEL_BASELINE_SNAPSHOT&&
    typeof database.id==='string'&&database.id.length<=128&&
    database.target?.platform==='Steam'&&
    database.target?.gameVersion==='1.26.2'&&
    Array.isArray(database.sources)&&database.sources.length>0&&
    database.sources.every(row=>row.visibility==='public_reference')&&
    Array.isArray(database.items),'PUBLISHED_DB00_REQUIRED');
  const ids=new Set<string>();
  for(const event of source.events)for(const row of event.rewards)ids.add(row.itemId);
  for(const reward of source.defaultFriendship)ids.add(reward.itemId);
  ensure(ids.size===141,'REWARD_CENSUS');
  const added=new Map<string,Readonly<{names:Readonly<Record<string,string>>;category:string|null}>>();
  const encountered=new Set<string>();
  for(const row of database.items){
    if(!ids.has(row.id)||labels.getItem(row.id)?.status!=='missing')continue;
    ensure(!encountered.has(row.id),'DUPLICATE_ITEM');
    encountered.add(row.id);
    if(row.nameStatus!=='verified')continue;
    const valid=Object.entries(row.names).every(([locale,text])=>
      LOCALES.includes(locale as GuideRewardLocale)&&
      typeof text==='string'&&text.trim().length>0&&text.length<=240);
    ensure(valid,'VERIFIED_NAME_MALFORMED');
    if(!Object.keys(row.names).length)continue;
    added.set(row.id,Object.freeze({
      names:Object.freeze({...row.names}),
      category:typeof row.category==='string'&&row.category.length>0?row.category:null
    }));
  }
  if(!added.size)return null;
  const itemIds=Object.freeze([...added.keys()].sort((a,b)=>Number(a)-Number(b)));
  return Object.freeze({
    schema:DB03_EVENT_PUBLIC_NAME_REFRESH_SCHEMA,snapshotId:database.id,
    newVerifiedItemIds:itemIds,currentVersionOnly:true as const,
    privateSourceUsed:false as const,playerOwnershipVerified:false as const,
    getDisplayName(id:string,locale:GuideRewardLocale){
      const names=added.get(id)?.names;
      return names?.[locale]??names?.en??null;
    },
    getSourceCategory(id:string){return added.get(id)?.category??null;}
  });
}
/** Baseline: only one ~550-byte active-pointer request, no full DB fetch.
 * Changed same-game releases: delegate full byte and SHA checks to DB-00.
 */
export async function loadNewPublishedEventRewardNames(
  source:PublicEventFriendshipRewards,
  labels:EventRewardItemLabelIndex,
  basePath:string,
  fetcher:typeof fetch=fetch
):Promise<PublicEventRewardNameRefresh|null>{
  const pointer=await loadActivePointer(basePath,fetcher);
  if(!pointer||pointer.kind!=='db_snapshot'||
    pointer.snapshot===DB03_EVENT_LABEL_BASELINE_SNAPSHOT||
    pointer.target.gameVersion!=='1.26.2')return null;
  const database=await loadCurrentGameDatabase(basePath,fetcher);
  ensure(database.kind==='db_snapshot'&&database.id===pointer.snapshot&&
    database.target.platform==='Steam'&&database.target.gameVersion==='1.26.2',
    'CHANGED_SNAPSHOT_MISMATCH');
  return selectNewPublishedEventRewardNames(source,labels,database);
}
