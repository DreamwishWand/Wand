/**
 * Collection's *only* eagerly filterable projection of the DB-01 master:
 * Item ID + source-backed browse tags. The source master remains authoritative
 * for names, icon GUIDs and details, joined by exact Item ID on inspection.
 *
 * Source Tag membership is not game Collection membership, world availability,
 * DLC ownership, or an acquired-item status. Do not promote it to those axes.
 */
export const COLLECTION_DB01_FACETS_SCHEMA='wand.collection.db01-native-facets@1' as const;
export const COLLECTION_DB01_ARCHIVE_SHA=
  '3c80a42139014211100eb556665636088af45d1d0b54ebd2933a4aeab2a405c6' as const;

export const COLLECTION_DB01_FACETS=[
  'color','furnitureStyle','clothingStyle','furnitureKind',
  'clothingSlot','disneyUniverse','ingredientKind','mealKind',
] as const;
export type CollectionDb01Facet=typeof COLLECTION_DB01_FACETS[number];
export type CollectionDb01Pair=readonly [facet:CollectionDb01Facet,key:string];
export type CollectionDb01Row=readonly [itemId:number,tags:readonly CollectionDb01Pair[]];

// Native CollectionSubMenu definitions from the verified Steam v1.26.2
// IL2CPP enum, kept independent of user-facing progress/visibility evidence.
export const COLLECTION_DB01_SUBMENUS=Object.freeze([
  {code:0,family:'Ingredients',native:'Crop'},
  {code:1,family:'Fish',native:'Fish'},
  {code:2,family:'Meals',native:'Meals'},
  {code:3,family:'Furniture',native:'FurnitureSets'},
  {code:4,family:'Clothing',native:'ClothingSets'},
  {code:6,family:'Memories',native:'Memories'},
  {code:7,family:'Characters',native:'Characters'},
  {code:8,family:'Foraging',native:'Foraging'},
  {code:9,family:'Gems',native:'Minerals'},
  {code:10,family:'Crafting',native:'Crafting'},
  {code:11,family:'Timebending',native:'TimeBending'},
  {code:12,family:'Board Game',native:'BoardGame'},
  {code:13,family:'Snippets',native:'Snippets'},
  {code:14,family:'Lorekeeper Tales',native:'Stories'},
  {code:15,family:'Companions',native:'Companions'},
  {code:16,family:'Mounts',native:'Mounts'},
  {code:17,family:'Photo Gallery',native:'PhotoGallery'},
  {code:18,family:'Quest Puzzles',native:'QuestPuzzles'},
  {code:19,family:'Exhibition',native:'Exhibition'},
  {code:20,family:'Adventure Companions',native:'Sidekicks'},
] as const);
export type CollectionDb01SubmenuCode=typeof COLLECTION_DB01_SUBMENUS[number]['code'];
const nativeCodeSet=new Set<number>(COLLECTION_DB01_SUBMENUS.map(x=>x.code));

export interface CollectionDb01Index{
  readonly release:'steam-1.26.2-item-id-master-v1';
  readonly sourceItemCount:13202;
  readonly taggedItems:number;
  readonly byItem:ReadonlyMap<number,readonly CollectionDb01Pair[]>;
  /** The original menu candidate index is separate from tag filtering. */
  readonly categoriesByItem:ReadonlyMap<number,readonly CollectionDb01SubmenuCode[]>;
  readonly itemsByCategory:ReadonlyMap<CollectionDb01SubmenuCode,readonly number[]>;
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
    itemsByCategory
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
    furnitureKind:'家具の種類',clothingSlot:'衣装の種類',disneyUniverse:'ユニバース',
    ingredientKind:'食材の種類',mealKind:'料理の種類'},
  en:{color:'Color',furnitureStyle:'Furniture style',clothingStyle:'Clothing style',
    furnitureKind:'Furniture type',clothingSlot:'Clothing type',disneyUniverse:'Universe',
    ingredientKind:'Ingredient type',mealKind:'Meal type'},
  fr:{color:'Couleur',furnitureStyle:'Style de meubles',clothingStyle:'Style de vêtements',
    furnitureKind:'Type de meubles',clothingSlot:'Type de vêtement',disneyUniverse:'Univers',
    ingredientKind:"Type d'ingrédient",mealKind:'Type de plat'},
  it:{color:'Colore',furnitureStyle:'Stile mobili',clothingStyle:'Stile abiti',
    furnitureKind:'Tipo di mobili',clothingSlot:'Tipo di abiti',disneyUniverse:'Universo',
    ingredientKind:'Tipo ingrediente',mealKind:'Tipo di piatto'},
  de:{color:'Farbe',furnitureStyle:'Möbelstil',clothingStyle:'Kleidungsstil',
    furnitureKind:'Möbelart',clothingSlot:'Kleidungstyp',disneyUniverse:'Universum',
    ingredientKind:'Zutatenart',mealKind:'Gerichtart'},
  'es-ES':{color:'Color',furnitureStyle:'Estilo de muebles',clothingStyle:'Estilo de ropa',
    furnitureKind:'Tipo de mueble',clothingSlot:'Tipo de ropa',disneyUniverse:'Universo',
    ingredientKind:'Tipo de ingrediente',mealKind:'Tipo de plato'},
  'zh-CN':{color:'颜色',furnitureStyle:'家具风格',clothingStyle:'服装风格',
    furnitureKind:'家具类型',clothingSlot:'服装类型',disneyUniverse:'作品系列',
    ingredientKind:'食材类型',mealKind:'餐点类型'},
  'pt-BR':{color:'Cor',furnitureStyle:'Estilo de móveis',clothingStyle:'Estilo de roupas',
    furnitureKind:'Tipo de móvel',clothingSlot:'Tipo de roupa',disneyUniverse:'Universo',
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
