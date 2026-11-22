import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldReferenceIndex} from '../src/lib/world/reference-graph.ts';
import {createDb04GraphBrowser,DB04_GRAPH_BROWSER_CONTRACT}
  from '../src/lib/world/native-graph-browser.ts';

const root='SceneLayouts/Village04/Root.json';
const worldId='village-layout:'+root;
const areaRefId=root+'#areaType=1';
const layout='SceneLayouts/Village04/Area.json';
const loose='SceneLayouts/OffGridBuildings/Detached.json';
const grid=layout+'#grid=7';
const unlinked=loose+'#grid=0';
function fixture(){
  const ref=(gridRefId,layoutId,worldId,areaRefId,itemId,instanceCount)=>({
    gridRefId,layoutId,worldId,areaRefId,itemId,instanceCount,
    gridDataPath:layoutId===layout?
      'GridData/Villages/Area.json':'GridData/OffGrid/Detached.json',
    relation:'nativeSourceDefaultGridObject',
    itemOriginWorldId:null,itemAcquisitionWorldId:null,
    playerPlacedWorldId:null,placeableWorldId:null,
    otherFourRelationsVerified:false,
    nativeCoordinatesStoredInOriginalLayoutObjects:true
  });
  const makeGrid=(layoutId,id,world,area,count,path)=>({
    gridRefId:layoutId+'#grid='+id,
    gridRefIdKind:'derivedLayoutGridIdComposite',
    layoutId,nativeGridId:id,worldId:world,areaRefId:area,
    gridDataPath:path,gridDataPresent:true,
    tessellationFactor:1,originalDefaultObjectCount:count,
    nativeWorldCoordinatesVerified:false,placementLegalityVerified:false
  });
  const makeLayout=(layoutId,kind,count,world,area)=>({
    layoutId,layoutKind:kind,nativeDefaultObjectCount:count,
    parentWorldId:world,parentAreaRefId:area,
    nativeSourceScopeLabel:world?'Village04':'OffGrid',
    sourceWorldMembershipVerified:world!==null,
    worldCoordinatesVerified:false,placementLegalityVerified:false
  });
  return {
    schema:'wand.db04.native-reference-graph@1',
    target:{platform:'Steam',gameVersion:'1.26.2',
      nativeWorldManifestSha256:'a'.repeat(64)},
    status:'private_partial_exact_source_relations',
    sourceManifestStatus:'native_partial_world_extraction_preview',
    privateOnly:true,publicationAuthorized:false,
    provenance:{noInferenceFromPathPrefixes:true},
    worlds:[{
      worldId,worldIdKind:'derivedLayoutKey',worldType:'village_layout',
      nativeParentWorldId:null,nativeParentWorldRelationVerified:false,
      nativeSceneId:null,defaultLayoutId:root,
      sourceRootPresent:true,sourceScopeLabel:'Village04',
      nativeUniverseTagItemId:null,contentPackId:null,
      contentPackRelationVerified:false,worldCoverageComplete:false
    }],
    scenes:[],
    areas:[{
      areaRefId,areaRefIdKind:'derivedRootLayoutAreaTypeComposite',
      nativeAreaId:null,nativeAreaTypeCode:1,nativeAreaTypeName:'Beach',
      parentVillageLayoutId:root,separateAreaParentLayoutId:null,
      nativeSceneId:null,worldId,gridLayoutId:layout,
      gridLayoutPresent:true,
      sourceProof:'Meta.DefaultVillageData.areaLayoutReferences',
      sourceWorldRelationVerified:true,
      gameplayBiomeMembershipVerified:false,placementLegalityVerified:false
    }],
    layouts:[
      makeLayout(root,'nativeDefaultVillageData',0,worldId,null),
      makeLayout(layout,'nativeGridCollection',3,worldId,areaRefId),
      makeLayout(loose,'nativeGridCollection',2,null,null)
    ],
    gridData:[
      {gridDataPath:'GridData/Villages/Area.json',nativeSizeX:10,nativeSizeY:10,
        nativeSourceFormat:'original_json_direct_floor_values',
        gridLocalToWorldTransformVerified:false,placementLegalityVerified:false},
      {gridDataPath:'GridData/OffGrid/Detached.json',nativeSizeX:10,nativeSizeY:10,
        nativeSourceFormat:'original_json_direct_floor_values',
        gridLocalToWorldTransformVerified:false,placementLegalityVerified:false}
    ],
    gridRefs:[
      makeGrid(layout,7,worldId,areaRefId,3,'GridData/Villages/Area.json'),
      makeGrid(loose,0,null,null,2,'GridData/OffGrid/Detached.json')
    ],
    initialItemRefs:[
      ref(grid,layout,worldId,areaRefId,'100',2),
      ref(grid,layout,worldId,areaRefId,'101',1),
      ref(unlinked,loose,null,null,'100',2)
    ],
    worldCoverage:[{
      worldId,sourceAreaRefCount:1,sourceGridRefCount:1,
      initialSourceGridObjectCount:3,allGameAreasCovered:false,
      allSourceLayoutsCovered:false
    }],
    coverage:{
      sourceInitialGridObjects:5,
      sourceInitialGridObjectsWithoutVerifiedWorldLink:2,
      worldDefinitionsInSubset:1,
      nativeAreaLayoutReferences:1,
      gridReferencesInSubset:2,
      completeGameHierarchyVerified:false,
      allDlcAndAdventurePackIdsVerified:false,
      worldPlacementPermissionVerified:false,sourceCoverageComplete:false
    }
  };
}
function browser(){return createDb04GraphBrowser(
  new WorldReferenceIndex(fixture()));}
