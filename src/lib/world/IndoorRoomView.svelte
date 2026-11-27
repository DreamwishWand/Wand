<script lang="ts">
 import PresetFilePicker from './PresetFilePicker.svelte';
 import {savePresetFile} from './preset-session.ts';
 import {readPresetText} from '../presets/preset-file.ts';
 import {onMount,onDestroy} from 'svelte';
 import RoomProjectApply from './RoomProjectApply.svelte';
 import RoomProjectCapture from './RoomProjectCapture.svelte';
 import {roomApplyWords} from './room-project-apply.ts';
 import SubgridInspector from './SubgridInspector.svelte';
 import SaveSupportMap from './SaveSupportMap.svelte';
 import {supportMarkerHit,type SupportMapParent} from './support-map-preview.ts';
 import type {DesignSymmetry,SymmetryMode} from './design-symmetry.ts';
 import {supportPickupWords} from './group-pickup.ts';
 import {supportWords,parseSupportTree} from './subgrid-local.ts';
 import {captureSupportScene,mixedSceneCounts,type MixedScenePreset,type SupportScene} from './support-scene.ts';
 import {parseIndoorSupportParents,roomSupportPickupPlan,type IndoorSupportWitness} from './indoor-support.ts';
 import {roomCameraBounds,roomCameraZoom,roomCameraPan,roomCameraArt,roomCameraWords,roomDragDraft,roomKeyDelta,type RoomCamera} from './indoor-map-camera.ts';
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
 import {indoorHouseGroups,parseIndoorRooms,parseOwnedFinishes,verifyFinishReceipt,indoorWords,finishWords,positionWords,indoorPositionPlot,indoorShapeWords,indoorEditableTree,indoorHitIndices,indoorFreeFloor,indoorFreeRotate,indoorFreeMoveGroup,indoorFurnitureEdits,indoorSwapPartners,indoorPickup,indoorGroupPickup,indoorDuplicateClip,indoorGroupStockWords,captureIndoorScene,indoorSceneClip,indoorScenePlacement,indoorMixedScene,indoorMixedPlacement,captureIndoorMixedScene,indoorSceneWords,indoorEditWords,indoorMove,indoorGroupMove,indoorGroupRotate,indoorGroupMoveWords,indoorAlign,indoorSymmetricDuplicate,indoorLinkedMove,indoorLinkedRotate,indoorLinkedPlacement,indoorLinkedWords,indoorAlignWords,type IndoorAlignMode,indoorPlace,indoorTerrainWords,indoorTransferWords,captureIndoorCut,indoorGroupTransfer,rotateIndoorCut,type IndoorTransferRow,type IndoorPlace,type IndoorPickup,type IndoorRoom,type IndoorSurface} from './indoor-room-view.ts';
 import {parseFurnitureStock} from './furniture-stock-view.ts';
 import {worldFurnitureCut,worldFurnitureClipboard,groupCutWords,ROOM_CUT_LIMIT,type CutClipboard} from './group-paste.ts';
 import {CARDINAL_ORIENTATIONS,EIGHT_WAY_ORIENTATIONS,worldOrientationCode,type EightWay} from './saved-map-transform.ts';
 import {childEditWords,type SupportChildEdit} from './subgrid-local.ts';
 import type {DesignClipItem} from './design-layout.ts';
 import type {SourceObjectShape} from './source-object-map.ts';
 import type {WandLanguage} from '../ui/preferences';
 export let file:File|null,locale:WandLanguage='ja',onClose:()=>void;
 export let terrainWorker:Worker|null=null,nextRequest:()=>number,blocked=false;
 let projectApplyOpen=false;
 $: rap=roomApplyWords[locale];
 let seen:File|null=null,own:Worker|null=null,rooms:IndoorRoom[]=[],status:'loading'|'ready'|'error'='loading',selected=0,surface=0,query='',limit=80;
 let positionOpen=true,highlight:number|null=null;
 let supportParents:IndoorSupportWitness[]=[],supportParent:IndoorSupportWitness|null=null,supportFile:File|null=null,supportChild:number|null=null;
 let supportClone:IndoorPlace['supportSource']|null=null;
 $: supportCloneReady=!!supportParent&&!!face?.terrain&&removable.has(supportParent.itemId)&&!!roomPickupPlan;
 function beginSupportDuplicate(needs:ReadonlyMap<number,number>){if(linkedAxis){editError=true;return;}
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
 function closeSupport(){supportParent=null;supportFile=null;supportChild=null;}
 function openSupport(p:IndoorSupportWitness,child:number|null=null){if(!file||moving||placing||editDraft||pickupDraft||placeDraft||transferDraft||editCopy||editWorker||finishOpen)return;clearEdit();supportParent=p;supportFile=file;supportChild=child;}

 let selectedObject=-1,swap=false,editDraft:SupportChildEdit[]|null=null,pickupDraft:IndoorPickup[]|null=null,editWorker:Worker|null=null,editCopy:ReturnType<typeof experimentalCopyDownload>|null=null,editError=false,stock=new Map<number,number>(),editable=new Set<number>(),removable=new Set<number>();
 let roomSvg:SVGSVGElement,roomMapWidth=0,roomMapHeight=0;
 let moving=false,placing=false,stockOpen=false,stockId=0,stockOrientation:EightWay='GridOrientation_Down',placeDraft:IndoorPlace[]|null=null,hoverCell:{x:number;y:number}|null=null,catalogRequest=0,stockQuery='',catalog:{itemId:number;name:string}[]=[];
 let cutSource:CutClipboard|null=null,cutClip:readonly DesignClipItem[]=[],transferDraft:IndoorTransferRow[]|null=null;
 let selectedGroup=new Set<number>(),cloneClip:readonly DesignClipItem[]=[];
 let sceneInput:HTMLInputElement,sceneReading=false,sceneEpoch=0,sceneExtra:number[]=[],sceneAnchor:ScenePreset['anchor']='corner',sceneActive=false,sceneError=false;
 $: sw=sceneWords[locale];$: isw=indoorSceneWords[locale];
 $: selectedScene=captureIndoorScene(face,cutIndices,shapes,freeEdit?freeEligible:removable,freeEdit);
 $: surfaceScene=captureIndoorScene(face,face?.positions.map((_,i)=>i)??[],shapes,freeEdit?freeEligible:removable,freeEdit);
 let mixedDoc:MixedScenePreset|null=null,mixedRequest=0,mixedValid=false,sceneCaptureWorker:Worker|null=null;
 let mixedSources:readonly (NonNullable<IndoorPlace['supportSource']>|null)[]|null=null;
 $: sceneCounts=mixedDoc?mixedSceneCounts(mixedDoc.items):sceneItemCounts(cloneClip);
 $: mixedSelected=cutIndices.some(i=>roomSupports.some(p=>p.index===i));
 $: mixedSurface=roomSupports.length>0;
 function captureRoomMixed(indices:readonly number[],duplicate=false,pointSymmetry=false){
  if(!file||!face||!terrainWorker||sceneCaptureWorker||!indices.length||indices.length>ROOM_CUT_LIMIT)return;
  const source=file,target=face,selection=[...indices],sh=shapes,allowed=removable;
  const parents=roomSupports.filter(p=>selection.includes(p.index));if(!parents.length)return;
  const session=new Worker(new URL('./subgrid-local.worker.ts',import.meta.url),{type:'module'});sceneCaptureWorker=session;sceneError=false;
  const done=(d:any)=>{session.terminate();if(sceneCaptureWorker!==session)return;sceneCaptureWorker=null;if(file!==source||face!==target||duplicate&&(!editAllowed||moving||placing||editDraft||pickupDraft||placeDraft||transferDraft))return;
   try{if(d?.kind!=='subgrids-local'||!Array.isArray(d.results)||d.results.length!==parents.length)throw Error('receipt');const supports=new Map<number,SupportScene>();
    for(const p of parents){const result=d.results.find((v:any)=>v.localOrdinal===p.localOrdinal);const scene=captureSupportScene(p.itemId,parseSupportTree(result?.result));if(!scene)throw Error('tree');supports.set(p.index,scene);}
    const scene=captureIndoorMixedScene(target,selection,sh,allowed,supports);if(!scene)throw Error('scene');
    if(pointSymmetry){if(linkPicking||!symmetryMode||symmetryMode!=='point'||selection.join(',')!==cutIndices.join(','))return;pointSupports=supports;pointRequest=nextRequest();pointValid=false;terrainWorker!.postMessage({command:'mixed-scene-geometry',requestId:pointRequest,scene,locale});return;}
    if(!duplicate){saveRoomScene(scene);return;}
    if([...mixedSceneCounts(scene.items)].some(([id,n])=>(stock.get(id)??0)<n))throw Error('stock');
    const sources=selection.map(i=>{const p=target.positions[i];return supports.has(i)&&p.orientationCode!==null?{index:i,expectedX:p.x,expectedY:p.y,expectedOrientation:CARDINAL_ORIENTATIONS[p.orientationCode/4]}:null;});
    resetObject();mixedDoc=scene;mixedSources=sources;mixedValid=false;sceneActive=true;sceneAnchor=scene.anchor;cloneClip=scene.items.map(({support,...pose})=>pose);sceneExtra=[...new Set(cloneClip.map(p=>p.itemId))];placing=true;
    mixedRequest=nextRequest();terrainWorker!.postMessage({command:'mixed-scene-geometry',requestId:mixedRequest,scene,locale});loadItems([...mixedSceneCounts(scene.items).keys()],sceneExtra);
   }catch{sceneError=true;}
  };session.onmessage=e=>done(e.data);session.onerror=()=>done(null);session.onmessageerror=()=>done(null);session.postMessage({command:'inspect-subgrids',file:source,parents:parents.map(({localOrdinal,itemId,x,y})=>({localOrdinal,itemId,x,y}))});
 }

 $: sceneMissing=[...sceneCounts].some(([id,n])=>(stock.get(id)??0)<n);
 function saveRoomScene(scene:ScenePreset|MixedScenePreset|null){if(!scene)return;savePresetFile(JSON.stringify(scene),'wand-scene.json');}
 async function openRoomScene(e:Event){
  const input=e.currentTarget as HTMLInputElement,chosen=input.files?.[0];input.value='';if(chosen)void openRoomSceneFile(chosen);
 }
 async function openRoomSceneFile(chosen:File){
  if(!chosen||!file||!face?.factor||!face.terrain||!editAllowed||sceneReading)return;
  const epoch=++sceneEpoch,source=file,target=face;sceneReading=true;sceneError=false;
  try{
   if(chosen.size>DESIGN_FILE_LIMIT)throw Error('size');
   const raw=await readPresetText(chosen,DESIGN_FILE_LIMIT),mixed=indoorMixedScene(raw);
   const value=mixed?{clip:mixed.items.map(({support,...pose})=>pose),anchor:mixed.anchor}:indoorSceneClip(raw,target.factor!,freeEdit);
   if(value.clip.length>ROOM_CUT_LIMIT||mixed&&(!terrainWorker||linkedAxis))throw Error('scene limit');
   if(epoch!==sceneEpoch||file!==source||face!==target||!editAllowed||moving||placing||editDraft||pickupDraft||placeDraft||transferDraft)return;
   resetObject();sceneActive=true;sceneAnchor=value.anchor;cloneClip=value.clip;sceneExtra=[...new Set(value.clip.map(p=>p.itemId))];placing=true;
   if(mixed){mixedDoc=mixed;mixedValid=false;mixedRequest=nextRequest();terrainWorker!.postMessage({command:'mixed-scene-geometry',requestId:mixedRequest,scene:mixed,locale});}
   const ids=mixed?[...mixedSceneCounts(mixed.items).keys()]:sceneExtra;loadItems(ids,sceneExtra);
  }catch{if(epoch===sceneEpoch)sceneError=true;}finally{if(epoch===sceneEpoch)sceneReading=false;}
 }

 $: cutIndices=selectedGroup.size?[...selectedGroup]:selectedObject>=0?[selectedObject]:[];
 $: cutSelection=room?captureIndoorCut(face,room.ordinal,cutIndices,shapes,editable,removable,new Set(roomSupports.map(p=>p.index))):null;
 $: cutPreview=placing&&cutSource&&hoverCell?indoorGroupTransfer(face,shapes,removable,cutSource.rows,cutClip,hoverCell.x,hoverCell.y):null;
 $: clonePreview=placing&&cloneClip.length&&hoverCell?(mixedDoc?mixedValid?indoorMixedPlacement(face,shapes,removable,stock,cloneClip,mixedDoc,sceneAnchor,hoverCell.x,hoverCell.y,mixedSources):null:linkedAxis?indoorLinkedPlacement(face,shapes,removable,stock,cloneClip,sceneAnchor,hoverCell.x,hoverCell.y,linkedAxis):indoorScenePlacement(face,shapes,freeEdit?freeEligible:removable,stock,cloneClip,sceneAnchor,hoverCell.x,hoverCell.y,freeEdit)):null;
 $: linkedStockPreview=placing&&linkedAxis&&!supportClone&&!cutSource&&!cloneClip.length&&hoverCell?indoorLinkedPlacement(face,shapes,removable,stock,[{itemId:stockId,dx:0,dy:0,orientation:(worldOrientationCode(stockOrientation)??-4)/4}],'corner',hoverCell.x,hoverCell.y,linkedAxis):null;
 $: cutGhost=transferDraft??cutPreview??clonePreview??placeDraft??symmetryPreview??linkedStockPreview;
 $: groupPickup=indoorGroupPickup(face,cutIndices,freeEdit?freeEligible:removable,stock,new Set(roomSupports.map(p=>p.index)),freeEdit);
 $: duplicateClip=cutIndices.some(i=>roomSupports.some(p=>p.index===i))?null:indoorDuplicateClip(face,cutIndices,shapes,freeEdit?freeEligible:removable,stock,freeEdit);
 function beginDuplicate(){if(!editAllowed||sceneCaptureWorker)return;if(mixedSelected){if(linkedAxis){editError=true;return;}captureRoomMixed(cutIndices,true);return;}if(!duplicateClip)return;const clip=duplicateClip;resetObject();cloneClip=clip;placing=true;}


 $: availableCut=$worldFurnitureCut&&$worldFurnitureCut.file===file&&$worldFurnitureCut.rows.length>0&&$worldFurnitureCut.rows.length<=ROOM_CUT_LIMIT&&face?.kind==='floor'&&face.terrain&&$worldFurnitureCut.rows.every(r=>(!r.supportFactor||r.supportFactor===face.factor)&&(!r.roomSource||r.roomSource.roomOrdinal!==room?.ordinal))?$worldFurnitureCut:null;
 $: itw=indoorTerrainWords[locale];
 $: cutWords=groupCutWords[locale];
 $: canCut=editAllowed&&!!file&&!!cutSelection&&!moving&&!placing&&!swap&&!editDraft&&!pickupDraft&&!placeDraft&&!transferDraft&&!stockOpen;
 function captureRoomCut(){
  if(!canCut||!cutSelection||!file)return false;
  worldFurnitureCut.set({file,scope:'indoor',rows:cutSelection.rows});
  worldFurnitureClipboard.set(cutSelection.clip);return true;
 }
 $: options=catalog.filter(i=>i.name.normalize('NFKC').toLocaleLowerCase().includes(stockQuery.normalize('NFKC').toLocaleLowerCase().trim())).slice(0,200);
 $: stockShape=shapes[stockId+':'+worldOrientationCode(stockOrientation)];
 $: moveShape=tree&&selectedObject>=0&&tree.objects[selectedObject]&&worldOrientationCode(tree.objects[selectedObject].orientation)!==null?shapes[tree.objects[selectedObject].itemId+':'+worldOrientationCode(tree.objects[selectedObject].orientation)]:null;
 $: groupMoveReady=!!face?.terrain&&selectedGroup.size>1&&!!tree&&selectedGroup.has(selectedObject)&&[...selectedGroup].every(i=>!!tree?.objects[i]&&(freeEdit?freeEligible:editable).has(tree.objects[i].itemId));
 let alignmentDraft=false,symmetryMode:SymmetryMode|null=null,symmetryAxis:DesignSymmetry|null=null;
 let linkedAxis:DesignSymmetry|null=null,linkPicking=false,pairedDraft:SymmetryMode|null=null,pairedRotation=false,pointSupports=new Map<number,SupportScene>(),pointRequest=0,pointValid=false;
 $: lw=indoorLinkedWords[locale];
 $: displayAxis=symmetryAxis??linkedAxis;
 function moveDraft(indices:readonly number[],index:number,x:number,y:number){return freeEdit?indoorFreeMoveGroup(face,shapes,freeEligible,indices,index,x,y):linkedAxis?indoorLinkedMove(face,shapes,editable,indices,index,x,y,linkedAxis):roomDragDraft(face,shapes,editable,indices,index,x,y);}
 function stageMove(d:SupportChildEdit[]){pairedDraft=linkedAxis?.mode??null;pairedRotation=false;editDraft=d;editError=false;}
 function stageRotation(d:SupportChildEdit[]|null){if(!d)return;pairedDraft=linkedAxis?.mode??null;pairedRotation=!!linkedAxis;editDraft=d;editError=false;}
 function rotateDraft(indices:readonly number[],turn:-1|1){return freeEdit?(indices.length===1?indoorFreeRotate(face,shapes,freeEligible,indices[0],turn):null):linkedAxis?indoorLinkedRotate(face,shapes,editable,indices,turn,linkedAxis):indices.length>1?indoorGroupRotate(face,shapes,editable,indices,turn):indoorFurnitureEdits(face,shapes,editable,indices[0]??-1,null,turn);}
 function placeClipAt(clip:readonly DesignClipItem[],anchor:ScenePreset['anchor'],x:number,y:number){return linkedAxis?indoorLinkedPlacement(face,shapes,removable,stock,clip,anchor,x,y,linkedAxis):indoorScenePlacement(face,shapes,freeEdit?freeEligible:removable,stock,clip,anchor,x,y,freeEdit);}
 function stockAt(x:number,y:number){if(linkedAxis&&!supportClone)return indoorLinkedPlacement(face,shapes,removable,stock,[{itemId:stockId,dx:0,dy:0,orientation:(worldOrientationCode(stockOrientation)??-4)/4}],'corner',x,y,linkedAxis);const d=indoorPlace(face,shapes,freeEdit&&!supportClone?freeEligible:removable,stock,stockId,x,y,stockOrientation,freeEdit&&!supportClone);return d?[supportClone?{...d,supportSource:supportClone}:d]:null;}
 function beginLink(mode:SymmetryMode){if(freeEdit||!editAllowed||!face?.terrain)return;pointSupports=new Map();pointRequest=0;pointValid=false;linkPicking=true;symmetryMode=mode;symmetryAxis=null;panMode=false;}
 const alignModes:IndoorAlignMode[]=['left','right','top','bottom','centerX','centerY','spaceX','spaceY'];
 const symmetryModes:SymmetryMode[]=['vertical','horizontal','point'];
 $: aw=indoorAlignWords[locale];
 $: alignOptions=groupMoveReady&&!freeEdit?alignModes.map(mode=>indoorAlign(face,shapes,editable,[...selectedGroup],mode)):alignModes.map(()=>null);
 $: if(symmetryMode&&(moving||placing||swap||stockOpen||editDraft||pickupDraft||placeDraft||transferDraft||editCopy||editWorker||finishOpen||supportParent||!positionOpen)){symmetryMode=null;symmetryAxis=null;linkPicking=false;}
 $: symmetryPreview=!linkPicking&&symmetryAxis&&symmetryMode&&(!mixedSelected||pointValid)?indoorSymmetricDuplicate(face,shapes,removable,stock,cutIndices,symmetryAxis,pointSupports):null;
 function startSymmetry(mode:SymmetryMode){if(freeEdit||!editAllowed||!face?.terrain||!cutIndices.length||mixedSelected&&mode!=='point'||sceneCaptureWorker)return;panMode=false;linkPicking=false;pointSupports=new Map();pointRequest=0;pointValid=false;symmetryMode=mode;symmetryAxis=null;editError=false;if(mixedSelected)captureRoomMixed(cutIndices,false,true);}
 function axisAt(e:MouseEvent):DesignSymmetry|null{const m=roomSvg?.getScreenCTM();if(!m||!symmetryMode)return null;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse());return {mode:symmetryMode,x2:Math.round(p.x*2),y2:Math.round(p.y*2)};}
 $: groupLeft=groupMoveReady&&!freeEdit?(linkedAxis?indoorLinkedRotate(face,shapes,editable,[...selectedGroup],-1,linkedAxis):indoorGroupRotate(face,shapes,editable,[...selectedGroup],-1)):null;
 $: groupRight=groupMoveReady&&!freeEdit?(linkedAxis?indoorLinkedRotate(face,shapes,editable,[...selectedGroup],1,linkedAxis):indoorGroupRotate(face,shapes,editable,[...selectedGroup],1)):null;
 $: groupMovePreview=moving&&(selectedGroup.size>1||linkedAxis)&&hoverCell?(linkedAxis?indoorLinkedMove(face,shapes,editable,cutIndices,selectedObject,hoverCell.x,hoverCell.y,linkedAxis):indoorGroupMove(face,shapes,freeEdit?freeEligible:editable,[...selectedGroup],selectedObject,hoverCell.x,hoverCell.y,freeEdit)):null;
 $: previewShape=placing&&!cutSource&&!cloneClip.length?stockShape:moving&&!linkedAxis&&selectedGroup.size<=1?moveShape:null;
 $: previewValid=hoverCell?placing?(cutSource?!!cutPreview:linkedAxis&&!supportClone&&!cloneClip.length?!!linkedStockPreview:!!indoorPlace(face,shapes,freeEdit&&!supportClone?freeEligible:removable,stock,stockId,hoverCell.x,hoverCell.y,stockOrientation,freeEdit&&!supportClone)):moving?!!indoorMove(face,shapes,freeEdit?freeEligible:editable,selectedObject,hoverCell.x,hoverCell.y,undefined,freeEdit):false:false;
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
 function turnStock(delta:number){if(cloneClip.length){const q=rotateIndoorCut(cloneClip,face?.factor??null,shapes,delta);if(q){cloneClip=q;editError=false;}else editError=true;return;}if(cutSource){const q=rotateIndoorCut(cutClip,face?.factor??null,shapes,delta);if(q){cutClip=q;editError=false;}else editError=true;return;}const dirs=freeEdit&&face?.factor===1&&!supportClone?EIGHT_WAY_ORIENTATIONS:CARDINAL_ORIENTATIONS;const index=dirs.findIndex(o=>o===stockOrientation);stockOrientation=dirs[(index+delta+dirs.length)%dirs.length];}
 function point(e:MouseEvent){const m=roomSvg?.getScreenCTM();if(!m)return null;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse());return {x:Math.floor(p.x),y:Math.floor(p.y)};}

 $: iw=indoorEditWords[locale];
 $: ew=childEditWords[locale];
 $: tree=indoorEditableTree(face);
 $: editAllowed=testExport&&!blocked&&!projectApplyOpen&&!!tree&&!finishOpen&&!editWorker&&!editCopy;
 $: left=freeEdit?indoorFreeRotate(face,shapes,freeEligible,selectedObject,-1):linkedAxis?indoorLinkedRotate(face,shapes,editable,[selectedObject],-1,linkedAxis):indoorFurnitureEdits(face,shapes,editable,selectedObject,null,-1);
 $: right=freeEdit?indoorFreeRotate(face,shapes,freeEligible,selectedObject,1):linkedAxis?indoorLinkedRotate(face,shapes,editable,[selectedObject],1,linkedAxis):indoorFurnitureEdits(face,shapes,editable,selectedObject,null,1);
 $: partners=freeEdit?[]:indoorSwapPartners(face,shapes,editable,selectedObject);
 $: pickup=roomSupports.some(p=>p.index===selectedObject)?null:indoorPickup(face,selectedObject,freeEdit?freeEligible:removable,stock,freeEdit);
 $: pw=positionWords[locale]??positionWords.en;
 let shapes:Readonly<Record<string,SourceObjectShape>>={},shapeRequest=0,shapeWorker:Worker|null=null;
 $: if(terrainWorker!==shapeWorker){shapeWorker?.removeEventListener('message',receiveShapes);shapeWorker=terrainWorker;shapeWorker?.addEventListener('message',receiveShapes);}
 $: requestShapes(positionOpen?face:null,terrainWorker,stockId,cutSource?.rows??[],sceneExtra,freeEdit);
 $: plot=positionOpen&&face?.gridStatus==='full'&&face.positions.length<=5000?indoorPositionPlot(face.positions,highlight,shapes):null;
 $: roomBounds=face?.terrain&&face.factor?'0 0 '+face.terrain.sizeX*face.factor+' '+face.terrain.sizeY*face.factor:plot?.viewBox??'0 0 1 1';
 let camera:RoomCamera|null=null,cameraKey='',panMode=false,suppressMapClick=false;
 let objectDrag:{id:number;clientX:number;clientY:number;index:number;indices:number[];dx:number;dy:number;source:File;surface:IndoorSurface;changed:boolean}|null=null;
 $: directDraft=objectDrag?.changed&&hoverCell?(linkedAxis?indoorLinkedMove(face,shapes,editable,objectDrag.indices,objectDrag.index,hoverCell.x,hoverCell.y,linkedAxis):freeEdit?indoorFreeMoveGroup(face,shapes,freeEligible,objectDrag.indices,objectDrag.index,hoverCell.x,hoverCell.y):roomDragDraft(face,shapes,editable,objectDrag.indices,objectDrag.index,hoverCell.x,hoverCell.y)):null;
 let panDrag:{id:number;clientX:number;clientY:number;start:RoomCamera;inverse:DOMMatrix;changed:boolean}|null=null;
 $: cameraIdentity=(room?.ordinal??0)+':'+(face?.ordinal??0)+':'+roomBounds;
 $: if(cameraIdentity!==cameraKey){cameraKey=cameraIdentity;camera=null;panDrag=null;objectDrag=null;panMode=false;hoverCell=null;}
 $: cameraBounds=roomCameraBounds(roomBounds);
 $: cameraView=camera??cameraBounds;
 $: roomViewBox=[cameraView.x,cameraView.y,cameraView.w,cameraView.h].join(' ');
 $: cameraWords=roomCameraWords[locale];
 $: mapArt=positionOpen&&face?roomCameraArt(face.positions,shapes,cameraView):[];
 $: supportMapInteractive=!moving&&!placing&&!swap&&!stockOpen&&!editDraft&&!pickupDraft&&!placeDraft&&!transferDraft&&!editCopy&&!editWorker&&!finishOpen&&!symmetryMode&&!panMode;
 $: supportMapParents=roomSupports.flatMap((p):SupportMapParent[]=>{const a=mapArt.find(o=>o.index===p.index);return a?[{...p,mapX:a.x,mapY:a.y,mapW:a.width,mapH:a.height,selectable:supportMapInteractive}]:[];});
 $: supportMapPixels=Math.min(roomMapWidth/Math.max(1,cameraView.w),roomMapHeight/Math.max(1,cameraView.h));
 $: if(mapArt.length)loadItems([], [...new Set(mapArt.map(p=>p.itemId))]);
 function zoomRoom(scale:number,anchor?:{x:number;y:number}){camera=roomCameraZoom(cameraView,cameraBounds,scale,anchor);hoverCell=null;}
 function wheelRoom(e:WheelEvent){if(!roomSvg||!Number.isFinite(e.deltaY)||e.deltaY===0)return;e.preventDefault();const m=roomSvg.getScreenCTM();if(!m)return;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse());zoomRoom(Math.exp(Math.max(-1,Math.min(1,-e.deltaY*.002))),p);}
 function panStart(e:PointerEvent){suppressMapClick=false;if(!roomSvg)return;
  if(e.button===0&&!panMode){if(!supportMapInteractive||!supportMarkerHit(e.target))startObjectDrag(e);return;}
  if(!(e.button===1||e.button===0&&panMode))return;const m=roomSvg.getScreenCTM();if(!m)return;e.preventDefault();hoverCell=null;panDrag={id:e.pointerId,clientX:e.clientX,clientY:e.clientY,start:{...cameraView},inverse:m.inverse(),changed:false};(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);}
 function panMove(e:PointerEvent){if(symmetryMode&&!panDrag&&!objectDrag){symmetryAxis=axisAt(e);return;}if(objectDrag?.id===e.pointerId){const d=objectDrag;if(!d.changed&&Math.hypot(e.clientX-d.clientX,e.clientY-d.clientY)<4)return;if(!d.changed){selectedObject=d.index;selectedGroup=d.indices.length>1?new Set(d.indices):new Set();highlight=tree?.objects[d.index]?.itemId??null;}d.changed=true;objectDrag={...d};const p=point(e);hoverCell=p?{x:p.x-d.dx,y:p.y-d.dy}:null;return;}if(!panDrag||panDrag.id!==e.pointerId){hoverCell=moving||placing?point(e):null;return;}const d=panDrag;if(Math.hypot(e.clientX-d.clientX,e.clientY-d.clientY)<3&&!d.changed)return;d.changed=true;const x=e.clientX-d.clientX,y=e.clientY-d.clientY;camera=roomCameraPan(d.start,cameraBounds,-(d.inverse.a*x+d.inverse.c*y),-(d.inverse.b*x+d.inverse.d*y));}
 function panEnd(e:PointerEvent){if(objectDrag?.id===e.pointerId){const d=objectDrag;objectDrag=null;if(d.changed){suppressMapClick=true;const p=point(e);if(e.type==='pointerup'&&p&&d.source===file&&d.surface===face&&editAllowed){const draft=moveDraft(d.indices,d.index,p.x-d.dx,p.y-d.dy);if(draft){stageMove(draft);}else editError=true;}hoverCell=null;}const el=e.currentTarget as HTMLElement;if(el.hasPointerCapture(e.pointerId))el.releasePointerCapture(e.pointerId);return;}if(!panDrag||panDrag.id!==e.pointerId)return;suppressMapClick=panDrag.changed||panMode;panDrag=null;hoverCell=null;const el=e.currentTarget as HTMLElement;if(el.hasPointerCapture(e.pointerId))el.releasePointerCapture(e.pointerId);}
 function startObjectDrag(e:PointerEvent){if(symmetryMode)return;
  if(!editAllowed||!file||!face?.terrain||!tree||moving||placing||swap||stockOpen||editDraft||pickupDraft||placeDraft||transferDraft||sceneCaptureWorker||e.ctrlKey||e.metaKey||e.shiftKey)return;
  const p=point(e);if(!p)return;const hits=indoorHitIndices(tree,shapes,p.x,p.y);
  const index=hits.includes(selectedObject)?selectedObject:hits.length===1?hits[0]:-1;
  if(index<0)return;const indices=selectedGroup.has(index)&&selectedGroup.size>1?[...selectedGroup]:[index];
  if(indices.some(i=>!tree?.objects[i]||!(freeEdit?freeEligible:editable).has(tree.objects[i].itemId)))return;
  const origin=tree.objects[index];objectDrag={id:e.pointerId,clientX:e.clientX,clientY:e.clientY,index,indices,dx:p.x-origin.x,dy:p.y-origin.y,source:file,surface:face,changed:false};
  // Do not change the existing click-selection behavior before movement.
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
 }
 function mapClick(e:MouseEvent){if(suppressMapClick||panMode){suppressMapClick=false;return;}if(supportMapInteractive){const hit=supportMarkerHit(e.target),p=hit&&roomSupports.find(o=>o.localOrdinal===hit.ordinal);if(hit&&p){openSupport(p,hit.child);return;}}if(symmetryMode){const axis=axisAt(e);if(linkPicking&&axis){linkedAxis=axis;linkPicking=false;symmetryMode=null;symmetryAxis=null;return;}const draft=axis&&(!mixedSelected||pointValid)?indoorSymmetricDuplicate(face,shapes,removable,stock,cutIndices,axis,pointSupports):null;if(draft){placeDraft=draft;symmetryMode=null;symmetryAxis=null;editError=false;}else editError=true;return;}pickObject(e);}


 function requestShapes(f:IndoorSurface|null,wk:Worker|null,extra=0,rows:readonly CutClipboard['rows'][number][]=[],extraIds:readonly number[]=[],free=false){shapeRequest=0;shapes={};editable=new Set();removable=new Set();freeEligible=new Set();if(!wk||!f?.factor||f.positions.length>5000)return;const ids=[...new Set([...f.positions.filter(p=>p.orientationCode!==null).map(p=>p.itemId),...(extra?[extra]:[]),...rows.map(p=>Number(p.itemId)),...extraIds])];const items=ids.flatMap(itemId=>(f.kind==='floor'&&f.factor===1&&(free||f.positions.some(p=>p.itemId===itemId&&p.orientationCode!==null&&p.orientationCode%4!==0))?[0,2,4,6,8,10,12,14]:[0,4,8,12]).map(orientationCode=>({itemId,orientationCode})));if(items.length>5000)return;if(!items.length)return;shapeRequest=nextRequest();wk.postMessage({command:'indoor-shapes',factor:f.factor,items,requestId:shapeRequest});}
 function receiveShapes(e:MessageEvent){const d=e.data;if(pointRequest&&d?.requestId===pointRequest){pointRequest=0;pointValid=d.kind==='mixed-scene-geometry'&&d.valid===true;if(!pointValid)sceneError=true;return;}if(mixedRequest&&d?.requestId===mixedRequest){mixedRequest=0;mixedValid=d.kind==='mixed-scene-geometry'&&d.valid===true;if(!mixedValid)sceneError=true;return;}if(catalogRequest&&d?.requestId===catalogRequest){catalogRequest=0;if(d.kind==='indoor-catalog'&&Array.isArray(d.items))catalog=d.items;return;}if(!shapeRequest||d?.requestId!==shapeRequest)return;shapeRequest=0;if(d.kind==='indoor-shapes'&&d.shapes&&typeof d.shapes==='object'){shapes=d.shapes;editable=new Set(Array.isArray(d.editable)?d.editable:[]);removable=new Set(Array.isArray(d.removable)?d.removable:[]);freeEligible=new Set(Array.isArray(d.freeEligible)?d.freeEligible:[]);}}
 let owned:number[]=[],finishOpen=false,finishChoice=0,allWalls=false,preview:Worker|null=null,previewStatus:'idle'|'working'|'valid'|'error'='idle';
 $: fw=finishWords[locale]??finishWords.en;
 $: copyWords=testSaveWords[locale]??testSaveWords.en;
 const testExport=browser&&testSaveExportEnabled(window.location);
 let freePlacement=false,freeEligible=new Set<number>();
 $: freeEdit=testExport&&freePlacement&&indoorFreeFloor(face);
 const freeLabels={ja:'自由配置',en:'Free placement',fr:'Placement libre',it:'Posizionamento libero',de:'Freie Platzierung','es-ES':'Colocación libre','zh-CN':'自由放置','pt-BR':'Posicionamento livre'} as const;
 function toggleFree(){resetObject();linkedAxis=null;freePlacement=!freePlacement;}

 let finishCopy:ReturnType<typeof experimentalCopyDownload>|null=null;
 $: cw=checkpointWords[locale];
 function clearEdit(){alignmentDraft=false;pairedDraft=null;pairedRotation=false;linkPicking=false;pointSupports=new Map();pointRequest=0;pointValid=false;symmetryMode=null;symmetryAxis=null;objectDrag=null;panDrag=null;sceneCaptureWorker?.terminate();sceneCaptureWorker=null;mixedDoc=null;mixedSources=null;mixedRequest=0;mixedValid=false;supportClone=null;sceneEpoch++;sceneReading=false;sceneActive=false;sceneExtra=[];sceneAnchor='corner';sceneError=false;cloneClip=[];cutSource=null;cutClip=[];transferDraft=null;moving=false;placing=false;stockOpen=false;stockId=0;placeDraft=null;hoverCell=null;editWorker?.terminate();editWorker=null;if(editCopy)URL.revokeObjectURL(editCopy.url);editCopy=null;editDraft=null;pickupDraft=null;swap=false;editError=false;}
 function resetObject(){clearEdit();selectedObject=-1;selectedGroup=new Set();}
 function chooseObject(i:number,add=false){if(!tree||!tree.objects[i]||editWorker||editCopy||editDraft||pickupDraft||moving||placing||placeDraft||transferDraft)return;if(swap){const e=indoorFurnitureEdits(face,shapes,editable,selectedObject,i,1);if(e){editDraft=e;swap=false;}return;}if(add&&!swap){const next=new Set(selectedGroup.size?selectedGroup:selectedObject>=0?[selectedObject]:[]);if(next.has(i))next.delete(i);else if(next.size<ROOM_CUT_LIMIT)next.add(i);selectedGroup=next;selectedObject=next.has(i)?i:[...next].at(-1)??-1;}else{selectedGroup=new Set();selectedObject=i;}highlight=selectedObject>=0?tree.objects[selectedObject].itemId:null;}
 function pickObject(e:MouseEvent){
  if(!tree||!roomSvg||editWorker||editCopy||editDraft||pickupDraft||placeDraft||transferDraft||stockOpen||e.detail===0)return;const p=point(e);if(!p)return;
  if(placing&&cutSource){
   if(cutSource!==$worldFurnitureCut||cutSource.file!==file){editError=true;return;}
   const draft=indoorGroupTransfer(face,shapes,removable,cutSource.rows,cutClip,p.x,p.y);
   if(draft){transferDraft=draft;placing=false;hoverCell=null;editError=false;}else editError=true;return;
  }
  if(placing&&cloneClip.length){const draft=(mixedDoc?mixedValid?indoorMixedPlacement(face,shapes,removable,stock,cloneClip,mixedDoc,sceneAnchor,p.x,p.y,mixedSources):null:placeClipAt(cloneClip,sceneAnchor,p.x,p.y));if(draft){placeDraft=draft;placing=false;hoverCell=null;editError=false;}else editError=true;return;}
  if(placing){const draft=stockAt(p.x,p.y);if(draft){placeDraft=draft;placing=false;hoverCell=null;editError=false;}else editError=true;return;}
  if(moving){const draft=moveDraft(cutIndices,selectedObject,p.x,p.y);if(draft){stageMove(draft);moving=false;hoverCell=null;editError=false;}else editError=true;return;}
  const hits=indoorHitIndices(tree,shapes,p.x,p.y).filter(i=>!swap||partners.includes(i));if(hits.length)chooseObject(hits[(hits.indexOf(selectedObject)+1)%hits.length],e.ctrlKey||e.metaKey||e.shiftKey);
 }
 function runFurniture(){
  if(!editAllowed||!file||!room||!face||(!editDraft&&!pickupDraft&&!placeDraft&&!transferDraft)||cutSource&&(cutSource!==$worldFurnitureCut||cutSource.file!==file))return;
  const source=file,edits=editDraft,pickup=pickupDraft,place=placeDraft,transfer=transferDraft,worker=new Worker(new URL('./indoor-room-view.worker.ts',import.meta.url),{type:'module'});editWorker=worker;editError=false;
  const done=(d:any)=>{worker.terminate();if(editWorker!==worker||file!==source||editDraft!==edits||pickupDraft!==pickup||placeDraft!==place||transferDraft!==transfer){d?.bytes?.fill(0);return;}editWorker=null;try{if(d?.kind!=='indoor-furniture-copy')throw Error('copy');editCopy=experimentalCopyDownload(d,source);}catch{editError=true;}};
  worker.onmessage=e=>done(e.data);worker.onerror=()=>done(null);worker.onmessageerror=()=>done(null);
  worker.postMessage({command:'indoor-furniture-export',file:source,allowExperimentalCopy:true,plan:{roomOrdinal:room.ordinal,surfaceOrdinal:face.ordinal,...(freeEdit&&!transfer&&!pairedDraft&&!alignmentDraft&&(place?place.every(p=>!p.supportSource&&!p.scene&&freeEligible.has(p.itemId)):pickup?pickup.every(p=>!p.includeSupport&&freeEligible.has(p.itemId)):edits?.every(p=>face?.positions[p.index]?.plain===true&&freeEligible.has(p.itemId)))?{freePlacement:true}:{}),...(transfer?{transfer}:place?{place}:pickup?{pickup}:pairedDraft?(pairedRotation?{pairedRotate:{mode:pairedDraft,edits}}:{paired:{mode:pairedDraft,edits}}):alignmentDraft?{align:edits}:{edits})}});
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
 function roomKeyboard(e:KeyboardEvent):boolean{
  if(e.altKey||e.ctrlKey||e.metaKey||e.isComposing||e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,[contenteditable=true]')||!editAllowed||!tree||!face||objectDrag||panDrag)return false;
  if(e.key==='Escape'&&(symmetryMode||moving||placing||swap||stockOpen||editDraft||pickupDraft||placeDraft||transferDraft)){clearEdit();return true;}
  if(e.key==='Enter'&&(editDraft||pickupDraft||placeDraft||transferDraft)&&!editWorker&&!editCopy){runFurniture();return true;}
  if(e.key.toLowerCase()==='r'&&placing){turnStock(e.shiftKey?-1:1);return true;}
  if(symmetryMode||moving||placing||swap||stockOpen||editDraft||pickupDraft||placeDraft||transferDraft||selectedObject<0)return false;
  const turn=e.shiftKey?-1:1;
  let draft:SupportChildEdit[]|null=null;
  if(e.key.toLowerCase()==='r'){draft=rotateDraft(cutIndices,turn);if(draft){stageRotation(draft);return true;}}
  else if(e.key==='Delete'||e.key==='Backspace'){const rows=groupPickup;if(rows){pickupDraft=rows;editError=false;}return true;}
  else{const delta=roomKeyDelta(e.key,e.shiftKey?face.factor??1:1);const origin=tree.objects[selectedObject];if(!delta||!origin)return false;draft=moveDraft(cutIndices,selectedObject,origin.x+delta.x,origin.y+delta.y);if(draft){stageMove(draft);return true;}}
  if(draft){editDraft=draft;editError=false;}else editError=true;return true;
 }
 function keys(e:KeyboardEvent){if(projectApplyOpen&&e.key==='Escape'){e.preventDefault();e.stopPropagation();projectApplyOpen=false;return;}if(projectApplyOpen&&e.key!=='Tab')return;if(supportParent&&e.key==='Escape'){e.preventDefault();e.stopPropagation();closeSupport();return;}if(supportParent&&e.key!=='Tab')return;if(roomKeyboard(e)){e.preventDefault();e.stopPropagation();return;}if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='x'&&canCut&&!(e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,[contenteditable=true]'))){if(captureRoomCut()){e.preventDefault();e.stopPropagation();}return;}if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='v'&&availableCut&&editAllowed&&!moving&&!placing&&!editDraft&&!pickupDraft&&!placeDraft&&!transferDraft&&!swap&&!stockOpen&&!(e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,[contenteditable=true]'))){e.preventDefault();e.stopPropagation();beginTransfer();return;}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();return;}if(e.key!=='Tab')return;const controls=[...root.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href]')].filter(el=>!el.closest('[inert]'));if(!controls.length)return;const first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
 $: w=indoorWords[locale]??indoorWords.en;
 $: if(file!==seen)load(file);
 $: room=rooms[selected]??null;
 $: houses=indoorHouseGroups(rooms);
 $: houseRooms=rooms.map((r,i)=>({r,i})).filter(({r})=>r.house===room?.house);
 $: if(houses.length)loadItems(houses.flatMap(h=>h.itemId===undefined?[]:[h.itemId]),[]);
 $: face=room?.surfaces[surface]??null;
 $: filtered=(face?.items??[]).filter(p=>name(p.itemId,records,locale,w[12]).normalize('NFKC').toLocaleLowerCase().includes(query.normalize('NFKC').toLocaleLowerCase().trim()));
 $: visible=filtered.slice(0,limit);
 $: if(room)loadItems([...room.surfaces.map(s=>s.finish),room.ceiling,...(face?.items.map(p=>p.itemId)??[]),...(finishOpen?owned:[])].filter((n):n is number=>typeof n==='number'&&n>0),[...visible.map(p=>p.itemId),...(finishOpen&&finishChoice?[finishChoice]:[])]);
 function name(id:number|null,dict:ReadonlyMap<number,ItemMasterRecord|CompleteItemMasterRecord>,lang:WandLanguage,unknown:string){return id===null?unknown:dict.get(id)?.names[lang]??dict.get(id)?.names.en??unknown;}
 function load(next:File|null){projectApplyOpen=false;closeSupport();supportParents=[];resetObject();stock=new Map();const history=$localSaveSession.worldCheckpoint,keep=!!next&&!!seen&&!!history&&history.files[history.cursor]===next;if(!keep)linkedAxis=null;const oldRoom=selected,oldSurface=surface;seen=next;own?.terminate();own=null;rooms=[];owned=[];finishOpen=false;cancelPreview();selected=0;surface=0;query='';highlight=null;status='loading';if(!next){status='ready';return;}
  const worker=new Worker(new URL('./indoor-room-view.worker.ts',import.meta.url),{type:'module'});own=worker;
  const done=(v:unknown,rawStock?:unknown)=>{worker.terminate();if(own!==worker||file!==next)return;own=null;try{rooms=parseIndoorRooms(v);supportParents=parseIndoorSupportParents(v,rooms);owned=parseOwnedFinishes(v);try{stock=parseFurnitureStock(rawStock);}catch{stock=new Map();}if(keep&&rooms[oldRoom]){selected=oldRoom;surface=Math.min(oldSurface,rooms[oldRoom].surfaces.length-1);}status='ready';}catch{status='error';}};
  worker.onmessage=e=>done(e.data?.kind==='indoor-rooms'?e.data.result:null,e.data?.stock);worker.onerror=()=>done(null);worker.onmessageerror=()=>done(null);worker.postMessage({command:'indoor-rooms',file:next});
 }
 function loadItems(ids:number[],art:number[]){const fresh=[...new Set(ids)].filter(id=>!asked.has(id));for(const id of fresh)asked.add(id);
  if(fresh.length){db??=openCurrentItemDatabase(base);void db.then(async d=>{for(let i=0;i<fresh.length;i+=128){const rows=await d.getItems(fresh.slice(i,i+128));const next=new Map(records);for(const row of rows)if(row)next.set(row.itemId,row);records=next;resolved=new Set([...resolved,...fresh.slice(i,i+128)]);}}).catch(()=>{itemLoadFailed=true;});}
  for(const id of new Set([...(room?.surfaces.map(s=>s.finish)??[]),room?.ceiling,...art]))if(typeof id==='number'&&id>0&&!images.has(id)){images=new Map(images).set(id,'');void worldArtwork(base,id).then(url=>{if(url)images=new Map(images).set(id,url);}).catch(()=>{});}
 }
 function choose(i:number){linkedAxis=null;resetObject();cancelPreview();finishOpen=false;selected=i;surface=0;query='';highlight=null;limit=80;}
 onDestroy(()=>{own?.terminate();clearEdit();cancelPreview();shapeWorker?.removeEventListener('message',receiveShapes);});
