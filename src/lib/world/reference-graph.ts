/**
 * DB-04: common, version-pinned, owner-private native world-reference index.
 *
 * Import the offline graph created by tools/db-04-world/reference_graph.py.
 * Svelte/TS services (DB-00, DB-01, DB-02, Collection, Guide, Decorate,
 * Presets, Save Editor, Gallery) share these exact native identities.
 *
 * Critically, initial native GridObject references NEVER imply an item's
 * world of origin, acquisition, current player placement or legal placement.
 * No source archive, save data or network operation is performed here.
 */
export const DB04_REFERENCE_SCHEMA = 'wand.db04.native-reference-graph@1' as const;
export const DB04_DB00_RELATION_SCHEMA = 'wand.db00.db04-world-relations@1' as const;

export interface WorldIdentity {
  readonly worldId: string;
  readonly worldIdKind: 'nativeWorldName' | 'derivedLayoutKey';
  readonly worldType: 'realm' | 'village_layout';
  readonly nativeSceneId: number | null;
  readonly defaultLayoutId: string;
  readonly sourceRootPresent: boolean;
  readonly sourceScopeLabel: string;
  readonly nativeUniverseTagItemId: number | null;
  readonly contentPackId: null;
  readonly contentPackRelationVerified: false;
  readonly worldCoverageComplete: false;
}
export interface SceneIdentity {
  readonly nativeSceneId: number;
  readonly nativeSceneName: string | null;
  readonly nativeSceneKindCode: number | null;
  readonly worldId: string | null;
  readonly worldMembershipVerifiedByExactSourceLink: boolean;
}
export interface NativeAreaReference {
  readonly areaRefId: string;
  readonly areaRefIdKind: 'derivedRootLayoutAreaTypeComposite';
  readonly nativeAreaId: string | null;
  readonly nativeAreaTypeCode: number;
  readonly nativeAreaTypeName: string | null;
  readonly parentVillageLayoutId: string;
  readonly separateAreaParentLayoutId: string | null;
  readonly nativeSceneId: number | null;
  readonly worldId: string | null;
  readonly gridLayoutId: string;
  readonly gridLayoutPresent: boolean;
  readonly sourceProof: 'Meta.DefaultVillageData.areaLayoutReferences';
  readonly sourceWorldRelationVerified: boolean;
  readonly gameplayBiomeMembershipVerified: false;
  readonly placementLegalityVerified: false;
}
export interface NativeLayoutReference {
  readonly layoutId: string;
  readonly layoutKind: string;
  readonly nativeDefaultObjectCount: number;
  readonly parentWorldId: string | null;
  readonly parentAreaRefId: string | null;
  readonly nativeSourceScopeLabel: string;
  readonly sourceWorldMembershipVerified: boolean;
  readonly worldCoordinatesVerified: false;
  readonly placementLegalityVerified: false;
}
export interface NativeGridDataReference {
  readonly gridDataPath: string;
  readonly nativeSizeX: number | null;
  readonly nativeSizeY: number | null;
  readonly nativeSourceFormat: string | null;
  readonly gridLocalToWorldTransformVerified: false;
  readonly placementLegalityVerified: false;
}
export interface NativeGridReference {
  readonly gridRefId: string;
  readonly gridRefIdKind: 'derivedLayoutGridIdComposite';
  readonly layoutId: string;
  readonly nativeGridId: number;
  readonly gridDataPath: string;
  readonly gridDataPresent: boolean;
  readonly areaRefId: string | null;
  readonly worldId: string | null;
  readonly tessellationFactor: number | null;
  readonly originalDefaultObjectCount: number;
  readonly nativeWorldCoordinatesVerified: false;
  readonly placementLegalityVerified: false;
}
export interface NativeSourceItemReference {
  readonly itemId: string;
  readonly relation: 'nativeSourceDefaultGridObject';
  readonly gridRefId: string;
  readonly layoutId: string;
  readonly gridDataPath: string;
  readonly worldId: string | null;
  readonly areaRefId: string | null;
  readonly instanceCount: number;
  readonly itemOriginWorldId: null;
  readonly itemAcquisitionWorldId: null;
  readonly playerPlacedWorldId: null;
  readonly placeableWorldId: null;
  readonly otherFourRelationsVerified: false;
  readonly nativeCoordinatesStoredInOriginalLayoutObjects: true;
}
export interface NativeWorldCoverage {
  readonly worldId: string;
  readonly sourceAreaRefCount: number;
  readonly sourceGridRefCount: number;
  readonly initialSourceGridObjectCount: number;
  readonly allGameAreasCovered: false;
  readonly allSourceLayoutsCovered: false;
}
export interface NativeReferenceGraph {
  readonly schema: typeof DB04_REFERENCE_SCHEMA;
  readonly target: Readonly<{
    platform: 'Steam';
    gameVersion: string;
    nativeWorldManifestSha256: string;
  }>;
  readonly status: 'private_partial_exact_source_relations';
  readonly sourceManifestStatus: string;
  readonly privateOnly: true;
  readonly publicationAuthorized: false;
  readonly provenance: Readonly<Record<string, unknown>>;
  readonly worlds: readonly WorldIdentity[];
  readonly scenes: readonly SceneIdentity[];
  readonly areas: readonly NativeAreaReference[];
  readonly layouts: readonly NativeLayoutReference[];
  readonly gridData: readonly NativeGridDataReference[];
  readonly gridRefs: readonly NativeGridReference[];
  readonly initialItemRefs: readonly NativeSourceItemReference[];
  readonly worldCoverage: readonly NativeWorldCoverage[];
  readonly coverage: Readonly<{
    sourceInitialGridObjects: number;
    sourceInitialGridObjectsWithoutVerifiedWorldLink: number;
    worldDefinitionsInSubset: number;
    nativeAreaLayoutReferences: number;
    gridReferencesInSubset: number;
    completeGameHierarchyVerified: false;
    allDlcAndAdventurePackIdsVerified: false;
    worldPlacementPermissionVerified: false;
    sourceCoverageComplete: false;
    [extra: string]: unknown;
  }>;
}
export interface RelationResult<T> {
  readonly status: 'source_native_verified' | 'unverified';
  readonly values: readonly T[];
}
export interface ItemWorldRelations {
  readonly itemId: string;
  readonly nativeSourceInitialPlacement: RelationResult<NativeSourceItemReference>;
  readonly itemOriginWorld: RelationResult<string>;
  readonly acquisitionWorld: RelationResult<string>;
  readonly playerPlacedWorld: RelationResult<string>;
  readonly placeableWorld: RelationResult<string>;
}
export interface Db00WorldRelationsSidecar {
  readonly schema: typeof DB04_DB00_RELATION_SCHEMA;
  readonly privateOnly: true;
  readonly publicationAuthorized: false;
  readonly target: NativeReferenceGraph['target'];
  readonly worlds: readonly WorldIdentity[];
  readonly scenes: readonly SceneIdentity[];
  readonly areas: readonly NativeAreaReference[];
  readonly layouts: readonly NativeLayoutReference[];
  readonly gridRefs: readonly NativeGridReference[];
  readonly initialItemRefs: readonly NativeSourceItemReference[];
  readonly coverage: NativeReferenceGraph['coverage'];
  readonly doesNotOverwriteDb00ItemWorlds: true;
}

