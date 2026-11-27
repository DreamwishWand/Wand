<script lang="ts">
  import {onDestroy,onMount} from 'svelte';
  import {localSaveSession,selectLocalSaveFile,closeLocalSaveFile,
    registerLocalSaveChangeGuard} from '$lib/ui/local-save-session';
  import {beforeNavigate} from '$app/navigation';
  import {base} from '$app/paths';
  import type {Db00ItemContext} from './common-db-context';
  import type {SavedGridItemReference} from './save-world-db04-context';
  import GridObjectPositionMap from './GridObjectPositionMap.svelte';
  import VerifiedSaveItemIcon from './VerifiedSaveItemIcon.svelte';
  import {combineSavedGridQueues,gridEditsForQuantityExport}
    from './grid-combined-queues';
  import {queuedSaveExportMode}
    from './queued-save-export';
  import {nextSaveListWindowLimit,SAVE_LIST_WINDOW_SIZE}
    from './save-list-scroll';
  import {filterOwnedSlots,ownedCategoryOptions,ownedSlotLocation,
    pendingOwnedAmount} from './owned-slot-view';
  import type {OwnedSlot} from './owned-slot-view';
  import {MAX_OWNED_AMOUNT_BATCH,planFilteredOwnedAmounts}
    from './bulk-owned-amounts';
  import {draftGridGroupQuarterTurn}
    from './grid-group-quarter-turn';
  import type {GridQuarterTurnDirection}
    from './grid-group-quarter-turn';

  /** Same Rust/WASM Save session in both user workspace and diagnostic route. */
  export let developmentMode=false;
  let activeEditorPane:'items'|'world'='items';
  let amountEditorReady=false;
  let amountSource:'saved'|'manual'='saved';
  function startManualAmountEntry():void{
    if(processing)return;
    cancel();result=null;
    amountRevisionIndex=null;
    amountSource='manual';
    kind='inventory';
    inventoryId='';itemId='';containerId='';
    slotIndex='';chestItemId='';
    expected='';replacement='';
    amountEditorReady=true;
  }
  function changeEditorPane(pane:'items'|'world'):void{
    activeEditorPane=pane;
    if(pane==='world'&&slotState==='ready'&&instanceState==='idle'&&
       !processing)void loadGridInstances();
  }
  // Explicit copy export never overwrites the source. No production Writer.
  let fileInput:HTMLInputElement|null=null;
  let approvedReopenFile:File|null=null;
  let activeFile:File|null=null;
  let knownSaveRevision=-1;
  let kind:'inventory'|'chest'='inventory';
  let inventoryId='100';
  let itemId='550';
  let containerId='202';
  let slotIndex='1';
  let chestItemId='440';
  let expected='7';
  let replacement='12';
  let result:'changed'|'unchanged'|'error'|null=null;
  let active:Worker|null=null;
  let processing=false;
  let revision=0;
  type EditTarget =
    | {kind:'inventory';inventoryId:string;itemId:string}
    | {kind:'chest';containerId:string;slotIndex:number;itemId:number};
  type BatchEdit={target:EditTarget;expected:number;replacement:number};
  type PreviewSnapshot =
    | {mode:'single';file:File;format:'json'|'auto';target:EditTarget;
       expected:number;replacement:number;signature:string}
    | {mode:'batch';file:File;format:'json'|'auto';edits:BatchEdit[];
       signature:string};
  let queuedEdits:BatchEdit[]=[];
  let amountRevisionIndex:number|null=null;
  // A pending batch belongs to one selected Save. Edits may be staged before
  // the first file is chosen, but must never carry over to another file.
  let fileSelected=false;
  type EditableSlot=OwnedSlot;
  let savedSlots:EditableSlot[]=[];
  let savedSlotsFile:File|null=null;
  let worldRefs:SavedGridItemReference[]=[];
  let worldStatus:'not_observed'|'incompatible_structure'|'partial_inconclusive'|
    'observed_no_item_refs'|'saved_item_refs'='not_observed';
  let worldQuery='';
  let worldVisibleLimit=SAVE_LIST_WINDOW_SIZE;
  let removedGridMarkers=0;
  type LocalGridInstance={
    localOrdinal:number;localGridOrdinal:number;itemId:string;
    recordKind:'full'|'diff_modified';
    x:number|null;y:number|null;orientation:string|null;
    coordinatesObserved:boolean;
  };
  type GridInstancesReceipt={
    contract:'wand.db05.grid-instance-preview@2';
    status:'not_observed'|'incompatible_structure'|
      'partial_inconclusive'|'observed_no_item_refs'|'saved_object_instances';
    observedFullGrids:number;observedDiffGrids:number;
    scannedObjectRecords:number;notItemReferences:number;
    invalidRecords:number;removedObjectMarkers:number;
    rowsMissingCoordinates:number;sampled:boolean;
    rows:LocalGridInstance[];
    sourceGridIdentityVerified:false;effectivePlacementVerified:false;
    legalPlacementVerified:false;stableInstanceIdentityVerified:false;
    saveWritingAuthorized:false;
  };
  let gridInstances:LocalGridInstance[]=[];
  let instanceState:'idle'|'reading'|'ready'|'error'='idle';
  let instanceStatus:GridInstancesReceipt['status']='not_observed';
  let instanceSampled=false;
  let instanceQuery='';
  let gridVisibleLimit=SAVE_LIST_WINDOW_SIZE;
  type GridCoordinatePlan={
    localOrdinal:number;itemId:string;
    recordKind:'full'|'diff_modified';
    expectedX:number;expectedY:number;
    replacementX:number;replacementY:number;
  };
  let coordinateSelection:LocalGridInstance|null=null;
  let coordinateFocusRevision=0;
  let coordinateX='';let coordinateY='';
  let coordinateOrientationValue='';
  let coordinateState:'idle'|'checking'|'validated'|'exporting'|'error'='idle';
  let coordinateQueue:GridCoordinatePlan[]=[];
  type GridMixedPlan={
    localOrdinal:number;itemId:string;
    recordKind:'full'|'diff_modified';
    expectedX:number;expectedY:number;
    replacementX:number|null;replacementY:number|null;
    expectedOrientation:CardinalOrientation|null;
    replacementOrientation:CardinalOrientation|null;
  };
  let mixedQueue:GridMixedPlan[]=[];
  $: combinedGridEdits=combineSavedGridQueues(coordinateQueue,mixedQueue);
  $: quantityGridEdits=gridEditsForQuantityExport(coordinateQueue,mixedQueue);
  $: queuedExportMode=queuedSaveExportMode(
    queuedEdits.length,coordinateQueue.length,mixedQueue.length,
    combinedGridEdits?.length??null,quantityGridEdits?.length??null);
  $: queuedGridCount=quantityGridEdits?.length??
    (combinedGridEdits?.length??coordinateQueue.length+mixedQueue.length);
  let coordinateSnapshot:
    |{mode:'single';file:File;format:'json'|'auto';
      plan:GridCoordinatePlan;signature:string}
    |{mode:'batch';file:File;format:'json'|'auto';
      edits:GridCoordinatePlan[];signature:string}
    |{mode:'transform';file:File;format:'json'|'auto';
      plan:GridTransformPlan;signature:string}
    |{mode:'mixed';file:File;format:'json'|'auto';
      edits:GridMixedPlan[];signature:string}
    |{mode:'combined';file:File;format:'json'|'auto';
      edits:GridMixedPlan[];signature:string}
    |{mode:'quantity-grid';file:File;format:'json'|'auto';
      edits:GridMixedPlan[];amounts:BatchEdit[];signature:string}
    |null=null;
  let coordinateCopyUrl:string|null=null;
  let coordinateCopyBlob:Blob|null=null;
  let coordinateCopyName='';
  $: queuedExportVerified=queuedExportMode==='quantity'
    ?result==='changed'&&snapshot?.mode==='batch'&&
      snapshot.file===activeFile&&
      snapshot.signature===JSON.stringify(queuedEdits)
    :coordinateState==='validated'&&
      coordinateSnapshot?.file===activeFile&&
      (queuedExportMode==='quantity-grid'
        ?coordinateSnapshot?.mode==='quantity-grid'&&
          coordinateSnapshot.signature===JSON.stringify({
            gridEdits:quantityGridEdits,quantityEdits:queuedEdits
          })
        :queuedExportMode==='coordinates'
        ?coordinateSnapshot?.mode==='batch'&&
          coordinateSnapshot.signature===JSON.stringify(coordinateQueue)
        :queuedExportMode==='mixed'
        ?coordinateSnapshot?.mode==='mixed'&&
          coordinateSnapshot.signature===JSON.stringify(mixedQueue)
        :queuedExportMode==='combined'
        ?coordinateSnapshot?.mode==='combined'&&
          coordinateSnapshot.signature===JSON.stringify(combinedGridEdits)
        :false);
  $: queuedExportCopyUrl=queuedExportVerified
    ?queuedExportMode==='quantity'
      ?exportReady?downloadUrl:null
      :coordinateCopyUrl
    :null;
  type CardinalOrientation='GridOrientation_Up'|'GridOrientation_Right'|
    'GridOrientation_Down'|'GridOrientation_Left';
  const cardinalOptions:readonly CardinalOrientation[]=[
    'GridOrientation_Up','GridOrientation_Right',
    'GridOrientation_Down','GridOrientation_Left'
  ];
  type GridTransformPlan=GridCoordinatePlan&{
    expectedOrientation:CardinalOrientation;
    replacementOrientation:CardinalOrientation;
  };
  type GridOrientationPlan={
    localOrdinal:number;itemId:string;
    recordKind:'full'|'diff_modified';
    expectedX:number;expectedY:number;
    expectedOrientation:CardinalOrientation;
    replacementOrientation:CardinalOrientation;
  };
  let orientationSelection:LocalGridInstance|null=null;
  let orientationValue:string='GridOrientation_Up';
  let orientationState:'idle'|'checking'|'validated'|'exporting'|'error'='idle';
  let orientationSnapshot:{
    file:File;format:'json'|'auto';plan:GridOrientationPlan;signature:string
  }|null=null;
  let orientationCopyUrl:string|null=null;
  let orientationCopyName='';
  let db04Input:HTMLInputElement|null=null;
  type Db04GridMatch={
    contract:'wand.db05.db04-grid-path-match@2';
    status:string;observedFullGrids:number;matchedFullGrids:number;
    notInPartialSourceFullGrids:number;ambiguousSourceFullGrids:number;
    malformedFullGrids:number;observedDiffGrids:number;
    hashUnverifiedDiffGrids:number;
    structuralCandidateDiffGrids:number;notInPartialSourceDiffGrids:number;
    ambiguousSourceDiffGrids:number;malformedDiffGrids:number;
    sourceCoverageComplete:false;sourceOriginalArchiveRechecked:false;
    saveGridNumericIdUsedAsNativeKey:false;diffIdentityVerified:false;
    worldCoordinatesVerified:false;playerPlacementVerified:false;
    nativeDefaultObjectEquivalenceVerified:false;saveWritingAuthorized:false;
  };
  type Db04ObjectSourceRow={
    localOrdinal:number;
    sourceStatus:
      |'saved_grid_source_unavailable'
      |'not_in_partial_source'
      |'ambiguous_source_candidates'
      |'diff_structural_candidate_hash_unverified'
      |'full_exact_source_path_candidate';
    candidateCount:number;
    nativeSizeX:number|null;nativeSizeY:number|null;
    tessellationFactor:number|null;
    sourceAnchorEnvelopeWidth:number|null;
    sourceAnchorEnvelopeHeight:number|null;
    savedPositionNumericRelation:
      |'within_source_anchor_numeric_envelope'
      |'outside_source_anchor_numeric_envelope'
      |'not_comparable';
  };
  type Db04ObjectSourceReceipt={
    contract:'wand.db05.db04-grid-object-source-context@2';
    rows:Db04ObjectSourceRow[];
    sourceCoverageComplete:false;sourceArchiveRechecked:false;
    savedGridIdentityVerified:false;
    savedSourceCoordinateEquivalenceVerified:false;
    worldCoordinateTransformVerified:false;
    placementLegalityVerified:false;editPermissionAuthorized:false;
  };
  let db04ObjectSources:Db04ObjectSourceRow[]=[];
  let db04Match:Db04GridMatch|null=null;
  let db04State:'idle'|'reading'|'verified'|'error'='idle';
  type Db03MissionSummary={
    contract:'wand.db05.db03-mission-slot-summary@1';
    status:string;
    observedMissionSlots:number;matchedPlayableQuestReferences:number;
    unresolvedPlayableQuestReferences:number;zeroSentinels:number;
    malformedMissionIds:number;typeIssues:number;missingOptionalMissionIds:number;
    distinctPositiveMissionIds:number;sampled:boolean;
    publishedQuestDefinitions:733;sourceGameVersion:'1.26.2';
    indexMetadataValidated:true;originalGameSourceBytesRehashed:false;
    conditionCompatibilityVerified:false;completeQuestHistoryVerified:false;
    questProgressVerified:false;questCompletionVerified:false;
    entitlementVerified:false;saveWritingAuthorized:false;exportAuthorized:false;
  };
  let db03Summary:Db03MissionSummary|null=null;
  let db03State:'idle'|'reading'|'ready'|'error'='idle';

  let slotState:'idle'|'loading'|'ready'|'error'='idle';
  let slotQuery='';
  let slotVisibleLimit=SAVE_LIST_WINDOW_SIZE;
  let slotFilter:'all'|'inventory'|'chest'='all';
  let slotCategoryFilter='all';
  let bulkAmountOpen=false;
  let bulkAmountValue='';
  let bulkAmountError='';
  let bulkAmountStatus='';
  let dbMap=new Map<string,Db00ItemContext>();
  let dbMediaVersion:string|null=null;
  $: selectedAmountItemId=kind==='inventory'?itemId:chestItemId;
  $: selectedAmountMetadata=dbMap.get(selectedAmountItemId);
  $: selectedAmountLocation=kind==='inventory'
    ?'Inventory '+inventoryId:'Chest '+containerId+' / Slot '+slotIndex;
  let dbStatus:'idle'|'loading'|'ready'|'unavailable'='idle';
  let dbWorker:Worker|null=null;
  let catalogRevision=0;
  $: slotCategories=ownedCategoryOptions(savedSlots,dbMap);
  $: matchedSlots=filterOwnedSlots(savedSlots,dbMap,{
    location:slotFilter,category:slotCategoryFilter,query:slotQuery
  });
  $: visibleSlots=matchedSlots.slice(0,slotVisibleLimit);
  $: matchedGridInstances=gridInstances.filter(row=>{
    const q=instanceQuery.trim().toLocaleLowerCase();
    const name=dbMap.get(row.itemId)?.name??'';
    return !q||row.itemId.includes(q)||
      name.toLocaleLowerCase().includes(q);
  });
  $: visibleGridInstances=matchedGridInstances.slice(0,gridVisibleLimit);
  $: matchedWorldRefs=worldRefs.filter(row=>{
    const meta=dbMap.get(row.itemId);
    const q=worldQuery.trim().toLocaleLowerCase();
    return !q||row.itemId.includes(q)||
      (meta?.name??'').toLocaleLowerCase().includes(q)||
      (meta?.category??'').toLocaleLowerCase().includes(q);
  });
  $: visibleWorldRefs=matchedWorldRefs.slice(0,worldVisibleLimit);
  let snapshot:PreviewSnapshot|null=null;
  let downloadUrl:string|null=null;
  let downloadBlob:Blob|null=null;
  let downloadName='';
  let exportReady=false;
  const MAX_BYTES=128*1024*1024;
  function discardDownload(){
    if(downloadUrl)URL.revokeObjectURL(downloadUrl);
    downloadUrl=null;
    downloadBlob=null;
    downloadName='';
    exportReady=false;
  }
  function discardCoordinateCopy(){
    if(coordinateCopyUrl)URL.revokeObjectURL(coordinateCopyUrl);
    coordinateCopyUrl=null;coordinateCopyBlob=null;coordinateCopyName='';
  }
  function invalidateCoordinateEdit(){
    coordinateSnapshot=null;coordinateState='idle';
    discardCoordinateCopy();
  }
  function isCardinal(v:string|null):v is CardinalOrientation{
    return v!==null&&cardinalOptions.some(name=>name===v);
  }
  function discardOrientationCopy(){
    if(orientationCopyUrl)URL.revokeObjectURL(orientationCopyUrl);
    orientationCopyUrl=null;orientationCopyName='';
  }
  function invalidateOrientationEdit(){
    orientationSnapshot=null;orientationState='idle';
    discardOrientationCopy();
  }
  function selectedOrientationPlan():GridOrientationPlan|null{
    const row=orientationSelection;
    if(!row||!row.coordinatesObserved||row.x===null||row.y===null||
       !isCardinal(row.orientation)||!isCardinal(orientationValue)||
       row.orientation===orientationValue)return null;
    return {localOrdinal:row.localOrdinal,itemId:row.itemId,
      recordKind:row.recordKind,expectedX:row.x,expectedY:row.y,
      expectedOrientation:row.orientation,
      replacementOrientation:orientationValue};
  }
  function selectOrientation(row:LocalGridInstance){
    if(!row.coordinatesObserved||!isCardinal(row.orientation))return;
    cancel();result=null;
    orientationSelection={...row};
    orientationValue=row.orientation;
  }
  function coordinateNumber(value:string):number|null{
    if(!/^(?:0|-?[1-9][0-9]*)$/.test(value))return null;
    const v=Number(value);
    return Number.isInteger(v)&&v>=-2147483648&&v<=2147483647?v:null;
  }
  function selectedCoordinatePlan():GridCoordinatePlan|null{
    const row=coordinateSelection;
    const x=coordinateNumber(coordinateX),y=coordinateNumber(coordinateY);
    if(!row||!row.coordinatesObserved||
       row.x===null||row.y===null||
       x===null||y===null||(x===row.x&&y===row.y))return null;
    return {localOrdinal:row.localOrdinal,itemId:row.itemId,
      recordKind:row.recordKind,expectedX:row.x,expectedY:row.y,
      replacementX:x,replacementY:y};
  }
  function selectedTransformPlan():GridTransformPlan|null{
    const coord=selectedCoordinatePlan();
    const original=coordinateSelection?.orientation??null;
    if(!coord||!isCardinal(original)||
       !isCardinal(coordinateOrientationValue)||
       original===coordinateOrientationValue)return null;
    return {...coord,expectedOrientation:original,
      replacementOrientation:coordinateOrientationValue};
  }
  // Explicit dependencies keep Svelte 5 legacy-reactive button state in
  // sync when bound X/Y or orientation changes; method calls alone do not
  // expose their hidden reads to reactive dependency analysis.
  $: transformReady=Boolean(
    coordinateSelection&&coordinateX&&coordinateY&&coordinateOrientationValue
      ?selectedTransformPlan():null
  );
  function queueCoordinateEdit(){
    const plan=selectedCoordinatePlan();
    if(!plan||coordinateQueue.length>=16||
       coordinateQueue.some(p=>p.localOrdinal===plan.localOrdinal)){
      invalidateCoordinateEdit();coordinateState='error';return;
    }
    cancel();result=null;
    coordinateQueue=[...coordinateQueue,plan];
  }
  function beginQueuedCoordinateRevision(edit:GridCoordinatePlan){
    // Ephemeral local ordinals must still match the original staged source.
    if(processing||!savedSlotsFile||savedSlotsFile!==activeFile)return;
    const row=gridInstances[edit.localOrdinal-1];
    if(!row||row.localOrdinal!==edit.localOrdinal||
       !row.coordinatesObserved||row.x!==edit.expectedX||
       row.y!==edit.expectedY||row.itemId!==edit.itemId||
       row.recordKind!==edit.recordKind)return;
    selectGridInstance(row);
    coordinateX=String(edit.replacementX);
    coordinateY=String(edit.replacementY);
  }
  function updateQueuedCoordinate(){
    const candidate=selectedCoordinatePlan();
    const existing=candidate&&coordinateQueue.find(
      edit=>edit.localOrdinal===candidate.localOrdinal);
    if(!candidate||!existing||!savedSlotsFile||
       savedSlotsFile!==activeFile||
       existing.itemId!==candidate.itemId||
       existing.recordKind!==candidate.recordKind||
       existing.expectedX!==candidate.expectedX||
       existing.expectedY!==candidate.expectedY){
      invalidateCoordinateEdit();coordinateState='error';return;
    }
    // Replacing a draft never writes a Save. Invalidate any old receipt and
    // require Rust/WASM to re-resolve original identities before export.
    cancel();result=null;
    coordinateQueue=coordinateQueue.map(edit=>
      edit.localOrdinal===candidate.localOrdinal?candidate:edit);
  }
  function removeCoordinateEdit(ordinal:number){
    cancel();result=null;
    coordinateQueue=coordinateQueue.filter(p=>p.localOrdinal!==ordinal);
  }
  function queueGroupRotation(
    ordinals:readonly number[],direction:GridQuarterTurnDirection,
    pivotOrdinal:number
  ):boolean{
    // Stage only; local UI ordinals are resolved again by the Rust
    // mixed-batch writer against the immutable original Save.
    if(processing||!activeFile||activeFile!==savedSlotsFile||
       ordinals.length<2||ordinals.length>16||
       mixedQueue.length+ordinals.length>16||
       new Set(ordinals).size!==ordinals.length||
       ordinals.some(id=>coordinateQueue.some(edit=>
         edit.localOrdinal===id)||mixedQueue.some(edit=>
         edit.localOrdinal===id)))return false;
    const sources=ordinals.map(id=>gridInstances[id-1]);
    if(sources.some((row,i)=>!row||row.localOrdinal!==ordinals[i]))
      return false;
    const draft=draftGridGroupQuarterTurn(
      sources.filter((row):row is LocalGridInstance=>row!==undefined),
      direction,pivotOrdinal
    );
    if(!draft||draft.length!==ordinals.length)return false;
    cancel();result=null;
    const pivot=sources.find(row=>row.localOrdinal===pivotOrdinal);
    if(!pivot)return false;
    coordinateSelection={...pivot};
    coordinateX=String(pivot.x);coordinateY=String(pivot.y);
    coordinateOrientationValue=isCardinal(pivot.orientation)
      ?pivot.orientation:'';
    mixedQueue=[...mixedQueue,...draft];
    return true;
  }
  function queueGroupTranslation(
    ordinals:readonly number[],dx:number,dy:number
  ):boolean{
    // UI staging only. The immutable original profile is re-resolved and
    // every target optimistic-checked atomically by existing Rust/WASM.
    if(processing||ordinals.length<2||ordinals.length>16||
       coordinateQueue.length+ordinals.length>16||
       !Number.isInteger(dx)||!Number.isInteger(dy)||
       dx < -2147483648||dx > 2147483647||
       dy < -2147483648||dy > 2147483647||
       (dx===0&&dy===0))return false;
    const unique=new Set(ordinals);
    if(unique.size!==ordinals.length||
       ordinals.some(ordinal=>coordinateQueue.some(
         edit=>edit.localOrdinal===ordinal)))return false;
    const rows=ordinals.map(ordinal=>gridInstances[ordinal-1]);
    if(rows.some((row,i)=>!row||row.localOrdinal!==ordinals[i]||
         !row.coordinatesObserved||row.x===null||row.y===null))return false;
    const first=rows[0];
    if(rows.some(row=>row.localGridOrdinal!==first.localGridOrdinal))
      return false;
    const staged:GridCoordinatePlan[]=[];
    for(const row of rows){
      if(row.x===null||row.y===null)return false;
      const x=row.x+dx,y=row.y+dy;
      if(!Number.isInteger(x)||!Number.isInteger(y)||
         x < -2147483648||x > 2147483647||
         y < -2147483648||y > 2147483647)return false;
      staged.push({
        localOrdinal:row.localOrdinal,itemId:row.itemId,
        recordKind:row.recordKind,expectedX:row.x,expectedY:row.y,
        replacementX:x,replacementY:y
      });
    }
    cancel();result=null;
    coordinateSelection={...first};
    coordinateX=String(staged[0].replacementX);
    coordinateY=String(staged[0].replacementY);
    coordinateOrientationValue=isCardinal(first.orientation)
      ?first.orientation:'';
    coordinateQueue=[...coordinateQueue,...staged];
    return true;
  }
  function enqueueMixedEdit(edit:GridMixedPlan|null){
    if(!edit||mixedQueue.length>=16||
       mixedQueue.some(p=>p.localOrdinal===edit.localOrdinal)){
      invalidateCoordinateEdit();coordinateState='error';return;
    }
    cancel();result=null;
    mixedQueue=[...mixedQueue,edit];
  }
  function draftMixedFromCoordinates():GridMixedPlan|null{
    const row=coordinateSelection;
    if(!row||!row.coordinatesObserved||row.x===null||row.y===null||
       coordinateNumber(coordinateX)===null||
       coordinateNumber(coordinateY)===null)return null;
    const coord=selectedCoordinatePlan();
    const old=isCardinal(row.orientation)?row.orientation:null;
    const rotated=old!==null&&isCardinal(coordinateOrientationValue)&&
      old!==coordinateOrientationValue;
    if(!coord&&!rotated)return null;
    return {
      localOrdinal:row.localOrdinal,itemId:row.itemId,
      recordKind:row.recordKind,expectedX:row.x,expectedY:row.y,
      replacementX:coord?.replacementX??null,
      replacementY:coord?.replacementY??null,
      expectedOrientation:rotated?old:null,
      replacementOrientation:rotated
        ?coordinateOrientationValue as CardinalOrientation:null
    };
  }
  function queueMixedFromCoordinates(){
    enqueueMixedEdit(draftMixedFromCoordinates());
  }
  function beginQueuedMixedRevision(edit:GridMixedPlan){
    if(processing||!savedSlotsFile||savedSlotsFile!==activeFile)return;
    const row=gridInstances[edit.localOrdinal-1];
    if(!row||row.localOrdinal!==edit.localOrdinal||
       !row.coordinatesObserved||row.x!==edit.expectedX||
       row.y!==edit.expectedY||row.itemId!==edit.itemId||
       row.recordKind!==edit.recordKind||
       (edit.expectedOrientation!==null&&
        row.orientation!==edit.expectedOrientation))return;
    // Use one editor for orientation-only, coordinate-only, and combined
    // drafts. The original source is unchanged, even for group rotations.
    selectGridInstance(row);
    coordinateX=String(edit.replacementX??row.x);
    coordinateY=String(edit.replacementY??row.y);
    coordinateOrientationValue=edit.replacementOrientation??
      (isCardinal(row.orientation)?row.orientation:'');
  }
  function updateQueuedMixed(){
    const candidate=draftMixedFromCoordinates();
    const existing=candidate&&mixedQueue.find(edit=>
      edit.localOrdinal===candidate.localOrdinal);
    if(!candidate||!existing||!savedSlotsFile||
       savedSlotsFile!==activeFile||
       candidate.itemId!==existing.itemId||
       candidate.recordKind!==existing.recordKind||
       candidate.expectedX!==existing.expectedX||
       candidate.expectedY!==existing.expectedY||
       (existing.expectedOrientation!==null&&
        existing.expectedOrientation!==
          (isCardinal(coordinateSelection?.orientation??null)
            ?coordinateSelection?.orientation:null))){
      invalidateCoordinateEdit();coordinateState='error';return;
    }
    // Replace only the user's selected draft. Rust/WASM will re-resolve
    // the local ordinal and verify original identity/position/orientation
    // for the entire atomic batch before exporting another P1G copy.
    cancel();result=null;
    mixedQueue=mixedQueue.map(edit=>
      edit.localOrdinal===candidate.localOrdinal?candidate:edit);
  }
  function queueMixedFromOrientation(){
    const p=selectedOrientationPlan();
    enqueueMixedEdit(p?{
      localOrdinal:p.localOrdinal,itemId:p.itemId,recordKind:p.recordKind,
      expectedX:p.expectedX,expectedY:p.expectedY,
      replacementX:null,replacementY:null,
      expectedOrientation:p.expectedOrientation,
      replacementOrientation:p.replacementOrientation
    }:null);
  }
  function removeMixedEdit(ordinal:number){
    cancel();result=null;
    mixedQueue=mixedQueue.filter(p=>p.localOrdinal!==ordinal);
  }
  function hasQueuedChanges():boolean{
    return queuedEdits.length>0||coordinateQueue.length>0||mixedQueue.length>0;
  }
  function discardAllQueuedChanges():void{
    if(processing||!hasQueuedChanges())return;
    if(!window.confirm('登録した数量・配置の変更をすべて破棄しますか？元のセーブは変更されません。'))return;
    cancel();result=null;
    queuedEdits=[];coordinateQueue=[];mixedQueue=[];
    bulkAmountError='';bulkAmountStatus='';
    amountRevisionIndex=null;amountEditorReady=false;amountSource='saved';
    coordinateSelection=null;orientationSelection=null;
  }
  function closeSelectedSave():void{
    if(processing)return;
    // All shared entry points use the same guard, including the header.
    if(closeLocalSaveFile()&&fileInput)fileInput.value='';
  }
  function selectGridInstance(row:LocalGridInstance){
    if(!row.coordinatesObserved||row.x===null||row.y===null)return;
    cancel();result=null;
    coordinateSelection={...row};coordinateX=String(row.x);
    coordinateY=String(row.y);
    coordinateFocusRevision++;
    coordinateOrientationValue=isCardinal(row.orientation)
      ?row.orientation:'';
  }
  function parameters(){
    const old=uint32(expected),next=uint32(replacement);
    const target:EditTarget=kind==='inventory'
      ? {kind,inventoryId,itemId}
      : {kind,containerId,slotIndex:Number(slotIndex),itemId:Number(chestItemId)};
    const format:'json'|'auto'=activeFile?.name.toLowerCase().endsWith('.json')?'json':'auto';
    return {expected:old,replacement:next,target,format,
      signature:JSON.stringify({expected:old,replacement:next,target,format})};
  }
  function validateAllQueuedSave():void{
    if(developmentMode||processing||!activeFile||
       savedSlotsFile!==activeFile||
       queuedExportMode==='none'||queuedExportMode==='conflict')return;
    switch(queuedExportMode){
      case 'quantity':void preview(true);break;
      case 'coordinates':void validateCoordinateEdit(true);break;
      case 'mixed':void validateCoordinateEdit(false,false,true);break;
      case 'combined':void validateCoordinateEdit(false,false,false,true);break;
      case 'quantity-grid':
        void validateCoordinateEdit(false,false,false,false,true);break;
    }
  }
  function exportAllQueuedSave():void{
    if(developmentMode||processing||!queuedExportVerified)return;
    if(queuedExportMode==='quantity')void makeExperimentalCopy();
    else void exportCoordinateCopy();
  }
  function openExportedCopyForEditing():void{
    if(developmentMode||processing||!queuedExportVerified||!queuedExportCopyUrl)return;
    const copy=queuedExportMode==='quantity'
      ?{blob:downloadBlob,name:downloadName}
      :{blob:coordinateCopyBlob,name:coordinateCopyName};
    if(!copy.blob||copy.blob.size<1||copy.blob.size>MAX_BYTES||
       !copy.name||!/^.+\.(?:profile|dat|bin|json)$/i.test(copy.name))return;
    if(!window.confirm(
      '作成したコピーを新しい編集対象として読み込みます。現在の変更予約と出力リンクはクリアされます。元のファイルは変更されません。続けますか？'
    ))return;
    // File owns the Blob bytes even after the old object URL is revoked.
    // The shared session resets drafts, then reopens via Rust/WASM.
    const reopened=new File([copy.blob],copy.name,{
      type:'application/octet-stream'
    });
    approvedReopenFile=reopened;
    try{selectLocalSaveFile(reopened);}
    finally{approvedReopenFile=null;}
  }
  function copiedName(name:string):string{
    const safe=name.replace(/[\\/\u0000-\u001f]/g,'_');
    const dot=safe.lastIndexOf('.');
    const stem=dot>0?safe.slice(0,dot):safe;
    const extension=dot>0?safe.slice(dot):'.profile';
    // Re-editing an already edited copy must not repeat the suffix.
    return (stem.endsWith('.wand-edited')?stem:stem+'.wand-edited')+extension;
  }

  function cancel(){
    revision++;
    active?.terminate();
    active=null;
    processing=false;
    snapshot=null;
    discardDownload();
    invalidateCoordinateEdit();
    invalidateOrientationEdit();
  }
  onDestroy(()=>{
    cancel();
    dbWorker?.terminate();
    catalogRevision++;
  });
  function adoptSharedSave(file:File|null):void{
    if(fileSelected)queuedEdits=[];
    amountRevisionIndex=null;
    amountEditorReady=false;amountSource='saved';
    fileSelected=file!==null;
    activeFile=file;
    // Do not leave an obsolete native filename visible when the shared
    // selection changed via Home, the header, or full-screen drag/drop.
    if(fileInput && fileInput.files?.[0]!==file)fileInput.value='';
    cancel();
    result=null;
    dbWorker?.terminate();dbWorker=null;catalogRevision++;
    savedSlots=[];savedSlotsFile=null;slotState='idle';
    worldRefs=[];worldStatus='not_observed';worldQuery='';
    slotFilter='all';slotCategoryFilter='all';slotQuery='';
    bulkAmountOpen=false;bulkAmountValue='';
    bulkAmountError='';bulkAmountStatus='';
    slotVisibleLimit=SAVE_LIST_WINDOW_SIZE;
    gridVisibleLimit=SAVE_LIST_WINDOW_SIZE;
    worldVisibleLimit=SAVE_LIST_WINDOW_SIZE;
    removedGridMarkers=0;
    gridInstances=[];instanceState='idle';
    instanceStatus='not_observed';instanceSampled=false;instanceQuery='';
    coordinateSelection=null;coordinateX='';coordinateY='';
    coordinateOrientationValue='';
    coordinateQueue=[];mixedQueue=[];
    orientationSelection=null;orientationValue='GridOrientation_Up';
    db04Match=null;db04ObjectSources=[];db04State='idle';
    db03Summary=null;db03State='idle';
    dbMap=new Map();dbMediaVersion=null;dbStatus='idle';
  }
  function onFileChange():void{
    const file=fileInput?.files?.[0]??null;
    if(file)selectLocalSaveFile(file);
    else closeLocalSaveFile();
  }
  beforeNavigate(({cancel,willUnload})=>{
    if(developmentMode||!hasQueuedChanges())return;
    // Browser-native leave confirmation for unloads; explicit for in-app routes.
    if(willUnload||!window.confirm(
      '未出力の数量・配置の変更が消えます。このページから移動しますか？'
    ))cancel();
  });
  onMount(()=>{
    const unregister=developmentMode?()=>{}:registerLocalSaveChangeGuard(
      (previous,next)=>{
        if(approvedReopenFile!==null&&next===approvedReopenFile)return true;
        if(previous!==activeFile||!hasQueuedChanges())return true;
        return window.confirm(next===null
          ?'未出力の数量・配置の変更が消えます。セーブを閉じますか？'
          :'未出力の数量・配置の変更が消えます。別のセーブを選択しますか？');
      }
    );
    const unsubscribe=localSaveSession.subscribe(session=>{
      if(session.revision===knownSaveRevision)return;
      knownSaveRevision=session.revision;
      if(session.file===activeFile)return;
      const fromLocalPicker=fileInput?.files?.[0]===session.file;
      adoptSharedSave(session.file);
      // If chosen in another service, make the preview useful immediately
      // using the existing Rust/WASM Worker, with no extra picker or parser.
      if(session.file&&!fromLocalPicker)void loadSavedSlots();
    });
    return ()=>{unsubscribe();unregister();};
  });
  $: if(!developmentMode&&activeEditorPane==='world'&&
        slotState==='ready'&&instanceState==='idle'&&!processing){
    void loadGridInstances();
  }
  function sameAmountTarget(a:EditTarget,b:EditTarget):boolean{
    if(a.kind!==b.kind)return false;
    if(a.kind==='inventory'&&b.kind==='inventory')
      return a.inventoryId===b.inventoryId&&a.itemId===b.itemId;
    return a.kind==='chest'&&b.kind==='chest'&&
      a.containerId===b.containerId&&a.slotIndex===b.slotIndex&&
      a.itemId===b.itemId;
  }
  function populateAmountEditor(edit:BatchEdit,index:number):void{
    cancel();result=null;
    amountEditorReady=true;
    amountRevisionIndex=index;
    amountSource=savedSlots.some(slot=>
      slot.amount===edit.expected&&sameAmountTarget(
        slot.kind==='inventory'
          ?{kind:'inventory',inventoryId:slot.inventoryId,itemId:slot.itemId}
          :{kind:'chest',containerId:slot.containerId,
            slotIndex:slot.slotIndex,itemId:slot.itemId},edit.target))
      ?'saved':'manual';
    kind=edit.target.kind;
    if(edit.target.kind==='inventory'){
      inventoryId=edit.target.inventoryId;itemId=edit.target.itemId;
    }else{
      containerId=edit.target.containerId;
      slotIndex=String(edit.target.slotIndex);
      chestItemId=String(edit.target.itemId);
    }
    expected=String(edit.expected);
    replacement=String(edit.replacement);
  }
  function beginQueuedAmountRevision(index:number):void{
    if(processing||!Number.isInteger(index))return;
    const edit=queuedEdits[index];
    if(!edit)return;
    populateAmountEditor(edit,index);
  }
  function selectSavedSlot(slot:EditableSlot){
    const target:EditTarget=slot.kind==='inventory'
      ?{kind:'inventory',inventoryId:slot.inventoryId,itemId:slot.itemId}
      :{kind:'chest',containerId:slot.containerId,
        slotIndex:slot.slotIndex,itemId:slot.itemId};
    const index=queuedEdits.findIndex(edit=>
      sameAmountTarget(edit.target,target)&&edit.expected===slot.amount);
    if(index>=0){
      populateAmountEditor(queuedEdits[index],index);
      return;
    }
    cancel();result=null;
    amountEditorReady=true;
    amountRevisionIndex=null;
    amountSource='saved';
    kind=slot.kind;
    if(slot.kind==='inventory'){
      inventoryId=slot.inventoryId;itemId=slot.itemId;
    }else{
      containerId=slot.containerId;
      slotIndex=String(slot.slotIndex);
      chestItemId=String(slot.itemId);
    }
    expected=String(slot.amount);
    // The user must choose a replacement explicitly; the diagnostic
    // workspace keeps its historic +1 default for regression tests.
    replacement=developmentMode
      ?String(Math.min(0xffffffff,slot.amount+1)):'';
  }
  function beginCatalogLookup(rows:readonly EditableSlot[],file:File,
    gridRows:readonly SavedGridItemReference[]){
    dbWorker?.terminate();
    const request=++catalogRevision;
    // Reinspection must not display stale names or category matches while the
    // current publication is unresolved (including a failed catalog request).
    dbMap=new Map();dbMediaVersion=null;
    dbStatus='loading';
    const ids=[...new Set([
      ...rows.map(row=>String(row.itemId)),
      ...gridRows.map(row=>row.itemId)
    ])];
    const worker=new Worker(
      new URL('./save-catalog.worker.ts',import.meta.url),
      {type:'module'}
    );
    dbWorker=worker;
    const done=(reply:unknown)=>{
      if(request!==catalogRevision||dbWorker!==worker||
         savedSlotsFile!==file)return;
      worker.terminate();dbWorker=null;
      const r=reply as {
        kind?:string;contract?:string;editPermissionFromDb?:boolean;
        lookup?:{rows?:Db00ItemContext[];gameVersion?:string|null};
      };
      if(r?.kind!=='resolved'||
         r.contract!=='wand.db05.db00-visible-item-mapping@1'||
         r.editPermissionFromDb!==false||!Array.isArray(r.lookup?.rows)){
        dbStatus='unavailable';return;
      }
      dbMediaVersion=typeof r.lookup.gameVersion==='string'?r.lookup.gameVersion:null;
      dbMap=new Map(r.lookup.rows.map(row=>[row.itemId,row]));
      dbStatus='ready';
    };
    worker.onmessage=event=>done(event.data);
    worker.onerror=event=>{event.preventDefault();done({kind:'error'});};
    worker.onmessageerror=()=>done({kind:'error'});
    worker.postMessage({command:'resolve-db00-item-ids',base,ids});
  }
  async function matchPublicDb03(){
    cancel();result=null;
    db03Summary=null;db03State='idle';
    const save=savedSlotsFile;
    if(!save||activeFile!==save||
       save.size<1||save.size>MAX_BYTES){
      db03State='error';return;
    }
    const format:'auto'|'json'=save.name.toLowerCase().endsWith('.json')
      ?'json':'auto';
    const request=revision;
    db03State='reading';processing=true;
    let bytes:Uint8Array|null=null;
    let worker:Worker|null=null;
    try{
      bytes=new Uint8Array(await save.arrayBuffer());
      if(request!==revision)return;
      worker=new Worker(
        new URL('./save-amount-preview.worker.ts',import.meta.url),
        {type:'module'}
      );
      active=worker;
      const own=worker;
      const finish=(response:unknown)=>{
        if(request!==revision||active!==own)return;
        own.terminate();active=null;processing=false;
        const r=response as {kind?:string;receipt?:Db03MissionSummary};
        if(r?.kind!=='db03'||
           r.receipt?.contract!=='wand.db05.db03-mission-slot-summary@1'||
           r.receipt.indexMetadataValidated!==true||
           r.receipt.originalGameSourceBytesRehashed!==false||
           r.receipt.questProgressVerified!==false||
           r.receipt.questCompletionVerified!==false||
           r.receipt.entitlementVerified!==false||
           r.receipt.saveWritingAuthorized!==false){
          db03State='error';return;
        }
        db03Summary=r.receipt;db03State='ready';
      };
      worker.onmessage=event=>finish(event.data);
      worker.onerror=event=>{event.preventDefault();finish({kind:'error'});};
      worker.onmessageerror=()=>finish({kind:'error'});
      worker.postMessage({
        command:'inspect-db03-mission-slots',format,bytes,base
      },[bytes.buffer]);
      bytes=null;
    }catch{
      if(request===revision){
        worker?.terminate();active=null;processing=false;
        db03State='error';
      }
    }finally{
      if(bytes?.byteLength)bytes.fill(0);
    }
  }

  async function matchLocalDb04(){
    cancel();result=null;
    db04State='idle';db04Match=null;db04ObjectSources=[];
    const save=savedSlotsFile;
    const source=db04Input?.files?.[0];
    if(!save||activeFile!==save ||
       !source||source.size<1||source.size>64*1024*1024||
       save.size<1||save.size>MAX_BYTES){
      db04State='error';return;
    }
    const format:'auto'|'json'=save.name.toLowerCase().endsWith('.json')
      ?'json':'auto';
    db04State='reading';processing=true;
    let bytes:Uint8Array|null=null;
    let graph:Uint8Array|null=null;
    let worker:Worker|null=null;
    const request=revision;
    try{
      [bytes,graph]=await Promise.all([
        save.arrayBuffer().then(buf=>new Uint8Array(buf)),
        source.arrayBuffer().then(buf=>new Uint8Array(buf))
      ]);
      if(request!==revision)return;
      worker=new Worker(
        new URL('./save-amount-preview.worker.ts',import.meta.url),
        {type:'module'}
      );
      active=worker;
      const own=worker;
      const finish=(response:unknown)=>{
        if(request!==revision||active!==own)return;
        own.terminate();active=null;processing=false;
        const r=response as {
          kind?:string;receipt?:Db04GridMatch;
          sources?:Db04ObjectSourceReceipt
        };
        if(r?.kind!=='db04'||r.receipt?.contract!==
           'wand.db05.db04-grid-path-match@2'||
           r.receipt.sourceCoverageComplete!==false||
           r.receipt.sourceOriginalArchiveRechecked!==false||
           r.receipt.saveGridNumericIdUsedAsNativeKey!==false||
           r.receipt.diffIdentityVerified!==false||
           r.receipt.saveWritingAuthorized!==false||
           r.sources?.contract!==
             'wand.db05.db04-grid-object-source-context@2'||
           r.sources.savedGridIdentityVerified!==false||
           r.sources.savedSourceCoordinateEquivalenceVerified!==false||
           r.sources.worldCoordinateTransformVerified!==false||
           r.sources.placementLegalityVerified!==false||
           r.sources.editPermissionAuthorized!==false||
           !Array.isArray(r.sources.rows)){

          db04State='error';return;
        }
        db04Match=r.receipt;
        db04ObjectSources=r.sources.rows;
        db04State='verified';
      };
      worker.onmessage=event=>finish(event.data);
      worker.onerror=event=>{event.preventDefault();finish({kind:'error'});};
      worker.onmessageerror=()=>finish({kind:'error'});
      worker.postMessage({
        command:'inspect-db04-grid-paths',format,bytes,graph
      },[bytes.buffer,graph.buffer]);
      bytes=null;graph=null;
    }catch{
      if(request===revision){
        worker?.terminate();active=null;processing=false;
        db04State='error';
      }
    }finally{
      if(bytes?.byteLength)bytes.fill(0);
      if(graph?.byteLength)graph.fill(0);
    }
  }

  async function loadGridInstances(){
    // Reinspect the same immutable File without silently dropping drafts.
    // Rust rechecks every local ordinal/identity against source at export.
    cancel();result=null;coordinateSelection=null;
    orientationSelection=null;
    gridInstances=[];instanceStatus='not_observed';instanceSampled=false;
    instanceState='idle';
    const save=savedSlotsFile;
    if(!save||activeFile!==save||
       save.size<1||save.size>MAX_BYTES){
      instanceState='error';return;
    }
    const format:'auto'|'json'=save.name.toLowerCase().endsWith('.json')
      ?'json':'auto';
    const request=revision;
    instanceState='reading';processing=true;
    let bytes:Uint8Array|null=null;
    let worker:Worker|null=null;
    try{
      bytes=new Uint8Array(await save.arrayBuffer());
      if(request!==revision)return;
      worker=new Worker(
        new URL('./save-amount-preview.worker.ts',import.meta.url),
        {type:'module'}
      );
      active=worker;
      const own=worker;
      const finish=(message:unknown)=>{
        if(request!==revision||active!==own)return;
        own.terminate();active=null;processing=false;
        const r=message as {kind?:string;receipt?:GridInstancesReceipt};
        const receipt=r?.receipt;
        if(r?.kind!=='grid-instances'||
           receipt?.contract!=='wand.db05.grid-instance-preview@2'||
           receipt.sourceGridIdentityVerified!==false||
           receipt.effectivePlacementVerified!==false||
           receipt.legalPlacementVerified!==false||
           receipt.stableInstanceIdentityVerified!==false||
           receipt.saveWritingAuthorized!==false||
           !Array.isArray(receipt.rows)){
          instanceState='error';return;
        }
        gridInstances=receipt.rows;
        instanceStatus=receipt.status;
        instanceSampled=receipt.sampled;
        instanceState='ready';
      };
      worker.onmessage=event=>finish(event.data);
      worker.onerror=event=>{event.preventDefault();finish({kind:'error'});};
      worker.onmessageerror=()=>finish({kind:'error'});
      worker.postMessage({command:'inspect-grid-instances',format,bytes},
        [bytes.buffer]);
      bytes=null;
    }catch{
      if(request===revision){
        worker?.terminate();active=null;processing=false;
        instanceState='error';
      }
    }finally{
      if(bytes?.byteLength)bytes.fill(0);
    }
  }

  async function validateCoordinateEdit(
    batchMode:boolean=false,transformMode:boolean=false,
    mixedMode:boolean=false,combinedMode:boolean=false,
    quantityMode:boolean=false
  ){
    cancel();result=null;
    const file=savedSlotsFile;
    const plan=transformMode
      ?selectedTransformPlan():selectedCoordinatePlan();
    const edits=batchMode
      ?coordinateQueue.map(p=>({...p}))
      :quantityMode?gridEditsForQuantityExport(coordinateQueue,mixedQueue)
      :combinedMode?combineSavedGridQueues(coordinateQueue,mixedQueue)
      :mixedMode?mixedQueue.map(p=>({...p})):null;
    const amountEdits=quantityMode
      ?queuedEdits.map(p=>({...p,target:{...p.target}})):null;
    if(!file||activeFile!==file||
       (batchMode||mixedMode||combinedMode||quantityMode
          ?(!edits||!edits.length||edits.length>16||
            (quantityMode&&(!amountEdits||!amountEdits.length||
              amountEdits.length>16))):!plan)||
       file.size<1||file.size>MAX_BYTES){
      coordinateState='error';return;
    }
    const format:'json'|'auto'=file.name.toLowerCase().endsWith('.json')
      ?'json':'auto';
    const signature=quantityMode
      ?JSON.stringify({gridEdits:edits,quantityEdits:amountEdits})
      :JSON.stringify(batchMode||mixedMode||combinedMode?edits:plan),
      request=revision;
    coordinateState='checking';processing=true;
    let bytes:Uint8Array|null=null;
    let worker:Worker|null=null;
    try{
      bytes=new Uint8Array(await file.arrayBuffer());
      if(request!==revision)return;
      worker=new Worker(
        new URL('./save-amount-preview.worker.ts',import.meta.url),
        {type:'module'}
      );
      active=worker;const own=worker;
      const finish=(message:unknown)=>{
        if(request!==revision||active!==own)return;
        own.terminate();active=null;processing=false;
        const r=message as {kind?:string;receipt?:Record<string,unknown>};
        if(r?.kind!=='result'||
           (quantityMode
             ? r.receipt?.contract!=='wand.db05.grid-quantity-preview@1'||
               r.receipt.gridChangedCount!==edits?.length||
               r.receipt.amountChangedCount!==amountEdits?.length||
               r.receipt.placementLegalityVerified!==false
             :batchMode
             ? r.receipt?.contract!=='wand.db05.grid-coordinate-batch-preview@1'||
               r.receipt.changedCount!==edits?.length
             : mixedMode||combinedMode
             ? r.receipt?.contract!=='wand.db05.grid-mixed-batch-preview@1'||
               r.receipt.changedCount!==edits?.length||
               r.receipt.placementLegalityVerified!==false
             : transformMode
             ? r.receipt?.contract!=='wand.db05.grid-transform-preview@1'||
               r.receipt.changed!==true||
               r.receipt.placementLegalityVerified!==false
             : r.receipt?.contract!=='wand.db05.grid-coordinate-preview@1'||
               r.receipt.changed!==true)||
           r.receipt?.lexicalBytesPreserved!==true||
           r.receipt?.reopenVerified!==true||
           r.receipt?.writerAuthorized!==false||
           r.receipt?.exportAuthorized!==false){
          coordinateState='error';return;
        }
        coordinateSnapshot=quantityMode
          ? {mode:'quantity-grid',file,format,
             edits:edits as GridMixedPlan[],
             amounts:amountEdits as BatchEdit[],signature}
          :batchMode
          ? {mode:'batch',file,format,
             edits:edits as GridCoordinatePlan[],signature}
          : combinedMode
          ? {mode:'combined',file,format,
             edits:edits as GridMixedPlan[],signature}
          : mixedMode
          ? {mode:'mixed',file,format,
             edits:edits as GridMixedPlan[],signature}
          : transformMode
          ? {mode:'transform',file,format,
             plan:plan as GridTransformPlan,signature}
          : {mode:'single',file,format,
             plan:plan as GridCoordinatePlan,signature};
        coordinateState='validated';
      };
      worker.onmessage=event=>finish(event.data);
      worker.onerror=event=>{event.preventDefault();finish({kind:'error'});};
      worker.onmessageerror=()=>finish({kind:'error'});
      worker.postMessage(quantityMode
        ?{command:'preview-grid-and-quantity-batch',format,bytes,
          gridEdits:edits,quantityEdits:amountEdits}
        :batchMode
        ?{command:'preview-grid-coordinate-batch',format,bytes,edits}
        :mixedMode||combinedMode
        ?{command:'preview-grid-mixed-batch',format,bytes,edits}
        :transformMode
        ?{command:'preview-grid-transform',format,bytes,edit:plan}
        :{command:'preview-grid-coordinates',format,bytes,edit:plan},
        [bytes.buffer]);
      bytes=null;
    }catch{
      if(request===revision){
        worker?.terminate();active=null;processing=false;
        coordinateState='error';
      }
    }finally{
      if(bytes?.byteLength)bytes.fill(0);
    }
  }

  async function exportCoordinateCopy(){
    if(processing||coordinateState!=='validated'||
       !coordinateSnapshot)return;
    const saved=coordinateSnapshot;
    const plan=saved.mode==='transform'
      ?selectedTransformPlan():selectedCoordinatePlan();
    if((saved.mode==='quantity-grid'
        ?JSON.stringify({
          gridEdits:gridEditsForQuantityExport(coordinateQueue,mixedQueue),
          quantityEdits:queuedEdits
        })!==saved.signature
        :saved.mode==='batch'
        ?JSON.stringify(coordinateQueue)!==saved.signature
        :saved.mode==='combined'
        ?JSON.stringify(combineSavedGridQueues(coordinateQueue,mixedQueue))!==
          saved.signature
        :saved.mode==='mixed'
        ?JSON.stringify(mixedQueue)!==saved.signature
        :!plan||JSON.stringify(plan)!==saved.signature)||
       activeFile!==saved.file||
       savedSlotsFile!==saved.file){
      invalidateCoordinateEdit();coordinateState='error';return;
    }
    if(!window.confirm(
      '座標を変更したセーブのコピーを作成します。ゲームでの配置動作は未検証です。元のセーブをバックアップしてテストしてください。'
    ))return;
    discardCoordinateCopy();discardDownload();
    revision++;const request=revision;
    coordinateState='exporting';processing=true;
    let bytes:Uint8Array|null=null;
    let worker:Worker|null=null;
    try{
      bytes=new Uint8Array(await saved.file.arrayBuffer());
      if(request!==revision)return;
      worker=new Worker(
        new URL('./save-amount-preview.worker.ts',import.meta.url),
        {type:'module'}
      );
      active=worker;const own=worker;
      const finish=(message:unknown)=>{
        if(request!==revision||active!==own)return;
        own.terminate();active=null;processing=false;
        const r=message as {
          kind?:string;bytes?:Uint8Array;receipt?:Record<string,unknown>
        };
        const good=r?.kind==='copy'&&r.bytes instanceof Uint8Array&&
          r.bytes.byteLength>0&&r.bytes.byteLength<=32*1024*1024&&
          r.receipt?.contract==='wand.db05.experimental-copy@1'&&
          r.receipt.copyBytes===r.bytes.byteLength&&
          r.receipt.originalUnchanged===true&&
          r.receipt.productionWriterAuthorized===false&&
          r.receipt.independentReopenVerified===true&&
          r.receipt.experimentalCopyOnly===true;
        if(!good){
          if(r?.bytes instanceof Uint8Array&&r.bytes.byteLength)
            r.bytes.fill(0);
          coordinateState='error';coordinateSnapshot=null;return;
        }
        const payload=r.bytes as Uint8Array;
        try{
          coordinateCopyBlob=new Blob(
            [payload.buffer as ArrayBuffer],{type:'application/octet-stream'});
          coordinateCopyUrl=URL.createObjectURL(coordinateCopyBlob);
          payload.fill(0);
          coordinateCopyName=copiedName(saved.file.name);
          coordinateState='validated';
        }catch{
          payload.fill(0);discardCoordinateCopy();
          coordinateState='error';coordinateSnapshot=null;
        }
      };
      worker.onmessage=event=>finish(event.data);
      worker.onerror=event=>{event.preventDefault();finish({kind:'error'});};
      worker.onmessageerror=()=>finish({kind:'error'});
      worker.postMessage(saved.mode==='quantity-grid'
        ?{command:'export-grid-and-quantity-batch-copy',
          format:saved.format,allowExperimentalCopy:true,
          bytes,gridEdits:saved.edits,quantityEdits:saved.amounts}
        :saved.mode==='batch'
        ?{command:'export-grid-coordinate-batch-copy',
          format:saved.format,allowExperimentalCopy:true,
          bytes,edits:saved.edits}
        :saved.mode==='mixed'||saved.mode==='combined'
        ?{command:'export-grid-mixed-batch-copy',
          format:saved.format,allowExperimentalCopy:true,
          bytes,edits:saved.edits}
        :saved.mode==='transform'
        ?{command:'export-grid-transform-copy',
          format:saved.format,allowExperimentalCopy:true,
          bytes,edit:saved.plan}
        :{command:'export-grid-coordinate-copy',
          format:saved.format,allowExperimentalCopy:true,
          bytes,edit:saved.plan},[bytes.buffer]);
      bytes=null;
    }catch{
      if(request===revision){
        worker?.terminate();active=null;processing=false;
        coordinateState='error';coordinateSnapshot=null;
        discardCoordinateCopy();
      }
    }finally{
      if(bytes?.byteLength)bytes.fill(0);
    }
  }

  async function validateOrientationEdit(){
    const plan=selectedOrientationPlan();
    cancel();result=null;
    const file=savedSlotsFile;
    if(!file||activeFile!==file||!plan||
       file.size<1||file.size>MAX_BYTES){
      orientationState='error';return;
    }
    const format:'json'|'auto'=file.name.toLowerCase().endsWith('.json')
      ?'json':'auto';
    const signature=JSON.stringify(plan),request=revision;
    orientationState='checking';processing=true;
    let bytes:Uint8Array|null=null;
    let worker:Worker|null=null;
    try{
      bytes=new Uint8Array(await file.arrayBuffer());
      if(request!==revision)return;
      worker=new Worker(
        new URL('./save-amount-preview.worker.ts',import.meta.url),
        {type:'module'}
      );
      active=worker;const own=worker;
      const finish=(message:unknown)=>{
        if(request!==revision||active!==own)return;
        own.terminate();active=null;processing=false;
        const r=message as {kind?:string;receipt?:Record<string,unknown>};
        if(r?.kind!=='result'||
           r.receipt?.contract!=='wand.db05.grid-orientation-preview@1'||
           r.receipt?.changed!==true||
           r.receipt?.lexicalBytesPreserved!==true||
           r.receipt?.reopenVerified!==true||
           r.receipt?.writerAuthorized!==false||
           r.receipt?.exportAuthorized!==false||
           r.receipt?.placementLegalityVerified!==false){
          orientationState='error';return;
        }
        orientationSnapshot={file,format,plan,signature};
        orientationState='validated';
      };
      worker.onmessage=event=>finish(event.data);
      worker.onerror=event=>{event.preventDefault();finish({kind:'error'});};
      worker.onmessageerror=()=>finish({kind:'error'});
      worker.postMessage({
        command:'preview-grid-orientation',format,bytes,edit:plan
      },[bytes.buffer]);
      bytes=null;
    }catch{
      if(request===revision){
        worker?.terminate();active=null;processing=false;
        orientationState='error';
      }
    }finally{
      if(bytes?.byteLength)bytes.fill(0);
    }
  }

  async function exportOrientationCopy(){
    if(processing||orientationState!=='validated'||!orientationSnapshot)return;
    const saved=orientationSnapshot,plan=selectedOrientationPlan();
    if(!plan||JSON.stringify(plan)!==saved.signature||
       activeFile!==saved.file||
       savedSlotsFile!==saved.file){
      invalidateOrientationEdit();orientationState='error';return;
    }
    if(!window.confirm(
      '向きを変更したセーブのコピーを作成します。ゲーム内での配置可否は未検証です。元のセーブをバックアップし、テスト用として使用してください。'
    ))return;
    discardOrientationCopy();discardDownload();
    revision++;const request=revision;
    orientationState='exporting';processing=true;
    let bytes:Uint8Array|null=null;
    let worker:Worker|null=null;
    try{
      bytes=new Uint8Array(await saved.file.arrayBuffer());
      if(request!==revision)return;
      worker=new Worker(
        new URL('./save-amount-preview.worker.ts',import.meta.url),
        {type:'module'}
      );
      active=worker;const own=worker;
      const finish=(message:unknown)=>{
        if(request!==revision||active!==own)return;
        own.terminate();active=null;processing=false;
        const r=message as {
          kind?:string;bytes?:Uint8Array;receipt?:Record<string,unknown>
        };
        const good=r?.kind==='copy'&&r.bytes instanceof Uint8Array&&
          r.bytes.byteLength>0&&r.bytes.byteLength<=32*1024*1024&&
          r.receipt?.contract==='wand.db05.experimental-copy@1'&&
          r.receipt.copyBytes===r.bytes.byteLength&&
          r.receipt.originalUnchanged===true&&
          r.receipt.productionWriterAuthorized===false&&
          r.receipt.independentReopenVerified===true&&
          r.receipt.experimentalCopyOnly===true;
        if(!good){
          if(r?.bytes instanceof Uint8Array&&r.bytes.byteLength)
            r.bytes.fill(0);
          orientationState='error';orientationSnapshot=null;return;
        }
        const payload=r.bytes as Uint8Array;
        try{
          orientationCopyUrl=URL.createObjectURL(
            new Blob([payload.buffer as ArrayBuffer],
              {type:'application/octet-stream'})
          );
          payload.fill(0);
          orientationCopyName=copiedName(saved.file.name);
          orientationState='validated';
        }catch{
          payload.fill(0);discardOrientationCopy();
          orientationState='error';orientationSnapshot=null;
        }
      };
      worker.onmessage=event=>finish(event.data);
      worker.onerror=event=>{event.preventDefault();finish({kind:'error'});};
      worker.onmessageerror=()=>finish({kind:'error'});
      worker.postMessage({
        command:'export-grid-orientation-copy',
        format:saved.format,allowExperimentalCopy:true,
        bytes,edit:saved.plan
      },[bytes.buffer]);
      bytes=null;
    }catch{
      if(request===revision){
        worker?.terminate();active=null;processing=false;
        orientationState='error';orientationSnapshot=null;
        discardOrientationCopy();
      }
    }finally{
      if(bytes?.byteLength)bytes.fill(0);
    }
  }

  async function loadSavedSlots(){
    cancel();result=null;
    const file=activeFile;
    if(!file||file.size<1||file.size>MAX_BYTES){
      slotState='error';return;
    }
    const name=file.name.toLocaleLowerCase();
    const format=name.endsWith('.json')?'json':
      /\.(profile|dat|bin)$/.test(name)?'auto':null;
    if(!format){slotState='error';return;}
    slotState='loading';
    slotCategoryFilter='all';
    slotVisibleLimit=SAVE_LIST_WINDOW_SIZE;
    worldVisibleLimit=SAVE_LIST_WINDOW_SIZE;
    savedSlots=[];savedSlotsFile=null;
    gridInstances=[];instanceState='idle';instanceQuery='';
    gridVisibleLimit=SAVE_LIST_WINDOW_SIZE;
    // Only selecting/closing a different File clears queues (adoptSharedSave).
    // Refreshing a list must not discard already staged Grid coordinates.
    coordinateSelection=null;orientationSelection=null;
    let bytes:Uint8Array|null=null;
    let worker:Worker|null=null;
    const request=revision;
    processing=true;
    try{
      bytes=new Uint8Array(await file.arrayBuffer());
      if(request!==revision)return;
      worker=new Worker(
        new URL('./save-amount-preview.worker.ts',import.meta.url),
        {type:'module'}
      );
      active=worker;
      const ownedWorker=worker;
      const finish=(reply:unknown)=>{
        if(request!==revision||active!==ownedWorker)return;
        ownedWorker.terminate();active=null;processing=false;
        const r=reply as {
          kind?:string;contract?:string;complete?:boolean;
          writerAuthorized?:boolean;rows?:EditableSlot[];
          grid?:{contract?:string;status?:typeof worldStatus;
            entries?:SavedGridItemReference[];
            removedObjectMarkers?:number;
            playerPlacementVerified?:boolean;
            effectivePlacedCountVerified?:boolean;
            worldSourceMatched?:boolean;
            saveWritingAuthorized?:boolean};
        };
        if(r?.kind!=='slots'||r.contract!=='wand.db05.editable-slots@1'||
           r.complete!==true||r.writerAuthorized!==false||
           !Array.isArray(r.rows)||
           r.grid?.contract!=='wand.db05.saved-grid-item-refs@2'||
           r.grid.playerPlacementVerified!==false||
           r.grid.effectivePlacedCountVerified!==false||
           r.grid.worldSourceMatched!==false||
           r.grid.saveWritingAuthorized!==false||
           !['not_observed','incompatible_structure','partial_inconclusive',
             'observed_no_item_refs','saved_item_refs'].includes(
               String(r.grid.status))||
           !Array.isArray(r.grid.entries)||
           !Number.isSafeInteger(r.grid.removedObjectMarkers)||
           r.grid.removedObjectMarkers! < 0){
          slotState='error';return;
        }
        savedSlots=r.rows;savedSlotsFile=file;slotState='ready';
        worldRefs=r.grid.entries;worldStatus=r.grid.status!;
        removedGridMarkers=r.grid.removedObjectMarkers!;
        beginCatalogLookup(r.rows,file,worldRefs);
      };
      worker.onmessage=event=>finish(event.data);
      worker.onerror=event=>{event.preventDefault();finish({kind:'error'});};
      worker.onmessageerror=()=>finish({kind:'error'});
      worker.postMessage(
        {command:'inspect-existing-slots',format,bytes},[bytes.buffer]
      );
      bytes=null;
    }catch{
      if(request===revision){
        worker?.terminate();active=null;processing=false;
        slotState='error';
      }
    }finally{
      if(bytes?.byteLength)bytes.fill(0);
    }
  }
  function uint32(x:string):number|null{
    if(!/^(?:0|[1-9][0-9]*)$/.test(x))return null;
    const n=Number(x);
    return Number.isSafeInteger(n)&&n>0&&n<=0xffffffff?n:null;
  }
  function identity(x:string):boolean{
    return /^[0-9]{1,20}$/.test(x)&&BigInt(x)>0n&&BigInt(x)<=BigInt('18446744073709551615');
  }
  function queueFilteredAmountChanges():void{
    if(developmentMode||processing||!activeFile||savedSlotsFile!==activeFile||
       slotState!=='ready')return;
    const plan=planFilteredOwnedAmounts(matchedSlots,queuedEdits,bulkAmountValue);
    bulkAmountStatus='';bulkAmountError='';
    if(plan.status!=='ready'){
      bulkAmountError=plan.status==='invalid-quantity'
        ?'数量は1～4294967295の整数で指定してください。'
        :plan.status==='too-many'
        ?`対象が多すぎます（追加${plan.eligible}件・空き${plan.remaining}件）。検索や分類で絞り込んでください。`
        :plan.status==='stale'||plan.status==='duplicate'
        ?'対象の元データが一致しません。セーブを再読み込みしてください。'
        :'新たに変更するアイテムがありません。';
      return;
    }
    if(!window.confirm(
      `検索結果${matchedSlots.length}件のうち、${plan.added.length}件を×${bulkAmountValue}に変更予約します。元のセーブは変更されません。続けますか？`
    ))return;
    // Never stage a truncated first page, replace queued edits or exceed
    // the native Rust batch limit. Export remains independently validated.
    cancel();result=null;
    queuedEdits=[...queuedEdits,...plan.added.map(edit=>({
      target:{...edit.target},expected:edit.expected,
      replacement:edit.replacement
    }))];
    amountRevisionIndex=null;amountEditorReady=false;amountSource='saved';
    bulkAmountStatus=`${plan.added.length}件を変更予約しました。`+
      (plan.alreadyQueued>0?` 登録済み${plan.alreadyQueued}件は維持しました。`:'');
  }
  function queueCurrentEdit(){
    cancel();result=null;
    const old=uint32(expected),next=uint32(replacement);
    const candidate=parameters().target;
    const valid=candidate.kind==='inventory'
      ? identity(candidate.inventoryId)&&identity(candidate.itemId)
      : identity(candidate.containerId)&&uint32(String(candidate.itemId))!==null&&
        Number.isInteger(candidate.slotIndex)&&candidate.slotIndex>=0&&
        candidate.slotIndex<=1000000;
    if(old===null||next===null||old===next||!valid||
       queuedEdits.length>=16||
       queuedEdits.some(e=>JSON.stringify(e.target)===JSON.stringify(candidate))){
      result='error';return;
    }
    queuedEdits=[...queuedEdits,{target:candidate,expected:old,replacement:next}];
    amountRevisionIndex=null;
  }
  function updateQueuedAmountRevision(){
    if(processing||amountRevisionIndex===null)return;
    const index=amountRevisionIndex,previous=queuedEdits[index];
    const old=uint32(expected),next=uint32(replacement);
    const target=parameters().target;
    const valid=target.kind==='inventory'
      ?identity(target.inventoryId)&&identity(target.itemId)
      :identity(target.containerId)&&uint32(String(target.itemId))!==null&&
        Number.isInteger(target.slotIndex)&&target.slotIndex>=0&&
        target.slotIndex<=1000000;
    if(!previous||old===null||next===null||old===next||!valid||
       previous.expected!==old||!sameAmountTarget(previous.target,target)){
      // The draft remains untouched on invalid inputs. Never silently edit
      // another saved slot or change the optimistic original Amount.
      result='error';return;
    }
    cancel();result=null;
    queuedEdits=queuedEdits.map((edit,i)=>i===index
      ?{target:{...edit.target},expected:edit.expected,replacement:next}
      :edit);
  }
  function removeQueued(index:number){
    cancel();result=null;
    queuedEdits=queuedEdits.filter((_,i)=>i!==index);
    if(amountRevisionIndex===index)amountRevisionIndex=null;
    else if(amountRevisionIndex!==null&&amountRevisionIndex>index)
      amountRevisionIndex--;
  }
  function batchSignature():string{return JSON.stringify(queuedEdits);}

  async function preview(batchMode:boolean=false){
    cancel();
    result=null;
    const file=activeFile;
    const old=uint32(expected),next=uint32(replacement);
    if(!file||!file.size||file.size>MAX_BYTES||
      (batchMode
        ? queuedEdits.length===0||queuedEdits.length>16
        : old===null||next===null||
          (kind==='inventory'
            ? !identity(inventoryId)||!identity(itemId)
            : !identity(containerId)||!uint32(chestItemId)||
              !/^(?:0|[1-9][0-9]*)$/.test(slotIndex)||
              Number(slotIndex)>1000000))){
      result='error';
      return;
    }
    const lower=file.name.toLowerCase();
    const format=lower.endsWith('.json')?'json':
      /\.(profile|dat|bin)$/.test(lower)?'auto':null;
    if(!format){result='error';return;}
    const params=parameters();
    const request=revision;
    processing=true;
    let bytes:Uint8Array|null=null;
    let worker:Worker|null=null;
    try{
      bytes=new Uint8Array(await file.arrayBuffer());
      if(request!==revision)return;
      worker=new Worker(
        new URL('./save-amount-preview.worker.ts',import.meta.url),
        {type:'module'}
      );
      active=worker;
      const activeWorker=worker;
      const finish=(response:unknown)=>{
        if(request!==revision||active!==activeWorker)return;
        activeWorker.terminate();
        active=null;
        processing=false;
        const r=response as {kind?:string;receipt?:Record<string,unknown>};
        const good=r?.kind==='result'&&
          r.receipt?.writerAuthorized===false&&
          r.receipt?.exportAuthorized===false&&
          r.receipt?.lexicalBytesPreserved===true&&
          (batchMode
            ? r.receipt?.contract==='wand.db05.batch-preview@1'&&
              r.receipt.reopenVerified===true&&
              r.receipt.changedCount===queuedEdits.length
            : r.receipt?.contract==='wand.db05.amount-preview@1'&&
              typeof r.receipt.changed==='boolean');
        if(!good){result='error';return;}
        result=batchMode||r.receipt?.changed?'changed':'unchanged';
        if(result==='changed'){
          snapshot=batchMode
            ? {mode:'batch',file,format:params.format,
               edits:queuedEdits.map(x=>({...x,target:{...x.target}})),
               signature:batchSignature()}
            : {mode:'single',file,format:params.format,target:params.target,
               expected:old!,replacement:next!,signature:params.signature};
        }
      };
      worker.onmessage=event=>finish(event.data);
      worker.onerror=event=>{event.preventDefault();finish({kind:'error'});};
      worker.onmessageerror=()=>finish({kind:'error'});
      worker.postMessage(batchMode
        ? {command:'preview-batch-amounts',format,bytes,
           edits:queuedEdits.map(x=>({...x,target:{...x.target}}))}
        : {command:'preview-existing-amount',format,bytes,
           target:params.target,expected:old,replacement:next},
        [bytes.buffer]);
      bytes=null;
    }catch{
      if(request===revision){
        worker?.terminate();
        active=null;
        result='error';
        processing=false;
      }
    }finally{
      if(bytes&&bytes.byteLength)bytes.fill(0);
    }
  }

  /** One-time explicit user request. Re-read the immutable original File and
   * revalidate old quantity and item identity; never reuse an unverified
   * preview result or expose a raw save before the user requests a copy.
   */
  async function makeExperimentalCopy(){
    if(processing||!snapshot||result!=='changed'){
      result='error';return;
    }
    const current=parameters();
    if(activeFile!==snapshot.file||
       (snapshot.mode==='single'
         ? current.signature!==snapshot.signature
         : batchSignature()!==snapshot.signature)){
      snapshot=null;discardDownload();result='error';return;
    }
    if(!window.confirm(
      '編集済みコピーを生成します。ゲームでの読み込みは未検証です。元のセーブをバックアップし、テスト用としてのみ使用してください。'
    ))return;
    // Keep the trusted snapshot, but invalidate any existing download.
    const selected=snapshot;
    discardDownload();
    revision++;
    const request=revision;
    processing=true;
    let bytes:Uint8Array|null=null;
    let worker:Worker|null=null;
    try{
      bytes=new Uint8Array(await selected.file.arrayBuffer());
      if(request!==revision)return;
      worker=new Worker(
        new URL('./save-amount-preview.worker.ts',import.meta.url),
        {type:'module'}
      );
      active=worker;
      const ownedWorker=worker;
      const finish=(message:unknown)=>{
        if(request!==revision||active!==ownedWorker)return;
        ownedWorker.terminate();
        active=null;
        processing=false;
        const r=message as {
          kind?:string;
          bytes?:Uint8Array;
          receipt?:Record<string,unknown>;
        };
        const good=r?.kind==='copy'&&r.bytes instanceof Uint8Array&&
          r.bytes.byteLength>0&&r.bytes.byteLength<=32*1024*1024&&
          r.receipt?.contract==='wand.db05.experimental-copy@1'&&
          r.receipt.copyBytes===r.bytes.byteLength&&
          r.receipt.originalUnchanged===true&&
          r.receipt.productionWriterAuthorized===false&&
          r.receipt.independentReopenVerified===true&&
          r.receipt.experimentalCopyOnly===true;
        if(!good){
          if(r?.bytes instanceof Uint8Array&&r.bytes.byteLength)r.bytes.fill(0);
          result='error';snapshot=null;return;
        }
        const payload=r.bytes as Uint8Array;
        try{
          downloadBlob=new Blob(
            [payload.buffer as ArrayBuffer],{type:'application/octet-stream'});
          downloadUrl=URL.createObjectURL(downloadBlob);
          payload.fill(0);
          downloadName=copiedName(selected.file.name);
          exportReady=true;
        }catch{
          payload.fill(0);
          discardDownload();result='error';snapshot=null;
        }
      };
      worker.onmessage=event=>finish(event.data);
      worker.onerror=event=>{event.preventDefault();finish({kind:'error'});};
      worker.onmessageerror=()=>finish({kind:'error'});
      worker.postMessage(selected.mode==='batch'
        ? {command:'export-batch-amount-copy',allowExperimentalCopy:true,
           format:selected.format,bytes,edits:selected.edits}
        : {command:'export-existing-amount-copy',allowExperimentalCopy:true,
           format:selected.format,bytes,target:selected.target,
           expected:selected.expected,replacement:selected.replacement},
        [bytes.buffer]);
      bytes=null;
    }catch{
      if(request===revision){
        worker?.terminate();
        active=null;processing=false;
        result='error';snapshot=null;
        discardDownload();
      }
    }finally{
      if(bytes?.byteLength)bytes.fill(0);
    }
  }