</script>
<div class="indoor-room-view" role="dialog" aria-label={w[0]} aria-modal="true" bind:this={root} on:keydown={keys}>
 <header><strong>{w[0]}</strong><button type="button" bind:this={closeButton} on:click={onClose} aria-label={w[7]}>×</button></header>
 {#if status==='loading'}<p role="status">{w[8]}</p>{:else if status==='error'}<p role="alert">{w[10]}</p>{:else if !rooms.length}<p>{w[9]}</p>{:else if room}
 <div class="room-body" inert={!!supportParent||projectApplyOpen}>
  <nav aria-label={w[3]}>
   <select aria-label={w[1]} value={room.house} on:change={e=>{const h=houses.find(h=>h.house===Number(e.currentTarget.value));if(h)choose(h.firstIndex);}}>
    {#each houses as h (h.house)}<option value={h.house}>{name(h.itemId??null,records,locale,w[1]+' '+h.house)}</option>{/each}
   </select>
   {#each houseRooms as {r,i} (r.ordinal)}<button type="button" aria-pressed={i===selected} on:click={()=>choose(i)}>{w[2]} {r.floor} · {r.name||w[3]+' '+r.ordinal}</button>{/each}
  </nav>
  <div class="room-content">
   <div class="finish-heading"><strong>{w[15]}</strong>{#if file&&terrainWorker}<RoomProjectCapture freePlacement={testExport&&freePlacement} {file} {room} {rooms} {stock} {owned} witnesses={supportParents} worker={terrainWorker} {locale} {nextRequest} blocked={blocked||!!editWorker||!!editCopy||!!preview||!!finishCopy||!!supportParent||projectApplyOpen||moving||placing||!!editDraft||!!pickupDraft||!!placeDraft||!!transferDraft}/>{/if}{#if testExport}<button type="button" disabled={blocked||!file||!terrainWorker||!!editWorker||!!editCopy||!!preview||!!finishCopy||!!supportParent} on:click={()=>{resetObject();cancelPreview();finishOpen=false;projectApplyOpen=true;}}>{rap[0]}</button>{/if}<button type="button" disabled={!wallReady} aria-pressed={finishOpen} on:click={()=>{resetObject();cancelPreview();finishOpen=!finishOpen;}}>{fw[0]}</button></div>
   <div class="finishes">
    {#each room.surfaces as s,i}<button type="button" class="finish-card" aria-pressed={surface===i} on:click={()=>{linkedAxis=null;resetObject();cancelPreview();surface=i;query='';highlight=null;limit=80;}}><span>{i===0?w[4]:w[5]+' '+i}</span>{#if s.finish&&images.get(s.finish)}<img src={images.get(s.finish)} alt="" loading="lazy"/>{/if}<small>{s.finish===0?w[11]:name(s.finish,records,locale,w[12])}</small></button>{/each}
    <div class="finish-card"><span>{w[6]}</span>{#if room.ceiling&&images.get(room.ceiling)}<img src={images.get(room.ceiling)} alt="" loading="lazy"/>{/if}<small>{room.ceiling===0?w[11]:name(room.ceiling,records,locale,w[12])}</small></div>
   </div>
   {#if finishOpen}<div class="finish-picker">{#if surface>0}<label><input type="checkbox" bind:checked={allWalls} disabled={previewStatus==='working'} on:change={resetFinishStatus}/> {fw[2]}</label>{/if}<select aria-label={fw[0]} bind:value={finishChoice} disabled={previewStatus==='working'} on:change={resetFinishStatus}><option value={0} disabled>{fw[0]}</option>{#each choices as id}<option value={id}>{name(id,records,locale,w[12])}</option>{/each}</select>{#if finishChoice&&images.get(finishChoice)}<img class="finish-preview-art" src={images.get(finishChoice)} alt=""/>{/if}<button type="button" disabled={!choices.includes(finishChoice)||previewStatus==='working'} on:click={checkFinish}>{fw[3]}</button>{#if itemLoadFailed}<small role="alert">{w[10]}</small>{:else if finishLoading}<small role="status">{w[8]}</small>{:else if !choices.length}<small>{fw[6]}</small>{/if}{#if previewStatus!=='idle'}<small role="status">{previewStatus==='valid'?fw[4]:previewStatus==='working'?fw[7]:fw[5]}</small>{/if}{#if testExport&&previewStatus==='valid'&&blocked}<small>{stockToolWords[locale][12]}</small>{:else if testExport&&previewStatus==='valid'}<small>{copyWords[1]}</small><button type="button" on:click={()=>runFinish(true)}>{copyWords[0]}</button>{#if finishCopy}<button type="button" on:click={applyFinishCopy}>{cw[0]}</button><a class="test-copy-link" href={finishCopy.url} download={finishCopy.name}>{copyWords[2]}</a>{/if}{/if}</div>{/if}
   {#if roomSupports.length}<div class="indoor-edit">{#each roomSupports as p (p.localOrdinal)}<button type="button" disabled={moving||placing||!!editDraft||!!pickupDraft||!!placeDraft||!!transferDraft||!!editCopy||!!editWorker||finishOpen} on:click={()=>openSupport(p)}>{supportText[0]} · {name(p.itemId,records,locale,w[12])} · {p.x}, {p.y}</button>{/each}</div>{/if}
   <div class="room-items-header"><strong>{w[13]}{#if face?.gridStatus==='full'} · {face.items.reduce((n,p)=>n+p.quantity,0)}{/if}</strong><button type="button" aria-pressed={positionOpen} on:click={()=>{resetObject();positionOpen=!positionOpen;}}>{pw[0]}</button><input type="search" aria-label={w[17]} placeholder={w[17]} bind:value={query} on:input={()=>limit=80}/></div>
   {#if face?.gridStatus!=='full'}<p>{w[16]}</p>{:else}
    {#if positionOpen}<section class="position-map" aria-label={pw[0]}><small>{face.terrain?itw[0]:plot?.footprints.length?indoorShapeWords[locale]:pw[2]}</small>{#if face.missingPositions}<small>{pw[3]}: {face.missingPositions}</small>{/if}{#if face.positions.length>5000}<small>{pw[6]}</small>{:else if plot||face.terrain}<div class="room-camera-tools">{#if testExport&&indoorFreeFloor(face)}<button type="button" aria-pressed={freeEdit} disabled={!!editWorker||!!editCopy||blocked} on:click={toggleFree}>{freeLabels[locale]}</button>{/if}<button type="button" aria-label={cameraWords[0]} title={cameraWords[0]} on:click={()=>zoomRoom(1.35)}>+</button><button type="button" aria-label={cameraWords[1]} title={cameraWords[1]} on:click={()=>zoomRoom(1/1.35)}>−</button><button type="button" aria-label={cameraWords[2]} title={cameraWords[2]} on:click={()=>{camera=null;hoverCell=null;}}>↔</button><button type="button" aria-label={cameraWords[3]} title={cameraWords[3]} aria-pressed={panMode} on:click={()=>{panMode=!panMode;hoverCell=null;}}>✥</button></div><button type="button" class="room-map-button" bind:clientWidth={roomMapWidth} bind:clientHeight={roomMapHeight} class:room-panning={panMode||!!panDrag} aria-label={moving||placing?itw[3]:iw[1]} on:click={mapClick} on:wheel|nonpassive={wheelRoom} on:pointerdown={panStart} on:pointermove={panMove} on:pointerup={panEnd} on:pointercancel={panEnd} on:lostpointercapture={panEnd} on:pointerleave={()=>{if(!panDrag){hoverCell=null;if(symmetryMode)symmetryAxis=null;}}}><svg bind:this={roomSvg} viewBox={roomViewBox} role="img" aria-label={pw[2]}><title>{face.terrain?itw[0]:plot?.footprints.length?indoorShapeWords[locale]:pw[2]}</title>{#if face.terrain&&face.factor}{#each Array.from(face.terrain.nativeFloorValues) as v,i}<rect x={(i%face.terrain.sizeX)*face.factor} y={Math.floor(i/face.terrain.sizeX)*face.factor} width={face.factor} height={face.factor} fill={v===0?'#a45b5b':v===3072?'#6c8b92':'#6ba98b'} fill-opacity=".3" stroke="currentColor" stroke-opacity=".25" vector-effect="non-scaling-stroke"/>{/each}{/if}{#each plot?.footprints??[] as f}<path class="indoor-footprint" class:highlighted={highlight===f.itemId} class:dimmed={highlight!==null&&highlight!==f.itemId} d={f.path} transform={'translate('+f.x+' '+f.y+')'}/>{/each}{#each mapArt as p (p.index)}{#if images.get(p.itemId)}<image href={images.get(p.itemId)} x={p.x} y={p.y} width={p.width} height={p.height} preserveAspectRatio="xMidYMid meet" opacity={highlight!==null&&highlight!==p.itemId?0.25:1} pointer-events="none"/>{/if}{/each}<SaveSupportMap {file} parents={supportMapParents} pixels={supportMapPixels} {base} {locale}/>{#each plot?.points??[] as p (p.x+':'+p.y)}<circle cx={p.x} cy={p.y} r={plot?.markerRadius??.16} class:highlighted={p.selected>0} class:dimmed={highlight!==null&&!p.selected}><title>{pw[4]}: {p.count}</title></circle>{/each}{#if tree&&selectedGroup.size>1}{#each [...selectedGroup] as i}{@const o=tree.objects[i]}{@const change=(editDraft??directDraft??groupMovePreview)?.find(e=>e.index===i)}{@const shape=o&&shapes[o.itemId+':'+CARDINAL_ORIENTATIONS.indexOf((change?.orientation??o.orientation) as typeof CARDINAL_ORIENTATIONS[number])*4]}{#if shape}<path d={shape.path} transform={'translate('+(change?.x??o.x)+' '+(change?.y??o.y)+')'} fill={pickupDraft?'#d45b5b':(moving&&hoverCell&&!groupMovePreview||objectDrag?.changed&&!directDraft)?'#c45b5b':'#4bddcd'} fill-opacity=".5" stroke="currentColor" vector-effect="non-scaling-stroke"/>{/if}{/each}{:else if tree&&selectedObject>=0&&tree.objects[selectedObject]}{@const o=tree.objects[selectedObject]}{@const change=(editDraft??directDraft)?.find(e=>e.index===selectedObject)}{@const orientation=change?.orientation??o.orientation}{@const code=['GridOrientation_Up','GridOrientation_Right','GridOrientation_Down','GridOrientation_Left'].indexOf(orientation)*4}{@const shape=shapes[o.itemId+':'+code]}{#if shape}<path d={shape.path} transform={'translate('+(change?.x??o.x)+' '+(change?.y??o.y)+')'} fill={pickupDraft||objectDrag?.changed&&!directDraft?'#d45b5b':'#4bddcd'} fill-opacity=".5" stroke="currentColor" vector-effect="non-scaling-stroke"/>{/if}{/if}{#if hoverCell&&previewShape}<path d={previewShape.path} transform={'translate('+hoverCell.x+' '+hoverCell.y+')'} fill={previewValid?'#4bddcd':'#c45b5b'} fill-opacity=".5" stroke="currentColor" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>{/if}{#if displayAxis}{#if displayAxis.mode!=='horizontal'}<line x1={displayAxis.x2/2} x2={displayAxis.x2/2} y1={cameraBounds.y} y2={cameraBounds.y+cameraBounds.h} stroke="currentColor" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>{/if}{#if displayAxis.mode!=='vertical'}<line y1={displayAxis.y2/2} y2={displayAxis.y2/2} x1={cameraBounds.x} x2={cameraBounds.x+cameraBounds.w} stroke="currentColor" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>{/if}{/if}{#if pairedDraft||linkedAxis}{#each (editDraft??directDraft??groupMovePreview??[]) as p}{@const shape=shapes[p.itemId+':'+CARDINAL_ORIENTATIONS.indexOf(p.orientation as typeof CARDINAL_ORIENTATIONS[number])*4]}{#if shape}<path d={shape.path} transform={'translate('+p.x+' '+p.y+')'} fill="#4bddcd" fill-opacity=".5" stroke="currentColor" vector-effect="non-scaling-stroke"/>{/if}{/each}{/if}{#if cutGhost}{#each cutGhost as p}{@const shape=shapes[p.itemId+':'+CARDINAL_ORIENTATIONS.indexOf(p.orientation as typeof CARDINAL_ORIENTATIONS[number])*4]}{#if shape}<path d={shape.path} transform={'translate('+p.x+' '+p.y+')'} fill="#4bddcd" fill-opacity=".5" stroke="currentColor" vector-effect="non-scaling-stroke"/>{#if images.get(p.itemId)}<image href={images.get(p.itemId)} x={p.x} y={p.y} width={shape.width} height={shape.height}/>{/if}{/if}{/each}{/if}</svg></button><small>{pw[5]}</small>{/if}</section>{/if}
    {#if positionOpen&&tree}<div class="indoor-edit"><small>{isw[1]}</small><button type="button" disabled={(!selectedScene&&!mixedSelected)||!!sceneCaptureWorker||moving||placing||!!editDraft||!!pickupDraft||!!placeDraft||!!transferDraft||!!editCopy} on:click={()=>mixedSelected?captureRoomMixed(cutIndices):saveRoomScene(selectedScene)}>{sw[0]}</button><button type="button" disabled={(!surfaceScene&&!mixedSurface)||!!sceneCaptureWorker||moving||placing||!!editDraft||!!pickupDraft||!!placeDraft||!!transferDraft||!!editCopy} on:click={()=>mixedSurface?captureRoomMixed(face.positions.map((_,i)=>i)):saveRoomScene(surfaceScene)}>{isw[0]}</button>{#if testExport}<input type="file" accept=".wandpreset,.json,.gz,application/json,application/gzip" hidden bind:this={sceneInput} on:change={openRoomScene}/><PresetFilePicker {locale} schemas={['wand.preset.scene@1','wand.preset.mixed-scene@1']} disabled={!editAllowed||!face.terrain||sceneReading||moving||placing||!!editDraft||!!pickupDraft||!!placeDraft||!!transferDraft||stockOpen} label={sw[1]} onPick={f=>void openRoomSceneFile(f)}/>{/if}{#if sceneError}<small role="alert">{isw[2]}</small>{/if}{#if sceneActive}<select aria-label={sw[6]} bind:value={sceneAnchor} disabled={!placing}><option value="corner">{sw[3]}</option><option value="center">{sw[2]}</option></select><small>{mixedRequest?'…':sceneMissing?isw[2]:cloneClip.length}</small>{#if mixedDoc}<div class="indoor-edit">{#each [...sceneCounts] as [id,n]}<small>{name(id,records,locale,w[12])} · {stock.get(id)??0}/{n}</small>{/each}</div>{/if}{/if}</div>{/if}
    {#if positionOpen&&tree&&testExport}<div class="indoor-edit"><strong>{iw[0]}</strong><small>{face.terrain?itw[5]:iw[2]}</small>
     <select aria-label={iw[1]} value={selectedObject} disabled={!!editDraft||!!pickupDraft||!!editCopy||!!editWorker||moving||placing||!!placeDraft||!!transferDraft||stockOpen} on:change={e=>chooseObject(Number(e.currentTarget.value))}><option value={-1} disabled>{iw[1]}</option>{#each tree.objects as o,i}<option value={i} disabled={swap&&!partners.includes(i)}>{name(o.itemId,records,locale,w[12])} · {o.x}, {o.y}</option>{/each}</select>
     {#if selectedObject>=0&&selectedGroup.size<=1&&!editDraft&&!pickupDraft&&!editCopy&&!moving&&!placing&&!placeDraft&&!transferDraft&&!stockOpen}<button type="button" disabled={!editAllowed||!left||swap} on:click={()=>stageRotation(left)}>{ew[0]}</button><button type="button" disabled={!editAllowed||!right||swap} on:click={()=>stageRotation(right)}>{ew[1]}</button><button type="button" disabled={!editAllowed||!partners.length||swap||!!linkedAxis} on:click={()=>swap=true}>{ew[2]}</button><button type="button" disabled={!editAllowed||!pickup||swap} on:click={()=>{if(pickup)pickupDraft=[pickup];}}>{iw[3]}</button>{#if face.terrain}<button type="button" disabled={!editAllowed||!moveShape||!(freeEdit?freeEligible:editable).has(tree.objects[selectedObject].itemId)||swap} on:click={()=>{moving=true;editError=false;}}>{itw[1]}</button>{/if}{/if}
     {#if selectedGroup.size>1&&!moving&&!placing&&!editDraft&&!pickupDraft&&!placeDraft&&!transferDraft&&!editCopy&&!swap&&!stockOpen}<button type="button" disabled={!editAllowed||!groupMoveReady} on:click={()=>{moving=true;editError=false;}}>{indoorGroupMoveWords[locale]} · {selectedGroup.size}</button><button type="button" disabled={!editAllowed||!groupLeft} on:click={()=>stageRotation(groupLeft)}>{ew[0]}</button><button type="button" disabled={!editAllowed||!groupRight} on:click={()=>stageRotation(groupRight)}>{ew[1]}</button>{#each alignModes as mode,i}<button type="button" disabled={!editAllowed||!alignOptions[i]||!!symmetryMode||!!linkedAxis} on:click={()=>{alignmentDraft=true;editDraft=alignOptions[i];}}>{aw[i]}</button>{/each}{/if}
     {#if selectedObject>=0&&face?.terrain&&!moving&&!placing&&!editDraft&&!pickupDraft&&!placeDraft&&!transferDraft&&!editCopy&&!swap&&!stockOpen}{#each symmetryModes as mode,i}<button type="button" disabled={freeEdit||!editAllowed||mixedSelected&&mode!=='point'||!!sceneCaptureWorker} aria-pressed={symmetryMode===mode&&!linkPicking} on:click={()=>startSymmetry(mode)}>{aw[8+i]}</button>{/each}{/if}
     {#if face?.terrain&&!moving&&!placing&&!editDraft&&!pickupDraft&&!placeDraft&&!transferDraft&&!editCopy&&!swap&&!stockOpen}<span>{lw[0]}</span>{#each symmetryModes as mode,i}<button type="button" disabled={freeEdit||!editAllowed} aria-pressed={linkedAxis?.mode===mode||linkPicking&&symmetryMode===mode} on:click={()=>beginLink(mode)}>{aw[8+i]}</button>{/each}{#if linkedAxis}<button type="button" on:click={()=>linkedAxis=null}>{lw[2]}</button>{/if}{/if}
     {#if symmetryMode}<small>{linkPicking?lw[1]:aw[11]}{#if sceneCaptureWorker||pointRequest} …{/if}</small><button type="button" on:click={()=>{symmetryMode=null;symmetryAxis=null;linkPicking=false;pointRequest=0;pointValid=false;}}>{w[7]}</button>{/if}
     {#if face.terrain&&!moving&&!placing&&!editDraft&&!pickupDraft&&!placeDraft&&!transferDraft&&!editCopy&&!swap&&!cutSource}<button type="button" disabled={!editAllowed||!catalog.length} on:click={()=>{stockOpen=!stockOpen;stockQuery='';}}>{itw[2]}</button>{/if}
     {#if stockOpen}<input type="search" bind:value={stockQuery} placeholder={itw[4]} aria-label={itw[4]}/><select aria-label={itw[2]} value={0} on:change={e=>chooseStock(Number(e.currentTarget.value))}><option value={0} disabled>{itw[2]}</option>{#each options as o}<option value={o.itemId}>{o.name} · {stock.get(o.itemId)}</option>{/each}</select>{/if}
     {#if selectedObject>=0&&!moving&&!placing&&!editDraft&&!pickupDraft&&!placeDraft&&!transferDraft&&!editCopy&&!swap&&!stockOpen}
      {#if selectedGroup.size>1||mixedSelected}<button type="button" disabled={!editAllowed||!groupPickup} on:click={()=>pickupDraft=groupPickup}>{mixedSelected?supportPickupWords[locale][0]:indoorGroupStockWords[locale][0]} · {cutIndices.length}</button>{/if}
      <button type="button" disabled={!editAllowed||!!sceneCaptureWorker||!duplicateClip&&!mixedSelected||!!linkedAxis&&mixedSelected} on:click={beginDuplicate}>{indoorGroupStockWords[locale][1]}{#if selectedGroup.size>1} · {selectedGroup.size}{/if}</button>
     {/if}
     {#if canCut}<button type="button" on:click={captureRoomCut}>{cutWords[0]}{#if cutIndices.length>1} · {cutIndices.length}{/if}</button>{/if}
     {#if $worldFurnitureCut?.file===file&&$worldFurnitureCut?.scope==='indoor'&&!cutSource}<small role="status">{cutWords[1]} · {$worldFurnitureCut.rows.length}</small>{/if}
     {#if availableCut&&!moving&&!placing&&!editDraft&&!pickupDraft&&!placeDraft&&!transferDraft&&!editCopy&&!swap&&!stockOpen}<button type="button" disabled={!editAllowed} on:click={beginTransfer}>{indoorTransferWords[locale]}</button>{/if}
     {#if moving||placing}<small>{itw[3]}</small>{/if}{#if placing}<button type="button" on:click={()=>turnStock(-1)}>{ew[0]}</button><button type="button" on:click={()=>turnStock(1)}>{ew[1]}</button>{/if}
     {#if placeDraft}<small>{placeDraft.length===1?placeDraft[0].expectedStock+' → '+(placeDraft[0].expectedStock-1):'+'+placeDraft.length}</small>{/if}
     {#if swap}<small>{ew[3]}</small>{/if}
     {#if pickupDraft}{#if pickupDraft.some(p=>p.includeSupport)}<small>{supportPickupWords[locale][1]}</small>{/if}<small>{pickupDraft.length===1&&!pickupDraft[0].includeSupport?pickupDraft[0].expectedStock+' → '+(pickupDraft[0].expectedStock+1):'−'+pickupDraft.length}</small>{/if}
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
 {#if supportParent}<SubgridInspector open={true} roomParent={supportParent} initialChildIndex={supportChild} {roomPickupPlan} roomDuplicateAllowed={supportCloneReady&&!linkedAxis} onRoomDuplicate={beginSupportDuplicate} {file} worker={terrainWorker} names={supportNames} {base} {locale} canMove={testExport&&!blocked} {nextRequest} onItems={ids=>loadItems(ids,ids)} onClose={closeSupport}/>{/if}
 {#if !testExport}<footer>{w[14]}</footer>{/if}
{#if projectApplyOpen&&file&&room}<RoomProjectApply {file} {room} {stock} {owned} worker={terrainWorker} {locale} {nextRequest} {blocked} onClose={()=>projectApplyOpen=false}/>{/if}
</div>
<style>
 .room-map-button{flex:1;min-height:0;padding:0;background:none;border:0;display:flex;touch-action:none}.room-map-button.room-panning{cursor:grab}.room-map-button.room-panning:active{cursor:grabbing}.room-camera-tools{display:flex;gap:4px;justify-content:flex-end}.room-camera-tools button{min-width:32px;min-height:28px}.indoor-edit{display:flex;flex-wrap:wrap;align-items:center;gap:5px}.indoor-edit small{flex-basis:100%}.indoor-edit select{max-width:100%}
 .indoor-room-view{position:absolute;inset:0;z-index:22;background:var(--wand-bg);color:var(--wand-text);display:flex;flex-direction:column;min-width:0;overflow:hidden;padding:8px;gap:6px}
 header,.finish-heading,.room-items-header{display:flex;align-items:center;gap:6px}header strong,.room-items-header strong{flex:1}button,input,select{font:inherit;color:inherit;background:var(--wand-menu);border:1px solid var(--wand-line);border-radius:5px;padding:5px}button[aria-pressed=true]{outline:2px solid var(--wand-accent)}.finish-picker{display:flex;align-items:center;gap:5px;flex-wrap:wrap}.test-copy-link{color:var(--wand-accent);padding:5px;border:1px solid var(--wand-line);border-radius:5px}.finish-picker select{max-width:min(240px,100%)}.finish-preview-art{width:48px;height:48px;object-fit:contain}.room-body{display:flex;flex:1;min-height:0;gap:8px}nav{width:min(220px,35%);display:flex;flex-direction:column;gap:4px;overflow:auto}nav button{text-align:start;overflow-wrap:anywhere}nav select{max-width:100%;min-width:0;flex:none}.room-content{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;gap:6px}.finishes{display:flex;gap:5px;overflow:auto;flex:none;max-height:40%}.finish-card{min-width:100px;max-width:145px;display:flex;flex-direction:column;align-items:center;gap:3px;background:var(--wand-card);padding:5px;border-radius:5px}.finish-card img{width:64px;height:64px;object-fit:contain}.finish-card small{text-align:center;overflow-wrap:anywhere}.position-map{display:flex;flex-direction:column;gap:2px;min-height:0;flex:1;background:var(--wand-card);border:1px solid var(--wand-line);border-radius:5px;padding:4px}.position-map svg{width:100%;flex:1;min-height:40px;max-height:none}.indoor-footprint{fill:var(--wand-muted);fill-opacity:.45;stroke:var(--wand-line);stroke-width:1;vector-effect:non-scaling-stroke}.indoor-footprint.highlighted{fill:var(--wand-accent);stroke:var(--wand-text)}.indoor-footprint.dimmed{opacity:.25}.position-map circle{fill:var(--wand-muted)}.position-map circle.highlighted{fill:var(--wand-accent);stroke:var(--wand-text);stroke-width:1;vector-effect:non-scaling-stroke}.position-map circle.dimmed{opacity:.25}.position-map small{font-size:11px;color:var(--wand-muted)}.room-items{flex:1;min-height:0;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(105px,1fr));gap:4px;align-content:start}.room-item{display:flex;flex-direction:column;align-items:center;text-align:center;background:var(--wand-card);border-radius:5px;padding:4px;overflow-wrap:anywhere;font-size:12px}.room-item img{width:52px;height:52px;object-fit:contain}footer{font-size:12px;color:var(--wand-muted)}@media(max-width:600px){.room-body{flex-direction:column}nav{width:100%;max-height:24%;flex-direction:row;flex-wrap:wrap}.room-items-header input{width:45%}}
</style>
