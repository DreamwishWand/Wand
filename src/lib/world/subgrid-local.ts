import {mainlandMapAnchor,mainlandTerrainHits,mainlandFreeHits,type MainlandGrid} from './mainland-world-coordinates.ts';
import type {MainlandSavedObject} from './mainland-saved-objects.ts';
import {terrainWarnings,type TerrainRaster} from './terrain-binding.ts';
import type {SourceObjectShape} from './source-object-map.ts';
import {CARDINAL_ORIENTATIONS,EIGHT_WAY_ORIENTATIONS,isCardinal,isEightWay,worldOrientationCode} from './saved-map-transform.ts';
import {nativeActionBlocked} from './native-edit-restrictions.ts';
import {stockFootprintFeedback} from './save-furniture-placement.ts';
export interface SupportTree{factor:1|2;objects:SupportObject[];sourcePath:string|null}
export interface SupportObject{itemId:number;x:number;y:number;orientation:string;child:SupportTree|null}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function parseSupportTree(value:unknown):SupportTree{
 if(!record(value)||value.contract!=='wand.world.subgrid-local@1'||value.worldTransformVerified!==false)throw Error('subgrid receipt');
 let count=0;
 function visit(v:unknown,depth:number):SupportTree{
  if(depth>8||!record(v)||!(v.factor===1||v.factor===2)||!Array.isArray(v.objects)||v.objects.length>512)throw Error('subgrid tree');
  const objects=v.objects.map((row:unknown)=>{
   if(++count>512||!record(row)||typeof row.itemId!=='number'||!Number.isSafeInteger(row.itemId)||row.itemId<1||row.itemId>0xffffffff||typeof row.x!=='number'||typeof row.y!=='number'||!Number.isInteger(row.x)||!Number.isInteger(row.y)||row.x< -2147483648||row.x>2147483647||row.y< -2147483648||row.y>2147483647||typeof row.orientation!=='string'||! /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(row.orientation))throw Error('subgrid object');
   return {itemId:row.itemId,x:row.x,y:row.y,orientation:row.orientation,child:row.child===null?null:visit(row.child,depth+1)};
  });const sourcePath=typeof v.sourcePath==='string'&&/^GridData\/Furniture\/[A-Za-z0-9_./ -]+\.json$/.test(v.sourcePath)&&!v.sourcePath.includes('..')&&v.sourcePath.length<=512?v.sourcePath:null;return {factor:v.factor,objects,sourcePath};
 }
 return visit(value.tree,0);
}
/** Session-only witnesses are separate from portable SupportTree data. */
export function parseSupportRecoveryOrdinals(value:unknown,tree:SupportTree):ReadonlyMap<string,number>{
 const out=new Map<string,number>(),seen=new Set<number>();
 if(!record(value)||value.recoveryOrdinals===undefined)return out;
 if(!Array.isArray(value.recoveryOrdinals)||value.recoveryOrdinals.length>512)throw Error('support recovery receipt');
 for(const r of value.recoveryOrdinals){
  if(!record(r)||Object.keys(r).length!==2||!Array.isArray(r.path)||r.path.length<1||r.path.length>9||!r.path.every(i=>typeof i==='number'&&Number.isSafeInteger(i)&&i>=0&&i<512)||typeof r.ordinal!=='number'||!Number.isSafeInteger(r.ordinal)||r.ordinal<1||r.ordinal>20000||seen.has(r.ordinal))throw Error('support recovery witness');
  let t:SupportTree|null=tree,o:SupportObject|undefined;
  for(const i of r.path){o=t?.objects[i];if(!o)throw Error('support recovery path');t=o.child;}
  const key=r.path.join('.');
  if(!o||o.child||!isEightWay(o.orientation)||out.has(key))throw Error('support recovery leaf');
  seen.add(r.ordinal);out.set(key,r.ordinal);
 }
 return out;
}
export function supportFieldRecoveryRows(tree:SupportTree|null,path:readonly number[],indices:readonly number[],ordinals:ReadonlyMap<string,number>){
 if(!tree||!indices.length||new Set(indices).size!==indices.length)return null;
 const rows=[];
 for(const i of indices){
  const o=tree.objects[i],ordinal=ordinals.get([...path,i].join('.'));
  if(!o||o.child||!ordinal||!isEightWay(o.orientation))return null;
  rows.push({localOrdinal:ordinal,itemId:String(o.itemId),expectedX:o.x,expectedY:o.y,expectedOrientation:o.orientation});
 }
 return new Set(rows.map(r=>r.localOrdinal)).size===rows.length?rows:null;
}
export function supportShapeKey(o:SupportObject){const code=worldOrientationCode(o.orientation);return code===null?null:o.itemId+':'+code;}
export function supportOrientationAllowed(factor:1|2,v:unknown,free=false):v is typeof EIGHT_WAY_ORIENTATIONS[number]{return isCardinal(v)||free&&factor===1&&isEightWay(v);}
export function supportTurnOrientation(factor:1|2,v:unknown,turn:-1|0|1,free=false,group=false){
 if(!supportOrientationAllowed(factor,v,free))return null;
 const step=free&&factor===1&&!group?1:2;
 return EIGHT_WAY_ORIENTATIONS[(EIGHT_WAY_ORIENTATIONS.indexOf(v)+turn*step+8)%8];
}
export function supportItems(tree:SupportTree){
 return tree.objects.flatMap(o=>{return isEightWay(o.orientation)?(tree.factor===1?[0,2,4,6,8,10,12,14]:[0,4,8,12]).map(orientationCode=>({itemId:o.itemId,orientationCode})):[]});
}
export function supportExtent(tree:SupportTree,shapes:Readonly<Record<string,SourceObjectShape>>){
 let left=0,top=0,right=1,bottom=1;
 for(const o of tree.objects){const key=supportShapeKey(o),s=key?shapes[key]:null;left=Math.min(left,o.x);top=Math.min(top,o.y);right=Math.max(right,o.x+(s?.width??1));bottom=Math.max(bottom,o.y+(s?.height??1));}
 return {x:left-.5,y:top-.5,w:right-left+1,h:bottom-top+1};
}
/** Source-backed ordinary leaf furniture, including surface-only decor.
 * A support, container, keyhole or other known interaction is not a
 * plain-stock template. Game placement flags are not structural evidence. */
