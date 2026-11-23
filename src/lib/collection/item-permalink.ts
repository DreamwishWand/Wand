/** Canonical, public Item-ID permalinks for the Collection inspector.
 *
 * A link identifies one known catalog Item, never proves native CollectionSet
 * membership, ownership, world, event eligibility or player Save state.
 */
import type {CollectionItem} from './runtime.ts';

const ID=/^[1-9][0-9]{0,15}$/;
const BASE=/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;

export function canonicalCollectionItemId(raw:unknown):number|null{
  if(typeof raw!=='string'||!ID.test(raw))return null;
  const id=Number(raw);
  return Number.isSafeInteger(id)&&id>0? id:null;
}

/** null on an absent, duplicated, unsafe or noncanonical query Item ID. */
export function collectionItemIdFromSearch(search:string):number|null{
  if(typeof search!=='string'||search.length>2048)return null;
  const params=new URLSearchParams(search.startsWith('?')?search.slice(1):search);
  const values=params.getAll('item');
  return values.length===1?canonicalCollectionItemId(values[0]):null;
}

export function collectionItemHref(basePath:string,itemId:number):string{
  if(typeof basePath!=='string'||
     (basePath!==''&&!BASE.test(basePath))||
     !Number.isSafeInteger(itemId)||itemId<=0)
    throw new TypeError('COLLECTION_INVALID_ITEM_LINK');
  return basePath+'/collection/?item='+itemId;
}

/** Never render unknown IDs as existing Items. The Rust engine owns lookup. */
export function collectionItemFromLink(
  lookup:Pick<{item:(itemId:number,locale:string)=>CollectionItem},'item'>,
  search:string,
  locale:string
):CollectionItem|null{
  const id=collectionItemIdFromSearch(search);
  if(id===null)return null;
  try{
    const item=lookup.item(id,locale);
    return item?.itemId===id?item:null;
  }catch{return null;}
}
