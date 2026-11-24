import {openPublicItemMaster,ITEM_MASTER_LOCALES,type CompleteItemMasterFacets,type ItemMasterUniverseStatus} from '../items/public-item-master.ts';
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
/** Only item-like definitions with a known Collection destination enter the
 * user-facing catalog. Source relations retain their original native types. */
export function projectCompleteCollection(source:CompleteItemMasterFacets):CollectionDb01Index{
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
  const candidateMenus=new Map(source.categoryItems);
  for(const [id,type,code,name] of source.nativeSubtypeItems){
    const row=allowed.get(id);if(!row)continue;
    const codes=(candidateMenus.get(id)??[]).filter(x=>menus.has(x)) as CollectionDb01SubmenuCode[];
    const root=collectionSourceRoot(type,code,codes);
    if(!root)continue;
    rootsByItem.set(id,root);add(itemsByRoot,root,id);
    nativeSubtypeByItem.set(id,{nativeType:type,code,nativeName:name});
    const key=type+':'+code;
    add(itemsByNativeSubtype,key,id);nativeSubtypeNames.set(key,name);
    if(row[3])iconGuidByItem.set(id,row[3]);
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
const cached=new Map<string,Promise<CollectionCompleteCatalog>>();
export function loadCompleteCollection(base:string):Promise<CollectionCompleteCatalog>{
  const existing=cached.get(base);if(existing)return existing;
  const task=(async()=>{
    const master=await openPublicItemMaster(base,fetch,{scope:'complete'});
    const source=await master.getCollectionFacets();
    const index=projectCompleteCollection(source);
    const names=new Map<number,Record<string,string>>();
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
  cached.set(base,task);void task.catch(()=>{if(cached.get(base)===task)cached.delete(base);});
  return task;
}
