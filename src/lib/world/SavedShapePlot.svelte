<script lang="ts">
  import {onMount,onDestroy} from 'svelte';
  import {terrainWarnings,type TerrainBinding} from './terrain-binding.ts';
  import {nativeSourceFloorTint} from './native-terrain-canvas.ts';
  import {base} from '$app/paths';
  import {watchWandLanguage,type WandLanguage} from '$lib/ui/preferences';
  import {openPublicItemMaster,type PublicCompleteItemMaster} from '$lib/items/public-item-master';
  import {searchSavedObjects,worldObjectName,objectFocus,type WorldNames} from './world-object-search.ts';
  import {defaultMapCamera,maxMapZoom,zoomMapCamera,panMapCamera,mapCameraViewBox,mapViewportBounds,wheelMapCamera,createMapPanGesture} from './map-camera.ts';

  import {emptyWorldTimeline,currentWorldEdits,travelWorldTimeline,projectWorldEdits,stageWorldEdit,stageWorldGroupMove,WORLD_BATCH_LIMIT} from './saved-map-batch.ts';
  import {savedDraftOverlap,OVERLAP_COLORS} from './saved-draft-overlap.ts';
  import {CARDINAL_ORIENTATIONS,isCardinal,worldTransformEligible,worldMoveEligible,worldRotateEligible,draftSavedMapTransform,exclusiveAnchorClass,exclusiveAnchorConflict} from './saved-map-transform.ts';
  import {savedGridObjects,savedShapesAt,visibleSavedObjects,type SavedShapeMap,type SavedShapeObject} from './saved-shape-map.ts';
  import {MAP_LAYER_COLORS,MAP_LAYER_LABELS,mapPainterOrder,matchesSelectionLayer,type MapSelectionLayer} from './source-map-layers.ts';
  import {nativeActionBlocked} from './native-edit-restrictions.ts';
  import {sourceOrientationAngle,type SourceObjectShape} from './source-object-map.ts';
  export let map:SavedShapeMap;
  export let file:File|null=null;
  export let terrain:TerrainBinding|null=null;
  export let compact=false;
  export let terrainDisplayed=false;
  $: activeTerrain=terrain&&terrain.verifiedGridOrdinals.includes(activeOrdinal)?terrain:null;
  $: terrainUrl=activeTerrain?terrainImage(activeTerrain):'';
  $: terrainDisplayed=Boolean(activeTerrain&&terrainUrl);
  function terrainImage(binding:TerrainBinding){
    const raster=binding.raster,canvas=document.createElement('canvas');canvas.width=raster.sizeX;canvas.height=raster.sizeY;
    const ctx=canvas.getContext('2d');if(!ctx)return '';const data=ctx.createImageData(canvas.width,canvas.height);
    const cache=new Map<number,readonly [number,number,number]>();
    for(let i=0;i<raster.nativeFloorValues.length;i++){
      const value=raster.nativeFloorValues[i];let rgb=cache.get(value);if(!rgb){rgb=nativeSourceFloorTint(value);cache.set(value,rgb);}
      data.data.set([rgb[0],rgb[1],rgb[2],255],i*4);
    }ctx.putImageData(data,0,0);return canvas.toDataURL('image/png');
  }
  // Recompute only on selection/rotation/Grid changes, not pointer movement.
  // No Save ID, file, or coordinates are sent to a server.
  let showOrigins=false,originUrl='',originStatus:'idle'|'working'|'ready'|'error'='idle';
  let originWorker:Worker|null=null;
  function cancelOrigins(){
    originWorker?.terminate();originWorker=null;originUrl='';originStatus='idle';
  }
  function computeOrigins(enabled:boolean,binding:TerrainBinding|null,shape:SourceObjectShape|null|undefined){
    cancelOrigins();
    if(!enabled||!binding||!shape||shape.acceptedFloorTypesFlag===undefined)return;
    originStatus='working';
    const own=new Worker(new URL('./placement-origin.worker.ts',import.meta.url),{type:'module'});
    originWorker=own;
    own.onmessage=({data})=>{
      if(originWorker!==own)return;
      own.terminate();originWorker=null;
      const width=binding.raster.sizeX*binding.factor,height=binding.raster.sizeY*binding.factor;
      if(data?.kind!=='origins'||data.width!==width||data.height!==height||
        !(data.bitmap instanceof Uint8Array)||data.bitmap.length!==width*height){originStatus='error';return;}
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d');if(!ctx){originStatus='error';return;}
      const image=ctx.createImageData(width,height);
      for(let i=0;i<data.bitmap.length;i++){
        if(data.bitmap[i]!==1)continue;
        const at=i*4;image.data[at]=75;image.data[at+1]=221;image.data[at+2]=205;image.data[at+3]=150;
      }
      ctx.putImageData(image,0,0);originUrl=canvas.toDataURL('image/png');originStatus='ready';
    };
    own.onerror=()=>{if(originWorker===own){own.terminate();originWorker=null;originStatus='error';}};
    own.postMessage({raster:binding.raster,factor:binding.factor,shape});
  }
  onDestroy(cancelOrigins);
  $: originAvailable=Boolean(activeTerrain&&draftShape&&draftShape.acceptedFloorTypesFlag!==undefined);
  $: computeOrigins(showOrigins&&originAvailable,activeTerrain,draftShape);
  let locale:WandLanguage='ja';
  let names:WorldNames=new Map();
  let master:Promise<PublicCompleteItemMaster>|null=null;
  let nameEpoch=0,query='',searchOpen=false,visibleResults=60;
  async function loadNames(language:WandLanguage){
    const epoch=++nameEpoch;
    try{
      master??=openPublicItemMaster(base,fetch,{scope:'complete',gameVersion:'1.26.2'});
      const rows=await (await master).getBrowseNames(language);
      if(epoch===nameEpoch)names=new Map(rows);
    }catch{if(epoch===nameEpoch){names=new Map();master=null;}}
  }
  onMount(()=>{const unwatch=watchWandLanguage(next=>{locale=next;void loadNames(next);});return()=>{nameEpoch++;unwatch();};});
  $: matches=searchSavedObjects(objects,names,query,layer);
  $: matchIds=new Set(matches.map(o=>o.localOrdinal));
  function setSearch(value:string){query=value;visibleResults=60;searchOpen=true;}
  function selectFromSearch(o:SavedShapeObject){if(busy)return;if(groupMode){toggleGroup(o);return;}selected=o.localOrdinal;hits=[o];cameraState=objectFocus(map,o,extent,maxZoom);searchOpen=false;}
  let groupMode=false,groupIds:number[]=[],groupDX:number|undefined=0,groupDY:number|undefined=0;
  $: groupSet=new Set(groupIds);
  $: groupObjects=objects.filter(o=>groupSet.has(o.localOrdinal));
  $: groupPlan=groupMode&&groupDX!==undefined&&groupDY!==undefined?
    stageWorldGroupMove(map,timeline,groupIds,groupDX,groupDY,'一括移動：衝突・上下関係は未判定'):null;
  function clearGroup(){groupIds=[];groupDX=0;groupDY=0;placing=false;hoverPoint=null;}
  function toggleGroupMode(){if(busy)return;cancelEdit();clearGroup();groupMode=!groupMode;selected=null;hits=[];}
  function toggleGroup(o:SavedShapeObject){
    if(!worldMoveEligible(o)||o.localGridOrdinal!==activeOrdinal)return;
    if(groupIds.includes(o.localOrdinal))groupIds=groupIds.filter(id=>id!==o.localOrdinal);
    else if(groupIds.length<WORLD_BATCH_LIMIT)groupIds=[...groupIds,o.localOrdinal];
    groupDX=0;groupDY=0;placing=false;hoverPoint=null;cancelEdit();
  }
  function stageGroup(){
    if(busy||!groupPlan||placing)return;
    cancelEdit();timeline=groupPlan;groupDX=0;groupDY=0;stageError='';
  }
  function rotateDraft(delta:number){if(busy||!worldRotateEligible(chosen)||!isCardinal(draftOrientation))return;draftOrientation=CARDINAL_ORIENTATIONS[(CARDINAL_ORIENTATIONS.indexOf(draftOrientation)+delta+4)%4];}
  function keyMap(event:KeyboardEvent){
    if(busy)return;
    if(groupMode){
      if(event.key==='Escape'){clearGroup();return;}
      if(event.key==='Enter'){event.preventDefault();stageGroup();return;}
      const d:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
      const step=d[event.key];if(step&&groupIds.length>=2){event.preventDefault();groupDX=(groupDX??0)+step[0];groupDY=(groupDY??0)+step[1];}return;
    }
    if(event.key==='Escape'){resetDraft(chosen);return;}
    if(!chosen||!file||!worldTransformEligible(chosen))return;
    if(event.key.toLowerCase()==='r'){event.preventDefault();rotateDraft(event.shiftKey?-1:1);return;}
    if(event.key==='Enter'&&editPlan&&!placing){event.preventDefault();stageCurrent();return;}
    const delta:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    const d=delta[event.key];if(d&&worldMoveEligible(chosen)&&draftX!==undefined&&draftY!==undefined){event.preventDefault();draftX+=d[0];draftY+=d[1];}
  }
  let editWorker:Worker|null=null;
  let editEpoch=0;
  let busy=false,editError='',copyUrl='',copyName='',checkedSignature='';
  let draftX:number|undefined=0,draftY:number|undefined=0,draftOrientation:string|null=null,placing=false;
  let hoverPoint:{x:number;y:number}|null=null;
  export let timeline=emptyWorldTimeline();
  let stageError='';
  $: staged=currentWorldEdits(timeline);
  $: effectiveMap=projectWorldEdits(map,staged);
  function clearTimeline(){timeline=emptyWorldTimeline();stageError='';}
  let previousFile:File|null=null;
  function checkFile(value:File|null){if(previousFile!==value){previousFile=value;cancelEdit();stageError='';clearGroup();groupMode=false;}}
  $: checkFile(file);
  let draftTarget:SavedShapeObject|null=null;
  function cancelEdit(){editEpoch++;editWorker?.terminate();editWorker=null;busy=false;checkedSignature='';editError='';if(copyUrl)URL.revokeObjectURL(copyUrl);copyUrl='';}
  onDestroy(cancelEdit);
  function resetDraft(o:SavedShapeObject|null){cancelEdit();draftTarget=o;placing=false;hoverPoint=null;draftX=o?.x??0;draftY=o?.y??0;draftOrientation=o?.orientation??null;}
  $: if(chosen!==draftTarget){
    cancelEdit();draftTarget=chosen;placing=false;hoverPoint=null;
    draftX=chosen?.x??0;draftY=chosen?.y??0;draftOrientation=chosen?.orientation??null;
  }
  $: editPlan=draftSavedMapTransform(chosen,draftX,draftY,draftOrientation);
  $: exportPlans=staged.length?staged.map(e=>e.plan):editPlan?[editPlan]:[];
  $: draftSignature=exportPlans.length?JSON.stringify(exportPlans):'';
  $: pendingDraft=groupMode?Boolean((groupDX??0)||(groupDY??0)):staged.length>0&&editPlan!==null;
  function stageCurrent(){
    if(!chosen||busy||placing||!editPlan||committedConflict)return;
    const overlapWarning=overlap?[overlap.counts['shape-overlap']?'重なり候補 '+overlap.counts['shape-overlap']+'マス':'',
      overlap.counts['landscape-overlap']?'景観との重なり '+overlap.counts['landscape-overlap']+'マス':'',
      overlap.counts['support-unknown']?'上下関係不明 '+overlap.counts['support-unknown']+'マス':'',
      overlap.unresolvedObjects||overlap.truncated?'一部未評価':''].filter(Boolean).join('・'):'';
    const floorCount=floorWarnings.reduce((n,r)=>n+r.width,0);
    const warning=[overlapWarning,floorCount?'地形範囲外・属性不一致候補 '+floorCount+'マス':''].filter(Boolean).join('・');
    const next=stageWorldEdit(map,timeline,chosen.localOrdinal,draftX,draftY,draftOrientation,warning);
    if(!next){stageError='編集を追加できません。最大'+WORLD_BATCH_LIMIT+'件です。';return;}
    cancelEdit();timeline=next;stageError='';
  }
  function travel(delta:-1|1){if(busy)return;cancelEdit();timeline=travelWorldTimeline(timeline,delta);groupDX=0;groupDY=0;stageError='';}
  function resetStaged(){if(busy)return;cancelEdit();clearTimeline();}
  $: if(checkedSignature&&checkedSignature!==draftSignature)cancelEdit();
  $: draftCode=isCardinal(draftOrientation)?CARDINAL_ORIENTATIONS.indexOf(draftOrientation)*4:null;
  $: draftShape=chosen&&draftCode!==null?map.shapes[chosen.itemId+':'+draftCode]:null;
  $: previewX=placing&&hoverPoint?hoverPoint.x:draftX;
  $: previewY=placing&&hoverPoint?hoverPoint.y:draftY;
  $: exclusiveClass=chosen?exclusiveAnchorClass(chosen.itemId):null;
  $: showDraft=Boolean((placing||editPlan)&&(draftShape||exclusiveClass)&&Number.isInteger(previewX)&&Number.isInteger(previewY));
  $: anchorConflict=showDraft&&exclusiveAnchorConflict(effectiveMap,chosen,previewX,previewY);
  $: committedConflict=exclusiveAnchorConflict(effectiveMap,chosen,draftX,draftY);
  $: overlap=showDraft&&chosen&&draftShape&&previewX!==undefined&&previewY!==undefined? savedDraftOverlap(effectiveMap,chosen,draftShape,previewX,previewY):null;
  $: floorWarnings=showDraft&&activeTerrain&&draftShape&&previewX!==undefined&&previewY!==undefined?terrainWarnings(activeTerrain,draftShape,previewX,previewY):[];
  $: if(!file)cancelEdit();
  async function runEdit(exporting:boolean){
    const source=file,plans=exportPlans,signature=draftSignature;
    if(!source||!plans.length||busy||pendingDraft||placing||committedConflict||source.size<1||source.size>32*1024*1024||
      (exporting&&checkedSignature!==signature))return;
    const sourceName=source.name;
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
          receipt.changedCount===plans.length&&receipt.lexicalBytesPreserved===true&&receipt.reopenVerified===true&&receipt.exportAuthorized===false){checkedSignature=signature;return;}
        if(exporting&&r?.kind==='copy'&&r.bytes instanceof Uint8Array&&r.bytes.byteLength>0&&r.bytes.byteLength<=32*1024*1024&&
          receipt?.contract==='wand.db05.experimental-copy@1'&&receipt.copyBytes===r.bytes.byteLength&&receipt.originalUnchanged===true&&
          receipt.independentReopenVerified===true&&receipt.experimentalCopyOnly===true&&receipt.productionWriterAuthorized===false){
          try{copyUrl=URL.createObjectURL(new Blob([r.bytes.slice().buffer as ArrayBuffer],{type:'application/octet-stream'}));
            const dot=sourceName.lastIndexOf('.');copyName=dot>0?sourceName.slice(0,dot)+'-world-edited'+sourceName.slice(dot):sourceName+'-world-edited';}
          catch{editError='コピーを生成できませんでした。';}finally{r.bytes.fill(0);}return;
        }
        r?.bytes?.fill(0);checkedSignature='';editError='セーブの変更を検証できませんでした。';
      }
      worker.onmessage=e=>finish(e.data);worker.onerror=e=>{e.preventDefault();finish({kind:'error'});};worker.onmessageerror=()=>finish({kind:'error'});
      const request={command:exporting?'export-grid-mixed-batch-copy':'preview-grid-mixed-batch',format:source.name.toLowerCase().endsWith('.json')?'json':'auto',bytes,edits:plans};
      worker.postMessage(exporting?{...request,allowExperimentalCopy:true}:request,[bytes.buffer]);bytes=null;
    }catch{if(epoch===editEpoch){editWorker?.terminate();editWorker=null;busy=false;checkedSignature='';editError='セーブの処理に失敗しました。';}}
    finally{if(bytes?.byteLength)bytes.fill(0);if(epoch===editEpoch&&!editWorker)busy=false;}
  }
  let ordinal=0,selected:number|null=null,hits:SavedShapeObject[]=[];
  let layer:MapSelectionLayer='all';
  let cameraState=defaultMapCamera();
  const gesture=createMapPanGesture();
  $: zoom=cameraState.zoom;
  let svg:SVGSVGElement;
  let previous:SavedShapeMap|null=null;
  $: ordinals=[...new Set(map.objects.map(o=>o.localGridOrdinal))];
  function resetCamera(){cameraState=defaultMapCamera();}
  function chooseGrid(n:number){clearGroup();groupMode=false;ordinal=n;selected=null;hits=[];layer='all';resetCamera();}
  $: if(map!==previous){
    previous=map;cancelEdit();stageError='';clearGroup();groupMode=false;
    ordinal=map.objects[0]?.localGridOrdinal??0;selected=null;hits=[];layer='all';cameraState=defaultMapCamera();
  }
  $: activeOrdinal=ordinals.includes(ordinal)?ordinal:ordinals[0]??0;
  $: objects=mapPainterOrder(savedGridObjects(effectiveMap,activeOrdinal));
  $: layers=(Object.keys(MAP_LAYER_LABELS) as MapSelectionLayer[]).filter(l=>l==='all'||objects.some(o=>matchesSelectionLayer(o,l)));
  $: chosen=objects.find(o=>o.localOrdinal===selected)??null;
  $: stagedOrdinals=new Set(staged.map(e=>e.plan.localOrdinal));
  function bounds(list:SavedShapeObject[],m:SavedShapeMap,t:TerrainBinding|null){
    if(!list.length&&!t)return {x:0,y:0,w:1,h:1};
    let x=t?0:Infinity,y=t?0:Infinity,right=t?t.raster.sizeX*t.factor:-Infinity,bottom=t?t.raster.sizeY*t.factor:-Infinity;
    for(const o of list){const s=o.shapeKey?m.shapes[o.shapeKey]:null;
      x=Math.min(x,o.x);y=Math.min(y,o.y);right=Math.max(right,o.x+(s?.width??1));bottom=Math.max(bottom,o.y+(s?.height??1));}
    return {x:x-1,y:y-1,w:right-x+2,h:bottom-y+2};
  }
  $: extent=bounds(objects,map,activeTerrain);
  $: maxZoom=maxMapZoom(Math.max(extent.w,extent.h));
  $: viewBox=mapCameraViewBox(cameraState,extent);
  $: visibleObjects=visibleSavedObjects(objects,map.shapes,mapViewportBounds(cameraState,extent),selected);
  function changeZoom(n:number){cameraState=zoomMapCamera(cameraState,n,maxZoom);}
  function pan(dx:number,dy:number){cameraState=panMapCamera(cameraState,dx/zoom,dy/zoom);}
  function wheel(event:WheelEvent){cameraState=wheelMapCamera(event,svg,extent,cameraState,maxZoom);}
  function startPan(event:PointerEvent){gesture.begin(event,zoom>1&&(!placing||event.shiftKey||event.button===1||event.pointerType==='touch'));}
  function finishPan(event:PointerEvent){gesture.end(event);}
  function chooseLayer(l:MapSelectionLayer){layer=l;if(!groupMode)selected=hits.find(o=>matchesSelectionLayer(o,l))?.localOrdinal??null;}
  function pointerCell(event:MouseEvent){
    const matrix=svg?.getScreenCTM();if(!matrix)return null;
    const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
    const x=Math.floor(p.x),y=Math.floor(p.y);
    return Number.isSafeInteger(x)&&Number.isSafeInteger(y)&&x>=-2147483648&&x<=2147483647&&y>=-2147483648&&y<=2147483647?{x,y}:null;
  }
  function follow(event:PointerEvent){
    const moved=gesture.move(event,svg,extent,cameraState);if(moved){cameraState=moved;return;}
    if(!placing||busy||event.pointerType==='touch')return;
    const p=pointerCell(event);if(p&&(p.x!==hoverPoint?.x||p.y!==hoverPoint?.y))hoverPoint=p;
  }
  function pick(event:MouseEvent){
    if(gesture.consumeClick())return;
    const point=pointerCell(event);if(!point||event.detail===0||busy)return;
    if(groupMode){
      if(placing&&groupObjects.length>=2){const anchor=groupObjects[0];groupDX=point.x-anchor.x;groupDY=point.y-anchor.y;placing=false;hoverPoint=null;return;}
      hits=savedShapesAt(effectiveMap,activeOrdinal,point.x,point.y);
      const hit=hits.find(o=>matchesSelectionLayer(o,layer)&&worldMoveEligible(o));if(hit)toggleGroup(hit);return;
    }
    if(placing&&chosen&&worldMoveEligible(chosen)){draftX=point.x;draftY=point.y;placing=false;hoverPoint=null;cancelEdit();return;}
    hits=savedShapesAt(effectiveMap,activeOrdinal,point.x,point.y);
    selected=hits.find(o=>matchesSelectionLayer(o,layer))?.localOrdinal??null;
  }
