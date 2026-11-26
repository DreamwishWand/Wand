import type {DesignClipItem,DesignItemGeometry} from './design-layout.ts';
import {captureFurnitureGroup,groupAbsoluteCandidate,type GroupGeometry,type GroupPasteCandidate,type GroupPasteRow,type WorldSymmetryAxis} from './group-placement.ts';
import {parseSupportScene,supportSceneRootCounts,SCENE_FURNITURE_LIMIT,mixedSceneSizeValid,type SupportScene} from './support-scene.ts';
import {CARDINAL_ORIENTATIONS,isCardinal} from './saved-map-transform.ts';
import {mainlandMapAnchor,mainlandTerrainHits,type MainlandGrid} from './mainland-world-coordinates.ts';
import {stockFootprintFeedback,type StockCandidate} from './save-furniture-placement.ts';
import {terrainWarnings,type TerrainRaster} from './terrain-binding.ts';
import {roadPitch} from './road-design.ts';
import {fenceFamily} from './fence-family-catalog.ts';
import {fenceBaseIdentity} from './fence-design.ts';
import {nativeActionBlocked} from './native-edit-restrictions.ts';
import type {MainlandSavedObject} from './mainland-saved-objects.ts';

export const AREA_SCENE_ROOT_LIMIT=SCENE_FURNITURE_LIMIT+256+128;
export type SceneNetwork={kind:'road';diagonal:boolean}|{kind:'fence';diagonal:boolean;base:number};
export interface AreaSceneItem extends DesignClipItem{support:SupportScene|null;network:SceneNetwork|null}
export interface AreaScene{schema:'wand.preset.area-scene@1';gameVersion:'1.26.2';factor:2;anchor:'corner'|'center';items:AreaSceneItem[]}
const rec=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const int=(v:unknown,max:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=max;
export function parseSceneNetwork(v:unknown,id:number,orientation:number):SceneNetwork{
 if(!rec(v)||typeof v.diagonal!=='boolean')throw Error('NETWORK');
 if(v.kind==='road'&&Object.keys(v).length===2&&Math.floor(id/100000)===401&&orientation===2)return {kind:'road',diagonal:v.diagonal};
 if(v.kind==='fence'&&Object.keys(v).length===3&&int(v.base,0xffffffff)&&(orientation===2||orientation===3)){
  const f=fenceFamily(v.base);
  if(f&&(id===f.base||(v.diagonal?f.diagExt:f.ext).includes(id))&&(id!==f.base||orientation===2))return {kind:'fence',base:v.base,diagonal:v.diagonal};
 }
 throw Error('NETWORK');
}
export function areaSceneCounts(items:readonly AreaSceneItem[]){
 const counts=new Map<number,number>();for(const p of items)if(!p.network){const row=p.support?supportSceneRootCounts(p.support):new Map([[p.itemId,1]]);for(const [id,n] of row)counts.set(id,(counts.get(id)??0)+n);}
 return counts;
}
export function parseAreaScene(raw:string):AreaScene{
 if(raw.length>262144)throw Error('SCENE_LIMIT');const v:unknown=JSON.parse(raw);
 if(!rec(v)||Object.keys(v).length!==5||v.schema!=='wand.preset.area-scene@1'||v.gameVersion!=='1.26.2'||v.factor!==2||!(v.anchor==='corner'||v.anchor==='center')||!Array.isArray(v.items)||!v.items.length||v.items.length>AREA_SCENE_ROOT_LIMIT)throw Error('SCENE_INVALID');
 const items:AreaSceneItem[]=v.items.map(p=>{
  if(!rec(p)||Object.keys(p).length!==6||!int(p.itemId,0xffffffff)||!int(p.dx,131072)||!int(p.dy,131072)||!int(p.orientation,3))throw Error('POSE');
  const network=p.network===null?null:parseSceneNetwork(p.network,p.itemId,p.orientation);
  const support=p.support===null?null:parseSupportScene(JSON.stringify(p.support));
  if(network&&support||!network&&Math.floor(p.itemId/100000)!==400||support&&support.ownerItemId!==p.itemId)throw Error('SCENE_ITEM');
  return {itemId:p.itemId,dx:p.dx,dy:p.dy,orientation:p.orientation,network,support};
 });
 const roads=items.filter(p=>p.network?.kind==='road'),fences=items.filter(p=>p.network?.kind==='fence');
 if(!roads.length&&!fences.length||roads.length>256||fences.length>128||!mixedSceneSizeValid(items.filter(p=>!p.network))||Math.min(...items.map(p=>p.dx))!==0||Math.min(...items.map(p=>p.dy))!==0)throw Error('SCENE_LIMIT');
 return {schema:'wand.preset.area-scene@1',gameVersion:'1.26.2',factor:2,anchor:v.anchor,items};
}
export function captureAreaPoses(items:readonly MainlandSavedObject[]):DesignClipItem[]|null{
 if(!items.length||items.length>AREA_SCENE_ROOT_LIMIT||new Set(items.map(p=>p.object.localOrdinal)).size!==items.length)return null;
 const rows:DesignClipItem[]=[];let roads=0,fences=0,furniture=0;
 for(const p of items){
  const id=Number(p.object.itemId),orientation=p.object.orientation,layer=p.object.layer;
  if(!p.shape||!isCardinal(orientation)||nativeActionBlocked(p.object.editRestrictions,'select')||!Number.isSafeInteger(p.x*2)||!Number.isSafeInteger(-p.y*2))return null;
  if(layer==='ground'&&Math.floor(id/100000)===401&&orientation==='GridOrientation_Down'&&!p.object.subgrid){if(++roads>256)return null;}
  else if(layer==='fence'&&Math.floor(id/100000)===407&&['GridOrientation_Down','GridOrientation_Left'].includes(orientation)&&!p.object.subgrid){if(++fences>128)return null;}
  else if(++furniture>SCENE_FURNITURE_LIMIT||!captureFurnitureGroup([p],true))return null;
  rows.push({itemId:id,dx:p.x*2,dy:-p.y*2,orientation:CARDINAL_ORIENTATIONS.indexOf(orientation)});
 }
 if(!roads&&!fences)return null;
 const x=Math.min(...rows.map(p=>p.dx)),y=Math.min(...rows.map(p=>p.dy));return rows.map(p=>({...p,dx:p.dx-x,dy:p.dy-y}));
}
export function areaSceneFromClip(clip:readonly DesignClipItem[],supports:readonly (SupportScene|null)[],networks:readonly (SceneNetwork|null)[]):AreaScene{
 if(clip.length!==supports.length||clip.length!==networks.length)throw Error('SCENE_LENGTH');
 return parseAreaScene(JSON.stringify({schema:'wand.preset.area-scene@1',gameVersion:'1.26.2',factor:2,anchor:'corner',items:clip.map((p,i)=>({...p,support:supports[i],network:networks[i]}))}));
}
/** Verify observed part dimensions and masks with current source geometry. */
export function networkSceneShape(p:AreaSceneItem,g:DesignItemGeometry|undefined,factor:1|2){
 if(!g||!p.network||g.itemId!==p.itemId||nativeActionBlocked(g.editRestrictions,'select'))return null;
 const s=g.shapes[p.itemId+':'+p.orientation*4];
 if(!s||s.acceptedFloorTypesFlag===undefined||!s.cellCount)return null;
 if(p.network.kind==='road')return roadPitch(g,factor)?s:null;
 const f=fenceFamily(p.network.base);if(!f||g.layer!=='fence')return null;
 const name=(g.name??'').toLowerCase().replace(/[^a-z0-9]/g,'');
 if(!name.includes(f.name.toLowerCase().replace(/[^a-z0-9]/g,'')))return null;
 const k=p.itemId===f.base?1:(p.network.diagonal?f.diagExt:f.ext).indexOf(p.itemId)+1;
 if(k<1||p.itemId===f.base&&!fenceBaseIdentity(p.itemId,g.name)||p.itemId!==f.base&&(!name.includes('ext')||name.includes('diag')!==p.network.diagonal))return null;
 const w=p.network.diagonal||p.orientation===2?k*factor:factor,h=p.network.diagonal||p.orientation===3?k*factor:factor;
 return s.width===w&&s.height===h&&(p.network.diagonal||s.cellCount===w*h&&s.runs.length===h&&s.runs.every((r,i)=>r.x===0&&r.y===i&&r.width===w))?s:null;
}
export type AreaSceneCandidate=GroupPasteCandidate&{areaRows:(GroupPasteRow&{scene?:SupportScene;network?:SceneNetwork})[]};
export function areaSceneCandidate(doc:AreaScene,grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,defs:GroupGeometry,objects:readonly MainlandSavedObject[],omitted:number,wx:number,wy:number,axis:WorldSymmetryAxis|null=null):AreaSceneCandidate|null{
 const hits=mainlandTerrainHits(grids,rasters,wx,wy);if(hits.length!==1)return null;
 const g=hits[0],bx=2*g.origin.position[0]+Math.floor((wx-2*g.origin.position[0])*g.factor)/g.factor,by=-2*g.origin.position[2]-Math.floor((-wy-2*g.origin.position[2])*g.factor)/g.factor;
 const original=areaSceneAtOrigin(doc,grids,rasters,defs,objects,omitted,bx,by);
 if(!original||!axis)return original;
 // Keep source and reflected geometry on the same native lattice. The
 // writer still rechecks the complete combined network and all descendants.
 const factor=original.ghosts[0].factor;
 if(original.ghosts.some(g=>g.factor!==factor))return null;
 const nativeDefs:GroupGeometry=new Map([...defs].map(([id,byFactor])=>[id,new Map([...byFactor].filter(([f])=>f===factor))]));
 const mirrored=transformAreaScene(doc,nativeDefs,axis.mode);
 if(!mirrored)return null;
 const combined=combineSymmetricArea(doc,mirrored,original.ghosts,axis,bx,by);
 if(!combined)return null;
 const q=areaSceneAtOrigin(combined.doc,grids,rasters,defs,objects,omitted,combined.x,combined.y);
 return q&&q.ghosts.every(g=>g.factor===factor)?q:null;
}
function areaSceneAtOrigin(doc:AreaScene,grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,defs:GroupGeometry,objects:readonly MainlandSavedObject[],omitted:number,bx:number,by:number):AreaSceneCandidate|null{
 const positions=doc.items.map(p=>({itemId:p.itemId,x:bx+p.dx/2,y:by-p.dy/2,orientation:p.orientation}));
 const furniture=positions.filter((_,i)=>!doc.items[i].network),base=furniture.length?groupAbsoluteCandidate(furniture,grids,rasters,defs,areaSceneCounts(doc.items),objects,omitted):{rows:[],ghosts:[]};
 if(!base)return null;
 const rows:AreaSceneCandidate['areaRows']=[],ghosts:StockCandidate[]=[],anchors=new Set<string>();let cursor=0;
 for(let i=0;i<doc.items.length;i++){
  const p=doc.items[i],at=positions[i];
  if(!p.network){const row=base.rows[cursor],ghost=base.ghosts[cursor++];rows.push({...row,...(p.support?{scene:p.support}:{})});ghosts.push(ghost);continue;}
  const target=mainlandTerrainHits(grids,rasters,at.x+.001,at.y-.001);if(target.length!==1)return null;
  const d=target[0],r=rasters.get(d.key),s=networkSceneShape(p,defs.get(p.itemId)?.get(d.factor),d.factor);
  const x=(at.x-2*d.origin.position[0])*d.factor,y=(-at.y-2*d.origin.position[2])*d.factor,pitch=(p.network.kind==='road'?2:1)*d.factor;
  if(!s||!r||!Number.isSafeInteger(x)||!Number.isSafeInteger(y)||x<0||y<0||x%pitch||y%pitch||x+s.width>d.sizeX*d.factor||y+s.height>d.sizeY*d.factor||terrainWarnings({raster:r,factor:d.factor,verifiedGridOrdinals:[]},s,x,y).length)return null;
  const key=d.key+':'+p.network.kind+':'+x+':'+y;if(anchors.has(key))return null;anchors.add(key);
  for(const run of s.runs)for(let j=0;j<run.width;j++){const a=mainlandMapAnchor(d,x+run.x+j+.5,y+run.y+.5),owners=mainlandTerrainHits(grids,rasters,a.x,a.y);if(owners.length!==1||owners[0].key!==d.key)return null;}
  if(p.network.kind==='road'&&objects.some(o=>o.area===d.key&&o.object.layer==='ground'&&o.object.x===x&&o.object.y===y))return null;
  if(p.network.kind==='fence'&&objects.some(o=>o.area===d.key&&o.object.layer==='fence'&&Math.abs(o.object.x-x)<=8*d.factor&&Math.abs(o.object.y-y)<=8*d.factor))return null;
  const destination={layoutId:d.layoutId,gridDataPath:d.gridDataPath,factor:d.factor,sizeX:d.sizeX,sizeY:d.sizeY};
  const orientation=CARDINAL_ORIENTATIONS[p.orientation],itemId=String(p.itemId);
  const ghost:StockCandidate={area:d.key,...mainlandMapAnchor(d,x,y),factor:d.factor,shape:s,plan:{action:'place',itemId,x,y,orientation},destination};
  if(p.network.kind==='fence'&&(stockFootprintFeedback(ghost,objects,omitted).overlaps||base.ghosts.some(other=>stockFootprintFeedback(ghost,[{area:other.area,x:other.x,y:other.y,factor:other.factor,shape:other.shape,object:{localOrdinal:1,localGridOrdinal:1,itemId:other.plan.itemId,x:0,y:0,orientation:'GridOrientation_Down',orientationCode:8,shapeKey:null,name:null,layer:'furniture',surfaceCapable:false}}]).overlaps)))return null;
  rows.push({itemId,x,y,orientation,destination,network:p.network});ghosts.push(ghost);
 }
 return {rows,ghosts,areaRows:rows};
}

export type AreaSceneTransform='left'|'right'|'horizontal'|'vertical'|'point';
/** Transform physical cell coordinates, not the native Ext anchor as a post.
 * Fence extents are derived from the exact two endpoints; no state is lost.
 * A reflected furniture footprint must have an exact native orientation.
 * Populated supports retain their local arrangement on rotation; reflection
 * of a populated support is not represented by a root-orientation change. */
export function transformAreaScene(doc:AreaScene,defs:GroupGeometry,mode:AreaSceneTransform):AreaScene|null{
 const quarter=mode==='left'||mode==='right',fx=mode==='vertical'||mode==='point',fy=mode==='horizontal'||mode==='point';
 const shape=(p:AreaSceneItem)=>{
  const map=defs.get(p.itemId),g=map?.get(2)??map?.get(1),factor=map?.has(2)?2:1;
  if(!g)return null;
  const a=p.network?networkSceneShape(p,g,factor):g.shapes[p.itemId+':'+p.orientation*4];
  if(!a||!a.cellCount||nativeActionBlocked(g.editRestrictions,'select')||nativeActionBlocked(g.editRestrictions,'move'))return null;
  const scale=2/factor;
  const cells=new Set<string>();
  for(const run of a.runs)for(let x=0;x<run.width*scale;x++)for(let y=0;y<scale;y++)cells.add((run.x*scale+x)+':'+(run.y*scale+y));
  if(cells.size!==a.cellCount*scale*scale)return null;
  return {w:a.width*scale,h:a.height*scale,cells,g};
 };
 const shapes=doc.items.map(shape);if(shapes.some(a=>!a))return null;
 const w=Math.max(...doc.items.map((p,i)=>p.dx+shapes[i]!.w)),h=Math.max(...doc.items.map((p,i)=>p.dy+shapes[i]!.h));
 function point(x:number,y:number,cell:number):[number,number]{
  if(mode==='right')return [h-y-cell,x];
  if(mode==='left')return [y,w-x-cell];
  return [fx?w-x-cell:x,fy?h-y-cell:y];
 }
 const out:AreaSceneItem[]=[];
 for(let i=0;i<doc.items.length;i++){
  const p=doc.items[i],a=shapes[i]!;
  let dx:number,dy:number,orientation=p.orientation;
  if(p.network?.kind==='fence'){
   const f=fenceFamily(p.network.base);if(!f)return null;
   const k=p.itemId===f.base?0:(p.network.diagonal?f.diagExt:f.ext).indexOf(p.itemId)+1;
   if(k===0){[dx,dy]=point(p.dx,p.dy,2);orientation=2;}
   else{
    if(k<1)return null;
    const q=2,left=p.orientation===3,diag=p.network.diagonal;
    const start: [number,number]=diag?(left?[p.dx-q,p.dy+k*q]:[p.dx-q,p.dy-q]):left?[p.dx,p.dy-q]:[p.dx-q,p.dy];
    const end:[number,number]=[start[0]+(diag||!left?(k+1)*q:0),start[1]+(diag?(left?-1:1)*(k+1)*q:left?(k+1)*q:0)];
    let u=point(...start,q),v=point(...end,q);
    if(u[0]>v[0]||u[0]===v[0]&&u[1]>v[1])[u,v]=[v,u];
    const sx=Math.sign(v[0]-u[0]),sy=Math.sign(v[1]-u[1]);
    if(diag?Math.abs(v[0]-u[0])!==(k+1)*q||Math.abs(v[1]-u[1])!==(k+1)*q:Math.abs(v[0]-u[0])+Math.abs(v[1]-u[1])!==(k+1)*q)return null;
    dx=u[0]+(sx?q:0);dy=u[1]+(sy===0?0:sy>0?q:-k*q);orientation=sx===0||diag&&sy<0?3:2;
   }
  }else if(p.network?.kind==='road'){
   [dx,dy]=point(p.dx,p.dy,a.w);orientation=2;
  }else{
   if(!quarter&&mode!=='point'&&p.support?.tree.objects.length)return null;
   orientation=mode==='right'?(p.orientation+3)%4:mode==='left'?(p.orientation+1)%4:mode==='point'?(p.orientation+2)%4:fx?(4-p.orientation)%4:(6-p.orientation)%4;
   if(orientation!==p.orientation&&nativeActionBlocked(a.g.editRestrictions,'rotate'))return null;
   [dx,dy]=mode==='right'?[h-p.dy-a.h,p.dx]:mode==='left'?[p.dy,w-p.dx-a.w]:[fx?w-p.dx-a.w:p.dx,fy?h-p.dy-a.h:p.dy];
  }
  const next={...p,dx,dy,orientation},b=shape(next);
  if(!b||b.w!==(quarter?a.h:a.w)||b.h!==(quarter?a.w:a.h)||b.cells.size!==a.cells.size)return null;
  // A road is a square native cell. Fence extension geometry is checked
  // against its transformed logical endpoints and source-native footprint.
  for(const cell of a.cells){
   const [x,y]=cell.split(':').map(Number);
   const [tx,ty]=mode==='right'?[a.h-1-y,x]:mode==='left'?[y,a.w-1-x]:[fx?a.w-1-x:x,fy?a.h-1-y:y];
   if(!b.cells.has(tx+':'+ty))return null;
  }
  out.push(next);
 }
 const x=Math.min(...out.map(p=>p.dx)),y=Math.min(...out.map(p=>p.dy));
 try{return parseAreaScene(JSON.stringify({...doc,items:out.map(p=>({...p,dx:p.dx-x,dy:p.dy-y}))}));}catch{return null;}
}

/** Combine the two complete representations at absolute half-cell anchors.
 * A normalized reflected Scene is accepted only when each anchor equals
 * the reflection of its original native footprint. Exact coincident
 * representation parts may be shared; conflicting identities are rejected. */
export function combineSymmetricArea(doc:AreaScene,mirrored:AreaScene,ghosts:readonly StockCandidate[],axis:WorldSymmetryAxis,bx:number,by:number):{doc:AreaScene;x:number;y:number}|null{
 if(!doc.items.length||doc.items.length!==ghosts.length||mirrored.items.length!==ghosts.length||![axis.x*4,axis.y*4,bx*2,by*2].every(Number.isSafeInteger))return null;
 const fx=axis.mode!=='horizontal',fy=axis.mode!=='vertical';
 const x=bx*2,y=-by*2;
 const poses=doc.items.map((p,i)=>{
  const g=ghosts[i],w=g.shape.width*2/g.factor,h=g.shape.height*2/g.factor;
  if(g.x*2!==x+p.dx||-g.y*2!==y+p.dy)return null;
  return {dx:fx?axis.x*4-x-p.dx-w:x+p.dx,dy:fy?-axis.y*4-y-p.dy-h:y+p.dy};
 });
 if(poses.some(p=>!p))return null;
 const valid=poses as {dx:number;dy:number}[],mx=Math.min(...valid.map(p=>p.dx)),my=Math.min(...valid.map(p=>p.dy));
 if(mirrored.items.some((p,i)=>p.itemId!==doc.items[i].itemId||p.dx+mx!==valid[i].dx||p.dy+my!==valid[i].dy))return null;
 const items:AreaSceneItem[]=[],anchors=new Map<string,AreaSceneItem>();
 function add(p:AreaSceneItem,ox:number,oy:number){
  const row={...p,dx:p.dx+ox,dy:p.dy+oy},key=(p.network?.kind??'furniture')+':'+row.dx+':'+row.dy,old=anchors.get(key);
  if(old)return JSON.stringify(old)===JSON.stringify(row);
  anchors.set(key,row);items.push(row);return true;
 }
 for(const p of doc.items)if(!add(p,x,y))return null;
 for(const p of mirrored.items)if(!add(p,mx,my))return null;
 const minX=Math.min(...items.map(p=>p.dx)),minY=Math.min(...items.map(p=>p.dy));
 try{return {doc:parseAreaScene(JSON.stringify({...doc,items:items.map(p=>({...p,dx:p.dx-minX,dy:p.dy-minY}))})),x:minX/2,y:-minY/2};}catch{return null;}
}
export function areaPlacementCounts(q:AreaSceneCandidate){
 return areaSceneCounts(q.areaRows.map(r=>({itemId:Number(r.itemId),dx:0,dy:0,orientation:0,support:r.scene??null,network:r.network??null})));
}
