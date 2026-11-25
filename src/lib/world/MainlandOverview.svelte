<script lang="ts">
 import {onDestroy} from 'svelte';
 import {base} from '$app/paths';
 import {projectMainlandSaved,mainlandSavedAt,visibleMainlandSaved,mainlandSavedMoveEligible,mainlandSavedRotateEligible,mainlandSavedDraft,type MainlandSavedObject} from './mainland-saved-objects.ts';
 import {currentWorldEdits,emptyWorldTimeline,travelWorldTimeline,type WorldEditTimeline} from './saved-map-batch.ts';
 import type {SavedShapeMap} from './saved-shape-map.ts';
 import type {TerrainScopeReceipt} from './terrain-binding.ts';
 import {CARDINAL_ORIENTATIONS,isCardinal} from './saved-map-transform.ts';
 import {MAP_LAYER_COLORS} from './source-map-layers.ts';
 import {defaultWorldLayers,layerVisible,layerSelectable,type WorldLayerState} from './world-layer-state.ts';
 import WorldLayerControls from './WorldLayerControls.svelte';
 import WorldObjectArtwork from './WorldObjectArtwork.svelte';
 import {worldArtwork,mapCellPixels,showWorldArtwork} from './world-artwork.ts';
 import {openPublicItemMaster,type PublicCompleteItemMaster} from '../items/public-item-master.ts';
 import {bindMainland,mainlandExtent,mainlandTerrainHits,type MainlandGrid} from './mainland-world-coordinates.ts';
 import {nativeSourceFloorTint} from './native-terrain-canvas.ts';
 import {defaultMapCamera,maxMapZoom,mapCameraViewBox,mapViewportBounds,zoomMapCamera,panMapCamera,wheelMapCamera,createMapPanGesture} from './map-camera.ts';
 import MapCameraControls from './MapCameraControls.svelte';
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
 const editWords={ja:['移動','左回転','右回転','取消','元に戻す','やり直す','同じエリア内に移動してください'],en:['Move','Rotate left','Rotate right','Cancel','Undo','Redo','Move within the same area'],fr:['Déplacer','Rotation gauche','Rotation droite','Annuler','Annuler','Rétablir','Déplacez dans la même zone'],it:['Sposta','Ruota a sinistra','Ruota a destra','Annulla','Annulla','Ripeti','Sposta nella stessa zona'],de:['Verschieben','Links drehen','Rechts drehen','Abbrechen','Rückgängig','Wiederholen','Im selben Bereich verschieben'],'es-ES':['Mover','Girar a la izquierda','Girar a la derecha','Cancelar','Deshacer','Rehacer','Mueve dentro de la misma zona'],'zh-CN':['移动','向左旋转','向右旋转','取消','撤销','重做','请在同一区域内移动'],'pt-BR':['Mover','Girar à esquerda','Girar à direita','Cancelar','Desfazer','Refazer','Mova na mesma área']} as const;
 $: ew=editWords[locale]??editWords.en;
 $: draft=moving&&hover&&chosen&&bound&&!pending.size&&!failed?mainlandSavedDraft(chosen,bound,rasters,saveMaps,timeline,hover.x,hover.y,chosen.object.orientation):null;
 function stopMove(){moving=false;hover=null;}
 function rotate(delta:number){if(!chosen||!bound||!isCardinal(chosen.object.orientation)||!layerSelectable(layerState,chosen.object)||!mainlandSavedRotateEligible(chosen)||pending.size||failed)return;const orientation=CARDINAL_ORIENTATIONS[(CARDINAL_ORIENTATIONS.indexOf(chosen.object.orientation)+delta+4)%4];const q=mainlandSavedDraft(chosen,bound,rasters,saveMaps,timeline,chosen.x+.25/chosen.factor,chosen.y-.25/chosen.factor,orientation);if(q?.next){timeline=q.next;stopMove();}}
 function travel(delta:-1|1){stopMove();timeline=travelWorldTimeline(timeline,delta);}
 function follow(e:PointerEvent){const next=gesture.move(e,svg,extent,camera);if(next){camera=next;return;}if(moving){const m=svg.getScreenCTM();if(m){const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse());hover={x:p.x,y:p.y};}}}
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
 function focus(p:MainlandSavedObject){stopMove();selected=p.object.localOrdinal;const zoom=Math.max(1,Math.min(maxZoom,extent.w/Math.max(12,(p.shape?.width??1)/p.factor*4),extent.h/Math.max(12,(p.shape?.height??1)/p.factor*4)));const clamp=(v:number)=>Math.max(.5/zoom,Math.min(1-.5/zoom,v));camera={zoom,x:clamp((p.x+(p.shape?.width??1)/p.factor/2-extent.x)/extent.w),y:clamp((p.y-(p.shape?.height??1)/p.factor/2-extent.y)/extent.h)};searchOpen=false;}

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
  if(gesture.consumeClick()||e.detail===0||!bound||pending.size||failed)return;
  const m=svg.getScreenCTM();if(!m)return;
  const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse());
  if(saveMode&&moving&&chosen&&layerSelectable(layerState,chosen.object)){const q=mainlandSavedDraft(chosen,bound,rasters,saveMaps,timeline,p.x,p.y,chosen.object.orientation);if(q?.next){timeline=q.next;stopMove();}else hover={x:p.x,y:p.y};return;}
  if(saveMode){const hit=mainlandSavedAt(allObjects,p.x,p.y).find(o=>layerSelectable(layerState,o.object));if(hit){selected=hit.object.localOrdinal;overlaps=[];return;}selected=null;}
  const hits=mainlandTerrainHits(bound,rasters,p.x,p.y);
  overlaps=hits.length>1?hits:[];if(hits.length===1)onChoose(hits[0].key);
 }
 onDestroy(()=>{nameEpoch++;subscribed?.removeEventListener('message',receive);});
