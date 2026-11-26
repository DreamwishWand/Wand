import {currentDesign,type DesignItemGeometry} from './design-layout.ts';
import {indoorGroupPlace,type IndoorRoom,type IndoorSurface,type IndoorPlace} from './indoor-room-view.ts';
import {supportSceneRootCounts} from './support-scene.ts';
import {roomDesignValid} from './room-design.ts';
import {roomFinishIdValid} from './room-finish-design.ts';
import {roomProjectCounts,type RoomProjectSurface} from './room-project-design.ts';
import type {SourceObjectShape} from './source-object-map.ts';
export interface RoomApplySurfaceGeometry{design:ReadonlyMap<number,DesignItemGeometry>;shapes:Readonly<Record<string,SourceObjectShape>>;allowed:ReadonlySet<number>}
export interface RoomApplyRow{surfaceOrdinal:number;sourcePath:string;factor:1|2;place:IndoorPlace[];finish:{itemId:number;expected:number|null}|null}
export interface RoomApplyPlan{roomOrdinal:number;surfaces:RoomApplyRow[]}
export function roomApplyMatches(s:RoomProjectSurface,face:IndoorSurface):boolean{
 const t=face.terrain,r=s.template.raster;
 return s.template.kind===face.kind&&face.gridStatus==='full'&&!!face.factor&&face.missingPositions===0&&!!t&&t.sizeX===r.sizeX&&t.sizeY===r.sizeY&&t.nativeFloorValues.length===r.nativeFloorValues.length&&t.nativeFloorValues.every((v,i)=>v===r.nativeFloorValues[i]);
}
export function roomApplyShortages(surfaces:readonly RoomProjectSurface[],stock:ReadonlyMap<number,number>){
 return [...roomProjectCounts(surfaces).furniture].flatMap(([itemId,required])=>{const available=stock.get(itemId)??0;return required>available?[{itemId,required,available}]:[];});
}
/** Exact absolute coordinates, no recentering, no destructive clear, and
 * one stock ledger across all faces and support descendants. */
