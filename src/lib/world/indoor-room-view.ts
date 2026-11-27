/** Validate the small, local-only projection. A missing finish is not
 * silently converted to item zero. Native Grid IDs never reach the UI. */
export type IndoorGridStatus='full'|'unresolved'|'shared'|'diff';
export interface IndoorItem{itemId:number;quantity:number}
import type {SourceObjectShape} from "./source-object-map.ts";
import {CARDINAL_ORIENTATIONS,EIGHT_WAY_ORIENTATIONS,isCardinal,isEightWay,worldOrientationCode} from './saved-map-transform.ts';
import {ROOM_CUT_LIMIT,rotateFurnitureGroup,type CutWitness} from './group-paste.ts';
import type {DesignClipItem,DesignItemGeometry} from './design-layout.ts';
import {reflectedDesignItem,type DesignSymmetry} from './design-symmetry.ts';
import {sceneFromClip,parseSceneAnyFactor,convertSceneFactor,type ScenePreset} from './scene-preset.ts';
import {parseMixedScene,parseSupportScene,mixedSceneFromClip,mixedSceneCounts,supportSceneRootCounts,type MixedScenePreset,type SupportScene} from './support-scene.ts';
import {supportChildEdits,supportFreeEdit,supportPlacementFits,type SupportTree,type SupportChildEdit} from './subgrid-local.ts';
export interface IndoorPosition{itemId:number;x:number;y:number;orientationCode:0|2|4|6|8|10|12|14|null;plain?:true;protected?:true}
import type {TerrainRaster} from './terrain-binding.ts';
export interface IndoorSurface{kind:'floor'|'wall';ordinal:number;wallPosition:number|null;finish:number|null;gridStatus:IndoorGridStatus;items:IndoorItem[];positions:IndoorPosition[];factor:1|2|null;missingPositions:number;terrain?:TerrainRaster;sourcePath?:string}
export interface IndoorRoom{ordinal:number;house:number;houseItemId?:number;floor:number;roomSlot?:number;name:string;nameEditable?:true;appendFloorCount?:number;addRoomSlots?:number[];addRoomSizes?:string[];removeKind?:'room'|'floor';removeRecoverCount?:number;resize?:{current:string;options:string[];anchorOptions?:string[];recoveryOptions?:[string,number][]};ceiling:number|null;surfaces:IndoorSurface[]}
export function indoorHouseGroups(rooms:readonly IndoorRoom[]){
 const grouped=new Map<number,{house:number;itemId?:number;firstIndex:number;roomCount:number}>();
 for(let i=0;i<rooms.length;i++){
  const room=rooms[i],group=grouped.get(room.house);
  if(group){group.roomCount++;if(group.itemId!==room.houseItemId)delete group.itemId;}
  else grouped.set(room.house,{house:room.house,...(room.houseItemId===undefined?{}:{itemId:room.houseItemId}),firstIndex:i,roomCount:1});
 }
 return [...grouped.values()];
}
export function indoorFloorGroups(rooms:readonly IndoorRoom[],house:number){
 const groups=new Map<number,{floor:number;firstIndex:number;rooms:{r:IndoorRoom;i:number}[]}>();
 for(const [i,r] of rooms.entries()){if(r.house!==house)continue;const g=groups.get(r.floor);if(g)g.rooms.push({r,i});else groups.set(r.floor,{floor:r.floor,firstIndex:i,rooms:[{r,i}]});}
 return [...groups.values()].sort((a,b)=>a.floor-b.floor);
}
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const finish=(v:unknown):v is number|null=>v===null||integer(v,0,2147483647);
export function parseIndoorRooms(value:unknown):IndoorRoom[]{
 if(!record(value)||value.contract!=='wand.db05.indoor-rooms@1'||value.geometryVerified!==false||value.writerAuthorized!==false||!Array.isArray(value.rooms)||value.rooms.length>2048)throw Error('INDOOR_REPORT_INVALID');
 let total=0;const roomSlots=new Set<string>();
 return value.rooms.map((room,i)=>{
  if(!record(room)||room.nameEditable!==undefined&&room.nameEditable!==true||room.roomSlot!==undefined&&!integer(room.roomSlot,0,3)||Object.keys(room).some(k=>!['ordinal','house','houseItemId','floor','roomSlot','name','nameEditable','resize','appendFloorCount','addRoomSlots','addRoomSizes','removeKind','removeRecoverCount','ceiling','surfaces'].includes(k))||room.houseItemId!==undefined&&!integer(room.houseItemId,20500000,20599999)||room.ordinal!==i+1||!integer(room.house,1,128)||!integer(room.floor,1,128)||typeof room.name!=='string'||[...room.name].length>128||!finish(room.ceiling)||!Array.isArray(room.surfaces)||room.surfaces.length<1||room.surfaces.length>65)throw Error('INDOOR_ROOM_INVALID');
  if(typeof room.roomSlot==='number'){const address=room.house+':'+room.floor+':'+room.roomSlot;if(roomSlots.has(address))throw Error('INDOOR_ROOM_ADDRESS');roomSlots.add(address);}
  if(room.appendFloorCount!==undefined&&(!integer(room.appendFloorCount,1,127)||room.house!==1||room.houseItemId!==20500000||room.roomSlot!==0))throw Error('INDOOR_FLOOR_APPEND_INVALID');
  if(room.removeRecoverCount!==undefined&&(!integer(room.removeRecoverCount,1,2048)||!['room','floor'].includes(String(room.removeKind))))throw Error('INDOOR_REMOVE_COUNT_INVALID');
  const remove=room.removeKind;if(remove!==undefined&&(room.houseItemId!==20500000||!(remove==='floor'&&room.roomSlot===0&&typeof room.floor==='number'&&room.floor>1||remove==='room'&&integer(room.roomSlot,1,3))))throw Error('INDOOR_REMOVE_INVALID');
  const sizes=room.addRoomSizes;if((sizes===undefined)!==(room.addRoomSlots===undefined)||sizes!==undefined&&(!Array.isArray(sizes)||sizes.length<1||sizes.length>26||new Set(sizes).size!==sizes.length||sizes.some(n=>typeof n!=='string'||!/^\d{1,2}x\d{1,2}$/.test(n))))throw Error('INDOOR_ADD_SIZE_INVALID');
  const slots=room.addRoomSlots;if(slots!==undefined&&(!Array.isArray(slots)||slots.length<1||slots.length>3||new Set(slots).size!==slots.length||slots.some(n=>!integer(n,1,3))||room.houseItemId!==20500000||room.roomSlot!==0))throw Error('INDOOR_ADD_ROOM_INVALID');
  const resize=room.resize;if(resize!==undefined&&(!record(resize)||Object.keys(resize).some(k=>!["current","options","anchorOptions","recoveryOptions"].includes(k))||typeof resize.current!=='string'||!/^\d{1,2}x\d{1,2}$/.test(resize.current)||!Array.isArray(resize.options)||resize.options.length>26||new Set(resize.options).size!==resize.options.length||resize.options.some(n=>typeof n!=='string'||!/^\d{1,2}x\d{1,2}$/.test(n)||n===resize.current)||resize.anchorOptions!==undefined&&(!Array.isArray(resize.anchorOptions)||resize.anchorOptions.length<1||resize.anchorOptions.length+resize.options.length>26||new Set(resize.anchorOptions).size!==resize.anchorOptions.length||resize.anchorOptions.some(n=>typeof n!=='string'||!/^\d{1,2}x\d{1,2}$/.test(n)||n===resize.current||(resize.options as unknown[]).includes(n)))))throw Error('INDOOR_RESIZE_INVALID');
  if(record(resize)&&resize.recoveryOptions!==undefined){
   const a=resize.recoveryOptions;if(!Array.isArray(a)||a.length<1||a.length>26||a.some(v=>!Array.isArray(v)||v.length!==2||typeof v[0]!=='string'||!/^\d{1,2}x\d{1,2}$/.test(v[0])||v[0]===resize.current||!integer(v[1],1,2048)||(resize.options as unknown[]).includes(v[0])||Array.isArray(resize.anchorOptions)&&resize.anchorOptions.includes(v[0]))||new Set(a.map(v=>v[0])).size!==a.length||a.length+(resize.options as unknown[]).length+(Array.isArray(resize.anchorOptions)?resize.anchorOptions.length:0)>26)throw Error('INDOOR_RECOVER_INVALID');
  }
  const surfaces:IndoorSurface[]=room.surfaces.map((s,j)=>{
   if(!record(s)||!([9,10].includes(Object.keys(s).length))||Object.keys(s).length===10&&s.terrain===undefined||s.ordinal!==j+1||s.kind!==(j===0?'floor':'wall')||!(j===0?s.wallPosition===null:integer(s.wallPosition,-2147483648,2147483647))||!finish(s.finish)||!['full','unresolved','shared','diff'].includes(String(s.gridStatus))||!Array.isArray(s.items)||s.items.length>100000||s.gridStatus!=='full'&&s.items.length||!Array.isArray(s.positions)||s.positions.length>100000||!integer(s.missingPositions,0,100000)||!(s.factor===null||s.factor===1||s.factor===2))throw Error('INDOOR_SURFACE_INVALID');
   const seen=new Set<number>();
   const items:IndoorItem[]=s.items.map(p=>{if(!record(p)||Object.keys(p).length!==2||!integer(p.itemId,1,4294967295)||!integer(p.quantity,1,100000)||seen.has(p.itemId))throw Error('INDOOR_ITEM_INVALID');seen.add(p.itemId);total+=p.quantity;if(total>100000)throw Error('INDOOR_LIMIT');return {itemId:p.itemId,quantity:p.quantity};});
   const quantities=new Map<number,number>(items.map(p=>[p.itemId,p.quantity]));let count=0;
   const positions:IndoorPosition[]=s.positions.map(p=>{if(!record(p)||!(Object.keys(p).length===4||Object.keys(p).length===5&&(p.plain===true||p.protected===true))||Object.keys(p).some(k=>!['itemId','x','y','orientationCode','plain','protected'].includes(k))||!integer(p.itemId,1,4294967295)||!integer(p.x,-1000000,1000000)||!integer(p.y,-1000000,1000000)||!(p.orientationCode===null||[0,2,4,6,8,10,12,14].includes(p.orientationCode as number))||(quantities.get(p.itemId)??0)<1)throw Error('INDOOR_POSITION_INVALID');quantities.set(p.itemId,quantities.get(p.itemId)!-1);count++;return {itemId:p.itemId,x:p.x,y:p.y,orientationCode:p.orientationCode as IndoorPosition['orientationCode'],...(p.plain===true?{plain:true as const}:{}),...(p.protected===true?{protected:true as const}:{})};});
   if([...quantities.values()].reduce((a,b)=>a+b,0)!==s.missingPositions||s.gridStatus!=='full'&&(count||s.missingPositions||s.factor!==null))throw Error('INDOOR_POSITION_COUNT');
   let terrain:TerrainRaster|undefined,sourcePath:string|undefined;
   if(s.terrain!==undefined){
    const t=s.terrain;if(s.gridStatus!=='full'||!s.factor||!record(t)||!integer(t.sizeX,1,256)||!integer(t.sizeY,1,256)||!Array.isArray(t.values)||t.values.length!==t.sizeX*t.sizeY||!t.values.every(v=>integer(v,0,0xffffffff)))throw Error('INDOOR_TERRAIN_INVALID');
    terrain={sizeX:t.sizeX,sizeY:t.sizeY,nativeFloorValues:Uint32Array.from(t.values)};
    if(t.sourcePath!==undefined){if(typeof t.sourcePath!=='string'||!/^GridData\/Rooms\/(Room|Wall)[0-9]+x[0-9]+-GridData\.json$/.test(t.sourcePath)||!t.sourcePath.startsWith(s.kind==='floor'?'GridData/Rooms/Room':'GridData/Rooms/Wall'))throw Error('INDOOR_TERRAIN_PATH');sourcePath=t.sourcePath;}
   }
   return {kind:s.kind as 'floor'|'wall',ordinal:j+1,wallPosition:s.wallPosition as number|null,finish:s.finish,gridStatus:s.gridStatus as IndoorGridStatus,items,positions,factor:s.factor as 1|2|null,missingPositions:s.missingPositions,...(terrain?{terrain}:{}),...(sourcePath?{sourcePath}:{})};
  });
  return {ordinal:i+1,house:room.house,...(typeof room.houseItemId==='number'?{houseItemId:room.houseItemId}:{}),floor:room.floor,...(typeof room.roomSlot==='number'?{roomSlot:room.roomSlot}:{}),name:room.name,...(room.nameEditable===true?{nameEditable:true as const}:{}),...(resize?{resize:resize as IndoorRoom['resize']}:{}),...(typeof room.appendFloorCount==='number'?{appendFloorCount:room.appendFloorCount}:{}),...(slots?{addRoomSlots:slots as number[],addRoomSizes:sizes as string[]}:{}),...(remove==='room'||remove==='floor'?{removeKind:remove,...(typeof room.removeRecoverCount==='number'?{removeRecoverCount:room.removeRecoverCount}:{})}:{}),ceiling:room.ceiling,surfaces};
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

export interface IndoorPickup{index:number;itemId:number;expectedX:number;expectedY:number;expectedOrientation:string;expectedStock:number;includeSupport?:true}
export function indoorEditableTree(face:IndoorSurface|null):SupportTree|null{
 if(!face||face.gridStatus!=='full'||!face.factor||face.missingPositions||face.positions.length>5000)return null;
 return {factor:face.factor,sourcePath:null,objects:face.positions.map(p=>({itemId:p.itemId,x:p.x,y:p.y,orientation:p.orientationCode===null?'Unknown':EIGHT_WAY_ORIENTATIONS[p.orientationCode/2],child:null}))};
}
function indoorShape(o:SupportTree['objects'][number],shapes:Readonly<Record<string,SourceObjectShape>>){
 return shapes[o.itemId+':'+(worldOrientationCode(o.orientation)??-4)];
}
export function indoorHitIndices(tree:SupportTree,shapes:Readonly<Record<string,SourceObjectShape>>,x:number,y:number):number[]{
 if(!Number.isSafeInteger(x)||!Number.isSafeInteger(y))return [];
 return tree.objects.flatMap((o,i)=>indoorShape(o,shapes)?.runs.some(run=>y===o.y+run.y&&x>=o.x+run.x&&x<o.x+run.x+run.width)?[i]:[]);
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
export function indoorPickup(face:IndoorSurface|null,index:number,removable:ReadonlySet<number>,stock:ReadonlyMap<number,number>,free=false):IndoorPickup|null{
 const t=indoorEditableTree(face),o=t?.objects[index];if(!t||!o||face?.positions[index]?.protected||Math.floor(o.itemId/100000)!==400||!removable.has(o.itemId)||!(free?indoorFreeFloor(face)&&face?.positions[index]?.plain===true&&isEightWay(o.orientation):isCardinal(o.orientation)&&t.objects.filter(p=>p.x===o.x&&p.y===o.y).length===1))return null;
 const n=stock.get(o.itemId);if(n===undefined||n>=2147483647)return null;
 return {index,itemId:o.itemId,expectedX:o.x,expectedY:o.y,expectedOrientation:o.orientation,expectedStock:n};
}
export function indoorGroupPickup(face:IndoorSurface|null,indices:readonly number[],removable:ReadonlySet<number>,stock:ReadonlyMap<number,number>,supports:ReadonlySet<number>=new Set(),free=false):IndoorPickup[]|null{
 if(!indices.length||indices.length>ROOM_CUT_LIMIT||new Set(indices).size!==indices.length)return null;
 const counts=new Map<number,number>(),rows:IndoorPickup[]=[];
 for(const index of indices){const row=indoorPickup(face,index,removable,stock,free&&!supports.has(index));if(!row)return null;
  const count=(counts.get(row.itemId)??0)+1;if(row.expectedStock+count>2147483647)return null;
  counts.set(row.itemId,count);rows.push(supports.has(index)?{...row,includeSupport:true}:row);
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
/** Free room editing is limited to known, stateless furniture on an owned floor. */
export function indoorFreeFloor(face:IndoorSurface|null):boolean{return !!face&&face.kind==='floor'&&face.gridStatus==='full'&&!!face.factor&&!!face.terrain&&face.sourcePath?.startsWith('GridData/Rooms/Room')===true;}
function freeRoomPose(face:IndoorSurface|null,shapes:Readonly<Record<string,SourceObjectShape>>,itemId:number,x:number,y:number,orientation:string):boolean{
 if(!indoorFreeFloor(face)||!face?.terrain||!face.factor||Math.floor(itemId/100000)!==400||!isEightWay(orientation)||!isCardinal(orientation)&&face.factor!==1||![x,y].every(Number.isSafeInteger)||x<0||y<0||x>=face.terrain.sizeX*face.factor||y>=face.terrain.sizeY*face.factor)return false;
 const shape=shapes[itemId+':'+worldOrientationCode(orientation)];return !!shape&&shape.cellCount>0&&shape.cellCount<=65536;
}
export function indoorFreeTransform(face:IndoorSurface|null,shapes:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>,index:number,x:number,y:number,orientation?:string):SupportChildEdit[]|null{
 const t=indoorEditableTree(face),o=t?.objects[index],next=orientation??o?.orientation;
 if(!o||!next||face?.positions[index]?.plain!==true||!allowed.has(o.itemId)||!isEightWay(o.orientation)||!freeRoomPose(face,shapes,o.itemId,x,y,next)||x===o.x&&y===o.y&&next===o.orientation)return null;
 return [{index,itemId:o.itemId,expectedX:o.x,expectedY:o.y,expectedOrientation:o.orientation,x,y,orientation:next}];
}
export function indoorFreeRotate(face:IndoorSurface|null,shapes:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>,index:number,turn:-1|1){
 const p=face?.positions[index];if(!p||p.orientationCode===null)return null;
 const step=face?.factor===1?1:2,orientation=EIGHT_WAY_ORIENTATIONS[(p.orientationCode/2+turn*step+8)%8];
 return indoorFreeTransform(face,shapes,allowed,index,p.x,p.y,orientation);
}
export function indoorFreeMoveGroup(face:IndoorSurface|null,shapes:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>,indices:readonly number[],anchor:number,x:number,y:number):SupportChildEdit[]|null{
 const t=indoorEditableTree(face),o=t?.objects[anchor];if(!o||!indices.includes(anchor)||!indices.length||indices.length>ROOM_CUT_LIMIT||new Set(indices).size!==indices.length)return null;
 const rows=indices.map(i=>{const p=t!.objects[i];return p?indoorFreeTransform(face,shapes,allowed,i,p.x+x-o.x,p.y+y-o.y):null;});
 return rows.some(r=>!r)?null:rows.flatMap(r=>r!);
}
/** Group turns use the common quarter-turn footprint transform even when
 * individual furniture is on a diagonal. Free mode relaxes collision only. */
export function indoorFreeGroupRotate(face:IndoorSurface|null,shapes:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>,indices:readonly number[],turn:-1|1):SupportChildEdit[]|null{
 const tree=indoorEditableTree(face);if(!tree||!indoorFreeFloor(face)||indices.length<2||indices.length>ROOM_CUT_LIMIT||new Set(indices).size!==indices.length||(turn!==1&&turn!==-1))return null;
 const chosen=indices.map(i=>tree.objects[i]);if(chosen.some((o,j)=>!o||face?.positions[indices[j]]?.plain!==true||!allowed.has(o.itemId)||!freeRoomPose(face,shapes,o.itemId,o.x,o.y,o.orientation)))return null;
 const left=Math.min(...chosen.map(o=>o.x)),top=Math.min(...chosen.map(o=>o.y));
 const clip=chosen.map(o=>({itemId:o.itemId,dx:(o.x-left)*2/tree.factor,dy:(o.y-top)*2/tree.factor,orientation:worldOrientationCode(o.orientation)!/4}));
 const rotated=rotateIndoorCut(clip,tree.factor,shapes,turn);if(!rotated)return null;
 const rows=rotated.map((p,i)=>p.itemId===chosen[i].itemId?indoorFreeTransform(face,shapes,allowed,indices[i],left+p.dx*tree.factor/2,top+p.dy*tree.factor/2,EIGHT_WAY_ORIENTATIONS[p.orientation*2]):null);
 return rows.some(r=>!r)?null:rows.flatMap(r=>r!);
}
export function indoorMove(face:IndoorSurface|null,shapes:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>,index:number,x:number,y:number,orientation?:string,free=false){
 if(free)return indoorFreeTransform(face,shapes,allowed,index,x,y,orientation);
 const t=indoorEditableTree(face),o=t?.objects[index];return t&&o&&face?.terrain?supportFreeEdit(t,shapes,allowed,face.terrain,index,x,y,orientation??o.orientation):null;
}
/** Translate selected native records together; their old cells may be reused.
 * The final footprints must fit the original room and all stationary objects. */
export function indoorGroupMove(face:IndoorSurface|null,shapes:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>,indices:readonly number[],anchor:number,x:number,y:number,free=false):SupportChildEdit[]|null{
 if(free)return indoorFreeMoveGroup(face,shapes,allowed,indices,anchor,x,y);
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
export type IndoorAlignMode='left'|'right'|'top'|'bottom'|'centerX'|'centerY'|'spaceX'|'spaceY';
export function indoorAlign(face:IndoorSurface|null,shapes:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>,indices:readonly number[],mode:IndoorAlignMode,free=false):SupportChildEdit[]|null{
 const tree=indoorEditableTree(face),selected=new Set(indices);
 if(!tree||!face?.terrain||indices.length<2||indices.length>ROOM_CUT_LIMIT||selected.size!==indices.length)return null;
 if(free&&!indoorFreeFloor(face))return null;
 const horizontal=['left','right','centerX','spaceX'].includes(mode);
 const chosen=indices.map(index=>{const o=tree.objects[index],code=o?(free?worldOrientationCode(o.orientation):CARDINAL_ORIENTATIONS.indexOf(o.orientation as typeof CARDINAL_ORIENTATIONS[number])*4):-4,s=o?shapes[o.itemId+':'+code]:null;return o&&s&&s.runs.length&&allowed.has(o.itemId)&&(free?face.positions[index]?.plain===true&&freeRoomPose(face,shapes,o.itemId,o.x,o.y,o.orientation):indoorClear(tree,shapes,index))?{index,o,start:horizontal?o.x:o.y,size:horizontal?s.width:s.height}:null;});
 if(chosen.some(p=>!p))return null;
 const rows=chosen.filter(p=>p!==null),lo=Math.min(...rows.map(p=>p.start)),hi=Math.max(...rows.map(p=>p.start+p.size));
 const starts=new Map<number,number>();
 if(mode==='spaceX'||mode==='spaceY'){
  if(rows.length<3)return null;const ordered=[...rows].sort((a,b)=>a.start-b.start||a.index-b.index),gap=(hi-lo-ordered.reduce((n,p)=>n+p.size,0))/(ordered.length-1);if(gap<0||!Number.isInteger(gap))return null;
  let pos=lo;for(const p of ordered){starts.set(p.index,pos);pos+=p.size+gap;}
 }else for(const p of rows){const pos=mode==='left'||mode==='top'?lo:mode==='right'||mode==='bottom'?hi-p.size:(lo+hi-p.size)/2;if(!Number.isSafeInteger(pos))return null;starts.set(p.index,pos);}
 const staged={...tree,objects:tree.objects.filter((_,i)=>!selected.has(i))},out:SupportChildEdit[]=[];
 for(const {o,index} of rows){const start=starts.get(index)!,x=horizontal?start:o.x,y=horizontal?o.y:start;
  if(!(free?freeRoomPose(face,shapes,o.itemId,x,y,o.orientation):supportPlacementFits(staged,shapes,face.terrain,o.itemId,x,y,o.orientation)))return null;
  if(x!==o.x||y!==o.y){const q=free?indoorFreeTransform(face,shapes,allowed,index,x,y):supportFreeEdit({...tree,objects:[o]},shapes,allowed,face.terrain,0,x,y,o.orientation);if(!q)return null;out.push({...q[0],index});}
  staged.objects.push({...o,x,y});
 }
 return out.length?out:null;
}
export function indoorSymmetricDuplicate(face:IndoorSurface|null,shapes:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>,stock:ReadonlyMap<number,number>,indices:readonly number[],axis:DesignSymmetry,supports:ReadonlyMap<number,SupportScene>=new Map(),free=false):IndoorPlace[]|null{
 const tree=indoorEditableTree(face);if(!tree||!face?.terrain||!indices.length||indices.length>ROOM_CUT_LIMIT||new Set(indices).size!==indices.length||free&&(!indoorFreeFloor(face)||supports.size>0))return null;
 const clip:DesignClipItem[]=[],seen=new Set<string>(),scenes:(SupportScene|null)[]=[],sources:(NonNullable<IndoorPlace['supportSource']>|null)[]=[];
 for(const i of indices){const o=tree.objects[i],support=supports.get(i);if(!o||(!support&&face.positions[i]?.plain!==true)||support&&(axis.mode!=='point'||support.ownerItemId!==o.itemId)||!allowed.has(o.itemId)||!(free?freeRoomPose(face,shapes,o.itemId,o.x,o.y,o.orientation):indoorClear(tree,shapes,i)&&isCardinal(o.orientation)))return null;
  const g:DesignItemGeometry={itemId:o.itemId,name:null,layer:'furniture',surfaceCapable:false,shapes};
  const p=reflectedDesignItem({itemId:o.itemId,x:o.x,y:o.y,orientation:worldOrientationCode(o.orientation)!/4},g,axis,free&&tree.factor===1);if(!p||p.x<0||p.y<0)return null;
  const same=tree.objects.map((v,index)=>({v,index})).filter(({v})=>v.itemId===p.itemId&&v.x===p.x&&v.y===p.y&&v.orientation===EIGHT_WAY_ORIENTATIONS[p.orientation*2]);
  if(same.length){if(support||same.length!==1||face.positions[same[0].index]?.plain!==true)return null;continue;}
  const k=p.itemId+':'+p.x+':'+p.y+':'+p.orientation;if(seen.has(k))continue;seen.add(k);
  clip.push({itemId:p.itemId,dx:p.x*2/tree.factor,dy:p.y*2/tree.factor,orientation:p.orientation});
  scenes.push(support??null);sources.push(support?{index:i,expectedX:o.x,expectedY:o.y,expectedOrientation:o.orientation}:null);
 }
 if(!clip.length)return null;
 if(!scenes.some(Boolean))return indoorGroupPlace(face,shapes,allowed,stock,clip,0,0,free);
 const left=Math.min(...clip.map(p=>p.dx)),top=Math.min(...clip.map(p=>p.dy));
 try{const relative=clip.map(p=>({...p,dx:p.dx-left,dy:p.dy-top})),doc=mixedSceneFromClip(relative,scenes,'corner');return indoorMixedPlacement(face,shapes,allowed,stock,relative,doc,'corner',left*tree.factor/2,top*tree.factor/2,sources);}catch{return null;}
}
/** Translate exact reflected plain pairs together. No guessed counterpart,
 * no implicit duplication and no change to saved orientations. */
export function indoorLinkedMove(face:IndoorSurface|null,shapes:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>,indices:readonly number[],anchor:number,x:number,y:number,axis:DesignSymmetry,free=false):SupportChildEdit[]|null{
 const tree=indoorEditableTree(face),origin=tree?.objects[anchor];if(!tree||!face?.terrain||free&&!indoorFreeFloor(face)||!origin||!indices.includes(anchor)||!indices.length||new Set(indices).size!==indices.length)return null;
 const dx=x-origin.x,dy=y-origin.y;if(!dx&&!dy)return null;
 const targets=new Map<number,{x:number;y:number}>();
 function put(i:number,px:number,py:number){const old=targets.get(i);if(old)return old.x===px&&old.y===py;targets.set(i,{x:px,y:py});return true;}
 for(const i of indices){const o=tree.objects[i];if(!o||face.positions[i]?.plain!==true||!allowed.has(o.itemId)||!(free?freeRoomPose(face,shapes,o.itemId,o.x,o.y,o.orientation):indoorClear(tree,shapes,i)&&isCardinal(o.orientation)))return null;
  const g:DesignItemGeometry={itemId:o.itemId,name:null,layer:'furniture',surfaceCapable:false,shapes};
  const p={itemId:o.itemId,x:o.x,y:o.y,orientation:worldOrientationCode(o.orientation)!/4},before=reflectedDesignItem(p,g,axis,free&&face.factor===1),after=reflectedDesignItem({...p,x:p.x+dx,y:p.y+dy},g,axis,free&&face.factor===1);
  if(!before||!after)return null;const matches=tree.objects.flatMap((v,j)=>v.itemId===before.itemId&&v.x===before.x&&v.y===before.y&&v.orientation===EIGHT_WAY_ORIENTATIONS[before.orientation*2]?[j]:[]);
  if(matches.length!==1||matches[0]===i||face.positions[matches[0]]?.plain!==true||!(free?freeRoomPose(face,shapes,tree.objects[matches[0]].itemId,tree.objects[matches[0]].x,tree.objects[matches[0]].y,tree.objects[matches[0]].orientation):indoorClear(tree,shapes,matches[0]))||!put(i,o.x+dx,o.y+dy)||!put(matches[0],after.x,after.y))return null;
 }
 if(targets.size>ROOM_CUT_LIMIT||targets.size%2!==0)return null;
 const staged={...tree,objects:tree.objects.filter((_,i)=>!targets.has(i))},out:SupportChildEdit[]=[];
 for(const [i,p] of targets){const o=tree.objects[i],q=free?indoorFreeTransform(face,shapes,allowed,i,p.x,p.y,o.orientation):supportFreeEdit({...tree,objects:[o]},shapes,allowed,face.terrain,0,p.x,p.y,o.orientation);if(!q||!free&&!supportPlacementFits(staged,shapes,face.terrain,o.itemId,p.x,p.y,o.orientation))return null;out.push({...q[0],index:i});staged.objects.push({...o,...p});}
 return out;
}
/** Rotate the selected native group and its exact reflected partners. The
 * original anchors are checked before either side is staged. */
export function indoorLinkedRotate(face:IndoorSurface|null,shapes:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>,indices:readonly number[],turn:-1|1,axis:DesignSymmetry,free=false):SupportChildEdit[]|null{
 const tree=indoorEditableTree(face);if(!tree||!face?.terrain||free&&!indoorFreeFloor(face)||!indices.length||indices.length>ROOM_CUT_LIMIT||new Set(indices).size!==indices.length||![-1,1].includes(turn))return null;
 const chosen=indices.map(i=>tree.objects[i]);if(chosen.some((o,j)=>!o||face.positions[indices[j]]?.plain!==true||!allowed.has(o.itemId)||!(free?freeRoomPose(face,shapes,o.itemId,o.x,o.y,o.orientation):isCardinal(o.orientation)&&indoorClear(tree,shapes,indices[j]))))return null;
 const left=Math.min(...chosen.map(o=>o.x)),top=Math.min(...chosen.map(o=>o.y));
 const clip=chosen.map(o=>({itemId:o.itemId,dx:(o.x-left)*2/tree.factor,dy:(o.y-top)*2/tree.factor,orientation:worldOrientationCode(o.orientation)!/4}));
 const rotated=indices.length===1?[{...clip[0],orientation:(clip[0].orientation+turn+4)%4}]:rotateIndoorCut(clip,tree.factor,shapes,turn);if(!rotated)return null;
 const targets=new Map<number,{x:number;y:number;orientation:string}>();
 function put(i:number,p:{x:number;y:number;orientation:number}){const q={x:p.x,y:p.y,orientation:EIGHT_WAY_ORIENTATIONS[p.orientation*2]},old=targets.get(i);if(!q.orientation)return false;if(old)return old.x===q.x&&old.y===q.y&&old.orientation===q.orientation;targets.set(i,q);return true;}
 for(let j=0;j<indices.length;j++){
  const i=indices[j],o=chosen[j],p=rotated[j];if(p.itemId!==o.itemId)return null;
  const g:DesignItemGeometry={itemId:o.itemId,name:null,layer:'furniture',surfaceCapable:false,shapes};
  const before=reflectedDesignItem({itemId:o.itemId,x:o.x,y:o.y,orientation:clip[j].orientation},g,axis,free&&face.factor===1),next={itemId:o.itemId,x:left+p.dx*tree.factor/2,y:top+p.dy*tree.factor/2,orientation:p.orientation},after=reflectedDesignItem(next,g,axis,free&&face.factor===1);
  if(!before||!after)return null;
  const matches=tree.objects.flatMap((v,k)=>v.itemId===before.itemId&&v.x===before.x&&v.y===before.y&&v.orientation===EIGHT_WAY_ORIENTATIONS[before.orientation*2]?[k]:[]);
  if(matches.length!==1||matches[0]===i||face.positions[matches[0]]?.plain!==true||!(free?freeRoomPose(face,shapes,tree.objects[matches[0]].itemId,tree.objects[matches[0]].x,tree.objects[matches[0]].y,tree.objects[matches[0]].orientation):indoorClear(tree,shapes,matches[0]))||!put(i,next)||!put(matches[0],after))return null;
 }
 if(targets.size>ROOM_CUT_LIMIT||targets.size%2!==0)return null;
 const staged={...tree,objects:tree.objects.filter((_,i)=>!targets.has(i))},out:SupportChildEdit[]=[];
 for(const [i,p] of targets){const o=tree.objects[i],q=free?indoorFreeTransform(face,shapes,allowed,i,p.x,p.y,p.orientation):supportFreeEdit({...tree,objects:[o]},shapes,allowed,face.terrain,0,p.x,p.y,p.orientation);if(!q||!free&&!supportPlacementFits(staged,shapes,face.terrain,o.itemId,p.x,p.y,p.orientation))return null;out.push({...q[0],index:i});staged.objects.push({...o,...p});}
 return out;
}
/** Both sides of a new ordinary furniture placement share one stock
 * reservation and one collision/terrain validation. */
export function indoorLinkedPlacement(face:IndoorSurface|null,shapes:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>,stock:ReadonlyMap<number,number>,clip:readonly DesignClipItem[],anchor:ScenePreset['anchor'],x:number,y:number,axis:DesignSymmetry,free=false):IndoorPlace[]|null{
 if(!face?.factor||!clip.length)return null;
 const original=indoorScenePlacement(face,shapes,allowed,stock,clip,anchor,x,y,free);if(!original)return null;
 const poses:DesignClipItem[]=[],seen=new Map<string,string>();
 function add(p:{itemId:number;x:number;y:number;orientation:number}){if(p.x<0||p.y<0)return false;const value=p.itemId+':'+p.orientation,key=p.x+':'+p.y+(free?':'+value:''),old=seen.get(key);if(old!==undefined)return old===value;seen.set(key,value);poses.push({itemId:p.itemId,dx:p.x*2/face!.factor!,dy:p.y*2/face!.factor!,orientation:p.orientation});return true;}
 for(const row of original){const p={itemId:row.itemId,x:row.x,y:row.y,orientation:worldOrientationCode(row.orientation)!/4},g:DesignItemGeometry={itemId:p.itemId,name:null,layer:'furniture',surfaceCapable:false,shapes};const q=reflectedDesignItem(p,g,axis,free&&face.factor===1);if(!q||!add(p)||!add(q))return null;}
 return indoorGroupPlace(face,shapes,allowed,stock,poses,0,0,free);
}
export const indoorLinkedWords={ja:['対称連動移動','軸・中心を指定','連動を解除'],en:['Linked symmetry move','Choose axis or center','Unlink'],fr:['Déplacement symétrique lié','Choisir axe ou centre','Dissocier'],it:['Spostamento simmetrico collegato','Scegli asse o centro','Scollega'],de:['Gekoppelte Symmetriebewegung','Achse oder Mittelpunkt wählen','Entkoppeln'],'es-ES':['Movimiento simétrico vinculado','Elegir eje o centro','Desvincular'],'zh-CN':['对称联动移动','选择轴或中心','解除联动'],'pt-BR':['Movimento simétrico vinculado','Escolher eixo ou centro','Desvincular']} as const;
export const indoorAlignWords={
 ja:['左揃え','右揃え','上揃え','下揃え','左右中央','上下中央','横方向等間隔','縦方向等間隔','左右対称','上下対称','点対称','対称軸・中心を指定'],
 en:['Align left','Align right','Align top','Align bottom','Center horizontally','Center vertically','Space horizontally','Space vertically','Vertical symmetry','Horizontal symmetry','Point symmetry','Choose symmetry axis or center'],
 fr:['Aligner à gauche','Aligner à droite','Aligner en haut','Aligner en bas','Centrer horizontalement','Centrer verticalement','Espacer horizontalement','Espacer verticalement','Symétrie verticale','Symétrie horizontale','Symétrie centrale','Choisir axe ou centre'],
 it:['Allinea a sinistra','Allinea a destra','Allinea in alto','Allinea in basso','Centra orizzontalmente','Centra verticalmente','Distribuisci in orizzontale','Distribuisci in verticale','Simmetria verticale','Simmetria orizzontale','Simmetria centrale','Scegli asse o centro'],
 de:['Links ausrichten','Rechts ausrichten','Oben ausrichten','Unten ausrichten','Horizontal zentrieren','Vertikal zentrieren','Horizontal verteilen','Vertikal verteilen','Vertikale Symmetrie','Horizontale Symmetrie','Punktsymmetrie','Achse oder Mittelpunkt wählen'],
 'es-ES':['Alinear a la izquierda','Alinear a la derecha','Alinear arriba','Alinear abajo','Centrar horizontalmente','Centrar verticalmente','Distribuir horizontalmente','Distribuir verticalmente','Simetría vertical','Simetría horizontal','Simetría central','Elegir eje o centro'],
 'zh-CN':['左对齐','右对齐','上对齐','下对齐','水平居中','垂直居中','水平等距','垂直等距','左右对称','上下对称','中心对称','选择对称轴或中心'],
 'pt-BR':['Alinhar à esquerda','Alinhar à direita','Alinhar acima','Alinhar abaixo','Centralizar horizontalmente','Centralizar verticalmente','Distribuir horizontalmente','Distribuir verticalmente','Simetria vertical','Simetria horizontal','Simetria central','Escolher eixo ou centro']
} as const;
export const indoorGroupMoveWords={ja:'選択した家具を一括移動',en:'Move selected furniture',fr:'Déplacer les meubles sélectionnés',it:'Sposta mobili selezionati',de:'Ausgewählte Möbel verschieben','es-ES':'Mover muebles seleccionados','zh-CN':'移动所选家具','pt-BR':'Mover móveis selecionados'} as const;

export function indoorPlace(face:IndoorSurface|null,shapes:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>,stock:ReadonlyMap<number,number>,itemId:number,x:number,y:number,orientation:string,free=false):IndoorPlace|null{
 const t=indoorEditableTree(face),n=stock.get(itemId);return t&&face?.terrain&&n!==undefined&&n>0&&allowed.has(itemId)&&(free?freeRoomPose(face,shapes,itemId,x,y,orientation):supportPlacementFits(t,shapes,face.terrain,itemId,x,y,orientation))?{itemId,expectedStock:n,x,y,orientation}:null;
}
/** Copy only layout poses; the original objects remain in place and all
 * new records must fit the actual room and available furniture stock. */
export function indoorDuplicateClip(face:IndoorSurface|null,indices:readonly number[],shapes:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>,stock:ReadonlyMap<number,number>,free=false):DesignClipItem[]|null{
 const tree=indoorEditableTree(face);
 if(!tree||!face?.terrain||!indices.length||indices.length>ROOM_CUT_LIMIT||new Set(indices).size!==indices.length)return null;
 const counts=new Map<number,number>(),clip:DesignClipItem[]=[];
 for(const i of indices){
  const o=tree.objects[i];if(!o||!(free?face.positions[i]?.plain===true&&freeRoomPose(face,shapes,o.itemId,o.x,o.y,o.orientation):isCardinal(o.orientation)&&indoorClear(tree,shapes,i))||Math.floor(o.itemId/100000)!==400||!allowed.has(o.itemId))return null;
  const count=(counts.get(o.itemId)??0)+1;if(count>(stock.get(o.itemId)??0))return null;counts.set(o.itemId,count);
  clip.push({itemId:o.itemId,dx:o.x*2/tree.factor,dy:o.y*2/tree.factor,orientation:(worldOrientationCode(o.orientation)??-4)/4});
 }
 const x=Math.min(...clip.map(p=>p.dx)),y=Math.min(...clip.map(p=>p.dy));return clip.map(p=>({...p,dx:p.dx-x,dy:p.dy-y}));
}
export function indoorGroupPlace(face:IndoorSurface|null,shapes:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>,stock:ReadonlyMap<number,number>,clip:readonly DesignClipItem[],x:number,y:number,free=false):IndoorPlace[]|null{
 const tree=indoorEditableTree(face);
 if(!tree||!face?.terrain||!clip.length||clip.length>ROOM_CUT_LIMIT||tree.objects.length+clip.length>512||![x,y].every(Number.isSafeInteger))return null;
 const staged={...tree,objects:[...tree.objects]},counts=new Map(stock),rows:IndoorPlace[]=[];
 for(const p of clip){
  const px=x+p.dx*tree.factor/2,py=y+p.dy*tree.factor/2,orientation=EIGHT_WAY_ORIENTATIONS[p.orientation*2],n=counts.get(p.itemId);
  if(!Number.isSafeInteger(p.dx)||!Number.isSafeInteger(p.dy)||p.dx<0||p.dy<0||!orientation||!allowed.has(p.itemId)||n===undefined||n<1||!(free?freeRoomPose(face,shapes,p.itemId,px,py,orientation):supportPlacementFits(staged,shapes,face.terrain,p.itemId,px,py,orientation)))return null;
  rows.push({itemId:p.itemId,x:px,y:py,orientation,expectedStock:n});counts.set(p.itemId,n-1);staged.objects.push({itemId:p.itemId,x:px,y:py,orientation,child:null});
 }
 return rows;
}
/** Existing portable Wand Scene format, not a whole-room backup.
 * Require a positive leaf-record witness; never silently drop saved state. */
export function captureIndoorScene(face:IndoorSurface|null,indices:readonly number[],shapes:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>,free=false):ScenePreset|null{
 const tree=indoorEditableTree(face);
 if(!tree||!face?.terrain||!face.factor||!indices.length||indices.length>ROOM_CUT_LIMIT||new Set(indices).size!==indices.length)return null;
 const clip:DesignClipItem[]=[];
 for(const i of indices){
  const o=tree.objects[i];if(!o||face.positions[i]?.plain!==true||!(free?freeRoomPose(face,shapes,o.itemId,o.x,o.y,o.orientation):isCardinal(o.orientation)&&indoorClear(tree,shapes,i))||Math.floor(o.itemId/100000)!==400||!allowed.has(o.itemId))return null;
  clip.push({itemId:o.itemId,dx:o.x,dy:o.y,orientation:(worldOrientationCode(o.orientation)??-4)/4});
 }
 const x=Math.min(...clip.map(p=>p.dx)),y=Math.min(...clip.map(p=>p.dy));
 try{return sceneFromClip(clip.map(p=>({...p,dx:p.dx-x,dy:p.dy-y})),face.factor,'corner');}catch{return null;}
}
/** Portable root poses use the common half-cell lattice. */
export function indoorMixedScene(text:string):MixedScenePreset|null{
 try{return parseMixedScene(text);}catch{try{const scene=parseSupportScene(text);return mixedSceneFromClip([{itemId:scene.ownerItemId,dx:0,dy:0,orientation:2}],[scene],'corner');}catch{return null;}}
}
export function indoorMixedPlacement(face:IndoorSurface|null,shapes:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>,stock:ReadonlyMap<number,number>,clip:readonly DesignClipItem[],doc:MixedScenePreset,anchor:ScenePreset['anchor'],x:number,y:number,sources:readonly (NonNullable<IndoorPlace['supportSource']>|null)[]|null=null):IndoorPlace[]|null{
 if(clip.length!==doc.items.length||clip.some((p,i)=>p.itemId!==doc.items[i].itemId)||sources&&(sources.length!==clip.length||sources.some((s,i)=>!!s!==!!doc.items[i].support))||[...mixedSceneCounts(doc.items)].some(([id,n])=>(stock.get(id)??0)<n))return null;
 const rows=indoorScenePlacement(face,shapes,allowed,stock,clip,anchor,x,y);if(!rows)return null;
 const counts=new Map(stock);
 return rows.map((row,i)=>{const scene=doc.items[i].support,expectedStock=counts.get(row.itemId)!;for(const [id,n] of scene?supportSceneRootCounts(scene):new Map([[row.itemId,1]]))counts.set(id,counts.get(id)!-n);return {...row,expectedStock,...(scene?sources?{supportSource:sources[i]!}:{scene}:{})};});
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
export function indoorSceneClip(text:string,factor:1|2,free=false):{clip:DesignClipItem[];anchor:ScenePreset['anchor']}{
 const scene=convertSceneFactor(parseSceneAnyFactor(text),factor);
 if(!scene||scene.items.length>ROOM_CUT_LIMIT||scene.items.some(p=>Math.floor(p.itemId/100000)!==400||!Number.isInteger(p.orientation)&&(!free||factor!==1)))throw Error('INDOOR_SCENE_UNSUPPORTED');
 return {clip:scene.items.map(p=>({...p,dx:p.dx*2/factor,dy:p.dy*2/factor})),anchor:scene.anchor};
}
export function indoorScenePlacement(face:IndoorSurface|null,shapes:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>,stock:ReadonlyMap<number,number>,clip:readonly DesignClipItem[],anchor:ScenePreset['anchor'],x:number,y:number,free=false){
 if(!face?.factor)return null;
 if(anchor==='center'){
  let width=0,height=0;
  for(const p of clip){const s=shapes[p.itemId+':'+p.orientation*4];if(!s)return null;width=Math.max(width,p.dx*face.factor/2+s.width);height=Math.max(height,p.dy*face.factor/2+s.height);}
  x-=Math.floor((width-1)/2);y-=Math.floor((height-1)/2);
 }
 return indoorGroupPlace(face,shapes,allowed,stock,clip,x,y,free);
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
export function captureIndoorCut(face:IndoorSurface|null,roomOrdinal:number,indices:readonly number[],shapes:Readonly<Record<string,SourceObjectShape>>,editable:ReadonlySet<number>,removable:ReadonlySet<number>,supportIndices:ReadonlySet<number>=new Set(),free=false):{rows:CutWitness[];clip:DesignClipItem[]}|null{
 const t=indoorEditableTree(face);
 if(!t||face?.kind!=='floor'||!face.terrain||!Number.isSafeInteger(roomOrdinal)||roomOrdinal<1||!indices.length||indices.length>ROOM_CUT_LIMIT||new Set(indices).size!==indices.length)return null;
 const rows:CutWitness[]=[],clip:DesignClipItem[]=[];
 for(const index of indices){
  const o=t.objects[index];if(!o||!isEightWay(o.orientation)||Math.floor(o.itemId/100000)!==400||!editable.has(o.itemId)||!removable.has(o.itemId)||!(free?face.positions[index]?.plain===true&&!supportIndices.has(index)&&freeRoomPose(face,shapes,o.itemId,o.x,o.y,o.orientation):isCardinal(o.orientation)&&indoorClear(t,shapes,index)))return null;
  rows.push({roomSource:{roomOrdinal,index},area:'indoor',itemId:String(o.itemId),expectedX:o.x,expectedY:o.y,expectedOrientation:o.orientation,...(supportIndices.has(index)?{supportFactor:t.factor}:{})});
  clip.push({itemId:o.itemId,dx:o.x*2/t.factor,dy:o.y*2/t.factor,orientation:worldOrientationCode(o.orientation)!/4});
 }
 const x=Math.min(...clip.map(p=>p.dx)),y=Math.min(...clip.map(p=>p.dy));
 return {rows,clip:clip.map(p=>({...p,dx:p.dx-x,dy:p.dy-y}))};
}
export type IndoorTransferRow=Omit<IndoorPlace,'expectedStock'>&Pick<CutWitness,'expectedX'|'expectedY'|'expectedOrientation'|'supportFactor'>&({localOrdinal:number;roomSource?:never}|{roomSource:{roomOrdinal:number;index:number};localOrdinal?:never});
/** Check every footprint against the floor and all already staged siblings. */
export function indoorGroupTransfer(face:IndoorSurface|null,shapes:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>,rows:readonly CutWitness[],clip:readonly DesignClipItem[],x:number,y:number,free=false):IndoorTransferRow[]|null{
 const tree=indoorEditableTree(face);
 if(!tree||face?.kind!=='floor'||!face.terrain||!rows.length||rows.length!==clip.length||rows.length>ROOM_CUT_LIMIT||![x,y].every(Number.isSafeInteger))return null;
 const staged={...tree,objects:[...tree.objects]},out:IndoorTransferRow[]=[];
 for(let i=0;i<rows.length;i++){
  const r=rows[i],p=clip[i],px=x+p.dx*tree.factor/2,py=y+p.dy*tree.factor/2,orientation=EIGHT_WAY_ORIENTATIONS[p.orientation*2];
  if(String(p.itemId)!==r.itemId||r.supportFactor&&r.supportFactor!==tree.factor||!orientation||!allowed.has(p.itemId)||!Number.isSafeInteger(px)||!Number.isSafeInteger(py)||!(free?!r.supportFactor&&freeRoomPose(face,shapes,p.itemId,px,py,orientation):isCardinal(r.expectedOrientation)&&supportPlacementFits(staged,shapes,face.terrain,p.itemId,px,py,orientation)))return null;
  out.push({itemId:p.itemId,x:px,y:py,orientation,expectedX:r.expectedX,expectedY:r.expectedY,expectedOrientation:r.expectedOrientation,...(r.supportFactor?{supportFactor:r.supportFactor}:{}),...(r.roomSource?{roomSource:r.roomSource}:{localOrdinal:r.localOrdinal})});
  staged.objects.push({itemId:p.itemId,x:px,y:py,orientation,child:null});
 }
 return out;
}
export function rotateIndoorCut(clip:readonly DesignClipItem[],factor:1|2|null,shapes:Readonly<Record<string,SourceObjectShape>>,delta:number){
 if(!factor)return null;
 const defs=new Map<number,Map<number,DesignItemGeometry>>();
 for(const p of clip){
  const g:DesignItemGeometry={itemId:p.itemId,name:null,layer:'furniture',surfaceCapable:false,shapes:Object.fromEntries((factor===1?[0,2,4,6,8,10,12,14]:[0,4,8,12]).flatMap(code=>{const key=p.itemId+':'+code;return shapes[key]?[[key,shapes[key]]]:[];}))};
  defs.set(p.itemId,new Map([[factor,g]]));
 }
 return rotateFurnitureGroup(clip,defs,delta);
}

export function indoorRoomRenamePlan(room:IndoorRoom|null,name:string){
 if(!room?.nameEditable||name===room.name||[...name].length>128||/[\p{Cc}\p{Cs}]/u.test(name))return null;
 return {roomOrdinal:room.ordinal,expected:room.name,name};
}
export const roomRenameWords={
 ja:['部屋名を変更','部屋名','変更','取消'],
 en:['Rename room','Room name','Change','Cancel'],
 fr:['Renommer la pièce','Nom de la pièce','Modifier','Annuler'],
 it:['Rinomina stanza','Nome stanza','Modifica','Annulla'],
 de:['Raum umbenennen','Raumname','Ändern','Abbrechen'],
 'es-ES':['Renombrar habitación','Nombre de habitación','Cambiar','Cancelar'],
 'zh-CN':['重命名房间','房间名称','更改','取消'],
 'pt-BR':['Renomear cômodo','Nome do cômodo','Alterar','Cancelar']
} as const;

export function indoorRoomResizePlan(room:IndoorRoom|null,size:string){
 if(!room?.resize)return null;
 const recovery=room.resize.recoveryOptions?.find(v=>v[0]===size);
 if(recovery)return {roomOrdinal:room.ordinal,expected:room.resize.current,size,recoverCount:recovery[1]};
 const free=room.resize.anchorOptions?.includes(size)===true;
 if(!room.resize.options.includes(size)&&!free)return null;
 return {roomOrdinal:room.ordinal,expected:room.resize.current,size,...(free?{preserveAnchors:true as const}:{})};
}
export const roomResizeWords={
 ja:['部屋サイズ変更','家具を保持できるサイズのみ選択できます。標準ドアとエレベーターは対応する位置に移動し、選択サイズを購入済みとして記録します。'],
 en:['Resize room','Only sizes that preserve existing objects are offered. Supported default doors and elevators are recentered; the selected size is recorded as bought.'],
 fr:['Redimensionner','Seules les tailles préservant les objets sont proposées. Portes et ascenseurs standard recentrés ; taille enregistrée comme achetée.'],
 it:['Ridimensiona stanza','Sono disponibili solo le dimensioni che preservano gli oggetti. Porte e ascensori standard ricentrati; dimensione registrata come acquistata.'],
 de:['Raumgröße ändern','Nur Größen, die Objekte erhalten, sind verfügbar. Standardtüren und Aufzüge werden zentriert; Größe wird als gekauft erfasst.'],
 'es-ES':['Cambiar tamaño','Solo tamaños que conservan los objetos. Puertas y ascensores estándar centrados; el tamaño se registra como comprado.'],
 'zh-CN':['调整房间大小','仅提供可保留现有物品的尺寸。标准门和电梯重新居中，并记录所选尺寸为已购买。'],
 'pt-BR':['Redimensionar cômodo','Apenas tamanhos que preservam objetos. Portas e elevadores padrão recentralizados; tamanho registrado como comprado.']
} as const;

export function indoorAppendFloorPlan(room:IndoorRoom|null,count=1,extended=false){
 if(room?.houseItemId!==20500000||room.house!==1||room.roomSlot!==0||!integer(room.appendFloorCount,1,127)||!integer(count,1,127))return null;
 const next=room.appendFloorCount+count;
 if(next>128||extended!==(next>20))return null;
 return {house:room.house,houseItemId:room.houseItemId,expectedCount:room.appendFloorCount,...(count!==1||extended?{count}:{}),...(extended?{extended:true as const}:{})};
}
export const floorAppendWords={
 ja:['階を追加','エレベーター付きの空の3×3の階を最上階に追加します。'],
 en:['Add floor','Append an empty 3 × 3 floor with an elevator.'],
 fr:['Ajouter un étage','Ajouter un étage vide de 3 × 3 avec ascenseur.'],
 it:['Aggiungi piano','Aggiungi un piano vuoto 3 × 3 con ascensore.'],
 de:['Etage hinzufügen','Leere Etage 3 × 3 mit Aufzug hinzufügen.'],
 'es-ES':['Añadir planta','Añadir una planta vacía de 3 × 3 con ascensor.'],
 'zh-CN':['添加楼层','在顶层添加带电梯的3×3空楼层。'],
 'pt-BR':['Adicionar andar','Adicionar andar vazio 3 × 3 com elevador.']
} as const;

export function indoorAddRoomPlan(room:IndoorRoom|null,slot:number,size:string){
 if(room?.houseItemId!==20500000||room.roomSlot!==0||!room.addRoomSlots?.includes(slot)||!room.addRoomSizes?.includes(size))return null;
 return {house:room.house,houseItemId:room.houseItemId,floor:room.floor,slot,size};
}
export const addRoomWords={
 ja:['部屋を追加','左','右','奥','空いている壁にドアを追加します。'],
 en:['Add room','Left','Right','Back','Add a door on an empty wall.'],
 fr:['Ajouter une pièce','Gauche','Droite','Fond','Ajouter une porte sur un mur vide.'],
 it:['Aggiungi stanza','Sinistra','Destra','Fondo','Aggiungi una porta su una parete vuota.'],
 de:['Raum hinzufügen','Links','Rechts','Hinten','Tür an einer leeren Wand hinzufügen.'],
 'es-ES':['Añadir habitación','Izquierda','Derecha','Fondo','Añadir una puerta en una pared vacía.'],
 'zh-CN':['添加房间','左侧','右侧','后侧','在空墙上添加门。'],
 'pt-BR':['Adicionar cômodo','Esquerda','Direita','Fundo','Adicionar uma porta em uma parede vazia.']
} as const;

export function indoorRemoveRoomPlan(room:IndoorRoom|null){
 if(room?.houseItemId!==20500000||!(room.removeKind==='floor'&&room.roomSlot===0&&room.floor>1||room.removeKind==='room'&&integer(room.roomSlot,1,3)))return null;
 return {house:room.house,houseItemId:room.houseItemId,floor:room.floor,slot:room.roomSlot,kind:room.removeKind,...(room.removeRecoverCount?{recoverCount:room.removeRecoverCount}:{})};
}
export const removeRoomWords={
 ja:['部屋を削除','最上階を削除','空の部屋と接続ドアを削除します。','空の最上階とエレベーターを削除します。'],
 en:['Remove room','Remove top floor','Remove the empty room and connecting doors.','Remove the empty top floor and elevator.'],
 fr:['Supprimer la pièce','Supprimer le dernier étage','Supprimer la pièce vide et ses portes.','Supprimer le dernier étage vide et son ascenseur.'],
 it:['Rimuovi stanza','Rimuovi ultimo piano','Rimuovi la stanza vuota e le porte.','Rimuovi il piano superiore vuoto e l’ascensore.'],
 de:['Raum entfernen','Oberste Etage entfernen','Leeren Raum und Verbindungstüren entfernen.','Leere oberste Etage und Aufzug entfernen.'],
 'es-ES':['Eliminar habitación','Eliminar última planta','Eliminar la habitación vacía y sus puertas.','Eliminar la última planta vacía y su ascensor.'],
 'zh-CN':['删除房间','删除顶层','删除空房间和连接门。','删除空顶层及电梯。'],
 'pt-BR':['Remover cômodo','Remover último andar','Remover o cômodo vazio e as portas.','Remover o último andar vazio e o elevador.']
} as const;

export const anchorResizeWords={
 ja:['自由配置','家具の座標は維持しますが、フットプリントのはみ出しや重なりは検証しません。'],
 en:['Free placement','Furniture anchors are preserved; footprint overhang and overlap are not checked.'],
 fr:['Placement libre','Positions conservées ; débordements et chevauchements non vérifiés.'],
 it:['Posizionamento libero','Coordinate conservate; ingombri e sovrapposizioni non verificati.'],
 de:['Freie Platzierung','Positionen bleiben erhalten; Überstände und Überlappungen werden nicht geprüft.'],
 'es-ES':['Colocación libre','Se conservan posiciones; no se verifican salientes ni solapamientos.'],
 'zh-CN':['自由摆放','保留家具坐标，不检查占地范围越界或重叠。'],
 'pt-BR':['Posicionamento livre','Posições preservadas; limites da área ocupada e sobreposições não verificados.']
} as const;

export const recoverResizeWords={
 ja:['範囲外の家具を回収','個の家具を所持品に戻します。残る家具のフットプリントや重なりは未検証です。'],
 en:['Recover outside furniture',' furniture objects will return to stock. Remaining footprints and overlap are not checked.'],
 fr:['Récupérer les meubles hors limites',' meubles seront remis en stock. Empreintes et chevauchements restants non vérifiés.'],
 it:['Recupera mobili fuori limite',' mobili saranno restituiti. Ingombri e sovrapposizioni residui non verificati.'],
 de:['Möbel außerhalb zurücknehmen',' Möbel werden ins Inventar zurückgelegt. Überstände und Überlappungen bleiben ungeprüft.'],
 'es-ES':['Recoger muebles fuera del límite',' muebles volverán al inventario. No se comprueban las huellas ni los solapamientos restantes.'],
 'zh-CN':['收回范围外的家具','件家具将返回库存。其余家具占地及重叠未验证。'],
 'pt-BR':['Recolher móveis fora da área',' móveis retornarão ao estoque. Áreas ocupadas e sobreposições restantes não são verificadas.']
} as const;

export const removeRecoveryWords={
 ja:['個の家具を所持品に回収してから削除します。','部屋と接続ドアを削除します。','最上階の全室とエレベーターを削除します。'],
 en:[' furniture objects will return to stock before removal.','Remove the room and connecting doors.','Remove every room and the elevator on the top floor.'],
 fr:[' meubles seront remis en stock avant suppression.','Supprimer la pièce et ses portes.','Supprimer toutes les pièces et l’ascenseur du dernier étage.'],
 it:[' mobili saranno restituiti prima della rimozione.','Rimuovi la stanza e le porte.','Rimuovi tutte le stanze e l’ascensore dell’ultimo piano.'],
 de:[' Möbel werden vor dem Entfernen zurückgelegt.','Raum und Verbindungstüren entfernen.','Alle Räume und den Aufzug der obersten Etage entfernen.'],
 'es-ES':[' muebles volverán al inventario antes de eliminar.','Eliminar la habitación y sus puertas.','Eliminar todas las habitaciones y el ascensor de la última planta.'],
 'zh-CN':['件家具将在删除前返回库存。','删除房间及连接门。','删除顶层全部房间及电梯。'],
 'pt-BR':[' móveis retornarão ao estoque antes da remoção.','Remover cômodo e portas.','Remover todos os cômodos e o elevador do último andar.']
} as const;

export function indoorCeilingFinishPlan(room:IndoorRoom|null,itemId:number){
 if(!room||!integer(room.ceiling,0,2147483647)||!integer(itemId,160100000,160199999)||room.ceiling===itemId||room.surfaces.length!==5||room.surfaces.slice(1).some((s,i)=>s.wallPosition!==i))return null;
 return {roomOrdinal:room.ordinal,itemId,kind:'ceiling' as const,wall:null,expected:room.ceiling};
}

export const floorBatchWords={
 ja:['追加する階数','変更後の階数','20階超は試験的なセーブ出力です。ゲーム内の動作は未確認です。','20階を超える増設を許可'],
 en:['Floors to add','Total floors','More than 20 floors is experimental; game runtime is not verified.','Allow exceeding 20 floors'],
 fr:['Étages à ajouter','Total des étages','Au-delà de 20 étages, export expérimental non vérifié en jeu.','Autoriser plus de 20 étages'],
 it:['Piani da aggiungere','Piani totali','Oltre 20 piani: esportazione sperimentale non verificata nel gioco.','Consenti più di 20 piani'],
 de:['Etagen hinzufügen','Etagen insgesamt','Über 20 Etagen: experimenteller, im Spiel ungeprüfter Export.','Mehr als 20 Etagen erlauben'],
 'es-ES':['Plantas que añadir','Total de plantas','Más de 20 plantas: exportación experimental sin verificar en el juego.','Permitir más de 20 plantas'],
 'zh-CN':['添加楼层数量','总楼层数','超过20层为实验性存档输出，未验证游戏内运行。','允许超过20层'],
 'pt-BR':['Andares a adicionar','Total de andares','Mais de 20 andares: exportação experimental não verificada no jogo.','Permitir mais de 20 andares']
} as const;