</script>
<section class="mainland-overview" aria-label={title||words[0]}>
 <div class="overview-tools"><strong>{title||words[0]}</strong>{#if saveMode}<button type="button" aria-label={sw[0]} aria-pressed={searchOpen} on:click={()=>searchOpen=!searchOpen}><svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></svg></button><button type="button" aria-label={sw[1]} aria-pressed={layersOpen} on:click={()=>layersOpen=!layersOpen}><svg viewBox="0 0 24 24"><path d="m12 3 9 5-9 5-9-5 9-5M3 12l9 5 9-5M3 16l9 5 9-5"/></svg></button>{/if}<button type="button" aria-label={words[1]} title={words[1]} on:click={onClose}><svg viewBox="0 0 24 24"><path d="m6 6 12 12M6 18 18 6"/></svg></button></div>
 {#if !bound||failed}<p role="alert">{words[3]}</p>{:else if pending.size||images.size<bound.length}<p role="status">{words[2]} {images.size}/{bound.length}</p>{/if}
 <button class="mainland-map" type="button" bind:clientWidth={mapWidth} bind:clientHeight={mapHeight} aria-label={words[5]} on:click={click} on:wheel|nonpassive={e=>camera=wheelMapCamera(e,svg,extent,camera,maxZoom)}
 on:pointerdown={e=>gesture.begin(e,camera.zoom>1&&(!moving||e.button===1||e.shiftKey||e.pointerType==='touch'))} on:pointermove={follow}
 on:pointerup={e=>gesture.end(e)} on:pointercancel={e=>gesture.end(e)} on:pointerleave={()=>{gesture.leave();hover=null;}}>
  <svg bind:this={svg} {viewBox} aria-hidden="true">
   <rect x={extent.x} y={extent.y} width={extent.w} height={extent.h} fill="#27313a"/>
   {#each [...(bound??[])].sort((a,b)=>a.origin.position[1]-b.origin.position[1]) as g (g.key)}
    {#if images.has(g.key)&&g.bounds.x+g.bounds.w>=viewport.x&&g.bounds.x<=viewport.x+viewport.w&&g.bounds.y+g.bounds.h>=viewport.y&&g.bounds.y<=viewport.y+viewport.h}
     <image class="mainland-terrain" data-area={g.key} href={images.get(g.key)} width={g.sizeX} height={g.sizeY} transform={'translate('+g.bounds.x+' '+(-2*g.origin.position[2])+') scale(1 -1)'} preserveAspectRatio="none" style="image-rendering:pixelated"/>
    {/if}
   {/each}
   {#each visibleObjects as p (p.object.localOrdinal)}
    <g class="mainland-save-object" transform={'translate('+p.x+' '+p.y+') scale('+1/p.factor+' '+(-1/p.factor)+')'} data-area={p.area}>
     {#if p.shape}<path d={p.shape.path} fill={MAP_LAYER_COLORS[p.object.layer]} fill-opacity={selected===p.object.localOrdinal?.9:.65} stroke={selected===p.object.localOrdinal?'#fff':MAP_LAYER_COLORS[p.object.layer]} vector-effect="non-scaling-stroke" stroke-width="1"/>
      {#if showWorldArtwork(p.object,p.shape,cellPixels/p.factor)&&artwork.has(Number(p.object.itemId))}<WorldObjectArtwork href={artwork.get(Number(p.object.itemId))!} width={p.shape.width} height={p.shape.height} flipY/>{/if}
     {:else}<rect width="1" height="1" fill="none" stroke="#e4d2a5" vector-effect="non-scaling-stroke"/>{/if}
     {#if p.object.subgrid}<circle cx={(p.shape?.width??1)/2} cy={(p.shape?.height??1)/2} r={Math.min(1.5,4*p.factor/Math.max(1,cellPixels))} fill="#d6a6ef" stroke="#fff" vector-effect="non-scaling-stroke"/>{/if}
    </g>
   {/each}
   {#if draft&&chosen}<path class="mainland-save-ghost" d={draft.shape.path} transform={'translate('+draft.x+' '+draft.y+') scale('+1/chosen.factor+' '+(-1/chosen.factor)+')'} fill={draft.valid?'#4bddcd':'#ef5350'} fill-opacity=".65" stroke="#fff" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>{/if}
  </svg>
 </button>
 <MapCameraControls zoom={camera.zoom} {maxZoom} onZoom={value=>camera=zoomMapCamera(camera,value,maxZoom)} onFit={()=>camera=defaultMapCamera()} onPan={(dx,dy)=>camera=panMapCamera(camera,dx/camera.zoom,dy/camera.zoom)}/>
 {#if saveMode&&saveLoading}<p role="status" class="save-status">{sw[3]}</p>{:else if saveMode&&(saveFailed||projection.omitted)}<p class="save-status" role="status">{saveFailed?sw[4]:sw[5]} {projection.omitted||''}</p>{/if}
 {#if saveMode&&searchOpen}<aside class="overview-search"><input type="search" aria-label={sw[0]} placeholder={sw[0]} bind:value={query} on:input={()=>limit=60}/><div class="overview-results" on:scroll={e=>{const el=e.currentTarget;if(el.scrollTop+el.clientHeight>=el.scrollHeight-120)limit=Math.min(matches.length,limit+60);}}>{#each matches.slice(0,limit) as p (p.object.localOrdinal)}<button type="button" on:click={()=>focus(p)}>{#if artwork.has(Number(p.object.itemId))}<img src={artwork.get(Number(p.object.itemId))} alt="" loading="lazy"/>{/if}<span>{name(p,names)}</span></button>{/each}{#if !matches.length}<small>{sw[6]}</small>{/if}</div></aside>{/if}
 {#if saveMode&&layersOpen}<div class="overview-layers"><WorldLayerControls {locale} state={layerState} disabled={false} onChange={s=>{layerState=s;selected=null;stopMove();}}/></div>{/if}
 {#if saveMode&&chosen}<div class="overview-selection"><strong>{name(chosen,names)}</strong><button type="button" aria-pressed={moving} disabled={!layerSelectable(layerState,chosen.object)||!mainlandSavedMoveEligible(chosen)||saveLoading||failed} on:click={()=>{moving=!moving;hover=null;}}>{moving?ew[3]:ew[0]}</button><button type="button" aria-label={ew[1]} title={ew[1]} disabled={!layerSelectable(layerState,chosen.object)||!mainlandSavedRotateEligible(chosen)||saveLoading||failed} on:click={()=>rotate(-1)}>⟲</button><button type="button" aria-label={ew[2]} title={ew[2]} disabled={!layerSelectable(layerState,chosen.object)||!mainlandSavedRotateEligible(chosen)||saveLoading||failed} on:click={()=>rotate(1)}>⟳</button><button type="button" disabled={!layerSelectable(layerState,chosen.object)} on:click={()=>onChoose(chosen!.area,chosen!.object.localOrdinal)}>{sw[2]}</button>{#if moving}<small>{ew[6]}</small>{/if}</div>{/if}
 {#if saveMode}<div class="overview-history"><button type="button" aria-label={ew[4]} title={ew[4]} disabled={timeline.cursor===0} on:click={()=>travel(-1)}>↶</button><button type="button" aria-label={ew[5]} title={ew[5]} disabled={timeline.cursor===timeline.snapshots.length-1} on:click={()=>travel(1)}>↷</button></div>{/if}
 {#if overlaps.length}<div class="overlap-choices"><small>{words[4]}</small>{#each overlaps as g (g.key)}<button type="button" on:click={()=>onChoose(g.key)}>{label(g.key)}</button>{/each}</div>{/if}
</section>
<style>
 .mainland-overview{position:absolute;inset:0;z-index:20;background:var(--wand-bg);color:var(--wand-text);overflow:hidden;isolation:isolate}.mainland-map{position:absolute;inset:0;width:100%;height:100%;background:#27313a;border:0;padding:0;touch-action:none}.mainland-map svg{display:block;width:100%;height:100%}
 .overview-tools,.overlap-choices,.mainland-overview p{position:absolute;z-index:4;background:var(--wand-card);border:1px solid var(--wand-line);border-radius:6px;padding:5px 8px}.overview-tools{top:6px;left:6px;display:flex;gap:8px;align-items:center}.overview-tools button{display:grid;place-items:center;width:34px;height:34px}.overview-tools svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.7}.mainland-overview p{top:52px;left:6px;margin:0}.overlap-choices{left:8px;bottom:8px;display:grid;gap:4px;max-width:calc(100% - 70px)}button:not(.mainland-map){background:var(--wand-menu);color:inherit;border:1px solid var(--wand-line);border-radius:5px;cursor:pointer;padding:5px 8px}
 .overview-search,.overview-layers,.overview-selection{position:absolute;z-index:5;background:var(--wand-card);color:var(--wand-text);border:1px solid var(--wand-line);border-radius:6px;padding:6px}
 .overview-search{top:100px;bottom:45px;left:6px;width:min(270px,65%);display:flex;flex-direction:column;gap:5px}.overview-search input{font:inherit;background:var(--wand-menu);color:inherit;border:1px solid var(--wand-line);padding:6px;min-width:0}.overview-results{overflow:auto;display:grid;gap:3px;align-content:start}.overview-results button{display:flex;align-items:center;gap:7px;text-align:left;min-height:32px}.overview-results img{width:36px;height:36px;object-fit:contain}.overview-layers{top:52px;right:6px;max-height:75%;overflow:auto}.overview-selection{bottom:6px;left:6px;display:flex;align-items:center;gap:8px;max-width:calc(100% - 65px)} .mainland-overview p.save-status{top:52px;max-width:75%}.overview-selection{flex-wrap:wrap}.overview-history{position:absolute;z-index:5;right:60px;bottom:6px;display:flex;gap:4px}.overview-history button{min-width:34px;min-height:34px}
</style>
