import {openCurrentItemDatabase,ITEM_MASTER_LOCALES,type CompleteItemMasterFacets,type ItemMasterUniverseStatus,type PublicCompleteItemMaster} from '../items/public-item-master.ts';
import {collectionSourceRoot,type CollectionTopCategory} from './category-hierarchy.ts';
import {COLLECTION_DB01_FACETS,COLLECTION_DB01_SUBMENUS,type CollectionDb01Index,type CollectionDb01Pair,type CollectionDb01SubmenuCode,type CollectionDb01NativeSubtype,type CollectionDb01ActivityType} from './db01-native-facets.ts';

export interface CollectionCatalogRow {
  id:string;names:Record<string,string>;nameStatus:'verified'|'unverified';
  category:string;stateSemantic:string;sourceRefs:string[];releaseIds:string[];relations:string[];
}
export interface CollectionCompleteCatalog {
  index:CollectionDb01Index;
  rows:CollectionCatalogRow[];
  release:string;
}
const facets=new Set<string>(COLLECTION_DB01_FACETS);
const menus=new Set<number>(COLLECTION_DB01_SUBMENUS.map(x=>x.code));
const rootFamily:Partial<Record<CollectionTopCategory,string>>={
  furniture:'Furniture',landscaping:'Landscaping','roads-fences':'Roads & Fences',
  interior:'Wallpaper & Flooring',buildings:'Buildings',environment:'Environment Effects',
  clothing:'Clothing',appearance:'Appearance','touch-of-magic':'Touch of Magic',
  'photo-mode':'Photo Mode',tools:'Tools',upgrades:'Upgrades',characters:'Characters',
  companions:'Companions','adventure-companions':'Adventure Companions',critters:'Critters',
  mounts:'Mounts',crafting:'Crafting',meals:'Meals',ingredients:'Ingredients',foraging:'Foraging',
  fish:'Fish',gems:'Gems',timebending:'Timebending',memories:'Memories','board-game':'Board Game',
  snippets:'Snippets','lorekeeper-tales':'Lorekeeper Tales','quest-puzzles':'Quest Puzzles',exhibition:'Exhibition'
};
const stock=new Set<CollectionTopCategory>(['ingredients','foraging','fish','gems','meals','timebending','snippets']);
function add<K,V>(map:Map<K,V[]>,key:K,value:V):void{
  const list=map.get(key)??[];list.push(value);map.set(key,list);
}
/** DB-01 v2's explicitly verified collectible native classes. A missing
 * v3 browse candidate does not mean that an item of these classes is internal:
 * v3's definitionScope is based on original CollectionSet candidate links.
 * Recover these IDs through the canonical selective-field API, not a second DB. */
const supplementalFamilies=new Set(['Companion','Makeup','Character','MemoryShard','BoardGame',
  'Skin','Tool','MountGear','PhotoMode','AvatarFeature','Environment']);
export interface CollectionSupplement {
  readonly itemId:number;readonly iconGuid:string;readonly names:Record<string,string>;
}
export async function loadCollectionSupplement(master:PublicCompleteItemMaster,source:CompleteItemMasterFacets):Promise<readonly CollectionSupplement[]>{
  const existing=new Set(source.browseItems.map(row=>row[0]));
  const candidateIds=source.nativeSubtypeItems.filter(([id,type,code])=>
    !existing.has(id)&&supplementalFamilies.has(type)&&collectionSourceRoot(type,code,[])!==null
  ).map(row=>row[0]);
  if(!candidateIds.length)return [];
  const icons=await master.getItemFields(candidateIds,['iconGuid']);
  const missing=icons.flatMap(row=>row&&typeof row.values.iconGuid==='string'&&/^[a-f0-9]{32}$/.test(row.values.iconGuid)
    ?[{itemId:row.itemId,iconGuid:row.values.iconGuid,names:{} as Record<string,string>}]:[]);
  if(!missing.length)return [];
  const names=await master.getItemFields(missing.map(row=>row.itemId),ITEM_MASTER_LOCALES.map(locale=>'names.'+locale));
  for(const [i,row] of names.entries())if(row)
    for(const locale of ITEM_MASTER_LOCALES){
      const value=row.values['names.'+locale];
      if(typeof value==='string'&&value.length)missing[i].names[locale]=value;
    }
  return missing;
}
/** Only item-like definitions with a known Collection destination enter the
 * user-facing catalog. Source relations retain their original native types. */
