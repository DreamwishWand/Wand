import type {PublicCompleteItemMaster} from '../items/public-item-master.ts';
import {DB02_ACQUISITION_CATEGORY_ORDER,type GameNativeItemCategory} from '../acquisition/game-native-item-categories.ts';
export interface CollectionAcquisitionIndex{
  getItem(id:number):{readonly categories:readonly GameNativeItemCategory[]};
  listItemIds(category:GameNativeItemCategory):readonly number[];
}
/** A single selective field from the same current revision as the browse catalog. */
export async function loadCurrentCollectionAcquisition(master:PublicCompleteItemMaster):Promise<CollectionAcquisitionIndex>{
  const fields=new Set((await master.getFieldCatalog()).map(row=>row.field));
  if(!fields.has('acquisition.effectiveCategories'))throw Error('COLLECTION_ACQUISITION_NOT_INDEXED');
  const items=new Map<number,readonly GameNativeItemCategory[]>();
  const byCategory=new Map<GameNativeItemCategory,number[]>();
  for(const [id,value] of await master.getFieldRows('acquisition.effectiveCategories')){
    if(!Array.isArray(value))continue;
    const categories=DB02_ACQUISITION_CATEGORY_ORDER.filter(key=>value.includes(key));
    if(!categories.length)continue;
    items.set(id,categories);
    for(const key of categories){const ids=byCategory.get(key)??[];ids.push(id);byCategory.set(key,ids);}
  }
  return {getItem:id=>({categories:items.get(id)??[]}),listItemIds:key=>byCategory.get(key)??[]};
}
