<script lang="ts">
  import {onDestroy} from 'svelte';
  import {savedDraftOverlap,OVERLAP_COLORS} from './saved-draft-overlap.ts';
  import {CARDINAL_ORIENTATIONS,isCardinal,worldTransformEligible,draftSavedMapTransform} from './saved-map-transform.ts';
  import {savedGridObjects,savedShapesAt,type SavedShapeMap,type SavedShapeObject} from './saved-shape-map.ts';
  import {MAP_LAYER_COLORS,MAP_LAYER_LABELS,mapPainterOrder,matchesSelectionLayer,type MapSelectionLayer} from './source-map-layers.ts';
  import {sourceOrientationAngle} from './source-object-map.ts';
  export let map:SavedShapeMap;
  export let file:File|null=null;
  let editWorker:Worker|null=null;
  let editEpoch=0;
  let busy=false,editError='',copyUrl='',copyName='',checkedSignature='';
  let draftX:number|undefined=0,draftY:number|undefined=0,draftOrientation:string|null=null,placing=false;
  let hoverPoint:{x:number;y:number}|null=null;
  let previousFile:File|null=null;
  function checkFile(value:File|null){if(previousFile!==value){previousFile=value;cancelEdit();placing=false;hoverPoint=null;}}
  $: checkFile(file);
  let draftTarget:SavedShapeObject|null=null;
  function cancelEdit(){editEpoch++;editWorker?.terminate();editWorker=null;busy=false;checkedSignature='';editError='';if(copyUrl)URL.revokeObjectURL(copyUrl);copyUrl='';}
  onDestroy(cancelEdit);
  function resetDraft(o:SavedShapeObject|null){cancelEdit();draftTarget=o;placing=false;hoverPoint=null;draftX=o?.x??0;draftY=o?.y??0;draftOrientation=o?.orientation??null;}
  $: if(chosen!==draftTarget)resetDraft(chosen);
  $: editPlan=draftSavedMapTransform(chosen,draftX,draftY,draftOrientation);
  $: draftSignature=editPlan?JSON.stringify(editPlan):'';
  $: if(checkedSignature&&checkedSignature!==draftSignature)cancelEdit();
  $: draftCode=isCardinal(draftOrientation)?CARDINAL_ORIENTATIONS.indexOf(draftOrientation)*4:null;
  $: draftShape=chosen&&draftCode!==null?map.shapes[chosen.itemId+':'+draftCode]:null;
  $: previewX=placing&&hoverPoint?hoverPoint.x:draftX;
  $: previewY=placing&&hoverPoint?hoverPoint.y:draftY;
  $: showDraft=Boolean((placing||editPlan)&&draftShape&&Number.isInteger(previewX)&&Number.isInteger(previewY));
  $: overlap=showDraft&&chosen&&draftShape&&previewX!==undefined&&previewY!==undefined? savedDraftOverlap(map,chosen,draftShape,previewX,previewY):null;
  $: if(!file)cancelEdit();
  async function runEdit(exporting:boolean){
    const source=file,plan=editPlan,signature=draftSignature;
    if(!source||!plan||busy||source.size<1||source.size>32*1024*1024||
      (exporting&&checkedSignature!==signature))return;
    const epoch=++editEpoch;busy=true;editError='';
    if(copyUrl)URL.revokeObjectURL(copyUrl);copyUrl='';
    let bytes:Uint8Array|null=null;
    try{
      bytes=new Uint8Array(await source.arrayBuffer());
      if(epoch!==editEpoch||file!==source||draftSignature!==signature)return;
      const worker=new Worker(new URL('../save/save-amount-preview.worker.ts',import.meta.url),{type:'module'});
      editWorker=worker;
      function finish(value:unknown){
        const r=value as {kind?:string;bytes?:Uint8Array;receipt?:Record<string,unknown>};
        worker.terminate();
        if(epoch!==editEpoch||file!==source||draftSignature!==signature){r?.bytes?.fill(0);return;}
        editWorker=null;busy=false;
        const receipt=r?.receipt;
        if(!exporting&&r?.kind==='result'&&receipt?.contract==='wand.db05.grid-mixed-batch-preview@1'&&
          receipt.changedCount===1&&receipt.lexicalBytesPreserved===true&&receipt.reopenVerified===true&&receipt.exportAuthorized===false){checkedSignature=signature;return;}
        if(exporting&&r?.kind==='copy'&&r.bytes instanceof Uint8Array&&r.bytes.byteLength>0&&r.bytes.byteLength<=32*1024*1024&&
          receipt?.contract==='wand.db05.experimental-copy@1'&&receipt.copyBytes===r.bytes.byteLength&&receipt.originalUnchanged===true&&
          receipt.independentReopenVerified===true&&receipt.experimentalCopyOnly===true&&receipt.productionWriterAuthorized===false){
          try{copyUrl=URL.createObjectURL(new Blob([r.bytes.buffer as ArrayBuffer],{type:'application/octet-stream'}));
            const dot=source.name.lastIndexOf('.');copyName=dot>0?source.name.slice(0,dot)+'-world-edited'+source.name.slice(dot):source.name+'-world-edited';}
          catch{editError='コピーを生成できませんでした。';}finally{r.bytes.fill(0);}return;
        }
        r?.bytes?.fill(0);checkedSignature='';editError='セーブの変更を検証できませんでした。';
      }
      worker.onmessage=e=>finish(e.data);worker.onerror=e=>{e.preventDefault();finish({kind:'error'});};worker.onmessageerror=()=>finish({kind:'error'});
      const request={command:exporting?'export-grid-mixed-batch-copy':'preview-grid-mixed-batch',format:source.name.toLowerCase().endsWith('.json')?'json':'auto',bytes,edits:[plan]};
      worker.postMessage(exporting?{...request,allowExperimentalCopy:true}:request,[bytes.buffer]);bytes=null;
    }catch{if(epoch===editEpoch){editWorker?.terminate();editWorker=null;busy=false;checkedSignature='';editError='セーブの処理に失敗しました。';}}
    finally{if(bytes?.byteLength)bytes.fill(0);if(epoch===editEpoch&&!editWorker)busy=false;}
  }
  let ordinal=0,selected:number|null=null,hits:SavedShapeObject[]=[];
  let layer:MapSelectionLayer='all';
  let zoom=1,cx=.5,cy=.5;
  let svg:SVGSVGElement;
  let previous:SavedShapeMap|null=null;
  $: ordinals=[...new Set(map.objects.map(o=>o.localGridOrdinal))];
  function resetCamera(){zoom=1;cx=.5;cy=.5;}
  function chooseGrid(n:number){ordinal=n;selected=null;hits=[];layer='all';resetCamera();}
  function resetMap(value:SavedShapeMap){if(value!==previous){previous=value;chooseGrid(value.objects[0]?.localGridOrdinal??0);}}
  $: resetMap(map);
  $: objects=mapPainterOrder(savedGridObjects(map,ordinal));
  $: layers=(Object.keys(MAP_LAYER_LABELS) as MapSelectionLayer[]).filter(l=>l==='all'||objects.some(o=>matchesSelectionLayer(o,l)));
  $: chosen=objects.find(o=>o.localOrdinal===selected)??null;
  function bounds(list:SavedShapeObject[],m:SavedShapeMap){
    if(!list.length)return {x:0,y:0,w:1,h:1};
    let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity;
    for(const o of list){const s=o.shapeKey?m.shapes[o.shapeKey]:null;
      x=Math.min(x,o.x);y=Math.min(y,o.y);right=Math.max(right,o.x+(s?.width??1));bottom=Math.max(bottom,o.y+(s?.height??1));}
    return {x:x-1,y:y-1,w:right-x+2,h:bottom-y+2};
  }
  $: extent=bounds(objects,map);
  $: viewBox=[extent.x+(cx-.5/zoom)*extent.w,extent.y+(cy-.5/zoom)*extent.h,extent.w/zoom,extent.h/zoom].join(' ');
  function changeZoom(n:number){zoom=Math.max(1,Math.min(64,n));cx=Math.max(.5/zoom,Math.min(1-.5/zoom,cx));cy=Math.max(.5/zoom,Math.min(1-.5/zoom,cy));}
  function pan(dx:number,dy:number){cx=Math.max(.5/zoom,Math.min(1-.5/zoom,cx+dx/zoom));cy=Math.max(.5/zoom,Math.min(1-.5/zoom,cy+dy/zoom));}
  function chooseLayer(l:MapSelectionLayer){layer=l;selected=hits.find(o=>matchesSelectionLayer(o,l))?.localOrdinal??null;}
  function pointerCell(event:MouseEvent){
    const matrix=svg?.getScreenCTM();if(!matrix)return null;
    const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
    const x=Math.floor(p.x),y=Math.floor(p.y);
    return Number.isSafeInteger(x)&&Number.isSafeInteger(y)&&x>=-2147483648&&x<=2147483647&&y>=-2147483648&&y<=2147483647?{x,y}:null;
  }
  function follow(event:PointerEvent){
    if(!placing||busy||event.pointerType==='touch')return;
    const p=pointerCell(event);if(p&&(p.x!==hoverPoint?.x||p.y!==hoverPoint?.y))hoverPoint=p;
  }
  function pick(event:MouseEvent){
    const point=pointerCell(event);if(!point||event.detail===0||busy)return;
    if(placing&&chosen){draftX=point.x;draftY=point.y;placing=false;hoverPoint=null;cancelEdit();return;}
    hits=savedShapesAt(map,ordinal,point.x,point.y);
    selected=hits.find(o=>matchesSelectionLayer(o,layer))?.localOrdinal??null;
  }