export function projectCompleteCollection(source:CompleteItemMasterFacets,supplement:readonly CollectionSupplement[]=[]):CollectionDb01Index{
  const nativeSubtypeByItem=new Map<number,CollectionDb01NativeSubtype>();
  const itemsByNativeSubtype=new Map<string,number[]>();
  const nativeSubtypeNames=new Map<string,string|null>();
  const rootsByItem=new Map<number,CollectionTopCategory>();
  const itemsByRoot=new Map<CollectionTopCategory,number[]>();
  const activityTypesByItem=new Map<number,CollectionDb01ActivityType>();
  const itemsByActivityType=new Map<number,number[]>();
  const activityTypeNames=new Map<number,string|null>();
  const categoriesByItem=new Map<number,readonly CollectionDb01SubmenuCode[]>();
  const itemsByCategory=new Map<CollectionDb01SubmenuCode,number[]>();
  const byItem=new Map<number,readonly CollectionDb01Pair[]>();
  const universeTagIdsByItem=new Map<number,readonly number[]>();
  const itemsByUniverseTagId=new Map<number,number[]>();
  const universesByItem=new Map<number,readonly string[]>();
  const itemsByUniverse=new Map<string,number[]>();
  const universeSourceStatusByItem=new Map<number,ItemMasterUniverseStatus>();
  const iconGuidByItem=new Map<number,string>();
  const allowed=new Map(source.browseItems.map(row=>[row[0],row]));
  const extra=new Map(supplement.map(row=>[row.itemId,row]));
  const candidateMenus=new Map(source.categoryItems);
  const recipeResults=new Set(source.craftingRecipeResultItems.map(row=>row[0]));
  for(const [id,type,code,name] of source.nativeSubtypeItems){
    const row=allowed.get(id);const supplemental=extra.get(id);
    if(!row&&!(supplemental&&supplementalFamilies.has(type)))continue;
    const codes=(candidateMenus.get(id)??[]).filter(x=>menus.has(x)) as CollectionDb01SubmenuCode[];
    const root=collectionSourceRoot(type,code,codes,recipeResults.has(id));
    if(!root)continue;
    rootsByItem.set(id,root);add(itemsByRoot,root,id);
    nativeSubtypeByItem.set(id,{nativeType:type,code,nativeName:name});
    const key=type+':'+code;
    add(itemsByNativeSubtype,key,id);nativeSubtypeNames.set(key,name);
    const icon=row?.[3]??supplemental?.iconGuid;
    if(icon)iconGuidByItem.set(id,icon);
    if(codes.length){categoriesByItem.set(id,codes);for(const c of codes)add(itemsByCategory,c,id);}
    if(type==='ActivityItem'){
      activityTypesByItem.set(id,{code,nativeName:name});add(itemsByActivityType,code,id);activityTypeNames.set(code,name);
    }
  }
  const known=(id:number)=>rootsByItem.has(id);
  for(const [id,tags] of source.items)if(known(id)){
    const filtered=tags.filter(([facet])=>facets.has(facet)) as readonly CollectionDb01Pair[];
    if(filtered.length)byItem.set(id,filtered);
  }
  // Exact source world Tag IDs include relations not represented in the old
  // v1 string tags. Preserve them in the same browse axis without asserting
  // game runtime membership.
  const worldKeys=new Map(source.worldTags.map(row=>[row.tagId,row.key]));
  for(const [id,tags] of source.worldSourceTagItems)if(known(id)){
    const list=[...(byItem.get(id)??[])];
    for(const tag of tags){
      const key=worldKeys.get(tag);if(key&&!list.some(t=>t[0]==='worldContextTag'&&t[1]===key))
        list.push(['worldContextTag',key]);
    }
    if(list.length)byItem.set(id,list);
  }
  for(const [id,tags] of source.universeSourceTagItems)if(known(id)){
    universeTagIdsByItem.set(id,tags);for(const tag of tags)add(itemsByUniverseTagId,tag,id);
  }
  for(const [id,keys] of source.universeSourceItems)if(known(id)){
    universesByItem.set(id,keys);for(const key of keys)add(itemsByUniverse,key,id);
  }
  for(const [id,state] of source.universeSourceStatusItems)if(known(id))universeSourceStatusByItem.set(id,state);
  return {release:source.release,sourceItemCount:rootsByItem.size,taggedItems:byItem.size,byItem,
    categoriesByItem,itemsByCategory,activityTypesByItem,itemsByActivityType,activityTypeNames,
    nativeSubtypeByItem,itemsByNativeSubtype,nativeSubtypeNames,universesByItem,itemsByUniverse,
    universeTagIdsByItem,itemsByUniverseTagId,rootsByItem,itemsByRoot,universeSourceStatusByItem,iconGuidByItem};
}
/** Original FurnitureFunctionTagItemData identities, not guessed localized
 * category names. Fetch only the source key and eight name fields. */