const isRecord=(v:unknown):v is Record<string,unknown>=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const nonnegative=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const positive=(v:unknown):v is number=>nonnegative(v)&&v>0;
const decimal=(v:unknown):v is string=>
  typeof v==='string'&&/^(0|[1-9][0-9]*)$/.test(v);
const sha256=(v:unknown):v is string=>
  typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);

function check(value:unknown,code:string): asserts value {
  if(!value)throw new TypeError('DB04_WORLD_GRAPH_'+code);
}
function indexed<T,K extends string|number>(
  rows:readonly T[],key:(row:T)=>K,label:string
):Map<K,T>{
  const map=new Map<K,T>();
  for(const row of rows){
    const id=key(row);
    check(!map.has(id),'DUPLICATE_'+label);
    map.set(id,Object.freeze({...row}));
  }
  return map;
}

/** Bounded, validated, read-only index from one private versioned snapshot. */
export class WorldReferenceIndex {
  readonly target:NativeReferenceGraph['target'];
  readonly coverage:NativeReferenceGraph['coverage'];
  private readonly source:NativeReferenceGraph;
  private readonly worlds:Map<string,WorldIdentity>;
  private readonly scenes:Map<number,SceneIdentity>;
  private readonly areas:Map<string,NativeAreaReference>;
  private readonly layouts:Map<string,NativeLayoutReference>;
  private readonly grids:Map<string,NativeGridReference>;
  private readonly itemRefs:Map<string,readonly NativeSourceItemReference[]>;
  private readonly areaListByWorld:Map<string,readonly NativeAreaReference[]>;
  private readonly gridListByArea:Map<string,readonly NativeGridReference[]>;

