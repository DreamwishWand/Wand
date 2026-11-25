import type {ExploreItem} from './model.ts';
export type DecorationScope='outdoor'|'indoor'|'all';
export const DECORATION_SCOPE_KEY='dreamwishwand.explore.scope.v1';
export function readDecorationScope(value:unknown):DecorationScope{
  return value==='indoor'||value==='all'?value:'outdoor';
}
export const CATEGORY_KEYS=['seating','table','bed','storage','lighting','equipment','decor','rug','wall','ceiling','window-door','other','landscaping','path','fence','buildings','wallpaper','flooring','environment'] as const;
export type ExploreCategory=typeof CATEGORY_KEYS[number];
const kindGroups:Readonly<Record<string,ExploreCategory>>={
  Seating:'seating',Chair:'seating',Sofa:'seating',Table:'table',Bed:'bed',Storage:'storage',Lighting:'lighting',
  Appliance:'equipment',Appliances:'equipment',Electronic:'equipment',Electronics:'equipment',Utility:'equipment',Essential:'equipment',
  Decor:'decor',Decoration:'decor',Art:'decor',Foliage:'decor',Plant:'decor',Plants:'decor',Rug:'rug',Wall:'wall',CeilingDecoration:'ceiling',
  Window:'window-door',Door:'window-door',Landscaping:'landscaping',Rocks:'landscaping',
  Trees:'landscaping',Underbrush:'landscaping',Pathing:'path',Fencing:'fence',Ride:'equipment',
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
  if(i.subtype===8||i.subtype===9)return ['equipment'];
  const found=[...new Set(kinds(i).flatMap(k=>kindGroups[k]?[kindGroups[k]]:[]))];
  const meaningful=found.filter(k=>k!=='other');
  return meaningful.length?meaningful:['other'];
}
/** Browse-only dedicated types, not a claim of engine placement legality.
 * Unknown and multipurpose records remain visible in both modes. */
export function dedicatedScope(i:ExploreItem):'indoor'|'outdoor'|'unknown'{
  if(i.placementScope==='indoor'||i.placementScope==='outdoor')return i.placementScope;
  if(i.placementScope==='both')return 'unknown';
  // Dedicated non-grid room finishes are separate original native types.
  if(i.nativeCategory==='Trimming')return 'indoor';
  const source=i.sourcePlacement;
  if(source?.placementLegalityVerified===false){
    // Floor classes are original mask comparisons, NOT runtime permissions.
    // A surface-only / mixed/special/unknown mask must not be treated as exclusive.
    const mask=source.acceptedFloorMask;
    if(typeof mask==='number'&&Number.isSafeInteger(mask)&&mask>0&&mask<=0xffffffff&&
      (mask&0xc0000000)===0&&(mask&(262144|1048576|2097152))===0){
      if(source.floorClass==='terrain_and_floor_wall')return 'unknown';
      if(!source.surface&&source.floorClass==='terrain_only')return 'outdoor';
      if(!source.surface&&source.floorClass==='floor_wall_only')return 'indoor';
    }
    return 'unknown';
  }
  if(i.nativeCategory==='Furniture'&&i.subtype===3)return 'indoor';
  if(i.nativeCategory==='Furniture'&&[1,2,7].includes(i.subtype))return 'outdoor';
  // A wall/ceiling/window tag alone is not evidence of exclusive placement.
  return 'unknown';
}
export function matchesScope(i:ExploreItem,scope:DecorationScope):boolean{
  const dedicated=dedicatedScope(i);
  return scope==='all'||dedicated==='unknown'||dedicated===scope;
}

export const BROWSE_TYPES=['furniture','landscaping','path','fence','buildings','environment','wall','ceiling','window-door','wallpaper','flooring'] as const;
export type BrowseType=typeof BROWSE_TYPES[number];
export function browseType(i:ExploreItem):BrowseType{
  const cats=categoriesOf(i);
  for(const type of ['landscaping','path','fence','buildings','environment','wallpaper','flooring','window-door','ceiling','wall'] as const)
    if(cats.includes(type))return type;
  return 'furniture';
}
/** For non-furniture lists, source subtype / tag groups replace arbitrary
 * universe headings. Keep one item in one primary group. */
export function browseSection(i:ExploreItem):string{
  const type=browseType(i);
  if(type==='buildings'||type==='environment'){
    if(i.nativeCategory==='Skin')return 'type:skin:'+i.subtype;
    if(i.nativeCategory==='Building')return 'type:building:'+i.subtype;
    return 'type:environment';
  }
  if(type==='landscaping'){
    const keys=kinds(i);
    for(const k of ['Trees','Underbrush','Rocks','Underwater','Elevated','HighGround'])if(keys.includes(k))return 'tag:'+k;
  }
  return 'type:'+type;
}
