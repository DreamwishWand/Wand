<script lang="ts">
  import {defaultWorldLayers} from '$lib/world/world-layer-state.ts';
  import WorldShortcutHelp from '$lib/world/WorldShortcutHelp.svelte';
  import {onMount,onDestroy} from 'svelte';
  import {base} from '$app/paths';
  import {localSaveSession} from '$lib/ui/local-save-session';
  import {watchWandLanguage,type WandLanguage} from '$lib/ui/preferences';
  import type {MainlandDesignFrame} from '$lib/world/mainland-design-frame.ts';
  import MainlandOverview from '$lib/world/MainlandOverview.svelte';
  import DecorationDesign from '$lib/world/DecorationDesign.svelte';
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
  let designMode=false,showSeparateTerrain=false,navigationOpen=true,overviewOpen=false;
  const overviewLabels={ja:'本島全体マップ',en:'Mainland map',fr:'Carte de la vallée',it:'Mappa della valle',de:'Karte des Tals','es-ES':'Mapa del valle','zh-CN':'主岛地图','pt-BR':'Mapa do vale'} as const;
  const editWorldLabels={ja:'本島全体編集',en:'Edit mainland',fr:'Modifier la vallée',it:'Modifica la valle',de:'Tal bearbeiten','es-ES':'Editar el valle','zh-CN':'编辑主岛','pt-BR':'Editar vale'} as const;
  let mainlandEditing=false,mainlandFrame:MainlandDesignFrame|null=null,mainlandRequest=0,mainlandError=false;
  function toggleMainland(){
    mainlandEditing=!mainlandEditing;overviewOpen=false;
    if(mainlandEditing&&!mainlandFrame&&worker&&!mainlandRequest){mainlandError=false;mainlandRequest=++request;worker.postMessage({command:'mainland-design-terrain',requestId:mainlandRequest});}
  }
  let layerState=defaultWorldLayers();
  function nextDesignRequest(){return ++request;}
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
    overviewOpen=false;mainlandEditing=false;key=next.key;worldScope=next.scope;showSeparateTerrain=false;raster=null;cell=null;loading=true;error='';
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
      if(mainlandRequest&&value.requestId===mainlandRequest){mainlandRequest=0;if(value.kind==='mainland-design-terrain'&&value.frame?.owners instanceof Uint8Array&&value.frame?.raster?.nativeFloorValues instanceof Uint32Array)mainlandFrame=value.frame;else mainlandError=true;return;}
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
  <div class="world-navigation"><button class="navigation-toggle" type="button" aria-label="ワールド選択" title="ワールド選択" aria-expanded={navigationOpen} on:click={()=>navigationOpen=!navigationOpen}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15"/></svg></button><nav aria-label="ワールド選択" hidden={!navigationOpen}>
    <div class="mode-switch"><button type="button" aria-pressed={!designMode} on:click={()=>designMode=false}>セーブ編集</button><button type="button" aria-pressed={designMode} on:click={()=>designMode=true}>装飾設計</button></div>
    <select aria-label="ワールド" value={worldScope} on:change={e=>chooseScope(e.currentTarget.value)}>
      {#each scopes as scope}<option value={scope}>{scopeNames[scope]??scope}</option>{/each}
    </select>
    {#if !(designMode&&mainlandEditing)}<select aria-label="エリア" value={key} on:change={e=>{const next=regionGrids.find(g=>g.key===e.currentTarget.value);if(next)openGrid(next);}}>
      {#each regionGrids as grid (grid.key)}<option value={grid.key}>{label(grid)}</option>{/each}
    </select>{/if}
    {#if designMode&&worldScope==='Village04'&&regionGrids.length===8}<button type="button" aria-pressed={mainlandEditing} on:click={toggleMainland}>{editWorldLabels[locale]}</button>{/if}
    {#if worldScope==='Village04'&&regionGrids.length===8}<button type="button" aria-pressed={overviewOpen} aria-label={overviewLabels[locale]} title={overviewLabels[locale]} on:click={()=>overviewOpen=!overviewOpen}>{overviewLabels[locale]}</button>{/if}
    {#if !designMode&&shapeMap&&!terrainDisplayed}<button type="button" aria-pressed={showSeparateTerrain} on:click={()=>showSeparateTerrain=!showSeparateTerrain}>{showSeparateTerrain?'配置図':'地形図'}</button>{/if}
  </nav></div>
  <WorldShortcutHelp {locale} {designMode}/>
  {#if loading}<p class="workspace-message" role="status">地形読み込み中…</p>{/if}
  {#if error}<p class="workspace-message" role="alert">{error}</p>{/if}
  {#if selected&&raster&&!designMode}
    <div class="workspace-grid" >
      {#if !shapeMap||!terrainDisplayed}<div class="terrain-side" class:inactiveMap={Boolean(shapeMap)&&!showSeparateTerrain}>
        <MediaMapGridOverlay initialSchematic compact
          selection={{platform:'Steam',gameVersion:'1.26.2',regionKey:selected.scope,viewKey:selected.key,layoutId:selected.layoutId,nativeGridId:selected.gridIdNative,gridDataPath:selected.gridDataPath,sizeX:selected.sizeX,sizeY:selected.sizeY}}
          {raster} canNavigate onNavigate={selectCell} onInspect={selectCell}/>
        <p class="note">原本地形・設置可否未確定。{cell?' ('+cell.x+', '+cell.y+')':''}</p>
      </div>{/if}
      <div class="save-side" class:inactiveMap={Boolean(shapeMap)&&!terrainDisplayed&&showSeparateTerrain} class:hasShape={Boolean(shapeMap)}><SavedGridSourceCandidates compact shapeMap={shapeMap} terrain={terrainBinding} file={$localSaveSession.file} bind:timeline bind:terrainDisplayed bind:layerState
        {receipt} available={Boolean($localSaveSession.file)} working={comparing} errorMessage={compareError}
        onCompare={()=>openSaveSession($localSaveSession.file,grids)}/></div>
    </div>
  {/if}
  {#if designMode&&mainlandEditing&&!mainlandFrame}<p class="workspace-message" role={mainlandError?'alert':'status'}>{mainlandError?(locale==='ja'?'本島の地形を読み込めませんでした。':'Unable to load mainland terrain.'):(locale==='ja'?'本島の地形読み込み中…':'Loading mainland terrain…')}</p>{/if}
  <DecorationDesign bind:layerState active={designMode&&!overviewOpen&&(!mainlandEditing||Boolean(mainlandFrame))} grid={selected} raster={mainlandEditing?mainlandFrame?.raster??null:raster} worldFrame={mainlandEditing?mainlandFrame:null} {worker} {locale} nextRequest={nextDesignRequest}/>

  {#if overviewOpen&&worldScope==='Village04'}<MainlandOverview grids={regionGrids} {worker} {locale} nextRequest={nextDesignRequest} label={k=>english[k]??k} onChoose={k=>{const g=regionGrids.find(g=>g.key===k);if(g)openGrid(g);}} onClose={()=>overviewOpen=false}/>{/if}
</section>
<style>
  .world-workspace{height:calc(100dvh - var(--shell-height,60px));min-height:0;min-width:0;padding:4px;display:flex;flex-direction:column;gap:4px;background:var(--wand-bg);color:var(--wand-text);overflow:hidden}
  nav{display:flex;align-items:center;gap:5px;flex:0 0 auto;min-width:0;overflow-x:auto;padding:2px}
  .mode-switch{display:flex;gap:4px;flex:none}
  nav button,nav select{font:inherit;font-size:13px;flex:none;min-height:34px;max-width:45vw;padding:5px 9px;color:inherit;background:var(--wand-menu);border:1px solid var(--wand-line);border-radius:6px}
  nav button[aria-pressed=true]{border-color:var(--wand-accent);background:var(--wand-header-hover);color:var(--wand-text)}
  nav button:focus-visible,nav select:focus-visible{outline:2px solid var(--wand-focus);outline-offset:1px}
  .workspace-grid{flex:1 1 auto;min-height:0;min-width:0;display:flex;flex-direction:column;gap:4px;overflow:hidden}
  .terrain-side{flex:1 1 auto;min-height:0;min-width:0;display:flex;flex-direction:column;gap:3px}
  .save-side{flex:0 1 auto;max-height:25%;overflow:auto;min-width:0;min-height:0}
  .save-side.hasShape{display:flex;flex:1 1 auto;max-height:none;overflow:hidden}
  .inactiveMap,.save-side.hasShape.inactiveMap{display:none}
  .note,p{font-size:11px;color:var(--wand-muted);margin:0}
  @media(max-width:700px){nav button,nav select{font-size:12px;padding:4px 6px}}
 .world-workspace{padding:0;gap:0;position:relative;isolation:isolate}
 .world-navigation{position:absolute;z-index:12;top:6px;left:6px;right:50px;display:flex;align-items:center;gap:5px;pointer-events:none}.world-navigation>*{pointer-events:auto}
 .navigation-toggle{display:grid;place-items:center;width:38px;height:38px;flex:none;background:var(--wand-menu);color:var(--wand-text);border:1px solid var(--wand-line);border-radius:6px}.navigation-toggle svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linejoin:round}.navigation-toggle:focus-visible{outline:2px solid var(--wand-focus)}
 nav{max-width:calc(100% - 43px);padding:3px;background:var(--wand-card);border:1px solid var(--wand-line);border-radius:6px}nav[hidden]{display:none}
 .workspace-message{position:absolute;z-index:13;top:52px;left:8px;padding:6px;background:var(--wand-card);border-radius:5px}
 .workspace-grid,.terrain-side{position:absolute;inset:0;gap:0}.terrain-side>.note{position:absolute;z-index:4;bottom:6px;left:6px;max-width:calc(100% - 65px);padding:5px 7px;border-radius:5px;background:var(--wand-card)}
 .save-side{position:absolute;z-index:5;left:6px;bottom:38px;max-width:calc(100% - 65px);padding:4px 7px;border-radius:5px;background:var(--wand-card)}
 .save-side.hasShape{z-index:1;inset:0;max-width:none;padding:0;border-radius:0;background:none}.inactiveMap,.save-side.hasShape.inactiveMap{display:none}
</style>
