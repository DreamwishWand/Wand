/** Collection view scopes. A source Tag reference or CollectionArea enum alone
 * is NOT proof of game CollectionArea -> Item membership.
 * This module only enables filters backed by explicit, reviewed per-Item scope
 * membership in the currently loaded catalog.
 */
import type {CollectionFacet,CollectionRuntimeMetadata} from './runtime.ts';

export interface CollectionScopeOption {
  readonly id:string;
  readonly label:string;
  readonly total:number;
}
export type CollectionScopeAxis='world'|'universe';
const LOCALES=['en','fr','it','de','es-ES','ja','zh-CN','pt-BR'] as const;
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
  return Object.freeze(options);
}