const query=(scope,scopeId,rest={})=>({
  scope,scopeId,offset:0,limit:100,...rest
});

test('local-only browser projects original World, Area, Grid IDs but not private raw JSON',()=>{
  const b=browser();
  assert.equal(b.catalog.contract,DB04_GRAPH_BROWSER_CONTRACT);
  assert.equal(b.catalog.sourcePlatform,'Steam');
  assert.equal(b.catalog.sourceGameVersion,'1.26.2');
  assert.equal(b.catalog.sourceWorlds.length,1);
  assert.equal(b.catalog.sourceAreas.length,1);
  assert.equal(b.catalog.sourceGrids.length,2);
  assert.equal(b.catalog.sourceGrids[1].worldId,null);
  assert.equal(b.catalog.sourceGrids[0].gridDataPath,
    'GridData/Villages/Area.json');
  assert.equal(b.catalog.sourceGrids[1].gridDataPath,
    'GridData/OffGrid/Detached.json');
  assert.equal(b.catalog.sourceAreas[0].gridDataPath,null);
  assert.equal(b.catalog.sourceWorlds[0].gridDataPath,null);
  assert.equal(b.catalog.sourceGrids[1].sourceDefaultInstances,2);
  assert.equal(b.catalog.totalSourceDefaultInstances,5);
  assert.equal(b.catalog.worldUnlinkedSourceDefaultInstances,2);
  assert.equal(b.catalog.originalSourceAuthenticationVerified,false);
  assert.equal(b.catalog.contentPackIdsVerified,false);
  assert.equal(b.catalog.gameplayBiomeMembershipVerified,false);
  assert.equal(b.catalog.savedPlayerPlacementVerified,false);
  assert.throws(()=>b.catalog.sourceGrids.push({}),TypeError);
});

test('source-only World/Area/Grid and unlinked queries remain disjoint',()=>{
  const b=browser();
  for(const [scope,id,total] of [
    ['world',worldId,3],['area',areaRefId,3],
    ['grid',grid,3],['grid',unlinked,2],
    ['unlinked_world',null,2]
  ]){
    const p=b.page(query(scope,id));
    assert.equal(p.contract,DB04_GRAPH_BROWSER_CONTRACT);
    assert.equal(p.originalSourceInstances,total);
    assert.equal(p.sourceScopeReferenceVerified,true);
    assert.equal(p.sourceDefaultOnly,true);
    assert.equal(p.sourceCoverageComplete,false);
    assert.equal(p.originalItemOriginVerified,false);
    assert.equal(p.acquisitionLocationVerified,false);
    assert.equal(p.currentPlayerSavePlacementVerified,false);
    assert.equal(p.placementLegalityVerified,false);
    assert.equal(p.contentPackRelationVerified,false);
  }
  assert.deepEqual(b.page(query('world',worldId)).rows.map(x=>x.itemId),
    ['100','101']);
  assert.deepEqual(b.page(query('grid',unlinked)).rows.map(x=>x.itemId),
    ['100']);
  assert.equal(b.page(query('unlinked_world',null)).rows[0].sourceWorldId,null);
});

test('exact Item ID filter crosses direct World and unlinked Grid without inventing World',()=>{
  const b=browser();
  const all=b.page(query('world',worldId,{exactItemId:'100',limit:1}));
  assert.equal(all.originalSourceReferenceRows,1);
  assert.equal(all.originalSourceInstances,2);
  assert.equal(all.distinctItemIds,1);
  assert.equal(all.rows.length,1);
  const looseRow=b.page(query('unlinked_world',null,{exactItemId:'100'}));
  assert.equal(looseRow.originalSourceInstances,2);
  assert.equal(looseRow.rows[0].sourceWorldId,null);
  const absent=b.page(query('area',areaRefId,{exactItemId:'999'}));
  assert.equal(absent.originalSourceReferenceRows,0);
  assert.equal(absent.distinctItemIds,0);
  const page=b.page(query('world',worldId,{offset:0,limit:1}));
  assert.equal(page.hasNextPage,true);
  assert.equal(page.nextOffset,1);
  assert.equal(b.page(query('world',worldId,{offset:1,limit:1})).rows[0].itemId,'101');
  assert.throws(()=>page.rows.push({}),TypeError);
});

test('invalid scope, version and huge page cannot become verified source data',()=>{
  const b=browser();
  assert.throws(()=>b.page(query('area',worldId)),/UNKNOWN_SOURCE_SCOPE/);
  assert.throws(()=>b.page(query('grid','missing')), /UNKNOWN_SOURCE_SCOPE/);
  assert.throws(()=>b.page(query('world',worldId,{limit:129})),/INVALID_QUERY/);
  assert.throws(()=>b.page(query('world',worldId,{offset:-1})),/INVALID_QUERY/);
  assert.throws(()=>b.page(query('world',worldId,{exactItemId:'1x'})),/INVALID_EXACT_ITEM_ID/);
  assert.throws(()=>b.page(query('unlinked_world',worldId)),/UNKNOWN_SOURCE_SCOPE/);
  const invalid=fixture();invalid.target.gameVersion='1.26.1';
  assert.throws(()=>createDb04GraphBrowser(new WorldReferenceIndex(invalid)),
    /PRIVATE_STEAM1262_SOURCE_REQUIRED/);
});
