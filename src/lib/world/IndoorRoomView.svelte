<script lang="ts">
 import {onMount,onDestroy} from 'svelte';
 import {base} from '$app/paths';
 import {browser} from '$app/environment';
 import {testSaveExportEnabled,testSaveWords} from './test-save-export.ts';
 import {stockToolWords} from './save-furniture-placement.ts';
 import {experimentalCopyDownload} from './experimental-copy.ts';
 import {localSaveSession,commitWorldCheckpoint} from '../ui/local-save-session';
 import {checkpointWords} from './world-checkpoint-words.ts';
 import {openCurrentItemDatabase,type ItemMasterRecord,type CompleteItemMasterRecord} from '../items/public-item-master.ts';
 import {worldArtwork} from './world-artwork.ts';
 import {parseIndoorRooms,parseOwnedFinishes,verifyFinishReceipt,indoorWords,finishWords,positionWords,indoorPositionPlot,indoorShapeWords,type IndoorRoom,type IndoorSurface} from './indoor-room-view.ts';
 import type {SourceObjectShape} from './source-object-map.ts';
 import type {WandLanguage} from '../ui/preferences';
 export let file:File|null,locale:WandLanguage='ja',onClose:()=>void;
 export let terrainWorker:Worker|null=null,nextRequest:()=>number,blocked=false;
 let seen:File|null=null,own:Worker|null=null,rooms:IndoorRoom[]=[],status:'loading'|'ready'|'error'='loading',selected=0,surface=0,query='',limit=80;
 let positionOpen=false,highlight:number|null=null;
 $: pw=positionWords[locale]??positionWords.en;
 let shapes:Readonly<Record<string,SourceObjectShape>>={},shapeRequest=0,shapeWorker:Worker|null=null;
 $: if(terrainWorker!==shapeWorker){shapeWorker?.removeEventListener('message',receiveShapes);shapeWorker=terrainWorker;shapeWorker?.addEventListener('message',receiveShapes);}
 $: requestShapes(positionOpen?face:null,terrainWorker);
 $: plot=positionOpen&&face?.gridStatus==='full'&&face.positions.length<=5000?indoorPositionPlot(face.positions,highlight,shapes):null;
 function requestShapes(f:IndoorSurface|null,wk:Worker|null){shapeRequest=0;shapes={};if(!wk||!f?.factor||f.positions.length>5000)return;const items=f.positions.filter(p=>p.orientationCode!==null).map(p=>({itemId:p.itemId,orientationCode:p.orientationCode}));if(!items.length)return;shapeRequest=nextRequest();wk.postMessage({command:'indoor-shapes',factor:f.factor,items,requestId:shapeRequest});}
 function receiveShapes(e:MessageEvent){const d=e.data;if(!shapeRequest||d?.requestId!==shapeRequest)return;shapeRequest=0;if(d.kind==='indoor-shapes'&&d.shapes&&typeof d.shapes==='object')shapes=d.shapes;}
 let owned:number[]=[],finishOpen=false,finishChoice=0,allWalls=false,preview:Worker|null=null,previewStatus:'idle'|'working'|'valid'|'error'='idle';
 $: fw=finishWords[locale]??finishWords.en;
 $: copyWords=testSaveWords[locale]??testSaveWords.en;
 const testExport=browser&&testSaveExportEnabled(window.location);
 let finishCopy:ReturnType<typeof experimentalCopyDownload>|null=null;
 $: cw=checkpointWords[locale];
 function applyFinishCopy(){if(!testExport||blocked||!file||!finishCopy||previewStatus!=='valid')return;if(!commitWorldCheckpoint(file,finishCopy.file)){previewStatus='error';return;}cancelPreview();}
 function clearFinishCopy(){if(finishCopy)URL.revokeObjectURL(finishCopy.url);finishCopy=null;}
 function resetFinishStatus(){clearFinishCopy();previewStatus='idle';}
 $: choices=owned.filter(id=>{const item=records.get(id);return item?.itemType.code===16&&item.itemType.subtypeNameVerified&&item.itemType.subtypeCode===(surface===0?1:0);});
 $: finishLoading=finishOpen&&owned.some(id=>!resolved.has(id));
 $: wallReady=!!room&&room.surfaces.length===5&&room.surfaces.slice(1).every((s,i)=>s.wallPosition===i);
 function cancelPreview(){clearFinishCopy();preview?.terminate();preview=null;previewStatus='idle';finishChoice=0;allWalls=false;}
 function checkFinish(){runFinish(false);}
 function runFinish(exporting:boolean){
  if(!file||!room||!face||!wallReady||!choices.includes(finishChoice)||previewStatus==='working'||exporting&&(!testExport||blocked||previewStatus!=='valid'))return;
  const expected=surface===0?face.finish:room.surfaces.slice(1).map(s=>s.finish);
  if(surface===0&&typeof expected!=='number')return;
  const plan={roomOrdinal:room.ordinal,itemId:finishChoice,kind:surface===0?'floor':'wall',wall:surface===0||allWalls?null:face.wallPosition,expected};
  const current=file;preview?.terminate();clearFinishCopy();
  const own=new Worker(new URL('./indoor-room-view.worker.ts',import.meta.url),{type:'module'});preview=own;previewStatus='working';
  const done=(d:any)=>{own.terminate();if(preview!==own||file!==current){d?.bytes?.fill(0);return;}preview=null;
   if(exporting&&d?.kind==='room-finish-copy'){try{finishCopy=experimentalCopyDownload(d,current);previewStatus='valid';}catch{previewStatus='error';}return;}
   d?.bytes?.fill(0);previewStatus=!exporting&&d?.kind==='room-finish-preview'&&verifyFinishReceipt(d.result)?'valid':'error';};
  own.onmessage=e=>done(e.data);own.onerror=()=>done(null);own.onmessageerror=()=>done(null);
  own.postMessage({command:exporting?'room-finish-export':'room-finish-preview',file:current,plan,...(exporting?{allowExperimentalCopy:true}:{})});
 }

 let records=new Map<number,ItemMasterRecord|CompleteItemMasterRecord>(),images=new Map<number,string>(),asked=new Set<number>(),resolved=new Set<number>(),itemLoadFailed=false;
 let db:ReturnType<typeof openCurrentItemDatabase>|null=null,closeButton:HTMLButtonElement,root:HTMLDivElement;
 onMount(()=>{const previous=document.activeElement;closeButton?.focus();return ()=>{if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};});
 function keys(e:KeyboardEvent){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();return;}if(e.key!=='Tab')return;const controls=[...root.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href]')];if(!controls.length)return;const first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
 $: w=indoorWords[locale]??indoorWords.en;
 $: if(file!==seen)load(file);
 $: room=rooms[selected]??null;
 $: face=room?.surfaces[surface]??null;
 $: filtered=(face?.items??[]).filter(p=>name(p.itemId,records,locale,w[12]).normalize('NFKC').toLocaleLowerCase().includes(query.normalize('NFKC').toLocaleLowerCase().trim()));
 $: visible=filtered.slice(0,limit);
 $: if(room)loadItems([...room.surfaces.map(s=>s.finish),room.ceiling,...(face?.items.map(p=>p.itemId)??[]),...(finishOpen?owned:[])].filter((n):n is number=>typeof n==='number'&&n>0),[...visible.map(p=>p.itemId),...(finishOpen&&finishChoice?[finishChoice]:[])]);
 function name(id:number|null,dict:ReadonlyMap<number,ItemMasterRecord|CompleteItemMasterRecord>,lang:WandLanguage,unknown:string){return id===null?unknown:dict.get(id)?.names[lang]??dict.get(id)?.names.en??unknown;}
 function load(next:File|null){const history=$localSaveSession.worldCheckpoint,keep=!!next&&!!seen&&!!history&&history.files[history.cursor]===next;const oldRoom=selected,oldSurface=surface;seen=next;own?.terminate();own=null;rooms=[];owned=[];finishOpen=false;cancelPreview();selected=0;surface=0;query='';highlight=null;status='loading';if(!next){status='ready';return;}
  const worker=new Worker(new URL('./indoor-room-view.worker.ts',import.meta.url),{type:'module'});own=worker;
  const done=(v:unknown)=>{worker.terminate();if(own!==worker||file!==next)return;own=null;try{rooms=parseIndoorRooms(v);owned=parseOwnedFinishes(v);if(keep&&rooms[oldRoom]){selected=oldRoom;surface=Math.min(oldSurface,rooms[oldRoom].surfaces.length-1);}status='ready';}catch{status='error';}};
  worker.onmessage=e=>done(e.data?.kind==='indoor-rooms'?e.data.result:null);worker.onerror=()=>done(null);worker.onmessageerror=()=>done(null);worker.postMessage({command:'indoor-rooms',file:next});
 }
 function loadItems(ids:number[],art:number[]){const fresh=[...new Set(ids)].filter(id=>!asked.has(id));for(const id of fresh)asked.add(id);
  if(fresh.length){db??=openCurrentItemDatabase(base);void db.then(async d=>{for(let i=0;i<fresh.length;i+=128){const rows=await d.getItems(fresh.slice(i,i+128));const next=new Map(records);for(const row of rows)if(row)next.set(row.itemId,row);records=next;resolved=new Set([...resolved,...fresh.slice(i,i+128)]);}}).catch(()=>{itemLoadFailed=true;});}
  for(const id of new Set([...(room?.surfaces.map(s=>s.finish)??[]),room?.ceiling,...art]))if(typeof id==='number'&&id>0&&!images.has(id)){images=new Map(images).set(id,'');void worldArtwork(base,id).then(url=>{if(url)images=new Map(images).set(id,url);}).catch(()=>{});}
 }
 function choose(i:number){cancelPreview();finishOpen=false;selected=i;surface=0;query='';highlight=null;limit=80;}
 onDestroy(()=>{own?.terminate();cancelPreview();shapeWorker?.removeEventListener('message',receiveShapes);});
