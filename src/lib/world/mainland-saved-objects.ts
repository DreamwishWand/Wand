import {characterHouseExterior} from './character-house-exteriors.ts';
/** Original-local coordinate receipts + verified mainland source transforms.
 * Keep each actual Save Grid, ordinal and native geometry separate. Never
 * equate a subgrid with a mainland root or invent placement for unresolved
 * objects. Projection is read-only; existing local Rust edit route remains
 * authoritative. */
import {mainlandMapAnchor,mainlandTerrainHits,mainlandFreeHits,sourceWorldScope,bindMainlandGrid,bindFloatingIslandGrid,type MainlandGrid} from './mainland-world-coordinates.ts';
import {projectWorldEdits,stageWorldEdit,currentWorldEdits,WORLD_BATCH_LIMIT,WORLD_HISTORY_LIMIT,stageWorldTargets,groupTargets,type GroupTarget,type WorldEditTimeline,type WorldStagedEdit} from './saved-map-batch.ts';
import {alignmentTargets,type MapAlignment} from './map-alignment.ts';
import type {SavedShapeMap,SavedShapeObject} from './saved-shape-map.ts';
import type {SourceObjectShape} from './source-object-map.ts';
import {terrainWarnings,type TerrainRaster,type TerrainScopeReceipt} from './terrain-binding.ts';
import {mapPainterOrder} from './source-map-layers.ts';
import {nativeActionBlocked} from './native-edit-restrictions.ts';
export interface MainlandSavedObject{
 readonly area:string;readonly object:SavedShapeObject;readonly shape:SourceObjectShape|null;
 readonly x:number;readonly y:number;readonly factor:1|2;
}
export interface MainlandSaveProjection{readonly objects:readonly MainlandSavedObject[];readonly omitted:number}
export function projectMainlandSaved(grids:readonly MainlandGrid[],sessions:readonly TerrainScopeReceipt[],maps:ReadonlyMap<string,SavedShapeMap>,edits:readonly WorldStagedEdit[]):MainlandSaveProjection{
 const result:MainlandSavedObject[]=[];let omitted=0;
 const counts=new Map<number,number>(),gridCounts=new Map<number,number>();
 for(const g of grids){
  const matches=sessions.filter(s=>s.receipt.viewKey===g.key);
  for(const s of matches){
   const ords=new Set(s.receipt.points.map(p=>p.localGridOrdinal));
   for(const id of ords)gridCounts.set(id,(gridCounts.get(id)??0)+1);
   for(const o of s.receipt.points)counts.set(o.localOrdinal,(counts.get(o.localOrdinal)??0)+1);
  }
 }
 for(const g of grids){
  const matches=sessions.filter(s=>s.receipt.viewKey===g.key),m=maps.get(g.key);
  if(matches.length!==1){omitted+=matches.reduce((n,s)=>n+s.receipt.points.length+s.receipt.rowsWithoutCoordinates,0);continue;}
  const s=matches[0];omitted+=s.receipt.rowsWithoutCoordinates;
  if(!s.receipt.points.length)continue;
  const ords=new Set(s.receipt.points.map(p=>p.localGridOrdinal));
  // A source root with multiple actual grids is ambiguous; never superpose
  // two Save instances simply because the original source path is identical.
  if(!m||m.layoutId!==g.layoutId||m.gridDataPath!==g.gridDataPath||m.gridIdNative!==g.gridIdNative||m.sourceGridFactor!==g.factor||
    ords.size!==1||s.verifiedGridOrdinals.length!==1||!ords.has(s.verifiedGridOrdinals[0])||gridCounts.get(s.verifiedGridOrdinals[0])!==1){
   omitted+=s.receipt.points.length;continue;
  }
  const original=new Map(s.receipt.points.map(o=>[o.localOrdinal,o])),seen=new Set<number>(),originalShapes=new Map(m.objects.map(o=>[o.localOrdinal,o]));
  const effective=projectWorldEdits(m,edits);
  for(const o of effective.objects){
   const raw=original.get(o.localOrdinal),before=originalShapes.get(o.localOrdinal);
   if(!raw||!before||counts.get(o.localOrdinal)!==1||seen.has(o.localOrdinal)||raw.localGridOrdinal!==o.localGridOrdinal||raw.itemId!==o.itemId||raw.x!==before.x||raw.y!==before.y||raw.orientation!==before.orientation)continue;
   seen.add(o.localOrdinal);
   if(o.x<0||o.y<0||o.x>=g.sizeX*g.factor||o.y>=g.sizeY*g.factor){omitted++;continue;}
   const shape=o.shapeKey?m.shapes[o.shapeKey]??null:null;
   const p=mainlandMapAnchor(g,o.x,o.y);
   result.push({area:g.key,object:o,shape,x:p.x,y:p.y,factor:g.factor});
  }
  omitted+=s.receipt.points.length-seen.size;
 }
 // Stable painter ordering across the whole world, not independent area z order.
 const ordered=mapPainterOrder(result.map(p=>({...p,layer:p.object.layer,surfaceCapable:p.object.surfaceCapable})));
 return {objects:ordered,omitted};
}
export function mainlandSavedAt(objects:readonly MainlandSavedObject[],x:number,y:number):MainlandSavedObject[]{
 return objects.filter(p=>{
  const dx=Math.floor((x-p.x)*p.factor),dy=Math.floor((p.y-y)*p.factor);
  return p.shape?p.shape.runs.some(r=>r.y===dy&&dx>=r.x&&dx<r.x+r.width):dx===0&&dy===0;
 }).reverse();
}
/** Rectangle selection uses occupied runs, not the bounding rectangle.
 * Unknown shapes remain selectable by the same one-cell marker as hit testing.
 * Both axes are in common map space; native Y increases downwards. */
