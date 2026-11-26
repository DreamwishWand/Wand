/** Validate the small, local-only projection. A missing finish is not
 * silently converted to item zero. Native Grid IDs never reach the UI. */
export type IndoorGridStatus='full'|'unresolved'|'shared'|'diff';
export interface IndoorItem{itemId:number;quantity:number}
import type {SourceObjectShape} from "./source-object-map.ts";
import {CARDINAL_ORIENTATIONS,isCardinal} from './saved-map-transform.ts';
import {ROOM_CUT_LIMIT,rotateFurnitureGroup,type CutWitness} from './group-paste.ts';
import type {DesignClipItem,DesignItemGeometry} from './design-layout.ts';
import {sceneFromClip,parseSceneAnyFactor,convertSceneFactor,type ScenePreset} from './scene-preset.ts';
import {parseMixedScene,parseSupportScene,mixedSceneFromClip,mixedSceneCounts,supportSceneRootCounts,type MixedScenePreset,type SupportScene} from './support-scene.ts';
import {supportChildEdits,supportFreeEdit,supportPlacementFits,type SupportTree,type SupportChildEdit} from './subgrid-local.ts';
export interface IndoorPosition{itemId:number;x:number;y:number;orientationCode:0|4|8|12|null;plain?:true}
import type {TerrainRaster} from './terrain-binding.ts';
export interface IndoorSurface{kind:'floor'|'wall';ordinal:number;wallPosition:number|null;finish:number|null;gridStatus:IndoorGridStatus;items:IndoorItem[];positions:IndoorPosition[];factor:1|2|null;missingPositions:number;terrain?:TerrainRaster}
export interface IndoorRoom{ordinal:number;house:number;floor:number;name:string;ceiling:number|null;surfaces:IndoorSurface[]}
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const finish=(v:unknown):v is number|null=>v===null||integer(v,0,2147483647);
export function parseIndoorRooms(value:unknown):IndoorRoom[]{
 if(!record(value)||value.contract!=='wand.db05.indoor-rooms@1'||value.geometryVerified!==false||value.writerAuthorized!==false||!Array.isArray(value.rooms)||value.rooms.length>2048)throw Error('INDOOR_REPORT_INVALID');
 let total=0;
 return value.rooms.map((room,i)=>{
  if(!record(room)||Object.keys(room).length!==6||room.ordinal!==i+1||!integer(room.house,1,128)||!integer(room.floor,1,128)||typeof room.name!=='string'||[...room.name].length>128||!finish(room.ceiling)||!Array.isArray(room.surfaces)||room.surfaces.length<1||room.surfaces.length>65)throw Error('INDOOR_ROOM_INVALID');
  const surfaces:IndoorSurface[]=room.surfaces.map((s,j)=>{
   if(!record(s)||!([9,10].includes(Object.keys(s).length))||Object.keys(s).length===10&&s.terrain===undefined||s.ordinal!==j+1||s.kind!==(j===0?'floor':'wall')||!(j===0?s.wallPosition===null:integer(s.wallPosition,-2147483648,2147483647))||!finish(s.finish)||!['full','unresolved','shared','diff'].includes(String(s.gridStatus))||!Array.isArray(s.items)||s.items.length>100000||s.gridStatus!=='full'&&s.items.length||!Array.isArray(s.positions)||s.positions.length>100000||!integer(s.missingPositions,0,100000)||!(s.factor===null||s.factor===1||s.factor===2))throw Error('INDOOR_SURFACE_INVALID');
   const seen=new Set<number>();
   const items:IndoorItem[]=s.items.map(p=>{if(!record(p)||Object.keys(p).length!==2||!integer(p.itemId,1,4294967295)||!integer(p.quantity,1,100000)||seen.has(p.itemId))throw Error('INDOOR_ITEM_INVALID');seen.add(p.itemId);total+=p.quantity;if(total>100000)throw Error('INDOOR_LIMIT');return {itemId:p.itemId,quantity:p.quantity};});
   const quantities=new Map<number,number>(items.map(p=>[p.itemId,p.quantity]));let count=0;
   const positions:IndoorPosition[]=s.positions.map(p=>{if(!record(p)||!(Object.keys(p).length===4||Object.keys(p).length===5&&p.plain===true)||Object.keys(p).some(k=>!['itemId','x','y','orientationCode','plain'].includes(k))||!integer(p.itemId,1,4294967295)||!integer(p.x,-1000000,1000000)||!integer(p.y,-1000000,1000000)||!(p.orientationCode===null||p.orientationCode===0||p.orientationCode===4||p.orientationCode===8||p.orientationCode===12)||(quantities.get(p.itemId)??0)<1)throw Error('INDOOR_POSITION_INVALID');quantities.set(p.itemId,quantities.get(p.itemId)!-1);count++;return {itemId:p.itemId,x:p.x,y:p.y,orientationCode:p.orientationCode as IndoorPosition['orientationCode'],...(p.plain===true?{plain:true as const}:{})};});
   if([...quantities.values()].reduce((a,b)=>a+b,0)!==s.missingPositions||s.gridStatus!=='full'&&(count||s.missingPositions||s.factor!==null))throw Error('INDOOR_POSITION_COUNT');
   let terrain:TerrainRaster|undefined;
   if(s.terrain!==undefined){
    const t=s.terrain;if(s.gridStatus!=='full'||!s.factor||!record(t)||!integer(t.sizeX,1,256)||!integer(t.sizeY,1,256)||!Array.isArray(t.values)||t.values.length!==t.sizeX*t.sizeY||!t.values.every(v=>integer(v,0,0xffffffff)))throw Error('INDOOR_TERRAIN_INVALID');
    terrain={sizeX:t.sizeX,sizeY:t.sizeY,nativeFloorValues:Uint32Array.from(t.values)};
   }
   return {kind:s.kind as 'floor'|'wall',ordinal:j+1,wallPosition:s.wallPosition as number|null,finish:s.finish,gridStatus:s.gridStatus as IndoorGridStatus,items,positions,factor:s.factor as 1|2|null,missingPositions:s.missingPositions,...(terrain?{terrain}:{})};
  });
  return {ordinal:i+1,house:room.house,floor:room.floor,name:room.name,ceiling:room.ceiling,surfaces};
 });
}
export const indoorWords={
 ja:['屋内','家','階','部屋','床','壁','天井','閉じる','読み込み中…','部屋がありません。','屋内情報を読み込めませんでした。','未設定','未確認','配置家具','現在は閲覧のみ。屋内の地形・書き込みは未検証です。','部屋の仕上げ','面の配置を確認できません。','家具名を検索'],
 en:['Indoors','House','Floor','Room','Floor','Wall','Ceiling','Close','Loading…','No rooms.','Unable to read rooms.','Not set','Unknown','Placed items','Read only. Indoor terrain and writes are not verified.','Room finish','Surface placement unavailable.','Find item'],
 fr:['Intérieur','Maison','Étage','Pièce','Sol','Mur','Plafond','Fermer','Chargement…','Aucune pièce.','Lecture impossible.','Non défini','Inconnu','Objets placés','Lecture seule. Terrain et écriture non vérifiés.','Finitions','Placement indisponible.','Rechercher'],
 it:['Interni','Casa','Piano','Stanza','Pavimento','Parete','Soffitto','Chiudi','Caricamento…','Nessuna stanza.','Lettura non riuscita.','Non impostato','Sconosciuto','Oggetti posizionati','Sola lettura. Terreno e scrittura non verificati.','Finiture','Posizione non disponibile.','Cerca'],
 de:['Innenräume','Haus','Etage','Raum','Boden','Wand','Decke','Schließen','Laden…','Keine Räume.','Räume nicht lesbar.','Nicht festgelegt','Unbekannt','Platzierte Objekte','Nur Lesen. Gelände und Schreiben ungeprüft.','Raumgestaltung','Platzierung unbekannt.','Suchen'],
 'es-ES':['Interiores','Casa','Planta','Habitación','Suelo','Pared','Techo','Cerrar','Cargando…','Sin habitaciones.','No se pueden leer.','Sin definir','Desconocido','Objetos colocados','Solo lectura. Terreno y escritura sin verificar.','Acabados','Colocación no disponible.','Buscar'],
 'zh-CN':['室内','房屋','楼层','房间','地板','墙壁','天花板','关闭','正在读取…','没有房间。','无法读取房间。','未设置','未知','已放置物品','仅查看。室内地形和写入尚未验证。','房间装饰','无法确认放置。','搜索物品'],
 'pt-BR':['Interiores','Casa','Andar','Cômodo','Piso','Parede','Teto','Fechar','Carregando…','Sem cômodos.','Não foi possível ler.','Não definido','Desconhecido','Itens posicionados','Somente leitura. Terreno e escrita não verificados.','Acabamentos','Posição indisponível.','Buscar']
} as const;

