<script lang="ts">
 import {onDestroy} from 'svelte';
 import type {WandLanguage} from '../ui/preferences.ts';
 import type {MainlandSavedObject} from './mainland-saved-objects.ts';
 import type {MainlandGrid} from './mainland-world-coordinates.ts';
 import type {TerrainRaster} from './terrain-binding.ts';
 import type {SourceObjectShape} from './source-object-map.ts';
 import {parseSupportTree,supportItems,supportExtent,supportShapeKey,supportParentCandidate,supportParentEligible,supportWords,supportChildEdits,childEditWords,supportFreeEdit,supportFreeWords,supportStockPlacement,supportStockPickup,supportStockWords,type SupportStockPlan,type SupportChildEdit,type SupportTree,type SupportParentCandidate} from './subgrid-local.ts';
 import {parseFurnitureStock} from './furniture-stock-view.ts';
 import {experimentalCopyDownload} from './experimental-copy.ts';
 import {commitWorldCheckpoint} from '../ui/local-save-session';
 import {CARDINAL_ORIENTATIONS,isCardinal} from './saved-map-transform.ts';
 import {worldArtwork} from './world-artwork.ts';
 export let open=false,parent:MainlandSavedObject|null=null,file:File|null=null,worker:Worker|null=null;
 export let grids:readonly MainlandGrid[]=[],rasters:ReadonlyMap<string,TerrainRaster>=new Map();
 export let names:ReadonlyMap<number,string>=new Map(),base='',locale:WandLanguage='en';
 export let canMove=false,nextRequest:()=>number,onClose:()=>void;
 export let placing=false,ghost:SupportParentCandidate|null=null;
 let activeFile:File|null=null,activeOrdinal=0,activeOpen=false,own:Worker|null=null,subscribed:Worker|null=null;
 let stack:SupportTree[]=[],path:number[]=[],owners:number[]=[],selected=-1,swap=false,free=false,freeDraft=false,edits:SupportChildEdit[]|null=null,editable=new Set<number>(),terrain:TerrainRaster|null=null;
 let supportSvg:SVGSVGElement;
 let counts=new Map<number,number>(),removable=new Set<number>(),catalogRequest=0,stockCatalog:{itemId:number;name:string}[]=[],stockQuery='',stockOpen=false,stockId=0,stockPlacing=false,stockOrientation:typeof CARDINAL_ORIENTATIONS[number]='GridOrientation_Down',stockDraft:SupportStockPlan|null=null;
 $: stw=supportStockWords[locale];
 $: stockOptions=stockCatalog.filter(o=>o.name.normalize('NFKC').toLocaleLowerCase().includes(stockQuery.normalize('NFKC').toLocaleLowerCase().trim())).slice(0,200);
 $: pickup=tree&&selected>=0?supportStockPickup(tree,selected,counts,removable):null;
 $: stockShape=stockId?shapes[stockId+':'+CARDINAL_ORIENTATIONS.indexOf(stockOrientation)*4]:null;
 let tree:SupportTree|null=null,shapes:Readonly<Record<string,SourceObjectShape>>={},request=0,loading=false,error=false;
 let images=new Map<number,string>(),imageEpoch=0,copy:ReturnType<typeof experimentalCopyDownload>|null=null;
 $: words=supportWords[locale];
 $: cw=childEditWords[locale];
 $: sw=supportFreeWords[locale];
 $: left=tree&&selected>=0?turnCandidate(tree,shapes,editable,terrain,selected,-1):null;
 $: right=tree&&selected>=0?turnCandidate(tree,shapes,editable,terrain,selected,1):null;
 $: freeEligible=!!terrain&&!!tree&&selected>=0&&!!tree.objects[selected]&&!tree.objects[selected].child&&editable.has(tree.objects[selected].itemId)&&isCardinal(tree.objects[selected].orientation);
 $: partners=tree&&selected>=0?tree.objects.map((_,i)=>supportChildEdits(tree!,shapes,editable,selected,i,1)?i:-1).filter(i=>i>=0):[];
 $: extent=tree&&terrain?{x:-.5,y:-.5,w:terrain.sizeX*tree.factor+1,h:terrain.sizeY*tree.factor+1}:tree?supportExtent(tree,shapes):{x:0,y:0,w:1,h:1};
 $: if(open!==activeOpen||file!==activeFile||(parent?.object.localOrdinal??0)!==activeOrdinal)refresh(open,file,parent);
 $: if(worker!==subscribed){subscribed?.removeEventListener('message',receive);subscribed=worker;subscribed?.addEventListener('message',receive);if(tree)requestShapes(tree);}
 function stopOwn(){own?.terminate();own=null;}
 function clearCopy(){if(copy)URL.revokeObjectURL(copy.url);copy=null;}
 export function cancel(){placing=false;ghost=null;edits=null;swap=false;free=false;freeDraft=false;stockDraft=null;stockPlacing=false;stockOpen=false;stockId=0;stopOwn();clearCopy();loading=false;error=false;}
 function refresh(show:boolean,source:File|null,p:MainlandSavedObject|null){
  cancel();request=0;activeOpen=show;activeFile=source;activeOrdinal=p?.object.localOrdinal??0;stack=[];path=[];owners=[];selected=-1;tree=null;terrain=null;shapes={};editable=new Set();removable=new Set();counts=new Map();stockCatalog=[];catalogRequest=0;images=new Map();imageEpoch++;
  if(!show||!source||!p?.object.subgrid)return;
  loading=true;
  const session=new Worker(new URL('./subgrid-local.worker.ts',import.meta.url),{type:'module'});own=session;
  const finish=(d:unknown)=>{session.terminate();if(own!==session||activeFile!==source||activeOrdinal!==p.object.localOrdinal)return;own=null;loading=false;try{const row=d as {kind?:string;result?:unknown;stock?:unknown};if(row?.kind!=='subgrid-local')throw Error('receipt');const root=parseSupportTree(row.result);try{counts=parseFurnitureStock(row.stock);}catch{counts=new Map();}stack=[root];owners=[Number(p.object.itemId)];showTree(root);}catch{error=true;}};
  session.onmessage=e=>finish(e.data);session.onerror=()=>finish(null);session.onmessageerror=()=>finish(null);
  session.postMessage({command:'inspect-subgrid',file:source,parent:{localOrdinal:p.object.localOrdinal,itemId:Number(p.object.itemId),x:p.object.x,y:p.object.y}});
 }
 function showTree(t:SupportTree){selected=-1;swap=false;free=false;freeDraft=false;edits=null;stockDraft=null;stockPlacing=false;stockOpen=false;stockId=0;stockCatalog=[];catalogRequest=0;tree=t;terrain=null;shapes={};editable=new Set();removable=new Set();requestShapes(t);requestCatalog(t);const epoch=++imageEpoch;images=new Map();for(const id of new Set(t.objects.map(o=>o.itemId))){void worldArtwork(base,id).then(url=>{if(url&&epoch===imageEpoch)images=new Map(images).set(id,url);}).catch(()=>{});}}
 function requestShapes(t:SupportTree){request=0;if(!worker)return;const items=supportItems(t);if(stockId)for(const orientationCode of [0,4,8,12])items.push({itemId:stockId,orientationCode});if(!items.length&&!t.sourcePath)return;request=nextRequest();worker.postMessage({command:'support-shapes',requestId:request,factor:t.factor,items,sourcePath:t.sourcePath,ownerItemId:owners[owners.length-1]});}
 function requestCatalog(t:SupportTree){catalogRequest=0;if(!worker||!t.sourcePath||!counts.size)return;catalogRequest=nextRequest();worker.postMessage({command:'support-catalog',requestId:catalogRequest,sourcePath:t.sourcePath,ownerItemId:owners[owners.length-1],locale,itemIds:[...counts].filter(([,n])=>n>0).map(([id])=>id)});}
 function chooseStock(id:number,orientation:typeof CARDINAL_ORIENTATIONS[number]='GridOrientation_Down'){if(!tree||!terrain||!canMove||loading||copy||!stockCatalog.some(o=>o.itemId===id)||!(counts.get(id)!>0))return;stockId=id;stockOrientation=orientation;stockDraft=null;stockPlacing=true;stockOpen=false;selected=-1;free=false;swap=false;edits=null;error=false;requestShapes(tree);const epoch=imageEpoch;void worldArtwork(base,id).then(url=>{if(url&&epoch===imageEpoch)images=new Map(images).set(id,url);}).catch(()=>{});}
 function cancelStock(){stockDraft=null;stockId=0;stockPlacing=false;stockOpen=false;error=false;}
 function beginPickup(){if(!pickup||loading||copy||!canMove)return;cancelStock();edits=null;free=false;swap=false;stockDraft=pickup;}
 function receive(e:MessageEvent){const d=e.data;if(catalogRequest&&d?.requestId===catalogRequest){catalogRequest=0;if(d.kind==='support-catalog'&&Array.isArray(d.items))stockCatalog=d.items;return;}if(!request||d?.requestId!==request)return;request=0;if(d.kind==='support-shapes'&&d.shapes&&typeof d.shapes==='object'&&Array.isArray(d.editable)){shapes=d.shapes;editable=new Set(d.editable.filter(Number.isSafeInteger));removable=new Set(Array.isArray(d.removable)?d.removable.filter(Number.isSafeInteger):[]);terrain=d.terrain?.nativeFloorValues instanceof Uint32Array?d.terrain:null;}}
 function descend(t:SupportTree,index:number){if(loading||copy)return;path=[...path,index];owners=[...owners,tree!.objects[index].itemId];stack=[...stack,t];showTree(t);}
 function back(){if(stack.length<2||loading||copy)return;path=path.slice(0,-1);owners=owners.slice(0,-1);stack=stack.slice(0,-1);showTree(stack[stack.length-1]);}
 function selectChild(index:number){if(loading||copy||placing||ghost||stockPlacing||stockDraft)return;if(swap&&tree){const next=supportChildEdits(tree,shapes,editable,selected,index,1);if(next){edits=next;swap=false;}return;}selected=index;edits=null;free=false;freeDraft=false;}
 function turnCandidate(t:SupportTree,s:Readonly<Record<string,SourceObjectShape>>,e:ReadonlySet<number>,r:TerrainRaster|null,i:number,turn:-1|1){const exact=supportChildEdits(t,s,e,i,null,turn);if(exact)return exact;const o=t.objects[i];if(!r||!o||!isCardinal(o.orientation))return null;return supportFreeEdit(t,s,e,r,i,o.x,o.y,CARDINAL_ORIENTATIONS[(CARDINAL_ORIENTATIONS.indexOf(o.orientation)+turn+4)%4]);}
 function beginChild(next:SupportChildEdit[]|null){if(!canMove||!next||loading||copy||placing||ghost)return;freeDraft=!!terrain&&!!tree&&next.length===1&&!supportChildEdits(tree,shapes,editable,selected,null,-1)?.some(e=>e.orientation===next[0].orientation)&&!supportChildEdits(tree,shapes,editable,selected,null,1)?.some(e=>e.orientation===next[0].orientation);edits=next;swap=false;free=false;error=false;}
 function pickChild(e:MouseEvent){if((!free&&!stockPlacing)||!terrain||!tree||!canMove||!supportSvg||loading||copy)return;const m=supportSvg.getScreenCTM();if(!m)return;const q=new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse());if(stockPlacing){const plan=supportStockPlacement(tree,shapes,terrain,stockId,counts.get(stockId)??0,Math.floor(q.x),Math.floor(q.y),stockOrientation);error=!plan;if(plan){stockDraft=plan;stockPlacing=false;}return;}if(selected<0)return;const o=tree.objects[selected];const next=supportFreeEdit(tree,shapes,editable,terrain,selected,Math.floor(q.x),Math.floor(q.y),o.orientation);error=!next;if(next){edits=next;freeDraft=true;free=false;}}
 function validateChild(){
  if(!canMove||(!edits&&!stockDraft)||!file||file!==activeFile||!parent||own||!open)return;
  const source=file,chosen=edits,stock=stockDraft;loading=true;error=false;clearCopy();
  const session=new Worker(new URL('./subgrid-local.worker.ts',import.meta.url),{type:'module'});own=session;
  const finish=(d:any)=>{session.terminate();if(own!==session||activeFile!==source||edits!==chosen||stockDraft!==stock){d?.bytes?.fill(0);return;}own=null;loading=false;try{if(d?.kind!=='support-child-copy')throw Error('copy');copy=experimentalCopyDownload(d,source);}catch{error=true;}};
  session.onmessage=e=>finish(e.data);session.onerror=()=>finish(null);session.onmessageerror=()=>finish(null);session.postMessage({command:'support-child-copy',file:source,allowExperimentalCopy:true,plan:{localOrdinal:parent.object.localOrdinal,itemId:Number(parent.object.itemId),expectedX:parent.object.x,expectedY:parent.object.y,path,...(stock?{stock,...(stock.action==='place'&&tree?.sourcePath?{terrainPath:tree.sourcePath}:{})}:{edits:chosen,...(freeDraft&&tree?.sourcePath?{terrainPath:tree.sourcePath}:{})})}});
 }
 function begin(){if(!canMove||!supportParentEligible(parent)||!tree||loading)return;clearCopy();cancelStock();edits=null;swap=false;free=false;freeDraft=false;ghost=null;error=false;placing=true;}
 export function pick(point:{x:number;y:number}){if(!placing||!parent||!canMove)return;ghost=supportParentCandidate(parent,grids,rasters,point.x,point.y);error=!ghost;if(ghost)placing=false;}
 function validate(){
  if(!canMove||!ghost||!file||file!==activeFile||own||!open)return;
  const source=file,plan=ghost;loading=true;error=false;clearCopy();
  const session=new Worker(new URL('./subgrid-local.worker.ts',import.meta.url),{type:'module'});own=session;
  const finish=(d:any)=>{session.terminate();if(own!==session||activeFile!==source||ghost!==plan){d?.bytes?.fill(0);return;}own=null;loading=false;try{if(d?.kind!=='support-parent-copy')throw Error('copy');copy=experimentalCopyDownload(d,source);}catch{error=true;}};
  session.onmessage=e=>finish(e.data);session.onerror=()=>finish(null);session.onmessageerror=()=>finish(null);session.postMessage({command:'support-parent-copy',file:source,allowExperimentalCopy:true,plan:plan.plan});
 }
 function apply(){if(!canMove||!copy||!file||file!==activeFile||!commitWorldCheckpoint(file,copy.file)){error=true;return;}onClose();}
 onDestroy(()=>{cancel();subscribed?.removeEventListener('message',receive);imageEpoch++;});
