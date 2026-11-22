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
  /** Original protoDb Worlds.WorldData field 2; optional for existing @1 ZIPs. */
  readonly nativeParentWorldId?: string | null;
  readonly nativeParentWorldRelationVerified?: boolean;
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
  /** Only original protoDb Village04Layout1 carries these eight records. */
  readonly nativeProtoDbAreaRecordVerified?: boolean;
  readonly nativeGroundNavMeshAreaId?: number | null;
  readonly nativeWaterNavMeshAreaId?: number | null;
  readonly nativeUnlockPlayerLevel?: number | null;
  readonly nativeAreaTypeFieldPresent?: boolean | null;
  readonly nativeNavMeshPlacementLegalityVerified?: false;
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
/**
 * Exact original native GridDataPath candidate evidence.
 *
 * Saved GridCollection.Grids[id].GridDataPath can use the same source path,
 * but the numeric Save Grid ID is NOT the native layout's Grid.ID. Multiple
 * original layouts may share a GridData source (e.g. room wall templates).
 * Even a single candidate cannot certify Save grid identity or placement.
 */
export interface NativeGridDataPathEvidence {
  readonly contract:'wand.db04.native-grid-data-path-candidates@1';
  readonly sourceGameVersion:string;
  readonly sourceWorldManifestSha256:string;
  readonly gridDataPath:string;
  readonly sourcePresence:
    'referenced_source_file'|'source_file_without_layout_reference'|
    'layout_reference_without_source_file'|'not_in_partial_source';
  readonly originalGridDataFile:Readonly<NativeGridDataReference>|null;
  readonly sourceGridReferences:readonly Readonly<NativeGridReference>[];
  readonly sourceGridReferenceCount:number;
  readonly distinctSourceLayoutCount:number;
  readonly sourceFilePathExactMatched:boolean;
  readonly sourceLayoutCandidatesComplete:false;
  readonly numericSaveGridIdUsedAsSourceKey:false;
  readonly savedGridIdentityVerified:false;
  readonly savedObjectPlacementVerified:false;
  readonly contentPackRelationVerified:false;
  readonly placementLegalityVerified:false;
  readonly sourceCoverageComplete:false;
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
/**
 * Exact reverse lookup over ORIGINAL GridObject records in this partial
 * private source snapshot. These rows are NOT acquisition, player-save
 * placement, item origin, or legal decoration-area memberships.
 */
export interface OriginalSourcePlacementPage {
  readonly relation: 'nativeSourceDefaultGridObject';
  readonly scope: 'world' | 'area' | 'grid' | 'unlinked_world';
  readonly scopeId: string | null;
  readonly scopeIdentityInPartialSource: boolean;
  readonly status: 'source_native_verified' | 'unverified';
  readonly rows: readonly NativeSourceItemReference[];
  readonly matchingReferenceRowsInSubset: number;
  readonly matchingOriginalInstancesInSubset: number;
  readonly distinctItemIdsInSubset: number;
  readonly offset: number;
  readonly limit: number;
  readonly hasNextPage: boolean;
  readonly nextOffset: number | null;
  readonly sourceCoverageComplete: false;
  readonly itemOriginVerified: false;
  readonly acquisitionLocationVerified: false;
  readonly savedPlayerPlacementVerified: false;
  readonly placementLegalityVerified: false;
}

export interface NativeProtoDbAreaEvidence {
  readonly areaRefId: string;
  readonly nativeAreaId: string;
  readonly nativeGroundNavMeshAreaId: number | null;
  readonly nativeWaterNavMeshAreaId: number | null;
  readonly nativeUnlockPlayerLevel: number | null;
  readonly nativeAreaTypeFieldPresent: boolean;
  readonly provenance: 'protoDb.bin:Village04Layout1';
  readonly navMeshPlacementLegalityVerified: false;
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
  private readonly gridDataFilesByPath:Map<string,NativeGridDataReference>;
  private readonly gridRefsByDataPath:Map<string,readonly NativeGridReference[]>;
  private readonly itemRefs:Map<string,readonly NativeSourceItemReference[]>;
  private readonly childWorldsByParent:Map<string,readonly WorldIdentity[]>;
  private readonly worldsByNativeUniverseTag:Map<number,readonly WorldIdentity[]>;
  private readonly initialRefsByWorld:Map<string,readonly NativeSourceItemReference[]>;
  private readonly initialRefsByArea:Map<string,readonly NativeSourceItemReference[]>;
  private readonly initialRefsByGrid:Map<string,readonly NativeSourceItemReference[]>;
  private readonly initialRefsWithoutWorld:readonly NativeSourceItemReference[];
  private readonly areaListByWorld:Map<string,readonly NativeAreaReference[]>;
  private readonly gridListByArea:Map<string,readonly NativeGridReference[]>;
  private readonly gridListByLayout:Map<string,readonly NativeGridReference[]>;

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
    this.gridDataFilesByPath=gridFiles;
    const refsByDataPath=new Map<string,NativeGridReference[]>();
    const byItem=new Map<string,NativeSourceItemReference[]>();
    const byItemWorld=new Map<string,NativeSourceItemReference[]>();
    const byItemArea=new Map<string,NativeSourceItemReference[]>();
    const byItemGrid=new Map<string,NativeSourceItemReference[]>();
    const withoutWorld:NativeSourceItemReference[]=[];
    const byParent=new Map<string,WorldIdentity[]>();
    const byUniverseTag=new Map<number,WorldIdentity[]>();
    const byWorld=new Map<string,NativeAreaReference[]>();
    const byArea=new Map<string,NativeGridReference[]>();
    const byLayout=new Map<string,NativeGridReference[]>();
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
      const universeTag=world.nativeUniverseTagItemId;
      check(universeTag===null||(
        positive(universeTag)&&
        world.worldIdKind==='nativeWorldName'&&world.worldType==='realm'),
        'INVALID_NATIVE_WORLD_UNIVERSE_TAG');
      if(universeTag!==null){
        let linked=byUniverseTag.get(universeTag);
        if(linked===undefined){
          linked=[];
          byUniverseTag.set(universeTag,linked);
        }
        linked.push(world);
      }
      const parent=world.nativeParentWorldId??null;
      check((parent===null ||
        (typeof parent==='string' && parent!==world.worldId &&
         world.worldIdKind==='nativeWorldName' &&
         world.nativeParentWorldRelationVerified===true &&
         this.worlds.get(parent)?.worldIdKind==='nativeWorldName')) &&
        (parent===null || world.nativeParentWorldRelationVerified===true) &&
        !(parent===null && world.nativeParentWorldRelationVerified===true),
        'INVALID_NATIVE_PARENT_WORLD');
      if(parent!==null)
        byParent.set(parent,[...(byParent.get(parent)??[]),world]);
    }
    // Reject cycles in original WorldData parent links, not inferred aliases.
    for(const world of this.worlds.values()){
      const seen=new Set<string>();
      let node:WorldIdentity|undefined=world;
      while(node?.nativeParentWorldId){
        check(!seen.has(node.worldId),'NATIVE_WORLD_PARENT_CYCLE');
        seen.add(node.worldId);
        node=this.worlds.get(node.nativeParentWorldId);
      }
    }
    if(this.coverage.nativeParentWorldLinksInSubset!==undefined)
      check(this.coverage.nativeParentWorldLinksInSubset===
        [...byParent.values()].reduce((n,rows)=>n+rows.length,0),
        'NATIVE_WORLD_PARENT_COVERAGE_MISMATCH');
    this.childWorldsByParent=byParent;
    this.worldsByNativeUniverseTag=new Map(
      [...byUniverseTag].map(([tag,rows])=>[tag,Object.freeze(rows)]));
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
      if(area.nativeProtoDbAreaRecordVerified===true){
        check(area.nativeAreaId===String(area.nativeSceneId)+':'+area.nativeAreaTypeCode &&
          (area.nativeGroundNavMeshAreaId===null ||
           nonnegative(area.nativeGroundNavMeshAreaId)) &&
          (area.nativeWaterNavMeshAreaId===null ||
           nonnegative(area.nativeWaterNavMeshAreaId)) &&
          (area.nativeUnlockPlayerLevel===null ||
           nonnegative(area.nativeUnlockPlayerLevel)) &&
          typeof area.nativeAreaTypeFieldPresent==='boolean' &&
          area.nativeNavMeshPlacementLegalityVerified===false,
          'INVALID_NATIVE_PROTODB_AREA_EVIDENCE');
      } else if(area.nativeProtoDbAreaRecordVerified===false){
        check(area.nativeAreaId===null &&
          area.nativeGroundNavMeshAreaId===null &&
          area.nativeWaterNavMeshAreaId===null &&
          area.nativeUnlockPlayerLevel===null &&
          area.nativeAreaTypeFieldPresent===null &&
          area.nativeNavMeshPlacementLegalityVerified===false,
          'INVALID_UNVERIFIED_AREA_EVIDENCE');
      }
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
      byLayout.set(grid.layoutId,[...(byLayout.get(grid.layoutId)??[]),grid]);
      refsByDataPath.set(grid.gridDataPath,
        [...(refsByDataPath.get(grid.gridDataPath)??[]),grid]);
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
      const immutableRow=Object.freeze({...row});
      byItem.set(row.itemId,[...(byItem.get(row.itemId)??[]),immutableRow]);
      // Every original GridObject has an exact native layout + Grid.ID.
      // This index intentionally includes rows WITHOUT a verified World.
      byItemGrid.set(row.gridRefId,[...(byItemGrid.get(row.gridRefId)??[]),
        immutableRow]);
      if(row.worldId!==null){
        let rows=byItemWorld.get(row.worldId);
        if(rows===undefined){
          rows=[];
          byItemWorld.set(row.worldId,rows);
        }
        rows.push(immutableRow);
      } else withoutWorld.push(immutableRow);
      if(row.areaRefId!==null){
        let rows=byItemArea.get(row.areaRefId);
        if(rows===undefined){
          rows=[];
          byItemArea.set(row.areaRefId,rows);
        }
        rows.push(immutableRow);
      }
      total+=row.instanceCount;
      if(row.worldId===null)unlinked+=row.instanceCount;
    }
    // Cross-check every source GridCollection's original object count.
    // Matching an exact Grid.ID is independent of World/Area attribution.
    let allGridInstances=0;
    for(const grid of this.grids.values()){
      let gridInstances=0;
      for(const row of byItemGrid.get(grid.gridRefId)??[])
        gridInstances+=row.instanceCount;
      check(Number.isSafeInteger(gridInstances) &&
        gridInstances===grid.originalDefaultObjectCount,
        'NATIVE_GRID_DEFAULT_INSTANCE_MISMATCH');
      allGridInstances+=gridInstances;
    }
    check(Number.isSafeInteger(allGridInstances) && allGridInstances===total,
      'NATIVE_GRID_COVERAGE_MISMATCH');
    check(total===this.coverage.sourceInitialGridObjects &&
      unlinked===this.coverage.sourceInitialGridObjectsWithoutVerifiedWorldLink &&
      this.worlds.size===this.coverage.worldDefinitionsInSubset &&
      this.areas.size===this.coverage.nativeAreaLayoutReferences &&
      this.grids.size===this.coverage.gridReferencesInSubset,
      'INCONSISTENT_SOURCE_COVERAGE');
    if(this.coverage.nativeProtoDbAreaRecordsLinked!==undefined)
      check(this.coverage.nativeProtoDbAreaRecordsLinked===
        [...this.areas.values()].filter(a=>a.nativeProtoDbAreaRecordVerified===true).length,
        'NATIVE_AREA_COVERAGE_MISMATCH');
    this.itemRefs=byItem;
    this.initialRefsByWorld=new Map(
      [...byItemWorld].map(([key,rows])=>[key,Object.freeze(rows)]));
    this.initialRefsByArea=new Map(
      [...byItemArea].map(([key,rows])=>[key,Object.freeze(rows)]));
    this.initialRefsByGrid=new Map(
      [...byItemGrid].map(([key,rows])=>[key,Object.freeze(rows)]));
    this.initialRefsWithoutWorld=Object.freeze(withoutWorld);
    this.areaListByWorld=byWorld;
    this.gridListByArea=byArea;
    this.gridListByLayout=new Map(
      [...byLayout].map(([key,rows])=>[key,Object.freeze(rows)]));
    this.gridRefsByDataPath=new Map(
      [...refsByDataPath].map(([key,rows])=>[key,Object.freeze(rows)]));
  }

  getWorld(id:string):WorldIdentity|null{
    return this.worlds.get(id)??null;
  }
  /** Source-subset World definitions, NOT all game worlds or DLC ownership. */
  listSourceWorlds():readonly WorldIdentity[]{
    return Object.freeze([...this.worlds.values()]);
  }
  /**
   * Exact original WorldData UniverseTagItemId reverse relation.
   * Does not imply item provenance, acquisition, valid placement or UI grouping.
   */
  sourceRealmWorldsForUniverseTag(tagItemId:number):RelationResult<WorldIdentity>{
    check(positive(tagItemId),'INVALID_NATIVE_UNIVERSE_TAG_ID');
    const rows=this.worldsByNativeUniverseTag.get(tagItemId)??[];
    return Object.freeze({
      status:rows.length?'source_native_verified' as const:'unverified' as const,
      values:Object.freeze([...rows])
    });
  }
  /** Direct original WorldData field-2 parent links; never substring hierarchy. */
  childWorlds(parentWorldId:string):RelationResult<WorldIdentity>{
    const found=this.childWorldsByParent.get(parentWorldId)??[];
    return Object.freeze({
      status:found.length?'source_native_verified':'unverified',
      values:Object.freeze([...found])
    });
  }
  /** Confirmed ancestors only; absence of a native parent is NOT proof of root. */
  worldAncestors(worldId:string):RelationResult<WorldIdentity>{
    const lineage:WorldIdentity[]=[];
    let current=this.worlds.get(worldId);
    while(current?.nativeParentWorldId){
      const parent=this.worlds.get(current.nativeParentWorldId);
      if(!parent)throw new TypeError('DB04_WORLD_PARENT_LOOKUP_INVALID');
      lineage.push(parent);
      current=parent;
    }
    return Object.freeze({
      status:lineage.length?'source_native_verified':'unverified',
      values:Object.freeze(lineage)
    });
  }
  /** Eight native protoDb records may carry NavMesh AREA IDs, not placement rules. */
  nativeProtoDbArea(areaRefId:string):RelationResult<NativeProtoDbAreaEvidence>{
    const area=this.areas.get(areaRefId);
    if(!area || area.nativeProtoDbAreaRecordVerified!==true ||
       area.nativeAreaId===null ||
       typeof area.nativeAreaTypeFieldPresent!=='boolean')
      return Object.freeze({status:'unverified',values:Object.freeze([])});
    const evidence:NativeProtoDbAreaEvidence={
      areaRefId:area.areaRefId,nativeAreaId:area.nativeAreaId,
      nativeGroundNavMeshAreaId:area.nativeGroundNavMeshAreaId??null,
      nativeWaterNavMeshAreaId:area.nativeWaterNavMeshAreaId??null,
      nativeUnlockPlayerLevel:area.nativeUnlockPlayerLevel??null,
      nativeAreaTypeFieldPresent:area.nativeAreaTypeFieldPresent,
      provenance:'protoDb.bin:Village04Layout1',
      navMeshPlacementLegalityVerified:false
    };
    return Object.freeze({status:'source_native_verified',
      values:Object.freeze([Object.freeze(evidence)])});
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
  /** Exact original GridCollection layout path, not inferred game World. */
  gridsInLayout(layoutId:string):readonly NativeGridReference[]{
    check(typeof layoutId==='string'&&layoutId.length>0&&layoutId.length<=1024,
      'INVALID_LAYOUT_ID');
    return Object.freeze([...(this.gridListByLayout.get(layoutId)??[])]);
  }
  /**
   * Find original candidate layouts by EXACT native GridDataPath.
   * Does not match bare file names, case-folded paths, substring matches,
   * Save's numeric Grid.ID, or infer a player's saved World/coordinates.
   * Source file with zero layout refs is different from an absent source file.
   */
  originalGridDataPathCandidates(gridDataPath:string):NativeGridDataPathEvidence{
    check(typeof gridDataPath==='string'&&gridDataPath.length<=512&&
      /^GridData\/(?:[A-Za-z0-9_!.\-]+\/)*[A-Za-z0-9_!.\-]+\.json$/.test(gridDataPath)&&
      !gridDataPath.split('/').some(segment=>segment==='.'||segment==='..'),
      'INVALID_NATIVE_GRID_DATA_PATH');
    const file=this.gridDataFilesByPath.get(gridDataPath)??null;
    const refs=this.gridRefsByDataPath.get(gridDataPath)??Object.freeze([]);
    check(refs.every(row=>row.gridDataPath===gridDataPath&&
      this.layouts.has(row.layoutId) &&
      row.gridDataPresent===(file!==null)),
      'NATIVE_GRID_DATA_PATH_CONTRADICTION');
    return Object.freeze({
      contract:'wand.db04.native-grid-data-path-candidates@1' as const,
      sourceGameVersion:this.target.gameVersion,
      sourceWorldManifestSha256:this.target.nativeWorldManifestSha256,
      gridDataPath,
      sourcePresence:file===null?
        (refs.length?'layout_reference_without_source_file' as const:
          'not_in_partial_source' as const):
        refs.length?'referenced_source_file' as const:
        'source_file_without_layout_reference' as const,
      originalGridDataFile:file,
      sourceGridReferences:Object.freeze([...refs]),
      sourceGridReferenceCount:refs.length,
      distinctSourceLayoutCount:new Set(refs.map(row=>row.layoutId)).size,
      sourceFilePathExactMatched:file!==null,
      sourceLayoutCandidatesComplete:false as const,
      numericSaveGridIdUsedAsSourceKey:false as const,
      savedGridIdentityVerified:false as const,
      savedObjectPlacementVerified:false as const,
      contentPackRelationVerified:false as const,
      placementLegalityVerified:false as const,
      sourceCoverageComplete:false as const
    });
  }
  /** Lookup by original layout + native Grid.ID composite, including unlinked Worlds. */
  getSourceGrid(gridRefId:string):NativeGridReference|null{
    check(typeof gridRefId==='string'&&gridRefId.length>0&&
      gridRefId.length<=1100,'INVALID_GRID_REF_ID');
    return this.grids.get(gridRefId)??null;
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
  private originalPlacementPage(
    scope:OriginalSourcePlacementPage['scope'],
    scopeId:string|null,
    scopeIdentityInPartialSource:boolean,
    rows:readonly NativeSourceItemReference[],
    page:Readonly<{offset:number;limit:number}>={offset:0,limit:128}
  ):OriginalSourcePlacementPage{
    check(isRecord(page) && nonnegative(page.offset) &&
      nonnegative(page.limit) && page.limit>=1 && page.limit<=512,
      'INVALID_INITIAL_PLACEMENT_PAGE');
    const offset=page.offset,limit=page.limit;
    const end=Math.min(rows.length,offset+limit);
    const selection=Object.freeze(rows.slice(offset,end));
    let instances=0;
    const itemIds=new Set<string>();
    for(const row of rows){
      instances+=row.instanceCount;
      itemIds.add(row.itemId);
    }
    check(Number.isSafeInteger(instances),'INVALID_INITIAL_PLACEMENT_TOTAL');
    const hasNextPage=end<rows.length;
    return Object.freeze({
      relation:'nativeSourceDefaultGridObject' as const,
      scope,scopeId,scopeIdentityInPartialSource,
      status:rows.length?'source_native_verified' as const:'unverified' as const,
      rows:selection,
      matchingReferenceRowsInSubset:rows.length,
      matchingOriginalInstancesInSubset:instances,
      distinctItemIdsInSubset:itemIds.size,
      offset,limit,hasNextPage,
      nextOffset:hasNextPage?end:null,
      sourceCoverageComplete:false as const,
      itemOriginVerified:false as const,
      acquisitionLocationVerified:false as const,
      savedPlayerPlacementVerified:false as const,
      placementLegalityVerified:false as const
    });
  }

  /** Exact World ID only: does not include inferred child-world membership. */
  originalPlacementsInWorld(
    worldId:string,page?:Readonly<{offset:number;limit:number}>
  ):OriginalSourcePlacementPage{
    return this.originalPlacementPage('world',worldId,this.worlds.has(worldId),
      this.initialRefsByWorld.get(worldId)??[],page);
  }

  /** Exact native AreaType layout ref only: never a gameplay biome filter. */
  originalPlacementsInArea(
    areaRefId:string,page?:Readonly<{offset:number;limit:number}>
  ):OriginalSourcePlacementPage{
    return this.originalPlacementPage('area',areaRefId,this.areas.has(areaRefId),
      this.initialRefsByArea.get(areaRefId)??[],page);
  }

  /**
   * Original default GridObjects from one exact source Grid.ID.
   *
   * Unlike by-World/by-Area lookup, this includes unlinked objects in
   * Floating Islands, interiors, EventFloatingIslands and other layouts.
   * Zero original records in a verified Grid is distinguishable from a
   * missing GridRef through scopeIdentityInPartialSource; neither proves
   * complete game coverage, placement legality or saved player state.
   */
  originalPlacementsInGrid(
    gridRefId:string,page?:Readonly<{offset:number;limit:number}>
  ):OriginalSourcePlacementPage{
    check(typeof gridRefId==='string'&&gridRefId.length>0&&
      gridRefId.length<=1100,'INVALID_GRID_REF_ID');
    return this.originalPlacementPage('grid',gridRefId,
      this.grids.has(gridRefId),
      this.initialRefsByGrid.get(gridRefId)??[],page);
  }

  /** Preserve evidence which has no verified World link; do not reassign it. */
  originalPlacementsWithoutWorld(
    page?:Readonly<{offset:number;limit:number}>
  ):OriginalSourcePlacementPage{
    return this.originalPlacementPage('unlinked_world',null,true,
      this.initialRefsWithoutWorld,page);
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