  constructor(source:unknown){
    check(isRecord(source) && source.schema===DB04_REFERENCE_SCHEMA &&
      source.status==='private_partial_exact_source_relations' &&
      source.privateOnly===true && source.publicationAuthorized===false &&
      isRecord(source.target) && source.target.platform==='Steam' &&
      typeof source.target.gameVersion==='string' &&
      sha256(source.target.nativeWorldManifestSha256) &&
      Array.isArray(source.worlds) && Array.isArray(source.scenes) &&
      Array.isArray(source.areas) && Array.isArray(source.layouts) &&
      Array.isArray(source.gridData) && Array.isArray(source.gridRefs) &&
      Array.isArray(source.initialItemRefs) &&
      Array.isArray(source.worldCoverage) &&
      isRecord(source.coverage) &&
      source.coverage.completeGameHierarchyVerified===false &&
      source.coverage.allDlcAndAdventurePackIdsVerified===false &&
      source.coverage.worldPlacementPermissionVerified===false &&
      source.coverage.sourceCoverageComplete===false,
      'INVALID_PRIVATE_SOURCE_CONTRACT');

    // Product types reflect the offline exporter; recheck identity links
    // independently before indexing, never accept world membership by a name.
    const input=source as unknown as NativeReferenceGraph;
    this.target=Object.freeze({...input.target});
    this.coverage=Object.freeze({...input.coverage});
    this.source=input;
    this.worlds=indexed(input.worlds,w=>w.worldId,'WORLD_ID');
    this.scenes=indexed(input.scenes,s=>s.nativeSceneId,'SCENE_ID');
    this.areas=indexed(input.areas,a=>a.areaRefId,'AREA_ID');
    this.layouts=indexed(input.layouts,l=>l.layoutId,'LAYOUT_ID');
    this.grids=indexed(input.gridRefs,g=>g.gridRefId,'GRID_REF_ID');
    const gridFiles=indexed(input.gridData,g=>g.gridDataPath,'GRID_DATA_PATH');
    const byItem=new Map<string,NativeSourceItemReference[]>();
    const byWorld=new Map<string,NativeAreaReference[]>();
    const byArea=new Map<string,NativeGridReference[]>();
    let total=0,unlinked=0;
    for(const world of this.worlds.values()){
      check(typeof world.worldId==='string' &&
        ['nativeWorldName','derivedLayoutKey'].includes(world.worldIdKind) &&
        world.contentPackId===null &&
        world.contentPackRelationVerified===false &&
        world.worldCoverageComplete===false &&
        typeof world.defaultLayoutId==='string',
        'INVALID_WORLD_IDENTITY');
      if(world.nativeSceneId!==null)
        check(this.scenes.has(world.nativeSceneId),'WORLD_SCENE_ABSENT');
    }
    for(const scene of this.scenes.values()){
      check(nonnegative(scene.nativeSceneId) &&
        (scene.worldId===null||this.worlds.has(scene.worldId)) &&
        scene.worldMembershipVerifiedByExactSourceLink===(scene.worldId!==null),
        'INVALID_SCENE_IDENTITY');
    }
    for(const area of this.areas.values()){
      check(nonnegative(area.nativeAreaTypeCode) &&
        area.areaRefId===area.parentVillageLayoutId+
          '#areaType='+area.nativeAreaTypeCode &&
        area.areaRefIdKind==='derivedRootLayoutAreaTypeComposite' &&
        area.sourceProof==='Meta.DefaultVillageData.areaLayoutReferences' &&
        (area.nativeSceneId===null||this.scenes.has(area.nativeSceneId)) &&
        (area.worldId===null||this.worlds.has(area.worldId)) &&
        area.sourceWorldRelationVerified===(area.worldId!==null) &&
        this.layouts.has(area.parentVillageLayoutId) &&
        (area.gridLayoutPresent===this.layouts.has(area.gridLayoutId)) &&
        area.gameplayBiomeMembershipVerified===false &&
        area.placementLegalityVerified===false,
        'INVALID_AREA_IDENTITY');
      if(area.worldId!==null)
        byWorld.set(area.worldId,[...(byWorld.get(area.worldId)??[]),area]);
    }
    for(const layout of this.layouts.values()){
      check(typeof layout.layoutId==='string' &&
        (layout.parentWorldId===null||this.worlds.has(layout.parentWorldId)) &&
        layout.sourceWorldMembershipVerified===(layout.parentWorldId!==null) &&
        (layout.parentAreaRefId===null||this.areas.has(layout.parentAreaRefId)) &&
        layout.worldCoordinatesVerified===false &&
        layout.placementLegalityVerified===false,
        'INVALID_LAYOUT_IDENTITY');
    }
    for(const grid of this.grids.values()){
      check(grid.gridRefId===grid.layoutId+'#grid='+grid.nativeGridId &&
        grid.gridRefIdKind==='derivedLayoutGridIdComposite' &&
        nonnegative(grid.nativeGridId) && grid.nativeGridId<=0xffffffff &&
        this.layouts.has(grid.layoutId) &&
        grid.gridDataPresent===gridFiles.has(grid.gridDataPath) &&
        (grid.worldId===null||this.worlds.has(grid.worldId)) &&
        (grid.areaRefId===null||this.areas.has(grid.areaRefId)) &&
        grid.nativeWorldCoordinatesVerified===false &&
        grid.placementLegalityVerified===false,
        'INVALID_SCOPED_GRID_REFERENCE');
      if(grid.areaRefId!==null)
        byArea.set(grid.areaRefId,[...(byArea.get(grid.areaRefId)??[]),grid]);
    }
    for(const row of input.initialItemRefs){
      const grid=this.grids.get(row.gridRefId);
      check(decimal(row.itemId) &&
        row.relation==='nativeSourceDefaultGridObject' &&
        grid!==undefined && grid.layoutId===row.layoutId &&
        grid.gridDataPath===row.gridDataPath &&
        grid.worldId===row.worldId && grid.areaRefId===row.areaRefId &&
        positive(row.instanceCount) &&
        row.itemOriginWorldId===null &&
        row.itemAcquisitionWorldId===null &&
        row.playerPlacedWorldId===null &&
        row.placeableWorldId===null &&
        row.otherFourRelationsVerified===false &&
        row.nativeCoordinatesStoredInOriginalLayoutObjects===true,
        'INVALID_INITIAL_SOURCE_ITEM_REFERENCE');
      byItem.set(row.itemId,[...(byItem.get(row.itemId)??[]),Object.freeze({...row})]);
      total+=row.instanceCount;
      if(row.worldId===null)unlinked+=row.instanceCount;
    }
    check(total===this.coverage.sourceInitialGridObjects &&
      unlinked===this.coverage.sourceInitialGridObjectsWithoutVerifiedWorldLink &&
      this.worlds.size===this.coverage.worldDefinitionsInSubset &&
      this.areas.size===this.coverage.nativeAreaLayoutReferences &&
      this.grids.size===this.coverage.gridReferencesInSubset,
      'INCONSISTENT_SOURCE_COVERAGE');
    this.itemRefs=byItem;
    this.areaListByWorld=byWorld;
    this.gridListByArea=byArea;
  }