export function parseOwnedFinishes(value:unknown):number[]{
 if(!record(value)||!Array.isArray(value.ownedFinishIds)||value.ownedFinishIds.length>20000)throw Error('TRIMMING_STOCK_INVALID');
 const ids=new Set<number>();for(const n of value.ownedFinishIds){if(!integer(n,1,2147483647)||![1600,1601].includes(Math.floor(n/100000))||ids.has(n))throw Error('TRIMMING_STOCK_INVALID');ids.add(n);}
 return [...ids];
}
export function verifyFinishReceipt(v:unknown){return record(v)&&v.contract==='wand.db05.room-finish-preview@1'&&v.changed===true&&v.reopenVerified===true&&v.untouchedBytesPreserved===true&&v.inventoryUnchanged===true&&v.currentBuildRuntimeVerified===false&&v.exportAuthorized===false;}
export const finishWords={
 ja:['床材・壁紙を選択','現在の壁','全ての壁','変更を検証','検証成功・未出力','変更を検証できませんでした。','所持する対象アイテムなし','検証中…'],
 en:['Choose floor or wallpaper','Current wall','All walls','Validate change','Validated · not exported','Change could not be validated.','No owned eligible items','Checking…'],
 fr:['Choisir sol ou papier peint','Mur actuel','Tous les murs','Vérifier','Validé · non exporté','Échec de vérification.','Aucun objet compatible','Vérification…'],
 it:['Scegli pavimento o carta da parati','Parete attuale','Tutte le pareti','Verifica','Validato · non esportato','Verifica non riuscita.','Nessun oggetto idoneo','Verifica…'],
 de:['Boden oder Tapete wählen','Aktuelle Wand','Alle Wände','Prüfen','Geprüft · nicht exportiert','Prüfung fehlgeschlagen.','Keine geeigneten Objekte','Prüfung…'],
 'es-ES':['Elegir suelo o papel','Pared actual','Todas las paredes','Verificar','Validado · sin exportar','No se pudo verificar.','Sin objetos disponibles','Verificando…'],
 'zh-CN':['选择地板或墙纸','当前墙面','全部墙面','验证修改','验证成功 · 未导出','无法验证修改。','没有符合条件的物品','正在验证…'],
 'pt-BR':['Escolher piso ou papel de parede','Parede atual','Todas as paredes','Validar','Validado · não exportado','Não foi possível validar.','Nenhum item compatível','Verificando…']
} as const;

