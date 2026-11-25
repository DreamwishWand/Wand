/** Service-neutral localized taxonomy from a pinned current Item master.
 * Exact original tag occurrences are distinct from source sets and reviewed
 * browse-only universe associations. No inferred ownership or placement.
 */
import {ITEM_MASTER_LOCALES,type PublicCompleteItemMaster,type ItemMasterLocale,type ItemFieldValue,
  type ItemMasterUniverseStatus,type ItemMasterTag} from './public-item-master.ts';

type Obj=Readonly<Record<string,ItemFieldValue>>;
const obj=(v:unknown):v is Obj=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
function check(v:unknown,why:string):asserts v{if(!v)throw new TypeError('DB01_TAXONOMY_'+why);}
function ids(v:unknown):readonly number[]{check(Array.isArray(v)&&v.every(id),'TAG_IDS');return Object.freeze([...v] as number[]);}
export interface ItemTaxonomyIdentity {
  readonly itemId:number;
  readonly name:string|null;
  readonly iconGuid:string|null;
  readonly nativeCategory:string;
  readonly locale:ItemMasterLocale;
}
export interface LocalizedItemTag extends ItemMasterTag {
  readonly identity:Readonly<ItemTaxonomyIdentity>|null;
}
export interface ItemTaxonomyDetails {
  readonly itemId:number;
  readonly sourceGameVersion:string;
  readonly locale:ItemMasterLocale;
  readonly nativeCategory:string;
  readonly nativeSubtypeCode:number;
  readonly nativeSubtypeName:string|null;
  readonly tags:readonly Readonly<LocalizedItemTag>[];
  readonly universeStatus:ItemMasterUniverseStatus;
  readonly originalUniverseIds:readonly number[];
  readonly directUniverseIds:readonly number[];
  readonly setUniverseIds:readonly number[];
  readonly predicateUniverseIds:readonly number[];
  readonly originalUniverses:readonly (Readonly<ItemTaxonomyIdentity>|null)[];
  readonly browseUniverseIds:readonly number[];
  readonly browseUniverses:readonly (Readonly<ItemTaxonomyIdentity>|null)[];
  readonly browseAssociation:ItemFieldValue|null;
  readonly worldIds:readonly number[];
  readonly worlds:readonly (Readonly<ItemTaxonomyIdentity>|null)[];
  readonly sourceSetItemId:number|null;
  readonly sourceSet:Readonly<ItemTaxonomyIdentity>|null;
  readonly worldMembershipVerified:false;
  readonly placementLegalityVerified:false;
}
const fields=['nativeCategory','itemType.subtypeCode','itemType.subtypeName','tags','universeSourceStatus',
  'universeTagIds','universeDirectTagIds','universeSetTagIds','universePredicateTagIds',
  'browse.universeTagIds','browse.universeAssociation','worldTagIds','sourceSetItemId'] as const;
