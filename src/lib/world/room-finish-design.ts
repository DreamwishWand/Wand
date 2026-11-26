import type {PublicTerrainGridRef} from './public-terrain-projection.ts';
export type RoomFinishKind='floor'|'wall';
export type RoomFinishItem={itemId:number;name:string};
export function roomFinishKind(g:PublicTerrainGridRef|null|undefined):RoomFinishKind|null{
 if(!g||g.layoutId!=='DesignRooms/local-only.json'||g.gridIdNative!==0||!g.key.startsWith('room-design:'))return null;
 return g.gridDataPath.startsWith('GridData/Rooms/Room')?'floor':g.gridDataPath.startsWith('GridData/Rooms/Wall')?'wall':null;
}
export function roomFinishDraftKind(key:string):RoomFinishKind|null{
 return key.startsWith('area:room-design:GridData/Rooms/Room')?'floor':key.startsWith('area:room-design:GridData/Rooms/Wall')?'wall':null;
}
export function roomFinishIdValid(id:unknown,kind:RoomFinishKind|null):id is number{
 return !!kind&&typeof id==='number'&&Number.isSafeInteger(id)&&(id===0||Math.floor(id/10000000)===16&&Math.floor((id%10000000)/100000)===(kind==='floor'?1:0));
}
export function roomFinishRecordValid(item:{itemId:number;itemType:{code:number;subtypeCode:number;subtypeNameVerified:boolean}},kind:RoomFinishKind):boolean{
 return item.itemId!==0&&roomFinishIdValid(item.itemId,kind)&&item.itemType.code===16&&item.itemType.subtypeCode===(kind==='floor'?1:0)&&item.itemType.subtypeNameVerified===true;
}
export function readRoomFinish(value:unknown,kind:RoomFinishKind|null,allowed?:ReadonlySet<number>):number|undefined{
 if(!value||typeof value!=='object'||!Object.prototype.hasOwnProperty.call(value,'roomFinish'))return undefined;
 const id=(value as {roomFinish:unknown}).roomFinish;
 if(!roomFinishIdValid(id,kind)||id!==0&&allowed&&!allowed.has(id))throw Error('ROOM_FINISH_INVALID');return id;
}
export const roomFinishDesignWords={ja:['床材・壁紙','未指定','仕上げを検索','画像はアイテムのプレビューです。実際の面の質感・模様の再現ではありません。','仕上げ一覧を取得できませんでした。','仕上げを元に戻す','仕上げをやり直す'],en:['Flooring / wallpaper','Not selected','Search finishes','Item artwork preview, not the actual surface texture.','Unable to load finishes.','Undo finish','Redo finish'],fr:['Sol / papier peint','Non sélectionné','Rechercher une finition','Aperçu de l’objet, pas de la texture réelle.','Finitions indisponibles.','Annuler la finition','Rétablir la finition'],it:['Pavimento / carta da parati','Non selezionato','Cerca finiture','Anteprima dell’oggetto, non della trama reale.','Finiture non disponibili.','Annulla finitura','Ripeti finitura'],de:['Boden / Tapete','Nicht ausgewählt','Oberflächen suchen','Objektvorschau, keine tatsächliche Oberflächentextur.','Oberflächen nicht verfügbar.','Oberfläche rückgängig','Oberfläche wiederholen'],'es-ES':['Suelo / papel pintado','Sin seleccionar','Buscar acabados','Vista previa del objeto, no de la textura real.','No se pudieron cargar los acabados.','Deshacer acabado','Rehacer acabado'],'zh-CN':['地板 / 墙纸','未选择','搜索饰面','物品图片预览，并非实际表面纹理。','无法加载饰面。','撤销饰面','重做饰面'],'pt-BR':['Piso / papel de parede','Não selecionado','Buscar acabamentos','Prévia do item, não da textura real.','Não foi possível carregar os acabamentos.','Desfazer acabamento','Refazer acabamento']} as const;
