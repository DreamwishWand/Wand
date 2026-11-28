import type {ExploreItem} from './model';
import type {ReleaseGroup} from './series';
import type {ItemMasterTagLabel} from '../items/public-item-master';
export interface ExploreCatalog {
  items:ExploreItem[];
  universeTags:{tagId:number;key:string;names:Record<string,string|null>}[];
  worldTags:readonly ItemMasterTagLabel[];
  releases:ReleaseGroup[];
}
// Current SPA session only. No second database or persistent copy of game data.
const catalogs=new Map<string,Promise<ExploreCatalog>>();
const artwork=new Map<string,Promise<Record<string,string>>>();
export function loadExploreCatalog(base:string):Promise<ExploreCatalog>{
  const existing=catalogs.get(base);if(existing)return existing;
  const task=new Promise<ExploreCatalog>((resolve,reject)=>{
    const worker=new Worker(new URL('./catalog.worker.ts',import.meta.url),{type:'module'});
    const fail=()=>{worker.terminate();reject(Error('EXPLORE_CATALOG_UNAVAILABLE'));};
    worker.onerror=fail;worker.onmessageerror=fail;
    worker.onmessage=(e:MessageEvent<Partial<ExploreCatalog>&{error?:boolean}>)=>{
      const d=e.data;
      if(!Array.isArray(d?.items)){fail();return;}
      worker.terminate();
      resolve({items:d.items,universeTags:d.universeTags??[],worldTags:d.worldTags??[],releases:d.releases??[]});
    };
    try{worker.postMessage({base});}catch{fail();}
  });
  catalogs.set(base,task);
  void task.catch(()=>{if(catalogs.get(base)===task)catalogs.delete(base);});
  return task;
}
export function loadExploreHistoricalArtwork(base:string):Promise<Record<string,string>>{
  const previous=artwork.get(base);if(previous)return previous;
  const task=fetch(base+'/ddv/collection/item-images-r39.json').then(async r=>{
    if(!r.ok)throw Error('ARTWORK_INDEX_UNAVAILABLE');
    const data=await r.json();
    if(data?.schema!=='wand.collection.item-images.r39@1'||!data.items||typeof data.items!=='object')throw Error('ARTWORK_INDEX_INVALID');
    return data.items as Record<string,string>;
  });
  artwork.set(base,task);
  void task.catch(()=>{if(artwork.get(base)===task)artwork.delete(base);});
  return task;
}
