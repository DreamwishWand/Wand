import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldReferenceIndex} from '../src/lib/world/reference-graph.ts';
import {createDb04NativeRealmSubtreeClient,
  DB04_REALM_SUBTREE,DB04_REALM_PARENT_EVIDENCE}
  from '../src/lib/world/native-realm-subtree.ts';

const SHA='a'.repeat(64);
const P='Worlds!AliceInWonderland!AliceInWonderland';
const C1='Worlds!AliceInWonderland!TableTop';
const C2='Worlds!AliceInWonderland!MirrorMaze';
const R='Worlds!Moana';
const V='village-layout:SceneLayouts/Village04/DefaultVillageLayout01.json';
const names=[P,C1,C2,R];
const parent=new Map([[C1,P],[C2,P]]);
const layout=name=>name.startsWith('Worlds!')?
  'SceneLayouts/Realms/'+name.slice(7).replaceAll('!','/')+'/DefaultLayout.json':
  'SceneLayouts/Village04/DefaultVillageLayout01.json';
const objects=new Map([[P,[[100,2]]],[C1,[[100,3],[101,1]]],
  [C2,[[102,4]]],[R,[[103,1]]]]);
function fixture(){
  const worlds=[
    ...names.map(worldId=>({
      worldId,worldIdKind:'nativeWorldName',worldType:'realm',
      nativeParentWorldId:parent.get(worldId)??null,
      nativeParentWorldRelationVerified:parent.has(worldId),
      nativeSceneId:null,defaultLayoutId:layout(worldId),
      sourceRootPresent:true,sourceScopeLabel:worldId.slice(7),
      nativeUniverseTagItemId:worldId===R?2000500003:2000500032,
      contentPackId:null,contentPackRelationVerified:false,
      worldCoverageComplete:false
    })),
    {
      worldId:V,worldIdKind:'derivedLayoutKey',worldType:'village_layout',
      nativeParentWorldId:null,nativeParentWorldRelationVerified:false,
      nativeSceneId:null,defaultLayoutId:layout(V),
      sourceRootPresent:true,sourceScopeLabel:'Village04',
      nativeUniverseTagItemId:null,
      contentPackId:null,contentPackRelationVerified:false,
      worldCoverageComplete:false
    }
  ];
  const grids=names.map((n,i)=>({
    gridRefId:layout(n)+'#grid='+i,
    gridRefIdKind:'derivedLayoutGridIdComposite',
    layoutId:layout(n),nativeGridId:i,
    gridDataPath:'GridData/Realms/Realm'+i+'.json',gridDataPresent:true,
    areaRefId:null,worldId:n,tessellationFactor:1,
    originalDefaultObjectCount:objects.get(n).reduce((sum,row)=>sum+row[1],0),
    nativeWorldCoordinatesVerified:false,placementLegalityVerified:false
  }));
  const placements=grids.flatMap(grid=>{
    const entries=objects.get(grid.worldId);
    return entries.map(([id,instanceCount])=>({
      itemId:String(id),relation:'nativeSourceDefaultGridObject',
      gridRefId:grid.gridRefId,layoutId:grid.layoutId,
      gridDataPath:grid.gridDataPath,worldId:grid.worldId,
      areaRefId:null,instanceCount,
      itemOriginWorldId:null,itemAcquisitionWorldId:null,
      playerPlacedWorldId:null,placeableWorldId:null,
      otherFourRelationsVerified:false,
      nativeCoordinatesStoredInOriginalLayoutObjects:true
    }));
  });
  return {
    schema:'wand.db04.native-reference-graph@1',
    status:'private_partial_exact_source_relations',
    sourceManifestStatus:'native_partial_world_extraction_preview',
    privateOnly:true,publicationAuthorized:false,
    target:{platform:'Steam',gameVersion:'1.26.2',
      nativeWorldManifestSha256:SHA},
    provenance:{noInferenceFromPathPrefixes:true},
    worlds,scenes:[],areas:[],
    layouts:[
      ...names.map(n=>({
        layoutId:layout(n),layoutKind:'nativeGridCollection',
        nativeDefaultObjectCount:objects.get(n).reduce((sum,r)=>sum+r[1],0),
        parentWorldId:n,parentAreaRefId:null,
        nativeSourceScopeLabel:n.slice(7),
        sourceWorldMembershipVerified:true,
        worldCoordinatesVerified:false,placementLegalityVerified:false
      })),
      {
        layoutId:layout(V),layoutKind:'nativeDefaultVillageData',
        nativeDefaultObjectCount:0,parentWorldId:V,parentAreaRefId:null,
        nativeSourceScopeLabel:'Village04',
        sourceWorldMembershipVerified:true,
        worldCoordinatesVerified:false,placementLegalityVerified:false
      }
    ],
    gridData:grids.map(grid=>({
      gridDataPath:grid.gridDataPath,
      nativeSizeX:10,nativeSizeY:10,
      nativeSourceFormat:'original_json_direct_floor_values',
      gridLocalToWorldTransformVerified:false,
      placementLegalityVerified:false
    })),
    gridRefs:grids,
    initialItemRefs:placements,
    worldCoverage:[],
    coverage:{
      worldDefinitionsInSubset:5,nativeNamedWorlds:4,
      derivedVillageWorldRoots:1,nativeParentWorldLinksInSubset:2,
      nativeAreaLayoutReferences:0,gridReferencesInSubset:4,
      sourceInitialGridObjects:11,
      sourceInitialGridObjectsWithoutVerifiedWorldLink:0,
      completeGameHierarchyVerified:false,
      allDlcAndAdventurePackIdsVerified:false,
      worldPlacementPermissionVerified:false,sourceCoverageComplete:false
    }
  };
}
function client(){return createDb04NativeRealmSubtreeClient(
  new WorldReferenceIndex(fixture()));}