export function mainlandSavedInRect(objects:readonly MainlandSavedObject[],a:{x:number;y:number},b:{x:number;y:number}):MainlandSavedObject[]{
 const left=Math.min(a.x,b.x),right=Math.max(a.x,b.x),bottom=Math.min(a.y,b.y),top=Math.max(a.y,b.y);
 if(![left,right,bottom,top].every(Number.isFinite)||left===right||bottom===top)return [];
 return objects.filter(p=>{
  if(!Number.isFinite(p.factor)||p.factor<=0)return false;
  if(p.x>=right||p.x+(p.shape?.width??1)/p.factor<=left||p.y<=bottom||p.y-(p.shape?.height??1)/p.factor>=top)return false;
  if(!p.shape)return true;
  return p.shape.runs.some(r=>p.x+r.x/p.factor<right&&p.x+(r.x+r.width)/p.factor>left&&p.y-r.y/p.factor>bottom&&p.y-(r.y+1)/p.factor<top);
 });
}
export function visibleMainlandSaved(objects:readonly MainlandSavedObject[],v:{x:number;y:number;w:number;h:number}):MainlandSavedObject[]{
 return objects.filter(p=>p.x<=v.x+v.w+1&&p.x+(p.shape?.width??1)/p.factor>=v.x-1&&p.y>=v.y-1&&p.y-(p.shape?.height??1)/p.factor<=v.y+v.h+1);
}

import {CARDINAL_ORIENTATIONS,isCardinal,worldOrientationAllowed,worldOrientationCode,worldMoveEligible,worldRotateEligible,exclusiveAnchorClass} from './saved-map-transform.ts';
/** Only known free-standing furniture/landscape is eligible here. Existing
 * scoped tools remain available for other verified native edit operations.
 * Both the original and every destination occupied cell must resolve to
 * the same root; no cross-grid mutation or support transfer is inferred. */
