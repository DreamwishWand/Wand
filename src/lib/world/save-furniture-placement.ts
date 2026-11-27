/** Original terrain and ordinary furniture only. A candidate never authorizes Save writes. */
import {mainlandMapAnchor,mainlandTerrainHits,mainlandFreeHits,sourceWorldScope,bindFloatingIslandGrid,bindMainlandGrid,type MainlandGrid} from './mainland-world-coordinates.ts';
import {terrainWarnings,type TerrainRaster} from './terrain-binding.ts';
import {nativeActionBlocked} from './native-edit-restrictions.ts';
import {isCardinal,isEightWay,worldOrientationCode,type EightWay} from './saved-map-transform.ts';
import type {MainlandSavedObject} from './mainland-saved-objects.ts';
import type {DesignItemGeometry} from './design-layout.ts';
import type {SourceObjectShape} from './source-object-map.ts';
export interface StockDestination{layoutId:string;gridDataPath:string;factor:1|2;sizeX:number;sizeY:number}
export type StockPlan={action:'place';itemId:string;x:number;y:number;orientation:EightWay}|{action:'duplicate'|'remove';localOrdinal:number;itemId:string;expectedX:number;expectedY:number;x:number|null;y:number|null};
export interface StockCandidate{area:string;x:number;y:number;factor:1|2;shape:SourceObjectShape;plan:StockPlan;destination:StockDestination|null}
export const ordinaryFurniture=(id:number)=>Number.isSafeInteger(id)&&Math.floor(id/100000)===400;
export function stockSourceEligible(p:MainlandSavedObject|null,free=false):p is MainlandSavedObject{
 return !!p?.shape&&ordinaryFurniture(Number(p.object.itemId))&&p.object.layer==='furniture'&&!p.object.subgrid&&(isCardinal(p.object.orientation)||free&&p.factor===1&&isEightWay(p.object.orientation))&&(free||!nativeActionBlocked(p.object.editRestrictions,'select')&&!nativeActionBlocked(p.object.editRestrictions,'remove'));
}
export const landscapeId=(id:number)=>Number.isSafeInteger(id)&&Math.floor(id/100000)===402;
export function landscapePlacementEligible(g:DesignItemGeometry,free=false){return landscapeId(g.itemId)&&g.layer==='landscape'&&!g.surfaceCapable&&!g.supportPath&&(free||g.editRestrictions?.remove==='allowedFlag'&&!nativeActionBlocked(g.editRestrictions,'select'));}
export function landscapeSourceEligible(p:MainlandSavedObject|null,free=false):p is MainlandSavedObject{
 return !!p?.shape&&landscapeId(Number(p.object.itemId))&&p.object.layer==='landscape'&&!p.object.subgrid&&isCardinal(p.object.orientation)&&(free||p.object.editRestrictions?.remove==='allowedFlag'&&!nativeActionBlocked(p.object.editRestrictions,'select'));
}
export function playerHouseSourceEligible(p:MainlandSavedObject|null):p is MainlandSavedObject{
 return !!p?.shape&&p.object.nativeType==='Building'&&Math.floor(Number(p.object.itemId)/100000)===205&&!p.object.subgrid&&isCardinal(p.object.orientation);
}
/** Exterior-only, same source world. The Rust writer verifies the native
 * HouseData and matching existing interior before generating a copy. */
