import {mainlandMapAnchor,mainlandTerrainHits,type MainlandGrid} from './mainland-world-coordinates.ts';
import type {MainlandSavedObject} from './mainland-saved-objects.ts';
import {terrainWarnings,type TerrainRaster} from './terrain-binding.ts';
import type {SourceObjectShape} from './source-object-map.ts';
import {CARDINAL_ORIENTATIONS,isCardinal} from './saved-map-transform.ts';
import {nativeActionBlocked} from './native-edit-restrictions.ts';
export interface SupportTree{factor:1|2;objects:SupportObject[]}
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
  });return {factor:v.factor,objects};
 }
 return visit(value.tree,0);
}
export function supportShapeKey(o:SupportObject){return isCardinal(o.orientation)?o.itemId+':'+CARDINAL_ORIENTATIONS.indexOf(o.orientation)*4:null;}
export function supportItems(tree:SupportTree){
 return tree.objects.flatMap(o=>{const key=supportShapeKey(o);return key?[{itemId:o.itemId,orientationCode:Number(key.split(':')[1])}]:[]});
}
export function supportExtent(tree:SupportTree,shapes:Readonly<Record<string,SourceObjectShape>>){
 let left=0,top=0,right=1,bottom=1;
 for(const o of tree.objects){const key=supportShapeKey(o),s=key?shapes[key]:null;left=Math.min(left,o.x);top=Math.min(top,o.y);right=Math.max(right,o.x+(s?.width??1));bottom=Math.max(bottom,o.y+(s?.height??1));}
 return {x:left-.5,y:top-.5,w:right-left+1,h:bottom-top+1};
}
export function supportParentEligible(p:MainlandSavedObject|null):p is MainlandSavedObject{
 return !!p?.shape&&p.object.subgrid?.status==='resolved_full'&&Number(p.object.itemId)/100000>=400&&Math.floor(Number(p.object.itemId)/100000)===400&&p.object.layer==='furniture'&&isCardinal(p.object.orientation)&&!nativeActionBlocked(p.object.editRestrictions,'select')&&!nativeActionBlocked(p.object.editRestrictions,'move');
}
export function supportParentCandidate(p:MainlandSavedObject,grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,worldX:number,worldY:number){
 if(!supportParentEligible(p)||!p.shape||!Number.isFinite(worldX)||!Number.isFinite(worldY))return null;
 const g=grids.find(g=>g.key===p.area),r=g&&rasters.get(g.key);if(!g||!r||g.factor!==p.factor)return null;
 const x=Math.floor((worldX-2*g.origin.position[0])*g.factor),y=Math.floor((-worldY-2*g.origin.position[2])*g.factor);
 const shape=p.shape;
 if(x<0||y<0||x+shape.width>g.sizeX*g.factor||y+shape.height>g.sizeY*g.factor||x===p.object.x&&y===p.object.y||shape.acceptedFloorTypesFlag===undefined||terrainWarnings({raster:r,factor:g.factor,verifiedGridOrdinals:[p.object.localGridOrdinal]},shape,x,y).length)return null;
 for(const run of shape.runs)for(let dx=0;dx<run.width;dx++){
  const a=mainlandMapAnchor(g,x+run.x+dx+.5,y+run.y+.5),hits=mainlandTerrainHits(grids,rasters,a.x,a.y);if(hits.length!==1||hits[0].key!==g.key)return null;
 }
 return {...mainlandMapAnchor(g,x,y),factor:g.factor,shape,plan:{localOrdinal:p.object.localOrdinal,itemId:Number(p.object.itemId),expectedX:p.object.x,expectedY:p.object.y,x,y,destination:{layoutId:g.layoutId,gridDataPath:g.gridDataPath,factor:g.factor,sizeX:g.sizeX,sizeY:g.sizeY}}};
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