export function mainlandSavedMoveEligible(p:MainlandSavedObject|null,free=false){
 return !!p?.shape&&(p.object.layer!=='surface'||free&&Math.floor(Number(p.object.itemId)/100000)===400)&&!exclusiveAnchorClass(p.object.itemId)&&worldMoveEligible(p.object,free);
}
/** Position-only network group editing. Native state stays untouched. */
export function mainlandSavedGroupMoveEligible(p:MainlandSavedObject|null,free=false){
 return !!p?.shape&&(p.object.layer!=='surface'||free&&Math.floor(Number(p.object.itemId)/100000)===400)&&worldMoveEligible(p.object,free)&&(!exclusiveAnchorClass(p.object.itemId)||isCardinal(p.object.orientation));
}
export function mainlandSavedRotateEligible(p:MainlandSavedObject|null,free=false){
 return !!p?.shape&&(p.object.layer!=='surface'||free&&Math.floor(Number(p.object.itemId)/100000)===400)&&worldRotateEligible(p.object,free);
}
export interface MainlandSavedDraft{readonly x:number;readonly y:number;readonly shape:SourceObjectShape;readonly valid:boolean;readonly next:WorldEditTimeline|null}
export function mainlandSavedDraft(p:MainlandSavedObject,grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,maps:ReadonlyMap<string,SavedShapeMap>,timeline:WorldEditTimeline,worldX:number,worldY:number,orientation:string|null,geometryOnly=false,free=false):MainlandSavedDraft|null{
 const g=grids.find(g=>g.key===p.area),m=maps.get(p.area),r=rasters.get(p.area);
 if(!g||!m||!r||!p.shape||!worldOrientationAllowed(p.object,orientation,free&&g.factor===1)||!Number.isFinite(worldX)||!Number.isFinite(worldY))return null;
 const x=Math.floor((worldX-2*g.origin.position[0])*g.factor),y=Math.floor((-worldY-2*g.origin.position[2])*g.factor);
 const shape=m.shapes[p.object.itemId+':'+worldOrientationCode(orientation)];if(!shape)return null;
 const moved=x!==p.object.x||y!==p.object.y,turned=orientation!==p.object.orientation;
 const anchor=mainlandMapAnchor(g,x,y);
 const bypass=free&&!exclusiveAnchorClass(p.object.itemId);
 let valid=(moved||turned)&&(!moved||(geometryOnly?mainlandSavedGroupMoveEligible(p,free):mainlandSavedMoveEligible(p,free)))&&(!turned||mainlandSavedRotateEligible(p,free))&&
 x>=0&&y>=0&&x<g.sizeX*g.factor&&y<g.sizeY*g.factor&&(bypass||x+shape.width<=g.sizeX*g.factor&&y+shape.height<=g.sizeY*g.factor)&&shape.cellCount<=65536;
 if(valid&&!bypass){
  outer:for(const run of shape.runs)for(let dx=0;dx<run.width;dx++){
   const q=mainlandMapAnchor(g,x+run.x+dx+.5,y+run.y+.5);
   const hits=mainlandTerrainHits(grids,rasters,q.x,q.y);
   if(hits.length!==1||hits[0].key!==g.key){valid=false;break outer;}
  }
 }
 if(valid&&!bypass&&p.object.nativeType==='Building'&&terrainWarnings({raster:r,factor:g.factor,verifiedGridOrdinals:[p.object.localGridOrdinal]},shape,x,y).length)valid=false;
 if(geometryOnly)return {...anchor,shape,valid,next:null};
 const next=valid?stageWorldEdit(m,timeline,p.object.localOrdinal,x,y,orientation,terrainWarnings({raster:r,factor:g.factor,verifiedGridOrdinals:[p.object.localGridOrdinal]},shape,x,y).length?'原本地形属性不一致候補・衝突未判定':'衝突・上下関係未判定',free):null;
 return {...anchor,shape,valid:!!next,next};
}

/** Integer coordinates at the selected object's native cell resolution,
 * expressed against the original world origin (X,+Z), never a Grid ID.
 * factor=2 preserves the half-step lattice instead of rounding it away. */
export function mainlandSavedCell(p:MainlandSavedObject):{x:number;z:number}|null{
 const x=p.x*p.factor,z=-p.y*p.factor;
 return Number.isSafeInteger(x)&&Number.isSafeInteger(z)?{x,z}:null;
}
export function mainlandSavedDraftAtCell(p:MainlandSavedObject,grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,maps:ReadonlyMap<string,SavedShapeMap>,timeline:WorldEditTimeline,x:number,z:number,orientation:string|null,free=false){
 if(!Number.isSafeInteger(x)||!Number.isSafeInteger(z)||!mainlandSavedCell(p))return null;
 return mainlandSavedDraft(p,grids,rasters,maps,timeline,(x+.5)/p.factor,-(z+.5)/p.factor,orientation,false,free);
}

/** Shared map-coordinate translation. Every object retains its original
 * native Grid and cell lattice. All targets are staged locally or none. */