  getWorld(id:string):WorldIdentity|null{
    return this.worlds.get(id)??null;
  }
  getScene(nativeSceneId:number):SceneIdentity|null{
    return this.scenes.get(nativeSceneId)??null;
  }
  getArea(areaRefId:string):NativeAreaReference|null{
    return this.areas.get(areaRefId)??null;
  }
  getLayout(layoutId:string):NativeLayoutReference|null{
    return this.layouts.get(layoutId)??null;
  }
  getScopedGrid(layoutId:string,nativeGridId:number):NativeGridReference|null{
    if(!nonnegative(nativeGridId))return null;
    return this.grids.get(layoutId+'#grid='+nativeGridId)??null;
  }
  areasInWorld(worldId:string):readonly NativeAreaReference[]{
    return Object.freeze([...(this.areaListByWorld.get(worldId)??[])]);
  }
  gridsInArea(areaRefId:string):readonly NativeGridReference[]{
    return Object.freeze([...(this.gridListByArea.get(areaRefId)??[])]);
  }
  initialSourcePlacement(itemId:string|number):RelationResult<NativeSourceItemReference>{
    const id=typeof itemId==='number'
      ?(Number.isSafeInteger(itemId)&&itemId>=0?String(itemId):'')
      :itemId;
    check(decimal(id),'INVALID_ITEM_ID');
    const rows=this.itemRefs.get(id)??[];
    return Object.freeze({
      status:rows.length?'source_native_verified':'unverified',
      values:Object.freeze([...rows])
    });
  }
  /** Unknown origin/acquisition/player/placeable is NOT an empty verified set. */
  itemWorldRelations(itemId:string|number):ItemWorldRelations{
    const initial=this.initialSourcePlacement(itemId);
    const unverified:RelationResult<string>=Object.freeze({
      status:'unverified',values:Object.freeze([])
    });
    const id=typeof itemId==='number'?String(itemId):itemId;
    return Object.freeze({
      itemId:id,nativeSourceInitialPlacement:initial,
      itemOriginWorld:unverified,acquisitionWorld:unverified,
      playerPlacedWorld:unverified,placeableWorld:unverified
    });
  }

  /** Sidecar for DB-00 integration; never write source-only initial placement
   * evidence into DB-00 item.worlds (origin/association semantics differ). */
  toDb00WorldRelationsSidecar():Db00WorldRelationsSidecar{
    return Object.freeze({
      schema:DB04_DB00_RELATION_SCHEMA,
      privateOnly:true,publicationAuthorized:false,
      target:this.target,
      worlds:Object.freeze([...this.worlds.values()]),
      scenes:Object.freeze([...this.scenes.values()]),
      areas:Object.freeze([...this.areas.values()]),
      layouts:Object.freeze([...this.layouts.values()]),
      gridRefs:Object.freeze([...this.grids.values()]),
      initialItemRefs:Object.freeze([...this.source.initialItemRefs]),
      coverage:this.coverage,
      doesNotOverwriteDb00ItemWorlds:true
    });
  }
}
