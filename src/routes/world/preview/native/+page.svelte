<script lang="ts">
 import {type ImageSource} from '$lib/media/native-map-renderer.ts';
 import {openNativePreviewPack} from '$lib/media/native-cdn-preview.ts';
 import {browser} from '$app/environment';
 import {base} from '$app/paths';
 import {nativePreviewSession} from '$lib/media/native-preview-session.ts';
 import {nativeEditorExtent,editorViewToNativeCanvas,type LocalNativeMap} from '$lib/media/native-local-preview.ts';
 import {defaultMapCamera,mapCameraViewBox,mapViewportBounds,wheelMapCamera,createMapPanGesture,zoomMapCamera,panMapCamera} from '$lib/world/map-camera.ts';
 import {nativeLandmarkMeasurement,nativeLandmarkReport,nativeLandmarkSessionKey,setNativeLandmarks,nativeLandmarkSessionReport,type NativeLandmark,type NativeLandmarkSession} from '$lib/media/native-map-landmark.ts';
 import {readTransitionWitnesses,witnessesForMap,type TransitionWitnessMap,type TransitionWitness} from '$lib/media/native-transition-witness.ts';
 import {selectNativeAreaLayers} from '$lib/media/native-map-area-rules.ts';
 import {localSaveSession} from '$lib/ui/local-save-session.ts';
 import {hasNativeGridLockStates} from '$lib/media/native-map-save-area-flags.ts';
 import NativeMapSaveAreas from '$lib/world/NativeMapSaveAreas.svelte';
 import {nativeCalibrationScope} from '$lib/world/native-calibration-grids.ts';
 import NativeCalibrationOverlay from '$lib/world/NativeCalibrationOverlay.svelte';
 import NativeMapCanvas from '$lib/world/NativeMapCanvas.svelte';
 import MapCameraControls from '$lib/world/MapCameraControls.svelte';
 const initial=browser?nativePreviewSession.get():null;
 const initialMap=(ms:readonly LocalNativeMap[])=>ms.find(m=>m.id==='MapVillage04')?.id??ms[0]?.id??'';
 let maps:readonly LocalNativeMap[]=initial?.maps??[],map:LocalNativeMap|null=null,source:ImageSource|null=initial?.source??null,selected=initialMap(maps),locked=false;
 let camera=defaultMapCamera(),svg:SVGSVGElement;
 let error='',status:'drawing'|'ready'|'error'='drawing',ticket=0;
 let measurements:NativeLandmarkSession=new Map();
 let points:readonly NativeLandmark[]=[];
 $: points=map&&!overrides.size?measurements.get(nativeLandmarkSessionKey(map.id,locked))??[]:[];
 $: measurementCount=[...measurements.values()].reduce((n,p)=>n+p.length,0);
 function updatePoints(next:readonly NativeLandmark[]){if(map&&!overrides.size)measurements=setNativeLandmarks(measurements,map,locked,next);}
 function resetReference(){knownX=undefined;knownZ=undefined;reference='';reportError='';}
 let witnessDoc:ReadonlyMap<string,TransitionWitnessMap>|null=null,witnesses:readonly TransitionWitness[]=[],witnessId='',showWitness=false,witnessError='',witnessTicket=0;
 let witness:TransitionWitness|undefined;
 $: updateWitnesses(map,witnessDoc);
 $: witness=witnesses.find(w=>w.component===witnessId);
 function updateWitnesses(m:LocalNativeMap|null,doc:ReadonlyMap<string,TransitionWitnessMap>|null){
  witnesses=[];witnessId='';witnessError='';
  if(!m||!doc)return;
  try{witnesses=witnessesForMap(m,doc);}catch(e){witnessError=e instanceof Error?e.message:'比較点の読み込み失敗';}
 }
 async function openWitnesses(event:Event){
  const input=event.currentTarget as HTMLInputElement,file=input.files?.[0];input.value='';if(!file)return;
  const revision=++witnessTicket;witnessError='';
  try{const doc=await readTransitionWitnesses(file);if(revision===witnessTicket)witnessDoc=doc;}
  catch(e){if(revision===witnessTicket)witnessError=e instanceof Error?e.message:'比較点の読み込み失敗';}
 }
 function clearWitnesses(){++witnessTicket;witnessDoc=null;showWitness=false;}
 let overrides=new Map<number,boolean>();
 let appliedSave:File|null=null;
 $: if(appliedSave&&$localSaveSession.file!==appliedSave)resetAreas();
 $: states=new Map((map?.areaPlan?.areaTypes??[]).map(id=>[id,overrides.get(id)??locked]));
 $: drawLayers=map?(map.areaPlan?selectNativeAreaLayers(map.locked,map.areaPlan,states):locked?map.locked:map.unlocked):[];
 $: stateKey=map?.id+':'+locked+':'+[...states].map(([id,value])=>id+'='+Number(value)).join(',');
 function toggleArea(id:number,value:boolean){overrides=new Map(overrides).set(id,value);resetReference();}
 function resetAreas(){overrides=new Map();appliedSave=null;resetReference();}
 function applySavedAreas(value:Map<number,boolean>,file:File){if($localSaveSession.file!==file)return;overrides=value;appliedSave=file;resetReference();}
 let knownX:number|undefined,knownZ:number|undefined,reference='',reportError='';
 $: lastPoint=points.at(-1);
 $: lastMeasurement=map&&lastPoint?nativeLandmarkMeasurement(map,lastPoint):null;
 let showTerrain=false,terrainOpacity=.35,terrainStatus:'loading'|'ready'|'error'='loading';
 $: terrainScope=map?nativeCalibrationScope(map.id):null;
 const maxZoom=64,gesture=createMapPanGesture();
 $: map=maps.find(m=>m.id===selected)??null;
 $: extent=map?nativeEditorExtent(map):{x:0,y:0,w:1,h:1};
 $: viewport=mapViewportBounds(camera,extent);
 $: viewBox=mapCameraViewBox(camera,extent);
 async function open(event:Event){
  const input=event.currentTarget as HTMLInputElement,files=Array.from(input.files??[]);input.value='';
  const revision=++ticket;error='';
  try{
   const {maps:next,source:provider}=await openNativePreviewPack(files);
   if(revision!==ticket)return;
   nativePreviewSession.set({maps:next,source:provider});maps=next;source=provider;measurements=new Map();selected=initialMap(next);camera=defaultMapCamera();resetAreas();status='drawing';
  }catch(e){if(revision===ticket)error=e instanceof Error?e.message:'読み込み失敗';}
 }
 function clear(){ticket++;nativePreviewSession.clear();maps=[];source=null;measurements=new Map();selected='';resetAreas();error='';}
 function changeMap(event:Event){selected=(event.currentTarget as HTMLSelectElement).value;camera=defaultMapCamera();status='drawing';resetAreas();}
 function attachReference(){
  if(!map||!lastPoint||typeof knownX!=='number'||typeof knownZ!=='number'||!Number.isFinite(knownX)||!Number.isFinite(knownZ)||!reference.trim())return;
  const p={...lastPoint,worldXZ:[knownX,knownZ] as const,reference:reference.trim()};
  try{nativeLandmarkMeasurement(map,p);updatePoints([...points.slice(0,-1),p]);knownX=undefined;knownZ=undefined;reference='';reportError='';}catch(e){reportError=e instanceof Error?e.message:'比較点の座標が無効です';}
 }
 function focusWitness(){
  if(!witness)return;
  const zoom=Math.max(camera.zoom,8),x=(2*witness.worldXZ[0]-extent.x)/extent.w,y=(-2*witness.worldXZ[1]-extent.y)/extent.h;
  camera=panMapCamera({...camera,zoom},x-camera.x,y-camera.y);
 }
 async function exportSession(){
  if(!measurementCount)return;
  reportError='';
  try{
   const report=await nativeLandmarkSessionReport(maps,measurements);
   const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
   const a=document.createElement('a');a.href=url;a.download='native-map-landmarks-session.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){reportError=e instanceof Error?e.message:'検証記録の保存に失敗しました';}
 }
 async function exportLandmarks(){
  if(!map||!points.length||overrides.size)return;
  reportError='';
  try{
   const report=await nativeLandmarkReport(map,locked,points);
   const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
   const a=document.createElement('a');a.href=url;a.download=report.mapId+'-landmarks.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){reportError=e instanceof Error?e.message:'検証記録の保存に失敗しました';}
 }
 function beginPan(e:PointerEvent){
  if(!e.isPrimary||!(e.button===0||e.button===1))return;
  e.preventDefault();
  gesture.begin(e,camera.zoom>1);
  if(camera.zoom>1){try{svg.setPointerCapture(e.pointerId);}catch{/* pointer ended */}}
 }
 function endPan(e:PointerEvent){
  gesture.end(e);
  if(svg?.hasPointerCapture(e.pointerId)){try{svg.releasePointerCapture(e.pointerId);}catch{/* pointer ended */}}
 }
 function mark(e:MouseEvent){
  if(gesture.consumeClick()||status!=='ready'||!svg||overrides.size)return;
  const transform=svg.getScreenCTM();if(!transform)return;
  const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(transform.inverse());
  if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<viewport.x||p.y<viewport.y||p.x>viewport.x+viewport.w||p.y>viewport.y+viewport.h)return;
  if(!map)return;
  const point:NativeLandmark=witness?{x:p.x,y:p.y,worldXZ:witness.worldXZ,reference:witness.reference}:{x:p.x,y:p.y};try{nativeLandmarkMeasurement(map,point);}catch{return;}
  const existing=witness?points.findIndex(p=>p.reference===witness?.reference):-1;
  if(existing<0&&points.length>=512){reportError='測定点の上限に達しました。';return;}
  updatePoints(existing<0?[...points,point]:points.map((p,i)=>i===existing?point:p));resetReference();
 }
</script>
<svelte:head><title>Native map — local preview</title></svelte:head>
<div class="preview">
 <div class="tools">
  <label>ローカル検証素材 <input type="file" multiple accept=".json,.png,.webp" on:change={open}/></label>
  {#if map&&source}
   <button type="button" on:click={clear}>素材を解除</button>
   <a href={base+'/world/?native-map=1'}>World Editorで確認</a>
   <select aria-label="World" value={selected} on:change={changeMap}>{#each maps as m}<option value={m.id}>{m.id}</option>{/each}</select>
   <label><input type="checkbox" bind:checked={locked} on:change={resetAreas}/> 全区画を未解放として表示</label>
   <button type="button" disabled={!points.length} on:click={()=>updatePoints([])}>現在のマップの検証マーカー消去</button>
   <details><summary>原本の区画遷移座標と比較</summary>
    <div class="tools">
     <label>原本比較点 JSON <input type="file" accept=".json" on:change={openWitnesses}/></label>
     {#if witnessDoc}<button type="button" on:click={clearWitnesses}>比較点を解除</button>{/if}
     {#if witnesses.length}
      <select aria-label="原本の比較点" bind:value={witnessId}><option value="">比較点を選択</option>{#each witnesses as w}<option value={w.component}>{w.name} ({w.worldXZ[0].toFixed(2)}, {w.worldXZ[1].toFixed(2)})</option>{/each}</select>
      <label><input type="checkbox" bind:checked={showWitness}/> 候補位置を表示</label>
      <button type="button" disabled={!witness} on:click={focusWitness}>比較点へ移動</button>
     {/if}
    </div>
    {#if witnessError}<p role="alert">{witnessError}</p>{:else if witnessDoc}<p>{witnesses.length} 件。選択後、背景画像上の対応する位置をクリックすると残差を記録します。候補位置は校正結果ではありません。</p>{/if}
   </details>
   <button type="button" disabled={!points.length||status!=='ready'||overrides.size>0} on:click={exportLandmarks}>現在のマップの検証座標を保存</button>
   <button type="button" disabled={!measurementCount} on:click={exportSession}>全マップの検証記録を保存 ({measurementCount})</button>
   {#if map.areaPlan?.areaTypes.length}<details><summary>区画別の解放状態（検証）</summary><div class="tools">{#each map.areaPlan.areaTypes as id}<label><input type="checkbox" checked={states.get(id)} on:change={e=>toggleArea(id,e.currentTarget.checked)}/> {map.areaPlan.gridStateLabels?.[id-1]??('区画 '+id)} 未解放</label>{/each}<button type="button" on:click={resetAreas}>個別設定を解除</button></div><p>{appliedSave?'保存フラグによる試験表示（実行時判定未確認）':'手動指定・セーブ判定ではありません。'} 個別設定中は新規座標測定を無効にします。既存の測定は保持します。</p></details>{/if}
   {#if map&&hasNativeGridLockStates(map.id)&&!map.areaPlan?.gridStateLabels}<p>旧マニフェストでは海中の個別グリッドを切り替えられません。</p>{/if}
   {#if map.areaPlan?.areaTypes.length&&!hasNativeGridLockStates(map.id)}<NativeMapSaveAreas mapId={map.id} areaTypes={map.areaPlan.areaTypes} onApply={applySavedAreas}/>{/if}
   {#if terrainScope}<label><input type="checkbox" bind:checked={showTerrain}/> 原本地形を重ねる</label>
    {#if showTerrain}<label>地形の濃さ <input type="range" min="0" max="1" step=".05" bind:value={terrainOpacity}/></label>{/if}
   {/if}
  {/if}
 </div>
 {#if error}<p role="alert">{error}</p>{/if}
 {#if map&&source}
  <div class="frame">
   <NativeMapCanvas layers={drawLayers} view={editorViewToNativeCanvas(map,viewport)} {source} activeKey={stateKey} onStatus={s=>status=s}/>
   <svg bind:this={svg} viewBox={viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Editor coordinate candidate"
     on:wheel|nonpassive={e=>camera=wheelMapCamera(e,svg,extent,camera,maxZoom)}
     on:pointerdown={beginPan} on:dragstart|preventDefault
     on:pointermove={e=>{const next=gesture.move(e,svg,extent,camera);if(next)camera=next;}}
     on:pointerup={endPan} on:pointercancel={endPan} on:lostpointercapture={e=>gesture.end(e)} on:pointerleave={()=>gesture.leave()}
     on:click={mark}>
    <rect x={viewport.x} y={viewport.y} width={viewport.w} height={viewport.h} fill="transparent" pointer-events="all"/>
    {#if showTerrain&&terrainScope}{#key map.id}<NativeCalibrationOverlay mapId={map.id} scope={terrainScope} opacity={terrainOpacity} onStatus={s=>terrainStatus=s}/>{/key}{/if}
    {#if status==='ready'}
     {#if showWitness&&witness}<circle cx={2*witness.worldXZ[0]} cy={-2*witness.worldXZ[1]} r={Math.min(viewport.w,viewport.h)*.012} fill="none" stroke="#00e5ff" vector-effect="non-scaling-stroke" stroke-width="2" pointer-events="none"/>{/if}
     {#each points as p}<rect x={p.x-.5} y={p.y-.5} width="1" height="1" fill="#ffd84d" fill-opacity=".5" stroke="white" vector-effect="non-scaling-stroke" stroke-width="1" pointer-events="none"/>{/each}
    {/if}
   </svg>
   <MapCameraControls zoom={camera.zoom} {maxZoom} onZoom={v=>camera=zoomMapCamera(camera,v,maxZoom)} onFit={()=>camera=defaultMapCamera()} onPan={(dx,dy)=>camera=panMapCamera(camera,dx/camera.zoom,dy/camera.zoom)}/>
  </div>
  {#if lastMeasurement}
   <div class="landmark-details">
    <p>候補座標 X {lastMeasurement.candidateWorldXZ[0].toFixed(3)} / Z {lastMeasurement.candidateWorldXZ[1].toFixed(3)} ・画像 {lastMeasurement.canvasPixels[0].toFixed(2)}, {lastMeasurement.canvasPixels[1].toFixed(2)} px</p>
    <details><summary>独立した原本座標との比較（任意）</summary>
     <div class="tools">
      <label>X <input type="number" step="any" bind:value={knownX}/></label>
      <label>Z <input type="number" step="any" bind:value={knownZ}/></label>
      <label>出典 <input maxlength="200" bind:value={reference}/></label>
      <button type="button" disabled={typeof knownX!=='number'||typeof knownZ!=='number'||!reference.trim()} on:click={attachReference}>比較点を記録</button>
     </div>
     {#if 'distanceHalfWorldTicks' in lastMeasurement}<p>候補との距離: {lastMeasurement.distanceHalfWorldTicks?.toFixed(3)} 半ワールド単位。入力した座標の正しさは未確認。</p>{/if}
    </details>
   </div>
  {/if}
  {#if reportError}<p role="alert">{reportError}</p>{/if}
  {#if showTerrain&&terrainScope}<p role="status">{terrainStatus==='loading'?'原本地形を読み込み中…':terrainStatus==='error'?'原本地形の読み込みに失敗しました':'原本地形を表示中（設置可否・座標校正は未確定）'}</p>{/if}
  <p role="status">{status==='drawing'?'描画中…':status==='error'?'描画エラー':'描画済み'}。クリックで検証マーカーと候補座標を表示します。</p>
 {:else}
  <p>ローカル検証ZIPを展開し、manifest.json と全画像を選択してください。CDN照合済みの場合は manifest.json のみ選択します。</p>
 {/if}
 <p>原本座標の検証用。画像は端末内のみで処理します。正式な座標校正・セーブ編集ではありません。</p>
</div>
<style>
 .preview{display:flex;flex-direction:column;gap:6px;padding:8px}
 .tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
 .frame{position:relative;min-height:300px;height:70vh;min-width:0;overflow:hidden;user-select:none;background:#181820}
 svg{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair;user-select:none;-webkit-user-drag:none}
 .landmark-details{display:grid;gap:4px}.landmark-details input{max-width:130px}
 p{margin:0;font-size:12px}
</style>
