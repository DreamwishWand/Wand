import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSourceGridQuery,projectSavedSourceNumericCandidates,
  DB04_SAVED_SOURCE_CANDIDATE_CONTRACT,
} from '../src/lib/world/saved-grid-source-candidates.ts';

const query={
  viewKey:'["village","SceneLayouts/Village04/Default.json",3]',
  nativeGridId:1,
  sourceRefs:[{
    layoutId:'SceneLayouts/Village04/Beach.json',
    gridDataPath:'GridData/Village04/Beach.json',
    nativeGridId:1,nativeSizeX:16,nativeSizeY:16,
    tessellationFactor:1,
  }],
};
const sourceRows=(rows)=>({
  contract:'wand.db05.db04-grid-object-source-context@2',
  rows:rows.map((row,i)=>({localOrdinal:i+1,
    sourceStatus:row, candidateCount:row==='full_exact_source_path_candidate'?1:0})),
  sourceCoverageComplete:false,sourceArchiveRechecked:false,
  savedGridIdentityVerified:false,
  savedSourceCoordinateEquivalenceVerified:false,
  worldCoordinateTransformVerified:false,placementLegalityVerified:false,
  editPermissionAuthorized:false,
});
const instanceRows=(rows,extra={})=>({
  contract:'wand.db05.grid-instance-preview@2',
  status:'saved_object_instances',sampled:false,invalidRecords:0,
  effectivePlacementVerified:false,legalPlacementVerified:false,
  sourceGridIdentityVerified:false,stableInstanceIdentityVerified:false,
  saveWritingAuthorized:false,rows,
  ...extra
});
const row=(localOrdinal,x,y,kind='full')=>({
  localOrdinal,localGridOrdinal:1,itemId:'40000049',recordKind:kind,
  x,y,orientation:'GridOrientation_Up',
  coordinatesObserved:x!==null&&y!==null,
});

test('unique FULL original path pair yields saved numeric candidate points, never terrain occupancy',()=>{
  const instances=instanceRows([
    row(1,3,7),row(2,18,3),row(3,5,5,'diff_modified'),
    row(4,null,null),row(5,0,0),
  ]);
  const sources=sourceRows([
    'full_exact_source_path_candidate','full_exact_source_path_candidate',
    'diff_structural_candidate_hash_unverified',
    'full_exact_source_path_candidate','not_in_partial_source',
  ]);
  const projected=projectSavedSourceNumericCandidates(query,instances,sources);
  assert.equal(projected.contract,DB04_SAVED_SOURCE_CANDIDATE_CONTRACT);
  assert.equal(projected.status,'full_path_pair_numeric_candidates');
  assert.equal(projected.matchedRecordCount,2);
  assert.equal(projected.displayedCount,2);
  assert.equal(projected.outsideSourceNumericEnvelopeCount,1);
  assert.equal(projected.rowsWithoutCoordinates,1);
  assert.equal(projected.otherOrAmbiguousSaveRecords,2);
  assert.deepEqual(projected.points.map(x=>[x.localOrdinal,x.x,x.y]),
    [[1,3,7],[2,18,3]]);
  for(const key of [
    'saveGridIdentityVerified','savedAndSourceCoordinatesEquivalent',
    'playerPlacementVerified','sourceTerrainOccupancyVerified',
    'nativeCollisionRulesVerified','legalPlacementVerified',
    'saveWritingAuthorized',
  ])assert.equal(projected[key],false,key);
});

test('ambiguous native Grid IDs sharing exact source path never map Save to one grid',()=>{
  const ambiguous={...query,sourceRefs:[
    query.sourceRefs[0],
    {...query.sourceRefs[0],nativeGridId:2},
  ]};
  const projected=projectSavedSourceNumericCandidates(
    ambiguous,instanceRows([row(1,4,5)]),
    sourceRows(['full_exact_source_path_candidate']));
  assert.equal(projected.status,'no_full_path_pair_candidates');
  assert.equal(projected.matchedRecordCount,0);
  assert.equal(projected.displayedCount,0);
  assert.equal(projected.sourceReferenceCount,2);
});

test('invalid or sampled private Save never claims observable candidate points',()=>{
  const instances=instanceRows([row(1,4,5)],{sampled:true});
  const result=projectSavedSourceNumericCandidates(
    query,instances,sourceRows(['full_exact_source_path_candidate']));
  assert.equal(result.status,'save_grid_inconclusive');
  assert.equal(result.matchedRecordCount,0);
  assert.deepEqual(result.points,[]);
});

test('a bounded positional sample declares skipped coordinates rather than hiding count',()=>{
  const instances=instanceRows(Array.from({length:5},
    (_,i)=>row(i+1,i,i)));
  const sources=sourceRows(Array(5).fill('full_exact_source_path_candidate'));
  const selected=projectSavedSourceNumericCandidates(query,instances,sources,2);
  assert.equal(selected.matchedRecordCount,5);
  assert.equal(selected.displayedCount,2);
  assert.equal(selected.dataSampled,true);
});

test('validated source witness rejects mixed grid paths, duplicate IDs, missing selected native grid',()=>{
  assert.deepEqual(validateSourceGridQuery(query),query);
  for(const source of [
    {...query,sourceRefs:[query.sourceRefs[0],
      {...query.sourceRefs[0],nativeGridId:2,
        gridDataPath:'GridData/Other/Another.json'}]},
    {...query,sourceRefs:[query.sourceRefs[0],query.sourceRefs[0]]},
    {...query,nativeGridId:99},
    {...query,sourceRefs:[{...query.sourceRefs[0],
      gridDataPath:'GridData/../Secret.json'}]},
  ])assert.throws(()=>validateSourceGridQuery(source),/DB04_SAVE_SOURCE_WITNESS/);
});

test('receipt contracts, unsafe coordinate types and true permissions fail closed',()=>{
  const instances=instanceRows([row(1,1,3)]);
  const matched=sourceRows(['full_exact_source_path_candidate']);
  assert.throws(()=>projectSavedSourceNumericCandidates(
    query,{...instances,legalPlacementVerified:true},matched),
  /DB04_SAVE_SOURCE_RECEIPT_INVALID/);
  assert.throws(()=>projectSavedSourceNumericCandidates(
    query,instances,{...matched,savedGridIdentityVerified:true}),
  /DB04_SAVE_SOURCE_RECEIPT_INVALID/);
  assert.throws(()=>projectSavedSourceNumericCandidates(
    query,instanceRows([{...row(1,1,3),x:1.4}]),matched),
  /DB04_SAVE_SOURCE_RECEIPT_ROW_INVALID/);
  assert.throws(()=>projectSavedSourceNumericCandidates(
    query,instances,sourceRows([])),
  /DB04_SAVE_SOURCE_RECEIPT_INVALID/);
});