</script>

<svelte:head>
  <title>{developmentMode
    ?'DB-05 セーブ数量編集（テスト用）'
    :'Save Editor'} | Dreamwish Wand</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="dev-preview" class:editor-workspace={!developmentMode}
  class:queued-editor={!developmentMode&&queuedExportMode!=='none'}>
  {#if developmentMode}
    <p class="eyebrow">DEVELOPMENT · DB-05 SAVE</p>
    <h1>セーブ数量編集（テスト用）</h1>
    <p>JSONまたは暗号化P1Gの既存Inventory・Chest数量をRust/WASMで検証できます。ゲーム内の通常所持上限（1個限定・99個制限など）は適用しません。明示的に選んだ場合だけ、原本を上書きしない編集済みコピーを生成します。</p>
  {:else}
    <div class="editor-topbar">
      <h1>Save Editor</h1>
      <span class="editor-beta">テスト版</span>
      <label class="editor-file-picker">
        <span>セーブを選択</span>
        <input type="file" accept=".profile,.dat,.bin,.json"
          aria-label="セーブファイルを選択" disabled={processing}
          on:change={(event)=>{
            const input=event.currentTarget as HTMLInputElement;
            const file=input.files?.[0];
            input.value='';
            if(file){
              selectLocalSaveFile(file);
            }
          }} />
      </label>
    </div>
    <nav class="editor-tabs" aria-label="Save Editorの編集対象">
      <button type="button" class:active={activeEditorPane==='items'}
        aria-pressed={activeEditorPane==='items'}
        on:click={()=>changeEditorPane('items')}>Inventory / Chest</button>
      <button type="button" class:active={activeEditorPane==='world'}
        aria-pressed={activeEditorPane==='world'}
        on:click={()=>changeEditorPane('world')}>配置編集</button>
    </nav>
    {#if queuedExportMode!=='none'}
      <section class="editor-commit-toolbar"
        aria-label="編集済みセーブの出力">
        <strong>編集内容：数量{queuedEdits.length}件・配置{queuedGridCount}件</strong>
        <button type="button" class="secondary" disabled={processing}
          on:click={discardAllQueuedChanges}>変更をすべて破棄</button>
        {#if queuedExportMode==='conflict'}
          <p role="alert">編集が重複または16件を超えています。登録済みの変更を確認してください。</p>
        {:else}
          <button type="button" disabled={processing||
            !activeFile||savedSlotsFile!==activeFile}
            on:click={validateAllQueuedSave}>すべての変更を検証</button>
          {#if queuedExportVerified}
            <span role="status" class="editor-verified">Rust/WASM検証済み</span>
            <button type="button"
              disabled={processing||!!queuedExportCopyUrl}
              on:click={exportAllQueuedSave}>
              {queuedExportCopyUrl?'コピーを準備しました':'すべての変更をコピーに出力'}
            </button>
          {/if}
          {#if queuedExportCopyUrl}
            <a href={queuedExportCopyUrl}
              download={queuedExportMode==='quantity'
                ?downloadName:coordinateCopyName}
              class="download-link">編集済みコピーをダウンロード</a>
            <button type="button" class="secondary" disabled={processing}
              on:click={openExportedCopyForEditing}>このコピーを続けて編集</button>
          {/if}
          {#if result==='error'||coordinateState==='error'}
            <p role="alert">編集を検証できませんでした。変更内容と元データを確認してください。</p>
          {/if}
        {/if}
      </section>
    {/if}
    {#if !activeFile}
      <p class="editor-empty" role="status">セーブファイルを選択してください。</p>
    {/if}
  {/if}
  {#if developmentMode||(activeEditorPane==='items'&&activeFile)}
  <section class="editor-amount-panel" aria-label="数量変更の検証">
    {#if developmentMode}
      <label>セーブファイル
        <input bind:this={fileInput} type="file" accept=".profile,.dat,.bin,.json"
          aria-label="検証用セーブファイル" disabled={processing}
          on:change={onFileChange} />
      </label>
    {/if}
    {#if activeFile}
      <p class="active-save-file" title={activeFile.name}>{activeFile.name}</p>
    {/if}
    {#if developmentMode||amountEditorReady}
    {#if developmentMode||amountSource==='manual'}
      <label>対象
        <select bind:value={kind} aria-label="対象の種類" disabled={processing}>
          <option value="inventory">Inventory</option>
          <option value="chest">Chest</option>
        </select>
      </label>
      {#if kind==='inventory'}
        <label>Inventory ID <input bind:value={inventoryId} aria-label="Inventory ID" disabled={processing}/></label>
        <label>Item ID <input bind:value={itemId} aria-label="Item ID" disabled={processing}/></label>
      {:else}
        <label>Container ID <input bind:value={containerId} aria-label="Container ID" disabled={processing}/></label>
        <label>Slot index <input bind:value={slotIndex} aria-label="Slot index" disabled={processing}/></label>
        <label>Item ID <input bind:value={chestItemId} aria-label="Chest Item ID" disabled={processing}/></label>
      {/if}
    {:else}
      <div class="selected-amount-item" aria-label="選択中のアイテム">
        {#if selectedAmountMetadata?.match==='current_db00'}
          <VerifiedSaveItemIcon context={selectedAmountMetadata} gameVersion={dbMediaVersion} basePath={base}/>
        {/if}
        <span class="selected-amount-description">
          <strong>{selectedAmountMetadata?.name??selectedAmountItemId}</strong>
          <small>{selectedAmountLocation}</small>
        </span>
        <button type="button" class="secondary" disabled={processing}
          on:click={startManualAmountEntry}>IDで指定</button>
      </div>
    {/if}
    <label>現在の数量
      <input bind:value={expected} aria-label="現在の数量" disabled={processing}
        readonly={!developmentMode&&amountSource==='saved'}/>
    </label>
    <label>変更後の数量
      <input bind:value={replacement} aria-label="変更後の数量"
        inputmode="numeric" autocomplete="off" disabled={processing}/>
    </label>
    {#if developmentMode}
      <button type="button" on:click={()=>preview(false)} disabled={processing}>
        {processing?'Rust/WASMで確認中…':'変更を検証'}
      </button>
    {/if}
    <button type="button" class="secondary" on:click={queueCurrentEdit}
      disabled={processing||queuedEdits.length>=16||
        amountRevisionIndex!==null}>複数編集に追加</button>
    {#if amountRevisionIndex!==null}
      <button type="button" class="secondary"
        disabled={processing}
        on:click={updateQueuedAmountRevision}>登録済みの数量を更新</button>
    {/if}
    {#if !developmentMode&&result==='error'}
      <p role="alert">数量を登録できませんでした。入力値を確認してください。</p>
    {/if}
    <button type="button" class="secondary" disabled={processing}
      on:click={closeSelectedSave}>
      {developmentMode?'破棄':'セーブを閉じる'}
    </button>
    {:else}
      <div class="editor-amount-empty">
        <p>一覧からアイテムを選択してください。</p>
        <button type="button" class="secondary"
          disabled={processing}
          on:click={startManualAmountEntry}>IDで指定</button>
      </div>
    {/if}
  </section>
  <section class="saved-slots editor-owned-panel" aria-label="セーブ内アイテム">
    <div class="slot-actions">
      <button type="button" on:click={loadSavedSlots} disabled={processing}>
        {slotState==='loading'?'読み込み中…':slotState==='ready'
          ?'再読み込み':'所持アイテムを表示'}
      </button>
      {#if slotState==='ready'}
        <span role="status">{savedSlots.length}件</span>
        {#if !developmentMode}
          <button type="button" class="secondary"
            disabled={processing} aria-expanded={bulkAmountOpen}
            on:click={()=>{
              bulkAmountOpen=!bulkAmountOpen;
              bulkAmountError='';bulkAmountStatus='';
            }}>まとめて数量変更</button>
        {/if}
      {:else if slotState==='error'}
        <span role="alert">所持アイテムを読み込めませんでした。</span>
      {/if}
    </div>
    {#if slotState==='ready'}
      <div class="slot-search">
        <input bind:value={slotQuery} aria-label="所持アイテム検索"
          on:input={()=>{
            slotVisibleLimit=SAVE_LIST_WINDOW_SIZE;
            bulkAmountError='';bulkAmountStatus='';
          }}
          placeholder="アイテム名・Item IDを検索" />
        <select bind:value={slotFilter} aria-label="所持アイテム分類"
          on:change={()=>{
            slotVisibleLimit=SAVE_LIST_WINDOW_SIZE;
            bulkAmountError='';bulkAmountStatus='';
          }}>
          <option value="all">すべて</option>
          <option value="inventory">Inventory</option>
          <option value="chest">Chest</option>
        </select>
        {#if dbStatus==='ready'}
          <select bind:value={slotCategoryFilter} aria-label="共通DB分類"
            on:change={()=>{
            slotVisibleLimit=SAVE_LIST_WINDOW_SIZE;
            bulkAmountError='';bulkAmountStatus='';
          }}>
            <option value="all">全分類</option>
            {#each slotCategories as category}
              <option value={category.value}>{category.label}（{category.count}）</option>
            {/each}
          </select>
        {/if}
      </div>
      {#if !developmentMode&&bulkAmountOpen}
        <div class="slot-bulk-editor" role="group" aria-label="検索結果の数量変更">
          <label>一括設定する数量
            <input bind:value={bulkAmountValue}
              aria-label="一括設定する数量" inputmode="numeric"
              autocomplete="off" disabled={processing}/>
          </label>
          <button type="button"
            disabled={processing||matchedSlots.length===0}
            on:click={queueFilteredAmountChanges}>検索結果を変更予約</button>
          <small>対象{matchedSlots.length}件 · 登録済み{queuedEdits.length}件 / 最大{
            MAX_OWNED_AMOUNT_BATCH}件</small>
          {#if bulkAmountError}
            <p role="alert">{bulkAmountError}</p>
          {:else if bulkAmountStatus}
            <p role="status">{bulkAmountStatus}</p>
          {/if}
        </div>
      {/if}
      <ul class="slot-list" on:scroll={(event)=>{
        slotVisibleLimit=nextSaveListWindowLimit(
          slotVisibleLimit,matchedSlots.length,event.currentTarget);
      }}>
        {#each visibleSlots as slot}
          {@const pending=pendingOwnedAmount(slot,queuedEdits)}
          {@const meta=dbMap.get(String(slot.itemId))}
          <li>
            <button type="button" class="slot-select" class:queued={pending!==null}
              disabled={processing}
              aria-label={`所持アイテム ${String(slot.itemId)} を選択 · ${ownedSlotLocation(slot)}`}
              on:click={()=>selectSavedSlot(slot)}>
              <span class="slot-item-detail">
                {#if meta?.match==='current_db00'}
                  <VerifiedSaveItemIcon context={meta} gameVersion={dbMediaVersion} basePath={base}/>
                {/if}
                <span>
                  <strong>{meta?.name??String(slot.itemId)}</strong>
                  <small>{ownedSlotLocation(slot)} · {
                    meta?.category??meta?.nativeCategory??'分類未確認'}</small>
                </span>
              </span>
              <span class="slot-amount">
                {#if pending!==null}
                  <small class="slot-prior">×{slot.amount} →</small>
                  ×{pending}
                {:else}
                  ×{slot.amount}
                {/if}
              </span>
            </button>
          </li>
        {/each}
      </ul>
      {#if dbStatus==='unavailable'}
        <p class="slot-note">名称を取得できなかったアイテムはItem IDで表示しています。</p>
      {/if}
    {/if}
  </section>
  {/if}
  {#if slotState==='ready'}
    {#if developmentMode}
    <section class="saved-slots" aria-label="クエスト参照">
      <div class="slot-actions">
        <strong>クエストID参照</strong>
        <button type="button" disabled={processing}
          on:click={matchPublicDb03}>
          {db03State==='reading'?'照合中…':'DB-03クエストIDと照合'}
        </button>
      </div>
      {#if db03State==='ready'&&db03Summary}
        <p role="status">保存中のMission ID：{db03Summary.observedMissionSlots}件
          ／DB-03のクエスト定義と一致：{
            db03Summary.matchedPlayableQuestReferences}件</p>
        {#if db03Summary.unresolvedPlayableQuestReferences>0}
          <p>公開Guide索引に未収録：{
            db03Summary.unresolvedPlayableQuestReferences}件</p>
        {/if}
        {#if db03Summary.malformedMissionIds>0||db03Summary.typeIssues>0}
          <p>構造または型が未確認：{
            db03Summary.malformedMissionIds+db03Summary.typeIssues}件</p>
        {/if}
        {#if db03Summary.sampled}
          <p>一部の参照のみ確認しました。</p>
        {/if}
        {#if db03Summary.status==='not_observed'}
          <p>対象のMissionSlotがありません。</p>
        {:else if db03Summary.status==='incompatible_structure'}
          <p>MissionSlotの構造を読み取れません。</p>
        {/if}
        <p class="slot-note">ID定義の照合のみです。クエスト達成・解放条件・進行状況は判定しません。</p>
      {:else if db03State==='error'}
        <p role="alert">クエスト照合に失敗しました。公開Guideデータとセーブ形式を確認してください。</p>
      {/if}
    </section>
    {/if}
    {#if developmentMode||activeEditorPane==='world'}
    <section class="saved-slots" aria-label="ワールド参照">
      {#if developmentMode}
      <div class="slot-actions">
        <strong>ワールドのアイテム参照</strong>
        {#if worldStatus==='saved_item_refs'||worldStatus==='partial_inconclusive'}
          <span role="status">{worldRefs.length}種類</span>
        {/if}
      </div>
      {#if worldStatus==='saved_item_refs'||worldStatus==='partial_inconclusive'}
        <input bind:value={worldQuery} aria-label="ワールド参照検索"
          on:input={()=>worldVisibleLimit=SAVE_LIST_WINDOW_SIZE}
          placeholder="アイテム名・Item IDを検索" />
        <ul class="slot-list" on:scroll={(event)=>{
          worldVisibleLimit=nextSaveListWindowLimit(
            worldVisibleLimit,matchedWorldRefs.length,event.currentTarget);
        }}>
          {#each visibleWorldRefs as row}
            <li class="world-reference-row">
              <span>
                <strong>{dbMap.get(row.itemId)?.name??row.itemId}</strong>
                <small>{dbMap.get(row.itemId)?.category??
                  dbMap.get(row.itemId)?.nativeCategory??'分類未確認'}</small>
              </span>
              <span class="slot-amount">{
                row.fullGridReferences+row.diffModifiedReferences
              }件</span>
            </li>
          {/each}
        </ul>
      {:else if worldStatus==='not_observed'}
        <p class="slot-note">Grid情報はこのセーブにありません。</p>
      {:else if worldStatus==='observed_no_item_refs'}
        <p class="slot-note">保存済みのItem ID参照はありません。</p>
      {:else if worldStatus==='incompatible_structure'}
        <p class="slot-note">Grid構造を読み取れません。</p>
      {/if}
      {#if worldStatus==='partial_inconclusive'}
        <p class="slot-note">未確認の参照があるため一部のみ表示しています。</p>
      {/if}
      {#if removedGridMarkers>0}
        <p class="slot-note">差分Gridの削除マーカー：{
          removedGridMarkers}件（削除されたItem IDや現在の配置数は特定できません）</p>
      {/if}
      <p class="slot-note">保存されたGrid内の参照です。所有数・全配置数・配置可否を示すものではありません。</p>
      {/if}
      <section class="grid-instance-preview" aria-label="配置オブジェクト">
        <div class="slot-actions">
          <button type="button" on:click={loadGridInstances} disabled={processing}>
            {instanceState==='reading'?'配置を読み込み中…':
              instanceState==='ready'?'再読み込み':'配置オブジェクトを表示'}
          </button>
          {#if instanceState==='ready'}
            <span role="status">{gridInstances.length}件</span>
          {/if}
        </div>
        {#if instanceState==='ready'}
          {#if gridInstances.length}
            <input bind:value={instanceQuery} aria-label="配置アイテム検索"
              on:input={()=>gridVisibleLimit=SAVE_LIST_WINDOW_SIZE}
              placeholder="アイテム名・Item IDを検索" />
            <ul class="slot-list" on:scroll={(event)=>{
              gridVisibleLimit=nextSaveListWindowLimit(
                gridVisibleLimit,matchedGridInstances.length,event.currentTarget);
            }}>
              {#each visibleGridInstances as object}
                <li class="world-reference-row">
                  <span>
                    <strong>{dbMap.get(object.itemId)?.name??object.itemId}</strong>
                    <small>#{object.localOrdinal} · {
                      object.recordKind==='full'?'通常Grid':'差分Grid'}
                      · ローカルGrid #{object.localGridOrdinal}</small>
                    {#if db04State==='verified'&&
                      db04ObjectSources[object.localOrdinal-1]}
                      {@const ctx=db04ObjectSources[object.localOrdinal-1]}
                      <small class="slot-note">
                        {#if ctx.sourceStatus==='full_exact_source_path_candidate'}
                          原本Grid参照パス候補
                        {:else if ctx.sourceStatus===
                          'diff_structural_candidate_hash_unverified'}
                          差分Gridの構造候補（ハッシュ未検証）
                        {:else if ctx.sourceStatus==='ambiguous_source_candidates'}
                          原本Grid候補が複数：{ctx.candidateCount}件
                        {:else if ctx.sourceStatus==='not_in_partial_source'}
                          現在の原本DBに該当候補なし
                        {:else}
                          原本Grid参照を確認できません
                        {/if}
                        {#if ctx.nativeSizeX!==null&&ctx.nativeSizeY!==null}
                          · 原本GridData {ctx.nativeSizeX} × {ctx.nativeSizeY}
                          {#if ctx.tessellationFactor!==null}
                            · Tessellation {ctx.tessellationFactor}
                          {/if}
                        {/if}
                        {#if ctx.sourceAnchorEnvelopeWidth!==null&&
                          ctx.sourceAnchorEnvelopeHeight!==null}
                          <small class="slot-note">
                            原本初期アンカー整数範囲
                            0～{ctx.sourceAnchorEnvelopeWidth-1} ×
                            0～{ctx.sourceAnchorEnvelopeHeight-1}：
                            {ctx.savedPositionNumericRelation===
                              'within_source_anchor_numeric_envelope'
                              ?'数値的に範囲内':'数値的に範囲外'}
                            （セーブとの座標系同一性は未確認）
                          </small>
                        {/if}
                      </small>
                    {/if}
                  </span>
                  <span class="slot-amount">
                    {#if object.coordinatesObserved}
                      X {object.x} / Y {object.y}
                      {#if object.orientation} · {object.orientation}{/if}
                    {:else}
                      座標未確認
                    {/if}
                  </span>
                  <button type="button" class="secondary"
                    disabled={processing||!object.coordinatesObserved}
                    aria-label={`配置 #${object.localOrdinal} の座標を編集`}
                    on:click={()=>selectGridInstance(object)}>座標を編集</button>
                  <button type="button" class="secondary"
                    disabled={processing||!object.coordinatesObserved||
                      !isCardinal(object.orientation)}
                    aria-label={`配置 #${object.localOrdinal} の向きを編集`}
                    on:click={()=>selectOrientation(object)}>向きを編集</button>
                </li>
              {/each}
            </ul>
            <GridObjectPositionMap
              rows={gridInstances}
              itemName={(id:string)=>dbMap.get(id)?.name??''}
              selectedOrdinal={coordinateSelection?.localOrdinal??null}
              focusRevision={coordinateFocusRevision}
              draftX={coordinateSelection?coordinateNumber(coordinateX):null}
              draftY={coordinateSelection?coordinateNumber(coordinateY):null}
              disabled={processing}
              queuedOrdinals={coordinateQueue.map(edit=>edit.localOrdinal)}
              mixedQueuedOrdinals={mixedQueue.map(edit=>edit.localOrdinal)}
              stagedMoves={[
                ...coordinateQueue.map(edit=>({
                  localOrdinal:edit.localOrdinal,
                  expectedX:edit.expectedX,expectedY:edit.expectedY,
                  replacementX:edit.replacementX,replacementY:edit.replacementY
                })),
                ...mixedQueue.flatMap(edit=>
                  edit.replacementX!==null&&edit.replacementY!==null
                    ?[{
                      localOrdinal:edit.localOrdinal,
                      expectedX:edit.expectedX,expectedY:edit.expectedY,
                      replacementX:edit.replacementX,
                      replacementY:edit.replacementY
                    }]:[])
              ]}
              onStageGroupMove={queueGroupTranslation}
              onStageGroupRotation={queueGroupRotation}
              onPick={(ordinal:number)=>{
                const row=gridInstances[ordinal-1];
                if(row?.localOrdinal===ordinal)selectGridInstance(row);
              }}
              onDraftMove={(x:number,y:number)=>{
                if(processing||!coordinateSelection)return;
                // This only changes local candidate inputs. Any previously
                // validated copy is invalidated; Rust re-verifies the
                // immutable original before a separate copy can be exported.
                cancel();result=null;
                coordinateX=String(x);coordinateY=String(y);
              }} />
            {#if coordinateSelection}
              <div class="coordinate-editor" aria-label="座標編集">
                <strong>{dbMap.get(coordinateSelection.itemId)?.name??
                  coordinateSelection.itemId} · #{coordinateSelection.localOrdinal}</strong>
                <p class="slot-note">変更前：X {coordinateSelection.x} / Y {
                  coordinateSelection.y}</p>
                <label>新しいX
                  <input bind:value={coordinateX} aria-label="新しいX"
                    disabled={processing} on:input={invalidateCoordinateEdit} />
                </label>
                <label>新しいY
                  <input bind:value={coordinateY} aria-label="新しいY"
                    disabled={processing} on:input={invalidateCoordinateEdit} />
                </label>
                {#if isCardinal(coordinateSelection.orientation)}
                  <label>変更後の向き（座標と同時編集）
                    <select bind:value={coordinateOrientationValue}
                      aria-label="座標と同時変更する向き"
                      disabled={processing} on:change={invalidateCoordinateEdit}>
                      {#each cardinalOptions as direction}
                        <option value={direction}>{
                          direction.replace('GridOrientation_','')}</option>
                      {/each}
                    </select>
                  </label>
                  {#if developmentMode}
                    <button type="button" class="secondary"
                      disabled={processing||!transformReady}
                      on:click={()=>validateCoordinateEdit(false,true)}>
                      位置と向きを同時検証
                    </button>
                  {/if}
                {/if}
                <button type="button" class="secondary"
                  disabled={processing||mixedQueue.length>=16||
                    mixedQueue.some(p=>
                      p.localOrdinal===coordinateSelection?.localOrdinal)}
                  on:click={queueMixedFromCoordinates}>
                  一括配置変更に追加
                </button>
                {#if mixedQueue.some(p=>
                  p.localOrdinal===coordinateSelection?.localOrdinal)}
                  <button type="button" class="secondary"
                    disabled={processing}
                    on:click={updateQueuedMixed}>
                    登録済みの配置変更を更新
                  </button>
                {/if}
                <button type="button" class="secondary"
                  disabled={processing||coordinateQueue.length>=16||
                    coordinateQueue.some(p=>
                      p.localOrdinal===coordinateSelection?.localOrdinal)}
                  on:click={queueCoordinateEdit}>座標編集に追加</button>
                {#if coordinateQueue.some(p=>
                  p.localOrdinal===coordinateSelection?.localOrdinal)}
                  <button type="button" class="secondary"
                    disabled={processing}
                    on:click={updateQueuedCoordinate}>
                    登録済みの座標を更新
                  </button>
                {/if}
                {#if developmentMode}
                <button type="button" disabled={processing}
                  on:click={()=>validateCoordinateEdit(false)}>
                  {coordinateState==='checking'?'座標を検証中…':'座標変更を検証'}
                </button>
                {#if coordinateState==='validated'}
                  <p role="status">{coordinateSnapshot?.mode==='quantity-grid'
                    ? `${coordinateSnapshot.amounts.length}件の数量変更と${coordinateSnapshot.edits.length}件の配置変更をRust/WASMで検証しました。`
                    :coordinateSnapshot?.mode==='batch'
                    ? `${coordinateQueue.length}件の座標変更をRust/WASMで検証しました。`
                    : coordinateSnapshot?.mode==='combined'
                    ? `${coordinateSnapshot.edits.length}件の座標・向き変更をRust/WASMで検証しました。`
                    : coordinateSnapshot?.mode==='mixed'
                    ? `${mixedQueue.length}件の配置変更をRust/WASMで検証しました。`
                    : coordinateSnapshot?.mode==='transform'
                    ? '位置と向きの同時変更をRust/WASMで検証しました。'
                    : '座標変更をRust/WASMで検証しました。'}</p>
                  <button type="button" disabled={processing||!!coordinateCopyUrl}
                    on:click={exportCoordinateCopy}>
                    {coordinateCopyUrl?'座標コピーを準備しました':
                      coordinateSnapshot?.mode==='transform'
                      ?'位置と向きのコピーを生成':'座標変更コピーを生成'}
                  </button>
                  {#if coordinateCopyUrl}
                    <a href={coordinateCopyUrl} download={coordinateCopyName}
                      class="download-link">座標コピーをダウンロード</a>
                  {/if}
                {:else if coordinateState==='error'}
                  <p role="alert">座標を変更できませんでした。
                    選択した配置、元の座標、入力範囲を確認してください。</p>
                {/if}
                {/if}
              </div>
            {/if}
            {#if orientationSelection}
              <div class="orientation-editor" aria-label="向き編集">
                <strong>{dbMap.get(orientationSelection.itemId)?.name??
                  orientationSelection.itemId} · #{orientationSelection.localOrdinal}</strong>
                <p class="slot-note">変更前：{orientationSelection.orientation}</p>
                <label>新しい向き
                  <select bind:value={orientationValue} aria-label="新しい向き"
                    disabled={processing} on:change={invalidateOrientationEdit}>
                    {#each cardinalOptions as direction}
                      <option value={direction}>{direction.replace('GridOrientation_','')}</option>
                    {/each}
                  </select>
                </label>
                <button type="button" class="secondary"
                  disabled={processing||mixedQueue.length>=16||
                    mixedQueue.some(p=>
                      p.localOrdinal===orientationSelection?.localOrdinal)}
                  on:click={queueMixedFromOrientation}>
                  向きを一括配置変更に追加
                </button>
                {#if developmentMode}
                <button type="button"
                  disabled={processing||!isCardinal(orientationSelection.orientation)||
                    !isCardinal(orientationValue)||
                    orientationValue===orientationSelection.orientation}
                  on:click={validateOrientationEdit}>向き変更を検証</button>
                {#if orientationState==='validated'}
                  <p role="status">向き変更をRust/WASMで検証しました。</p>
                  <button type="button" disabled={processing||!!orientationCopyUrl}
                    on:click={exportOrientationCopy}>
                    {orientationCopyUrl?'向きコピーを準備しました':'向き変更コピーを生成'}
                  </button>
                  {#if orientationCopyUrl}
                    <a href={orientationCopyUrl} download={orientationCopyName}
                      class="download-link">向きコピーをダウンロード</a>
                  {/if}
                {:else if orientationState==='error'}
                  <p role="alert">向き変更を検証できませんでした。</p>
                {/if}
                {/if}
                {#if developmentMode}
                <p class="slot-note">原本で確認された上下左右の4方向のみ。
                  斜め方向・衝突判定・実ゲームでの配置可否は未検証です。</p>
                {/if}
              </div>
            {/if}
            {#if coordinateQueue.length}
              <div class="coordinate-batch" aria-label="一括座標編集">
                <div class="slot-actions">
                  <strong>一括座標編集 · {coordinateQueue.length} / 16件</strong>
                  {#if developmentMode}
                  <button type="button" disabled={processing}
                    on:click={()=>validateCoordinateEdit(true)}>
                    {coordinateState==='checking'?'一括検証中…':'一括座標変更を検証'}
                  </button>
                  {/if}
                </div>
                <ul class="slot-list">
                  {#each coordinateQueue as edit}
                    <li class="world-reference-row">
                      <span>#{edit.localOrdinal} · {
                        dbMap.get(edit.itemId)?.name??edit.itemId}</span>
                      <span class="slot-amount">X {edit.expectedX}→{edit.replacementX}
                        / Y {edit.expectedY}→{edit.replacementY}</span>
                      <button type="button" class="secondary" disabled={processing}
                        on:click={()=>beginQueuedCoordinateRevision(edit)}
                        aria-label={`座標編集 #${edit.localOrdinal} を修正`}>修正</button>
                      <button type="button" class="secondary" disabled={processing}
                        on:click={()=>removeCoordinateEdit(edit.localOrdinal)}
                        aria-label={`座標編集 #${edit.localOrdinal} を削除`}>削除</button>
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}
            {#if mixedQueue.length}
              <div class="coordinate-batch" aria-label="一括配置変更">
                <div class="slot-actions">
                  <strong>一括配置変更 · {mixedQueue.length} / 16件</strong>
                  {#if developmentMode}
                  <button type="button" disabled={processing}
                    on:click={()=>validateCoordinateEdit(false,false,true)}>
                    一括配置変更を検証
                  </button>
                  {/if}
                </div>
                <ul class="slot-list">
                  {#each mixedQueue as edit}
                    <li class="world-reference-row">
                      <span>#{edit.localOrdinal} · {
                        dbMap.get(edit.itemId)?.name??edit.itemId}</span>
                      <span class="slot-amount">
                        {#if edit.replacementX!==null&&edit.replacementY!==null}
                          X {edit.expectedX}→{edit.replacementX} /
                          Y {edit.expectedY}→{edit.replacementY}
                        {/if}
                        {#if edit.replacementOrientation}
                          向き {edit.expectedOrientation?.replace('GridOrientation_','')}
                          →{edit.replacementOrientation.replace('GridOrientation_','')}
                        {/if}
                      </span>
                      <button type="button" class="secondary" disabled={processing}
                        aria-label={`配置編集 #${edit.localOrdinal} を修正`}
                        on:click={()=>beginQueuedMixedRevision(edit)}>修正</button>
                      <button type="button" class="secondary" disabled={processing}
                        aria-label={`配置編集 #${edit.localOrdinal} を削除`}
                        on:click={()=>removeMixedEdit(edit.localOrdinal)}>削除</button>
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}
            {#if developmentMode&&coordinateQueue.length>0&&mixedQueue.length>0}
              <div class="coordinate-batch" aria-label="座標と配置の統合編集">
                <div class="slot-actions">
                  <strong>座標＋向きの一括出力</strong>
                  <button type="button"
                    disabled={processing||!combinedGridEdits}
                    on:click={()=>validateCoordinateEdit(false,false,false,true)}>
                    両キューをまとめて検証
                    {#if combinedGridEdits}（{combinedGridEdits.length}件）{/if}
                  </button>
                </div>
                {#if !combinedGridEdits}
                  <small class="slot-note">同じ配置への異なる座標変更が重複しているか、合計が16件を超えています。競合する編集を削除してください。</small>
                {/if}
              </div>
            {/if}
          {:else if instanceStatus==='not_observed'}
            <p class="slot-note">Grid情報はこのセーブにありません。</p>
          {:else if instanceStatus==='incompatible_structure'}
            <p class="slot-note">Grid構造を読み取れません。</p>
          {:else}
            <p class="slot-note">個別のItem ID参照はありません。</p>
          {/if}
          {#if instanceStatus==='partial_inconclusive'||instanceSampled}
            <p class="slot-note">一部のレコードを確認できませんでした。</p>
          {/if}
          {#if developmentMode}
            <p class="slot-note">セーブ内の個別参照と座標です。
              現在の配置数・場所の正当性・オブジェクトの一意性は未検証です。
              座標編集はテスト用です。ゲーム内での移動先の妥当性は未検証です。</p>
          {/if}
        {:else if instanceState==='error'}
          <p role="alert">配置オブジェクトを読み込めませんでした。</p>
        {/if}
      </section>
      {#if developmentMode}
      <div class="db04-path-check">
        <label>DB-04参照データ（ローカル・任意）
          <input bind:this={db04Input} type="file" accept=".json"
            aria-label="DB-04参照データを選択" disabled={processing}
            on:change={()=>{
              cancel();db04State='idle';db04Match=null;db04ObjectSources=[];
            }} />
        </label>
        <button type="button" on:click={matchLocalDb04}
          disabled={processing||!savedSlotsFile}>
          {db04State==='reading'?'照合中…':'DB-04 Gridパスを照合'}
        </button>
      </div>
      {#if db04State==='verified'&&db04Match}
        <div role="status" class="db04-result">
          <p>通常Gridの参照パス一致：{db04Match.matchedFullGrids} /
            {db04Match.observedFullGrids}</p>
          {#if db04Match.notInPartialSourceFullGrids>0}
            <p>DB-04部分データに未収録：{
              db04Match.notInPartialSourceFullGrids}</p>
          {/if}
          {#if db04Match.ambiguousSourceFullGrids>0||
            db04Match.malformedFullGrids>0}
            <p>一意に照合できないGrid：{
              db04Match.ambiguousSourceFullGrids+
              db04Match.malformedFullGrids}</p>
          {/if}
          {#if db04Match.observedDiffGrids>0}
            <p>差分Gridの構造上の候補：{
              db04Match.structuralCandidateDiffGrids} / {
              db04Match.observedDiffGrids}件</p>
            {#if db04Match.notInPartialSourceDiffGrids>0}
              <p>DB-04部分データに未収録の差分Grid：{
                db04Match.notInPartialSourceDiffGrids}件</p>
            {/if}
            {#if db04Match.ambiguousSourceDiffGrids>0}
              <p>複数候補のある差分Grid：{
                db04Match.ambiguousSourceDiffGrids}件</p>
            {/if}
            <p>差分Gridの原本ハッシュ未検証：{
              db04Match.hashUnverifiedDiffGrids}件。
              候補は配置・原本Gridの同一性を証明しません。</p>
          {/if}
          <p class="slot-note">原本のTessellationFactor=2に限り、
            原本初期アンカー範囲とセーブ位置の数値的な内外を比較します。
            座標系の一致や配置可能範囲を証明するものではなく、
            範囲外の編集も制限しません。</p>
          <p class="slot-note">配置オブジェクトの原本GridData寸法は、
            原本の参照候補に付属する情報です。セーブ上の配置範囲・衝突判定・
            編集可否は検証していません。</p>
          <p class="slot-note">DB-04索引との参照パス比較です。
            原本再検証・全配置数・所有権・編集可否の証明ではありません。</p>
        </div>
      {:else if db04State==='error'}
        <p role="alert">DB-04照合に失敗しました。
          検証済みのDB-04参照JSONを選択してください。</p>
      {/if}
      {/if}

    </section>
    {/if}
  {/if}
  {#if queuedEdits.length}
    <section class="batch-edits" aria-label="一括数量変更">
      <p>一括変更 · {queuedEdits.length}件（最大16件）</p>
      <ol>
        {#each queuedEdits as edit,i}
          {@const pendingItemId=String(edit.target.itemId)}
          <li>
            {#if developmentMode}
              {edit.target.kind==='inventory'
                ? `Inventory ${edit.target.inventoryId} / ${edit.target.itemId}`
                : `Chest ${edit.target.containerId} / ${edit.target.slotIndex} / ${edit.target.itemId}`}
              ：{edit.expected} → {edit.replacement}
            {:else}
              <span class="queued-amount-summary">
                <strong>{dbMap.get(pendingItemId)?.name??pendingItemId}</strong>
                <small>{edit.target.kind==='inventory'
                  ? `Inventory ${edit.target.inventoryId}`
                  : `Chest ${edit.target.containerId} / Slot ${edit.target.slotIndex}`}</small>
                <span>×{edit.expected} → ×{edit.replacement}</span>
              </span>
            {/if}
            <button type="button" class="secondary" disabled={processing}
              aria-label={`数量変更${i+1}を修正`}
              on:click={()=>beginQueuedAmountRevision(i)}>修正</button>
            <button type="button" class="secondary" disabled={processing}
              aria-label={`変更${i+1}を削除`} on:click={()=>removeQueued(i)}>削除</button>
          </li>
        {/each}
      </ol>
      {#if developmentMode}
      <button type="button" on:click={()=>preview(true)} disabled={processing}>
        {processing?'Rust/WASMで確認中…':'一括変更を検証'}
      </button>
      {/if}
    </section>
  {/if}
  {#if developmentMode&&queuedEdits.length>0&&
    (coordinateQueue.length>0||mixedQueue.length>0)}
    <section aria-label="所持品と配置の統合編集">
      <div class="slot-actions">
        <strong>所持品＋配置の一括出力</strong>
        <button type="button"
          disabled={processing||!quantityGridEdits||
            savedSlotsFile!==activeFile}
          on:click={()=>validateCoordinateEdit(false,false,false,false,true)}>
          数量と配置をまとめて検証
          {#if quantityGridEdits}
            （数量{queuedEdits.length}件・配置{quantityGridEdits.length}件）
          {/if}
        </button>
      </div>
      {#if !quantityGridEdits}
        <small class="slot-note">配置変更の競合または16件超過があります。編集内容を修正してください。</small>
      {/if}
      {#if coordinateSnapshot?.mode==='quantity-grid'&&
           coordinateState==='validated'}
        <p role="status">数量{coordinateSnapshot.amounts.length}件・配置{
          coordinateSnapshot.edits.length}件をRust/WASMで検証しました。</p>
        <button type="button" disabled={processing||!!coordinateCopyUrl}
          on:click={exportCoordinateCopy}>
          {coordinateCopyUrl?'統合コピーを準備しました':'統合コピーを生成'}
        </button>
        {#if coordinateCopyUrl}
          <a href={coordinateCopyUrl} download={coordinateCopyName}
            class="download-link">統合コピーをダウンロード</a>
        {/if}
      {/if}
    </section>
  {/if}
  {#if developmentMode&&result==='changed'}
    <p role="status">Rust/WASMで{snapshot?.mode==='batch'?snapshot.edits.length+'件の一括変更':'数量変更'}の検証に成功しました。変更後の構造を内部で再検証しました。</p>
    <div class="export-controls">
      <button type="button" disabled={processing || exportReady || snapshot===null}
        on:click={makeExperimentalCopy}>
        {processing?'編集中…':exportReady?'編集済みコピーを準備しました':'編集済みコピーを生成'}
      </button>
      {#if exportReady && downloadUrl}
        <a href={downloadUrl} download={downloadName} class="download-link">コピーをダウンロード</a>
      {/if}
    </div>
  {:else if developmentMode&&result==='unchanged'}
    <p role="status">変更前後の数量が同じです。元データは変更されていません。</p>
  {:else if developmentMode&&result==='error'}
    <p role="alert">検証できませんでした。対象・数量・形式を確認してください。元ファイルは変更していません。</p>
  {/if}
  {#if developmentMode}
    <p class="warning">テスト用機能です。実ゲームでの再読み込み成功は未確認です。元ファイルを保管したまま、生成したコピーのみを検証してください。ゲームに正常に読み込めることを保証しません。</p>
  {:else}
    <p class="warning">編集済みコピーはテスト用です。原本を保管してください。実ゲームでの読み込み・配置可否は未検証です。</p>
  {/if}
</main>

<style>
  .dev-preview{max-width:1100px;margin:0 auto;padding:clamp(24px,5vw,60px);color:#f5ebfb;}
  .editor-workspace{max-width:none;width:100%;box-sizing:border-box;
    margin:0;padding:14px clamp(12px,2vw,30px) 28px;
    display:grid;grid-template-columns:minmax(0,1.2fr) minmax(320px,.8fr);
    gap:12px;align-items:start;align-content:start;}
  .editor-workspace>.editor-topbar,.editor-workspace>.editor-tabs,
  .editor-workspace>.editor-empty,.editor-workspace>p,
  .editor-workspace>.export-controls{grid-column:1/-1;}
  .editor-workspace>.editor-owned-panel{grid-column:1;grid-row:3;}
  .editor-workspace>.editor-amount-panel{grid-column:2;grid-row:3;}
  .editor-workspace>.editor-commit-toolbar{
    grid-column:1/-1;grid-row:3;display:flex;gap:10px;
    flex-wrap:wrap;align-items:center;padding:10px 14px;
    background:#32263f;border:1px solid #ffffff30;
  }
  .editor-workspace.queued-editor>.editor-owned-panel,
  .editor-workspace.queued-editor>.editor-amount-panel{grid-row:4;}
  .editor-commit-toolbar strong{font-size:13px;margin-right:auto;}
  .editor-commit-toolbar button{padding:9px 13px;font-weight:600;}
  .editor-commit-toolbar [role=alert]{flex-basis:100%;margin:0;}
  .editor-workspace>section:not(.editor-amount-panel):not(.editor-owned-panel){
    grid-column:1/-1;}
  @media(max-width:860px){
    .editor-workspace{grid-template-columns:minmax(0,1fr);}
    .editor-workspace>.editor-owned-panel{grid-column:1;grid-row:3;}
    .editor-workspace>.editor-amount-panel{grid-column:1;grid-row:4;}
    .editor-workspace.queued-editor>.editor-owned-panel{grid-row:4;}
    .editor-workspace.queued-editor>.editor-amount-panel{grid-row:5;}
    .editor-workspace>.editor-topbar,.editor-workspace>.editor-tabs,
    .editor-workspace>section:not(.editor-amount-panel):not(.editor-owned-panel),
    .editor-workspace>.editor-empty,.editor-workspace>p,
    .editor-workspace>.export-controls{grid-column:1;}
  }
  .editor-workspace section{margin:0;padding:14px;
    border:1px solid #ffffff15;}
  .editor-workspace .slot-list{max-height:min(55dvh,680px);}
  .editor-topbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;}
  .editor-topbar h1{font-size:clamp(18px,2vw,25px);margin:0;}
  .editor-beta{font-size:11px;color:#dcc5ec;}
  .editor-file-picker{flex:0 1 300px;margin-left:auto;min-width:190px;}
  .editor-file-picker span{font-size:12px;}
  .editor-file-picker input{padding:7px;font-size:12px;}
  .editor-tabs{display:flex;align-items:stretch;gap:4px;
    border-bottom:1px solid #ffffff35;margin-top:9px;}
  .editor-tabs button{border-radius:7px 7px 0 0;background:transparent;
    color:#dfd0ed;padding:10px 18px;font-weight:600;}
  .editor-tabs button.active{color:#fff;background:#493858;
    box-shadow:inset 0 -2px 0 #d8b9f0;}
  .editor-empty{margin:14px 0;padding:18px;background:#261d32;
    border-radius:10px;font-size:14px;}
  .editor-amount-empty{display:flex;align-items:center;flex-wrap:wrap;
    gap:12px;min-height:90px;}
  .editor-amount-empty p{margin:0;font-size:13px;}
  .selected-amount-item{display:flex;gap:10px;align-items:center;
    width:100%;min-width:0;}
  .selected-amount-description{min-width:0;flex:1;display:flex;
    flex-direction:column;gap:4px;}
  .selected-amount-description strong{font-size:16px;overflow-wrap:anywhere;}
  .selected-amount-description small{font-size:12px;color:#d4c2df;}
  .selected-amount-item button{padding:8px 12px;font-size:12px;flex-shrink:0;}
  input[readonly]{background:#332640;color:#eadcf4;cursor:default;}
  .active-save-file{flex:1 1 100%;margin:0;padding:6px 10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;color:#e5d5f1;}
  .eyebrow{font-size:11px;letter-spacing:.17em;color:#d4b0ee;}
  h1{font-size:clamp(26px,4vw,42px);margin:12px 0;}
  p{line-height:1.7;color:#c6b5d4;font-size:14px;}
  section{display:flex;flex-wrap:wrap;gap:16px;margin:26px 0;padding:20px;border-radius:14px;background:#261d32;}
  label{display:flex;flex:1 1 200px;flex-direction:column;gap:7px;font-size:13px;}
  label:first-child{flex-basis:100%;}
  input,select{box-sizing:border-box;width:100%;padding:12px;border-radius:7px;color:#291d34;background:#f5ecfa;border:0;}
  input[type=file]{font-size:12px;}
  button{padding:12px 17px;background:#d8b9f0;color:#24182f;border:0;border-radius:8px;cursor:pointer;}
  button.secondary{background:#493858;color:#faf0ff;}
  button:disabled{opacity:.5;cursor:not-allowed;}
  .batch-edits{display:block}
  .batch-edits ol{margin:8px 0 16px;padding-left:24px}
  .batch-edits li{margin:7px 0;font-size:13px}
  .queued-amount-summary{display:inline-flex;align-items:baseline;
    flex-wrap:wrap;column-gap:12px;row-gap:2px;}
  .queued-amount-summary strong{font-size:14px;}
  .queued-amount-summary small{font-size:12px;color:#d4c2df;}
  .batch-edits li button{margin-left:12px;padding:5px 10px}
  .saved-slots{display:block;}
  .slot-actions{display:flex;align-items:center;gap:15px;}
  .slot-search{display:flex;gap:10px;margin:14px 0;flex-wrap:wrap;}
  .slot-search input{flex:1 1 200px;min-width:0;}
  .slot-search select{flex:1 1 120px;max-width:190px;min-width:0;}
  .slot-bulk-editor{display:flex;align-items:end;gap:10px;flex-wrap:wrap;
    padding:10px;border:1px solid #ffffff22;border-radius:9px;margin:8px 0;}
  .slot-bulk-editor label{flex:0 1 210px;margin:0;}
  .slot-bulk-editor small{font-size:12px;color:#d4c2df;}
  .slot-bulk-editor [role=alert],.slot-bulk-editor [role=status]{
    flex-basis:100%;margin:0;}
  .slot-list{list-style:none;margin:8px 0;padding:0;max-height:380px;overflow:auto;}
  .slot-list li{margin:0;border-bottom:1px solid #ffffff22;}
  .world-reference-row{display:flex;align-items:center;justify-content:space-between;
    gap:12px;padding:10px 12px;min-height:48px;}
  .world-reference-row strong{font-size:15px;display:block;}
  .world-reference-row small{font-size:12px;color:#d4c2df;display:block;}
  .slot-select{width:100%;background:transparent;color:#f5ebfb;text-align:left;
    display:flex;align-items:center;justify-content:space-between;gap:12px;
    min-height:54px;padding:10px 12px;}
  .slot-select:hover{background:#443452;}
  .slot-item-detail{display:flex;align-items:center;gap:10px;min-width:0;}
  .slot-item-detail>span{min-width:0;}
  .slot-item-detail strong{overflow-wrap:anywhere;}
  .slot-select.queued{box-shadow:inset 3px 0 0 #d8b9f0;}
  .slot-prior{display:block;font-size:12px;color:#d4c2df;}
  .slot-select strong{font-size:15px;display:block;}
  .slot-select small,.slot-note{font-size:12px;color:#d4c2df;display:block;}
  .slot-amount{font-size:17px;white-space:nowrap;}
  .db04-path-check{display:flex;align-items:end;gap:14px;
    flex-wrap:wrap;margin:14px 0;}
  .db04-path-check label{min-width:220px;flex:1;}
  .db04-result{margin-top:10px;}
  .db04-result p{margin:8px 0;}
  .warning{font-size:12px;}
  .export-controls{display:flex;gap:14px;flex-wrap:wrap;align-items:center;padding:12px 0;}
  .download-link{display:inline-block;padding:12px 17px;border-radius:8px;background:#f5ecfa;color:#24182f;font-size:14px;text-decoration:none;font-weight:600;}
  [role=alert]{color:#ffb5bf;}
</style>