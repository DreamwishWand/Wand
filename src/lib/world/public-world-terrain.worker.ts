import init,{decode_public_terrain} from './wasm/pkg/wand_world_core.js';
import wasmUrl from './wasm/pkg/wand_world_core_bg.wasm?url';
import {openPublicItemMaster} from '../items/public-item-master.ts';
import {parsePublicTerrainBundle,parsePublicTerrainRelease,sameTerrainGrid,PUBLIC_TERRAIN_ROOT,publicShapeDefinitions,publicShapeSource,type PublicTerrainBundle,type PublicTerrainRelease,type PublicTerrainRegion} from './public-terrain-projection.ts';
import {buildSavedShapeMap,parseSavedShapePoints} from './saved-shape-map.ts';
const scope=self as unknown as {onmessage:((e:MessageEvent)=>void)|null;postMessage:(data:unknown,transfer?:Transferable[])=>void};
let release:PublicTerrainRelease|null=null;
const bundles=new Map<string,Promise<PublicTerrainBundle>>();
let wasmReady:Promise<unknown>|null=null;
async function loadBundle(region:PublicTerrainRegion){
 let pending=bundles.get(region.scope);
 if(!pending){
  pending=(async()=>{
   const response=await fetch(basePath+'/'+PUBLIC_TERRAIN_ROOT+'/'+region.path);
   if(!response.ok)throw Error('region');
   const raw=await response.arrayBuffer();
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),b=>b.toString(16).padStart(2,'0')).join('');
   if(hash!==region.sha256)throw Error('region digest');
   const result=parsePublicTerrainBundle(JSON.parse(new TextDecoder().decode(raw)));
   if(result.grids.length!==region.grids.length||!result.grids.every((g,i)=>sameTerrainGrid(g,region.grids[i])))throw Error('region index mismatch');
   return result;
  })().catch(e=>{bundles.delete(region.scope);throw e;});
  bundles.set(region.scope,pending);
 }
 return pending;
}
let basePath='';
let geometry:Promise<ReturnType<typeof publicShapeDefinitions>>|null=null;
async function loadGeometry(){
  if(!geometry)geometry=(async()=>{
    const db=await openPublicItemMaster(basePath,fetch,{scope:'complete',gameVersion:'1.26.2'});
    const [area,categories,names,restrictions]=await Promise.all([db.getFieldRows('source.GridAreaData'),db.getFieldRows('nativeCategory'),db.getFieldRows('nativeKey'),db.getFieldRows('source.GridEditRestriction')]);
    return publicShapeDefinitions(area,categories,names,restrictions);
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
      const response=await fetch(basePath+'/'+PUBLIC_TERRAIN_ROOT+'/index.json');
      if(!response.ok)throw Error('source');
      release=parsePublicTerrainRelease(await response.json());
      scope.postMessage({kind:'index',requestId:id,grids:release.entries.flatMap(region=>region.grids.map(g=>({...g,scope:region.scope}))) });
      return;
    }
    const region=release?.entries.find(r=>r.grids.some(g=>g.key===data.key));
    const grid=region?.grids.find(g=>g.key===data.key);
    if(!grid||!region)throw Error('grid');
    if(data.command==='terrain'){
      wasmReady??=init(wasmUrl).catch(e=>{wasmReady=null;throw e;});
      const [bundle]=await Promise.all([loadBundle(region),wasmReady]);
      const full=bundle.grids.find(g=>g.key===grid.key);
      if(!full)throw Error('grid payload');
      const bytes=Uint8Array.from(atob(full.data),c=>c.charCodeAt(0));
      const values=decode_public_terrain(bytes,Uint32Array.from(full.palette),Uint32Array.from(full.counts),grid.sizeX,grid.sizeY,full.sha256);
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
