/** Original terrain and ordinary furniture only. A candidate never authorizes Save writes. */
import {mainlandMapAnchor,mainlandTerrainHits,type MainlandGrid} from './mainland-world-coordinates.ts';
import {terrainWarnings,type TerrainRaster} from './terrain-binding.ts';
import {nativeActionBlocked} from './native-edit-restrictions.ts';
import {CARDINAL_ORIENTATIONS,isCardinal,type Cardinal} from './saved-map-transform.ts';
import type {MainlandSavedObject} from './mainland-saved-objects.ts';
import type {DesignItemGeometry} from './design-layout.ts';
import type {SourceObjectShape} from './source-object-map.ts';
export interface StockDestination{layoutId:string;gridDataPath:string;factor:1|2;sizeX:number;sizeY:number}
export type StockPlan={action:'place';itemId:string;x:number;y:number;orientation:Cardinal}|{action:'duplicate'|'remove';localOrdinal:number;itemId:string;expectedX:number;expectedY:number;x:number|null;y:number|null};
export interface StockCandidate{area:string;x:number;y:number;factor:1|2;shape:SourceObjectShape;plan:StockPlan;destination:StockDestination|null}
export const ordinaryFurniture=(id:number)=>Number.isSafeInteger(id)&&Math.floor(id/100000)===400;
export function stockSourceEligible(p:MainlandSavedObject|null):p is MainlandSavedObject{
 return !!p?.shape&&ordinaryFurniture(Number(p.object.itemId))&&p.object.layer==='furniture'&&!p.object.subgrid&&isCardinal(p.object.orientation)&&!nativeActionBlocked(p.object.editRestrictions,'select')&&!nativeActionBlocked(p.object.editRestrictions,'remove');
}
function witness(g:MainlandGrid):StockDestination{return {layoutId:g.layoutId,gridDataPath:g.gridDataPath,factor:g.factor,sizeX:g.sizeX,sizeY:g.sizeY};}
export function stockPickup(p:MainlandSavedObject|null):StockCandidate|null{
 if(!stockSourceEligible(p)||!p.shape)return null;
 return {area:p.area,x:p.x,y:p.y,factor:p.factor,shape:p.shape,destination:null,plan:{action:'remove',localOrdinal:p.object.localOrdinal,itemId:p.object.itemId,expectedX:p.object.x,expectedY:p.object.y,x:null,y:null}};
}
export function stockPlacement(grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,geometry:ReadonlyMap<number,DesignItemGeometry>,id:number,orientation:Cardinal,wx:number,wy:number,source:MainlandSavedObject|null=null):StockCandidate|null{
 if(!ordinaryFurniture(id)||!isCardinal(orientation)||!Number.isFinite(wx)||!Number.isFinite(wy))return null;
 const hits=mainlandTerrainHits(grids,rasters,wx,wy);if(hits.length!==1)return null;
 const g=hits[0],r=rasters.get(g.key),def=geometry.get(g.factor),shape=def?.shapes[id+':'+CARDINAL_ORIENTATIONS.indexOf(orientation)*4];
 if(!r||!def||def.itemId!==id||def.layer!=='furniture'||nativeActionBlocked(def.editRestrictions,'select')||!shape||!shape.cellCount||shape.cellCount>65536)return null;
 const x=Math.floor((wx-2*g.origin.position[0])*g.factor),y=Math.floor((-wy-2*g.origin.position[2])*g.factor);
 if(x<0||y<0||x+shape.width>g.sizeX*g.factor||y+shape.height>g.sizeY*g.factor||terrainWarnings({raster:r,factor:g.factor,verifiedGridOrdinals:[]},shape,x,y).length)return null;
 let count=0;
 for(const run of shape.runs){
  if(![run.x,run.y,run.width].every(Number.isSafeInteger)||run.x<0||run.y<0||run.width<1||run.x+run.width>shape.width||run.y>=shape.height)return null;
  for(let dx=0;dx<run.width;dx++){
   const q=mainlandMapAnchor(g,x+run.x+dx+.5,y+run.y+.5),owners=mainlandTerrainHits(grids,rasters,q.x,q.y);
   if(owners.length!==1||owners[0].key!==g.key)return null;count++;
  }
 }
 if(count!==shape.cellCount)return null;
 let plan:StockPlan={action:'place',itemId:String(id),x,y,orientation};
 if(source){
  if(!stockSourceEligible(source)||source.object.itemId!==String(id)||source.area!==g.key||source.factor!==g.factor||source.object.orientation!==orientation||nativeActionBlocked(source.object.editRestrictions,'move')||source.object.x===x&&source.object.y===y)return null;
  plan={action:'duplicate',localOrdinal:source.object.localOrdinal,itemId:String(id),expectedX:source.object.x,expectedY:source.object.y,x,y};
 }
 return {area:g.key,...mainlandMapAnchor(g,x,y),factor:g.factor,shape,plan,destination:witness(g)};
}
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