/** View extents describe recorded points, not the dimensions of a room.
 * Group coincident anchors so stacked objects remain countable. */
export function indoorPositionPlot(positions:readonly IndoorPosition[],itemId:number|null=null,shapes:Readonly<Record<string,SourceObjectShape>>={}){
 const groups=new Map<string,{x:number;y:number;count:number;selected:number}>();
 const footprints:{x:number;y:number;itemId:number;path:string}[]=[];
 let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
 for(const p of positions){
  const k=p.x+':'+p.y,point=groups.get(k)??{x:p.x,y:p.y,count:0,selected:0};point.count++;if(p.itemId===itemId)point.selected++;groups.set(k,point);
  const shape=p.orientationCode===null?undefined:shapes[p.itemId+":"+p.orientationCode];
  if(shape){footprints.push({x:p.x,y:p.y,itemId:p.itemId,path:shape.path});}
  left=Math.min(left,p.x);right=Math.max(right,p.x+(shape?.width??0));top=Math.min(top,p.y);bottom=Math.max(bottom,p.y+(shape?.height??0));
 }
 if(!groups.size)return null;
 const width=right-left+2,height=bottom-top+2;
 return {footprints,points:[...groups.values()],viewBox:[left-1,top-1,width,height].join(' '),markerRadius:Math.max(.16,Math.max(width,height)/250)};
}
export const positionWords={
 ja:['配置位置','一覧','記録された配置位置のみ（部屋の境界・占有マスは未確認）','位置不明','同じ位置の家具','家具を選択すると位置を強調表示','表示上限を超えています。'],
 en:['Positions','List','Recorded anchors only; room bounds and occupied cells are unverified.','Unknown positions','Items at this position','Select an item to highlight its positions','Display limit exceeded.'],
 fr:['Positions','Liste','Ancrages enregistrés uniquement ; limites et cases non vérifiées.','Positions inconnues','Objets à cette position','Sélectionner un objet pour le repérer','Limite d’affichage dépassée.'],
 it:['Posizioni','Elenco','Solo ancoraggi registrati; limiti e celle non verificati.','Posizioni sconosciute','Oggetti in questa posizione','Seleziona un oggetto per evidenziarlo','Limite di visualizzazione superato.'],
 de:['Positionen','Liste','Nur gespeicherte Anker; Raumgrenzen und belegte Zellen ungeprüft.','Unbekannte Positionen','Objekte an dieser Position','Objekt zum Hervorheben auswählen','Anzeigelimit überschritten.'],
 'es-ES':['Posiciones','Lista','Solo anclajes registrados; límites y celdas sin verificar.','Posiciones desconocidas','Objetos en esta posición','Selecciona un objeto para resaltar sus posiciones','Límite de visualización superado.'],
 'zh-CN':['放置位置','列表','仅显示记录的锚点，房间边界及占用格尚未验证。','未知位置','此位置的物品','选择物品以突出显示位置','超出显示上限。'],
 'pt-BR':['Posições','Lista','Somente âncoras registradas; limites e células não verificados.','Posições desconhecidas','Itens nesta posição','Selecione um item para destacar suas posições','Limite de exibição excedido.']
} as const;

export const indoorShapeWords={ja:'原本の家具形状（実際の占有状態・部屋境界は未確認）',en:'Source item shapes; actual occupancy and room bounds unverified',fr:'Formes originales ; occupation et limites non vérifiées',it:'Forme originali; occupazione e limiti non verificati',de:'Originalformen; Belegung und Raumgrenzen ungeprüft','es-ES':'Formas originales; ocupación y límites sin verificar','zh-CN':'原始家具形状；实际占用及房间边界未验证','pt-BR':'Formas originais; ocupação e limites não verificados'} as const;

