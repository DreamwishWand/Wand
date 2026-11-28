import {FACETS,FAMILIES,emptyFilters,type ExploreFilters} from './browse.ts';
import {CATEGORY_KEYS,readDecorationScope,type DecorationScope} from './scope.ts';
import type {CatalogAnchor} from './viewport-anchor.ts';
export interface ExploreBrowseSnapshot{
  schema:1;
  scope:DecorationScope; search:string; filters:ExploreFilters;
  favorites:boolean; ownedOnly:boolean; boardsOpen:boolean; filtersOpen:boolean;
  selectionMode:boolean; selectedIds:number[];
  selectedId:number|null; variantKey:string|null; variantIds:number[];
  variantChoices:Record<string,number>; scrollY:number; anchor:CatalogAnchor|null;
}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const strings=(v:unknown):string[]=>Array.isArray(v)?[...new Set(v.filter((s):s is string=>typeof s==='string'&&s.length<=256))].slice(0,1000):[];
const ids=(v:unknown):number[]=>Array.isArray(v)?[...new Set(v.filter(id))].slice(0,10000):[];
export function readExploreBrowseSnapshot(raw:unknown):ExploreBrowseSnapshot|null{
  if(!object(raw)||raw.schema!==1)return null;
  const f=object(raw.filters)?raw.filters:{},tags=object(f.tags)?f.tags:{},filters=emptyFilters();
  filters.families=FAMILIES.filter(k=>strings(f.families).includes(k));
  filters.categories=CATEGORY_KEYS.filter(k=>strings(f.categories).includes(k));
  filters.universes=strings(f.universes);filters.worlds=strings(f.worlds);
  for(const k of FACETS)filters.tags[k]=strings(tags[k]);
  const choices:Record<string,number>=Object.create(null);
  if(object(raw.variantChoices))for(const [key,value] of Object.entries(raw.variantChoices).slice(0,10000))
    if(key.length<=256&&id(value))choices[key]=value;
  const a=raw.anchor;
  const anchor=object(a)&&typeof a.universe==='string'&&typeof a.index==='number'&&Number.isSafeInteger(a.index)&&a.index>=0&&typeof a.offset==='number'&&Number.isFinite(a.offset)
    ?{universe:a.universe,index:a.index,offset:a.offset}:null;
  return {schema:1,scope:readDecorationScope(raw.scope),search:typeof raw.search==='string'?raw.search.slice(0,4096):'',filters,
    favorites:raw.favorites===true,ownedOnly:raw.ownedOnly===true,boardsOpen:raw.boardsOpen===true,filtersOpen:raw.filtersOpen===true,
    selectionMode:raw.selectionMode===true,selectedIds:ids(raw.selectedIds),
    selectedId:id(raw.selectedId)?raw.selectedId:null,variantKey:typeof raw.variantKey==='string'?raw.variantKey:null,
    variantIds:ids(raw.variantIds),variantChoices:choices,scrollY:typeof raw.scrollY==='number'&&Number.isFinite(raw.scrollY)?Math.max(0,raw.scrollY):0,anchor};
}
