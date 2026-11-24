<script lang="ts">
  import {emptyWorldTimeline,currentWorldEdits} from './saved-map-batch.ts';
  import {defaultWorldLayers,type WorldLayerState} from './world-layer-state.ts';
  import SavedShapePlot from './SavedShapePlot.svelte';
  import type {TerrainBinding} from './terrain-binding.ts';
  import type {SavedShapeMap} from './saved-shape-map.ts';
  import type {SavedGridSourceCandidates} from './saved-grid-source-candidates.ts';
  export let receipt:SavedGridSourceCandidates|null=null;
  export let shapeMap:SavedShapeMap|null=null;
  export let file:File|null=null;
  export let focusOrdinal:number|null=null;
  export let timeline=emptyWorldTimeline();
  export let terrain:TerrainBinding|null=null;
  export let compact=false;
  export let layerState:WorldLayerState=defaultWorldLayers();
  export let terrainDisplayed=false;
  export let available=false;
  export let working=false;
  export let errorMessage='';
  export let onCompare:()=>void;

  const n=(value:number)=>value.toLocaleString('ja-JP');
  function draw(node:HTMLCanvasElement,result:SavedGridSourceCandidates){
    function render(value:SavedGridSourceCandidates){
      const width=520,height=320,gap=24;
      node.width=width;node.height=height;
      const context=node.getContext('2d',{alpha:false});
      if(!context)return;
      context.fillStyle='#111421';
      context.fillRect(0,0,width,height);
      const all=value.points;
      if(!all.length)return;
      let minX=all[0].x,maxX=all[0].x;
      let minY=all[0].y,maxY=all[0].y;
      for(const point of all){
        if(point.x<minX)minX=point.x;
        if(point.x>maxX)maxX=point.x;
        if(point.y<minY)minY=point.y;
        if(point.y>maxY)maxY=point.y;
      }
      const rangeX=Math.max(1,maxX-minX);
      const rangeY=Math.max(1,maxY-minY);
      const scale=Math.min((width-2*gap)/rangeX,
        (height-2*gap)/rangeY);
      const offsetX=(width-rangeX*scale)/2;
      const offsetY=(height-rangeY*scale)/2;
      context.strokeStyle='#3c4052';
      context.lineWidth=1;
      context.strokeRect(gap/2,gap/2,width-gap,height-gap);
      for(let i=1;i<5;i++){
        const x=gap+(width-gap*2)*i/5;
        const y=gap+(height-gap*2)*i/5;
        context.beginPath();
        context.moveTo(x,gap);context.lineTo(x,height-gap);
        context.moveTo(gap,y);context.lineTo(width-gap,y);
        context.stroke();
      }
      context.fillStyle='#a7cfed';
      for(const point of all){
        // This is an independent SAVE numeric-coordinate plot.
        // It must never be projected onto original GridData pixels.
        const x=offsetX+(point.x-minX)*scale;
        const y=height-(offsetY+(point.y-minY)*scale);
        context.fillRect(Math.round(x)-2,Math.round(y)-2,4,4);
      }
    }
    render(result);
    return{update:render};
  }
</script>

