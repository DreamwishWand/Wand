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
export interface OrdinaryQuestIntroEvidence {
  readonly questId:number;
  readonly flowIndex:number;
  readonly sourcePath:string;
  readonly configuredAmount:number;
  readonly nativeQuestGroupId:number;
  readonly nativeQuestGroup:'Village'|'Story'|'Realm';
  readonly sourceGameVersion:string;
  readonly sourceMissionSha256:string;
  readonly guaranteedGrantVerified:false;
  readonly currentAvailabilityVerified:false;
}
export interface OrdinaryProductionEvidence {
  readonly sourceItemId:number;
  readonly kind:'ordinary_seed_production'|'ordinary_bee_house_production';
  readonly sourcePath:string;
  readonly configuredQuantity:number;
  readonly quantityKind:'configured_yield'|'maximum_produced';
  readonly sourceGameVersion:string;
  readonly sourceFileSha256:string;
  readonly ordinarySourceIndependentlyClassified:true;
  readonly currentAvailabilityVerified:false;
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
  /** Explicit classification extensions; not independent extra grants. */
  readonly ordinaryQuestIntroStatus:'indexed'|'not_indexed';
  readonly ordinaryProductionStatus:'indexed'|'not_indexed';
  readonly ordinaryQuestIntro:readonly Readonly<{evidence:OrdinaryQuestIntroEvidence;identity:AcquisitionSourceIdentity|null}>[];
  readonly ordinaryProduction:readonly Readonly<{evidence:OrdinaryProductionEvidence;identity:AcquisitionSourceIdentity|null}>[];
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
  const introField='acquisition.ordinaryQuestIntroSources',productionField='acquisition.ordinaryProductionSources';
  const ordinaryQuestIntroStatus=catalog.has(introField)?'indexed':'not_indexed';
  const ordinaryProductionStatus=catalog.has(productionField)?'indexed':'not_indexed';
  const fields=[...(indexedStatus==='current'?[relation]:[]),...(additionalStatus==='indexed'?[additional]:[]),
    ...(catalog.has(effective)?[effective]:[]),...(ordinaryQuestIntroStatus==='indexed'?[introField]:[]),
    ...(ordinaryProductionStatus==='indexed'?[productionField]:[])];
  const [rows,nativeRows]=await Promise.all([
    db.getItemFields(ids,fields.length?fields:['itemId']),
    nativeStatus==='indexed'?db.getNativeAcquisitionCandidates(ids):null
  ]);
  type Context={itemId:number;indexed:readonly Db01ItemSourceLink[];extras:readonly AdditionalItemSource[];
    native:readonly NativeAcquisitionCandidate[];categories:readonly GameNativeItemCategory[];
    intro:readonly OrdinaryQuestIntroEvidence[];production:readonly OrdinaryProductionEvidence[]};
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
    const intro=(row.values[introField]??[]) as unknown as readonly OrdinaryQuestIntroEvidence[];
    const production=(row.values[productionField]??[]) as unknown as readonly OrdinaryProductionEvidence[];
    check(Array.isArray(intro)&&intro.every(e=>id(e.questId)&&id(e.nativeQuestGroupId)&&id(e.configuredAmount)&&
      Number.isSafeInteger(e.flowIndex)&&e.flowIndex>=0&&['Village','Story','Realm'].includes(e.nativeQuestGroup)&&
      /^source\.ItemsToGive\[\d+\]\.ItemToGive\.ItemToGive\.Item\.(?:Item|ItemIngredient)\.Item$/.test(e.sourcePath)&&
      e.sourceGameVersion===db.release.target.gameVersion&&e.sourceMissionSha256===db.release.sourceFilesSha256?.Mission&&
      e.guaranteedGrantVerified===false&&e.currentAvailabilityVerified===false),'QUEST_INTRO');
    check(Array.isArray(production)&&production.every(e=>id(e.sourceItemId)&&id(e.configuredQuantity)&&
      e.sourceGameVersion===db.release.target.gameVersion&&e.ordinarySourceIndependentlyClassified===true&&
      e.currentAvailabilityVerified===false&&(
        e.kind==='ordinary_seed_production'&&e.sourcePath==='source.ProducedItemID'&&e.quantityKind==='configured_yield'&&
          e.sourceFileSha256===db.release.sourceFilesSha256?.ActivityItem||
        e.kind==='ordinary_bee_house_production'&&e.sourcePath==='source.BeeHouse.ProducedItemID'&&e.quantityKind==='maximum_produced'&&
          e.sourceFileSha256===db.release.sourceFilesSha256?.Furniture)),'PRODUCTION');
    check(!(intro.length||production.length)||categories.includes('ordinary_gameplay'),'CLASSIFICATION_JOIN');
    return {itemId:row.itemId,indexed,extras,native,categories,intro,production};
  });
  const resolveIds=new Set<number>();
  for(const context of contexts){
    if(!context)continue;
    for(const e of context.indexed){const n=categoryForIndexed[e.kind]&&numeric(e.sourceId);if(n)resolveIds.add(n);}
    for(const e of context.extras)if(id(e.sourceId))resolveIds.add(e.sourceId);
    for(const e of context.native)resolveIds.add(e[0]);
    for(const e of context.intro)resolveIds.add(e.questId);
    for(const e of context.production)resolveIds.add(e.sourceItemId);
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
        e.kind==='pet_friendship_reward'&&id(e.sourceId)?identity(e.sourceId,['Companion']):
        e.kind==='configured_container_furniture_slot'&&id(e.sourceId)?identity(e.sourceId,['Furniture']):null}))),
    native:Object.freeze(c.native.map(e=>Object.freeze({evidence:e,identity:identity(e[0])}))),
    ordinaryQuestIntroStatus,ordinaryProductionStatus,
    ordinaryQuestIntro:Object.freeze(c.intro.map(e=>Object.freeze({evidence:e,identity:identity(e.questId,['Mission'])}))),
    ordinaryProduction:Object.freeze(c.production.map(e=>Object.freeze({evidence:e,
      identity:identity(e.sourceItemId,e.kind==='ordinary_seed_production'?['ActivityItem']:['Furniture'])}))),
    coverageComplete:false as const,currentAvailabilityVerified:false as const
  }):null));
}