export interface IndoorPickup{index:number;itemId:number;expectedX:number;expectedY:number;expectedOrientation:string;expectedStock:number}
export function indoorEditableTree(face:IndoorSurface|null):SupportTree|null{
 if(!face||face.gridStatus!=='full'||!face.factor||face.missingPositions||face.positions.length>5000)return null;
 return {factor:face.factor,sourcePath:null,objects:face.positions.map(p=>({itemId:p.itemId,x:p.x,y:p.y,orientation:p.orientationCode===null?'Unknown':CARDINAL_ORIENTATIONS[p.orientationCode/4],child:null}))};
}
function indoorShape(o:SupportTree['objects'][number],shapes:Readonly<Record<string,SourceObjectShape>>){
 return shapes[o.itemId+':'+CARDINAL_ORIENTATIONS.indexOf(o.orientation as typeof CARDINAL_ORIENTATIONS[number])*4];
}
function indoorClear(t:SupportTree,shapes:Readonly<Record<string,SourceObjectShape>>,index:number):boolean{
 const a=t.objects[index],s=a&&indoorShape(a,shapes);if(!a||!s||s.cellCount>65536)return false;
 for(let i=0;i<t.objects.length;i++){
  if(i===index)continue;const b=t.objects[i],q=indoorShape(b,shapes);if(!q||a.x===b.x&&a.y===b.y)return false;
  if(a.x+s.width<=b.x||b.x+q.width<=a.x||a.y+s.height<=b.y||b.y+q.height<=a.y)continue;
  // Compare horizontal runs directly, never enumerate every occupied cell.
  const byY=new Map<number,typeof q.runs[number][]>();
  for(const run of q.runs){const y=b.y+run.y;const rows=byY.get(y)??[];rows.push(run);byY.set(y,rows);}
  for(const run of s.runs)if((byY.get(a.y+run.y)??[]).some(other=>a.x+run.x<b.x+other.x+other.width&&b.x+other.x<a.x+run.x+run.width))return false;
 }
 return true;
}
export function indoorFurnitureEdits(face:IndoorSurface|null,shapes:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>,first:number,second:number|null,turn:-1|1):SupportChildEdit[]|null{
 const tree=indoorEditableTree(face);if(!tree)return null;
 const edits=supportChildEdits(tree,shapes,allowed,first,second,turn);
 if(edits&&edits.every(e=>indoorClear(tree,shapes,e.index)))return edits;
 if(second!==null||!face?.terrain)return null;
 const o=tree.objects[first];if(!o)return null;
 const i=CARDINAL_ORIENTATIONS.indexOf(o.orientation as typeof CARDINAL_ORIENTATIONS[number]);if(i<0)return null;
 return supportFreeEdit(tree,shapes,allowed,face.terrain,first,o.x,o.y,CARDINAL_ORIENTATIONS[(i+turn+4)%4]);
}
export function indoorSwapPartners(face:IndoorSurface|null,shapes:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>,first:number):number[]{
 const t=indoorEditableTree(face);if(!t||!t.objects[first]||!indoorClear(t,shapes,first))return [];
 return t.objects.flatMap((_,i)=>supportChildEdits(t,shapes,allowed,first,i,1)&&indoorClear(t,shapes,i)?[i]:[]);
}
export function indoorPickup(face:IndoorSurface|null,index:number,removable:ReadonlySet<number>,stock:ReadonlyMap<number,number>):IndoorPickup|null{
 const t=indoorEditableTree(face),o=t?.objects[index];if(!t||!o||Math.floor(o.itemId/100000)!==400||!removable.has(o.itemId)||!CARDINAL_ORIENTATIONS.includes(o.orientation as typeof CARDINAL_ORIENTATIONS[number])||t.objects.filter(p=>p.x===o.x&&p.y===o.y).length!==1)return null;
 const n=stock.get(o.itemId);if(n===undefined||n>=2147483647)return null;
 return {index,itemId:o.itemId,expectedX:o.x,expectedY:o.y,expectedOrientation:o.orientation,expectedStock:n};
}
export function indoorGroupPickup(face:IndoorSurface|null,indices:readonly number[],removable:ReadonlySet<number>,stock:ReadonlyMap<number,number>):IndoorPickup[]|null{
 if(!indices.length||indices.length>ROOM_CUT_LIMIT||new Set(indices).size!==indices.length)return null;
 const counts=new Map<number,number>(),rows:IndoorPickup[]=[];
 for(const index of indices){const row=indoorPickup(face,index,removable,stock);if(!row)return null;
  const count=(counts.get(row.itemId)??0)+1;if(row.expectedStock+count>2147483647)return null;
  counts.set(row.itemId,count);rows.push(row);
 }
 return rows;
}
export const indoorEditWords={
 ja:['家具編集','個別の家具を選択','占有形状が変わらない回転・交換に対応。自由配置には原本の部屋地形が必要です。','インベントリへ戻す','編集を確認','編集済みコピーを作成できませんでした。'],
 en:['Edit furniture','Select an individual object','Rotation and swaps preserve occupied shapes. Free placement requires original room terrain.','Return to inventory','Review edit','Unable to create edited copy.'],
 fr:['Modifier les meubles','Sélectionner un objet','Rotation et échange sans changer la forme occupée. Le placement libre nécessite le terrain original.','Ranger dans l’inventaire','Vérifier','Impossible de créer la copie.'],
 it:['Modifica mobili','Seleziona un oggetto','Rotazione e scambio a ingombro invariato. Il posizionamento libero richiede il terreno originale.','Riponi nell’inventario','Verifica','Impossibile creare la copia.'],
 de:['Möbel bearbeiten','Einzelnes Objekt wählen','Drehung und Tausch bei gleicher Belegung. Freie Platzierung benötigt Originalgelände.','Ins Inventar zurück','Prüfen','Kopie konnte nicht erstellt werden.'],
 'es-ES':['Editar muebles','Selecciona un objeto','Giros e intercambios con la misma ocupación. La colocación libre requiere el terreno original.','Devolver al inventario','Revisar','No se pudo crear la copia.'],
 'zh-CN':['编辑家具','选择单件家具','支持占用形状不变的旋转和交换。自由放置需要原始房间地形。','收回库存','确认编辑','无法创建编辑副本。'],
 'pt-BR':['Editar móveis','Selecionar um objeto','Rotação e troca sem mudar a ocupação. A colocação livre requer o terreno original.','Devolver ao inventário','Revisar','Não foi possível criar a cópia.']
} as const;