export function mainlandGroupFactor(items:readonly MainlandSavedObject[]):1|2{
 return items.length&&items.every(p=>p.factor===2)?2:1;
}
export interface MainlandGroupDraft{
 readonly ghosts:readonly {object:MainlandSavedObject;draft:MainlandSavedDraft|null;x:number;y:number}[];
 readonly next:WorldEditTimeline|null;
}
export function mainlandSavedGroupDraft(items:readonly MainlandSavedObject[],grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,maps:ReadonlyMap<string,SavedShapeMap>,timeline:WorldEditTimeline,dx:number,dz:number,free=false):MainlandGroupDraft{
 const factor=mainlandGroupFactor(items);
 const ghosts: {object:MainlandSavedObject;draft:MainlandSavedDraft|null;x:number;y:number}[]=[];
 const invalid={ghosts,next:null};
 if(items.length<2||items.length>WORLD_BATCH_LIMIT||!Number.isSafeInteger(dx)||!Number.isSafeInteger(dz)||(!dx&&!dz)||new Set(items.map(p=>p.object.localOrdinal)).size!==items.length)return invalid;
 // Same native Grid: validate geometry separately and stage all final
 // destinations together. This permits a road strip to move by one cell
 // even when a target is occupied by another member of the same strip.
 const first=items[0],scope=maps.get(first.area);
 if(scope&&items.every(p=>p.area===first.area&&p.factor===first.factor&&p.object.localGridOrdinal===first.object.localGridOrdinal)){
  const targets:GroupTarget[]=[];
  let valid=true;
  for(const p of items){
   const x=p.x+dx/factor,y=p.y-dz/factor;
   const q=mainlandSavedGroupMoveEligible(p,free)?mainlandSavedDraft(p,grids,rasters,maps,timeline,x+.5/p.factor,y-.5/p.factor,p.object.orientation,true,free):null;
   ghosts.push({object:p,draft:q,x,y});
   if(!q?.valid){valid=false;continue;}
   targets.push({ordinal:p.object.localOrdinal,x:p.object.x+dx*p.factor/factor,y:p.object.y+dz*p.factor/factor,orientation:p.object.orientation,shapeKey:p.object.shapeKey});
  }
  return {ghosts,next:valid?stageWorldTargets(scope,timeline,targets,'衝突・上下関係・接続未判定',free):null};
 }
 let working=timeline,valid=true;
 for(const p of items){
  const pos=mainlandSavedCell(p),x=p.x+dx/factor,y=p.y-dz/factor;
  const q=pos&&mainlandSavedMoveEligible(p,free)?mainlandSavedDraftAtCell(p,grids,rasters,maps,working,pos.x+dx*p.factor/factor,pos.z+dz*p.factor/factor,p.object.orientation,free):null;
  ghosts.push({object:p,draft:q,x,y});
  if(!q?.next)valid=false;else working=q.next;
 }
 if(!valid)return invalid;
 const last=working.snapshots[working.cursor];
 const snapshots=[...timeline.snapshots.slice(0,timeline.cursor+1),last].slice(-(WORLD_HISTORY_LIMIT+1));
 return {ghosts,next:{snapshots,cursor:snapshots.length-1}};
}

/** Reuse the established scoped group transform on a shared logical world
 * lattice. Rotation/align requires a uniform native resolution; mixed
 * resolutions retain translation support. No rounding to foreign cells. */
