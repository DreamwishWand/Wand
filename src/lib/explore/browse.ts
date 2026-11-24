import type {ExploreItem} from './model.ts';
export const FAMILIES=['furniture','landscaping','roads-fences','interior','buildings','environment'] as const;
export type Family=typeof FAMILIES[number];
export const FACETS=['furnitureKind','color','furnitureStyle'] as const;
export type Facet=typeof FACETS[number];
export interface ExploreFilters {
  families:readonly Family[];
  universes:readonly string[];
  tags:Record<Facet,readonly string[]>;
}
export function emptyFilters():ExploreFilters{return {families:[],universes:[],tags:{furnitureKind:[],color:[],furnitureStyle:[]}}}
export function familyOf(i:ExploreItem):Family {
  if(i.nativeCategory==='Building'||i.nativeCategory==='Skin'&&i.subtype!==3)return 'buildings';
  if(i.nativeCategory==='Environment'||i.nativeCategory==='Skin'&&i.subtype===3)return 'environment';
  if(i.nativeCategory==='Trimming')return 'interior';
  if(i.subtype===2)return 'landscaping';
  if(i.subtype===1||i.subtype===7)return 'roads-fences';
  return 'furniture';
}
export function universeKeys(i:ExploreItem):string[]{
  return i.universes.length?i.universes.map(String):[i.universeStatus==='unresolved_source'?'unknown':'none'];
}
export function matches(i:ExploreItem,f:ExploreFilters):boolean {
  return (!f.families.length||f.families.includes(familyOf(i)))&&
    (!f.universes.length||universeKeys(i).some(key=>f.universes.includes(key)))&&
    FACETS.every(facet=>!f.tags[facet].length||i.tags.some(([k,v])=>k===facet&&f.tags[facet].includes(v)));
}
function kind(i:ExploreItem):string{
  return i.tags.filter(([k])=>k==='furnitureKind').map(([,v])=>v).sort()[0]??'\uffff';
}
export function compareItems(a:ExploreItem,b:ExploreItem):number{
  return FAMILIES.indexOf(familyOf(a))-FAMILIES.indexOf(familyOf(b))||
    kind(a).localeCompare(kind(b),'en')||a.subtype-b.subtype||a.itemId-b.itemId;
}
export function groupItems(items:readonly ExploreItem[],universes:readonly string[]=[]):Map<string,ExploreItem[]>{
  const out=new Map<string,ExploreItem[]>();
  for(const item of items)for(const key of universeKeys(item)){
    if(universes.length&&!universes.includes(key))continue;
    const list=out.get(key)??[];list.push(item);out.set(key,list);
  }
  for(const list of out.values())list.sort(compareItems);
  return out;
}
