/** Collection view scopes. A source Tag reference or CollectionArea enum alone
 * is NOT proof of game CollectionArea -> Item membership.
 * This module only enables filters backed by explicit, reviewed per-Item scope
 * membership in the currently loaded catalog.
 */
import type {CollectionFacet,CollectionItem,CollectionRuntimeMetadata} from './runtime.ts';

export interface CollectionScopeOption {
  readonly id:string;
  readonly label:string;
  readonly total:number;
}
export type CollectionScopeAxis='world'|'universe';
const LOCALES=['en','fr','it','de','es-ES','ja','zh-CN','pt-BR'] as const;
// Presentation order follows the original CollectionArea sequence (Honeywood
// is a special 4097 enum). This list NEVER assigns membership; the verified
// runtime facet + explicit proof still decide which tabs can exist.
const NATIVE_WORLD_ORDER=[
  'IsDreamlightValley','IsEternityIsle','IsStorybookVale',
  'IsWishBlossomMountains','isSeaOfSecrets','isHoneywood',
] as const;
const VERIFIED_WORLD='verified_game_collection_area_item_membership';
const VERIFIED_UNIVERSE='verified_game_collection_universe_item_membership';

/** Empty means there is no verified filter; never show an empty zero-result tab. */
export function collectionScopeOptions(
  metadata:CollectionRuntimeMetadata|null,
  axis:CollectionScopeAxis,
  facets:readonly CollectionFacet[],
  locale:string,
):readonly CollectionScopeOption[]{
  if(!metadata)return [];
  const evidence=metadata.verifiedScopeMembership;
  if(axis==='world'&&evidence?.world!==VERIFIED_WORLD ||
     axis==='universe'&&evidence?.universe!==VERIFIED_UNIVERSE)return [];
  const ids=axis==='world'?metadata.worlds:metadata.universes;
  const labels=axis==='world'?metadata.worldLabels:metadata.universeLabels;
  if(ids.length!==labels.length)return [];
  const localeIndex=LOCALES.indexOf(locale as typeof LOCALES[number]);
  if(localeIndex<0)return [];
  const byId=new Map<string,CollectionFacet>();
  for(const facet of facets){
    if(facet.total>0&&Number.isSafeInteger(facet.total)&&
      facet.id&&typeof facet.label==='string'&&!byId.has(facet.id))
      byId.set(facet.id,facet);
  }
  const seen=new Set<string>();
  const options:CollectionScopeOption[]=[];
  for(let i=0;i<ids.length;i++){
    const id=ids[i];
    const facet=byId.get(id);
    const names=labels[i];
    const text=names?.[localeIndex]||names?.[0];
    if(!id||seen.has(id)||!facet||typeof text!=='string'||!text.trim())continue;
    seen.add(id);
    options.push(Object.freeze({id,label:text.trim(),total:facet.total}));
  }
  if(axis==='world'){
    const rank=(id:string)=>{
      const pos=NATIVE_WORLD_ORDER.indexOf(id as typeof NATIVE_WORLD_ORDER[number]);
      return pos<0?NATIVE_WORLD_ORDER.length:pos;
    };
    options.sort((a,b)=>rank(a.id)-rank(b.id));
  }
  return Object.freeze(options);
}

/** Only show per-item worlds/universes represented by reviewed Collection
 * membership options. Raw source Tag associations and unknown IDs are
 * deliberately not displayed as confirmed in-game Collection membership. */
export function collectionItemScopeLabels(
  item:Readonly<Pick<CollectionItem,'worlds'|'universes'>>|null,
  worlds:readonly CollectionScopeOption[],
  universes:readonly CollectionScopeOption[],
):Readonly<{worlds:readonly string[];universes:readonly string[]}>{
  const labelsFor=(ids:readonly string[],options:readonly CollectionScopeOption[])=>{
    const verified=new Map(options.map(option=>[option.id,option.label]));
    return Object.freeze([...new Set(ids)].flatMap(id=>{
      const label=verified.get(id);
      return label?[label]:[];
    }));
  };
  return Object.freeze({
    worlds:labelsFor(item?.worlds??[],worlds),
    universes:labelsFor(item?.universes??[],universes),
  });
}
