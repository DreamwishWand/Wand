import {currentDesign,type DesignPlacement} from './design-layout.ts';
import {parseRoomProject,serializeRoomProject,type RoomProjectSurface} from './room-project-design.ts';
import type {RoomDesignTemplate} from './room-design.ts';
import {roomBackupSurfaceValid} from './room-project-capture.ts';
import {roomFinishIdValid} from './room-finish-design.ts';
import {roomApplyMatches,type RoomApplyRow,type RoomApplySurfaceGeometry} from './room-project-apply.ts';
import {indoorGroupPickup,indoorGroupPlace,indoorFreeFloor,type IndoorRoom,type IndoorSurface,type IndoorPickup} from './indoor-room-view.ts';
import {supportSceneRootCounts} from './support-scene.ts';
import {parseReplayStep} from './checkpoint-journal.ts';
import {addRestoreQuantity} from './restore-stock-review.ts';
export type IndoorBackupScope='room'|'floor'|'building';
export const INDOOR_BACKUP_LIMIT=16_000_000;
export interface IndoorBackupRoom{room:IndoorRoom;surfaces:RoomProjectSurface[]}
export interface IndoorBackupEntry{floor:number;room:number;wallPositions:(number|null)[];surfaces:RoomProjectSurface[]}
export interface IndoorRestoreRow extends RoomApplyRow{pickup:IndoorPickup[];freePlacement?:true}
export interface IndoorRestorePlan{scope:IndoorBackupScope;rooms:{roomOrdinal:number;surfaces:IndoorRestoreRow[]}[]}
export function indoorBackupRooms(scope:IndoorBackupScope,selected:IndoorRoom,rooms:readonly IndoorRoom[]):IndoorRoom[]{
 return rooms.filter(r=>r.house===selected.house&&(scope==='building'||r.floor===selected.floor&&(scope==='floor'||r.ordinal===selected.ordinal))).sort((a,b)=>a.floor-b.floor||a.ordinal-b.ordinal);
}
function addresses(scope:IndoorBackupScope,rooms:readonly IndoorRoom[]){
 const counts=new Map<number,number>();return rooms.map(r=>{const floor=scope==='building'?r.floor:1,room=(counts.get(floor)??0)+1;counts.set(floor,room);return {floor,room};});
}
export function serializeIndoorBackup(scope:IndoorBackupScope,entries:readonly IndoorBackupRoom[],templates:readonly RoomDesignTemplate[]):string{
 if(!entries.length||entries.length>2048)throw Error('INDOOR_BACKUP_SCOPE');
 const addressesForRooms=addresses(scope,entries.map(e=>e.room));
 const raw=JSON.stringify({schema:'wand.preset.indoor-decoration@1',gameVersion:'1.26.2',scope,rooms:entries.map((e,i)=>({...addressesForRooms[i],wallPositions:e.room.surfaces.map(s=>s.wallPosition),design:JSON.parse(serializeRoomProject(e.surfaces,e.surfaces[0].id))}))});
 parseIndoorBackup(raw,scope,entries.map(e=>e.room),templates);return raw;
}
export function parseIndoorBackup(raw:string,scope:IndoorBackupScope,targets:readonly IndoorRoom[],templates:readonly RoomDesignTemplate[]):IndoorBackupEntry[]{
 if(raw.length>INDOOR_BACKUP_LIMIT||!targets.length||targets.length>2048)throw Error('INDOOR_BACKUP_SIZE');
 const v=JSON.parse(raw),keys=addresses(scope,targets);
 if(!v||Object.keys(v).length!==4||v.schema!=='wand.preset.indoor-decoration@1'||v.gameVersion!=='1.26.2'||v.scope!==scope||!Array.isArray(v.rooms)||v.rooms.length!==targets.length)throw Error('INDOOR_BACKUP_SCOPE');
 return v.rooms.map((e:any,i:number)=>{
  const t=targets[i],k=keys[i];if(!e||Object.keys(e).length!==4||e.floor!==k.floor||e.room!==k.room||!Array.isArray(e.wallPositions)||e.wallPositions.length!==t.surfaces.length||e.wallPositions.some((p:unknown,j:number)=>p!==t.surfaces[j].wallPosition))throw Error('INDOOR_BACKUP_ADDRESS');
  const doc=parseRoomProject(JSON.stringify(e.design),templates,true);
  if(doc.surfaces.length!==t.surfaces.length||doc.surfaces.some((s,j)=>s.id!==t.surfaces[j].ordinal||!roomApplyMatches(s,t.surfaces[j])))throw Error('INDOOR_BACKUP_TERRAIN');
  return {...k,wallPositions:e.wallPositions,surfaces:doc.surfaces};
 });
}
const poseKey=(p:DesignPlacement)=>JSON.stringify([p.itemId,p.x,p.y,p.orientation,p.attachment?.scene??null]);
const need=(p:DesignPlacement)=>p.attachment?supportSceneRootCounts(p.attachment.scene):new Map([[p.itemId,1]]);
export interface IndoorRestoreInput{room:IndoorRoom;before:readonly RoomProjectSurface[];after:readonly RoomProjectSurface[];geometry:ReadonlyMap<number,RoomApplySurfaceGeometry>}
export function buildIndoorRestore(scope:IndoorBackupScope,inputs:readonly IndoorRestoreInput[],stock:ReadonlyMap<number,number>,owned:ReadonlySet<number>,free=false){
 if(!inputs.length||inputs.length>2048)return null;
 const balances=new Map(stock),plan:IndoorRestorePlan={scope,rooms:[]},work:{face:IndoorSurface;row:IndoorRestoreRow;desired:DesignPlacement[];geometry:RoomApplySurfaceGeometry}[]=[];
 const returned=new Map<number,number>(),required=new Map<number,number>(),finishItems=new Map<number,number>();
 let removed=0,added=0,retained=0,finishes=0;
 for(const input of inputs){
  const {room,before,after,geometry}=input;if(before.length!==room.surfaces.length||after.length!==before.length)return null;
  const rows:IndoorRestoreRow[]=[];plan.rooms.push({roomOrdinal:room.ordinal,surfaces:rows});
  for(const [i,face] of room.surfaces.entries()){
   const b=before[i],a=after[i],g=geometry.get(face.ordinal);
   if(!g||!face.factor||!roomApplyMatches(b,face)||!roomApplyMatches(a,face)||b.id!==face.ordinal||a.id!==face.ordinal||!roomBackupSurfaceValid(face,a,g,free))return null;
   const old=currentDesign(b.timeline),next=currentDesign(a.timeline);if(old.length!==face.positions.length||next.some(p=>p.attachment?.designOnly||!!g.design.get(p.itemId)?.supportPath!==!!p.attachment))return null;
   const wanted=new Map<string,number>();for(const p of next){const key=poseKey(p);wanted.set(key,(wanted.get(key)??0)+1);}
   const keep=new Set<number>(),drop:number[]=[];
   for(const [j,p] of old.entries()){const key=poseKey(p),n=wanted.get(key)??0;if(n){keep.add(j);wanted.set(key,n-1);retained++;}else drop.push(j);}
   const desired=next.filter(p=>{const key=poseKey(p),n=wanted.get(key)??0;if(!n)return false;wanted.set(key,n-1);return true;});
   if(drop.length>32||desired.length>32)return null;
   const freeFloor=free&&indoorFreeFloor(face);
   // Free removal and addition are explicit, plain-leaf-only operations.
   // A support tree remains on the normal native writer path.
   const freeDrop=freeFloor?drop.filter(j=>!old[j].attachment):[];
   const normalDrop=drop.filter(j=>!freeDrop.includes(j));
   if(freeFloor&&normalDrop.length&&freeDrop.length)return null;
   const freePickup=freeDrop.length>0;
   const pickup=drop.length?indoorGroupPickup(face,drop,freePickup?(g.freeAllowed??new Set()):g.allowed,balances,new Set(drop.filter(j=>!!old[j].attachment)),freePickup):[];
   if(!pickup)return null;
   for(const j of drop){for(const [id,n] of need(old[j])){const value=balances.get(id);if(value===undefined||value+n>2147483647)return null;balances.set(id,value+n);addRestoreQuantity(returned,id,n);removed+=n;}}
   const kept=face.positions.filter((_,j)=>keep.has(j)),quantities=new Map<number,number>();for(const p of kept)quantities.set(p.itemId,(quantities.get(p.itemId)??0)+1);
   let finish:RoomApplyRow['finish']=null;
   if(a.finish!==face.finish){if(!a.finish||!roomFinishIdValid(a.finish,face.kind)||!owned.has(a.finish)||room.surfaces.length!==5||!room.surfaces.slice(1).every((f,j)=>f.wallPosition===j)||face.kind==='floor'&&face.finish===null)return null;finish={itemId:a.finish,expected:face.finish};addRestoreQuantity(finishItems,a.finish,1);finishes++;}
   const freePlace=freeFloor&&desired.length>0&&desired.every(p=>!p.attachment);
   if(freeFloor&&desired.some(p=>p.attachment)&&desired.some(p=>!p.attachment))return null;
   if(freePickup&&desired.some(p=>p.attachment)||freePlace&&normalDrop.length)return null;
   const row:IndoorRestoreRow={surfaceOrdinal:face.ordinal,sourcePath:a.template.grid.gridDataPath,factor:face.factor,pickup,place:[],finish,...(freePickup||freePlace?{freePlacement:true as const}:{})};
   rows.push(row);work.push({face:{...face,positions:kept,items:[...quantities].map(([itemId,quantity])=>({itemId,quantity}))},row,desired,geometry:g});
  }
 }
 // Aggregate requirements before any placement. A shortage review is not
 // a writable plan: actual placement validation still requires real stock.
 for(const {desired} of work)for(const p of desired)for(const [id,n] of need(p))addRestoreQuantity(required,id,n);
 const missing=[...required].filter(([id,n])=>(balances.get(id)??0)<n).map(([itemId,n])=>({itemId,quantity:n-(balances.get(itemId)??0)}));
 const requested=[...required.values()].reduce((a,b)=>a+b,0);
 if(removed+requested>4096)return null;
 if(missing.length)return {plan:null,removed,added:requested,retained,finishes,returned,required,finishItems,missing,changed:true};
 // All returns precede any placement; even different rooms can reuse stock.
 for(const {face,row,desired,geometry:g} of work){
  const clip=desired.map(p=>({itemId:p.itemId,dx:p.x,dy:p.y,orientation:p.orientation}));
  const place=clip.length?indoorGroupPlace(face,g.shapes,row.freePlacement?(g.freeAllowed??new Set()):g.allowed,balances,clip,0,0,!!row.freePlacement):[];
  if(!place)return null;
  for(const [i,p] of desired.entries()){
   const add=place[i];add.expectedStock=balances.get(p.itemId)??0;
   for(const [id,n] of need(p)){const value=balances.get(id)??0;if(value<n)return null;balances.set(id,value-n);added+=n;}
   if(p.attachment)add.scene=p.attachment.scene;
  }
  row.place=place;
 }
 if(removed+added>4096||JSON.stringify(plan).length>120*1024)return null;
 try{parseReplayStep({command:'indoor-room-project-export',plan});}catch{return null;}
 return {plan,removed,added,retained,finishes,returned,required,finishItems,missing,changed:removed+added+finishes>0};
}
export const indoorBackupWords={
 ja:['装飾バックアップ','部屋','階','建物','バックアップを保存','リストア','撤去','追加','維持','仕上げ変更','検証済みコピーを作成','編集済みコピーを適用','変更なし','範囲・在庫・地形・保存状態が一致しないか、対応上限を超えています。','選択範囲を復元します。テスト環境専用。','取消'],
 en:['Decoration backup','Room','Floor','Building','Save backup','Restore','Remove','Add','Keep','Finishes','Create validated copy','Apply edited copy','No changes','Scope, stock, terrain or saved state incompatible, or limit exceeded.','Restore selected scope. Test environment only.','Cancel'],
 fr:['Sauvegarde décoration','Pièce','Étage','Bâtiment','Enregistrer','Restaurer','Retirer','Ajouter','Garder','Finitions','Créer une copie vérifiée','Appliquer la copie','Aucun changement','Périmètre, stock ou état incompatible.','Restaurer le périmètre. Test uniquement.','Annuler'],
 it:['Backup decorazione','Stanza','Piano','Edificio','Salva backup','Ripristina','Rimuovi','Aggiungi','Mantieni','Finiture','Crea copia verificata','Applica copia','Nessuna modifica','Ambito, scorte o stato incompatibile.','Ripristina ambito. Solo test.','Annulla'],
 de:['Dekorationssicherung','Raum','Etage','Gebäude','Sicherung speichern','Wiederherstellen','Entfernen','Hinzufügen','Behalten','Oberflächen','Geprüfte Kopie erstellen','Kopie anwenden','Keine Änderungen','Bereich, Bestand oder Zustand inkompatibel.','Bereich wiederherstellen. Nur Test.','Abbrechen'],
 'es-ES':['Copia de decoración','Habitación','Planta','Edificio','Guardar copia','Restaurar','Quitar','Añadir','Mantener','Acabados','Crear copia validada','Aplicar copia','Sin cambios','Ámbito, inventario o estado incompatible.','Restaurar ámbito. Solo pruebas.','Cancelar'],
 'zh-CN':['装饰备份','房间','楼层','建筑','保存备份','恢复','移除','添加','保留','饰面','创建验证副本','应用副本','无更改','范围、库存、地形或状态不兼容。','恢复选定范围。仅供测试。','取消'],
 'pt-BR':['Backup de decoração','Cômodo','Andar','Edifício','Salvar backup','Restaurar','Remover','Adicionar','Manter','Acabamentos','Criar cópia validada','Aplicar cópia','Sem alterações','Escopo, estoque ou estado incompatível.','Restaurar escopo. Somente teste.','Cancelar']
} as const;
