/**
 * Collection's *only* eagerly filterable projection of the DB-01 master:
 * Item ID + source-backed browse tags. The source master remains authoritative
 * for names, icon GUIDs and details, joined by exact Item ID on inspection.
 *
 * Source Tag membership is not game Collection membership, world availability,
 * DLC ownership, or an acquired-item status. Do not promote it to those axes.
 */
import type {CollectionTopCategory} from './category-hierarchy.ts';
import type {ItemMasterUniverseStatus} from '../items/public-item-master.ts';
import {COLLECTION_UNIVERSE_TAG_BY_ID} from './universe-tag-names.ts';
export const COLLECTION_DB01_FACETS_SCHEMA='wand.collection.db01-native-facets@1' as const;
export const COLLECTION_DB01_ARCHIVE_SHA=
  '3c80a42139014211100eb556665636088af45d1d0b54ebd2933a4aeab2a405c6' as const;

export const COLLECTION_DB01_FACETS=[
  'color','furnitureStyle','clothingStyle','furnitureKind',
  'clothingSlot','disneyUniverse','worldContextTag','ingredientKind','mealKind',
] as const;
export type CollectionDb01Facet=typeof COLLECTION_DB01_FACETS[number];
export type CollectionDb01Pair=readonly [facet:CollectionDb01Facet,key:string];
export type CollectionDb01Row=readonly [itemId:number,tags:readonly CollectionDb01Pair[]];
export interface CollectionDb01ActivityType{
  readonly code:number;
  /** Steam v1.26.2's exact verified IL2CPP subtype, or null if unavailable. */
  readonly nativeName:string|null;
}
export interface CollectionDb01NativeSubtype{
  /** Native source IL2CPP ItemType enum, not an invented UI classification. */
  readonly nativeType:string;
  readonly code:number;
  readonly nativeName:string|null;
}
export function collectionNativeSubtypeKey(nativeType:string,code:number):string{
  return nativeType+':'+code;
}

// Native CollectionSubMenu definitions from the verified Steam v1.26.2
// IL2CPP enum, kept independent of user-facing progress/visibility evidence.
export const COLLECTION_DB01_SUBMENUS=Object.freeze([
  {code:6,family:'Memories',native:'Memories'},
  {code:7,family:'Characters',native:'Characters'},
  {code:10,family:'Crafting',native:'Crafting'},
  {code:15,family:'Companions',native:'Companions'},
  {code:20,family:'Adventure Companions',native:'Sidekicks'},
  {code:1,family:'Fish',native:'Fish'},
  {code:8,family:'Foraging',native:'Foraging'},
  {code:0,family:'Ingredients',native:'Crop'},
  {code:2,family:'Meals',native:'Meals'},
  {code:9,family:'Gems',native:'Minerals'},
  {code:4,family:'Clothing',native:'ClothingSets'},
  {code:3,family:'Furniture',native:'FurnitureSets'},
  {code:11,family:'Timebending',native:'TimeBending'},
  {code:12,family:'Board Game',native:'BoardGame'},
  {code:13,family:'Snippets',native:'Snippets'},
  {code:14,family:'Lorekeeper Tales',native:'Stories'},
  {code:18,family:'Quest Puzzles',native:'QuestPuzzles'},
  {code:17,family:'Photo Gallery',native:'PhotoGallery'},
  {code:16,family:'Mounts',native:'Mounts'},
  {code:19,family:'Exhibition',native:'Exhibition'},
] as const);
export type CollectionDb01SubmenuCode=typeof COLLECTION_DB01_SUBMENUS[number]['code'];
const nativeCodeSet=new Set<number>(COLLECTION_DB01_SUBMENUS.map(x=>x.code));

