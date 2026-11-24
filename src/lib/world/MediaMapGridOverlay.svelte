<script lang="ts">
  import {onDestroy} from 'svelte';
  import {parseMapCalibration,findMapBinding,matchesMapImage,imagePixelToGridCell,
    imagePixelToUnboundedGridCell,type MapCalibration,type GridMapBinding,type GridMapIdentity}
    from './media-map-calibration.ts';
  import {MAP_LAYER_LABELS,MAP_LAYER_COLORS,mapPainterOrder,prioritizeMapHits,matchesSelectionLayer,type MapSelectionLayer} from './source-map-layers.ts';
  import {sourceObjectsAt,sourceOrientationAngle,type SourceObjectMap,type SourceMapObject} from './source-object-map.ts';
  import {nativeSourceFloorTint} from './native-terrain-canvas.ts';
  import {previewSourceCells,previewCellColor,gridLinePath,type GridPoint,type PreviewShape} from './source-placement-preview.ts';
  import type {NativeFloorWindowResult} from './native-floor-rectangle-window.ts';
  type Selection=GridMapIdentity&{platform:string;gameVersion:string;regionKey:string;viewKey:string};
  type Raster={sizeX:number;sizeY:number;nativeFloorValues:Uint32Array};
  export let selection:Selection|null=null;
  export let raster:Raster|null=null;
  export let candidates:NativeFloorWindowResult|null=null;
  export let objectMap:SourceObjectMap|null=null;
  export let selectedItemId:number|null=null;
  export let orientationCode=8;
  export let active=false;
  export let canNavigate=false;
  export let onNavigate:(x:number,y:number)=>void;
  export let onInspect:(x:number,y:number)=>void;
  let asset:{calibration:MapCalibration;url:string}|null=null;
  let binding:GridMapBinding|null=null;
  let svg:SVGSVGElement;
  let shown=true,loading=false,error='';
  let revision=0;
  let schematic=false,showObjects=true;
  let selectionLayer:MapSelectionLayer='all';
  let selectedObjectId:number|null=null;
  let hits:SourceMapObject[]=[];
  let zoom=1,centerX=.5,centerY=.5;
  function resetCamera(){zoom=1;centerX=.5;centerY=.5;}
  function setZoom(value:number){zoom=Math.max(1,Math.min(64,value));
    centerX=Math.max(.5/zoom,Math.min(1-.5/zoom,centerX));
    centerY=Math.max(.5/zoom,Math.min(1-.5/zoom,centerY));}
  function pan(dx:number,dy:number){centerX=Math.max(.5/zoom,Math.min(1-.5/zoom,centerX+dx/zoom));
    centerY=Math.max(.5/zoom,Math.min(1-.5/zoom,centerY+dy/zoom));}
  let previousGrid='';
  function clearSelection(key:string){if(key!==previousGrid){previousGrid=key;hits=[];selectedObjectId=null;selectionLayer='all';resetCamera();}}
  $: clearSelection(JSON.stringify([selection?.gameVersion,selection?.regionKey,selection?.viewKey,selection?.nativeGridId]));
  let origin:GridPoint|null=null;
  let pinned=false;
  let previousSelection='';
  function resetPreview(key:string){
    if(previousSelection!==key){previousSelection=key;origin=null;pinned=false;}
  }
  $: resetPreview(JSON.stringify([selection?.regionKey,selection?.viewKey,selection?.nativeGridId,selectedItemId]));
  function clearAsset(){
    if(asset)URL.revokeObjectURL(asset.url);
    asset=null;
  }
  function reset(){
    revision++;
    loading=false;error='';origin=null;pinned=false;schematic=false;hits=[];selectedObjectId=null;resetCamera();clearAsset();
  }
  onDestroy(()=>{revision++;clearAsset();});
  async function load(event:Event){
    const input=event.currentTarget as HTMLInputElement;
    const files=Array.from(input.files??[]);
    input.value='';
    if(!files.length)return;
    reset();const id=revision;loading=true;
    try{
      const json=files.find(f=>f.name.toLowerCase().endsWith('.json'));
      const webp=files.find(f=>f.name.toLowerCase().endsWith('.webp'));
      if(files.length!==2||!json||!webp||json.size>2*1024*1024||
         webp.size<12||webp.size>80*1024*1024)
        throw new Error('WebP画像と対応するJSONを同時に選択してください。');
      const calibration=parseMapCalibration(JSON.parse(await json.text()));
      const bytes=await webp.arrayBuffer();
      const head=new Uint8Array(bytes,0,12);
      if(String.fromCharCode(...head.slice(0,4))!=='RIFF'||
         String.fromCharCode(...head.slice(8,12))!=='WEBP')
        throw new Error('WebP画像を読み込めません。');
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
        v=>v.toString(16).padStart(2,'0')).join('');
      // Check identity before decoding the large original image.
      if(webp.name!==calibration.image.filename||hash!==calibration.image.sha256)
        throw new Error('画像と座標対応情報が一致しません。');
      const bitmap=await createImageBitmap(webp);
      try{
        if(!matchesMapImage(calibration,{filename:webp.name,sha256:hash,
          width:bitmap.width,height:bitmap.height}))
          throw new Error('画像寸法が一致しません。');
      }finally{bitmap.close();}
      if(id!==revision)return;
      asset={calibration,url:URL.createObjectURL(webp)};
      shown=true;
    }catch(e){
      if(id===revision)error=e instanceof Error&&
        !e.message.startsWith('DB04_')?e.message:'マップの座標対応情報を読み込めません。';
    }finally{if(id===revision)loading=false;}
  }
  $: binding=selection&&raster&&raster.sizeX===selection.sizeX&&raster.sizeY===selection.sizeY?
    (schematic?{...selection,gridToImage:[1,0,0,1,0,0] as const}:
      asset?findMapBinding(asset.calibration,selection):null):null;
  $: active=Boolean(binding&&raster&&(schematic||asset));
  $: imageWidth=schematic?raster?.sizeX??1:asset?.calibration.image.width??1;
  $: imageHeight=schematic?raster?.sizeY??1:asset?.calibration.image.height??1;
  $: camera=[(centerX-.5/zoom)*imageWidth,(centerY-.5/zoom)*imageHeight,imageWidth/zoom,imageHeight/zoom].join(' ');
  $: activeObjects=objectMap?.status==='source_default_geometry'&&selection&&
    objectMap.layoutId===selection.layoutId&&objectMap.gridIdNative===selection.nativeGridId&&
    objectMap.gridDataPath===selection.gridDataPath?objectMap:null;
  $: selectedObject=activeObjects?.objects.find(o=>o.id===selectedObjectId)??null;
  $: orderedObjects=activeObjects?mapPainterOrder(activeObjects.objects):[];
  $: orderedHits=prioritizeMapHits(hits,selectionLayer);
  $: availableLayers=(Object.keys(MAP_LAYER_LABELS) as MapSelectionLayer[]).filter(layer=>layer==='all'||orderedObjects.some(o=>matchesSelectionLayer(o,layer)));
  function changeSelectionLayer(layer:MapSelectionLayer){
    selectionLayer=layer;
    selectedObjectId=hits.find(o=>matchesSelectionLayer(o,layer))?.id??null;
  }
  function matchingCandidates(result:NativeFloorWindowResult|null,sel:Selection|null){
    return result&&sel&&result.viewKey===sel.viewKey&&
      result.gridIdNative===sel.nativeGridId&&result.gridDataPath===sel.gridDataPath&&
      result.bitmapWidth===sel.sizeX&&result.bitmapHeight===sel.sizeY&&
      result.originBitmap instanceof Uint8Array&&result.originBitmap.length===sel.sizeX*sel.sizeY
      ?result.originBitmap:null;
  }
  $: candidateMask=matchingCandidates(candidates,selection);
  function getShape(result:NativeFloorWindowResult|null,sel:Selection|null,
    itemId:number|null,orientation:number):PreviewShape|null{
    if(!result||!sel||result.itemId!==itemId||result.orientationCode!==orientation||
      result.viewKey!==sel.viewKey||result.gridIdNative!==sel.nativeGridId||
      result.gridDataPath!==sel.gridDataPath||result.regionKey!==sel.regionKey||
      !(result.mappedShape instanceof Uint8Array)||!result.boundingWidth||
      !result.boundingHeight||result.mappedShape.length!==result.boundingWidth*result.boundingHeight||
      result.acceptedFloorTypesFlag===null)return null;
    return {width:result.boundingWidth,height:result.boundingHeight,
      cells:result.mappedShape,acceptedFloorTypesFlag:result.acceptedFloorTypesFlag};
  }
  $: shape=getShape(candidates,selection,selectedItemId,orientationCode);
  $: lines=binding?gridLinePath(binding.sizeX,binding.sizeY):'';
  $: cells=active&&raster&&shape&&origin?previewSourceCells(shape,raster,origin):[];
  $: warningCount=cells.filter(c=>c.evidence!=='unknown').length;
  function buildMask(grid:Raster,mask:Uint8Array|null):string{
    const canvas=document.createElement('canvas');
    canvas.width=grid.sizeX;canvas.height=grid.sizeY;
    const ctx=canvas.getContext('2d');if(!ctx)return '';
    const data=ctx.createImageData(grid.sizeX,grid.sizeY);
    const colors=new Map<number,readonly [number,number,number]>();
    for(let i=0;i<grid.nativeFloorValues.length;i++){
      const value=grid.nativeFloorValues[i];
      let color=colors.get(value);
      if(!color){color=nativeSourceFloorTint(value);colors.set(value,color);}
      const [r,g,b]=mask?(mask[i]===1?[65,220,125]:[20,20,30]):color;
      data.data.set([r,g,b,mask?(mask[i]===1?150:55):110],i*4);
    }
    ctx.putImageData(data,0,0);
    return canvas.toDataURL('image/png');
  }
  $: maskUrl=active&&raster?buildMask(raster,candidateMask):'';
  function mapPoint(event:MouseEvent,unbounded:boolean):GridPoint|null{
    if(!svg||!binding)return null;
    const screen=svg.getScreenCTM();if(!screen)return null;
    const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(screen.inverse());
    return unbounded?imagePixelToUnboundedGridCell(binding,point.x,point.y):
      imagePixelToGridCell(binding,point.x,point.y);
  }
  function moveMap(event:PointerEvent){
    if(!shape||pinned||event.pointerType==='touch')return;
    const next=mapPoint(event,true);
    if(next&&(origin?.x!==next.x||origin?.y!==next.y))origin=next;
  }
  function clickMap(event:MouseEvent){
    if(event.detail===0)return;
    if(shape){
      const cell=mapPoint(event,true);
      if(cell){origin=cell;pinned=true;}
      return;
    }
    const cell=mapPoint(event,false);
    if(cell){
      hits=showObjects&&activeObjects?sourceObjectsAt(activeObjects,cell.x,cell.y):[];
      selectedObjectId=hits.find(o=>matchesSelectionLayer(o,selectionLayer))?.id??null;
      if(hits.length===0&&canNavigate)onNavigate(cell.x,cell.y);
    }
  }
  function keyboardMap(event:KeyboardEvent){
    if(!shape||!binding)return;
    const delta:Record<string,[number,number]>={ArrowLeft:[-1,0],
      ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    if(event.key==='Escape'){pinned=false;origin=null;return;}
    const d=delta[event.key];if(!d)return;
    event.preventDefault();
    const p=origin??{x:0,y:0};
    origin={x:Math.max(-shape.width,Math.min(binding.sizeX,p.x+d[0])),
      y:Math.max(-shape.height,Math.min(binding.sizeY,p.y+d[1]))};
    pinned=true;
  }
</script>

<div class="media-map-overlay">
  <div class="map-tools">
    <label class="file-label">マップ画像と座標対応JSON
      <input type="file" multiple accept=".webp,.json" on:change={load} aria-label="MEDIAマップと座標対応JSON"/>
    </label>
    {#if asset}
      <button type="button" on:click={reset}>解除</button>
    {/if}
    {#if raster}<button type="button" on:click={()=>{schematic=!schematic;resetCamera();}}>{schematic?'簡略マップを閉じる':'簡略マップ'}</button>{/if}
    {#if active}
      <label><input type="checkbox" bind:checked={shown}/> マス表示</label>
      <label><input type="checkbox" bind:checked={showObjects}/> 原本オブジェクト</label>
    {/if}
  </div>
  {#if loading}<p role="status">マップ読み込み中…</p>
  {:else if error}<p role="alert">{error}</p>
  {:else if active&&binding}
    <div class="camera-tools" role="group" aria-label="マップ拡大・移動">
      <button type="button" aria-label="縮小" disabled={zoom===1} on:click={()=>setZoom(zoom/2)}>−</button>
      <button type="button" aria-label="拡大" disabled={zoom===64} on:click={()=>setZoom(zoom*2)}>＋</button>
      <button type="button" on:click={resetCamera}>全体</button>
      {#if zoom>1}
        <button type="button" aria-label="左へ移動" on:click={()=>pan(-.4,0)}>←</button>
        <button type="button" aria-label="上へ移動" on:click={()=>pan(0,-.4)}>↑</button>
        <button type="button" aria-label="下へ移動" on:click={()=>pan(0,.4)}>↓</button>
        <button type="button" aria-label="右へ移動" on:click={()=>pan(.4,0)}>→</button>
      {/if}
    </div>
    {#if showObjects&&activeObjects}
      <div class="layer-tools" role="group" aria-label="選択対象レイヤー">
        {#each availableLayers as layer}
          <button type="button" class:chosen={selectionLayer===layer} aria-pressed={selectionLayer===layer}
            on:click={()=>changeSelectionLayer(layer)}>{MAP_LAYER_LABELS[layer]}</button>
        {/each}
      </div>
    {/if}
    <button type="button" class="map" on:click={clickMap} on:pointermove={moveMap}
      on:keydown={keyboardMap} aria-label="MEDIAマップ上の原本Grid座標を選択">
      <svg bind:this={svg} viewBox={camera} aria-hidden="true">
        {#if schematic}<rect width={imageWidth} height={imageHeight} fill="#303d38"/>
        {:else if asset}<image href={asset.url} width={imageWidth} height={imageHeight}/>{/if}
        {#if shown&&maskUrl}
          <image class="cell-mask" href={maskUrl} width={binding.sizeX}
            height={binding.sizeY} preserveAspectRatio="none"
            transform={'matrix('+binding.gridToImage.join(' ')+')'}/>
        {/if}
        <g transform={'matrix('+binding.gridToImage.join(' ')+')'}>
          <path class="grid-lines" d={lines} fill="none" stroke="#e8efff" stroke-opacity=".45"
            stroke-width=".7" vector-effect="non-scaling-stroke"/>
          {#if showObjects&&activeObjects}
            {#each orderedObjects as object (object.id)}
              {@const objectShape=object.shapeKey?activeObjects.shapes[object.shapeKey]:null}
              <g class="source-map-object" data-object-id={object.id} data-layer={object.layer}
                transform={'translate('+object.x+' '+object.y+')'}>
                {#if objectShape}
                  <path class="object-shape" d={objectShape.path} fill={selectedObjectId===object.id?'#d6eaff':MAP_LAYER_COLORS[object.layer]}
                    fill-opacity={selectedObjectId===object.id?.85:matchesSelectionLayer(object,selectionLayer)?.46:.23}
                    stroke={selectedObjectId===object.id?'#d6eaff':MAP_LAYER_COLORS[object.layer]} stroke-width=".7" vector-effect="non-scaling-stroke"/>
                  <path class="object-direction" d="M0 -.32L.19 .13L0 .04L-.19 .13Z"
                    transform={'translate(.5 .5) rotate('+sourceOrientationAngle(object.orientationCode)+')'} fill="#fff"/>
                {:else}
                  <circle cx=".5" cy=".5" r=".22" fill={MAP_LAYER_COLORS[object.layer]} stroke="#fff" stroke-width=".6" vector-effect="non-scaling-stroke"/>
                {/if}
                {#if object.surfaceCapable}
                  <circle class="surface-cue" cx=".78" cy=".22" r=".13" fill="#dbc2f6" stroke="#5d466f" stroke-width=".6" vector-effect="non-scaling-stroke"/>
                {/if}
              </g>
            {/each}
          {/if}
          {#each cells as cell (cell.x+','+cell.y)}
            <rect class="placement-cell" data-evidence={cell.evidence} data-x={cell.x} data-y={cell.y}
              x={cell.x} y={cell.y} width="1" height="1" fill={previewCellColor(cell)}
              fill-opacity=".7" stroke={previewCellColor(cell)} stroke-width="1"
              vector-effect="non-scaling-stroke"/>
          {/each}
        </g>
      </svg>
    </button>
    {#if schematic}<p>原本Gridの簡略図（ワールド上の位置・地形画像は未対応）。</p>{/if}
    {#if showObjects&&activeObjects}
      <p>原本の初期配置 {activeObjects.objects.length}/{activeObjects.totalCount}件
        {#if activeObjects.unresolvedCount}・形状不明 {activeObjects.unresolvedCount}件{/if}
        {#if activeObjects.omittedCount}・表示省略 {activeObjects.omittedCount}件{/if}。
        現在のセーブ配置・上下関係・占有判定ではありません。</p>
      <p>選択対象を切り替えても他のレイヤーは表示します。紫の点は支持面に置ける原本属性（実際の上下関係は未確認）。</p>
      {#if hits.length}
        <div class="object-picker" role="group" aria-label="同じマスの原本オブジェクト">
          {#each orderedHits as hit (hit.id)}
            <button type="button" class:chosen={hit.id===selectedObjectId}
              on:click={()=>selectedObjectId=hit.id}>{hit.name??'名称未確認'} · {MAP_LAYER_LABELS[hit.layer]}{hit.surfaceCapable&&hit.layer!=='surface'?'・支持面対応':''} · 向き {hit.orientationCode}</button>
          {/each}
        </div>
      {/if}
      {#if selectedObject}
        <p class="selected-object">{selectedObject.name??'名称未確認'} ／ ({selectedObject.x}, {selectedObject.y})
          ／ {selectedObject.orientationName??('向き '+selectedObject.orientationCode)}
          ／ {selectedObject.shapeKey?(activeObjects.shapes[selectedObject.shapeKey].cellCount+' 原本形状マス'):'形状未確認'}</p>
      {/if}
    {:else if showObjects&&objectMap?.status==='incompatible_grid_factor'}
      <p>Gridの座標倍率が未対応のため、初期配置を重ねていません。</p>
    {/if}
    {#if shape}
      <div class="preview-tools">
        <span>配置プレビュー（保存なし）</span>
        {#if pinned}<button type="button" on:click={()=>pinned=false}>追従を再開</button>{/if}
        {#if origin}<span>({origin.x}, {origin.y}) ／ 床・範囲警告 {warningCount}マス</span>{/if}
        {#if pinned&&origin&&binding&&origin.x>=0&&origin.y>=0&&origin.x<binding.sizeX&&origin.y<binding.sizeY}
          <button type="button" on:click={()=>{if(origin)onInspect(origin.x,origin.y);}}>原本レイヤーを確認</button>
        {/if}
      </div>
      <p>赤：床属性不一致・原本Grid範囲外。灰：ゲーム内配置判定未確認。クリックで固定、矢印キーで移動。</p>
    {/if}
    <p>{candidateMask?'緑：家具形状と床属性の一致候補':'地形属性マスク'}。原本GridData座標のみ。
      読み込んだ座標対応情報の正しさと実際の設置可否は未検証です。</p>
  {:else if asset}
    <p>選択中のGridに対応する座標情報がありません。</p>
  {/if}
</div>
<style>
  .media-map-overlay{display:grid;gap:8px;min-width:0;max-width:100%;margin:12px 0}
  .map-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12px}
  .file-label{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0;max-width:100%}
  input[type=file]{max-width:100%;min-width:0;width:240px;font:inherit}
  .map-tools button{font:inherit;color:inherit;background:#ffffff12;border:1px solid #ffffff30;border-radius:5px;padding:5px}
  .map{padding:0;background:#181620;border:1px solid #ffffff24;border-radius:7px;width:100%;min-width:0;overflow:hidden;line-height:0;cursor:crosshair}
  svg{display:block;width:100%;height:auto;max-height:75vh}
  .cell-mask{image-rendering:pixelated}
  .grid-lines,.placement-cell,.source-map-object{pointer-events:none}
  .camera-tools,.object-picker,.layer-tools{display:flex;flex-wrap:wrap;gap:5px}
  .camera-tools button,.object-picker button,.layer-tools button{font:inherit;font-size:12px;color:inherit;background:#ffffff12;border:1px solid #ffffff30;border-radius:5px;padding:5px 8px}
  .object-picker .chosen,.layer-tools .chosen{border-color:#9cc9f3;background:#6c9bc944}
  .selected-object{color:#d6eaff}
  .preview-tools{display:flex;align-items:center;flex-wrap:wrap;gap:8px;font-size:12px}
  .preview-tools button{font:inherit;color:inherit;background:#ffffff12;border:1px solid #ffffff30;border-radius:5px;padding:5px}
  p{font-size:11px;color:#b9abc7;margin:0}
</style>