export function playerHouseDuplicate(grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,p:MainlandSavedObject|null,wx:number,wy:number):StockCandidate|null{
 if(!playerHouseSourceEligible(p)||!p.shape)return null;
 const hits=mainlandFreeHits(grids,rasters,wx,wy);
 const from=grids.find(g=>g.key===p.area);
 if(!from||!bindMainlandGrid(from)||hits.length!==1||sourceWorldScope(hits[0])!==sourceWorldScope(from)||hits[0].factor!==p.factor||!bindMainlandGrid(hits[0]))return null;
 const g=hits[0],x=Math.floor((wx-2*g.origin.position[0])*g.factor),y=Math.floor((-wy-2*g.origin.position[2])*g.factor);
 if(x<0||y<0||x>=g.sizeX*g.factor||y>=g.sizeY*g.factor)return null;
 return {area:g.key,...mainlandMapAnchor(g,x,y),factor:g.factor,shape:p.shape,destination:witness(g),plan:{action:'duplicate',localOrdinal:p.object.localOrdinal,itemId:p.object.itemId,expectedX:p.object.x,expectedY:p.object.y,x,y}};
}
export function playerHousePickup(p:MainlandSavedObject|null,objects:readonly MainlandSavedObject[]):StockCandidate|null{
 if(!playerHouseSourceEligible(p)||!p.shape||!objects.some(o=>o.object.localOrdinal!==p.object.localOrdinal&&o.object.itemId===p.object.itemId&&playerHouseSourceEligible(o)))return null;
 return {area:p.area,x:p.x,y:p.y,factor:p.factor,shape:p.shape,destination:null,plan:{action:'remove',localOrdinal:p.object.localOrdinal,itemId:p.object.itemId,expectedX:p.object.x,expectedY:p.object.y,x:null,y:null}};
}
function witness(g:MainlandGrid):StockDestination{return {layoutId:g.layoutId,gridDataPath:g.gridDataPath,factor:g.factor,sizeX:g.sizeX,sizeY:g.sizeY};}
export function stockPickup(p:MainlandSavedObject|null,free=false):StockCandidate|null{
 if(!p||!p.shape||!stockSourceEligible(p,free)&&!landscapeSourceEligible(p,free))return null;
 return {area:p.area,x:p.x,y:p.y,factor:p.factor,shape:p.shape,destination:null,plan:{action:'remove',localOrdinal:p.object.localOrdinal,itemId:p.object.itemId,expectedX:p.object.x,expectedY:p.object.y,x:null,y:null}};
}
export function stockPlacement(grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,geometry:ReadonlyMap<number,DesignItemGeometry>,id:number,orientation:EightWay,wx:number,wy:number,source:MainlandSavedObject|null=null,free=false):StockCandidate|null{
 const landscape=landscapeId(id);if(landscape?(!!source&&(!landscapeSourceEligible(source,free)||!free&&source.object.editRestrictions?.move!=='allowedFlag')):!ordinaryFurniture(id))return null;
 if(!isEightWay(orientation)||!isCardinal(orientation)&&(!free||landscape)||!Number.isFinite(wx)||!Number.isFinite(wy))return null;
 const hits=(free?mainlandFreeHits:mainlandTerrainHits)(grids,rasters,wx,wy);if(hits.length!==1)return null;
 const g=hits[0],r=rasters.get(g.key),def=geometry.get(g.factor),shape=def?.shapes[id+':'+worldOrientationCode(orientation)];
 if(!isCardinal(orientation)&&(g.factor!==1||!bindMainlandGrid(g)||def?.surfaceCapable||def?.supportPath))return null;
 if(!r||!def||def.itemId!==id||def.layer!==(landscape?'landscape':'furniture')||!free&&nativeActionBlocked(def.editRestrictions,'select')||!shape||!shape.cellCount||shape.cellCount>65536)return null;
 if(landscape){if(!landscapePlacementEligible(def,free)||!bindMainlandGrid(g)&&!bindFloatingIslandGrid(g))return null;if(source){const from=grids.find(q=>q.key===source.area);if(!from||g.factor!==from.factor||sourceWorldScope(g)!==sourceWorldScope(from)||!bindMainlandGrid(g)||g.key!==from.key&&!free&&source.object.editRestrictions?.switchGrid!=='allowedFlag')return null;}}
 const x=Math.floor((wx-2*g.origin.position[0])*g.factor),y=Math.floor((-wy-2*g.origin.position[2])*g.factor);
 if(x<0||y<0||x>=g.sizeX*g.factor||y>=g.sizeY*g.factor||!free&&(x+shape.width>g.sizeX*g.factor||y+shape.height>g.sizeY*g.factor||terrainWarnings({raster:r,factor:g.factor,verifiedGridOrdinals:[]},shape,x,y).length))return null;
 let count=0;
 for(const run of shape.runs){
  if(![run.x,run.y,run.width].every(Number.isSafeInteger)||run.x<0||run.y<0||run.width<1||run.x+run.width>shape.width||run.y>=shape.height)return null;
  for(let dx=0;dx<run.width;dx++){
   const q=mainlandMapAnchor(g,x+run.x+dx+.5,y+run.y+.5),owners=mainlandTerrainHits(grids,rasters,q.x,q.y);
   if(!free&&(owners.length!==1||owners[0].key!==g.key))return null;count++;
  }
 }
 if(count!==shape.cellCount)return null;
 let plan:StockPlan={action:'place',itemId:String(id),x,y,orientation};
 if(source){
  if(!(landscape?landscapeSourceEligible(source,free):stockSourceEligible(source,free))||source.object.itemId!==String(id)||source.object.orientation!==orientation||!free&&nativeActionBlocked(source.object.editRestrictions,'move')||(!free&&source.area===g.key&&source.object.x===x&&source.object.y===y))return null;
  plan={action:'duplicate',localOrdinal:source.object.localOrdinal,itemId:String(id),expectedX:source.object.x,expectedY:source.object.y,x,y};
 }
 return {area:g.key,...mainlandMapAnchor(g,x,y),factor:g.factor,shape,plan,destination:witness(g)};
}
/** Geometric intersection only, not a game collision or support verdict.
 * Compare exact occupied runs on a shared half-cell lattice, including
 * hidden/locked objects. Roads are context, not furniture blockers. */
