<script lang="ts">
  import {paintNativeTerrainCanvas as paint} from './native-terrain-canvas.ts';
  import type {
    SourceRegionAtlasPage,SourceRegionAtlasTile,
  } from './native-region-grid-atlas.ts';
  export let atlas:SourceRegionAtlasPage;
  export let selectedViewKey:string;
  export let selectedGridId:string;
  export let loadingMore=false;
  export let onPick:(viewKey:string,gridIdNative:number)=>void;
  export let onMore:()=>void;

  const human=(n:number)=>n.toLocaleString('ja-JP');
  const present=(t:SourceRegionAtlasTile)=>
    t.status==='source_grid_local_mask_preview'&&
    t.previewValues!==null&&t.totalCells!==null;
</script>

<div class="region-atlas" aria-label="選択地域に収録された原本Gridの地形一覧">
  <div class="atlas-head">
    <h2>地域の地形</h2>
    <span>{atlas.knownGridDataRecords}/{atlas.totalGridDataRecords} GridData
      · 原本 {human(atlas.sourceGridCells)}マス</span>
  </div>
  <div class="tiles">
    {#each atlas.tiles as tile (tile.gridDataPath)}
      <button type="button" class="tile"
        class:active={tile.viewKey===selectedViewKey&&String(tile.gridIdNative)===selectedGridId}
        disabled={!present(tile)}
        title={tile.gridDataPath}
        aria-label={`${tile.areaName} Grid ${tile.gridIdNative} の原本地形を表示`}
        on:click={()=>onPick(tile.viewKey,tile.gridIdNative)}>
        <div class="tile-image">
          {#if present(tile)}
            <canvas
              use:paint={{
                sizeX:tile.previewWidth,
                sizeY:tile.previewHeight,
                previewValues:tile.previewValues!,
              }}
              aria-hidden="true"></canvas>
          {:else}
            <span class="unavailable">原本未確認</span>
          {/if}
        </div>
        <div class="tile-meta">
          <strong>{tile.areaName}</strong>
          <small>Grid {tile.gridIdNative} · {tile.sizeX??'?'} × {tile.sizeY??'?'}</small>
          {#if tile.nonzeroMaskCells!==null}
            <small>マスク≠0：{human(tile.nonzeroMaskCells)}マス</small>
          {/if}
        </div>
      </button>
    {/each}
  </div>
  {#if atlas.nextOffset!==null}
    <button type="button" class="more" disabled={loadingMore} on:click={onMore}>
      {loadingMore?'読み込み中':'ほかのGridを表示'}
    </button>
  {/if}
  <p class="boundary">原本Gridごとの独立した地形図です。表示上の並びはワールド内の位置関係ではありません。マスク≠0は設置可能マス数ではありません。</p>
</div>

<style>
  .region-atlas{min-width:0;max-width:100%;display:grid;gap:13px;margin:18px 0 8px}
  .atlas-head{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
  .atlas-head h2{font-size:16px;line-height:1.2;color:var(--wand-text);margin:0}
  .atlas-head span{font-size:12px;color:var(--wand-muted);font-variant-numeric:tabular-nums}
  .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:10px}
  .tile{display:grid;grid-template-rows:124px auto;gap:0;min-width:0;width:100%;margin:0;padding:0;text-align:left;background:var(--wand-surface);border:1px solid var(--wand-subtle-line);border-radius:10px;overflow:hidden;color:inherit}
  .tile:not(:disabled){cursor:pointer}
  .tile:not(:disabled):hover{border-color:var(--wand-selected-line);background:var(--wand-control-hover)}
  .tile.active{border:2px solid var(--wand-selected-line);outline:1px solid var(--wand-selected-line)}
  .tile:disabled{opacity:.72;cursor:default}
  .tile-image{background:#191723;min-width:0;min-height:0;overflow:hidden;display:grid;place-items:center;padding:6px}
  canvas{display:block;max-width:100%;max-height:112px;min-width:0;width:auto;height:auto;image-rendering:pixelated;object-fit:contain}
  .tile-meta{display:grid;gap:2px;align-content:start;min-width:0;padding:9px 10px 11px}
  .tile-meta strong{font-size:12px;font-weight:650;overflow-wrap:anywhere}
  .tile-meta small{font-size:10px;color:var(--wand-muted);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
  .unavailable{color:var(--wand-muted);font-size:12px}
  .more{justify-self:center;border:1px solid var(--wand-subtle-line);border-radius:8px;background:var(--wand-surface-raised);color:var(--wand-text);padding:10px 14px;font-size:12px}
  .more:disabled{opacity:.5}
  .boundary{font-size:11px;color:var(--wand-muted);line-height:1.6;margin:0}
</style>