</script>
{#if open&&parent}
 <aside class="support-panel" aria-label={words[0]}>
  <header><strong>{words[0]} · {parent.object.subgrid?.objectCount??'—'}</strong><button type="button" on:click={onClose} aria-label={words[7]}>×</button></header>
  {#if loading}<small role="status">{words[12]}</small>{/if}
  {#if tree}
   <div class="support-heading">{#if stack.length>1}<button type="button" on:click={back}>{words[11]}</button>{/if}<strong>{words[1]}</strong></div>
   {#if tree.objects.length||terrain}
    <button type="button" class="support-map-button" disabled={!free&&!stockPlacing} aria-label={sw[1]} on:click={pickChild}><svg bind:this={supportSvg} class="support-map" viewBox={extent.x+' '+extent.y+' '+extent.w+' '+extent.h} aria-label={words[1]} role="img">
     {#if terrain}{#each Array.from(terrain.nativeFloorValues) as cell,i}<rect x={(i%terrain.sizeX)*tree.factor} y={Math.floor(i/terrain.sizeX)*tree.factor} width={tree.factor} height={tree.factor} fill={cell?'#6ba98b':'#8b5555'} fill-opacity=".35" stroke="currentColor" stroke-opacity=".3" vector-effect="non-scaling-stroke"/>{/each}{/if}
     {#each tree.objects as o,i}
      {@const change=edits?.find(e=>e.index===i)}
      {@const effective=change?{...o,x:change.x,y:change.y,orientation:change.orientation}:o}
      {@const key=supportShapeKey(effective)}
      {@const shape=key?shapes[key]:null}
      <g transform={'translate('+effective.x+' '+effective.y+')'} opacity={stockDraft?.action==='pickup'&&stockDraft.index===i?0.3:1}>
       {#if shape}<path d={shape.path} fill={selected===i||change?'#4bddcd':'var(--wand-menu)'} stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke"/>{#if images.has(o.itemId)}<image href={images.get(o.itemId)} width={shape.width} height={shape.height} preserveAspectRatio="xMidYMid meet"/>{/if}{:else}<rect width="1" height="1" fill="none" stroke="currentColor" stroke-dasharray="2 2" vector-effect="non-scaling-stroke"/>{/if}
       {#if o.child}<circle cx={(shape?.width??1)/2} cy={(shape?.height??1)/2} r=".2" fill="#b98bd6"/>{/if}
      </g>
     {/each}
     {#if stockDraft?.action==='place'&&stockShape}<g transform={'translate('+stockDraft.x+' '+stockDraft.y+')'}><path d={stockShape.path} fill="#4bddcd" stroke="currentColor" vector-effect="non-scaling-stroke"/><image href={images.get(stockDraft.itemId)} width={stockShape.width} height={stockShape.height} preserveAspectRatio="xMidYMid meet"/></g>{/if}
    </svg></button>
    <div class="support-list">{#each tree.objects as o,i}
     <div class="support-row" class:selected-row={selected===i}>{#if images.has(o.itemId)}<img src={images.get(o.itemId)} alt="" loading="lazy"/>{/if}<button class="child-select" type="button" aria-pressed={selected===i} disabled={loading||!!copy||swap&&!partners.includes(i)} on:click={()=>selectChild(i)}>{names.get(o.itemId)??'—'}</button>{#if o.child}<button type="button" disabled={loading||!!copy} on:click={()=>descend(o.child!,i)}>{words[0]} · {o.child.objects.length}</button>{/if}</div>
    {/each}</div>
   {:else}<small>{words[9]}</small>{/if}
   <small>{words[10]}</small>
   {#if canMove&&selected>=0&&!placing&&!ghost&&!copy&&!stockPlacing&&!stockDraft&&!stockOpen}<div class="child-actions"><button type="button" disabled={!left||loading||!!edits||swap} on:click={()=>beginChild(left)}>{cw[0]}</button><button type="button" disabled={!right||loading||!!edits||swap} on:click={()=>beginChild(right)}>{cw[1]}</button><button type="button" disabled={!partners.length||loading||!!edits||swap} on:click={()=>{swap=true;edits=null;}}>{cw[2]}</button>{#if pickup}<button type="button" disabled={loading||!!edits||free||swap} on:click={beginPickup}>{stw[2]}</button>{/if}{#if terrain&&stockCatalog.some(o=>o.itemId===tree?.objects[selected]?.itemId)&&isCardinal(tree.objects[selected].orientation)}<button type="button" disabled={loading||!!edits||free||swap} on:click={()=>chooseStock(tree!.objects[selected].itemId,tree!.objects[selected].orientation as typeof CARDINAL_ORIENTATIONS[number])}>{stw[3]}</button>{/if}{#if terrain}<button type="button" disabled={!freeEligible||loading||!!edits||swap||free} on:click={()=>{free=true;freeDraft=false;error=false;}}>{sw[0]}</button>{/if}</div><small>{free?sw[1]:swap?cw[3]:terrain?sw[2]:sw[3]}</small>{#if edits}<button type="button" disabled={loading} on:click={validateChild}>{cw[5]}</button>{/if}{#if edits||swap||free}<button type="button" disabled={loading} on:click={()=>{edits=null;swap=false;free=false;freeDraft=false;}}>{words[11]}</button>{/if}{/if}
   {#if canMove&&terrain&&!placing&&!ghost&&!copy&&!free&&!edits&&!swap&&!stockDraft&&!stockPlacing}<button type="button" disabled={loading||!stockCatalog.length} on:click={()=>{stockOpen=!stockOpen;stockQuery='';}}>{stw[0]}</button>{/if}
   {#if stockOpen&&canMove}<input type="search" bind:value={stockQuery} placeholder={stw[6]} aria-label={stw[6]}/><div class="support-list">{#each stockOptions as item}<button type="button" on:click={()=>chooseStock(item.itemId)}>{item.name} · {counts.get(item.itemId)}</button>{/each}</div>{/if}
   {#if stockPlacing}<small>{stw[4]}</small>{#if images.has(stockId)}<img class="stock-image" src={images.get(stockId)} alt=""/>{/if}<div class="child-actions"><button type="button" on:click={()=>stockOrientation=CARDINAL_ORIENTATIONS[(CARDINAL_ORIENTATIONS.indexOf(stockOrientation)+3)%4]}>{cw[0]}</button><button type="button" on:click={()=>stockOrientation=CARDINAL_ORIENTATIONS[(CARDINAL_ORIENTATIONS.indexOf(stockOrientation)+1)%4]}>{cw[1]}</button><button type="button" on:click={cancelStock}>{words[11]}</button></div>{/if}
   {#if stockDraft&&!copy}<small>{stockDraft.expectedStock} → {stockDraft.expectedStock+(stockDraft.action==='place'?-1:1)}</small><button type="button" disabled={loading} on:click={validateChild}>{cw[5]}</button><button type="button" disabled={loading} on:click={cancelStock}>{words[11]}</button>{/if}
   {#if canMove&&supportParentEligible(parent)}
    {#if placing}<small role="status">{words[3]}</small>{:else if !ghost&&!edits&&!swap&&!copy&&!free&&!stockOpen&&!stockPlacing&&!stockDraft}<button type="button" disabled={loading} on:click={begin}>{words[2]}</button>{/if}
    {#if ghost&&!copy}<button type="button" disabled={loading} on:click={validate}>{words[4]}</button>{/if}
   {/if}
   {#if copy&&canMove}<button type="button" on:click={apply}>{words[5]}</button><a href={copy.url} download={copy.name}>{words[6]}</a>{/if}
  {/if}
  {#if error}<small role="alert">{words[8]}</small>{/if}
 </aside>
{/if}
<style>
 .support-panel{position:absolute;top:52px;right:8px;z-index:8;width:min(320px,90%);max-height:calc(100% - 100px);overflow:auto;display:grid;gap:7px;padding:8px;background:var(--wand-card);color:var(--wand-text);border:1px solid var(--wand-line);border-radius:6px}
 header,.support-heading,.support-row{display:flex;align-items:center;gap:6px;justify-content:space-between}
 .stock-image{width:40px;height:40px;object-fit:contain}.support-map-button{padding:0;display:block;border:0;width:100%;background:none}.support-map-button:disabled{opacity:1;cursor:default}.support-map{display:block;width:100%;height:180px;background:var(--wand-menu);border:1px solid var(--wand-line)}
 .support-list{display:grid;gap:3px;max-height:180px;overflow:auto}.support-row{justify-content:flex-start}.support-row img{width:32px;height:32px;object-fit:contain}.support-row .child-select{flex:1;text-align:left}.selected-row{outline:1px solid var(--wand-line)}.child-actions{display:flex;flex-wrap:wrap;gap:4px}
 button,a{font:inherit;color:inherit;background:var(--wand-menu);border:1px solid var(--wand-line);padding:5px;border-radius:4px}small{font-size:.8em}
</style>
