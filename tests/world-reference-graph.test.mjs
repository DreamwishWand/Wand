import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldReferenceIndex, DB04_REFERENCE_SCHEMA,
  DB04_DB00_RELATION_SCHEMA} from '../src/lib/world/reference-graph.ts';

const root='SceneLayouts/Village04/Village.json';
const layout='SceneLayouts/Village04/Beach.json';
const world='village-layout:'+root;
const area=root+'#areaType=0';
const grid=layout+'#grid=7';
const path='GridData/Village04/Beach.json';

function fixture(){
  return {
    schema:DB04_REFERENCE_SCHEMA,
    target:{platform:'Steam',gameVersion:'1.26.2',
      nativeWorldManifestSha256:'f'.repeat(64)},
    status:'private_partial_exact_source_relations',
    sourceManifestStatus:'native_partial_world_extraction_preview',
    privateOnly:true,publicationAuthorized:false,
    provenance:{noInferenceFromPathPrefixes:true},
    worlds:[{
      worldId:world,worldIdKind:'derivedLayoutKey',worldType:'village_layout',
      nativeSceneId:100,defaultLayoutId:root,sourceRootPresent:true,
      sourceScopeLabel:'Village04',nativeUniverseTagItemId:null,
      contentPackId:null,contentPackRelationVerified:false,
      worldCoverageComplete:false
    }],
    scenes:[{
      nativeSceneId:100,nativeSceneName:'Village',nativeSceneKindCode:1,
      worldId:world,worldMembershipVerifiedByExactSourceLink:true
    },{
      nativeSceneId:101,nativeSceneName:'House',nativeSceneKindCode:4,
      worldId:null,worldMembershipVerifiedByExactSourceLink:false
    }],
    areas:[{
      areaRefId:area,areaRefIdKind:'derivedRootLayoutAreaTypeComposite',
      nativeAreaId:'100:0',nativeAreaTypeCode:0,nativeAreaTypeName:'Beach',
      parentVillageLayoutId:root,separateAreaParentLayoutId:null,
      nativeSceneId:100,worldId:world,gridLayoutId:layout,
      gridLayoutPresent:true,
      sourceProof:'Meta.DefaultVillageData.areaLayoutReferences',
      sourceWorldRelationVerified:true,
      gameplayBiomeMembershipVerified:false,placementLegalityVerified:false
    }],
    layouts:[{
      layoutId:root,layoutKind:'nativeDefaultVillageData',
      nativeDefaultObjectCount:0,parentWorldId:world,parentAreaRefId:null,
      nativeSourceScopeLabel:'Village04',sourceWorldMembershipVerified:true,
      worldCoordinatesVerified:false,placementLegalityVerified:false
    },{
      layoutId:layout,layoutKind:'nativeGridCollection',
      nativeDefaultObjectCount:2,parentWorldId:world,parentAreaRefId:area,
      nativeSourceScopeLabel:'Village04',sourceWorldMembershipVerified:true,
      worldCoordinatesVerified:false,placementLegalityVerified:false
    }],
    gridData:[{
      gridDataPath:path,nativeSizeX:10,nativeSizeY:20,
      nativeSourceFormat:'original_json_direct_floor_values',
      gridLocalToWorldTransformVerified:false,placementLegalityVerified:false
    }],
    gridRefs:[{
      gridRefId:grid,gridRefIdKind:'derivedLayoutGridIdComposite',
      layoutId:layout,nativeGridId:7,gridDataPath:path,gridDataPresent:true,
      areaRefId:area,worldId:world,tessellationFactor:1,
      originalDefaultObjectCount:2,
      nativeWorldCoordinatesVerified:false,placementLegalityVerified:false
    }],
    initialItemRefs:[{
      itemId:'40000000',relation:'nativeSourceDefaultGridObject',
      gridRefId:grid,layoutId:layout,gridDataPath:path,
      worldId:world,areaRefId:area,instanceCount:2,
      itemOriginWorldId:null,itemAcquisitionWorldId:null,
      playerPlacedWorldId:null,placeableWorldId:null,
      otherFourRelationsVerified:false,
      nativeCoordinatesStoredInOriginalLayoutObjects:true
    }],
    worldCoverage:[{
      worldId:world,sourceAreaRefCount:1,sourceGridRefCount:1,
      initialSourceGridObjectCount:2,allGameAreasCovered:false,
      allSourceLayoutsCovered:false
    }],
    coverage:{
      worldDefinitionsInSubset:1,nativeAreaLayoutReferences:1,
      gridReferencesInSubset:1,sourceInitialGridObjects:2,
      sourceInitialGridObjectsWithoutVerifiedWorldLink:0,
      completeGameHierarchyVerified:false,
      allDlcAndAdventurePackIdsVerified:false,
      worldPlacementPermissionVerified:false,
      sourceCoverageComplete:false
    }
  };
}
test('source-pinned World/Scene/Area/scoped Grid can be queried by all services',()=>{
  const index=new WorldReferenceIndex(fixture());
  assert.equal(index.target.gameVersion,'1.26.2');
  assert.equal(index.getWorld(world)?.nativeSceneId,100);
  assert.equal(index.getScene(101)?.worldId,null);
  assert.equal(index.getArea(area)?.nativeAreaTypeCode,0);
  assert.equal(index.getLayout(layout)?.parentAreaRefId,area);
  assert.equal(index.getScopedGrid(layout,7)?.gridDataPath,path);
  assert.equal(index.getScopedGrid(layout,8),null);
  assert.equal(index.areasInWorld(world).length,1);
  assert.equal(index.gridsInArea(area)[0]?.gridRefId,grid);
});
test('source default placement never means origin, ownership, acquisition or permission',()=>{
  const index=new WorldReferenceIndex(fixture());
  const refs=index.itemWorldRelations('40000000');
  assert.equal(refs.nativeSourceInitialPlacement.status,'source_native_verified');
  assert.equal(refs.nativeSourceInitialPlacement.values[0].worldId,world);
  assert.equal(refs.itemOriginWorld.status,'unverified');
  assert.equal(refs.acquisitionWorld.status,'unverified');
  assert.equal(refs.playerPlacedWorld.status,'unverified');
  assert.equal(refs.placeableWorld.status,'unverified');
  assert.equal(index.itemWorldRelations('90000000').nativeSourceInitialPlacement.status,'unverified');
});
test('DB-00 sidecar does not overwrite item.worlds and remains private',()=>{
  const sidecar=new WorldReferenceIndex(fixture()).toDb00WorldRelationsSidecar();
  assert.equal(sidecar.schema,DB04_DB00_RELATION_SCHEMA);
  assert.equal(sidecar.doesNotOverwriteDb00ItemWorlds,true);
  assert.equal(sidecar.publicationAuthorized,false);
  assert.equal(sidecar.worlds[0].worldIdKind,'derivedLayoutKey');
});
test('real native Realm ancestry is separate from derived village containment',()=>{
  const f=fixture();
  const parent='Worlds!SourceParent', child='Worlds!SourceParent!Subscene';
  f.worlds.push({
    ...f.worlds[0],worldId:parent,worldIdKind:'nativeWorldName',
    worldType:'realm',nativeSceneId:100,
    defaultLayoutId:'SceneLayouts/Realms/Example/Root.json',
    nativeParentWorldId:null,nativeParentWorldRelationVerified:false
  });
  f.worlds.push({
    ...f.worlds[0],worldId:child,worldIdKind:'nativeWorldName',
    worldType:'realm',nativeSceneId:101,
    defaultLayoutId:'SceneLayouts/Realms/Example/Child.json',
    nativeParentWorldId:parent,nativeParentWorldRelationVerified:true
  });
  f.coverage.worldDefinitionsInSubset=3;
  f.coverage.nativeParentWorldLinksInSubset=1;
  const index=new WorldReferenceIndex(f);
  assert.deepEqual(index.childWorlds(parent).values.map(w=>w.worldId),[child]);
  assert.deepEqual(index.worldAncestors(child).values.map(w=>w.worldId),[parent]);
  assert.equal(index.childWorlds(world).status,'unverified');
  assert.equal(index.worldAncestors(parent).status,'unverified');
  const invalid=fixture();
  invalid.worlds[0].nativeParentWorldId='Worlds!NotInSource';
  invalid.worlds[0].nativeParentWorldRelationVerified=true;
  assert.throws(()=>new WorldReferenceIndex(invalid),/INVALID_NATIVE_PARENT_WORLD/);
  const cycle=fixture();
  cycle.worlds.push({...cycle.worlds[0],worldId:parent,
    worldIdKind:'nativeWorldName',nativeParentWorldId:child,
    nativeParentWorldRelationVerified:true});
  cycle.worlds.push({...cycle.worlds[0],worldId:child,
    worldIdKind:'nativeWorldName',nativeParentWorldId:parent,
    nativeParentWorldRelationVerified:true});
  cycle.coverage.worldDefinitionsInSubset=3;
  assert.throws(()=>new WorldReferenceIndex(cycle),/NATIVE_WORLD_PARENT_CYCLE/);
});

