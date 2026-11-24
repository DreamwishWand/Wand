<script lang="ts">
  import type {SourceLayerInspection} from './native-source-layer-inspection.ts';

  export let inspection:SourceLayerInspection;
  let pointed:{x:number;y:number;rawLayer:number;contributors:number;
    unknown:number}|null=null;

  function render(node:HTMLCanvasElement,value:SourceLayerInspection){
    function paint(source:SourceLayerInspection){
      const window=source.window,rect=source.rect;
      if(!rect||!window?.rawLayerOrRows||
        !window.knownDefaultContributorCountRows||
        !window.potentiallyUnresolvedContributorCountRows)return;
      node.width=rect.width;node.height=rect.height;
      const ctx=node.getContext('2d',{alpha:false});
      if(!ctx)return;
      const data=ctx.createImageData(rect.width,rect.height);
      for(let y=0;y<rect.height;y++){
        for(let x=0;x<rect.width;x++){
          const raw=window.rawLayerOrRows[y][x];
          const count=window.knownDefaultContributorCountRows[y][x];
          const unknown=window.potentiallyUnresolvedContributorCountRows[y][x];
          const color=unknown>0?[203,150,93]:
            raw!==0?[179,116,201]:
            count>0?[93,155,192]:[39,40,56];
          const at=(y*rect.width+x)*4;
          data.data[at]=color[0];
          data.data[at+1]=color[1];
          data.data[at+2]=color[2];
          data.data[at+3]=255;
        }
      }
      ctx.putImageData(data,0,0);
    }
    paint(value);
    return{update:paint};
  }
  function inspectPointer(event:MouseEvent){
    const source=inspection;
    const rect=source.rect,window=source.window;
    if(!rect||!window?.rawLayerOrRows||
       !window.knownDefaultContributorCountRows||
       !window.potentiallyUnresolvedContributorCountRows)return;
    const element=event.currentTarget as HTMLCanvasElement;
    const bounds=element.getBoundingClientRect();
    if(!bounds.width||!bounds.height)return;
    const xx=Math.floor((event.clientX-bounds.left)/bounds.width*rect.width);
    const yy=Math.floor((event.clientY-bounds.top)/bounds.height*rect.height);
    if(xx<0||yy<0||xx>=rect.width||yy>=rect.height){
      pointed=null;return;
    }
    pointed={x:rect.x+xx,y:rect.y+yy,
      rawLayer:window.rawLayerOrRows[yy][xx],
      contributors:window.knownDefaultContributorCountRows[yy][xx],
      unknown:window.potentiallyUnresolvedContributorCountRows[yy][xx]};
  }
</script>

{#if inspection.status==='source_default_layer_window_observed'&&
  inspection.window?.rawLayerOrRows&&inspection.rect}
  <section class="local-inspection" aria-label="原本の初期オブジェクトレイヤー">
    <div class="top">
      <strong>原本の初期オブジェクト</strong>
      <span>選択座標 ({inspection.selectedX}, {inspection.selectedY})</span>
    </div>
    <div class="local-viewport">
      <canvas use:render={inspection} on:mousemove={inspectPointer}
        on:mouseleave={()=>pointed=null}
        aria-label="原本初期配置に由来するGridLayersマスク。地形の設置可否ではありません"></canvas>
    </div>
    <div class="stats" aria-label="原本初期配置レイヤーの検出数">
      <span>定義上の寄与セル {inspection.knownContributorCells}</span>
      <span>非ゼロレイヤー {inspection.rawNonzeroLayerCells}</span>
      <span>未確認の可能性 {inspection.possiblyUnresolvedCells}</span>
    </div>
    <div class="legend">
      <span><i class="known"></i>レイヤー値あり</span>
      <span><i class="zero"></i>元定義の値が0</span>
      <span><i class="unknown"></i>未確認があり得る</span>
      <span><i class="none"></i>寄与未観測</span>
    </div>
    {#if pointed}
      <p class="detail">({pointed.x}, {pointed.y})：
        原本GridLayers {pointed.rawLayer} ／
        定義上の寄与 {pointed.contributors} ／
        未確認可能性 {pointed.unknown}</p>
    {/if}
    <p class="boundary">原本の初期配置オブジェクトの既定レイヤーです。実際の衝突判定、現在のセーブの占有状況、配置可能・不可能は示しません。値0も空きマスではありません。</p>
  </section>
{:else}
  <p class="unsupported" role="status">
    {#if inspection.status==='source_grid_tessellation_not_compatible'}
      このGridは座標倍率が異なるため、原本オブジェクトを地形マスへ重ねられません。
    {:else if inspection.status==='source_game_version_not_verified'}
      このゲームバージョンの原本配置データは未確認です。
    {:else}
      このGridには表示できる原本初期配置レイヤーがありません。
    {/if}
  </p>
{/if}

<style>
  .local-inspection{display:grid;gap:10px;background:var(--wand-surface);border:1px solid var(--wand-subtle-line);border-radius:9px;padding:12px;min-width:0;max-width:100%}
  .top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:5px;color:var(--wand-text);font-size:12px}
  .top span{font-size:11px;color:var(--wand-muted);font-variant-numeric:tabular-nums}
  .local-viewport{display:grid;place-items:center;background:#0f1019;border-radius:7px;border:1px solid #ffffff29;padding:10px;min-width:0}
  canvas{display:block;width:min(100%,320px);height:auto;aspect-ratio:auto;image-rendering:pixelated}
  .stats{display:flex;flex-wrap:wrap;gap:8px 15px;color:var(--wand-text);font-size:11px;font-variant-numeric:tabular-nums}
  .legend{display:flex;flex-wrap:wrap;gap:7px 14px;color:var(--wand-muted);font-size:10px}
  .legend span{display:flex;align-items:center;gap:4px}
  .legend i{width:10px;height:10px;display:inline-block;border-radius:2px}
  .known{background:rgb(179,116,201)}.zero{background:rgb(93,155,192)}
  .unknown{background:rgb(203,150,93)}.none{background:rgb(39,40,56)}
  .detail{color:var(--wand-text);font-size:11px;margin:0}
  .boundary,.unsupported{color:var(--wand-muted);font-size:11px;line-height:1.5;margin:0}
</style>