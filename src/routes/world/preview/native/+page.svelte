<script lang="ts">
 import {type ImageSource} from '$lib/media/native-map-renderer.ts';
 import {openNativePreviewPack} from '$lib/media/native-cdn-preview.ts';
 import {nativeEditorExtent,editorViewToNativeCanvas,type LocalNativeMap} from '$lib/media/native-local-preview.ts';
 import {defaultMapCamera,mapCameraViewBox,mapViewportBounds,wheelMapCamera,createMapPanGesture,zoomMapCamera,panMapCamera} from '$lib/world/map-camera.ts';
 import NativeMapCanvas from '$lib/world/NativeMapCanvas.svelte';
 import MapCameraControls from '$lib/world/MapCameraControls.svelte';
 let maps:readonly LocalNativeMap[]=[],map:LocalNativeMap|null=null,source:ImageSource|null=null,selected='',locked=false;
 let camera=defaultMapCamera(),svg:SVGSVGElement;
 let error='',status:'drawing'|'ready'|'error'='drawing',ticket=0;
 let points:{x:number;y:number}[]=[];
 const maxZoom=64,gesture=createMapPanGesture();
 $: map=maps.find(m=>m.id===selected)??null;
 $: extent=map?nativeEditorExtent(map):{x:0,y:0,w:1,h:1};
 $: viewport=mapViewportBounds(camera,extent);
 $: viewBox=mapCameraViewBox(camera,extent);
 async function open(event:Event){
  const input=event.currentTarget as HTMLInputElement,files=Array.from(input.files??[]);input.value='';
  const revision=++ticket;error='';
  try{
   const {maps:next,source:provider}=await openNativePreviewPack(files);
   if(revision!==ticket)return;
   maps=next;source=provider;selected=next[0].id;camera=defaultMapCamera();points=[];status='drawing';
  }catch(e){if(revision===ticket)error=e instanceof Error?e.message:'読み込み失敗';}
 }
 function changeMap(event:Event){selected=(event.currentTarget as HTMLSelectElement).value;camera=defaultMapCamera();points=[];}
 function beginPan(e:PointerEvent){
  if(!e.isPrimary||!(e.button===0||e.button===1))return;
  e.preventDefault();
  gesture.begin(e,camera.zoom>1);
  if(camera.zoom>1){try{svg.setPointerCapture(e.pointerId);}catch{/* pointer ended */}}
 }
 function endPan(e:PointerEvent){
  gesture.end(e);
  if(svg?.hasPointerCapture(e.pointerId)){try{svg.releasePointerCapture(e.pointerId);}catch{/* pointer ended */}}
 }
 function mark(e:MouseEvent){
  if(gesture.consumeClick()||status!=='ready'||!svg)return;
  const transform=svg.getScreenCTM();if(!transform)return;
  const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(transform.inverse());
  if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<viewport.x||p.y<viewport.y||p.x>viewport.x+viewport.w||p.y>viewport.y+viewport.h)return;
  points=[...points.slice(-99),{x:Math.floor(p.x),y:Math.floor(p.y)}];
 }
</script>
<svelte:head><title>Native map — local preview</title></svelte:head>
<div class="preview">
 <div class="tools">
  <label>ローカル検証素材 <input type="file" multiple accept=".json,.png,.webp" on:change={open}/></label>
  {#if map&&source}
   <select aria-label="World" value={selected} on:change={changeMap}>{#each maps as m}<option value={m.id}>{m.id}</option>{/each}</select>
   <label><input type="checkbox" bind:checked={locked}/> 全区画を未解放として表示</label>
   <button type="button" on:click={()=>points=[]}>検証マーカー消去</button>
  {/if}
 </div>
 {#if error}<p role="alert">{error}</p>{/if}
 {#if map&&source}
  <div class="frame">
   <NativeMapCanvas layers={locked?map.locked:map.unlocked} view={editorViewToNativeCanvas(map,viewport)} {source} activeKey={map.id+':'+locked} onStatus={s=>status=s}/>
   <svg bind:this={svg} viewBox={viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Editor coordinate candidate"
     on:wheel|nonpassive={e=>camera=wheelMapCamera(e,svg,extent,camera,maxZoom)}
     on:pointerdown={beginPan} on:dragstart|preventDefault
     on:pointermove={e=>{const next=gesture.move(e,svg,extent,camera);if(next)camera=next;}}
     on:pointerup={endPan} on:pointercancel={endPan} on:lostpointercapture={e=>gesture.end(e)} on:pointerleave={()=>gesture.leave()}
     on:click={mark}>
    <rect x={viewport.x} y={viewport.y} width={viewport.w} height={viewport.h} fill="transparent" pointer-events="all"/>
    {#if status==='ready'}
     {#each points as p}<rect x={p.x} y={p.y} width="1" height="1" fill="#ffd84d" fill-opacity=".5" stroke="white" vector-effect="non-scaling-stroke" stroke-width="1" pointer-events="none"/>{/each}
    {/if}
   </svg>
   <MapCameraControls zoom={camera.zoom} {maxZoom} onZoom={v=>camera=zoomMapCamera(camera,v,maxZoom)} onFit={()=>camera=defaultMapCamera()} onPan={(dx,dy)=>camera=panMapCamera(camera,dx/camera.zoom,dy/camera.zoom)}/>
  </div>
  <p role="status">{status==='drawing'?'描画中…':status==='error'?'描画エラー':'描画済み'}。クリックで半ワールド単位の検証マーカーを表示します。</p>
 {:else}
  <p>ローカル検証ZIPを展開し、manifest.json と全画像を選択してください。CDN照合済みの場合は manifest.json のみ選択します。</p>
 {/if}
 <p>原本座標の検証用。画像は端末内のみで処理します。正式な座標校正・セーブ編集ではありません。</p>
</div>
<style>
 .preview{display:flex;flex-direction:column;gap:6px;padding:8px}
 .tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
 .frame{position:relative;min-height:300px;height:70vh;min-width:0;overflow:hidden;user-select:none;background:#181820}
 svg{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair;user-select:none;-webkit-user-drag:none}
 p{margin:0;font-size:12px}
</style>
