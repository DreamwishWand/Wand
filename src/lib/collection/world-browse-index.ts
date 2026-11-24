import type {CollectionTopCategory} from './category-hierarchy.ts';
import type {CollectionDb01Index} from './db01-native-facets.ts';

export interface WorldBrowseScope {
  readonly itemIds:readonly number[];
  readonly itemIdSet:ReadonlySet<number>;
  readonly rootCounts:ReadonlyMap<CollectionTopCategory,number>;
  readonly progressTotals:ReadonlyMap<CollectionTopCategory,number>;
  readonly nativeCounts:ReadonlyMap<string,number>;
  readonly activityCounts:ReadonlyMap<number,number>;
}
interface MutableScope {
  itemIds:number[];
  itemIdSet:Set<number>;
  rootCounts:Map<CollectionTopCategory,number>;
  progressTotals:Map<CollectionTopCategory,number>;
  nativeCounts:Map<string,number>;
  activityCounts:Map<number,number>;
}
function makeScope():MutableScope{
  return {itemIds:[],itemIdSet:new Set(),rootCounts:new Map(),progressTotals:new Map(),nativeCounts:new Map(),activityCounts:new Map()};
}
/** Base character/mount completion is distinct from cosmetic collection.
 * Other roots use manual checklist records, not inferred game save flags. */
export function collectionProgressMember(source:CollectionDb01Index,id:number):boolean{
  const root=source.rootsByItem?.get(id),native=source.nativeSubtypeByItem.get(id);
  if(root==='characters'||root==='adventure-companions')return native?.nativeType==='Character';
  if(root==='mounts')return native?.nativeType==='Companion'&&native.code===3;
  return root!==undefined;
}
/** A catalog's world-context membership is immutable. Build once per source
 * projection, not per click. This is not CollectionArea/availability proof. */
export function buildWorldBrowseIndex(source:CollectionDb01Index):ReadonlyMap<string,WorldBrowseScope>{
  const scopes=new Map<string,MutableScope>();
  const all=makeScope();
  scopes.set('',all);
  function add(scope:MutableScope,id:number):void{
    scope.itemIds.push(id);scope.itemIdSet.add(id);
    const root=source.rootsByItem?.get(id);
    if(root){
      scope.rootCounts.set(root,(scope.rootCounts.get(root)??0)+1);
      if(collectionProgressMember(source,id))scope.progressTotals.set(root,(scope.progressTotals.get(root)??0)+1);
    }
    const native=source.nativeSubtypeByItem.get(id);
    if(native){
      const key=native.nativeType+':'+native.code;
      scope.nativeCounts.set(key,(scope.nativeCounts.get(key)??0)+1);
    }
    const activity=source.activityTypesByItem.get(id);
    if(activity)scope.activityCounts.set(activity.code,(scope.activityCounts.get(activity.code)??0)+1);
  }
  const allIds=source.nativeSubtypeByItem.size
    ?source.nativeSubtypeByItem.keys():source.byItem.keys();
  for(const id of allIds){
    add(all,id);
    const worlds=new Set((source.byItem.get(id)??[])
      .filter(([facet])=>facet==='worldContextTag').map(([,key])=>key));
    for(const world of worlds){
      let scope=scopes.get(world);
      if(!scope){scope=makeScope();scopes.set(world,scope);}
      add(scope,id);
    }
  }
  return scopes;
}
/** Owned counts are derived from the active profile, not cached across edits.
 * Iterating sparse recorded entries avoids an entire catalog scan per click. */
export function countOwnedInWorldScope(
  source:CollectionDb01Index,scope:WorldBrowseScope,
  entries:Readonly<Record<string,{status?:string}>>
):{native:Map<string,number>;activity:Map<number,number>;root:Map<CollectionTopCategory,number>}{
  const native=new Map<string,number>(),activity=new Map<number,number>();
  const root=new Map<CollectionTopCategory,number>();
  const ids=scope.itemIdSet;
  for(const [key,entry] of Object.entries(entries)){
    if(entry.status!=='owned')continue;
    const id=Number(key);
    if(!ids.has(id))continue;
    const top=source.rootsByItem?.get(id);
    if(top&&collectionProgressMember(source,id))root.set(top,(root.get(top)??0)+1);
    const row=source.nativeSubtypeByItem.get(id);
    if(row){
      const k=row.nativeType+':'+row.code;
      native.set(k,(native.get(k)??0)+1);
    }
    const a=source.activityTypesByItem.get(id);
    if(a)activity.set(a.code,(activity.get(a.code)??0)+1);
  }
  return {native,activity,root};
}
