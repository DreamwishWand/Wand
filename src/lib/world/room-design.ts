import type {PublicTerrainGridRef} from './public-terrain-projection.ts';
import type {TerrainRaster} from './terrain-binding.ts';
import type {DesignItemGeometry,DesignTimeline} from './design-layout.ts';
import {supportPlacementFits,supportTerrainRow,type SupportTree} from './subgrid-local.ts';
import {convertSceneFactor,parseSceneAnyFactor,type ScenePreset} from './scene-preset.ts';
import {captureSupportScene,type SupportScene} from './support-scene.ts';
import {CARDINAL_ORIENTATIONS} from './saved-map-transform.ts';
export interface RoomDesignTemplate{grid:PublicTerrainGridRef;raster:TerrainRaster;label:string;kind:'floor'|'wall'|'support';ownerItemId?:number}
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
   if(!g||g.layer!=='furniture'||g.surfaceCapable&&!g.supportPath||p.attachment&&(!g.supportPath||p.attachment.scene.ownerItemId!==p.itemId||p.attachment.scene.tree.sourcePath!==g.supportPath)||!orientation||!supportPlacementFits(tree,shapes,raster,p.itemId,p.x,p.y,orientation))return false;
   tree.objects.push({itemId:p.itemId,x:p.x,y:p.y,orientation,child:null});
  }
 }return true;
}
export const roomDesignWords={ja:['屋内装飾設計','部屋を選択','部屋の地形を読み込めません。','屋外に戻る','配置可能な床面と家具の重なりを確認してください。'],en:['Indoor design','Choose room','Unable to load room terrain.','Back outdoors','Check floor compatibility and overlapping furniture.'],fr:['Décoration intérieure','Choisir une pièce','Impossible de charger le terrain.','Retour dehors','Vérifiez le sol et les chevauchements.'],it:['Decorazione interna','Scegli stanza','Impossibile caricare il terreno.','Torna all’esterno','Controlla pavimento e sovrapposizioni.'],de:['Inneneinrichtung','Raum auswählen','Raumgelände konnte nicht geladen werden.','Zurück nach draußen','Boden und Überschneidungen prüfen.'],'es-ES':['Diseño interior','Elegir habitación','No se pudo cargar el terreno.','Volver al exterior','Comprueba el suelo y los solapamientos.'],'zh-CN':['室内装饰设计','选择房间','无法加载房间地形。','返回室外','检查地面兼容性及家具重叠。'],'pt-BR':['Decoração interna','Escolher cômodo','Não foi possível carregar o terreno.','Voltar ao exterior','Verifique o piso e as sobreposições.']} as const;

export const roomSurfaceWords={ja:['床面','壁面','面全体のSceneを保存','実セーブへ配置する場合は対象面と解像度を確認してください。'],en:['Floor','Wall','Save entire surface as Scene','When applying to a Save, choose the matching surface and resolution.'],fr:['Sol','Mur','Enregistrer toute la surface','Pour appliquer à une sauvegarde, choisissez la surface et la résolution compatibles.'],it:['Pavimento','Parete','Salva tutta la superficie','Per applicare al salvataggio, scegli superficie e risoluzione compatibili.'],de:['Boden','Wand','Gesamte Fläche als Szene speichern','Zum Anwenden auf einen Spielstand passende Fläche und Auflösung wählen.'],'es-ES':['Suelo','Pared','Guardar toda la superficie','Al aplicar a una partida, elige la superficie y resolución compatibles.'],'zh-CN':['地面','墙面','保存整个表面的场景','应用到存档时请选择匹配的表面和分辨率。'],'pt-BR':['Piso','Parede','Salvar toda a superfície como cena','Ao aplicar ao save, escolha a superfície e resolução compatíveis.']} as const;

/** A design-only surface for a DB-01-correlated owner/path. No Save
 * tessellation is inferred. The portable flat Scene is converted against
 * the actual target's native factor when importing into an existing support. */
export function supportDesignTemplate(raw:unknown,ownerItemId:number,path:string,label:string,factor:1|2=2):RoomDesignTemplate|null{
 if(!Number.isSafeInteger(ownerItemId)||Math.floor(ownerItemId/100000)!==400||!/^GridData\/Furniture\/[A-Za-z0-9_./ -]+\.json$/.test(path)||path.includes('..')||!label)return null;
 const raster=supportTerrainRow(raw,path);if(!raster||!raster.nativeFloorValues.some(v=>v!==0))return null;
 const row=(raw as {grids:unknown[][]}).grids.find(r=>Array.isArray(r)&&r[0]===path);if(!row)return null;
 const grid:PublicTerrainGridRef={key:'room-design:support:'+ownerItemId+':'+path+':'+row[3]+(factor===1?':f1':''),layoutId:'DesignRooms/local-only.json',gridDataPath:path,gridIdNative:0,sizeX:raster.sizeX,sizeY:raster.sizeY,factor};
 return {grid,raster,label,kind:'support',ownerItemId};
}
/** Import a flat arrangement into an explicitly chosen existing support.
 * Retain its original native path/factor; never create a guessed native Grid.
 * Center anchor is resolved using the exact destination geometry by caller. */
export function flatSupportScene(raw:string,owner:number,target:SupportTree,shapes:Readonly<Record<string,import('./source-object-map.ts').SourceObjectShape>>,terrain:TerrainRaster,allowed:ReadonlySet<number>):SupportScene|null{
 if(!target.sourcePath||target.objects.length)return null;
 let doc:ScenePreset|null;try{doc=convertSceneFactor(parseSceneAnyFactor(raw),target.factor);}catch{return null;}
 if(!doc||doc.items.length>32)return null;
 let width=0,height=0;
 for(const p of doc.items){const shape=shapes[p.itemId+':'+p.orientation*4];if(!shape||!allowed.has(p.itemId))return null;width=Math.max(width,p.dx+shape.width);height=Math.max(height,p.dy+shape.height);}
 const x=doc.anchor==='center'?Math.floor((terrain.sizeX*target.factor-width)/2):0,y=doc.anchor==='center'?Math.floor((terrain.sizeY*target.factor-height)/2):0;
 const tree:SupportTree={...target,objects:[]};
 for(const p of doc.items){const orientation=CARDINAL_ORIENTATIONS[p.orientation],px=x+p.dx,py=y+p.dy;if(!orientation||!supportPlacementFits(tree,shapes,terrain,p.itemId,px,py,orientation))return null;tree.objects.push({itemId:p.itemId,x:px,y:py,orientation,child:null});}
 return captureSupportScene(owner,tree);
}
export const supportDesignWords={ja:['支持家具の小物配置','家具名で検索','小物Sceneを既存の空の支持面へ配置'],en:['Support furniture arrangement','Search furniture','Place a flat Scene on an existing empty support'],fr:['Décoration sur meuble','Rechercher un meuble','Placer une scène sur un support vide'],it:['Decorazione su mobile','Cerca mobile','Posiziona scena su un supporto vuoto'],de:['Auflagen gestalten','Möbel suchen','Szene auf einer leeren Auflage platzieren'],'es-ES':['Diseño de soportes','Buscar muebles','Colocar escena en un soporte vacío'],'zh-CN':['支撑家具摆设','搜索家具','在现有空支撑面放置场景'],'pt-BR':['Decorar móveis de apoio','Buscar móveis','Colocar cena em um apoio vazio']} as const;
