import {currentDesign,emptyDesign,restoreDesign,type DesignItemGeometry,type DesignPlacement} from './design-layout.ts';
import {roomDesignValid,type RoomDesignTemplate} from './room-design.ts';
import {roomFinishIdValid} from './room-finish-design.ts';
import {newRoomSurface,ROOM_PROJECT_WALL_LIMIT,serializeRoomProject,parseRoomProject,type RoomProjectSurface} from './room-project-design.ts';
import {indoorFreeFloor,indoorGroupPlace,type IndoorRoom,type IndoorSurface,type IndoorPosition} from './indoor-room-view.ts';
import type {IndoorSupportWitness} from './indoor-support.ts';
import type {RoomApplySurfaceGeometry} from './room-project-apply.ts';
import {parseSupportScene,supportSceneRootCounts,type SupportScene} from './support-scene.ts';

/** Only a portable design: no house name, native identifiers, save bytes,
 * inventory or ceiling data. All faces must be represented; no partial export. */
export function captureRoomTemplate(face:IndoorSurface,templates:readonly RoomDesignTemplate[]):RoomDesignTemplate|null{
 const t=face.terrain;
 if(!t||face.gridStatus!=='full'||!face.factor||face.missingPositions||!face.sourcePath||face.finish===null)return null;
 const matches=templates.filter(s=>s.kind===face.kind&&s.grid.gridDataPath===face.sourcePath&&s.raster.sizeX===t.sizeX&&s.raster.sizeY===t.sizeY&&s.raster.nativeFloorValues.length===t.nativeFloorValues.length&&s.raster.nativeFloorValues.every((v,i)=>v===t.nativeFloorValues[i]));
 return matches.length===1?matches[0]:null;
}
export function roomBackupProtected(p:IndoorPosition):boolean{
 return p.protected===true||!!(p.storage||p.storageKnown)&&p.storageRestorable!==true;
}
export function captureRoomRows(room:IndoorRoom,face:IndoorSurface,template:RoomDesignTemplate,witnesses:readonly IndoorSupportWitness[],scenes:ReadonlyMap<number,SupportScene>):DesignPlacement[]|null{
 if(!face.factor||face.positions.length>5000||face.items.reduce((n,p)=>n+p.quantity,0)!==face.positions.length)return null;
 const parents=witnesses.filter(p=>p.roomOrdinal===room.ordinal&&p.surfaceOrdinal===face.ordinal),byIndex=new Map(parents.map(p=>[p.index,p]));
 if(byIndex.size!==parents.length||parents.some(p=>!face.positions[p.index]||!scenes.has(p.localOrdinal)))return null;
 const rows:DesignPlacement[]=[];
 for(const [i,p] of face.positions.entries()){
  if(roomBackupProtected(p)){if(byIndex.has(i))return null;continue;}
  if(p.orientationCode===null||Math.floor(p.itemId/100000)!==400)return null;
  const x=p.x*template.grid.factor/face.factor,y=p.y*template.grid.factor/face.factor,w=byIndex.get(i);
  if(!Number.isSafeInteger(x)||!Number.isSafeInteger(y)||x<0||y<0||x>=template.grid.sizeX*template.grid.factor||y>=template.grid.sizeY*template.grid.factor)return null;
  if(w){
   if(p.orientationCode%4!==0||w.itemId!==p.itemId||w.x!==p.x||w.y!==p.y)return null;
   try{const scene=parseSupportScene(JSON.stringify(scenes.get(w.localOrdinal)));if(scene.ownerItemId!==p.itemId||[...supportSceneRootCounts(scene).values()].reduce((a,b)=>a+b,0)>32)return null;
    rows.push({id:rows.length+1,itemId:p.itemId,x,y,orientation:p.orientationCode/4,attachment:{scene,designOnly:false}});
   }catch{return null;}
  }else{if(p.plain!==true&&p.storageRestorable!==true)return null;rows.push({id:rows.length+1,itemId:p.itemId,x,y,orientation:p.orientationCode/4});}
 }
 return rows;
}
/** Backup uses the native floor lattice, not synthetic factor-two diagonal geometry.
 * Only plain furniture can bypass placement restrictions. Stateful support roots
 * still require a validated attachment and a legal native placement. */
