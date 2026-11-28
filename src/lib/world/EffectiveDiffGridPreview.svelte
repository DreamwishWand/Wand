<script lang="ts">
 import type {EffectiveDiffGridPreview} from './diffgrid-effective-preview.ts';
 export let result:EffectiveDiffGridPreview|null=null;
 export let working=false;
 export let failed=false;
 export let draft:EffectiveDiffGridPreview|null=null;
 export let draftWorking=false;
 export let draftFailed=false;
 export let onDraft:(plan:unknown)=>void=()=>{};
 let gridOrdinal=1,pointOrdinal=1,action:'transform'|'duplicate'|'remove'|'add'='transform';
 let itemId='',x=0,y=0,orientation='GridOrientation_Up';
 let queue:Record<string,unknown>[]=[];
 const directions=['Up','UpRight','Right','DownRight','Down','DownLeft','Left','UpLeft'];
 $: chosen=result?.grids[gridOrdinal-1];
 $: point=chosen?.points[pointOrdinal-1];
 function selectGrid(){
   queue=[];pointOrdinal=1;selectPoint();
 }
 function selectPoint(){
   const p=result?.grids[gridOrdinal-1]?.points[pointOrdinal-1];
   if(p){itemId=p.itemId;x=p.x;y=p.y;orientation=p.orientation;}
 }
 function stage(){
   const p=result?.grids[gridOrdinal-1]?.points[pointOrdinal-1];
   const target={itemId:action==='add'?itemId:p?.itemId,x,y,orientation};
   if(queue.length>=512||!Number.isInteger(x)||!Number.isInteger(y)||!target.itemId)return;
   if(action==='add'){
     queue=[...queue,{action,pose:target}];return;
   }
   if(!p||queue.some(a=>a.pointOrdinal===pointOrdinal))return;
   const expected={itemId:p.itemId,x:p.x,y:p.y,orientation:p.orientation};
   queue=[...queue,action==='remove'?{action,pointOrdinal,expected}:{action,pointOrdinal,expected,pose:target}];
 }
 function submit(){if(queue.length&&chosen)onDraft({gridOrdinal,actions:queue});}
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
   <div class="draft-controls">
    <h3>通常家具の編集候補（保存なし）</h3>
    <label>配置 <select bind:value={gridOrdinal} on:change={selectGrid}>
     {#each result.grids as g}<option value={g.localGridOrdinal}>{g.localGridOrdinal}</option>{/each}
    </select></label>
    <label>操作 <select bind:value={action} on:change={selectPoint}>
     <option value="transform">移動・回転</option><option value="duplicate">複製</option>
     <option value="remove">撤去</option><option value="add">追加</option>
    </select></label>
    {#if action==='add'}
     <label>Item ID（検証用） <input bind:value={itemId} inputmode="numeric"></label>
    {:else}
     <label>配置番号 <input type="number" min="1" max={chosen?.points.length??1} bind:value={pointOrdinal} on:change={selectPoint}></label>
     {#if point}<p>現在位置：{point.x}, {point.y} · {point.orientation.replace('GridOrientation_','')}</p>{/if}
    {/if}
    {#if action!=='remove'}
     <label>X <input type="number" bind:value={x}></label><label>Y <input type="number" bind:value={y}></label>
     <label>方向 <select bind:value={orientation}>
       {#each directions as d}<option value={'GridOrientation_'+d}>{d}</option>{/each}
     </select></label>
    {/if}
    <div class="buttons"><button on:click={stage} disabled={draftWorking||queue.length>=512||(action!=='add'&&(!point||queue.some(a=>a.pointOrdinal===pointOrdinal)))}>操作を追加</button>
     <button on:click={()=>queue=[]} disabled={draftWorking||!queue.length}>クリア</button>
     <button on:click={submit} disabled={draftWorking||!queue.length}>{draftWorking?'検証中…':'編集候補を確認'} ({queue.length})</button></div>
    {#if draftFailed}<p role="alert">原本・配置・参照・在庫の整合性を確認できず、変更候補を生成できませんでした。</p>{/if}
    {#if draft&&!draftWorking&&!draftFailed}
     {#each draft.grids.filter(g=>g.localGridOrdinal===gridOrdinal) as g}
      <h3>変更後の候補 — {g.points.length}件</h3>
      <canvas use:draw={g} aria-label="編集後の配置候補"></canvas>
     {/each}
    {/if}
    <p>検証用の候補表示です。セーブの変更・出力や地形との重ね合わせは行いません。</p>
   </div>
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
 .draft-controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px;border-top:1px solid var(--wand-line);padding-top:10px}
 .draft-controls h3,.draft-controls p,.draft-controls canvas{flex-basis:100%}.draft-controls label{display:flex;align-items:center;gap:4px;font-size:12px}
 .draft-controls input{width:90px}.draft-controls input,.draft-controls select,.draft-controls button{font:inherit;color:var(--wand-text);background:var(--wand-menu);border:1px solid var(--wand-line);border-radius:5px;padding:5px}
 .buttons{display:flex;gap:5px;flex-wrap:wrap}.draft-controls button:disabled{opacity:.5}
 .default{color:#b3bdd0}.modified{color:#f4c365}.added{color:#73d6c8}
</style>
