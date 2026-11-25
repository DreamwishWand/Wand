/** Resolve original source occurrences and their display identities from the
 * same pinned current Item master. The three evidence families are NOT
 * independent acquisition routes. Never count repeated evidence as grants.
 */
import {ITEM_MASTER_LOCALES,type PublicCompleteItemMaster,type ItemMasterLocale,
  type NativeAcquisitionCandidate} from './public-item-master.ts';
import type {AdditionalItemSource} from './public-item-details.ts';
import {DB02_SOURCE_KINDS,DB02_SOURCE_ROLES,type Db01ItemSourceLink} from '../acquisition/db01-item-source-relations.ts';
import type {GameNativeItemCategory} from '../acquisition/game-native-item-categories.ts';

export interface AcquisitionSourceIdentity {
  readonly itemId:number;
  readonly nativeCategory:string;
  readonly sourceClass:string|null;
  readonly name:string|null;
  readonly iconGuid:string|null;
  readonly locale:ItemMasterLocale;
}
export interface ItemAcquisitionSourceDetails {
  readonly itemId:number;
  readonly sourceGameVersion:string;
  readonly indexedStatus:'current'|'pending_update';
  readonly nativeStatus:'indexed'|'not_indexed';
  readonly additionalStatus:'indexed'|'not_indexed';
  readonly effectiveCategories:readonly GameNativeItemCategory[];
  readonly indexed:readonly Readonly<{evidence:Db01ItemSourceLink;identity:AcquisitionSourceIdentity|null}>[];
  readonly additional:readonly Readonly<{evidence:AdditionalItemSource;identity:AcquisitionSourceIdentity|null}>[];
  readonly native:readonly Readonly<{evidence:NativeAcquisitionCandidate;identity:AcquisitionSourceIdentity|null}>[];
  readonly coverageComplete:false;
  readonly currentAvailabilityVerified:false;
}
const categoryForIndexed:Partial<Record<Db01ItemSourceLink['kind'],readonly string[]>>={
  quest:['Mission'],recipe:['ActivityData'],activity:['ActivityData'],loot_table:['LootTable'],stall:['Building']
};
const id=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const numeric=(v:string):number|null=>/^[1-9][0-9]*$/.test(v)&&id(Number(v))?Number(v):null;
function check(ok:unknown,code:string):asserts ok {if(!ok)throw new TypeError('DB01_SOURCE_DETAILS_'+code);}
export async function readItemAcquisitionSourceDetails(db:PublicCompleteItemMaster,ids:readonly number[],locale:ItemMasterLocale):
  Promise<readonly (Readonly<ItemAcquisitionSourceDetails>|null)[]>{
  check(Array.isArray(ids)&&ids.length<=10000&&ids.every(id),'IDS');
  check(ITEM_MASTER_LOCALES.includes(locale),'LOCALE');
  const catalog=new Set((await db.getFieldCatalog()).map(f=>f.field));
  const relation='acquisition.sourceRelations',additional='acquisition.additionalSources',effective='acquisition.effectiveCategories';
  const indexedStatus=db.release.acquisitionProjection?.sourceGameVersion===db.release.target.gameVersion&&catalog.has(relation)?'current':'pending_update';
  const nativeStatus=catalog.has('acquisition.nativeCandidates')?'indexed':'not_indexed';
  const additionalStatus=catalog.has(additional)?'indexed':'not_indexed';
  const fields=[...(indexedStatus==='current'?[relation]:[]),...(additionalStatus==='indexed'?[additional]:[]),...(catalog.has(effective)?[effective]:[])];
  const [rows,nativeRows]=await Promise.all([
    db.getItemFields(ids,fields.length?fields:['itemId']),
    nativeStatus==='indexed'?db.getNativeAcquisitionCandidates(ids):null
  ]);
  type Context={itemId:number;indexed:readonly Db01ItemSourceLink[];extras:readonly AdditionalItemSource[];
    native:readonly NativeAcquisitionCandidate[];categories:readonly GameNativeItemCategory[]};
  const contexts=rows.map((row,i):Context|null=>{
    if(!row)return null;
    const record=row.values[relation] as unknown as {itemId:string;links:readonly Db01ItemSourceLink[]}|undefined;
    check(!record||record.itemId===String(row.itemId)&&Array.isArray(record.links),'RELATION_JOIN');
    const indexed:readonly Db01ItemSourceLink[]=record?.links??[];
    check(indexed.every(l=>DB02_SOURCE_KINDS.includes(l.kind)&&DB02_SOURCE_ROLES.includes(l.role)&&typeof l.sourceId==='string'&&l.gameSourceOnly===true&&l.grantedVerified===false&&l.currentlyAvailableVerified===false),'RELATION');
    const extras=(row.values[additional]??[]) as unknown as readonly AdditionalItemSource[];
    check(Array.isArray(extras)&&extras.every(l=>l.currentAvailabilityVerified===false),'ADDITIONAL');
    const native=nativeRows?.[i]??[];
    const categories=(row.values[effective]??[]) as unknown as readonly GameNativeItemCategory[];
    check(Array.isArray(categories),'CATEGORIES');
    return {itemId:row.itemId,indexed,extras,native,categories};
  });
  const resolveIds=new Set<number>();
  for(const context of contexts){
    if(!context)continue;
    for(const e of context.indexed){const n=categoryForIndexed[e.kind]&&numeric(e.sourceId);if(n)resolveIds.add(n);}
    for(const e of context.extras)if(id(e.sourceId))resolveIds.add(e.sourceId);
    for(const e of context.native)resolveIds.add(e[0]);
  }
  const resolved=new Map<number,Readonly<AcquisitionSourceIdentity>>();
  const nameField='names.'+locale;
  const sourceIds=[...resolveIds].sort((a,b)=>a-b);
  // Bound each call even when a large caller batch has many source edges.
  for(let start=0;start<sourceIds.length;start+=10000){
    const items=await db.getItemFields(sourceIds.slice(start,start+10000),['nativeCategory','sourceClass',nameField,'iconGuid']);
    for(const row of items){
      if(!row)continue;
      const category=row.values.nativeCategory,cls=row.values.sourceClass,name=row.values[nameField],icon=row.values.iconGuid;
      check(typeof category==='string','IDENTITY');
      resolved.set(row.itemId,Object.freeze({itemId:row.itemId,nativeCategory:category,
        sourceClass:typeof cls==='string'?cls:null,name:typeof name==='string'&&name.length>0?name:null,
        iconGuid:typeof icon==='string'&&/^[a-f0-9]{32}$/.test(icon)?icon:null,locale}));
    }
  }
  const identity=(itemId:number|null,allowed?:readonly string[])=>{
    const r=itemId===null?undefined:resolved.get(itemId);
    return r&&(!allowed||allowed.includes(r.nativeCategory))?r:null;
  };
  return Object.freeze(contexts.map(c=>c?Object.freeze({
    itemId:c.itemId,sourceGameVersion:db.release.target.gameVersion,indexedStatus,nativeStatus,additionalStatus,
    effectiveCategories:Object.freeze([...c.categories]),
    indexed:Object.freeze(c.indexed.map(e=>Object.freeze({evidence:e,
      identity:categoryForIndexed[e.kind]?identity(numeric(e.sourceId),categoryForIndexed[e.kind]):null}))),
    additional:Object.freeze(c.extras.map(e=>Object.freeze({evidence:e,
      identity:e.kind==='character_friendship_reward'&&id(e.sourceId)?identity(e.sourceId,['Character']):
        e.kind==='pet_friendship_reward'&&id(e.sourceId)?identity(e.sourceId,['Companion']):null}))),
    native:Object.freeze(c.native.map(e=>Object.freeze({evidence:e,identity:identity(e[0])}))),
    coverageComplete:false as const,currentAvailabilityVerified:false as const
  }):null));
}
