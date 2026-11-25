<script lang="ts">
 import {onDestroy} from 'svelte';
 import {base} from '$app/paths';
 import {projectMainlandSaved,mainlandSavedAt,visibleMainlandSaved,mainlandSavedMoveEligible,mainlandSavedRotateEligible,mainlandSavedDraft,mainlandSavedCell,mainlandSavedDraftAtCell,mainlandSavedGroupDraft,mainlandSavedAdvancedDraft,mainlandGroupFactor,type MainlandSavedObject} from './mainland-saved-objects.ts';
 import {currentWorldEdits,emptyWorldTimeline,travelWorldTimeline,WORLD_BATCH_LIMIT,type WorldEditTimeline} from './saved-map-batch.ts';
 import type {SavedShapeMap} from './saved-shape-map.ts';
 import type {TerrainScopeReceipt} from './terrain-binding.ts';
 import {CARDINAL_ORIENTATIONS,isCardinal} from './saved-map-transform.ts';
 import {MAP_LAYER_COLORS} from './source-map-layers.ts';
 import {defaultWorldLayers,layerVisible,layerSelectable,type WorldLayerState} from './world-layer-state.ts';
 import WorldAlignmentControls from './WorldAlignmentControls.svelte';
 import type {MapAlignment} from './map-alignment.ts';
 import WorldLayerControls from './WorldLayerControls.svelte';
 import WorldObjectArtwork from './WorldObjectArtwork.svelte';
 import {worldArtwork,mapCellPixels,showWorldArtwork} from './world-artwork.ts';
 import {openPublicItemMaster,type PublicCompleteItemMaster} from '../items/public-item-master.ts';
 import {bindMainland,mainlandExtent,mainlandTerrainHits,type MainlandGrid} from './mainland-world-coordinates.ts';
 import {nativeSourceFloorTint} from './native-terrain-canvas.ts';
 import {defaultMapCamera,maxMapZoom,mapCameraViewBox,mapViewportBounds,zoomMapCamera,panMapCamera,wheelMapCamera,createMapPanGesture} from './map-camera.ts';
 import MapCameraControls from './MapCameraControls.svelte';
 import {worldShortcut,worldShortcutTarget,NUDGE} from './world-shortcuts.ts';
 import type {PublicTerrainGridRef} from './public-terrain-projection.ts';
 import type {TerrainRaster} from './terrain-binding.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 export let grids:readonly PublicTerrainGridRef[];
 export let title='';
 export let worker:Worker|null;
 export let nextRequest:()=>number;
 export let locale:WandLanguage='ja';
 export let label:(key:string)=>string;
 export let onChoose:(key:string,ordinal?:number)=>void;
 export let saveMode=false;
 export let sessions:readonly TerrainScopeReceipt[]=[];
 export let saveMaps:ReadonlyMap<string,SavedShapeMap>=new Map();
 export let saveLoading=false,saveFailed=false;
 export let timeline:WorldEditTimeline=emptyWorldTimeline();
 export let layerState:WorldLayerState=defaultWorldLayers();
 const saveWords={
  ja:['配置検索','レイヤー','編集へ移動','配置読み込み中…','一部の配置を取得できませんでした','座標未確認の配置は非表示','配置なし'],
  en:['Find objects','Layers','Edit object','Loading objects…','Some objects could not be loaded','Unverified coordinates omitted','No objects'],
  fr:['Rechercher','Calques','Modifier','Chargement des objets…','Certains objets sont indisponibles','Coordonnées non vérifiées exclues','Aucun objet'],
  it:['Cerca oggetti','Livelli','Modifica','Caricamento oggetti…','Alcuni oggetti non disponibili','Coordinate non verificate escluse','Nessun oggetto'],
  de:['Objekte suchen','Ebenen','Bearbeiten','Objekte werden geladen…','Einige Objekte fehlen','Ungeprüfte Koordinaten ausgeblendet','Keine Objekte'],
  'es-ES':['Buscar objetos','Capas','Editar','Cargando objetos…','Algunos objetos no disponibles','Coordenadas sin verificar excluidas','Sin objetos'],
  'zh-CN':['查找物品','图层','编辑物品','正在加载物品…','部分物品无法加载','未确认坐标已隐藏','无物品'],
  'pt-BR':['Buscar objetos','Camadas','Editar','Carregando objetos…','Alguns objetos indisponíveis','Coordenadas não verificadas omitidas','Sem objetos']
 } as const;
 $: sw=saveWords[locale]??saveWords.en;
 $: projection=saveMode&&bound?projectMainlandSaved(bound,sessions,saveMaps,currentWorldEdits(timeline)):{objects:[],omitted:0};
 $: allObjects=projection.objects.filter(p=>layerVisible(layerState,p.object));
 $: visibleObjects=visibleMainlandSaved(allObjects,viewport);
 let mapWidth=0,mapHeight=0,selected:number|null=null,query='',searchOpen=false,limit=60,layersOpen=false;
 let moving=false,hover:{x:number;y:number}|null=null;
 let groupIds:number[]=[],groupX:number|undefined=0,groupZ:number|undefined=0,groupOpen=false;
 let range:{pointer:number;start:{x:number;y:number};end:{x:number;y:number};clientX:number;clientY:number;moved:boolean}|null=null;
 $: groupSet=new Set(groupIds);
 $: group=allObjects.filter(p=>groupSet.has(p.object.localOrdinal)&&layerSelectable(layerState,p.object));
 $: pruneGroup(group,groupIds);
 function pruneGroup(items:readonly MainlandSavedObject[],ids:readonly number[]){if(items.length!==ids.length){groupIds=items.map(p=>p.object.localOrdinal);if(items.length<2){selected=items[0]?.object.localOrdinal??null;groupIds=[];groupOpen=false;}}}
 $: groupReady=group.length>1&&group.every(mainlandSavedMoveEligible)&&!saveLoading&&!saveFailed&&!pending.size&&!failed;
 let alignment:MapAlignment|null=null;
 $: uniformGroup=groupReady&&group.every(p=>p.factor===group[0].factor);
 $: alignmentPlan=uniformGroup&&alignment&&bound?mainlandSavedAdvancedDraft(group,bound,rasters,saveMaps,timeline,alignment):null;
 $: groupPlan=groupReady&&!alignment&&bound&&typeof groupX==='number'&&typeof groupZ==='number'?mainlandSavedGroupDraft(group,bound,rasters,saveMaps,timeline,groupX,groupZ):null;
 function clearGroup(){alignment=null;selectionLimit=false;groupIds=[];groupOpen=false;groupX=0;groupZ=0;range=null;}
 function setGroup(ids:number[]){const unique=[...new Set(ids)];if(unique.length>WORLD_BATCH_LIMIT){moveError=true;selectionLimit=true;return;}selectionLimit=false;alignment=null;stopMove();preciseOpen=false;selected=unique.length===1?unique[0]:null;groupIds=unique.length>1?unique:[];groupOpen=unique.length>1;groupX=0;groupZ=0;}
 function toggleGroup(id:number){const ids=new Set(groupIds.length?groupIds:selected===null?[]:[selected]);if(ids.has(id))ids.delete(id);else ids.add(id);setGroup([...ids]);}
 function applyAdvanced(action:MapAlignment|number){if(!uniformGroup||!bound)return;const q=mainlandSavedAdvancedDraft(group,bound,rasters,saveMaps,timeline,action);if(!q.next){moveError=true;return;}timeline=q.next;alignment=null;groupX=0;groupZ=0;stopMove();}
 function applyGroup(dx:number,dz:number){alignment=null;if(!groupReady||!bound)return;const q=mainlandSavedGroupDraft(group,bound,rasters,saveMaps,timeline,dx,dz);if(!q.next){moveError=true;return;}timeline=q.next;groupX=0;groupZ=0;stopMove();}

 let root:HTMLElement,preciseOpen=false,preciseX:number|undefined,preciseZ:number|undefined,preciseSeen='',moveError=false;
 let spacePan=false,suppressClick=false;
 type ObjectDrag={pointer:number;target:MainlandSavedObject;members:readonly MainlandSavedObject[];baseline:WorldEditTimeline;start:{x:number;y:number};cell:{x:number;z:number};clientX:number;clientY:number;end:{x:number;z:number};moved:boolean};
 let objectDrag:ObjectDrag|null=null;
 const editWords={ja:['移動','左回転','右回転','取消','元に戻す','やり直す','同じエリア内に移動してください'],en:['Move','Rotate left','Rotate right','Cancel','Undo','Redo','Move within the same area'],fr:['Déplacer','Rotation gauche','Rotation droite','Annuler','Annuler','Rétablir','Déplacez dans la même zone'],it:['Sposta','Ruota a sinistra','Ruota a destra','Annulla','Annulla','Ripeti','Sposta nella stessa zona'],de:['Verschieben','Links drehen','Rechts drehen','Abbrechen','Rückgängig','Wiederholen','Im selben Bereich verschieben'],'es-ES':['Mover','Girar a la izquierda','Girar a la derecha','Cancelar','Deshacer','Rehacer','Mueve dentro de la misma zona'],'zh-CN':['移动','向左旋转','向右旋转','取消','撤销','重做','请在同一区域内移动'],'pt-BR':['Mover','Girar à esquerda','Girar à direita','Cancelar','Desfazer','Refazer','Mova na mesma área']} as const;
 $: ew=editWords[locale]??editWords.en;
 const groupWords={ja:['複数選択','一括移動','選択解除','選択可能な家具を全選択','移動量（共通マス単位）','選択数','選択中に移動できない家具があるか、移動先が範囲外です。'],en:['Multi-select','Move group','Clear selection','Select all selectable objects','Offset (common cell units)','Selected','A selected object cannot be moved or a destination is outside its area.'],fr:['Sélection multiple','Déplacer le groupe','Désélectionner','Tout sélectionner','Décalage (cases communes)','Sélection','Un objet ne peut pas être déplacé ou sort de sa zone.'],it:['Selezione multipla','Sposta gruppo','Deseleziona','Seleziona tutto','Spostamento (celle comuni)','Selezionati','Un oggetto non è spostabile o esce dalla zona.'],de:['Mehrfachauswahl','Gruppe verschieben','Auswahl löschen','Alle auswählen','Versatz (gemeinsame Zellen)','Ausgewählt','Ein Objekt ist nicht verschiebbar oder außerhalb seines Bereichs.'],'es-ES':['Selección múltiple','Mover grupo','Deseleccionar','Seleccionar todo','Desplazamiento (celdas comunes)','Seleccionados','Un objeto no se puede mover o sale de su zona.'],'zh-CN':['多选','批量移动','取消选择','全选可选物品','移动量（公共格单位）','已选','选中物品不可移动或超出区域。'],'pt-BR':['Seleção múltipla','Mover grupo','Limpar seleção','Selecionar todos','Deslocamento (células comuns)','Selecionados','Um objeto não pode ser movido ou está fora da área.']} as const;
 $: gw=groupWords[locale]??groupWords.en;
 let multiMode=false,selectionLimit=false;
 const preciseWords={ja:['精密配置','適用','ワールド座標（対象の1マス単位）'],en:['Precise placement','Apply','World coordinates (object cell units)'],fr:['Placement précis','Appliquer','Coordonnées du monde (cases de l’objet)'],it:['Posizionamento preciso','Applica','Coordinate del mondo (celle dell’oggetto)'],de:['Präzise Platzierung','Anwenden','Weltkoordinaten (Objektzellen)'],'es-ES':['Colocación precisa','Aplicar','Coordenadas del mundo (celdas del objeto)'],'zh-CN':['精确放置','应用','世界坐标（物品格单位）'],'pt-BR':['Posicionamento preciso','Aplicar','Coordenadas do mundo (células do objeto)']} as const;
 $: pw=preciseWords[locale]??preciseWords.en;
 $: nativeCell=chosen?mainlandSavedCell(chosen):null;
 $: preciseSignature=chosen&&nativeCell?chosen.object.localOrdinal+':'+nativeCell.x+':'+nativeCell.z:'';
 $: if(preciseSignature!==preciseSeen){preciseSeen=preciseSignature;preciseX=nativeCell?.x;preciseZ=nativeCell?.z;moveError=false;}
 $: canMove=!!chosen&&!!nativeCell&&layerSelectable(layerState,chosen.object)&&mainlandSavedMoveEligible(chosen)&&!saveLoading&&!saveFailed&&!pending.size&&!failed;
 $: preciseChanged=typeof preciseX==='number'&&typeof preciseZ==='number'&&Number.isSafeInteger(preciseX)&&Number.isSafeInteger(preciseZ)&&!!nativeCell&&(preciseX!==nativeCell.x||preciseZ!==nativeCell.z);
 $: dragGroup=objectDrag?.moved&&bound&&objectDrag.members.length>1?mainlandSavedGroupDraft(objectDrag.members,bound,rasters,saveMaps,timeline,(objectDrag.end.x-objectDrag.cell.x)*mainlandGroupFactor(objectDrag.members)/objectDrag.target.factor,(objectDrag.end.z-objectDrag.cell.z)*mainlandGroupFactor(objectDrag.members)/objectDrag.target.factor):null;
 $: draggedDraft=objectDrag?.moved&&bound&&objectDrag.members.length===1?mainlandSavedDraftAtCell(objectDrag.target,bound,rasters,saveMaps,timeline,objectDrag.end.x,objectDrag.end.z,objectDrag.target.object.orientation):null;
 function applyCell(x:number,z:number){
  if(!canMove||!chosen||!bound)return false;
  const q=mainlandSavedDraftAtCell(chosen,bound,rasters,saveMaps,timeline,x,z,chosen.object.orientation);
  if(!q?.next){moveError=true;return false;}
  timeline=q.next;stopMove();return true;
 }
 function applyPrecise(){if(preciseChanged&&typeof preciseX==='number'&&typeof preciseZ==='number')applyCell(preciseX,preciseZ);}
 function pointerPoint(e:MouseEvent){const matrix=svg?.getScreenCTM();if(!matrix)return null;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());return {x:p.x,y:p.y};}
 function startPointer(e:PointerEvent){
  suppressClick=false;
  if(saveMode&&!moving&&!spacePan&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&e.button===0&&e.pointerType!=='touch'&&!pending.size&&!failed&&!saveLoading&&!saveFailed){
   const p=pointerPoint(e),hit=p?mainlandSavedAt(allObjects,p.x,p.y).find(o=>layerSelectable(layerState,o.object)):null,cell=hit?mainlandSavedCell(hit):null;
   if(p&&hit&&cell&&mainlandSavedMoveEligible(hit)){
    const members=groupSet.has(hit.object.localOrdinal)?group:[hit];
    objectDrag={pointer:e.pointerId,target:hit,members,baseline:timeline,start:p,cell,clientX:e.clientX,clientY:e.clientY,end:cell,moved:false};return;
   }
   if(p&&!hit&&multiMode){range={pointer:e.pointerId,start:p,end:p,clientX:e.clientX,clientY:e.clientY,moved:false};return;}
  }
  gesture.begin(e,camera.zoom>1&&(!moving||e.button===1||e.shiftKey||spacePan||e.pointerType==='touch'));
 }
 function updateObjectDrag(e:PointerEvent){
  const d=objectDrag;if(!d||d.pointer!==e.pointerId)return false;
  if(!d.moved&&Math.hypot(e.clientX-d.clientX,e.clientY-d.clientY)<5)return true;
  const p=pointerPoint(e);if(!p)return true;
  if(!d.moved){try{(e.currentTarget as Element).setPointerCapture(e.pointerId);}catch{/* pointer ended */}if(d.members.length===1){clearGroup();selected=d.target.object.localOrdinal;}}
  const f=d.members.length>1?mainlandGroupFactor(d.members):d.target.factor,scale=d.target.factor/f;
  objectDrag={...d,moved:true,end:{x:d.cell.x+Math.round((p.x-d.start.x)*f)*scale,z:d.cell.z+Math.round((d.start.y-p.y)*f)*scale}};e.preventDefault();return true;
 }
 function finishPointer(e:PointerEvent,commit:boolean){
  gesture.end(e);
  if(range?.pointer===e.pointerId){const r=range;range=null;if(r.moved){suppressClick=true;if(commit){const end=pointerPoint(e)??r.end;const left=Math.min(r.start.x,end.x),right=Math.max(r.start.x,end.x),top=Math.min(r.start.y,end.y),bottom=Math.max(r.start.y,end.y);setGroup(allObjects.filter(p=>layerSelectable(layerState,p.object)&&p.x<right&&p.x+(p.shape?.width??1)/p.factor>left&&p.y>top&&p.y-(p.shape?.height??1)/p.factor<bottom).map(p=>p.object.localOrdinal));}}return;}
  if(objectDrag?.pointer!==e.pointerId)return;
  if(commit)updateObjectDrag(e);
  const d=objectDrag;objectDrag=null;
  if(!d?.moved)return;
  suppressClick=true;
  if(!commit||d.baseline!==timeline||!bound||!layerSelectable(layerState,d.target.object)||saveLoading||saveFailed||pending.size||failed)return;
  if(d.members.length>1){if(d.members.some(p=>!layerSelectable(layerState,p.object)))return;const f=mainlandGroupFactor(d.members);const q=mainlandSavedGroupDraft(d.members,bound,rasters,saveMaps,timeline,(d.end.x-d.cell.x)*f/d.target.factor,(d.end.z-d.cell.z)*f/d.target.factor);if(q.next){timeline=q.next;groupX=0;groupZ=0;stopMove();}else moveError=true;return;}
  const q=mainlandSavedDraftAtCell(d.target,bound,rasters,saveMaps,timeline,d.end.x,d.end.z,d.target.object.orientation);
  if(q?.next){timeline=q.next;stopMove();}else moveError=true;
 }
 function keys(e:KeyboardEvent){
  if(!worldShortcutTarget(e,root))return;
  const mapFocused=e.target instanceof HTMLElement&&!!e.target.closest('.mainland-map');
  if(mapFocused&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.code==='Space'){spacePan=true;e.preventDefault();return;}
  if(saveMode&&mapFocused&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&(e.key==='['||e.key===']')){
   const list=allObjects.filter(p=>layerSelectable(layerState,p.object));if(!list.length)return;
   const i=list.findIndex(p=>p.object.localOrdinal===selected),delta=e.key==='['?-1:1;
   focus(list[i<0?(delta>0?0:list.length-1):(i+delta+list.length)%list.length]);e.preventDefault();return;
  }
  const action=worldShortcut(e);if(!action)return;
  if(action==='zoom-in'||action==='zoom-out'||action==='fit'){e.preventDefault();camera=action==='fit'?defaultMapCamera():zoomMapCamera(camera,camera.zoom*(action==='zoom-in'?2:.5),maxZoom);return;}
  if(!saveMode)return;
  if(action==='select-all'){e.preventDefault();setGroup(matches.map(p=>p.object.localOrdinal));return;}
  if(action==='undo'||action==='redo'){e.preventDefault();travel(action==='undo'?-1:1);return;}
  if(action==='cancel'){e.preventDefault();if(objectDrag||range){objectDrag=null;range=null;return;}if(alignment){alignment=null;return;}if(groupIds.length){clearGroup();return;}if(moving||preciseOpen){stopMove();preciseOpen=false;return;}selected=null;return;}
  if(action==='confirm'&&mapFocused&&moving&&draft?.next){e.preventDefault();timeline=draft.next;stopMove();return;}
  if(action==='rotate-left'||action==='rotate-right'){if(groupIds.length){e.preventDefault();applyAdvanced(action==='rotate-left'?-1:1);return;}if(chosen){e.preventDefault();rotate(action==='rotate-left'?-1:1);}return;}
  const n=NUDGE[action];if(groupIds.length){if(n){e.preventDefault();applyGroup(n[0],-n[1]);}return;}if(n&&nativeCell&&chosen){e.preventDefault();applyCell(nativeCell.x+n[0],nativeCell.z-n[1]);}
 }
 $: draft=moving&&hover&&chosen&&bound&&!pending.size&&!failed?mainlandSavedDraft(chosen,bound,rasters,saveMaps,timeline,hover.x,hover.y,chosen.object.orientation):null;
 function stopMove(){moving=false;hover=null;moveError=false;objectDrag=null;}
 function rotate(delta:number){if(!chosen||!bound||!isCardinal(chosen.object.orientation)||!layerSelectable(layerState,chosen.object)||!mainlandSavedRotateEligible(chosen)||pending.size||failed||saveLoading||saveFailed)return;const orientation=CARDINAL_ORIENTATIONS[(CARDINAL_ORIENTATIONS.indexOf(chosen.object.orientation)+delta+4)%4];const q=mainlandSavedDraft(chosen,bound,rasters,saveMaps,timeline,chosen.x+.25/chosen.factor,chosen.y-.25/chosen.factor,orientation);if(q?.next){timeline=q.next;stopMove();}}
 function travel(delta:-1|1){alignment=null;stopMove();timeline=travelWorldTimeline(timeline,delta);}
 function follow(e:PointerEvent){if(range?.pointer===e.pointerId){const p=pointerPoint(e);if(p&&(range.moved||Math.hypot(e.clientX-range.clientX,e.clientY-range.clientY)>=5)){if(!range.moved){try{(e.currentTarget as Element).setPointerCapture(e.pointerId);}catch{}}range={...range,end:p,moved:true};e.preventDefault();}return;}if(updateObjectDrag(e))return;const next=gesture.move(e,svg,extent,camera);if(next){camera=next;return;}if(moving){const m=svg.getScreenCTM();if(m){const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse());hover={x:p.x,y:p.y};}}}
 $: cellPixels=mapCellPixels(viewport,mapWidth,mapHeight);
 $: chosen=allObjects.find(p=>p.object.localOrdinal===selected)??null;
 let artwork=new Map<number,string>(),artworkPending=new Set<number>(),names=new Map<number,string>(),nameEpoch=0;
 let master:Promise<PublicCompleteItemMaster>|null=null;
 function loadArtwork(items:readonly MainlandSavedObject[]){for(const p of items){const id=Number(p.object.itemId);if(artworkPending.has(id))continue;artworkPending.add(id);void worldArtwork(base,id).then(u=>{if(u)artwork=new Map(artwork).set(id,u);}).catch(()=>{});}}
 $: if(saveMode&&mapWidth&&mapHeight)loadArtwork(visibleObjects.filter(p=>showWorldArtwork(p.object,p.shape,cellPixels/p.factor)));
 $: if(saveMode)void loadNames(locale);
 async function loadNames(language:WandLanguage){const epoch=++nameEpoch;try{master??=openPublicItemMaster(base,fetch,{scope:'complete',gameVersion:'1.26.2'});const db=await master,rows=await db.getBrowseNames(language);if(epoch===nameEpoch)names=new Map(rows);}catch{if(epoch===nameEpoch){names=new Map();master=null;}}}
 function name(p:MainlandSavedObject,lookup:ReadonlyMap<number,string>){return lookup.get(Number(p.object.itemId))??p.object.name??'—';}
 $: normalized=query.normalize('NFKC').toLocaleLowerCase().trim();
 $: matches=allObjects.filter(p=>layerSelectable(layerState,p.object)&&name(p,names).normalize('NFKC').toLocaleLowerCase().includes(normalized));
 $: if(searchOpen)loadArtwork(matches.slice(0,limit));
 function focus(p:MainlandSavedObject){clearGroup();stopMove();selected=p.object.localOrdinal;const zoom=Math.max(1,Math.min(maxZoom,extent.w/Math.max(12,(p.shape?.width??1)/p.factor*4),extent.h/Math.max(12,(p.shape?.height??1)/p.factor*4)));const clamp=(v:number)=>Math.max(.5/zoom,Math.min(1-.5/zoom,v));camera={zoom,x:clamp((p.x+(p.shape?.width??1)/p.factor/2-extent.x)/extent.w),y:clamp((p.y-(p.shape?.height??1)/p.factor/2-extent.y)/extent.h)};searchOpen=false;}

 export let onClose:()=>void;
 const copy={
 ja:['本島全体マップ','閉じる','地形読み込み中…','地形を取得できませんでした','重なる地形があるためエリアを選択してください','エリアを選択して編集へ移動'],
 en:['Mainland map','Close','Loading terrain…','Unable to load terrain','Choose an area where terrains overlap','Choose an area to edit'],
 fr:['Carte de la vallée','Fermer','Chargement…','Terrain indisponible','Choisissez une zone superposée','Choisissez une zone à modifier'],
 it:['Mappa della valle','Chiudi','Caricamento…','Terreno non disponibile','Scegli una zona sovrapposta','Scegli una zona da modificare'],
 de:['Karte des Tals','Schließen','Gelände wird geladen…','Gelände nicht verfügbar','Überlappenden Bereich auswählen','Bereich zur Bearbeitung wählen'],
 'es-ES':['Mapa del valle','Cerrar','Cargando terreno…','Terreno no disponible','Elige una zona superpuesta','Elige una zona para editar'],
 'zh-CN':['主岛地图','关闭','正在加载地形…','无法加载地形','请选择重叠地形中的区域','选择区域进入编辑'],
 'pt-BR':['Mapa do vale','Fechar','Carregando terreno…','Terreno indisponível','Escolha uma área sobreposta','Escolha uma área para editar']
 } as const;
 $: words=copy[locale]??copy.en;
 $: bound=bindMainland(grids);
 $: extent=mainlandExtent(bound??[]);
 $: maxZoom=maxMapZoom(Math.max(extent.w,extent.h));
 let camera=defaultMapCamera(),svg:SVGSVGElement;
 $: viewBox=mapCameraViewBox(camera,extent);
 $: viewport=mapViewportBounds(camera,extent);
 const gesture=createMapPanGesture();
 let subscribed:Worker|null=null,loadedFor:readonly PublicTerrainGridRef[]|null=null;
 let rasters=new Map<string,TerrainRaster>(),images=new Map<string,string>(),pending=new Map<number,string>(),failed=false;
 let overlaps:MainlandGrid[]=[];
 $: if(worker!==subscribed){subscribed?.removeEventListener('message',receive);subscribed=worker;subscribed?.addEventListener('message',receive);loadedFor=null;}
 $: if(worker&&bound&&grids!==loadedFor)load(worker,grids,bound);
 function load(w:Worker,all:readonly PublicTerrainGridRef[],source:readonly MainlandGrid[]){
  loadedFor=all;rasters=new Map();images=new Map();pending=new Map();failed=false;overlaps=[];
  for(const g of source){const id=nextRequest();pending.set(id,g.key);w.postMessage({command:'terrain',key:g.key,requestId:id});}
  pending=new Map(pending);
 }
 function makeImage(r:TerrainRaster){
  const c=document.createElement('canvas');c.width=r.sizeX;c.height=r.sizeY;
  const ctx=c.getContext('2d');if(!ctx)throw Error('canvas');
  const data=ctx.createImageData(r.sizeX,r.sizeY),palette=new Map<number,readonly [number,number,number]>();
  for(let i=0;i<r.nativeFloorValues.length;i++){const value=r.nativeFloorValues[i];if(value===0)continue;let rgb=palette.get(value);if(!rgb){rgb=nativeSourceFloorTint(value);palette.set(value,rgb);}data.data.set([rgb[0],rgb[1],rgb[2],255],i*4);}
  ctx.putImageData(data,0,0);return c.toDataURL('image/png');
 }
 function receive(e:MessageEvent){
  const d=e.data,k=pending.get(d?.requestId);if(!k)return;
  pending.delete(d.requestId);pending=new Map(pending);
  const g=bound?.find(x=>x.key===k);
  if(!g||d.kind!=='terrain'||d.key!==k||d.sizeX!==g.sizeX||d.sizeY!==g.sizeY||!(d.nativeFloorValues instanceof Uint32Array)||d.nativeFloorValues.length!==g.sizeX*g.sizeY){failed=true;return;}
  const r:TerrainRaster={sizeX:d.sizeX,sizeY:d.sizeY,nativeFloorValues:d.nativeFloorValues};
  try{images=new Map(images).set(k,makeImage(r));rasters=new Map(rasters).set(k,r);}catch{failed=true;}
 }
 function click(e:MouseEvent){
  if(suppressClick){suppressClick=false;return;}
  if(gesture.consumeClick()||e.detail===0||!bound||pending.size||failed)return;
  const m=svg.getScreenCTM();if(!m)return;
  const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse());
  if(saveMode&&moving&&chosen&&canMove){const q=mainlandSavedDraft(chosen,bound,rasters,saveMaps,timeline,p.x,p.y,chosen.object.orientation);if(q?.next){timeline=q.next;stopMove();}else hover={x:p.x,y:p.y};return;}
  if(saveMode){const hit=mainlandSavedAt(allObjects,p.x,p.y).find(o=>layerSelectable(layerState,o.object));if(hit){if(multiMode||e.ctrlKey||e.metaKey||e.shiftKey)toggleGroup(hit.object.localOrdinal);else{clearGroup();selected=hit.object.localOrdinal;}overlaps=[];return;}clearGroup();selected=null;overlaps=[];return;}
  const hits=mainlandTerrainHits(bound,rasters,p.x,p.y);
  overlaps=hits.length>1?hits:[];if(hits.length===1)onChoose(hits[0].key);
 }
 onDestroy(()=>{nameEpoch++;subscribed?.removeEventListener('message',receive);});