</script>
<div class="saved-shape-plot">
  <div class="controls">
    {#if ordinals.length>1}
      <label>セーブ内Grid <select value={activeOrdinal} on:change={e=>chooseGrid(Number(e.currentTarget.value))}>
        {#each ordinals as id}<option value={id}>Grid {id}</option>{/each}
      </select></label>
    {/if}
    <button type="button" aria-label="セーブ図を拡大" on:click={()=>changeZoom(zoom*2)} disabled={zoom>=maxZoom}>＋</button>
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
    {#if file}<button type="button" aria-pressed={groupMode} disabled={busy} on:click={toggleGroupMode}>複数選択</button>{/if}
  </div>
  {#if originAvailable}
    <div class="controls origin-tools">
      <button type="button" aria-pressed={showOrigins} on:click={()=>showOrigins=!showOrigins}>配置候補マス</button>
      {#if showOrigins}
        {#if originStatus==='working'}<small role="status">計算中…</small>
        {:else if originStatus==='error'}<small role="alert">候補を計算できませんでした。</small>
        {:else if originStatus==='ready'}<small><span class="origin-swatch"></span> 地形条件に一致する基準マス（衝突・上下関係は未判定）</small>{/if}
      {/if}
    </div>
  {/if}
  <div class="object-search">
    <input type="search" aria-label="配置済み家具を検索" placeholder="配置済み家具を検索" value={query} on:input={e=>setSearch(e.currentTarget.value)} on:focus={()=>searchOpen=true}/>
    <button type="button" aria-expanded={searchOpen} on:click={()=>searchOpen=!searchOpen}>{searchOpen?'閉じる':'一覧'}</button>
    {#if query}<button type="button" aria-label="検索を解除" on:click={()=>setSearch('')}>×</button>{/if}
    {#if searchOpen}
      <div class="object-results">
        {#each matches.slice(0,visibleResults) as o (o.localOrdinal)}
          <button type="button" aria-pressed={groupMode?groupSet.has(o.localOrdinal):selected===o.localOrdinal} disabled={groupMode&&!worldMoveEligible(o)} on:click={()=>selectFromSearch(o)}>
            <span>{worldObjectName(o,names)}</span><small>{o.x}, {o.y}</small>
          </button>
        {/each}
        {#if !matches.length}<p>該当する配置なし</p>{/if}
        {#if matches.length>visibleResults}<button type="button" on:click={()=>visibleResults+=60}>続きを表示</button>{/if}
      </div>
    {/if}
  </div>
  <button type="button" class="plot" class:zoomed={zoom>1} aria-label="セーブ内の形状候補を選択"
    on:click={pick} on:wheel|nonpassive={wheel} on:pointerdown={startPan} on:pointermove={follow}
    on:pointerup={finishPan} on:pointercancel={finishPan} on:pointerleave={()=>{gesture.leave();hoverPoint=null;}} on:keydown={keyMap}>
    <svg bind:this={svg} {viewBox} aria-hidden="true">
      <defs><pattern id="saved-shape-cells" width="1" height="1" patternUnits="userSpaceOnUse">
        <path d="M1 0H0V1" fill="none" stroke="#8f9aa8" stroke-opacity=".35" stroke-width=".04"/>
      </pattern></defs>
      <rect x={extent.x} y={extent.y} width={extent.w} height={extent.h} fill="#27313a"/>
      {#if activeTerrain&&terrainUrl}<image class="saved-terrain-background" href={terrainUrl} x="0" y="0" width={activeTerrain.raster.sizeX*activeTerrain.factor} height={activeTerrain.raster.sizeY*activeTerrain.factor} preserveAspectRatio="none" style="image-rendering:pixelated"/>{/if}
      {#if activeTerrain&&originUrl}<image class="placement-origin-overlay" href={originUrl} x="0" y="0" width={activeTerrain.raster.sizeX*activeTerrain.factor} height={activeTerrain.raster.sizeY*activeTerrain.factor} preserveAspectRatio="none" style="image-rendering:pixelated"/>{/if}
      {#if extent.w/zoom<160&&extent.h/zoom<160}<rect x={extent.x} y={extent.y} width={extent.w} height={extent.h} fill="url(#saved-shape-cells)"/>{/if}
      {#each visibleObjects as o (o.localOrdinal)}
        {@const shape=o.shapeKey?map.shapes[o.shapeKey]:null}
        <g class="saved-object" class:staged-object={stagedOrdinals.has(o.localOrdinal)} class:group-selected={groupSet.has(o.localOrdinal)} class:search-dim={Boolean(query.trim())&&!matchIds.has(o.localOrdinal)&&selected!==o.localOrdinal&&!groupSet.has(o.localOrdinal)&&o.layer!=='ground'&&o.layer!=='fence'} data-local-ordinal={o.localOrdinal} transform={'translate('+o.x+' '+o.y+')'}>
          {#if shape}
            <path class="saved-object-shape" d={shape.path} fill={MAP_LAYER_COLORS[o.layer]} fill-opacity={(selected===o.localOrdinal||groupSet.has(o.localOrdinal))?.85:(matchesSelectionLayer(o,layer)||o.layer==='ground'||o.layer==='fence')?.48:.24}
              stroke={selected===o.localOrdinal||groupSet.has(o.localOrdinal)?'#fff':MAP_LAYER_COLORS[o.layer]} stroke-width="1" vector-effect="non-scaling-stroke"/>
            {#if o.orientationCode!==null}<path d="M0 -.32L.19 .13L0 .04L-.19 .13Z" transform={'translate(.5 .5) rotate('+sourceOrientationAngle(o.orientationCode)+')'} fill="#fff"/>{/if}
          {:else}<circle class="unknown-shape" cx=".5" cy=".5" r=".24" fill="#ddd" stroke="#fff" stroke-width="1" vector-effect="non-scaling-stroke"/>{/if}
          {#if o.surfaceCapable}<circle cx=".78" cy=".22" r=".13" fill="#dbc2f6"/>{/if}
          {#if nativeActionBlocked(o.editRestrictions,'move')||nativeActionBlocked(o.editRestrictions,'select')}<g class="saved-restricted-marker" transform="translate(.5 .5)" fill="none" stroke="#e7cf94" stroke-width=".09"><rect x="-.23" y="-.05" width=".46" height=".34" rx=".04"/><path d="M-.14 -.05v-.12a.14 .14 0 0 1 .28 0v.12"/></g>{/if}
          {#if o.subgrid}<g class="saved-subgrid-marker" transform="translate(.5 .5)" fill="none" stroke="#f0d494" stroke-width=".09">
            <rect x="-.30" y="-.30" width=".60" height=".60" rx=".08"/><rect x="-.16" y="-.16" width=".32" height=".32" rx=".04"/>
          </g>{/if}
        </g>
      {/each}
      {#if groupMode&&(placing||groupDX||groupDY)}
        {@const dx=placing&&hoverPoint&&groupObjects.length?hoverPoint.x-groupObjects[0].x:groupDX??0}
        {@const dy=placing&&hoverPoint&&groupObjects.length?hoverPoint.y-groupObjects[0].y:groupDY??0}
        {#each groupObjects as o (o.localOrdinal)}
          {@const shape=o.shapeKey?map.shapes[o.shapeKey]:null}
          {#if shape}<path class="group-draft-shape" d={shape.path} transform={'translate('+(o.x+dx)+' '+(o.y+dy)+')'} fill="#a7b1bf" fill-opacity=".55" stroke="#fff" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>
          {:else}<circle class="group-draft-anchor" cx={o.x+dx+.5} cy={o.y+dy+.5} r=".3" fill="#a7b1bf" stroke="#fff" vector-effect="non-scaling-stroke"/>{/if}
        {/each}
      {/if}
      {#if showDraft}
        {#if draftShape}<path class="saved-draft-shape" d={draftShape.path} transform={'translate('+previewX+' '+previewY+')'} fill="#a7b1bf" fill-opacity=".62" stroke="#fff" stroke-width="1.5" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>
        {:else}<circle class="saved-draft-anchor" cx={Number(previewX)+.5} cy={Number(previewY)+.5} r=".3" fill="#a7b1bf" stroke="#fff" stroke-width="1.5" vector-effect="non-scaling-stroke"/>{/if}
        {#if overlap}{#each overlap.runs as run (run.x+','+run.y)}
          <rect class="saved-overlap-cell" data-evidence={run.evidence} x={run.x} y={run.y} width={run.width} height="1"
            fill={OVERLAP_COLORS[run.evidence]} fill-opacity=".8" stroke={OVERLAP_COLORS[run.evidence]} stroke-width="1" vector-effect="non-scaling-stroke"/>
        {/each}{/if}
        {#each floorWarnings as run (run.x+','+run.y)}<rect class="saved-terrain-warning" data-reason={run.reason} x={run.x} y={run.y} width={run.width} height="1" fill="#ef5350" fill-opacity=".85" stroke="#ef5350" stroke-width="1" vector-effect="non-scaling-stroke"/>{/each}
        {#if anchorConflict}<rect class="exclusive-anchor-conflict" x={previewX} y={previewY} width="1" height="1" fill="#ef5350" fill-opacity=".9" stroke="#fff" stroke-width="2" vector-effect="non-scaling-stroke"/>{/if}
      {/if}
    </svg>
  </button>
  {#if hits.length}<div class="controls" role="group" aria-label="重なるセーブ内オブジェクト">
    {#each hits as hit (hit.localOrdinal)}
      <button type="button" aria-pressed={groupMode?groupSet.has(hit.localOrdinal):selected===hit.localOrdinal} disabled={groupMode&&!worldMoveEligible(hit)} on:click={()=>{if(groupMode)toggleGroup(hit);else selected=hit.localOrdinal;}}>{worldObjectName(hit,names)}</button>
    {/each}
  </div>{/if}
  {#if groupMode}
    <div class="controls group-controls" role="group" aria-label="一括移動">
      <strong>{groupIds.length}件選択</strong>
      <button type="button" disabled={busy||!groupIds.length} on:click={clearGroup}>選択解除</button>
      <button type="button" aria-pressed={placing} disabled={busy||groupIds.length<2} on:click={()=>{placing=!placing;hoverPoint=null;}}>{placing?'一括移動先を選択中':'一括移動先を選択'}</button>
      <label>ΔX <input type="number" aria-label="一括移動X" bind:value={groupDX} step="1" disabled={busy||groupIds.length<2}/></label>
      <label>ΔY <input type="number" aria-label="一括移動Y" bind:value={groupDY} step="1" disabled={busy||groupIds.length<2}/></label>
      <button type="button" disabled={busy||placing||!groupPlan} on:click={stageGroup}>一括移動を追加</button>
    </div>
    {#if (groupDX||groupDY)&&!groupPlan}<p role="status">移動先・編集制限・最大件数を確認してください。</p>{/if}
  {/if}
  {#if chosen}<p class="selected-saved-object">{worldObjectName(chosen,names)} ／ ({chosen.x}, {chosen.y}) ／ {chosen.orientation??'向き不明'}</p>{/if}
  {#if chosen?.subgrid}<p class="subgrid-status" role="status">{chosen.subgrid.status==='resolved_full'?`子Grid内の配置 ${chosen.subgrid.objectCount}件`:'子Gridの参照先未確認'}。親家具の単独移動・回転は未対応。</p>{/if}
  {#if chosen&&!chosen.subgrid&&(nativeActionBlocked(chosen.editRestrictions,'select')||nativeActionBlocked(chosen.editRestrictions,'move')||nativeActionBlocked(chosen.editRestrictions,'rotate'))}
    <p class="subgrid-status" role="status">ゲーム原本の編集制限：{nativeActionBlocked(chosen.editRestrictions,'select')?'編集対象外':[
      nativeActionBlocked(chosen.editRestrictions,'move')?'移動不可または条件未確認':'',
      nativeActionBlocked(chosen.editRestrictions,'rotate')?'回転不可または条件未確認':''
    ].filter(Boolean).join('・')}</p>
  {/if}
  {#if chosen&&file&&worldTransformEligible(chosen)}
    <div class="transform-controls">
      <div class="controls">
        <button type="button" aria-pressed={placing} disabled={busy||!worldMoveEligible(chosen)} on:click={()=>{placing=!placing;hoverPoint=null;}}>{placing?'移動先を選択中':'マップで移動先を選択'}</button>
        <label>X <input type="number" aria-label="移動先X" bind:value={draftX} step="1" disabled={busy||!worldMoveEligible(chosen)}/></label>
        <label>Y <input type="number" aria-label="移動先Y" bind:value={draftY} step="1" disabled={busy||!worldMoveEligible(chosen)}/></label>
        {#if worldRotateEligible(chosen)}<button type="button" aria-label="左回転" disabled={busy} on:click={()=>rotateDraft(-1)}>↶</button><button type="button" aria-label="右回転" disabled={busy} on:click={()=>rotateDraft(1)}>↷</button><label>向き <select aria-label="編集後の向き" bind:value={draftOrientation} disabled={busy}>
          {#each CARDINAL_ORIENTATIONS as direction}<option value={direction}>{['上','右','下','左'][CARDINAL_ORIENTATIONS.indexOf(direction)]}</option>{/each}
        </select></label>{/if}
        <button type="button" disabled={busy||!editPlan} on:click={()=>resetDraft(chosen)}>元に戻す</button>
      </div>
      {#if anchorConflict}<p class="exclusive-warning" role="status">同種の{exclusiveClass==='ground'?'道・地面':'フェンス'}が同じ座標にあります。移動できません。</p>{/if}
      {#if exclusiveClass}<p>基準座標のみ移動。接続形状・向きは変更しません。未表示の配置もRustで検査します。</p>{/if}
      {#if overlap}
        <div class="overlap-key" aria-label="形状の重なり候補">
          {#if overlap.counts['shape-overlap']}<span style:color={OVERLAP_COLORS['shape-overlap']}>重なり候補 {overlap.counts['shape-overlap']}マス</span>{/if}
          {#if overlap.counts['landscape-overlap']}<span style:color={OVERLAP_COLORS['landscape-overlap']}>景観と重なる {overlap.counts['landscape-overlap']}マス</span>{/if}
          {#if overlap.counts['support-unknown']}<span style:color={OVERLAP_COLORS['support-unknown']}>上下関係不明 {overlap.counts['support-unknown']}マス</span>{/if}
          {#if overlap.counts['ground-overlap']}<span>道・地面 {overlap.counts['ground-overlap']}マス</span>{/if}
        </div>
        {#if overlap.unresolvedObjects||overlap.truncated}<p>形状不明・未評価のオブジェクトがあります。</p>{/if}
      {/if}
      {#if floorWarnings.length}<p style:color="#ef5350">地形範囲外・属性不一致候補 {floorWarnings.reduce((n,r)=>n+r.width,0)}マス</p>{/if}
      {#if !compact}<p>色は原本形状による重なり候補です。配置許可とは別で、他の家具・小物・景観は削除・自動移動しません。</p>{/if}
      {#if editPlan}<button type="button" disabled={busy||placing||committedConflict} on:click={stageCurrent}>配置変更を追加</button>{/if}
      {#if stageError}<p role="alert">{stageError}</p>{/if}
    </div>
  {:else if chosen&&file&&!chosen.subgrid}<p>この種類または形状未確認のオブジェクトは現在の編集対象外です。</p>{/if}
  {#if staged.length||timeline.snapshots.length>1}
    <div class="world-edit-history">
      <div class="controls">
        <strong>配置変更 {staged.length}/{WORLD_BATCH_LIMIT}</strong>
        <span>セーブ全体</span>
        <button type="button" aria-label="配置変更を取り消す" disabled={busy||timeline.cursor===0} on:click={()=>travel(-1)}>↶</button>
        <button type="button" aria-label="配置変更をやり直す" disabled={busy||timeline.cursor===timeline.snapshots.length-1} on:click={()=>travel(1)}>↷</button>
        <button type="button" disabled={busy} on:click={resetStaged}>全変更を取り消す</button>
      </div>
      <div class="staged-list" aria-label="配置変更一覧">
      {#each staged as e (e.plan.localOrdinal)}
        <p class="staged-edit">{e.name} · Grid {e.gridOrdinal} · ({e.plan.expectedX}, {e.plan.expectedY}) → ({e.plan.replacementX??e.plan.expectedX}, {e.plan.replacementY??e.plan.expectedY}){e.plan.replacementOrientation?' · 回転':''}
          {#if e.warning}<span class="staged-warning">　{e.warning}</span>{/if}</p>
      {/each}
      </div>
      {#if pendingDraft}<p>現在の変更を追加するか、元に戻してから一括出力できます。</p>{/if}
    </div>
  {/if}
  {#if file&&exportPlans.length}<div class="controls batch-export">
    <button type="button" disabled={busy||placing||committedConflict||pendingDraft} on:click={()=>runEdit(false)}>{staged.length?'一括変更を検証':'変更を検証'}</button>
    {#if checkedSignature===draftSignature}<button type="button" disabled={busy||placing||committedConflict||pendingDraft} on:click={()=>runEdit(true)}>実験的な編集コピーを作成</button>{/if}
  </div>{/if}
  {#if busy}<p role="status">ローカル処理中…</p>{/if}
  {#if editError}<p role="alert">{editError}</p>{/if}
  {#if copyUrl}<a href={copyUrl} download={copyName}>編集済みコピーを保存</a>{/if}
  {#if !compact}<p>原本定義による形状候補（原本Grid倍率 {map.sourceGridFactor??'不明'}）。丸印は形状不明。実際の占有・上下関係は未確認。</p>{:else}<p>{activeTerrain?'原本地形と配置を同じローカル座標で表示。':'地形との座標対応未確認。'}形状・重複は候補、ゲーム内ロード未確認。</p>{/if}
</div>
<style>
  .saved-shape-plot{display:grid;gap:6px;min-width:0}
  .controls{display:flex;flex-wrap:wrap;gap:5px;align-items:center}
  .origin-tools small{color:var(--wand-muted);font-size:11px}
  .origin-swatch{display:inline-block;background:#4bddcd;width:.8em;height:.8em;border-radius:2px;vertical-align:baseline}
  .placement-origin-overlay{pointer-events:none}
  .subgrid-status{color:var(--wand-text);border-inline-start:3px solid #d8b96b;padding-inline-start:6px}
  .group-draft-shape,.group-draft-anchor{pointer-events:none}
  .group-controls{border-block:1px solid var(--wand-border);padding-block:5px}
  .group-selected .unknown-shape{stroke:#fff;stroke-width:3}
  .saved-subgrid-marker,.saved-restricted-marker{pointer-events:none}
  .overlap-key{display:flex;flex-wrap:wrap;gap:8px;font-size:12px}
  .saved-overlap-cell,.exclusive-anchor-conflict{pointer-events:none}
  .exclusive-warning{color:var(--wand-text);font-weight:650;border-inline-start:3px solid #ef5350;padding-inline-start:6px}
  .world-edit-history{display:grid;gap:5px;border:1px solid var(--wand-line);background:var(--wand-card);border-radius:5px;padding:8px}
  .staged-list{display:grid;gap:4px;max-height:180px;overflow:auto;min-width:0}
  .object-search{display:flex;gap:5px;flex-wrap:wrap}
  .object-search input{flex:1;width:auto;min-width:120px}
  .object-results{flex-basis:100%;max-height:220px;overflow:auto;display:grid;gap:3px}
  .object-results button{display:flex;justify-content:space-between;gap:8px;text-align:left}
  .object-results small{opacity:.65;font-variant-numeric:tabular-nums;white-space:nowrap}
  .search-dim{opacity:.22}
  .staged-warning{color:var(--wand-text);font-weight:600;border-inline-start:3px solid #efc23e;padding-inline-start:6px}
  .staged-object{opacity:.9}
  .transform-controls{display:grid;gap:8px;padding:8px;border:1px solid var(--wand-line);background:var(--wand-card);border-radius:5px}
  input{width:90px;max-width:100%;font:inherit;color:inherit;background:var(--wand-menu);border:1px solid var(--wand-line);padding:4px;border-radius:4px}
  button,select{font:inherit;color:inherit;background:var(--wand-menu);border:1px solid var(--wand-line);border-radius:5px;padding:5px;font-size:12px}
  button[aria-pressed=true]{border-color:var(--wand-accent);background:var(--wand-header-hover);color:var(--wand-text);box-shadow:inset 0 0 0 1px var(--wand-accent)}
  button:not(:disabled):not(.plot):not([aria-pressed=true]):hover{background:var(--wand-header-hover)}
  button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--wand-focus);outline-offset:2px}
  button:disabled{opacity:.4}
  .plot{padding:0;overflow:hidden;width:100%;background:#10121d;line-height:0;cursor:crosshair}
  .plot.zoomed{touch-action:none}
  svg{display:block;width:100%;height: min(75vh, 720px)}
  p{margin:0;font-size:11px;overflow-wrap:anywhere}
</style>