test('source-only Realm parent/child subtree preserves exact original WorldData relations',()=>{
  const c=client();
  assert.equal(c.contract,DB04_REALM_SUBTREE);
  assert.equal(c.source.gameVersion,'1.26.2');
  assert.equal(c.source.privateOnly,true);
  assert.equal(c.source.completeRealmHierarchyVerified,false);
  const rootCandidates=c.listSourceRealmRootCandidates();
  assert.deepEqual(rootCandidates.map(x=>x.worldId),[P,R]);
  assert.equal(rootCandidates[0].sourceRootStatus,
    'no_parent_link_in_partial_original_source');
  assert.equal(rootCandidates[0].completeRealmHierarchyVerified,false);
  const group=c.getSourceRealmSubtree(P);
  assert.equal(group.nativeParentRelation,DB04_REALM_PARENT_EVIDENCE);
  assert.deepEqual(group.nativeWorldIdsPreorder,[P,C1,C2]);
  assert.deepEqual(group.nativeUniverseTagItemIds,[2000500032]);
  assert.equal(group.rootIsVerifiedGameRoot,false);
  assert.equal(group.nodes.length,3);
  assert.equal(group.nodes[0].sourceOriginalDefaultInstances,2);
  assert.equal(group.nodes[1].sourceOriginalDefaultInstances,4);
  assert.equal(group.nodes[2].sourceOriginalDefaultInstances,4);
  assert.deepEqual(group.nodes[0].directNativeChildWorldIds,[C1,C2]);
  assert.deepEqual(group.nodes[1].recordedNativeAncestorWorldIds,[P]);
  assert.equal(group.nodes[1].nativeParentLinkVerified,true);
  assert.equal(group.nodes[1].sourceRootStatus,'native_parent_link_verified');
  assert.equal(group.sourceOriginalDefaultReferenceRows,4);
  assert.equal(group.sourceOriginalDefaultInstances,10);
  assert.equal(group.sourceOriginalDefaultDistinctItemIds,3);
  assert.equal(group.contentPackRelationVerified,false);
  assert.equal(group.dlcEntitlementVerified,false);
  assert.equal(group.playerSavePlacementVerified,false);
  assert.equal(group.worldAcquisitionOrOriginVerified,false);
  assert.equal(group.placementLegalityVerified,false);
  assert.equal(group.sourceCoverageComplete,false);
  assert.deepEqual(c.getSourceRealmSubtree(C1).nativeWorldIdsPreorder,[C1]);
  assert.equal(c.getSourceRealmSubtree(C1).sourceOriginalDefaultInstances,4);
  assert.deepEqual(c.getSourceRealmSubtree(R).nativeUniverseTagItemIds,[2000500003]);
  assert.equal(c.getSourceRealmSubtree(V),null);
  assert.equal(c.getSourceRealmSubtree('Worlds!Unknown'),null);
  assert.throws(()=>group.nodes.push({}),TypeError);
  assert.throws(()=>{group.nodes[0].sourceWorld.contentPackId=123;},TypeError);
});

