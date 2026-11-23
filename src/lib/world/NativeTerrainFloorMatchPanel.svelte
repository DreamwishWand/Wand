<script lang="ts">
  import type {OriginalFloorItem,NativeFloorMatchResult} from './native-floor-match.ts';
  import type {NativeFloorWindowResult} from './native-floor-rectangle-window.ts';
  export let matches:readonly OriginalFloorItem[]=[];
  export let selected:OriginalFloorItem|null=null;
  export let result:NativeFloorMatchResult|null=null;
  export let windowResult:NativeFloorWindowResult|null=null;
  export let orientationCode=8;
  export let onOrientationChange:(orientation:number)=>void;
  export let searching=false;
  export let loading=false;
  export let errorMessage='';
  export let onSearch:(query:string)=>void;
  export let onPick:(item:OriginalFloorItem)=>void;
  export let onClear:()=>void;
  let query='';
  let mapMode:'windows'|'cells'='windows';
  let showDefaultAnchors=true;
  const directions=[8,9,10,11,12,13,14,15,0,1,2,3,4,5,6,7];
  function paintWindow(node:HTMLCanvasElement,options:{
    result:NativeFloorWindowResult;showAnchors:boolean;
  }){
    function render({result,showAnchors}:typeof options){
      const binary=result.originBitmap;
      const sx=result.bitmapWidth,sy=result.bitmapHeight;
      if(!(binary instanceof Uint8Array)||sx===null||sy===null||
        sx*sy!==binary.length)return;
      const pins=result.originalDefaultAnchorCounts;
      node.width=sx;node.height=sy;
      const ctx=node.getContext('2d',{alpha:false});
      if(!ctx)return;
      const pixels=ctx.createImageData(sx,sy);
      for(let i=0;i<binary.length;i++){
        const pin=showAnchors&&pins instanceof Uint16Array&&
          pins.length===binary.length&&pins[i]>0;
        const match=binary[i]===1,offset=i*4;
        pixels.data[offset]=pin?248:match?80:49;
        pixels.data[offset+1]=pin?148:match?173:45;
        pixels.data[offset+2]=pin?100:match?118:57;
        pixels.data[offset+3]=255;
      }
      ctx.putImageData(pixels,0,0);
    }
    render(options);
    return {update:render};
  }
  const format=(n:number)=>n.toLocaleString('ja-JP');
  function paint(node:HTMLCanvasElement,match:NativeFloorMatchResult){
    function render(x:NativeFloorMatchResult){
      if(!(x.raster instanceof Uint8Array)||
        x.rasterSizeX===null||x.rasterSizeY===null||
        x.rasterSizeX*x.rasterSizeY!==x.raster.length)
        return;
      node.width=x.rasterSizeX;node.height=x.rasterSizeY;
      const ctx=node.getContext('2d',{alpha:false});
      if(!ctx)return;
      const image=ctx.createImageData(node.width,node.height);
      for(let i=0;i<x.raster.length;i++){
        const matchCell=x.raster[i]===1;
        const off=i*4;
        image.data[off]=matchCell?80:49;
        image.data[off+1]=matchCell?173:45;
        image.data[off+2]=matchCell?118:57;
        image.data[off+3]=255;
      }
      ctx.putImageData(image,0,0);
    }
    render(match);
    return {update:render};
  }
</script>

