<script lang="ts">
 import {onMount,onDestroy} from 'svelte';
 import SubgridInspector from './SubgridInspector.svelte';
 import {supportWords,parseSupportTree} from './subgrid-local.ts';
 import {captureSupportScene,mixedSceneCounts,type MixedScenePreset,type SupportScene} from './support-scene.ts';
 import {parseIndoorSupportParents,roomSupportPickupPlan,type IndoorSupportWitness} from './indoor-support.ts';
 import {base} from '$app/paths';
 import {browser} from '$app/environment';
 import {testSaveExportEnabled,testSaveWords} from './test-save-export.ts';
 import {stockToolWords} from './save-furniture-placement.ts';
 import {experimentalCopyDownload} from './experimental-copy.ts';
 import {localSaveSession,commitWorldCheckpoint} from '../ui/local-save-session';
 import {checkpointWords} from './world-checkpoint-words.ts';
 import {openCurrentItemDatabase,type ItemMasterRecord,type CompleteItemMasterRecord} from '../items/public-item-master.ts';
 import {worldArtwork} from './world-artwork.ts';
 import {sceneWords,sceneItemCounts,type ScenePreset} from './scene-preset.ts';
 import {DESIGN_FILE_LIMIT} from './design-layout.ts';
 import {parseIndoorRooms,parseOwnedFinishes,verifyFinishReceipt,indoorWords,finishWords,positionWords,indoorPositionPlot,indoorShapeWords,indoorEditableTree,indoorFurnitureEdits,indoorSwapPartners,indoorPickup,indoorGroupPickup,indoorDuplicateClip,indoorGroupStockWords,captureIndoorScene,indoorSceneClip,indoorScenePlacement,indoorMixedScene,indoorMixedPlacement,captureIndoorMixedScene,indoorSceneWords,indoorEditWords,indoorMove,indoorGroupMove,indoorGroupRotate,indoorGroupMoveWords,indoorPlace,indoorTerrainWords,indoorTransferWords,captureIndoorCut,indoorGroupTransfer,rotateIndoorCut,type IndoorTransferRow,type IndoorPlace,type IndoorPickup,type IndoorRoom,type IndoorSurface} from './indoor-room-view.ts';
 import {parseFurnitureStock} from './furniture-stock-view.ts';
 import {worldFurnitureCut,worldFurnitureClipboard,groupCutWords,ROOM_CUT_LIMIT,type CutClipboard} from './group-paste.ts';
 import {CARDINAL_ORIENTATIONS,isCardinal} from './saved-map-transform.ts';
 import {childEditWords,supportHitIndices,type SupportChildEdit} from './subgrid-local.ts';
 import type {DesignClipItem} from './design-layout.ts';
 import type {SourceObjectShape} from './source-object-map.ts';
 import type {WandLanguage} from '../ui/preferences';
 export let file:File|null,locale:WandLanguage='ja',onClose:()=>void;
 export let terrainWorker:Worker|null=null,nextRequest:()=>number,blocked=false;
 let seen:File|null=null,own:Worker|null=null,rooms:IndoorRoom[]=[],status:'loading'|'ready'|'error'='loading',selected=0,surface=0,query='',limit=80;
 let positionOpen=true,highlight:number|null=null;
 let supportParents:IndoorSupportWitness[]=[],supportParent:IndoorSupportWitness|null=null,supportFile:File|null=null;
 let supportClone:IndoorPlace['supportSource']|null=null;
 $: supportCloneReady=!!supportParent&&!!face?.terrain&&removable.has(supportParent.itemId)&&!!roomPickupPlan;
 function beginSupportDuplicate(needs:ReadonlyMap<number,number>){
  const p=supportParent,pose=p&&face?.positions[p.index];
  if(!p||!pose||pose.orientationCode===null||!supportCloneReady||!editAllowed||[...needs].some(([id,n])=>(stock.get(id)??0)<n))return;
  const witness={index:p.index,expectedX:p.x,expectedY:p.y,expectedOrientation:CARDINAL_ORIENTATIONS[pose.orientationCode/4]};
  closeSupport();resetObject();supportClone=witness;stockId=p.itemId;stockOrientation=witness.expectedOrientation;positionOpen=true;placing=true;
 }

 $: supportNames=new Map([...records].map(([id,r])=>[id,r.names[locale]??r.names.en??String(id)]));
 $: roomSupports=supportParents.filter(p=>p.roomOrdinal===room?.ordinal&&p.surfaceOrdinal===face?.ordinal);
 $: supportText=supportWords[locale];
 $: roomPickupPlan=supportParent?roomSupportPickupPlan(face,roomSupports,[supportParent.index],shapes,removable):null;
 $: if(supportParent&&file!==supportFile)closeSupport();
 function closeSupport(){supportParent=null;supportFile=null;}
 function openSupport(p:IndoorSupportWitness){if(!file||moving||placing||editDraft||pickupDraft||placeDraft||transferDraft||editCopy||editWorker||finishOpen)return;clearEdit();supportParent=p;supportFile=file;}

 let selectedObject=-1,swap=false,editDraft:SupportChildEdit[]|null=null,pickupDraft:IndoorPickup[]|null=null,editWorker:Worker|null=null,editCopy:ReturnType<typeof experimentalCopyDownload>|null=null,editError=false,stock=new Map<number,number>(),editable=new Set<number>(),removable=new Set<number>();
 let roomSvg:SVGSVGElement;
 let moving=false,placing=false,stockOpen=false,stockId=0,stockOrientation:typeof CARDINAL_ORIENTATIONS[number]='GridOrientation_Down',placeDraft:IndoorPlace[]|null=null,hoverCell:{x:number;y:number}|null=null,catalogRequest=0,stockQuery='',catalog:{itemId:number;name:string}[]=[];
 let cutSource:CutClipboard|null=null,cutClip:readonly DesignClipItem[]=[],transferDraft:IndoorTransferRow[]|null=null;
 let selectedGroup=new Set<number>(),cloneClip:readonly DesignClipItem[]=[];
 let sceneInput:HTMLInputElement,sceneReading=false,sceneEpoch=0,sceneExtra:number[]=[],sceneAnchor:ScenePreset['anchor']='corner',sceneActive=false,sceneError=false;
 $: sw=sceneWords[locale];$: isw=indoorSceneWords[locale];
 $: selectedScene=captureIndoorScene(face,cutIndices,shapes,removable);
 $: surfaceScene=captureIndoorScene(face,face?.positions.map((_,i)=>i)??[],shapes,removable);
 let mixedDoc:MixedScenePreset|null=null,mixedRequest=0,mixedValid=false,sceneCaptureWorker:Worker|null=null;
 $: sceneCounts=mixedDoc?mixedSceneCounts(mixedDoc.items):sceneItemCounts(cloneClip);
 $: mixedSelected=cutIndices.some(i=>roomSupports.some(p=>p.index===i));
 $: mixedSurface=roomSupports.length>0;
 function captureRoomMixed(indices:readonly number[]){
  if(!file||!face||!terrainWorker||sceneCaptureWorker||!indices.length||indices.length>ROOM_CUT_LIMIT)return;
  const source=file,target=face,selection=[...indices],sh=shapes,allowed=removable;
  const parents=roomSupports.filter(p=>selection.includes(p.index));if(!parents.length)return;
  const session=new Worker(new URL('./subgrid-local.worker.ts',import.meta.url),{type:'module'});sceneCaptureWorker=session;sceneError=false;
  const done=(d:any)=>{session.terminate();if(sceneCaptureWorker!==session)return;sceneCaptureWorker=null;if(file!==source||face!==target)return;
   try{if(d?.kind!=='subgrids-local'||!Array.isArray(d.results)||d.results.length!==parents.length)throw Error('receipt');const supports=new Map<number,SupportScene>();
    for(const p of parents){const result=d.results.find((v:any)=>v.localOrdinal===p.localOrdinal);const scene=captureSupportScene(p.itemId,parseSupportTree(result?.result));if(!scene)throw Error('tree');supports.set(p.index,scene);}
    const scene=captureIndoorMixedScene(target,selection,sh,allowed,supports);if(!scene)throw Error('scene');saveRoomScene(scene);
   }catch{sceneError=true;}
  };session.onmessage=e=>done(e.data);session.onerror=()=>done(null);session.onmessageerror=()=>done(null);session.postMessage({command:'inspect-subgrids',file:source,parents:parents.map(({localOrdinal,itemId,x,y})=>({localOrdinal,itemId,x,y}))});
 }

 $: sceneMissing=[...sceneCounts].some(([id,n])=>(stock.get(id)??0)<n);
 function saveRoomScene(scene:ScenePreset|MixedScenePreset|null){if(!scene)return;const url=URL.createObjectURL(new Blob([JSON.stringify(scene)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='wand-scene.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 async function openRoomScene(e:Event){
  const input=e.currentTarget as HTMLInputElement,chosen=input.files?.[0];input.value='';
  if(!chosen||!file||!face?.factor||!face.terrain||!editAllowed||sceneReading)return;
  const epoch=++sceneEpoch,source=file,target=face;sceneReading=true;sceneError=false;
  try{
   if(chosen.size>DESIGN_FILE_LIMIT)throw Error('size');
   const raw=await chosen.text(),mixed=indoorMixedScene(raw);
   const value=mixed?{clip:mixed.items.map(({support,...pose})=>pose),anchor:mixed.anchor}:indoorSceneClip(raw,target.factor!);
   if(value.clip.length>ROOM_CUT_LIMIT||mixed&&!terrainWorker)throw Error('scene limit');
   if(epoch!==sceneEpoch||file!==source||face!==target||!editAllowed||moving||placing||editDraft||pickupDraft||placeDraft||transferDraft)return;
   resetObject();sceneActive=true;sceneAnchor=value.anchor;cloneClip=value.clip;sceneExtra=[...new Set(value.clip.map(p=>p.itemId))];placing=true;
   if(mixed){mixedDoc=mixed;mixedValid=false;mixedRequest=nextRequest();terrainWorker!.postMessage({command:'mixed-scene-geometry',requestId:mixedRequest,scene:mixed,locale});}
   const ids=mixed?[...mixedSceneCounts(mixed.items).keys()]:sceneExtra;loadItems(ids,sceneExtra);
  }catch{if(epoch===sceneEpoch)sceneError=true;}finally{if(epoch===sceneEpoch)sceneReading=false;}
 }

 $: cutIndices=selectedGroup.size?[...selectedGroup]:selectedObject>=0?[selectedObject]:[];
 $: cutSelection=room?captureIndoorCut(face,room.ordinal,cutIndices,shapes,editable,removable):null;
 $: cutPreview=placing&&cutSource&&hoverCell?indoorGroupTransfer(face,shapes,removable,cutSource.rows,cutClip,hoverCell.x,hoverCell.y):null;
 $: clonePreview=placing&&cloneClip.length&&hoverCell?(mixedDoc?mixedValid?indoorMixedPlacement(face,shapes,removable,stock,cloneClip,mixedDoc,sceneAnchor,hoverCell.x,hoverCell.y):null:indoorScenePlacement(face,shapes,removable,stock,cloneClip,sceneAnchor,hoverCell.x,hoverCell.y)):null;
 $: cutGhost=transferDraft??cutPreview??clonePreview??placeDraft;
 $: groupPickup=indoorGroupPickup(face,cutIndices,removable,stock);
 $: duplicateClip=cutIndices.some(i=>roomSupports.some(p=>p.index===i))?null:indoorDuplicateClip(face,cutIndices,shapes,removable,stock);
 function beginDuplicate(){if(!editAllowed||!duplicateClip)return;const clip=duplicateClip;resetObject();cloneClip=clip;placing=true;}


 $: availableCut=$worldFurnitureCut&&$worldFurnitureCut.file===file&&$worldFurnitureCut.rows.length>0&&$worldFurnitureCut.rows.length<=ROOM_CUT_LIMIT&&face?.kind==='floor'&&face.terrain&&$worldFurnitureCut.rows.every(r=>!r.supportFactor&&(!r.roomSource||r.roomSource.roomOrdinal!==room?.ordinal))?$worldFurnitureCut:null;
 $: itw=indoorTerrainWords[locale];
 $: cutWords=groupCutWords[locale];
 $: canCut=editAllowed&&!!file&&!!cutSelection&&!moving&&!placing&&!swap&&!editDraft&&!pickupDraft&&!placeDraft&&!transferDraft&&!stockOpen;
 function captureRoomCut(){
  if(!canCut||!cutSelection||!file)return false;
  worldFurnitureCut.set({file,scope:'indoor',rows:cutSelection.rows});
  worldFurnitureClipboard.set(cutSelection.clip);return true;
 }
 $: options=catalog.filter(i=>i.name.normalize('NFKC').toLocaleLowerCase().includes(stockQuery.normalize('NFKC').toLocaleLowerCase().trim())).slice(0,200);
 $: stockShape=shapes[stockId+':'+CARDINAL_ORIENTATIONS.indexOf(stockOrientation)*4];
 $: moveShape=tree&&selectedObject>=0&&tree.objects[selectedObject]&&isCardinal(tree.objects[selectedObject].orientation)?shapes[tree.objects[selectedObject].itemId+':'+CARDINAL_ORIENTATIONS.indexOf(tree.objects[selectedObject].orientation as typeof CARDINAL_ORIENTATIONS[number])*4]:null;
 $: groupMoveReady=!!face?.terrain&&selectedGroup.size>1&&!!tree&&selectedGroup.has(selectedObject)&&[...selectedGroup].every(i=>!!tree?.objects[i]&&editable.has(tree.objects[i].itemId));
 $: groupLeft=groupMoveReady?indoorGroupRotate(face,shapes,editable,[...selectedGroup],-1):null;
 $: groupRight=groupMoveReady?indoorGroupRotate(face,shapes,editable,[...selectedGroup],1):null;
 $: groupMovePreview=moving&&selectedGroup.size>1&&hoverCell?indoorGroupMove(face,shapes,editable,[...selectedGroup],selectedObject,hoverCell.x,hoverCell.y):null;
 $: previewShape=placing&&!cutSource&&!cloneClip.length?stockShape:moving&&selectedGroup.size<=1?moveShape:null;
 $: previewValid=hoverCell?placing?(cutSource?!!cutPreview:!!indoorPlace(face,shapes,removable,stock,stockId,hoverCell.x,hoverCell.y,stockOrientation)):moving?!!indoorMove(face,shapes,editable,selectedObject,hoverCell.x,hoverCell.y):false:false;
 $: requestCatalog(face,terrainWorker,stock,locale);
 function requestCatalog(f:IndoorSurface|null,wk:Worker|null,counts:ReadonlyMap<number,number>,lang:WandLanguage){catalog=[];catalogRequest=0;if(!wk||!f?.terrain)return;const ids=[...counts].filter(([,n])=>n>0).map(([id])=>id);if(!ids.length)return;const mask=f.terrain.nativeFloorValues.reduce((a,b)=>a|b,0);catalogRequest=nextRequest();wk.postMessage({command:'indoor-catalog',requestId:catalogRequest,itemIds:ids,mask,locale:lang});}
 function chooseStock(id:number){if(!editAllowed||!catalog.some(i=>i.itemId===id)||!face?.terrain)return;resetObject();stockId=id;stockOrientation='GridOrientation_Down';placing=true;void worldArtwork(base,id).then(url=>{if(url)images=new Map(images).set(id,url);}).catch(()=>{});}
 function beginTransfer(){
  if(!editAllowed||!availableCut||!face?.terrain||!file)return;
  const cut=availableCut,clip=$worldFurnitureClipboard;
  if(clip.length!==cut.rows.length||clip.some((p,i)=>String(p.itemId)!==cut.rows[i].itemId))return;
  resetObject();cutSource=cut;cutClip=[...clip];placing=true;
  for(const id of new Set(clip.map(p=>p.itemId)))void worldArtwork(base,id).then(url=>{if(url)images=new Map(images).set(id,url);}).catch(()=>{});
 }
 function turnStock(delta:number){if(cloneClip.length){const q=rotateIndoorCut(cloneClip,face?.factor??null,shapes,delta);if(q){cloneClip=q;editError=false;}else editError=true;return;}if(cutSource){const q=rotateIndoorCut(cutClip,face?.factor??null,shapes,delta);if(q){cutClip=q;editError=false;}else editError=true;return;}stockOrientation=CARDINAL_ORIENTATIONS[(CARDINAL_ORIENTATIONS.indexOf(stockOrientation)+delta+4)%4];}
 function point(e:MouseEvent){const m=roomSvg?.getScreenCTM();if(!m)return null;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse());return {x:Math.floor(p.x),y:Math.floor(p.y)};}

 $: iw=indoorEditWords[locale];
 $: ew=childEditWords[locale];
 $: tree=indoorEditableTree(face);
 $: editAllowed=testExport&&!blocked&&!!tree&&!finishOpen&&!editWorker&&!editCopy;
 $: left=indoorFurnitureEdits(face,shapes,editable,selectedObject,null,-1);
 $: right=indoorFurnitureEdits(face,shapes,editable,selectedObject,null,1);
 $: partners=indoorSwapPartners(face,shapes,editable,selectedObject);
 $: pickup=indoorPickup(face,selectedObject,removable,stock);
 $: pw=positionWords[locale]??positionWords.en;
 let shapes:Readonly<Record<string,SourceObjectShape>>={},shapeRequest=0,shapeWorker:Worker|null=null;
 $: if(terrainWorker!==shapeWorker){shapeWorker?.removeEventListener('message',receiveShapes);shapeWorker=terrainWorker;shapeWorker?.addEventListener('message',receiveShapes);}
 $: requestShapes(positionOpen?face:null,terrainWorker,stockId,cutSource?.rows??[],sceneExtra);
 $: plot=positionOpen&&face?.gridStatus==='full'&&face.positions.length<=5000?indoorPositionPlot(face.positions,highlight,shapes):null;
 $: roomViewBox=face?.terrain&&face.factor?'0 0 '+face.terrain.sizeX*face.factor+' '+face.terrain.sizeY*face.factor:plot?.viewBox??'0 0 1 1';
 function requestShapes(f:IndoorSurface|null,wk:Worker|null,extra=0,rows:readonly CutClipboard['rows'][number][]=[],extraIds:readonly number[]=[]){shapeRequest=0;shapes={};editable=new Set();removable=new Set();if(!wk||!f?.factor||f.positions.length>5000)return;const ids=[...new Set([...f.positions.filter(p=>p.orientationCode!==null).map(p=>p.itemId),...(extra?[extra]:[]),...rows.map(p=>Number(p.itemId)),...extraIds])];const items=ids.flatMap(itemId=>[0,4,8,12].map(orientationCode=>({itemId,orientationCode})));if(items.length>5000)return;if(!items.length)return;shapeRequest=nextRequest();wk.postMessage({command:'indoor-shapes',factor:f.factor,items,requestId:shapeRequest});}
 function receiveShapes(e:MessageEvent){const d=e.data;if(mixedRequest&&d?.requestId===mixedRequest){mixedRequest=0;mixedValid=d.kind==='mixed-scene-geometry'&&d.valid===true;if(!mixedValid)sceneError=true;return;}if(catalogRequest&&d?.requestId===catalogRequest){catalogRequest=0;if(d.kind==='indoor-catalog'&&Array.isArray(d.items))catalog=d.items;return;}if(!shapeRequest||d?.requestId!==shapeRequest)return;shapeRequest=0;if(d.kind==='indoor-shapes'&&d.shapes&&typeof d.shapes==='object'){shapes=d.shapes;editable=new Set(Array.isArray(d.editable)?d.editable:[]);removable=new Set(Array.isArray(d.removable)?d.removable:[]);}}
 let owned:number[]=[],finishOpen=false,finishChoice=0,allWalls=false,preview:Worker|null=null,previewStatus:'idle'|'working'|'valid'|'error'='idle';
 $: fw=finishWords[locale]??finishWords.en;
 $: copyWords=testSaveWords[locale]??testSaveWords.en;
 const testExport=browser&&testSaveExportEnabled(window.location);
 let finishCopy:ReturnType<typeof experimentalCopyDownload>|null=null;
 $: cw=checkpointWords[locale];
 function clearEdit(){sceneCaptureWorker?.terminate();sceneCaptureWorker=null;mixedDoc=null;mixedRequest=0;mixedValid=false;supportClone=null;sceneEpoch++;sceneReading=false;sceneActive=false;sceneExtra=[];sceneAnchor='corner';sceneError=false;cloneClip=[];cutSource=null;cutClip=[];transferDraft=null;moving=false;placing=false;stockOpen=false;stockId=0;placeDraft=null;hoverCell=null;editWorker?.terminate();editWorker=null;if(editCopy)URL.revokeObjectURL(editCopy.url);editCopy=null;editDraft=null;pickupDraft=null;swap=false;editError=false;}
 function resetObject(){clearEdit();selectedObject=-1;selectedGroup=new Set();}
 function chooseObject(i:number,add=false){if(!tree||!tree.objects[i]||editWorker||editCopy||editDraft||pickupDraft||moving||placing||placeDraft||transferDraft)return;if(swap){const e=indoorFurnitureEdits(face,shapes,editable,selectedObject,i,1);if(e){editDraft=e;swap=false;}return;}if(add&&!swap){const next=new Set(selectedGroup.size?selectedGroup:selectedObject>=0?[selectedObject]:[]);if(next.has(i))next.delete(i);else if(next.size<ROOM_CUT_LIMIT)next.add(i);selectedGroup=next;selectedObject=next.has(i)?i:[...next].at(-1)??-1;}else{selectedGroup=new Set();selectedObject=i;}highlight=selectedObject>=0?tree.objects[selectedObject].itemId:null;}
 function pickObject(e:MouseEvent){
  if(!tree||!roomSvg||editWorker||editCopy||editDraft||pickupDraft||placeDraft||transferDraft||stockOpen||e.detail===0)return;const p=point(e);if(!p)return;
  if(placing&&cutSource){
   if(cutSource!==$worldFurnitureCut||cutSource.file!==file){editError=true;return;}
   const draft=indoorGroupTransfer(face,shapes,removable,cutSource.rows,cutClip,p.x,p.y);
   if(draft){transferDraft=draft;placing=false;hoverCell=null;editError=false;}else editError=true;return;
  }
  if(placing&&cloneClip.length){const draft=(mixedDoc?mixedValid?indoorMixedPlacement(face,shapes,removable,stock,cloneClip,mixedDoc,sceneAnchor,p.x,p.y):null:indoorScenePlacement(face,shapes,removable,stock,cloneClip,sceneAnchor,p.x,p.y));if(draft){placeDraft=draft;placing=false;hoverCell=null;editError=false;}else editError=true;return;}
  if(placing){const draft=indoorPlace(face,shapes,removable,stock,stockId,p.x,p.y,stockOrientation);if(draft){placeDraft=[supportClone?{...draft,supportSource:supportClone}:draft];placing=false;hoverCell=null;editError=false;}else editError=true;return;}
  if(moving){const draft=selectedGroup.size>1?indoorGroupMove(face,shapes,editable,[...selectedGroup],selectedObject,p.x,p.y):indoorMove(face,shapes,editable,selectedObject,p.x,p.y);if(draft){editDraft=draft;moving=false;hoverCell=null;editError=false;}else editError=true;return;}
  const hits=supportHitIndices(tree,shapes,p.x,p.y).filter(i=>!swap||partners.includes(i));if(hits.length)chooseObject(hits[(hits.indexOf(selectedObject)+1)%hits.length],e.ctrlKey||e.metaKey||e.shiftKey);
 }
 function runFurniture(){
  if(!editAllowed||!file||!room||!face||(!editDraft&&!pickupDraft&&!placeDraft&&!transferDraft)||cutSource&&(cutSource!==$worldFurnitureCut||cutSource.file!==file))return;
  const source=file,edits=editDraft,pickup=pickupDraft,place=placeDraft,transfer=transferDraft,worker=new Worker(new URL('./indoor-room-view.worker.ts',import.meta.url),{type:'module'});editWorker=worker;editError=false;
  const done=(d:any)=>{worker.terminate();if(editWorker!==worker||file!==source||editDraft!==edits||pickupDraft!==pickup||placeDraft!==place||transferDraft!==transfer){d?.bytes?.fill(0);return;}editWorker=null;try{if(d?.kind!=='indoor-furniture-copy')throw Error('copy');editCopy=experimentalCopyDownload(d,source);}catch{editError=true;}};
  worker.onmessage=e=>done(e.data);worker.onerror=()=>done(null);worker.onmessageerror=()=>done(null);
  worker.postMessage({command:'indoor-furniture-export',file:source,allowExperimentalCopy:true,plan:{roomOrdinal:room.ordinal,surfaceOrdinal:face.ordinal,...(transfer?{transfer}:place?{place}:pickup?{pickup}:{edits})}});
 }
 function applyFurniture(){if(!testExport||blocked||!file||!editCopy||cutSource&&(cutSource!==$worldFurnitureCut||cutSource.file!==file)||!commitWorldCheckpoint(file,editCopy.file)){editError=true;return;}if(cutSource){worldFurnitureCut.set(null);worldFurnitureClipboard.set([]);}resetObject();}
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
 function keys(e:KeyboardEvent){if(supportParent&&e.key==='Escape'){e.preventDefault();e.stopPropagation();closeSupport();return;}if(supportParent&&e.key!=='Tab')return;if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='x'&&canCut&&!(e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,[contenteditable=true]'))){if(captureRoomCut()){e.preventDefault();e.stopPropagation();}return;}if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='v'&&availableCut&&editAllowed&&!moving&&!placing&&!editDraft&&!pickupDraft&&!placeDraft&&!transferDraft&&!swap&&!stockOpen&&!(e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,[contenteditable=true]'))){e.preventDefault();e.stopPropagation();beginTransfer();return;}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();return;}if(e.key!=='Tab')return;const controls=[...root.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href]')].filter(el=>!el.closest('[inert]'));if(!controls.length)return;const first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
 $: w=indoorWords[locale]??indoorWords.en;
 $: if(file!==seen)load(file);
 $: room=rooms[selected]??null;
 $: face=room?.surfaces[surface]??null;
 $: filtered=(face?.items??[]).filter(p=>name(p.itemId,records,locale,w[12]).normalize('NFKC').toLocaleLowerCase().includes(query.normalize('NFKC').toLocaleLowerCase().trim()));
 $: visible=filtered.slice(0,limit);
 $: if(room)loadItems([...room.surfaces.map(s=>s.finish),room.ceiling,...(face?.items.map(p=>p.itemId)??[]),...(finishOpen?owned:[])].filter((n):n is number=>typeof n==='number'&&n>0),[...visible.map(p=>p.itemId),...(finishOpen&&finishChoice?[finishChoice]:[])]);
 function name(id:number|null,dict:ReadonlyMap<number,ItemMasterRecord|CompleteItemMasterRecord>,lang:WandLanguage,unknown:string){return id===null?unknown:dict.get(id)?.names[lang]??dict.get(id)?.names.en??unknown;}
 function load(next:File|null){closeSupport();supportParents=[];resetObject();stock=new Map();const history=$localSaveSession.worldCheckpoint,keep=!!next&&!!seen&&!!history&&history.files[history.cursor]===next;const oldRoom=selected,oldSurface=surface;seen=next;own?.terminate();own=null;rooms=[];owned=[];finishOpen=false;cancelPreview();selected=0;surface=0;query='';highlight=null;status='loading';if(!next){status='ready';return;}
  const worker=new Worker(new URL('./indoor-room-view.worker.ts',import.meta.url),{type:'module'});own=worker;
  const done=(v:unknown,rawStock?:unknown)=>{worker.terminate();if(own!==worker||file!==next)return;own=null;try{rooms=parseIndoorRooms(v);supportParents=parseIndoorSupportParents(v,rooms);owned=parseOwnedFinishes(v);try{stock=parseFurnitureStock(rawStock);}catch{stock=new Map();}if(keep&&rooms[oldRoom]){selected=oldRoom;surface=Math.min(oldSurface,rooms[oldRoom].surfaces.length-1);}status='ready';}catch{status='error';}};
  worker.onmessage=e=>done(e.data?.kind==='indoor-rooms'?e.data.result:null,e.data?.stock);worker.onerror=()=>done(null);worker.onmessageerror=()=>done(null);worker.postMessage({command:'indoor-rooms',file:next});
 }
 function loadItems(ids:number[],art:number[]){const fresh=[...new Set(ids)].filter(id=>!asked.has(id));for(const id of fresh)asked.add(id);
  if(fresh.length){db??=openCurrentItemDatabase(base);void db.then(async d=>{for(let i=0;i<fresh.length;i+=128){const rows=await d.getItems(fresh.slice(i,i+128));const next=new Map(records);for(const row of rows)if(row)next.set(row.itemId,row);records=next;resolved=new Set([...resolved,...fresh.slice(i,i+128)]);}}).catch(()=>{itemLoadFailed=true;});}
  for(const id of new Set([...(room?.surfaces.map(s=>s.finish)??[]),room?.ceiling,...art]))if(typeof id==='number'&&id>0&&!images.has(id)){images=new Map(images).set(id,'');void worldArtwork(base,id).then(url=>{if(url)images=new Map(images).set(id,url);}).catch(()=>{});}
 }
 function choose(i:number){resetObject();cancelPreview();finishOpen=false;selected=i;surface=0;query='';highlight=null;limit=80;}
 onDestroy(()=>{own?.terminate();clearEdit();cancelPreview();shapeWorker?.removeEventListener('message',receiveShapes);});
