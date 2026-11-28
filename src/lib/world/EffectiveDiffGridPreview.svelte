<script lang="ts">
 import type {EffectiveDiffGridPreview} from './diffgrid-effective-preview.ts';
 export let result:EffectiveDiffGridPreview|null=null;
 export let working=false;
 export let failed=false;
 type Grid=EffectiveDiffGridPreview['grids'][number];
 function draw(node:HTMLCanvasElement,grid:Grid){
   const render=(g:Grid)=>{
     node.width=520;node.height=320;
     const ctx=node.getContext('2d');if(!ctx)return;
     ctx.fillStyle='#111421';ctx.fillRect(0,0,520,320);
     if(!g.points.length)return;
     let minX=g.points[0].x,maxX=minX,minY=g.points[0].y,maxY=minY;
     for(const p of g.points){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}
     const scale=Math.min(480/Math.max(1,maxX-minX),280/Math.max(1,maxY-minY));
     const ox=(520-(maxX-minX)*scale)/2,oy=(320-(maxY-minY)*scale)/2;
     for(const p of g.points){
       ctx.fillStyle=p.origin==='default'?'#b3bdd0':p.origin==='modified'?'#f4c365':'#73d6c8';
       ctx.fillRect(Math.round(ox+(p.x-minX)*scale)-2,Math.round(320-oy-(p.y-minY)*scale)-2,5,5);
     }
   };
   render(grid);return {update:render};
 }
</script>
{#if working}
 <p role="status">差分Gridを照合中…</p>
{:else if failed}
 <p role="alert">差分Gridの配置を再構築できませんでした。</p>
{:else if result&&(result.grids.length||result.hashMismatchCount||result.unresolvedCount)}
 <section aria-label="差分Gridの再構築結果">
  <h3>現在の配置（差分Grid）</h3>
  {#if result.grids.length}
   <p><span class="default">● 原本配置</span>　<span class="modified">● 変更済み</span>　<span class="added">● 追加済み</span></p>
   {#each result.grids as grid}
    <details open={result.grids.length===1}>
     <summary>配置 {grid.localGridOrdinal} — {grid.points.length.toLocaleString()}件</summary>
     <canvas use:draw={grid} aria-label="差分Gridの配置座標図"></canvas>
     {#if grid.lookupEnumerationDivergenceCount}
      <p>個別取得と配置列挙が異なる記録：{grid.lookupEnumerationDivergenceCount}件</p>
     {/if}
    </details>
   {/each}
   <p>原本ハッシュ一致・配置列挙の閲覧用。編集や地形との重ね合わせは未対応です。</p>
  {/if}
  {#if result.hashMismatchCount||result.unresolvedCount}
   <p>未照合：ハッシュ不一致 {result.hashMismatchCount}件／構造未解決 {result.unresolvedCount}件</p>
  {/if}
 </section>
{/if}
<style>
 section{display:grid;gap:8px;padding:12px;background:var(--wand-card);border:1px solid var(--wand-line);border-radius:8px}
 h3,p{margin:0;font-size:12px;color:var(--wand-muted)}h3{font-size:14px;color:var(--wand-text)}
 summary{cursor:pointer;font-size:12px}canvas{display:block;width:100%;max-width:520px;height:auto;margin-top:8px}
 .default{color:#b3bdd0}.modified{color:#f4c365}.added{color:#73d6c8}
</style>