</script>
<div class="indoor-room-view" role="dialog" aria-label={w[0]} aria-modal="true" bind:this={root} on:keydown={keys}>
 <header><strong>{w[0]}</strong><button type="button" bind:this={closeButton} on:click={onClose} aria-label={w[7]}>×</button></header>
 {#if status==='loading'}<p role="status">{w[8]}</p>{:else if status==='error'}<p role="alert">{w[10]}</p>{:else if !rooms.length}<p>{w[9]}</p>{:else if room}
 <div class="room-body">
  <nav aria-label={w[3]}>{#each rooms as r,i}<button type="button" aria-pressed={i===selected} on:click={()=>choose(i)}>{w[1]} {r.house} / {w[2]} {r.floor} · {r.name||w[3]+' '+r.ordinal}</button>{/each}</nav>
  <div class="room-content">
   <div class="finish-heading"><strong>{w[15]}</strong><button type="button" disabled={!wallReady} aria-pressed={finishOpen} on:click={()=>{cancelPreview();finishOpen=!finishOpen;}}>{fw[0]}</button></div>
   <div class="finishes">
    {#each room.surfaces as s,i}<button type="button" class="finish-card" aria-pressed={surface===i} on:click={()=>{cancelPreview();surface=i;query='';highlight=null;limit=80;}}><span>{i===0?w[4]:w[5]+' '+i}</span>{#if s.finish&&images.get(s.finish)}<img src={images.get(s.finish)} alt="" loading="lazy"/>{/if}<small>{s.finish===0?w[11]:name(s.finish,records,locale,w[12])}</small></button>{/each}
    <div class="finish-card"><span>{w[6]}</span>{#if room.ceiling&&images.get(room.ceiling)}<img src={images.get(room.ceiling)} alt="" loading="lazy"/>{/if}<small>{room.ceiling===0?w[11]:name(room.ceiling,records,locale,w[12])}</small></div>
   </div>
   {#if finishOpen}<div class="finish-picker">{#if surface>0}<label><input type="checkbox" bind:checked={allWalls} disabled={previewStatus==='working'} on:change={resetFinishStatus}/> {fw[2]}</label>{/if}<select aria-label={fw[0]} bind:value={finishChoice} disabled={previewStatus==='working'} on:change={resetFinishStatus}><option value={0} disabled>{fw[0]}</option>{#each choices as id}<option value={id}>{name(id,records,locale,w[12])}</option>{/each}</select>{#if finishChoice&&images.get(finishChoice)}<img class="finish-preview-art" src={images.get(finishChoice)} alt=""/>{/if}<button type="button" disabled={!choices.includes(finishChoice)||previewStatus==='working'} on:click={checkFinish}>{fw[3]}</button>{#if itemLoadFailed}<small role="alert">{w[10]}</small>{:else if finishLoading}<small role="status">{w[8]}</small>{:else if !choices.length}<small>{fw[6]}</small>{/if}{#if previewStatus!=='idle'}<small role="status">{previewStatus==='valid'?fw[4]:previewStatus==='working'?fw[7]:fw[5]}</small>{/if}{#if testExport&&previewStatus==='valid'&&blocked}<small>{stockToolWords[locale][12]}</small>{:else if testExport&&previewStatus==='valid'}<small>{copyWords[1]}</small><button type="button" on:click={()=>runFinish(true)}>{copyWords[0]}</button>{#if finishCopy}<button type="button" on:click={applyFinishCopy}>{cw[0]}</button><a class="test-copy-link" href={finishCopy.url} download={finishCopy.name}>{copyWords[2]}</a>{/if}{/if}</div>{/if}
   <div class="room-items-header"><strong>{w[13]}{#if face?.gridStatus==='full'} · {face.items.reduce((n,p)=>n+p.quantity,0)}{/if}</strong><button type="button" aria-pressed={positionOpen} on:click={()=>positionOpen=!positionOpen}>{pw[0]}</button><input type="search" aria-label={w[17]} placeholder={w[17]} bind:value={query} on:input={()=>limit=80}/></div>
   {#if face?.gridStatus!=='full'}<p>{w[16]}</p>{:else}
    {#if positionOpen}<section class="position-map" aria-label={pw[0]}><small>{plot?.footprints.length?indoorShapeWords[locale]:pw[2]}</small>{#if face.missingPositions}<small>{pw[3]}: {face.missingPositions}</small>{/if}{#if face.positions.length>5000}<small>{pw[6]}</small>{:else if plot}<svg viewBox={plot.viewBox} role="img" aria-label={pw[2]}><title>{plot.footprints.length?indoorShapeWords[locale]:pw[2]}</title>{#each plot.footprints as f}<path class="indoor-footprint" class:highlighted={highlight===f.itemId} class:dimmed={highlight!==null&&highlight!==f.itemId} d={f.path} transform={'translate('+f.x+' '+f.y+')'}/>{/each}{#each plot.points as p (p.x+':'+p.y)}<circle cx={p.x} cy={p.y} r={plot.markerRadius} class:highlighted={p.selected>0} class:dimmed={highlight!==null&&!p.selected}><title>{pw[4]}: {p.count}</title></circle>{/each}</svg><small>{pw[5]}</small>{/if}</section>{/if}
    <div class="room-items" on:scroll={e=>{const el=e.currentTarget;if(el.scrollTop+el.clientHeight>=el.scrollHeight-100)limit=Math.min(filtered.length,limit+80);}}>
     {#each visible as item (item.itemId)}<button type="button" class="room-item" aria-pressed={highlight===item.itemId} on:click={()=>{highlight=highlight===item.itemId?null:item.itemId;positionOpen=true;}}>{#if images.get(item.itemId)}<img src={images.get(item.itemId)} alt="" loading="lazy"/>{/if}<span>{name(item.itemId,records,locale,w[12])}</span><strong>×{item.quantity}</strong></button>{/each}
    </div>
   {/if}
  </div>
 </div>
 {/if}
 <footer>{w[14]}</footer>
</div>
<style>
 .indoor-room-view{position:absolute;inset:0;z-index:22;background:var(--wand-bg);color:var(--wand-text);display:flex;flex-direction:column;min-width:0;overflow:hidden;padding:8px;gap:6px}
 header,.finish-heading,.room-items-header{display:flex;align-items:center;gap:6px}header strong,.room-items-header strong{flex:1}button,input,select{font:inherit;color:inherit;background:var(--wand-menu);border:1px solid var(--wand-line);border-radius:5px;padding:5px}button[aria-pressed=true]{outline:2px solid var(--wand-accent)}.finish-picker{display:flex;align-items:center;gap:5px;flex-wrap:wrap}.test-copy-link{color:var(--wand-accent);padding:5px;border:1px solid var(--wand-line);border-radius:5px}.finish-picker select{max-width:min(240px,100%)}.finish-preview-art{width:48px;height:48px;object-fit:contain}.room-body{display:flex;flex:1;min-height:0;gap:8px}nav{width:min(220px,35%);display:flex;flex-direction:column;gap:4px;overflow:auto}nav button{text-align:start;overflow-wrap:anywhere}.room-content{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;gap:6px}.finishes{display:flex;gap:5px;overflow:auto;flex:none;max-height:40%}.finish-card{min-width:100px;max-width:145px;display:flex;flex-direction:column;align-items:center;gap:3px;background:var(--wand-card);padding:5px;border-radius:5px}.finish-card img{width:64px;height:64px;object-fit:contain}.finish-card small{text-align:center;overflow-wrap:anywhere}.position-map{display:flex;flex-direction:column;gap:2px;min-height:0;flex:1;background:var(--wand-card);border:1px solid var(--wand-line);border-radius:5px;padding:4px}.position-map svg{width:100%;flex:1;min-height:40px;max-height:35vh}.indoor-footprint{fill:var(--wand-muted);fill-opacity:.45;stroke:var(--wand-line);stroke-width:1;vector-effect:non-scaling-stroke}.indoor-footprint.highlighted{fill:var(--wand-accent);stroke:var(--wand-text)}.indoor-footprint.dimmed{opacity:.25}.position-map circle{fill:var(--wand-muted)}.position-map circle.highlighted{fill:var(--wand-accent);stroke:var(--wand-text);stroke-width:1;vector-effect:non-scaling-stroke}.position-map circle.dimmed{opacity:.25}.position-map small{font-size:11px;color:var(--wand-muted)}.room-items{flex:1;min-height:0;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(105px,1fr));gap:4px;align-content:start}.room-item{display:flex;flex-direction:column;align-items:center;text-align:center;background:var(--wand-card);border-radius:5px;padding:4px;overflow-wrap:anywhere;font-size:12px}.room-item img{width:52px;height:52px;object-fit:contain}footer{font-size:12px;color:var(--wand-muted)}@media(max-width:600px){.room-body{flex-direction:column}nav{width:100%;max-height:24%;flex-direction:row;flex-wrap:wrap}.room-items-header input{width:45%}}
</style>