</script>
<div class="indoor-room-view" role="dialog" aria-label={w[0]} aria-modal="true" bind:this={root} on:keydown={keys}>
 <header><strong>{w[0]}</strong><button type="button" bind:this={closeButton} on:click={onClose} aria-label={w[7]}>×</button></header>
 {#if status==='loading'}<p role="status">{w[8]}</p>{:else if status==='error'}<p role="alert">{w[10]}</p>{:else if !rooms.length}<p>{w[9]}</p>{:else if room}
 <div class="room-body" inert={!!supportParent}>
  <nav aria-label={w[3]}>{#each rooms as r,i}<button type="button" aria-pressed={i===selected} on:click={()=>choose(i)}>{w[1]} {r.house} / {w[2]} {r.floor} · {r.name||w[3]+' '+r.ordinal}</button>{/each}</nav>
  <div class="room-content">
   <div class="finish-heading"><strong>{w[15]}</strong><button type="button" disabled={!wallReady} aria-pressed={finishOpen} on:click={()=>{resetObject();cancelPreview();finishOpen=!finishOpen;}}>{fw[0]}</button></div>
   <div class="finishes">
    {#each room.surfaces as s,i}<button type="button" class="finish-card" aria-pressed={surface===i} on:click={()=>{resetObject();cancelPreview();surface=i;query='';highlight=null;limit=80;}}><span>{i===0?w[4]:w[5]+' '+i}</span>{#if s.finish&&images.get(s.finish)}<img src={images.get(s.finish)} alt="" loading="lazy"/>{/if}<small>{s.finish===0?w[11]:name(s.finish,records,locale,w[12])}</small></button>{/each}
    <div class="finish-card"><span>{w[6]}</span>{#if room.ceiling&&images.get(room.ceiling)}<img src={images.get(room.ceiling)} alt="" loading="lazy"/>{/if}<small>{room.ceiling===0?w[11]:name(room.ceiling,records,locale,w[12])}</small></div>
   </div>
   {#if finishOpen}<div class="finish-picker">{#if surface>0}<label><input type="checkbox" bind:checked={allWalls} disabled={previewStatus==='working'} on:change={resetFinishStatus}/> {fw[2]}</label>{/if}<select aria-label={fw[0]} bind:value={finishChoice} disabled={previewStatus==='working'} on:change={resetFinishStatus}><option value={0} disabled>{fw[0]}</option>{#each choices as id}<option value={id}>{name(id,records,locale,w[12])}</option>{/each}</select>{#if finishChoice&&images.get(finishChoice)}<img class="finish-preview-art" src={images.get(finishChoice)} alt=""/>{/if}<button type="button" disabled={!choices.includes(finishChoice)||previewStatus==='working'} on:click={checkFinish}>{fw[3]}</button>{#if itemLoadFailed}<small role="alert">{w[10]}</small>{:else if finishLoading}<small role="status">{w[8]}</small>{:else if !choices.length}<small>{fw[6]}</small>{/if}{#if previewStatus!=='idle'}<small role="status">{previewStatus==='valid'?fw[4]:previewStatus==='working'?fw[7]:fw[5]}</small>{/if}{#if testExport&&previewStatus==='valid'&&blocked}<small>{stockToolWords[locale][12]}</small>{:else if testExport&&previewStatus==='valid'}<small>{copyWords[1]}</small><button type="button" on:click={()=>runFinish(true)}>{copyWords[0]}</button>{#if finishCopy}<button type="button" on:click={applyFinishCopy}>{cw[0]}</button><a class="test-copy-link" href={finishCopy.url} download={finishCopy.name}>{copyWords[2]}</a>{/if}{/if}</div>{/if}
   {#if roomSupports.length}<div class="indoor-edit">{#each roomSupports as p (p.localOrdinal)}<button type="button" disabled={moving||placing||!!editDraft||!!pickupDraft||!!placeDraft||!!transferDraft||!!editCopy||!!editWorker||finishOpen} on:click={()=>openSupport(p)}>{supportText[0]} · {name(p.itemId,records,locale,w[12])} · {p.x}, {p.y}</button>{/each}</div>{/if}
   <div class="room-items-header"><strong>{w[13]}{#if face?.gridStatus==='full'} · {face.items.reduce((n,p)=>n+p.quantity,0)}{/if}</strong><button type="button" aria-pressed={positionOpen} on:click={()=>{resetObject();positionOpen=!positionOpen;}}>{pw[0]}</button><input type="search" aria-label={w[17]} placeholder={w[17]} bind:value={query} on:input={()=>limit=80}/></div>
   {#if face?.gridStatus!=='full'}<p>{w[16]}</p>{:else}
    {#if positionOpen}<section class="position-map" aria-label={pw[0]}><small>{face.terrain?itw[0]:plot?.footprints.length?indoorShapeWords[locale]:pw[2]}</small>{#if face.missingPositions}<small>{pw[3]}: {face.missingPositions}</small>{/if}{#if face.positions.length>5000}<small>{pw[6]}</small>{:else if plot||face.terrain}<button type="button" class="room-map-button" aria-label={moving||placing?itw[3]:iw[1]} on:click={pickObject} on:pointermove={e=>{hoverCell=moving||placing?point(e):null;}} on:pointerleave={()=>hoverCell=null}><svg bind:this={roomSvg} viewBox={roomViewBox} role="img" aria-label={pw[2]}><title>{face.terrain?itw[0]:plot?.footprints.length?indoorShapeWords[locale]:pw[2]}</title>{#if face.terrain&&face.factor}{#each Array.from(face.terrain.nativeFloorValues) as v,i}<rect x={(i%face.terrain.sizeX)*face.factor} y={Math.floor(i/face.terrain.sizeX)*face.factor} width={face.factor} height={face.factor} fill={v===0?'#a45b5b':v===3072?'#6c8b92':'#6ba98b'} fill-opacity=".3" stroke="currentColor" stroke-opacity=".25" vector-effect="non-scaling-stroke"/>{/each}{/if}{#each plot?.footprints??[] as f}<path class="indoor-footprint" class:highlighted={highlight===f.itemId} class:dimmed={highlight!==null&&highlight!==f.itemId} d={f.path} transform={'translate('+f.x+' '+f.y+')'}/>{/each}{#each plot?.points??[] as p (p.x+':'+p.y)}<circle cx={p.x} cy={p.y} r={plot?.markerRadius??.16} class:highlighted={p.selected>0} class:dimmed={highlight!==null&&!p.selected}><title>{pw[4]}: {p.count}</title></circle>{/each}{#if tree&&selectedGroup.size>1}{#each [...selectedGroup] as i}{@const o=tree.objects[i]}{@const change=(editDraft??groupMovePreview)?.find(e=>e.index===i)}{@const shape=o&&shapes[o.itemId+':'+CARDINAL_ORIENTATIONS.indexOf((change?.orientation??o.orientation) as typeof CARDINAL_ORIENTATIONS[number])*4]}{#if shape}<path d={shape.path} transform={'translate('+(change?.x??o.x)+' '+(change?.y??o.y)+')'} fill={pickupDraft?'#d45b5b':moving&&hoverCell&&!groupMovePreview?'#c45b5b':'#4bddcd'} fill-opacity=".5" stroke="currentColor" vector-effect="non-scaling-stroke"/>{/if}{/each}{:else if tree&&selectedObject>=0&&tree.objects[selectedObject]}{@const o=tree.objects[selectedObject]}{@const change=editDraft?.find(e=>e.index===selectedObject)}{@const orientation=change?.orientation??o.orientation}{@const code=['GridOrientation_Up','GridOrientation_Right','GridOrientation_Down','GridOrientation_Left'].indexOf(orientation)*4}{@const shape=shapes[o.itemId+':'+code]}{#if shape}<path d={shape.path} transform={'translate('+(change?.x??o.x)+' '+(change?.y??o.y)+')'} fill={pickupDraft?'#d45b5b':'#4bddcd'} fill-opacity=".5" stroke="currentColor" vector-effect="non-scaling-stroke"/>{/if}{/if}{#if hoverCell&&previewShape}<path d={previewShape.path} transform={'translate('+hoverCell.x+' '+hoverCell.y+')'} fill={previewValid?'#4bddcd':'#c45b5b'} fill-opacity=".5" stroke="currentColor" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>{/if}{#if cutGhost}{#each cutGhost as p}{@const shape=shapes[p.itemId+':'+CARDINAL_ORIENTATIONS.indexOf(p.orientation as typeof CARDINAL_ORIENTATIONS[number])*4]}{#if shape}<path d={shape.path} transform={'translate('+p.x+' '+p.y+')'} fill="#4bddcd" fill-opacity=".5" stroke="currentColor" vector-effect="non-scaling-stroke"/>{#if images.get(p.itemId)}<image href={images.get(p.itemId)} x={p.x} y={p.y} width={shape.width} height={shape.height}/>{/if}{/if}{/each}{/if}</svg></button><small>{pw[5]}</small>{/if}</section>{/if}
    {#if positionOpen&&tree}<div class="indoor-edit"><small>{isw[1]}</small><button type="button" disabled={(!selectedScene&&!mixedSelected)||!!sceneCaptureWorker||moving||placing||!!editDraft||!!pickupDraft||!!placeDraft||!!transferDraft||!!editCopy} on:click={()=>mixedSelected?captureRoomMixed(cutIndices):saveRoomScene(selectedScene)}>{sw[0]}</button><button type="button" disabled={(!surfaceScene&&!mixedSurface)||!!sceneCaptureWorker||moving||placing||!!editDraft||!!pickupDraft||!!placeDraft||!!transferDraft||!!editCopy} on:click={()=>mixedSurface?captureRoomMixed(face.positions.map((_,i)=>i)):saveRoomScene(surfaceScene)}>{isw[0]}</button>{#if testExport}<input type="file" accept=".json,application/json" hidden bind:this={sceneInput} on:change={openRoomScene}/><button type="button" disabled={!editAllowed||!face.terrain||sceneReading||moving||placing||!!editDraft||!!pickupDraft||!!placeDraft||!!transferDraft||stockOpen} on:click={()=>sceneInput.click()}>{sw[1]}</button>{/if}{#if sceneError}<small role="alert">{isw[2]}</small>{/if}{#if sceneActive}<select aria-label={sw[6]} bind:value={sceneAnchor} disabled={!placing}><option value="corner">{sw[3]}</option><option value="center">{sw[2]}</option></select><small>{mixedRequest?'…':sceneMissing?isw[2]:cloneClip.length}</small>{#if mixedDoc}<div class="indoor-edit">{#each [...sceneCounts] as [id,n]}<small>{name(id,records,locale,w[12])} · {stock.get(id)??0}/{n}</small>{/each}</div>{/if}{/if}</div>{/if}
    {#if positionOpen&&tree&&testExport}<div class="indoor-edit"><strong>{iw[0]}</strong><small>{face.terrain?itw[5]:iw[2]}</small>
     <select aria-label={iw[1]} value={selectedObject} disabled={!!editDraft||!!pickupDraft||!!editCopy||!!editWorker||moving||placing||!!placeDraft||!!transferDraft||stockOpen} on:change={e=>chooseObject(Number(e.currentTarget.value))}><option value={-1} disabled>{iw[1]}</option>{#each tree.objects as o,i}<option value={i} disabled={swap&&!partners.includes(i)}>{name(o.itemId,records,locale,w[12])} · {o.x}, {o.y}</option>{/each}</select>
     {#if selectedObject>=0&&selectedGroup.size<=1&&!editDraft&&!pickupDraft&&!editCopy&&!moving&&!placing&&!placeDraft&&!transferDraft&&!stockOpen}<button type="button" disabled={!editAllowed||!left||swap} on:click={()=>editDraft=left}>{ew[0]}</button><button type="button" disabled={!editAllowed||!right||swap} on:click={()=>editDraft=right}>{ew[1]}</button><button type="button" disabled={!editAllowed||!partners.length||swap} on:click={()=>swap=true}>{ew[2]}</button><button type="button" disabled={!editAllowed||!pickup||swap} on:click={()=>{if(pickup)pickupDraft=[pickup];}}>{iw[3]}</button>{#if face.terrain}<button type="button" disabled={!editAllowed||!moveShape||!editable.has(tree.objects[selectedObject].itemId)||swap} on:click={()=>{moving=true;editError=false;}}>{itw[1]}</button>{/if}{/if}
     {#if selectedGroup.size>1&&!moving&&!placing&&!editDraft&&!pickupDraft&&!placeDraft&&!transferDraft&&!editCopy&&!swap&&!stockOpen}<button type="button" disabled={!editAllowed||!groupMoveReady} on:click={()=>{moving=true;editError=false;}}>{indoorGroupMoveWords[locale]} · {selectedGroup.size}</button><button type="button" disabled={!editAllowed||!groupLeft} on:click={()=>editDraft=groupLeft}>{ew[0]}</button><button type="button" disabled={!editAllowed||!groupRight} on:click={()=>editDraft=groupRight}>{ew[1]}</button>{/if}
     {#if face.terrain&&!moving&&!placing&&!editDraft&&!pickupDraft&&!placeDraft&&!transferDraft&&!editCopy&&!swap&&!cutSource}<button type="button" disabled={!editAllowed||!catalog.length} on:click={()=>{stockOpen=!stockOpen;stockQuery='';}}>{itw[2]}</button>{/if}
     {#if stockOpen}<input type="search" bind:value={stockQuery} placeholder={itw[4]} aria-label={itw[4]}/><select aria-label={itw[2]} value={0} on:change={e=>chooseStock(Number(e.currentTarget.value))}><option value={0} disabled>{itw[2]}</option>{#each options as o}<option value={o.itemId}>{o.name} · {stock.get(o.itemId)}</option>{/each}</select>{/if}
     {#if selectedObject>=0&&!moving&&!placing&&!editDraft&&!pickupDraft&&!placeDraft&&!transferDraft&&!editCopy&&!swap&&!stockOpen}
      {#if selectedGroup.size>1}<button type="button" disabled={!editAllowed||!groupPickup} on:click={()=>pickupDraft=groupPickup}>{indoorGroupStockWords[locale][0]} · {selectedGroup.size}</button>{/if}
      <button type="button" disabled={!editAllowed||!duplicateClip} on:click={beginDuplicate}>{indoorGroupStockWords[locale][1]}{#if selectedGroup.size>1} · {selectedGroup.size}{/if}</button>
     {/if}
     {#if canCut}<button type="button" on:click={captureRoomCut}>{cutWords[0]}{#if cutIndices.length>1} · {cutIndices.length}{/if}</button>{/if}
     {#if $worldFurnitureCut?.file===file&&$worldFurnitureCut?.scope==='indoor'&&!cutSource}<small role="status">{cutWords[1]} · {$worldFurnitureCut.rows.length}</small>{/if}
     {#if availableCut&&!moving&&!placing&&!editDraft&&!pickupDraft&&!placeDraft&&!transferDraft&&!editCopy&&!swap&&!stockOpen}<button type="button" disabled={!editAllowed} on:click={beginTransfer}>{indoorTransferWords[locale]}</button>{/if}
     {#if moving||placing}<small>{itw[3]}</small>{/if}{#if placing}<button type="button" on:click={()=>turnStock(-1)}>{ew[0]}</button><button type="button" on:click={()=>turnStock(1)}>{ew[1]}</button>{/if}
     {#if placeDraft}<small>{placeDraft.length===1?placeDraft[0].expectedStock+' → '+(placeDraft[0].expectedStock-1):'+'+placeDraft.length}</small>{/if}
     {#if swap}<small>{ew[3]}</small>{/if}
     {#if pickupDraft}<small>{pickupDraft.length===1?pickupDraft[0].expectedStock+' → '+(pickupDraft[0].expectedStock+1):'−'+pickupDraft.length}</small>{/if}
     {#if (editDraft||pickupDraft||placeDraft||transferDraft)&&!editCopy}<button type="button" disabled={!editAllowed} on:click={runFurniture}>{iw[4]}</button>{/if}
     {#if swap||editDraft||pickupDraft||editCopy||moving||placing||placeDraft||transferDraft||stockOpen}<button type="button" on:click={clearEdit}>{w[7]}</button>{/if}
     {#if editCopy}<small>{copyWords[1]}</small><button type="button" disabled={blocked} on:click={applyFurniture}>{cw[0]}</button><a class="test-copy-link" href={editCopy.url} download={editCopy.name}>{copyWords[2]}</a>{/if}
     {#if editError}<small role="alert">{iw[5]}</small>{/if}
    </div>{/if}
    <div class="room-items" on:scroll={e=>{const el=e.currentTarget;if(el.scrollTop+el.clientHeight>=el.scrollHeight-100)limit=Math.min(filtered.length,limit+80);}}>
     {#each visible as item (item.itemId)}<button type="button" class="room-item" aria-pressed={highlight===item.itemId} on:click={()=>{highlight=highlight===item.itemId?null:item.itemId;positionOpen=true;}}>{#if images.get(item.itemId)}<img src={images.get(item.itemId)} alt="" loading="lazy"/>{/if}<span>{name(item.itemId,records,locale,w[12])}</span><strong>×{item.quantity}</strong></button>{/each}
    </div>
   {/if}
  </div>
 </div>
 {/if}
 {#if supportParent}<SubgridInspector open={true} roomParent={supportParent} {roomPickupPlan} roomDuplicateAllowed={supportCloneReady} onRoomDuplicate={beginSupportDuplicate} {file} worker={terrainWorker} names={supportNames} {base} {locale} canMove={testExport&&!blocked} {nextRequest} onItems={ids=>loadItems(ids,ids)} onClose={closeSupport}/>{/if}
 {#if !testExport}<footer>{w[14]}</footer>{/if}
</div>
<style>
 .room-map-button{flex:1;min-height:0;padding:0;background:none;border:0;display:flex}.indoor-edit{display:flex;flex-wrap:wrap;align-items:center;gap:5px}.indoor-edit small{flex-basis:100%}.indoor-edit select{max-width:100%}
 .indoor-room-view{position:absolute;inset:0;z-index:22;background:var(--wand-bg);color:var(--wand-text);display:flex;flex-direction:column;min-width:0;overflow:hidden;padding:8px;gap:6px}
 header,.finish-heading,.room-items-header{display:flex;align-items:center;gap:6px}header strong,.room-items-header strong{flex:1}button,input,select{font:inherit;color:inherit;background:var(--wand-menu);border:1px solid var(--wand-line);border-radius:5px;padding:5px}button[aria-pressed=true]{outline:2px solid var(--wand-accent)}.finish-picker{display:flex;align-items:center;gap:5px;flex-wrap:wrap}.test-copy-link{color:var(--wand-accent);padding:5px;border:1px solid var(--wand-line);border-radius:5px}.finish-picker select{max-width:min(240px,100%)}.finish-preview-art{width:48px;height:48px;object-fit:contain}.room-body{display:flex;flex:1;min-height:0;gap:8px}nav{width:min(220px,35%);display:flex;flex-direction:column;gap:4px;overflow:auto}nav button{text-align:start;overflow-wrap:anywhere}.room-content{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;gap:6px}.finishes{display:flex;gap:5px;overflow:auto;flex:none;max-height:40%}.finish-card{min-width:100px;max-width:145px;display:flex;flex-direction:column;align-items:center;gap:3px;background:var(--wand-card);padding:5px;border-radius:5px}.finish-card img{width:64px;height:64px;object-fit:contain}.finish-card small{text-align:center;overflow-wrap:anywhere}.position-map{display:flex;flex-direction:column;gap:2px;min-height:0;flex:1;background:var(--wand-card);border:1px solid var(--wand-line);border-radius:5px;padding:4px}.position-map svg{width:100%;flex:1;min-height:40px;max-height:35vh}.indoor-footprint{fill:var(--wand-muted);fill-opacity:.45;stroke:var(--wand-line);stroke-width:1;vector-effect:non-scaling-stroke}.indoor-footprint.highlighted{fill:var(--wand-accent);stroke:var(--wand-text)}.indoor-footprint.dimmed{opacity:.25}.position-map circle{fill:var(--wand-muted)}.position-map circle.highlighted{fill:var(--wand-accent);stroke:var(--wand-text);stroke-width:1;vector-effect:non-scaling-stroke}.position-map circle.dimmed{opacity:.25}.position-map small{font-size:11px;color:var(--wand-muted)}.room-items{flex:1;min-height:0;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(105px,1fr));gap:4px;align-content:start}.room-item{display:flex;flex-direction:column;align-items:center;text-align:center;background:var(--wand-card);border-radius:5px;padding:4px;overflow-wrap:anywhere;font-size:12px}.room-item img{width:52px;height:52px;object-fit:contain}footer{font-size:12px;color:var(--wand-muted)}@media(max-width:600px){.room-body{flex-direction:column}nav{width:100%;max-height:24%;flex-direction:row;flex-wrap:wrap}.room-items-header input{width:45%}}
</style>