<div class="floor-evidence">
  <div class="heading">
    <h2>家具と地形の条件</h2>
    {#if selected}
      <button class="clear" on:click={onClear} type="button" aria-label="家具の選択を解除">
        解除
      </button>
    {/if}
  </div>
  <label class="search">家具名で検索
    <input type="search" bind:value={query}
      autocomplete="off" placeholder="例：Chair"
      on:input={()=>onSearch(query)}/>
  </label>
  {#if searching}
    <p class="hint">家具を検索しています…</p>
  {:else if matches.length>0}
    <div class="results" aria-label="原本家具の候補">
      {#each matches as item (item.itemId)}
        <button type="button" class:chosen={selected?.itemId===item.itemId}
          on:click={()=>onPick(item)}>
          <span>{item.nativeName}</span>
          <small>{item.sizeX} × {item.sizeY}</small>
        </button>
      {/each}
    </div>
  {/if}
  {#if selected}
    <div class="selection">
      <strong>{selected.nativeName}</strong>
      <small>原本フットプリント {selected.sizeX} × {selected.sizeY}</small>
    </div>
    <label class="rotation">家具の向き
      <select value={String(orientationCode)}
        on:change={(event)=>onOrientationChange(Number(event.currentTarget.value))}>
        {#each directions as direction}
          <option value={String(direction)}>{'向き '+direction}{direction===8?'（初期）':''}</option>
        {/each}
      </select>
    </label>
  {/if}
  {#if loading}
    <p class="hint" role="status">地形マスクを照合しています…</p>
  {:else if result&&selected?.itemId===result.item?.itemId&&
    result.status==='source_floor_mask_overlap_only'}
    <div class="stats">
      <div>
        <small>選択Gridの床マスク一致</small>
        <strong>{result.selectedGridOverlapCount===null?'未確認':format(result.selectedGridOverlapCount)}マス</strong>
      </div>
      <div>
        <small>地域内の原本Grid合計</small>
        <strong>{result.regionSourceOverlapCount===null?'一部未確認':format(result.regionSourceOverlapCount)}マス</strong>
      </div>
      <div>
        <small>照合済みGridData</small>
        <strong>{format(result.matchingGridDataCount)} / {format(result.matchingGridDataCount+result.unresolvedGridDataCount)}</strong>
      </div>
    </div>
    {#if windowResult?.status==='source_rectangle_floor_windows_only'&&
      windowResult.itemId===result.item?.itemId&&
      windowResult.orientationCode===orientationCode}
      <div class="stats" aria-label="家具の外接矩形を考慮した原本床条件">
        <div>
          <small>選択Grid・矩形全体が一致</small>
          <strong>{windowResult.selectedGridOriginCount===null
            ?'未確認':format(windowResult.selectedGridOriginCount)}地点</strong>
        </div>
        <div>
          <small>地域内の矩形一致地点（Gridごと）</small>
          <strong>{windowResult.regionOriginCount===null
            ?'一部未確認':format(windowResult.regionOriginCount)}地点</strong>
        </div>
        <div>
          <small>外接矩形の寸法（GridDataセル）</small>
          <strong>{windowResult.boundingWidth} × {windowResult.boundingHeight}</strong>
        </div>
      </div>
    {/if}
    <div class="map-mode" role="group" aria-label="地形図の表示内容">
      <button type="button" class:chosen={mapMode==='windows'}
        on:click={()=>mapMode='windows'}>矩形全体の条件</button>
      <button type="button" class:chosen={mapMode==='cells'}
        on:click={()=>mapMode='cells'}>床属性だけ</button>
    </div>
    {#if mapMode==='windows'&&windowResult?.originBitmap instanceof Uint8Array&&
      windowResult.bitmapWidth!==null&&windowResult.bitmapHeight!==null}
      <div class="raster">
        <canvas use:paintWindow={{
          result:windowResult,showAnchors:showDefaultAnchors,
        }} aria-label="家具の外接矩形全体が原本の床マスク条件に一致する起点マップ"></canvas>
      </div>
      <p class="legend"><span class="yes"></span>外接矩形全体が床条件に一致
        <span class="no"></span>一致しない</p>
      {#if windowResult.originalDefaultAnchorCounts instanceof Uint16Array}
        <label class="anchor-toggle">
          <input type="checkbox" bind:checked={showDefaultAnchors} />
          原本初期配置のアンカーを表示（占有マスではありません）
        </label>
        {#if showDefaultAnchors}
          <p class="legend"><span class="original-pin"></span>原本初期配置の記録位置</p>
        {/if}
      {/if}
    {:else if mapMode==='windows'}
      <p class="hint">この原本Gridには、矩形全体の床条件を表示できません。</p>
    {/if}
    {#if mapMode==='cells'&&result.raster!==null&&
      result.rasterSizeX!==null&&result.rasterSizeY!==null}
      <div class="raster">
        <canvas use:paint={result} aria-label="原本Gridの床マスク一致セルの形状"></canvas>
      </div>
      <p class="legend"><span class="yes"></span>床マスクが一致
        <span class="no"></span>一致しない</p>
    {/if}
    <p class="hint">家具の外接矩形が収まり、矩形内の全マスの床属性が一致する原本GridData座標を示します。実際のフットプリント形状、衝突、建築制限、Grid倍率、現在のセーブ状態は未判定です。<strong>設置可能マス数ではありません。</strong></p>
  {:else if result}
    <p class="hint">このゲームバージョン、または家具の原本定義では照合できません。</p>
  {/if}
  {#if errorMessage}<p class="error" role="alert">{errorMessage}</p>{/if}
</div>

<style>
  .floor-evidence{display:grid;gap:10px;margin:18px 0;padding:15px;background:#171323;border:1px solid #ffffff29;border-radius:12px;max-width:100%;min-width:0}
  .heading{display:flex;align-items:center;justify-content:space-between;gap:9px}
  h2{font-size:15px;margin:0;color:#f1e8f9}
  .clear{background:transparent;color:#d8c2eb;border:1px solid #ffffff40;border-radius:7px;padding:7px 11px;font:inherit;font-size:11px}
  .search{display:grid;gap:6px;font-size:12px;color:#d1bfdf}
  .rotation{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12px;color:#cfbcdc}
  .rotation select{border-radius:7px;border:1px solid #65557d;background:#2b223b;color:#eee7f6;padding:6px 9px;font:inherit}
  .anchor-toggle{display:flex;align-items:center;gap:7px;font-size:11px;color:#c8bad5}
  .map-mode{display:flex;flex-wrap:wrap;gap:7px}
  .map-mode button{border:1px solid #ffffff40;border-radius:8px;background:#2b2339;color:#d9c5e8;font-size:11px;padding:8px 10px}
  .map-mode button.chosen{background:#54406b;border-color:#d9b8fb;color:white}
  .original-pin{width:10px;height:10px;display:inline-block;background:rgb(248,148,100);border-radius:2px}
  .search input{box-sizing:border-box;width:100%;min-width:0;background:#282037;border:1px solid #65557d;color:#fff;border-radius:8px;padding:9px 10px;font:inherit}
  .results{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,210px),1fr));gap:5px;max-height:170px;overflow:auto}
  .results button{min-width:0;border-radius:6px;border:1px solid #ffffff2a;color:#e6d9ec;text-align:left;background:#2b223b;padding:7px;display:flex;flex-direction:column;gap:3px;font-size:11px}
  .results button.chosen{border-color:#b88ae2}
  .results button span{overflow-wrap:anywhere}
  .results button small,.selection small{color:#ab9bba}
  .selection{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;color:#f0ddff;font-size:12px;overflow-wrap:anywhere}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,142px),1fr));gap:8px}
  .stats div{background:#241c32;border-radius:8px;padding:10px;display:grid;gap:7px}
  .stats small{font-size:10px;color:#b3a5c2}
  .stats strong{font-size:17px;font-variant-numeric:tabular-nums}
  .raster{min-width:0;max-width:100%;display:grid;place-items:center;background:#101019;border:1px solid #ffffff22;border-radius:7px;padding:8px}
  .raster canvas{display:block;width:auto;max-width:100%;max-height:420px;height:auto;image-rendering:pixelated}
  .legend{margin:0;display:flex;gap:7px;align-items:center;font-size:11px;color:#c5b8d0}
  .yes,.no{display:inline-block;width:10px;height:10px;border-radius:2px}
  .yes{background:rgb(80,173,118)}.no{background:rgb(49,45,57)}
  .hint{font-size:11px;color:#b7a8c8;line-height:1.6;margin:0}
  .error{font-size:12px;color:#ffbbba;margin:0}
</style>
