<script lang="ts">
  import {onDestroy} from 'svelte';
  import {parseMapCalibration,findMapBinding,matchesMapImage,imagePixelToGridCell,
    imagePixelToUnboundedGridCell,type MapCalibration,type GridMapBinding,type GridMapIdentity}
    from './media-map-calibration.ts';
  import {nativeSourceFloorTint} from './native-terrain-canvas.ts';
  import {previewSourceCells,previewCellColor,gridLinePath,type GridPoint,type PreviewShape} from './source-placement-preview.ts';
  import type {NativeFloorWindowResult} from './native-floor-rectangle-window.ts';
  type Selection=GridMapIdentity&{platform:string;gameVersion:string;regionKey:string;viewKey:string};
  type Raster={sizeX:number;sizeY:number;nativeFloorValues:Uint32Array};
  export let selection:Selection|null=null;
  export let raster:Raster|null=null;
  export let candidates:NativeFloorWindowResult|null=null;
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
    loading=false;error='';origin=null;pinned=false;clearAsset();
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
  $: binding=asset&&selection&&raster&&raster.sizeX===selection.sizeX&&
    raster.sizeY===selection.sizeY?findMapBinding(asset.calibration,selection):null;
  $: active=Boolean(asset&&binding&&raster);
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
    if(cell&&canNavigate)onNavigate(cell.x,cell.y);
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
    {#if active}
      <label><input type="checkbox" bind:checked={shown}/> マス表示</label>
    {/if}
  </div>
  {#if loading}<p role="status">マップ読み込み中…</p>
  {:else if error}<p role="alert">{error}</p>
  {:else if active&&asset&&binding}
    <button type="button" class="map" on:click={clickMap} on:pointermove={moveMap}
      on:keydown={keyboardMap} aria-label="MEDIAマップ上の原本Grid座標を選択">
      <svg bind:this={svg} viewBox={'0 0 '+asset.calibration.image.width+' '+asset.calibration.image.height}
        aria-hidden="true">
        <image href={asset.url} width={asset.calibration.image.width}
          height={asset.calibration.image.height}/>
        {#if shown&&maskUrl}
          <image class="cell-mask" href={maskUrl} width={binding.sizeX}
            height={binding.sizeY} preserveAspectRatio="none"
            transform={'matrix('+binding.gridToImage.join(' ')+')'}/>
        {/if}
        <g transform={'matrix('+binding.gridToImage.join(' ')+')'}>
          <path class="grid-lines" d={lines} fill="none" stroke="#e8efff" stroke-opacity=".45"
            stroke-width=".7" vector-effect="non-scaling-stroke"/>
          {#each cells as cell (cell.x+','+cell.y)}
            <rect class="placement-cell" data-evidence={cell.evidence} data-x={cell.x} data-y={cell.y}
              x={cell.x} y={cell.y} width="1" height="1" fill={previewCellColor(cell)}
              fill-opacity=".7" stroke={previewCellColor(cell)} stroke-width="1"
              vector-effect="non-scaling-stroke"/>
          {/each}
        </g>
      </svg>
    </button>
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
  .grid-lines,.placement-cell{pointer-events:none}
  .preview-tools{display:flex;align-items:center;flex-wrap:wrap;gap:8px;font-size:12px}
  .preview-tools button{font:inherit;color:inherit;background:#ffffff12;border:1px solid #ffffff30;border-radius:5px;padding:5px}
  p{font-size:11px;color:#b9abc7;margin:0}
</style>
