<script lang="ts">
  import {savedGridObjects,savedShapesAt,type SavedShapeMap,type SavedShapeObject} from './saved-shape-map.ts';
  import {MAP_LAYER_COLORS,MAP_LAYER_LABELS,mapPainterOrder,matchesSelectionLayer,type MapSelectionLayer} from './source-map-layers.ts';
  import {sourceOrientationAngle} from './source-object-map.ts';
  export let map:SavedShapeMap;
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
  function pick(event:MouseEvent){
    const matrix=svg?.getScreenCTM();if(!matrix||event.detail===0)return;
    const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
    hits=savedShapesAt(map,ordinal,Math.floor(point.x),Math.floor(point.y));
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
  <button type="button" class="plot" aria-label="セーブ内の形状候補を選択" on:click={pick}>
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
    </svg>
  </button>
  {#if hits.length}<div class="controls" role="group" aria-label="重なるセーブ内オブジェクト">
    {#each hits as hit (hit.localOrdinal)}
      <button type="button" aria-pressed={selected===hit.localOrdinal} on:click={()=>selected=hit.localOrdinal}>{hit.name??'Item '+hit.itemId}</button>
    {/each}
  </div>{/if}
  {#if chosen}<p class="selected-saved-object">{chosen.name??'Item '+chosen.itemId} ／ ({chosen.x}, {chosen.y}) ／ {chosen.orientation??'向き不明'}</p>{/if}
  <p>原本定義による形状候補（原本Grid倍率 {map.sourceGridFactor??'不明'}）。丸印は形状不明。実際の占有・上下関係は未確認。</p>
</div>
<style>
  .saved-shape-plot{display:grid;gap:6px;min-width:0}
  .controls{display:flex;flex-wrap:wrap;gap:5px;align-items:center}
  button,select{font:inherit;color:inherit;background:transparent;border:1px solid #ffffff35;border-radius:5px;padding:5px;font-size:12px}
  button[aria-pressed=true]{border-color:#a7cfed;background:#a7cfed33}
  button:disabled{opacity:.4}
  .plot{padding:0;overflow:hidden;width:100%;background:#10121d;line-height:0;cursor:crosshair}
  svg{display:block;width:100%;height: min(60vh, 420px)}
  p{margin:0;font-size:11px;overflow-wrap:anywhere}
</style>
