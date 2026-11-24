import init,{decode_public_terrain} from './wasm/pkg/wand_world_core.js';
import wasmUrl from './wasm/pkg/wand_world_core_bg.wasm?url';
import {openPublicItemMaster} from '../items/public-item-master.ts';
import {parsePublicTerrainBundle,PUBLIC_TERRAIN_PATH,publicShapeDefinitions,publicShapeSource,type PublicTerrainBundle} from './public-terrain-projection.ts';
import {buildSavedShapeMap,parseSavedShapePoints} from './saved-shape-map.ts';
const scope=self as unknown as {onmessage:((e:MessageEvent)=>void)|null;postMessage:(data:unknown,transfer?:Transferable[])=>void};
let bundle:PublicTerrainBundle|null=null;
let basePath='';
let geometry:Promise<ReturnType<typeof publicShapeDefinitions>>|null=null;
async function loadGeometry(){
  if(!geometry)geometry=(async()=>{
    const db=await openPublicItemMaster(basePath,fetch,{scope:'complete',gameVersion:'1.26.2'});
    const [area,categories,names]=await Promise.all([db.getFieldRows('source.GridAreaData'),db.getFieldRows('nativeCategory'),db.getFieldRows('nativeKey')]);
    return publicShapeDefinitions(area,categories,names);
  })().catch(e=>{geometry=null;throw e;});
  return geometry;
}
scope.onmessage=async({data})=>{
  const id=data?.requestId;
  if(!Number.isSafeInteger(id)||id<1)return;
  try{
    if(data.command==='open'){
      if(typeof data.base!=='string'||!/^\/?(?:[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)?$/.test(data.base))throw Error('base');
      basePath=data.base;
      const response=await fetch(basePath+'/'+PUBLIC_TERRAIN_PATH);
      if(!response.ok)throw Error('source');
      bundle=parsePublicTerrainBundle(await response.json());
      scope.postMessage({kind:'index',requestId:id,grids:bundle.grids.map(({data,palette,counts,sha256,...g})=>g)});
      return;
    }
    const grid=bundle?.grids.find(g=>g.key===data.key);
    if(!grid)throw Error('grid');
    if(data.command==='terrain'){
      await init(wasmUrl);
      const bytes=Uint8Array.from(atob(grid.data),c=>c.charCodeAt(0));
      const values=decode_public_terrain(bytes,Uint32Array.from(grid.palette),Uint32Array.from(grid.counts),grid.sizeX,grid.sizeY,grid.sha256);
      scope.postMessage({kind:'terrain',requestId:id,key:grid.key,sizeX:grid.sizeX,sizeY:grid.sizeY,nativeFloorValues:values},[values.buffer]);
      return;
    }
    if(data.command==='shapes'){
      const points=parseSavedShapePoints(data.points);
      const source=publicShapeSource(grid,await loadGeometry());
      const result=buildSavedShapeMap(source,grid.layoutId,grid.gridIdNative,points);
      scope.postMessage({kind:'shapes',requestId:id,key:grid.key,result});return;
    }
    throw Error('command');
  }catch{scope.postMessage({kind:'error',requestId:id});}
};