export interface IndoorPlace{itemId:number;expectedStock:number;x:number;y:number;orientation:string;supportSource?:{index:number;expectedX:number;expectedY:number;expectedOrientation:string};scene?:SupportScene}
export function indoorMove(face:IndoorSurface|null,shapes:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>,index:number,x:number,y:number,orientation?:string){
 const t=indoorEditableTree(face),o=t?.objects[index];return t&&o&&face?.terrain?supportFreeEdit(t,shapes,allowed,face.terrain,index,x,y,orientation??o.orientation):null;
}
/** Translate selected native records together; their old cells may be reused.
 * The final footprints must fit the original room and all stationary objects. */
export function indoorGroupMove(face:IndoorSurface|null,shapes:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>,indices:readonly number[],anchor:number,x:number,y:number):SupportChildEdit[]|null{
 const tree=indoorEditableTree(face),selected=new Set(indices),origin=tree?.objects[anchor];
 if(!tree||!face?.terrain||!origin||!selected.has(anchor)||indices.length<2||indices.length>ROOM_CUT_LIMIT||selected.size!==indices.length||![x,y].every(Number.isSafeInteger))return null;
 const dx=x-origin.x,dy=y-origin.y;
 if(!dx&&!dy)return null;
 const stationary=tree.objects.filter((_,i)=>!selected.has(i)),out:SupportChildEdit[]=[];
 for(const index of indices){
  const o=tree.objects[index];
  if(!o||!indoorClear(tree,shapes,index))return null;
  const draft=supportFreeEdit({...tree,objects:[o,...stationary]},shapes,allowed,face.terrain,0,o.x+dx,o.y+dy,o.orientation);
  if(!draft)return null;
  out.push({...draft[0],index});
 }
 return out;
}
/** Rotate about the selected footprint bounds, using the shared native
 * orientation/rectangle transform. Validate all final occupied runs. */
export function indoorGroupRotate(face:IndoorSurface|null,shapes:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>,indices:readonly number[],turn:-1|1):SupportChildEdit[]|null{
 const tree=indoorEditableTree(face),selected=new Set(indices);
 if(!tree||!face?.terrain||indices.length<2||indices.length>ROOM_CUT_LIMIT||selected.size!==indices.length||(turn!==1&&turn!==-1))return null;
 const chosen=indices.map(i=>tree.objects[i]);
 if(chosen.some((o,i)=>!o||!isCardinal(o.orientation)||!allowed.has(o.itemId)||Math.floor(o.itemId/100000)!==400||!indoorClear(tree,shapes,indices[i])))return null;
 const left=Math.min(...chosen.map(o=>o.x)),top=Math.min(...chosen.map(o=>o.y));
 const clip=chosen.map(o=>({itemId:o.itemId,dx:(o.x-left)*2/tree.factor,dy:(o.y-top)*2/tree.factor,orientation:CARDINAL_ORIENTATIONS.indexOf(o.orientation as typeof CARDINAL_ORIENTATIONS[number])}));
 const rotated=rotateIndoorCut(clip,tree.factor,shapes,turn);if(!rotated)return null;
 const stationary=tree.objects.filter((_,i)=>!selected.has(i)),final={...tree,objects:[...stationary]},out:SupportChildEdit[]=[];
 for(let i=0;i<chosen.length;i++){
  const o=chosen[i],p=rotated[i],x=left+p.dx*tree.factor/2,y=top+p.dy*tree.factor/2,orientation=CARDINAL_ORIENTATIONS[p.orientation];
  if(p.itemId!==o.itemId||!supportFreeEdit({...tree,objects:[o]},shapes,allowed,face.terrain,0,x,y,orientation)||!supportPlacementFits(final,shapes,face.terrain,p.itemId,x,y,orientation))return null;
  out.push({index:indices[i],itemId:o.itemId,expectedX:o.x,expectedY:o.y,expectedOrientation:o.orientation,x,y,orientation});
  final.objects.push({...o,x,y,orientation});
 }
 return out;
}
export const indoorGroupMoveWords={ja:'選択した家具を一括移動',en:'Move selected furniture',fr:'Déplacer les meubles sélectionnés',it:'Sposta mobili selezionati',de:'Ausgewählte Möbel verschieben','es-ES':'Mover muebles seleccionados','zh-CN':'移动所选家具','pt-BR':'Mover móveis selecionados'} as const;

export function indoorPlace(face:IndoorSurface|null,shapes:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>,stock:ReadonlyMap<number,number>,itemId:number,x:number,y:number,orientation:string):IndoorPlace|null{
 const t=indoorEditableTree(face),n=stock.get(itemId);return t&&face?.terrain&&n!==undefined&&n>0&&allowed.has(itemId)&&supportPlacementFits(t,shapes,face.terrain,itemId,x,y,orientation)?{itemId,expectedStock:n,x,y,orientation}:null;
}
/** Copy only layout poses; the original objects remain in place and all
 * new records must fit the actual room and available furniture stock. */
