import {stockSourceEligible,stockPlacement,stockFootprintFeedback,type StockCandidate,type StockDestination} from './save-furniture-placement.ts';
import {CARDINAL_ORIENTATIONS,type Cardinal} from './saved-map-transform.ts';
import {WORLD_BATCH_LIMIT} from './saved-map-batch.ts';
import {rotateDesignClipboard,type DesignClipItem,type DesignItemGeometry} from './design-layout.ts';
import type {MainlandSavedObject} from './mainland-saved-objects.ts';
import {mainlandTerrainHits,type MainlandGrid} from './mainland-world-coordinates.ts';
import type {TerrainRaster} from './terrain-binding.ts';
import {nativeActionBlocked} from './native-edit-restrictions.ts';
import {writable} from 'svelte/store';
/** Half-cell coordinates and canonical item IDs only. No native Save IDs,
 * bytes, state, or system clipboard. Remains in this tab across world views. */
export const worldFurnitureClipboard=writable<readonly DesignClipItem[]>([]);
export function captureFurnitureGroup(items:readonly MainlandSavedObject[]):DesignClipItem[]|null{
 if(!items.length||items.length>WORLD_BATCH_LIMIT||new Set(items.map(p=>p.object.localOrdinal)).size!==items.length)return null;
 const rows=items.map(p=>{
  if(!stockSourceEligible(p)||nativeActionBlocked(p.object.editRestrictions,'move')||!Number.isSafeInteger(p.x*2)||!Number.isSafeInteger(-p.y*2))return null;
  const orientation=CARDINAL_ORIENTATIONS.indexOf(p.object.orientation as Cardinal);
  if(orientation<0)return null;
  return {itemId:Number(p.object.itemId),dx:p.x*2,dy:-p.y*2,orientation};
 });
 if(rows.some(p=>!p))return null;
 const a=rows as DesignClipItem[],x=Math.min(...a.map(p=>p.dx)),y=Math.min(...a.map(p=>p.dy));
 return a.map(p=>({...p,dx:p.dx-x,dy:p.dy-y}));
}
export type GroupGeometry=ReadonlyMap<number,ReadonlyMap<number,DesignItemGeometry>>;
export interface GroupPasteRow{itemId:string;x:number;y:number;orientation:Cardinal;destination:StockDestination}
export interface GroupPasteCandidate{rows:GroupPasteRow[];ghosts:StockCandidate[]}
export function groupStockAvailable(clip:readonly DesignClipItem[],counts:ReadonlyMap<number,number>):boolean{
 const used=new Map<number,number>();
 return !!clip.length&&clip.every(p=>{const n=(used.get(p.itemId)??0)+1;used.set(p.itemId,n);return n<=(counts.get(p.itemId)??0);});
}
/** Rotate in common half-cell coordinates. Scale source factor-1 dimensions
 * for rotation only; actual placement uses the native runs for each target. */
