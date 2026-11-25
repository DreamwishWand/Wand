/** Validate the small, local-only projection. A missing finish is not
 * silently converted to item zero. Native Grid IDs never reach the UI. */
export type IndoorGridStatus='full'|'unresolved'|'shared'|'diff';
export interface IndoorItem{itemId:number;quantity:number}
export interface IndoorSurface{kind:'floor'|'wall';ordinal:number;finish:number|null;gridStatus:IndoorGridStatus;items:IndoorItem[]}
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
   if(!record(s)||Object.keys(s).length!==5||s.ordinal!==j+1||s.kind!==(j===0?'floor':'wall')||!finish(s.finish)||!['full','unresolved','shared','diff'].includes(String(s.gridStatus))||!Array.isArray(s.items)||s.items.length>100000||s.gridStatus!=='full'&&s.items.length)throw Error('INDOOR_SURFACE_INVALID');
   const seen=new Set<number>();
   const items=s.items.map(p=>{if(!record(p)||Object.keys(p).length!==2||!integer(p.itemId,1,4294967295)||!integer(p.quantity,1,100000)||seen.has(p.itemId))throw Error('INDOOR_ITEM_INVALID');seen.add(p.itemId);total+=p.quantity;if(total>100000)throw Error('INDOOR_LIMIT');return {itemId:p.itemId,quantity:p.quantity};});
   return {kind:s.kind as 'floor'|'wall',ordinal:j+1,finish:s.finish,gridStatus:s.gridStatus as IndoorGridStatus,items};
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
