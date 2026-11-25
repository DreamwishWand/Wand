import {stockSourceEligible,stockPlacement,stockFootprintFeedback,type StockCandidate,type StockDestination} from './save-furniture-placement.ts';
import {CARDINAL_ORIENTATIONS,type Cardinal} from './saved-map-transform.ts';
import {WORLD_BATCH_LIMIT} from './saved-map-batch.ts';
import {rotateDesignClipboard,type DesignClipItem,type DesignItemGeometry} from './design-layout.ts';
import type {MainlandSavedObject} from './mainland-saved-objects.ts';
import {mainlandTerrainHits,type MainlandGrid} from './mainland-world-coordinates.ts';
import type {TerrainRaster} from './terrain-binding.ts';
import {nativeActionBlocked} from './native-edit-restrictions.ts';
import {writable} from 'svelte/store';
import {reflectedDesignItem,type SymmetryMode} from './design-symmetry.ts';
import type {SourceObjectShape} from './source-object-map.ts';
import {supportParentEligible} from './subgrid-local.ts';
/** Half-cell coordinates and canonical item IDs only. No native Save IDs,
 * bytes, state, or system clipboard. Remains in this tab across world views. */
export const worldFurnitureClipboard=writable<readonly DesignClipItem[]>([]);
function cutEligible(p:MainlandSavedObject,allowSupport:boolean){return stockSourceEligible(p)||allowSupport&&supportParentEligible(p)&&!nativeActionBlocked(p.object.editRestrictions,'switchGrid')&&!nativeActionBlocked(p.object.editRestrictions,'rotate');}
export function captureFurnitureGroup(items:readonly MainlandSavedObject[],allowSupport=false):DesignClipItem[]|null{
 if(!items.length||items.length>WORLD_BATCH_LIMIT||new Set(items.map(p=>p.object.localOrdinal)).size!==items.length)return null;
 const rows=items.map(p=>{
  if(!cutEligible(p,allowSupport)||nativeActionBlocked(p.object.editRestrictions,'move')||!Number.isSafeInteger(p.x*2)||!Number.isSafeInteger(-p.y*2))return null;
  const orientation=CARDINAL_ORIENTATIONS.indexOf(p.object.orientation as Cardinal);
  if(orientation<0)return null;
  return {itemId:Number(p.object.itemId),dx:p.x*2,dy:-p.y*2,orientation};
 });
 if(rows.some(p=>!p))return null;
 const a=rows as DesignClipItem[],x=Math.min(...a.map(p=>p.dx)),y=Math.min(...a.map(p=>p.dy));
 return a.map(p=>({...p,dx:p.dx-x,dy:p.dy-y}));
}
export const ROOM_CUT_LIMIT=32;
export type RoomCutSource={roomOrdinal:number;index:number};
type CutPose={itemId:string;expectedX:number;expectedY:number;expectedOrientation:Cardinal;area:string;supportFactor?:1|2};
export type CutWitness=CutPose&({localOrdinal:number;roomSource?:never}|{roomSource:RoomCutSource;localOrdinal?:never});
export interface CutClipboard{file:File;scope:string;rows:CutWitness[]}
export const worldFurnitureCut=writable<CutClipboard|null>(null);
export function captureCutWitness(items:readonly MainlandSavedObject[]):CutWitness[]|null{
 if(!captureFurnitureGroup(items,true)||items.some(p=>p.object.subgrid)&&items.length>ROOM_CUT_LIMIT)return null;
 return items.map(p=>({localOrdinal:p.object.localOrdinal,itemId:p.object.itemId,expectedX:p.object.x,expectedY:p.object.y,expectedOrientation:p.object.orientation as Cardinal,area:p.area,...(p.object.subgrid?{supportFactor:p.factor}:{})}));
}
export function cutWitnessMatches(rows:readonly CutWitness[],objects:readonly MainlandSavedObject[]):boolean{
 return !!rows.length&&rows.every(r=>objects.some(p=>p.area===r.area&&p.object.localOrdinal===r.localOrdinal&&p.object.itemId===r.itemId&&p.object.x===r.expectedX&&p.object.y===r.expectedY&&p.object.orientation===r.expectedOrientation&&cutEligible(p,!!r.supportFactor)&&(!r.supportFactor||p.factor===r.supportFactor&&!!p.object.subgrid)&&!nativeActionBlocked(p.object.editRestrictions,'move')));
}
/** Ordinals are global to the exact opened File. Other world views cannot
 * inspect the source objects; any visible ordinal must still match. Rust
 * re-resolves every source pose against the unchanged file before writing. */
