import type {PublicTerrainGridRef} from './public-terrain-projection.ts';
import type {TerrainRaster} from './terrain-binding.ts';
import type {DesignItemGeometry,DesignTimeline} from './design-layout.ts';
import {supportPlacementFits,type SupportTree} from './subgrid-local.ts';
import {CARDINAL_ORIENTATIONS} from './saved-map-transform.ts';
export interface RoomDesignTemplate{grid:PublicTerrainGridRef;raster:TerrainRaster;label:string;kind:'floor'|'wall'}
export const isRoomDesign=(g:PublicTerrainGridRef|null|undefined)=>!!g&&g.key.startsWith('room-design:')&&g.layoutId==='DesignRooms/local-only.json'&&g.gridIdNative===0;
/** Local-only design identity, never a native layout or Save destination.
 * Factor 2 is a design lattice; portable Scene import converts to the
 * actual room's verified tessellation before editing a Save. */
export function roomDesignTemplates(raw:unknown):RoomDesignTemplate[]{
 const v=raw as {contract?:string;platform?:string;gameVersion?:string;grids?:unknown[]};
 if(!v||v.contract!=='wand.world.room-terrain@1'||v.platform!=='Steam'||v.gameVersion!=='1.26.2'||!Array.isArray(v.grids)||v.grids.length>128)throw Error('ROOM_TERRAIN');
 const out:RoomDesignTemplate[]=[],seen=new Set<string>();
 for(const row of v.grids){
  if(!Array.isArray(row)||row.length!==5||typeof row[0]!=='string')throw Error('ROOM_TERRAIN_ROW');
  const [path,x,y,hash,values]=row;if(!/^GridData\/Rooms\/(Room|Wall)[0-9]+x[0-9]+-GridData\.json$/.test(path)||seen.has(path)||!Number.isInteger(x)||!Number.isInteger(y)||x<1||y<1||x>256||y>256||typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash)||!Array.isArray(values)||values.length!==x*y||!values.every(n=>Number.isInteger(n)&&[0,1024,2048,3072].includes(n)))throw Error('ROOM_TERRAIN_ROW');
  seen.add(path);const kind=path.startsWith('GridData/Rooms/Room')?'floor':'wall';
  const grid:PublicTerrainGridRef={key:'room-design:'+path+':'+hash,layoutId:'DesignRooms/local-only.json',gridDataPath:path,gridIdNative:0,sizeX:x,sizeY:y,factor:2};
  out.push({grid,raster:{sizeX:x,sizeY:y,nativeFloorValues:Uint32Array.from(values)},kind,label:path.split('/').at(-1)!.replace(/^(Room|Wall)/,'').replace('-GridData.json','').replace('x',' × ')+(path.includes('Room12x10-')?' ('+x+' × '+y+')':'')});
 }
 if(!out.length)throw Error('ROOM_TERRAIN_EMPTY');return out.sort((a,b)=>a.kind.localeCompare(b.kind,'en')||a.grid.sizeX*a.grid.sizeY-b.grid.sizeX*b.grid.sizeY||a.grid.key.localeCompare(b.grid.key,'en'));
}
export function roomDesignValid(t:DesignTimeline,grid:PublicTerrainGridRef,raster:TerrainRaster,defs:ReadonlyMap<number,DesignItemGeometry>,allHistory=false):boolean{
 if(!isRoomDesign(grid)||raster.sizeX!==grid.sizeX||raster.sizeY!==grid.sizeY)return false;
 for(const snapshot of allHistory?t.snapshots:[t.snapshots[t.cursor]]){
  const tree:SupportTree={factor:grid.factor,sourcePath:grid.gridDataPath,objects:[]};
  const shapes:Record<string,import('./source-object-map.ts').SourceObjectShape>={};for(const id of new Set(snapshot.map(p=>p.itemId)))Object.assign(shapes,defs.get(id)?.shapes??{});
  for(const p of snapshot){const g=defs.get(p.itemId),orientation=CARDINAL_ORIENTATIONS[p.orientation];
   if(!g||g.layer!=='furniture'||g.surfaceCapable||!orientation||!supportPlacementFits(tree,shapes,raster,p.itemId,p.x,p.y,orientation))return false;
   tree.objects.push({itemId:p.itemId,x:p.x,y:p.y,orientation,child:null});
  }
 }return true;
}
export const roomDesignWords={ja:['屋内装飾設計','部屋を選択','部屋の地形を読み込めません。','屋外に戻る','配置可能な床面と家具の重なりを確認してください。'],en:['Indoor design','Choose room','Unable to load room terrain.','Back outdoors','Check floor compatibility and overlapping furniture.'],fr:['Décoration intérieure','Choisir une pièce','Impossible de charger le terrain.','Retour dehors','Vérifiez le sol et les chevauchements.'],it:['Decorazione interna','Scegli stanza','Impossibile caricare il terreno.','Torna all’esterno','Controlla pavimento e sovrapposizioni.'],de:['Inneneinrichtung','Raum auswählen','Raumgelände konnte nicht geladen werden.','Zurück nach draußen','Boden und Überschneidungen prüfen.'],'es-ES':['Diseño interior','Elegir habitación','No se pudo cargar el terreno.','Volver al exterior','Comprueba el suelo y los solapamientos.'],'zh-CN':['室内装饰设计','选择房间','无法加载房间地形。','返回室外','检查地面兼容性及家具重叠。'],'pt-BR':['Decoração interna','Escolher cômodo','Não foi possível carregar o terreno.','Voltar ao exterior','Verifique o piso e as sobreposições.']} as const;

export const roomSurfaceWords={ja:['床面','壁面','面全体のSceneを保存','実セーブへ配置する場合は対象面と解像度を確認してください。'],en:['Floor','Wall','Save entire surface as Scene','When applying to a Save, choose the matching surface and resolution.'],fr:['Sol','Mur','Enregistrer toute la surface','Pour appliquer à une sauvegarde, choisissez la surface et la résolution compatibles.'],it:['Pavimento','Parete','Salva tutta la superficie','Per applicare al salvataggio, scegli superficie e risoluzione compatibili.'],de:['Boden','Wand','Gesamte Fläche als Szene speichern','Zum Anwenden auf einen Spielstand passende Fläche und Auflösung wählen.'],'es-ES':['Suelo','Pared','Guardar toda la superficie','Al aplicar a una partida, elige la superficie y resolución compatibles.'],'zh-CN':['地面','墙面','保存整个表面的场景','应用到存档时请选择匹配的表面和分辨率。'],'pt-BR':['Piso','Parede','Salvar toda a superfície como cena','Ao aplicar ao save, escolha a superfície e resolução compatíveis.']} as const;
