/** Steam 1.26.2 mainland source-world transform.
 * Recovered directly from scene-village04_scenes_all.bundle, SHA256
 * e6e817cd85bc188b8307dffd039e9f85e82155a8a9ef274b570f206a738b9525.
 * Serialized scene CAB-0f89e6882802ea5e88312e79cd5ead53, SHA256
 * 6200afe5c8419e945cb5ce8ac73695e900feffeda2b8172f7b237bbe263aba20.
 * Eight GridScript components reference GridOrigins via local PPtr and
 * the exact GridData path. Every ancestor Transform is identity; all
 * eight origins have identity quaternion and unit scale.
 * MonoScript bundle SHA256 c0f5d54d2b03116dfb757d70e84531c99f54b9e9698947ae7ced7645709f9107
 * identifies Mdl.Grid.GridScript. Matching GameAssembly SHA256
 * a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653:
 * get_TileSize RVA E9FD80 returns the float constant .5 / factor;
 * GetWorldPosition RVA EA40F0 adds origin.position + right*X*TileSize
 * + forward*Y*TileSize; right/forward RVAs 7677F00/7678760. No offset.
 * These are source coordinates, not active collision or Save-write authority.
 */
import {DLC_ORIGIN_ROWS} from './dlc-world-origins.ts';
import type {PublicTerrainGridRef} from './public-terrain-projection.ts';
import type {MapExtent} from './map-camera.ts';
import type {TerrainRaster} from './terrain-binding.ts';
export interface MainlandOrigin {readonly gridDataPath:string;readonly position:readonly [number,number,number]}
const rows=[
 ['Urban','UrbanLevel-GridData.json',-37,9,-1],
 ['DarkMountains','DarkLevel-GridData.json',-167,15,39],
 ['Meadow','MeadowLevel-GridData.json',-61,6,-49],
 ['Savannah','SavannahLevel-GridData_BlockSpawn.json',-167,12,-9],
 ['Wetland','WetlandsLevel-GridData_BlockSpawning.json',-141,3,-153],
 ['Forest','ForestLevel-GridData_BlockSpawn.json',35,12,-9],
 ['Cliff','SnowLevel-GridData_BlockSpawn.json',49,15,51],
 ['Beach','BeachLevel-GridData.json',-37,0,-142],
] as const;
export const MAINLAND_ORIGINS:ReadonlyMap<string,MainlandOrigin>=new Map(rows.map(([key,path,x,y,z])=>[key,{gridDataPath:'GridData/Villages/Village04-'+path,position:[x,y,z] as const}]));
const worldOrigins=new Map<string,ReadonlyMap<string,MainlandOrigin>>([['Village04',new Map([...MAINLAND_ORIGINS.values()].map(o=>[o.gridDataPath,o]))]]);
for(const [scope,rows] of Object.entries(DLC_ORIGIN_ROWS))worldOrigins.set(scope,new Map(rows.map(([name,x,y,z])=>{const gridDataPath='GridData/Villages/'+scope+'/'+scope+'-'+name+'-GridData.json';return [gridDataPath,{gridDataPath,position:[x,y,z] as const}];})));
export function sourceWorldScope(grid:PublicTerrainGridRef):string{return grid.layoutId.split('/')[1]??'';}
export interface MainlandGrid extends PublicTerrainGridRef {readonly origin:MainlandOrigin;readonly bounds:MapExtent}
export function bindMainlandGrid(grid:PublicTerrainGridRef):MainlandGrid|null{
 const scope=sourceWorldScope(grid),origin=worldOrigins.get(scope)?.get(grid.gridDataPath);
 if(!origin||origin.gridDataPath!==grid.gridDataPath||!grid.layoutId.startsWith('SceneLayouts/'+scope+'/')||scope==='Village04'&&MAINLAND_ORIGINS.get(grid.key)!==origin||
   !(grid.factor===1||grid.factor===2)||!Number.isSafeInteger(grid.sizeX)||!Number.isSafeInteger(grid.sizeY)||grid.sizeX<1||grid.sizeY<1)return null;
 // Map coordinates are half-world-unit ticks. X=east, display Y=-Z.
 // Source rasters are untessellated; native save coordinates are tessellated.
 const [x,,z]=origin.position;
 return {...grid,origin,bounds:{x:2*x,y:-2*z-grid.sizeY,w:grid.sizeX,h:grid.sizeY}};
}
export function bindMainland(grids:readonly PublicTerrainGridRef[]):MainlandGrid[]|null{
 const scope=grids[0]?sourceWorldScope(grids[0]):'',expected=worldOrigins.get(scope);
 if(!expected||grids.length!==expected.size||new Set(grids.map(g=>g.key)).size!==grids.length||new Set(grids.map(g=>g.gridDataPath)).size!==grids.length||grids.some(g=>sourceWorldScope(g)!==scope))return null;
 const bound=grids.map(bindMainlandGrid);
 return bound.every((g):g is MainlandGrid=>g!==null)?bound:null;
}
/** A floating island grid has an independent source-local map plane. This
 * origin is a UI coordinate basis only, not a recovered scene/world origin.
 * Never combine two such planes or infer the offsets of secondary grids. */
