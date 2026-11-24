<script lang="ts">
  import {onMount,onDestroy} from 'svelte';
  import {base} from '$app/paths';
  import {localSaveSession} from '$lib/ui/local-save-session';
  import {watchWandLanguage,type WandLanguage} from '$lib/ui/preferences';
  import MediaMapGridOverlay from '$lib/world/MediaMapGridOverlay.svelte';
  import SavedGridSourceCandidates from '$lib/world/SavedGridSourceCandidates.svelte';
  import {emptyWorldTimeline} from '$lib/world/saved-map-batch.ts';
  import type {TerrainBinding,TerrainScopeReceipt} from '$lib/world/terrain-binding.ts';
  import type {SavedShapeMap} from '$lib/world/saved-shape-map.ts';
  import type {PublicTerrainGrid} from '$lib/world/public-terrain-projection.ts';
  import type {SavedGridSourceCandidates as SaveReceipt} from '$lib/world/saved-grid-source-candidates.ts';
  type Grid=Omit<PublicTerrainGrid,'data'|'palette'|'counts'|'sha256'>&{scope:string};
  type Raster={sizeX:number;sizeY:number;nativeFloorValues:Uint32Array};
  let worker:Worker|null=null,compare:Worker|null=null;
  let request=0,indexRequest=0,terrainRequest=0,shapeRequest=0,compareRequest=0;
  let grids:Grid[]=[],key='Meadow',worldScope='Village04',raster:Raster|null=null;
  $: scopes=[...new Set(grids.map(g=>g.scope))];
  $: regionGrids=grids.filter(g=>g.scope===worldScope);
  let receipt:SaveReceipt|null=null,shapeMap:SavedShapeMap|null=null,timeline=emptyWorldTimeline();
  let sessions:TerrainScopeReceipt[]=[];
  let boundOrdinals:readonly number[]=[];
  let sourceFile:File|null=null;
  let terrainBinding:TerrainBinding|null=null;
  let terrainDisplayed=false;
  $: terrainBinding=selected&&raster&&boundOrdinals.length?{raster,factor:selected.factor,verifiedGridOrdinals:boundOrdinals}:null;
  let loading=true,comparing=false,error='',compareError='',locale:WandLanguage='ja';
  let cell:{x:number;y:number;value:number}|null=null;
  let seenRevision=-1;
  $: selected=grids.find(g=>g.key===key)??null;
  $: if($localSaveSession.revision!==seenRevision){
    seenRevision=$localSaveSession.revision;
    timeline=emptyWorldTimeline();openSaveSession($localSaveSession.file,grids);
  }
  const english:Record<string,string>={Beach:'Dazzle Beach',Cliff:'Frosted Heights',DarkMountains:'Forgotten Lands',Forest:'Forest of Valor',Meadow:'Peaceful Meadow',Savannah:'Sunlit Plateau',Urban:'Plaza',Wetland:'Glade of Trust'};
  // English display names are UI labels; original path identity is separate.
  function label(g:Grid){
    if(english[g.key])return english[g.key];
    const native=g.layoutId.split('/').at(-1)?.replace(/\.json$/,'').replace(/Grids$/,'')??g.key;
    const area=native.includes('-')?native.slice(native.indexOf('-')+1):native.replace(/Layout$/,'');
    return area+' · '+(g.gridIdNative+1);
  }
  const scopeNames:Record<string,string>={Village04:'Dreamlight Valley',VillageExpansion01:'Eternity Isle',VillageExpansion02:'Storybook Vale',VillageExpansion03:'Wishblossom Ranch',VillageExpansion04:'Expansion 4',VillageExpansion04UnderwaterAreas:'Underwater areas',VillageWinnieDLC:'Honeywood',FloatingIslands:'Floating Islands'};
  function chooseScope(value:string){worldScope=value;const first=grids.find(g=>g.scope===value);if(first)openGrid(first);}
  function clearCompare(){terrainDisplayed=false;compare?.terminate();compare=null;compareRequest++;shapeRequest=-1;receipt=null;shapeMap=null;boundOrdinals=[];sessions=[];comparing=false;compareError='';}
  function selectSaveGrid(grid:Grid|null){
    terrainDisplayed=false;shapeRequest=-1;receipt=null;shapeMap=null;boundOrdinals=[];compareError='';
    if(!grid||!sourceFile){comparing=false;return;}
    if(compare){comparing=true;return;}
    const scoped=sessions.find(s=>s.receipt.viewKey===grid.key);
    if(!scoped){comparing=false;return;}
    receipt=scoped.receipt;boundOrdinals=scoped.verifiedGridOrdinals;
    if(receipt.points.length&&worker){comparing=true;shapeRequest=++request;
      worker.postMessage({command:'shapes',requestId:shapeRequest,key:grid.key,points:receipt.points});}
    else comparing=false;
  }
  function openSaveSession(file:File|null,all:Grid[]){
    clearCompare();sourceFile=file;
    if(!file||!all.length)return;
    comparing=true;const req=++request;compareRequest=req;
    const own=new Worker(new URL('../../lib/world/world-terrain-session.worker.ts',import.meta.url),{type:'module'});
    compare=own;
    own.onmessage=e=>{
      if(compare!==own||compareRequest!==req)return;
      own.terminate();compare=null;
      if(e.data?.kind!=='terrain-session'||e.data.requestId!==req||!Array.isArray(e.data.results)){
        comparing=false;compareError='セーブの配置を取得できませんでした。';return;}
      sessions=e.data.results;selectSaveGrid(grids.find(g=>g.key===key)??null);
    };
    own.onerror=()=>{if(compare===own){clearCompare();compareError='セーブを読み込めませんでした。';}};
    own.postMessage({command:'terrain-session',requestId:req,file,filename:file.name,scopes:all.map(grid=>({viewKey:grid.key,nativeGridId:grid.gridIdNative,
      sourceRefs:[{layoutId:grid.layoutId,gridDataPath:grid.gridDataPath,nativeGridId:grid.gridIdNative,nativeSizeX:grid.sizeX,nativeSizeY:grid.sizeY,tessellationFactor:grid.factor}]}))});
  }
  function openGrid(next:Grid){
    key=next.key;worldScope=next.scope;raster=null;cell=null;loading=true;error='';
    terrainRequest=++request;
    worker?.postMessage({command:'terrain',requestId:terrainRequest,key:next.key});
    selectSaveGrid(next);
  }
  onMount(()=>{
    const unwatch=watchWandLanguage(v=>locale=v);
    worker=new Worker(new URL('../../lib/world/public-world-terrain.worker.ts',import.meta.url),{type:'module'});
    worker.onmessage=e=>{
      const value=e.data;
      if(value.requestId===indexRequest&&value.kind==='index'){
        grids=value.grids;
        const first=grids.find(g=>g.key===key)??grids[0];
        openSaveSession($localSaveSession.file,grids);if(first)openGrid(first);return;
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
    <select aria-label="ワールド" value={worldScope} on:change={e=>chooseScope(e.currentTarget.value)}>
      {#each scopes as scope}<option value={scope}>{scopeNames[scope]??scope}</option>{/each}
    </select>
    {#each regionGrids as grid (grid.key)}
      <button type="button" aria-pressed={key===grid.key} on:click={()=>openGrid(grid)}>{label(grid)}</button>
    {/each}
  </nav>
  {#if loading}<p role="status">地形読み込み中…</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  {#if selected&&raster}
    <div class="workspace-grid">
      {#if !shapeMap||!terrainDisplayed}<div class="terrain-side">
        <MediaMapGridOverlay initialSchematic compact
          selection={{platform:'Steam',gameVersion:'1.26.2',regionKey:selected.scope,viewKey:selected.key,layoutId:selected.layoutId,nativeGridId:selected.gridIdNative,gridDataPath:selected.gridDataPath,sizeX:selected.sizeX,sizeY:selected.sizeY}}
          {raster} canNavigate onNavigate={selectCell} onInspect={selectCell}/>
        <p class="note">原本地形・各マスの属性。設置可否は未確定。{cell?' ('+cell.x+', '+cell.y+')':''}</p>
      </div>{/if}
      <SavedGridSourceCandidates compact shapeMap={shapeMap} terrain={terrainBinding} file={$localSaveSession.file} bind:timeline bind:terrainDisplayed
        {receipt} available={Boolean($localSaveSession.file)} working={comparing} errorMessage={compareError}
        onCompare={()=>openSaveSession($localSaveSession.file,grids)}/>
    </div>
  {/if}
  <p class="note">地形対応が確認できないGridは別図で表示します。</p>
</section>
<style>
  .world-workspace{padding:12px;min-width:0;display:grid;gap:8px}
  header{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
  h1{font-size:18px;margin:0}small,a,.note{font-size:12px;color:var(--wand-muted,#b9abc7)}
  nav{display:flex;flex-wrap:wrap;gap:5px}
  nav button,nav select{font:inherit;padding:6px 10px;color:inherit;background:var(--wand-menu);border:1px solid var(--wand-line);border-radius:6px}
  nav button[aria-pressed=true]{border-color:var(--wand-accent);background:var(--wand-header-hover);color:var(--wand-text);box-shadow:inset 0 0 0 1px var(--wand-accent)}
  nav button:not([aria-pressed=true]):hover{background:var(--wand-header-hover)}
  nav button:focus-visible,nav select:focus-visible{outline:2px solid var(--wand-focus);outline-offset:2px}
  .workspace-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-items:start}
  .terrain-side{min-width:0}.note{margin:0}
  @media(max-width:850px){.workspace-grid{grid-template-columns:minmax(0,1fr)}}
</style>