test('native protoDb area NavMesh IDs are lookup evidence not placement legality',()=>{
  const f=fixture();
  f.areas[0].nativeProtoDbAreaRecordVerified=true;
  f.areas[0].nativeGroundNavMeshAreaId=7;
  f.areas[0].nativeWaterNavMeshAreaId=8;
  f.areas[0].nativeUnlockPlayerLevel=null;
  f.areas[0].nativeAreaTypeFieldPresent=false;
  f.areas[0].nativeNavMeshPlacementLegalityVerified=false;
  f.coverage.nativeProtoDbAreaRecordsLinked=1;
  const evidence=new WorldReferenceIndex(f).nativeProtoDbArea(area);
  assert.equal(evidence.status,'source_native_verified');
  assert.equal(evidence.values[0].nativeGroundNavMeshAreaId,7);
  assert.equal(evidence.values[0].nativeWaterNavMeshAreaId,8);
  assert.equal(evidence.values[0].nativeAreaTypeFieldPresent,false);
  assert.equal(evidence.values[0].navMeshPlacementLegalityVerified,false);
  const older=fixture();
  assert.equal(new WorldReferenceIndex(older).nativeProtoDbArea(area).status,
    'unverified');
  f.areas[0].nativeGroundNavMeshAreaId=-1;
  assert.throws(()=>new WorldReferenceIndex(f),/INVALID_NATIVE_PROTODB_AREA_EVIDENCE/);
});