export function indoorDuplicateClip(face:IndoorSurface|null,indices:readonly number[],shapes:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>,stock:ReadonlyMap<number,number>):DesignClipItem[]|null{
 const tree=indoorEditableTree(face);
 if(!tree||!face?.terrain||!indices.length||indices.length>ROOM_CUT_LIMIT||new Set(indices).size!==indices.length)return null;
 const counts=new Map<number,number>(),clip:DesignClipItem[]=[];
 for(const i of indices){
  const o=tree.objects[i];if(!o||!isCardinal(o.orientation)||Math.floor(o.itemId/100000)!==400||!allowed.has(o.itemId)||!indoorClear(tree,shapes,i))return null;
  const count=(counts.get(o.itemId)??0)+1;if(count>(stock.get(o.itemId)??0))return null;counts.set(o.itemId,count);
  clip.push({itemId:o.itemId,dx:o.x*2/tree.factor,dy:o.y*2/tree.factor,orientation:CARDINAL_ORIENTATIONS.indexOf(o.orientation)});
 }
 const x=Math.min(...clip.map(p=>p.dx)),y=Math.min(...clip.map(p=>p.dy));return clip.map(p=>({...p,dx:p.dx-x,dy:p.dy-y}));
}
export function indoorGroupPlace(face:IndoorSurface|null,shapes:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>,stock:ReadonlyMap<number,number>,clip:readonly DesignClipItem[],x:number,y:number):IndoorPlace[]|null{
 const tree=indoorEditableTree(face);
 if(!tree||!face?.terrain||!clip.length||clip.length>ROOM_CUT_LIMIT||tree.objects.length+clip.length>512||![x,y].every(Number.isSafeInteger))return null;
 const staged={...tree,objects:[...tree.objects]},counts=new Map(stock),rows:IndoorPlace[]=[];
 for(const p of clip){
  const px=x+p.dx*tree.factor/2,py=y+p.dy*tree.factor/2,orientation=CARDINAL_ORIENTATIONS[p.orientation],n=counts.get(p.itemId);
  if(!Number.isSafeInteger(p.dx)||!Number.isSafeInteger(p.dy)||p.dx<0||p.dy<0||!orientation||!allowed.has(p.itemId)||n===undefined||n<1||!supportPlacementFits(staged,shapes,face.terrain,p.itemId,px,py,orientation))return null;
  rows.push({itemId:p.itemId,x:px,y:py,orientation,expectedStock:n});counts.set(p.itemId,n-1);staged.objects.push({itemId:p.itemId,x:px,y:py,orientation,child:null});
 }
 return rows;
}
/** Existing portable Wand Scene format, not a whole-room backup.
 * Require a positive leaf-record witness; never silently drop saved state. */
