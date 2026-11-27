import {mainlandExtent,mainlandMapAnchor,bindFloatingIslandGrid,type MainlandGrid} from './mainland-world-coordinates.ts';
import {mainlandSavedInRect,type MainlandSavedObject} from './mainland-saved-objects.ts';
import {validCaptureRegion,type CaptureRegion} from './scene-capture-region.ts';
import {captureIslandDecoration,parseIslandDecoration,WORLD_DECORATION_FILE_LIMIT} from './island-decoration-preset.ts';
import type {islandSaveSnapshot} from './island-save-preset.ts';
import {networkKey,type NetworkPose} from './biome-network-preset.ts';
import {networkSceneShape} from './area-scene.ts';
import {landscapePoseKey,landscapeObjectPose,type LandscapePose} from './landscape-decoration-preset.ts';
import {stockSourceEligible} from './save-furniture-placement.ts';
import {supportAreaEligible,type SupportAreaTrees} from './biome-furniture-preset.ts';
import {CARDINAL_ORIENTATIONS} from './saved-map-transform.ts';
import type {DesignPlacement,DesignItemGeometry} from './design-layout.ts';
import type {SourceObjectShape} from './source-object-map.ts';
type Snapshot=NonNullable<ReturnType<typeof islandSaveSnapshot>>;
type Incoming=ReturnType<typeof parseIslandDecoration>;
const isNetwork=(p:MainlandSavedObject)=>p.object.layer==='ground'||p.object.layer==='fence';
const inside=(r:CaptureRegion,p:{x:number;y:number;factor:number;shape:SourceObjectShape|null})=>!!p.shape&&p.shape.runs.every(q=>p.x+q.x/p.factor>=r.x&&p.x+(q.x+q.width)/p.factor<=r.x+r.w&&p.y-(q.y+1)/p.factor>=r.y&&p.y-q.y/p.factor<=r.y+r.h);
const pose=(p:DesignPlacement)=>[p.itemId,p.x,p.y,p.orientation].join(':');
const networkPose=(g:MainlandGrid,p:NetworkPose)=>({...mainlandMapAnchor(g,p.x,p.y),area:g.key,itemId:p.itemId,kind:p.network.kind});
type BoundaryPose=ReturnType<typeof networkPose>;
// Boundary connectivity is not inferred. Reject possible links to any
// network outside the selection, including across native grid boundaries.
function touches(a:BoundaryPose,b:BoundaryPose){return a.kind===b.kind&&(a.kind==='fence'||a.itemId===b.itemId)&&Math.abs(a.x-b.x)<=(a.kind==='road'?2:8)&&Math.abs(a.y-b.y)<=(a.kind==='road'?2:8);}
// Spatial bins preserve the existing conservative distances, including
// negative world coordinates and neighboring native grids. A large backup
// need not scan every outside network row for each selected or incoming row.
export function regionNetworkContactIndex(outside:readonly BoundaryPose[]){
 const buckets=new Map<string,BoundaryPose[]>();
 const span=(p:BoundaryPose)=>p.kind==='road'?2:8;
 const key=(p:BoundaryPose,x:number,y:number)=>[p.kind,p.kind==='road'?p.itemId:0,x,y].join(':');
 for(const p of outside){
  const d=span(p),k=key(p,Math.floor(p.x/d),Math.floor(p.y/d)),rows=buckets.get(k);
  if(rows)rows.push(p);else buckets.set(k,[p]);
 }
 return (p:BoundaryPose)=>{
  const d=span(p),x=Math.floor(p.x/d),y=Math.floor(p.y/d);
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)if(buckets.get(key(p,x+dx,y+dy))?.some(o=>touches(p,o)))return true;
  return false;
 };
}
function split(region:CaptureRegion,grids:readonly MainlandGrid[],snapshot:Snapshot,networks:ReadonlyMap<string,readonly NetworkPose[]>,landscapes?:ReadonlyMap<string,readonly LandscapePose[]>){
 if(!validCaptureRegion(region,mainlandExtent(grids)))return null;
 const landscape=new Map<string,LandscapePose[]>(),objects=new Map<string,readonly MainlandSavedObject[]>(),rows=new Map<string,NetworkPose[]>(),insideNet:BoundaryPose[]=[],outsideNet:BoundaryPose[]=[];
 for(const g of grids){
  const all=snapshot.objects.get(g.key),net=networks.get(g.key);if(!all||!net)return null;
  const known=new Set((landscapes?.get(g.key)??[]).map(landscapePoseKey));
  const relevant=all.filter(p=>{const ordinary:boolean=stockSourceEligible(p);return ordinary||!!bindMainlandGrid(g)&&p.factor===1&&!p.object.surfaceCapable&&stockSourceEligible(p,true)||supportAreaEligible(p)||isNetwork(p)||known.has(landscapePoseKey(landscapeObjectPose(p)));});
  if(relevant.some(p=>!p.shape))return null;
  const hit=mainlandSavedInRect(relevant,region,{x:region.x+region.w,y:region.y+region.h});
  if(hit.some(p=>!inside(region,p)))return null;
  const picked=all.filter(p=>inside(region,p));objects.set(g.key,picked);if(landscapes?.has(g.key))landscape.set(g.key,picked.filter(p=>known.has(landscapePoseKey(landscapeObjectPose(p)))).map(landscapeObjectPose));
  const selected:NetworkPose[]=[],native=new Map<string,MainlandSavedObject|null>();
  const objectKey=(id:number,x:number,y:number,orientation:unknown)=>[id,x,y,orientation].join(':');
  for(const o of all)if(isNetwork(o)){
   const k=objectKey(Number(o.object.itemId),o.object.x,o.object.y,o.object.orientation);
   native.set(k,native.has(k)?null:o);
  }
  for(const p of net){
   const match=native.get(objectKey(p.itemId,p.x,p.y,CARDINAL_ORIENTATIONS[p.orientation]));if(!match)return null;
   if(inside(region,match)){selected.push(p);insideNet.push(networkPose(g,p));}else outsideNet.push(networkPose(g,p));
  }
  rows.set(g.key,selected);
 }
 const outsideContact=regionNetworkContactIndex(outsideNet);
 if(insideNet.some(outsideContact))return null;
 return {snapshot:{...snapshot,objects},networks:rows,landscapes:landscape,outsideContact};
}
// Independent island surfaces have separate local coordinate bases.
 // Never interpret coincident coordinates on two surfaces as the same area.
 const validRegionScope=(grids:readonly MainlandGrid[],world:boolean)=>world?grids.length>0:grids.length===1&&!!bindFloatingIslandGrid(grids[0]);
