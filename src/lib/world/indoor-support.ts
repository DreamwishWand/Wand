import type {GroupPickupRow} from './group-pickup.ts';
import type {CutClipboard,CutWitness} from './group-paste.ts';
import type {DesignClipItem} from './design-layout.ts';
import type {TerrainRaster} from './terrain-binding.ts';
import {supportShapeKey,supportPlacementFits,type SupportTree} from './subgrid-local.ts';
import {CARDINAL_ORIENTATIONS,isCardinal} from './saved-map-transform.ts';
import type {SourceObjectShape} from './source-object-map.ts';
import type {IndoorSurface} from './indoor-room-view.ts';
import type {IndoorRoom} from './indoor-room-view.ts';
export interface SupportParentWitness{localOrdinal:number;itemId:number;x:number;y:number}
export interface SupportTransferTarget extends SupportParentWitness{context:string}
/** The room projection and outdoor map share the same local native handle.
 * Never resolve a destination by name or coordinates alone. */
export function supportTransferTargets(source:SupportParentWitness|null,targets:readonly SupportTransferTarget[],names:ReadonlyMap<number,string>,query:string):SupportTransferTarget[]{
 if(!source)return [];
 const needle=query.normalize('NFKC').toLocaleLowerCase().trim();
 const seen=new Set<number>([source.localOrdinal]);
 return targets.filter(p=>{
  if(seen.has(p.localOrdinal))return false;
  seen.add(p.localOrdinal);
  return ((names.get(p.itemId)??'')+' '+p.context).normalize('NFKC').toLocaleLowerCase().includes(needle);
 });
}
/** Capture a normalized half-cell layout and immutable native parent/leaf witnesses. */
export function captureSupportCut(tree:SupportTree,shapes:Readonly<Record<string,SourceObjectShape>>,eligible:ReadonlySet<number>,raster:TerrainRaster,indices:readonly number[],parent:SupportParentWitness,path:readonly number[]):{rows:CutWitness[];clip:DesignClipItem[]}|null{
 if(!indices.length||indices.length>32||new Set(indices).size!==indices.length||!tree.factor)return null;
 const rows:CutWitness[]=[],clip:DesignClipItem[]=[];
 for(const index of indices){
  const o=tree.objects[index],key=o?supportShapeKey(o):null;
  if(!o||o.child||!eligible.has(o.itemId)||Math.floor(o.itemId/100000)!==400||!isCardinal(o.orientation)||!key||!shapes[key]?.cellCount||o.x<0||o.y<0||o.x>=raster.sizeX*tree.factor||o.y>=raster.sizeY*tree.factor)return null;
  rows.push({localOrdinal:parent.localOrdinal,supportSource:{parentItemId:parent.itemId,parentX:parent.x,parentY:parent.y,path:[...path],index},area:'indoor',itemId:String(o.itemId),expectedX:o.x,expectedY:o.y,expectedOrientation:o.orientation});
  clip.push({itemId:o.itemId,dx:o.x*2/tree.factor,dy:o.y*2/tree.factor,orientation:CARDINAL_ORIENTATIONS.indexOf(o.orientation)});
 }
 const x=Math.min(...clip.map(p=>p.dx)),y=Math.min(...clip.map(p=>p.dy));
 return {rows,clip:clip.map(p=>({...p,dx:p.dx-x,dy:p.dy-y}))};
}
export function supportFloorGroup(cut:CutClipboard|null,file:File|null,clip:readonly DesignClipItem[]){
 if(!file||!cut||cut.file!==file||!cut.rows.length||cut.rows.length>32||cut.rows.length!==clip.length)return null;
 const rows=cut.rows.map((row,i)=>{const source=supportFloorCut({...cut,rows:[row]},file),p=clip[i];return source&&p.itemId===source.itemId&&[p.dx,p.dy,p.orientation].every(Number.isSafeInteger)&&p.dx>=0&&p.dy>=0&&p.orientation>=0&&p.orientation<4?{source,p}:null;});
 return rows.every(r=>r!==null)?rows as NonNullable<typeof rows[number]>[]:null;
}
export function supportFloorGroupPlan(cut:CutClipboard|null,file:File|null,clip:readonly DesignClipItem[],tree:SupportTree,shapes:Readonly<Record<string,SourceObjectShape>>,eligible:ReadonlySet<number>,raster:TerrainRaster,x:number,y:number){
 const group=supportFloorGroup(cut,file,clip);
 if(!group||tree.objects.length+group.length>512)return null;
 const rows=group.map(({source,p})=>{const px=x+p.dx*tree.factor/2,py=y+p.dy*tree.factor/2,orientation=CARDINAL_ORIENTATIONS[p.orientation];return eligible.has(source.itemId)&&supportPlacementFits(tree,shapes,raster,source.itemId,px,py,orientation,true)?{...source,x:px,y:py,orientation}:null;});
 return rows.every(r=>r!==null)?rows as NonNullable<typeof rows[number]>[]:null;
}
/** Only one exact ordinary room floor leaf may be pasted into a support.
 * The clipboard is bound to the unchanged local working Save. */