export function bindFloatingIslandGrid(grid:PublicTerrainGridRef|null):MainlandGrid|null{
 if(!grid||!/^SceneLayouts\/FloatingIslands\/FloatingIsland_[A-Za-z]+\/FloatingIsland_[A-Za-z]+Layout\.json$/.test(grid.layoutId)||grid.layoutId.includes('_TEMPLATE')||
 !grid.gridDataPath.startsWith('GridData/FloatingIslands/')||!grid.gridDataPath.endsWith('-GridData.json')||grid.gridDataPath.includes('..')||
 !(grid.factor===1||grid.factor===2)||!Number.isSafeInteger(grid.sizeX)||!Number.isSafeInteger(grid.sizeY)||grid.sizeX<1||grid.sizeY<1||!Number.isSafeInteger(grid.gridIdNative)||grid.gridIdNative<0)return null;
 return {...grid,origin:{gridDataPath:grid.gridDataPath,position:[0,0,0]},bounds:{x:0,y:-grid.sizeY,w:grid.sizeX,h:grid.sizeY}};
}
export function mainlandExtent(grids:readonly MainlandGrid[]):MapExtent{
 if(!grids.length)return {x:0,y:0,w:1,h:1};
 const x=Math.min(...grids.map(g=>g.bounds.x)),y=Math.min(...grids.map(g=>g.bounds.y));
 return {x,y,w:Math.max(...grids.map(g=>g.bounds.x+g.bounds.w))-x,h:Math.max(...grids.map(g=>g.bounds.y+g.bounds.h))-y};
}
export function mainlandMapAnchor(g:MainlandGrid,x:number,y:number){
 return {x:2*g.origin.position[0]+x/g.factor,y:-2*g.origin.position[2]-y/g.factor};
}
export function mainlandLocalAnchor(g:MainlandGrid,x:number,y:number){
 const lx=(x-2*g.origin.position[0])*g.factor,ly=(-y-2*g.origin.position[2])*g.factor;
 if(!Number.isSafeInteger(lx)||!Number.isSafeInteger(ly)||lx<0||ly<0||lx>=g.sizeX*g.factor||ly>=g.sizeY*g.factor)return null;
 return {x:lx,y:ly};
}
/** A map navigation hit, not a placement validation. Never choose among
 * multiple nonzero overlapping original surfaces by arbitrary draw order. */
export function mainlandTerrainHits(grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,x:number,y:number):MainlandGrid[]{
 if(!Number.isFinite(x)||!Number.isFinite(y))return [];
 return grids.filter(g=>{
  const r=rasters.get(g.key);if(!r||r.sizeX!==g.sizeX||r.sizeY!==g.sizeY||r.nativeFloorValues.length!==g.sizeX*g.sizeY)return false;
  const lx=Math.floor(x-g.bounds.x),ly=Math.floor(-2*g.origin.position[2]-y);
  return lx>=0&&ly>=0&&lx<g.sizeX&&ly<g.sizeY&&r.nativeFloorValues[ly*g.sizeX+lx]!==0;
 });
}
