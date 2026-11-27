import {CARDINAL_ORIENTATIONS,worldOrientationCode,type Cardinal,type EightWay} from './saved-map-transform.ts';
import {WORLD_BATCH_LIMIT} from './saved-map-batch.ts';
import type {DesignClipItem} from './design-layout.ts';
import type {MainlandSavedObject} from './mainland-saved-objects.ts';
import {mainlandTerrainHits,type MainlandGrid} from './mainland-world-coordinates.ts';
import type {TerrainRaster} from './terrain-binding.ts';
import {nativeActionBlocked} from './native-edit-restrictions.ts';
import {writable} from 'svelte/store';
import {reflectedDesignItem} from './design-symmetry.ts';
import type {SourceObjectShape} from './source-object-map.ts';
import {cutEligible,captureFurnitureGroup,groupAbsoluteCandidate,type GroupGeometry,type GroupPasteCandidate,type WorldGroupPose,type WorldSymmetryAxis} from './group-placement.ts';
export {captureFurnitureGroup,groupAbsoluteCandidate,groupPasteCandidate,groupStockAvailable,groupSceneOrigin,rotateFurnitureGroup} from './group-placement.ts';
export type {GroupGeometry,GroupPasteCandidate,GroupPasteRow,WorldGroupPose,WorldSymmetryAxis} from './group-placement.ts';
/** Half-cell coordinates and canonical item IDs only. No native Save IDs,
 * bytes, state, or system clipboard. Remains in this tab across world views. */
export const worldFurnitureClipboard=writable<readonly DesignClipItem[]>([]);
export const ROOM_CUT_LIMIT=32;
export type RoomCutSource={roomOrdinal:number;index:number};
type CutPose={itemId:string;expectedX:number;expectedY:number;expectedOrientation:EightWay;area:string;supportFactor?:1|2};
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
 if(cut.rows.some(r=>r.supportFactor)&&cut.scope!==scope){
  const outdoor=['Village04','VillageExpansion01','VillageExpansion02','VillageExpansion03','VillageExpansion04','VillageWinnieDLC'];
  if(!outdoor.includes(cut.scope)||!outdoor.includes(scope))return false;
 }
 if(cut.scope===scope)return cutWitnessMatches(cut.rows,objects);
 return cut.rows.every(r=>!objects.some(p=>p.object.localOrdinal===r.localOrdinal));
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
 return candidate.ghosts.map((p,i)=>({itemId:Number(candidate.rows[i].itemId),x:p.x,y:p.y,orientation:(worldOrientationCode(candidate.rows[i].orientation)??-4)/4}));
}
export function groupCutPlan(cut:readonly CutWitness[],candidate:GroupPasteCandidate){
 if(cut.length!==candidate.rows.length||cut.some(r=>!CARDINAL_ORIENTATIONS.some(o=>o===r.expectedOrientation))||candidate.rows.some(r=>!CARDINAL_ORIENTATIONS.some(o=>o===r.orientation)))return null;
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
