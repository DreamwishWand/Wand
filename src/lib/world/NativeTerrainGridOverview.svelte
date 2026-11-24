<script lang="ts">
  import {paintNativeTerrainCanvas as paint} from './native-terrain-canvas.ts';
  type Count = {nativeFloorValue:number;cellCount:number};
  type TerrainRaster = {
    status:'source_corroborated_grid_local_raster';
    sizeX:number;sizeY:number;totalCells:number;
    nativeFloorValues:Uint32Array;
    maskCounts:Count[];
    worldCoordinatesVerified:false;placementLegalityVerified:false;
  };
  export let raster:TerrainRaster;
  export let canNavigate=false;
  export let onNavigate:(x:number,y:number)=>void;
  let hovered:{x:number;y:number;value:number}|null=null;
  const integer=(v:number)=>v.toLocaleString('ja-JP');
  function position(event:MouseEvent):{x:number;y:number}|null{
    const target=event.currentTarget as HTMLButtonElement;
    const canvas=target.querySelector('canvas');
    if(!canvas||(event.type==='click'&&event.detail===0))return null;
    const bounds=canvas.getBoundingClientRect();
    if(!bounds.width||!bounds.height)return null;
    const nx=(event.clientX-bounds.left)/bounds.width;
    const ny=(event.clientY-bounds.top)/bounds.height;
    if(nx<0||ny<0||nx>=1||ny>=1)return null;
    return {x:Math.floor(nx*raster.sizeX),y:Math.floor(ny*raster.sizeY)};
  }
  function move(event:MouseEvent){
    const p=position(event);
    hovered=p?{...p,value:raster.nativeFloorValues[p.y*raster.sizeX+p.x]}:null;
  }
  function navigate(event:MouseEvent){
    if(!canNavigate)return;
    const p=position(event);
    if(p)onNavigate(p.x,p.y);
  }
</script>

<div class="overview">
  <div class="overview-head">
    <strong>原本地形全体</strong>
    <span>{raster.sizeX} × {raster.sizeY} ／ {integer(raster.totalCells)}マス</span>
  </div>
  <button type="button" class="terrain-map" aria-disabled={!canNavigate}
    aria-label="原本Grid地形の全体図。座標を選択して拡大表示"
    on:mousemove={move} on:mouseleave={()=>hovered=null} on:click={navigate}>
    <canvas use:paint={raster} aria-hidden="true"></canvas>
  </button>
  <p class="overview-meta" aria-live="polite">
    {#if hovered}原本セル ({hovered.x}, {hovered.y}) ／ マスク {hovered.value}
    {:else if canNavigate}全体図をクリックすると、その座標の詳細マスを表示します。
    {:else}地形セルと配置オブジェクトの座標対応は未確認です。全体図の拡大操作は無効です。{/if}
  </p>
  <div class="counts" aria-label="原本地形マスク別マス数">
    {#each raster.maskCounts as entry}
      <span>マスク {entry.nativeFloorValue}: <strong>{integer(entry.cellCount)}</strong></span>
    {/each}
  </div>
  <p class="warning">色は地形マスクを見分けるための表示です。家具の設置可能・不可、空きマス数、ワールド座標は未検証です。</p>
</div>

<style>
  .overview {display:grid;gap:10px;min-width:0;max-width:100%;overflow:hidden;margin:14px 0;padding:16px;background:var(--wand-surface);border:1px solid var(--wand-subtle-line);border-radius:12px}
  .overview-head {display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;color:var(--wand-text);font-size:14px}
  .overview-head span {color:var(--wand-muted);font-size:12px}
  .terrain-map {padding:0;border:1px solid #ffffff35;border-radius:6px;background:#221d2b;overflow:hidden;width:100%;max-width:740px;min-width:0;box-sizing:border-box;margin:0 auto;display:block;line-height:0}
  .terrain-map:not([aria-disabled='true']) {cursor:crosshair}
  .terrain-map[aria-disabled='true'] {cursor:default;opacity:1}
  .terrain-map:focus-visible {outline:2px solid white;outline-offset:3px}
  canvas {display:block;width:100%;height:auto;image-rendering:pixelated}
  .counts {display:flex;gap:7px 15px;flex-wrap:wrap;color:var(--wand-muted);font-size:11px;max-height:92px;overflow:auto}
  .counts strong {font-weight:600;color:var(--wand-muted)}
  .overview-meta {min-height:18px;font-size:12px;color:var(--wand-muted);margin:0}
  .warning {font-size:12px;color:var(--wand-muted);line-height:1.5;margin:0}
</style>
