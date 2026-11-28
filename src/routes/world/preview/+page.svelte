<script lang="ts">
  import { onDestroy,tick } from 'svelte';
  import {localSaveSession} from '$lib/ui/local-save-session';
  import {autoAppend} from '$lib/ui/auto-append';
  import NativeGraphExplorer from '$lib/world/NativeGraphExplorer.svelte';
  import type {SourceObjectMap} from '$lib/world/source-object-map.ts';
  import MediaMapGridOverlay from '$lib/world/MediaMapGridOverlay.svelte';
  import WorldMapPartsPreview from '$lib/world/WorldMapPartsPreview.svelte';
  import NativeTerrainGridOverview from '$lib/world/NativeTerrainGridOverview.svelte';
  import NativeTerrainFloorMatchPanel from '$lib/world/NativeTerrainFloorMatchPanel.svelte';
  import {emptyWorldTimeline} from '$lib/world/saved-map-batch.ts';
  import type {SavedShapeMap} from '$lib/world/saved-shape-map.ts';
  import SavedGridSourceCandidates from '$lib/world/SavedGridSourceCandidates.svelte';
  import EffectiveDiffGridPreview from '$lib/world/EffectiveDiffGridPreview.svelte';
  import type {EffectiveDiffGridPreview as DiffResult} from '$lib/world/diffgrid-effective-preview.ts';
  import type {
    SourceGridQuery,SavedGridSourceCandidates as SaveCandidateResult
  } from '$lib/world/saved-grid-source-candidates.ts';
  import type {OriginalFloorItem,NativeFloorMatchResult} from '$lib/world/native-floor-match.ts';
  import type {NativeFloorWindowResult} from '$lib/world/native-floor-rectangle-window.ts';
  import type {SourceLayerInspection} from '$lib/world/native-source-layer-inspection.ts';
  import NativeTerrainRegionAtlas from '$lib/world/NativeTerrainRegionAtlas.svelte';
  import type {SourceRegionAtlasPage} from '$lib/world/native-region-grid-atlas.ts';
  import type {OriginalItemAnchorFindResult, GlobalOriginalItemAnchorResult}
    from '$lib/world/native-item-anchor-finder.ts';
  import type {OriginalGridAreaEvidence}
    from '$lib/world/native-gridarea-evidence.ts';
  import type {OriginalGridObjectAreaLink}
    from '$lib/world/native-gridobject-item-area-link.ts';
  import type {OriginalDefaultGridLayersCell}
    from '$lib/world/native-default-gridlayers-cell.ts';
  import type {OriginalDefaultGridLayersWindow}
    from '$lib/world/native-default-gridlayers-window.ts';
  import type {SourceDefaultCandidateLayerProbe,SourceDefaultCandidateLayerCell}
    from '$lib/world/native-default-candidate-probe.ts';
  import {getOriginalGridAreaDisplayDimensions,
    type SourceLocalGridAreaWindow}
    from '$lib/world/native-gridarea-local-window.ts';
  import {matchSourceGridToLocalTerrain,
    type SourceGridNavigationRequest}
    from '$lib/world/native-grid-navigation.ts';

  type GridOption = {
    gridIdNative: number;
    gridDataPath: string;
    knownGridData: boolean;
    sizeX: number | null;
    sizeY: number | null;
    anchorSizeX: number | null;
    anchorSizeY: number | null;
    tessellationFactor: number | null;
    anchorDomainStatus: string;
    defaultObjectCount: number;
  };
  type LayoutOption = {
    viewKey: string; label: string; layoutId: string;
    kind: 'gridCollection' | 'villageArea';
    regionKey: string;
    villageLayoutId?: string; nativeAreaTypeCode?: number;
    nativeAreaTypeName?: string | null;
    missingReferencedLayout?: boolean;
    grids: GridOption[];
  };
  type RegionCoverage = {
    regionKey: string;
    villageLayoutCount: number; realmLayoutCount: number; offGridLayoutCount: number; areaReferenceCount: number;
    resolvedAreaReferenceCount: number; missingAreaLayoutReferenceCount: number;
    nativeGridReferenceCount: number; presentNativeGridReferenceCount: number;
    missingNativeGridReferenceCount: number; sourceDefaultAnchorCount: number;
    separateAreaReferenceCount: number; resolvedSeparateAreaReferenceCount: number;
    missingSeparateAreaReferenceCount: number;
    worldCoordinatesVerified: false; placementLegalityVerified: false;
  };
  type Anchor = {
    layoutObjectId: string;
    gridObjectIdNative: number;
    itemId: number;
    x: number; y: number;
    orientationCode: number;
    orientationName: string | null;
  };
  type PageResult = {
    status: string; rect?: {x:number;y:number;width:number;height:number};
    defaultObjectAnchors?: Anchor[];
    viewAnchorCount?: number; matchingNativeDefaultAnchorCount?: number;
    totalNativeDefaultObjectAnchors?: number;
    hasNextPage?: boolean; nextOffset?: number | null; pageOffset?: number;
    gridDataPath?: string;
  };
  type TerrainRaster = {
    status:'source_corroborated_grid_local_raster';
    sizeX:number;sizeY:number;totalCells:number;
    nativeFloorValues:Uint32Array;
    maskCounts:Array<{nativeFloorValue:number;cellCount:number}>;
    worldCoordinatesVerified:false;placementLegalityVerified:false;
  };
  type TerrainRasterEnvelope = {
    viewKey:string;gridIdNative:number;gridDataPath:string;
    raster:TerrainRaster;
    objectMap:SourceObjectMap|null;
  };
  type ViewResult = {
    page: PageResult; markers: Array<{x:number;y:number;count:number}>;
    terrainStatus: string | null; terrainRows?: number[][] | null;
    defaultLayersWindow?:OriginalDefaultGridLayersWindow|null;
  };

  let worker: Worker | null = null;
  let requestId = 0;
  let loading = false;
  let errorMessage = '';
  let infoMessage = '';
  let version = '';
  let platform = '';
  let integrity = '';
  let manifestFilesVerified = 0;
  let manifestRawSha256:string|null=null;
  let layouts: LayoutOption[] = [];
  let regions: RegionCoverage[] = [];
  let selectedRegion = '';
  let selectedViewKey = '';
  let selectedGridId = '';
  let x = 0; let y = 0; let width = 16; let height = 16;
  let offset = 0;
  let displayedAnchors: Anchor[] = [];
  let viewing = false;
  let viewport: ViewResult | null = null;
  let terrainRasterEnvelope:TerrainRasterEnvelope|null=null;
  let terrainRasterRequestId=-1;
  let terrainRasterLoading=false;
  let mediaMapActive=false;
  let mediaTerrainMapActive=false;
  let terrainRasterStatus='';
  let regionAtlas:SourceRegionAtlasPage|null=null;
  let regionAtlasRequestId=-1;
  let regionAtlasLoading=false;
  let regionAtlasError='';
  let floorSearchQuery='';
  let floorSearchRequestId=-1;
  let floorSearchLoading=false;
  let floorItemMatches:OriginalFloorItem[]=[];
  let selectedFloorItem:OriginalFloorItem|null=null;
  let floorMatchResult:NativeFloorMatchResult|null=null;
  let floorWindowResult:NativeFloorWindowResult|null=null;
  let floorOrientationCode=8;
  let floorMatchRequestId=-1;
  let floorMatchLoading=false;
  let floorMatchError='';
  let floorLayerInspection:SourceLayerInspection|null=null;
  let floorLayerInspectionRequestId=-1;
  let floorLayerInspecting=false;
  let floorLayerInspectionError='';
  let savedSourceCandidates:SaveCandidateResult|null=null;
  let effectiveDiff:DiffResult|null=null;
  let effectiveDraft:DiffResult|null=null,draftRequest=-1,draftWorking=false,draftFailed=false;
  let draftRevision=-1;
  let diffRequest=-1,diffWorking=false,diffFailed=false;
  let diffViewKey='',diffGridId=-1;
  let savedShapeMap:SavedShapeMap|null=null;
  let worldTimeline=emptyWorldTimeline();
  let savedShapeRequest=-1;
  let saveComparisonWorker:Worker|null=null;
  let saveComparisonLoading=false;
  let saveComparisonError='';
  let saveComparisonRequest=0;
  let saveComparisonRevision=-1;
  let selectedSaveRevision=-1;
  let selectedCell: {x:number;y:number} | null = null;
  let showSourceDefaultLayerOverlay=false;
  let selectedCellLayers:OriginalDefaultGridLayersCell|null=null;
  let loadingCellLayers=false;
  let fileInput: HTMLInputElement | null = null;
  let terrainPanel:HTMLDivElement|null=null;
  let terrainLinkNotice='';
  let anchorItemSearch='';
  let anchorFindResult:OriginalItemAnchorFindResult|null=null;
  let anchorFindMessage='';
  let findingAnchor=false;
  let itemGridArea:OriginalGridAreaEvidence|null=null;
  let itemAreaLink:OriginalGridObjectAreaLink|null=null;
  let candidateExpanded=false;
  let candidateX=0;
  let candidateY=0;
  let candidateOrientation=8;
  let candidateProbe:SourceDefaultCandidateLayerProbe|null=null;
  let candidateProbeError='';
  let probingCandidate=false;
  let areaWindow:SourceLocalGridAreaWindow|null=null;
  let areaOrientation=8;
  let areaFactor:1|2=1;
  const areaOrientations=[8,9,10,11,12,13,14,15,0,1,2,3,4,5,6,7];
  let areaX=0;
  let areaY=0;
  let areaWindowError='';
  let loadingAreaWindow=false;
  let globalItemSearch='';
  let globalFindResult:GlobalOriginalItemAnchorResult|null=null;
  let globalFindMessage='';
  let findingGlobal=false;

  $: regionKeys = [...new Set(layouts.map(a => a.regionKey))].sort();
  $: filteredLayouts = selectedRegion
    ? layouts.filter(a => a.regionKey === selectedRegion) : layouts;
  $: selectedRegionCoverage = regions.find(a => a.regionKey === selectedRegion);
  $: visibleRegionAtlas=regionAtlas?.regionKey===selectedRegion?regionAtlas:null;
  $: selectedLayout = layouts.find(a => a.viewKey === selectedViewKey);
  $: gridOptions = selectedLayout?.grids ?? [];
  $: selectedGrid = gridOptions.find(a => String(a.gridIdNative) === selectedGridId);
  $: activeTerrainRaster=terrainRasterEnvelope?.viewKey===selectedViewKey&&
    terrainRasterEnvelope?.gridIdNative===selectedGrid?.gridIdNative&&
    terrainRasterEnvelope?.gridDataPath===selectedGrid?.gridDataPath
    ?terrainRasterEnvelope.raster:null;
  $: canNavigateTerrainRaster=activeTerrainRaster!==null&&
    selectedGrid?.tessellationFactor===1&&
    selectedGrid?.anchorDomainStatus==='raw_grid_dimensions_only'&&
    selectedGrid?.anchorSizeX===activeTerrainRaster.sizeX&&
    selectedGrid?.anchorSizeY===activeTerrainRaster.sizeY;
  $: visibleSourceDefaultBounds = clippedDefaultSourceBounds(
    itemAreaLink,viewport?.page??null,selectedLayout?.layoutId,selectedGrid);
  $: visibleCandidateBounds=clippedCandidateSourceBounds(
    candidateProbe,viewport?.page??null,selectedLayout?.layoutId,selectedGrid);
  $: candidateCells=(candidateProbe?.status==='source_default_candidate_layers_observed'&&
    candidateProbe.sourceLayoutId===selectedLayout?.layoutId&&
    candidateProbe.nativeGridId===selectedGrid?.gridIdNative&&
    candidateProbe.sourceGridDataPath===selectedGrid?.gridDataPath&&
    candidateProbe.originalGridObjectId===itemAreaLink?.nativeGridObjectId&&
    candidateProbe.itemId===itemAreaLink?.itemId
    ?candidateProbe.rows:null)?.flat()??[];
  $: candidateCellsByPosition=new Map<string,SourceDefaultCandidateLayerCell>(
    candidateCells.map(cell=>[`${cell.x}:${cell.y}`,cell]));
  $: activeLayerWindow = showSourceDefaultLayerOverlay&&
    viewport?.defaultLayersWindow?.status==='source_item_default_layer_window'&&
    viewport.page?.rect?.x===viewport.defaultLayersWindow.rect.x&&
    viewport.page?.rect?.y===viewport.defaultLayersWindow.rect.y&&
    viewport.page?.rect?.width===viewport.defaultLayersWindow.rect.width&&
    viewport.page?.rect?.height===viewport.defaultLayersWindow.rect.height&&
    viewport.defaultLayersWindow.sourceLayoutId===selectedLayout?.layoutId&&
    viewport.defaultLayersWindow.nativeGridId===selectedGrid?.gridIdNative&&
    viewport.defaultLayersWindow.gridDataPath===selectedGrid?.gridDataPath
    ?viewport.defaultLayersWindow:null;
  $: markersByCell = new Map((viewport?.markers ?? []).map(a => [`${a.x}:${a.y}`, a.count]));
  $: cells = viewport?.page?.rect && viewport.page.status === 'source_native_default_layout_anchors_only'
    ? Array.from({length:viewport.page.rect.width * viewport.page.rect.height}, (_, index) => {
        const rect = viewport!.page.rect!;
        const cx = rect.x + index % rect.width;
        const cy = rect.y + Math.floor(index / rect.width);
        const value = viewport?.terrainRows?.[Math.floor(index / rect.width)]?.[index % rect.width];
        const iy=Math.floor(index/rect.width),ix=index%rect.width;
        const originalDefaultLayer=activeLayerWindow?.rawLayerOrRows?.[iy]?.[ix]??null;
        const possibleUnknown=activeLayerWindow
          ?.potentiallyUnresolvedContributorCountRows?.[iy]?.[ix]??0;
        const candidate=candidateCellsByPosition.get(`${cx}:${cy}`);
        return {x:cx,y:cy,count:markersByCell.get(`${cx}:${cy}`) ?? 0,
          nativeFloorValue:value,originalDefaultLayer,possibleUnknown,
          candidate};
      }) : [];
  $: selectedPointCount = selectedCell
    ? markersByCell.get(`${selectedCell.x}:${selectedCell.y}`) ?? 0 : 0;
  $: selectedFloorValue = selectedCell
    ? cells.find(c => c.x === selectedCell?.x && c.y === selectedCell?.y)?.nativeFloorValue
    : undefined;

  // Deterministic source-value palette for inspection, NOT gameplay terrain
  // colors, collision status, occupancy or object placement permission.
  /**
   * Draw only the SOURCE Item default area's OUTER bounding outline. It is
   * never an occupancy fill and never a World/Save position transform.
   * The grid-view uses 24px cells, 2px gaps, 4px padding and 1px border.
   */
  function clippedDefaultSourceBounds(
    link:OriginalGridObjectAreaLink|null,
    page:PageResult|null,layoutId:string|undefined,
    grid:GridOption|undefined
  ):{left:number;top:number;width:number;height:number}|null {
    const area=link?.sourceDefaultBoundingRect;
    const rect=page?.rect;
    if(!area||!rect||page?.status!=='source_native_default_layout_anchors_only'||
       link?.sourceDefaultRectWithinGridExtent!==true||
       link.sourceLayoutId!==layoutId||
       link.nativeGridId!==grid?.gridIdNative||
       link.gridDataPath!==grid?.gridDataPath)
      return null;
    const x1=Math.max(area.x,rect.x),y1=Math.max(area.y,rect.y);
    const x2=Math.min(area.x+area.width,rect.x+rect.width);
    const y2=Math.min(area.y+area.height,rect.y+rect.height);
    if(x1>=x2||y1>=y2)return null;
    return {
      left:5+(x1-rect.x)*26,top:5+(y1-rect.y)*26,
      width:(x2-x1)*26-2,height:(y2-y1)*26-2
    };
  }

  function clippedCandidateSourceBounds(
    probe:SourceDefaultCandidateLayerProbe|null,
    page:PageResult|null,layoutId:string|undefined,grid:GridOption|undefined
  ):{left:number;top:number;width:number;height:number}|null{
    if(probe?.status!=='source_default_candidate_layers_observed'||
       !page?.rect||page.status!=='source_native_default_layout_anchors_only'||
       probe.sourceLayoutId!==layoutId||
       probe.nativeGridId!==grid?.gridIdNative||
       probe.sourceGridDataPath!==grid?.gridDataPath||
       probe.candidateDefaultWidth===null||
       probe.candidateDefaultHeight===null)return null;
    const r=page.rect;
    const x1=Math.max(r.x,probe.candidateAnchorX);
    const y1=Math.max(r.y,probe.candidateAnchorY);
    const x2=Math.min(r.x+r.width,
      probe.candidateAnchorX+probe.candidateDefaultWidth);
    const y2=Math.min(r.y+r.height,
      probe.candidateAnchorY+probe.candidateDefaultHeight);
    if(x2<=x1||y2<=y1)return null;
    return {
      left:5+(x1-r.x)*26,top:5+(y1-r.y)*26,
      width:(x2-x1)*26-2,height:(y2-y1)*26-2
    };
  }

  function floorTint(nativeValue: number | undefined): string | undefined {
    if (!Number.isSafeInteger(nativeValue) || nativeValue === undefined) return undefined;
    if (nativeValue === 0) return '#34313f';
    // Native GridFloorType flag names only. These are illustrative UI
    // colors and never implement traversal, water access or item permission.
    if ((nativeValue & 512) !== 0) return '#346d96'; // Water
    if ((nativeValue & 256) !== 0) return '#397d79'; // Shore
    if ((nativeValue & 4) !== 0) return '#53865a'; // Meadow
    if ((nativeValue & 2048) !== 0) return '#7f697f'; // Wall
    if ((nativeValue & 1024) !== 0) return '#706b7a'; // Floor
    const hue = (Math.imul(nativeValue, 2654435761) >>> 0) % 360;
    return `hsl(${hue} 29% 39%)`;
  }

  function resetCandidateProbe(){
    candidateProbe=null;
    candidateProbeError='';
    probingCandidate=false;
    candidateExpanded=false;
  }
  function requestCandidateProbe(){
    const link=itemAreaLink;
    const selected=layouts.find(row=>row.viewKey===selectedViewKey);
    const grid=selected?.grids.find(row=>String(row.gridIdNative)===selectedGridId);
    candidateProbe=null;
    candidateProbeError='';
    if(!worker||!link||!grid||!selected||
       link.status!=='original_item_default_gridarea_linked'||
       link.sourceLayoutId!==selected.layoutId||
       link.nativeGridId!==grid.gridIdNative||
       link.gridDataPath!==grid.gridDataPath||
       !Number.isSafeInteger(candidateX)||!Number.isSafeInteger(candidateY)||
       candidateX<0||candidateY<0||
       candidateX>0xffffffff||candidateY>0xffffffff||
       !Number.isSafeInteger(candidateOrientation)||
       candidateOrientation<0||candidateOrientation>15){
      candidateProbeError='原本Gridと候補位置を確認してください。';
      return;
    }
    probingCandidate=true;
    worker.postMessage({command:'candidate-probe',requestId:++requestId,
      viewKey:selected.viewKey,gridIdNative:grid.gridIdNative,
      gridObjectIdNative:link.nativeGridObjectId,itemId:link.itemId,
      candidateX,candidateY,orientationCode:candidateOrientation});
  }
  function resetAreaWindow(){
    areaWindow=null;
    areaWindowError='';
    loadingAreaWindow=false;
  }
  function requestAreaWindow(){
    const shape=itemGridArea;
    if(!worker||!shape||shape.status!=='source_raw_gridarea_available'||
       !shape.rawSizeX||!shape.rawSizeY||viewing||findingGlobal||findingAnchor)
      return;
    const dims=getOriginalGridAreaDisplayDimensions(
      shape.rawSizeX,shape.rawSizeY,areaOrientation,areaFactor);
    const sx=dims.width,sy=dims.height;
    if(!Number.isSafeInteger(areaX)||!Number.isSafeInteger(areaY)||
       areaX<0||areaY<0||areaX>=sx||areaY>=sy){
      areaWindow=null;
      areaWindowError='原本GridAreaの表示座標は範囲内で指定してください。';
      return;
    }
    areaWindowError='';
    loadingAreaWindow=true;
    const id=++requestId;
    worker.postMessage({command:'gridarea-window',requestId:id,
      itemId:shape.itemId,orientationCode:areaOrientation,
      callerGridFactor:areaFactor,
      rect:{x:areaX,y:areaY,
        width:Math.min(16,sx-areaX),height:Math.min(16,sy-areaY)}});
  }
  function requestSelectedCellLayers(x:number,y:number){
    const selected=layouts.find(row=>row.viewKey===selectedViewKey);
    const grid=selected?.grids.find(row=>String(row.gridIdNative)===selectedGridId);
    selectedCellLayers=null;
    loadingCellLayers=false;
    if(!worker||!selected||!grid||!grid.knownGridData||
       !Number.isSafeInteger(x)||!Number.isSafeInteger(y)||x<0||y<0||
       !Number.isSafeInteger(grid.anchorSizeX)||
       !Number.isSafeInteger(grid.anchorSizeY)||
       x>=grid.anchorSizeX!||y>=grid.anchorSizeY!)return;
    loadingCellLayers=true;
    const id=++requestId;
    worker.postMessage({command:'grid-cell-layers',requestId:id,
      viewKey:selected.viewKey,gridIdNative:grid.gridIdNative,x,y});
  }
  function selectGridCell(x:number,y:number){
    selectedCell={x,y};
    requestSelectedCellLayers(x,y);
  }
  function clearSavedSourceComparison(){
    saveComparisonWorker?.terminate();
    saveComparisonWorker=null;
    savedSourceCandidates=null;
    effectiveDiff=null;diffRequest=-1;diffWorking=false;diffFailed=false;diffViewKey='';diffGridId=-1;
    effectiveDraft=null;draftRequest=-1;draftWorking=false;draftFailed=false;draftRevision=-1;
    savedShapeMap=null;savedShapeRequest=-1;
    saveComparisonLoading=false;
    saveComparisonError='';
    saveComparisonRevision=-1;
    saveComparisonRequest++;
  }
  // A new/closed Save invalidates every previously projected local ordinal.
  $: if($localSaveSession.revision!==selectedSaveRevision){
    selectedSaveRevision=$localSaveSession.revision;
    worldTimeline=emptyWorldTimeline();
    clearSavedSourceComparison();
  }
  function rehearseDiffGrid(plan:unknown){
    const file=$localSaveSession.file;
    if(!worker||!file||!effectiveDiff||diffViewKey!==selectedViewKey||diffGridId!==Number(selectedGridId)||draftWorking)return;
    draftRequest=++requestId;draftRevision=$localSaveSession.revision;draftWorking=true;draftFailed=false;effectiveDraft=null;
    worker.postMessage({command:'compare-diff',requestId:draftRequest,file,viewKey:diffViewKey,gridIdNative:diffGridId,draftPlan:plan});
  }
  function compareSelectedSaveToGrid(){
    clearSavedSourceComparison();
    const file=$localSaveSession.file;
    const selection=layouts.find(v=>v.viewKey===selectedViewKey);
    const grid=selection?.grids.find(
      g=>String(g.gridIdNative)===selectedGridId);
    if(!file||!selection||!grid||!grid.knownGridData||
       version!=='1.26.2'||platform!=='Steam'||file.size<1||
       file.size>32*1024*1024){
      saveComparisonError='この原本Gridまたはセーブは照合できません。';
      return;
    }
    if(worker){
      diffRequest=++requestId;diffWorking=true;diffViewKey=selectedViewKey;diffGridId=grid.gridIdNative;
      worker.postMessage({command:'compare-diff',requestId:diffRequest,file,viewKey:diffViewKey,gridIdNative:diffGridId});
    }
    const refs=new Map<number,SourceGridQuery['sourceRefs'][number]>();
    for(const view of layouts){
      if(view.layoutId!==selection.layoutId)continue;
      for(const ref of view.grids){
        if(ref.gridDataPath!==grid.gridDataPath)continue;
        if(!refs.has(ref.gridIdNative)){
          refs.set(ref.gridIdNative,{
            layoutId:selection.layoutId,
            gridDataPath:ref.gridDataPath,
            nativeGridId:ref.gridIdNative,
            nativeSizeX:ref.sizeX,nativeSizeY:ref.sizeY,
            tessellationFactor:ref.tessellationFactor,
          });
        }
      }
    }
    if(refs.size<1||refs.size>2048)return;
    const query:SourceGridQuery={
      viewKey:selectedViewKey,nativeGridId:grid.gridIdNative,
      sourceRefs:[...refs.values()],
    };
    const own=new Worker(new URL(
      '../../../lib/world/world-save-candidates.worker.ts',import.meta.url
    ),{type:'module'});
    saveComparisonWorker=own;
    saveComparisonLoading=true;
    const req=++saveComparisonRequest;
    const revision=$localSaveSession.revision;
    saveComparisonRevision=revision;
    function done(value:unknown){
      if(own!==saveComparisonWorker||req!==saveComparisonRequest||
         revision!==$localSaveSession.revision)return;
      own.terminate();saveComparisonWorker=null;
      saveComparisonLoading=false;
      const result=value as {kind?:string;requestId?:number;
        receipt?:SaveCandidateResult;message?:string};
      const receipt=result?.receipt;
      if(result?.kind!=='saved-source-candidates'||
         result.requestId!==req||
         receipt?.contract!=='wand.db04.saved-source-numeric-candidates@1'||
         receipt.viewKey!==selectedViewKey||
         receipt.nativeGridId!==Number(selectedGridId)||
         receipt.savedAndSourceCoordinatesEquivalent!==false||
         receipt.legalPlacementVerified!==false||
         !Array.isArray(receipt.points)){
        saveComparisonError='セーブの原本参照を照合できませんでした。';
        return;
      }
      savedSourceCandidates=receipt;
      if(worker&&receipt.points.length){
        savedShapeRequest=++requestId;
        worker.postMessage({command:'saved-shapes',requestId:savedShapeRequest,
          viewKey:receipt.viewKey,gridIdNative:receipt.nativeGridId,points:receipt.points});
      }
    }
    own.onmessage=event=>done(event.data);
    own.onerror=event=>{event.preventDefault();done({kind:'error'});};
    own.onmessageerror=()=>done({kind:'error'});
    own.postMessage({command:'compare-source-grid',requestId:req,
      file,filename:file.name,query});
  }
  function stop() {
    worldTimeline=emptyWorldTimeline();
    requestId++;
    clearSavedSourceComparison();
    terrainRasterRequestId=-1;
    terrainRasterEnvelope=null;
    terrainRasterLoading=false;
    terrainRasterStatus='';
    regionAtlas=null;
    regionAtlasRequestId=-1;
    regionAtlasLoading=false;
    regionAtlasError='';
    floorSearchQuery='';
    floorSearchRequestId=-1;
    floorSearchLoading=false;
    floorItemMatches=[];
    selectedFloorItem=null;
    floorMatchResult=null;
    floorWindowResult=null;
    floorMatchRequestId=-1;
    floorMatchLoading=false;
    floorMatchError='';
    resetFloorLayerInspection();
    worker?.terminate();
    worker = null;
    loading = false;
    loadingCellLayers=false;
    selectedCellLayers=null;
    viewing = false;
    findingAnchor=false;
    findingGlobal=false;
    itemGridArea=null;
    itemAreaLink=null;
    resetCandidateProbe();
    resetAreaWindow();
  }
  function resetGlobalFind(clearInput=true){
    globalFindResult=null;
    globalFindMessage='';
    findingGlobal=false;
    itemGridArea=null;
    itemAreaLink=null;
    resetCandidateProbe();
    resetAreaWindow();
    if(clearInput)globalItemSearch='';
  }
  function findGlobalOriginalItem(matchIndex=0){
    itemGridArea=null;
    itemAreaLink=null;
    resetCandidateProbe();
    resetAreaWindow();
    const input=globalItemSearch.trim();
    if(!/^[1-9][0-9]{0,15}$/.test(input)||
       !Number.isSafeInteger(Number(input))){
      globalFindResult=null;
      globalFindMessage='原本Item IDは正の整数で入力してください。';
      return;
    }
    if(!worker||!version){
      globalFindMessage='先に原本ZIPを読み込んでください。';
      globalFindResult=null;
      return;
    }
    findingGlobal=true;
    globalFindMessage='';
    const id=++requestId;
    worker.postMessage({command:'find-global-anchor',requestId:id,
      itemId:Number(input),matchIndex});
  }
  function stepGlobalOriginalItem(direction:-1|1){
    const result=globalFindResult;
    if(result?.status!=='found'||result.matchedIndex===null||
       result.matchingOriginalDefaultObjectCount<2)return;
    const count=result.matchingOriginalDefaultObjectCount;
    findGlobalOriginalItem((result.matchedIndex+direction+count)%count);
  }
  function resetAnchorFind(clearInput=true) {
    anchorFindResult=null;
    anchorFindMessage='';
    findingAnchor=false;
    if(clearInput)anchorItemSearch='';
  }
  function findNativeItemAnchor(matchIndex=0){
    itemGridArea=null;
    itemAreaLink=null;
    resetCandidateProbe();
    resetAreaWindow();
    const selected=layouts.find(row=>row.viewKey===selectedViewKey);
    const grid=selected?.grids.find(row=>
      String(row.gridIdNative)===selectedGridId);
    const query=anchorItemSearch.trim();
    if(!/^[1-9][0-9]{0,15}$/.test(query)||
       !Number.isSafeInteger(Number(query))){
      anchorFindMessage='原本Item IDは正の整数で入力してください。';
      anchorFindResult=null;
      return;
    }
    if(!worker||!selected||!grid||!grid.knownGridData){
      anchorFindMessage='このGridの原本データが読み込まれていません。';
      anchorFindResult=null;
      return;
    }
    findingAnchor=true;
    anchorFindMessage='';
    const id=++requestId;
    worker.postMessage({
      command:'find-anchor',requestId:id,
      viewKey:selected.viewKey,gridIdNative:grid.gridIdNative,
      itemId:Number(query),matchIndex
    });
  }
  function findNextNativeItemAnchor(){
    const match=anchorFindResult;
    if(match?.status!=='found'||match.matchingOriginalDefaultObjectCount<=1||
      match.matchedIndex===null)return;
    findNativeItemAnchor((match.matchedIndex+1)%
      match.matchingOriginalDefaultObjectCount);
  }
  function clearAll() {
    stop();
    version = '';
    platform = '';
    layouts = [];
    regions = [];
    selectedRegion = '';
    selectedViewKey = '';
    selectedGridId = '';
    viewport = null;
    displayedAnchors = [];
    selectedCell = null;
    selectedCellLayers=null;
    loadingCellLayers=false;
    showSourceDefaultLayerOverlay=false;
    integrity = '';
    manifestFilesVerified = 0;
    manifestRawSha256=null;
    errorMessage = '';
    infoMessage = 'ブラウザ内のWorldデータを破棄しました。';
    terrainLinkNotice='';
    resetAnchorFind();
    resetGlobalFind();
    if (fileInput) fileInput.value = '';
  }
  onDestroy(stop);

  function searchFloorItems(query:string){
    floorSearchQuery=query;
    floorItemMatches=[];
    floorSearchLoading=false;
    if(!worker||query.trim().length<2)return;
    floorSearchLoading=true;
    floorSearchRequestId=++requestId;
    worker.postMessage({command:'floor-items',requestId:floorSearchRequestId,query});
  }
  function chooseFloorItem(item:OriginalFloorItem){
    selectedFloorItem=item;
    requestFloorMatch();
  }
  function changeFloorOrientation(code:number){
    if(!Number.isSafeInteger(code)||code<0||code>15)return;
    floorOrientationCode=code;
    requestFloorMatch();
  }
  function resetFloorLayerInspection(){
    floorLayerInspection=null;
    floorLayerInspectionRequestId=-1;
    floorLayerInspecting=false;
    floorLayerInspectionError='';
  }
  function inspectFloorLayerAt(cellX:number,cellY:number){
    resetFloorLayerInspection();
    const bounds=floorWindowResult;
    const view=layouts.find(row=>row.viewKey===selectedViewKey);
    const grid=view?.grids.find(row=>String(row.gridIdNative)===selectedGridId);
    if(!worker||!view||!grid||!bounds?.originBitmap||
       bounds.bitmapWidth===null||bounds.bitmapHeight===null||
       !Number.isSafeInteger(cellX)||!Number.isSafeInteger(cellY)||
       cellX<0||cellY<0||
       cellX>=bounds.bitmapWidth||cellY>=bounds.bitmapHeight)return;
    floorLayerInspectionRequestId=++requestId;
    floorLayerInspecting=true;
    worker.postMessage({command:'floor-layer-inspect',
      requestId:floorLayerInspectionRequestId,
      viewKey:selectedViewKey,gridIdNative:grid.gridIdNative,
      x:cellX,y:cellY});
  }
  function clearFloorItem(){
    selectedFloorItem=null;
    resetFloorLayerInspection();
    floorMatchResult=null;
    floorWindowResult=null;
    floorMatchLoading=false;
    floorMatchRequestId=-1;
    floorMatchError='';
  }
  function requestFloorMatch(){
    resetFloorLayerInspection();
    floorWindowResult=null;
    floorMatchResult=null;
    floorMatchLoading=false;
    floorMatchError='';
    const item=selectedFloorItem;
    const view=layouts.find(row=>row.viewKey===selectedViewKey);
    const grid=view?.grids.find(row=>String(row.gridIdNative)===selectedGridId);
    if(!worker||!item||!view||!grid||!selectedRegion)return;
    floorMatchLoading=true;
    floorMatchRequestId=++requestId;
    worker.postMessage({command:'floor-match',requestId:floorMatchRequestId,
      regionKey:selectedRegion,viewKey:selectedViewKey,
      gridIdNative:grid.gridIdNative,itemId:item.itemId,
      orientationCode:floorOrientationCode});
  }
  function requestRegionAtlas(reset=true){
    if(reset){
      regionAtlas=null;
      regionAtlasError='';
    }
    if(!worker||!selectedRegion){
      regionAtlasLoading=false;
      return;
    }
    const offset=reset?0:regionAtlas?.nextOffset;
    if(offset===null||offset===undefined)return;
    regionAtlasLoading=true;
    regionAtlasRequestId=++requestId;
    worker.postMessage({command:'region-atlas',
      requestId:regionAtlasRequestId,regionKey:selectedRegion,offset});
  }
  function chooseAtlasGrid(viewKey:string,gridIdNative:number){
    const view=layouts.find(row=>row.viewKey===viewKey&&
      row.regionKey===selectedRegion);
    if(!view||!view.grids.some(grid=>grid.gridIdNative===gridIdNative))return;
    selectedViewKey=viewKey;
    selectedGridId=String(gridIdNative);
    resetAnchorFind();
    resetGlobalFind();
    itemGridArea=null;
    x=0;y=0;width=16;height=16;
    viewport=null;
    requestTerrainRaster();
    requestFloorMatch();
    requestWindow();
  }
  function requestTerrainRaster(){
    clearSavedSourceComparison();
    terrainRasterEnvelope=null;
    terrainRasterStatus='';
    terrainRasterLoading=false;
    const selection=layouts.find(row=>row.viewKey===selectedViewKey);
    const grid=selection?.grids.find(row=>String(row.gridIdNative)===selectedGridId);
    if(!worker||!selection||!grid||!grid.knownGridData)return;
    terrainRasterLoading=true;
    terrainRasterRequestId=++requestId;
    worker.postMessage({command:'terrain-raster',requestId:terrainRasterRequestId,
      viewKey:selection.viewKey,gridIdNative:grid.gridIdNative});
  }
  function jumpToTerrainRasterCell(cx:number,cy:number){
    if(!canNavigateTerrainRaster||!activeTerrainRaster)return;
    x=Math.max(0,Math.min(cx-Math.floor(width/2),activeTerrainRaster.sizeX-1));
    y=Math.max(0,Math.min(cy-Math.floor(height/2),activeTerrainRaster.sizeY-1));
    requestWindow();
    selectedCell={x:cx,y:cy};
  }
  function requestWindow(reset = true,preserveSelectedCell = false) {
    // Resolve against current selections synchronously: Svelte's reactive
    // derived variables may not update until after an event handler returns.
    const chosen = layouts.find(a => a.viewKey === selectedViewKey)?.grids
      .find(g => String(g.gridIdNative) === selectedGridId);
    if (!worker || !chosen || !chosen.knownGridData ||
        !Number.isSafeInteger(chosen.anchorSizeX) ||
        !Number.isSafeInteger(chosen.anchorSizeY) ||
        chosen.anchorSizeX! < 1 || chosen.anchorSizeY! < 1) {
      viewport = null;
      displayedAnchors = [];
      return;
    }
    if (chosen.anchorDomainStatus === 'tessellation_coordinate_relation_unverified') {
      viewport = null;
      displayedAnchors = [];
      errorMessage = 'この原本バージョン・係数の初期配置座標範囲は未検証です。';
      return;
    }
    const sx = chosen.anchorSizeX!, sy = chosen.anchorSizeY!;
    x = Math.min(Math.max(0, Number.isSafeInteger(x) ? x : 0), sx - 1);
    y = Math.min(Math.max(0, Number.isSafeInteger(y) ? y : 0), sy - 1);
    width = Math.min(Math.max(1, Number.isSafeInteger(width) ? width : 16), 32, sx - x);
    height = Math.min(Math.max(1, Number.isSafeInteger(height) ? height : 16), 32, sy - y);
    if (reset){offset = 0;displayedAnchors = [];
      if(!preserveSelectedCell)selectedCell=null;
      selectedCellLayers=null;loadingCellLayers=false;}
    viewing = true;
    errorMessage = '';
    const id = ++requestId;
    worker.postMessage({
      command:'view', requestId:id,
      viewKey:selectedViewKey, gridIdNative:chosen.gridIdNative,
      rect:{x,y,width,height}, offset,
      includeDefaultLayers:showSourceDefaultLayerOverlay
    });
  }
  async function navigateToOriginalTerrain(selection:SourceGridNavigationRequest){
    // These source ZIPs are independently loaded and self-consistent only.
    // Match the exact original layout + Grid.ID + GridDataPath; no saved
    // Grid ID, player position or placement legality is inferred.
    const resolved=matchSourceGridToLocalTerrain(selection,{
      gameVersion:version||null,platform:platform||null,
      manifestRawSha256,layouts
    });
    if(resolved.status!=='ready'||!resolved.viewKey||
      resolved.nativeGridId===null){
      terrainLinkNotice=resolved.status==='zip_not_loaded'
        ? '先に下の「非公開DB-04 ZIP」を開いてください。'
        : resolved.status==='source_version_mismatch'
        ? '原本参照グラフと地形ZIPのバージョンが一致しません。'
        : resolved.status==='ambiguous_terrain_view'
        ? '一致する原本地形ビューが複数あるため、自動選択できません。'
        : resolved.status==='source_default_count_mismatch'
        ? '原本参照グラフと地形ZIPの初期GridObject件数が一致しません。別の原本データが混在していないか確認してください。'
        : resolved.status==='source_default_count_unavailable'
        ? '初期GridObject件数を両方の原本データで確認できないため、自動選択できません。'
        : resolved.status==='source_manifest_mismatch'
        ? '原本参照グラフと地形ZIPのマニフェストSHA-256が一致しません。異なるスナップショットです。'
        : resolved.status==='source_manifest_unavailable'
        ? '原本のマニフェストSHA-256を確認できず、自動移動はできません。'
        : 'この部分的な地形ZIPには該当するGridが収録されていません。';
      return;
    }
    terrainLinkNotice='';
    const view=layouts.find(row=>row.viewKey===resolved.viewKey);
    if(!view)return;
    selectedRegion=view.regionKey;
    selectedViewKey=view.viewKey;
    selectedGridId=String(resolved.nativeGridId);
    resetAnchorFind();
    x=0;y=0;width=16;height=16;
    viewport=null;
    requestRegionAtlas();
    requestTerrainRaster();
    requestFloorMatch();
    requestWindow();
    await tick();
    terrainPanel?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function changeRegion() {
    const first=layouts.find(a=>a.regionKey===selectedRegion&&
      a.kind==='villageArea'&&a.grids.length) ??
      layouts.find(a=>a.regionKey===selectedRegion);
    selectedViewKey=first?.viewKey??'';
    changeLayout();
    requestRegionAtlas();
  }
  function changeLayout() {
    resetAnchorFind();
    resetGlobalFind();
    const grids = layouts.find(a => a.viewKey === selectedViewKey)?.grids ?? [];
    selectedGridId = grids.length ? String(grids[0].gridIdNative) : '';
    x = 0; y = 0; width = 16; height = 16;
    viewport = null;
    requestTerrainRaster();
    requestFloorMatch();
    requestWindow();
  }
  function changeGrid() {
    resetAnchorFind();
    resetGlobalFind();
    itemGridArea=null;
    x = 0; y = 0; width = 16; height = 16;
    viewport = null;
    requestTerrainRaster();
    requestFloorMatch();
    requestWindow();
  }
  function appendNextPage() {
    const next=viewport?.page.nextOffset;
    if(viewing||!viewport?.page.hasNextPage||typeof next!=='number'||!Number.isSafeInteger(next)||next<=offset)return;
    offset=next;
    requestWindow(false);
  }
  async function readZip(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    stop();
    layouts = [];
    regions = [];
    selectedRegion = '';
    viewport = null;
    displayedAnchors = [];
    version = '';
    manifestRawSha256=null;
    errorMessage = '';
    infoMessage = '';
    terrainLinkNotice='';
    resetAnchorFind();
    resetGlobalFind();
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip') ||
        file.size < 22 || file.size > 96 * 1024 * 1024) {
      errorMessage = 'DB-04の非公開スナップショットZIP（96 MiB以下）を選択してください。';
      input.value = '';
      return;
    }
    loading = true;
    const id = ++requestId;
    const owned = new Worker(
      new URL('../../../lib/world/world-preview.worker.ts', import.meta.url),
      { type:'module' });
    worker = owned;
    owned.onmessage = (message:MessageEvent) => {
      if (owned !== worker) return;
      const result = message.data;
      if(result?.kind==='effective-diff-draft'||(result?.kind==='error'&&result.requestId===draftRequest)){
        if(result.requestId!==draftRequest||draftRevision!==$localSaveSession.revision||
          diffViewKey!==selectedViewKey||diffGridId!==Number(selectedGridId))return;
        draftWorking=false;
        if(result.kind==='effective-diff-draft'&&result.viewKey===diffViewKey&&result.gridIdNative===diffGridId&&result.result){
          effectiveDraft=result.result as DiffResult;
        }else{draftFailed=true;effectiveDraft=null;}
        return;
      }
      if(result?.kind==='effective-diff'||(result?.kind==='error'&&result.requestId===diffRequest)){
        if(result.requestId!==diffRequest||diffViewKey!==selectedViewKey||diffGridId!==Number(selectedGridId))return;
        diffWorking=false;
        if(result.kind==='effective-diff'&&result.viewKey===diffViewKey&&result.gridIdNative===diffGridId){
          effectiveDiff=result.result as DiffResult|null;
        }else{diffFailed=true;effectiveDiff=null;}
        return;
      }
      if(result?.kind==='saved-shapes'||(result?.kind==='error'&&result.requestId===savedShapeRequest)){
        if(result.requestId!==savedShapeRequest||!savedSourceCandidates||
          saveComparisonRevision!==$localSaveSession.revision)return;
        const map=result.result as SavedShapeMap|undefined;
        const layout=layouts.find(v=>v.viewKey===selectedViewKey);
        const grid=layout?.grids.find(g=>String(g.gridIdNative)===selectedGridId);
        if(result.kind==='saved-shapes'&&map&&map.layoutId===layout?.layoutId&&
          map.gridIdNative===grid?.gridIdNative&&map.gridDataPath===grid?.gridDataPath&&
          map.objects.length===savedSourceCandidates.points.length)savedShapeMap=map;
        return;
      }
      if(result?.kind==='floor-layer-inspect'||
         (result?.kind==='error'&&
          result.requestId===floorLayerInspectionRequestId)){
        if(result.requestId!==floorLayerInspectionRequestId)return;
        floorLayerInspecting=false;
        if(result.kind==='error'){
          floorLayerInspectionError='原本レイヤーを確認できませんでした。';
          floorLayerInspection=null;
          return;
        }
        const inspected=result.result as SourceLayerInspection;
        const selected=layouts.find(row=>row.viewKey===selectedViewKey);
        const grid=selected?.grids.find(
          row=>String(row.gridIdNative)===selectedGridId);
        if(inspected?.contract!=='wand.db04.source-layer-local-inspection@1'||
           inspected.viewKey!==selectedViewKey||
           inspected.gridIdNative!==grid?.gridIdNative||
           inspected.gridDataPath!==grid?.gridDataPath||
           inspected.placementLegalityVerified!==false)return;
        floorLayerInspection=inspected;
        floorLayerInspectionError='';
        return;
      }
      if(result?.kind==='floor-items'||
        (result?.kind==='error'&&result.requestId===floorSearchRequestId)){
        if(result.requestId!==floorSearchRequestId)return;
        floorSearchLoading=false;
        if(result.kind==='error'){floorItemMatches=[];return;}
        if(result.query!==floorSearchQuery)return;
        floorItemMatches=Array.isArray(result.items)
          ?result.items as OriginalFloorItem[]:[];
        return;
      }
      if(result?.kind==='floor-match'||
        (result?.kind==='error'&&result.requestId===floorMatchRequestId)){
        if(result.requestId!==floorMatchRequestId)return;
        floorMatchLoading=false;
        if(result.kind==='error'){
          floorMatchResult=null;
          floorWindowResult=null;
          floorMatchError=String(result.message??'原本地形の条件を照合できません。');
          return;
        }
        const matched=result.result as NativeFloorMatchResult;
        const view=layouts.find(row=>row.viewKey===selectedViewKey);
        const grid=view?.grids.find(row=>String(row.gridIdNative)===selectedGridId);
        if(matched?.contract!=='wand.db04.original-floor-mask-bit-overlap@1'||
          matched?.regionKey!==selectedRegion||
          matched?.gridDataPath!==grid?.gridDataPath||
          matched?.item?.itemId!==selectedFloorItem?.itemId)return;
        const bounds=result.windowResult as NativeFloorWindowResult;
        if(bounds?.contract!=='wand.db04.original-mapped-gridarea-floor-window@2'||
           bounds?.regionKey!==selectedRegion||
           bounds?.viewKey!==selectedViewKey||
           bounds?.gridIdNative!==grid?.gridIdNative||
           bounds?.gridDataPath!==grid?.gridDataPath||
           bounds?.itemId!==selectedFloorItem?.itemId||
           bounds?.orientationCode!==floorOrientationCode){
          floorMatchResult=null;
          floorWindowResult=null;
          floorMatchError='原本座標または家具の選択が一致しません。';
          return;
        }
        floorMatchResult=matched;
        floorWindowResult=bounds;
        floorMatchError='';
        return;
      }
      if(result?.kind==='region-atlas'||
         (result?.kind==='error'&&
          result?.requestId===regionAtlasRequestId)){
        if(result.requestId!==regionAtlasRequestId)return;
        regionAtlasLoading=false;
        if(result.kind==='error'){
          regionAtlasError=String(result.message??'地域地形の表示に失敗しました。');
          return;
        }
        const next=result.result as SourceRegionAtlasPage;
        if(next?.status!=='source_region_grid_atlas'||
          next.regionKey!==selectedRegion)return;
        if(next.offset===0){
          regionAtlas=next;
        }else if(regionAtlas?.regionKey===next.regionKey&&
          regionAtlas.nextOffset===next.offset){
          regionAtlas={...next,offset:0,
            tiles:[...regionAtlas.tiles,...next.tiles]};
        }
        regionAtlasError='';
        return;
      }
      if (result?.kind==='terrain-raster'||
          (result?.kind==='error'&&result?.requestId===terrainRasterRequestId)) {
        if(result?.requestId!==terrainRasterRequestId)return;
        terrainRasterLoading=false;
        if(result.kind==='error'){
          terrainRasterEnvelope=null;
          terrainRasterStatus=String(result.message??'原本地形の取得に失敗しました。');
          return;
        }
        const selected=layouts.find(row=>row.viewKey===selectedViewKey);
        const grid=selected?.grids.find(row=>String(row.gridIdNative)===selectedGridId);
        if(!selected||!grid||result.viewKey!==selected.viewKey||
          result.gridIdNative!==grid.gridIdNative||
          result.gridDataPath!==grid.gridDataPath)return;
        const raster=result.result as TerrainRaster|{status:string};
        if(raster?.status==='source_corroborated_grid_local_raster'&&
           (raster as TerrainRaster).nativeFloorValues instanceof Uint32Array) {
          terrainRasterEnvelope={viewKey:selected.viewKey,
            gridIdNative:grid.gridIdNative,gridDataPath:grid.gridDataPath,
            raster:raster as TerrainRaster,
            objectMap:result.objectMap?.layoutId===selected.layoutId&&
              result.objectMap?.gridIdNative===grid.gridIdNative&&
              result.objectMap?.gridDataPath===grid.gridDataPath?result.objectMap:null};
          terrainRasterStatus='';
        }else{
          terrainRasterEnvelope=null;
          terrainRasterStatus=String(raster?.status??'原本地形を表示できません。');
        }
        return;
      }
      if (result?.requestId !== requestId) return;
      if (result.kind === 'error') {
        errorMessage = String(result.message || 'Worldデータの読込に失敗しました。');
        loading = false;
        viewing = false;
        findingAnchor=false;
        findingGlobal=false;
        loadingAreaWindow=false;
        loadingCellLayers=false;
        probingCandidate=false;
        return;
      }
      if (result.kind === 'loaded') {
        loading = false;
        version = String(result.gameVersion);
        platform = String(result.platform);
        integrity = String(result.integrity);
        manifestFilesVerified = Number(result.manifestFilesVerified);
        manifestRawSha256=typeof result.manifestRawSha256==='string'
          ?result.manifestRawSha256:null;
        layouts = result.layouts as LayoutOption[];
        regions = Array.isArray(result.regionCoverage)
          ? result.regionCoverage as RegionCoverage[] : [];
        selectedRegion=layouts.some(a=>a.regionKey==='Village04')
          ?'Village04':(layouts[0]?.regionKey??'');
        const defaultView=layouts.find(a=>a.regionKey===selectedRegion&&
          a.kind==='villageArea'&&a.grids.length) ??
          layouts.find(a=>a.regionKey===selectedRegion&&a.grids.length);
        selectedViewKey=defaultView?.viewKey??'';
        selectedGridId=defaultView?.grids[0]
          ?String(defaultView.grids[0].gridIdNative):'';
        infoMessage = 'ローカルZIP内のマニフェスト整合性を確認しました。原本の真正性までは証明していません。';
        if(selectedRegion)requestRegionAtlas();
        if (selectedGridId){
          requestFloorMatch();
          requestTerrainRaster();
          requestWindow();
        }
        return;
      }
      if(result.kind==='candidate-probe'){
        probingCandidate=false;
        const raw=result.result as SourceDefaultCandidateLayerProbe;
        const link=itemAreaLink;
        const selected=layouts.find(row=>row.viewKey===selectedViewKey);
        const grid=selected?.grids.find(row=>String(row.gridIdNative)===selectedGridId);
        if(raw?.contract!=='wand.db04.source-default-candidate-layer-probe@1'||
           raw.sourceLayoutId!==selected?.layoutId||
           raw.nativeGridId!==grid?.gridIdNative||
           raw.sourceGridDataPath!==grid?.gridDataPath||
           raw.originalGridObjectId!==link?.nativeGridObjectId||
           raw.itemId!==link?.itemId||
           raw.candidateAnchorX!==candidateX||
           raw.candidateAnchorY!==candidateY||
           raw.candidateOrientationCode!==candidateOrientation){
          candidateProbe=null;
          candidateProbeError='原本候補と現在の選択が一致しません。';
          return;
        }
        candidateProbe=raw;
        candidateProbeError=raw.status==='original_source_not_available'
          ?'この原本Itemの既定形状を確認できません。':'';
        return;
      }
      if(result.kind==='grid-cell-layers'){
        loadingCellLayers=false;
        const raw=result.result as OriginalDefaultGridLayersCell;
        const selection=selectedCell;
        const selected=layouts.find(row=>row.viewKey===selectedViewKey);
        const grid=selected?.grids.find(row=>String(row.gridIdNative)===selectedGridId);
        if(raw?.contract!=='wand.db04.original-default-gridlayers-cell@1'||
           !selection||raw.x!==selection.x||raw.y!==selection.y||
           raw.sourceLayoutId!==selected?.layoutId||
           raw.nativeGridId!==grid?.gridIdNative||
           raw.gridDataPath!==grid?.gridDataPath){
          selectedCellLayers=null;
          return;
        }
        selectedCellLayers=raw;
        return;
      }
      if(result.kind==='gridarea-window'){
        loadingAreaWindow=false;
        const raw=result.result as SourceLocalGridAreaWindow;
        if(raw?.contract!=='wand.db04.original-gridarea-local-window@1'||
           raw.itemId!==itemGridArea?.itemId||
           raw.orientationCode!==areaOrientation||
           raw.callerGridFactor!==areaFactor){
          areaWindow=null;
          areaWindowError='原本GridAreaの応答が現在のItemと一致しません。';
          return;
        }
        areaWindow=raw;
        areaWindowError=raw.status==='source_native_local_layers'?''
          :'この原本GridAreaの表示範囲は未検証です。';
        return;
      }
      if (result.kind==='global-anchor-found'){
        findingGlobal=false;
        const match=result.result as GlobalOriginalItemAnchorResult;
        if(match.contract!=='wand.db04.global-original-item-anchor-finder@1'||
          match.itemId!==Number(globalItemSearch.trim())){
          globalFindResult=null;
          globalFindMessage='原本検索結果と入力値が一致しません。';
          return;
        }
        globalFindResult=match;
        const sourceAreaLink=result.areaLink as OriginalGridObjectAreaLink|null;
        const evidence=result.itemEvidence as OriginalGridAreaEvidence|undefined;
        itemGridArea=evidence?.contract==='wand.db04.original-gridarea-raw-evidence@1'&&
          evidence.itemId===match.itemId?evidence:null;
        if(match.status==='found'&&match.sourceLayoutId&&
           match.nativeGridId!==null&&match.gridDataPath&&
           match.sourceAnchorX!==null&&match.sourceAnchorY!==null){
          const candidates=layouts.filter(view=>
            view.kind==='gridCollection'&&
            view.layoutId===match.sourceLayoutId&&
            view.grids.some(grid=>grid.gridIdNative===match.nativeGridId&&
              grid.gridDataPath===match.gridDataPath&&grid.knownGridData));
          if(candidates.length!==1){
            globalFindMessage='原本参照に一致する地形ビューが一意に特定できません。';
            return;
          }
          const view=candidates[0];
          const grid=view.grids.find(grid=>
            grid.gridIdNative===match.nativeGridId&&
            grid.gridDataPath===match.gridDataPath)!;
          if(!grid.anchorSizeX||!grid.anchorSizeY){
            globalFindMessage='この原本Gridの座標範囲は未検証です。';
            return;
          }
          if(!sourceAreaLink||
             sourceAreaLink.contract!=='wand.db04.original-gridobject-item-area-link@1'||
             sourceAreaLink.sourceLayoutId!==match.sourceLayoutId||
             sourceAreaLink.nativeGridId!==match.nativeGridId||
             sourceAreaLink.nativeGridObjectId!==match.gridObjectIdNative||
             sourceAreaLink.itemId!==match.itemId||
             sourceAreaLink.originalAnchorX!==match.sourceAnchorX||
             sourceAreaLink.originalAnchorY!==match.sourceAnchorY||
             sourceAreaLink.originalOrientationCode===null||
             sourceAreaLink.originalGridTessellationFactor===null||
             sourceAreaLink.originalGridTessellationFactor!==grid.tessellationFactor){
            globalFindMessage='原本GridObjectとItem定義の対応を確認できません。';
            return;
          }
          selectedRegion=view.regionKey;
          selectedViewKey=view.viewKey;
          selectedGridId=String(grid.gridIdNative);
          // Native orientation and Grid factor belong to this exact original GridObject.
          areaOrientation=sourceAreaLink.originalOrientationCode;
          areaFactor=sourceAreaLink.originalGridTessellationFactor;
          resetAreaWindow();
          resetAnchorFind();
          itemAreaLink=sourceAreaLink;
          candidateX=sourceAreaLink.originalAnchorX!;
          candidateY=sourceAreaLink.originalAnchorY!;
          candidateOrientation=sourceAreaLink.originalOrientationCode!;
          const cx=match.sourceAnchorX,cy=match.sourceAnchorY;
          x=Math.max(0,Math.min(grid.anchorSizeX-1,cx-Math.floor(width/2)));
          y=Math.max(0,Math.min(grid.anchorSizeY-1,cy-Math.floor(height/2)));
          viewport=null;
          requestRegionAtlas();
          requestFloorMatch();
          requestTerrainRaster();
          globalFindMessage='原本初期配置 '+String(match.matchedIndex!+1)+
            ' / '+String(match.matchingOriginalDefaultObjectCount)+
            '件 · GridObject '+String(match.gridObjectIdNative)+
            ' · ('+cx+', '+cy+')。'+
            (match.unverifiedOriginalDefaultObjectCount>0
              ?'他に座標未検証の原本記録'+match.unverifiedOriginalDefaultObjectCount+'件。':'');
          requestWindow();
          selectedCell={x:cx,y:cy};
          void tick().then(()=>terrainPanel?.scrollIntoView({
            behavior:'smooth',block:'start'}));
        }else{
          globalFindMessage=match.status==='not_in_partial_original_source'
            ?'この部分的な原本ZIPに指定Item IDの初期配置はありません。'
            :match.status==='source_game_version_unverified'
            ?'このゲームバージョン・プラットフォームの原本座標は未検証です。'
            :match.status==='source_anchor_domain_unverified'
            ?'該当する原本Gridの座標範囲は未検証です。'
            :'この番号の原本初期配置候補はありません。';
        }
        return;
      }
      if (result.kind==='anchor-found') {
        findingAnchor=false;
        const found=result.result as OriginalItemAnchorFindResult;
        if(found.contract!=='wand.db04.native-item-anchor-finder@1'||
          found.sourceLayoutId!==layouts.find(row=>
            row.viewKey===selectedViewKey)?.layoutId||
          String(found.nativeGridId)!==selectedGridId||
          found.itemId!==Number(anchorItemSearch.trim())){
          anchorFindResult=null;
          anchorFindMessage='原本検索結果が現在の選択と一致しません。';
          return;
        }
        anchorFindResult=found;
        const sourceAreaLink=result.areaLink as OriginalGridObjectAreaLink|null;
        const evidence=result.itemEvidence as OriginalGridAreaEvidence|undefined;
        itemGridArea=evidence?.contract==='wand.db04.original-gridarea-raw-evidence@1'&&
          evidence.itemId===found.itemId?evidence:null;
        if(found.status==='found'&&
          typeof found.sourceAnchorX==='number'&&
          typeof found.sourceAnchorY==='number'){
          const chosen=layouts.find(row=>row.viewKey===selectedViewKey)
            ?.grids.find(row=>String(row.gridIdNative)===selectedGridId);
          if(!chosen||!chosen.anchorSizeX||!chosen.anchorSizeY)return;
          if(!sourceAreaLink||
             sourceAreaLink.contract!=='wand.db04.original-gridobject-item-area-link@1'||
             sourceAreaLink.sourceLayoutId!==found.sourceLayoutId||
             sourceAreaLink.nativeGridId!==found.nativeGridId||
             sourceAreaLink.nativeGridObjectId!==found.gridObjectIdNative||
             sourceAreaLink.itemId!==found.itemId||
             sourceAreaLink.originalAnchorX!==found.sourceAnchorX||
             sourceAreaLink.originalAnchorY!==found.sourceAnchorY||
             sourceAreaLink.originalOrientationCode===null||
             sourceAreaLink.originalGridTessellationFactor===null||
             sourceAreaLink.originalGridTessellationFactor!==chosen.tessellationFactor){
            anchorFindMessage='原本GridObjectとItem定義の対応を確認できません。';
            return;
          }
          areaOrientation=sourceAreaLink.originalOrientationCode;
          areaFactor=sourceAreaLink.originalGridTessellationFactor;
          resetAreaWindow();
          itemAreaLink=sourceAreaLink;
          candidateX=sourceAreaLink.originalAnchorX!;
          candidateY=sourceAreaLink.originalAnchorY!;
          candidateOrientation=sourceAreaLink.originalOrientationCode!;
          const cx=found.sourceAnchorX,cy=found.sourceAnchorY;
          x=Math.max(0,Math.min(chosen.anchorSizeX-1,
            cx-Math.floor(width/2)));
          y=Math.max(0,Math.min(chosen.anchorSizeY-1,
            cy-Math.floor(height/2)));
          anchorFindMessage='原本初期配置 '+String(found.matchedIndex!+1)+
            ' / '+String(found.matchingOriginalDefaultObjectCount)+
            '件。Gridローカル座標（'+cx+', '+cy+'）を表示します。';
          requestWindow();
          selectedCell={x:cx,y:cy};
        }else{
          anchorFindMessage=found.status==='not_in_source_grid'
            ? 'この部分的な原本Gridには、指定Item IDの初期配置はありません。'
            : found.status==='source_game_version_unverified'
            ? 'このゲームバージョンの原本アンカー検索は未検証です。'
            : found.status==='original_anchor_domain_unverified'
            ? 'このGridの原本アンカー座標範囲は未検証です。'
            : found.status==='original_grid_not_in_source'
            ? 'このGridはローカル原本ZIPに収録されていません。'
            : '指定番号の原本初期配置候補はありません。';
        }
        return;
      }
      if (result.kind === 'view') {
        viewing = false;
        if(result.page?.status==='source_native_default_layout_anchors_only'){
          const nextRecords=Array.isArray(result.page.defaultObjectAnchors)?result.page.defaultObjectAnchors as Anchor[]:[];
          displayedAnchors=offset===0?nextRecords:[...displayedAnchors,...nextRecords];
        }
        viewport = {
          page:result.page, markers:result.markers,
          terrainStatus:result.terrainStatus, terrainRows:result.terrainRows,
          defaultLayersWindow:result.defaultLayersWindow??null
        };
        const point=selectedCell;
        const rect=result.page?.rect as {x:number;y:number;width:number;height:number}|undefined;
        if(point&&result.page?.status==='source_native_default_layout_anchors_only'&&
           rect&&point.x>=rect.x&&point.y>=rect.y&&
           point.x<rect.x+rect.width&&point.y<rect.y+rect.height)
          requestSelectedCellLayers(point.x,point.y);
      }
    };
    owned.onerror = (error) => {
      error.preventDefault();
      if (owned !== worker) return;
      errorMessage = '専用WorkerでWorldデータを読み込めませんでした。';
      loading = false;
      viewing = false;
    };
    owned.onmessageerror = () => {
      if (owned !== worker) return;
      errorMessage = 'Worldデータの応答を読み取れませんでした。';
      loading = false;
      viewing = false;
    };
    owned.postMessage({command:'load', requestId:id, file});
    input.value = '';
  }
