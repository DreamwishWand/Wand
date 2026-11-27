<script lang="ts">
 import {regionBackupWords} from './region-decoration-backup.ts';
 import {captureRegionBounds,validCaptureRegion,resizeCaptureRegion,captureRegionPlan,captureRegionWords,type CaptureRegion,type CaptureOptions} from './scene-capture-region.ts';
 import {onDestroy} from 'svelte';
 import IslandFurniturePreset from './IslandFurniturePreset.svelte';
 import {worldDecorationWords} from './island-decoration-preset.ts';
 import {islandSaveGrids,islandSaveWords,worldDecorationScope} from './island-save-preset.ts';
 import BiomeNetworkPreset from './BiomeNetworkPreset.svelte';
 import {networkPresetWords} from './biome-network-preset.ts';
 import {connectedNetworkWords,buildNetworkMap,networkMapColor,visibleNetworkEdges,type NetworkMapReceipt} from './network-map-display.ts';
 import BiomeFurniturePreset from './BiomeFurniturePreset.svelte';
 import {biomeFurnitureWords} from './biome-furniture-preset.ts';
 import SubgridInspector from './SubgridInspector.svelte';
 import SaveSupportMap from './SaveSupportMap.svelte';
 import {supportMarkerHit,supportMapSearch,supportMapWitnessKey,supportSearchWords,visibleSupportParents,type SupportMapContents,type SupportMapParent} from './support-map-preview.ts';
 import {supportWords,supportParentEligible,supportParentCandidate,type SupportParentCandidate} from './subgrid-local.ts';
 import SaveFurniturePalette from './SaveFurniturePalette.svelte';
 import GroupPickupControls from './GroupPickupControls.svelte';
 import GroupPasteControls from './GroupPasteControls.svelte';
 import {sceneWords} from './scene-preset.ts';
 import {groupPickupPlan} from './group-pickup.ts';
 import {captureFurnitureGroup,captureCutWitness,worldFurnitureClipboard,groupPasteWords,groupCutWords,groupSymmetryWords,type GroupPasteCandidate,type WorldSymmetryAxis} from './group-paste.ts';
 import {savedAdjacentNetwork,adjacentNetworkWords} from './saved-adjacent-network.ts';
 import {stockToolWords,type StockCandidate} from './save-furniture-placement.ts';
 import {captureSaveDesign,captureWords,type SaveDesignCapture} from './save-design-capture.ts';
 import {base} from '$app/paths';
 import {browser} from '$app/environment';
 import {testSaveExportEnabled,testSaveWords} from './test-save-export.ts';
 import {experimentalCopyDownload} from './experimental-copy.ts';
 import {cardinalRoadCandidate,roadSeedEligible,cardinalRoadWords,cardinalFenceCandidate,fenceSeedEligible,isolatedFenceWords,fenceReplacementCandidate,fenceMutationWords,diagonalFenceWords,diagonalMutationWords,roadMutationWords,savedNetworkFreehand,appendSavedStroke,savedBrushWords,networkPaletteWords,isNetworkStyle,networkItemId,type NetworkSource,type NetworkStyle,ROAD_COPY_LIMIT,FENCE_COPY_LIMIT,type CardinalRoadTool,type CardinalRoadCandidate,type CardinalFenceCandidate} from './cardinal-road-save.ts';
 import {checkpointWords} from './world-checkpoint-words.ts';
 import {localSaveSession,commitWorldCheckpoint,travelWorldCheckpoint} from '../ui/local-save-session';
 import {projectMainlandSaved,mainlandSavedAt,mainlandSavedInRect,visibleMainlandSaved,mainlandSavedMoveEligible,mainlandSavedGroupMoveEligible,mainlandSavedRotateEligible,mainlandSavedDraft,mainlandSavedCell,mainlandSavedDraftAtCell,mainlandSavedGroupDraft,mainlandSavedAdvancedDraft,mainlandGroupFactor,mainlandTransferCandidate,type MainlandTransferPlan,type MainlandSavedObject} from './mainland-saved-objects.ts';
 import {currentWorldEdits,emptyWorldTimeline,travelWorldTimeline,WORLD_BATCH_LIMIT,type WorldEditTimeline} from './saved-map-batch.ts';
 import type {SavedShapeMap} from './saved-shape-map.ts';
 import type {TerrainScopeReceipt} from './terrain-binding.ts';
 import {CARDINAL_ORIENTATIONS,isCardinal} from './saved-map-transform.ts';
 import {MAP_LAYER_COLORS} from './source-map-layers.ts';
 import {defaultWorldLayers,layerVisible,layerSelectable,type WorldLayerState} from './world-layer-state.ts';
 import WorldAlignmentControls from './WorldAlignmentControls.svelte';
 import WorldSymmetryControls from './WorldSymmetryControls.svelte';
 import type {DesignSymmetry} from './design-symmetry.ts';
 import {savedSymmetryDraft,type SavedSymmetryAction} from './saved-world-symmetry.ts';
 import type {MapAlignment} from './map-alignment.ts';
 import WorldLayerControls from './WorldLayerControls.svelte';
 import WorldObjectArtwork from './WorldObjectArtwork.svelte';
 import {worldArtwork,mapCellPixels,showWorldArtwork} from './world-artwork.ts';
 import {openPublicItemMaster,type PublicCompleteItemMaster} from '../items/public-item-master.ts';
 import {bindMainland,bindFloatingIslandGrid,mainlandExtent,mainlandTerrainHits,type MainlandGrid} from './mainland-world-coordinates.ts';
 import {nativeSourceFloorTint} from './native-terrain-canvas.ts';
 import {defaultMapCamera,maxMapZoom,mapCameraViewBox,mapViewportBounds,zoomMapCamera,panMapCamera,wheelMapCamera,createMapPanGesture} from './map-camera.ts';
 import MapCameraControls from './MapCameraControls.svelte';
 import WorldGridLines from './WorldGridLines.svelte';
 import {sourceOrientationAngle} from './source-object-map.ts';
 import {worldShortcut,worldShortcutTarget,NUDGE} from './world-shortcuts.ts';
 import type {PublicTerrainGridRef} from './public-terrain-projection.ts';
 import type {TerrainRaster} from './terrain-binding.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 export let grids:readonly PublicTerrainGridRef[];
 export let independent=false;
 export let sourceGrids:readonly PublicTerrainGridRef[]=[];
 $: islandGrids=independent?islandSaveGrids(grids[0]??null,sourceGrids):[];
 $: isw=islandSaveWords[locale];
 export let areaOptions:readonly {key:string;label:string}[]=[];
 export let onAreaChange:(key:string)=>void=()=>{};
 export let title='';
 export let worker:Worker|null;
 export let nextRequest:()=>number;
 export let locale:WandLanguage='ja';
 export let label:(key:string)=>string;
 export let onChoose:(key:string,ordinal?:number)=>void;
 export let saveMode=false;
 export let worldOptions:readonly {key:string;label:string}[]=[];
 export let worldKey='';
 export let onWorldChange:(key:string)=>void=()=>{};
 export let onDesign:()=>void=()=>{};
 export let onCapture:(capture:SaveDesignCapture)=>void=()=>{};
 export let onIndoor:()=>void=()=>{};
 import {indoorWords} from './indoor-room-view.ts';
 $: indoorText=indoorWords[locale]??indoorWords.en;
 let biomeNetwork=false,worldPresetOpen=false,backupRegion:CaptureRegion|null=null;
 $: rgw=regionBackupWords[locale];
 $: worldPresetWords=worldDecorationWords[locale];
 $: wholeWorldReady=!independent&&!!bound&&!!worldDecorationScope(bound);
 $: regionBackupReady=wholeWorldReady||independent&&!!bound&&bound.length===1&&islandGrids.some(g=>g.key===bound![0].key);
 $: bpn=networkPresetWords[locale];
 let biomeOpen=false,biomeGhosts:readonly StockCandidate[]=[],biomeRemoved:readonly MainlandSavedObject[]=[];
 $: bpw=biomeFurnitureWords[locale];
 function closeBiome(){biomeOpen=false;biomeNetwork=false;worldPresetOpen=false;backupRegion=null;biomeGhosts=[];biomeRemoved=[];}
 function openBiome(network=false,world=false){if(!furnitureReady||furnitureBlocked||(world?!wholeWorldReady:worldKey!=='Village04'&&!islandGrids.length))return;beginPaste();worldPresetOpen=world;biomeNetwork=network;biomeOpen=true;}
 $: if(biomeOpen&&(!furnitureReady||furnitureBlocked||networkOpen||roadSeed||supportOpen||furnitureOpen||pasteActive||groupPickupActive||editSymmetryOpen))closeBiome();
 let captureError=false;
 $: cw=captureWords[locale]??captureWords.en;
 $: canCapture=!independent&&saveMode&&!!bound&&bound.every(g=>g.factor===1)&&!saveLoading&&!saveFailed&&!pending.size&&!failed&&projection.objects.length>0;
 function copyLayout(selection:boolean){
  if(!canCapture||!bound)return;
  const ids=groupIds.length?groupIds:selected===null?[]:[selected];
  const items=selection?projection.objects.filter(p=>ids.includes(p.object.localOrdinal)):projection.objects;
  const capture=captureSaveDesign(bound,rasters,saveMaps,items,selection?0:projection.omitted);
  captureError=!capture;if(capture)onCapture(capture);
 }
 const designWords={ja:'装飾設計',en:'Decoration design',fr:'Décoration',it:'Progettazione',de:'Dekoration','es-ES':'Decoración','zh-CN':'装饰设计','pt-BR':'Decoração'} as const;
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
 let networkReadWorker:Worker|null=null,networkReadFile:File|null=null,networkReadKey='',networkReceipts:NetworkMapReceipt[]=[];
 function readMapNetworks(f:File|null,grids:readonly MainlandGrid[]|null,enabled:boolean){
  const key=grids?.map(g=>g.key).join('|')??'';
  if(!enabled||!f||!grids?.length){networkReadWorker?.terminate();networkReadWorker=null;networkReadFile=null;networkReadKey='';networkReceipts=[];return;}
  if(f===networkReadFile&&key===networkReadKey)return;
  networkReadWorker?.terminate();networkReceipts=[];networkReadFile=f;networkReadKey=key;
  const own=new Worker(new URL('./furniture-stock-preview.worker.ts',import.meta.url),{type:'module'});networkReadWorker=own;
  const done=(d:unknown)=>{own.terminate();if(networkReadWorker!==own)return;networkReadWorker=null;if(d&&typeof d==='object'&&'kind' in d&&d.kind==='map-networks'&&'receipts' in d&&Array.isArray(d.receipts))networkReceipts=d.receipts;};
  own.onmessage=e=>done(e.data);own.onerror=()=>done(null);own.onmessageerror=()=>done(null);
  own.postMessage({command:'inspect-map-networks',file:f,plan:grids.map(g=>({key:g.key,destination:{layoutId:g.layoutId,gridDataPath:g.gridDataPath,factor:g.factor,sizeX:g.sizeX,sizeY:g.sizeY}}))});
 }
 $: readMapNetworks($localSaveSession.file,bound,saveMode&&furnitureReady&&!furnitureBlocked);
 $: nativeNetwork=buildNetworkMap(bound??[],projection.objects,networkReceipts);
 $: networkEdges=layerVisible(layerState,{layer:'fence'})?visibleNetworkEdges(nativeNetwork.edges,viewport):[];
 let mapWidth=0,mapHeight=0,selected:number|null=null,query='',searchOpen=false,limit=60,layersOpen=false,showGrid=true;
 let moving=false,hover:{x:number;y:number}|null=null;
 let saveRevision=-1;
 $: if($localSaveSession.revision!==saveRevision){saveRevision=$localSaveSession.revision;resetSaveSelection();}
 function resetSaveSelection(){closeBiome();closeCaptureRegion();resetEditSymmetry();pasteTools?.cancel();closeSupport();closeRoad();selected=null;clearGroup();stopMove();preciseOpen=false;multiMode=false;overlaps=[];furnitureTools?.cancel();}
 let supportOpen=false,supportPlacing=false,supportGhost:SupportParentCandidate|null=null,supportPreview:SupportParentCandidate|null=null,supportInspector:SubgridInspector;
 let initialSupportPoint:{x:number;y:number}|null=null,initialSupportPath:readonly number[]|null=null;
 let supportContents=new Map<string,SupportMapContents>();
 $: supportDisplay= supportGhost??supportPreview??directParentPreview;
 $: supportText=supportWords[locale];
 $: supportCanMove=!!chosen&&testExport&&furnitureReady&&!furnitureBlocked&&layerSelectable(layerState,chosen.object)&&layerSelectable(layerState,{layer:'surface'});
 $: supportMapInteractive=saveMode&&furnitureReady&&!furnitureBlocked&&!supportOpen&&!moving&&!furniturePlacing&&!furnitureGhost&&!pasteActive&&!groupPickupActive&&!networkOpen&&!roadSeed&&!biomeOpen&&!captureRegion&&!editSymmetryPicking&&!multiMode;
 $: supportAllParents=allObjects.filter(p=>p.object.subgrid&&p.shape).map((p):SupportMapParent=>({localOrdinal:p.object.localOrdinal,itemId:Number(p.object.itemId),x:p.object.x,y:p.object.y,mapX:p.x,mapY:p.y-p.shape!.height/p.factor,mapW:p.shape!.width/p.factor,mapH:p.shape!.height/p.factor,count:p.object.subgrid?.objectCount,selectable:supportMapInteractive&&layerSelectable(layerState,p.object)&&layerSelectable(layerState,{layer:'surface'})}));
 $: supportMapParents=visibleSupportParents(supportAllParents,viewport);
 $: supportSearchParents=supportAllParents.filter(p=>p.selectable&&p.count!==0);
 $: supportSearchActive=searchOpen&&!!normalized&&layerVisible(layerState,{layer:'surface'})&&supportMapInteractive;
 $: supportMatches=supportSearchActive?supportMapSearch(supportSearchParents,supportContents,names,normalized):[];
 $: supportPending=supportSearchActive?supportSearchParents.filter(p=>!supportContents.has(supportMapWitnessKey(p))).length:0;
 $: supportUnavailable=supportSearchActive?supportSearchParents.filter(p=>supportContents.get(supportMapWitnessKey(p))===null).length:0;
 $: ssw=supportSearchWords[locale];
 $: if(supportOpen&&(!saveMode||!chosen?.object.subgrid))closeSupport();
 function closeSupport(){supportInspector?.cancel();supportOpen=false;supportPlacing=false;supportGhost=null;supportPreview=null;initialSupportPoint=null;initialSupportPath=null;}
 function openSupport(p:MainlandSavedObject|null=chosen,child:readonly number[]|null=null){if(!p?.object.subgrid)return;initialSupportPoint=null;initialSupportPath=child;resetEditSymmetry();pasteTools?.cancel();closeRoad();closeFurniture();stopMove();searchOpen=false;layersOpen=false;preciseOpen=false;supportOpen=true;}
 let furnitureOpen=false,furniturePlacing=false,furnitureGhost:StockCandidate|null=null,furnitureTools:SaveFurniturePalette;
 let pasteTools:GroupPasteControls,pasteActive=false,pasteGhost:GroupPasteCandidate|null=null,pasteAxis:WorldSymmetryAxis|null=null;
 $: pasteWords=groupPasteWords[locale];$: sy=groupSymmetryWords[locale];$: sceneText=sceneWords[locale];
 let regionBackupMode=false,captureRegion:CaptureRegion|null=null,captureOptions:CaptureOptions={roads:false,fences:false},captureMembers:MainlandSavedObject[]=[];
 let captureDrag:{pointer:number;start:{x:number;y:number};region:CaptureRegion;edge:'move'|'nw'|'ne'|'sw'|'se'}|null=null;
 $: crw=captureRegionWords[locale];
 $: canCaptureScene=furnitureReady&&!furnitureBlocked&&!networkOpen&&!roadSeed&&!supportOpen&&!furniturePlacing&&!pasteActive&&!groupPickupActive&&!!captureRegionBounds(pasteSelection);
 $: capturePlan=captureRegion?captureRegionPlan(captureRegion,captureMembers,projection.objects,captureOptions,projection.omitted):null;
 $: if(captureRegion&&(!furnitureReady||furnitureBlocked||networkOpen||roadSeed||supportOpen||furniturePlacing||pasteActive||groupPickupActive||editSymmetryOpen))closeCaptureRegion();
 function closeCaptureRegion(){regionBackupMode=false;captureRegion=null;captureMembers=[];captureDrag=null;}
 function openRegionBackup(){
  if(!regionBackupReady||!furnitureReady||furnitureBlocked)return;const r=captureRegionBounds(pasteSelection)??{x:Math.round((extent.x+(extent.w-Math.min(16,extent.w))/2)*2)/2,y:Math.round((extent.y+(extent.h-Math.min(16,extent.h))/2)*2)/2,w:Math.min(16,extent.w),h:Math.min(16,extent.h)};
  if(!validCaptureRegion(r,extent))return;beginPaste();regionBackupMode=true;captureRegion=r;
 }
 function openCaptureRegion(){
  const r=captureRegionBounds(pasteSelection);if(!canCaptureScene||!r||!validCaptureRegion(r,extent))return;
  resetEditSymmetry();closeFurniture();stopMove();preciseOpen=false;alignment=null;searchOpen=false;layersOpen=false;
  captureMembers=[...pasteSelection];captureOptions={roads:captureMembers.some(p=>p.object.layer==='ground'),fences:captureMembers.some(p=>p.object.layer==='fence')};captureRegion=r;
 }
 function startCaptureDrag(e:PointerEvent){
  if(!captureRegion||e.button!==0||spacePan||e.shiftKey||e.pointerType==='touch')return false;
  const p=pointerPoint(e);if(!p)return false;
  const r=captureRegion,d=Math.max(.15,8/Math.max(1,cellPixels));
  const near=(x:number,y:number)=>Math.abs(p.x-x)<=d&&Math.abs(p.y-y)<=d;
  const edge=near(r.x,r.y)?'nw':near(r.x+r.w,r.y)?'ne':near(r.x,r.y+r.h)?'sw':near(r.x+r.w,r.y+r.h)?'se':p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h?'move':null;
  if(!edge)return false;
  captureDrag={pointer:e.pointerId,start:p,region:r,edge};try{(e.currentTarget as Element).setPointerCapture(e.pointerId);}catch{}e.preventDefault();return true;
 }
 function updateCaptureDrag(e:PointerEvent){
  const d=captureDrag;if(!d||d.pointer!==e.pointerId)return false;
  const p=pointerPoint(e);if(p)captureRegion=resizeCaptureRegion(d.region,extent,d.edge,p.x-d.start.x,p.y-d.start.y);
  e.preventDefault();return true;
 }
 function setCaptureDimension(k:keyof CaptureRegion,value:number){
  if(!captureRegion)return;const next={...captureRegion,[k]:value};if(validCaptureRegion(next,extent))captureRegion=next;
 }
 function confirmCaptureRegion(){if(regionBackupMode){if(!captureRegion||!validCaptureRegion(captureRegion,extent))return;const r=captureRegion;if(!regionBackupReady||!furnitureReady||furnitureBlocked)return;openBiome(false,!independent);if(biomeOpen)backupRegion=r;return;}if(!capturePlan?.valid||!captureRegion||!validCaptureRegion(captureRegion,extent)||!furnitureReady||furnitureBlocked)return;const items=capturePlan.items;closeCaptureRegion();pasteTools?.saveScene(items);}
