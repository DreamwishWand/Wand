<script lang="ts">
  import {onMount,onDestroy} from 'svelte';
  import {base} from '$app/paths';
  import {localSaveSession} from '$lib/ui/local-save-session';
  import {watchWandLanguage,type WandLanguage} from '$lib/ui/preferences';
  import MediaMapGridOverlay from '$lib/world/MediaMapGridOverlay.svelte';
  import SavedGridSourceCandidates from '$lib/world/SavedGridSourceCandidates.svelte';
  import {emptyWorldTimeline} from '$lib/world/saved-map-batch.ts';
  import type {SavedShapeMap} from '$lib/world/saved-shape-map.ts';
  import type {PublicTerrainGrid} from '$lib/world/public-terrain-projection.ts';
  import type {SavedGridSourceCandidates as SaveReceipt} from '$lib/world/saved-grid-source-candidates.ts';
  type Grid=Omit<PublicTerrainGrid,'data'|'palette'|'counts'|'sha256'>;
  type Raster={sizeX:number;sizeY:number;nativeFloorValues:Uint32Array};
  let worker:Worker|null=null,compare:Worker|null=null;
  let request=0,indexRequest=0,terrainRequest=0,shapeRequest=0,compareRequest=0;
  let grids:Grid[]=[],key='Meadow',raster:Raster|null=null;
  let receipt:SaveReceipt|null=null,shapeMap:SavedShapeMap|null=null,timeline=emptyWorldTimeline();
  let loading=true,comparing=false,error='',compareError='',locale:WandLanguage='ja';
  let cell:{x:number;y:number;value:number}|null=null;
  let seenRevision=-1;
  $: selected=grids.find(g=>g.key===key)??null;
  $: if($localSaveSession.revision!==seenRevision){
    seenRevision=$localSaveSession.revision;
    timeline=emptyWorldTimeline();refreshSave($localSaveSession.file,selected);
  }
  const english:Record<string,string>={Beach:'Dazzle Beach',Cliff:'Frosted Heights',DarkMountains:'Forgotten Lands',Forest:'Forest of Valor',Meadow:'Peaceful Meadow',Savannah:'Sunlit Plateau',Urban:'Plaza',Wetland:'Glade of Trust'};
  // English display names are UI labels; original path identity is separate.
  function label(g:Grid){return english[g.key]??g.key;}
  function clearCompare(){compare?.terminate();compare=null;compareRequest++;shapeRequest=-1;receipt=null;shapeMap=null;comparing=false;compareError='';}
  function refreshSave(file:File|null,grid:Grid|null){
    clearCompare();
    if(!file||!grid)return;
    comparing=true;
    const req=++request;compareRequest=req;
    const own=new Worker(new URL('../../lib/world/world-save-candidates.worker.ts',import.meta.url),{type:'module'});
    compare=own;
    own.onmessage=e=>{
      if(compare!==own||compareRequest!==req)return;
      own.terminate();compare=null;
      if(e.data?.kind!=='saved-source-candidates'||e.data.requestId!==req){comparing=false;compareError='セーブの配置を取得できませんでした。';return;}
      const next=e.data.receipt as SaveReceipt;
      if(next.viewKey!==grid.key||next.nativeGridId!==grid.gridIdNative||next.savedAndSourceCoordinatesEquivalent!==false){comparing=false;return;}
      receipt=next;
      if(next.points.length&&worker){shapeRequest=++request;worker.postMessage({command:'shapes',requestId:shapeRequest,key:grid.key,points:next.points});}
      else comparing=false;
    };
    own.onerror=()=>{if(compare===own){clearCompare();compareError='セーブを読み込めませんでした。';}};
    own.postMessage({command:'compare-source-grid',requestId:req,file,filename:file.name,query:{viewKey:grid.key,nativeGridId:grid.gridIdNative,
      sourceRefs:[{layoutId:grid.layoutId,gridDataPath:grid.gridDataPath,nativeGridId:grid.gridIdNative,nativeSizeX:grid.sizeX,nativeSizeY:grid.sizeY,tessellationFactor:grid.factor}]}});
  }
  function openGrid(next:Grid){
    key=next.key;raster=null;cell=null;loading=true;error='';
    terrainRequest=++request;
    worker?.postMessage({command:'terrain',requestId:terrainRequest,key:next.key});
    refreshSave($localSaveSession.file,next);
  }
  onMount(()=>{
    const unwatch=watchWandLanguage(v=>locale=v);
    worker=new Worker(new URL('../../lib/world/public-world-terrain.worker.ts',import.meta.url),{type:'module'});
    worker.onmessage=e=>{
      const value=e.data;
      if(value.requestId===indexRequest&&value.kind==='index'){
        grids=value.grids;
        const first=grids.find(g=>g.key===key)??grids[0];
        if(first)openGrid(first);return;
      }
      if(value.requestId===terrainRequest&&value.kind==='terrain'&&value.key===key){
        raster={sizeX:value.sizeX,sizeY:value.sizeY,nativeFloorValues:value.nativeFloorValues};loading=false;return;
      }
      if(value.requestId===shapeRequest&&value.kind==='shapes'&&value.key===key){shapeMap=value.result;comparing=false;return;}
      if(value.kind==='error'){
        if(value.requestId===indexRequest||value.requestId===terrainRequest){loading=false;error='地形データを読み込めませんでした。';}
        if(value.requestId===shapeRequest){comparing=false;compareError='アイテム形状DBを読み込めませんでした。';}
      }
    };
    worker.onerror=()=>{loading=false;comparing=false;error='ワールド処理を開始できませんでした。';};
    indexRequest=++request;worker.postMessage({command:'open',requestId:indexRequest,base});
    return unwatch;
  });
  onDestroy(()=>{worker?.terminate();compare?.terminate();worker=null;compare=null;});
  function selectCell(x:number,y:number){
    if(raster)cell={x,y,value:raster.nativeFloorValues[y*raster.sizeX+x]};
  }