export function buildRoomApplyPlan(surfaces:readonly RoomProjectSurface[],room:IndoorRoom,mapping:ReadonlyMap<number,number>,geometry:ReadonlyMap<number,RoomApplySurfaceGeometry>,stock:ReadonlyMap<number,number>,owned:ReadonlySet<number>):RoomApplyPlan|null{
 if(!surfaces.length||surfaces.length>9||mapping.size!==surfaces.length||new Set(mapping.values()).size!==mapping.size||roomApplyShortages(surfaces,stock).length)return null;
 const counts=new Map(stock),out:RoomApplyRow[]=[];let total=0,changed=false;
 for(const s of surfaces){
  const face=room.surfaces.find(f=>f.ordinal===mapping.get(s.id)),g=geometry.get(s.id),rows=currentDesign(s.timeline);
  if(!face?.factor||!g||!roomApplyMatches(s,face)||!roomDesignValid(s.timeline,s.template.grid,s.template.raster,g.design)||rows.length>32)return null;
  for(const p of rows){const def=g.design.get(p.itemId);if(!def||!!def.supportPath!==!!p.attachment||p.attachment?.designOnly)return null;}
  const clip=rows.map(p=>({itemId:p.itemId,dx:p.x,dy:p.y,orientation:p.orientation}));
  const place=clip.length?indoorGroupPlace(face,g.shapes,g.allowed,counts,clip,0,0):[];
  if(!place)return null;
  for(let i=0;i<place.length;i++){const p=rows[i],row=place[i],a=p.attachment;row.expectedStock=counts.get(row.itemId)??0;
   const need=a?supportSceneRootCounts(a.scene):new Map([[row.itemId,1]]);
   for(const [id,n] of need){if((counts.get(id)??0)<n)return null;counts.set(id,counts.get(id)!-n);total+=n;if(total>256)return null;}
   if(a)row.scene=a.scene;
  }
  let finish:RoomApplyRow['finish']=null;
  if(s.finish&&s.finish!==face.finish){
   if(!roomFinishIdValid(s.finish,face.kind)||!owned.has(s.finish)||room.surfaces.length!==5||!room.surfaces.slice(1).every((f,i)=>f.wallPosition===i)||face.kind==='floor'&&face.finish===null)return null;
   finish={itemId:s.finish,expected:face.finish};
  }
  if(place.length||finish)changed=true;
  out.push({surfaceOrdinal:face.ordinal,sourcePath:s.template.grid.gridDataPath,factor:face.factor,place,finish});
 }
 const plan={roomOrdinal:room.ordinal,surfaces:out};return changed&&JSON.stringify(plan).length<=120*1024?plan:null;
}
export const roomApplyWords={
ja:['部屋設計を適用','設計ファイルを選択','配置先の面を選択','追加配置・仕上げ変更（既存家具は保持）','配置と在庫を確認','配置・在庫・支持面・仕上げが適合しないか、対応上限を超えています。','検証済みコピーを作成','編集済みコピーを適用','戻る','追加する家具・小物','変更する仕上げ','在庫不足','実セーブの面に対応する地形を選択してください。','未確認の支持面解像度を含む設計は適用できません。','検証中…','テスト環境専用。実ゲームでの動作は未検証です。'],
en:['Apply room design','Choose design file','Map destination surfaces','Add furniture and change finishes (existing furniture retained)','Review placement and stock','Placement, stock, supports or finishes are incompatible, or a limit was exceeded.','Create validated copy','Apply edited copy','Back','Furniture and items to add','Finishes to change','Insufficient stock','Choose matching destination terrain.','Designs containing unverified support resolutions cannot be applied.','Validating…','Test environment only. In-game behavior is unverified.'],
fr:['Appliquer la pièce','Choisir le fichier','Associer les surfaces','Ajouter sans retirer les meubles existants','Vérifier placement et stock','Placement, stock ou limites incompatibles.','Créer une copie vérifiée','Appliquer la copie','Retour','Objets à ajouter','Finitions à modifier','Stock insuffisant','Choisissez les surfaces compatibles.','Résolution du support non vérifiée.','Vérification…','Test uniquement ; jeu non vérifié.'],
it:['Applica stanza','Scegli file','Associa superfici','Aggiungi senza rimuovere mobili','Verifica disposizione e scorte','Geometria, scorte o limiti incompatibili.','Crea copia verificata','Applica copia','Indietro','Oggetti da aggiungere','Finiture da cambiare','Scorte insufficienti','Scegli superfici compatibili.','Risoluzione del supporto non verificata.','Verifica…','Solo test; gioco non verificato.'],
de:['Raumentwurf anwenden','Datei wählen','Zielflächen zuordnen','Hinzufügen ohne vorhandene Möbel zu entfernen','Platzierung und Bestand prüfen','Geometrie, Bestand oder Grenzen inkompatibel.','Geprüfte Kopie erstellen','Kopie anwenden','Zurück','Objekte hinzufügen','Oberflächen ändern','Bestand fehlt','Passende Flächen wählen.','Auflagenauflösung ungeprüft.','Prüfung…','Nur Test; Spielverhalten ungeprüft.'],
'es-ES':['Aplicar diseño','Elegir archivo','Asignar superficies','Añadir sin retirar muebles existentes','Comprobar ubicación e inventario','Geometría, stock o límites incompatibles.','Crear copia validada','Aplicar copia','Volver','Objetos a añadir','Acabados a cambiar','Stock insuficiente','Elige superficies compatibles.','Resolución de soporte sin verificar.','Validando…','Solo pruebas; juego no verificado.'],
'zh-CN':['应用房间设计','选择设计文件','映射目标表面','添加家具和更换饰面（保留现有家具）','检查摆放和库存','摆放、库存、支撑面或饰面不兼容，或超出限制。','创建验证副本','应用编辑副本','返回','新增家具及摆件','变更饰面','库存不足','请选择匹配的目标表面。','支撑面分辨率未验证。','验证中…','仅供测试，游戏内行为未验证。'],
'pt-BR':['Aplicar projeto','Escolher arquivo','Mapear superfícies','Adicionar sem remover móveis existentes','Verificar posição e estoque','Geometria, estoque ou limites incompatíveis.','Criar cópia validada','Aplicar cópia','Voltar','Itens a adicionar','Acabamentos a alterar','Estoque insuficiente','Escolha superfícies compatíveis.','Resolução do apoio não verificada.','Validando…','Somente teste; jogo não verificado.']
} as const;