export function supportLeafFreeEligible(itemId:number,source:{layer:string;shapeKey:string|null},special:ReadonlySet<number>){
 return Math.floor(itemId/100000)===400&&(source.layer==='furniture'||source.layer==='surface')&&!!source.shapeKey&&!special.has(itemId);
}
export function supportParentEligible(p:MainlandSavedObject|null,nonstandard=false):p is MainlandSavedObject{
 return !!p?.shape&&p.object.subgrid?.status==='resolved_full'&&Number(p.object.itemId)/100000>=400&&Math.floor(Number(p.object.itemId)/100000)===400&&(p.object.layer==='furniture'||nonstandard&&p.object.layer==='surface')&&isCardinal(p.object.orientation)&&(nonstandard||!nativeActionBlocked(p.object.editRestrictions,'select')&&!nativeActionBlocked(p.object.editRestrictions,'move'));
}
export function supportParentCandidate(p:MainlandSavedObject,grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,worldX:number,worldY:number,orientation:string|null=p.object.orientation,shapes:Readonly<Record<string,SourceObjectShape>>={},objects:readonly MainlandSavedObject[]=[],duplicate=false,nonstandard=false){
 if(!supportParentEligible(p,nonstandard)||!p.shape||!isCardinal(orientation)||!Number.isFinite(worldX)||!Number.isFinite(worldY))return null;
 const original=grids.find(g=>g.key===p.area),hits=(nonstandard?mainlandFreeHits:mainlandTerrainHits)(grids,rasters,worldX,worldY),g=hits.length===1?hits[0]:null,r=g&&rasters.get(g.key);
 if(!original||!g||!r||g.factor!==p.factor||original.factor!==p.factor)return null;
 const cross=original.key!==g.key,turned=orientation!==p.object.orientation;
 if(!nonstandard&&(cross&&nativeActionBlocked(p.object.editRestrictions,'switchGrid')||turned&&nativeActionBlocked(p.object.editRestrictions,'rotate')))return null;
 const x=Math.floor((worldX-2*g.origin.position[0])*g.factor),y=Math.floor((-worldY-2*g.origin.position[2])*g.factor);
 const shape=turned?shapes[p.object.itemId+':'+CARDINAL_ORIENTATIONS.indexOf(orientation)*4]:p.shape;
 if(!shape||!shape.cellCount||shape.cellCount>65536||x<0||y<0||x>=g.sizeX*g.factor||y>=g.sizeY*g.factor||!cross&&!turned&&x===p.object.x&&y===p.object.y&&!(duplicate&&nonstandard))return null;
 if(!nonstandard&&(x+shape.width>g.sizeX*g.factor||y+shape.height>g.sizeY*g.factor||shape.acceptedFloorTypesFlag===undefined||terrainWarnings({raster:r,factor:g.factor,verifiedGridOrdinals:[p.object.localGridOrdinal]},shape,x,y).length))return null;
 if(!nonstandard)for(const run of shape.runs)for(let dx=0;dx<run.width;dx++){
  const a=mainlandMapAnchor(g,x+run.x+dx+.5,y+run.y+.5),hits=mainlandTerrainHits(grids,rasters,a.x,a.y);if(hits.length!==1||hits[0].key!==g.key)return null;
 }
 const witness=(g:MainlandGrid)=>({layoutId:g.layoutId,gridDataPath:g.gridDataPath,factor:g.factor,sizeX:g.sizeX,sizeY:g.sizeY});
 const occupied=duplicate?objects:objects.filter(o=>o.object.localOrdinal!==p.object.localOrdinal||o.area!==p.area);
 const at=mainlandMapAnchor(g,x,y);
 if(!nonstandard&&stockFootprintFeedback({area:g.key,...at,factor:g.factor,shape,plan:{action:'place',itemId:p.object.itemId,x,y,orientation},destination:witness(g)},occupied).overlaps>0)return null;
 return {...at,factor:g.factor,shape,plan:{localOrdinal:p.object.localOrdinal,itemId:Number(p.object.itemId),expectedX:p.object.x,expectedY:p.object.y,x,y,destination:witness(g),...(turned?{expectedOrientation:p.object.orientation,orientation}:{}),...(cross?{source:witness(original)}:{}),...(nonstandard?{freePlacement:true as const}:{})}};
}
export type SupportParentCandidate=NonNullable<ReturnType<typeof supportParentCandidate>>;
export const supportWords={
 ja:['載っている小物','小物の配置（支持面内）','支持家具ごと移動','移動先をクリック','親子関係を維持したテストコピーを作成','作業セーブに適用','コピーを保存','閉じる','子Gridを確認できません。','小物なし','支持面の位置関係は表示上のローカル座標です。','戻る','読み込み中'],
 en:['Objects on furniture','Objects on support (local layout)','Move support with contents','Click destination','Create test copy preserving hierarchy','Apply to working Save','Download copy','Close','Child grid unavailable.','Empty','Local layout, not world-space transform.','Back','Loading'],
 fr:['Objets sur le meuble','Disposition locale','Déplacer le meuble et son contenu','Cliquez la destination','Créer une copie de test','Appliquer à la sauvegarde','Télécharger','Fermer','Grille enfant indisponible.','Vide','Coordonnées locales.','Retour','Chargement'],
 it:['Oggetti sul mobile','Disposizione locale','Sposta mobile e contenuto','Seleziona destinazione','Crea copia di prova','Applica al salvataggio','Scarica copia','Chiudi','Griglia figlia non disponibile.','Vuoto','Coordinate locali.','Indietro','Caricamento'],
 de:['Objekte auf Möbeln','Lokale Anordnung','Möbel mit Inhalt verschieben','Ziel anklicken','Testkopie erstellen','Auf Arbeitsspielstand anwenden','Kopie speichern','Schließen','Untergitter nicht verfügbar.','Leer','Lokale Koordinaten.','Zurück','Laden'],
 'es-ES':['Objetos sobre muebles','Disposición local','Mover mueble con contenido','Pulsa destino','Crear copia de prueba','Aplicar a partida de trabajo','Descargar copia','Cerrar','Cuadrícula hija no disponible.','Vacío','Coordenadas locales.','Atrás','Cargando'],
 'zh-CN':['家具上的物品','支撑面内布局','移动家具及其物品','点击目的地','创建保留层级的测试副本','应用到工作存档','下载副本','关闭','子网格不可用。','无物品','本地坐标布局。','返回','加载中'],
 'pt-BR':['Objetos sobre móveis','Layout local','Mover móvel com conteúdo','Clique no destino','Criar cópia de teste','Aplicar ao save de trabalho','Baixar cópia','Fechar','Grade filha indisponível.','Vazio','Coordenadas locais.','Voltar','Carregando']
} as const;

