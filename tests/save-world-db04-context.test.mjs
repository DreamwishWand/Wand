import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldReferenceIndex,DB04_REFERENCE_SCHEMA}
  from '../src/lib/world/reference-graph.ts';
import {compareSavedGridItemsWithDb04}
  from '../src/lib/save/save-world-db04-context.ts';

function verifiedSource(){
  const layout='SceneLayouts/Synthetic/Grid.json';
  const data='GridData/Synthetic/Grid.json';
  const gridRefId=layout+'#grid=7';
  return new WorldReferenceIndex({
    schema:DB04_REFERENCE_SCHEMA,
    target:{platform:'Steam',gameVersion:'1.26.2',
      nativeWorldManifestSha256:'a'.repeat(64)},
    status:'private_partial_exact_source_relations',
    sourceManifestStatus:'synthetic_test_only',
    privateOnly:true,publicationAuthorized:false,
    provenance:{synthetic:true},
    worlds:[],scenes:[],areas:[],
    layouts:[{layoutId:layout,layoutKind:'nativeGridCollection',
      nativeDefaultObjectCount:2,parentWorldId:null,parentAreaRefId:null,
      nativeSourceScopeLabel:'Synthetic',
      sourceWorldMembershipVerified:false,worldCoordinatesVerified:false,
      placementLegalityVerified:false}],
    gridData:[{gridDataPath:data,nativeSizeX:10,nativeSizeY:10,
      nativeSourceFormat:'synthetic',gridLocalToWorldTransformVerified:false,
      placementLegalityVerified:false}],
    gridRefs:[{gridRefId,gridRefIdKind:'derivedLayoutGridIdComposite',
      layoutId:layout,nativeGridId:7,gridDataPath:data,gridDataPresent:true,
      areaRefId:null,worldId:null,tessellationFactor:1,
      originalDefaultObjectCount:2,nativeWorldCoordinatesVerified:false,
      placementLegalityVerified:false}],
    initialItemRefs:[{
      itemId:'40000001',relation:'nativeSourceDefaultGridObject',
      gridRefId,layoutId:layout,gridDataPath:data,
      worldId:null,areaRefId:null,instanceCount:2,
      itemOriginWorldId:null,itemAcquisitionWorldId:null,
      playerPlacedWorldId:null,placeableWorldId:null,
      otherFourRelationsVerified:false,
      nativeCoordinatesStoredInOriginalLayoutObjects:true
    }],
    worldCoverage:[],
    coverage:{worldDefinitionsInSubset:0,nativeAreaLayoutReferences:0,
      gridReferencesInSubset:1,sourceInitialGridObjects:2,
      sourceInitialGridObjectsWithoutVerifiedWorldLink:2,
      completeGameHierarchyVerified:false,
      allDlcAndAdventurePackIdsVerified:false,
      worldPlacementPermissionVerified:false,
      sourceCoverageComplete:false}
  });
}
test('DB-05 uses independently verified DB-04 source defaults as annotations only',()=>{
  const indexed=verifiedSource();
  const results=compareSavedGridItemsWithDb04([
    {itemId:'30000031',fullGridReferences:1,diffModifiedReferences:0},
    {itemId:'40000001',fullGridReferences:1,diffModifiedReferences:1}
  ],indexed);
  assert.equal(results.contract,'wand.db05.db04-source-only-comparison@1');
  assert.equal(results.rows[0].sourceInitialStatus,'unverified');
  assert.equal(results.rows[0].nativeSourceInitialInstances,0);
  assert.equal(results.rows[1].sourceInitialStatus,'source_native_verified');
  assert.equal(results.rows[1].nativeSourceInitialInstances,2);
  // Two source initial instances do NOT prove two saved placed objects, any
  // world of player placement, or whether an edit is safe or allowed.
  assert.equal(results.rows[1].saveGridIdentityMatched,false);
  assert.equal(results.rows[1].effectivePlacedCountVerified,false);
  assert.equal(results.rows[1].playerPlacedWorldVerified,false);
  assert.equal(results.rows[1].editPermissionFromWorld,false);
  assert.equal(results.worldOfPlayerPlacementVerified,false);
  assert.equal(results.sourceCoverageComplete,false);
  assert.equal(results.exportAuthorized,false);
});
test('source-only DB-04 bridge refuses forged, duplicate or unsorted references',()=>{
  const source=verifiedSource();
  assert.throws(()=>compareSavedGridItemsWithDb04([
    {itemId:'40000001',fullGridReferences:1,diffModifiedReferences:1}
  ],{}),/VERIFIED_SOURCE_REQUIRED/);
  assert.throws(()=>compareSavedGridItemsWithDb04([
    {itemId:'40000001',fullGridReferences:1,diffModifiedReferences:1},
    {itemId:'40000001',fullGridReferences:2,diffModifiedReferences:0}
  ],source),/SAVED_GRID_REFERENCE_INVALID/);
  assert.throws(()=>compareSavedGridItemsWithDb04([
    {itemId:'40000001',fullGridReferences:0,diffModifiedReferences:0}
  ],source),/SAVED_GRID_REFERENCE_INVALID/);
  assert.throws(()=>compareSavedGridItemsWithDb04([
    {itemId:'40000001',fullGridReferences:1,diffModifiedReferences:1,
      layoutId:'private-grid'}
  ],source),/SAVED_GRID_REFERENCE_INVALID/);
});
