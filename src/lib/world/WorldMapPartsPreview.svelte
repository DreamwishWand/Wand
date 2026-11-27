<script lang="ts">
  import {onDestroy} from 'svelte';
  import {parseWorldMapPartReport,localMapPartFiles,loadLocalMapParts,
    type WorldMapPartReport,type WorldMapParts,type LoadedMapPart} from '../media/world-map-parts.ts';
  import {defaultMapCamera,mapViewportBounds,mapCameraViewBox,zoomMapCamera,panMapCamera,wheelMapCamera,createMapPanGesture} from './map-camera.ts';
  import WorldMapPartLayer from './WorldMapPartLayer.svelte';
  import MapCameraControls from './MapCameraControls.svelte';
  import PublishedWorldMapPreview from './PublishedWorldMapPreview.svelte';
  let opened=false;
  let report:WorldMapPartReport|null=null;
  let selected='';
  let files:File[]=[];
  let loaded:LoadedMapPart[]=[];
  let controller:AbortController|null=null;
  let revision=0,loading=false,error='';
  let svg:SVGSVGElement;
  let camera=defaultMapCamera();
  const maxZoom=64,gesture=createMapPanGesture();
  $: map=report?.maps.find(m=>m.id===selected)??null;
  $: extent={x:0,y:0,w:map?.width??1,h:map?.height??1};
  $: viewport=mapViewportBounds(camera,extent);
  $: viewBox=mapCameraViewBox(camera,extent);
  function release(){
    controller?.abort();controller=null;revision++;loading=false;
    for(const p of loaded)URL.revokeObjectURL(p.url);
    loaded=[];camera=defaultMapCamera();
  }
  onDestroy(release);
  async function readReport(event:Event){
    const input=event.currentTarget as HTMLInputElement,file=input.files?.[0];
    input.value='';if(!file)return;
    release();report=null;selected='';error='';
    const ticket=revision;
    try{
      if(file.size>8*1024*1024)throw new Error('MAP_PARTS_REPORT_SIZE');
      const result=parseWorldMapPartReport(JSON.parse(await file.text()));
      if(ticket!==revision)return;
      report=result;selected=report.maps[0].id;
    }catch(e){if(ticket===revision)error=e instanceof Error?e.message:'MAP_PARTS_REPORT';}
  }
  function readFiles(event:Event){
    const input=event.currentTarget as HTMLInputElement;
    const next=Array.from(input.files??[]);
    input.value='';if(!next.length)return;
    release();files=next;error='';
  }
  function selectMap(event:Event){
    release();selected=(event.currentTarget as HTMLSelectElement).value;error='';
  }
  async function show(map:WorldMapParts){
    release();error='';loading=true;
    const request=new AbortController(),ticket=revision;
    controller=request;
    try{
      const result=await loadLocalMapParts(map,files,request.signal);
      if(ticket!==revision){for(const p of result)URL.revokeObjectURL(p.url);return;}
      loaded=result;
    }catch(e){if(ticket===revision)error=e instanceof Error?e.message:'MAP_PARTS_LOAD';}
    finally{if(ticket===revision)loading=false;}
  }
  function coverage(m:WorldMapParts|null,source:File[]){
    if(!m)return 0;
    try{return localMapPartFiles(source,m).size;}catch{return -1;}
  }
  $: count=coverage(map,files);
</script>
<details class="parts-preview" bind:open={opened}>
  <summary>MEDIA 原本マップの個別素材プレビュー</summary>
  {#if opened}<PublishedWorldMapPreview/>{/if}
  <details class="local-tools">
    <summary>ローカル原本の検証（Expert）</summary>
  <div class="tools">
    <label>マップ構成レポート<input type="file" accept=".json" on:change={readReport}/></label>
    <label>原寸WebP素材フォルダ<input type="file" webkitdirectory multiple on:change={readFiles}/></label>
    <label>またはWebP素材を選択<input type="file" multiple accept=".webp" on:change={readFiles}/></label>
    {#if report}
      <select aria-label="マップ" value={selected} on:change={selectMap}>
        {#each report.maps as m}<option value={m.id}>{m.id}</option>{/each}
      </select>
    {/if}
    {#if map}<button type="button" disabled={loading||count<0||count!==map.parts.length} on:click={()=>show(map!)}>個別素材を表示</button>{/if}
    <button type="button" disabled={!report&&!files.length} on:click={()=>{release();report=null;files=[];selected='';error='';}}>解除</button>
  </div>
  <p>原本レポートの配置行列・描画順を使用。元画像を端末内で照合し、合成画像を保存・アップロードしません。設置Gridとの対応は未検証です。</p>
  {#if map}
    <p>{report?.gameVersion} · {count<0?'素材名重複':count+'/'+map.parts.length+' 素材'} · {map.width} × {map.height}
      {#if map.oceanMissing} · 海の特殊描画は未対応{/if}</p>
  {/if}
  {#if loading}<p role="status">原寸画像を検証中…</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  {#if loaded.length}
    <div class="part-frame">
      <div class="part-map" role="region" aria-label="原本マップの個別素材"
        on:wheel|nonpassive={e=>camera=wheelMapCamera(e,svg,extent,camera,maxZoom)}
        on:pointerdown={e=>gesture.begin(e,camera.zoom>1)}
        on:pointermove={e=>{const next=gesture.move(e,svg,extent,camera);if(next)camera=next;}}
        on:pointerup={e=>gesture.end(e)} on:pointercancel={e=>gesture.end(e)} on:pointerleave={()=>gesture.leave()}>
        <svg bind:this={svg} viewBox={viewBox} aria-label="マップ画像">
          <WorldMapPartLayer parts={loaded} {viewport}/>
        </svg>
      </div>
      <MapCameraControls zoom={camera.zoom} {maxZoom} onZoom={value=>camera=zoomMapCamera(camera,value,maxZoom)}
        onFit={()=>camera=defaultMapCamera()} onPan={(dx,dy)=>camera=panMapCamera(camera,dx/camera.zoom,dy/camera.zoom)}/>
    </div>
  {/if}
  </details>
</details>
<style>
  .parts-preview{margin:12px 0;padding:12px;border:1px solid var(--wand-line);border-radius:8px;background:var(--wand-card)}
  summary{cursor:pointer;font-weight:600}
  .tools{display:flex;flex-wrap:wrap;align-items:end;gap:8px;margin:12px 0}
  label{display:grid;gap:4px;font-size:12px;max-width:100%}
  input,select,button{max-width:100%;color:inherit;font:inherit}
  button,select{background:var(--wand-menu);border:1px solid var(--wand-line);border-radius:5px;padding:6px}
  button:disabled{opacity:.5}
  p{font-size:12px;color:var(--wand-muted);margin:6px 0}
  .part-frame{position:relative;min-width:0;overflow:hidden;background:#181820}
  .part-map{touch-action:none;cursor:grab}
  svg{display:block;width:100%;height:65vh;max-height:900px}
</style>