export function captureIndoorScene(face:IndoorSurface|null,indices:readonly number[],shapes:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>):ScenePreset|null{
 const tree=indoorEditableTree(face);
 if(!tree||!face?.terrain||!face.factor||!indices.length||indices.length>ROOM_CUT_LIMIT||new Set(indices).size!==indices.length)return null;
 const clip:DesignClipItem[]=[];
 for(const i of indices){
  const o=tree.objects[i];if(!o||face.positions[i]?.plain!==true||!isCardinal(o.orientation)||Math.floor(o.itemId/100000)!==400||!allowed.has(o.itemId)||!indoorClear(tree,shapes,i))return null;
  clip.push({itemId:o.itemId,dx:o.x,dy:o.y,orientation:CARDINAL_ORIENTATIONS.indexOf(o.orientation)});
 }
 const x=Math.min(...clip.map(p=>p.dx)),y=Math.min(...clip.map(p=>p.dy));
 try{return sceneFromClip(clip.map(p=>({...p,dx:p.dx-x,dy:p.dy-y})),face.factor,'corner');}catch{return null;}
}
/** Portable root poses use the common half-cell lattice. */
export function indoorMixedScene(text:string):MixedScenePreset|null{
 try{return parseMixedScene(text);}catch{try{const scene=parseSupportScene(text);return mixedSceneFromClip([{itemId:scene.ownerItemId,dx:0,dy:0,orientation:2}],[scene],'corner');}catch{return null;}}
}
export function indoorMixedPlacement(face:IndoorSurface|null,shapes:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>,stock:ReadonlyMap<number,number>,clip:readonly DesignClipItem[],doc:MixedScenePreset,anchor:ScenePreset['anchor'],x:number,y:number):IndoorPlace[]|null{
 if(clip.length!==doc.items.length||clip.some((p,i)=>p.itemId!==doc.items[i].itemId)||[...mixedSceneCounts(doc.items)].some(([id,n])=>(stock.get(id)??0)<n))return null;
 const rows=indoorScenePlacement(face,shapes,allowed,stock,clip,anchor,x,y);if(!rows)return null;
 const counts=new Map(stock);
 return rows.map((row,i)=>{const scene=doc.items[i].support,expectedStock=counts.get(row.itemId)!;for(const [id,n] of scene?supportSceneRootCounts(scene):new Map([[row.itemId,1]]))counts.set(id,counts.get(id)!-n);return {...row,expectedStock,...(scene?{scene}:{})};});
}
export function captureIndoorMixedScene(face:IndoorSurface|null,indices:readonly number[],shapes:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>,supports:ReadonlyMap<number,SupportScene>):MixedScenePreset|null{
 const tree=indoorEditableTree(face);if(!tree||!face?.terrain||!face.factor||!indices.length||indices.length>ROOM_CUT_LIMIT||new Set(indices).size!==indices.length)return null;
 const clip:DesignClipItem[]=[],scenes:(SupportScene|null)[]=[];
 for(const i of indices){const o=tree.objects[i],s=supports.get(i)??null;if(!o||!isCardinal(o.orientation)||Math.floor(o.itemId/100000)!==400||!allowed.has(o.itemId)||!indoorClear(tree,shapes,i)||(!s&&face.positions[i]?.plain!==true)||s&&s.ownerItemId!==o.itemId)return null;
  clip.push({itemId:o.itemId,dx:o.x*2/face.factor,dy:o.y*2/face.factor,orientation:CARDINAL_ORIENTATIONS.indexOf(o.orientation)});scenes.push(s);
 }
 const x=Math.min(...clip.map(p=>p.dx)),y=Math.min(...clip.map(p=>p.dy));
 try{return mixedSceneFromClip(clip.map(p=>({...p,dx:p.dx-x,dy:p.dy-y})),scenes,'corner');}catch{return null;}
}
export function indoorSceneClip(text:string,factor:1|2):{clip:DesignClipItem[];anchor:ScenePreset['anchor']}{
 const scene=convertSceneFactor(parseSceneAnyFactor(text),factor);
 if(!scene||scene.items.length>ROOM_CUT_LIMIT||scene.items.some(p=>Math.floor(p.itemId/100000)!==400))throw Error('INDOOR_SCENE_UNSUPPORTED');
 return {clip:scene.items.map(p=>({...p,dx:p.dx*2/factor,dy:p.dy*2/factor})),anchor:scene.anchor};
}
export function indoorScenePlacement(face:IndoorSurface|null,shapes:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>,stock:ReadonlyMap<number,number>,clip:readonly DesignClipItem[],anchor:ScenePreset['anchor'],x:number,y:number){
 if(!face?.factor)return null;
 if(anchor==='center'){
  let width=0,height=0;
  for(const p of clip){const s=shapes[p.itemId+':'+p.orientation*4];if(!s)return null;width=Math.max(width,p.dx*face.factor/2+s.width);height=Math.max(height,p.dy*face.factor/2+s.height);}
  x-=Math.floor((width-1)/2);y-=Math.floor((height-1)/2);
 }
 return indoorGroupPlace(face,shapes,allowed,stock,clip,x,y);
}
export const indoorSceneWords={
 ja:['面全体のSceneを保存','家具と対応する支持面の配置。床材・壁紙は含みません。','Sceneを配置できません。形状・在庫・対応数を確認してください。'],
 en:['Save entire surface as Scene','Furniture and supported surface layouts; finishes are not included.','Cannot place Scene. Check geometry, stock and supported count.'],
 fr:['Enregistrer la surface en scène','Meubles et supports compatibles ; finitions exclues.','Scène incompatible : vérifier géométrie, stock et quantité.'],
 it:['Salva superficie come scena','Disposizione di mobili e supporti compatibili; finiture escluse.','Verifica geometria, scorte e quantità.'],
 de:['Fläche als Szene speichern','Möbel und unterstützte Ablagen; Oberflächen ausgeschlossen.','Geometrie, Bestand und Anzahl prüfen.'],
 'es-ES':['Guardar superficie como escena','Muebles y soportes compatibles; sin acabados.','Comprueba geometría, inventario y cantidad.'],
 'zh-CN':['将整个表面保存为场景','家具和兼容支撑面布局，不含饰面。','请检查形状、库存和数量。'],
 'pt-BR':['Salvar superfície como cena','Móveis e suportes compatíveis; sem acabamentos.','Verifique geometria, estoque e quantidade.']
} as const;
export const indoorGroupStockWords={
 ja:['選択した家具を回収','選択した家具を複製'],en:['Return selected furniture','Duplicate selected furniture'],fr:['Ranger les meubles sélectionnés','Dupliquer les meubles sélectionnés'],it:['Riponi mobili selezionati','Duplica mobili selezionati'],de:['Ausgewählte Möbel einlagern','Ausgewählte Möbel duplizieren'],'es-ES':['Guardar muebles seleccionados','Duplicar muebles seleccionados'],'zh-CN':['收回所选家具','复制所选家具'],'pt-BR':['Recolher móveis selecionados','Duplicar móveis selecionados']
} as const;
export const indoorTerrainWords={
 ja:['部屋の原本地形','移動','在庫から配置','配置先をクリック','家具名を検索','空きマスへ配置できます。'],
 en:['Original room terrain','Move','Place from stock','Click destination','Find furniture','Place on available cells.'],
 fr:['Terrain original','Déplacer','Placer du stock','Choisir la destination','Rechercher','Placer sur les cases libres.'],
 it:['Terreno originale','Sposta','Posiziona da scorte','Scegli destinazione','Cerca mobili','Posiziona nelle celle libere.'],
 de:['Originalgelände','Verschieben','Aus Bestand platzieren','Ziel wählen','Möbel suchen','Freie Zellen nutzen.'],
 'es-ES':['Terreno original','Mover','Colocar del inventario','Elige destino','Buscar muebles','Coloca en casillas libres.'],
 'zh-CN':['原始房间地形','移动','从库存放置','点击目标位置','搜索家具','可放置于空闲格。'],
 'pt-BR':['Terreno original','Mover','Colocar do estoque','Clique no destino','Buscar móveis','Coloque nas células livres.']
} as const;

/** A cut transfer uses existing furniture, not inventory. Verify the target
 * floor with the same native footprint and collision rules as stock placement. */