export function reviewRegionCapture(region:CaptureRegion,grids:readonly MainlandGrid[],snapshot:Snapshot,networks:ReadonlyMap<string,readonly NetworkPose[]>,supports:SupportAreaTrees,world=true,landscapes?:ReadonlyMap<string,readonly LandscapePose[]>){
 if(!validRegionScope(grids,world))return null;
 const part=split(region,grids,snapshot,networks,landscapes);if(!part)return null;
 const doc=captureIslandDecoration(grids,part.snapshot,part.networks,supports,world,part.landscapes);if(!doc)return null;
 const text=JSON.stringify({schema:'wand.preset.region-decoration@1',region,...(world?{world:JSON.parse(doc.text)}:{island:JSON.parse(doc.text)})});
 return text.length<=WORLD_DECORATION_FILE_LIMIT?{text,summaries:doc.summaries}:null;
}
export function captureRegionDecoration(region:CaptureRegion,grids:readonly MainlandGrid[],snapshot:Snapshot,networks:ReadonlyMap<string,readonly NetworkPose[]>,supports:SupportAreaTrees,world=true,landscapes?:ReadonlyMap<string,readonly LandscapePose[]>):string|null{
 return reviewRegionCapture(region,grids,snapshot,networks,supports,world,landscapes)?.text??null;
}
export function parseRegionDecoration(text:string,grids:readonly MainlandGrid[],world=true):{region:CaptureRegion;incoming:Incoming}{
 if(text.length>WORLD_DECORATION_FILE_LIMIT||!validRegionScope(grids,world))throw Error('REGION_LIMIT');
 const v=JSON.parse(text),r=v?.region;
 if(!v||Object.keys(v).length!==3||v.schema!=='wand.preset.region-decoration@1'||!r||Object.keys(r).length!==4||!['x','y','w','h'].every(k=>typeof r[k]==='number')||!validCaptureRegion(r,mainlandExtent(grids)))throw Error('REGION_SCOPE');
 if(!Object.hasOwn(v,world?'world':'island'))throw Error('REGION_SCOPE');
 const incoming=parseIslandDecoration(JSON.stringify(world?v.world:v.island),grids,world);if([...incoming.values()].some(a=>!a.supports))throw Error('REGION_SUPPORT');
 return {region:{x:r.x,y:r.y,w:r.w,h:r.h},incoming};
}
/** Merge only selected cells into the exact current full-world document.
 * All outside objects, support trees and networks are retained. Untrusted
 * incoming rows must fit entirely inside the chosen rectangle. */