export function stockFootprintFeedback(candidate:StockCandidate,objects:readonly MainlandSavedObject[],omitted=0):{overlaps:number;unknown:boolean}{
 if(candidate.plan.action==='remove')return {overlaps:0,unknown:false};
 const rows=new Map<number,{left:number;right:number}[]>();
 const step=2/candidate.factor,ox=candidate.x*2,oy=-candidate.y*2;
 if(!Number.isSafeInteger(ox)||!Number.isSafeInteger(oy))return {overlaps:0,unknown:true};
 for(const r of candidate.shape.runs)for(let dy=0;dy<step;dy++){
  const y=oy+r.y*step+dy,list=rows.get(y)??[];
  list.push({left:ox+r.x*step,right:ox+(r.x+r.width)*step});rows.set(y,list);
 }
 let overlaps=0,unknown=omitted>0;
 for(const p of objects){
  if(p.object.layer==='ground')continue;
  if(!p.shape){unknown=true;continue;}
  const s=2/p.factor,x=p.x*2,y=-p.y*2;
  if(!Number.isSafeInteger(x)||!Number.isSafeInteger(y)){unknown=true;continue;}
  if(x>=ox+candidate.shape.width*step||x+p.shape.width*s<=ox||y>=oy+candidate.shape.height*step||y+p.shape.height*s<=oy)continue;
  let hit=false;
  outer:for(const r of p.shape.runs)for(let dy=0;dy<s;dy++){
   const list=rows.get(y+r.y*s+dy);if(!list)continue;
   const left=x+r.x*s,right=left+r.width*s;
   if(list.some(q=>left<q.right&&right>q.left)){hit=true;break outer;}
  }
  if(hit)overlaps++;
 }
 return {overlaps,unknown};
}
export const stockFootprintWords={
 ja:['占有マスが重なる物','配置情報が未確認の物があります。','占有マスの重なりなし','ゲーム内の衝突・上下関係は未判定'],
 en:['Objects with overlapping cells','Some placement information is unknown.','No footprint overlap','Game collision and support not verified'],
 fr:['Objets aux cases superposées','Certaines positions sont inconnues.','Aucun chevauchement','Collision et support non vérifiés'],
 it:['Oggetti con celle sovrapposte','Alcune posizioni sono sconosciute.','Nessuna sovrapposizione','Collisioni e supporto non verificati'],
 de:['Objekte mit überlappenden Zellen','Einige Platzierungen sind unbekannt.','Keine überlappenden Zellen','Kollision und Auflage ungeprüft'],
 'es-ES':['Objetos con celdas superpuestas','Algunas posiciones son desconocidas.','Sin celdas superpuestas','Colisión y soporte sin verificar'],
 'zh-CN':['占用格重叠的物品','部分放置信息未知。','占用格无重叠','游戏碰撞及支撑关系未验证'],
 'pt-BR':['Objetos com células sobrepostas','Algumas posições são desconhecidas.','Sem sobreposição de células','Colisão e suporte não verificados']
} as const;