</script>
<svelte:head><title>World Editor · Dreamwish Wand</title></svelte:head>
<section class="world-workspace">
  <header><h1>World Editor <small>β</small></h1><a href={base+'/world/preview/'}>開発用原本ツール</a></header>
  <nav aria-label="ワールド選択">
    {#each grids as grid (grid.key)}
      <button type="button" aria-pressed={key===grid.key} on:click={()=>openGrid(grid)}>{label(grid)}</button>
    {/each}
  </nav>
  {#if loading}<p role="status">地形読み込み中…</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  {#if selected&&raster}
    <div class="workspace-grid">
      <div class="terrain-side">
        <MediaMapGridOverlay initialSchematic compact
          selection={{platform:'Steam',gameVersion:'1.26.2',regionKey:'Village04',viewKey:selected.key,layoutId:selected.layoutId,nativeGridId:selected.gridIdNative,gridDataPath:selected.gridDataPath,sizeX:selected.sizeX,sizeY:selected.sizeY}}
          {raster} canNavigate onNavigate={selectCell} onInspect={selectCell}/>
        <p class="note">原本地形・各マスの属性。設置可否は未確定。{cell?' ('+cell.x+', '+cell.y+')':''}</p>
      </div>
      <SavedGridSourceCandidates shapeMap={shapeMap} file={$localSaveSession.file} bind:timeline
        {receipt} available={Boolean($localSaveSession.file)} working={comparing} errorMessage={compareError}
        onCompare={()=>refreshSave($localSaveSession.file,selected)}/>
    </div>
  {/if}
  <p class="note">現在は本島8バイオーム。セーブ座標図と原本地形図は別表示です。ゲームでのロード安全性は検証中です。</p>
</section>
<style>
  .world-workspace{padding:12px;min-width:0;display:grid;gap:8px}
  header{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
  h1{font-size:18px;margin:0}small,a,.note{font-size:12px;color:var(--wand-muted,#b9abc7)}
  nav{display:flex;flex-wrap:wrap;gap:5px}
  nav button{font:inherit;padding:6px 10px;color:inherit;background:var(--wand-panel,#292337);border:1px solid var(--wand-line,#66577c);border-radius:6px}
  nav button[aria-pressed=true]{border-color:var(--wand-accent,#d1b8ff)}
  .workspace-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:start}
  .terrain-side{min-width:0}.note{margin:0}
  @media(max-width:850px){.workspace-grid{grid-template-columns:minmax(0,1fr)}}
</style>
