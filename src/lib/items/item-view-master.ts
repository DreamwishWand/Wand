import {openCurrentItemDatabase,type PublicCompleteItemMaster} from './public-item-master.ts';
// Shared lazy detail readers reuse the same current revision and shard cache.
const masters=new Map<string,Promise<PublicCompleteItemMaster>>();
export function currentItemViewMaster(base:string):Promise<PublicCompleteItemMaster>{
  const cached=masters.get(base);if(cached)return cached;
  const request=openCurrentItemDatabase(base,fetch);masters.set(base,request);
  void request.catch(()=>{if(masters.get(base)===request)masters.delete(base);});
  return request;
}