async function loadFurnitureKindLabels(master:PublicCompleteItemMaster,source:CompleteItemMasterFacets):
Promise<ReadonlyMap<string,Readonly<Record<string,string>>>>{
  const used=new Set(source.items.flatMap(([,tags])=>tags.filter(([f])=>f==='furnitureKind').map(([,key])=>key)));
  const ids=source.nativeSubtypeItems.filter(([,type,code])=>type==='Tag'&&code===3).map(([id])=>id);
  const labels=new Map<string,Readonly<Record<string,string>>>();
  if(!ids.length||!used.size)return labels;
  const rows=await master.getItemFields(ids,['nativeKey',...ITEM_MASTER_LOCALES.map(l=>'names.'+l)]);
  for(const row of rows){
    if(!row||typeof row.values.nativeKey!=='string'||!used.has(row.values.nativeKey))continue;
    const names:Record<string,string>={};
    for(const l of ITEM_MASTER_LOCALES){
      const value=row.values['names.'+l];if(typeof value==='string'&&value.length)names[l]=value;
    }
    labels.set(row.values.nativeKey,names);
  }
  return labels;
}
const cached=new Map<string,Promise<CollectionCompleteCatalog>>();
export function loadCompleteCollection(base:string,fetcher:typeof fetch=fetch):Promise<CollectionCompleteCatalog>{
  const useCache=fetcher===fetch;
  const existing=useCache?cached.get(base):undefined;if(existing)return existing;
  const task=(async()=>{
    const master=await openCurrentItemDatabase(base,fetcher);
    const source=await master.getCollectionFacets();
    const [supplement,furnitureKindLabels]=await Promise.all([
      loadCollectionSupplement(master,source),loadFurnitureKindLabels(master,source)
    ]);
    const index={...projectCompleteCollection(source,supplement),furnitureKindLabels};
    const names=new Map<number,Record<string,string>>(supplement.map(row=>[row.itemId,{...row.names}]));
    await Promise.all(ITEM_MASTER_LOCALES.map(async locale=>{
      for(const [id,name] of await master.getBrowseNames(locale)){
        if(!index.rootsByItem!.has(id))continue;
        const row=names.get(id)??{};row[locale]=name;names.set(id,row);
      }
    }));
    const rows:CollectionCatalogRow[]=[];
    for(const [id,root] of index.rootsByItem!){
      const labels=names.get(id)??{};
      const verified=ITEM_MASTER_LOCALES.every(l=>Boolean(labels[l]));
      rows.push({id:String(id),names:labels,nameStatus:verified?'verified':'unverified',
        category:rootFamily[root]??root,stateSemantic:stock.has(root)?'QUANTITY_STOCK':
          ['furniture','landscaping','roads-fences','interior'].includes(root)?'OWNERSHIP_STOCK_AND_DISCOVERY':
          ['clothing','appearance'].includes(root)?'OWNERSHIP_AND_DISCOVERY':'UNLOCKED_LOCKED',
        sourceRefs:['db01-complete-source'],releaseIds:[],relations:[]});
    }
    return {index,rows,release:master.release.version};
  })();
  if(useCache){cached.set(base,task);void task.catch(()=>{if(cached.get(base)===task)cached.delete(base);});}
  return task;
}
