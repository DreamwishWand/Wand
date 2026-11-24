/** Presentation-only layers for source-native object maps. Native category
 * is taken from the original definition, not inferred from an item name.
 * Furniture subtype arithmetic is the DB-01 IL2CPP item-types contract:
 * floor((ItemID % 10,000,000) / 100,000), verified in Steam 1.26.2.
 * Surface acceptance is an item capability, NOT evidence of a support link.
 * No layer changes edit permission or removes another object. */
export type MapObjectLayer='ground'|'fence'|'landscape'|'furniture'|'surface'|'other';
export type MapSelectionLayer='all'|MapObjectLayer;
export const MAP_OBJECT_LAYERS:readonly MapObjectLayer[]=
  ['ground','landscape','furniture','fence','surface','other'];
export const MAP_LAYER_LABELS:Readonly<Record<MapSelectionLayer,string>>={
  all:'すべて',ground:'道・地面',fence:'フェンス',landscape:'景観',
  furniture:'家具',surface:'支持面対応',other:'その他・未分類'};
export const MAP_LAYER_COLORS:Readonly<Record<MapObjectLayer,string>>={
  ground:'#a49a89',fence:'#c1b3a4',landscape:'#739bb2',
  furniture:'#6c9bc9',surface:'#b99ad8',other:'#a7aeb9'};
export function sourceMapLayer(nativeType:string|null,itemId:number,
    acceptedFloorTypesFlag:number|null):MapObjectLayer{
  if(nativeType==='Building')return 'other';
  if(nativeType!=='Furniture')return 'other';
  const subtype=Math.floor((itemId%10_000_000)/100_000);
  if(subtype===1)return 'ground';
  if(subtype===7)return 'fence';
  if(subtype===2)return 'landscape';
  // Surface-only is useful to draw over furniture. Mixed floor/surface
  // items retain their ordinary furniture category and can be selected
  // with either filter. No actual height or parent is asserted.
  if(acceptedFloorTypesFlag===4096)return 'surface';
  if([0,3,5,6,8,9].includes(subtype))return 'furniture';
  return 'other';
}
export function sourceSurfaceCapable(flag:number|null):boolean{
  return flag!==null&&(flag&4096)!==0;
}
export interface MapLayerItem {readonly layer:MapObjectLayer;readonly surfaceCapable:boolean}
export function matchesSelectionLayer(object:MapLayerItem,layer:MapSelectionLayer):boolean{
  return layer==='all'||object.layer===layer||(layer==='surface'&&object.surfaceCapable);
}
/** Painter order does not encode physical height; selected layer changes
 * pick priority, never visibility. Stable source order within a group. */
export function mapPainterOrder<T extends MapLayerItem>(objects:readonly T[]):T[]{
  return [...objects].sort((a,b)=>MAP_OBJECT_LAYERS.indexOf(a.layer)-MAP_OBJECT_LAYERS.indexOf(b.layer));
}
export function prioritizeMapHits<T extends MapLayerItem>(objects:readonly T[],layer:MapSelectionLayer):T[]{
  return [...objects].sort((a,b)=>Number(matchesSelectionLayer(b,layer))-Number(matchesSelectionLayer(a,layer)));
}