export function mainlandSavedAdvancedDraft(items:readonly MainlandSavedObject[],grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,maps:ReadonlyMap<string,SavedShapeMap>,timeline:WorldEditTimeline,action:MapAlignment|number,free=false):MainlandGroupDraft{
 const invalid:MainlandGroupDraft={ghosts:[],next:null};
 if(items.length<2||items.length>WORLD_BATCH_LIMIT||new Set(items.map(p=>p.object.localOrdinal)).size!==items.length||items.some(p=>!mainlandSavedMoveEligible(p,free)||p.factor!==items[0].factor))return invalid;
 const factor=items[0].factor,shapes:Record<string,SourceObjectShape>={},objects:SavedShapeObject[]=[];
 for(const p of items){
  const pos=mainlandSavedCell(p),map=maps.get(p.area);
  if(!pos||!map||!p.object.shapeKey)return invalid;
  for(const code of [0,4,8,12]){
   const key=p.object.itemId+':'+code,shape=map.shapes[key];
   if(!shape)continue;
   if(shapes[key]&&(shapes[key].width!==shape.width||shapes[key].height!==shape.height||shapes[key].path!==shape.path))return invalid;
   shapes[key]=shape;
  }
  objects.push({...p.object,x:pos.x,y:pos.z,localGridOrdinal:1});
 }
 const first=maps.get(items[0].area)!;
 const worldMap:SavedShapeMap={...first,objects,shapes};
 const targets:GroupTarget[]|null=typeof action==='number'?groupTargets(worldMap,objects,0,0,action,free):alignmentTargets(worldMap,objects,action,free);
 if(!targets)return invalid;
 const byId=new Map(items.map(p=>[p.object.localOrdinal,p]));
 const ghosts: {object:MainlandSavedObject;draft:MainlandSavedDraft|null;x:number;y:number}[]=[];
 let working=timeline,valid=true,changed=false;
 for(const target of targets){
  const p=byId.get(target.ordinal)!;
  const pos=mainlandSavedCell(p)!;
  if(pos.x===target.x&&pos.z===target.y&&p.object.orientation===target.orientation)continue;
  changed=true;
  const q=mainlandSavedDraftAtCell(p,grids,rasters,maps,working,target.x,target.y,target.orientation,free);
  ghosts.push({object:p,draft:q,x:target.x/factor,y:-target.y/factor});
  if(!q?.next)valid=false;else working=q.next;
 }
 if(!valid||!changed)return {ghosts,next:null};
 const snapshots=[...timeline.snapshots.slice(0,timeline.cursor+1),working.snapshots[working.cursor]].slice(-(WORLD_HISTORY_LIMIT+1));
 return {ghosts,next:{snapshots,cursor:snapshots.length-1}};
}

/** Local-only structural rehearsal plan. This is not an edit timeline
 * entry or a write authorization; a valid terrain hit is not a native
 * collision or runtime reference proof. */