export function rotateFurnitureGroup(clip:readonly DesignClipItem[],defs:GroupGeometry,turn:number){
 const scaled=new Map<number,DesignItemGeometry>();
 for(const item of clip){
  const a=defs.get(item.itemId),d=a?.get(2)??a?.get(1);if(!d)return null;
  if(a?.has(2))scaled.set(item.itemId,d);
  else scaled.set(item.itemId,{...d,shapes:Object.fromEntries(Object.entries(d.shapes).map(([key,s])=>[key,{...s,width:s.width*2,height:s.height*2,cellCount:s.cellCount*4,runs:s.runs.flatMap(r=>[0,1].map(dy=>({x:r.x*2,y:r.y*2+dy,width:r.width*2})))}]))});
 }
 return rotateDesignClipboard(clip,scaled,turn);
}
export function groupPasteCandidate(clip:readonly DesignClipItem[],grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,defs:GroupGeometry,stock:ReadonlyMap<number,number>,objects:readonly MainlandSavedObject[],omitted:number,wx:number,wy:number):GroupPasteCandidate|null{
 if(!clip.length||clip.length>WORLD_BATCH_LIMIT||!groupStockAvailable(clip,stock)||!Number.isFinite(wx)||!Number.isFinite(wy))return null;
 const hits=mainlandTerrainHits(grids,rasters,wx,wy);if(hits.length!==1)return null;
 const g=hits[0],baseX=2*g.origin.position[0]+Math.floor((wx-2*g.origin.position[0])*g.factor)/g.factor,baseY=-2*g.origin.position[2]-Math.floor((-wy-2*g.origin.position[2])*g.factor)/g.factor;
 const rows:GroupPasteRow[]=[],ghosts:StockCandidate[]=[],anchors=new Set<string>();
 for(const p of clip){
  if(![p.dx,p.dy,p.orientation].every(Number.isSafeInteger)||p.dx<0||p.dy<0||p.orientation<0||p.orientation>3)return null;
  const x=baseX+p.dx/2,y=baseY-p.dy/2,geo=defs.get(p.itemId);if(!geo)return null;
  const target=mainlandTerrainHits(grids,rasters,x+.001,y-.001);if(target.length!==1)return null;
  const t=target[0],lx=(x-2*t.origin.position[0])*t.factor,ly=(-y-2*t.origin.position[2])*t.factor;
  if(!Number.isSafeInteger(lx)||!Number.isSafeInteger(ly))return null;
  const q=stockPlacement(grids,rasters,geo,p.itemId,CARDINAL_ORIENTATIONS[p.orientation],x+.001,y-.001);
  if(!q||q.plan.action!=='place'||!q.destination||q.plan.x!==lx||q.plan.y!==ly)return null;
  const key=q.area+':'+lx+':'+ly;if(anchors.has(key)||objects.some(o=>o.area===q.area&&o.object.layer!=='ground'&&o.object.x===lx&&o.object.y===ly))return null;
  anchors.add(key);
  // Exact occupied-cell conflicts are refused for ordinary group placement;
  // roads remain visible context. Unknown objects remain a warning.
  if(stockFootprintFeedback(q,objects,omitted).overlaps>0)return null;
  for(const other of ghosts){
   const synthetic:MainlandSavedObject={area:other.area,x:other.x,y:other.y,factor:other.factor,shape:other.shape,object:{localOrdinal:1,localGridOrdinal:1,itemId:other.plan.itemId,x:0,y:0,orientation:'GridOrientation_Down',orientationCode:8,shapeKey:null,name:null,layer:'furniture',surfaceCapable:false}};
   if(stockFootprintFeedback(q,[synthetic]).overlaps>0)return null;
  }
  rows.push({itemId:q.plan.itemId,x:lx,y:ly,orientation:q.plan.orientation,destination:q.destination});ghosts.push(q);
 }
 return {rows,ghosts};
}
export const groupPasteWords={
 ja:['家具をコピー','貼り付け','複製','コピー済み','配置先をクリック','在庫または配置先を確認できません。','形状・在庫を確認中…','配置を確認','取消','左回転','右回転'],
 en:['Copy furniture','Paste','Duplicate','Copied','Choose destination','Stock or destination unavailable.','Checking geometry and stock…','Review placement','Cancel','Rotate left','Rotate right'],
 fr:['Copier les meubles','Coller','Dupliquer','Copié','Choisir la destination','Stock ou destination indisponible.','Vérification…','Vérifier le placement','Annuler','Rotation gauche','Rotation droite'],
 it:['Copia mobili','Incolla','Duplica','Copiato','Scegli destinazione','Scorte o destinazione non disponibili.','Verifica…','Verifica posizione','Annulla','Ruota a sinistra','Ruota a destra'],
 de:['Möbel kopieren','Einfügen','Duplizieren','Kopiert','Ziel wählen','Bestand oder Ziel nicht verfügbar.','Prüfung…','Platzierung prüfen','Abbrechen','Links drehen','Rechts drehen'],
 'es-ES':['Copiar muebles','Pegar','Duplicar','Copiado','Elegir destino','Inventario o destino no disponible.','Comprobando…','Revisar posición','Cancelar','Girar izquierda','Girar derecha'],
 'zh-CN':['复制家具','粘贴','创建副本','已复制','选择目标位置','库存或目标位置不可用。','验证形状和库存…','确认放置','取消','向左旋转','向右旋转'],
 'pt-BR':['Copiar móveis','Colar','Duplicar','Copiado','Escolher destino','Estoque ou destino indisponível.','Verificando…','Revisar posição','Cancelar','Girar esquerda','Girar direita']
} as const;
