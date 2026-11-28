<script lang="ts">
 import {onDestroy} from 'svelte';
 import {resolveSupportMapPath} from './support-map-preview.ts';
 import SupportSceneControls from './SupportSceneControls.svelte';
 import GroupPickupControls from './GroupPickupControls.svelte';
 import type {GroupPickupRow} from './group-pickup.ts';
 import {supportSceneWords,supportSceneRootCounts,supportSceneTemplateCompatible,type SupportScene} from './support-scene.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 import {supportTransferTargets,supportFloorCut,supportFloorPasteWords,type SupportParentWitness,type SupportTransferTarget} from './indoor-support.ts';
 import type {MainlandSavedObject} from './mainland-saved-objects.ts';
 import type {MainlandGrid} from './mainland-world-coordinates.ts';
 import type {TerrainRaster} from './terrain-binding.ts';
 import type {SourceObjectShape} from './source-object-map.ts';
 import type {SavedShapeMap} from './saved-shape-map.ts';
 import {nativeActionBlocked} from './native-edit-restrictions.ts';
 import {parseSupportTree,supportItems,supportExtent,supportShapeKey,supportParentCandidate,supportParentEligible,supportWords,supportChildEdits,childEditWords,supportFreeEdit,supportFreeSwap,supportFreeGroupTransform,supportGroupStockPlan,supportGroupWords,supportFreeWords,supportStockPlacement,supportStockPickup,supportStockWords,supportHitIndices,supportPlacementFits,supportDragDestination,supportTransferWords,supportDuplicateCounts,supportDuplicateWords,type SupportObject,type SupportStockPlan,type SupportChildEdit,type SupportTree,type SupportParentCandidate} from './subgrid-local.ts';
 import {testSaveWords} from './test-save-export.ts';
 import {parseFurnitureStock} from './furniture-stock-view.ts';
 import {experimentalCopyDownload} from './experimental-copy.ts';
 import {commitWorldCheckpoint} from '../ui/local-save-session';
 import {CARDINAL_ORIENTATIONS,isCardinal} from './saved-map-transform.ts';
 import {worldFurnitureCut,worldFurnitureClipboard,groupCutWords,type CutClipboard} from './group-paste.ts';
 import {worldArtwork} from './world-artwork.ts';
 import {worldShortcut,NUDGE} from './world-shortcuts.ts';
 export let open=false,parent:MainlandSavedObject|null=null,file:File|null=null,worker:Worker|null=null;
 export let roomParent:SupportParentWitness|null=null,onItems:(ids:number[])=>void=()=>{};
 export let roomTransferTargets:readonly SupportTransferTarget[]=[];
 export let roomPickupPlan:readonly GroupPickupRow[]|null=null,onRoomDuplicate:(needs:ReadonlyMap<number,number>)=>void=()=>{};
 export let roomDuplicateAllowed=false;
 export let initialFreePlacement=false;
 let roomPickupActive=false,nonstandard=false;
 const nonstandardWords={ja:'自由配置（重複・床制限解除）',en:'Free placement (allow overlap)',fr:'Placement libre (superposition)',it:'Posizionamento libero (sovrapposizione)',de:'Freie Platzierung (Überlappung)','es-ES':'Colocación libre (superposición)','zh-CN':'自由放置（允许重叠）','pt-BR':'Posicionamento livre (sobreposição)'} as const;
 $: identity=parent?{localOrdinal:parent.object.localOrdinal,itemId:Number(parent.object.itemId),x:parent.object.x,y:parent.object.y}:roomParent;
 export let grids:readonly MainlandGrid[]=[],rasters:ReadonlyMap<string,TerrainRaster>=new Map();
 export let names:ReadonlyMap<number,string>=new Map(),base='',locale:WandLanguage='en';
 export let canMove=false,nextRequest:()=>number,onClose:()=>void;
 export let placing=false,ghost:SupportParentCandidate|null=null,preview:SupportParentCandidate|null=null;
 export let initialChildIndex:number|null=null,initialChildPath:readonly number[]|null=null;
 export let initialParentPoint:{x:number;y:number}|null=null,onInitialConsumed:()=>void=()=>{};
 let parentPoint:{x:number;y:number}|null=null;
 $: preview=placing&&parentPoint&&parent&&canMove?supportParentCandidate(parent,grids,rasters,parentPoint.x,parentPoint.y,parentOrientation??parent.object.orientation,parentShapes,objects,duplicating,nonstandard):null;
 export function hoverParent(point:{x:number;y:number}|null){parentPoint=placing?point:null;}
 export let supports:readonly MainlandSavedObject[]=[];
 export let objects:readonly MainlandSavedObject[]=[];
 export let saveMaps:ReadonlyMap<string,SavedShapeMap>=new Map();
 let parentOrientation:string|null=null,duplicating=false,duplicateScene:SupportScene|null=null;
 $: dw=supportDuplicateWords[locale];
 $: duplicateNeeds=duplicateScene?supportSceneRootCounts(duplicateScene):parent?supportDuplicateCounts(Number(parent.object.itemId),stack[0]??null):roomParent?supportDuplicateCounts(roomParent.itemId,stack[0]??null):null;
 $: duplicateReady=!!duplicateNeeds&&[...duplicateNeeds].every(([id,n])=>(counts.get(id)??0)>=n);
 $: parentShapes=parent?saveMaps.get(parent.area)?.shapes??{}:{};
 $: parentRotate=!!parent&&supportParentEligible(parent,nonstandard)&&(nonstandard||!nativeActionBlocked(parent.object.editRestrictions,'rotate'));
 let activeFile:File|null=null,activeOrdinal=0,activeOpen=false,own:Worker|null=null,subscribed:Worker|null=null;
 let stack:SupportTree[]=[],path:number[]=[],owners:number[]=[],selected=-1,swap=false,free=false,freeDraft=false,edits:SupportChildEdit[]|null=null,editable=new Set<number>(),terrain:TerrainRaster|null=null;
 let group=new Set<number>(),groupDraft=false,groupDuplicating=false,groupStock:SupportStockPlan[]|null=null;
 $: groupWords=supportGroupWords[locale];
 $: groupActive=nonstandard&&group.size>1;
 $: groupStockPreview=groupActive&&groupDuplicating&&free&&hoverCell&&tree&&terrain?supportGroupStockPlan(tree,shapes,freeLeafIds,terrain,[...group],counts,{anchor:selected,...hoverCell}):null;
 $: groupPickup=groupActive&&tree&&terrain?supportGroupStockPlan(tree,shapes,freeLeafIds,terrain,[...group],counts,null):null;
 $: groupDuplicateReady=groupActive&&tree&&terrain&&selected>=0?!!supportGroupStockPlan(tree,shapes,freeLeafIds,terrain,[...group],counts,{anchor:selected,x:tree.objects[selected].x,y:tree.objects[selected].y}):false;
 $: groupPreview=groupActive&&!groupDuplicating&&free&&hoverCell&&tree&&terrain?supportFreeGroupTransform(tree,shapes,freeLeafIds,terrain,[...group],selected,hoverCell.x,hoverCell.y,0):null;
 $: if(!nonstandard&&group.size)group=new Set();
 let supportSvg:SVGSVGElement;
 let hoverCell:{x:number;y:number}|null=null;
 type ChildDrag={pointer:number;tree:SupportTree;file:File;index:number;start:{x:number;y:number};clientX:number;clientY:number;destination:{x:number;y:number};moved:boolean};
 let childDrag:ChildDrag|null=null,suppressChildClick=false;
 $: dragPreview=childDrag?.moved&&mapInteractive&&canMove&&tree===childDrag.tree&&file===childDrag.file&&terrain?previewAt(tree,shapes,moveAllowed,terrain,childDrag.destination,true,childDrag.index,false,0,stockOrientation,counts,false,removeAllowed,nonstandard):null;
 $: childPreview=dragPreview??hoverPreview;
 type TransferSource={index:number;object:SupportObject;path:number[]};
 type TransferDraft={index:number;itemId:number;expectedX:number;expectedY:number;expectedOrientation:string;destination:{localOrdinal:number;itemId:number;expectedX:number;expectedY:number;terrainPath:string};x:number;y:number;orientation:string};
 let transferSource:TransferSource|null=null,transferTarget:SupportTransferTarget|null=null,transferDraft:TransferDraft|null=null,transferQuery='';
 $: trw=supportTransferWords[locale];
 $: outdoorTransferTargets=supports.filter(p=>p.object.subgrid?.status==='resolved_full').map(p=>({localOrdinal:p.object.localOrdinal,itemId:Number(p.object.itemId),x:p.object.x,y:p.object.y,context:''}));
 $: targets=supportTransferTargets(identity,roomParent?roomTransferTargets:outdoorTransferTargets,names,transferQuery);
 $: transferEligible=!!tree&&!!terrain&&selected>=0&&!!tree.objects[selected]&&!tree.objects[selected].child&&moveAllowed.has(tree.objects[selected].itemId)&&removeAllowed.has(tree.objects[selected].itemId)&&Math.floor(tree.objects[selected].itemId/100000)===400&&isCardinal(tree.objects[selected].orientation);
 type FloorDraft=NonNullable<ReturnType<typeof supportFloorCut>>&{action:'floor-transfer';x:number;y:number;orientation:string};
 let floorCut:CutClipboard|null=null;
 $: floorOffer=nonstandard?supportFloorCut($worldFurnitureCut,file):null;
 let counts=new Map<number,number>(),removable=new Set<number>(),freeLeafIds=new Set<number>(),catalogRequest=0,stockCatalog:{itemId:number;name:string;standard:boolean}[]=[],stockQuery='',stockOpen=false,stockId=0,stockPlacing=false,stockOrientation:typeof CARDINAL_ORIENTATIONS[number]='GridOrientation_Down',stockDraft:SupportStockPlan|FloorDraft|null=null;
 $: stw=supportStockWords[locale];
 $: tw=testSaveWords[locale];
 $: availableCatalog=stockCatalog.filter(o=>nonstandard||o.standard);
 $: moveAllowed=nonstandard?new Set([...editable,...freeLeafIds]):editable;
 $: removeAllowed=nonstandard?new Set([...removable,...freeLeafIds]):removable;
 $: stockOptions=availableCatalog.filter(o=>o.name.normalize('NFKC').toLocaleLowerCase().includes(stockQuery.normalize('NFKC').toLocaleLowerCase().trim())).slice(0,200);
 $: pickup=tree&&selected>=0?supportStockPickup(tree,selected,counts,removeAllowed):null;
 $: stockShape=stockId?shapes[stockId+':'+CARDINAL_ORIENTATIONS.indexOf(stockOrientation)*4]:null;
 let sceneOpen=false;
 let tree:SupportTree|null=null,shapes:Readonly<Record<string,SourceObjectShape>>={},request=0,loading=false,error=false;
 let images=new Map<number,string>(),imageEpoch=0,copy:ReturnType<typeof experimentalCopyDownload>|null=null;
 $: words=supportWords[locale];
 $: cw=childEditWords[locale];
 $: sw=supportFreeWords[locale];
 $: left=tree&&selected>=0?turnCandidate(tree,shapes,moveAllowed,terrain,selected,-1,nonstandard):null;
 $: right=tree&&selected>=0?turnCandidate(tree,shapes,moveAllowed,terrain,selected,1,nonstandard):null;
 $: freeEligible=!!terrain&&!!tree&&selected>=0&&!!tree.objects[selected]&&!tree.objects[selected].child&&moveAllowed.has(tree.objects[selected].itemId)&&isCardinal(tree.objects[selected].orientation);
 $: partners=tree&&selected>=0?tree.objects.map((_,i)=>swapCandidate(tree!,shapes,editable,freeLeafIds,terrain,selected,i,nonstandard)?i:-1).filter(i=>i>=0):[];
 $: mapInteractive=!roomPickupActive&&!!tree&&!loading&&!copy&&!placing&&!ghost&&!edits&&!groupStock&&!stockDraft&&!stockOpen&&!transferDraft&&(!transferSource||!!transferTarget);
 $: mapKeyboard=!roomPickupActive&&(mapInteractive||!!tree&&!loading&&!copy&&!placing&&!ghost&&(!!edits||!!groupStock||!!stockDraft||!!transferDraft));
 $: hoverPreview=hoverCell&&mapInteractive&&canMove&&tree&&terrain&&(free||stockPlacing)?previewAt(tree,shapes,floorCut?freeLeafIds:moveAllowed,terrain,hoverCell,free,selected,stockPlacing,stockId,stockOrientation,counts,!!transferSource||!!floorCut,floorCut?freeLeafIds:removeAllowed,nonstandard):null;
 $: extent=tree&&terrain?{x:-.5,y:-.5,w:terrain.sizeX*tree.factor+1,h:terrain.sizeY*tree.factor+1}:tree?supportExtent(tree,shapes):{x:0,y:0,w:1,h:1};
 $: if(open!==activeOpen||file!==activeFile||(identity?.localOrdinal??0)!==activeOrdinal)refresh(open,file,parent,identity);
 $: if(worker!==subscribed){subscribed?.removeEventListener('message',receive);subscribed=worker;subscribed?.addEventListener('message',receive);if(tree){requestShapes(tree);requestCatalog(tree);}}
 function stopOwn(){own?.terminate();own=null;}
 function clearCopy(){if(copy)URL.revokeObjectURL(copy.url);copy=null;}
 export function cancel(){group=new Set();groupDraft=false;groupDuplicating=false;groupStock=null;floorCut=null;sceneOpen=false;duplicating=false;duplicateScene=null;childDrag=null;suppressChildClick=false;parentPoint=null;parentOrientation=null;transferSource=null;transferTarget=null;transferDraft=null;hoverCell=null;placing=false;ghost=null;edits=null;swap=false;free=false;freeDraft=false;stockDraft=null;stockPlacing=false;stockOpen=false;stockId=0;stopOwn();clearCopy();loading=false;error=false;}
 function refresh(show:boolean,source:File|null,p:MainlandSavedObject|null,witness:SupportParentWitness|null){
  cancel();nonstandard=initialFreePlacement;request=0;activeOpen=show;activeFile=source;activeOrdinal=witness?.localOrdinal??0;stack=[];path=[];owners=[];selected=-1;tree=null;terrain=null;shapes={};editable=new Set();removable=new Set();freeLeafIds=new Set();counts=new Map();stockCatalog=[];catalogRequest=0;images=new Map();imageEpoch++;
  if(!show||!source||!witness||p&&!p.object.subgrid)return;
  loading=true;
  const session=new Worker(new URL('./subgrid-local.worker.ts',import.meta.url),{type:'module'});own=session;
  const finish=(d:unknown)=>{session.terminate();if(own!==session||activeFile!==source||activeOrdinal!==witness.localOrdinal)return;own=null;loading=false;try{const row=d as {kind?:string;result?:unknown;stock?:unknown};if(row?.kind!=='subgrid-local')throw Error('receipt');const root=parseSupportTree(row.result);try{counts=parseFurnitureStock(row.stock);}catch{counts=new Map();}const selectedPath=initialChildPath??(initialChildIndex===null?null:[initialChildIndex]),resolved=selectedPath?resolveSupportMapPath(root,selectedPath):null;stack=resolved?.stack??[root];owners=[witness.itemId,...(resolved?.owners??[])];path=resolved?.indices??[];showTree(stack[stack.length-1]);if(resolved)selected=resolved.selected;if(initialParentPoint&&p){const point=initialParentPoint;onInitialConsumed();if(canMove){ghost=supportParentCandidate(p,grids,rasters,point.x,point.y,p.object.orientation,saveMaps.get(p.area)?.shapes??{},objects,false,nonstandard);error=!ghost;}}}catch{onInitialConsumed();error=true;}};
  session.onmessage=e=>finish(e.data);session.onerror=()=>finish(null);session.onmessageerror=()=>finish(null);
  session.postMessage({command:'inspect-subgrid',file:source,parent:witness});
 }
 function showTree(t:SupportTree){group=new Set();groupDraft=false;groupDuplicating=false;groupStock=null;floorCut=null;onItems(t.objects.map(o=>o.itemId));childDrag=null;suppressChildClick=false;hoverCell=null;selected=-1;swap=false;free=false;freeDraft=false;edits=null;stockDraft=null;stockPlacing=false;stockOpen=false;stockId=0;stockCatalog=[];catalogRequest=0;tree=t;terrain=null;shapes={};editable=new Set();removable=new Set();freeLeafIds=new Set();requestShapes(t);requestCatalog(t);const epoch=++imageEpoch;images=new Map();for(const id of new Set(t.objects.map(o=>o.itemId))){void worldArtwork(base,id).then(url=>{if(url&&epoch===imageEpoch)images=new Map(images).set(id,url);}).catch(()=>{});}}
 function requestShapes(t:SupportTree){request=0;if(!worker)return;const items=supportItems(t);if(stockId)for(const orientationCode of [0,4,8,12])items.push({itemId:stockId,orientationCode});if(!items.length&&!t.sourcePath)return;request=nextRequest();worker.postMessage({command:'support-shapes',requestId:request,factor:t.factor,items,sourcePath:t.sourcePath,ownerItemId:owners[owners.length-1]});}
 function requestCatalog(t:SupportTree){catalogRequest=0;if(!worker||!t.sourcePath||!counts.size)return;catalogRequest=nextRequest();worker.postMessage({command:'support-catalog',requestId:catalogRequest,sourcePath:t.sourcePath,ownerItemId:owners[owners.length-1],locale,itemIds:[...counts].filter(([,n])=>n>0).map(([id])=>id)});}
 function chooseStock(id:number,orientation:typeof CARDINAL_ORIENTATIONS[number]='GridOrientation_Down'){if(!tree||!terrain||!canMove||loading||copy||!availableCatalog.some(o=>o.itemId===id)||!(counts.get(id)!>0))return;stockId=id;stockOrientation=orientation;stockDraft=null;stockPlacing=true;stockOpen=false;selected=-1;free=false;swap=false;edits=null;error=false;requestShapes(tree);const epoch=imageEpoch;void worldArtwork(base,id).then(url=>{if(url&&epoch===imageEpoch)images=new Map(images).set(id,url);}).catch(()=>{});}
 function cancelStock(){floorCut=null;if(transferSource){refresh(open,file,parent,identity);return;}hoverCell=null;stockDraft=null;stockId=0;stockPlacing=false;stockOpen=false;error=false;}
 function beginFloorPaste(){
  const cut=$worldFurnitureCut,row=supportFloorCut(cut,file);
  if(!nonstandard||!row||!cut||!tree||!terrain||!canMove||!mapInteractive||stockPlacing||free||swap||transferSource)return;
  floorCut=cut;stockId=row.itemId;stockOrientation=row.expectedOrientation;stockDraft=null;stockPlacing=true;selected=-1;error=false;onItems([stockId]);requestShapes(tree);
  const epoch=imageEpoch,id=stockId;void worldArtwork(base,id).then(url=>{if(url&&epoch===imageEpoch)images=new Map(images).set(id,url);}).catch(()=>{});
 }
 function cutLeaf(){
  const o=tree?.objects[selected],w=identity;
  if(!file||file!==activeFile||!nonstandard||!w||!o||!transferEligible||!isCardinal(o.orientation)||!mapInteractive||free||swap||stockPlacing||transferSource)return;
  worldFurnitureCut.set({file,scope:'indoor',rows:[{localOrdinal:w.localOrdinal,supportSource:{parentItemId:w.itemId,parentX:w.x,parentY:w.y,path:[...path],index:selected},area:'indoor',itemId:String(o.itemId),expectedX:o.x,expectedY:o.y,expectedOrientation:o.orientation}]});
  worldFurnitureClipboard.set([{itemId:o.itemId,dx:0,dy:0,orientation:CARDINAL_ORIENTATIONS.indexOf(o.orientation)}]);onClose();
 }
 function beginTransfer(){
  if(!tree||!transferEligible||!canMove||!mapInteractive||free||swap||stockPlacing)return;
  transferSource={index:selected,object:tree.objects[selected],path:[...path]};transferQuery='';transferTarget=null;transferDraft=null;hoverCell=null;error=false;
 }
 function chooseTransfer(p:SupportTransferTarget){
  const from=transferSource,source=file;if(!from||!source||!canMove||loading||copy||transferTarget||!targets.includes(p)||source!==activeFile)return;
  loading=true;error=false;const session=new Worker(new URL('./subgrid-local.worker.ts',import.meta.url),{type:'module'});own=session;
  const finish=(d:any)=>{
   session.terminate();if(own!==session||transferSource!==from||activeFile!==source)return;own=null;loading=false;
   try{if(d?.kind!=='subgrid-local')throw Error('receipt');const target=parseSupportTree(d.result);if(!target.sourcePath)throw Error('source path');
    transferTarget=p;owners=[p.itemId];stack=[target];path=[];showTree(target);
    stockId=from.object.itemId;stockOrientation=from.object.orientation as typeof CARDINAL_ORIENTATIONS[number];stockPlacing=true;requestShapes(target);
    const epoch=imageEpoch;void worldArtwork(base,stockId).then(url=>{if(url&&epoch===imageEpoch)images=new Map(images).set(from.object.itemId,url);}).catch(()=>{});
   }catch{error=true;}
  };
  session.onmessage=e=>finish(e.data);session.onerror=()=>finish(null);session.onmessageerror=()=>finish(null);
  session.postMessage({command:'inspect-subgrid',file:source,parent:{localOrdinal:p.localOrdinal,itemId:p.itemId,x:p.x,y:p.y}});
 }
 function beginPickup(){if(!pickup||loading||copy||!canMove)return;cancelStock();edits=null;free=false;swap=false;stockDraft=pickup;}
 function receive(e:MessageEvent){const d=e.data;if(catalogRequest&&d?.requestId===catalogRequest){catalogRequest=0;if(d.kind==='support-catalog'&&Array.isArray(d.items))stockCatalog=d.items;return;}if(!request||d?.requestId!==request)return;request=0;if(d.kind==='support-shapes'&&d.shapes&&typeof d.shapes==='object'&&Array.isArray(d.editable)){shapes=d.shapes;editable=new Set(d.editable.filter(Number.isSafeInteger));removable=new Set(Array.isArray(d.removable)?d.removable.filter(Number.isSafeInteger):[]);freeLeafIds=new Set(Array.isArray(d.freeEligible)?d.freeEligible.filter(Number.isSafeInteger):[]);terrain=d.terrain?.nativeFloorValues instanceof Uint32Array?d.terrain:null;}}
 function descend(t:SupportTree,index:number){if(!mapInteractive||free||swap||stockPlacing)return;path=[...path,index];owners=[...owners,tree!.objects[index].itemId];stack=[...stack,t];showTree(t);}
 function back(){if(stack.length<2||!mapInteractive||free||swap||stockPlacing)return;path=path.slice(0,-1);owners=owners.slice(0,-1);stack=stack.slice(0,-1);showTree(stack[stack.length-1]);}
 function swapCandidate(t:SupportTree,s:Readonly<Record<string,SourceObjectShape>>,e:ReadonlySet<number>,leaf:ReadonlySet<number>,r:TerrainRaster|null,a:number,b:number,nonstandard=false){
  return nonstandard?r&&supportFreeSwap(t,s,leaf,r,a,b):supportChildEdits(t,s,e,a,b,1);
 }
 function selectChild(index:number){if(!mapInteractive||stockPlacing||free)return;group=new Set();groupDraft=false;if(swap&&tree){const next=swapCandidate(tree,shapes,editable,freeLeafIds,terrain,selected,index,nonstandard);if(next){edits=next;swap=false;freeDraft=nonstandard;}return;}selected=index;edits=null;free=false;freeDraft=false;}
 function toggleGroup(index:number){
  if(!nonstandard||!mapInteractive||!tree||!terrain||free||swap||stockPlacing||transferSource)return;
  const o=tree.objects[index];if(!o||o.child||!freeLeafIds.has(o.itemId)||!isCardinal(o.orientation))return;
  const next=new Set(group.size?group:selected>=0?[selected]:[]);
  if(next.has(index)){next.delete(index);}else if(next.size<32){next.add(index);}
  group=next;selected=next.has(index)?index:[...next].at(-1)??-1;error=false;
 }
 function groupTransform(x:number,y:number,turn:0|-1|1){
  if(!canMove||!groupActive||!tree||!terrain||loading||copy||edits||stockPlacing||transferSource)return;
  const next=supportFreeGroupTransform(tree,shapes,freeLeafIds,terrain,[...group],selected,x,y,turn);
  error=!next;if(next){edits=next;groupDraft=true;freeDraft=true;free=false;hoverCell=null;}
 }
 function groupTurn(turn:-1|1){const o=tree?.objects[selected];if(o)groupTransform(o.x,o.y,turn);}
 function turnCandidate(t:SupportTree,s:Readonly<Record<string,SourceObjectShape>>,e:ReadonlySet<number>,r:TerrainRaster|null,i:number,turn:-1|1,nonstandard=false){const exact=supportChildEdits(t,s,e,i,null,turn);if(exact&&!nonstandard)return exact;const o=t.objects[i];if(!r||!o||!isCardinal(o.orientation))return null;return supportFreeEdit(t,s,e,r,i,o.x,o.y,CARDINAL_ORIENTATIONS[(CARDINAL_ORIENTATIONS.indexOf(o.orientation)+turn+4)%4],nonstandard);}
 function beginChild(next:SupportChildEdit[]|null){if(!canMove||!next||loading||copy||placing||ghost)return;freeDraft=!!terrain&&!!tree&&next.length===1&&(nonstandard||!supportChildEdits(tree,shapes,editable,selected,null,-1)?.some(e=>e.orientation===next[0].orientation)&&!supportChildEdits(tree,shapes,editable,selected,null,1)?.some(e=>e.orientation===next[0].orientation));edits=next;swap=false;free=false;error=false;}
 function pointerCell(e:MouseEvent,unbounded=false){
  const m=supportSvg?.getScreenCTM();if(!m)return null;
  const q=new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse());
  if(!Number.isFinite(q.x)||!Number.isFinite(q.y)||!unbounded&&(q.x<extent.x||q.y<extent.y||q.x>=extent.x+extent.w||q.y>=extent.y+extent.h))return null;
  return {x:Math.floor(q.x),y:Math.floor(q.y)};
 }
 function previewAt(t:SupportTree,s:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>,r:TerrainRaster,p:{x:number;y:number},moving:boolean,index:number,placingStock:boolean,id:number,orientation:typeof CARDINAL_ORIENTATIONS[number],stock:ReadonlyMap<number,number>,transferring:boolean,canRemove:ReadonlySet<number>,nonstandard=false){
  const o=t.objects[index],key=placingStock?id+':'+CARDINAL_ORIENTATIONS.indexOf(orientation)*4:moving&&o?supportShapeKey(o):null;
  const shape=key?s[key]:null;if(!shape)return null;
  const valid=placingStock?(transferring?allowed.has(id)&&canRemove.has(id)&&supportPlacementFits(t,s,r,id,p.x,p.y,orientation,nonstandard):(!nonstandard||allowed.has(id))&&!!supportStockPlacement(t,s,r,id,stock.get(id)??0,p.x,p.y,orientation,nonstandard)):moving&&!!o&&!!supportFreeEdit(t,s,allowed,r,index,p.x,p.y,o.orientation,nonstandard);
  return {...p,shape,itemId:placingStock?id:o.itemId,valid};
 }
 function startChildDrag(e:PointerEvent){
  suppressChildClick=false;childDrag=null;
  if(e.button!==0||e.pointerType==='touch'||groupActive||e.ctrlKey||e.metaKey||e.shiftKey||!mapInteractive||!canMove||!tree||!terrain||!file||free||swap||stockPlacing||transferSource)return;
  const p=pointerCell(e);if(!p)return;
  const hits=supportHitIndices(tree,shapes,p.x,p.y);
  const i=hits.includes(selected)?selected:hits[hits.length-1],o=tree.objects[i];
  if(!o||o.child||Math.floor(o.itemId/100000)!==400||!moveAllowed.has(o.itemId)||!isCardinal(o.orientation))return;
  childDrag={pointer:e.pointerId,tree,file,index:i,start:p,clientX:e.clientX,clientY:e.clientY,destination:{x:o.x,y:o.y},moved:false};
 }
 function updateChildDrag(e:PointerEvent){
  const d=childDrag;if(!d||d.pointer!==e.pointerId)return false;
  if(!mapInteractive||!canMove||tree!==d.tree||file!==d.file||!terrain){childDrag=null;return true;}
  if(!d.moved&&Math.hypot(e.clientX-d.clientX,e.clientY-d.clientY)<4)return true;
  const p=pointerCell(e,true),o=tree.objects[d.index],destination=p&&o?supportDragDestination(o,d.start,p):null;
  if(!destination)return true;
  if(!d.moved){try{(e.currentTarget as Element).setPointerCapture(e.pointerId);}catch{/* pointer ended */}selected=d.index;error=false;}
  childDrag={...d,destination,moved:true};hoverCell=null;e.preventDefault();return true;
 }
 function finishChildDrag(e:PointerEvent,commit:boolean){
  if(childDrag?.pointer!==e.pointerId)return;
  if(commit)updateChildDrag(e);
  const d=childDrag;childDrag=null;
  if(!d?.moved)return;
  suppressChildClick=true;
  if(!commit||!mapInteractive||!canMove||!tree||!terrain||tree!==d.tree||file!==d.file)return;
  const o=tree.objects[d.index];
  if(d.destination.x===o.x&&d.destination.y===o.y)return;
  const next=supportFreeEdit(tree,shapes,moveAllowed,terrain,d.index,d.destination.x,d.destination.y,o.orientation,nonstandard);
  error=!next;if(next){edits=next;freeDraft=true;free=false;hoverCell=null;}
 }
 function hoverChild(e:PointerEvent){if(updateChildDrag(e))return;hoverCell=mapInteractive&&(free||stockPlacing)?pointerCell(e):null;}
 function pickChild(e:MouseEvent){
  if(suppressChildClick){suppressChildClick=false;return;}
  if(!mapInteractive||!tree||e.detail===0)return;const q=pointerCell(e);if(!q)return;
  if(!free&&!stockPlacing){
   const hits=supportHitIndices(tree,shapes,q.x,q.y).filter(i=>!swap||partners.includes(i));
   if(hits.length){const current=hits.indexOf(selected);const index=hits[(current+1)%hits.length];if(nonstandard&&(e.shiftKey||e.ctrlKey||e.metaKey))toggleGroup(index);else selectChild(index);}
   return;
  }
  if(!terrain||!canMove)return;
  if(stockPlacing&&floorCut){
   const row=supportFloorCut(floorCut,file);
   if(!row||floorCut!==$worldFurnitureCut||!nonstandard||!tree.sourcePath||!freeLeafIds.has(row.itemId)||!supportPlacementFits(tree,shapes,terrain,row.itemId,q.x,q.y,stockOrientation,true)){error=true;return;}
   stockDraft={...row,action:'floor-transfer',x:q.x,y:q.y,orientation:stockOrientation};stockPlacing=false;hoverCell=null;error=false;return;
  }
  if(stockPlacing&&transferSource){
   const from=transferSource,d=transferTarget;
   if(!d||!tree.sourcePath||!moveAllowed.has(stockId)||!removeAllowed.has(stockId)||!supportPlacementFits(tree,shapes,terrain,stockId,q.x,q.y,stockOrientation,nonstandard)){error=true;return;}
   transferDraft={index:from.index,itemId:from.object.itemId,expectedX:from.object.x,expectedY:from.object.y,expectedOrientation:from.object.orientation,destination:{localOrdinal:d.localOrdinal,itemId:d.itemId,expectedX:d.x,expectedY:d.y,terrainPath:tree.sourcePath},x:q.x,y:q.y,orientation:stockOrientation};
   stockPlacing=false;hoverCell=null;error=false;return;
  }
  if(stockPlacing){const plan=nonstandard&&!moveAllowed.has(stockId)?null:supportStockPlacement(tree,shapes,terrain,stockId,counts.get(stockId)??0,q.x,q.y,stockOrientation,nonstandard);error=!plan;if(plan){stockDraft=plan;stockPlacing=false;hoverCell=null;}return;}
  if(groupActive&&free){if(groupDuplicating){const next=supportGroupStockPlan(tree,shapes,freeLeafIds,terrain,[...group],counts,{anchor:selected,...q});error=!next;if(next){groupStock=next;groupDuplicating=false;free=false;hoverCell=null;}}else groupTransform(q.x,q.y,0);return;}
  if(selected<0)return;const o=tree.objects[selected];const next=supportFreeEdit(tree,shapes,moveAllowed,terrain,selected,q.x,q.y,o.orientation,nonstandard);error=!next;if(next){edits=next;freeDraft=true;free=false;hoverCell=null;}
 }
 function mapKeys(e:KeyboardEvent){
  if(!mapKeyboard||!tree||e.isComposing)return;
  if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&(e.key==='['||e.key===']')&&mapInteractive&&!free&&!stockPlacing&&!swap){
   if(tree.objects.length){const delta=e.key==='['?-1:1;selectChild(selected<0?(delta>0?0:tree.objects.length-1):(selected+delta+tree.objects.length)%tree.objects.length);e.preventDefault();}return;
  }
  const action=worldShortcut(e);if(!action)return;
  if(action==='cancel'){
   if(groupStock||groupDuplicating){groupStock=null;groupDuplicating=false;free=false;}else if(transferSource||stockPlacing||stockDraft)cancelStock();
   else if(edits||swap||free){edits=null;swap=false;free=false;freeDraft=false;groupDraft=false;}
   else{selected=-1;group=new Set();}
   childDrag=null;hoverCell=null;error=false;e.preventDefault();return;
  }
  if(!canMove)return;
  if(action==='confirm'&&(edits||groupStock||stockDraft||transferDraft)){e.preventDefault();validateChild();return;}
  if(action==='delete'&&!groupActive&&pickup&&mapInteractive&&!free&&!swap&&!stockPlacing&&!transferSource){e.preventDefault();beginPickup();return;}
  const turn=action==='rotate-left'?-1:action==='rotate-right'?1:0;
  if(turn&&stockPlacing){stockOrientation=CARDINAL_ORIENTATIONS[(CARDINAL_ORIENTATIONS.indexOf(stockOrientation)+turn+4)%4];e.preventDefault();return;}
  const delta=NUDGE[action],o=tree.objects[selected];
  if(groupActive){if(action==='delete'&&groupPickup&&!edits&&!groupStock&&!free){groupStock=groupPickup;e.preventDefault();return;}if(o&&!edits&&!groupStock&&!free&&!stockPlacing&&!stockDraft&&(turn||delta)){e.preventDefault();groupTransform(o.x+(delta?.[0]??0),o.y+(delta?.[1]??0),turn as 0|-1|1);}return;}
  if(transferSource||!o||!isCardinal(o.orientation)||stockPlacing||stockDraft||swap||edits&&(!freeDraft||edits.length!==1)||(!turn&&!delta))return;
  e.preventDefault();hoverCell=null;
  if(!terrain){if(turn&&!edits)beginChild(turnCandidate(tree,shapes,moveAllowed,terrain,selected,turn as -1|1));return;}
  const previous=edits?.[0],x=(previous?.x??o.x)+(delta?.[0]??0),y=(previous?.y??o.y)+(delta?.[1]??0);
  const current=previous?.orientation??o.orientation;if(!isCardinal(current))return;
  const orientation=CARDINAL_ORIENTATIONS[(CARDINAL_ORIENTATIONS.indexOf(current)+turn+4)%4];
  if(x===o.x&&y===o.y&&orientation===o.orientation){edits=null;freeDraft=false;error=false;return;}
  const next=supportFreeEdit(tree,shapes,moveAllowed,terrain,selected,x,y,orientation,nonstandard);
  error=!next;if(next){edits=next;freeDraft=true;free=false;}
 }
 function validateChild(){
  if(!canMove||(!edits&&!groupStock&&!stockDraft&&!transferDraft)||!file||file!==activeFile||!identity||own||!open||floorCut&&floorCut!==$worldFurnitureCut)return;
  const source=file,chosen=edits,batch=groupStock,stock=stockDraft,transfer=transferDraft,from=transferSource,cut=floorCut;loading=true;error=false;clearCopy();
  const session=new Worker(new URL('./subgrid-local.worker.ts',import.meta.url),{type:'module'});own=session;
  const finish=(d:any)=>{session.terminate();if(own!==session||activeFile!==source||edits!==chosen||groupStock!==batch||stockDraft!==stock||transferDraft!==transfer||floorCut!==cut){d?.bytes?.fill(0);return;}own=null;loading=false;try{if(d?.kind!=='support-child-copy')throw Error('copy');copy=experimentalCopyDownload(d,source);}catch{error=true;}};
  session.onmessage=e=>finish(e.data);session.onerror=()=>finish(null);session.onmessageerror=()=>finish(null);session.postMessage({command:'support-child-copy',file:source,allowExperimentalCopy:true,plan:{localOrdinal:identity.localOrdinal,itemId:identity.itemId,expectedX:identity.x,expectedY:identity.y,path:transfer?from!.path:path,...(nonstandard&&(batch||transfer||stock?.action==='place'||stock?.action==='floor-transfer'||freeDraft&&!!chosen?.length)?{freePlacement:true}:{}),...(batch?{stock:batch,terrainPath:tree?.sourcePath}:transfer?{transfer}:stock?.action==='floor-transfer'?{floorTransfer:{...('roomSource' in stock?{roomSource:stock.roomSource}:{localOrdinal:stock.localOrdinal,...(stock.supportSource?{supportSource:stock.supportSource}:{})}),itemId:stock.itemId,expectedX:stock.expectedX,expectedY:stock.expectedY,expectedOrientation:stock.expectedOrientation,x:stock.x,y:stock.y,orientation:stock.orientation},terrainPath:tree?.sourcePath}:stock?{stock,...(stock.action==='place'&&tree?.sourcePath?{terrainPath:tree.sourcePath}:{})}:{edits:chosen,...(groupDraft?{groupEdit:true}:{}),...(freeDraft&&tree?.sourcePath?{terrainPath:tree.sourcePath}:{})})}});
 }
 function begin(duplicate=false,scene:SupportScene|null=null){if(duplicate&&!scene&&!duplicateReady)return;if(scene&&(!parent||!stack[0]||!supportSceneTemplateCompatible(scene,Number(parent.object.itemId),stack[0])||![...supportSceneRootCounts(scene)].every(([id,n])=>(counts.get(id)??0)>=n)))return;if(!canMove||!supportParentEligible(parent,nonstandard)||!tree||loading)return;clearCopy();cancelStock();edits=null;swap=false;free=false;freeDraft=false;ghost=null;error=false;parentOrientation=parent.object.orientation;parentPoint=null;duplicating=duplicate;duplicateScene=scene;sceneOpen=false;placing=true;}
 function beginScene(scene:SupportScene){begin(true,scene);}
 export function turnParent(delta:-1|1){
  if(!canMove||!parentRotate||!parent||loading||copy||transferSource||edits||stockDraft||stockPlacing||stockOpen||swap||free||!tree)return;
  const previous=parentOrientation??parent.object.orientation;if(!isCardinal(previous))return;
  const orientation=CARDINAL_ORIENTATIONS[(CARDINAL_ORIENTATIONS.indexOf(previous)+delta+4)%4];
  if(placing){parentOrientation=orientation;return;}
  const x=ghost?.x??parent.x,y=ghost?.y??parent.y,factor=ghost?.factor??parent.factor;
  const candidate=supportParentCandidate(parent,grids,rasters,x+.25/factor,y-.25/factor,orientation,parentShapes,objects,duplicating,nonstandard);
  if(!candidate){error=true;return;}parentOrientation=orientation;ghost=candidate;error=false;
 }
 export function pick(point:{x:number;y:number}){if(!placing||!parent||!canMove)return;ghost=supportParentCandidate(parent,grids,rasters,point.x,point.y,parentOrientation??parent.object.orientation,parentShapes,objects,duplicating,nonstandard);error=!ghost;if(ghost){placing=false;parentPoint=null;}}
 function validate(){
  if(!canMove||!ghost||!file||file!==activeFile||own||!open||duplicating&&!duplicateReady)return;
  const source=file,plan=ghost;loading=true;error=false;clearCopy();
  const session=new Worker(new URL('./subgrid-local.worker.ts',import.meta.url),{type:'module'});own=session;
  const finish=(d:any)=>{session.terminate();if(own!==session||activeFile!==source||ghost!==plan){d?.bytes?.fill(0);return;}own=null;loading=false;try{if(d?.kind!=='support-parent-copy')throw Error('copy');copy=experimentalCopyDownload(d,source);}catch{error=true;}};
  session.onmessage=e=>finish(e.data);session.onerror=()=>finish(null);session.onmessageerror=()=>finish(null);session.postMessage({command:'support-parent-copy',file:source,allowExperimentalCopy:true,plan:{...plan.plan,...(duplicating?{duplicate:true,...(duplicateScene?{scene:duplicateScene}:{})}:{})}});
 }
 function apply(){if(!canMove||!copy||!file||file!==activeFile||floorCut&&floorCut!==$worldFurnitureCut||!commitWorldCheckpoint(file,copy.file)){error=true;return;}if(floorCut){worldFurnitureCut.set(null);worldFurnitureClipboard.set([]);}onClose();}
 onDestroy(()=>{cancel();subscribed?.removeEventListener('message',receive);imageEpoch++;});