export async function readItemTaxonomyDetails(db:PublicCompleteItemMaster,itemIds:readonly number[],locale:ItemMasterLocale):
  Promise<readonly (Readonly<ItemTaxonomyDetails>|null)[]>{
  check(Array.isArray(itemIds)&&itemIds.length<=10000&&itemIds.every(id),'IDS');
  check(ITEM_MASTER_LOCALES.includes(locale),'LOCALE');
  const catalog=new Set((await db.getFieldCatalog()).map(f=>f.field));
  check(fields.filter(f=>!f.startsWith('browse.')).every(f=>catalog.has(f)),'NOT_INDEXED');
  const rows=await db.getItemFields(itemIds,fields.filter(f=>catalog.has(f)));
  const related=new Set<number>();
  const contexts=rows.map(row=>{
    if(!row)return null;
    const v=row.values,category=v.nativeCategory,subtype=v['itemType.subtypeCode'],subtypeName=v['itemType.subtypeName'];
    check(typeof category==='string'&&typeof subtype==='number'&&Number.isSafeInteger(subtype)&&subtype>=0&&
      (subtypeName===null||typeof subtypeName==='string'),'TYPE');
    const universeStatus=v.universeSourceStatus;
    check(universeStatus==='source_linked'||universeStatus==='unresolved_source'||universeStatus==='no_universe_in_verified_tag_fields','UNIVERSE_STATUS');
    const originalUniverseIds=ids(v.universeTagIds),directUniverseIds=ids(v.universeDirectTagIds),
      setUniverseIds=ids(v.universeSetTagIds),predicateUniverseIds=ids(v.universePredicateTagIds),worldIds=ids(v.worldTagIds);
    const association=v['browse.universeAssociation']??null;
    const browseUniverseIds=v['browse.universeTagIds']===undefined?originalUniverseIds:ids(v['browse.universeTagIds']);
    const sourceSetItemId=v.sourceSetItemId;
    check(sourceSetItemId===null||id(sourceSetItemId),'SOURCE_SET');
    const raw=v.tags;
    check(Array.isArray(raw),'TAGS');
    const tags:ItemMasterTag[]=raw.map(t=>{
      check(obj(t)&&id(t.id)&&typeof t.key==='string'&&typeof t.facet==='string'&&id(t.sourceField),'TAG');
      related.add(t.id);
      return {id:t.id,key:t.key,facet:t.facet,sourceField:t.sourceField};
    });
    for(const value of [...originalUniverseIds,...directUniverseIds,...setUniverseIds,...predicateUniverseIds,...browseUniverseIds,...worldIds])related.add(value);
    if(sourceSetItemId!==null)related.add(sourceSetItemId);
    return {itemId:row.itemId,category,subtype,subtypeName,universeStatus:universeStatus as ItemMasterUniverseStatus,tags,originalUniverseIds,directUniverseIds,
      setUniverseIds,predicateUniverseIds,browseUniverseIds,association,worldIds,sourceSetItemId};
  });
  const identityMap=new Map<number,Readonly<ItemTaxonomyIdentity>>();
  const nameField='names.'+locale,referenceIds=[...related].sort((a,b)=>a-b);
  for(let i=0;i<referenceIds.length;i+=10000){
    for(const row of await db.getItemFields(referenceIds.slice(i,i+10000),['nativeCategory',nameField,'iconGuid'])){
      if(!row)continue;
      const category=row.values.nativeCategory,name=row.values[nameField],icon=row.values.iconGuid;
      check(typeof category==='string','IDENTITY_CATEGORY');
      identityMap.set(row.itemId,Object.freeze({itemId:row.itemId,nativeCategory:category,locale,
        name:typeof name==='string'&&name.length?name:null,
        iconGuid:typeof icon==='string'&&/^[a-f0-9]{32}$/.test(icon)?icon:null}));
    }
  }
  const identity=(id:number|null,category:string)=>{
    const r=id===null?undefined:identityMap.get(id);
    return r?.nativeCategory===category?r:null;
  };
  const labels=(ids:readonly number[])=>Object.freeze(ids.map(id=>identity(id,'Tag')));
  return Object.freeze(contexts.map((c):Readonly<ItemTaxonomyDetails>|null=>c===null?null:Object.freeze({
    itemId:c.itemId,sourceGameVersion:db.release.target.gameVersion,locale,nativeCategory:c.category,
    nativeSubtypeCode:c.subtype,nativeSubtypeName:c.subtypeName,
    tags:Object.freeze(c.tags.map(t=>Object.freeze({...t,identity:identity(t.id,'Tag')}))),
    universeStatus:c.universeStatus,originalUniverseIds:c.originalUniverseIds,
    directUniverseIds:c.directUniverseIds,setUniverseIds:c.setUniverseIds,predicateUniverseIds:c.predicateUniverseIds,
    originalUniverses:labels(c.originalUniverseIds),browseUniverseIds:c.browseUniverseIds,browseUniverses:labels(c.browseUniverseIds),
    browseAssociation:c.association,worldIds:c.worldIds,worlds:labels(c.worldIds),sourceSetItemId:c.sourceSetItemId,
    sourceSet:identity(c.sourceSetItemId,'Set'),worldMembershipVerified:false as const,placementLegalityVerified:false as const
  })));
}