export const stockToolWords={
 ja:['家具パレット','家具を検索','在庫','配置を検証','複製を検証','回収を検証','配置先を選択','取消','閉じる','検証中…','検証成功。セーブには反映されません。','在庫または構造を確認できません。','先に配置変更を出力するか取り消してください。','対象家具なし','左回転','右回転'],
 en:['Furniture palette','Find furniture','Stock','Validate placement','Validate duplicate','Validate pickup','Choose a destination','Cancel','Close','Checking…','Validated. Save unchanged.','Stock or structure could not be verified.','Export or undo staged transforms first.','No eligible furniture','Rotate left','Rotate right'],
 fr:['Palette de meubles','Rechercher','Stock','Vérifier le placement','Vérifier la copie','Vérifier le retrait','Choisir la destination','Annuler','Fermer','Vérification…','Validé. Sauvegarde inchangée.','Stock ou structure non vérifiés.','Exporter ou annuler les déplacements.','Aucun meuble compatible','Rotation gauche','Rotation droite'],
 it:['Tavolozza mobili','Cerca mobili','Scorte','Verifica posizionamento','Verifica duplicazione','Verifica ritiro','Scegli destinazione','Annulla','Chiudi','Verifica…','Validato. Salvataggio invariato.','Scorte o struttura non verificate.','Esporta o annulla gli spostamenti.','Nessun mobile compatibile','Ruota a sinistra','Ruota a destra'],
 de:['Möbelpalette','Möbel suchen','Bestand','Platzierung prüfen','Duplikat prüfen','Aufnahme prüfen','Ziel wählen','Abbrechen','Schließen','Prüfung…','Geprüft. Spielstand unverändert.','Bestand oder Struktur ungeprüft.','Verschiebungen exportieren oder rückgängig machen.','Keine geeigneten Möbel','Links drehen','Rechts drehen'],
 'es-ES':['Paleta de muebles','Buscar muebles','Inventario','Verificar colocación','Verificar copia','Verificar recogida','Elegir destino','Cancelar','Cerrar','Verificando…','Validado. Partida sin cambios.','Inventario o estructura no verificados.','Exporta o deshaz los movimientos.','Sin muebles compatibles','Girar izquierda','Girar derecha'],
 'zh-CN':['家具面板','搜索家具','库存','验证放置','验证复制','验证收回','选择目标位置','取消','关闭','正在验证…','验证成功。存档未更改。','无法确认库存或结构。','请先导出或撤销移动。','无适用家具','向左旋转','向右旋转'],
 'pt-BR':['Paleta de móveis','Buscar móveis','Estoque','Validar posição','Validar cópia','Validar recolhimento','Escolher destino','Cancelar','Fechar','Verificando…','Validado. Save inalterado.','Estoque ou estrutura não verificados.','Exporte ou desfaça os movimentos.','Nenhum móvel compatível','Girar esquerda','Girar direita']
} as const;
