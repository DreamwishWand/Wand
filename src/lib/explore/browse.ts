import type {ExploreItem} from './model.ts';
import {categoriesOf,type ExploreCategory} from './scope.ts';
export const FAMILIES=['furniture','landscaping','roads-fences','interior','buildings','environment'] as const;
export type Family=typeof FAMILIES[number];
export const FACETS=['furnitureKind','color','furnitureStyle'] as const;
export type Facet=typeof FACETS[number];
export interface ExploreFilters {
  families:readonly Family[];
  universes:readonly string[];
  categories?:readonly ExploreCategory[];
  worlds?:readonly string[];
  tags:Record<Facet,readonly string[]>;
}
export function emptyFilters():ExploreFilters{return {families:[],universes:[],categories:[],worlds:[],tags:{furnitureKind:[],color:[],furnitureStyle:[]}}}
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
    (!f.categories?.length||categoriesOf(i).some(key=>f.categories?.includes(key)))&&
    (!f.worlds?.length||(i.worlds??[]).some(key=>f.worlds?.includes(key)))&&
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

/** Explicit game-original and NonIP tags are not missing-universe states. */
export const DREAMLIGHT_UNIVERSE='2000500023';
export const NON_IP_UNIVERSE='2000500017';
export function isLargeUniverse(key:string):boolean{
  return key===DREAMLIGHT_UNIVERSE||key===NON_IP_UNIVERSE;
}
export function universeRank(key:string):number{
  return key===NON_IP_UNIVERSE?4:key===DREAMLIGHT_UNIVERSE?3:key==='unknown'?2:key==='none'?1:0;
}
export function categoryShelves(items:readonly ExploreItem[]):[Family,ExploreItem[]][]{
  const groups=new Map<Family,ExploreItem[]>();
  for(const item of items){const key=familyOf(item);const list=groups.get(key)??[];list.push(item);groups.set(key,list);}
  return FAMILIES.flatMap(key=>{const list=groups.get(key);return list?[[key,list.sort(compareItems)] as [Family,ExploreItem[]]]:[];});
}
