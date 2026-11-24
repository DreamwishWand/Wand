<script lang="ts">
 import MapCameraControls from './MapCameraControls.svelte';
 import {worldShortcut,worldShortcutTarget,NUDGE} from './world-shortcuts.ts';
 import {designClipboard,pasteDesign,canPasteDesign,removeDesignGroup,transformDesignGroup,type DesignClipItem} from './design-layout.ts';

 import {onDestroy} from 'svelte';
 import type {PublicTerrainGridRef} from './public-terrain-projection.ts';
 import type {TerrainRaster,TerrainBinding} from './terrain-binding.ts';
 import {terrainWarnings} from './terrain-binding.ts';
 import {nativeSourceFloorTint} from './native-terrain-canvas.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 import {base} from '$app/paths';
 import {worldArtwork,mapCellPixels,showWorldArtwork,visibleWorldArtworkIds} from './world-artwork.ts';
 import WorldLayerControls from './WorldLayerControls.svelte';
 import {defaultWorldLayers,layerVisible,layerSelectable,type WorldLayerState} from './world-layer-state.ts';
 import WorldObjectArtwork from './WorldObjectArtwork.svelte';
 import WorldSymmetryControls from './WorldSymmetryControls.svelte';
 import {symmetricDesignItems,symmetryPlan,commitSymmetry,type DesignSymmetry,type SymmetryItem} from './design-symmetry.ts';
 import WorldAlignmentControls from './WorldAlignmentControls.svelte';
 import {alignmentTargets,type MapAlignment} from './map-alignment.ts';
 import {alignDesign} from './design-layout.ts';
 import {sourceOrientationAngle} from './source-object-map.ts';
 import {emptyDesign,currentDesign,travelDesign,placeDesign,transformDesign,designCandidateValid,designShapeMap,serializeDesign,parseDesign,restoreDesign,designItemCounts,DESIGN_FILE_LIMIT,type DesignPlacement,type DesignCatalogItem,type DesignItemGeometry,type DesignTimeline} from './design-layout.ts';
 import {defaultMapCamera,maxMapZoom,zoomMapCamera,panMapCamera,mapCameraViewBox,mapViewportBounds,wheelMapCamera,createMapPanGesture} from './map-camera.ts';
 import {mapPainterOrder,MAP_LAYER_COLORS,MAP_LAYER_LABELS,matchesSelectionLayer,type MapSelectionLayer} from './source-map-layers.ts';
 import {savedShapesAt,savedShapesInRect,visibleSavedObjects} from './saved-shape-map.ts';
 import {nativeActionBlocked} from './native-edit-restrictions.ts';
 import {exclusiveAnchorClass} from './saved-map-transform.ts';
 export let active=false;
 export let layerState:WorldLayerState=defaultWorldLayers();
 let layersOpen=false;
 let seenLayers=layerState;
 function applyLayers(next:WorldLayerState){if(busyImport)return;layerState=next;}
 $: if(layerState!==seenLayers){seenLayers=layerState;cancel();selected=null;groupIds=[];}
 export let grid:PublicTerrainGridRef|null=null;
 export let raster:TerrainRaster|null=null;
 export let worker:Worker|null=null;
 export let nextRequest:()=>number;
 export let locale:WandLanguage='ja';
 let layouts:Record<string,DesignTimeline>={};
 let cache:Record<string,Map<number,DesignItemGeometry>>={};
 let catalog:DesignCatalogItem[]=[],catalogLocale='',catalogLoading=false,catalogError='',catalogId=0;
 let images=new Map<number,string>(),imagePending=new Set<number>();
 let query='',layer:MapSelectionLayer='all',limit=80;
 let selected:number|null=null,placing:DesignItemGeometry|null=null,shapeId=0,loadingShape=false,error='';
 let orientation=2,hover:{x:number;y:number}|null=null,moveMode=false;
 let camera=defaultMapCamera(),svg:SVGSVGElement;
 let mapWidth=0,mapHeight=0;
 const gesture=createMapPanGesture();
 let subscribed:Worker|null=null,lastGrid='';
 let paletteOpen=true,root:HTMLDivElement;
 type Cell={x:number;y:number};
 type DirectDrag={id:number;start:Cell;end:Cell;clientX:number;clientY:number;ids:number[];add:boolean;kind:'move'|'marquee';moved:boolean};
 let direct:DirectDrag|null=null,suppressDirectClick=false,spacePan=false;
 $: dragPlan=direct?.moved&&direct.kind==='move'?transformDesignGroup(timeline,direct.ids,definitions,direct.end.x-direct.start.x,direct.end.y-direct.start.y,0,width,height):null;
 let symmetryOpen=false,symmetry:DesignSymmetry|null=null,symmetryPicking=false;
 let alignmentOpen=false,alignmentAction:MapAlignment|null=null;
 $: alignmentPreview=alignmentAction&&map?alignmentTargets(map,objects.filter(o=>selectedIds.has(o.localOrdinal)),alignmentAction):null;
 $: alignmentPlan=alignmentAction&&map?alignDesign(timeline,map,[...selectedIds],definitions,alignmentAction,width,height):null;
 $: if(selectedIds.size<2){alignmentAction=null;alignmentOpen=false;}
 function pickAlignment(mode:MapAlignment){alignmentAction=mode;direct=null;moveMode=false;}
 function commitAlignment(){if(alignmentPlan){save(alignmentPlan);alignmentAction=null;}}
 let groupIds:number[]=[],clipboard:DesignClipItem[]=[],pasting:DesignClipItem[]=[],pasteRequest=0,pastePending:DesignClipItem[]=[],lastPoint:{x:number;y:number}|null=null;
 $: selectedIds=new Set(groupIds.length?groupIds:selected===null?[]:[selected]);
 let importInput:HTMLInputElement,showCounts=false,reading=false,importEpoch=0;
 let pendingImport:{id:number;key:string;placements:DesignPlacement[];timeline:DesignTimeline}|null=null;
 const labels={
  ja:['保存','読み込み','必要な家具','設計を読み込めませんでした。対象エリアと家具の形状を確認してください。','現在のエリアの設計を置き換えますか？','読み込み中…'],
  en:['Save design','Open design','Required items','Unable to open design. Check the area and item geometry.','Replace the current area design?','Opening…'],
  fr:['Enregistrer','Ouvrir','Objets nécessaires','Impossible d’ouvrir le plan. Vérifiez la zone et les objets.','Remplacer le plan de la zone ?','Ouverture…'],
  it:['Salva','Apri','Oggetti necessari','Impossibile aprire il progetto. Controlla area e oggetti.','Sostituire il progetto dell’area?','Apertura…'],
  de:['Speichern','Öffnen','Benötigte Objekte','Entwurf konnte nicht geöffnet werden. Bereich und Objekte prüfen.','Entwurf dieses Bereichs ersetzen?','Wird geöffnet…'],
  'es-ES':['Guardar','Abrir','Objetos necesarios','No se pudo abrir el diseño. Comprueba la zona y los objetos.','¿Reemplazar el diseño de esta zona?','Abriendo…'],
  'zh-CN':['保存设计','打开设计','所需物品','无法打开设计，请检查区域和物品形状。','替换当前区域的设计？','正在打开…'],
  'pt-BR':['Salvar','Abrir','Itens necessários','Não foi possível abrir o projeto. Verifique a área e os itens.','Substituir o projeto da área?','Abrindo…']
 } as const;
 $: words=labels[locale]??labels.en;
 $: busyImport=reading||pendingImport!==null;
 $: counts=designItemCounts(placements);
 $: names=new Map(catalog.map(o=>[o.itemId,o.name]));
 $: if(active&&showCounts)loadImages([...counts.keys()].map(itemId=>({itemId})));
 function exportFile(){
  if(!grid)return;
  const url=URL.createObjectURL(new Blob([serializeDesign(timeline,grid)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='wand-world-design-'+grid.key.replace(/[^a-zA-Z0-9_-]/g,'_')+'.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 async function importFile(event:Event){
  const input=event.currentTarget as HTMLInputElement,file=input.files?.[0];input.value='';
  if(!file||!grid||!worker||busyImport)return;
  const target=grid,original=timeline,own=worker,epoch=++importEpoch;
  reading=true;error='';
  try{
   if(file.size>DESIGN_FILE_LIMIT)throw Error('size');
   const incoming=parseDesign(await file.text(),target);
   if(epoch!==importEpoch||grid?.key!==target.key||timeline!==original||worker!==own||!active)return;
   if(currentDesign(original).length&&!window.confirm(words[4]))return;
   cancel();
   const id=nextRequest();
   pendingImport={id,key:target.key,placements:incoming,timeline:original};
   own.postMessage({command:'design-shapes',requestId:id,key:target.key,itemIds:[...new Set(incoming.map(p=>p.itemId))]});
  }catch{if(epoch===importEpoch){pendingImport=null;error=words[3];}}
  finally{if(epoch===importEpoch)reading=false;}
 }
 const normalize=(s:string)=>s.normalize('NFKC').toLocaleLowerCase().trim();
 $: terms=normalize(query).split(/\s+/).filter(Boolean);
 $: filtered=catalog.filter(o=>layerSelectable(layerState,o)&&(layer==='all'||o.layer===layer)&&terms.every(t=>normalize(o.name).includes(t)));
 $: visibleCatalog=filtered.slice(0,limit);
 $: if(active&&paletteOpen)loadImages(visibleCatalog);
 async function loadImages(items:readonly {itemId:number}[]){
   for(const o of items){
     if(imagePending.has(o.itemId))continue;
     imagePending.add(o.itemId);
     void worldArtwork(base,o.itemId).then(url=>{if(url)images=new Map(images).set(o.itemId,url);}).catch(()=>{imagePending.delete(o.itemId);});
   }
 }
 $: if(worker!==subscribed){
   subscribed?.removeEventListener('message',receive);subscribed=worker;subscribed?.addEventListener('message',receive);
 }
 onDestroy(()=>subscribed?.removeEventListener('message',receive));
 $: if(grid?.key!==lastGrid){
   lastGrid=grid?.key??'';symmetry=null;symmetryPicking=false;direct=null;spacePan=false;groupIds=[];pasting=[];pastePending=[];pasteRequest=0;lastPoint=null;importEpoch++;reading=false;pendingImport=null;selected=null;placing=null;hover=null;moveMode=false;loadingShape=false;shapeId=0;error='';camera=defaultMapCamera();
 }
 $: if(active&&grid&&worker&&locale!==catalogLocale)requestCatalog(grid,locale,worker);
 function requestCatalog(g:PublicTerrainGridRef,language:WandLanguage,w:Worker){
   catalogLocale=language;catalogLoading=true;catalogError='';catalogId=nextRequest();
   w.postMessage({command:'design-catalog',requestId:catalogId,key:g.key,locale:language});
 }
 function receive(e:MessageEvent){
   const d=e.data;
   if(pasteRequest&&d?.requestId===pasteRequest){
     pasteRequest=0;const clip=pastePending;pastePending=[];
     if(!active||!grid||d.kind!=='design-shapes'||d.key!==grid.key||!Array.isArray(d.result))return;
     const factor=String(grid.factor),incoming=new Map<number,DesignItemGeometry>((d.result as DesignItemGeometry[]).map(g=>[g.itemId,g]));
     if(clip.some(p=>!incoming.has(p.itemId)&&!definitions.has(p.itemId))){error='配置形状を取得できませんでした。';return;}
     cache={...cache,[factor]:new Map([...(cache[factor]??new Map<number,DesignItemGeometry>()),...incoming])};
     if(clip.some(p=>{const g=incoming.get(p.itemId)??definitions.get(p.itemId);return !g||!layerSelectable(layerState,g);})){error=locale==='ja'?'非表示またはロック中のレイヤーです。':'The layer is hidden or locked.';return;}pasting=clip;hover=lastPoint;return;
   }
   if(pendingImport&&d?.requestId===pendingImport.id){
     const pending=pendingImport;pendingImport=null;
     if(!grid||!active||grid.key!==pending.key||timeline!==pending.timeline)return;
     if(d.kind!=='design-shapes'||d.key!==grid.key||!Array.isArray(d.result)){error=words[3];return;}
     const incoming=new Map<number,DesignItemGeometry>((d.result as DesignItemGeometry[]).map(g=>[g.itemId,g]));
     const next=restoreDesign(timeline,pending.placements,incoming,width,height);
     if(!next){error=words[3];return;}
     const factor=String(grid.factor);
     cache={...cache,[factor]:new Map([...(cache[factor]??new Map<number,DesignItemGeometry>()),...incoming])};
     selected=null;groupIds=[];cancel();save(next);return;
   }
   if(d?.requestId===catalogId){
     catalogLoading=false;
     if(d.kind==='design-catalog'&&Array.isArray(d.items)){catalog=d.items;limit=80;}
     else catalogError='家具一覧を取得できませんでした。';
   }
   if(d?.requestId===shapeId){
     loadingShape=false;
     if(d.kind!=='design-shape'||!grid||d.key!==grid.key||!d.result){error='配置形状を取得できませんでした。';return;}
     const g=d.result as DesignItemGeometry;
     const key=String(grid.factor);
     cache={...cache,[key]:new Map(cache[key]??[]).set(g.itemId,g)};
     if(!layerSelectable(layerState,g))return;
     placing=g;orientation=2;selected=null;moveMode=false;hover=null;error='';
   }
 }
 function chooseItem(id:number){
   if(!worker||!grid||busyImport)return;
   groupIds=[];pasting=[];pastePending=[];pasteRequest=0;
   const g=definitions.get(id);
   if(g){if(!layerSelectable(layerState,g))return;placing=g;orientation=2;selected=null;moveMode=false;hover=null;error='';shapeId=0;loadingShape=false;return;}
   shapeId=nextRequest();loadingShape=true;error='';placing=null;moveMode=false;hover=null;
   worker.postMessage({command:'design-shape',requestId:shapeId,key:grid.key,itemId:id});
 }
 const empty=emptyDesign();
 $: timeline=grid?layouts[grid.key]??empty:empty;
 $: placements=currentDesign(timeline);
 $: definitions=cache[String(grid?.factor)]??new Map<number,DesignItemGeometry>();
 $: map=grid?designShapeMap(placements,definitions,grid):null;
 $: objects=map?mapPainterOrder(map.objects):[];
 $: width=grid?grid.sizeX*grid.factor:1;
 $: height=grid?grid.sizeY*grid.factor:1;
 $: extent={x:0,y:0,w:width,h:height};
 $: maxZoom=maxMapZoom(Math.max(width,height));
 $: viewBox=mapCameraViewBox(camera,extent);
 $: viewport=mapViewportBounds(camera,extent);
 $: visible=map?visibleSavedObjects(objects.filter(o=>layerVisible(layerState,o)),map.shapes,viewport,selected):[];
 $: cellPixels=mapCellPixels(viewport,mapWidth,mapHeight);
 $: if(active&&map)loadImages(visibleWorldArtworkIds(visible,map.shapes,cellPixels).map(itemId=>({itemId})));
 $: if(active&&placing)loadImages([{itemId:placing.itemId}]);
 $: if(active&&pasting.length)loadImages(pasting.map(p=>({itemId:p.itemId})));
 $: chosen=placements.find(o=>o.id===selected)??null;
 $: chosenGeometry=chosen?definitions.get(chosen.itemId)??null:null;
 $: ghostGeometry=placing??(moveMode?chosenGeometry:null);
 $: ghostOrientation=placing?orientation:chosen?.orientation??2;
 $: ghostShape=ghostGeometry?.shapes[ghostGeometry.itemId+':'+ghostOrientation*4];
 $: ghostValid=Boolean(hover&&ghostGeometry&&designCandidateValid(placements,
   {id:moveMode&&chosen?chosen.id:timeline.nextId,itemId:ghostGeometry.itemId,x:hover.x,y:hover.y,orientation:ghostOrientation},ghostGeometry,width,height));
 $: binding=grid&&raster?{raster,factor:grid.factor,verifiedGridOrdinals:[]} satisfies TerrainBinding:null;
 $: warnings=binding&&hover&&ghostShape?terrainWarnings(binding,ghostShape,hover.x,hover.y):[];
 $: terrainUrl=raster&&active?terrainImage(raster):'';
 function terrainImage(r:TerrainRaster){
   const canvas=document.createElement('canvas');canvas.width=r.sizeX;canvas.height=r.sizeY;
   const ctx=canvas.getContext('2d');if(!ctx)return '';
   const data=ctx.createImageData(r.sizeX,r.sizeY),colors=new Map<number,readonly [number,number,number]>();
   for(let i=0;i<r.nativeFloorValues.length;i++){const value=r.nativeFloorValues[i];let rgb=colors.get(value);if(!rgb){rgb=nativeSourceFloorTint(value);colors.set(value,rgb);}data.data.set([rgb[0],rgb[1],rgb[2],255],i*4);}
   ctx.putImageData(data,0,0);return canvas.toDataURL('image/png');
 }
 function save(next:DesignTimeline|null){
   if(!grid||!next){error='配置範囲・編集制限・同種の道やフェンスの重複を確認してください。';return;}
   layouts={...layouts,[grid.key]:next};error='';
 }
 function cancel(){symmetryPicking=false;alignmentAction=null;direct=null;placing=null;moveMode=false;hover=null;shapeId=0;loadingShape=false;error='';pasting=[];pastePending=[];pasteRequest=0;}
 function travel(delta:-1|1){cancel();selected=null;groupIds=[];save(travelDesign(timeline,delta));}
 function rotate(delta:number){
   alignmentAction=null;
   if(pasting.length)return;
   if(groupIds.length){save(transformDesignGroup(timeline,groupIds,definitions,0,0,-delta,width,height));return;}
   if(placing){if(!nativeActionBlocked(placing.editRestrictions,'rotate')&&!exclusiveAnchorClass(String(placing.itemId)))orientation=(orientation+delta+4)%4;return;}
   if(chosen&&chosenGeometry)save(transformDesign(timeline,chosen.id,chosenGeometry,chosen.x,chosen.y,(chosen.orientation+delta+4)%4,width,height));
 }
 function duplicate(){beginPaste(designClipboard(timeline,[...selectedIds]));}
 function remove(){const next=removeDesignGroup(timeline,[...selectedIds],definitions);if(next){save(next);selected=null;groupIds=[];cancel();}}
 function beginPaste(clip:DesignClipItem[]){
   if(!clip.length||!grid||busyImport)return;
   if(clip.some(p=>{const g=definitions.get(p.itemId);return g&&!layerSelectable(layerState,g);})){error=locale==='ja'?'非表示またはロック中のレイヤーです。':'The layer is hidden or locked.';return;}
   cancel();selected=null;groupIds=[];
   if(clip.every(p=>definitions.has(p.itemId))){pasting=clip;hover=lastPoint;return;}
   if(!worker)return;
   pastePending=clip;pasteRequest=nextRequest();
   worker.postMessage({command:'design-shapes',requestId:pasteRequest,key:grid.key,itemIds:[...new Set(clip.map(p=>p.itemId))]});
 }
 function commitPaste(x:number,y:number){
   if(placeWithSymmetry(x,y,pasting.map(p=>({itemId:p.itemId,x:x+p.dx,y:y+p.dy,orientation:p.orientation}))))return;
   const next=pasteDesign(timeline,pasting,definitions,x,y,width,height);
   if(!next){save(null);return;}
   const ids=currentDesign(next).slice(-pasting.length).map(o=>o.id);save(next);cancel();
   selected=ids.length===1?ids[0]:null;groupIds=ids.length>1?ids:[];
 }
 $: pasteValid=Boolean(hover&&pasting.length&&canPasteDesign(timeline,pasting,definitions,hover.x,hover.y,width,height));
 $: symmetricSelection=symmetry&&selectedIds.size&&!placing&&!pasting.length&&!moveMode?placements.filter(p=>selectedIds.has(p.id)):[];
 $: symmetricSelectedPreview=symmetry&&symmetricSelection.length?symmetricDesignItems(symmetricSelection,definitions,symmetry,false,placements):null;
 $: symmetricSelectedPlan=symmetry&&symmetricSelection.length?symmetryPlan(timeline,symmetricSelection,definitions,symmetry,false,width,height):null;
 $: symmetricOriginal=hover&&placing?[{itemId:placing.itemId,x:hover.x,y:hover.y,orientation}]:hover&&pasting.length?pasting.map(p=>({itemId:p.itemId,x:hover!.x+p.dx,y:hover!.y+p.dy,orientation:p.orientation})):[];
 $: symmetricPreview=symmetry&&symmetricOriginal.length?symmetricDesignItems(symmetricOriginal,definitions,symmetry,true,placements):null;
 $: symmetricPlacementPlan=symmetry&&symmetricOriginal.length?symmetryPlan(timeline,symmetricOriginal,definitions,symmetry,true,width,height):null;
 $: symmetryPreviewItems=symmetricOriginal.length?symmetricPreview:symmetricSelectedPreview;
 $: symmetryPreviewValid=symmetricOriginal.length?Boolean(symmetricPlacementPlan):Boolean(symmetricSelectedPlan);
 function changeSymmetry(next:DesignSymmetry|null){symmetry=next;symmetryPicking=false;alignmentAction=null;direct=null;moveMode=false;}
 function mirrorSelected(){if(!symmetricSelectedPlan||busyImport)return;save(commitSymmetry(timeline,symmetricSelectedPlan,definitions,width,height));}
 function placeWithSymmetry(x:number,y:number,items:readonly SymmetryItem[]){
  if(!symmetry)return false;
  const plan=symmetryPlan(timeline,items,definitions,symmetry,true,width,height);
  if(!plan){save(null);return true;}
  const next=commitSymmetry(timeline,plan,definitions,width,height);
  if(!next){save(null);return true;}
  save(next);
  if(pasting.length){const ids=currentDesign(next).slice(-plan.length).map(p=>p.id);cancel();selected=ids.length===1?ids[0]:null;groupIds=ids.length>1?ids:[];}
  return true;
 }
 function setSymmetryFromPointer(e:MouseEvent){
  if(!symmetry||!svg)return;
  const m=svg.getScreenCTM();if(!m)return;
  const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse());
  if(p.x<0||p.y<0||p.x>width||p.y>height)return;
  symmetry={...symmetry,x2:Math.round(p.x*2),y2:Math.round(p.y*2)};symmetryPicking=false;
 }
 function placeAt(x:number,y:number){
  if(!placing)return;
  if(!placeWithSymmetry(x,y,[{itemId:placing.itemId,x,y,orientation}]))save(placeDesign(timeline,placing,x,y,orientation,width,height));
 }

 function cell(e:MouseEvent){
   const m=svg?.getScreenCTM();if(!m)return null;
   const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse()),x=Math.floor(p.x),y=Math.floor(p.y);
   return x>=0&&y>=0&&x<width&&y<height?{x,y}:null;
 }
 function pick(e:MouseEvent){
   if(alignmentAction){alignmentAction=null;return;}
   if(suppressDirectClick){suppressDirectClick=false;return;}
   if(busyImport||gesture.consumeClick()||e.detail===0)return;
   if(symmetryPicking){setSymmetryFromPointer(e);return;}
   const p=cell(e);if(!p)return;lastPoint=p;
   if(pasting.length){commitPaste(p.x,p.y);return;}
   if(placing){placeAt(p.x,p.y);return;}
   if(moveMode&&chosen&&chosenGeometry){
     const next=transformDesign(timeline,chosen.id,chosenGeometry,p.x,p.y,chosen.orientation,width,height);
     if(next){save(next);moveMode=false;hover=null;}else if(p.x!==chosen.x||p.y!==chosen.y)save(null);return;
   }
   const hits=map?savedShapesAt(map,1,p.x,p.y):[];
   const ordered=mapPainterOrder(hits).reverse();
   const id=ordered.find(o=>layerSelectable(layerState,o)&&matchesSelectionLayer(o,layer))?.localOrdinal??null;
   if((e.ctrlKey||e.metaKey||e.shiftKey)&&id!==null){
     const ids=new Set(selectedIds);if(ids.has(id))ids.delete(id);else ids.add(id);
     groupIds=[...ids];selected=null;
   }else{groupIds=[];selected=id;}
 }
 function hitAt(p:Cell){
   return map?mapPainterOrder(savedShapesAt(map,1,p.x,p.y)).reverse().find(o=>layerSelectable(layerState,o)&&matchesSelectionLayer(o,layer)):undefined;
 }
 function startDirect(e:PointerEvent){
   suppressDirectClick=false;
   if(busyImport)return;
   if(e.button===1||spacePan||e.pointerType==='touch'){gesture.begin(e,camera.zoom>1);return;}
   if(e.button!==0||placing||moveMode||pasting.length||pasteRequest||alignmentAction||symmetryPicking)return;
   const p=cell(e);if(!p)return;
   const hit=hitAt(p),add=e.ctrlKey||e.metaKey||e.shiftKey;
   direct={id:e.pointerId,start:p,end:p,clientX:e.clientX,clientY:e.clientY,ids:hit?(selectedIds.has(hit.localOrdinal)?[...selectedIds]:[hit.localOrdinal]):[],kind:hit?'move':'marquee',add,moved:false};
   if(add&&hit)direct=null; // modifier-click keeps its toggle behavior
 }
 function follow(e:PointerEvent){
   const p=gesture.move(e,svg,extent,camera);if(p){camera=p;return;}
   lastPoint=cell(e);
   if(direct?.id===e.pointerId){
     if(!direct.moved&&Math.hypot(e.clientX-direct.clientX,e.clientY-direct.clientY)<5)return;
     if(!direct.moved){try{(e.currentTarget as Element).setPointerCapture(e.pointerId);}catch{/* pointer ended */}}
     if(lastPoint){direct={...direct,end:lastPoint,moved:true};e.preventDefault();}
     return;
   }
   if(placing||moveMode||pasting.length)hover=lastPoint;
 }
 function endDirect(e:PointerEvent,commit:boolean){
   gesture.end(e);if(direct?.id!==e.pointerId)return;
   const drag=direct;direct=null;
   if(!drag.moved)return;suppressDirectClick=true;
   if(!commit||!cell(e))return;
   if(drag.kind==='marquee'){
     const ids=map?savedShapesInRect(map,1,drag.start,drag.end).filter(o=>layerSelectable(layerState,o)&&matchesSelectionLayer(o,layer)&&!nativeActionBlocked(o.editRestrictions,'select')).map(o=>o.localOrdinal):[];
     groupIds=[...new Set([...(drag.add?[...selectedIds]:[]),...ids])];selected=null;return;
   }
   const dx=drag.end.x-drag.start.x,dy=drag.end.y-drag.start.y;
   if(dx||dy){const next=transformDesignGroup(timeline,drag.ids,definitions,dx,dy,0,width,height);if(next){save(next);groupIds=drag.ids.length>1?drag.ids:[];selected=drag.ids.length===1?drag.ids[0]:null;}else save(null);}
 }
 function endSpace(e:KeyboardEvent){if(e.code==='Space')spacePan=false;}

 function keys(e:KeyboardEvent){
   if(!active||busyImport||!worldShortcutTarget(e,root))return;
   if(e.code==='Space'&&e.target instanceof HTMLElement&&e.target.closest('.design-plot')){e.preventDefault();spacePan=true;return;}
   const action=worldShortcut(e);if(!action)return;
   if(action==='undo'||action==='redo'){e.preventDefault();travel(action==='undo'?-1:1);return;}
   if(action==='copy'||action==='cut'){
     if(!selectedIds.size)return;const clip=designClipboard(timeline,[...selectedIds]);if(!clip.length)return;
     e.preventDefault();if(action==='cut'){const next=removeDesignGroup(timeline,[...selectedIds],definitions);if(!next)return;save(next);selected=null;groupIds=[];cancel();}clipboard=clip;return;
   }
   if(action==='paste'){if(clipboard.length){e.preventDefault();beginPaste(clipboard);}return;}
   if(action==='duplicate'){if(selectedIds.size){e.preventDefault();duplicate();}return;}
   if(action==='select-all'){e.preventDefault();cancel();selected=null;groupIds=objects.filter(o=>layerSelectable(layerState,o)&&matchesSelectionLayer(o,layer)&&!nativeActionBlocked(o.editRestrictions,'select')).map(o=>o.localOrdinal);return;}
   if(action==='cancel'){e.preventDefault();if(symmetryPicking){symmetryPicking=false;return;}if(alignmentAction){alignmentAction=null;return;}cancel();selected=null;groupIds=[];return;}
   if(action==='confirm'){if(e.target instanceof HTMLElement&&e.target.closest('button:not(.design-plot)'))return;if(alignmentAction&&alignmentPlan){e.preventDefault();commitAlignment();return;}if(symmetry&&symmetricSelectedPlan){e.preventDefault();mirrorSelected();return;}if(pasting.length&&hover){e.preventDefault();commitPaste(hover.x,hover.y);}else if(placing&&hover){e.preventDefault();placeAt(hover.x,hover.y);}return;}
   if(action==='zoom-in'||action==='zoom-out'||action==='fit'){e.preventDefault();camera=action==='fit'?defaultMapCamera():zoomMapCamera(camera,camera.zoom*(action==='zoom-in'?2:.5),maxZoom);return;}
   if(action==='rotate-left'||action==='rotate-right'){if(selectedIds.size||placing){e.preventDefault();rotate(action==='rotate-left'?1:3);}return;}
   if(action==='delete'){if(selectedIds.size){e.preventDefault();remove();}return;}
   const n=NUDGE[action];if(n&&selectedIds.size&&!placing&&!pasting.length){e.preventDefault();alignmentAction=null;save(transformDesignGroup(timeline,[...selectedIds],definitions,n[0],n[1],0,width,height));}
 }
 function more(e:Event){const el=e.currentTarget as HTMLElement;if(el.scrollTop+el.clientHeight>=el.scrollHeight-160)limit=Math.min(filtered.length,limit+80);}
</script>
<svelte:window on:keydown={keys} on:keyup={endSpace} on:blur={()=>{spacePan=false;direct=null;}}/>
{#if active&&grid&&raster}
 <div class="design-workspace" bind:this={root}>
  <aside aria-label="配置する家具" hidden={!paletteOpen}>
   <input type="search" aria-label="家具を検索" placeholder="家具を検索" bind:value={query} on:input={()=>limit=80}/>
   <select aria-label="配置カテゴリ" bind:value={layer} on:change={()=>{limit=80;selected=null;groupIds=[];}}>
    {#each ['all','furniture','surface','landscape','ground','fence'] as l}<option value={l}>{MAP_LAYER_LABELS[l as MapSelectionLayer]}</option>{/each}
   </select>
   {#if catalogLoading}<p role="status">家具を読み込み中…</p>{:else if catalogError}<p role="alert">{catalogError}</p><button type="button" on:click={()=>worker&&grid&&requestCatalog(grid,locale,worker)}>再読み込み</button>{/if}
   <div class="design-catalog" on:scroll={more}>
    {#each visibleCatalog as item (item.itemId)}
     <button type="button" class="design-item" aria-pressed={placing?.itemId===item.itemId} on:click={()=>chooseItem(item.itemId)} title={item.name}>
      {#if images.has(item.itemId)}<img src={images.get(item.itemId)} alt="" loading="lazy"/>{/if}
      <span>{item.name}</span>
     </button>
    {/each}
    {#if !catalogLoading&&!filtered.length}<p>該当する家具なし</p>{/if}
   </div>
  </aside>
  <div class="design-map-side">
   <div class="design-controls">
    <button type="button" aria-label={locale==='ja'?'レイヤー':'Layers'} title={locale==='ja'?'レイヤー':'Layers'} aria-pressed={layersOpen} on:click={()=>{layersOpen=!layersOpen;if(layersOpen){symmetryOpen=false;alignmentOpen=false;alignmentAction=null;}}}><svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/></svg></button>
    <button type="button" aria-label="家具パレット" title="家具パレット" aria-pressed={paletteOpen} on:click={()=>paletteOpen=!paletteOpen}><svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h18v16H3zM9 4v16"/></svg></button>
    <input class="file-input" type="file" accept=".json,application/json" bind:this={importInput} on:change={importFile}/>
    <button type="button" disabled={busyImport} on:click={exportFile}>{words[0]}</button>
    <button type="button" disabled={busyImport||!worker} on:click={()=>importInput.click()}>{words[1]}</button>
    <button type="button" aria-pressed={showCounts} on:click={()=>showCounts=!showCounts}>{words[2]}</button>
    <button type="button" aria-label="設計を取り消す" disabled={busyImport||timeline.cursor===0} on:click={()=>travel(-1)}>↶</button>
    <button type="button" aria-label="設計をやり直す" disabled={busyImport||timeline.cursor===timeline.snapshots.length-1} on:click={()=>travel(1)}>↷</button>
    <button type="button" aria-label="設計の左回転" disabled={busyImport||!placing&&!selectedIds.size} on:click={()=>rotate(1)}>⟲</button>
    <button type="button" aria-label="設計の右回転" disabled={busyImport||!placing&&!selectedIds.size} on:click={()=>rotate(3)}>⟳</button>
    <button type="button" aria-pressed={moveMode} disabled={busyImport||!chosenGeometry||nativeActionBlocked(chosenGeometry.editRestrictions,'move')} on:click={()=>{placing=null;moveMode=!moveMode;hover=null;}}>移動</button>
    <button type="button" disabled={busyImport||selectedIds.size<2} aria-label={locale==='ja'?'整列・均等配置':'Align and distribute'} aria-pressed={alignmentOpen} on:click={()=>{alignmentOpen=!alignmentOpen;alignmentAction=null;if(alignmentOpen){layersOpen=false;symmetryOpen=false;}}}><svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3v18M7 5h8v5H7zM7 14h13v5H7z"/></svg></button>
    <button type="button" disabled={busyImport} aria-label={locale==='ja'?'対称編集':'Symmetry'} aria-pressed={Boolean(symmetry)||symmetryOpen} on:click={()=>{symmetryOpen=!symmetryOpen;if(symmetryOpen){layersOpen=false;alignmentOpen=false;alignmentAction=null;}}}><svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v20M9 6 3 12l6 6ZM15 6l6 6-6 6Z"/></svg></button>
    <button type="button" disabled={busyImport||!selectedIds.size} on:click={duplicate}>複製</button>
    <button type="button" disabled={busyImport||!selectedIds.size} on:click={remove}>削除</button>
    {#if (placing||moveMode||pasting.length)&&!busyImport}<button type="button" on:click={cancel}>配置終了</button>{/if}
   </div>
   <div class="design-messages">{#if busyImport}<p role="status">{words[5]}</p>{/if}
   {#if loadingShape}<p role="status">形状を読み込み中…</p>{/if}
   {#if error}<p role="alert">{error}</p>{/if}</div>
   {#if symmetryOpen}<div class="design-symmetry-panel"><WorldSymmetryControls {locale} value={symmetry} {width} {height} picking={symmetryPicking} count={symmetricSelection.length} valid={Boolean(symmetricSelectedPlan)} busy={busyImport} onChange={changeSymmetry} onPick={()=>symmetryPicking=!symmetryPicking} onMirror={mirrorSelected}/></div>{/if}
   {#if layersOpen}<div class="design-layer-panel"><WorldLayerControls {locale} state={layerState} disabled={busyImport} onChange={applyLayers}/></div>{/if}
   {#if alignmentOpen&&selectedIds.size>=2}<div class="design-alignment-panel"><WorldAlignmentControls {locale} count={selectedIds.size} selected={alignmentAction} valid={Boolean(alignmentPlan)} busy={busyImport} onPick={pickAlignment} onCommit={commitAlignment} onCancel={()=>alignmentAction=null}/></div>{/if}
   <div class="design-map-frame"><button class="design-plot" type="button" aria-label="装飾設計マップ" bind:clientWidth={mapWidth} bind:clientHeight={mapHeight} on:click={pick}
    on:wheel|nonpassive={e=>camera=wheelMapCamera(e,svg,extent,camera,maxZoom)}
    on:pointerdown={startDirect}
    on:pointermove={follow} on:pointerup={e=>endDirect(e,true)} on:pointercancel={e=>endDirect(e,false)} on:pointerleave={()=>{gesture.leave();hover=null;if(direct&&!direct.moved)direct=null;}}>
    <svg bind:this={svg} {viewBox} aria-hidden="true">
     <defs><pattern id="design-grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" stroke="#9da9b4" stroke-opacity=".38" stroke-width=".05" fill="none"/></pattern></defs>
     <rect width={width} height={height} fill="#27313a"/>
     {#if terrainUrl}<image href={terrainUrl} width={width} height={height} preserveAspectRatio="none" style="image-rendering:pixelated"/>{/if}
     {#if width/camera.zoom<160&&height/camera.zoom<160}<rect width={width} height={height} fill="url(#design-grid)"/>{/if}
     {#each visible as o (o.localOrdinal)}
      {@const shape=o.shapeKey?map?.shapes[o.shapeKey]:null}
      {#if shape}
       <g class="design-object" data-design-id={o.localOrdinal} transform={'translate('+o.x+' '+o.y+')'}>
        <path class="design-object-shape" d={shape.path} fill={MAP_LAYER_COLORS[o.layer]} fill-opacity={selectedIds.has(o.localOrdinal)?.86:.65} stroke={selectedIds.has(o.localOrdinal)?'#fff':MAP_LAYER_COLORS[o.layer]} stroke-width="1" vector-effect="non-scaling-stroke"/>
        {#if showWorldArtwork(o,shape,cellPixels)&&images.has(Number(o.itemId))}<WorldObjectArtwork href={images.get(Number(o.itemId))!} width={shape.width} height={shape.height}/>{/if}
        {#if o.orientationCode!==null&&cellPixels>=5&&o.layer!=='ground'&&o.layer!=='fence'}<path class="design-orientation" d="M0 -.32L.19 .13L0 .04L-.19 .13Z" transform={'translate(.5 .5) rotate('+sourceOrientationAngle(o.orientationCode)+')'} fill="#fff" stroke="#28333c" stroke-width=".035" pointer-events="none"/>{/if}
       </g>
      {/if}
     {/each}
     {#if symmetry}
      {#if symmetry.mode==='vertical'}<path class="symmetry-axis" d={'M'+symmetry.x2/2+' 0V'+height} stroke="#f5cf70" stroke-dasharray="6 4" stroke-width="1.5" vector-effect="non-scaling-stroke" pointer-events="none"/>
      {:else if symmetry.mode==='horizontal'}<path class="symmetry-axis" d={'M0 '+symmetry.y2/2+'H'+width} stroke="#f5cf70" stroke-dasharray="6 4" stroke-width="1.5" vector-effect="non-scaling-stroke" pointer-events="none"/>
      {:else}<circle class="symmetry-center" cx={symmetry.x2/2} cy={symmetry.y2/2} r={6/Math.max(cellPixels,1)} stroke="#f5cf70" fill="none" stroke-width="2" vector-effect="non-scaling-stroke" pointer-events="none"/>{/if}
     {/if}
     {#if symmetryPreviewItems}
      {#each symmetryPreviewItems as p}{@const shape=definitions.get(p.itemId)?.shapes[p.itemId+':'+p.orientation*4]}
       {#if shape}<path class="symmetry-ghost" d={shape.path} transform={'translate('+p.x+' '+p.y+')'} fill={symmetryPreviewValid?'#4bddcd':'#ef5350'} fill-opacity=".6" stroke="#f5cf70" stroke-dasharray="4 2" vector-effect="non-scaling-stroke" pointer-events="none"/>{/if}
      {/each}
     {/if}
     {#if alignmentPreview}
      {#each alignmentPreview as o (o.ordinal)}{@const shape=o.shapeKey?map?.shapes[o.shapeKey]:null}
       {#if shape}<path class="alignment-ghost" d={shape.path} transform={'translate('+o.x+' '+o.y+')'} fill={alignmentPlan?'#4bddcd':'#ef5350'} fill-opacity=".45" stroke="#fff" stroke-dasharray="3 2" vector-effect="non-scaling-stroke" pointer-events="none"/>{/if}
      {/each}
     {/if}
     {#if direct?.moved&&direct.kind==='marquee'}
      <rect class="design-marquee" x={Math.min(direct.start.x,direct.end.x)} y={Math.min(direct.start.y,direct.end.y)} width={Math.abs(direct.end.x-direct.start.x)+1} height={Math.abs(direct.end.y-direct.start.y)+1} fill="#4bddcd" fill-opacity=".16" stroke="#4bddcd" vector-effect="non-scaling-stroke"/>
     {:else if direct?.moved&&direct.kind==='move'}
      {#each objects.filter(o=>direct?.ids.includes(o.localOrdinal)) as o (o.localOrdinal)}
       {@const shape=o.shapeKey?map?.shapes[o.shapeKey]:null}
       {#if shape}<path class="design-drag-ghost" d={shape.path} transform={'translate('+(o.x+direct.end.x-direct.start.x)+' '+(o.y+direct.end.y-direct.start.y)+')'} fill={dragPlan?'#b9c7d6':'#ef5350'} fill-opacity=".65" stroke="#fff" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>{/if}
      {/each}
     {/if}
     {#if hover&&pasting.length}{#each pasting as p,i}{@const shape=definitions.get(p.itemId)?.shapes[p.itemId+':'+p.orientation*4]}{#if shape}<path class="design-paste-ghost" d={shape.path} transform={'translate('+(hover.x+p.dx)+' '+(hover.y+p.dy)+')'} fill={(symmetry?Boolean(symmetricPlacementPlan):pasteValid)?'#b9c7d6':'#ef5350'} fill-opacity=".65" stroke="#fff" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>{/if}{/each}{/if}
     {#if hover&&ghostShape}<path class="design-ghost" d={ghostShape.path} transform={'translate('+hover.x+' '+hover.y+')'} fill={(symmetry&&placing?Boolean(symmetricPlacementPlan):ghostValid)?'#b9c7d6':'#ef5350'} fill-opacity=".65" stroke="#fff" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>
      {#if ghostGeometry&&showWorldArtwork({layer:ghostGeometry.layer,shapeKey:null},ghostShape,cellPixels)&&images.has(ghostGeometry.itemId)}<WorldObjectArtwork href={images.get(ghostGeometry.itemId)!} x={hover.x} y={hover.y} width={ghostShape.width} height={ghostShape.height} opacity={.55}/>{/if}
      {#if cellPixels>=5}<path d="M0 -.32L.19 .13L0 .04L-.19 .13Z" transform={'translate('+(hover.x+.5)+' '+(hover.y+.5)+') rotate('+sourceOrientationAngle(ghostOrientation*4)+')'} fill="#fff" pointer-events="none"/>{/if}
     {/if}
     {#each warnings as run}<rect x={run.x} y={run.y} width={run.width} height="1" fill="#ef5350" fill-opacity=".6"/>{/each}
    </svg>
   </button><MapCameraControls zoom={camera.zoom} {maxZoom} onZoom={value=>camera=zoomMapCamera(camera,value,maxZoom)} onFit={()=>camera=defaultMapCamera()} onPan={(dx,dy)=>camera=panMapCamera(camera,dx/camera.zoom,dy/camera.zoom)}/></div>
   <div class="design-status">

    {#if pasting.length}<strong>{pasting.length} · 貼り付け先を選択</strong>{:else if groupIds.length}<strong>{groupIds.length}件選択</strong>{:else if placing}<strong>{catalog.find(o=>o.itemId===placing?.itemId)?.name??placing.name} · 配置先を選択</strong>
    {:else if chosen}<strong>{catalog.find(o=>o.itemId===chosen?.itemId)?.name??chosenGeometry?.name}</strong>{/if}
    {#if warnings.length}<span>地形属性不一致候補</span>{/if}
    <small>ゲーム内の配置可否は未確認</small>
   </div>
   {#if showCounts}
    <div class="design-counts" aria-label={words[2]}>
     {#each [...counts.entries()].sort((a,b)=>(names.get(a[0])??'').localeCompare(names.get(b[0])??'',locale)) as [itemId,count] (itemId)}
      <div class="count-row">{#if images.has(itemId)}<img src={images.get(itemId)} alt="" loading="lazy"/>{/if}<span>{names.get(itemId)??definitions.get(itemId)?.name??'—'}</span><strong>×{count}</strong></div>
     {/each}
    </div>
   {/if}

  </div>
 </div>
{/if}
<style>
 .file-input{display:none}
 .design-counts{max-height:24vh;overflow:auto;display:grid;gap:3px}
 .count-row{display:flex;align-items:center;gap:6px;background:var(--wand-card);padding:4px 8px;border-radius:4px}
 .count-row img{width:32px;height:32px;object-fit:contain}.count-row span{flex:1;overflow-wrap:anywhere}
 .design-workspace{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:clamp(170px,19vw,300px) minmax(0,1fr);gap:4px;min-width:0;overflow:hidden}aside[hidden]{display:none}
 aside,.design-map-side{display:flex;flex-direction:column;gap:4px;min-width:0;min-height:0;overflow:hidden}aside{padding:4px;background:var(--wand-card);border:1px solid var(--wand-line);border-radius:5px}
 input,select,button{font:inherit;background:var(--wand-menu);color:var(--wand-text);border:1px solid var(--wand-line);border-radius:5px;padding:5px}
 button[aria-pressed=true]{border-color:var(--wand-accent);background:var(--wand-header-hover)}
 button:disabled{opacity:.45}
 .design-catalog{display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:4px;overflow:auto;flex:1 1 auto;min-height:0;align-content:start}
 .design-item{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:44px;font-size:12px;overflow-wrap:anywhere}
 .design-item img{width:56px;height:56px;object-fit:contain}
 .design-controls,.design-status{display:flex;align-items:center;flex-wrap:wrap;gap:5px}
 .design-map-frame{flex:1 1 auto;min-height:0;min-width:0;position:relative;overflow:hidden;border-radius:5px}.design-plot{padding:0;overflow:hidden;display:block;cursor:crosshair;touch-action:none;width:100%;height:100%;background:#27313a}.tool-icon{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;vertical-align:middle}
 .design-plot svg{display:block;width:100%;height:100%}.design-marquee,.design-drag-ghost{pointer-events:none}
 small,.design-status{font-size:12px;color:var(--wand-muted)}
 @media(max-width:700px){.design-workspace{grid-template-columns:1fr;grid-template-rows:minmax(0,1fr) minmax(0,2fr)}.design-item img{width:44px;height:44px}}
 .design-workspace,.design-map-side,.design-map-frame{position:absolute;inset:0;display:block;min-height:0;min-width:0;overflow:hidden;border-radius:0}.design-workspace{isolation:isolate}
 aside{position:absolute;z-index:5;top:104px;bottom:38px;left:6px;width:clamp(170px,19vw,300px);border-radius:6px;box-shadow:0 2px 8px #0003}aside[hidden]{display:none}
 .design-symmetry-panel{position:absolute;z-index:9;right:6px;top:104px;width:min(250px,calc(100% - 12px));max-height:calc(100% - 145px);overflow:auto;background:var(--wand-card);border:1px solid var(--wand-line);border-radius:6px;box-shadow:0 3px 14px #0004}
 .design-layer-panel{position:absolute;z-index:9;right:6px;top:104px;width:min(220px,calc(100% - 12px));max-height:calc(100% - 145px);overflow:auto;background:var(--wand-card);border:1px solid var(--wand-line);border-radius:6px;box-shadow:0 3px 14px #0004}
 .design-alignment-panel{position:absolute;z-index:8;right:6px;top:104px;width:min(300px,calc(100% - 12px));background:var(--wand-card);border:1px solid var(--wand-line);border-radius:6px;padding:6px;box-shadow:0 3px 14px #0004}
 .design-plot{border:0;border-radius:0}
 .design-controls,.design-status{position:absolute;z-index:6;background:var(--wand-card);border:1px solid var(--wand-line);border-radius:6px;padding:4px;max-width:calc(100% - 12px)}
 .design-controls{top:52px;left:6px;overflow-x:auto;flex-wrap:nowrap;white-space:nowrap}.design-controls button{flex:none;min-height:34px}
 .design-status{bottom:6px;left:6px;max-width:calc(100% - 65px)}.design-status small{white-space:nowrap}
 .design-messages{position:absolute;z-index:7;top:104px;right:6px;max-width:calc(100% - 12px);background:var(--wand-card);border-radius:5px}.design-messages:empty{display:none}.design-messages p{margin:0;padding:6px;font-size:12px}
 .design-counts{position:absolute;z-index:5;top:104px;right:6px;width:min(300px,70%);max-height:55%;padding:4px;border:1px solid var(--wand-line);border-radius:6px;background:var(--wand-card);box-shadow:0 2px 8px #0003}
 @media(max-width:700px){aside{top:auto;bottom:38px;left:6px;width:calc(100% - 65px);height:min(31%,220px)}.design-controls button{min-height:36px}}
</style>