test('original default GridObject paging spans only source-verified native descendants',()=>{
  const c=client();
  const first=c.originalPlacementsInSourceRealmSubtree(P,{offset:0,limit:2});
  assert.equal(first.contract,DB04_REALM_SUBTREE);
  assert.deepEqual(first.rows.map(r=>r.itemId),['100','100']);
  assert.deepEqual(first.rows.map(r=>r.worldId),[P,C1]);
  assert.equal(first.matchingOriginalDefaultInstances,10);
  assert.equal(first.matchingDistinctItemIds,3);
  assert.equal(first.matchingSourceReferenceRows,4);
  assert.equal(first.hasNextPage,true);
  assert.equal(first.nextOffset,2);
  const second=c.originalPlacementsInSourceRealmSubtree(P,{offset:2,limit:2});
  assert.deepEqual(second.rows.map(r=>r.itemId),['101','102']);
  assert.equal(second.hasNextPage,false);
  assert.equal(second.nextOffset,null);
  assert.equal(second.sourceOnly,true);
  assert.equal(second.itemOriginVerified,false);
  assert.equal(second.acquisitionWorldVerified,false);
  assert.equal(second.playerSavePlacementVerified,false);
  assert.equal(second.dlcEntitlementVerified,false);
  assert.deepEqual(c.originalPlacementsInSourceRealmSubtree(C1)
    .rows.map(r=>r.worldId),[C1,C1]);
  assert.equal(c.originalPlacementsInSourceRealmSubtree(V),null);
  assert.equal(c.originalPlacementsInSourceRealmSubtree('Worlds!Unknown'),null);
  assert.throws(()=>c.originalPlacementsInSourceRealmSubtree(P,{
    offset:0,limit:513}),/INVALID_PAGE/);
  assert.throws(()=>c.getSourceRealmSubtree(''),/INVALID_WORLD_ID/);
  assert.throws(()=>first.rows.push({}),TypeError);
});

test('invalid or forged native parents cannot introduce synthetic children',()=>{
  const wrong=fixture();wrong.worlds[1].nativeParentWorldId=V;
  assert.throws(()=>new WorldReferenceIndex(wrong),/INVALID_NATIVE_PARENT_WORLD|NATIVE_WORLD_PARENT_CYCLE/);
  const cycle=fixture();cycle.worlds[0].nativeParentWorldId=C1;
  cycle.worlds[0].nativeParentWorldRelationVerified=true;
  cycle.coverage.nativeParentWorldLinksInSubset=3;
  assert.throws(()=>new WorldReferenceIndex(cycle),/NATIVE_WORLD_PARENT_CYCLE/);
  const mismatched=fixture();mismatched.target.gameVersion='1.26.1';
  assert.throws(()=>createDb04NativeRealmSubtreeClient(
    new WorldReferenceIndex(mismatched)),/EXACT_PRIVATE_WORLD_SOURCE_REQUIRED/);
  const corrupted=fixture();corrupted.worlds[1].contentPackId=101;
  assert.throws(()=>new WorldReferenceIndex(corrupted),/INVALID_WORLD_IDENTITY/);
});