export function mergeRegionDecoration(region:CaptureRegion,grids:readonly MainlandGrid[],snapshot:Snapshot,networks:ReadonlyMap<string,readonly NetworkPose[]>,supports:SupportAreaTrees,current:Incoming,incoming:Incoming,defs:ReadonlyMap<string,ReadonlyMap<number,DesignItemGeometry>>,world=true,landscapes?:ReadonlyMap<string,readonly LandscapePose[]>):Incoming|null{
 if(!validRegionScope(grids,world))return null;
 const part=split(region,grids,snapshot,networks,landscapes);if(!part)return null;
 const captured=captureIslandDecoration(grids,part.snapshot,part.networks,supports,world,part.landscapes);if(!captured)return null;
 let old:Incoming;try{old=parseIslandDecoration(captured.text,grids,world);}catch{return null;}
 const result:Incoming=new Map();
 for(const g of grids){
  const before=current.get(g.key),replaced=old.get(g.key),next=incoming.get(g.key),geometry=defs.get(g.key);if(!before?.supports||!replaced||!next?.supports||!geometry)return null;
  for(const p of next.furniture){const shape=geometry.get(p.itemId)?.shapes[p.itemId+':'+p.orientation*4];if(!shape||!inside(region,{...mainlandMapAnchor(g,p.x,p.y),factor:g.factor,shape}))return null;}
  for(const p of next.network){const shape=networkSceneShape({...p,dx:0,dy:0,support:null},geometry.get(p.itemId),g.factor);if(!shape||!inside(region,{...mainlandMapAnchor(g,p.x,p.y),factor:g.factor,shape})||part.outsideContact(networkPose(g,p)))return null;}
  const oldFurniture=new Set(replaced.furniture.map(pose)),oldNetwork=new Set(replaced.network.map(networkKey));
  const furniture:DesignPlacement[]=[],attachments:Map<number,NonNullable<typeof before.supports> extends ReadonlyMap<number,infer S>?S:never>=new Map();
  for(const [rows,scenes] of [[before.furniture.filter(p=>!oldFurniture.has(pose(p))),before.supports],[next.furniture,next.supports]] as const){
   for(const p of rows){const id=furniture.length+1;furniture.push({...p,id});const scene=scenes.get(p.id);if(scene)attachments.set(id,scene);}
  }
  let landscape:LandscapePose[]|undefined;
  if(next.landscape!==undefined){if(!before.landscape||!replaced.landscape)return null;for(const p of next.landscape){const shape=geometry.get(p.itemId)?.shapes[p.itemId+':'+p.orientation*4];if(!shape||!inside(region,{...mainlandMapAnchor(g,p.x,p.y),factor:g.factor,shape}))return null;}const old=new Set(replaced.landscape.map(landscapePoseKey));landscape=[...before.landscape.filter(p=>!old.has(landscapePoseKey(p))),...next.landscape];}
  result.set(g.key,{...(landscape!==undefined?{landscape}:{}),furniture,network:[...before.network.filter(p=>!oldNetwork.has(networkKey(p))),...next.network],supports:attachments});
 }
 return result;
}
export const regionBackupWords={
 ja:['指定マス範囲のバックアップ','範囲を確定','範囲を保存','範囲をリストア','選択範囲の装飾だけを復元します。境界をまたぐ家具・ネットワークがある場合は範囲を広げてください。'],
 en:['Selected-cell backup','Confirm region','Save region','Restore region','Restore only the selected region. Enlarge it if objects or networks cross the boundary.'],
 fr:['Sauvegarde de zone','Confirmer la zone','Enregistrer la zone','Restaurer la zone','Restaure uniquement la zone sélectionnée.'],
 it:['Backup area','Conferma area','Salva area','Ripristina area','Ripristina solo l’area selezionata.'],
 de:['Bereichssicherung','Bereich bestätigen','Bereich speichern','Bereich wiederherstellen','Nur den ausgewählten Bereich wiederherstellen.'],
 'es-ES':['Copia de zona','Confirmar zona','Guardar zona','Restaurar zona','Restaura únicamente la zona seleccionada.'],
 'zh-CN':['指定格子范围备份','确认范围','保存范围','恢复范围','仅恢复选定范围。若物品或网络跨越边界，请扩大范围。'],
 'pt-BR':['Backup de região','Confirmar região','Salvar região','Restaurar região','Restaura somente a região selecionada.']
} as const;