export function supportFloorCut(cut:CutClipboard|null,file:File|null){
 const row=cut?.rows[0];
 if(!file||!cut||cut.file!==file||cut.rows.length!==1||!row||row.supportFactor!==undefined||row.storage||!isCardinal(row.expectedOrientation)||row.roomSource&&cut.scope!=='indoor')return null;
 const itemId=Number(row.itemId);
 if(!Number.isSafeInteger(itemId)||String(itemId)!==row.itemId||Math.floor(itemId/100000)!==400)return null;
 return {...(row.roomSource?{roomSource:row.roomSource}:{localOrdinal:row.localOrdinal,...(row.supportSource?{supportSource:row.supportSource}:{})}),itemId,expectedX:row.expectedX,expectedY:row.expectedY,expectedOrientation:row.expectedOrientation};
}
export const supportFloorPasteWords={ja:'切り取った家具をここに移動',en:'Move cut furniture here',fr:'Déplacer le meuble coupé ici',it:'Sposta qui il mobile tagliato',de:'Ausgeschnittenes Möbel hierher verschieben','es-ES':'Mover aquí el mueble cortado','zh-CN':'将剪切的家具移到此处','pt-BR':'Mover móvel recortado para cá'} as const;
export type IndoorSupportWitness=SupportParentWitness&{roomOrdinal:number;surfaceOrdinal:number;index:number};
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
/** Validate ephemeral support handles against the exact projected surface.
 * Never expose native Grid/Object IDs or infer a parent by item name. */
export function parseIndoorSupportParents(value:unknown,rooms:readonly IndoorRoom[]):IndoorSupportWitness[]{
 if(!record(value)||value.supportParents===undefined)return [];
 if(!Array.isArray(value.supportParents)||value.supportParents.length>20000)throw Error('INDOOR_SUPPORT');
 const seen=new Set<number>(),poses=new Set<string>();
 return value.supportParents.map(w=>{
  if(!record(w)||Object.keys(w).length!==7||!integer(w.roomOrdinal,1,2048)||!integer(w.surfaceOrdinal,1,65)||!integer(w.index,0,99999)||!integer(w.localOrdinal,1,20000)||!integer(w.itemId,1,0xffffffff)||!integer(w.x,-1000000,1000000)||!integer(w.y,-1000000,1000000)||seen.has(w.localOrdinal))throw Error('INDOOR_SUPPORT');
  const face=rooms[w.roomOrdinal-1]?.surfaces[w.surfaceOrdinal-1],pose=face?.positions[w.index],key=w.roomOrdinal+':'+w.surfaceOrdinal+':'+w.index;
  if(!face||face.gridStatus!=='full'||face.missingPositions||!face.factor||!pose||pose.itemId!==w.itemId||pose.x!==w.x||pose.y!==w.y||poses.has(key))throw Error('INDOOR_SUPPORT');
  seen.add(w.localOrdinal);poses.add(key);return {roomOrdinal:w.roomOrdinal,surfaceOrdinal:w.surfaceOrdinal,index:w.index,localOrdinal:w.localOrdinal,itemId:w.itemId,x:w.x,y:w.y};
 });
}

/** Only exact support roots on the selected surface. The existing Rust
 * group pickup writer revalidates the whole descendant/stock closure. */
export function roomSupportPickupPlan(face:IndoorSurface|null,witnesses:readonly IndoorSupportWitness[],indices:readonly number[],shapes:Readonly<Record<string,SourceObjectShape>>,removable:ReadonlySet<number>):GroupPickupRow[]|null{
 if(!face||face.gridStatus!=='full'||!face.factor||face.missingPositions||!indices.length||indices.length>32||new Set(indices).size!==indices.length)return null;
 const rows:GroupPickupRow[]=[];
 for(const index of indices){
  const p=face.positions[index],w=witnesses.find(w=>w.index===index&&w.surfaceOrdinal===face.ordinal);
  if(!p||!w||w.itemId!==p.itemId||w.x!==p.x||w.y!==p.y||Math.floor(p.itemId/100000)!==400||p.orientationCode===null||p.orientationCode%4!==0||p.plain===true||p.storage===true||!shapes[p.itemId+':'+p.orientationCode]||!removable.has(p.itemId))return null;
  rows.push({localOrdinal:w.localOrdinal,itemId:String(p.itemId),expectedX:p.x,expectedY:p.y,expectedOrientation:CARDINAL_ORIENTATIONS[p.orientationCode/4],includeSupport:true});
 }
 return new Set(rows.map(r=>r.localOrdinal)).size===rows.length?rows.sort((a,b)=>a.localOrdinal-b.localOrdinal):null;
}