export function cutClipboardMatches(cut:CutClipboard,file:File|null,scope:string,objects:readonly MainlandSavedObject[]):boolean{
 if(cut.file!==file||!cut.scope||!scope||!cut.rows.length)return false;
 if(cut.rows.some(r=>r.roomSource))return cut.scope==='indoor'&&cut.rows.length<=ROOM_CUT_LIMIT&&cut.rows.every(r=>r.roomSource&&r.roomSource.roomOrdinal===cut.rows[0].roomSource?.roomOrdinal)&&new Set(cut.rows.map(r=>r.roomSource?.index)).size===cut.rows.length&&scope!=='indoor';
 if(cut.rows.some(r=>r.supportFactor)&&cut.scope!==scope)return false;
 if(cut.scope===scope)return cutWitnessMatches(cut.rows,objects);
 return cut.rows.every(r=>!objects.some(p=>p.object.localOrdinal===r.localOrdinal));
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
/** Physical bounds on the common half-cell lattice, used for Scene anchor
 * snapping. A target factor must have source-derived geometry. */
export function groupSceneOrigin(clip:readonly DesignClipItem[],defs:GroupGeometry,grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,p:{x:number;y:number},anchor:'corner'|'center'){
 if(anchor==='corner')return p;
 const hits=mainlandTerrainHits(grids,rasters,p.x,p.y);if(hits.length!==1)return null;
 const g=hits[0];let width=0,height=0;
 for(const item of clip){const s=defs.get(item.itemId)?.get(g.factor)?.shapes[item.itemId+':'+item.orientation*4];if(!s)return null;width=Math.max(width,item.dx/2+s.width/g.factor);height=Math.max(height,item.dy/2+s.height/g.factor);}
 if(!width||!height)return null;
 const x=2*g.origin.position[0]+Math.floor((p.x-2*g.origin.position[0])*g.factor)/g.factor;
 const y=-2*g.origin.position[2]-Math.floor((-p.y-2*g.origin.position[2])*g.factor)/g.factor;
 return {x:x-Math.floor((width*g.factor-1)/2)/g.factor+.001,y:y+Math.floor((height*g.factor-1)/2)/g.factor-.001};
}
export function groupPasteCandidate(clip:readonly DesignClipItem[],grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,defs:GroupGeometry,stock:ReadonlyMap<number,number>,objects:readonly MainlandSavedObject[],omitted:number,wx:number,wy:number):GroupPasteCandidate|null{
 if(!clip.length||clip.length>WORLD_BATCH_LIMIT||!groupStockAvailable(clip,stock)||!Number.isFinite(wx)||!Number.isFinite(wy))return null;
 const hits=mainlandTerrainHits(grids,rasters,wx,wy);if(hits.length!==1)return null;
 const g=hits[0],baseX=2*g.origin.position[0]+Math.floor((wx-2*g.origin.position[0])*g.factor)/g.factor,baseY=-2*g.origin.position[2]-Math.floor((-wy-2*g.origin.position[2])*g.factor)/g.factor;
 const poses=clip.map(p=>({itemId:p.itemId,x:baseX+p.dx/2,y:baseY-p.dy/2,orientation:p.orientation}));
 if(clip.some(p=>![p.dx,p.dy,p.orientation].every(Number.isSafeInteger)||p.dx<0||p.dy<0||p.orientation<0||p.orientation>3))return null;
 return groupAbsoluteCandidate(poses,grids,rasters,defs,stock,objects,omitted);
}
export interface WorldGroupPose{itemId:number;x:number;y:number;orientation:number}
export interface WorldSymmetryAxis{mode:SymmetryMode;x:number;y:number}
/** All poses share map coordinates; each independently resolves its exact
 * source Grid. The bounding rectangle's empty corner need not be on land. */
export function groupAbsoluteCandidate(poses:readonly WorldGroupPose[],grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,defs:GroupGeometry,stock:ReadonlyMap<number,number>,objects:readonly MainlandSavedObject[],omitted:number):GroupPasteCandidate|null{
 if(!poses.length||poses.length>WORLD_BATCH_LIMIT||!groupStockAvailable(poses.map(p=>({itemId:p.itemId,dx:0,dy:0,orientation:p.orientation})),stock))return null;
 const rows:GroupPasteRow[]=[],ghosts:StockCandidate[]=[],anchors=new Set<string>();
 for(const p of poses){
  const {x,y}=p,geo=defs.get(p.itemId);if(!geo||!Number.isSafeInteger(x*2)||!Number.isSafeInteger(y*2)||!Number.isInteger(p.orientation)||p.orientation<0||p.orientation>3)return null;
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
/** Compare exact occupied cells after normalization to half-map-unit cells.
 * This is only footprint/orientation symmetry, not a mirrored mesh. */
function physicalRuns(shape:SourceObjectShape,factor:number){
 const scale=2/factor;
 return shape.runs.flatMap(r=>Array.from({length:scale},(_,i)=>[r.y*scale+i,r.x*scale,r.width*scale])).sort((a,b)=>a[0]-b[0]||a[1]-b[1]).map(r=>r.join(':')).join(';');
}
export function savedWorldGroupPoses(items:readonly MainlandSavedObject[]):WorldGroupPose[]|null{
 if(!captureFurnitureGroup(items))return null;
 return items.map(p=>({itemId:Number(p.object.itemId),x:p.x,y:p.y,orientation:CARDINAL_ORIENTATIONS.indexOf(p.object.orientation as Cardinal)}));
}
export function symmetricWorldCandidate(original:readonly WorldGroupPose[],axis:WorldSymmetryAxis,includeOriginal:boolean,grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,defs:GroupGeometry,stock:ReadonlyMap<number,number>,objects:readonly MainlandSavedObject[],omitted:number):GroupPasteCandidate|null{
 if(!original.length||original.length>WORLD_BATCH_LIMIT||!Number.isSafeInteger(axis.x*4)||!Number.isSafeInteger(axis.y*4))return null;
 const out:WorldGroupPose[]=[],poses=new Set<string>(),anchors=new Map<string,string>();
 const key=(p:WorldGroupPose)=>p.itemId+':'+p.x+':'+p.y+':'+p.orientation;
 const anchor=(p:WorldGroupPose)=>p.x+':'+p.y;
 const existing=new Set(objects.map(p=>key({itemId:Number(p.object.itemId),x:p.x,y:p.y,orientation:CARDINAL_ORIENTATIONS.indexOf(p.object.orientation as Cardinal)})));
 function add(p:WorldGroupPose){
  const k=key(p),a=anchor(p);if(existing.has(k)||poses.has(k))return true;
  if(anchors.has(a))return false;anchors.set(a,k);poses.add(k);out.push(p);return true;
 }
 if(includeOriginal)for(const p of original)if(!add(p))return null;
 for(const p of original){
  const source=mainlandTerrainHits(grids,rasters,p.x+.001,p.y-.001);if(source.length!==1)return null;
  const g=source[0],def=defs.get(p.itemId)?.get(g.factor);if(!def)return null;
  const native=reflectedDesignItem({itemId:p.itemId,x:p.x*g.factor,y:-p.y*g.factor,orientation:p.orientation},def,{mode:axis.mode,x2:axis.x*2*g.factor,y2:-axis.y*2*g.factor});
  if(!native)return null;
  const next={...native,x:native.x/g.factor,y:-native.y/g.factor};
  const dest=mainlandTerrainHits(grids,rasters,next.x+.001,next.y-.001);if(dest.length!==1)return null;
  const a=def.shapes[p.itemId+':'+native.orientation*4],b=defs.get(p.itemId)?.get(dest[0].factor)?.shapes[p.itemId+':'+native.orientation*4];
  if(!a||!b||a.width/g.factor!==b.width/dest[0].factor||a.height/g.factor!==b.height/dest[0].factor||physicalRuns(a,g.factor)!==physicalRuns(b,dest[0].factor)||!add(next))return null;
 }
 return groupAbsoluteCandidate(out,grids,rasters,defs,stock,objects,omitted);
}
export function groupCandidatePoses(candidate:GroupPasteCandidate):WorldGroupPose[]{
 return candidate.ghosts.map((p,i)=>({itemId:Number(candidate.rows[i].itemId),x:p.x,y:p.y,orientation:CARDINAL_ORIENTATIONS.indexOf(candidate.rows[i].orientation)}));
}
export function groupCutPlan(cut:readonly CutWitness[],candidate:GroupPasteCandidate){
 if(cut.length!==candidate.rows.length)return null;
 const rows=candidate.rows.map((p,i)=>{const {area,...r}=cut[i];return {...r,...p};});
 return rows.every((r,i)=>r.itemId===cut[i].itemId&&(!r.supportFactor||r.destination.factor===r.supportFactor))?rows:null;
}
export const groupCutWords={
 ja:['切り取り','切り取り済み（貼り付けまで元の家具は残ります）','家具を移動','移動元を確認できません。'],
 en:['Cut','Cut (originals remain until paste)','Move furniture','Source furniture unavailable.'],
 fr:['Couper','Coupé (originaux conservés jusqu’au collage)','Déplacer','Meubles source indisponibles.'],
 it:['Taglia','Tagliato (originali conservati fino a incolla)','Sposta mobili','Origine non disponibile.'],
 de:['Ausschneiden','Ausgeschnitten (Originale bleiben bis zum Einfügen)','Möbel verschieben','Quellmöbel nicht verfügbar.'],
 'es-ES':['Cortar','Cortado (originales hasta pegar)','Mover muebles','Origen no disponible.'],
 'zh-CN':['剪切','已剪切（粘贴前保留原物品）','移动家具','无法确认原物品。'],
 'pt-BR':['Recortar','Recortado (originais mantidos até colar)','Mover móveis','Origem indisponível.']
} as const;
export const groupSceneWords={
 ja:['必要アイテム','所持数不足','Sceneを開けません。','現在の編集では一度に配置可能な家具数を超えています。'],
 en:['Required items','Insufficient stock','Cannot open this Scene.','This Scene exceeds the current single-placement limit.'],
 fr:['Objets requis','Stock insuffisant','Impossible d’ouvrir la scène.','La scène dépasse la limite de placement.'],
 it:['Oggetti richiesti','Scorte insufficienti','Impossibile aprire la scena.','La scena supera il limite di posizionamento.'],
 de:['Benötigte Objekte','Bestand nicht ausreichend','Szene kann nicht geöffnet werden.','Szene überschreitet das Platzierungslimit.'],
 'es-ES':['Objetos necesarios','Inventario insuficiente','No se puede abrir la escena.','La escena supera el límite de colocación.'],
 'zh-CN':['所需物品','库存不足','无法打开场景。','场景超过单次放置上限。'],
 'pt-BR':['Itens necessários','Estoque insuficiente','Não é possível abrir a cena.','A cena excede o limite de posicionamento.']
} as const;
export const groupSymmetryWords={
 ja:['対称編集','対称複製'],en:['Symmetry','Mirror selection'],fr:['Symétrie','Dupliquer en miroir'],it:['Simmetria','Duplica simmetricamente'],de:['Symmetrie','Auswahl spiegeln'],'es-ES':['Simetría','Duplicar selección en espejo'],'zh-CN':['对称编辑','对称复制所选物品'],'pt-BR':['Simetria','Duplicar seleção em espelho']
} as const;
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
