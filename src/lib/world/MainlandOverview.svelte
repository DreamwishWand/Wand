<script lang="ts">
 import {onDestroy} from 'svelte';
 import {bindMainland,mainlandExtent,mainlandTerrainHits,type MainlandGrid} from './mainland-world-coordinates.ts';
 import {nativeSourceFloorTint} from './native-terrain-canvas.ts';
 import {defaultMapCamera,maxMapZoom,mapCameraViewBox,mapViewportBounds,zoomMapCamera,panMapCamera,wheelMapCamera,createMapPanGesture} from './map-camera.ts';
 import MapCameraControls from './MapCameraControls.svelte';
 import type {PublicTerrainGridRef} from './public-terrain-projection.ts';
 import type {TerrainRaster} from './terrain-binding.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 export let grids:readonly PublicTerrainGridRef[];
 export let worker:Worker|null;
 export let nextRequest:()=>number;
 export let locale:WandLanguage='ja';
 export let label:(key:string)=>string;
 export let onChoose:(key:string)=>void;
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
  const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse()),hits=mainlandTerrainHits(bound,rasters,p.x,p.y);
  overlaps=hits.length>1?hits:[];if(hits.length===1)onChoose(hits[0].key);
 }
 onDestroy(()=>subscribed?.removeEventListener('message',receive));
</script>
<section class="mainland-overview" aria-label={words[0]}>
 <div class="overview-tools"><strong>{words[0]}</strong><button type="button" aria-label={words[1]} title={words[1]} on:click={onClose}><svg viewBox="0 0 24 24"><path d="m6 6 12 12M6 18 18 6"/></svg></button></div>
 {#if !bound||failed}<p role="alert">{words[3]}</p>{:else if pending.size||images.size<bound.length}<p role="status">{words[2]} {images.size}/{bound.length}</p>{/if}
 <button class="mainland-map" type="button" aria-label={words[5]} on:click={click} on:wheel|nonpassive={e=>camera=wheelMapCamera(e,svg,extent,camera,maxZoom)}
 on:pointerdown={e=>gesture.begin(e,camera.zoom>1)} on:pointermove={e=>{const next=gesture.move(e,svg,extent,camera);if(next)camera=next;}}
 on:pointerup={e=>gesture.end(e)} on:pointercancel={e=>gesture.end(e)} on:pointerleave={()=>gesture.leave()}>
  <svg bind:this={svg} {viewBox} aria-hidden="true">
   <rect x={extent.x} y={extent.y} width={extent.w} height={extent.h} fill="#27313a"/>
   {#each [...(bound??[])].sort((a,b)=>a.origin.position[1]-b.origin.position[1]) as g (g.key)}
    {#if images.has(g.key)&&g.bounds.x+g.bounds.w>=viewport.x&&g.bounds.x<=viewport.x+viewport.w&&g.bounds.y+g.bounds.h>=viewport.y&&g.bounds.y<=viewport.y+viewport.h}
     <image class="mainland-terrain" data-area={g.key} href={images.get(g.key)} width={g.sizeX} height={g.sizeY} transform={'translate('+g.bounds.x+' '+(-2*g.origin.position[2])+') scale(1 -1)'} preserveAspectRatio="none" style="image-rendering:pixelated"/>
    {/if}
   {/each}
  </svg>
 </button>
 <MapCameraControls zoom={camera.zoom} {maxZoom} onZoom={value=>camera=zoomMapCamera(camera,value,maxZoom)} onFit={()=>camera=defaultMapCamera()} onPan={(dx,dy)=>camera=panMapCamera(camera,dx/camera.zoom,dy/camera.zoom)}/>
 {#if overlaps.length}<div class="overlap-choices"><small>{words[4]}</small>{#each overlaps as g (g.key)}<button type="button" on:click={()=>onChoose(g.key)}>{label(g.key)}</button>{/each}</div>{/if}
</section>
<style>
 .mainland-overview{position:absolute;inset:0;z-index:20;background:var(--wand-bg);color:var(--wand-text);overflow:hidden;isolation:isolate}.mainland-map{position:absolute;inset:0;width:100%;height:100%;background:#27313a;border:0;padding:0;touch-action:none}.mainland-map svg{display:block;width:100%;height:100%}
 .overview-tools,.overlap-choices,.mainland-overview p{position:absolute;z-index:4;background:var(--wand-card);border:1px solid var(--wand-line);border-radius:6px;padding:5px 8px}.overview-tools{top:6px;left:6px;display:flex;gap:8px;align-items:center}.overview-tools button{display:grid;place-items:center;width:34px;height:34px}.overview-tools svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.7}.mainland-overview p{top:52px;left:6px;margin:0}.overlap-choices{left:8px;bottom:8px;display:grid;gap:4px;max-width:calc(100% - 70px)}button:not(.mainland-map){background:var(--wand-menu);color:inherit;border:1px solid var(--wand-line);border-radius:5px;cursor:pointer;padding:5px 8px}
</style>