</script>

<svelte:head>
  <title>World Source Preview（開発用） | Dreamwish Wand</title>
  <meta name="robots" content="noindex, nofollow" />
  <meta name="description" content="Private DB-04 world-source ZIP preview, processed locally in your browser. Read-only original default anchors, not save editing." />
</svelte:head>

<section class="world-preview">
  <header>
    <p class="eyebrow">DEVELOPMENT · DB-04 WORLD</p>
    <h1>World Source Preview</h1>
    <p>元のゲームの初期配置レコードを、グリッド内のX/Y座標として確認する読み取り専用ページです。ワールド全体の配置座標、占有セル、移動可否は判定しません。</p>
  </header>

  <WorldMapPartsPreview/>
  <NativeGraphExplorer onOpenSourceGrid={navigateToOriginalTerrain} />
  {#if terrainLinkNotice}
    <p class="note" role="status">{terrainLinkNotice}</p>
  {/if}

  <div class="world-panel">
    <div class="world-toolbar">
      <label>非公開DB-04 ZIPを開く
        <input type="file" accept=".zip,application/zip"
          bind:this={fileInput} on:change={readZip} disabled={loading} />
      </label>
      <button type="button" on:click={clearAll} disabled={!worker && !version}>読み込み内容を破棄</button>
    </div>
    <p class="note">ZIPは端末内のWeb Workerで処理され、アップロード・永続保存されません。マニフェストのSHA-256一致は自己整合性の確認であり、ゲーム原本の真正性やソースの網羅性を証明しません。セーブファイルは扱いません。</p>
    {#if loading}<p role="status">ローカルZIPを検査しています…</p>{/if}
    {#if errorMessage}<p class="error" role="alert">{errorMessage}</p>{/if}
    {#if infoMessage}<p class="note" role="status">{infoMessage}</p>{/if}
  </div>

  {#if version}
    <div class="world-stats">
      <div><small>原本内の宣言バージョン</small><strong>{platform} {version}</strong></div>
      <div><small>SHA-256一致</small><strong>{manifestFilesVerified}ファイル</strong></div>
      <div><small>原本地域・RealmとAreaType参照</small><strong>{regionKeys.length}地域 · {regions.reduce((sum, entry) => sum + entry.areaReferenceCount, 0)}件</strong></div>
      <div><small>参照可能な原本ビュー</small><strong>{layouts.length}件</strong></div>
      <div><small>配置可否の検証</small><strong>未対応</strong></div>
    </div>
    {#if integrity !== 'manifest_sha256_self_consistent_not_original_source_authenticated'}
      <p class="error">未対応の検証状態です。</p>
    {/if}
    <div class="world-panel">
      <div class="anchor-find-row">
        <label>すべての原本GridからItem IDを探す
          <input type="search" inputmode="numeric"
            bind:value={globalItemSearch}
            on:input={()=>resetGlobalFind(false)}
            on:keydown={event=>{
              if(event.key==='Enter'&&!findingGlobal&&!viewing){
                event.preventDefault();
                findGlobalOriginalItem();
              }
            }}
            placeholder="原本全GridのItem ID"/>
        </label>
        <button type="button" disabled={!worker||findingGlobal||viewing}
          on:click={()=>findGlobalOriginalItem()}>
          原本全Gridを検索
        </button>
        {#if globalFindResult?.status==='found'&&
          globalFindResult.matchingOriginalDefaultObjectCount>1}
          <button type="button" disabled={findingGlobal||viewing}
            on:click={()=>stepGlobalOriginalItem(-1)}>前の候補</button>
          <button type="button" disabled={findingGlobal||viewing}
            on:click={()=>stepGlobalOriginalItem(1)}>次の候補</button>
        {/if}
      </div>
      {#if globalFindMessage}
        <p class="note" role="status">{globalFindMessage}
          原本の初期配置のみを検索しています。セーブの位置や配置可否は判定しません。</p>
      {/if}
    </div>
    <div class="world-panel" bind:this={terrainPanel}>
      <div class="selector-row">
        <label>原本地域
          <select bind:value={selectedRegion} on:change={changeRegion}>
            <option value="">すべての地域</option>
            {#each regionKeys as region}
              <option value={region}>{region}</option>
            {/each}
          </select>
        </label>
        <label>原本GridCollection / Realm / OffGrid / Village Area
          <select bind:value={selectedViewKey} on:change={changeLayout}>
            {#each filteredLayouts as layout}
              <option value={layout.viewKey}>{layout.label}</option>
            {/each}
          </select>
        </label>
        <label>Grid.IDと原本GridDataパス
          <select bind:value={selectedGridId} on:change={changeGrid}>
            {#each gridOptions as grid}
              <option value={String(grid.gridIdNative)}>
                {grid.gridIdNative} · {grid.gridDataPath} {grid.knownGridData ? '' : '（原本未収録）'}
              </option>
            {/each}
          </select>
        </label>
      </div>
      {#if visibleRegionAtlas}
        <NativeTerrainRegionAtlas atlas={visibleRegionAtlas}
          selectedViewKey={selectedViewKey} selectedGridId={selectedGridId}
          loadingMore={regionAtlasLoading} onPick={chooseAtlasGrid}
          onMore={()=>requestRegionAtlas(false)}/>
      {:else if regionAtlasLoading}
        <p class="note" role="status">地域の地形全体図を読み込んでいます…</p>
      {:else if regionAtlasError}
        <p class="note">{regionAtlasError}</p>
      {/if}
      {#if selectedRegionCoverage}
        <p class="note">このZIPに含まれる原本参照：
          {#if selectedRegionCoverage.realmLayoutCount > 0}
            Realmレイアウト {selectedRegionCoverage.realmLayoutCount}件、
          {:else if selectedRegionCoverage.offGridLayoutCount > 0}
            OffGridレイアウト {selectedRegionCoverage.offGridLayoutCount}件、
          {:else}
            AreaType {selectedRegionCoverage.areaReferenceCount}件
            （対応レイアウト {selectedRegionCoverage.resolvedAreaReferenceCount}件・未収録 {selectedRegionCoverage.missingAreaLayoutReferenceCount}件）、
          {/if}
          グリッド {selectedRegionCoverage.presentNativeGridReferenceCount}/{selectedRegionCoverage.nativeGridReferenceCount}件、
          初期配置アンカー {selectedRegionCoverage.sourceDefaultAnchorCount}件。
          {#if selectedRegionCoverage.separateAreaReferenceCount > 0}
            別地域への原本参照 {selectedRegionCoverage.separateAreaReferenceCount}件
            （収録 {selectedRegionCoverage.resolvedSeparateAreaReferenceCount}件・未収録 {selectedRegionCoverage.missingSeparateAreaReferenceCount}件）。
          {/if}
          収録件数はゲーム全体の網羅性・配置可否を示しません。</p>
      {/if}
      {#if selectedLayout?.kind === 'villageArea'}
        <p class="note">VillageのAreaType {selectedLayout.nativeAreaTypeCode}
          （{selectedLayout.nativeAreaTypeName ?? '名前未収録'}）から
          {selectedLayout.layoutId} への原本参照を追跡しています。
          {selectedLayout.missingReferencedLayout ? '参照先レイアウトは原本ZIPに未収録です。' : ''}
          ワールド座標への変換は行いません。</p>
      {/if}
      {#if selectedGrid}
        <MediaMapGridOverlay
          selection={selectedLayout&&selectedGrid.sizeX!==null&&selectedGrid.sizeY!==null
            ?{platform,gameVersion:version,regionKey:selectedRegion,viewKey:selectedViewKey,
              layoutId:selectedLayout.layoutId,nativeGridId:selectedGrid.gridIdNative,
              gridDataPath:selectedGrid.gridDataPath,sizeX:selectedGrid.sizeX,sizeY:selectedGrid.sizeY}:null}
          raster={activeTerrainRaster} candidates={floorWindowResult}
          objectMap={activeTerrainRaster?terrainRasterEnvelope?.objectMap??null:null}
          selectedItemId={selectedFloorItem?.itemId??null} orientationCode={floorOrientationCode}
          bind:active={mediaMapActive} bind:terrainMapActive={mediaTerrainMapActive} canNavigate={canNavigateTerrainRaster}
          onNavigate={jumpToTerrainRasterCell} onInspect={inspectFloorLayerAt}/>
        {#if activeTerrainRaster&&!mediaMapActive}
          <NativeTerrainGridOverview raster={activeTerrainRaster}
            canNavigate={canNavigateTerrainRaster}
            onNavigate={jumpToTerrainRasterCell}/>
        {:else if terrainRasterLoading}
          <p class="note" role="status">原本Grid全体の地形を読み込んでいます…</p>
        {:else if terrainRasterStatus}
          <p class="note">原本地形全体図：{terrainRasterStatus}</p>
        {/if}
        <SavedGridSourceCandidates shapeMap={savedShapeMap} file={$localSaveSession.file} bind:timeline={worldTimeline}
          receipt={savedSourceCandidates?.viewKey===selectedViewKey&&
            savedSourceCandidates.nativeGridId===Number(selectedGridId)&&
            saveComparisonRevision===$localSaveSession.revision
              ?savedSourceCandidates:null}
          available={Boolean($localSaveSession.file)&&
            platform==='Steam'&&version==='1.26.2'&&
            Boolean(selectedGrid.knownGridData)}
          working={saveComparisonLoading}
          errorMessage={saveComparisonError}
          onCompare={compareSelectedSaveToGrid}/>
        {#if diffViewKey===selectedViewKey&&diffGridId===Number(selectedGridId)}
          {#key diffRequest}
            <EffectiveDiffGridPreview result={effectiveDiff} working={diffWorking} failed={diffFailed}
              draft={effectiveDraft} {draftWorking} {draftFailed} onDraft={rehearseDiffGrid}/>
          {/key}
        {/if}
        <NativeTerrainFloorMatchPanel
          matches={floorItemMatches} selected={selectedFloorItem}
          result={floorMatchResult} windowResult={floorWindowResult} externalMap={mediaTerrainMapActive}
          orientationCode={floorOrientationCode}
          onOrientationChange={changeFloorOrientation}
          onInspect={inspectFloorLayerAt}
          inspection={floorLayerInspection} inspecting={floorLayerInspecting}
          inspectionError={floorLayerInspectionError}
          searching={floorSearchLoading}
          loading={floorMatchLoading} errorMessage={floorMatchError}
          onSearch={searchFloorItems} onPick={chooseFloorItem}
          onClear={clearFloorItem}/>
        <p class="note">選択Grid内の初期配置記録：{selectedGrid.defaultObjectCount ?? '不明'}件。
          地形データ：{selectedGrid.knownGridData ? '原本レコードあり' : '参照先未収録'}。
          地形GridDataの寸法：{selectedGrid.sizeX ?? '?'} × {selectedGrid.sizeY ?? '?'}。
          {#if selectedGrid.anchorDomainStatus === 'steam1262_original_factor_two_anchor_envelope'}
            原本GridのTessellationFactor：{selectedGrid.tessellationFactor}。
            原本アンカーX/Yの観測上の範囲：
            {selectedGrid.anchorSizeX} × {selectedGrid.anchorSizeY}。
            地形とアンカーの座標変換は未検証です。
          {/if}
        </p>
        <div class="anchor-find-row">
          <label>原本Item ID
            <input type="search" inputmode="numeric"
              bind:value={anchorItemSearch}
              on:input={()=>{resetAnchorFind(false);itemGridArea=null;}}
              placeholder="原本初期配置のItem ID"/>
          </label>
          <button type="button" on:click={()=>findNativeItemAnchor()}
            disabled={!worker||findingAnchor||viewing||!selectedGrid.knownGridData}>
            原本初期配置を探す
          </button>
          {#if anchorFindResult?.status==='found'&&
            anchorFindResult.matchingOriginalDefaultObjectCount>1}
            <button type="button" on:click={findNextNativeItemAnchor}
              disabled={findingAnchor||viewing}>次の一致</button>
          {/if}
        </div>
        {#if anchorFindMessage}
          <p class="note" role="status">{anchorFindMessage}
            検索位置はセーブの座標・配置可否を意味しません。</p>
        {/if}
        <div class="coord-row">
          <label>X <input type="number" min="0" bind:value={x} /></label>
          <label>Y <input type="number" min="0" bind:value={y} /></label>
          <label>幅 <input type="number" min="1" max="32" bind:value={width} /></label>
          <label>高さ <input type="number" min="1" max="32" bind:value={height} /></label>
          <button type="button" on:click={() => requestWindow()} disabled={viewing}>表示範囲を更新</button>
        </div>
      {/if}
    </div>

    {#if itemGridArea}
      <div class="world-panel" aria-label="原本Item GridArea情報">
        <div class="view-head">
          <h2>Item {itemGridArea.itemId} · 原本GridArea</h2>
          <span>{itemGridArea.nativeType??'定義未確認'}</span>
        </div>
        {#if itemAreaLink&&itemAreaLink.itemId===itemGridArea.itemId}
          <p class="note" aria-label="原本初期配置のItem参照">
            原本初期配置 GridObject {itemAreaLink.nativeGridObjectId} ·
            向き {itemAreaLink.originalOrientationCode} ·
            Grid倍率 ×{itemAreaLink.originalGridTessellationFactor} ·
            原本アンカー ({itemAreaLink.originalAnchorX}, {itemAreaLink.originalAnchorY})。
            {#if itemAreaLink.status==='original_item_default_gridarea_linked'}
              Item定義からのGridArea参照を確認しました。
              表示するサイズ・原値はローカルであり、アンカーからの占有範囲ではありません。
              {#if itemAreaLink.sourceDefaultBoundingRect}
                原本既定GridAreaの外接枠：
                ({itemAreaLink.sourceDefaultBoundingRect.x},
                {itemAreaLink.sourceDefaultBoundingRect.y}) ·
                {itemAreaLink.sourceDefaultBoundingRect.width} ×
                {itemAreaLink.sourceDefaultBoundingRect.height}。
                外接枠の中がすべて占有セルという意味ではありません。
              {:else}
                原本Item既定枠がGrid境界と整合しないため、外接枠は表示しません。
              {/if}
            {:else}
              Itemの形状定義はこの部分的な原本データでは特定できません。
            {/if}
          </p>
        {/if}
        {#if itemGridArea.status==='source_raw_gridarea_available'}
          <p class="note">原本GridAreaのサイズ：
            {itemGridArea.rawSizeX} × {itemGridArea.rawSizeY}。
            原本レイヤー配列：{itemGridArea.rawLayerSlotCount}値
            （非ゼロ {itemGridArea.nonzeroRawLayerSlotCount}値、
            異なる値 {itemGridArea.distinctRawLayerValueCount}種類）。
            床タイプフラグ原値：{itemGridArea.acceptedFloorTypesFlag}。
            {#if itemGridArea.strideOverrideWireFieldPresent}
              StrideOverride原値：{itemGridArea.strideOverride}。
            {/if}
          </p>
          <p class="note">レイヤー原値と出現数（最大8種類）：
            {itemGridArea.mostFrequentRawValues.map(row=>
              `${row.value} × ${row.count}`).join(' · ')}
          </p>
          <p class="note">全16方向の原本ローカル値を参照できます。
            配列の非ゼロ値は占有セル数ではありません。
            実際のGridへの座標変換・衝突判定・配置可否は未検証です。</p>
          {#if itemAreaLink?.status==='original_item_default_gridarea_linked'&&
                selectedLayout?.layoutId===itemAreaLink.sourceLayoutId&&
                selectedGrid?.gridIdNative===itemAreaLink.nativeGridId}
            <details class="candidate-probe" open={candidateExpanded}
              on:toggle={(event)=>candidateExpanded=(event.currentTarget as HTMLDetailsElement).open}>
              <summary>候補位置の原本レイヤー照合</summary>
              <div class="coord-row">
                <label>候補 X
                  <input type="number" min="0" step="1" bind:value={candidateX}
                    on:input={()=>{candidateProbe=null;candidateProbeError=''}}/>
                </label>
                <label>候補 Y
                  <input type="number" min="0" step="1" bind:value={candidateY}
                    on:input={()=>{candidateProbe=null;candidateProbeError=''}}/>
                </label>
                <label>候補の向き
                  <select bind:value={candidateOrientation}
                    on:change={()=>{candidateProbe=null;candidateProbeError=''}}>
                    {#each areaOrientations as code}
                      <option value={code}>{code}</option>
                    {/each}
                  </select>
                </label>
                <button type="button" on:click={requestCandidateProbe}
                  disabled={probingCandidate||viewing||findingGlobal||findingAnchor}>
                  {probingCandidate?'照合中…':'原本レイヤーの重なりを確認'}
                </button>
              </div>
              {#if candidateProbeError}
                <p class="note" role="status">{candidateProbeError}</p>
              {/if}
              {#if candidateProbe?.status==='source_default_candidate_layers_observed'}
                <p class="note" role="status" aria-label="原本候補レイヤー照合結果">
                  原本既定形状 {candidateProbe.candidateDefaultWidth} ×
                  {candidateProbe.candidateDefaultHeight}。
                  原本レイヤー共通ビット {candidateProbe.rawSharedBitCellCount}セル、
                  他Itemの原本定義が不完全な可能性
                  {candidateProbe.potentiallyUnknownOtherSourceCellCount}セル。
                  元のGridObject自身は比較対象から除外しています。
                </p>
                <p class="note">共通ビットはゲーム内衝突・配置不可の判定ではありません。
                  この仮置きはセーブファイルを変更しません。</p>
              {:else if candidateProbe?.status==='source_default_candidate_outside_original_grid_extent'}
                <p class="note" role="status">候補の既定外接枠は原本Grid範囲外です。
                  ランタイムの形状・配置可否は未検証です。</p>
              {:else if candidateProbe?.status==='source_default_candidate_exceeds_probe_limit'}
                <p class="note" role="status">既定形状が32×32の照合範囲を超えるため、
                  セル単位の重なりを表示できません。</p>
              {/if}
            </details>
          {/if}
          <div class="coord-row">
            <label>原本GridAreaの向き
              <select bind:value={areaOrientation}
                on:change={()=>{areaX=0;areaY=0;resetAreaWindow();}}>
                {#each areaOrientations as code}
                  <option value={code}>{code===8?'8 · 元の向き':code+' · '+((8-code+16)%16*22.5)+'°'}</option>
                {/each}
              </select>
            </label>
            <label>原本Grid参照倍率
              <select bind:value={areaFactor}
                on:change={()=>{areaX=0;areaY=0;resetAreaWindow();}}>
                <option value={1}>×1</option>
                <option value={2}>×2</option>
              </select>
            </label>
            <label>ローカルX
              <input type="number" min="0" bind:value={areaX}
                on:input={resetAreaWindow}/>
            </label>
            <label>ローカルY
              <input type="number" min="0" bind:value={areaY}
                on:input={resetAreaWindow}/>
            </label>
            <button type="button" on:click={requestAreaWindow}
              disabled={loadingAreaWindow||viewing||findingGlobal||findingAnchor}>
              原本レイヤー値を表示
            </button>
          </div>
          {#if areaWindowError}
            <p class="note" role="status">{areaWindowError}</p>
          {/if}
          {#if areaWindow?.status==='source_native_local_layers'&&areaWindow.rect&&areaWindow.rows}
            <p class="note">原本GridArea単体のローカル値（最大16×16）・
              入力倍率 ×{areaWindow.callerGridFactor}。
              {#if areaWindow.unmappedOriginalLocalCellCount>0}
                対応先なし {areaWindow.unmappedOriginalLocalCellCount}セル（空きマスではありません）。
              {/if}
              GridObjectの設置位置や占有セルではありません。
              {#if selectedGrid?.tessellationFactor===2}
                現在選択中の原本Grid記録のTessellationFactorは2です。
                このItemへの適用は未検証です。
              {/if}
            </p>
            <div class="map-scroll" aria-label="原本GridAreaセル一覧">
              <div class="gridarea-raw-matrix"
                style={'grid-template-columns:repeat(' + areaWindow.rect.width + ',minmax(42px,auto))'}>
                {#each areaWindow.rows as row,iy}
                  {#each row as value,ix}
                    <span class="gridarea-raw-cell"
                      title={`ローカル (${areaWindow.rect.x+ix},${areaWindow.rect.y+iy}) · ${value===null?'原本セル対応先なし':'原本レイヤー値 '+value}`}
                      aria-label={`原本セル${areaWindow.rect.x+ix},${areaWindow.rect.y+iy}：${value===null?'対応先なし':value}`}>
                      {value===null?'—':value}
                    </span>
                  {/each}
                {/each}
              </div>
            </div>
          {/if}
        {:else}
          <p class="note">
            {itemGridArea.status==='item_has_no_source_gridarea'
              ? 'このItem定義に原本GridAreaは記録されていません。配置不可とは判定しません。'
              :itemGridArea.status==='item_not_in_partial_original_source'
              ? 'この部分的な原本ZIPにItem定義がありません。'
              :'この原本バージョンのGridArea情報は未検証です。'}
          </p>
        {/if}
      </div>
    {/if}

    {#if viewing}<p class="note" role="status">グリッドの原本座標を集計しています…</p>{/if}
    {#if viewport?.page.status === 'source_native_default_layout_anchors_only'}
      <div class="world-panel">
        <div class="view-head">
          <h2>初期配置アンカーの座標</h2>
          <span>{viewport.page.matchingNativeDefaultAnchorCount ?? 0}件（表示範囲内）</span>
        </div>
        <p class="note">
          点と数字は原本に記録された初期配置のX/Yアンカー件数です。オブジェクトが占有する範囲ではありません。
          地形：{viewport.terrainStatus === 'source_corroborated_grid_local_preview'
            ? `Steam v${version} 原本グリッドローカル値（配置可否は未検証）`
            : viewport.terrainStatus === 'native_terrain_not_projected_to_source_anchor_coordinates'
              ? '初期配置アンカーと地形セルの座標対応が未検証のため、地形は重ねていません'
              : '未検証・表示不可'}。
          {#if viewport.terrainStatus === 'source_corroborated_grid_local_preview'}
            セルの色は原本のマスク値を識別するための便宜的な色です。
          {/if}
          {#if visibleSourceDefaultBounds}
            点線は原本Item既定GridAreaの外接枠です（占有セル・衝突判定ではありません）。
          {/if}
        </p>
        <label class="source-grid-layers-toggle">
          <input type="checkbox" bind:checked={showSourceDefaultLayerOverlay}
            on:change={()=>requestWindow(true,true)}/>
          原本Itemの既定レイヤー
        </label>
        {#if activeLayerWindow}
          <p class="note" aria-label="原本既定レイヤー凡例">
            小点＝既定レイヤーの非0値、破線＝原本定義がないItemの影響可能性。
            空きマスや配置許可を示しません。
          </p>
        {/if}
        <div class="map-scroll">
          <div class="grid-source-bounds-canvas">
            <div class="grid-view" style={'grid-template-columns: repeat(' + width + ', 24px)'}>
              {#each cells as cell (`${cell.x}:${cell.y}`)}
              <button type="button" class:has-anchor={cell.count > 0}
                class:has-source-default-layer={cell.originalDefaultLayer!==null&&cell.originalDefaultLayer!==0}
                class:source-default-possibly-unknown={cell.possibleUnknown>0}
                class:candidate-source-shared-bits={(cell.candidate?.rawSharedBits??0)>0}
                class:candidate-source-possibly-unknown={(cell.candidate?.potentiallyUnknownOtherSourceCount??0)>0}
                class:current={selectedCell?.x === cell.x && selectedCell?.y === cell.y}
                style:background-color={floorTint(cell.nativeFloorValue)}
                on:click={() => selectGridCell(cell.x,cell.y)}
                title={`Grid local (${cell.x},${cell.y}); source anchors: ${cell.count}; native floor mask: ${cell.nativeFloorValue ?? 'unverified'}; source Item DEFAULT GridLayers: ${cell.originalDefaultLayer===null?'not calculated':'0x'+cell.originalDefaultLayer.toString(16)}; possible unresolved: ${cell.possibleUnknown}; candidate raw shared bits: ${cell.candidate?'0x'+cell.candidate.rawSharedBits.toString(16):'not probed'}; not occupancy`}
                aria-label={`座標${cell.x},${cell.y}：アンカー${cell.count}件`}>
                {cell.count > 0 ? Math.min(cell.count, 99) : ''}
              </button>
              {/each}
            </div>
            {#if visibleSourceDefaultBounds}
              <div class="grid-source-default-outline"
                aria-label="原本Item既定GridArea外接枠"
                style={'left:'+visibleSourceDefaultBounds.left+'px;top:'+
                  visibleSourceDefaultBounds.top+'px;width:'+
                  visibleSourceDefaultBounds.width+'px;height:'+
                  visibleSourceDefaultBounds.height+'px'}></div>
            {/if}
            {#if visibleCandidateBounds}
              <div class="grid-source-candidate-outline"
                aria-label="仮置きの原本既定GridArea外接枠"
                style={'left:'+visibleCandidateBounds.left+'px;top:'+
                  visibleCandidateBounds.top+'px;width:'+
                  visibleCandidateBounds.width+'px;height:'+
                  visibleCandidateBounds.height+'px'}></div>
            {/if}
          </div>
        </div>
        {#if selectedCell}
          <p class="note">座標（{selectedCell.x}, {selectedCell.y}）の初期配置アンカー：{selectedPointCount}件。
            地形マスク：{selectedFloorValue ?? '未検証'}。
            ページ一覧に全件が含まれるとは限りません。</p>
          {#if loadingCellLayers}
            <p class="note" role="status">原本レイヤー値を照合中…</p>
          {:else if selectedCellLayers?.status==='source_item_default_layer_or_only'}
            <div class="source-cell-layer" aria-label="原本既定GridLayers照会">
              <strong>Item既定レイヤー OR：
                0x{selectedCellLayers.rawDefaultItemLayerOr!.toString(16).toUpperCase().padStart(8,'0')}</strong>
              <span>参照{selectedCellLayers.sourceDefaultContributorCount}件
                {#if selectedCellLayers.unresolvedSourceItemCount>0}
                  · Item定義未収録 {selectedCellLayers.unresolvedSourceItemCount}件
                {/if}
                {#if selectedCellLayers.unresolvedSourceGridAreaCount>0}
                  · 形状未定義 {selectedCellLayers.unresolvedSourceGridAreaCount}件
                {/if}
              </span>
              <p class="note">原本初期配置の既定Item定義から計算した値です。
                0でも空きマスとは判定できません。ランタイムの占有・衝突・配置可否とは別です。</p>
              {#if selectedCellLayers.contributors.length>0}
                <details>
                  <summary>対応する原本GridObjectを表示（{selectedCellLayers.sourceDefaultContributorCount}件）</summary>
                  {#each selectedCellLayers.contributors as contributor (contributor.nativeGridObjectId)}
                    <p class="note">GridObject {contributor.nativeGridObjectId} ·
                      Item {contributor.itemId} · レイヤー原値 {contributor.rawGridLayerValue}
                      · 原本向き {contributor.originalOrientationCode}</p>
                  {/each}
                  {#if selectedCellLayers.contributorListTruncated}
                    <p class="note">一覧は先頭{selectedCellLayers.contributors.length}件のみです。</p>
                  {/if}
                </details>
              {/if}
            </div>
          {/if}
        {/if}
      </div>

      <div class="world-panel">
        <div class="view-head"><h2>原本の初期配置レコード</h2><span>{displayedAnchors.length.toLocaleString()}件表示</span></div>
        <p class="note">この一覧は現在のセーブや編集対象ではありません。レコードIDと原本X/Y、向きを参照できます。</p>
        <div class="record-list">
          {#each displayedAnchors as record (record.layoutObjectId)}
            <div class="record">
              <strong>Item {record.itemId}</strong>
              <span>GridObject {record.gridObjectIdNative}</span>
              <span>X {record.x} · Y {record.y}</span>
              <span>Orientation {record.orientationCode} {record.orientationName ?? ''}</span>
            </div>
          {/each}
          {#if displayedAnchors.length === 0}
            <p class="note">この範囲・ページに初期配置アンカーの記録はありません。占有セルが存在しないという意味ではありません。</p>
          {/if}
        </div>
        {#if viewport.page.hasNextPage}
          <div class="paging auto-sentinel" use:autoAppend={{hasMore:()=>Boolean(viewport?.page.hasNextPage)&&!viewing&&!errorMessage&&typeof viewport?.page.nextOffset==='number'&&viewport.page.nextOffset>offset,load:appendNextPage}}
            role="status" aria-label="スクロールで初期配置レコードを追加表示"></div>
        {/if}
      </div>
    {:else if viewport}
      <div class="world-panel error">このレイアウトは部分的な原本データです：{viewport.page.status}</div>
    {/if}
  {/if}
</section>

<style>
  .world-preview { width:min(1180px,100%); margin:0 auto; padding:48px clamp(18px,4vw,56px) 76px; }
  header h1 {font-size:clamp(30px,5vw,50px);letter-spacing:-.05em;margin:10px 0;}
  header p:not(.eyebrow) {max-width:820px;color:#aea0c0;line-height:1.8;font-size:14px;}
  .world-panel {margin:20px 0;padding:22px;background:#1c1728;border:1px solid #ffffff22;border-radius:15px;min-width:0;max-width:100%;overflow-x:clip;}
  .world-toolbar,.selector-row,.coord-row,.anchor-find-row,.view-head,.paging {display:flex;align-items:end;gap:14px;flex-wrap:wrap;}
  .anchor-find-row {margin-top:14px;}
  .anchor-find-row label {flex:1 1 220px;min-width:0;}
  .anchor-find-row input[type=search] {background:#292039;color:#eee7f6;border:1px solid #ffffff31;border-radius:8px;padding:9px 10px;max-width:100%;width:100%;font:inherit;}
  .world-toolbar {justify-content:space-between;}
  .world-toolbar label {flex:1 1 240px;min-width:0;max-width:100%;}
  .world-toolbar input[type=file] {display:block;width:100%;min-width:0;max-width:100%;}
  .selector-row {align-items:stretch;}
  .selector-row label {flex:1;min-width:200px;}
  label {display:grid;gap:9px;color:#d7c7e8;font-size:12px;}
  select,input[type=number],input[type=file] {background:#292039;color:#eee7f6;border:1px solid #ffffff31;border-radius:8px;padding:9px 10px;max-width:100%;font:inherit;}
  select {width:100%;min-width:0;}
  input[type=number] {width:75px;}
  button {border-radius:8px;background:#403254;border:1px solid #ffffff24;padding:9px 12px;color:#eaddf6;font:inherit;font-size:12px;}
  button:not(:disabled):hover {background:#55406e;}
  .world-stats {display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:20px;}
  .world-stats div {border-radius:12px;padding:15px;background:#241b31;display:grid;gap:8px;}
  .world-stats small {font-size:11px;color:#a999bb;}
  .world-stats strong {font-size:14px;}
  .note {font-size:12px;color:#b8aac8;line-height:1.8;margin:12px 0 0;}
  .error {font-size:13px;color:#ffbbba;line-height:1.8;}
  .view-head {align-items:center;justify-content:space-between;}
  .view-head h2 {font-size:17px;margin:0;}
  .view-head span {font-size:12px;color:#a99bb8;}
  .map-scroll {overflow:auto;width:100%;min-width:0;max-width:100%;margin-top:20px;padding-bottom:10px;}
  .grid-source-bounds-canvas {position:relative;width:max-content;}
  .grid-source-default-outline {position:absolute;border:2px dashed #d6a55f;
    border-radius:3px;pointer-events:none;box-sizing:border-box;}
  .grid-view {display:grid;gap:2px;width:max-content;border:1px solid #ffffff24;padding:4px;background:#16121f;}
  .grid-view button {height:24px;width:24px;padding:0;border:1px solid #ffffff10;border-radius:2px;background:#2d2837;color:#e8dafa;font-size:9px;line-height:1;}
  .grid-view button.has-anchor {color:white;border:2px solid #ecd1ff;box-shadow:inset 0 0 0 1px #2a2134;font-weight:700;}
  .grid-view button.current {outline:2px solid #fff;outline-offset:1px;}
  .grid-source-candidate-outline {position:absolute;border:2px dotted #77c8ea;
    box-sizing:border-box;pointer-events:none;z-index:4;}
  .grid-view button.candidate-source-shared-bits {box-shadow:inset 0 0 0 3px #f28b77;}
  .grid-view button.candidate-source-possibly-unknown {outline:1px dashed #f0d088;outline-offset:-2px;}
  .candidate-probe {margin:10px 0;}
  .candidate-probe summary {cursor:pointer;font-size:13px;color:#d7c7e8;}
  .candidate-probe .coord-row {margin-top:12px;}
  .grid-view button.has-source-default-layer {background-image:radial-gradient(circle at 75% 75%, #e0b163 0 3px, transparent 3.2px);}
  .grid-view button.source-default-possibly-unknown {border-style:dashed;border-color:#a2a2a2;}
  .source-grid-layers-toggle {display:inline-flex;align-items:center;gap:7px;font-size:13px;cursor:pointer;}
  .gridarea-raw-matrix {display:grid;width:max-content;gap:2px;background:#16121f;padding:4px;}
  .gridarea-raw-cell {min-width:42px;padding:9px 5px;text-align:center;font-size:11px;background:#34303f;color:#e8dafa;}
  .record-list {display:grid;gap:6px;margin-top:14px;}
  .record {display:grid;grid-template-columns:minmax(115px,1fr) repeat(3,minmax(95px,1fr));gap:12px;padding:12px 10px;background:#ffffff08;border-radius:7px;font-size:12px;overflow-wrap:anywhere;}
  .record span {color:#bbaacb;}
  .paging {justify-content:space-between;margin-top:18px;}
  @media(max-width:700px){
    .world-stats {grid-template-columns:repeat(2,minmax(0,1fr));}
    .record {grid-template-columns:repeat(2,minmax(0,1fr));}
  }
</style>
