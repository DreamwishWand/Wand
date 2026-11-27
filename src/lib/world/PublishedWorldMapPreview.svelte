<script lang="ts">
  import {onMount} from 'svelte';
  import {loadWorldMapRelease,type PublishedMapRelease} from '../media/world-map-release.ts';
  import {defaultMapCamera,mapViewportBounds,mapCameraViewBox,zoomMapCamera,panMapCamera,wheelMapCamera,createMapPanGesture} from './map-camera.ts';
  import WorldMapPartLayer from './WorldMapPartLayer.svelte';
  import MapCameraControls from './MapCameraControls.svelte';
  export let gameVersion='1.26.2';
  let release:PublishedMapRelease|null=null;
  let selected='',loading=true,error='';
  let imageFailed=false;
  let svg:SVGSVGElement;
  let camera=defaultMapCamera();
  const maxZoom=64,gesture=createMapPanGesture();
  $: map=release?.maps.find(m=>m.id===selected)??null;
  $: extent={x:0,y:0,w:map?.width??1,h:map?.height??1};
  $: viewport=mapViewportBounds(camera,extent);
  $: viewBox=mapCameraViewBox(camera,extent);
  onMount(()=>{
    let alive=true;
    loadWorldMapRelease(gameVersion).then(value=>{
      if(!alive)return;
      release=value;
      selected=value?.maps[0]?.id??'';
    }).catch(()=>{if(alive)error='公開マップ索引を読み込めません。';})
      .finally(()=>{if(alive)loading=false;});
    return ()=>{alive=false;};
  });
  function select(event:Event){
    selected=(event.currentTarget as HTMLSelectElement).value;
    camera=defaultMapCamera();imageFailed=false;
  }
</script>
{#if loading}
  <p role="status">マップを読み込み中…</p>
{:else if error}
  <p role="alert">{error}</p>
{:else if release&&map}
  <div class="map-select">
    <select aria-label="ワールドマップ" value={selected} on:change={select}>
      {#each release.maps as m}
        <option value={m.id}>{m.worldCandidate==='underwater'?m.id:m.worldCandidate}</option>
      {/each}
    </select>
    {#if map.oceanMissing}<p>海の特殊描画は未対応</p>
    {:else if map.visualReviewRequired}<p>原本表示の確認待ち</p>{/if}
  </div>
  {#if imageFailed}<p role="alert">一部の原寸画像を取得できません。</p>{/if}
  {#key map.id}
    <div class="frame">
      <div class="map" role="region" aria-label="原本ワールドマップ"
        on:wheel|nonpassive={e=>camera=wheelMapCamera(e,svg,extent,camera,maxZoom)}
        on:pointerdown={e=>gesture.begin(e,camera.zoom>1)}
        on:pointermove={e=>{const next=gesture.move(e,svg,extent,camera);if(next)camera=next;}}
        on:pointerup={e=>gesture.end(e)} on:pointercancel={e=>gesture.end(e)} on:pointerleave={()=>gesture.leave()}>
        <svg bind:this={svg} viewBox={viewBox} aria-label="ワールドマップ">
          <WorldMapPartLayer parts={map.parts} {viewport} onImageError={()=>imageFailed=true}/>
        </svg>
      </div>
      <MapCameraControls zoom={camera.zoom} {maxZoom}
        onZoom={value=>camera=zoomMapCamera(camera,value,maxZoom)} onFit={()=>camera=defaultMapCamera()}
        onPan={(dx,dy)=>camera=panMapCamera(camera,dx/camera.zoom,dy/camera.zoom)}/>
    </div>
  {/key}
  <p>背景の表示座標のみ。設置Gridとの位置対応は未検証です。</p>
{:else}
  <p>原寸素材の公開準備中です。</p>
{/if}
<style>
  .map-select{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:8px 0}
  select{font:inherit;color:inherit;max-width:100%;background:var(--wand-menu);border:1px solid var(--wand-line);border-radius:5px;padding:6px}
  .frame{position:relative;min-width:0;overflow:hidden;background:#181820}
  .map{touch-action:none;cursor:grab}
  svg{display:block;width:100%;height:65vh;max-height:900px}
  p{font-size:12px;color:var(--wand-muted);margin:6px 0}
</style>