export interface MainlandTransferPlan{
 readonly area:string;readonly x:number;readonly y:number;readonly factor:1|2;readonly shape:SourceObjectShape;
 readonly plan:{localOrdinal:number;itemId:string;expectedX:number;expectedY:number;expectedOrientation:string;destination:{layoutId:string;gridDataPath:string;factor:1|2;sizeX:number;sizeY:number};x:number;y:number;orientation:string;crossWorld?:'move'|'duplicate';freePlacement?:true;storage?:true};
}
export function exteriorWorldKey(g:MainlandGrid):string{return sourceWorldScope(g)==='FloatingIslands'?g.layoutId:sourceWorldScope(g);}
export function crossWorldBuildingCandidate(p:MainlandSavedObject|null,from:MainlandGrid|undefined,g:MainlandGrid|undefined,timeline:WorldEditTimeline,x:number,y:number,mode:'move'|'duplicate'):MainlandTransferPlan|null{
 const house=Math.floor(Number(p?.object.itemId)/100000)===205,character=characterHouseExterior(Number(p?.object.itemId));
 const bound=(g:MainlandGrid)=>bindMainlandGrid(g)??(house||character?bindFloatingIslandGrid(g):null);
 if(!p||!from||!g||p.area!==from.key||!bound(from)||!bound(g)||exteriorWorldKey(from)===exteriorWorldKey(g)||g.factor!==from.factor||g.factor!==p.factor||
  currentWorldEdits(timeline).length||!p.shape||p.shape.cellCount<1||p.shape.cellCount>65536||p.object.nativeType!=='Building'||![200,201,202,203,205].includes(Math.floor(Number(p.object.itemId)/100000))||
  p.object.subgrid||p.object.surfaceCapable||!isCardinal(p.object.orientation)||!Number.isSafeInteger(x)||!Number.isSafeInteger(y)||x<0||y<0||x>=g.sizeX*g.factor||y>=g.sizeY*g.factor)return null;
 return {area:g.key,...mainlandMapAnchor(g,x,y),factor:g.factor,shape:p.shape,plan:{localOrdinal:p.object.localOrdinal,itemId:p.object.itemId,expectedX:p.object.x,expectedY:p.object.y,expectedOrientation:p.object.orientation,destination:{layoutId:g.layoutId,gridDataPath:g.gridDataPath,factor:g.factor,sizeX:g.sizeX,sizeY:g.sizeY},x,y,orientation:p.object.orientation,crossWorld:mode}};
}
export function mainlandTransferCandidate(p:MainlandSavedObject,grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,timeline:WorldEditTimeline,worldX:number,worldY:number,free=false):MainlandTransferPlan|null{
 const building=free&&p.object.nativeType==='Building'&&[200,201,202,203,205].includes(Math.floor(Number(p.object.itemId)/100000));
 const landscape=p.object.layer==='landscape'&&Math.floor(Number(p.object.itemId)/100000)===402;
 const furniture=Math.floor(Number(p.object.itemId)/100000)===400&&(p.object.layer==='furniture'||free&&p.object.layer==='surface');
 const bypass=free&&(building||landscape||furniture);
 if(landscape&&!free&&(p.object.editRestrictions?.move!=='allowedFlag'||p.object.editRestrictions?.switchGrid!=='allowedFlag'))return null;
 if(currentWorldEdits(timeline).length||!mainlandSavedMoveEligible(p,bypass)||!furniture&&!landscape&&!building||p.object.subgrid||p.object.surfaceCapable||!p.shape||!worldOrientationAllowed(p.object,p.object.orientation,bypass&&p.factor===1)||!bypass&&(nativeActionBlocked(p.object.editRestrictions,'switchGrid')||nativeActionBlocked(p.object.editRestrictions,'remove'))||!Number.isFinite(worldX)||!Number.isFinite(worldY))return null;
 const hit=bypass?mainlandFreeHits(grids,rasters,worldX,worldY):mainlandTerrainHits(grids,rasters,worldX,worldY);
 if(hit.length!==1||hit[0].key===p.area||hit[0].factor!==p.factor&&(!bypass||!furniture||!isCardinal(p.object.orientation)))return null;
 const g=hit[0],r=rasters.get(g.key),shape=p.shape;
 // A drag preview uses source-scale geometry. Keep the same factor until
 // the picker has independently resolved the destination footprint.
 if(g.factor!==p.factor||!isCardinal(p.object.orientation)&&(!bindMainlandGrid(g)||!bindMainlandGrid(grids.find(q=>q.key===p.area)??g)))return null;
 if(landscape||building){const from=grids.find(q=>q.key===p.area),house=building&&(Math.floor(Number(p.object.itemId)/100000)===205||characterHouseExterior(Number(p.object.itemId)));
  if(!from||exteriorWorldKey(from)!==exteriorWorldKey(g)||!(bindMainlandGrid(g)||house&&bindFloatingIslandGrid(g)))return null;}
 const x=Math.floor((worldX-2*g.origin.position[0])*g.factor),y=Math.floor((-worldY-2*g.origin.position[2])*g.factor);
 if(!r||x<0||y<0||x>=g.sizeX*g.factor||y>=g.sizeY*g.factor||!bypass&&(x+shape.width>g.sizeX*g.factor||y+shape.height>g.sizeY*g.factor)||shape.cellCount>65536)return null;
 if(!bypass&&terrainWarnings({raster:r,factor:g.factor,verifiedGridOrdinals:[]},shape,x,y).length)return null;
 if(!bypass)for(const run of shape.runs)for(let dx=0;dx<run.width;dx++){
  const q=mainlandMapAnchor(g,x+run.x+dx+.5,y+run.y+.5);
  const owners=mainlandTerrainHits(grids,rasters,q.x,q.y);
  if(owners.length!==1||owners[0].key!==g.key)return null;
 }
 const anchor=mainlandMapAnchor(g,x,y);
 return {area:g.key,...anchor,factor:g.factor,shape,plan:{localOrdinal:p.object.localOrdinal,itemId:p.object.itemId,expectedX:p.object.x,expectedY:p.object.y,expectedOrientation:p.object.orientation,destination:{layoutId:g.layoutId,gridDataPath:g.gridDataPath,factor:g.factor,sizeX:g.sizeX,sizeY:g.sizeY},x,y,orientation:p.object.orientation,...(bypass?{freePlacement:true as const,...(p.object.storage?{storage:true as const}:{})}:{})}};
}
