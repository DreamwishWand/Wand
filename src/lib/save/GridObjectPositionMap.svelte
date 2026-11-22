<script lang="ts">
  import type {LocalGridInstance} from './save-amount-preview.worker';

  // Only UI-local group/row ordinals are accepted. Native Save grid IDs,
  // native World positions and DB-04 layout IDs must never enter this view.
  export let rows:readonly LocalGridInstance[]=[];
  export let selectedOrdinal:number|null=null;
  export let disabled=false;
  export let onPick:(localOrdinal:number)=>void;

  type Point=LocalGridInstance&{x:number;y:number};
  type Marker={x:number;y:number;ordinals:number[]};
  let selectedGrid=0;

  function hasCoordinates(row:LocalGridInstance):row is Point{
    return row.coordinatesObserved&&row.x!==null&&row.y!==null;
  }
  function aggregate(input:readonly Point[]):Marker[]{
    const positions=new Map<string,Marker>();
    for(const row of input){
      const key=row.x+':'+row.y;
      let marker=positions.get(key);
      if(!marker){
        marker={x:row.x,y:row.y,ordinals:[]};
        positions.set(key,marker);
      }
      marker.ordinals.push(row.localOrdinal);
    }
    return [...positions.values()];
  }
  function summarize(input:readonly LocalGridInstance[]){
    const map=new Map<number,{
      id:number;kind:LocalGridInstance['recordKind'];
      total:number;positioned:number
    }>();
    for(const row of input){
      let group=map.get(row.localGridOrdinal);
      if(!group){
        group={id:row.localGridOrdinal,kind:row.recordKind,
          total:0,positioned:0};
        map.set(row.localGridOrdinal,group);
      }
      group.total++;
      if(hasCoordinates(row))group.positioned++;
    }
    return [...map.values()];
  }
  function choose(marker:Marker){
    // Identical saved numeric coordinates are real overlapping markers:
    // cycle their distinct existing objects, never invent a visual offset.
    const current=selectedOrdinal===null?-1:
      marker.ordinals.indexOf(selectedOrdinal);
    onPick(marker.ordinals[(current+1)%marker.ordinals.length]);
  }
  function percentage(value:number,min:number,max:number):number{
    return max===min?50:5+90*(value-min)/(max-min);
  }

  $: grids=summarize(rows);
  $: if(!grids.some(g=>g.id===selectedGrid))
    selectedGrid=grids[0]?.id??0;
  $: currentRows=rows.filter(row=>row.localGridOrdinal===selectedGrid);
  $: points=currentRows.filter(hasCoordinates);
  $: minX=points.length?Math.min(...points.map(p=>p.x)):0;
  $: maxX=points.length?Math.max(...points.map(p=>p.x)):0;
  $: minY=points.length?Math.min(...points.map(p=>p.y)):0;
  $: maxY=points.length?Math.max(...points.map(p=>p.y)):0;
  $: allMarkers=aggregate(points);
  $: markers=allMarkers.slice(0,256);
</script>

<div class="grid-map" role="region" aria-label="セーブ内Grid配置マップ">
  <div class="toolbar">
    <label for="save-grid-map-select">Gridを表示</label>
    <select id="save-grid-map-select" aria-label="表示するセーブGrid"
      bind:value={selectedGrid} disabled={disabled||grids.length===0}>
      {#each grids as grid}
        <option value={grid.id}>
          {grid.kind==='full'?'通常Grid':'差分Grid'}（ローカル #{grid.id}）
          · {grid.total}件
        </option>
      {/each}
    </select>
    <span class="count" role="status">{points.length}件の座標を表示</span>
  </div>
  {#if points.length>0}
    <div class="coordinate-plane" role="group"
      aria-label="保存済みX/Y座標の相対表示">
      <div class="x-axis">X {minX} ～ {maxX}</div>
      <div class="y-axis">Y {minY} ～ {maxY}</div>
      {#each markers as marker}
        <button type="button"
          class:selected={marker.ordinals.includes(selectedOrdinal??-1)}
          class="marker" disabled={disabled}
          aria-pressed={marker.ordinals.includes(selectedOrdinal??-1)}
          aria-label={marker.ordinals.length===1
            ?`配置 #${marker.ordinals[0]} をマップから選択`
            :`座標 X ${marker.x} Y ${marker.y} の配置 ${marker.ordinals.length}件から選択`}
          title={`X ${marker.x} / Y ${marker.y} · ${marker.ordinals.length}件`}
          style={`left:${percentage(marker.x,minX,maxX)}%;top:${percentage(marker.y,minY,maxY)}%`}
          on:click={()=>choose(marker)}>
          {marker.ordinals.length>1?marker.ordinals.length:''}
        </button>
      {/each}
    </div>
    {#if allMarkers.length>256}
      <small class="map-hint">表示点は先頭256座標です。下の一覧では全件を検索できます。</small>
    {/if}
  {:else}
    <p class="empty">このGridに表示可能なX/Y座標はありません。</p>
  {/if}
  <small class="map-hint">セーブ内の同一Gridにある数値座標の相対表示です。実際の地形、配置範囲、衝突判定やワールド座標ではありません。</small>
</div>

<style>
  .grid-map{display:grid;gap:10px;width:100%;padding:10px 0;}
  .toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;}
  .toolbar label{flex:none;font-size:13px;color:#e9d5f1;}
  select{min-width:180px;max-width:420px;flex:1;padding:10px 12px;
    background:#f5ecfa;color:#291d34;border:0;border-radius:7px;}
  .count{font-size:12px;color:#d4c2df;white-space:nowrap;}
  .coordinate-plane{position:relative;min-height:320px;width:100%;
    overflow:hidden;border:1px solid #745b8b;border-radius:12px;
    background-color:#201728;
    background-image:linear-gradient(#ffffff0e 1px,transparent 1px),
      linear-gradient(90deg,#ffffff0e 1px,transparent 1px);
    background-size:24px 24px;}
  .x-axis,.y-axis{position:absolute;z-index:1;font-size:11px;
    background:#201728dd;color:#d4c2df;padding:4px 6px;
    pointer-events:none;}
  .x-axis{bottom:3px;right:5px;}.y-axis{top:3px;left:5px;}
  .marker{position:absolute;transform:translate(-50%,-50%);z-index:2;
    display:grid;place-items:center;min-width:15px;min-height:15px;
    width:22px;height:22px;padding:0;border:2px solid #e6d1fa;
    border-radius:50%;background:#a37ac8;color:#fff;font-size:10px;
    font-weight:700;cursor:pointer;}
  .marker:hover,.marker:focus-visible,.marker.selected{
    border-color:#fff;background:#f3c66b;color:#2a1b25;
    outline:2px solid #f3c66b;outline-offset:2px;z-index:3;}
  .marker:disabled{opacity:.55;cursor:not-allowed;}
  .empty{margin:0;font-size:13px;color:#d4c2df;}
  .map-hint{font-size:11px;color:#d4c2df;line-height:1.4;}
  @media(max-width:580px){
    .coordinate-plane{min-height:260px;}
    select{min-width:150px;}
  }
</style>