</script>
{#if open&&identity}
 <aside class="support-panel" aria-label={words[0]}>
  <header><strong>{words[0]} · {tree?.objects.length??'—'}</strong><button type="button" on:click={onClose} aria-label={words[7]}>×</button></header>
  {#if loading}<small role="status">{words[12]}</small>{/if}
  {#if tree&&sceneOpen&&(parent||roomParent)}<SupportSceneControls {tree} ownerItemId={owners[owners.length-1]} {parent} {roomParent} {file} {worker} {path} {counts} {names} {base} {locale} {canMove} {nextRequest} onBack={()=>sceneOpen=false} onApplied={onClose} onDuplicate={parent&&path.length===0?beginScene:null}/>
  {:else if tree}
   {#if roomParent&&roomPickupPlan&&canMove&&!loading&&!copy&&!edits&&!swap&&!free&&!stockOpen&&!stockPlacing&&!stockDraft&&!transferSource&&!transferDraft}
    <GroupPickupControls roomPlan={roomPickupPlan} {file} {locale} bind:active={roomPickupActive} onApplied={onClose}/>
   {/if}
   {#if !roomPickupActive}
   {#if roomParent&&roomDuplicateAllowed&&canMove&&!loading&&!copy&&!edits&&!swap&&!free&&!stockOpen&&!stockPlacing&&!stockDraft&&!transferSource&&!transferDraft}
    <button type="button" disabled={!duplicateReady} title={duplicateReady?dw[0]:dw[1]} on:click={()=>{if(duplicateNeeds&&duplicateReady)onRoomDuplicate(duplicateNeeds);}}>{dw[0]}</button>
    {#if duplicateNeeds}<div class="support-list">{#each [...duplicateNeeds] as [id,n]}<small>{names.get(id)??'—'} · {dw[2]} {n}/{counts.get(id)??0}</small>{/each}</div>{/if}
   {/if}
   {#if (parent||roomParent)&&!loading&&!copy&&!placing&&!ghost&&!edits&&!swap&&!free&&!stockOpen&&!stockPlacing&&!stockDraft&&!transferSource&&!transferDraft}<button type="button" on:click={()=>sceneOpen=true}>{supportSceneWords[locale][0]}</button>{/if}
   {#if transferSource}<div class="support-heading"><strong>{names.get(transferSource.object.itemId)??'—'} → {transferTarget?names.get(transferTarget.itemId)??'—':trw[1]}</strong><button type="button" disabled={loading} on:click={cancelStock}>{words[11]}</button></div>
   {#if !transferTarget}<input type="search" bind:value={transferQuery} placeholder={trw[1]} aria-label={trw[1]}/><div class="support-list">{#each targets as p (p.localOrdinal)}<button type="button" disabled={loading} on:click={()=>chooseTransfer(p)}>{names.get(p.itemId)??'—'} · {p.x}, {p.y}{#if p.context}<small>{p.context}</small>{/if}</button>{/each}</div>{:else if !terrain&&!loading&&!request}<small>{trw[2]}</small>{/if}{/if}
   <div class="support-heading">{#if stack.length>1}<button type="button" disabled={!mapInteractive||free||swap||stockPlacing} on:click={back}>{words[11]}</button>{/if}<strong>{words[1]}</strong></div>
   {#if tree.objects.length||terrain}
    <button type="button" class="support-map-button" disabled={!mapKeyboard} aria-label={free||stockPlacing?sw[1]:cw[6]} aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown R Shift+R Delete Escape Enter" on:keydown={mapKeys} on:click={pickChild} on:pointerdown={startChildDrag} on:pointermove={hoverChild} on:pointerup={e=>finishChildDrag(e,true)} on:pointercancel={e=>finishChildDrag(e,false)} on:lostpointercapture={e=>finishChildDrag(e,false)} on:pointerleave={()=>{hoverCell=null;if(childDrag&&!childDrag.moved)childDrag=null;}}><svg bind:this={supportSvg} class="support-map" viewBox={extent.x+' '+extent.y+' '+extent.w+' '+extent.h} aria-label={words[1]} role="img">
     {#if terrain}{#each Array.from(terrain.nativeFloorValues) as cell,i}<rect x={(i%terrain.sizeX)*tree.factor} y={Math.floor(i/terrain.sizeX)*tree.factor} width={tree.factor} height={tree.factor} fill={cell?'#6ba98b':'#8b5555'} fill-opacity=".35" stroke="currentColor" stroke-opacity=".3" vector-effect="non-scaling-stroke"/>{/each}{/if}
     {#each tree.objects as o,i}
      {@const change=edits?.find(e=>e.index===i)}
      {@const effective=change?{...o,x:change.x,y:change.y,orientation:change.orientation}:o}
      {@const key=supportShapeKey(effective)}
      {@const shape=key?shapes[key]:null}
      <g transform={'translate('+effective.x+' '+effective.y+')'} opacity={groupStock?.some(p=>p.action==='pickup'&&p.index===i)||stockDraft?.action==='pickup'&&stockDraft.index===i||(free||childDrag?.moved)&&childPreview&&selected===i?0.3:1}>
       {#if shape}<path d={shape.path} fill={selected===i||group.has(i)||change?'#4bddcd':'var(--wand-menu)'} stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke"/>{#if images.has(o.itemId)}<image href={images.get(o.itemId)} width={shape.width} height={shape.height} preserveAspectRatio="xMidYMid meet"/>{/if}{:else}<rect width="1" height="1" fill="none" stroke="currentColor" stroke-dasharray="2 2" vector-effect="non-scaling-stroke"/>{/if}
       {#if o.child}<circle cx={(shape?.width??1)/2} cy={(shape?.height??1)/2} r=".2" fill="#b98bd6"/>{/if}
      </g>
     {/each}
     {#if transferDraft&&stockShape}<g transform={'translate('+transferDraft.x+' '+transferDraft.y+')'}><path d={stockShape.path} fill="#4bddcd" stroke="currentColor" vector-effect="non-scaling-stroke"/><image href={images.get(transferDraft.itemId)} width={stockShape.width} height={stockShape.height} preserveAspectRatio="xMidYMid meet"/></g>{/if}
     {#if (stockDraft?.action==='place'||stockDraft?.action==='floor-transfer')&&stockShape}<g transform={'translate('+stockDraft.x+' '+stockDraft.y+')'}><path d={stockShape.path} fill="#4bddcd" stroke="currentColor" vector-effect="non-scaling-stroke"/><image href={images.get(stockDraft.itemId)} width={stockShape.width} height={stockShape.height} preserveAspectRatio="xMidYMid meet"/></g>{/if}
     {#if groupStockPreview||groupStock}{#each (groupStock??groupStockPreview??[]) as p}{#if p.action==='place'}{@const shape=shapes[p.itemId+':'+CARDINAL_ORIENTATIONS.indexOf(p.orientation as typeof CARDINAL_ORIENTATIONS[number])*4]}{#if shape}<path d={shape.path} transform={'translate('+p.x+' '+p.y+')'} fill="#4bddcd" fill-opacity=".5" stroke="currentColor" vector-effect="non-scaling-stroke"/>{/if}{/if}{/each}{:else if groupPreview}{#each groupPreview as p}{@const shape=shapes[p.itemId+':'+CARDINAL_ORIENTATIONS.indexOf(p.orientation as typeof CARDINAL_ORIENTATIONS[number])*4]}{#if shape}<path d={shape.path} transform={'translate('+p.x+' '+p.y+')'} fill="#4bddcd" fill-opacity=".5" stroke="currentColor" vector-effect="non-scaling-stroke"/>{/if}{/each}{:else if childPreview&&!groupActive}<g transform={'translate('+childPreview.x+' '+childPreview.y+')'} pointer-events="none" opacity=".8"><path d={childPreview.shape.path} fill={childPreview.valid?'#4bddcd':'#c45b5b'} fill-opacity=".55" stroke={childPreview.valid?'#4bddcd':'#c45b5b'} stroke-width="2" vector-effect="non-scaling-stroke" stroke-dasharray={childPreview.valid?'none':'3 2'}/>{#if images.has(childPreview.itemId)}<image href={images.get(childPreview.itemId)} width={childPreview.shape.width} height={childPreview.shape.height} preserveAspectRatio="xMidYMid meet" opacity=".55"/>{/if}</g>{/if}
    </svg></button>
    <div class="support-list">{#each tree.objects as o,i}
     <div class="support-row" class:selected-row={selected===i||group.has(i)}>{#if nonstandard&&terrain&&canMove}<input type="checkbox" aria-label={groupWords[0]+' · '+(names.get(o.itemId)??'—')} checked={group.has(i)} disabled={!mapInteractive||free||swap||stockPlacing||!!o.child||!freeLeafIds.has(o.itemId)} on:change={()=>toggleGroup(i)}/>{/if}{#if images.has(o.itemId)}<img src={images.get(o.itemId)} alt="" loading="lazy"/>{/if}<button class="child-select" type="button" aria-pressed={selected===i} disabled={!mapInteractive||free||stockPlacing||swap&&!partners.includes(i)} on:click={e=>{if(nonstandard&&(e.shiftKey||e.ctrlKey||e.metaKey))toggleGroup(i);else selectChild(i);}}>{names.get(o.itemId)??'—'}</button>{#if o.child}<button type="button" disabled={!mapInteractive||free||swap||stockPlacing} on:click={()=>descend(o.child!,i)}>{words[0]} · {o.child.objects.length}</button>{/if}</div>
    {/each}</div>
   {:else}<small>{words[9]}</small>{/if}
   <small>{words[10]}</small>
   {#if canMove&&(terrain||parent)&&!loading&&!copy&&!edits&&!groupStock&&!stockDraft&&!stockPlacing&&!transferSource&&!transferDraft&&!placing&&!ghost&&!free&&!swap}<label><input type="checkbox" bind:checked={nonstandard}/>{nonstandardWords[locale]}</label>{/if}
   {#if canMove&&groupActive&&!transferSource&&!stockPlacing&&!stockDraft&&!copy}<div class="child-actions"><strong>{groupWords[0]} · {group.size}</strong>{#if !edits&&!groupStock}<button type="button" disabled={loading||free} on:click={()=>{groupDuplicating=false;free=true;error=false;}}>{groupWords[1]}</button><button type="button" disabled={loading||free||!groupDuplicateReady} on:click={()=>{groupDuplicating=true;free=true;error=false;}}>{stw[3]}</button><button type="button" disabled={loading||free||!groupPickup} on:click={()=>{groupStock=groupPickup;error=false;}}>{stw[2]}</button><button type="button" disabled={loading||free} on:click={()=>groupTurn(-1)}>{cw[0]}</button><button type="button" disabled={loading||free} on:click={()=>groupTurn(1)}>{cw[1]}</button>{:else}<button type="button" disabled={loading} on:click={validateChild}>{cw[5]}</button>{/if}<button type="button" disabled={loading} on:click={()=>{group=new Set();edits=null;groupStock=null;groupDuplicating=false;free=false;freeDraft=false;groupDraft=false;}}>{groupWords[2]}</button></div>{:else if canMove&&!transferSource&&selected>=0&&!placing&&!ghost&&!copy&&!stockPlacing&&!stockDraft&&!stockOpen}<div class="child-actions"><button type="button" disabled={!left||loading||!!edits||swap} on:click={()=>beginChild(left)}>{cw[0]}</button><button type="button" disabled={!right||loading||!!edits||swap} on:click={()=>beginChild(right)}>{cw[1]}</button><button type="button" disabled={!partners.length||loading||!!edits||swap} on:click={()=>{swap=true;edits=null;}}>{cw[2]}</button>{#if nonstandard&&transferEligible}<button type="button" disabled={loading||!!edits||free||swap} on:click={cutLeaf}>{groupCutWords[locale][0]}</button>{/if}{#if transferEligible&&targets.length}<button type="button" disabled={loading||!!edits||free||swap} on:click={beginTransfer}>{trw[0]}</button>{/if}{#if pickup}<button type="button" disabled={loading||!!edits||free||swap} on:click={beginPickup}>{stw[2]}</button>{/if}{#if terrain&&availableCatalog.some(o=>o.itemId===tree?.objects[selected]?.itemId)&&isCardinal(tree.objects[selected].orientation)}<button type="button" disabled={loading||!!edits||free||swap} on:click={()=>chooseStock(tree!.objects[selected].itemId,tree!.objects[selected].orientation as typeof CARDINAL_ORIENTATIONS[number])}>{stw[3]}</button>{/if}{#if terrain}<button type="button" disabled={!freeEligible||loading||!!edits||swap||free} on:click={()=>{free=true;freeDraft=false;error=false;}}>{sw[0]}</button>{/if}</div><small>{free?sw[1]:swap?cw[3]:terrain?sw[2]:sw[3]}</small>{#if edits}<button type="button" disabled={loading} on:click={validateChild}>{cw[5]}</button>{/if}{#if edits||swap||free}<button type="button" disabled={loading} on:click={()=>{edits=null;swap=false;free=false;freeDraft=false;}}>{words[11]}</button>{/if}{/if}
   {#if canMove&&!groupActive&&!transferSource&&terrain&&!placing&&!ghost&&!copy&&!free&&!edits&&!swap&&!stockDraft&&!stockPlacing}<button type="button" disabled={loading||!availableCatalog.length} on:click={()=>{stockOpen=!stockOpen;stockQuery='';}}>{stw[0]}</button>{/if}
   {#if floorOffer&&!groupActive&&canMove&&terrain&&mapInteractive&&!stockPlacing&&!free&&!swap&&!transferSource}<button type="button" on:click={beginFloorPaste}>{supportFloorPasteWords[locale]} · {names.get(floorOffer.itemId)??'—'}</button>{/if}
   {#if stockOpen&&canMove}<input type="search" bind:value={stockQuery} placeholder={stw[6]} aria-label={stw[6]}/><div class="support-list">{#each stockOptions as item}<button type="button" on:click={()=>chooseStock(item.itemId)}>{item.name} · {counts.get(item.itemId)}</button>{/each}</div>{/if}
   {#if stockPlacing}<small>{stw[4]}</small>{#if images.has(stockId)}<img class="stock-image" src={images.get(stockId)} alt=""/>{/if}<div class="child-actions"><button type="button" on:click={()=>stockOrientation=CARDINAL_ORIENTATIONS[(CARDINAL_ORIENTATIONS.indexOf(stockOrientation)+3)%4]}>{cw[0]}</button><button type="button" on:click={()=>stockOrientation=CARDINAL_ORIENTATIONS[(CARDINAL_ORIENTATIONS.indexOf(stockOrientation)+1)%4]}>{cw[1]}</button><button type="button" on:click={cancelStock}>{words[11]}</button></div>{/if}
   {#if transferDraft&&!copy}<button type="button" disabled={loading} on:click={validateChild}>{cw[5]}</button>{/if}
   {#if stockDraft&&!copy}{#if stockDraft.action!=='floor-transfer'}<small>{stockDraft.expectedStock} → {stockDraft.expectedStock+(stockDraft.action==='place'?-1:1)}</small>{/if}<button type="button" disabled={loading} on:click={validateChild}>{cw[5]}</button><button type="button" disabled={loading} on:click={cancelStock}>{words[11]}</button>{/if}
   {#if canMove&&!transferSource&&supportParentEligible(parent,nonstandard)}
    {#if placing}<small role="status">{words[3]}</small>{:else if !ghost&&!edits&&!swap&&!copy&&!free&&!stockOpen&&!stockPlacing&&!stockDraft}<button type="button" disabled={loading} on:click={()=>begin()}>{words[2]}</button><button type="button" disabled={loading||!duplicateReady} title={!duplicateReady?dw[1]:dw[0]} on:click={()=>begin(true)}>{dw[0]}</button>{/if}
    {#if parentRotate&&!copy&&!edits&&!swap&&!free&&!stockOpen&&!stockPlacing&&!stockDraft}<div class="child-actions"><button type="button" disabled={loading} aria-label={words[2]+' · '+cw[0]} on:click={()=>turnParent(-1)}>⟲ {cw[0]}</button><button type="button" disabled={loading} aria-label={words[2]+' · '+cw[1]} on:click={()=>turnParent(1)}>⟳ {cw[1]}</button></div>{/if}
    {#if duplicating&&duplicateNeeds}<strong>{dw[0]}</strong><div class="support-list">{#each [...duplicateNeeds] as [id,n]}<small>{names.get(id)??"—"} · {dw[2]} {n}/{counts.get(id)??0}</small>{/each}</div>{/if}
    {#if ghost&&!copy}<button type="button" disabled={loading} on:click={validate}>{words[4]}</button>{/if}
    {#if (ghost||placing)&&!copy}<button type="button" disabled={loading} on:click={()=>{ghost=null;placing=false;duplicating=false;duplicateScene=null;parentPoint=null;parentOrientation=null;error=false;}}>{words[11]}</button>{/if}
   {/if}
   {#if (transferDraft||stockDraft||groupStock||edits||ghost||copy)&&canMove}<small>{tw[1]}</small>{/if}
   {#if copy&&canMove}<button type="button" on:click={apply}>{words[5]}</button><a href={copy.url} download={copy.name}>{words[6]}</a>{/if}
   {/if}
  {/if}
  {#if error}<small role="alert">{words[8]}</small>{/if}
 </aside>
{/if}
<style>
 .support-panel{position:absolute;top:52px;right:8px;z-index:8;width:min(320px,90%);max-height:calc(100% - 100px);overflow:auto;display:grid;gap:7px;padding:8px;background:var(--wand-card);color:var(--wand-text);border:1px solid var(--wand-line);border-radius:6px}
 header,.support-heading,.support-row{display:flex;align-items:center;gap:6px;justify-content:space-between}
 .stock-image{width:40px;height:40px;object-fit:contain}.support-map-button{padding:0;display:block;border:0;width:100%;background:none}.support-map-button:not(:disabled){cursor:crosshair;user-select:none}.support-map-button:disabled{opacity:1;cursor:default}.support-map{display:block;width:100%;height:180px;background:var(--wand-menu);border:1px solid var(--wand-line)}
 .support-list{display:grid;gap:3px;max-height:180px;overflow:auto}.support-row{justify-content:flex-start}.support-row img{width:32px;height:32px;object-fit:contain}.support-row .child-select{flex:1;text-align:left}.selected-row{outline:1px solid var(--wand-line)}.child-actions{display:flex;flex-wrap:wrap;gap:4px}
 button,a{font:inherit;color:inherit;background:var(--wand-menu);border:1px solid var(--wand-line);padding:5px;border-radius:4px}small{font-size:.8em}
</style>