<div class="saved-candidate-view" class:compact aria-label="セーブ内の原本参照候補">
  {#if !compact}<div class="actions">
    <h2>現在のセーブの座標</h2>
    <button type="button" on:click={onCompare} disabled={!available||working}>
      {working?'照合中…':'選択Gridと照合'}
    </button>
  </div>{/if}
  {#if !shapeMap&&currentWorldEdits(timeline).length}
    <p class="note">セーブ全体の配置変更 {currentWorldEdits(timeline).length}件を保持しています。</p>
  {/if}
  {#if !available}
    <p class="note">共通ヘッダーでセーブファイルを開くと、選択中の原本Gridとの参照パスを照合できます。</p>
  {:else if working}
    <p role="status" class="note">セーブをブラウザ内で照合しています…</p>
  {:else if errorMessage}
    <p role="alert" class="note">{errorMessage}</p>
  {:else if receipt}
    {#if !compact}<div class="summary">
      <span>原本参照パス一致候補 <strong>{n(receipt.matchedRecordCount)}件</strong></span>
      <span>表示座標 <strong>{n(receipt.displayedCount)}件</strong></span>
      {#if receipt.outsideSourceNumericEnvelopeCount>0}
        <span>原本数値範囲外 <strong>{n(receipt.outsideSourceNumericEnvelopeCount)}件</strong></span>
      {/if}
    </div>{/if}
    {#if receipt.points.length>0}
      {#if shapeMap}<SavedShapePlot {focusOrdinal} map={shapeMap} {file} {terrain} {compact} bind:timeline bind:terrainDisplayed bind:layerState/>
      {:else if new Set(receipt.points.map(p=>p.localGridOrdinal)).size===1}<div class="numeric-map">
        <canvas use:draw={receipt}
          aria-label="セーブ内の参照パス一致候補のX/Y数値座標図。地形図ではありません"></canvas>
      </div>{:else}<p class="note">複数のセーブGridの座標は個別の形状図で確認できます。</p>{/if}
      {#if !compact}<p class="axis">セーブ記録のX/Y数値座標。原本地形の座標には投影していません。</p>{/if}
      {#if receipt.dataSampled}
        <p class="note">表示数に上限があるため、座標図は先頭の一部を示しています。</p>
      {/if}
    {:else}
      <p class="note">この原本Gridとの一意な参照パス一致候補は見つかりませんでした。</p>
    {/if}
    {#if receipt.rowsWithoutCoordinates>0}
      <p class="note">原本参照は一致しましたが、座標を持たない記録：{n(receipt.rowsWithoutCoordinates)}件</p>
    {/if}
    {#if receipt.sourceReferenceCount>1}
      <p class="note">原本内で同じ参照パスを複数のGridが共有しています。Gridの識別ができないため候補を表示していません。</p>
    {/if}
    {#if !compact}<p class="warning">参照パスが一致しても、セーブ座標と原本Grid座標の一致、配置状態、衝突判定、設置許可は<strong>未検証</strong>です。原本地形に重ねたり、空きマス数として計上したりしません。</p>{/if}
  {/if}
</div>

<style>
  .saved-candidate-view{margin:15px 0;display:grid;gap:11px;padding:13px;min-width:0;max-width:100%;background:var(--wand-card);color:var(--wand-text);border:1px solid var(--wand-line);border-radius:10px}
  .saved-candidate-view.compact{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow:hidden;margin:0;padding:0;background:none;border:0;border-radius:0;gap:6px}
  .actions{display:flex;justify-content:space-between;align-items:center;gap:9px;flex-wrap:wrap}
  h2{font-size:14px;margin:0;color:var(--wand-text)}
  .actions button{border:1px solid var(--wand-line);background:var(--wand-menu);color:var(--wand-text);padding:8px 11px;border-radius:8px;font:inherit;font-size:12px}
  .actions button:not(:disabled){cursor:pointer}
  .actions button:not(:disabled):hover{background:var(--wand-header-hover)}
  .actions button:focus-visible{outline:2px solid var(--wand-focus);outline-offset:2px}
  .actions button:disabled{opacity:.55}
  .summary{display:flex;gap:9px 16px;flex-wrap:wrap;font-size:11px;color:var(--wand-muted)}
  .summary strong{color:var(--wand-text);font-size:13px;font-variant-numeric:tabular-nums}
  .numeric-map{display:grid;place-items:center;min-width:0;background:#10121d;border-radius:7px;padding:7px}
  .numeric-map canvas{display:block;max-width:100%;height:auto;width:520px;image-rendering:auto}
  .axis,.note,.warning{font-size:11px;line-height:1.6;color:var(--wand-muted);margin:0;overflow-wrap:anywhere}
  .warning{color:var(--wand-text)}
 .saved-candidate-view.compact{position:relative}.compact:has(.saved-shape-plot)>.note{position:absolute;z-index:6;right:60px;bottom:6px;max-width:45%;padding:4px;background:var(--wand-card);border-radius:5px}
</style>
