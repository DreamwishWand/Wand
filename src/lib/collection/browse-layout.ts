/** Collection presentation based solely on source-backed Item ID relations.
 * Never interprets an original Tag as a game UI membership or DLC entitlement.
 */
import type {CollectionDb01Index} from './db01-native-facets.ts';
import type {CollectionItem} from './runtime.ts';
export const COLLECTION_UNIVERSE_UNTAGGED='__no_universe_tag__' as const;
export interface CollectionUniverseBrowseOption{
  readonly id:string;
  readonly label:string;
  readonly total:number;
}
export interface CollectionUniverseBrowseSection{
  readonly id:string;
  readonly label:string;
  readonly total:number;
  readonly items:readonly CollectionItem[];
}
const norm=(value:string)=>value.replace(/[^a-z0-9]/gi,'').toLowerCase();
export function isDreamlightUniverse(key:string):boolean{
  return norm(key)==='disneydreamlightvalley'||norm(key)==='dreamlightvalley';
}
export function sortedCollectionUniverseOptions(
  index:CollectionDb01Index,locale:string,display:(key:string)=>string,
  untaggedLabel:string,
):readonly CollectionUniverseBrowseOption[]{
  const options=[...index.itemsByUniverse].map(([id,ids])=>({
    id,label:display(id),total:ids.length
  }));
  const collator=new Intl.Collator(locale,{usage:'sort',sensitivity:'base',numeric:true});
  options.sort((a,b)=>collator.compare(a.label,b.label)||a.id.localeCompare(b.id,'en'));
  const home=options.filter(option=>isDreamlightUniverse(option.id));
  const other=options.filter(option=>!isDreamlightUniverse(option.id));
  // "No native universe tag" is not a proof that the item belongs to no
  // Disney franchise. Its count is exact over the source-backed Item catalog.
  return Object.freeze([
    {id:COLLECTION_UNIVERSE_UNTAGGED,label:untaggedLabel,
      total:index.sourceItemCount-index.universesByItem.size},
    ...home,...other
  ]);
}
/** Native order is stable across languages: source Item IDs, not translated
 * alphabetical names. Group names may be localized for the current screen.
 */
export function groupCollectionUniverseItems(
  items:readonly CollectionItem[],
  group:(item:CollectionItem)=>Readonly<{id:string;label:string;rank:number}>,
  visible:number
):readonly CollectionUniverseBrowseSection[]{
  const ordered=[...items].sort((a,b)=>a.itemId-b.itemId);
  const groups=new Map<string,{
    id:string;label:string;rank:number;total:number;items:CollectionItem[]
  }>();
  for(const item of ordered){
    const key=group(item);
    let section=groups.get(key.id);
    if(!section){
      section={...key,total:0,items:[]};
      groups.set(key.id,section);
    }
    section.total++;
    section.items.push(item);
  }
  let remaining=visible;
  return [...groups.values()].sort((a,b)=>a.rank-b.rank||a.id.localeCompare(b.id,'en'))
    .map(section=>{
      const items=section.items.slice(0,Math.max(0,remaining));
      remaining-=items.length;
      return {id:section.id,label:section.label,total:section.total,items};
    }).filter(section=>section.items.length>0);
}
