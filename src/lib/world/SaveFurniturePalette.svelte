<script lang="ts">
 import {onDestroy} from 'svelte';
 import {base} from '$app/paths';
 import {browser} from '$app/environment';
 import {rememberReplayStep} from './checkpoint-journal.ts';
 import {commitWorldCheckpoint} from '../ui/local-save-session';
 import {checkpointWords} from './world-checkpoint-words.ts';
 import {testSaveExportEnabled,testSaveWords} from './test-save-export.ts';
 import {worldArtwork} from './world-artwork.ts';
 import {parseFurnitureStock} from './furniture-stock-view.ts';
 import {stockToolWords,stockFootprintWords,stockFootprintFeedback,ordinaryFurniture,landscapeId,landscapeSourceEligible,stockSourceEligible,stockPickup,stockPlacement,buildingSourceEligible,buildingDuplicate,buildingPickup,buildingPlacementSources,initialBuildingEligible,initialBuildingPlacement,type StockCandidate} from './save-furniture-placement.ts';
 import {CARDINAL_ORIENTATIONS,EIGHT_WAY_ORIENTATIONS,isCardinal,isEightWay,worldOrientationCode,type EightWay} from './saved-map-transform.ts';
 import type {DesignCatalogItem,DesignItemGeometry} from './design-layout.ts';
 import type {MainlandGrid} from './mainland-world-coordinates.ts';
 import type {MainlandSavedObject} from './mainland-saved-objects.ts';
 import type {TerrainRaster} from './terrain-binding.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 export let open=false,file:File|null=null,worker:Worker|null=null,grids:readonly MainlandGrid[]=[],rasters:ReadonlyMap<string,TerrainRaster>=new Map(),chosen:MainlandSavedObject|null=null;
 export let locale:WandLanguage='ja',blocked=false,canStart=true,nextRequest:()=>number,onBegin:()=>void=()=>{},onClose:()=>void=()=>{};
 export let placing=false,ghost:StockCandidate|null=null;
 export let objects:readonly MainlandSavedObject[]=[],omitted=0,freePlacement=false;
 let lastFree=false;
 $: if(freePlacement!==lastFree){lastFree=freePlacement;catalogLocale=null;if(!freePlacement)buildingMode=false;cancel();}
 let landscapeMode=false,buildingMode=false,catalogMode=false,catalogBuildings=false;
 let catalog:DesignCatalogItem[]=[],counts:Map<number,number>|null=null,query='',limit=80;
 let catalogState:'idle'|'loading'|'ready'|'error'='idle',stockState:'idle'|'loading'|'ready'|'error'='idle';
 let detached=new Set<number>(),houseState:'idle'|'loading'|'ready'|'error'='idle',ownHouses:Worker|null=null;
 let ownStock:Worker|null=null,ownPreview:Worker|null=null,seenFile:File|null=null,subscribed:Worker|null=null,catalogRequest=0,catalogLocale:WandLanguage|null=null;
 let shapeRequests=new Map<number,{factor:1|2;key:string}>(),definitions=new Map<number,DesignItemGeometry>(),itemId=0,source:MainlandSavedObject|null=null,orientation:EightWay='GridOrientation_Down';
 let point:{x:number;y:number}|null=null,candidate:StockCandidate|null=null,status:'idle'|'working'|'valid'|'error'='idle',stockChange:{before:number;after:number}|null=null;
 let artwork=new Map<number,string>(),asked=new Set<number>();
 const testExport=browser&&testSaveExportEnabled(window.location);
 let copyUrl='',copyName='',copyFile:File|null=null;
 $: cw=checkpointWords[locale];
 function applyCopy(){if(!testExport||!file||!copyFile||blocked||!canStart||status!=='valid')return;if(!commitWorldCheckpoint(file,copyFile)){status='error';return;}cancel();}
 $: tw=testSaveWords[locale]??testSaveWords.en;
 function clearCopy(){if(copyUrl)URL.revokeObjectURL(copyUrl);copyUrl='';copyName='';copyFile=null;}
 $: w=stockToolWords[locale]??stockToolWords.en;
 const landscapeWords={ja:['景観・樹木','景観を複製','景観を撤去','在庫は変更しません'],en:['Landscaping','Duplicate landscape','Remove landscape','Inventory unchanged'],fr:['Paysage','Dupliquer le paysage','Retirer le paysage','Inventaire inchangé'],it:['Paesaggio','Duplica paesaggio','Rimuovi paesaggio','Inventario invariato'],de:['Landschaft','Landschaft duplizieren','Landschaft entfernen','Inventar unverändert'],'es-ES':['Paisaje','Duplicar paisaje','Retirar paisaje','Inventario sin cambios'],'zh-CN':['景观与树木','复制景观','移除景观','库存不变'],'pt-BR':['Paisagem','Duplicar paisagem','Remover paisagem','Inventário inalterado']} as const;
 $: lw=landscapeWords[locale];
 const houseWords={ja:['家の外観を複製','内装は保持されます。最後の外観は再配置可能な場合のみ撤去できます。','外観のみ撤去'],en:['Duplicate house exterior','Interior is retained. Last exterior removal requires a recoverable interior.','Remove exterior only'],fr:['Dupliquer la maison','Intérieur conservé. Dernier extérieur : intérieur récupérable requis.','Retirer l’extérieur'],it:['Duplica esterno casa','Interno conservato. Ultimo esterno: interno recuperabile richiesto.','Rimuovi esterno'],de:['Hausfassade duplizieren','Innenraum bleibt erhalten. Letzte Fassade nur bei wiederherstellbarem Innenraum.','Nur Fassade entfernen'],'es-ES':['Duplicar exterior','Interior conservado. El último exterior requiere un interior recuperable.','Retirar solo exterior'],'zh-CN':['复制房屋外观','保留室内空间。仅可移除能够重新放置的最后一个外观。','仅移除外观'],'pt-BR':['Duplicar exterior da casa','Interior preservado. O último exterior exige interior recuperável.','Remover só o exterior']} as const;
 const buildingTab={ja:['建物','既存建物の複製・対応する建物の新規配置（テスト）'],en:['Buildings','Copy existing or place supported new buildings (test)'],fr:['Bâtiments','Copier ou placer des bâtiments compatibles (test)'],it:['Edifici','Copia o posiziona edifici compatibili (test)'],de:['Gebäude','Gebäude kopieren oder neu platzieren (Test)'],'es-ES':['Edificios','Copiar o colocar edificios compatibles (prueba)'],'zh-CN':['建筑','复制或新建支持的建筑（测试）'],'pt-BR':['Edifícios','Copiar ou colocar edifícios compatíveis (teste)']} as const;
 const buildingWords={ja:['建物を複製','内部状態を検証して外観を編集します','建物を撤去'],en:['Duplicate building','Building state is checked before editing','Remove building'],fr:['Dupliquer le bâtiment','État vérifié avant modification','Retirer le bâtiment'],it:['Duplica edificio','Stato verificato prima della modifica','Rimuovi edificio'],de:['Gebäude duplizieren','Zustand wird vor Bearbeitung geprüft','Gebäude entfernen'],'es-ES':['Duplicar edificio','Estado comprobado antes de editar','Retirar edificio'],'zh-CN':['复制建筑','编辑前验证建筑状态','移除建筑'],'pt-BR':['Duplicar edifício','Estado verificado antes de editar','Remover edifício']} as const;
 $: hw=Math.floor(Number((candidate?.plan.itemId??source?.object.itemId??chosen?.object.itemId)??0)/100000)===205?houseWords[locale]:buildingWords[locale];
 $: houseCandidate=!!candidate&&[200,201,202,203,205].includes(Math.floor(Number(candidate.plan.itemId)/100000));
 $: canRemoveHouse=!!buildingPickup(chosen,objects);
 $: landscapeCandidate=!!candidate&&landscapeId(Number(candidate.plan.itemId));
 $: ow=stockFootprintWords[locale]??stockFootprintWords.en;
 $: footprint=candidate&&candidate.plan.action!=='remove'?stockFootprintFeedback(candidate,objects,omitted):null;
 $: if(file!==seenFile)resetFile(file);
 $: if(worker!==subscribed){subscribed?.removeEventListener('message',receive);subscribed=worker;subscribed?.addEventListener('message',receive);catalogRequest=0;catalogLocale=null;catalogState='idle';cancel();}
 $: if(open&&file&&!landscapeMode&&!buildingMode&&stockState==='idle')loadStock(file);
 $: if(open&&file&&buildingMode&&houseState==='idle')loadDetached(file);
 $: if(open&&worker&&grids.length&&(catalogLocale!==locale||catalogMode!==landscapeMode||catalogBuildings!==buildingMode))loadCatalog(worker,grids[0],locale,landscapeMode,buildingMode);
 $: if(!open||blocked||!canStart)cancel();
 $: normalized=query.normalize('NFKC').toLocaleLowerCase().trim();
 $: buildingSources=buildingPlacementSources(grids,objects);
 $: items=catalog.filter(o=>(buildingMode?o.nativeType==='Building'&&(buildingSources.has(o.itemId)||grids.some(g=>initialBuildingEligible(o.itemId,g,detached))):landscapeMode?o.layer==='landscape'&&landscapeId(o.itemId):o.layer==='furniture'&&ordinaryFurniture(o.itemId)&&(counts?.get(o.itemId)??0)>0)&&o.name.normalize('NFKC').toLocaleLowerCase().includes(normalized));
 $: visible=items.slice(0,limit);
 $: if(open)loadArtwork(visible);
 $: ghost=candidate??(placing&&point?(freePlacement&&buildingSourceEligible(source)?buildingDuplicate(grids,rasters,source,point.x,point.y,orientation,definitions):freePlacement&&buildingMode&&!source?initialBuildingPlacement(grids,rasters,definitions,itemId,orientation,point.x,point.y,detached):stockPlacement(grids,rasters,definitions,itemId,orientation,point.x,point.y,source,freePlacement)):null);
 function resetFile(next:File|null){cancel();ownStock?.terminate();ownStock=null;ownHouses?.terminate();ownHouses=null;detached=new Set();houseState='idle';counts=null;stockState='idle';seenFile=next;}
 function loadDetached(f:File){
  houseState='loading';const own=new Worker(new URL('./furniture-stock-view.worker.ts',import.meta.url),{type:'module'});ownHouses=own;
  const finish=(d:any)=>{own.terminate();if(ownHouses!==own||file!==f)return;ownHouses=null;const r=d?.result;
   if(d?.kind==='detached-houses'&&r?.contract==='wand.db05.detached-player-houses@1'&&r.writerAuthorized===false&&Array.isArray(r.itemIds)&&r.itemIds.length<=128&&r.itemIds.every((n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&Math.floor(n/100000)===205)){
    detached=new Set<number>(r.itemIds);houseState='ready';
   }else{detached=new Set();houseState='error';}
  };
  own.onmessage=e=>finish(e.data);own.onerror=()=>finish(null);own.onmessageerror=()=>finish(null);own.postMessage({command:'read-detached-houses',file:f});
 }
 function loadArtwork(rows:readonly DesignCatalogItem[]){for(const row of rows){if(asked.has(row.itemId))continue;asked.add(row.itemId);void worldArtwork(base,row.itemId).then(url=>{if(url)artwork=new Map(artwork).set(row.itemId,url);}).catch(()=>{});}}
 function loadStock(f:File){stockState='loading';const own=new Worker(new URL('./furniture-stock-view.worker.ts',import.meta.url),{type:'module'});ownStock=own;
  const finish=(raw:unknown)=>{own.terminate();if(ownStock!==own||file!==f)return;ownStock=null;try{counts=parseFurnitureStock(raw);stockState='ready';}catch{counts=null;stockState='error';}};
  own.onmessage=e=>finish(e.data?.kind==='furniture-stock'?e.data.result:null);own.onerror=()=>finish(null);own.onmessageerror=()=>finish(null);own.postMessage({command:'read-furniture-stock',file:f});
 }
 function loadCatalog(own:Worker,g:MainlandGrid,l:WandLanguage,landscape:boolean,buildings:boolean){catalogLocale=l;catalogMode=landscape;catalogBuildings=buildings;catalogState='loading';catalog=[];catalogRequest=nextRequest();own.postMessage({command:'design-catalog',key:g.key,locale:l,requestId:catalogRequest,landscapeOnly:landscape,allowBuildings:buildings,freePlacement});}
 function setPaletteMode(mode:'furniture'|'landscape'|'building'){cancel();landscapeMode=mode==='landscape';buildingMode=mode==='building'&&freePlacement&&testExport;query='';limit=80;}
 function receive(e:MessageEvent){const d=e.data;
  if(d?.requestId===catalogRequest){catalogRequest=0;if(d.kind==='design-catalog'&&Array.isArray(d.items)){catalog=d.items;catalogState='ready';limit=80;}else catalogState='error';return;}
  const request=shapeRequests.get(d?.requestId);if(!request)return;
  shapeRequests.delete(d.requestId);shapeRequests=new Map(shapeRequests);
  if(d.kind!=='design-shape'||d.key!==request.key||d.result?.itemId!==itemId){cancel();status='error';return;}
  definitions=new Map(definitions).set(request.factor,d.result as DesignItemGeometry);
 }
 export function cancel(){clearCopy();ownPreview?.terminate();ownPreview=null;placing=false;candidate=null;point=null;shapeRequests=new Map();definitions=new Map();itemId=0;source=null;status='idle';stockChange=null;}
 function begin(id:number,duplicate:MainlandSavedObject|null=null){
  if(blocked||!canStart||!open||!file||!worker||(landscapeId(id)?!testExport||(duplicate?(!landscapeSourceEligible(duplicate,freePlacement)||!freePlacement&&duplicate.object.editRestrictions?.move!=='allowedFlag'):!landscapeMode||!catalog.some(o=>o.itemId===id&&o.layer==='landscape')):!ordinaryFurniture(id)||(counts?.get(id)??0)<1))return;
  cancel();onBegin();itemId=id;source=duplicate;orientation=duplicate&&isEightWay(duplicate.object.orientation)&&(freePlacement||isCardinal(duplicate.object.orientation))?duplicate.object.orientation:'GridOrientation_Down';placing=true;
  const seen=new Set<number>();for(const g of grids){if(seen.has(g.factor))continue;seen.add(g.factor);const requestId=nextRequest();shapeRequests.set(requestId,{factor:g.factor,key:g.key});worker.postMessage({command:'design-shape',key:g.key,itemId:id,requestId,freePlacement});}shapeRequests=new Map(shapeRequests);
 }
 function beginBuilding(id:number){
  const existing=buildingSources.get(id);if(existing){beginHouse(existing);return;}
  if(!testExport||!freePlacement||!buildingMode||blocked||!canStart||!open||!file||!worker||!grids.some(g=>initialBuildingEligible(id,g,detached)))return;
  cancel();onBegin();itemId=id;orientation='GridOrientation_Down';placing=true;
  const seen=new Set<number>();for(const g of grids){if(seen.has(g.factor)||!initialBuildingEligible(id,g,detached))continue;seen.add(g.factor);const requestId=nextRequest();shapeRequests.set(requestId,{factor:g.factor,key:g.key});worker.postMessage({command:'design-shape',key:g.key,itemId:id,requestId,freePlacement:true,allowBuildings:true});}shapeRequests=new Map(shapeRequests);
 }
 function beginHouse(p:MainlandSavedObject|null=chosen){
  if(!testExport||!freePlacement||blocked||!canStart||!open||!file||!buildingSourceEligible(p))return;
  cancel();onBegin();itemId=Number(p.object.itemId);source=p;orientation=p.object.orientation as EightWay;placing=true;
  if(worker){const g=grids.find(g=>g.key===p.area);if(g){const requestId=nextRequest();shapeRequests.set(requestId,{factor:g.factor,key:g.key});shapeRequests=new Map(shapeRequests);worker.postMessage({command:'design-shape',key:g.key,itemId,requestId,freePlacement:true,allowBuildings:true});}}
 }
 function pickupHouse(){
  if(!testExport||!freePlacement||blocked||!canStart||!open||!file)return;
  const p=chosen,q=buildingPickup(p,objects);if(!p||!q)return;
  cancel();onBegin();source=p;candidate=q;run(true,false,true);
 }
 function pickup(){if(blocked||!canStart||!chosen||!(testExport&&landscapeSourceEligible(chosen,freePlacement))&&(!stockSourceEligible(chosen,freePlacement)||!counts?.has(Number(chosen.object.itemId))))return;const q=stockPickup(chosen,freePlacement);if(!q)return;cancel();onBegin();candidate=q;validate();}
 export function hover(p:{x:number;y:number}|null){if(placing&&!candidate)point=p;}
 export function pick(p:{x:number;y:number}){if(!placing||blocked||!canStart||shapeRequests.size||status==='working')return;
  const q=freePlacement&&buildingSourceEligible(source)?buildingDuplicate(grids,rasters,source,p.x,p.y,orientation,definitions):freePlacement&&buildingMode&&!source?initialBuildingPlacement(grids,rasters,definitions,itemId,orientation,p.x,p.y,detached):stockPlacement(grids,rasters,definitions,itemId,orientation,p.x,p.y,source,freePlacement);if(!q||!freePlacement&&landscapeId(itemId)&&(stockFootprintFeedback(q,objects,omitted).overlaps>0||stockFootprintFeedback(q,objects,omitted).unknown)){status='error';return;}
  clearCopy();candidate=q;point=p;status='idle';stockChange=null;
 }
 $: rotationAllowed=definitions.size>0&&(freePlacement||[...definitions.values()].every(g=>g.editRestrictions?.rotate!=='denied'&&g.editRestrictions?.rotate!=='conditional'));
 export function turn(delta:number){if(!placing||(source&&!buildingSourceEligible(source))||status==='working'||!rotationAllowed)return;clearCopy();candidate=null;stockChange=null;status='idle';const def=definitions.get(1),eight=freePlacement&&testExport&&ordinaryFurniture(itemId)&&!!def&&!def.surfaceCapable&&!def.supportPath;
  const choices:readonly EightWay[]=eight?EIGHT_WAY_ORIENTATIONS:CARDINAL_ORIENTATIONS;
  const supported=choices.filter(o=>source&&buildingSourceEligible(source)?o===source.object.orientation||!!definitions.get(source.factor)?.shapes[itemId+':'+worldOrientationCode(o)]:!eight||def?.shapes[itemId+':'+EIGHT_WAY_ORIENTATIONS.indexOf(o)*2]);if(!supported.length)return;
  const i=supported.indexOf(orientation);orientation=supported[(Math.max(0,i)+delta+supported.length)%supported.length];}
 export function validate(){if(houseCandidate){if(!testExport||!freePlacement)return;run(true,false,true);}else if(candidate&&landscapeId(Number(candidate.plan.itemId))){if(!testExport)return;run(true,true);}else run(false);}
 function run(exporting:boolean,landscape=false,house=false){
  if(!candidate||!file||blocked||!canStart||status==='working'||exporting&&(!testExport||!landscape&&!house&&(status!=='valid'||!stockChange)))return;
  const q=candidate,f=file;
  const command=house?'group-paste-export':landscape?'landscape-export':exporting?'furniture-stock-export':'furniture-stock-preview';
  const plan=house&&q.plan.action==='place'?{buildingInitial:{itemId:q.plan.itemId,destination:q.destination,x:q.plan.x,y:q.plan.y,orientation:q.plan.orientation}}:house&&q.plan.action!=='place'&&source?(q.plan.action==='duplicate'?{[Math.floor(Number(q.plan.itemId)/100000)===205?'playerHouseDuplicate':'buildingDuplicate']:{localOrdinal:q.plan.localOrdinal,itemId:q.plan.itemId,expectedX:q.plan.expectedX,expectedY:q.plan.expectedY,orientation:source.object.orientation,destination:q.destination,x:q.plan.x,y:q.plan.y,...(q.plan.replacementOrientation?{replacementOrientation:q.plan.replacementOrientation}:{})}}:{[Math.floor(Number(q.plan.itemId)/100000)===205?'playerHouseRemove':'buildingRemove']:{localOrdinal:q.plan.localOrdinal,itemId:q.plan.itemId,expectedX:q.plan.expectedX,expectedY:q.plan.expectedY,orientation:source.object.orientation}}):landscape&&freePlacement&&q.plan.action!=='remove'?{...q.plan,freePlacement:true}:q.plan;
  ownPreview?.terminate();clearCopy();status='working';if(!exporting)stockChange=null;
  const own=new Worker(new URL('./furniture-stock-preview.worker.ts',import.meta.url),{type:'module'});ownPreview=own;
  const finish=(data:unknown)=>{
   own.terminate();const d=data as {kind?:string;validated?:boolean;stockBefore?:number;stockAfter?:number;bytes?:Uint8Array;receipt?:Record<string,unknown>}|null;
   if(ownPreview!==own||file!==f||candidate!==q){d?.bytes?.fill(0);return;}ownPreview=null;
   if(exporting){
    const r=d?.receipt,b=d?.bytes;
    if(d?.kind==='furniture-stock-copy'&&b instanceof Uint8Array&&b.byteLength>0&&b.byteLength<=32*1024*1024&&r?.contract==='wand.db05.experimental-copy@1'&&r.copyBytes===b.byteLength&&r.originalUnchanged===true&&r.independentReopenVerified===true&&r.experimentalCopyOnly===true&&r.productionWriterAuthorized===false){
     try{const dot=f.name.lastIndexOf('.');copyName=dot>0?f.name.slice(0,dot)+'-world-test'+f.name.slice(dot):f.name+'-world-test';copyFile=new File([b.slice().buffer as ArrayBuffer],f.name,{type:f.type||'application/octet-stream'});if(house)rememberReplayStep(copyFile,'group-paste-export',plan);else rememberReplayStep(copyFile,landscape?'landscape-export':'furniture-stock-export',plan,q.destination);copyUrl=URL.createObjectURL(copyFile);status='valid';}catch{clearCopy();status='error';}finally{b.fill(0);}return;
    }
    b?.fill(0);status='error';return;
   }
   if(d?.kind==='furniture-stock-preview'&&d.validated===true&&typeof d.stockBefore==='number'&&typeof d.stockAfter==='number'&&Number.isSafeInteger(d.stockBefore)&&Number.isSafeInteger(d.stockAfter)&&d.stockAfter-d.stockBefore===(q.plan.action==='remove'?1:-1)){stockChange={before:d.stockBefore,after:d.stockAfter};status='valid';}else status='error';
  };
  own.onmessage=e=>finish(e.data);own.onerror=()=>finish(null);own.onmessageerror=()=>finish(null);
  own.postMessage({command,file:f,destination:q.destination,plan,...(exporting?{allowExperimentalCopy:true}:{})});
 }
 $: duplicateEligible=stockSourceEligible(chosen,freePlacement)&&(freePlacement||!nativeMoveBlocked(chosen))&&(counts?.get(Number(chosen.object.itemId))??0)>0;
 function nativeMoveBlocked(p:MainlandSavedObject){return p.object.editRestrictions?.move==='denied'||p.object.editRestrictions?.move==='conditional';}
 onDestroy(()=>{cancel();ownStock?.terminate();ownHouses?.terminate();subscribed?.removeEventListener('message',receive);});
</script>
{#if open}
 <aside class="save-furniture-palette" aria-label={w[0]}>
  <div class="palette-head"><strong>{w[0]}</strong><button type="button" aria-label={w[8]} on:click={onClose}>×</button></div>
  {#if blocked||!canStart}<small role="status">{w[12]}</small>{:else}
   {#if testExport&&chosen&&landscapeSourceEligible(chosen,freePlacement)&&!placing&&!candidate}<div class="palette-actions"><button type="button" disabled={!freePlacement&&chosen.object.editRestrictions?.move!=='allowedFlag'} on:click={()=>begin(Number(chosen!.object.itemId),chosen)}>{lw[1]}</button><button type="button" on:click={pickup}>{lw[2]}</button></div><small>{lw[3]}</small>{/if}
   {#if testExport&&freePlacement&&buildingSourceEligible(chosen)&&!placing&&!candidate}<div class="palette-actions"><button type="button" on:click={()=>beginHouse()}>{hw[0]}</button><button type="button" disabled={!canRemoveHouse} on:click={pickupHouse}>{hw[2]}</button></div><small>{hw[1]}</small>{/if}
   {#if chosen&&stockSourceEligible(chosen,freePlacement)&&!placing&&!candidate}
    <div class="palette-actions"><button type="button" disabled={!duplicateEligible} on:click={()=>begin(Number(chosen!.object.itemId),chosen)}>{w[4]}</button><button type="button" disabled={!counts?.has(Number(chosen.object.itemId))} on:click={pickup}>{w[5]}</button></div>
   {/if}
   {#if placing||candidate}
    <div class="palette-actions">{#if placing&&(!source||buildingSourceEligible(source))}<button type="button" aria-label={w[14]} disabled={!rotationAllowed} on:click={()=>turn(-1)}>⟲</button><button type="button" aria-label={w[15]} disabled={!rotationAllowed} on:click={()=>turn(1)}>⟳</button>{/if}<button type="button" on:click={cancel}>{w[7]}</button></div>
    {#if candidate&&candidate.plan.action!=='remove'}<button type="button" disabled={status==='working'} on:click={validate}>{houseCandidate?(candidate.plan.action==='place'?w[3]:hw[0]):landscapeCandidate&&candidate.plan.action==='duplicate'?lw[1]:candidate.plan.action==='duplicate'?w[4]:w[3]}</button>{:else if placing}<small>{w[6]}</small>{/if}
   {/if}
   {#if footprint}<div class="footprint-feedback" role="status">{#if footprint.overlaps}<strong>{ow[0]}: {footprint.overlaps}</strong>{:else if !footprint.unknown}<span>{ow[2]}</span>{/if}{#if footprint.unknown}<span>{ow[1]}</span>{/if}<small>{ow[3]}</small></div>{/if}
   {#if status==='working'}<small role="status">{w[9]}</small>{:else if status==='valid'}<small class="stock-preview-result" role="status">{w[10]} {#if stockChange}{w[2]} {stockChange.before} → {stockChange.after}{/if}</small>{:else if status==='error'}<small role="alert">{w[11]}</small>{/if}
   {#if testExport&&status==='valid'&&candidate&&(landscapeCandidate||houseCandidate)&&copyUrl}<small class="test-warning">{tw[1]} · {houseCandidate?hw[1]:lw[3]}</small><button type="button" on:click={applyCopy}>{cw[0]}</button><a class="stock-copy" href={copyUrl} download={copyName}>{tw[2]}</a>{/if}
   {#if testExport&&status==='valid'&&candidate&&stockChange}<small class="test-warning">{tw[1]}</small><button type="button" on:click={()=>run(true)}>{tw[0]}</button>{#if copyUrl}<button type="button" on:click={applyCopy}>{cw[0]}</button><a class="stock-copy" href={copyUrl} download={copyName}>{tw[2]}</a>{/if}{/if}
   {#if testExport}<div class="palette-actions"><button type="button" aria-pressed={!landscapeMode&&!buildingMode} on:click={()=>setPaletteMode('furniture')}>{w[0]}</button><button type="button" aria-pressed={landscapeMode} on:click={()=>setPaletteMode('landscape')}>{lw[0]}</button>{#if freePlacement}<button type="button" aria-pressed={buildingMode} on:click={()=>setPaletteMode('building')}>{buildingTab[locale][0]}</button>{/if}</div>{/if}
   {#if buildingMode}<small>{buildingTab[locale][1]}</small>{/if}
   {#if landscapeMode}<small>{lw[3]}</small>{/if}
   <input type="search" aria-label={w[1]} placeholder={w[1]} bind:value={query} on:input={()=>limit=80}/>
   {#if (!landscapeMode&&!buildingMode&&stockState==='loading')||catalogState==='loading'}<small role="status">{w[9]}</small>{:else if (!landscapeMode&&!buildingMode&&stockState==='error')||catalogState==='error'}<small role="alert">{w[11]}</small>{:else}
    <div class="stock-items" on:scroll={e=>{const el=e.currentTarget;if(el.scrollTop+el.clientHeight>=el.scrollHeight-100)limit=Math.min(items.length,limit+80);}}>
     {#each visible as item (item.itemId)}<button type="button" class="stock-item" data-item-id={item.itemId} aria-pressed={placing&&itemId===item.itemId} on:click={()=>buildingMode?beginBuilding(item.itemId):begin(item.itemId)} title={item.name}>{#if artwork.has(item.itemId)}<img src={artwork.get(item.itemId)} alt="" loading="lazy"/>{/if}<span>{item.name}</span>{#if !landscapeMode&&!buildingMode}<small>{w[2]} {counts?.get(item.itemId)}</small>{/if}</button>{/each}
     {#if !items.length&&!landscapeMode&&!buildingMode}<small>{w[13]}</small>{/if}
    </div>
   {/if}
  {/if}
 </aside>
{/if}
<style>
 .save-furniture-palette{position:absolute;z-index:8;left:6px;top:56px;bottom:52px;width:min(250px,65%);display:flex;flex-direction:column;gap:5px;padding:6px;background:var(--wand-card);color:var(--wand-text);border:1px solid var(--wand-line);border-radius:6px;overflow:hidden}
 .footprint-feedback{display:flex;flex-direction:column;gap:2px;font-size:12px;border:1px solid var(--wand-line);border-radius:4px;padding:4px}.footprint-feedback small{color:var(--wand-muted)}.palette-head,.palette-actions{display:flex;align-items:center;gap:4px;flex-wrap:wrap}.palette-head strong{flex:1}.stock-items{overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));align-content:start;gap:3px;min-height:0;flex:1}.stock-item{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:12px;overflow-wrap:anywhere}.stock-item img{width:48px;height:48px;object-fit:contain}.stock-item small{color:var(--wand-muted)}
 .stock-copy{display:block;text-align:center;padding:5px;color:var(--wand-accent);border:1px solid var(--wand-line);border-radius:4px}.test-warning{color:var(--wand-muted)}button,input{font:inherit;background:var(--wand-menu);color:inherit;border:1px solid var(--wand-line);border-radius:4px;padding:5px}button:disabled{opacity:.45}button[aria-pressed=true]{outline:2px solid var(--wand-accent)}small{font-size:12px}
</style>