$: cutWords=groupCutWords[locale];
 $: pasteSelection=group.length?group:chosen?[chosen]:[];
 $: canCutFurniture=testExport&&furnitureReady&&!furnitureBlocked&&!networkOpen&&!roadSeed&&!supportOpen&&!furniturePlacing&&!!captureCutWitness(pasteSelection);
 $: canCopyFurniture=testExport&&furnitureReady&&!furnitureBlocked&&!networkOpen&&!roadSeed&&!supportOpen&&!furniturePlacing&&!!captureFurnitureGroup(pasteSelection,false,freePlacement);
 function beginPaste(){closeBiome();closeCaptureRegion();resetEditSymmetry();closeSupport();closeRoad();closeFurniture();clearGroup();stopMove();selected=null;preciseOpen=false;searchOpen=false;layersOpen=false;multiMode=false;}
 $: furnitureWords=stockToolWords[locale]??stockToolWords.en;
 $: furnitureBlocked=!!currentWorldEdits(timeline).length;
 $: furnitureReady=!saveLoading&&!saveFailed&&!pending.size&&!failed&&!!bound&&saveMode;
 function closeFurniture(){furnitureTools?.cancel();furnitureOpen=false;}
 function toggleFurniture(){pasteTools?.cancel();closeRoad();closeSupport();if(furnitureOpen){closeFurniture();return;}clearGroup();stopMove();searchOpen=false;layersOpen=false;preciseOpen=false;furnitureOpen=true;}
 function beginFurniture(){resetEditSymmetry();closeSupport();closeRoad();clearGroup();stopMove();preciseOpen=false;searchOpen=false;layersOpen=false;multiMode=false;}
 let transfer:MainlandTransferPlan|null=null,transferWorker:Worker|null=null,transferStatus:'idle'|'working'|'valid'|'error'|'dependency'='idle',transferSource:File|null=null,transferBaseline:WorldEditTimeline|null=null,transferOrdinal:number|null=null;
 const transferWords={ja:['別エリアへの移動候補','構造を検証','構造検証中…','構造検証に成功しました。ゲーム内の参照は未確認のため反映・出力はできません。','移動先のセーブ構造または家具の状態が未対応です。','取消','ワールド'],en:['Transfer candidate','Validate structure','Checking structure…','Structure validated. Runtime references are unverified; no changes or export.','Unsupported destination structure or furniture state.','Cancel','World'],fr:['Déplacement vers une autre zone','Vérifier la structure','Vérification…','Structure validée. Références en jeu non vérifiées ; aucune modification ni export.','Destination ou état non pris en charge.','Annuler','Monde'],it:['Spostamento in altra zona','Verifica struttura','Verifica…','Struttura valida. Riferimenti di gioco non verificati; nessuna modifica o esportazione.','Destinazione o stato non supportato.','Annulla','Mondo'],de:['Transfer in anderes Gebiet','Struktur prüfen','Prüfung…','Struktur gültig. Spielreferenzen ungeprüft; keine Änderung oder Ausgabe.','Ziel oder Objektzustand nicht unterstützt.','Abbrechen','Welt'],'es-ES':['Traslado a otra zona','Verificar estructura','Verificando…','Estructura válida. Referencias del juego sin verificar; sin cambios ni exportación.','Destino o estado no compatible.','Cancelar','Mundo'],'zh-CN':['跨区域移动候选','验证结构','正在验证…','结构验证成功。游戏引用尚未验证，不能应用或导出。','目标结构或家具状态不支持。','取消','世界'],'pt-BR':['Transferência para outra área','Validar estrutura','Verificando…','Estrutura validada. Referências do jogo não verificadas; sem alteração ou exportação.','Destino ou estado não suportado.','Cancelar','Mundo']} as const;
 $: tw=transferWords[locale]??transferWords.en;
 $: copyWords=testSaveWords[locale]??testSaveWords.en;
 const testExport=browser&&testSaveExportEnabled(window.location);
 let freePlacement=false;
 const freeWords={ja:['自由配置','ゲーム内の配置・操作制限を解除します。ゲームが配置を修正する場合があります。'],en:['Free placement','Ignore game placement and operation restrictions. The game may adjust placements.'],fr:['Placement libre','Ignore les restrictions du jeu. Le jeu peut corriger les placements.'],it:['Posizionamento libero','Ignora i limiti del gioco. Il gioco può correggere le posizioni.'],de:['Freie Platzierung','Spielbeschränkungen ignorieren. Das Spiel kann Platzierungen korrigieren.'],'es-ES':['Colocación libre','Ignora las restricciones del juego. El juego puede ajustar la colocación.'],'zh-CN':['自由摆放','忽略游戏摆放和操作限制。游戏可能调整位置。'],'pt-BR':['Posicionamento livre','Ignora restrições do jogo. O jogo pode ajustar posições.']} as const;
 $: fpw=freeWords[locale];
 function toggleFreePlacement(){closeFurniture();closeSupport();closeBiome();closeCaptureRegion();closeRoad();resetEditSymmetry();pasteTools?.cancel();stopMove();freePlacement=!freePlacement;}
 let roadPointer:number|null=null,roadTrail:{x:number;y:number}[]=[],roadTrailInvalid=false;
 $: brushWords=savedBrushWords[locale];
 let roadSeed:NetworkSource|null=null,roadStart:{x:number;y:number}|null=null,roadDraft:CardinalRoadCandidate|CardinalFenceCandidate|null=null,roadTool:CardinalRoadTool='line',roadSource:File|null=null,roadBaseline:WorldEditTimeline|null=null,roadWorker:Worker|null=null,roadCopy:ReturnType<typeof experimentalCopyDownload>|null=null,roadError=false;
 $: rw=cardinalRoadWords[locale];
 $: fw=isolatedFenceWords[locale];
 $: fm=fenceMutationWords[locale];
 $: fdw=diagonalFenceWords[locale];
 $: fdm=diagonalMutationWords[locale];
 $: rwm=roadMutationWords[locale];
 $: fenceEditing=fenceSeedEligible(roadSeed);
 $: nw=networkPaletteWords[locale];
 let networkOpen=false,networkArea='',networkKind:'road'|'fence'='road',networkQuery='',networkLimit=60,networkRequest=0,networkStyles:NetworkStyle[]=[],networkSource:File|null=null;
 $: networkOptions=networkStyles.filter(s=>s.kind===networkKind&&s.name.normalize('NFKC').toLocaleLowerCase().includes(networkQuery.normalize('NFKC').toLocaleLowerCase().trim()));
 $: if(networkOpen)loadNetworkArtwork(networkOptions.slice(0,networkLimit));
 $: if(networkOpen&&(!saveMode||networkSource!==$localSaveSession.file||!furnitureReady||furnitureBlocked))closeRoad();
 function loadNetworkCatalog(area:string){
  networkArea=area;networkLimit=60;networkRequest=0;networkStyles=[];roadError=false;
  if(!worker||!bound?.some(g=>g.key===area))return;
  networkRequest=nextRequest();worker.postMessage({command:'network-catalog',requestId:networkRequest,key:area,locale});
 }
 function openNetwork(){resetEditSymmetry();pasteTools?.cancel();
  if(!testExport||!furnitureReady||furnitureBlocked||!$localSaveSession.file||!bound?.length)return;
  closeSupport();closeFurniture();clearGroup();stopMove();closeRoad();preciseOpen=false;searchOpen=false;layersOpen=false;multiMode=false;
  networkOpen=true;networkSource=$localSaveSession.file;networkKind='road';networkQuery='';loadNetworkCatalog(chosen?.area??bound[0].key);
 }
 function chooseNetwork(style:NetworkStyle){
  if(!networkOpen||!networkStyles.includes(style)||!furnitureReady||furnitureBlocked||!worker||!$localSaveSession.file)return;
  networkOpen=false;networkRequest=0;networkStyles=[];networkSource=null;resetRoad();
  roadSeed=style;roadSource=$localSaveSession.file;roadBaseline=timeline;roadTool='brush';fenceFamilyVerified=false;fenceDiagonalVerified=false;
  fenceStyleOptions=[];fenceStyleTarget=0;fenceFamilyRequest=nextRequest();
  worker.postMessage({command:style.kind==='fence'?'fence-family':'road-family',requestId:fenceFamilyRequest,key:style.area,itemId:style.itemId,locale});
 }
 let fenceFamilyRequest=0,fenceFamilyVerified=false,fenceDiagonalVerified=false,fenceReplacement=0,fenceStyleTarget=0,fenceStyleOptions:{id:number;name:string}[]=[];
 function requestFenceStyle(){if(!roadSeed||isNetworkStyle(roadSeed)||!worker||!bound||!fenceFamilyVerified||roadWorker)return;const target=fenceStyleTarget;if(!fenceStyleOptions.some(f=>f.id===target))return;resetRoad();fenceReplacement=target;fenceFamilyRequest=nextRequest();worker.postMessage({command:'fence-family',requestId:fenceFamilyRequest,key:roadSeed.area,itemId:Number(roadSeed.object.itemId),replacement:target,locale});}
 $: roadCount=roadDraft?('nodes' in roadDraft.plan?roadDraft.plan.nodes.length:roadDraft.plan.cells.length):0;
 $: roadEraseDraft=roadDraft&&'erase' in roadDraft.plan&&roadDraft.plan.erase;
 $: if(roadSeed&&(!saveMode||roadSource!==$localSaveSession.file||roadBaseline!==timeline))closeRoad();
 function resetRoad(){roadPointer=null;roadTrail=[];roadTrailInvalid=false;roadWorker?.terminate();roadWorker=null;if(roadCopy)URL.revokeObjectURL(roadCopy.url);roadCopy=null;roadDraft=null;roadStart=null;roadError=false;}
 function closeRoad(){networkOpen=false;networkSource=null;networkRequest=0;networkStyles=[];resetRoad();roadSeed=null;roadSource=null;roadBaseline=null;fenceFamilyRequest=0;fenceFamilyVerified=false;fenceDiagonalVerified=false;fenceReplacement=0;fenceStyleOptions=[];fenceStyleTarget=0;}
 function beginRoad(){resetEditSymmetry();pasteTools?.cancel();if(!testExport||!chosen||(!roadSeedEligible(chosen)&&!fenceSeedEligible(chosen))||!furnitureReady||furnitureBlocked||!$localSaveSession.file)return;closeSupport();closeFurniture();clearGroup();stopMove();closeRoad();roadSeed=chosen;roadSource=$localSaveSession.file;roadBaseline=timeline;roadTool='line';if(!worker){roadError=true;return;}fenceFamilyRequest=nextRequest();worker.postMessage({command:fenceSeedEligible(chosen)?'fence-family':'road-family',requestId:fenceFamilyRequest,key:chosen.area,itemId:Number(chosen.object.itemId),locale});}
 function roadPick(p:{x:number;y:number}){if(savedNetworkFreehand(roadTool))return;if(!roadSeed||!bound||roadWorker||fenceFamilyRequest||!fenceFamilyVerified||fenceSeedEligible(roadSeed)&&roadTool.startsWith('diagonal-')&&!fenceDiagonalVerified)return;if(!roadStart){resetRoad();roadStart=p;return;}const first=roadStart;resetRoad();roadDraft=fenceSeedEligible(roadSeed)?cardinalFenceCandidate(roadSeed,bound,rasters,projection.objects,first,p,roadTool):cardinalRoadCandidate(roadSeed,bound,rasters,projection.objects,first,p,roadTool,roadTool==='replace-road'?fenceStyleTarget:undefined);roadError=!roadDraft;}
 function beginRoadStroke(e:PointerEvent){
  if(!roadSeed||!bound||!savedNetworkFreehand(roadTool)||roadWorker||fenceFamilyRequest||!fenceFamilyVerified||e.button!==0||spacePan||e.shiftKey)return false;
  const p=pointerPoint(e);if(!p)return false;
  resetRoad();roadPointer=e.pointerId;
  try{(e.currentTarget as Element).setPointerCapture(e.pointerId);}catch{/* Pointer ended. */}
  sampleRoadStroke(p);e.preventDefault();return true;
 }
 function sampleRoadStroke(p:{x:number;y:number}){
  if(!roadSeed||!bound||roadTrailInvalid)return;
  const g=bound.find(g=>g.key===roadSeed?.area),fence=fenceSeedEligible(roadSeed);
  const next=g?appendSavedStroke(roadTrail,p,g,(fence?1:2)*g.factor,fence?FENCE_COPY_LIMIT:ROAD_COPY_LIMIT):null;
  if(!next){roadTrailInvalid=true;roadDraft=null;roadError=true;return;}
  if(next.length===roadTrail.length)return;
  roadTrail=next;const a=next[0],b=next[next.length-1];
  roadDraft=fence?cardinalFenceCandidate(roadSeed,bound,rasters,projection.objects,a,b,roadTool,next):cardinalRoadCandidate(roadSeed,bound,rasters,projection.objects,a,b,roadTool,undefined,next);
  roadError=!roadDraft;
 }
 function makeRoadCopy(){if(!testExport||!roadDraft||!roadSource||roadSource!==$localSaveSession.file||roadBaseline!==timeline||roadWorker)return;const source=roadSource,plan=roadDraft;const own=new Worker(new URL('./cardinal-road-save.worker.ts',import.meta.url),{type:'module'});roadWorker=own;roadError=false;const finish=(d:any)=>{own.terminate();if(roadWorker!==own||roadSource!==source||roadDraft!==plan||source!==$localSaveSession.file){d?.bytes?.fill(0);return;}roadWorker=null;if(d?.kind!=='cardinal-road-copy'){roadError=true;return;}try{roadCopy=experimentalCopyDownload(d,source);}catch{roadError=true;}};own.onmessage=e=>finish(e.data);own.onerror=()=>finish(null);own.onmessageerror=()=>finish(null);own.postMessage({command:'nodes' in plan.plan?(plan.plan.seed?'cardinal-fence-erase':'cardinal-fence-copy'):'cardinal-road-copy',allowExperimentalCopy:true,file:source,plan:plan.plan});}
 function applyRoad(){if(!roadCopy||!roadSource||roadBaseline!==timeline||roadSource!==$localSaveSession.file)return;if(!commitWorldCheckpoint(roadSource,roadCopy.file)){roadError=true;return;}closeRoad();}

 let transferCopy:ReturnType<typeof experimentalCopyDownload>|null=null;
 $: checkpointText=checkpointWords[locale];
 function applyTransferCopy(){if(!testExport||!transferCopy||!transferSource||transferStatus!=='valid'||timeline!==transferBaseline||selected!==transferOrdinal)return;if(!commitWorldCheckpoint(transferSource,transferCopy.file)){transferStatus='error';return;}clearTransfer();}
 function clearTransferCopy(){if(transferCopy)URL.revokeObjectURL(transferCopy.url);transferCopy=null;}
 const dependencyWords={ja:'ゲーム内の他のデータがこの家具を参照しているため、移動できません。',en:'Other game data refers to this furniture; the transfer is blocked.',fr:'D’autres données du jeu référencent ce meuble ; déplacement bloqué.',it:'Altri dati del gioco fanno riferimento al mobile; spostamento bloccato.',de:'Andere Spieldaten verweisen auf dieses Möbel; Transfer blockiert.','es-ES':'Otros datos del juego hacen referencia a este mueble; traslado bloqueado.','zh-CN':'其他游戏数据引用此家具，无法移动。','pt-BR':'Outros dados do jogo referenciam este móvel; transferência bloqueada.'} as const;
 $: if(transfer&&($localSaveSession.file!==transferSource||timeline!==transferBaseline||selected!==transferOrdinal||!saveMode))clearTransfer();
 function clearTransfer(){clearTransferCopy();transferWorker?.terminate();transferWorker=null;transfer=null;transferStatus='idle';transferSource=null;transferBaseline=null;transferOrdinal=null;}
 function offerTransfer(p:MainlandSavedObject,x:number,y:number){
  if(!bound||!$localSaveSession.file)return false;
  const candidate=mainlandTransferCandidate(p,bound,rasters,timeline,x,y);if(!candidate)return false;
  clearTransfer();moving=false;hover=null;moveError=false;objectDrag=null;preciseOpen=false;transfer=candidate;transferSource=$localSaveSession.file;transferBaseline=timeline;transferOrdinal=p.object.localOrdinal;selected=p.object.localOrdinal;return true;
 }
 function validateTransfer(){runTransfer(false);}
 function runTransfer(exporting:boolean){
  if(!transfer||!transferSource||transferStatus==='working'||transferSource!==$localSaveSession.file||timeline!==transferBaseline||selected!==transferOrdinal||exporting&&(!testExport||transferStatus!=='valid'))return;
  const candidate=transfer,source=transferSource;clearTransferCopy();transferStatus='working';
  const own=new Worker(new URL('./structure-preview.worker.ts',import.meta.url),{type:'module'});transferWorker=own;
  const finish=(d:any)=>{own.terminate();if(transferWorker!==own||transfer!==candidate||source!==$localSaveSession.file||timeline!==transferBaseline||selected!==transferOrdinal){d?.bytes?.fill(0);return;}transferWorker=null;
   if(exporting&&d?.kind==='transfer-copy'){try{transferCopy=experimentalCopyDownload(d,source);transferStatus='valid';}catch{transferStatus='error';}return;}
   d?.bytes?.fill(0);transferStatus=!exporting&&d?.kind==='transfer-preview'&&d.validated===true?'valid':d?.dependencyBlocked===true?'dependency':'error';
  };
  own.onmessage=e=>finish(e.data);own.onerror=()=>finish(null);own.onmessageerror=()=>finish(null);
  own.postMessage({command:exporting?'transfer-export':'transfer-preview',file:source,plan:candidate.plan,...(exporting?{allowExperimentalCopy:true}:{})});
 }

 let groupIds:number[]=[],groupX:number|undefined=0,groupZ:number|undefined=0,groupOpen=false;
 let groupPickup:GroupPickupControls,groupPickupActive=false;
 let range:{pointer:number;start:{x:number;y:number};end:{x:number;y:number};clientX:number;clientY:number;moved:boolean}|null=null;
 $: groupSet=new Set(groupIds);
 $: group=allObjects.filter(p=>groupSet.has(p.object.localOrdinal)&&layerSelectable(layerState,p.object));
 $: pruneGroup(group,groupIds);
 function pruneGroup(items:readonly MainlandSavedObject[],ids:readonly number[]){if(items.length!==ids.length){groupIds=items.map(p=>p.object.localOrdinal);if(items.length<2){selected=items[0]?.object.localOrdinal??null;groupIds=[];groupOpen=false;}}}
 $: groupReady=group.length>1&&group.every(p=>mainlandSavedGroupMoveEligible(p,freePlacement))&&!saveLoading&&!saveFailed&&!pending.size&&!failed;
 let alignment:MapAlignment|null=null;
 let editSymmetry:DesignSymmetry|null=null,editSymmetryOpen=false,editSymmetryPicking=false,symmetryWorld='';
 const linkedWords={
 ja:['対称連動編集','対称相手が存在しないか、複数候補・ロック・配置制約により操作できません。'],
 en:['Linked symmetry','No unique, editable reflected counterpart or valid destination.'],
 fr:['Symétrie liée','Aucun objet symétrique unique et modifiable, ou destination invalide.'],
 it:['Simmetria collegata','Controparte unica modificabile o destinazione valida non disponibile.'],
 de:['Verknüpfte Symmetrie','Kein eindeutiges bearbeitbares Gegenstück oder gültiges Ziel.'],
 'es-ES':['Simetría vinculada','Sin contraparte editable única o destino válido.'],
 'zh-CN':['联动对称编辑','无唯一可编辑的对称物品，或目标位置无效。'],
 'pt-BR':['Simetria vinculada','Sem contraparte editável única ou destino válido.']
 } as const;
 $: linkedText=linkedWords[locale];
 $: if(worldKey!==symmetryWorld){symmetryWorld=worldKey;resetEditSymmetry();}
 $: editAxis=editSymmetry?{mode:editSymmetry.mode,x:extent.x+editSymmetry.x2/2,y:extent.y+extent.h-editSymmetry.y2/2}:null;
 $: displayAxis=pasteAxis??editAxis;
 $: linkedEligible=new Set(allObjects.filter(p=>layerSelectable(layerState,p.object)).map(p=>p.object.localOrdinal));
 function resetEditSymmetry(){editSymmetry=null;editSymmetryOpen=false;editSymmetryPicking=false;}
 function changeEditSymmetry(s:DesignSymmetry|null){stopMove();alignment=null;editSymmetry=s;editSymmetryPicking=false;}
 function toggleEditSymmetry(){if(freePlacement)return;if(editSymmetryOpen){editSymmetryOpen=false;editSymmetryPicking=false;return;}closeFurniture();closeSupport();closeRoad();stopMove();searchOpen=false;layersOpen=false;editSymmetryOpen=true;}
 function applyLinked(items:readonly MainlandSavedObject[],action:SavedSymmetryAction){
  if(!editAxis||!bound)return false;
  const q=savedSymmetryDraft(items,projection.objects,linkedEligible,editAxis,action,bound,rasters,saveMaps,timeline);
  if(!q.next){moveError=true;return false;}
  timeline=q.next;groupX=0;groupZ=0;alignment=null;stopMove();return true;
 }
 $: uniformGroup=groupReady&&group.every(p=>p.factor===group[0].factor);
 $: alignmentPlan=!editAxis&&uniformGroup&&alignment&&bound?mainlandSavedAdvancedDraft(group,bound,rasters,saveMaps,timeline,alignment,freePlacement):null;
 $: groupPlan=groupReady&&!alignment&&bound&&typeof groupX==='number'&&typeof groupZ==='number'?editAxis?savedSymmetryDraft(group,projection.objects,linkedEligible,editAxis,{dx:groupX/mainlandGroupFactor(group),dz:groupZ/mainlandGroupFactor(group)},bound,rasters,saveMaps,timeline):mainlandSavedGroupDraft(group,bound,rasters,saveMaps,timeline,groupX,groupZ,freePlacement):null;
 function clearGroup(){groupPickup?.cancel();alignment=null;selectionLimit=false;groupIds=[];groupOpen=false;groupX=0;groupZ=0;range=null;}
 function setGroup(ids:number[]){groupPickup?.cancel();const unique=[...new Set(ids)];if(unique.length>WORLD_BATCH_LIMIT){moveError=true;selectionLimit=true;return;}selectionLimit=false;alignment=null;stopMove();preciseOpen=false;selected=unique.length===1?unique[0]:null;groupIds=unique.length>1?unique:[];groupOpen=unique.length>1;groupX=0;groupZ=0;}
 function toggleGroup(id:number){const ids=new Set(groupIds.length?groupIds:selected===null?[]:[selected]);if(ids.has(id))ids.delete(id);else ids.add(id);setGroup([...ids]);}
 function applyAdvanced(action:MapAlignment|number){if(!uniformGroup||!bound)return;if(editAxis){if(typeof action==='number')applyLinked(group,{turn:action});else moveError=true;return;}const q=mainlandSavedAdvancedDraft(group,bound,rasters,saveMaps,timeline,action,freePlacement);if(!q.next){moveError=true;return;}timeline=q.next;alignment=null;groupX=0;groupZ=0;stopMove();}
 function applyGroup(dx:number,dz:number){alignment=null;if(!groupReady||!bound)return;if(editAxis){const f=mainlandGroupFactor(group);applyLinked(group,{dx:dx/f,dz:dz/f});return;}const q=mainlandSavedGroupDraft(group,bound,rasters,saveMaps,timeline,dx,dz,freePlacement);if(!q.next){moveError=true;return;}timeline=q.next;groupX=0;groupZ=0;stopMove();}

 let root:HTMLElement,preciseOpen=false,preciseX:number|undefined,preciseZ:number|undefined,preciseSeen='',moveError=false;
 let spacePan=false,suppressClick=false;
 type ObjectDrag={pointer:number;target:MainlandSavedObject;members:readonly MainlandSavedObject[];baseline:WorldEditTimeline;start:{x:number;y:number};cell:{x:number;z:number};clientX:number;clientY:number;end:{x:number;z:number};moved:boolean;support:boolean};
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
 $: canMove=!!chosen&&!!nativeCell&&layerSelectable(layerState,chosen.object)&&mainlandSavedMoveEligible(chosen,freePlacement)&&!saveLoading&&!saveFailed&&!pending.size&&!failed;
 $: preciseChanged=typeof preciseX==='number'&&typeof preciseZ==='number'&&Number.isSafeInteger(preciseX)&&Number.isSafeInteger(preciseZ)&&!!nativeCell&&(preciseX!==nativeCell.x||preciseZ!==nativeCell.z);
 $: dragGroup=objectDrag?.moved&&bound&&editAxis?savedSymmetryDraft(objectDrag.members,projection.objects,linkedEligible,editAxis,{dx:(objectDrag.end.x-objectDrag.cell.x)/objectDrag.target.factor,dz:(objectDrag.end.z-objectDrag.cell.z)/objectDrag.target.factor},bound,rasters,saveMaps,timeline):objectDrag?.moved&&bound&&objectDrag.members.length>1?mainlandSavedGroupDraft(objectDrag.members,bound,rasters,saveMaps,timeline,(objectDrag.end.x-objectDrag.cell.x)*mainlandGroupFactor(objectDrag.members)/objectDrag.target.factor,(objectDrag.end.z-objectDrag.cell.z)*mainlandGroupFactor(objectDrag.members)/objectDrag.target.factor,freePlacement):null;
 $: directParentPreview=objectDrag?.moved&&objectDrag.support&&bound&&furnitureReady&&!furnitureBlocked?parentDragCandidate(objectDrag,bound,rasters,saveMaps,projection.objects):null;
 $: draggedDraft=!editAxis&&objectDrag?.moved&&!objectDrag.support&&bound&&objectDrag.members.length===1?mainlandSavedDraftAtCell(objectDrag.target,bound,rasters,saveMaps,timeline,objectDrag.end.x,objectDrag.end.z,objectDrag.target.object.orientation,freePlacement):null;
 function applyCell(x:number,z:number){
  if(!canMove||!chosen||!bound)return false;
  if(editAxis){const c=mainlandSavedCell(chosen);return !!c&&applyLinked([chosen],{dx:(x-c.x)/chosen.factor,dz:(z-c.z)/chosen.factor});}
  const q=mainlandSavedDraftAtCell(chosen,bound,rasters,saveMaps,timeline,x,z,chosen.object.orientation,freePlacement);
  if(!q?.next){if(offerTransfer(chosen,(x+.5)/chosen.factor,-(z+.5)/chosen.factor))return false;moveError=true;return false;}
  timeline=q.next;stopMove();return true;
 }
 function applyPrecise(){if(preciseChanged&&typeof preciseX==='number'&&typeof preciseZ==='number')applyCell(preciseX,preciseZ);}
 function pointerPoint(e:MouseEvent){const matrix=svg?.getScreenCTM();if(!matrix)return null;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());return {x:p.x,y:p.y};}
 function parentDragPoint(d:ObjectDrag){return {x:(d.end.x+.5)/d.target.factor,y:-(d.end.z+.5)/d.target.factor};}
 function parentDragCandidate(d:ObjectDrag,grids:readonly MainlandGrid[],r:typeof rasters,m:typeof saveMaps,objects:readonly MainlandSavedObject[]){
  const p=parentDragPoint(d);return supportParentCandidate(d.target,grids,r,p.x,p.y,d.target.object.orientation,m.get(d.target.area)?.shapes??{},objects,false);
 }
 function startPointer(e:PointerEvent){
  suppressClick=false;clearTransfer();
  if(e.button===0&&!spacePan&&supportMapInteractive&&supportMarkerHit(e.target))return;
  if(biomeOpen){gesture.begin(e,camera.zoom>1);return;}
  if(captureRegion){if(!startCaptureDrag(e))gesture.begin(e,camera.zoom>1);return;}
  if(editSymmetryPicking){gesture.begin(e,camera.zoom>1&&(e.button===1||spacePan||e.shiftKey||e.pointerType==='touch'));return;}
  if(roadSeed&&beginRoadStroke(e))return;
  if(roadSeed||networkOpen||supportOpen||pasteActive||groupPickupActive){gesture.begin(e,camera.zoom>1&&(e.button!==0||spacePan));return;}
  if(saveMode&&!furniturePlacing&&!furnitureGhost&&!moving&&!spacePan&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&e.button===0&&e.pointerType!=='touch'&&!pending.size&&!failed&&!saveLoading&&!saveFailed){
   const p=pointerPoint(e),hit=p?mainlandSavedAt(allObjects,p.x,p.y).find(o=>layerSelectable(layerState,o.object)):null,cell=hit?mainlandSavedCell(hit):null;
   const support=!!hit&&testExport&&furnitureReady&&!furnitureBlocked&&!editAxis&&supportParentEligible(hit)&&!(groupSet.has(hit.object.localOrdinal)&&group.length>1);
   if(p&&hit&&cell&&(mainlandSavedMoveEligible(hit,freePlacement)||support)){
    const members=groupSet.has(hit.object.localOrdinal)?group:[hit];
    objectDrag={pointer:e.pointerId,target:hit,members,baseline:timeline,start:p,cell,clientX:e.clientX,clientY:e.clientY,end:cell,moved:false,support};return;
   }
   if(p&&!hit){range={pointer:e.pointerId,start:p,end:p,clientX:e.clientX,clientY:e.clientY,moved:false};return;}
  }
  gesture.begin(e,camera.zoom>1&&(!moving&&!furniturePlacing||e.button===1||e.shiftKey||spacePan||e.pointerType==='touch'));
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
  if(captureDrag?.pointer===e.pointerId){if(commit)updateCaptureDrag(e);else captureRegion=captureDrag.region;captureDrag=null;suppressClick=true;return;}
  if(roadPointer===e.pointerId){if(commit){const p=pointerPoint(e);if(p)sampleRoadStroke(p);}else{roadDraft=null;roadError=false;}roadPointer=null;roadTrail=[];roadTrailInvalid=false;suppressClick=true;return;}
  if(range?.pointer===e.pointerId){const r=range;range=null;if(r.moved){suppressClick=true;if(commit){const end=pointerPoint(e)??r.end;setGroup(mainlandSavedInRect(allObjects,r.start,end).filter(p=>layerSelectable(layerState,p.object)).map(p=>p.object.localOrdinal));}}return;}
  if(objectDrag?.pointer!==e.pointerId)return;
  if(commit)updateObjectDrag(e);
  const d=objectDrag;objectDrag=null;
  if(!d?.moved)return;
  suppressClick=true;
  if(!commit||d.baseline!==timeline||!bound||!layerSelectable(layerState,d.target.object)||saveLoading||saveFailed||pending.size||failed)return;
  if(d.support){
   if(!testExport||!furnitureReady||furnitureBlocked||editAxis||!parentDragCandidate(d,bound,rasters,saveMaps,projection.objects)){moveError=true;return;}
   selected=d.target.object.localOrdinal;openSupport(d.target);initialSupportPoint=parentDragPoint(d);return;
  }
  if(editAxis){applyLinked(d.members,{dx:(d.end.x-d.cell.x)/d.target.factor,dz:(d.end.z-d.cell.z)/d.target.factor});return;}
  if(d.members.length>1){if(d.members.some(p=>!layerSelectable(layerState,p.object)))return;const f=mainlandGroupFactor(d.members);const q=mainlandSavedGroupDraft(d.members,bound,rasters,saveMaps,timeline,(d.end.x-d.cell.x)*f/d.target.factor,(d.end.z-d.cell.z)*f/d.target.factor,freePlacement);if(q.next){timeline=q.next;groupX=0;groupZ=0;stopMove();}else moveError=true;return;}
  const q=mainlandSavedDraftAtCell(d.target,bound,rasters,saveMaps,timeline,d.end.x,d.end.z,d.target.object.orientation,freePlacement);
  if(q?.next){timeline=q.next;stopMove();}else if(!offerTransfer(d.target,(d.end.x+.5)/d.target.factor,-(d.end.z+.5)/d.target.factor))moveError=true;
 }
 function keys(e:KeyboardEvent){
  if(!worldShortcutTarget(e,root))return;
  // Support map keys and normal panel button activation must not edit the world beneath it.
  if(e.target instanceof HTMLElement&&e.target.closest('.support-panel'))return;
  const mapFocused=e.target instanceof HTMLElement&&!!e.target.closest('.mainland-map');
  if(mapFocused&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.code==='Space'){spacePan=true;e.preventDefault();return;}
  if(saveMode&&!biomeOpen&&!captureRegion&&!supportOpen&&mapFocused&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&(e.key==='['||e.key===']')){
   const list=allObjects.filter(p=>layerSelectable(layerState,p.object));if(!list.length)return;
   const i=list.findIndex(p=>p.object.localOrdinal===selected),delta=e.key==='['?-1:1;
   focus(list[i<0?(delta>0?0:list.length-1):(i+delta+list.length)%list.length]);e.preventDefault();return;
  }
  const action=worldShortcut(e);if(!action)return;
  if(action==='zoom-in'||action==='zoom-out'||action==='fit'){e.preventDefault();camera=action==='fit'?defaultMapCamera():zoomMapCamera(camera,camera.zoom*(action==='zoom-in'?2:.5),maxZoom);return;}
  if(!saveMode)return;
  if(biomeOpen){if(action==='cancel'){e.preventDefault();closeBiome();}return;}
  if(captureRegion){if(action==='cancel'){e.preventDefault();closeCaptureRegion();}else if(action==='confirm'&&mapFocused){e.preventDefault();confirmCaptureRegion();}return;}
  if(supportOpen){if(action==='cancel'){e.preventDefault();if(supportPlacing||supportGhost)supportInspector?.cancel();else closeSupport();}else if((supportPlacing||supportGhost)&&(action==='rotate-left'||action==='rotate-right')){e.preventDefault();supportInspector?.turnParent(action==='rotate-left'?-1:1);}return;}
  if(roadSeed||networkOpen){if(action==='cancel'){e.preventDefault();closeRoad();}return;}
  if(furnitureOpen&&(furniturePlacing||furnitureGhost)){if(action==='cancel'){e.preventDefault();furnitureTools?.cancel();return;}if(action==='rotate-left'||action==='rotate-right'){e.preventDefault();furnitureTools?.turn(action==='rotate-left'?-1:1);return;}if(action==='confirm'&&mapFocused){e.preventDefault();furnitureTools?.validate();return;}if(action==='undo'||action==='redo'){furnitureTools?.cancel();}else return;}
  if(groupPickupActive){if(action==='cancel'){e.preventDefault();groupPickup?.cancel();}return;}
  if(pasteActive){if(action==='cancel'){e.preventDefault();pasteTools?.cancel();}else if(action==='rotate-left'||action==='rotate-right'){e.preventDefault();pasteTools?.turn(action==='rotate-left'?1:-1);}else if(action==='confirm'&&mapFocused){e.preventDefault();pasteTools?.validate();}return;}
  if(action==='delete'&&group.length>1&&testExport){if(groupPickupPlan(group)&&furnitureReady&&!furnitureBlocked){e.preventDefault();groupPickup?.prepare();}return;}
  if(action==='cut'&&canCutFurniture){if(pasteTools?.capture(true))e.preventDefault();return;}
  if(action==='copy'&&canCopyFurniture){if(pasteTools?.capture())e.preventDefault();return;}
  if(action==='paste'&&testExport&&furnitureReady&&!furnitureBlocked){if(pasteTools?.begin())e.preventDefault();return;}
  if(action==='duplicate'&&canCopyFurniture){if(pasteTools?.begin(true))e.preventDefault();return;}
  if(action==='select-all'){e.preventDefault();setGroup(matches.map(p=>p.object.localOrdinal));return;}
  if(action==='undo'||action==='redo'){e.preventDefault();travel(action==='undo'?-1:1);return;}
  if(action==='cancel'){e.preventDefault();if(editSymmetryPicking){editSymmetryPicking=false;return;}if(transfer){clearTransfer();return;}if(objectDrag||range){objectDrag=null;range=null;return;}if(alignment){alignment=null;return;}if(groupIds.length){clearGroup();return;}if(moving||preciseOpen){stopMove();preciseOpen=false;return;}selected=null;return;}
  if(action==='confirm'&&mapFocused&&moving&&(linkedClickDraft?.next||draft?.next)){e.preventDefault();timeline=(linkedClickDraft?.next??draft?.next)!;stopMove();return;}
  if(action==='rotate-left'||action==='rotate-right'){if(groupIds.length){e.preventDefault();applyAdvanced(action==='rotate-left'?1:-1);return;}if(chosen){e.preventDefault();rotate(action==='rotate-left'?-1:1);}return;}
  const n=NUDGE[action];if(groupIds.length){if(n){e.preventDefault();applyGroup(n[0],-n[1]);}return;}if(n&&nativeCell&&chosen){e.preventDefault();applyCell(nativeCell.x+n[0],nativeCell.z-n[1]);}
 }
 $: linkedClickDraft=editAxis&&moving&&hover&&chosen&&nativeCell&&bound&&!pending.size&&!failed?savedSymmetryDraft([chosen],projection.objects,linkedEligible,editAxis,{dx:(Math.floor(hover.x*chosen.factor)-nativeCell.x)/chosen.factor,dz:(Math.floor(-hover.y*chosen.factor)-nativeCell.z)/chosen.factor},bound,rasters,saveMaps,timeline):null;
 $: draft=!editAxis&&moving&&hover&&chosen&&bound&&!pending.size&&!failed?mainlandSavedDraft(chosen,bound,rasters,saveMaps,timeline,hover.x,hover.y,chosen.object.orientation,false,freePlacement):null;
 function stopMove(){clearTransfer();moving=false;hover=null;moveError=false;objectDrag=null;}
 function rotate(delta:number){if(!chosen||!bound||!isCardinal(chosen.object.orientation)||!layerSelectable(layerState,chosen.object)||!mainlandSavedRotateEligible(chosen,freePlacement)||pending.size||failed||saveLoading||saveFailed)return;if(editAxis){applyLinked([chosen],{turn:-delta});return;}const orientation=CARDINAL_ORIENTATIONS[(CARDINAL_ORIENTATIONS.indexOf(chosen.object.orientation)+delta+4)%4];const q=mainlandSavedDraft(chosen,bound,rasters,saveMaps,timeline,chosen.x+.25/chosen.factor,chosen.y-.25/chosen.factor,orientation,false,freePlacement);if(q?.next){timeline=q.next;stopMove();}}
 function travel(delta:-1|1){alignment=null;stopMove();const next=travelWorldTimeline(timeline,delta);if(next!==timeline){timeline=next;return;}if(!currentWorldEdits(timeline).length&&testExport&&!saveLoading&&!saveFailed&&$localSaveSession.file&&$localSaveSession.worldCheckpoint)travelWorldCheckpoint($localSaveSession.file,delta);}
 function follow(e:PointerEvent){if(updateCaptureDrag(e))return;if(roadPointer===e.pointerId){const p=pointerPoint(e);if(p)sampleRoadStroke(p);e.preventDefault();return;}if(range?.pointer===e.pointerId){const p=pointerPoint(e);if(p&&(range.moved||Math.hypot(e.clientX-range.clientX,e.clientY-range.clientY)>=5)){if(!range.moved){try{(e.currentTarget as Element).setPointerCapture(e.pointerId);}catch{}}range={...range,end:p,moved:true};e.preventDefault();}return;}if(updateObjectDrag(e))return;const next=gesture.move(e,svg,extent,camera);if(next){camera=next;return;}if(supportPlacing){supportInspector?.hoverParent(pointerPoint(e));return;}if(pasteActive){pasteTools?.hover(pointerPoint(e));return;}if(furniturePlacing){furnitureTools?.hover(pointerPoint(e));return;}if(moving){const m=svg.getScreenCTM();if(m){const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse());hover={x:p.x,y:p.y};}}}
 $: cellPixels=mapCellPixels(viewport,mapWidth,mapHeight);
 $: chosen=allObjects.find(p=>p.object.localOrdinal===selected)??null;
 $: verifiedAdjacent=chosen?nativeNetwork.components.get(chosen.object.localOrdinal):undefined;
 $: adjacentIds=verifiedAdjacent?[...verifiedAdjacent]:chosen&&(chosen.object.layer==='ground'||chosen.object.layer==='fence')&&!nativeNetwork.parts.has(chosen.object.localOrdinal)?savedAdjacentNetwork(chosen,projection.objects):[];
 $: adjacentWords=verifiedAdjacent&&chosen?.object.layer==='fence'?connectedNetworkWords[locale]:adjacentNetworkWords[locale];
 $: adjacentSelectable=adjacentIds.length>1&&adjacentIds.every(id=>allObjects.some(p=>p.object.localOrdinal===id&&layerSelectable(layerState,p.object)));
 $: networkGroup=group.some(p=>p.object.layer==='ground'||p.object.layer==='fence');

 let artwork=new Map<number,string>(),artworkPending=new Set<number>(),names=new Map<number,string>(),nameEpoch=0;
 let master:Promise<PublicCompleteItemMaster>|null=null;
 function loadNetworkArtwork(items:readonly NetworkStyle[]){for(const {itemId:id} of items){if(artworkPending.has(id))continue;artworkPending.add(id);void worldArtwork(base,id).then(u=>{if(u)artwork=new Map(artwork).set(id,u);}).catch(()=>{});}}
 function loadArtworkIds(ids:readonly number[]){for(const id of ids){if(artworkPending.has(id))continue;artworkPending.add(id);void worldArtwork(base,id).then(u=>{if(u)artwork=new Map(artwork).set(id,u);}).catch(()=>{});}}
 function loadArtwork(items:readonly MainlandSavedObject[]){loadArtworkIds(items.map(p=>Number(p.object.itemId)));}
 $: ghostArtwork=[...(pasteGhost?.ghosts??[]),...biomeGhosts,...(furnitureGhost&&furnitureGhost.plan.action!=='remove'?[furnitureGhost]:[])];
 $: if(saveMode&&mapWidth&&mapHeight)loadArtworkIds(ghostArtwork.filter(g=>g.x+g.shape.width/g.factor>=viewport.x&&g.x<=viewport.x+viewport.w&&g.y>=viewport.y&&g.y-g.shape.height/g.factor<=viewport.y+viewport.h&&Math.min(g.shape.width,g.shape.height)*cellPixels/g.factor>=14).map(g=>Number(g.plan.itemId)));
 $: if(saveMode&&mapWidth&&mapHeight)loadArtwork(visibleObjects.filter(p=>showWorldArtwork(p.object,p.shape,cellPixels/p.factor)));
 $: if(saveMode)void loadNames(locale);
 async function loadNames(language:WandLanguage){const epoch=++nameEpoch;try{master??=openPublicItemMaster(base,fetch,{scope:'complete',gameVersion:'1.26.2'});const db=await master,rows=await db.getBrowseNames(language);if(epoch===nameEpoch)names=new Map(rows);}catch{if(epoch===nameEpoch){names=new Map();master=null;}}}
 function name(p:MainlandSavedObject,lookup:ReadonlyMap<number,string>){return lookup.get(Number(p.object.itemId))??p.object.name??'—';}
 $: normalized=query.normalize('NFKC').toLocaleLowerCase().trim();
 $: matches=allObjects.filter(p=>layerSelectable(layerState,p.object)&&name(p,names).normalize('NFKC').toLocaleLowerCase().includes(normalized));
 $: if(searchOpen){loadArtwork(matches.slice(0,limit));loadArtworkIds(supportMatches.slice(0,Math.max(0,limit-matches.length)).map(m=>m.child.itemId));}
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
 $: independentBinding=independent&&grids.length===1?bindFloatingIslandGrid(grids[0]):null;
 $: bound=independent?(independentBinding?[independentBinding]:null):bindMainland(grids);
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
  const d=e.data,k=pending.get(d?.requestId);
  if(networkRequest&&d?.requestId===networkRequest){networkRequest=0;if(d.kind==='network-catalog'&&d.key===networkArea&&Array.isArray(d.items)){networkStyles=d.items.filter((x:NetworkStyle)=>x?.styleOnly===true&&x.area===networkArea&&Number.isSafeInteger(x.itemId)&&typeof x.name==='string'&&(x.kind==='road'||x.kind==='fence')&&!!x.shape);}else roadError=true;return;}
  if(fenceFamilyRequest&&d?.requestId===fenceFamilyRequest){fenceFamilyRequest=0;const ok=d?.kind===(fenceSeedEligible(roadSeed)?'fence-family':'road-family')&&d.verified===true&&d.key===roadSeed?.area&&d.itemId===networkItemId(roadSeed)&&d.factor===roadSeed?.factor;if(fenceReplacement){const target=fenceReplacement;fenceReplacement=0;if(ok&&d.replacementVerified===true&&d.replacement===target&&roadSeed&&!isNetworkStyle(roadSeed)&&bound)roadDraft=fenceReplacementCandidate(roadSeed,bound,target);roadError=!roadDraft;}else{fenceFamilyVerified=ok;fenceDiagonalVerified=ok&&d.diagonalVerified===true;roadError=!ok;fenceStyleOptions=ok&&!isNetworkStyle(roadSeed)&&Array.isArray(d.replacementOptions)?d.replacementOptions.filter((f:unknown):f is {id:number;name:string}=>!!f&&typeof f==='object'&&'id' in f&&Number.isSafeInteger(f.id)&&'name' in f&&typeof f.name==='string'):[];fenceStyleTarget=fenceStyleOptions[0]?.id??0;}return;}if(!k)return;
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
  if(biomeOpen||captureRegion)return;
  if(saveMode&&supportPlacing){supportInspector?.pick(p);return;}
  if(supportOpen)return;
  if(saveMode&&roadSeed){roadPick(p);return;}if(networkOpen)return;
  if(groupPickupActive)return;
  if(saveMode&&editSymmetryPicking&&editSymmetry){changeEditSymmetry({...editSymmetry,x2:Math.max(0,Math.min(extent.w*2,Math.round((p.x-extent.x)*2))),y2:Math.max(0,Math.min(extent.h*2,Math.round((extent.y+extent.h-p.y)*2)))});return;}
  if(saveMode&&pasteActive){pasteTools?.pick(p);return;}
  if(saveMode&&furniturePlacing){furnitureTools?.pick({x:p.x,y:p.y});return;}
  if(furnitureGhost){furnitureTools?.cancel();return;}
  if(saveMode&&moving&&chosen&&canMove){if(editAxis){applyCell(Math.floor(p.x*chosen.factor),Math.floor(-p.y*chosen.factor));return;}const q=mainlandSavedDraft(chosen,bound,rasters,saveMaps,timeline,p.x,p.y,chosen.object.orientation,false,freePlacement);if(q?.next){timeline=q.next;stopMove();}else if(!offerTransfer(chosen,p.x,p.y))hover={x:p.x,y:p.y};return;}
  if(supportMapInteractive&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey){const hit=supportMarkerHit(e.target),owner=hit&&allObjects.find(o=>o.object.localOrdinal===hit.ordinal&&o.object.subgrid&&layerSelectable(layerState,o.object));if(hit&&owner){clearGroup();selected=owner.object.localOrdinal;openSupport(owner,hit.child===null?null:[hit.child]);return;}}
  if(saveMode){const hit=mainlandSavedAt(allObjects,p.x,p.y).find(o=>layerSelectable(layerState,o.object));if(hit){clearTransfer();if(multiMode||e.ctrlKey||e.metaKey||e.shiftKey)toggleGroup(hit.object.localOrdinal);else{clearGroup();selected=hit.object.localOrdinal;}overlaps=[];return;}clearGroup();selected=null;overlaps=[];return;}
  const hits=mainlandTerrainHits(bound,rasters,p.x,p.y);
  overlaps=hits.length>1?hits:[];if(hits.length===1)onChoose(hits[0].key);
 }
 onDestroy(()=>{networkReadWorker?.terminate();closeSupport();closeRoad();clearTransfer();nameEpoch++;subscribed?.removeEventListener('message',receive);});
