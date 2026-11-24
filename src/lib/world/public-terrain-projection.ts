/** Public game-only terrain projection, version matched. */
import type {ItemFieldRow} from '../items/item-field-reader.ts';
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const u32=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=0xffffffff;
const sha=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export interface PublicTerrainGrid{
  readonly key:string;readonly layoutId:string;readonly gridDataPath:string;readonly gridIdNative:number;
  readonly sizeX:number;readonly sizeY:number;readonly factor:1|2;readonly palette:readonly number[];
  readonly counts:readonly number[];readonly sha256:string;readonly data:string;
}
export interface PublicTerrainBundle{
  readonly schema:'wand.db04.terrain-projection@1';readonly platform:'Steam';readonly gameVersion:'1.26.2';
  readonly grids:readonly PublicTerrainGrid[];
}
export const PUBLIC_TERRAIN_PATH='ddv/world/steam-1.26.2/village04.json';
export function parsePublicTerrainBundle(value:unknown):PublicTerrainBundle{
  if(!record(value)||value.schema!=='wand.db04.terrain-projection@1'||value.platform!=='Steam'||value.gameVersion!=='1.26.2'||
    value.coordinateBasis!=='source_grid_local_y_major'||value.completeWorldCoverage!==false||value.placementLegalityVerified!==false||
    !sha(value.sourceGridSha256)||!sha(value.sourceLayoutSha256)||!Array.isArray(value.grids)||!value.grids.length||value.grids.length>2048)
    throw new TypeError('DB04_PUBLIC_TERRAIN_BUNDLE_INVALID');
  const keys=new Set<string>(),identities=new Set<string>();
  for(const g of value.grids){
    if(!record(g)||typeof g.key!=='string'||!g.key.length||g.key.length>256||keys.has(g.key)||
      typeof g.layoutId!=='string'||!g.layoutId.startsWith('SceneLayouts/')||!g.layoutId.endsWith('.json')||g.layoutId.includes('..')||
      typeof g.gridDataPath!=='string'||!g.gridDataPath.startsWith('GridData/')||!g.gridDataPath.endsWith('.json')||g.gridDataPath.includes('..')||
      !u32(g.gridIdNative)||!u32(g.sizeX)||!u32(g.sizeY)||g.sizeX<1||g.sizeY<1||g.sizeX*g.sizeY>250000||
      (g.factor!==1&&g.factor!==2)||!Array.isArray(g.palette)||!g.palette.length||g.palette.length>256||
      !g.palette.every((v,i)=>u32(v)&&(i===0||v>g.palette[i-1]))||!Array.isArray(g.counts)||g.counts.length!==g.palette.length||
      !g.counts.every(u32)||g.counts.reduce((a,b)=>a+b,0)!==g.sizeX*g.sizeY||!sha(g.sha256)||
      typeof g.data!=='string'||g.data.length>1_400_000||!/^[A-Za-z0-9+/]+={0,2}$/.test(g.data))
      throw new TypeError('DB04_PUBLIC_TERRAIN_GRID_INVALID');
    const id=g.layoutId+'\0'+g.gridIdNative;
    if(identities.has(id))throw new TypeError('DB04_PUBLIC_TERRAIN_GRID_DUPLICATE');
    keys.add(g.key);identities.add(id);
  }
  return value as unknown as PublicTerrainBundle;
}
/** Adapt only canonical DB-01 GridAreaData fields. No inferred dimensions,
 * absent floor flags or reconstructed state. All network reads are the same
 * public columns, independent of which objects occur in a local Save. */
export function publicShapeDefinitions(geometry:readonly ItemFieldRow[],categories:readonly ItemFieldRow[],names:readonly ItemFieldRow[]){
  const types=new Map(categories),labels=new Map(names),objects=new Map<string,Record<string,unknown>>();
  for(const [id,g] of geometry){
    const kind=types.get(id);
    if((kind!=='Furniture'&&kind!=='Building')||!record(g)||
      !u32(g.SizeX)||!u32(g.SizeY)||g.SizeX<1||g.SizeY<1||g.SizeX>256||g.SizeY>256||
      g.SizeX*g.SizeY>16384||!Array.isArray(g.Layers)||g.Layers.length!==g.SizeX*g.SizeY||
      !g.Layers.every(u32)||!u32(g.AcceptedFloorTypesFlag))continue;
    if(g.StrideOverride!==undefined&&(typeof g.StrideOverride!=='number'||!Number.isInteger(g.StrideOverride)||
      g.StrideOverride< -2147483648||g.StrideOverride>2147483647))continue;
    const stride=g.StrideOverride!==undefined;
    objects.set(String(id),{itemId:id,nativeType:kind,nativeName:typeof labels.get(id)==='string'?labels.get(id):null,
      footprint:{sizeX:g.SizeX,sizeY:g.SizeY,layerValues:g.Layers,acceptedFloorTypesFlag:g.AcceptedFloorTypesFlag,
        cellIndexToXYVerified:false,layerMaskSemanticsVerified:false,
        strideOverride:stride?g.StrideOverride:null,strideOverrideSourceVerified:stride,
        nativeWireFields:{sizeX:'6.1',sizeY:'6.2',layerValues:'6.3',acceptedFloorTypesFlag:'6.4',...(stride?{strideOverride:'6.5'}:{})}}});
  }
  // Definition-only items may still be classified without a fabricated footprint.
  for(const [id,kind] of categories)if((kind==='Furniture'||kind==='Building')&&!objects.has(String(id)))
    objects.set(String(id),{itemId:id,nativeType:kind,nativeName:typeof labels.get(id)==='string'?labels.get(id):null,footprint:null});
  return objects;
}
export function publicShapeSource(grid:PublicTerrainGrid,objects:Map<string,Record<string,unknown>>){
  return {manifest:{platform:'Steam',gameVersion:'1.26.2'},objects,
    layouts:new Map([[grid.layoutId,{layoutKind:'nativeGridCollection',
      nativeGridEntries:[{gridIdNative:grid.gridIdNative,gridDataPath:grid.gridDataPath,tessellationFactor:grid.factor,defaultObjectCount:0}]}]]),
    grids:new Map([[grid.gridDataPath,{sizeX:grid.sizeX,sizeY:grid.sizeY}]]),
    layoutObjectsByGrid:new Map()};
}
