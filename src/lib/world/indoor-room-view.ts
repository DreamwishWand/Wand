/** Validate the small, local-only projection. A missing finish is not
 * silently converted to item zero. Native Grid IDs never reach the UI. */
export type IndoorGridStatus='full'|'unresolved'|'shared'|'diff';
export interface IndoorItem{itemId:number;quantity:number}
export interface IndoorPosition{itemId:number;x:number;y:number}
export interface IndoorSurface{kind:'floor'|'wall';ordinal:number;wallPosition:number|null;finish:number|null;gridStatus:IndoorGridStatus;items:IndoorItem[];positions:IndoorPosition[];missingPositions:number}
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
   if(!record(s)||Object.keys(s).length!==8||s.ordinal!==j+1||s.kind!==(j===0?'floor':'wall')||!(j===0?s.wallPosition===null:integer(s.wallPosition,-2147483648,2147483647))||!finish(s.finish)||!['full','unresolved','shared','diff'].includes(String(s.gridStatus))||!Array.isArray(s.items)||s.items.length>100000||s.gridStatus!=='full'&&s.items.length||!Array.isArray(s.positions)||s.positions.length>100000||!integer(s.missingPositions,0,100000))throw Error('INDOOR_SURFACE_INVALID');
   const seen=new Set<number>();
   const items=s.items.map(p=>{if(!record(p)||Object.keys(p).length!==2||!integer(p.itemId,1,4294967295)||!integer(p.quantity,1,100000)||seen.has(p.itemId))throw Error('INDOOR_ITEM_INVALID');seen.add(p.itemId);total+=p.quantity;if(total>100000)throw Error('INDOOR_LIMIT');return {itemId:p.itemId,quantity:p.quantity};});
   const quantities=new Map(items.map(p=>[p.itemId,p.quantity]));let count=0;
   const positions:IndoorPosition[]=s.positions.map(p=>{if(!record(p)||Object.keys(p).length!==3||!integer(p.itemId,1,4294967295)||!integer(p.x,-1000000,1000000)||!integer(p.y,-1000000,1000000)||(quantities.get(p.itemId)??0)<1)throw Error('INDOOR_POSITION_INVALID');quantities.set(p.itemId,quantities.get(p.itemId)!-1);count++;return {itemId:p.itemId,x:p.x,y:p.y};});
   if([...quantities.values()].reduce((a,b)=>a+b,0)!==s.missingPositions||s.gridStatus!=='full'&&(count||s.missingPositions))throw Error('INDOOR_POSITION_COUNT');
   return {kind:s.kind as 'floor'|'wall',ordinal:j+1,wallPosition:s.wallPosition as number|null,finish:s.finish,gridStatus:s.gridStatus as IndoorGridStatus,items,positions,missingPositions:s.missingPositions};
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
export function indoorPositionPlot(positions:readonly IndoorPosition[],itemId:number|null=null){
 const groups=new Map<string,{x:number;y:number;count:number;selected:number}>();
 let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
 for(const p of positions){
  const k=p.x+':'+p.y,point=groups.get(k)??{x:p.x,y:p.y,count:0,selected:0};point.count++;if(p.itemId===itemId)point.selected++;groups.set(k,point);
  left=Math.min(left,p.x);right=Math.max(right,p.x);top=Math.min(top,p.y);bottom=Math.max(bottom,p.y);
 }
 if(!groups.size)return null;
 const width=right-left+2,height=bottom-top+2;
 return {points:[...groups.values()],viewBox:[left-1,top-1,width,height].join(' '),markerRadius:Math.max(.16,Math.max(width,height)/250)};
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