</script>
<svelte:window on:keydown={keys} on:keyup={e=>{if(e.code==='Space')spacePan=false;}} on:blur={()=>{spacePan=false;objectDrag=null;range=null;if(captureDrag){captureRegion=captureDrag.region;captureDrag=null;}if(roadPointer!==null)resetRoad();}}/>
<section class="mainland-overview" bind:this={root} aria-label={title||words[0]}>
 <div class="overview-tools">{#if worldOptions.length>1}<select aria-label={tw[6]} value={worldKey} on:change={e=>{closeBiome();closeCaptureRegion();onWorldChange(e.currentTarget.value);}}>{#each worldOptions as option (option.key)}<option value={option.key}>{option.label}</option>{/each}</select>{:else}<strong>{title||words[0]}</strong>{/if}{#if independent}<select aria-label={locale==='ja'?'浮島・エリア':'Island / area'} value={grids[0]?.key??''} on:change={e=>{closeBiome();closeCaptureRegion();onAreaChange(e.currentTarget.value);}}>{#each areaOptions as option (option.key)}<option value={option.key}>{option.label}</option>{/each}</select>{/if}{#if saveMode}{#if testExport}<button type="button" aria-pressed={freePlacement} title={fpw[1]} on:click={toggleFreePlacement}>{fpw[0]}</button>{/if}{#if worldKey==='Village04'||islandGrids.length}<button type="button" aria-label={independent?isw[0]:bpw[0]} title={independent?isw[0]:bpw[0]} aria-pressed={biomeOpen&&!biomeNetwork&&!worldPresetOpen} disabled={!furnitureReady||furnitureBlocked||networkOpen||!!roadSeed||supportOpen||furniturePlacing||pasteActive||groupPickupActive} on:click={()=>biomeOpen&&!biomeNetwork&&!worldPresetOpen?closeBiome():openBiome()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v14H3zM8 5v14M3 11h18M13 8h4M13 15h4"/></svg></button>{#if !independent}<button type="button" aria-label={bpn[0]} title={bpn[0]} aria-pressed={biomeOpen&&biomeNetwork} disabled={!furnitureReady||furnitureBlocked||networkOpen||!!roadSeed||supportOpen||furniturePlacing||pasteActive||groupPickupActive} on:click={()=>biomeOpen&&biomeNetwork?closeBiome():openBiome(true)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h8v8H3zM13 13h8v8h-8zM15 3v8M21 3v8M15 5h6M15 9h6M3 15h8M3 21h8M5 15v6M9 15v6"/></svg></button>{/if}{/if}{#if wholeWorldReady}<button type="button" aria-label={worldPresetWords[0]} title={worldPresetWords[0]} aria-pressed={biomeOpen&&worldPresetOpen} disabled={!furnitureReady||furnitureBlocked||networkOpen||!!roadSeed||supportOpen||furniturePlacing||pasteActive||groupPickupActive} on:click={()=>biomeOpen&&worldPresetOpen?closeBiome():openBiome(false,true)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4l6 3 6-3 6 3v14l-6-3-6 3-6-3zM9 7v14M15 4v14"/></svg></button>{/if}{#if regionBackupReady}<button type="button" aria-label={rgw[0]} title={rgw[0]} disabled={!furnitureReady||furnitureBlocked||networkOpen||!!roadSeed||supportOpen||furniturePlacing||pasteActive||groupPickupActive} on:click={openRegionBackup}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" stroke-dasharray="3 2"/><path d="M9 4v16M15 4v16M4 9h16M4 15h16"/></svg></button>{/if}<button type="button" aria-label={indoorText[0]} title={indoorText[0]} on:click={onIndoor}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v11H3zM10 21v-7h4v7"/></svg></button><button type="button" aria-label={furnitureWords[0]} title={furnitureWords[0]} aria-pressed={furnitureOpen} on:click={toggleFurniture}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h18v16H3zM9 4v16M13 8h5M13 12h5M13 16h5"/></svg></button>{#if testExport}<button type="button" aria-label={nw[0]} title={nw[0]} aria-pressed={networkOpen||isNetworkStyle(roadSeed)} disabled={!furnitureReady||furnitureBlocked} on:click={()=>networkOpen||isNetworkStyle(roadSeed)?closeRoad():openNetwork()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h7v7H3zM14 13h7v7h-7zM10 7h4v10M3 16h7M6 13v6"/></svg></button>{/if}{#if testExport}<button type="button" aria-label={pasteWords[1]} title={pasteWords[1]} disabled={!$worldFurnitureClipboard.length||!furnitureReady||furnitureBlocked||pasteActive||networkOpen||!!roadSeed||groupPickupActive||supportOpen||furniturePlacing} on:click={()=>pasteTools?.begin()}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="16" rx="2"/><rect x="9" y="2" width="6" height="5" rx="1"/></svg></button>{/if}{#if testExport}<button type="button" aria-label={sceneText[1]} title={sceneText[1]} disabled={!furnitureReady||furnitureBlocked||pasteActive||networkOpen||!!roadSeed||groupPickupActive||supportOpen||furniturePlacing} on:click={()=>pasteTools?.chooseScene()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h7l2 3h9v11H3zM12 11v6m-3-3 3 3 3-3"/></svg></button>{/if}<button type="button" aria-label={cw[0]} title={cw[0]} disabled={!canCapture} on:click={()=>copyLayout(false)}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></svg></button><button type="button" aria-label={designWords[locale]} title={designWords[locale]} on:click={onDesign}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 17 12-12 4 4L7 21H3zM12 8l4 4M3 21h18"/></svg></button><button type="button" aria-label={linkedText[0]} title={linkedText[0]} aria-pressed={editSymmetryOpen||!!editSymmetry} disabled={!furnitureReady||pasteActive||!!roadSeed||networkOpen||supportOpen||groupPickupActive||furniturePlacing} on:click={toggleEditSymmetry}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v20M9 6 3 12l6 6ZM15 6l6 6-6 6Z"/></svg></button><button type="button" aria-label={gw[0]} title={gw[0]} aria-pressed={multiMode} on:click={()=>{multiMode=!multiMode;if(!multiMode)clearGroup();}}>▧</button><button type="button" aria-label={sw[0]} aria-pressed={searchOpen} on:click={()=>searchOpen=!searchOpen}><svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></svg></button><button type="button" aria-label={sw[1]} aria-pressed={layersOpen} on:click={()=>layersOpen=!layersOpen}><svg viewBox="0 0 24 24"><path d="m12 3 9 5-9 5-9-5 9-5M3 12l9 5 9-5M3 16l9 5 9-5"/></svg></button>{/if}<button type="button" aria-label={words[1]} title={words[1]} on:click={onClose}><svg viewBox="0 0 24 24"><path d="m6 6 12 12M6 18 18 6"/></svg></button></div>
 {#if !bound||failed}<p role="alert">{words[3]}</p>{:else if pending.size||images.size<bound.length}<p role="status">{words[2]} {images.size}/{bound.length}</p>{/if}
 <button class="mainland-map" type="button" bind:clientWidth={mapWidth} bind:clientHeight={mapHeight} aria-label={words[5]} on:click={click} on:wheel|nonpassive={e=>camera=wheelMapCamera(e,svg,extent,camera,maxZoom)}
 on:pointerdown={startPointer} on:pointermove={follow}
 on:pointerup={e=>finishPointer(e,true)} on:pointercancel={e=>finishPointer(e,false)} on:pointerleave={()=>{gesture.leave();hover=null;furnitureTools?.hover(null);supportInspector?.hoverParent(null);}}>
  <svg bind:this={svg} {viewBox} aria-hidden="true">
   <rect x={extent.x} y={extent.y} width={extent.w} height={extent.h} fill="#27313a"/>
   {#each [...(bound??[])].sort((a,b)=>a.origin.position[1]-b.origin.position[1]) as g (g.key)}
    {#if images.has(g.key)&&g.bounds.x+g.bounds.w>=viewport.x&&g.bounds.x<=viewport.x+viewport.w&&g.bounds.y+g.bounds.h>=viewport.y&&g.bounds.y<=viewport.y+viewport.h}
     <image class="mainland-terrain" data-area={g.key} href={images.get(g.key)} width={g.sizeX} height={g.sizeY} transform={'translate('+g.bounds.x+' '+(-2*g.origin.position[2])+') scale(1 -1)'} preserveAspectRatio="none" style="image-rendering:pixelated"/>
    {/if}
   {/each}
   {#if showGrid}{#each bound??[] as g (g.key)}{#if images.has(g.key)}<WorldGridLines bounds={g.bounds} view={viewport} pixels={cellPixels} minorStep={1/g.factor}/>{/if}{/each}{/if}
   {#each visibleObjects as p (p.object.localOrdinal)}
    {@const networkPart=nativeNetwork.parts.get(p.object.localOrdinal)}
    <g class="mainland-save-object" transform={'translate('+p.x+' '+p.y+') scale('+1/p.factor+' '+(-1/p.factor)+')'} data-area={p.area} data-support={p.object.subgrid?.status}>
     {#if p.shape}<path d={p.shape.path} fill={networkPart?networkMapColor(networkPart.style,networkPart.kind):MAP_LAYER_COLORS[p.object.layer]} fill-opacity={selected===p.object.localOrdinal||groupSet.has(p.object.localOrdinal)?.9:networkPart?.kind==='fence'?.24:.65} stroke={selected===p.object.localOrdinal||groupSet.has(p.object.localOrdinal)?'#fff':MAP_LAYER_COLORS[p.object.layer]} vector-effect="non-scaling-stroke" stroke-width="1"/>
      {#if networkPart?.kind==='road'&&networkPart.diagonal&&cellPixels>=5}<path d={'M0 '+p.shape.height+'L'+p.shape.width+' 0'} stroke="#e8e6d9" stroke-opacity=".65" stroke-width="1" vector-effect="non-scaling-stroke" pointer-events="none"/>{/if}
      {#if networkPart?.kind==='fence'&&Number(p.object.itemId)===networkPart.style}<circle cx={p.factor/2} cy={p.factor/2} r={p.factor*.19} fill={networkMapColor(networkPart.style,'fence')} stroke="#504b43" stroke-width=".5" vector-effect="non-scaling-stroke" pointer-events="none"/>{/if}
      {#if showWorldArtwork(p.object,p.shape,cellPixels/p.factor)&&artwork.has(Number(p.object.itemId))}<WorldObjectArtwork href={artwork.get(Number(p.object.itemId))!} width={p.shape.width} height={p.shape.height} flipY/>{/if}
     {:else}<rect width="1" height="1" fill="none" stroke="#e4d2a5" vector-effect="non-scaling-stroke"/>{/if}
     {#if p.shape&&p.object.orientationCode!==null&&cellPixels/p.factor>=8&&p.object.layer!=='ground'&&p.object.layer!=='fence'&&(selected===p.object.localOrdinal||groupSet.has(p.object.localOrdinal))}<path d="M0 -.32L.19 .13L0 .04L-.19 .13Z" transform={'translate(.5 .5) rotate('+sourceOrientationAngle(p.object.orientationCode)+')'} fill="#fff" stroke="#27313a" stroke-width=".04" pointer-events="none"/>{/if}

    </g>
   {/each}
   <SaveSupportMap file={$localSaveSession.file} parents={supportMapParents} searchParents={supportSearchParents} scanAll={supportSearchActive} bind:cache={supportContents} pixels={cellPixels} {base} {locale} enabled={saveMode&&layerVisible(layerState,{layer:'surface'})&&!furnitureBlocked}/>
   {#each networkEdges as edge (edge.key)}<path d={'M'+edge.x1+' '+edge.y1+'L'+edge.x2+' '+edge.y2} stroke="#39382f" stroke-width=".42" stroke-linecap="round" fill="none" pointer-events="none"/><path d={'M'+edge.x1+' '+edge.y1+'L'+edge.x2+' '+edge.y2} stroke={networkMapColor(edge.base,'fence')} stroke-width=".25" stroke-linecap="round" fill="none" pointer-events="none"/>{/each}
   {#each visibleObjects.filter(p=>selected===p.object.localOrdinal||groupSet.has(p.object.localOrdinal)) as p (p.object.localOrdinal)}{#if p.shape}<path class="mainland-selection-outline" d={p.shape.path} transform={'translate('+p.x+' '+p.y+') scale('+1/p.factor+' '+(-1/p.factor)+')'} fill="none" stroke="#fff" stroke-width="2" vector-effect="non-scaling-stroke" pointer-events="none"/>{:else}<rect x={p.x} y={p.y-1/p.factor} width={1/p.factor} height={1/p.factor} fill="none" stroke="#fff" stroke-width="2" vector-effect="non-scaling-stroke" pointer-events="none"/>{/if}{/each}
   {#if biomeOpen}{#each biomeRemoved as p (p.object.localOrdinal)}{#if p.shape}<path class="biome-preset-remove" d={p.shape.path} transform={'translate('+p.x+' '+p.y+') scale('+1/p.factor+' '+(-1/p.factor)+')'} fill="#ef5350" fill-opacity=".45" stroke="#fff" stroke-dasharray="3 2" vector-effect="non-scaling-stroke" pointer-events="none"/>{/if}{/each}{#each biomeGhosts.filter(g=>g.x+g.shape.width/g.factor>=viewport.x&&g.x<=viewport.x+viewport.w&&g.y>=viewport.y&&g.y-g.shape.height/g.factor<=viewport.y+viewport.h) as g}<path class="biome-preset-add" d={g.shape.path} transform={'translate('+g.x+' '+g.y+') scale('+1/g.factor+' '+(-1/g.factor)+')'} fill="#4bddcd" fill-opacity=".65" stroke="#fff" stroke-dasharray="3 2" vector-effect="non-scaling-stroke" pointer-events="none"/>{#if Math.min(g.shape.width,g.shape.height)*cellPixels/g.factor>=14&&artwork.has(Number(g.plan.itemId))}<g transform={'translate('+g.x+' '+g.y+') scale('+1/g.factor+' '+(-1/g.factor)+')'}><WorldObjectArtwork href={artwork.get(Number(g.plan.itemId))!} width={g.shape.width} height={g.shape.height} opacity={.65} flipY/></g>{/if}{/each}{/if}
   {#if backupRegion&&biomeOpen}<rect x={backupRegion.x} y={backupRegion.y} width={backupRegion.w} height={backupRegion.h} fill="#73cfc5" fill-opacity=".13" stroke="#72e7cb" stroke-width="2" stroke-dasharray="5 3" vector-effect="non-scaling-stroke" pointer-events="none"/>{/if}
   {#if captureRegion}
    <rect class="scene-capture-region" x={captureRegion.x} y={captureRegion.y} width={captureRegion.w} height={captureRegion.h} fill="#73cfc5" fill-opacity=".13" stroke={regionBackupMode||capturePlan?.valid?'#72e7cb':'#ef5350'} stroke-width="2" stroke-dasharray="5 3" vector-effect="non-scaling-stroke"/>
    {#each [[captureRegion.x,captureRegion.y],[captureRegion.x+captureRegion.w,captureRegion.y],[captureRegion.x,captureRegion.y+captureRegion.h],[captureRegion.x+captureRegion.w,captureRegion.y+captureRegion.h]] as [x,y]}<circle cx={x} cy={y} r={4/Math.max(1,cellPixels)} fill="#fff" stroke="#156e72" vector-effect="non-scaling-stroke"/>{/each}
    {#each visibleMainlandSaved(capturePlan?.items??[],viewport) as p (p.object.localOrdinal)}{#if p.shape}<path class="scene-capture-member" d={p.shape.path} transform={'translate('+p.x+' '+p.y+') scale('+1/p.factor+' '+(-1/p.factor)+')'} fill="none" stroke="#72e7cb" stroke-width="2" vector-effect="non-scaling-stroke"/>{/if}{/each}
    {#each [...(capturePlan?.partial??[]),...(capturePlan?.outside??[])] as p}{#if p.shape}<path class="scene-capture-boundary" d={p.shape.path} transform={'translate('+p.x+' '+p.y+') scale('+1/p.factor+' '+(-1/p.factor)+')'} fill="none" stroke="#ef5350" stroke-width="2" vector-effect="non-scaling-stroke"/>{/if}{/each}
   {/if}
   {#if range?.moved}<rect x={Math.min(range.start.x,range.end.x)} y={Math.min(range.start.y,range.end.y)} width={Math.abs(range.end.x-range.start.x)} height={Math.abs(range.end.y-range.start.y)} fill="#b9c7d6" fill-opacity=".15" stroke="#fff" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>{/if}
   {#each (dragGroup??linkedClickDraft??alignmentPlan??groupPlan)?.ghosts??[] as g (g.object.object.localOrdinal)}{#if g.object.shape}<path class="mainland-group-ghost" d={g.draft?.shape.path??g.object.shape.path} transform={'translate('+g.x+' '+g.y+') scale('+1/g.object.factor+' '+(-1/g.object.factor)+')'} fill={(dragGroup??linkedClickDraft??alignmentPlan??groupPlan)?.next?'#4bddcd':'#ef5350'} fill-opacity=".65" stroke="#fff" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>{/if}{/each}
   {#if supportDisplay}<path d={supportDisplay.shape.path} transform={'translate('+supportDisplay.x+' '+supportDisplay.y+') scale('+1/supportDisplay.factor+' '+(-1/supportDisplay.factor)+')'} fill="#4bddcd" fill-opacity=".65" stroke="#fff" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>{/if}
   {#if displayAxis}
    {#if displayAxis.mode==='vertical'}<path d={'M'+displayAxis.x+' '+extent.y+'V'+(extent.y+extent.h)} stroke="#f5cf70" stroke-width="1.5" stroke-dasharray="6 4" vector-effect="non-scaling-stroke" pointer-events="none"/>
    {:else if displayAxis.mode==='horizontal'}<path d={'M'+extent.x+' '+displayAxis.y+'H'+(extent.x+extent.w)} stroke="#f5cf70" stroke-width="1.5" stroke-dasharray="6 4" vector-effect="non-scaling-stroke" pointer-events="none"/>
    {:else}<path d={'M'+(displayAxis.x-2)+' '+displayAxis.y+'h4M'+displayAxis.x+' '+(displayAxis.y-2)+'v4'} stroke="#f5cf70" stroke-width="2" vector-effect="non-scaling-stroke" pointer-events="none"/>{/if}
   {/if}
   {#if pasteGhost}{#each pasteGhost.ghosts as g}<g transform={'translate('+g.x+' '+g.y+') scale('+1/g.factor+' '+(-1/g.factor)+')'}><path d={g.shape.path} fill="#4bddcd" fill-opacity=".6" stroke="#fff" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>{#if Math.min(g.shape.width,g.shape.height)*cellPixels/g.factor>=14&&artwork.has(Number(g.plan.itemId))}<WorldObjectArtwork href={artwork.get(Number(g.plan.itemId))!} width={g.shape.width} height={g.shape.height} opacity={.65} flipY/>{/if}</g>{/each}{/if}
   {#if furnitureGhost}<g transform={'translate('+furnitureGhost.x+' '+furnitureGhost.y+') scale('+1/furnitureGhost.factor+' '+(-1/furnitureGhost.factor)+')'}><path class="mainland-stock-ghost" d={furnitureGhost.shape.path} fill={furnitureGhost.plan.action==='remove'?'#ef5350':'#e1b56b'} fill-opacity=".7" stroke="#fff" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>{#if furnitureGhost.plan.action!=='remove'&&Math.min(furnitureGhost.shape.width,furnitureGhost.shape.height)*cellPixels/furnitureGhost.factor>=14&&artwork.has(Number(furnitureGhost.plan.itemId))}<WorldObjectArtwork href={artwork.get(Number(furnitureGhost.plan.itemId))!} width={furnitureGhost.shape.width} height={furnitureGhost.shape.height} opacity={.65} flipY/>{/if}</g>{/if}
   {#if roadDraft}{#each roadDraft.ghosts as g}<rect x={g.x} y={g.y-g.size} width={g.size} height={g.size} fill={roadEraseDraft?'#e66a66':'#67c6a0'} fill-opacity=".55" stroke="#fff" vector-effect="non-scaling-stroke"/>{/each}{/if}
   {#if transfer}<path class="mainland-transfer-ghost" d={transfer.shape.path} transform={'translate('+transfer.x+' '+transfer.y+') scale('+1/transfer.factor+' '+(-1/transfer.factor)+')'} fill="#e1b56b" fill-opacity=".7" stroke="#fff" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>{/if}
   {#if draggedDraft&&objectDrag}<path class="mainland-save-ghost" d={draggedDraft.shape.path} transform={'translate('+draggedDraft.x+' '+draggedDraft.y+') scale('+1/objectDrag.target.factor+' '+(-1/objectDrag.target.factor)+')'} fill={draggedDraft.valid?'#4bddcd':'#ef5350'} fill-opacity=".65" stroke="#fff" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>{/if}
   {#if draft&&chosen}<path class="mainland-save-ghost" d={draft.shape.path} transform={'translate('+draft.x+' '+draft.y+') scale('+1/chosen.factor+' '+(-1/chosen.factor)+')'} fill={draft.valid?'#4bddcd':'#ef5350'} fill-opacity=".65" stroke="#fff" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>{/if}
  </svg>
 </button>
 <MapCameraControls zoom={camera.zoom} {maxZoom} {showGrid} onGrid={()=>showGrid=!showGrid} onZoom={value=>camera=zoomMapCamera(camera,value,maxZoom)} onFit={()=>camera=defaultMapCamera()} onPan={(dx,dy)=>camera=panMapCamera(camera,dx/camera.zoom,dy/camera.zoom)}/>
 {#if saveMode&&saveLoading}<p role="status" class="save-status">{sw[3]}</p>{:else if saveMode&&(saveFailed||projection.omitted)}<p class="save-status" role="status">{saveFailed?sw[4]:sw[5]} {projection.omitted||''}</p>{/if}
 {#if saveMode}<SubgridInspector bind:this={supportInspector} supports={allObjects.filter(p=>layerSelectable(layerState,p.object))} objects={projection.objects} {saveMaps} open={supportOpen} parent={chosen} file={$localSaveSession.file} {worker} grids={bound??[]} {rasters} {names} {base} {locale} canMove={supportCanMove} {nextRequest} onClose={closeSupport} initialChildPath={initialSupportPath} initialParentPoint={initialSupportPoint} onInitialConsumed={()=>initialSupportPoint=null} bind:placing={supportPlacing} bind:ghost={supportGhost} bind:preview={supportPreview}/>{/if}
 {#if saveMode}<GroupPasteControls {freePlacement} bind:this={pasteTools} bind:active={pasteActive} bind:ghost={pasteGhost} bind:axis={pasteAxis} items={pasteSelection} file={$localSaveSession.file} {worker} grids={bound??[]} {rasters} objects={projection.objects} omitted={projection.omitted} {locale} blocked={!furnitureReady||furnitureBlocked||!!roadSeed||networkOpen||supportOpen||furniturePlacing||groupPickupActive} {nextRequest} onBegin={beginPaste}/>{/if}
 {#if saveMode}<SaveFurniturePalette freePlacement={freePlacement} bind:this={furnitureTools} open={furnitureOpen} file={$localSaveSession.file} {worker} grids={bound??[]} {rasters} {chosen} objects={projection.objects} omitted={projection.omitted} {locale} blocked={furnitureBlocked} canStart={furnitureReady} {nextRequest} onBegin={beginFurniture} onClose={closeFurniture} bind:placing={furniturePlacing} bind:ghost={furnitureGhost}/>{/if}
 {#if biomeOpen&&worldPresetOpen}<IslandFurniturePreset world={true} bind:region={backupRegion} file={$localSaveSession.file} {worker} grids={bound??[]} {sessions} activeKey={grids[0]?.key??''} blocked={!furnitureReady||furnitureBlocked} allowed={testExport} {locale} {nextRequest} {label} onClose={closeBiome} bind:ghosts={biomeGhosts} bind:removed={biomeRemoved}/>{:else if biomeOpen&&independent&&backupRegion}{#key grids[0]?.key}<IslandFurniturePreset bind:region={backupRegion} file={$localSaveSession.file} {worker} grids={bound??[]} {sessions} activeKey={grids[0]?.key??''} blocked={!furnitureReady||furnitureBlocked} allowed={testExport} {locale} {nextRequest} {label} onClose={closeBiome} bind:ghosts={biomeGhosts} bind:removed={biomeRemoved}/>{/key}{:else if biomeOpen&&independent}<IslandFurniturePreset file={$localSaveSession.file} {worker} grids={islandGrids} {sessions} activeKey={grids[0]?.key??''} blocked={!furnitureReady||furnitureBlocked} allowed={testExport} {locale} {nextRequest} {label} onClose={closeBiome} bind:ghosts={biomeGhosts} bind:removed={biomeRemoved}/>{:else if biomeOpen&&biomeNetwork}<BiomeNetworkPreset file={$localSaveSession.file} {worker} grids={bound??[]} {rasters} objects={projection.objects} {sessions} omitted={projection.omitted} blocked={!furnitureReady||furnitureBlocked} allowed={testExport} {locale} {nextRequest} {label} onClose={closeBiome} bind:ghosts={biomeGhosts} bind:removed={biomeRemoved}/>{:else if biomeOpen}<BiomeFurniturePreset file={$localSaveSession.file} {worker} grids={bound??[]} {rasters} objects={projection.objects} {sessions} omitted={projection.omitted} blocked={!furnitureReady||furnitureBlocked} allowed={testExport} {locale} {nextRequest} {label} onClose={closeBiome} bind:ghosts={biomeGhosts} bind:removed={biomeRemoved}/>{/if}
  {#if captureRegion}<aside class="scene-capture-panel" aria-label={regionBackupMode?rgw[0]:crw[0]}>
   <strong>{regionBackupMode?rgw[0]:crw[0]}</strong><small>{crw[10]}</small>
   <div class="capture-dimensions">{#each ['x','y','w','h'] as dim}<label>{dim.toUpperCase()} <input type="number" step=".5" aria-label={dim.toUpperCase()} value={captureRegion[dim as keyof CaptureRegion]} on:change={e=>setCaptureDimension(dim as keyof CaptureRegion,e.currentTarget.valueAsNumber)}/></label>{/each}</div>
   {#if !regionBackupMode}<label><input type="checkbox" bind:checked={captureOptions.roads}/>{crw[1]}</label>
   <label><input type="checkbox" bind:checked={captureOptions.fences}/>{crw[2]}</label>
   <small>{crw[3]} {capturePlan?.furniture??0} · {crw[4]} {capturePlan?.roads??0} · {crw[5]} {capturePlan?.fences??0}</small>
   {#if capturePlan&&!capturePlan.valid}<small role="alert">{capturePlan.partial.length||capturePlan.outside.length?crw[6]:crw[7]}</small>{/if}{/if}
   <div><button type="button" disabled={!regionBackupMode&&!capturePlan?.valid} on:click={confirmCaptureRegion}>{regionBackupMode?rgw[1]:crw[8]}</button><button type="button" on:click={closeCaptureRegion}>{crw[9]}</button></div>
  </aside>{/if}
  {#if saveMode&&searchOpen&&!furnitureOpen}<aside class="overview-search"><input type="search" aria-label={sw[0]} placeholder={sw[0]} bind:value={query} on:input={()=>limit=60}/><div class="overview-results" on:scroll={e=>{const el=e.currentTarget;if(el.scrollTop+el.clientHeight>=el.scrollHeight-120)limit=Math.min(matches.length+supportMatches.length,limit+60);}}>{#each matches.slice(0,limit) as p (p.object.localOrdinal)}<button type="button" data-support={p.object.subgrid?.status} on:click={()=>{if(multiMode)toggleGroup(p.object.localOrdinal);else focus(p);}}>{#if artwork.has(Number(p.object.itemId))}<img src={artwork.get(Number(p.object.itemId))} alt="" loading="lazy"/>{/if}<span>{name(p,names)}</span></button>{/each}{#each supportMatches.slice(0,Math.max(0,limit-matches.length)) as m (m.parent.localOrdinal+':'+m.child.path.join('.'))}<button type="button" on:click={()=>{const p=allObjects.find(p=>p.object.localOrdinal===m.parent.localOrdinal);if(p&&layerSelectable(layerState,p.object)){focus(p);openSupport(p,m.child.path);}}}>{#if artwork.has(m.child.itemId)}<img src={artwork.get(m.child.itemId)} alt="" loading="lazy"/>{/if}<span>{names.get(m.child.itemId)??'—'}<small style="display:block">{ssw[2]} · {names.get(m.parent.itemId)??'—'}</small></span></button>{/each}{#if supportPending}<small role="status">{ssw[0]} · {supportSearchParents.length-supportPending}/{supportSearchParents.length}</small>{/if}{#if supportUnavailable}<small>{ssw[1]} · {supportUnavailable}</small>{/if}{#if !matches.length&&!supportMatches.length&&!supportPending}<small>{sw[6]}</small>{/if}</div></aside>{/if}
 {#if saveMode&&editSymmetryOpen}<aside class="linked-symmetry-panel"><WorldSymmetryControls {locale} value={editSymmetry} width={extent.w} height={extent.h} picking={editSymmetryPicking} showMirror={false} busy={!furnitureReady} onChange={changeEditSymmetry} onPick={()=>{stopMove();editSymmetryPicking=!editSymmetryPicking;}} onMirror={()=>{}}/><button type="button" on:click={()=>{editSymmetryOpen=false;editSymmetryPicking=false;}}>{words[1]}</button></aside>{/if}
 {#if saveMode&&layersOpen}<div class="overview-layers"><WorldLayerControls {locale} state={layerState} disabled={false} onChange={s=>{closeFurniture();layerState=s;selected=null;clearGroup();stopMove();}}/></div>{/if}
 {#if captureError}<p class="save-status" role="alert">{cw[5]} <button type="button" on:click={()=>captureError=false}>{cw[4]}</button></p>{/if}
 {#if saveMode&&selectionLimit}<p class="save-status" role="alert">{gw[5]}: {WORLD_BATCH_LIMIT} max</p>{/if}
 {#if transfer}<aside class="overview-transfer" aria-label={tw[0]}><strong>{tw[0]} · {label(transfer.area)}</strong><div><button type="button" disabled={transferStatus==='working'} on:click={validateTransfer}>{tw[1]}</button><button type="button" on:click={clearTransfer}>{tw[5]}</button></div>{#if transferStatus==='working'}<small role="status">{tw[2]}</small>{:else if transferStatus==='valid'}{#if testExport}<small role="status">{copyWords[1]}</small><button type="button" on:click={()=>runTransfer(true)}>{copyWords[0]}</button>{#if transferCopy}<button type="button" on:click={applyTransferCopy}>{checkpointText[0]}</button><a class="test-copy-link" href={transferCopy.url} download={transferCopy.name}>{copyWords[2]}</a>{/if}{:else}<small role="status">{tw[3]}</small>{/if}{:else if transferStatus==='dependency'}<small role="alert">{dependencyWords[locale]}</small>{:else if transferStatus==='error'}<small role="alert">{tw[4]}</small>{/if}</aside>{/if}
 {#if saveMode&&!captureRegion&&groupOpen&&group.length>1}<form class="overview-precise" on:submit|preventDefault={()=>{if(typeof groupX==='number'&&typeof groupZ==='number')applyGroup(groupX,groupZ);}}><strong>{gw[5]}: {group.length} · {gw[4]}</strong><label>ΔX<input type="number" step="1" bind:value={groupX} disabled={!groupReady} on:input={()=>alignment=null}/></label><label>ΔZ<input type="number" step="1" bind:value={groupZ} disabled={!groupReady} on:input={()=>alignment=null}/></label><button type="submit" disabled={!groupPlan?.next}>{gw[1]}</button><button type="button" on:click={clearGroup}>{gw[2]}</button>{#if testExport}<button type="button" disabled={!canCopyFurniture||pasteActive||groupPickupActive} on:click={()=>pasteTools?.capture()}>{pasteWords[0]}</button><button type="button" disabled={!canCutFurniture||pasteActive||groupPickupActive} on:click={()=>pasteTools?.capture(true)}>{cutWords[0]}</button><button type="button" disabled={!canCopyFurniture||pasteActive||groupPickupActive} on:click={()=>pasteTools?.begin(true)}>{pasteWords[2]}</button><button type="button" disabled={freePlacement||!canCopyFurniture||pasteActive||groupPickupActive} on:click={()=>pasteTools?.beginMirror()} aria-label={sy[1]} title={sy[1]}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M12 2v20M9 6 3 12l6 6ZM15 6l6 6-6 6Z"/></svg></button>{/if}<button type="button" disabled={!canCaptureScene} on:click={openCaptureRegion}>{sceneText[0]}</button><button type="button" disabled={!canCapture} on:click={()=>copyLayout(true)}>{cw[1]}</button><GroupPickupControls bind:this={groupPickup} bind:active={groupPickupActive} items={group} file={$localSaveSession.file} {locale} blocked={!furnitureReady||furnitureBlocked||!!roadSeed||networkOpen||furniturePlacing||supportOpen||pasteActive} onApplied={clearGroup}/>{#if moveError||!groupReady||groupPlan&&groupPlan.ghosts.length&&!groupPlan.next}<small role="alert">{editAxis?linkedText[1]:gw[6]}</small>{/if}{#if networkGroup}<small>{adjacentWords[1]}</small>{:else}<div class="group-advanced"><div class="group-rotation"><button type="button" title={ew[1]} aria-label={ew[1]} disabled={!uniformGroup} on:click={()=>applyAdvanced(1)}>⟲</button><button type="button" title={ew[2]} aria-label={ew[2]} disabled={!uniformGroup} on:click={()=>applyAdvanced(-1)}>⟳</button></div><WorldAlignmentControls {locale} count={group.length} selected={alignment} valid={!!alignmentPlan?.next} busy={!uniformGroup||!!editAxis} onPick={mode=>{alignment=mode;groupX=0;groupZ=0;moveError=false;}} onCommit={()=>{if(alignment)applyAdvanced(alignment);}} onCancel={()=>alignment=null}/></div>{/if}</form>{/if}
 {#if networkOpen}<aside class="overview-transfer network-palette" aria-label={nw[0]}><strong>{nw[0]}</strong><select aria-label={nw[1]} value={networkArea} on:change={e=>loadNetworkCatalog(e.currentTarget.value)}>{#each bound??[] as g}<option value={g.key}>{label(g.key)}</option>{/each}</select><div><button type="button" aria-pressed={networkKind==='road'} on:click={()=>{networkKind='road';networkLimit=60;}}>{nw[2]}</button><button type="button" aria-pressed={networkKind==='fence'} on:click={()=>{networkKind='fence';networkLimit=60;}}>{nw[3]}</button></div><input type="search" placeholder={nw[4]} aria-label={nw[4]} bind:value={networkQuery} on:input={()=>networkLimit=60}/>{#if networkRequest}<small role="status">{nw[6]}</small>{:else}<div class="network-items" role="group" aria-label={nw[5]} on:scroll={e=>{const el=e.currentTarget;if(el.scrollTop+el.clientHeight>=el.scrollHeight-80)networkLimit=Math.min(networkOptions.length,networkLimit+60);}}>{#each networkOptions.slice(0,networkLimit) as option (option.itemId)}<button type="button" title={option.name} aria-label={option.name} on:click={()=>chooseNetwork(option)}>{#if artwork.get(option.itemId)}<img src={artwork.get(option.itemId)} alt="" loading="lazy"/>{/if}<span>{option.name}</span></button>{/each}</div>{/if}<small>{nw[7]}</small>{#if roadError}<small role="alert">{rw[9]}</small>{/if}<button type="button" on:click={closeRoad}>{rw[10]}</button></aside>{/if}
 {#if roadSeed}<aside class="overview-transfer road-edit" aria-label={fenceEditing?fw[0]:rwm[2]}><strong>{isNetworkStyle(roadSeed)?roadSeed.name:fenceEditing?fw[0]:rwm[2]}</strong><select bind:value={roadTool} on:change={resetRoad} disabled={!!roadWorker||!!fenceFamilyRequest} aria-label={fenceEditing?fw[0]:rwm[2]}>{#each (isNetworkStyle(roadSeed)?(fenceEditing?['brush','line','outline',...(fenceDiagonalVerified?['diagonal-line']:[])]:['brush','line','outline','fill','diagonal-line','diagonal-fill']):fenceEditing?['brush','connect-brush','erase-brush','line','outline',...(fenceDiagonalVerified?['diagonal-line','diagonal-connect','diagonal-erase','diagonal-erase-rect']:[]),'connect-line','connect-outline','erase-line','erase-rect']:['brush','erase-brush','line','outline','fill','diagonal-line','diagonal-fill','erase-line','erase-rect','diagonal-erase','diagonal-erase-rect',...(fenceStyleOptions.length?['replace-road']:[])]) as tool,i}<option value={tool}>{tool==='brush'?brushWords[0]:tool==='erase-brush'?brushWords[1]:tool==='connect-brush'?brushWords[2]:tool==='replace-road'?rwm[1]:tool==='diagonal-fill'?rwm[0]:tool==='diagonal-line'?fdw:tool==='diagonal-connect'?fdm[0]:tool==='diagonal-erase'?fdm[1]:tool==='diagonal-erase-rect'?fdm[2]:tool==='connect-line'?fm[0]:tool==='connect-outline'?fm[1]:rw[['line','outline','fill','erase-line','erase-rect'].indexOf(tool)+1]}</option>{/each}</select><small>{savedNetworkFreehand(roadTool)?brushWords[3]:rw[6]}</small>{#if !fenceEditing&&roadTool==='replace-road'}<select bind:value={fenceStyleTarget} aria-label={fm[3]} disabled={!!roadWorker} on:change={resetRoad}>{#each fenceStyleOptions as option}<option value={option.id}>{option.name}</option>{/each}</select>{/if}{#if !fenceEditing&&fenceFamilyRequest}<small role="status">{fm[4]}</small>{/if}{#if fenceEditing}<small>{isNetworkStyle(roadSeed)?nw[7]:fw[1]}</small>{#if fenceFamilyVerified&&fenceStyleOptions.length&&!roadDraft&&!fenceFamilyRequest}<select bind:value={fenceStyleTarget} aria-label={fm[3]} disabled={!!roadWorker}>{#each fenceStyleOptions as option}<option value={option.id}>{option.name}</option>{/each}</select><button type="button" disabled={!!roadWorker||!fenceStyleTarget} title={fm[4]} on:click={requestFenceStyle}>{fm[2]}</button>{/if}{#if fenceFamilyRequest}<small role="status">{fw[2]}</small>{/if}{/if}<small>{rw[11]}</small>{#if roadDraft}{#if 'replacement' in roadDraft.plan&&roadDraft.plan.replacement}<small>{fenceEditing?fm[2]:rwm[1]} · {fm[3]}: {fenceStyleOptions.find(f=>f.id===fenceStyleTarget)?.name??names.get(roadDraft.plan.replacement)??''}</small>{:else}<small>{rw[7]}: {roadCount}</small>{/if}{#if !roadCopy}<button type="button" disabled={!!roadWorker||roadPointer!==null} on:click={makeRoadCopy}>{rw[8]}</button>{:else}<small>{copyWords[1]}</small><button type="button" on:click={applyRoad}>{checkpointText[0]}</button><a class="test-copy-link" href={roadCopy.url} download={roadCopy.name}>{copyWords[2]}</a>{/if}{/if}{#if roadError}<small role="alert">{rw[9]}</small>{/if}<button type="button" on:click={closeRoad}>{rw[10]}</button></aside>{/if}
 {#if saveMode&&!captureRegion&&chosen&&!furniturePlacing&&!furnitureGhost&&!roadSeed&&!pasteActive&&!networkOpen}<div class="overview-selection"><strong>{name(chosen,names)}</strong>{#if chosen.object.subgrid}<button type="button" aria-pressed={supportOpen} on:click={()=>supportOpen?closeSupport():openSupport()}>{supportText[0]}{#if chosen.object.subgrid.objectCount!==null} · {chosen.object.subgrid.objectCount}{/if}</button>{#if testExport&&!supportOpen}<GroupPickupControls bind:active={groupPickupActive} items={[chosen]} file={$localSaveSession.file} {locale} blocked={!furnitureReady||furnitureBlocked||biomeOpen||moving||groupOpen} onApplied={()=>{stopMove();closeSupport();}}/>{/if}{/if}{#if testExport&&(roadSeedEligible(chosen)||fenceSeedEligible(chosen))}<button type="button" disabled={!furnitureReady||furnitureBlocked} on:click={beginRoad}>{fenceSeedEligible(chosen)?fw[0]:rwm[2]}</button>{/if}<button type="button" aria-pressed={moving} disabled={!canMove} on:click={()=>{moving=!moving;hover=null;}}>{moving?ew[3]:ew[0]}</button><button type="button" aria-label={ew[1]} title={ew[1]} disabled={!layerSelectable(layerState,chosen.object)||!mainlandSavedRotateEligible(chosen,freePlacement)||saveLoading||saveFailed||failed||!!pending.size} on:click={()=>rotate(-1)}>⟲</button><button type="button" aria-label={ew[2]} title={ew[2]} disabled={!layerSelectable(layerState,chosen.object)||!mainlandSavedRotateEligible(chosen,freePlacement)||saveLoading||saveFailed||failed||!!pending.size} on:click={()=>rotate(1)}>⟳</button><button type="button" disabled={!layerSelectable(layerState,chosen.object)} on:click={()=>onChoose(chosen!.area,chosen!.object.localOrdinal)}>{sw[2]}</button>{#if adjacentIds.length>1}<button type="button" disabled={!adjacentSelectable||saveLoading||saveFailed} title={adjacentWords[1]} on:click={()=>setGroup(adjacentIds)}>{adjacentWords[0]} · {adjacentIds.length}</button>{/if}{#if testExport}<button type="button" disabled={!canCopyFurniture} on:click={()=>pasteTools?.capture()}>{pasteWords[0]}</button><button type="button" disabled={!canCutFurniture||pasteActive||groupPickupActive} on:click={()=>pasteTools?.capture(true)}>{cutWords[0]}</button><button type="button" disabled={!canCopyFurniture} on:click={()=>pasteTools?.begin(true)}>{pasteWords[2]}</button><button type="button" disabled={freePlacement||!canCopyFurniture||pasteActive||groupPickupActive} on:click={()=>pasteTools?.beginMirror()} aria-label={sy[1]} title={sy[1]}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M12 2v20M9 6 3 12l6 6ZM15 6l6 6-6 6Z"/></svg></button>{/if}<button type="button" disabled={!canCaptureScene} on:click={openCaptureRegion}>{sceneText[0]}</button><button type="button" disabled={!canCapture} on:click={()=>copyLayout(true)} aria-label={cw[1]} title={cw[1]}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></svg></button><button type="button" aria-label={pw[0]} aria-pressed={preciseOpen} disabled={!canMove} on:click={()=>{preciseOpen=!preciseOpen;stopMove();}}>{pw[0]}</button>{#if moving||moveError}<small role={moveError?'alert':undefined}>{editAxis?linkedText[1]:ew[6]}</small>{/if}</div>{/if}
 {#if saveMode&&chosen&&preciseOpen&&nativeCell}<form class="overview-precise" on:submit|preventDefault={applyPrecise}><strong>{pw[2]}</strong><label>X<input type="number" step="1" bind:value={preciseX} disabled={!canMove}/></label><label>Z<input type="number" step="1" bind:value={preciseZ} disabled={!canMove}/></label><button type="submit" disabled={!canMove||!preciseChanged}>{pw[1]}</button><button type="button" aria-label={words[1]} on:click={()=>preciseOpen=false}>×</button></form>{/if}
 {#if saveMode}<div class="overview-history">{#if multiMode}<button type="button" title={gw[3]} aria-label={gw[3]} on:click={()=>setGroup(matches.map(p=>p.object.localOrdinal))}>▦</button>{/if}<button type="button" aria-label={ew[4]} title={ew[4]} disabled={saveLoading||saveFailed||timeline.cursor===0&&(!$localSaveSession.worldCheckpoint||$localSaveSession.worldCheckpoint.cursor===0)} on:click={()=>travel(-1)}>↶</button><button type="button" aria-label={ew[5]} title={ew[5]} disabled={saveLoading||saveFailed||timeline.cursor===timeline.snapshots.length-1&&(currentWorldEdits(timeline).length>0||!$localSaveSession.worldCheckpoint||$localSaveSession.worldCheckpoint.cursor===$localSaveSession.worldCheckpoint.files.length-1)} on:click={()=>travel(1)}>↷</button></div>{/if}
 {#if overlaps.length}<div class="overlap-choices"><small>{words[4]}</small>{#each overlaps as g (g.key)}<button type="button" on:click={()=>onChoose(g.key)}>{label(g.key)}</button>{/each}</div>{/if}
</section>
<style>
 .scene-capture-panel{position:absolute;right:6px;top:52px;z-index:9;display:grid;gap:6px;width:min(260px,calc(100% - 12px));padding:8px;background:var(--wand-card);color:var(--wand-text);border:1px solid var(--wand-line);border-radius:6px}.scene-capture-panel label{display:flex;align-items:center;gap:5px}.capture-dimensions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}.capture-dimensions input{min-width:0;width:100%;background:var(--wand-menu);color:inherit;border:1px solid var(--wand-line)}.scene-capture-panel button{margin-right:5px}.scene-capture-panel small{font-size:12px}
 .mainland-overview{position:absolute;inset:0;z-index:14;background:var(--wand-bg);color:var(--wand-text);overflow:hidden;isolation:isolate}.mainland-map{position:absolute;inset:0;width:100%;height:100%;background:#27313a;border:0;padding:0;touch-action:none}.mainland-map svg{display:block;width:100%;height:100%}
 .linked-symmetry-panel{position:absolute;top:52px;left:6px;z-index:8;width:min(260px,calc(100% - 12px));background:var(--wand-card);border:1px solid var(--wand-line);border-radius:6px;padding:6px;display:grid;gap:5px}
 .overview-tools,.overlap-choices,.mainland-overview p{position:absolute;z-index:4;background:var(--wand-card);border:1px solid var(--wand-line);border-radius:6px;padding:5px 8px}.overview-tools{top:6px;left:6px;display:flex;gap:8px;align-items:center}.overview-tools button{display:grid;place-items:center;width:34px;height:34px}.overview-tools svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.7}.mainland-overview p{top:52px;left:6px;margin:0}.overlap-choices{left:8px;bottom:8px;display:grid;gap:4px;max-width:calc(100% - 70px)}button:not(.mainland-map){background:var(--wand-menu);color:inherit;border:1px solid var(--wand-line);border-radius:5px;cursor:pointer;padding:5px 8px}
 .network-palette .network-items{display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));max-height:min(46vh,380px);overflow:auto;gap:4px}.network-items button{min-width:0;display:flex;flex-direction:column;align-items:center;gap:3px;overflow-wrap:anywhere;font-size:11px}.network-items img{width:46px;height:46px;object-fit:contain}.network-palette input{min-width:0;color:inherit;background:var(--wand-menu);border:1px solid var(--wand-line);border-radius:5px;padding:5px}
 .overview-tools select{font:inherit;max-width:40vw;background:var(--wand-menu);color:var(--wand-text);border:1px solid var(--wand-line);border-radius:5px;padding:6px}.overview-transfer{position:absolute;z-index:7;right:6px;top:52px;width:min(300px,calc(100% - 12px));display:grid;gap:6px;padding:8px;background:var(--wand-card);border:1px solid var(--wand-line);border-radius:6px}.overview-transfer div{display:flex;gap:4px}.overview-transfer small{color:var(--wand-muted)}.test-copy-link{color:var(--wand-accent);font-size:13px;text-align:center;padding:5px;border:1px solid var(--wand-line);border-radius:5px}
 .overview-precise{position:absolute;z-index:6;right:6px;top:52px;display:grid;grid-template-columns:1fr 1fr auto;gap:6px;align-items:end;width:min(280px,calc(100% - 12px));padding:8px;background:var(--wand-card);border:1px solid var(--wand-line);border-radius:6px}.overview-precise strong{grid-column:1/-1;font-size:12px}.overview-precise label{display:grid;gap:3px;font-size:12px;min-width:0}.overview-precise input{box-sizing:border-box;width:100%;padding:6px;background:var(--wand-menu);color:inherit;border:1px solid var(--wand-line);border-radius:5px}.overview-precise button:disabled{opacity:.45}
 .group-advanced{grid-column:1/-1;display:grid;gap:6px}.group-rotation{display:flex;gap:4px}
 .overview-search,.overview-layers,.overview-selection{position:absolute;z-index:5;background:var(--wand-card);color:var(--wand-text);border:1px solid var(--wand-line);border-radius:6px;padding:6px}
 .overview-search{top:100px;bottom:45px;left:6px;width:min(270px,65%);display:flex;flex-direction:column;gap:5px}.overview-search input{font:inherit;background:var(--wand-menu);color:inherit;border:1px solid var(--wand-line);padding:6px;min-width:0}.overview-results{overflow:auto;display:grid;gap:3px;align-content:start}.overview-results button{display:flex;align-items:center;gap:7px;text-align:left;min-height:32px}.overview-results img{width:36px;height:36px;object-fit:contain}.overview-layers{top:52px;right:6px;max-height:75%;overflow:auto}.overview-selection{bottom:6px;left:6px;display:flex;align-items:center;gap:8px;max-width:calc(100% - 65px)} .mainland-overview p.save-status{top:52px;max-width:75%}.overview-selection{flex-wrap:wrap}.overview-history{position:absolute;z-index:5;right:60px;bottom:6px;display:flex;gap:4px}.overview-history button{min-width:34px;min-height:34px}
</style>