export interface SupportChildEdit{index:number;itemId:number;expectedX:number;expectedY:number;expectedOrientation:string;x:number;y:number;orientation:string}
function sameFootprint(a:SourceObjectShape|undefined,b:SourceObjectShape|undefined){
 return !!a&&!!b&&a.width===b.width&&a.height===b.height&&a.acceptedFloorTypesFlag!==undefined&&a.acceptedFloorTypesFlag===b.acceptedFloorTypesFlag&&a.cellCount===b.cellCount&&a.runs.length===b.runs.length&&a.runs.every((r,i)=>r.x===b.runs[i].x&&r.y===b.runs[i].y&&r.width===b.runs[i].width);
}
export function supportChildEdits(tree:SupportTree,shapes:Readonly<Record<string,SourceObjectShape>>,editable:ReadonlySet<number>,first:number,second:number|null,turn:-1|1):SupportChildEdit[]|null{
 const a=tree.objects[first],b=second===null?null:tree.objects[second];
 const eligible=(o:SupportObject|undefined)=>!!o&&!o.child&&Math.floor(o.itemId/100000)===400&&editable.has(o.itemId)&&isCardinal(o.orientation);
 if(!eligible(a))return null;
 const shape=(o:SupportObject)=>shapes[supportShapeKey(o)??''];
 const edit=(o:SupportObject,index:number,x:number,y:number,orientation:string):SupportChildEdit=>({index,itemId:o.itemId,expectedX:o.x,expectedY:o.y,expectedOrientation:o.orientation,x,y,orientation});
 if(second!==null){
  if(!b||!eligible(b)||second===first||a.x===b.x&&a.y===b.y||!sameFootprint(shape(a),shape(b)))return null;
  return [edit(a,first,b.x,b.y,a.orientation),edit(b,second,a.x,a.y,b.orientation)];
 }
 const orientation=CARDINAL_ORIENTATIONS[(CARDINAL_ORIENTATIONS.indexOf(a.orientation as typeof CARDINAL_ORIENTATIONS[number])+turn+4)%4];
 if(!sameFootprint(shape(a),shapes[a.itemId+':'+CARDINAL_ORIENTATIONS.indexOf(orientation)*4]))return null;
 return [edit(a,first,a.x,a.y,orientation)];
}
export const childEditWords={
 ja:['左回転','右回転','位置を交換','交換相手を選択','占有セルが変わらない操作のみ','編集を確認','小物を選択'],
 en:['Rotate left','Rotate right','Swap positions','Select swap partner','Only unchanged occupied cells','Review edit','Select object'],
 fr:['Tourner à gauche','Tourner à droite','Échanger les positions','Choisir un objet','Cellules occupées inchangées','Vérifier','Choisir un objet'],
 it:['Ruota a sinistra','Ruota a destra','Scambia posizioni','Scegli oggetto','Celle occupate invariate','Verifica','Seleziona oggetto'],
 de:['Links drehen','Rechts drehen','Positionen tauschen','Tauschobjekt wählen','Unveränderte belegte Zellen','Prüfen','Objekt wählen'],
 'es-ES':['Girar a la izquierda','Girar a la derecha','Intercambiar posiciones','Elegir objeto','Celdas ocupadas sin cambios','Revisar','Seleccionar objeto'],
 'zh-CN':['向左旋转','向右旋转','交换位置','选择交换对象','仅限占用格不变的操作','确认编辑','选择物品'],
 'pt-BR':['Girar à esquerda','Girar à direita','Trocar posições','Escolher objeto','Células ocupadas inalteradas','Revisar','Selecionar objeto']
} as const;

