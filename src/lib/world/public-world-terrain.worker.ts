import {composeMainlandDesignFrame} from './mainland-design-frame.ts';
import type {TerrainRaster} from './terrain-binding.ts';
import {createSourceGeometryCache} from './source-object-map.ts';
import {fenceFamily,fenceFamilyCandidates} from './fence-family-catalog.ts';
import {fenceBaseDefinition} from './fence-design.ts';
import {sourceMapLayer} from './source-map-layers.ts';
import {sourceEditRestrictions,nativeActionBlocked} from './native-edit-restrictions.ts';
import {DESIGN_LIMIT,type DesignCatalogItem,type DesignItemGeometry} from './design-layout.ts';
import type {PublicCompleteItemMaster} from '../items/public-item-master.ts';
import type {WandLanguage} from '../ui/preferences.ts';
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
let master:Promise<PublicCompleteItemMaster>|null=null;
function getMaster(){
 return master??=(openPublicItemMaster(basePath,fetch,{scope:'complete',gameVersion:'1.26.2'}).catch(e=>{master=null;throw e;}));
}
let geometry:Promise<ReturnType<typeof publicShapeDefinitions>>|null=null;
async function loadGeometry(){
  if(!geometry)geometry=(async()=>{
    const db=await getMaster();
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
    if(data.command==='mainland-design-terrain'){
      const region=release?.entries.find(r=>r.scope===data.scope);if(!region)throw Error('mainland source');
      wasmReady??=init(wasmUrl).catch(e=>{wasmReady=null;throw e;});
      const [bundle]=await Promise.all([loadBundle(region),wasmReady]);
      const rasters=new Map<string,TerrainRaster>();
      for(const g of bundle.grids){
        const bytes=Uint8Array.from(atob(g.data),c=>c.charCodeAt(0));
        const values=decode_public_terrain(bytes,Uint32Array.from(g.palette),Uint32Array.from(g.counts),g.sizeX,g.sizeY,g.sha256);
        rasters.set(g.key,{sizeX:g.sizeX,sizeY:g.sizeY,nativeFloorValues:values});
      }
      const frame=composeMainlandDesignFrame(region.grids,rasters);
      scope.postMessage({kind:'mainland-design-terrain',requestId:id,worldScope:region.scope,frame},[frame.owners.buffer,frame.raster.nativeFloorValues.buffer]);
      return;
    }
    if(data.command==='indoor-shapes'){
      if(!release||(data.factor!==1&&data.factor!==2)||!Array.isArray(data.items)||data.items.length>5000)throw Error('indoor shape request');
      const cache=createSourceGeometryCache({manifest:{platform:'Steam',gameVersion:'1.26.2'},objects:await loadGeometry()},data.factor);
      const keys=new Set<string>();
      for(const row of data.items){
        if(!row||!Number.isSafeInteger(row.itemId)||row.itemId<1||row.itemId>0xffffffff||![0,4,8,12].includes(row.orientationCode))throw Error('indoor item');
        const key=row.itemId+':'+row.orientationCode;if(keys.has(key))continue;keys.add(key);
        cache.resolve(row.itemId,row.orientationCode);
      }
      scope.postMessage({kind:'indoor-shapes',requestId:id,shapes:cache.shapes});return;
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
    if(data.command==='fence-family'){
      const definitions=await loadGeometry(),source=publicShapeSource(grid,definitions),cache=createSourceGeometryCache(source,grid.factor);
      const q=grid.factor;
      const verifyFamily=(itemId:number)=>{
        const entry=fenceFamily(itemId),family=entry?.name.toLowerCase().replace(/[^a-z0-9]/g,'');
        if(!entry||!family)throw Error('unsupported family');
        const base=definitions.get(String(itemId));
        if(!base||!fenceBaseDefinition(itemId,base))throw Error('base');
        const shapeFor=(id:number,code:number,w:number,h:number)=>{
          const item=cache.resolve(id,code),shape=item.shapeKey?cache.shapes[item.shapeKey]:null;
          if(!shape||item.layer!=='fence'||shape.width!==w||shape.height!==h||shape.cellCount!==w*h||shape.runs.length!==h||!shape.runs.every((r,i)=>r.x===0&&r.y===i&&r.width===w))throw Error('fence shape');
          return shape;
        };
        const baseShape=shapeFor(itemId,8,q,q);
        if(baseShape.acceptedFloorTypesFlag===undefined)throw Error('fence mask');
        for(let k=1;k<=6;k++){
          const id=entry.ext[k-1],d=definitions.get(String(id)),name=String(d?.nativeName??'').toLowerCase().replace(/[^a-z0-9]/g,'');
          const f=d?.footprint as {sizeX?:number;sizeY?:number}|null|undefined;
          if(d?.nativeType!=='Furniture'||!name.includes(family)||!name.includes('ext')||name.includes('diag')||f?.sizeX!==k||f?.sizeY!==1)throw Error('fence variation');
          for(const [code,w,h] of [[8,k*q,q],[12,q,k*q]])if(shapeFor(id,code,w,h).acceptedFloorTypesFlag!==baseShape.acceptedFloorTypesFlag)throw Error('fence mask');
        }
        return baseShape.acceptedFloorTypesFlag;
      };
      const mask=verifyFamily(data.itemId);
      const options:number[]=[];
      if(data.replacement===undefined){for(const f of fenceFamilyCandidates){if(f.base===data.itemId)continue;try{if(verifyFamily(f.base)===mask)options.push(f.base);}catch{/* Not current-source verified; omit. */}}}
      const localized=new Map(await (await getMaster()).getBrowseNames(data.locale as WandLanguage));
      const replacementOptions=options.map(id=>({id,name:localized.get(id)??fenceFamily(id)!.name})).sort((a,b)=>a.name.localeCompare(b.name,data.locale));
      let replacementVerified=false;
      if(data.replacement!==undefined){
        if(data.replacement===data.itemId||verifyFamily(data.replacement)!==mask)throw Error('replacement mask');
        replacementVerified=true;
      }
      scope.postMessage({kind:'fence-family',requestId:id,key:grid.key,itemId:data.itemId,factor:q,verified:true,replacement:data.replacement,replacementVerified,replacementOptions});return;
    }
    if(data.command==='design-catalog'){
      const locale=data.locale as WandLanguage;
      const [definitions,names]=await Promise.all([loadGeometry(),(await getMaster()).getBrowseNames(locale)]);
      const localized=new Map(names),items:DesignCatalogItem[]=[];
      for(const [key,d] of definitions){
        const itemId=Number(key),footprint=d.footprint as {acceptedFloorTypesFlag?:number}|null;
        if(d.nativeType!=='Furniture'||!footprint||nativeActionBlocked(sourceEditRestrictions(d),'select'))continue;
        const layer=sourceMapLayer('Furniture',itemId,footprint.acceptedFloorTypesFlag??null);
        if(layer==='other'||layer==='fence'&&!fenceBaseDefinition(itemId,d))continue;
        items.push({itemId,name:localized.get(itemId)??String(d.nativeName??'Item '+itemId),layer});
      }
      items.sort((a,b)=>a.name.localeCompare(b.name,locale)||a.itemId-b.itemId);
      scope.postMessage({kind:'design-catalog',requestId:id,key:grid.key,items});return;
    }
    if(data.command==='design-shape'||data.command==='design-shapes'){
      const batch=data.command==='design-shapes';
      const ids:unknown=batch?data.itemIds:[data.itemId];
      if(!Array.isArray(ids)||ids.length>DESIGN_LIMIT||new Set(ids).size!==ids.length||!ids.every(id=>Number.isSafeInteger(id)&&id>=1&&id<=0xffffffff))throw Error('items');
      const definitions=await loadGeometry(),source=publicShapeSource(grid,definitions);
      const results:DesignItemGeometry[]=[];
      let runs=0;
      for(const itemId of ids as number[]){
        if(definitions.get(String(itemId))?.nativeType!=='Furniture')throw Error('item type');
        const cache=createSourceGeometryCache(source,grid.factor),item=cache.resolve(itemId,8);
        if(!item.shapeKey||item.layer==='other'||nativeActionBlocked(item.editRestrictions,'select'))throw Error('shape');
        for(const code of [0,4,12])cache.resolve(itemId,code);
        runs+=Object.values(cache.shapes).reduce((n,shape)=>n+shape.runs.length,0);
        if(runs>1_000_000)throw Error('geometry limit');
        results.push({itemId,name:item.name,layer:item.layer,surfaceCapable:item.surfaceCapable,editRestrictions:item.editRestrictions,shapes:cache.shapes});
      }
      scope.postMessage({kind:batch?'design-shapes':'design-shape',requestId:id,key:grid.key,result:batch?results:results[0]});return;
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