export function indoorTransferPlace(face:IndoorSurface|null,shapes:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>,itemId:number,x:number,y:number,orientation:string):Omit<IndoorPlace,'expectedStock'>|null{
 const t=indoorEditableTree(face);
 return t&&face?.kind==='floor'&&face.terrain&&allowed.has(itemId)&&supportPlacementFits(t,shapes,face.terrain,itemId,x,y,orientation)?{itemId,x,y,orientation}:null;
}
export const indoorTransferWords={
 ja:'切り取った家具を配置',en:'Place cut furniture',fr:'Placer le meuble coupé',it:'Posiziona mobile tagliato',de:'Ausgeschnittenes Möbel platzieren','es-ES':'Colocar mueble cortado','zh-CN':'放置剪切的家具','pt-BR':'Colocar móvel recortado'
} as const;

/** Same half-cell offsets as the shared outdoor clipboard, in source index order. */
export function captureIndoorCut(face:IndoorSurface|null,roomOrdinal:number,indices:readonly number[],shapes:Readonly<Record<string,SourceObjectShape>>,editable:ReadonlySet<number>,removable:ReadonlySet<number>,supportIndices:ReadonlySet<number>=new Set()):{rows:CutWitness[];clip:DesignClipItem[]}|null{
 const t=indoorEditableTree(face);
 if(!t||face?.kind!=='floor'||!face.terrain||!Number.isSafeInteger(roomOrdinal)||roomOrdinal<1||!indices.length||indices.length>ROOM_CUT_LIMIT||new Set(indices).size!==indices.length)return null;
 const rows:CutWitness[]=[],clip:DesignClipItem[]=[];
 for(const index of indices){
  const o=t.objects[index];if(!o||!isCardinal(o.orientation)||Math.floor(o.itemId/100000)!==400||!editable.has(o.itemId)||!removable.has(o.itemId)||!indoorClear(t,shapes,index))return null;
  rows.push({roomSource:{roomOrdinal,index},area:'indoor',itemId:String(o.itemId),expectedX:o.x,expectedY:o.y,expectedOrientation:o.orientation,...(supportIndices.has(index)?{supportFactor:t.factor}:{})});
  clip.push({itemId:o.itemId,dx:o.x*2/t.factor,dy:o.y*2/t.factor,orientation:CARDINAL_ORIENTATIONS.indexOf(o.orientation)});
 }
 const x=Math.min(...clip.map(p=>p.dx)),y=Math.min(...clip.map(p=>p.dy));
 return {rows,clip:clip.map(p=>({...p,dx:p.dx-x,dy:p.dy-y}))};
}
export type IndoorTransferRow=Omit<IndoorPlace,'expectedStock'>&Pick<CutWitness,'expectedX'|'expectedY'|'expectedOrientation'|'supportFactor'>&({localOrdinal:number;roomSource?:never}|{roomSource:{roomOrdinal:number;index:number};localOrdinal?:never});
/** Check every footprint against the floor and all already staged siblings. */
export function indoorGroupTransfer(face:IndoorSurface|null,shapes:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>,rows:readonly CutWitness[],clip:readonly DesignClipItem[],x:number,y:number):IndoorTransferRow[]|null{
 const tree=indoorEditableTree(face);
 if(!tree||face?.kind!=='floor'||!face.terrain||!rows.length||rows.length!==clip.length||rows.length>ROOM_CUT_LIMIT||![x,y].every(Number.isSafeInteger))return null;
 const staged={...tree,objects:[...tree.objects]},out:IndoorTransferRow[]=[];
 for(let i=0;i<rows.length;i++){
  const r=rows[i],p=clip[i],px=x+p.dx*tree.factor/2,py=y+p.dy*tree.factor/2,orientation=CARDINAL_ORIENTATIONS[p.orientation];
  if(String(p.itemId)!==r.itemId||r.supportFactor&&(!r.roomSource||r.supportFactor!==tree.factor)||!orientation||!allowed.has(p.itemId)||!Number.isSafeInteger(px)||!Number.isSafeInteger(py)||!supportPlacementFits(staged,shapes,face.terrain,p.itemId,px,py,orientation))return null;
  out.push({itemId:p.itemId,x:px,y:py,orientation,expectedX:r.expectedX,expectedY:r.expectedY,expectedOrientation:r.expectedOrientation,...(r.supportFactor?{supportFactor:r.supportFactor}:{}),...(r.roomSource?{roomSource:r.roomSource}:{localOrdinal:r.localOrdinal})});
  staged.objects.push({itemId:p.itemId,x:px,y:py,orientation,child:null});
 }
 return out;
}
export function rotateIndoorCut(clip:readonly DesignClipItem[],factor:1|2|null,shapes:Readonly<Record<string,SourceObjectShape>>,delta:number){
 if(!factor)return null;
 const defs=new Map<number,Map<number,DesignItemGeometry>>();
 for(const p of clip){
  const g:DesignItemGeometry={itemId:p.itemId,name:null,layer:'furniture',surfaceCapable:false,shapes:Object.fromEntries([0,4,8,12].flatMap(code=>{const key=p.itemId+':'+code;return shapes[key]?[[key,shapes[key]]]:[];}))};
  defs.set(p.itemId,new Map([[factor,g]]));
 }
 return rotateFurnitureGroup(clip,defs,delta);
}
