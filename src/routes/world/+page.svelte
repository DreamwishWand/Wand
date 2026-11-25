<script lang="ts">
  import {defaultWorldLayers} from '$lib/world/world-layer-state.ts';
  import WorldShortcutHelp from '$lib/world/WorldShortcutHelp.svelte';
  import {onMount,onDestroy} from 'svelte';
  import {beforeNavigate} from '$app/navigation';
  import {base} from '$app/paths';
  import WorldCheckpointControls from '$lib/world/WorldCheckpointControls.svelte';
  import {checkpointWords} from '$lib/world/world-checkpoint-words.ts';
  import {localSaveSession,registerLocalSaveChangeGuard} from '$lib/ui/local-save-session';
  import WorldSaveExport from '$lib/world/WorldSaveExport.svelte';
  import {saveDraftIdentity,makeSaveSessionDraft,parseSaveSessionDraft,readSaveDraft,writeSaveDraft,discardSaveDraft,type SaveDraftIdentity,type SaveSessionDraft} from '$lib/world/save-session-draft.ts';
  import {watchWandLanguage,type WandLanguage} from '$lib/ui/preferences';
  import {bindMainland} from '$lib/world/mainland-world-coordinates.ts';
  import type {MainlandDesignFrame} from '$lib/world/mainland-design-frame.ts';
  import MainlandOverview from '$lib/world/MainlandOverview.svelte';
  import IndoorRoomView from '$lib/world/IndoorRoomView.svelte';
  import {indoorWords} from '$lib/world/indoor-room-view.ts';
  let indoorOpen=false;
  $: indoorText=indoorWords[locale]??indoorWords.en;
  $: if(!sourceFile||designMode)indoorOpen=false;
  import type {SaveDesignCapture} from '$lib/world/save-design-capture.ts';
  let capturedLayout:SaveDesignCapture|null=null;
  function captureLayout(capture:SaveDesignCapture){if(capture.scope!==worldScope)return;capturedLayout=capture;setDesignMode(true);}
  import DecorationDesign from '$lib/world/DecorationDesign.svelte';
  import MediaMapGridOverlay from '$lib/world/MediaMapGridOverlay.svelte';
  import SavedGridSourceCandidates from '$lib/world/SavedGridSourceCandidates.svelte';
  import {emptyWorldTimeline,currentWorldEdits,type WorldEditTimeline} from '$lib/world/saved-map-batch.ts';
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
  let worldFrames=new Map<string,MainlandDesignFrame>(),requestedWorld='';
  $: mainlandFrame=worldFrames.get(worldScope)??null;
  $: worldReady=Boolean(bindMainland(regionGrids));
  const worldMapLabels={ja:'ワールド全体マップ',en:'World map',fr:'Carte du monde',it:'Mappa del mondo',de:'Weltkarte','es-ES':'Mapa del mundo','zh-CN':'世界地图','pt-BR':'Mapa do mundo'} as const;
  const worldEditLabels={ja:'ワールド全体編集',en:'Edit world',fr:'Modifier le monde',it:'Modifica mondo',de:'Welt bearbeiten','es-ES':'Editar mundo','zh-CN':'编辑世界','pt-BR':'Editar mundo'} as const;
  $: overviewLabel=worldScope==='Village04'?overviewLabels[locale]:worldMapLabels[locale];
  $: editWorldLabel=worldScope==='Village04'?editWorldLabels[locale]:worldEditLabels[locale];
  function openWorldDesign(scope:string,areas:readonly Grid[]){
    if(!bindMainland(areas))return;
    mainlandEditing=true;overviewOpen=false;
    if(!worldFrames.has(scope)&&worker&&(!mainlandRequest||requestedWorld!==scope)){mainlandError=false;mainlandRequest=++request;requestedWorld=scope;worker.postMessage({command:'mainland-design-terrain',requestId:mainlandRequest,scope});}
  }
  function toggleMainland(){if(mainlandEditing){mainlandEditing=false;overviewOpen=false;}else openWorldDesign(worldScope,regionGrids);}
  function setDesignMode(next:boolean){
    if(next===designMode)return;
    designMode=next;overviewOpen=false;
    if(next)openWorldDesign(worldScope,regionGrids);else{mainlandEditing=false;overviewOpen=Boolean(sourceFile&&bindMainland(regionGrids));}
  }
  let layerState=defaultWorldLayers();
  function nextDesignRequest(){return ++request;}
  let request=0,indexRequest=0,terrainRequest=0,shapeRequest=0,compareRequest=0;
  let grids:Grid[]=[],key='Meadow',worldScope='Village04',raster:Raster|null=null;
  $: scopes=[...new Set(grids.map(g=>g.scope))];
  $: regionGrids=grids.filter(g=>g.scope===worldScope);
  let receipt:SaveReceipt|null=null,shapeMap:SavedShapeMap|null=null,timeline=emptyWorldTimeline();
  let sessions:TerrainScopeReceipt[]=[];
  let mainlandSaveMaps=new Map<string,SavedShapeMap>(),mainlandShapeRequests=new Map<number,string>(),mainlandSaveRequested:TerrainScopeReceipt[]|null=null,mainlandSaveFailed=false;
  let focusOrdinal:number|null=null;
  let mainlandSaveScope='';
  function loadMainlandSave(all:TerrainScopeReceipt[],w:Worker,regions:Grid[]){
    mainlandSaveRequested=all;mainlandSaveScope=regions[0]?.scope??'';mainlandSaveMaps=new Map();mainlandShapeRequests=new Map();mainlandSaveFailed=false;
    for(const g of regions){const s=all.find(v=>v.receipt.viewKey===g.key);if(!s?.receipt.points.length)continue;const id=++request;mainlandShapeRequests.set(id,g.key);w.postMessage({command:'shapes',requestId:id,key:g.key,points:s.receipt.points});}
    mainlandShapeRequests=new Map(mainlandShapeRequests);
  }
  $: if(overviewOpen&&!designMode&&worldReady&&worker&&(sessions!==mainlandSaveRequested||mainlandSaveScope!==worldScope))loadMainlandSave(sessions,worker,regionGrids);
  let boundOrdinals:readonly number[]=[];
  let sourceFile:File|null=null;
  let terrainBinding:TerrainBinding|null=null;
  let terrainDisplayed=false;
  $: terrainBinding=selected&&raster&&boundOrdinals.length?{raster,factor:selected.factor,verifiedGridOrdinals:boundOrdinals}:null;
  let loading=true,comparing=false,error='',compareError='',locale:WandLanguage='ja';
  let cell:{x:number;y:number;value:number}|null=null;
  let seenRevision=-1;
  type SaveRecovery={phase:'idle'|'loading'|'offer'|'ready';identity:SaveDraftIdentity|null;revision:string|null;draft?:SaveSessionDraft;warning?:'invalid'|'unavailable'|'conflict';writable:boolean};
  let recovery:SaveRecovery={phase:'idle',identity:null,revision:null,writable:false};
  let baseline:WorldEditTimeline=timeline,recoveryEpoch=0,pendingWrites=0,writeFailed=false,writeTail=Promise.resolve();
  const recoveryWords={
   ja:['セーブ編集の下書きがあります','作業を再開','下書きを破棄','下書きを確認中…','自動保存できません。変更を出力してから原本を切り替えてください。','現在の原本・データで下書きを復元できません。','別のタブで下書きが変更されました。','自動保存せずに続ける','保存されていない編集があります。原本を切り替えますか？','保存した編集下書きを破棄しますか？'],
   en:['A Save edit draft is available','Resume draft','Discard draft','Checking draft…','Autosave unavailable. Export changes before switching the original.','The draft is incompatible with the current original or data.','Another tab changed the draft.','Continue without autosave','There are unsaved edits. Switch the original?','Discard the saved editing draft?'],
   fr:['Un brouillon de sauvegarde est disponible','Reprendre','Supprimer le brouillon','Vérification du brouillon…','Sauvegarde automatique indisponible. Exportez les modifications.','Brouillon incompatible avec les données actuelles.','Un autre onglet a modifié le brouillon.','Continuer sans sauvegarde automatique','Des modifications ne sont pas sauvegardées. Changer de fichier ?','Supprimer le brouillon ?'],
   it:['È disponibile una bozza del salvataggio','Riprendi','Elimina bozza','Verifica bozza…','Salvataggio automatico non disponibile. Esporta le modifiche.','Bozza incompatibile con i dati attuali.','Un’altra scheda ha modificato la bozza.','Continua senza salvataggio automatico','Modifiche non salvate. Cambiare file?','Eliminare la bozza?'],
   de:['Ein Spielstandentwurf ist verfügbar','Fortsetzen','Entwurf verwerfen','Entwurf wird geprüft…','Automatisches Speichern nicht verfügbar. Änderungen exportieren.','Entwurf ist mit den aktuellen Daten inkompatibel.','Ein anderer Tab hat den Entwurf geändert.','Ohne automatisches Speichern fortfahren','Ungespeicherte Änderungen. Datei wechseln?','Entwurf verwerfen?'],
   'es-ES':['Hay un borrador de partida','Reanudar','Descartar borrador','Comprobando borrador…','Guardado automático no disponible. Exporta los cambios.','Borrador incompatible con los datos actuales.','Otra pestaña cambió el borrador.','Continuar sin guardado automático','Hay cambios sin guardar. ¿Cambiar de archivo?','¿Descartar el borrador?'],
   'zh-CN':['有存档编辑草稿','继续编辑','丢弃草稿','正在检查草稿…','无法自动保存，请先导出更改。','草稿与当前原始存档或数据不兼容。','其他标签页已修改草稿。','不自动保存，继续编辑','有未保存的更改，是否切换存档？','丢弃编辑草稿？'],
   'pt-BR':['Há um rascunho de edição','Continuar','Descartar rascunho','Verificando rascunho…','Salvamento automático indisponível. Exporte as alterações.','Rascunho incompatível com os dados atuais.','Outra aba alterou o rascunho.','Continuar sem salvamento automático','Há alterações não salvas. Trocar o arquivo?','Descartar o rascunho?']
  } as const;
  $: recoveryText=recoveryWords[locale]??recoveryWords.en;
  $: recoveryBlocked=Boolean(sourceFile)&&recovery.phase!=='ready';
  $: persistCommitted(timeline,recovery,sourceFile,key,overviewOpen);
  function resetRecovery(file:File|null,keepIndoor=false){
   if(!keepIndoor)indoorOpen=false;
   capturedLayout=null;
   recoveryEpoch++;baseline=timeline=emptyWorldTimeline();pendingWrites=0;writeFailed=false;writeChain={revision:null,blocked:false};
   recovery={phase:file?'loading':'idle',identity:null,revision:null,writable:false};
  }
  async function inspectRecovery(identity:SaveDraftIdentity,all:TerrainScopeReceipt[],file:File){
   const epoch=recoveryEpoch;
   try{
    await writeTail;
    const stored=await readSaveDraft(identity);
    if(epoch!==recoveryEpoch||file!==sourceFile)return;
    if(!stored){writeChain={revision:null,blocked:false};recovery={phase:'ready',identity,revision:null,writable:true};return;}
    const revision=typeof stored.revision==='string'?stored.revision:null;
    try{
     const draft=parseSaveSessionDraft(stored.draft,identity,all);
     if(!draft.timeline.snapshots.some(s=>s.edits.length)){writeChain={revision,blocked:false};recovery={phase:'ready',identity,revision,writable:true};}
     else recovery={phase:'offer',identity,revision,draft,writable:false};
    }
    catch{recovery={phase:'offer',identity,revision,warning:'invalid',writable:false};}
   }catch{if(epoch===recoveryEpoch&&file===sourceFile)recovery={phase:'ready',identity,revision:null,warning:'unavailable',writable:false};}
  }
  function resumeSaveDraft(){
   const state=recovery;if(state.phase!=='offer'||!state.draft)return;
   const draft=state.draft,grid=grids.find(g=>g.key===draft.context.area);
   baseline=timeline=draft.timeline;writeChain={revision:state.revision,blocked:false};
   if(grid){openGrid(grid);overviewOpen=draft.context.overview&&Boolean(bindMainland(grids.filter(g=>g.scope===grid.scope)));}
   recovery={phase:'ready',identity:state.identity,revision:state.revision,writable:true};
  }
  async function discardRecovery(){
   const state=recovery,epoch=recoveryEpoch;if(state.phase!=='offer'||!state.identity||!window.confirm(recoveryText[9]))return;
   recovery={...state,phase:'loading'};
   try{await discardSaveDraft(state.identity,state.revision);if(epoch===recoveryEpoch){writeChain={revision:null,blocked:false};recovery={phase:'ready',identity:state.identity,revision:null,writable:true};}}
   catch{if(epoch===recoveryEpoch)recovery={...state,warning:'conflict'};}
  }
  function continueWithoutSaveRecovery(){recovery={...recovery,phase:'ready',writable:false,warning:recovery.warning==='conflict'?'conflict':'unavailable'};}
  function persistCommitted(next:WorldEditTimeline,state:SaveRecovery,file:File|null,area:string,overview:boolean){
   if(next===baseline||!file||state.phase!=='ready')return;
   baseline=next;
   if(!state.identity||!state.writable){writeFailed=true;return;}
   const id=state.identity,epoch=recoveryEpoch,draft=makeSaveSessionDraft(id,next,{area,overview});
   pendingWrites++;
   // Capture the original session so a queued write survives a route/file
   // change. Revisions for this epoch are carried by the queued chain.
   const old=writeTail,chain=writeChain;
   writeTail=old.then(async()=>{
    if(chain.blocked)return;
    try{chain.revision=await writeSaveDraft(id,chain.revision,draft);}
    catch(e){chain.blocked=true;if(epoch===recoveryEpoch){writeFailed=true;recovery={...recovery,writable:false,warning:e instanceof Error&&e.message==='DRAFT_CONFLICT'?'conflict':'unavailable'};}}
   }).finally(()=>{if(epoch===recoveryEpoch)pendingWrites--;});
  }
  let writeChain:{revision:string|null;blocked:boolean}={revision:null,blocked:false};
  function guardExternalSaveChange(){return (!$localSaveSession.worldCheckpoint||window.confirm(checkpointWords[locale][5]))&&guardSaveChange();}
  function guardSaveChange(){
   return !timeline.snapshots.some(s=>s.edits.length)||!writeFailed&&!pendingWrites&&recovery.writable||window.confirm(recoveryText[8]);
  }
  beforeNavigate(({willUnload,cancel})=>{if(!willUnload&&!guardSaveChange())cancel();});
  function guardUnload(e:BeforeUnloadEvent){if($localSaveSession.worldCheckpoint||timeline.snapshots.some(s=>s.edits.length)&&(pendingWrites||writeFailed||!recovery.writable)){e.preventDefault();e.returnValue='';}}

  $: selected=grids.find(g=>g.key===key)??null;
  $: if($localSaveSession.revision!==seenRevision){
    seenRevision=$localSaveSession.revision;
    resetRecovery($localSaveSession.file,Boolean($localSaveSession.worldCheckpoint));if($localSaveSession.worldCheckpoint)recovery={phase:'ready',identity:null,revision:null,writable:false};openSaveSession($localSaveSession.file,grids);if(!designMode)overviewOpen=Boolean($localSaveSession.file&&bindMainland(grids.filter(g=>g.scope===worldScope)));
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
  function chooseScope(value:string){worldScope=value;const areas=grids.filter(g=>g.scope===value),first=areas[0];if(first){openGrid(first);if(designMode)openWorldDesign(value,areas);else if(sourceFile&&bindMainland(areas))overviewOpen=true;}}
  function clearCompare(){mainlandSaveRequested=null;mainlandSaveMaps=new Map();mainlandShapeRequests=new Map();mainlandSaveFailed=false;focusOrdinal=null;terrainDisplayed=false;compare?.terminate();compare=null;compareRequest++;shapeRequest=-1;receipt=null;shapeMap=null;boundOrdinals=[];sessions=[];comparing=false;compareError='';}
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
        comparing=false;compareError='セーブの配置を取得できませんでした。';if(recovery.phase==='loading')continueWithoutSaveRecovery();return;}
      sessions=e.data.results;selectSaveGrid(grids.find(g=>g.key===key)??null);
      if(recovery.phase==='loading'&&!recovery.identity){const identity=saveDraftIdentity(e.data.fingerprint,e.data.format);if(identity)void inspectRecovery(identity,sessions,file);else continueWithoutSaveRecovery();}
    };
    own.onerror=()=>{if(compare===own){clearCompare();compareError='セーブを読み込めませんでした。';if(recovery.phase==='loading')continueWithoutSaveRecovery();}};
    own.postMessage({command:'terrain-session',requestId:req,file,filename:file.name,scopes:all.map(grid=>({viewKey:grid.key,nativeGridId:grid.gridIdNative,
      sourceRefs:[{layoutId:grid.layoutId,gridDataPath:grid.gridDataPath,nativeGridId:grid.gridIdNative,nativeSizeX:grid.sizeX,nativeSizeY:grid.sizeY,tessellationFactor:grid.factor}]}))});
  }
  function openGrid(next:Grid){
    overviewOpen=false;mainlandEditing=false;focusOrdinal=null;key=next.key;worldScope=next.scope;showSeparateTerrain=false;raster=null;cell=null;loading=true;error='';
    terrainRequest=++request;
    worker?.postMessage({command:'terrain',requestId:terrainRequest,key:next.key});
    selectSaveGrid(next);
  }
  onMount(()=>{
    const unwatch=watchWandLanguage(v=>locale=v);
    const unguard=registerLocalSaveChangeGuard(guardExternalSaveChange);window.addEventListener('beforeunload',guardUnload);
    worker=new Worker(new URL('../../lib/world/public-world-terrain.worker.ts',import.meta.url),{type:'module'});
    worker.onmessage=e=>{
      const value=e.data;
      if(value.requestId===indexRequest&&value.kind==='index'){
        grids=value.grids;
        const first=grids.find(g=>g.key===key)??grids[0];
        openSaveSession($localSaveSession.file,grids);if(first){openGrid(first);const areas=grids.filter(g=>g.scope===first.scope);if(designMode)openWorldDesign(first.scope,areas);else overviewOpen=Boolean(sourceFile&&bindMainland(areas));}return;
      }
      if(mainlandRequest&&value.requestId===mainlandRequest){mainlandRequest=0;if(value.kind==='mainland-design-terrain'&&value.worldScope===requestedWorld&&value.frame?.scope===requestedWorld&&value.frame?.owners instanceof Uint8Array&&value.frame?.raster?.nativeFloorValues instanceof Uint32Array)worldFrames=new Map(worldFrames).set(requestedWorld,value.frame);else if(requestedWorld===worldScope)mainlandError=true;return;}
      if(value.requestId===terrainRequest&&value.kind==='terrain'&&value.key===key){
        raster={sizeX:value.sizeX,sizeY:value.sizeY,nativeFloorValues:value.nativeFloorValues};loading=false;return;
      }
      const mainlandKey=mainlandShapeRequests.get(value.requestId);
      if(mainlandKey){mainlandShapeRequests.delete(value.requestId);mainlandShapeRequests=new Map(mainlandShapeRequests);if(value.kind==='shapes'&&value.key===mainlandKey&&value.result)mainlandSaveMaps=new Map(mainlandSaveMaps).set(mainlandKey,value.result);else mainlandSaveFailed=true;return;}
      if(value.requestId===shapeRequest&&value.kind==='shapes'&&value.key===key){shapeMap=value.result;comparing=false;return;}
      if(value.kind==='error'){
        if(value.requestId===indexRequest||value.requestId===terrainRequest){loading=false;error='地形データを読み込めませんでした。';}
        if(value.requestId===shapeRequest){comparing=false;compareError='アイテム形状DBを読み込めませんでした。';}
      }
    };
    worker.onerror=()=>{if(mainlandRequest){mainlandRequest=0;mainlandError=true;}loading=false;comparing=false;error='ワールド処理を開始できませんでした。';};
    indexRequest=++request;worker.postMessage({command:'open',requestId:indexRequest,base});
    return ()=>{unwatch();unguard();window.removeEventListener('beforeunload',guardUnload);};
  });
  onDestroy(()=>{worker?.terminate();compare?.terminate();worker=null;compare=null;});
  function selectCell(x:number,y:number){
    if(raster)cell={x,y,value:raster.nativeFloorValues[y*raster.sizeX+x]};
  }
