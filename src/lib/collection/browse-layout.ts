/** Collection presentation based solely on source-backed Item ID relations.
 * Never interprets an original Tag as a game UI membership or DLC entitlement.
 */
import type {CollectionDb01Index} from './db01-native-facets.ts';
import {COLLECTION_UNIVERSE_TAG_BY_ID,COLLECTION_UNIVERSE_TAG_NAMES}
  from './universe-tag-names.ts';
import type {CollectionItem} from './runtime.ts';
export const COLLECTION_UNIVERSE_UNTAGGED='__no_universe_tag__' as const;
export const COLLECTION_UNIVERSE_UNRESOLVED='__unresolved_universe__' as const;
export function collectionUniverseIds(index:CollectionDb01Index,key:string):readonly number[]{
  if(key===COLLECTION_UNIVERSE_UNTAGGED||key===COLLECTION_UNIVERSE_UNRESOLVED){
    if(index.universeSourceStatusByItem){
      const state=key===COLLECTION_UNIVERSE_UNTAGGED?'no_universe_in_verified_tag_fields':'unresolved_source';
      return [...index.universeSourceStatusByItem].filter(([,v])=>v===state).map(([id])=>id);
    }
    if(key===COLLECTION_UNIVERSE_UNRESOLVED)return [];
    return [...index.nativeSubtypeByItem.keys()].filter(id=>!(index.universeTagIdsByItem.size
      ?index.universeTagIdsByItem.has(id):index.universesByItem.has(id)));
  }
  return index.itemsByUniverseTagId.get(Number(key))??index.itemsByUniverse.get(key)??[];
}
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
  return key==='2000500023'||norm(key)==='disneydreamlightvalley'||
    norm(key)==='dreamlightvalley';
}
export function isOtherUniverse(key:string):boolean{
  // Steam original Tag "NonIP" is the native Other universe, not an
  // untagged Item. Keep both notions distinct.
  return key==='2000500017'||norm(key)==='other'||norm(key)==='nonip';
}
/** UI presentation only. Neither source Tag counts nor membership depend on
 * these labels; unverified names continue to use their native keys. */
export function collectionUniverseDisplayLabel(locale:string,key:string):string{
  const original=COLLECTION_UNIVERSE_TAG_BY_ID.get(Number(key));
  if(original){
    const localized=original.names as Readonly<Record<string,string>>;
    return localized[locale]??localized.en;
  }
  if(isOtherUniverse(key)){
    const labels:Readonly<Record<string,string>>={
      ja:'その他',en:'Other',fr:'Autres',it:'Altro',de:'Sonstige',
      'es-ES':'Otros','zh-CN':'其他','pt-BR':'Outros'
    };
    return labels[locale]??labels.en;
  }
  if(isDreamlightUniverse(key)){
    return locale==='ja'?'ドリームライトバレー':'Dreamlight Valley';
  }
  return key.replace(/^(?:F_|C_)/,'').replace(/([a-z])([A-Z])/g,'$1 $2');
}
export function sortedCollectionUniverseOptions(
  index:CollectionDb01Index,locale:string,display:(key:string)=>string,
  untaggedLabel:string,
):readonly CollectionUniverseBrowseOption[]{
  const canonical=(index.itemsByUniverseTagId?.size??0)>0;
  const options=canonical
    ?COLLECTION_UNIVERSE_TAG_NAMES.map(row=>({
      id:String(row.id),label:display(String(row.id)),
      total:index.itemsByUniverseTagId.get(row.id)?.length??0
    }))
    :[...index.itemsByUniverse].map(([id,ids])=>({
      id,label:display(id),total:ids.length
    }));
  // For Japanese, sort by curated phonetic readings; Unicode/Intl ordering
  // of kanji franchise titles is NOT gojuon ordering.
  const sortLabel=(option:CollectionUniverseBrowseOption):string=>
    locale==='ja'
      ?COLLECTION_UNIVERSE_TAG_BY_ID.get(Number(option.id))?.jaReading??option.label
      :option.label;
  const collator=new Intl.Collator(locale,{usage:'sort',sensitivity:'base',numeric:true});
  options.sort((a,b)=>collator.compare(sortLabel(a),sortLabel(b))||
    a.id.localeCompare(b.id,'en'));
  const generic=options.filter(option=>isOtherUniverse(option.id));
  const home=options.filter(option=>isDreamlightUniverse(option.id));
  const others=options.filter(option=>
    !isOtherUniverse(option.id)&&!isDreamlightUniverse(option.id));
  // Original "Other" is an explicit native Disney-universe Tag. Untagged
  // items are distinct from that Tag and cannot be called "Other" without
  // evidence. Put the original Other + Dreamlight front, and untagged last.
  const noTag={id:COLLECTION_UNIVERSE_UNTAGGED,label:untaggedLabel,
    total:index.universeSourceStatusByItem?collectionUniverseIds(index,COLLECTION_UNIVERSE_UNTAGGED).length:
      index.sourceItemCount-(canonical?index.universeTagIdsByItem.size:index.universesByItem.size)};
  const unresolved=index.universeSourceStatusByItem?[{
    id:COLLECTION_UNIVERSE_UNRESOLVED,
    label:({ja:'分類未確定',en:'Unresolved',fr:'Non déterminé',it:'Non determinato',de:'Ungeklärt','es-ES':'Sin determinar','zh-CN':'待确认','pt-BR':'Não determinado'} as Record<string,string>)[locale]??'Unresolved',
    total:collectionUniverseIds(index,COLLECTION_UNIVERSE_UNRESOLVED).length
  }]:[];
  return Object.freeze(generic.length
    ?[...generic,...home,...others,noTag,...unresolved]
    :[noTag,...home,...others,...unresolved]);
}
/** Native order is stable across languages: source Item IDs, not translated
 * alphabetical names. Group names may be localized for the current screen.
 */
export function groupCollectionUniverseItems(
  items:readonly CollectionItem[],
  group:(item:CollectionItem)=>Readonly<{id:string;label:string;rank:number}>,
  visible:number,
  compare:(a:CollectionItem,b:CollectionItem)=>number=(a,b)=>a.itemId-b.itemId
):readonly CollectionUniverseBrowseSection[]{
  const ordered=[...items].sort(compare);
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
  const sorted=[...groups.values()].sort((a,b)=>
    a.rank-b.rank||a.id.localeCompare(b.id,'en'));
  // Each category stays visible from the first render. Scroll advances the
  // per-category cap rather than hiding all later headings behind a huge
  // early category such as furniture.
  const perGroup=Math.max(12,Math.ceil(visible/Math.max(1,sorted.length)));
  const allVisible=visible>=items.length;
  return sorted.map(section=>({
    id:section.id,label:section.label,total:section.total,
    items:allVisible?section.items:section.items.slice(0,perGroup)
  }));
}
