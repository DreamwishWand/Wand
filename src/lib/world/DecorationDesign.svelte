<script lang="ts">
 import {onDestroy} from 'svelte';
 import type {PublicTerrainGridRef} from './public-terrain-projection.ts';
 import type {TerrainRaster,TerrainBinding} from './terrain-binding.ts';
 import {terrainWarnings} from './terrain-binding.ts';
 import {nativeSourceFloorTint} from './native-terrain-canvas.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 import {itemMedia} from '../media/item-media.ts';
 import {emptyDesign,currentDesign,travelDesign,placeDesign,transformDesign,removeDesign,designCandidateValid,designShapeMap,type DesignCatalogItem,type DesignItemGeometry,type DesignTimeline} from './design-layout.ts';
 import {defaultMapCamera,maxMapZoom,zoomMapCamera,panMapCamera,mapCameraViewBox,mapViewportBounds,wheelMapCamera,createMapPanGesture} from './map-camera.ts';
 import {mapPainterOrder,MAP_LAYER_COLORS,MAP_LAYER_LABELS,matchesSelectionLayer,type MapSelectionLayer} from './source-map-layers.ts';
 import {savedShapesAt,visibleSavedObjects} from './saved-shape-map.ts';
 import {nativeActionBlocked} from './native-edit-restrictions.ts';
 import {exclusiveAnchorClass} from './saved-map-transform.ts';
 export let active=false;
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
 const gesture=createMapPanGesture();
 let subscribed:Worker|null=null,lastGrid='';
 const normalize=(s:string)=>s.normalize('NFKC').toLocaleLowerCase().trim();
 $: terms=normalize(query).split(/\s+/).filter(Boolean);
 $: filtered=catalog.filter(o=>(layer==='all'||o.layer===layer)&&terms.every(t=>normalize(o.name).includes(t)));
 $: visibleCatalog=filtered.slice(0,limit);
 $: if(active)loadImages(visibleCatalog);
 async function loadImages(items:DesignCatalogItem[]){
   for(const o of items){
     if(imagePending.has(o.itemId))continue;
     imagePending.add(o.itemId);
     void itemMedia.getItemImage(o.itemId).then(img=>{if(img)images=new Map(images).set(o.itemId,img.url);}).catch(()=>{});
   }
 }
 $: if(worker!==subscribed){
   subscribed?.removeEventListener('message',receive);subscribed=worker;subscribed?.addEventListener('message',receive);
 }
 onDestroy(()=>subscribed?.removeEventListener('message',receive));
 $: if(grid?.key!==lastGrid){
   lastGrid=grid?.key??'';selected=null;placing=null;hover=null;moveMode=false;loadingShape=false;shapeId=0;error='';camera=defaultMapCamera();
 }
 $: if(active&&grid&&worker&&locale!==catalogLocale)requestCatalog(grid,locale,worker);
 function requestCatalog(g:PublicTerrainGridRef,language:WandLanguage,w:Worker){
   catalogLocale=language;catalogLoading=true;catalogError='';catalogId=nextRequest();
   w.postMessage({command:'design-catalog',requestId:catalogId,key:g.key,locale:language});
 }
 function receive(e:MessageEvent){
   const d=e.data;
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
     placing=g;orientation=2;selected=null;moveMode=false;hover=null;error='';
   }
 }
 function chooseItem(id:number){
   if(!worker||!grid)return;
   const g=definitions.get(id);
   if(g){placing=g;orientation=2;selected=null;moveMode=false;hover=null;error='';shapeId=0;loadingShape=false;return;}
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
 $: visible=map?visibleSavedObjects(objects,map.shapes,mapViewportBounds(camera,extent),selected):[];
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
 function cancel(){placing=null;moveMode=false;hover=null;shapeId=0;loadingShape=false;error='';}
 function travel(delta:-1|1){cancel();selected=null;save(travelDesign(timeline,delta));}
 function rotate(delta:number){
   if(placing){if(!nativeActionBlocked(placing.editRestrictions,'rotate')&&!exclusiveAnchorClass(String(placing.itemId)))orientation=(orientation+delta+4)%4;return;}
   if(chosen&&chosenGeometry)save(transformDesign(timeline,chosen.id,chosenGeometry,chosen.x,chosen.y,(chosen.orientation+delta+4)%4,width,height));
 }
 function duplicate(){if(chosen&&chosenGeometry){placing=chosenGeometry;orientation=chosen.orientation;moveMode=false;selected=null;hover=null;}}
 function remove(){if(chosen&&chosenGeometry){const next=removeDesign(timeline,chosen.id,chosenGeometry);if(next){save(next);selected=null;cancel();}}}
 function cell(e:MouseEvent){
   const m=svg?.getScreenCTM();if(!m)return null;
   const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse()),x=Math.floor(p.x),y=Math.floor(p.y);
   return x>=0&&y>=0&&x<width&&y<height?{x,y}:null;
 }
 function pick(e:MouseEvent){
   if(gesture.consumeClick()||e.detail===0)return;
   const p=cell(e);if(!p)return;
   if(placing){save(placeDesign(timeline,placing,p.x,p.y,orientation,width,height));return;}
   if(moveMode&&chosen&&chosenGeometry){
     const next=transformDesign(timeline,chosen.id,chosenGeometry,p.x,p.y,chosen.orientation,width,height);
     if(next){save(next);moveMode=false;hover=null;}else if(p.x!==chosen.x||p.y!==chosen.y)save(null);return;
   }
   const hits=map?savedShapesAt(map,1,p.x,p.y):[];
   const ordered=mapPainterOrder(hits).reverse();
   selected=ordered.find(o=>matchesSelectionLayer(o,layer))?.localOrdinal??ordered[0]?.localOrdinal??null;
 }
 function follow(e:PointerEvent){
   const p=gesture.move(e,svg,extent,camera);if(p){camera=p;return;}
   if(placing||moveMode)hover=cell(e);
 }
 function keys(e:KeyboardEvent){
   if(e.key==='Escape'){cancel();return;}
   if(e.key.toLowerCase()==='r'){e.preventDefault();rotate(e.shiftKey?1:3);return;}
   if(e.key==='Delete'){e.preventDefault();remove();return;}
   const delta:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
   const d=delta[e.key];
   if(d&&chosen&&chosenGeometry&&!placing){e.preventDefault();save(transformDesign(timeline,chosen.id,chosenGeometry,chosen.x+d[0],chosen.y+d[1],chosen.orientation,width,height));}
 }
 function more(e:Event){const el=e.currentTarget as HTMLElement;if(el.scrollTop+el.clientHeight>=el.scrollHeight-160)limit=Math.min(filtered.length,limit+80);}