</script>
<div class="saved-shape-plot">
  <div class="controls">
    {#if ordinals.length>1}
      <label>セーブ内Grid <select value={ordinal} on:change={e=>chooseGrid(Number(e.currentTarget.value))}>
        {#each ordinals as id}<option value={id}>Grid {id}</option>{/each}
      </select></label>
    {/if}
    <button type="button" aria-label="セーブ図を拡大" on:click={()=>changeZoom(zoom*2)} disabled={zoom===64}>＋</button>
    <button type="button" aria-label="セーブ図を縮小" on:click={()=>changeZoom(zoom/2)} disabled={zoom===1}>−</button>
    <button type="button" on:click={resetCamera}>全体</button>
    {#if zoom>1}
      <button type="button" aria-label="左へ移動" on:click={()=>pan(-.4,0)}>←</button>
      <button type="button" aria-label="右へ移動" on:click={()=>pan(.4,0)}>→</button>
      <button type="button" aria-label="上へ移動" on:click={()=>pan(0,-.4)}>↑</button>
      <button type="button" aria-label="下へ移動" on:click={()=>pan(0,.4)}>↓</button>
    {/if}
  </div>
  <div class="controls" role="group" aria-label="セーブ図の選択レイヤー">
    {#each layers as l}<button type="button" aria-pressed={layer===l} on:click={()=>chooseLayer(l)}>{MAP_LAYER_LABELS[l]}</button>{/each}
  </div>
  <button type="button" class="plot" aria-label="セーブ内の形状候補を選択" on:click={pick} on:pointermove={follow} on:pointerleave={()=>hoverPoint=null}>
    <svg bind:this={svg} {viewBox} aria-hidden="true">
      <defs><pattern id="saved-shape-cells" width="1" height="1" patternUnits="userSpaceOnUse">
        <path d="M1 0H0V1" fill="none" stroke="#8f9aa8" stroke-opacity=".35" stroke-width=".04"/>
      </pattern></defs>
      <rect x={extent.x} y={extent.y} width={extent.w} height={extent.h} fill="#27313a"/>
      {#if extent.w/zoom<160&&extent.h/zoom<160}<rect x={extent.x} y={extent.y} width={extent.w} height={extent.h} fill="url(#saved-shape-cells)"/>{/if}
      {#each objects as o (o.localOrdinal)}
        {@const shape=o.shapeKey?map.shapes[o.shapeKey]:null}
        <g class="saved-object" data-local-ordinal={o.localOrdinal} transform={'translate('+o.x+' '+o.y+')'}>
          {#if shape}
            <path class="saved-object-shape" d={shape.path} fill={MAP_LAYER_COLORS[o.layer]} fill-opacity={selected===o.localOrdinal?.85:matchesSelectionLayer(o,layer)?.48:.24}
              stroke={selected===o.localOrdinal?'#fff':MAP_LAYER_COLORS[o.layer]} stroke-width="1" vector-effect="non-scaling-stroke"/>
            {#if o.orientationCode!==null}<path d="M0 -.32L.19 .13L0 .04L-.19 .13Z" transform={'translate(.5 .5) rotate('+sourceOrientationAngle(o.orientationCode)+')'} fill="#fff"/>{/if}
          {:else}<circle class="unknown-shape" cx=".5" cy=".5" r=".24" fill="#ddd" stroke="#fff" stroke-width="1" vector-effect="non-scaling-stroke"/>{/if}
          {#if o.surfaceCapable}<circle cx=".78" cy=".22" r=".13" fill="#dbc2f6"/>{/if}
        </g>
      {/each}
      {#if showDraft&&draftShape}
        <path class="saved-draft-shape" d={draftShape.path} transform={'translate('+previewX+' '+previewY+')'} fill="#a7b1bf" fill-opacity=".62" stroke="#fff" stroke-width="1.5" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>
        {#if overlap}{#each overlap.runs as run (run.x+','+run.y)}
          <rect class="saved-overlap-cell" data-evidence={run.evidence} x={run.x} y={run.y} width={run.width} height="1"
            fill={OVERLAP_COLORS[run.evidence]} fill-opacity=".8" stroke={OVERLAP_COLORS[run.evidence]} stroke-width="1" vector-effect="non-scaling-stroke"/>
        {/each}{/if}
      {/if}
    </svg>
  </button>
  {#if hits.length}<div class="controls" role="group" aria-label="重なるセーブ内オブジェクト">
    {#each hits as hit (hit.localOrdinal)}
      <button type="button" aria-pressed={selected===hit.localOrdinal} on:click={()=>selected=hit.localOrdinal}>{hit.name??'Item '+hit.itemId}</button>
    {/each}
  </div>{/if}
  {#if chosen}<p class="selected-saved-object">{chosen.name??'Item '+chosen.itemId} ／ ({chosen.x}, {chosen.y}) ／ {chosen.orientation??'向き不明'}</p>{/if}
  {#if chosen&&file&&worldTransformEligible(chosen)}
    <div class="transform-controls">
      <div class="controls">
        <button type="button" aria-pressed={placing} disabled={busy} on:click={()=>{placing=!placing;hoverPoint=null;}}>{placing?'移動先を選択中':'マップで移動先を選択'}</button>
        <label>X <input type="number" aria-label="移動先X" bind:value={draftX} step="1" disabled={busy}/></label>
        <label>Y <input type="number" aria-label="移動先Y" bind:value={draftY} step="1" disabled={busy}/></label>
        {#if isCardinal(chosen.orientation)}<label>向き <select aria-label="編集後の向き" bind:value={draftOrientation} disabled={busy}>
          {#each CARDINAL_ORIENTATIONS as direction}<option value={direction}>{['上','右','下','左'][CARDINAL_ORIENTATIONS.indexOf(direction)]}</option>{/each}
        </select></label>{/if}
        <button type="button" disabled={busy||!editPlan} on:click={()=>resetDraft(chosen)}>元に戻す</button>
      </div>
      {#if overlap}
        <div class="overlap-key" aria-label="形状の重なり候補">
          {#if overlap.counts['shape-overlap']}<span style:color={OVERLAP_COLORS['shape-overlap']}>重なり候補 {overlap.counts['shape-overlap']}マス</span>{/if}
          {#if overlap.counts['landscape-overlap']}<span style:color={OVERLAP_COLORS['landscape-overlap']}>景観と重なる {overlap.counts['landscape-overlap']}マス</span>{/if}
          {#if overlap.counts['support-unknown']}<span style:color={OVERLAP_COLORS['support-unknown']}>上下関係不明 {overlap.counts['support-unknown']}マス</span>{/if}
          {#if overlap.counts['ground-overlap']}<span>道・地面 {overlap.counts['ground-overlap']}マス</span>{/if}
        </div>
        {#if overlap.unresolvedObjects||overlap.truncated}<p>形状不明・未評価のオブジェクトがあります。</p>{/if}
      {/if}
      <p>色は原本形状による重なり候補です。配置許可とは別で、他の家具・小物・景観は削除・自動移動しません。</p>
      {#if editPlan}<div class="controls">
        <button type="button" disabled={busy||placing} on:click={()=>runEdit(false)}>変更を検証</button>
        {#if checkedSignature===draftSignature}<button type="button" disabled={busy||placing} on:click={()=>runEdit(true)}>実験的な編集コピーを作成</button>{/if}
      </div>{/if}
      {#if busy}<p role="status">ローカル処理中…</p>{/if}
      {#if editError}<p role="alert">{editError}</p>{/if}
      {#if copyUrl}<a href={copyUrl} download={copyName}>編集済みコピーを保存</a>{/if}
    </div>
  {:else if chosen&&file}<p>この種類または形状未確認のオブジェクトは現在の編集対象外です。</p>{/if}
  <p>原本定義による形状候補（原本Grid倍率 {map.sourceGridFactor??'不明'}）。丸印は形状不明。実際の占有・上下関係は未確認。</p>
</div>
<style>
  .saved-shape-plot{display:grid;gap:6px;min-width:0}
  .controls{display:flex;flex-wrap:wrap;gap:5px;align-items:center}
  .overlap-key{display:flex;flex-wrap:wrap;gap:8px;font-size:12px}
  .saved-overlap-cell{pointer-events:none}
  .transform-controls{display:grid;gap:8px;padding:8px;border:1px solid #ffffff35;border-radius:5px}
  input{width:90px;max-width:100%;font:inherit;color:inherit;background:transparent;border:1px solid #ffffff35;padding:4px;border-radius:4px}
  button,select{font:inherit;color:inherit;background:transparent;border:1px solid #ffffff35;border-radius:5px;padding:5px;font-size:12px}
  button[aria-pressed=true]{border-color:#a7cfed;background:#a7cfed33}
  button:disabled{opacity:.4}
  .plot{padding:0;overflow:hidden;width:100%;background:#10121d;line-height:0;cursor:crosshair}
  svg{display:block;width:100%;height: min(60vh, 420px)}
  p{margin:0;font-size:11px;overflow-wrap:anywhere}
</style>