test('tampered Grid.ID, world evidence or count must fail closed',()=>{
  const src=fixture();
  src.gridRefs[0].gridRefId=layout+'#grid=0';
  assert.throws(()=>new WorldReferenceIndex(src),/INVALID_SCOPED_GRID_REFERENCE/);
  const src2=fixture();
  src2.areas[0].worldId='unverified-guess';
  assert.throws(()=>new WorldReferenceIndex(src2),/INVALID_AREA_IDENTITY/);
  const src3=fixture();
  src3.coverage.sourceInitialGridObjects=8;
  assert.throws(()=>new WorldReferenceIndex(src3),/INCONSISTENT_SOURCE_COVERAGE/);
});


test('exact World/Area original-placement reverse pages preserve unlinked evidence',()=>{
  const f=fixture();
  // Two source records in the same original grid and a separate record
  // with no verified World or Area link. Neither implies item origin.
  f.initialItemRefs.push({
    ...f.initialItemRefs[0],itemId:'40000001',instanceCount:3
  });
  f.gridRefs[0].originalDefaultObjectCount=5;
  f.gridRefs.push({
    ...f.gridRefs[0],gridRefId:layout+'#grid=9',nativeGridId:9,
    worldId:null,areaRefId:null,originalDefaultObjectCount:1
  });
  f.initialItemRefs.push({
    ...f.initialItemRefs[0],gridRefId:layout+'#grid=9',
    worldId:null,areaRefId:null,instanceCount:1
  });
  f.coverage.gridReferencesInSubset=2;
  f.coverage.sourceInitialGridObjects=6;
  f.coverage.sourceInitialGridObjectsWithoutVerifiedWorldLink=1;
  const index=new WorldReferenceIndex(f);
  const first=index.originalPlacementsInWorld(world,{offset:0,limit:1});
  assert.equal(first.scope,'world');
  assert.equal(first.scopeIdentityInPartialSource,true);
  assert.equal(first.status,'source_native_verified');
  assert.equal(first.rows.length,1);
  assert.equal(first.matchingReferenceRowsInSubset,2);
  assert.equal(first.matchingOriginalInstancesInSubset,5);
  assert.equal(first.distinctItemIdsInSubset,2);
  assert.equal(first.nextOffset,1);
  assert.equal(first.hasNextPage,true);
  assert.equal(first.sourceCoverageComplete,false);
  assert.equal(first.itemOriginVerified,false);
  assert.equal(first.acquisitionLocationVerified,false);
  assert.equal(first.savedPlayerPlacementVerified,false);
  assert.equal(first.placementLegalityVerified,false);
  const second=index.originalPlacementsInWorld(world,{offset:1,limit:1});
  assert.equal(second.rows[0].itemId,'40000001');
  assert.equal(second.hasNextPage,false);
  assert.equal(second.nextOffset,null);
  assert.equal(index.originalPlacementsInArea(area).matchingOriginalInstancesInSubset,5);
  assert.deepEqual(index.originalPlacementsInArea(area).rows.map(r=>r.itemId),
    ['40000000','40000001']);
  const unlinked=index.originalPlacementsWithoutWorld();
  assert.equal(unlinked.scope,'unlinked_world');
  assert.equal(unlinked.rows.length,1);
  assert.equal(unlinked.rows[0].itemId,'40000000');
  assert.equal(unlinked.rows[0].worldId,null);
  assert.equal(unlinked.rows[0].areaRefId,null);
  assert.equal(unlinked.matchingOriginalInstancesInSubset,1);
  // The item-forward lookup still includes both the linked and unlinked rows.
  assert.equal(index.initialSourcePlacement('40000000').values.length,2);
});

test('missing reverse scope stays unknown; malformed pagination is rejected',()=>{
  const index=new WorldReferenceIndex(fixture());
  const unknownWorld=index.originalPlacementsInWorld('not-in-source');
  assert.equal(unknownWorld.status,'unverified');
  assert.equal(unknownWorld.scopeIdentityInPartialSource,false);
  assert.equal(unknownWorld.rows.length,0);
  assert.equal(unknownWorld.sourceCoverageComplete,false);
  const unknownArea=index.originalPlacementsInArea('not-in-source');
  assert.equal(unknownArea.status,'unverified');
  assert.equal(unknownArea.scopeIdentityInPartialSource,false);
  assert.equal(index.originalPlacementsWithoutWorld().status,'unverified');
  assert.equal(index.originalPlacementsWithoutWorld().scopeIdentityInPartialSource,true);
  for(const page of [
    {offset:-1,limit:1},{offset:0,limit:0},
    {offset:0,limit:513},{offset:0.5,limit:1},
    {offset:0,limit:Infinity}
  ]){
    assert.throws(()=>index.originalPlacementsInWorld(world,page),
      /INVALID_INITIAL_PLACEMENT_PAGE/);
  }
});
