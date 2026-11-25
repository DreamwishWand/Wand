import type {ExploreItem} from './model.ts';
export type DecorationScope='outdoor'|'indoor'|'all';
export const DECORATION_SCOPE_KEY='dreamwishwand.explore.scope.v1';
export function readDecorationScope(value:unknown):DecorationScope{
  return value==='indoor'||value==='all'?value:'outdoor';
}
export const CATEGORY_KEYS=['seating','table','bed','storage','lighting','equipment','decor','rug','wall','ceiling','window-door','other','landscaping','path','fence','buildings','wallpaper','flooring','environment'] as const;
export type ExploreCategory=typeof CATEGORY_KEYS[number];
const kindGroups:Readonly<Record<string,ExploreCategory>>={
  Seating:'seating',Table:'table',Bed:'bed',Storage:'storage',Lighting:'lighting',
  Appliance:'equipment',Electronic:'equipment',Utility:'equipment',Essential:'equipment',
  Decor:'decor',Art:'decor',Foliage:'decor',Rug:'rug',Wall:'wall',CeilingDecoration:'ceiling',
  Window:'window-door',Door:'window-door',Landscaping:'landscaping',Rocks:'landscaping',
  Trees:'landscaping',Underbrush:'landscaping',Pathing:'path',Fencing:'fence',Ride:'other',
  Misc:'other'
};
const kinds=(i:ExploreItem)=>i.tags.filter(([facet])=>facet==='furnitureKind').map(([,key])=>key.replace(/^F_/,''));
export function categoriesOf(i:ExploreItem):ExploreCategory[]{
  if(i.nativeCategory==='Trimming')return [i.subtype===0?'wallpaper':'flooring'];
  if(i.nativeCategory==='Building'||i.nativeCategory==='Skin'&&i.subtype!==3)return ['buildings'];
  if(i.nativeCategory==='Environment'||i.nativeCategory==='Skin'&&i.subtype===3)return ['environment'];
  if(i.subtype===1)return ['path'];
  if(i.subtype===2)return ['landscaping'];
  if(i.subtype===3)return ['window-door'];
  if(i.subtype===7)return ['fence'];
  const found=[...new Set(kinds(i).flatMap(k=>kindGroups[k]?[kindGroups[k]]:[]))];
  return found.length?found:['other'];
}
/** Browse-only dedicated types, not a claim of engine placement legality.
 * Unknown and multipurpose records remain visible in both modes. */
export function dedicatedScope(i:ExploreItem):'indoor'|'outdoor'|'unknown'{
  if(i.placementScope==='indoor'||i.placementScope==='outdoor')return i.placementScope;
  if(i.placementScope==='both'||i.placementScope==='unknown')return 'unknown';
  const source=i.sourcePlacement?.ordinaryScope;
  if(source){
    // A source hint describes the ordinary decoration contexts, not every
    // special realm or a legal grid cell. Keep unknown/special and shared
    // items in both views instead of falling back to a furniture-kind guess.
    if(source.scopeHint==='indoor'&&source.roomFloorWallCandidate===true&&source.terrainCandidate===false)return 'indoor';
    if(source.scopeHint==='outdoor'&&source.roomFloorWallCandidate===false&&source.terrainCandidate===true)return 'outdoor';
    return 'unknown';
  }
  // Compatibility for catalogs which predate the source scope projection.
  if(i.nativeCategory==='Trimming'||i.nativeCategory==='Furniture'&&i.subtype===3)return 'indoor';
  if(i.nativeCategory==='Furniture'&&[1,2,7].includes(i.subtype))return 'outdoor';
  if(i.nativeCategory==='Furniture'&&kinds(i).some(k=>['Wall','CeilingDecoration','Window','Door'].includes(k)))return 'indoor';
  return 'unknown';
}
export function matchesScope(i:ExploreItem,scope:DecorationScope):boolean{
  const dedicated=dedicatedScope(i);
  return scope==='all'||dedicated==='unknown'||dedicated===scope;
}