</script>
<svelte:window on:keydown={keys} on:keyup={e=>{if(e.code==='Space')spacePan=false;}} on:blur={()=>{spacePan=false;objectDrag=null;range=null;}}/>
<section class="mainland-overview" bind:this={root} aria-label={title||words[0]}>
 <div class="overview-tools"><strong>{title||words[0]}</strong>{#if saveMode}<button type="button" aria-label={gw[0]} title={gw[0]} aria-pressed={multiMode} on:click={()=>{multiMode=!multiMode;if(!multiMode)clearGroup();}}>▧</button><button type="button" aria-label={sw[0]} aria-pressed={searchOpen} on:click={()=>searchOpen=!searchOpen}><svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></svg></button><button type="button" aria-label={sw[1]} aria-pressed={layersOpen} on:click={()=>layersOpen=!layersOpen}><svg viewBox="0 0 24 24"><path d="m12 3 9 5-9 5-9-5 9-5M3 12l9 5 9-5M3 16l9 5 9-5"/></svg></button>{/if}<button type="button" aria-label={words[1]} title={words[1]} on:click={onClose}><svg viewBox="0 0 24 24"><path d="m6 6 12 12M6 18 18 6"/></svg></button></div>
 {#if !bound||failed}<p role="alert">{words[3]}</p>{:else if pending.size||images.size<bound.length}<p role="status">{words[2]} {images.size}/{bound.length}</p>{/if}
 <button class="mainland-map" type="button" bind:clientWidth={mapWidth} bind:clientHeight={mapHeight} aria-label={words[5]} on:click={click} on:wheel|nonpassive={e=>camera=wheelMapCamera(e,svg,extent,camera,maxZoom)}
 on:pointerdown={startPointer} on:pointermove={follow}
 on:pointerup={e=>finishPointer(e,true)} on:pointercancel={e=>finishPointer(e,false)} on:pointerleave={()=>{gesture.leave();hover=null;}}>
  <svg bind:this={svg} {viewBox} aria-hidden="true">
   <rect x={extent.x} y={extent.y} width={extent.w} height={extent.h} fill="#27313a"/>
   {#each [...(bound??[])].sort((a,b)=>a.origin.position[1]-b.origin.position[1]) as g (g.key)}
    {#if images.has(g.key)&&g.bounds.x+g.bounds.w>=viewport.x&&g.bounds.x<=viewport.x+viewport.w&&g.bounds.y+g.bounds.h>=viewport.y&&g.bounds.y<=viewport.y+viewport.h}
     <image class="mainland-terrain" data-area={g.key} href={images.get(g.key)} width={g.sizeX} height={g.sizeY} transform={'translate('+g.bounds.x+' '+(-2*g.origin.position[2])+') scale(1 -1)'} preserveAspectRatio="none" style="image-rendering:pixelated"/>
    {/if}
   {/each}
   {#each visibleObjects as p (p.object.localOrdinal)}
    <g class="mainland-save-object" transform={'translate('+p.x+' '+p.y+') scale('+1/p.factor+' '+(-1/p.factor)+')'} data-area={p.area}>
     {#if p.shape}<path d={p.shape.path} fill={MAP_LAYER_COLORS[p.object.layer]} fill-opacity={selected===p.object.localOrdinal||groupSet.has(p.object.localOrdinal)?.9:.65} stroke={selected===p.object.localOrdinal||groupSet.has(p.object.localOrdinal)?'#fff':MAP_LAYER_COLORS[p.object.layer]} vector-effect="non-scaling-stroke" stroke-width="1"/>
      {#if showWorldArtwork(p.object,p.shape,cellPixels/p.factor)&&artwork.has(Number(p.object.itemId))}<WorldObjectArtwork href={artwork.get(Number(p.object.itemId))!} width={p.shape.width} height={p.shape.height} flipY/>{/if}
     {:else}<rect width="1" height="1" fill="none" stroke="#e4d2a5" vector-effect="non-scaling-stroke"/>{/if}
     {#if p.object.subgrid}<circle cx={(p.shape?.width??1)/2} cy={(p.shape?.height??1)/2} r={Math.min(1.5,4*p.factor/Math.max(1,cellPixels))} fill="#d6a6ef" stroke="#fff" vector-effect="non-scaling-stroke"/>{/if}
    </g>
   {/each}
   {#if range?.moved}<rect x={Math.min(range.start.x,range.end.x)} y={Math.min(range.start.y,range.end.y)} width={Math.abs(range.end.x-range.start.x)} height={Math.abs(range.end.y-range.start.y)} fill="#b9c7d6" fill-opacity=".15" stroke="#fff" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>{/if}
   {#each (dragGroup??alignmentPlan??groupPlan)?.ghosts??[] as g (g.object.object.localOrdinal)}{#if g.object.shape}<path class="mainland-group-ghost" d={g.draft?.shape.path??g.object.shape.path} transform={'translate('+g.x+' '+g.y+') scale('+1/g.object.factor+' '+(-1/g.object.factor)+')'} fill={(dragGroup??alignmentPlan??groupPlan)?.next?'#4bddcd':'#ef5350'} fill-opacity=".65" stroke="#fff" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>{/if}{/each}
   {#if draggedDraft&&objectDrag}<path class="mainland-save-ghost" d={draggedDraft.shape.path} transform={'translate('+draggedDraft.x+' '+draggedDraft.y+') scale('+1/objectDrag.target.factor+' '+(-1/objectDrag.target.factor)+')'} fill={draggedDraft.valid?'#4bddcd':'#ef5350'} fill-opacity=".65" stroke="#fff" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>{/if}
   {#if draft&&chosen}<path class="mainland-save-ghost" d={draft.shape.path} transform={'translate('+draft.x+' '+draft.y+') scale('+1/chosen.factor+' '+(-1/chosen.factor)+')'} fill={draft.valid?'#4bddcd':'#ef5350'} fill-opacity=".65" stroke="#fff" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>{/if}
  </svg>
 </button>
 <MapCameraControls zoom={camera.zoom} {maxZoom} onZoom={value=>camera=zoomMapCamera(camera,value,maxZoom)} onFit={()=>camera=defaultMapCamera()} onPan={(dx,dy)=>camera=panMapCamera(camera,dx/camera.zoom,dy/camera.zoom)}/>
 {#if saveMode&&saveLoading}<p role="status" class="save-status">{sw[3]}</p>{:else if saveMode&&(saveFailed||projection.omitted)}<p class="save-status" role="status">{saveFailed?sw[4]:sw[5]} {projection.omitted||''}</p>{/if}
 {#if saveMode&&searchOpen}<aside class="overview-search"><input type="search" aria-label={sw[0]} placeholder={sw[0]} bind:value={query} on:input={()=>limit=60}/><div class="overview-results" on:scroll={e=>{const el=e.currentTarget;if(el.scrollTop+el.clientHeight>=el.scrollHeight-120)limit=Math.min(matches.length,limit+60);}}>{#each matches.slice(0,limit) as p (p.object.localOrdinal)}<button type="button" on:click={()=>{if(multiMode)toggleGroup(p.object.localOrdinal);else focus(p);}}>{#if artwork.has(Number(p.object.itemId))}<img src={artwork.get(Number(p.object.itemId))} alt="" loading="lazy"/>{/if}<span>{name(p,names)}</span></button>{/each}{#if !matches.length}<small>{sw[6]}</small>{/if}</div></aside>{/if}
 {#if saveMode&&layersOpen}<div class="overview-layers"><WorldLayerControls {locale} state={layerState} disabled={false} onChange={s=>{layerState=s;selected=null;clearGroup();stopMove();}}/></div>{/if}
 {#if saveMode&&selectionLimit}<p class="save-status" role="alert">{gw[5]}: {WORLD_BATCH_LIMIT} max</p>{/if}
 {#if saveMode&&groupOpen&&group.length>1}<form class="overview-precise" on:submit|preventDefault={()=>{if(typeof groupX==='number'&&typeof groupZ==='number')applyGroup(groupX,groupZ);}}><strong>{gw[5]}: {group.length} · {gw[4]}</strong><label>ΔX<input type="number" step="1" bind:value={groupX} disabled={!groupReady} on:input={()=>alignment=null}/></label><label>ΔZ<input type="number" step="1" bind:value={groupZ} disabled={!groupReady} on:input={()=>alignment=null}/></label><button type="submit" disabled={!groupPlan?.next}>{gw[1]}</button><button type="button" on:click={clearGroup}>{gw[2]}</button>{#if moveError||!groupReady||groupPlan&&groupPlan.ghosts.length&&!groupPlan.next}<small role="alert">{gw[6]}</small>{/if}<div class="group-advanced"><div class="group-rotation"><button type="button" title={ew[1]} aria-label={ew[1]} disabled={!uniformGroup} on:click={()=>applyAdvanced(-1)}>⟲</button><button type="button" title={ew[2]} aria-label={ew[2]} disabled={!uniformGroup} on:click={()=>applyAdvanced(1)}>⟳</button></div><WorldAlignmentControls {locale} count={group.length} selected={alignment} valid={!!alignmentPlan?.next} busy={!uniformGroup} onPick={mode=>{alignment=mode;groupX=0;groupZ=0;moveError=false;}} onCommit={()=>{if(alignment)applyAdvanced(alignment);}} onCancel={()=>alignment=null}/></div></form>{/if}
 {#if saveMode&&chosen}<div class="overview-selection"><strong>{name(chosen,names)}</strong><button type="button" aria-pressed={moving} disabled={!canMove} on:click={()=>{moving=!moving;hover=null;}}>{moving?ew[3]:ew[0]}</button><button type="button" aria-label={ew[1]} title={ew[1]} disabled={!layerSelectable(layerState,chosen.object)||!mainlandSavedRotateEligible(chosen)||saveLoading||saveFailed||failed||!!pending.size} on:click={()=>rotate(-1)}>⟲</button><button type="button" aria-label={ew[2]} title={ew[2]} disabled={!layerSelectable(layerState,chosen.object)||!mainlandSavedRotateEligible(chosen)||saveLoading||saveFailed||failed||!!pending.size} on:click={()=>rotate(1)}>⟳</button><button type="button" disabled={!layerSelectable(layerState,chosen.object)} on:click={()=>onChoose(chosen!.area,chosen!.object.localOrdinal)}>{sw[2]}</button><button type="button" aria-label={pw[0]} aria-pressed={preciseOpen} disabled={!canMove} on:click={()=>{preciseOpen=!preciseOpen;stopMove();}}>{pw[0]}</button>{#if moving||moveError}<small role={moveError?'alert':undefined}>{ew[6]}</small>{/if}</div>{/if}
 {#if saveMode&&chosen&&preciseOpen&&nativeCell}<form class="overview-precise" on:submit|preventDefault={applyPrecise}><strong>{pw[2]}</strong><label>X<input type="number" step="1" bind:value={preciseX} disabled={!canMove}/></label><label>Z<input type="number" step="1" bind:value={preciseZ} disabled={!canMove}/></label><button type="submit" disabled={!canMove||!preciseChanged}>{pw[1]}</button><button type="button" aria-label={words[1]} on:click={()=>preciseOpen=false}>×</button></form>{/if}
 {#if saveMode}<div class="overview-history">{#if multiMode}<button type="button" title={gw[3]} aria-label={gw[3]} on:click={()=>setGroup(matches.map(p=>p.object.localOrdinal))}>▦</button>{/if}<button type="button" aria-label={ew[4]} title={ew[4]} disabled={timeline.cursor===0} on:click={()=>travel(-1)}>↶</button><button type="button" aria-label={ew[5]} title={ew[5]} disabled={timeline.cursor===timeline.snapshots.length-1} on:click={()=>travel(1)}>↷</button></div>{/if}
 {#if overlaps.length}<div class="overlap-choices"><small>{words[4]}</small>{#each overlaps as g (g.key)}<button type="button" on:click={()=>onChoose(g.key)}>{label(g.key)}</button>{/each}</div>{/if}
</section>
<style>
 .mainland-overview{position:absolute;inset:0;z-index:14;background:var(--wand-bg);color:var(--wand-text);overflow:hidden;isolation:isolate}.mainland-map{position:absolute;inset:0;width:100%;height:100%;background:#27313a;border:0;padding:0;touch-action:none}.mainland-map svg{display:block;width:100%;height:100%}
 .overview-tools,.overlap-choices,.mainland-overview p{position:absolute;z-index:4;background:var(--wand-card);border:1px solid var(--wand-line);border-radius:6px;padding:5px 8px}.overview-tools{top:6px;left:6px;display:flex;gap:8px;align-items:center}.overview-tools button{display:grid;place-items:center;width:34px;height:34px}.overview-tools svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.7}.mainland-overview p{top:52px;left:6px;margin:0}.overlap-choices{left:8px;bottom:8px;display:grid;gap:4px;max-width:calc(100% - 70px)}button:not(.mainland-map){background:var(--wand-menu);color:inherit;border:1px solid var(--wand-line);border-radius:5px;cursor:pointer;padding:5px 8px}
 .overview-precise{position:absolute;z-index:6;right:6px;top:52px;display:grid;grid-template-columns:1fr 1fr auto;gap:6px;align-items:end;width:min(280px,calc(100% - 12px));padding:8px;background:var(--wand-card);border:1px solid var(--wand-line);border-radius:6px}.overview-precise strong{grid-column:1/-1;font-size:12px}.overview-precise label{display:grid;gap:3px;font-size:12px;min-width:0}.overview-precise input{box-sizing:border-box;width:100%;padding:6px;background:var(--wand-menu);color:inherit;border:1px solid var(--wand-line);border-radius:5px}.overview-precise button:disabled{opacity:.45}
 .group-advanced{grid-column:1/-1;display:grid;gap:6px}.group-rotation{display:flex;gap:4px}
 .overview-search,.overview-layers,.overview-selection{position:absolute;z-index:5;background:var(--wand-card);color:var(--wand-text);border:1px solid var(--wand-line);border-radius:6px;padding:6px}
 .overview-search{top:100px;bottom:45px;left:6px;width:min(270px,65%);display:flex;flex-direction:column;gap:5px}.overview-search input{font:inherit;background:var(--wand-menu);color:inherit;border:1px solid var(--wand-line);padding:6px;min-width:0}.overview-results{overflow:auto;display:grid;gap:3px;align-content:start}.overview-results button{display:flex;align-items:center;gap:7px;text-align:left;min-height:32px}.overview-results img{width:36px;height:36px;object-fit:contain}.overview-layers{top:52px;right:6px;max-height:75%;overflow:auto}.overview-selection{bottom:6px;left:6px;display:flex;align-items:center;gap:8px;max-width:calc(100% - 65px)} .mainland-overview p.save-status{top:52px;max-width:75%}.overview-selection{flex-wrap:wrap}.overview-history{position:absolute;z-index:5;right:60px;bottom:6px;display:flex;gap:4px}.overview-history button{min-width:34px;min-height:34px}
</style>