export function supportTerrainRow(value:unknown,path:string):TerrainRaster|null{
 if(!record(value)||value.contract!=='wand.world.support-terrain@1'||value.gameVersion!=='1.26.2'||value.platform!=='Steam'||!Array.isArray(value.grids))return null;
 const rows=value.grids.filter(r=>Array.isArray(r)&&r[0]===path);if(rows.length!==1)return null;
 const r=rows[0];if(r.length!==5||!Number.isSafeInteger(r[1])||!Number.isSafeInteger(r[2])||r[1]<1||r[2]<1||r[1]>256||r[2]>256||typeof r[3]!=='string'||!/^[a-f0-9]{64}$/.test(r[3])||!Array.isArray(r[4])||r[4].length!==r[1]*r[2]||!r[4].every((v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=0xffffffff))return null;
 return {sizeX:r[1],sizeY:r[2],nativeFloorValues:Uint32Array.from(r[4])};
}
// Nonstandard placement changes the game placement rules, not native ownership.
function supportAnchorFits(tree:SupportTree,raster:TerrainRaster,x:number,y:number){
 return Number.isSafeInteger(x)&&Number.isSafeInteger(y)&&x>=0&&y>=0&&x<raster.sizeX*tree.factor&&y<raster.sizeY*tree.factor&&raster.nativeFloorValues.length===raster.sizeX*raster.sizeY;
}
export function supportFreeEdit(tree:SupportTree,shapes:Readonly<Record<string,SourceObjectShape>>,editable:ReadonlySet<number>,raster:TerrainRaster,index:number,x:number,y:number,orientation:string,nonstandard=false):SupportChildEdit[]|null{
 const a=tree.objects[index];if(!a||a.child||Math.floor(a.itemId/100000)!==400||!editable.has(a.itemId)||!supportOrientationAllowed(tree.factor,a.orientation,nonstandard)||!supportOrientationAllowed(tree.factor,orientation,nonstandard)||!Number.isSafeInteger(x)||!Number.isSafeInteger(y)||x===a.x&&y===a.y&&orientation===a.orientation)return null;
 const oldKey=supportShapeKey(a),before=oldKey?shapes[oldKey]:null,shape=shapes[a.itemId+':'+worldOrientationCode(orientation)];
 if(!shape||!before||!shape.cellCount||!before.cellCount||shape.cellCount>65536||before.cellCount>65536)return null;
 if(nonstandard){
  if(!supportAnchorFits(tree,raster,a.x,a.y)||!supportAnchorFits(tree,raster,x,y))return null;
  return [{index,itemId:a.itemId,expectedX:a.x,expectedY:a.y,expectedOrientation:a.orientation,x,y,orientation}];
 }
 if(shape.acceptedFloorTypesFlag===undefined||before.acceptedFloorTypesFlag===undefined||terrainWarnings({raster,factor:tree.factor,verifiedGridOrdinals:[]},before,a.x,a.y).length||terrainWarnings({raster,factor:tree.factor,verifiedGridOrdinals:[]},shape,x,y).length)return null;
 for(let i=0;i<tree.objects.length;i++){if(i===index)continue;const o=tree.objects[i],k=supportShapeKey(o),other=k?shapes[k]:null;if(!other)return null;
  if(x>=o.x+other.width||o.x>=x+shape.width||y>=o.y+other.height||o.y>=y+shape.height)continue;
  if(shape.runs.some(a=>other.runs.some(b=>y+a.y===o.y+b.y&&x+a.x<o.x+b.x+b.width&&o.x+b.x<x+a.x+a.width)))return null;
 }
 return [{index,itemId:a.itemId,expectedX:a.x,expectedY:a.y,expectedOrientation:a.orientation,x,y,orientation}];
}
/** Rigid group translation or quarter-turn around the selected anchor.
 * Free mode retains native bounds, source shape and ordinary leaf checks.
 * Unchanged rows are omitted; no partial group operation is returned. */
export function supportFreeGroupTransform(tree:SupportTree,shapes:Readonly<Record<string,SourceObjectShape>>,eligible:ReadonlySet<number>,raster:TerrainRaster,indices:readonly number[],anchor:number,x:number,y:number,turn:0|-1|1):SupportChildEdit[]|null{
 const a=tree.objects[anchor];if(!a||!indices.includes(anchor)||indices.length<2||indices.length>32||new Set(indices).size!==indices.length||![x,y].every(Number.isSafeInteger))return null;
 const out:SupportChildEdit[]=[];
 for(const index of indices){
  const o=tree.objects[index];if(!o||o.child||!eligible.has(o.itemId)||!supportOrientationAllowed(tree.factor,o.orientation,true))return null;
  const dx=o.x-a.x,dy=o.y-a.y,px=x+(turn===1?-dy:turn===-1?dy:dx),py=y+(turn===1?dx:turn===-1?-dx:dy),orientation=supportTurnOrientation(tree.factor,o.orientation,turn,true,true);if(!orientation)return null;
  if(px===o.x&&py===o.y&&orientation===o.orientation){const key=supportShapeKey(o),s=key?shapes[key]:null;if(!s?.cellCount||s.cellCount>65536||!supportAnchorFits(tree,raster,o.x,o.y))return null;continue;}
  const edit=supportFreeEdit(tree,shapes,eligible,raster,index,px,py,orientation,true);if(!edit)return null;out.push(...edit);
 }
 return out.length?out:null;
}
export const supportGroupWords={
 ja:['複数選択','まとめて移動','選択解除'],en:['Select multiple','Move group','Clear selection'],fr:['Sélection multiple','Déplacer le groupe','Effacer la sélection'],it:['Selezione multipla','Sposta gruppo','Deseleziona'],de:['Mehrfachauswahl','Gruppe verschieben','Auswahl aufheben'],'es-ES':['Selección múltiple','Mover grupo','Borrar selección'],'zh-CN':['多选','移动组合','清除选择'],'pt-BR':['Seleção múltipla','Mover grupo','Limpar seleção']
} as const;
/** Exchange two existing ordinary leaves in one transaction. In free mode
 * their footprints may differ and occupied anchors may overlap other leaves. */
export function supportFreeSwap(tree:SupportTree,shapes:Readonly<Record<string,SourceObjectShape>>,eligible:ReadonlySet<number>,raster:TerrainRaster,first:number,second:number):SupportChildEdit[]|null{
 const a=tree.objects[first],b=tree.objects[second];
 if(!a||!b||first===second)return null;
 const left=supportFreeEdit(tree,shapes,eligible,raster,first,b.x,b.y,a.orientation,true);
 const right=supportFreeEdit(tree,shapes,eligible,raster,second,a.x,a.y,b.orientation,true);
 return left&&right?[...left,...right]:null;
}
/** Plan stock changes sequentially per Item ID, but apply as one native transaction. */
export function supportGroupStockPlan(tree:SupportTree,shapes:Readonly<Record<string,SourceObjectShape>>,eligible:ReadonlySet<number>,raster:TerrainRaster,indices:readonly number[],counts:ReadonlyMap<number,number>,destination:{anchor:number;x:number;y:number}|null):SupportStockPlan[]|null{
 if(indices.length<2||indices.length>32||new Set(indices).size!==indices.length||destination&&(!indices.includes(destination.anchor)||tree.objects.length+indices.length>512))return null;
 const anchor=destination?tree.objects[destination.anchor]:null;
 if(destination&&!anchor)return null;
 const stock=new Map(counts),out:SupportStockPlan[]=[];
 for(const index of indices){
  const o=tree.objects[index],key=o?supportShapeKey(o):null;
  if(!o||o.child||!eligible.has(o.itemId)||Math.floor(o.itemId/100000)!==400||!key||!shapes[key]?.cellCount||!supportAnchorFits(tree,raster,o.x,o.y))return null;
  const count=stock.get(o.itemId);
  if(count===undefined)return null;
  const plan=destination&&anchor?supportStockPlacement(tree,shapes,raster,o.itemId,count,destination.x+o.x-anchor.x,destination.y+o.y-anchor.y,o.orientation,true):supportStockPickup(tree,index,stock,eligible,true);
  if(!plan)return null;out.push(plan);stock.set(o.itemId,count+(plan.action==='place'?-1:1));
 }
 return out;
}
export type SupportStockPlan={action:'place';itemId:number;expectedStock:number;x:number;y:number;orientation:string}|{action:'pickup';itemId:number;expectedStock:number;index:number;expectedX:number;expectedY:number;expectedOrientation:string};
export function supportPlacementFits(tree:SupportTree,shapes:Readonly<Record<string,SourceObjectShape>>,raster:TerrainRaster,itemId:number,x:number,y:number,orientation:string,nonstandard=false):boolean{
 if(!Number.isSafeInteger(itemId)||Math.floor(itemId/100000)!==400||!supportOrientationAllowed(tree.factor,orientation,nonstandard)||!Number.isSafeInteger(x)||!Number.isSafeInteger(y)||tree.objects.length>=512)return false;
 const shape=shapes[itemId+':'+worldOrientationCode(orientation)];
 if(!shape||!shape.cellCount||shape.cellCount>65536)return false;
 if(nonstandard)return supportAnchorFits(tree,raster,x,y);
 if(shape.acceptedFloorTypesFlag===undefined||terrainWarnings({raster,factor:tree.factor,verifiedGridOrdinals:[]},shape,x,y).length)return false;
 for(const o of tree.objects){const key=supportShapeKey(o),other=key?shapes[key]:null;if(!other)return false;
  if(x>=o.x+other.width||o.x>=x+shape.width||y>=o.y+other.height||o.y>=y+shape.height)continue;
  if(shape.runs.some(a=>other.runs.some(b=>y+a.y===o.y+b.y&&x+a.x<o.x+b.x+b.width&&o.x+b.x<x+a.x+a.width)))return false;
 }
 return true;
}
export function supportStockPlacement(tree:SupportTree,shapes:Readonly<Record<string,SourceObjectShape>>,raster:TerrainRaster,itemId:number,count:number,x:number,y:number,orientation:string,nonstandard=false):SupportStockPlan|null{
 if(!Number.isInteger(count)||count<1||count>2147483647||!supportPlacementFits(tree,shapes,raster,itemId,x,y,orientation,nonstandard))return null;
 return {action:'place',itemId,expectedStock:count,x,y,orientation};
}
export const supportTransferWords={
 ja:['別の家具へ移動','移動先の家具を選択','移動先の支持面を確認できません。'],
 en:['Move to another support','Choose destination furniture','Destination support unavailable.'],
 fr:['Déplacer vers un autre meuble','Choisir le meuble de destination','Support de destination indisponible.'],
 it:['Sposta su un altro mobile','Scegli il mobile di destinazione','Supporto di destinazione non disponibile.'],
 de:['Auf anderes Möbel verschieben','Zielmöbel auswählen','Zielauflage nicht verfügbar.'],
 'es-ES':['Mover a otro mueble','Elegir mueble de destino','Soporte de destino no disponible.'],
 'zh-CN':['移动到其他家具','选择目标家具','目标支撑面不可用。'],
 'pt-BR':['Mover para outro móvel','Escolher móvel de destino','Suporte de destino indisponível.']
} as const;
export function supportStockPickup(tree:SupportTree,index:number,counts:ReadonlyMap<number,number>,removable:ReadonlySet<number>,free=false):SupportStockPlan|null{
 const o=tree.objects[index];if(!o||o.child||Math.floor(o.itemId/100000)!==400||!removable.has(o.itemId)||!supportOrientationAllowed(tree.factor,o.orientation,free))return null;
 const count=counts.get(o.itemId);if(count===undefined||count>=2147483647)return null;
 return {action:'pickup',itemId:o.itemId,expectedStock:count,index,expectedX:o.x,expectedY:o.y,expectedOrientation:o.orientation};
}
export const supportStockWords={
 ja:['小物を配置','在庫から選択','片付ける','複製','配置先をクリック','在庫なし','在庫を検索'],
 en:['Place object','Choose from stock','Put away','Duplicate','Click destination','No stock','Search stock'],
 fr:['Placer un objet','Choisir dans le stock','Ranger','Dupliquer','Cliquez la destination','Stock vide','Rechercher'],
 it:['Posiziona oggetto','Scegli dalle scorte','Riponi','Duplica','Seleziona destinazione','Nessuna scorta','Cerca'],
 de:['Objekt platzieren','Aus Bestand wählen','Einlagern','Duplizieren','Ziel anklicken','Kein Bestand','Suchen'],
 'es-ES':['Colocar objeto','Elegir del inventario','Guardar','Duplicar','Pulsa destino','Sin existencias','Buscar'],
 'zh-CN':['放置物品','从库存选择','收起','复制','点击目的地','无库存','搜索库存'],
 'pt-BR':['Colocar objeto','Escolher do estoque','Guardar','Duplicar','Clique no destino','Sem estoque','Buscar']
} as const;
export const supportFreeWords={
 ja:['支持面内を移動','配置先をクリック','配置可能面','対応原本がないため自由移動は無効'],
 en:['Move within support','Click destination','Support surface','Free movement unavailable without source data'],
 fr:['Déplacer sur le support','Cliquez la destination','Surface de support','Déplacement libre indisponible'],
 it:['Sposta sul supporto','Seleziona destinazione','Superficie','Spostamento libero non disponibile'],
 de:['Auf der Fläche verschieben','Ziel anklicken','Auflagefläche','Freie Bewegung nicht verfügbar'],
 'es-ES':['Mover sobre soporte','Pulsa destino','Superficie','Movimiento libre no disponible'],
 'zh-CN':['在支撑面内移动','点击目的地','支撑面','缺少原始数据，无法自由移动'],
 'pt-BR':['Mover no suporte','Clique no destino','Superfície','Movimento livre indisponível']
} as const;

/** Hit only verified occupied runs; transparent holes and unknown shapes are not furniture. */
export function supportHitIndices(tree:SupportTree,shapes:Readonly<Record<string,SourceObjectShape>>,x:number,y:number):number[]{
 if(!Number.isSafeInteger(x)||!Number.isSafeInteger(y))return [];
 return tree.objects.flatMap((o,i)=>{
  const key=supportShapeKey(o),shape=key?shapes[key]:null;
  return shape?.runs.some(run=>y===o.y+run.y&&x>=o.x+run.x&&x<o.x+run.x+run.width)?[i]:[];
 });
}

/** Retain the grabbed cell offset when moving a child on its native lattice. */
export function supportDragDestination(o:Pick<SupportObject,'x'|'y'>,start:{x:number;y:number},end:{x:number;y:number}):{x:number;y:number}|null{
 if(![o.x,o.y,start.x,start.y,end.x,end.y].every(Number.isSafeInteger))return null;
 const x=o.x+end.x-start.x,y=o.y+end.y-start.y;
 return [x,y].every(n=>Number.isInteger(n)&&n>=-2147483648&&n<=2147483647)?{x,y}:null;
}

/** Stock required to duplicate the root plus its existing descendant tree. */
export function supportDuplicateCounts(owner:number,tree:SupportTree|null):Map<number,number>|null{
 if(!tree||!Number.isSafeInteger(owner)||Math.floor(owner/100000)!==400)return null;
 const out=new Map<number,number>([[owner,1]]);let total=1;
 function visit(t:SupportTree,depth:number):boolean{
  if(depth>8||!t.sourcePath)return false;
  for(const o of t.objects){if(++total>32||Math.floor(o.itemId/100000)!==400||!isCardinal(o.orientation))return false;out.set(o.itemId,(out.get(o.itemId)??0)+1);if(o.child&&!visit(o.child,depth+1))return false;}
  return true;
 }
 return visit(tree,0)?out:null;
}
export const supportDuplicateWords={
 ja:['支持家具と小物を複製','複製に必要な在庫が不足しているか、対応外の構造です。','必要数'],
 en:['Duplicate support with contents','Insufficient stock or unsupported hierarchy.','Required'],
 fr:['Dupliquer avec le contenu','Stock insuffisant ou structure incompatible.','Requis'],
 it:['Duplica con contenuto','Scorte insufficienti o struttura incompatibile.','Richiesto'],
 de:['Mit Inhalt duplizieren','Bestand zu gering oder Struktur inkompatibel.','Benötigt'],
 'es-ES':['Duplicar con contenido','Inventario insuficiente o estructura incompatible.','Necesarios'],
 'zh-CN':['复制支撑家具及其物品','库存不足或结构不受支持。','所需'],
 'pt-BR':['Duplicar com conteúdo','Estoque insuficiente ou estrutura incompatível.','Necessários']
} as const;