</script>
{#if active&&grid&&raster}
 <div class="design-workspace">
  <aside aria-label="配置する家具">
   <input type="search" aria-label="家具を検索" placeholder="家具を検索" bind:value={query} on:input={()=>limit=80}/>
   <select aria-label="配置カテゴリ" bind:value={layer} on:change={()=>limit=80}>
    {#each ['all','furniture','surface','landscape','ground','fence'] as l}<option value={l}>{MAP_LAYER_LABELS[l as MapSelectionLayer]}</option>{/each}
   </select>
   {#if catalogLoading}<p role="status">家具を読み込み中…</p>{:else if catalogError}<p role="alert">{catalogError}</p><button type="button" on:click={()=>worker&&grid&&requestCatalog(grid,locale,worker)}>再読み込み</button>{/if}
   <div class="design-catalog" on:scroll={more}>
    {#each visibleCatalog as item (item.itemId)}
     <button type="button" class="design-item" aria-pressed={placing?.itemId===item.itemId} on:click={()=>chooseItem(item.itemId)}>
      {#if images.has(item.itemId)}<img src={images.get(item.itemId)} alt="" loading="lazy"/>{/if}
      <span>{item.name}</span>
     </button>
    {/each}
    {#if !catalogLoading&&!filtered.length}<p>該当する家具なし</p>{/if}
   </div>
  </aside>
  <div class="design-map-side">
   <div class="design-controls">
    <button type="button" aria-label="設計を拡大" disabled={camera.zoom>=maxZoom} on:click={()=>camera=zoomMapCamera(camera,camera.zoom*2,maxZoom)}>＋</button>
    <button type="button" aria-label="設計を縮小" disabled={camera.zoom===1} on:click={()=>camera=zoomMapCamera(camera,camera.zoom/2,maxZoom)}>−</button>
    <button type="button" on:click={()=>camera=defaultMapCamera()}>全体</button>
    <button type="button" aria-label="設計を取り消す" disabled={timeline.cursor===0} on:click={()=>travel(-1)}>↶</button>
    <button type="button" aria-label="設計をやり直す" disabled={timeline.cursor===timeline.snapshots.length-1} on:click={()=>travel(1)}>↷</button>
    <button type="button" aria-label="設計の左回転" disabled={!placing&&!chosenGeometry} on:click={()=>rotate(1)}>⟲</button>
    <button type="button" aria-label="設計の右回転" disabled={!placing&&!chosenGeometry} on:click={()=>rotate(3)}>⟳</button>
    <button type="button" aria-pressed={moveMode} disabled={!chosenGeometry||nativeActionBlocked(chosenGeometry.editRestrictions,'move')} on:click={()=>{placing=null;moveMode=!moveMode;hover=null;}}>移動</button>
    <button type="button" disabled={!chosenGeometry} on:click={duplicate}>複製</button>
    <button type="button" disabled={!chosenGeometry||nativeActionBlocked(chosenGeometry.editRestrictions,'remove')} on:click={remove}>削除</button>
    {#if placing||moveMode}<button type="button" on:click={cancel}>配置終了</button>{/if}
   </div>
   {#if loadingShape}<p role="status">形状を読み込み中…</p>{/if}
   {#if error}<p role="alert">{error}</p>{/if}
   <button class="design-plot" type="button" aria-label="装飾設計マップ" on:click={pick} on:keydown={keys}
    on:wheel|nonpassive={e=>camera=wheelMapCamera(e,svg,extent,camera,maxZoom)}
    on:pointerdown={e=>gesture.begin(e,camera.zoom>1&&(!placing&&!moveMode||e.shiftKey||e.button===1))}
    on:pointermove={follow} on:pointerup={e=>gesture.end(e)} on:pointercancel={e=>gesture.end(e)} on:pointerleave={()=>{gesture.leave();hover=null;}}>
    <svg bind:this={svg} {viewBox} aria-hidden="true">
     <defs><pattern id="design-grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" stroke="#9da9b4" stroke-opacity=".38" stroke-width=".05" fill="none"/></pattern></defs>
     <rect width={width} height={height} fill="#27313a"/>
     {#if terrainUrl}<image href={terrainUrl} width={width} height={height} preserveAspectRatio="none" style="image-rendering:pixelated"/>{/if}
     {#if width/camera.zoom<160&&height/camera.zoom<160}<rect width={width} height={height} fill="url(#design-grid)"/>{/if}
     {#each visible as o (o.localOrdinal)}
      {@const shape=o.shapeKey?map?.shapes[o.shapeKey]:null}
      {#if shape}<path class="design-object" data-design-id={o.localOrdinal} transform={'translate('+o.x+' '+o.y+')'} d={shape.path} fill={MAP_LAYER_COLORS[o.layer]} fill-opacity={selected===o.localOrdinal?.86:.65} stroke={selected===o.localOrdinal?'#fff':MAP_LAYER_COLORS[o.layer]} stroke-width="1" vector-effect="non-scaling-stroke"/>{/if}
     {/each}
     {#if hover&&ghostShape}<path class="design-ghost" d={ghostShape.path} transform={'translate('+hover.x+' '+hover.y+')'} fill={ghostValid?'#b9c7d6':'#ef5350'} fill-opacity=".65" stroke="#fff" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>{/if}
     {#each warnings as run}<rect x={run.x} y={run.y} width={run.width} height="1" fill="#ef5350" fill-opacity=".6"/>{/each}
    </svg>
   </button>
   <div class="design-status">
    <span>{placements.length}件</span>
    {#if placing}<strong>{catalog.find(o=>o.itemId===placing?.itemId)?.name??placing.name} · 配置先を選択</strong>
    {:else if chosen}<strong>{catalog.find(o=>o.itemId===chosen?.itemId)?.name??chosenGeometry?.name}</strong>{/if}
    {#if warnings.length}<span>地形属性不一致候補</span>{/if}
   </div>
   <small>セーブ未使用の独立した設計。地形・形状はゲーム原本に基づく候補。ゲーム内の配置可否は未確認です。</small>
  </div>
 </div>
{/if}
<style>
 .design-workspace{display:grid;grid-template-columns:minmax(170px,240px) minmax(0,1fr);gap:8px;min-width:0}
 aside,.design-map-side{display:grid;gap:6px;min-width:0;align-content:start}
 input,select,button{font:inherit;background:var(--wand-menu);color:var(--wand-text);border:1px solid var(--wand-line);border-radius:5px;padding:5px}
 button[aria-pressed=true]{border-color:var(--wand-accent);background:var(--wand-header-hover)}
 button:disabled{opacity:.45}
 .design-catalog{display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:4px;overflow:auto;max-height:65vh;align-content:start}
 .design-item{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:44px;font-size:12px;overflow-wrap:anywhere}
 .design-item img{width:56px;height:56px;object-fit:contain}
 .design-controls,.design-status{display:flex;align-items:center;flex-wrap:wrap;gap:5px}
 .design-plot{padding:0;overflow:hidden;display:block;cursor:crosshair;touch-action:none;width:100%;background:#27313a}
 svg{display:block;width:100%;height:min(65vh,700px)}
 small,.design-status{font-size:12px;color:var(--wand-muted)}
 @media(max-width:700px){.design-workspace{grid-template-columns:1fr}.design-catalog{max-height:24vh}.design-plot svg{height:48vh}}
</style>