export interface CollectionDb01Index{
  readonly release:string;
  readonly sourceItemCount:number;
  readonly rootsByItem?:ReadonlyMap<number,CollectionTopCategory>;
  readonly itemsByRoot?:ReadonlyMap<CollectionTopCategory,readonly number[]>;
  readonly universeSourceStatusByItem?:ReadonlyMap<number,ItemMasterUniverseStatus>;
  readonly iconGuidByItem?:ReadonlyMap<number,string>;
  readonly taggedItems:number;
  readonly byItem:ReadonlyMap<number,readonly CollectionDb01Pair[]>;
  /** The original menu candidate index is separate from tag filtering. */
  readonly categoriesByItem:ReadonlyMap<number,readonly CollectionDb01SubmenuCode[]>;
  readonly itemsByCategory:ReadonlyMap<CollectionDb01SubmenuCode,readonly number[]>;
  readonly activityTypesByItem:ReadonlyMap<number,Readonly<CollectionDb01ActivityType>>;
  readonly itemsByActivityType:ReadonlyMap<number,readonly number[]>;
  readonly activityTypeNames:ReadonlyMap<number,string|null>;
  readonly nativeSubtypeByItem:ReadonlyMap<number,Readonly<CollectionDb01NativeSubtype>>;
  readonly itemsByNativeSubtype:ReadonlyMap<string,readonly number[]>;
  readonly nativeSubtypeNames:ReadonlyMap<string,string|null>;
  readonly universesByItem:ReadonlyMap<number,readonly string[]>;
  readonly itemsByUniverse:ReadonlyMap<string,readonly number[]>;
  readonly universeTagIdsByItem:ReadonlyMap<number,readonly number[]>;
  readonly itemsByUniverseTagId:ReadonlyMap<number,readonly number[]>;
}
export interface CollectionDb01Option {
  readonly key:string;
  readonly count:number;
}
export interface CollectionDb01Group {
  readonly facet:CollectionDb01Facet;
  readonly options:readonly CollectionDb01Option[];
}
const facetSet=new Set<string>(COLLECTION_DB01_FACETS);
function assert(ok:unknown,code:string):asserts ok{
  if(!ok)throw new Error('COLLECTION_DB01_FACETS_'+code);
}
function object(value:unknown):value is Record<string,unknown>{
  return value!==null&&typeof value==='object'&&!Array.isArray(value);
}
function validId(value:unknown):value is number{
  return typeof value==='number'&&Number.isSafeInteger(value)&&value>0;
}
function validTag(value:unknown):value is [CollectionDb01Facet,string]{
  return Array.isArray(value)&&value.length===2&&
    typeof value[0]==='string'&&facetSet.has(value[0])&&
    typeof value[1]==='string'&&value[1].length>0&&value[1].length<=128;
}
export function parseCollectionDb01Facets(payload:unknown):CollectionDb01Index{
  assert(object(payload)&&
    payload.schema===COLLECTION_DB01_FACETS_SCHEMA&&
    payload.release==='steam-1.26.2-item-id-master-v1'&&
    payload.sourceArchiveSha256===COLLECTION_DB01_ARCHIVE_SHA&&
    payload.sourceItemCount===13202&&
    Array.isArray(payload.items)&&
    Number.isInteger(payload.taggedItems)&&
    payload.taggedItems===payload.items.length&&
    payload.taggedItems<=payload.sourceItemCount,'INVALID_MANIFEST');
  // A missing category projection is accepted for synthetic and legacy tag
  // tests but the shipped public index must carry it for visible categories.
  const categoriesByItem=new Map<number,readonly CollectionDb01SubmenuCode[]>();
  const itemsByCategory=new Map<CollectionDb01SubmenuCode,number[]>();
  if(payload.categoryItems!==undefined){
    assert(payload.categoryEvidence===
      'original_collectionset_source_candidate_or_verified_native_item_type'&&
      payload.gameRuntimeMembershipVerified===false&&
      Array.isArray(payload.categoryItems)&&
      payload.categoryItemCount===payload.categoryItems.length&&
      payload.categoryItemCount<=13202,'CATEGORY_MANIFEST');
    let last=0;
    for(const value of payload.categoryItems){
      assert(Array.isArray(value)&&value.length===2&&validId(value[0])&&
        value[0]>last&&Array.isArray(value[1])&&
        value[1].length>0&&value[1].every((code:unknown)=>
          Number.isInteger(code)&&nativeCodeSet.has(code as number))&&
        new Set(value[1]).size===value[1].length,
        'CATEGORY_ITEM');
      last=value[0] as number;
      const codes=Object.freeze([...(value[1] as CollectionDb01SubmenuCode[])]);
      categoriesByItem.set(last,codes);
      for(const code of codes){
        const list=itemsByCategory.get(code)??[];
        list.push(last);
        itemsByCategory.set(code,list);
      }
    }
  }
  // A semantic ItemType/subtype is not the same as the game's Collection
  // menu. Keep it as an independent Item ID browse index.
  const activityTypesByItem=new Map<number,Readonly<CollectionDb01ActivityType>>();
  const itemsByActivityType=new Map<number,number[]>();
  const activityTypeNames=new Map<number,string|null>();
  if(payload.activityTypeItems!==undefined){
    assert(payload.activityTypeEvidence==='original_il2cpp_activity_item_type'&&
      payload.activityTypeGameUiMembershipVerified===false&&
      Array.isArray(payload.activityTypeItems)&&
      payload.activityTypeItemCount===payload.activityTypeItems.length&&
      payload.activityTypeItemCount===4050,'ACTIVITY_TYPE_MANIFEST');
    let previous=0;
    for(const raw of payload.activityTypeItems){
      assert(Array.isArray(raw)&&raw.length===3&&validId(raw[0])&&
        raw[0]>previous&&raw[0]>=30000000&&raw[0]<40000000&&
        Number.isInteger(raw[1])&&raw[1]>=0&&raw[1]<=99&&
        Math.floor((raw[0]%10000000)/100000)===raw[1]&&
        (raw[2]===null||(typeof raw[2]==='string'&&
          raw[2].length>0&&raw[2].length<=128)),
        'ACTIVITY_TYPE_ITEM');
      const [itemId,code,nativeName]=raw as [number,number,string|null];
      previous=itemId;
      if(activityTypeNames.has(code)){
        const known=activityTypeNames.get(code);
        assert(known===nativeName,'ACTIVITY_TYPE_NAME_CONFLICT');
      }else activityTypeNames.set(code,nativeName);
      activityTypesByItem.set(itemId,Object.freeze({code,nativeName}));
      const ids=itemsByActivityType.get(code)??[];
      ids.push(itemId);
      itemsByActivityType.set(code,ids);
    }
  }
  // These records partition the *complete* public 13,202 Item ID set.
  // Empty placeholder categories cannot be presented as collection cards.
  const nativeSubtypeByItem=new Map<number,Readonly<CollectionDb01NativeSubtype>>();
  const itemsByNativeSubtype=new Map<string,number[]>();
  const nativeSubtypeNames=new Map<string,string|null>();
  if(payload.nativeSubtypeItems!==undefined){
    assert(payload.nativeSubtypeEvidence==='original_il2cpp_item_type_and_subtype'&&
      payload.nativeSubtypeGameUiMembershipVerified===false&&
      payload.nativeSubtypeItemCount===13202&&
      Array.isArray(payload.nativeSubtypeItems)&&
      payload.nativeSubtypeItems.length===13202,'NATIVE_SUBTYPE_MANIFEST');
    let last=0;
    for(const row of payload.nativeSubtypeItems){
      assert(Array.isArray(row)&&row.length===4&&validId(row[0])&&row[0]>last&&
        typeof row[1]==='string'&&/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(row[1])&&
        Number.isInteger(row[2])&&row[2]>=0&&row[2]<=99&&
        Math.floor((row[0]%10000000)/100000)===row[2]&&
        (row[3]===null||(typeof row[3]==='string'&&
          /^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(row[3]))),
        'NATIVE_SUBTYPE_ITEM');
      const [id,nativeType,code,nativeName]=row as [number,string,number,string|null];
      last=id;
      const key=collectionNativeSubtypeKey(nativeType,code);
      if(nativeSubtypeNames.has(key))assert(nativeSubtypeNames.get(key)===nativeName,
        'NATIVE_SUBTYPE_NAME_CONFLICT');
      else nativeSubtypeNames.set(key,nativeName);
      nativeSubtypeByItem.set(id,Object.freeze({nativeType,code,nativeName}));
      const ids=itemsByNativeSubtype.get(key)??[];
      ids.push(id);itemsByNativeSubtype.set(key,ids);
    }
    assert(nativeSubtypeByItem.size===payload.sourceItemCount,
      'NATIVE_SUBTYPE_COVERAGE');
  }
  const universesByItem=new Map<number,readonly string[]>();
  const itemsByUniverse=new Map<string,number[]>();
  if(payload.universeSourceItems!==undefined){
    assert(payload.universeSourceEvidence==='original_tag_or_collection_predicate_tag'&&
      payload.universeSourceGameUiMembershipVerified===false&&
      Array.isArray(payload.universeSourceItems)&&
      payload.universeSourceItemCount===payload.universeSourceItems.length&&
      payload.universeSourceItemCount<=13202,'UNIVERSE_MANIFEST');
    let last=0;
    for(const value of payload.universeSourceItems){
      assert(Array.isArray(value)&&value.length===2&&validId(value[0])&&
        value[0]>last&&Array.isArray(value[1])&&value[1].length>0&&
        value[1].every((key:unknown)=>typeof key==='string'&&
          /^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(key))&&
        new Set(value[1]).size===value[1].length,'UNIVERSE_ITEM');
      last=value[0] as number;
      const keys=Object.freeze([...(value[1] as string[])]);
      universesByItem.set(last,keys);
      for(const key of keys){
        const ids=itemsByUniverse.get(key)??[];
        ids.push(last);
        itemsByUniverse.set(key,ids);
      }
    }
  }
  // The original universe Tag ID is the canonical browse key. A universe
  // with no matching published Item IDs is retained by the UI taxonomy.
  const universeTagIdsByItem=new Map<number,readonly number[]>();
  const itemsByUniverseTagId=new Map<number,number[]>();
  if(payload.universeSourceTagItems!==undefined){
    assert(payload.universeSourceTagEvidence===
      'original_tag_id_or_collection_predicate_tag_id'&&
      payload.universeSourceTagGameUiMembershipVerified===false&&
      Array.isArray(payload.universeSourceTagItems)&&
      payload.universeSourceTagCount===payload.universeSourceTagItems.length&&
      payload.universeSourceTagCount<=13202,'UNIVERSE_TAG_MANIFEST');
    let last=0;
    for(const raw of payload.universeSourceTagItems){
      assert(Array.isArray(raw)&&raw.length===2&&validId(raw[0])&&
        raw[0]>last&&Array.isArray(raw[1])&&raw[1].length>0&&
        raw[1].every((id:unknown)=>typeof id==='number'&&
          Number.isSafeInteger(id)&&COLLECTION_UNIVERSE_TAG_BY_ID.has(id))&&
        new Set(raw[1]).size===raw[1].length,'UNIVERSE_TAG_ITEM');
      const [itemId,tags]=raw as [number,number[]];
      last=itemId;
      universeTagIdsByItem.set(itemId,Object.freeze([...tags]));
      for(const id of tags){
        const list=itemsByUniverseTagId.get(id)??[];
        list.push(itemId);
        itemsByUniverseTagId.set(id,list);
      }
    }
  }
  const byItem=new Map<number,readonly CollectionDb01Pair[]>();
  let prev=0;
  for(const entry of payload.items){
    assert(Array.isArray(entry)&&entry.length===2&&validId(entry[0])&&
      entry[0]>prev&&Array.isArray(entry[1])&&
      entry[1].length>0&&entry[1].every(validTag),'INVALID_ROW');
    const id=entry[0] as number;
    prev=id;
    byItem.set(id,(entry[1] as CollectionDb01Pair[]).map(tag=>
      Object.freeze([tag[0],tag[1]] as const)));
  }
  return Object.freeze({
    release:'steam-1.26.2-item-id-master-v1' as const,
    sourceItemCount:13202 as const,
    taggedItems:byItem.size,
    byItem,
    categoriesByItem,
    itemsByCategory,
    activityTypesByItem,
    itemsByActivityType,
    activityTypeNames,
    nativeSubtypeByItem,
    itemsByNativeSubtype,
    nativeSubtypeNames,
    universesByItem,
    itemsByUniverse,
    universeTagIdsByItem,
    itemsByUniverseTagId
  });
}
export async function loadCollectionDb01Facets(
  basePath:string='',fetcher:typeof fetch=fetch,
):Promise<CollectionDb01Index>{
  assert(/^\/?(?:[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)?$/.test(basePath),'INVALID_BASE');
  const root=(basePath?'/'+basePath.replace(/^\/+|\/+$/g,''):'');
  const response=await fetcher(root+'/ddv/collection/db01-facets-1262.json',
    {credentials:'same-origin',redirect:'error'});
  assert(response.ok&&!response.redirected,'UNAVAILABLE');
  const payload:unknown=await response.json();
  return parseCollectionDb01Facets(payload);
}
/** Options are computed only from Items actually in the selected Collection
 * category. A DB-01 Tag can never add a missing Item to the Collection. */
export function collectionDb01Groups(
  index:CollectionDb01Index,categoryItemIds:readonly number[]
):readonly CollectionDb01Group[]{
  const counters=new Map<CollectionDb01Facet,Map<string,number>>();
  const visitedIds=new Set<number>();
  for(const id of categoryItemIds){
    if(visitedIds.has(id))continue;
    visitedIds.add(id);
    const tags=index.byItem.get(id);
    if(!tags)continue;
    const seen=new Set<string>();
    for(const [facet,key] of tags){
      const identity=facet+':'+key;
      if(seen.has(identity))continue;
      seen.add(identity);
      let m=counters.get(facet);
      if(!m){m=new Map();counters.set(facet,m);}
      m.set(key,(m.get(key)??0)+1);
    }
  }
  return COLLECTION_DB01_FACETS.flatMap(facet=>{
    const m=counters.get(facet);
    if(!m?.size)return [];
    const options=[...m.entries()].map(([key,count])=>({key,count}))
      .sort((a,b)=>b.count-a.count||a.key.localeCompare(b.key,'en'));
    return [{facet,options}];
  });
}
export function collectionDb01InCategory(
  index:CollectionDb01Index,itemId:number,code:CollectionDb01SubmenuCode
):boolean{
  return index.categoriesByItem.get(itemId)?.includes(code)??false;
}
export function collectionDb01Matches(
  index:CollectionDb01Index,itemId:number,facet:CollectionDb01Facet,key:string
):boolean{
  return index.byItem.get(itemId)?.some(
    ([sourceFacet,sourceKey])=>sourceFacet===facet&&sourceKey===key
  )??false;
}

const headings:Record<string,Partial<Record<CollectionDb01Facet,string>>>={
  ja:{color:'色',furnitureStyle:'家具のスタイル',clothingStyle:'衣装のスタイル',
    furnitureKind:'家具の種類',clothingSlot:'衣装の種類',disneyUniverse:'ユニバース',worldContextTag:'ワールドの原本タグ',
    ingredientKind:'食材の種類',mealKind:'料理の種類'},
  en:{color:'Color',furnitureStyle:'Furniture style',clothingStyle:'Clothing style',
    furnitureKind:'Furniture type',clothingSlot:'Clothing type',disneyUniverse:'Universe',worldContextTag:'World source tag',
    ingredientKind:'Ingredient type',mealKind:'Meal type'},
  fr:{color:'Couleur',furnitureStyle:'Style de meubles',clothingStyle:'Style de vêtements',
    furnitureKind:'Type de meubles',clothingSlot:'Type de vêtement',disneyUniverse:'Univers',worldContextTag:'Tag du monde',
    ingredientKind:"Type d'ingrédient",mealKind:'Type de plat'},
  it:{color:'Colore',furnitureStyle:'Stile mobili',clothingStyle:'Stile abiti',
    furnitureKind:'Tipo di mobili',clothingSlot:'Tipo di abiti',disneyUniverse:'Universo',worldContextTag:'Tag del mondo',
    ingredientKind:'Tipo ingrediente',mealKind:'Tipo di piatto'},
  de:{color:'Farbe',furnitureStyle:'Möbelstil',clothingStyle:'Kleidungsstil',
    furnitureKind:'Möbelart',clothingSlot:'Kleidungstyp',disneyUniverse:'Universum',worldContextTag:'Weltquelltag',
    ingredientKind:'Zutatenart',mealKind:'Gerichtart'},
  'es-ES':{color:'Color',furnitureStyle:'Estilo de muebles',clothingStyle:'Estilo de ropa',
    furnitureKind:'Tipo de mueble',clothingSlot:'Tipo de ropa',disneyUniverse:'Universo',worldContextTag:'Etiqueta de mundo',
    ingredientKind:'Tipo de ingrediente',mealKind:'Tipo de plato'},
  'zh-CN':{color:'颜色',furnitureStyle:'家具风格',clothingStyle:'服装风格',
    furnitureKind:'家具类型',clothingSlot:'服装类型',disneyUniverse:'作品系列',worldContextTag:'世界原始标签',
    ingredientKind:'食材类型',mealKind:'餐点类型'},
  'pt-BR':{color:'Cor',furnitureStyle:'Estilo de móveis',clothingStyle:'Estilo de roupas',
    furnitureKind:'Tipo de móvel',clothingSlot:'Tipo de roupa',disneyUniverse:'Universo',worldContextTag:'Tag de mundo',
    ingredientKind:'Tipo de ingrediente',mealKind:'Tipo de refeição'}
};
export function collectionDb01FacetLabel(locale:string,facet:CollectionDb01Facet):string{
  return (headings[locale]??headings.en)[facet]??facet;
}
const colorNames:Record<string,Record<string,string>>={
  ja:{White:'白',Black:'黒',Red:'赤',Blue:'青',Green:'緑',
    Pink:'ピンク',Purple:'紫',Brown:'茶',Orange:'オレンジ',
    Yellow:'黄',Gray:'グレー',Grey:'グレー'},
  en:{}
};
export function collectionDb01TagLabel(locale:string,key:string):string{
  const native=key.replace(/^(?:F_|C_)/,'').replace(/([a-z])([A-Z])/g,'$1 $2');
  return colorNames[locale]?.[native]??native;
}
export const COLLECTION_DB01_COLOR_SWATCHES:Readonly<Record<string,string>>=Object.freeze({
  White:'#eeeef7',Black:'#343434',Red:'#d9454c',Blue:'#4b98e2',
  Green:'#52cc7b',Pink:'#d982b1',Purple:'#8b60d4',Brown:'#83512f',
  Orange:'#f48c55',Yellow:'#e5c83e',Gray:'#898b92',Grey:'#898b92'
});