export function roomBackupSurfaceValid(face:IndoorSurface,s:RoomProjectSurface,g:RoomApplySurfaceGeometry,free=false):boolean{
 if(!free||!indoorFreeFloor(face))return roomDesignValid(s.timeline,s.template.grid,s.template.raster,g.design);
 const factor=face.factor;if(!factor)return false;
 const rows=currentDesign(s.timeline),strict=rows.filter(p=>p.attachment),leaf=rows.filter(p=>!p.attachment);
 if(rows.some(p=>{const d=g.design.get(p.itemId);return !d||d.layer!=='furniture'||!!d.supportPath!==!!p.attachment||d.surfaceCapable&&!p.attachment||p.attachment?.designOnly||p.attachment&&(!Number.isInteger(p.orientation)||p.attachment.scene.tree.sourcePath!==d.supportPath)||!Number.isSafeInteger(p.x*factor/s.template.grid.factor)||!Number.isSafeInteger(p.y*factor/s.template.grid.factor);}))return false;
 const empty={...face,positions:[],items:[]},stock=new Map(rows.map(p=>[p.itemId,rows.length]));
 // Validate supports using the regular room design lattice. Leaves are
 // independently checked against the real native raster and shape.
 if(strict.length&&!roomDesignValid({snapshots:[strict],cursor:0,nextId:1},s.template.grid,s.template.raster,g.design))return false;
 for(const p of leaf){if(!g.freeAllowed?.has(p.itemId)||!indoorGroupPlace(empty,g.shapes,g.freeAllowed,stock,[{itemId:p.itemId,dx:p.x*2/s.template.grid.factor,dy:p.y*2/s.template.grid.factor,orientation:p.orientation}],0,0,true))return false;}
 return true;
}
export function captureRoomSurface(face:IndoorSurface,template:RoomDesignTemplate,rows:readonly DesignPlacement[],definitions:ReadonlyMap<number,DesignItemGeometry>,finishIds:ReadonlySet<number>,native?:RoomApplySurfaceGeometry):RoomProjectSurface|null{
 const finish=face.finish;if(finish===null||finish!==0&&(!roomFinishIdValid(finish,face.kind)||!finishIds.has(finish)))return null;
 if(rows.length!==face.positions.filter(p=>!roomBackupProtected(p)).length||rows.some(p=>{const g=definitions.get(p.itemId);return !g||!!g.supportPath!==!!p.attachment||g.surfaceCapable&&!p.attachment;}))return null;
 const free=!!native&&indoorFreeFloor(face);
 const timeline=free?{snapshots:[[...rows]],cursor:0,nextId:rows.length+1}:restoreDesign(emptyDesign(),rows,definitions,template.grid.sizeX*template.grid.factor,template.grid.sizeY*template.grid.factor);
 if(!timeline)return null;
 const surface={...newRoomSurface(face.ordinal,template),timeline,finish,definitions};
 if(native?!roomBackupSurfaceValid(face,surface,native,free):!roomDesignValid(timeline,template.grid,template.raster,definitions))return null;
 return surface;
}
export function capturedRoomDocument(room:IndoorRoom,surfaces:readonly RoomProjectSurface[],templates:readonly RoomDesignTemplate[],backup=false):string|null{
 if(!surfaces.length||surfaces.length!==room.surfaces.length||surfaces.length>ROOM_PROJECT_WALL_LIMIT+1||surfaces.some((s,i)=>s.id!==room.surfaces[i].ordinal||s.template.kind!==room.surfaces[i].kind||currentDesign(s.timeline).length!==room.surfaces[i].positions.filter(p=>!roomBackupProtected(p)).length))return null;
 try{const raw=serializeRoomProject(surfaces,surfaces[0].id);parseRoomProject(raw,templates,backup);return raw;}catch{return null;}
}
export const roomCaptureWords={
 ja:['部屋を設計ファイルに保存','設計を保存できません。未確認の地形・家具・支持面・仕上げがあります。','確認中…'],
 en:['Save room as design','Unable to save design: unverified terrain, furniture, supports or finishes.','Checking…'],
 fr:['Enregistrer la pièce comme projet','Terrain, meubles, supports ou finitions non vérifiés.','Vérification…'],
 it:['Salva stanza come progetto','Terreno, mobili, supporti o finiture non verificati.','Verifica…'],
 de:['Raum als Entwurf speichern','Gelände, Möbel, Auflagen oder Oberflächen ungeprüft.','Prüfung…'],
 'es-ES':['Guardar habitación como diseño','Terreno, muebles, soportes o acabados sin verificar.','Comprobando…'],
 'zh-CN':['将房间保存为设计','存在未验证的地形、家具、支撑面或饰面。','正在检查…'],
 'pt-BR':['Salvar cômodo como projeto','Terreno, móveis, apoios ou acabamentos não verificados.','Verificando…']
} as const;

export const protectedRoomWords={
 ja:'固定オブジェクトは装飾ファイルに含めず、復元時も保持します。',
 en:'Protected objects are excluded from decoration files and retained during restore.',
 fr:'Les objets protégés sont exclus des fichiers et conservés lors de la restauration.',
 it:'Gli oggetti protetti sono esclusi dai file e conservati durante il ripristino.',
 de:'Geschützte Objekte werden nicht exportiert und beim Wiederherstellen beibehalten.',
 'es-ES':'Los objetos protegidos no se exportan y se conservan al restaurar.',
 'zh-CN':'受保护的物体不包含在装饰文件中，恢复时保持原状。',
 'pt-BR':'Objetos protegidos não são exportados e permanecem durante a restauração.'
} as const;