</script>
<svelte:head><title>World Editor · Dreamwish Wand</title></svelte:head>
<section class="world-workspace">
  <div class="world-navigation" class:overview-navigation-hidden={overviewOpen&&worldReady&&(designMode||!recoveryBlocked)}><button class="navigation-toggle" type="button" aria-label="ワールド選択" title="ワールド選択" aria-expanded={navigationOpen} on:click={()=>navigationOpen=!navigationOpen}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15"/></svg></button><nav aria-label="ワールド選択" hidden={!navigationOpen}>
    <div class="mode-switch"><button type="button" aria-pressed={!designMode} on:click={()=>setDesignMode(false)}>セーブ編集</button><button type="button" aria-pressed={designMode} on:click={()=>setDesignMode(true)}>装飾設計</button></div>
    <select aria-label="ワールド" value={worldScope} on:change={e=>chooseScope(e.currentTarget.value)}>
      {#each scopes as scope}<option value={scope}>{scopeNames[scope]??scope}</option>{/each}
    </select>
    {#if !(designMode&&mainlandEditing)}<select aria-label="エリア" value={key} on:change={e=>{const next=regionGrids.find(g=>g.key===e.currentTarget.value);if(next)openGrid(next);}}>
      {#each regionGrids as grid (grid.key)}<option value={grid.key}>{label(grid)}</option>{/each}
    </select>{/if}
    {#if designMode&&worldReady}<button type="button" aria-pressed={mainlandEditing} on:click={toggleMainland}>{editWorldLabel}</button>{/if}
    {#if !designMode&&sourceFile}<button type="button" on:click={()=>indoorOpen=true}>{indoorText[0]}</button>{/if}
    {#if worldReady}<button type="button" aria-pressed={overviewOpen} aria-label={overviewLabel} title={overviewLabel} on:click={()=>overviewOpen=!overviewOpen}>{overviewLabel}</button>{/if}
    {#if !designMode&&shapeMap&&!terrainDisplayed}<button type="button" aria-pressed={showSeparateTerrain} on:click={()=>showSeparateTerrain=!showSeparateTerrain}>{showSeparateTerrain?'配置図':'地形図'}</button>{/if}
  </nav></div>
  <WorldShortcutHelp {locale} {designMode} worldOverview={overviewOpen}/>
  {#if !designMode&&recoveryBlocked}<div class="save-recovery" role="status">{#if recovery.phase==='offer'}<strong>{recovery.warning==='invalid'?recoveryText[5]:recovery.warning==='conflict'?recoveryText[6]:recoveryText[0]}</strong><div>{#if recovery.draft}<button type="button" on:click={resumeSaveDraft}>{recoveryText[1]}</button>{/if}<button type="button" on:click={discardRecovery}>{recoveryText[2]}</button>{#if recovery.warning}<button type="button" on:click={continueWithoutSaveRecovery}>{recoveryText[7]}</button>{/if}</div>{:else}{recoveryText[3]}{/if}</div>{:else if !designMode&&sourceFile&&recovery.warning}<p class="save-recovery" role="alert">{recovery.warning==='conflict'?recoveryText[6]:recoveryText[4]}</p>{/if}
  {#if !designMode&&sourceFile&&$localSaveSession.worldCheckpoint}<div class="world-checkpoints"><WorldCheckpointControls file={sourceFile} history={$localSaveSession.worldCheckpoint} {locale} blocked={comparing||recoveryBlocked||currentWorldEdits(timeline).length>0}/></div>{/if}
  {#if !designMode&&(overviewOpen||!shapeMap)&&!recoveryBlocked&&sourceFile&&currentWorldEdits(timeline).length}<div class="world-export"><WorldSaveExport file={sourceFile} {timeline} {locale}/></div>{/if}
  {#if loading}<p class="workspace-message" role="status">地形読み込み中…</p>{/if}
  {#if error}<p class="workspace-message" role="alert">{error}</p>{/if}
  {#if selected&&raster&&!designMode&&!recoveryBlocked}
    <div class="workspace-grid" class:overview-covered={overviewOpen}>
      {#if !shapeMap||!terrainDisplayed}<div class="terrain-side" class:inactiveMap={Boolean(shapeMap)&&!showSeparateTerrain}>
        <MediaMapGridOverlay initialSchematic compact
          selection={{platform:'Steam',gameVersion:'1.26.2',regionKey:selected.scope,viewKey:selected.key,layoutId:selected.layoutId,nativeGridId:selected.gridIdNative,gridDataPath:selected.gridDataPath,sizeX:selected.sizeX,sizeY:selected.sizeY}}
          {raster} canNavigate onNavigate={selectCell} onInspect={selectCell}/>
        <p class="note">原本地形・設置可否未確定。{cell?' ('+cell.x+', '+cell.y+')':''}</p>
      </div>{/if}
      <div class="save-side" class:inactiveMap={Boolean(shapeMap)&&!terrainDisplayed&&showSeparateTerrain} class:hasShape={Boolean(shapeMap)}><SavedGridSourceCandidates compact {focusOrdinal} shapeMap={shapeMap} terrain={terrainBinding} file={$localSaveSession.file} bind:timeline bind:terrainDisplayed bind:layerState
        {receipt} available={Boolean($localSaveSession.file)} working={comparing} errorMessage={compareError}
        onCompare={()=>openSaveSession($localSaveSession.file,grids)}/></div>
    </div>
  {/if}
  {#if designMode&&mainlandEditing&&!mainlandFrame}<p class="workspace-message" role={mainlandError?'alert':'status'}>{mainlandError?(locale==='ja'?'ワールドの地形を読み込めませんでした。':'Unable to load world terrain.'):(locale==='ja'?'ワールドの地形読み込み中…':'Loading world terrain…')}</p>{/if}
  <DecorationDesign bind:layerState {capturedLayout} onDismissCapture={()=>capturedLayout=null} active={designMode&&!overviewOpen&&(!mainlandEditing||Boolean(mainlandFrame))} grid={selected} raster={mainlandEditing?mainlandFrame?.raster??null:raster} worldFrame={mainlandEditing?mainlandFrame:null} areaLabel={k=>{const g=grids.find(g=>g.key===k);return g?label(g):k;}} {worker} {locale} nextRequest={nextDesignRequest}/>

  {#if overviewOpen&&worldReady&&(designMode||!recoveryBlocked)}{#key worldScope}<MainlandOverview title={overviewLabel} worldKey={worldScope} worldOptions={scopes.map(scope=>({key:scope,label:scopeNames[scope]??scope}))} onWorldChange={chooseScope} onDesign={()=>setDesignMode(true)} onCapture={captureLayout} onIndoor={()=>indoorOpen=true} grids={regionGrids} {worker} {locale} nextRequest={nextDesignRequest} label={k=>{const g=grids.find(g=>g.key===k);return g?label(g):k;}} saveMode={!designMode&&Boolean(sourceFile)} {sessions} saveMaps={mainlandSaveMaps} saveLoading={comparing||mainlandShapeRequests.size>0} saveFailed={mainlandSaveFailed} bind:timeline bind:layerState onChoose={(k,id)=>{const g=regionGrids.find(g=>g.key===k);if(g){openGrid(g);focusOrdinal=id??null;}}} onClose={()=>overviewOpen=false}/>{/key}{/if}
  {#if indoorOpen&&sourceFile}<IndoorRoomView file={sourceFile} {locale} terrainWorker={worker} nextRequest={nextDesignRequest} blocked={currentWorldEdits(timeline).length>0} onClose={()=>indoorOpen=false}/>{/if}
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
 .world-navigation.overview-navigation-hidden{display:none}
 .world-navigation{position:absolute;z-index:12;top:6px;left:6px;right:50px;display:flex;align-items:center;gap:5px;pointer-events:none}.world-navigation>*{pointer-events:auto}
 .navigation-toggle{display:grid;place-items:center;width:38px;height:38px;flex:none;background:var(--wand-menu);color:var(--wand-text);border:1px solid var(--wand-line);border-radius:6px}.navigation-toggle svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linejoin:round}.navigation-toggle:focus-visible{outline:2px solid var(--wand-focus)}
 nav{max-width:calc(100% - 43px);padding:3px;background:var(--wand-card);border:1px solid var(--wand-line);border-radius:6px}nav[hidden]{display:none}
 .workspace-message{position:absolute;z-index:13;top:52px;left:8px;padding:6px;background:var(--wand-card);border-radius:5px}
 .save-recovery{position:absolute;z-index:16;top:54px;left:6px;right:6px;max-width:430px;padding:8px;background:var(--wand-card);border:1px solid var(--wand-line);border-radius:6px;font-size:12px}.save-recovery div{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}.save-recovery button{font:inherit;color:inherit;background:var(--wand-menu);border:1px solid var(--wand-line);border-radius:5px;padding:6px}.world-checkpoints{position:absolute;z-index:17;left:6px;bottom:48px;max-width:calc(100% - 12px)}.world-export{position:absolute;z-index:17;right:6px;bottom:48px;max-width:calc(100% - 12px)}
 .workspace-grid,.terrain-side{position:absolute;inset:0;gap:0}.workspace-grid.overview-covered{display:none}.terrain-side>.note{position:absolute;z-index:4;bottom:6px;left:6px;max-width:calc(100% - 65px);padding:5px 7px;border-radius:5px;background:var(--wand-card)}
 .save-side{position:absolute;z-index:5;left:6px;bottom:38px;max-width:calc(100% - 65px);padding:4px 7px;border-radius:5px;background:var(--wand-card)}
 .save-side.hasShape{z-index:1;inset:0;max-width:none;padding:0;border-radius:0;background:none}.inactiveMap,.save-side.hasShape.inactiveMap{display:none}
</style>
