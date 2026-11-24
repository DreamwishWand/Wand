import type {CollectionDb01Index} from './db01-native-facets.ts';
import type {CollectionItem} from './runtime.ts';
import {collectionTopCategoryRank,type CollectionTopCategory} from './category-hierarchy.ts';
import {COLLECTION_WORLD_NAVIGATION} from './scope-options.ts';
import {collectionMountSubcategory,collectionMountPart,collectionFurnitureKindLabel} from './subcategories.ts';
import {COLLECTION_UNIVERSE_UNTAGGED,COLLECTION_UNIVERSE_UNRESOLVED,
  sortedCollectionUniverseOptions,collectionUniverseDisplayLabel} from './browse-layout.ts';

const UNIVERSE_ROOTS=new Set<CollectionTopCategory>(['furniture','clothing','appearance','characters','mounts','buildings','landscaping','roads-fences','interior']);
const WORLD_ROOTS=new Set<CollectionTopCategory>(['ingredients','crafting','fish','foraging','gems','timebending','snippets','critters']);
const WORLD_SHARED='__shared_worlds__',WORLD_UNKNOWN='__unknown_world__';
const WORLD_COPY:Record<string,readonly [string,string]>={ja:['複数ワールド','ワールド未分類'],en:['Multiple worlds','World unspecified'],fr:['Plusieurs mondes','Monde non spécifié'],it:['Più mondi','Mondo non specificato'],de:['Mehrere Welten','Welt nicht angegeben'],'es-ES':['Varios mundos','Mundo sin especificar'],'zh-CN':['多个世界','未指定世界'],'pt-BR':['Vários mundos','Mundo não especificado']};
export interface CollectionBrowseOrder {
  compare:(a:CollectionItem,b:CollectionItem)=>number;
  universeKey:(id:number)=>string;
  universeLabel:(key:string)=>string;
  group:(id:number,root:CollectionTopCategory|null)=>{key:string;label:string}|null;
}
const styleKeys=(source:CollectionDb01Index,id:number)=>[...new Set((source.byItem.get(id)??[])
  .filter(([facet])=>facet==='furnitureStyle'||facet==='clothingStyle').map(([,key])=>key))].sort().join('|');
/** Source-backed presentation, not a new game relationship. All Item IDs
 * remain distinct. Only rank a multi-universe item once inside a world list. */
