import {roomFinishRecordValid,type RoomFinishKind,type RoomFinishItem} from './room-finish-design.ts';
import {roomDesignTemplates,supportDesignTemplate,type RoomDesignTemplate} from './room-design.ts';
import {parseAreaScene} from './area-scene.ts';
import {parseSupportScene,parseMixedScene,SCENE_FURNITURE_LIMIT,SCENE_SUPPORT_TREE_LIMIT} from './support-scene.ts';
import {supportPlacementFits,type SupportTree} from './subgrid-local.ts';
import {CARDINAL_ORIENTATIONS} from './saved-map-transform.ts';
import {composeMainlandDesignFrame} from './mainland-design-frame.ts';
import type {TerrainRaster} from './terrain-binding.ts';
import {createSourceGeometryCache} from './source-object-map.ts';
import {fenceFamily,fenceFamilyCandidates} from './fence-family-catalog.ts';
import {fenceBaseDefinition,fencePitch} from './fence-design.ts';
import {roadPitch} from './road-design.ts';
import {sourceMapLayer} from './source-map-layers.ts';
import {sourceEditRestrictions,nativeActionBlocked} from './native-edit-restrictions.ts';
import {DESIGN_LIMIT,type DesignCatalogItem,type DesignItemGeometry} from './design-layout.ts';
import type {PublicCompleteItemMaster} from '../items/public-item-master.ts';
import type {WandLanguage} from '../ui/preferences.ts';
import init,{decode_public_terrain} from './wasm/pkg/wand_world_core.js';
import wasmUrl from './wasm/pkg/wand_world_core_bg.wasm?url';
import {openPublicItemMaster} from '../items/public-item-master.ts';
import {parsePublicTerrainBundle,parsePublicTerrainRelease,sameTerrainGrid,PUBLIC_TERRAIN_ROOT,publicShapeDefinitions,publicShapeSource,type PublicTerrainBundle,type PublicTerrainRelease,type PublicTerrainRegion} from './public-terrain-projection.ts';
import {supportTerrainRow} from './subgrid-local.ts';
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
let supportCatalog:Promise<unknown>|null=null;
let roomTemplates:Promise<RoomDesignTemplate[]>|null=null;
function loadRoomTemplates(){return roomTemplates??=(fetch(basePath+'/'+PUBLIC_TERRAIN_ROOT+'/room-terrain.json').then(r=>{if(!r.ok)throw Error('room terrain');return r.json();}).then(roomDesignTemplates).catch(e=>{roomTemplates=null;throw e;}));}
let supportPaths:Promise<Map<number,unknown>>|null=null;
async function boundSupportTerrain(path:unknown,owner:unknown){
 if(typeof path!=='string'||!/^GridData\/Furniture\/[A-Za-z0-9_./ -]+\.json$/.test(path)||path.includes('..')||typeof owner!=='number'||!Number.isSafeInteger(owner))return null;
 supportPaths??=getMaster().then(db=>db.getFieldRows('source.SubGrid')).then(rows=>new Map(rows)).catch(e=>{supportPaths=null;throw e;});
 const value=(await supportPaths).get(owner) as {SubGrid?:{SubGridDataPath?:string}}|undefined;
 if(value?.SubGrid?.SubGridDataPath!==path)return null;
 supportCatalog??=fetch(basePath+'/'+PUBLIC_TERRAIN_ROOT+'/support-terrain.json').then(r=>{if(!r.ok)throw Error('support data');return r.json();}).catch(e=>{supportCatalog=null;throw e;});
 return supportTerrainRow(await supportCatalog,path);
}
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
    if(data.command==='indoor-catalog'){
      if(!release||!Array.isArray(data.itemIds)||data.itemIds.length>20000||!data.itemIds.every((n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&Math.floor(n/100000)===400)||![1024,2048,3072].includes(data.mask))throw Error('indoor stock catalog');
      supportPaths??=getMaster().then(db=>db.getFieldRows('source.SubGrid')).then(rows=>new Map(rows)).catch(e=>{supportPaths=null;throw e;});
      const definitions=await loadGeometry(),subgrids=await supportPaths,names=new Map(await (await getMaster()).getBrowseNames(data.locale as WandLanguage));
      const items:{itemId:number;name:string}[]=[];
      for(const id of new Set<number>(data.itemIds)){
        const def=definitions.get(String(id)),shape=def?.footprint as {acceptedFloorTypesFlag?:number}|null,rule=sourceEditRestrictions(def);
        if(!def||def.nativeType!=='Furniture'||!shape||!((shape.acceptedFloorTypesFlag??0)&data.mask)||subgrids.has(id)||nativeActionBlocked(rule,'select')||nativeActionBlocked(rule,'move')||nativeActionBlocked(rule,'remove'))continue;
        items.push({itemId:id,name:names.get(id)??String(def.nativeName??'—')});
      }
      items.sort((a,b)=>a.name.localeCompare(b.name,data.locale)||a.itemId-b.itemId);scope.postMessage({kind:'indoor-catalog',requestId:id,items});return;
    }
    if(data.command==='support-catalog'){
      if(!release||!Array.isArray(data.itemIds)||data.itemIds.length>20000||!data.itemIds.every((n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&Math.floor(n/100000)===400))throw Error('stock catalog');
      const terrain=await boundSupportTerrain(data.sourcePath,data.ownerItemId);if(!terrain)throw Error('support path');
      const definitions=await loadGeometry(),subgrids=await supportPaths!,names=new Map(await (await getMaster()).getBrowseNames(data.locale as WandLanguage));
      const mask=terrain.nativeFloorValues.reduce((v,n)=>v|n,0),items:{itemId:number;name:string}[]=[];
      for(const id of new Set<number>(data.itemIds)){
        const def=definitions.get(String(id)),shape=def?.footprint as {acceptedFloorTypesFlag?:number}|null,rule=sourceEditRestrictions(def);
        if(!def||def.nativeType!=='Furniture'||!shape||!((shape.acceptedFloorTypesFlag??0)&mask)||subgrids.has(id)||nativeActionBlocked(rule,'select')||nativeActionBlocked(rule,'move')||nativeActionBlocked(rule,'remove'))continue;
        items.push({itemId:id,name:names.get(id)??String(def.nativeName??'—')});
      }
      items.sort((a,b)=>a.name.localeCompare(b.name,data.locale)||a.itemId-b.itemId);
      scope.postMessage({kind:'support-catalog',requestId:id,items});return;
    }
    if(data.command==='support-scene-geometry'||data.command==='mixed-scene-geometry'||data.command==='area-scene-geometry'){
      if(!release)throw Error('source');
      const mixed=data.command==='mixed-scene-geometry'?parseMixedScene(JSON.stringify(data.scene)):null;
      const area=data.command==='area-scene-geometry'?parseAreaScene(JSON.stringify(data.scene)):null;
      const single=mixed||area?null:parseSupportScene(JSON.stringify(data.scene));
      const definitions=await loadGeometry();let total=0,treeCount=0;
      const itemIds=new Set<number>();
      supportPaths??=getMaster().then(db=>db.getFieldRows('source.SubGrid')).then(rows=>new Map(rows)).catch(e=>{supportPaths=null;throw e;});
      const paths=await supportPaths;
      async function check(owner:number,t:SupportTree,depth:number):Promise<boolean>{
        if(depth>8||!t.sourcePath)return false;
        const terrain=await boundSupportTerrain(t.sourcePath,owner);if(!terrain)return false;
        const cache=createSourceGeometryCache({manifest:{platform:'Steam',gameVersion:'1.26.2'},objects:definitions},t.factor);
        for(const o of t.objects){
          if(++total>SCENE_FURNITURE_LIMIT||++treeCount>SCENE_SUPPORT_TREE_LIMIT)return false;itemIds.add(o.itemId);
          const code=CARDINAL_ORIENTATIONS.indexOf(o.orientation as typeof CARDINAL_ORIENTATIONS[number])*4;
          const p=cache.resolve(o.itemId,code);
          if(!p.shapeKey||p.layer!=='furniture'||nativeActionBlocked(p.editRestrictions,'select')||nativeActionBlocked(p.editRestrictions,'move')||nativeActionBlocked(p.editRestrictions,'remove'))return false;
          const source=(await supportPaths!).get(o.itemId) as {SubGrid?:{SubGridDataPath?:string}}|undefined;
          if(o.child?source?.SubGrid?.SubGridDataPath!==o.child.sourcePath:!!source?.SubGrid?.SubGridDataPath||p.surfaceCapable)return false;
        }
        const staged:SupportTree={...t,objects:[]};
        for(const o of t.objects){
          if(!supportPlacementFits(staged,cache.shapes,terrain,o.itemId,o.x,o.y,o.orientation))return false;
          staged.objects.push(o);if(o.child&&!await check(o.itemId,o.child,depth+1))return false;
        }
        return true;
      }
      let valid=true;
      const roots=area?area.items.filter(p=>!p.network):mixed?mixed.items:single?[{itemId:single.ownerItemId,support:single}]:[];
      for(const root of roots){
        treeCount=1;itemIds.add(root.itemId);if(++total>SCENE_FURNITURE_LIMIT){valid=false;break;}
        const source=paths.get(root.itemId) as {SubGrid?:{SubGridDataPath?:string}}|undefined;
        if(root.support?!await check(root.itemId,root.support.tree,0):!!source?.SubGrid?.SubGridDataPath){valid=false;break;}
      }
      const names=valid&&typeof data.locale==='string'?new Map(await (await getMaster()).getBrowseNames(data.locale as WandLanguage)):new Map<number,string>();
      scope.postMessage({kind:data.command,requestId:id,valid,names:[...itemIds].flatMap(itemId=>names.has(itemId)?[[itemId,names.get(itemId)]]:[])});return;
    }
    if(data.command==='indoor-shapes'||data.command==='support-shapes'){
      if(!release||(data.factor!==1&&data.factor!==2)||!Array.isArray(data.items)||data.items.length>5000)throw Error('indoor shape request');
      const cache=createSourceGeometryCache({manifest:{platform:'Steam',gameVersion:'1.26.2'},objects:await loadGeometry()},data.factor);
      const keys=new Set<string>(),editable=new Set<number>(),removable=new Set<number>();
      for(const row of data.items){
        if(!row||!Number.isSafeInteger(row.itemId)||row.itemId<1||row.itemId>0xffffffff||![0,4,8,12].includes(row.orientationCode))throw Error('indoor item');
        const key=row.itemId+':'+row.orientationCode;if(keys.has(key))continue;keys.add(key);
        const obj=cache.resolve(row.itemId,row.orientationCode);
        if(obj.shapeKey&&!nativeActionBlocked(obj.editRestrictions,'select')&&!nativeActionBlocked(obj.editRestrictions,'move')&&!nativeActionBlocked(obj.editRestrictions,'rotate'))editable.add(row.itemId);
        if(obj.shapeKey&&!nativeActionBlocked(obj.editRestrictions,'select')&&!nativeActionBlocked(obj.editRestrictions,'remove'))removable.add(row.itemId);
      }
      let terrain:TerrainRaster|null=null;
      if(data.command==='support-shapes'){try{terrain=await boundSupportTerrain(data.sourcePath,data.ownerItemId);}catch{/* Unsupported source path is read-only. */}}
      scope.postMessage({kind:data.command,requestId:id,shapes:cache.shapes,editable:[...editable],removable:[...removable],...(data.command==='support-shapes'?{terrain}:{})});return;
    }
    if(data.command==='room-finish-catalog'){
      if(!release||!['floor','wall'].includes(data.kind))throw Error('finish kind');
      const kind=data.kind as RoomFinishKind,locale=data.locale as WandLanguage,db=await getMaster();
      const names=new Map(await db.getBrowseNames(locale)),ids=await db.findItemIdsByFields([{field:'itemType.code',anyOf:[{kind:'equals',value:16}]},{field:'itemType.subtypeCode',anyOf:[{kind:'equals',value:kind==='floor'?1:0}]}]);
      const items:RoomFinishItem[]=[];
      for(let i=0;i<ids.length;i+=128){for(const item of await db.getItems(ids.slice(i,i+128))){if(item&&roomFinishRecordValid(item,kind))items.push({itemId:item.itemId,name:names.get(item.itemId)??item.names[locale]??'—'});}}
      items.sort((a,b)=>a.name.localeCompare(b.name,locale)||a.itemId-b.itemId);scope.postMessage({kind:'room-finish-catalog',requestId:id,surface:kind,items});return;
    }
    if(data.command==='support-design-templates'){
      if(!release)throw Error('source');
      supportPaths??=getMaster().then(db=>db.getFieldRows('source.SubGrid')).then(rows=>new Map(rows)).catch(e=>{supportPaths=null;throw e;});
      supportCatalog??=fetch(basePath+'/'+PUBLIC_TERRAIN_ROOT+'/support-terrain.json').then(r=>{if(!r.ok)throw Error('support data');return r.json();}).catch(e=>{supportCatalog=null;throw e;});
      const [paths,raw,names,defs]=await Promise.all([supportPaths,supportCatalog,getMaster().then(db=>db.getBrowseNames(data.locale as WandLanguage)),loadGeometry()]);
      const labels=new Map(names),templates:RoomDesignTemplate[]=[];
      for(const [owner,value] of paths){const path=(value as {SubGrid?:{SubGridDataPath?:string}}|undefined)?.SubGrid?.SubGridDataPath,def=defs.get(String(owner));if(!path||def?.nativeType!=='Furniture'||nativeActionBlocked(sourceEditRestrictions(def),'select'))continue;const t=supportDesignTemplate(raw,owner,path,labels.get(owner)??String(def.nativeName??'—'));if(t)templates.push(t);}
      templates.sort((a,b)=>a.label.localeCompare(b.label,data.locale)||a.ownerItemId!-b.ownerItemId!);scope.postMessage({kind:'support-design-templates',requestId:id,templates});return;
    }
    if(data.command==='room-design-templates'){
      if(!release)throw Error('source');scope.postMessage({kind:'room-design-templates',requestId:id,templates:await loadRoomTemplates()});return;
    }
    if(typeof data.key==='string'&&data.key.startsWith('room-design:')&&['design-catalog','design-shape','design-shapes'].includes(data.command)){
      let template:RoomDesignTemplate|undefined;
      if(data.key.startsWith('room-design:support:')){
        const match=/^room-design:support:(\d+):(GridData\/Furniture\/[^:]+):[a-f0-9]{64}$/.exec(data.key);if(!match)throw Error('support template');
        const owner=Number(match[1]),path=match[2];if(!await boundSupportTerrain(path,owner))throw Error('support template');
        template=supportDesignTemplate(await supportCatalog!,owner,path,'—')??undefined;
        if(template?.grid.key!==data.key)throw Error('support template digest');
      }else template=(await loadRoomTemplates()).find(t=>t.grid.key===data.key);
      if(!template)throw Error('room template');
      const {grid,raster}=template,mask=raster.nativeFloorValues.reduce((a,b)=>a|b,0),definitions=await loadGeometry();
      supportPaths??=getMaster().then(db=>db.getFieldRows('source.SubGrid')).then(rows=>new Map(rows)).catch(e=>{supportPaths=null;throw e;});const subgrids=await supportPaths;
      const eligible=(itemId:number)=>{const d=definitions.get(String(itemId)),f=d?.footprint as {acceptedFloorTypesFlag?:number}|null,rule=sourceEditRestrictions(d);return Math.floor(itemId/100000)===400&&d?.nativeType==='Furniture'&&!!f&&!!((f.acceptedFloorTypesFlag??0)&mask)&&!subgrids.has(itemId)&&!nativeActionBlocked(rule,'select')&&!nativeActionBlocked(rule,'move')&&!nativeActionBlocked(rule,'remove');};
      if(data.command==='design-catalog'){const locale=data.locale as WandLanguage,names=new Map(await (await getMaster()).getBrowseNames(locale)),items:DesignCatalogItem[]=[];for(const [key,d] of definitions){const itemId=Number(key);if(eligible(itemId))items.push({itemId,name:names.get(itemId)??String(d.nativeName??'—'),layer:'furniture'});}items.sort((a,b)=>a.name.localeCompare(b.name,locale)||a.itemId-b.itemId);scope.postMessage({kind:'design-catalog',requestId:id,key:grid.key,items});return;}
      const batch=data.command==='design-shapes',ids=batch?data.itemIds:[data.itemId];
      if(!Array.isArray(ids)||ids.length>DESIGN_LIMIT||new Set(ids).size!==ids.length||!ids.every(n=>Number.isSafeInteger(n)&&eligible(n)))throw Error('room furniture');
      const results:DesignItemGeometry[]=[];let runs=0;
      for(const itemId of ids){const cache=createSourceGeometryCache({manifest:{platform:'Steam',gameVersion:'1.26.2'},objects:definitions},grid.factor),item=cache.resolve(itemId,8);if(!item.shapeKey||item.surfaceCapable)throw Error('room shape');for(const code of [0,4,12])cache.resolve(itemId,code);runs+=Object.values(cache.shapes).reduce((n,s)=>n+s.runs.length,0);if(runs>1_000_000)throw Error('shape limit');results.push({itemId,name:item.name,layer:'furniture',surfaceCapable:false,editRestrictions:item.editRestrictions,shapes:cache.shapes});}
      scope.postMessage({kind:batch?'design-shapes':'design-shape',requestId:id,key:grid.key,result:batch?results:results[0]});return;
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
    if(data.command==='network-catalog'){
      const definitions=await loadGeometry(),source=publicShapeSource(grid,definitions),cache=createSourceGeometryCache(source,grid.factor);
      const names=new Map(await (await getMaster()).getBrowseNames(data.locale as WandLanguage));
      const items=[];
      for(const [key,def] of definitions){
        const itemId=Number(key);
        if(def.nativeType!=='Furniture'||Math.floor(itemId/100000)!==401&&!fenceBaseDefinition(itemId,def))continue;
        const obj=cache.resolve(itemId,8),shape=obj.shapeKey?cache.shapes[obj.shapeKey]:null;
        if(!shape||shape.acceptedFloorTypesFlag===undefined||nativeActionBlocked(obj.editRestrictions,'select'))continue;
        const geo={itemId,name:obj.name,layer:obj.layer,surfaceCapable:obj.surfaceCapable,editRestrictions:obj.editRestrictions,shapes:{[itemId+':8']:shape}};
        const kind=roadPitch(geo,grid.factor)!==null?'road':fenceBaseDefinition(itemId,def)&&fencePitch(geo,grid.factor)!==null?'fence':null;
        if(kind)items.push({styleOnly:true,area:grid.key,factor:grid.factor,itemId,name:names.get(itemId)??obj.name??String(itemId),kind,shape});
      }
      items.sort((a,b)=>a.name.localeCompare(b.name,data.locale)||a.itemId-b.itemId);
      scope.postMessage({kind:'network-catalog',requestId:id,key:grid.key,items});return;
    }
    if(data.command==='road-family'){
      const definitions=await loadGeometry(),source=publicShapeSource(grid,definitions),cache=createSourceGeometryCache(source,grid.factor),q=2*grid.factor;
      const verify=(id:number)=>{
        const d=definitions.get(String(id));
        if(!d||d.nativeType!=='Furniture'||Math.floor(id/100000)!==401||!/^(?:Path|Road)_/i.test(String(d.nativeName??''))||nativeActionBlocked(sourceEditRestrictions(d),'select'))return null;
        const obj=cache.resolve(id,8),s=obj.shapeKey?cache.shapes[obj.shapeKey]:null;
        return obj.layer==='ground'&&s&&s.width===q&&s.height===q&&s.cellCount===q*q&&s.runs.length===q&&s.runs.every((r,i)=>r.x===0&&r.y===i&&r.width===q)&&s.acceptedFloorTypesFlag!==undefined?s.acceptedFloorTypesFlag:null;
      };
      const mask=verify(data.itemId);if(mask===null)throw Error('road family');
      const names=new Map(await (await getMaster()).getBrowseNames(data.locale as WandLanguage));
      const replacementOptions:{id:number;name:string}[]=[];
      for(const [key,d] of definitions){const id=Number(key);if(id!==data.itemId&&Math.floor(id/100000)===401&&verify(id)===mask)replacementOptions.push({id,name:names.get(id)??String(d.nativeName)});}
      replacementOptions.sort((a,b)=>a.name.localeCompare(b.name,data.locale)||a.id-b.id);
      scope.postMessage({kind:'road-family',requestId:id,key:grid.key,itemId:data.itemId,factor:grid.factor,verified:true,replacementOptions});return;
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
      let diagonalVerified=false;
      try{
        const f=fenceFamily(data.itemId)!;
        for(let k=1;k<=4;k++){
          const id=f.diagExt[k-1],d=definitions.get(String(id));
          const name=String(d?.nativeName??'').toLowerCase().replace(/[^a-z0-9]/g,'');
          const fp=d?.footprint as {sizeX?:number;sizeY?:number}|null|undefined;
          if(d?.nativeType!=='Furniture'||!name.includes(f.name.toLowerCase().replace(/[^a-z0-9]/g,''))||!name.includes('diag')||!name.includes('ext')||fp?.sizeX!==k||fp?.sizeY!==k)throw Error('diagonal family');
          for(const code of [8,12]){
            const item=cache.resolve(id,code),shape=item.shapeKey?cache.shapes[item.shapeKey]:null;
            if(!shape||item.layer!=='fence'||shape.width!==k*q||shape.height!==k*q||shape.acceptedFloorTypesFlag!==mask||nativeActionBlocked(item.editRestrictions,'select'))throw Error('diagonal shape');
          }
        }
        diagonalVerified=true;
      }catch{/* Cardinal mode remains available. */}

      const options:number[]=[];
      if(data.replacement===undefined){for(const f of fenceFamilyCandidates){if(f.base===data.itemId)continue;try{if(verifyFamily(f.base)===mask)options.push(f.base);}catch{/* Not current-source verified; omit. */}}}
      const localized=new Map(await (await getMaster()).getBrowseNames(data.locale as WandLanguage));
      const replacementOptions=options.map(id=>({id,name:localized.get(id)??fenceFamily(id)!.name})).sort((a,b)=>a.name.localeCompare(b.name,data.locale));
      let replacementVerified=false;
      if(data.replacement!==undefined){
        if(data.replacement===data.itemId||verifyFamily(data.replacement)!==mask)throw Error('replacement mask');
        replacementVerified=true;
      }
      scope.postMessage({kind:'fence-family',requestId:id,key:grid.key,itemId:data.itemId,factor:q,verified:true,replacement:data.replacement,replacementVerified,replacementOptions,diagonalVerified});return;
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