export function makeCollectionBrowseOrder(source:CollectionDb01Index,locale:string,universeSelected:boolean,selectedWorld=''):CollectionBrowseOrder{
  const options=sortedCollectionUniverseOptions(source,locale,key=>collectionUniverseDisplayLabel(locale,key),
    locale==='ja'?'ユニバース未設定':'No source universe tag');
  const ranks=new Map(options.map((option,i)=>[option.id,i]));
  const labels=new Map(options.map(option=>[option.id,option.label]));
  const fallback=(id:number)=>source.universeSourceStatusByItem?.get(id)==='unresolved_source'
    ?COLLECTION_UNIVERSE_UNRESOLVED:COLLECTION_UNIVERSE_UNTAGGED;
  const primary=(id:number)=>{
    const tags=(source.universeTagIdsByItem.get(id)??[]).map(String);
    const keys=tags.length?tags:source.universesByItem.get(id)??[];
    return [...keys].sort((a,b)=>(ranks.get(a)??999)-(ranks.get(b)??999)||a.localeCompare(b,'en'))[0]??fallback(id);
  };
  const worldKeys=COLLECTION_WORLD_NAVIGATION.map(row=>String(row.id));
  const extra=[...(source.worldLabelsByKey?.keys()??[])].filter(key=>!worldKeys.includes(key)).sort();
  const worldOrder=[...worldKeys,...extra,WORLD_SHARED,WORLD_UNKNOWN];
  const worldRanks=new Map(worldOrder.map((id,i)=>[id,i]));
  const worldLabel=(id:string)=>id===WORLD_SHARED?(WORLD_COPY[locale]??WORLD_COPY.en)[0]:
    id===WORLD_UNKNOWN?(WORLD_COPY[locale]??WORLD_COPY.en)[1]:
    source.worldLabelsByKey?.get(id)?.[locale]??source.worldLabelsByKey?.get(id)?.en??
      COLLECTION_WORLD_NAVIGATION.find(row=>row.id===id)?.label??id;
  const primaryWorld=(id:number)=>{
    const worlds=[...new Set((source.byItem.get(id)??[]).filter(([facet])=>facet==='worldContextTag').map(([,key])=>key))];
    return worlds.length>1?WORLD_SHARED:worlds[0]??WORLD_UNKNOWN;
  };
  const cached=new Map<number,{root:number;universe:string;world:string;w:number;u:number;part:number;entity:number;set:number;style:string;native:number;child:number}>();
  function key(id:number){
    const prior=cached.get(id);if(prior)return prior;
    const root=source.rootsByItem?.get(id);
    const type=source.nativeSubtypeByItem.get(id);
    const parent=source.parentEntityByItem?.get(id);
    const character=root==='characters'||root==='adventure-companions';
    const mount=root==='mounts';
    const nativeKey=type?type.nativeType+':'+type.code:'';
    const child=character&&type?.nativeType==='Skin'?1:0;
    // Unknown-parent skins must not be placed next to a guessed character.
    const entity=character?(parent??(child?Number.MAX_SAFE_INTEGER:id)):
      mount?(parent??id):0;
    const universe=primary(character&&parent?parent:id);
    const usesUniverse=root!==undefined&&UNIVERSE_ROOTS.has(root);
    const set=source.sourceSetByItem?.get(id)??Number.MAX_SAFE_INTEGER;
    const world=primaryWorld(id);
    const usesWorld=root!==undefined&&WORLD_ROOTS.has(root);
    const k={root:root===undefined?999:collectionTopCategoryRank(root),universe,world,
      w:usesWorld&&!selectedWorld?worldRanks.get(world)??999:0,
      u:!universeSelected&&usesUniverse?ranks.get(universe)??999:0,
      part:mount?collectionMountPart(nativeKey):character&&child&&!parent?1:0,
      entity,set,style:styleKeys(source,id),native:type?.code??0,child};
    cached.set(id,k);return k;
  }
  return {
    compare(a,b){
      const x=key(a.itemId),y=key(b.itemId);
      return x.root-y.root||x.part-y.part||x.w-y.w||x.u-y.u||x.entity-y.entity||x.child-y.child||
        x.set-y.set||x.style.localeCompare(y.style,'en')||x.native-y.native||a.itemId-b.itemId;
    },
    universeKey:id=>key(id).universe,
    universeLabel:id=>labels.get(id)??collectionUniverseDisplayLabel(locale,id),
    group(id,root){
      if(root==='mounts'){
        const n=source.nativeSubtypeByItem.get(id);
        const part=collectionMountSubcategory(n?n.nativeType+':'+n.code:'');
        return {key:part,label:collectionFurnitureKindLabel(locale,part,source)??part};
      }
      if(root&&WORLD_ROOTS.has(root)&&!selectedWorld){const world=key(id).world;return {key:world,label:worldLabel(world)};}
      if(root&&UNIVERSE_ROOTS.has(root)&&!universeSelected){const u=key(id).universe;return {key:u,label:labels.get(u)??collectionUniverseDisplayLabel(locale,u)};}
      return null;
    }
  };
}
export function collectionUniverseRootSection(source:CollectionDb01Index,id:number):
  {root:CollectionTopCategory|undefined;part:string|null;rankOffset:number}{
  const root=source.rootsByItem?.get(id);
  const native=source.nativeSubtypeByItem.get(id);
  if(root==='mounts'&&native){
    const key=native.nativeType+':'+native.code;
    return {root,part:collectionMountSubcategory(key),rankOffset:collectionMountPart(key)};
  }
  return {root,part:null,rankOffset:0};
}
export function collectionRootUsesUniverse(root:CollectionTopCategory|null):boolean{
  return root!==null&&UNIVERSE_ROOTS.has(root)&&root!=='characters'&&root!=='mounts';
}
