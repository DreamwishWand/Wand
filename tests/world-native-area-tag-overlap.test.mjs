import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldReferenceIndex} from '../src/lib/world/reference-graph.ts';
import {DB04_NATIVE_SCOPE_CLIENT} from '../src/lib/world/native-item-scope.ts';
import {createDb04NativeAreaTagClient,DB04_NATIVE_AREA_TAG_JOIN,
  DB04_NATIVE_AREA_TAG_PROOF}
  from '../src/lib/world/native-area-tag-overlap.ts';

const root='SceneLayouts/Village04/DefaultVillageLayout01.json';
const worldId='village-layout:'+root;
const areaIds=[root+'#areaType=0',root+'#areaType=1'];
const layouts=['SceneLayouts/Village04/Beach.json',
  'SceneLayouts/Village04/Meadow.json'];
const path=['GridData/Villages/Beach.json',
  'GridData/Villages/Meadow.json'];
const hash=c=>c.repeat(64);

function worldGraph(){
  const sourceWorld={
    worldId,worldIdKind:'derivedLayoutKey',worldType:'village_layout',
    nativeParentWorldId:null,nativeParentWorldRelationVerified:false,
    nativeSceneId:1540000000,defaultLayoutId:root,sourceRootPresent:true,
    sourceScopeLabel:'Village04',nativeUniverseTagItemId:null,
    contentPackId:null,contentPackRelationVerified:false,
    worldCoverageComplete:false
  };
  const sourceAreas=areaIds.map((areaRefId,i)=>({
    areaRefId,areaRefIdKind:'derivedRootLayoutAreaTypeComposite',
    nativeAreaId:i===0?'1540000000:0':null,
    nativeAreaTypeCode:i,nativeAreaTypeName:i===0?'Beach':'Meadow',
    parentVillageLayoutId:root,separateAreaParentLayoutId:null,
    nativeSceneId:1540000000,worldId,gridLayoutId:layouts[i],
    gridLayoutPresent:true,
    sourceProof:'Meta.DefaultVillageData.areaLayoutReferences',
    sourceWorldRelationVerified:true,gameplayBiomeMembershipVerified:false,
    placementLegalityVerified:false,
    nativeProtoDbAreaRecordVerified:i===0,
    nativeGroundNavMeshAreaId:i===0?3:null,
    nativeWaterNavMeshAreaId:i===0?4:null,
    nativeUnlockPlayerLevel:null,
    nativeAreaTypeFieldPresent:i===0?false:null,
    nativeNavMeshPlacementLegalityVerified:false
  }));
  const makeLayout=(layoutId,parentAreaRefId,objects)=>({
    layoutId,layoutKind:parentAreaRefId?'nativeGridCollection':'nativeDefaultVillageData',
    nativeDefaultObjectCount:objects,parentWorldId:worldId,
    parentAreaRefId,nativeSourceScopeLabel:'Village04',
    sourceWorldMembershipVerified:true,worldCoordinatesVerified:false,
    placementLegalityVerified:false
  });
  const gridRefs=layouts.map((layoutId,i)=>({
    gridRefId:layoutId+'#grid=0',
    gridRefIdKind:'derivedLayoutGridIdComposite',
    layoutId,nativeGridId:0,gridDataPath:path[i],gridDataPresent:true,
    areaRefId:areaIds[i],worldId,tessellationFactor:1,
    originalDefaultObjectCount:i===0?6:5,
    nativeWorldCoordinatesVerified:false,placementLegalityVerified:false
  }));
  const row=(areaIndex,id,count)=>({
    itemId:String(id),relation:'nativeSourceDefaultGridObject',
    gridRefId:layouts[areaIndex]+'#grid=0',layoutId:layouts[areaIndex],
    gridDataPath:path[areaIndex],worldId,areaRefId:areaIds[areaIndex],
    instanceCount:count,itemOriginWorldId:null,itemAcquisitionWorldId:null,
    playerPlacedWorldId:null,placeableWorldId:null,
    otherFourRelationsVerified:false,
    nativeCoordinatesStoredInOriginalLayoutObjects:true
  });
  return new WorldReferenceIndex({
    schema:'wand.db04.native-reference-graph@1',
    target:{platform:'Steam',gameVersion:'1.26.2',
      nativeWorldManifestSha256:hash('a')},
    status:'private_partial_exact_source_relations',
    sourceManifestStatus:'native_partial_world_extraction_preview',
    privateOnly:true,publicationAuthorized:false,
    provenance:{noInferenceFromPathPrefixes:true},
    worlds:[sourceWorld],
    scenes:[{nativeSceneId:1540000000,nativeSceneName:'Village',
      nativeSceneKindCode:1,worldId,worldMembershipVerifiedByExactSourceLink:true}],
    areas:sourceAreas,
    layouts:[makeLayout(root,null,0),makeLayout(layouts[0],areaIds[0],6),
      makeLayout(layouts[1],areaIds[1],5)],
    gridData:path.map(gridDataPath=>({
      gridDataPath,nativeSizeX:10,nativeSizeY:10,
      nativeSourceFormat:'original_json_direct_floor_values',
      gridLocalToWorldTransformVerified:false,placementLegalityVerified:false
    })),
    gridRefs,
    initialItemRefs:[row(0,10,3),row(0,11,2),row(0,90000,1),
      row(1,12,4),row(1,10,1)],
    worldCoverage:[],
    coverage:{
      worldDefinitionsInSubset:1,nativeAreaLayoutReferences:2,
      nativeProtoDbAreaRecordsLinked:1,
      gridReferencesInSubset:2,sourceInitialGridObjects:11,
      sourceInitialGridObjectsWithoutVerifiedWorldLink:0,
      completeGameHierarchyVerified:false,
      allDlcAndAdventurePackIdsVerified:false,
      worldPlacementPermissionVerified:false,sourceCoverageComplete:false
    }
  });
}
function nativeScope(){
  const definitions={
    10:['IsDreamlightValley'],11:['IsEternityIsle'],12:[]
  };
  return {
    contract:DB04_NATIVE_SCOPE_CLIENT,
    source:{platform:'Steam',gameVersion:'1.26.2',
      privateOnly:true,publicationAuthorized:false,
      originalItemDefinitions:13202,
      auditSha256:hash('b'),rowsSha256:hash('c'),
      originalTagSha256:hash('d')},
    getItem(id){
      return Object.hasOwn(definitions,id)?
        {itemId:id,nativeCategory:'Furniture',
          worldsDirect:definitions[id],universeTagsDirect:[],
          universeSetCandidates:[],setDefinitionIds:[]}:null;
    }
  };
}
test('original source Area proof distinguishes eight protoDb Areas from layout-only Areas',()=>{
  const client=createDb04NativeAreaTagClient(worldGraph(),nativeScope());
  assert.equal(client.contract,DB04_NATIVE_AREA_TAG_JOIN);
  assert.deepEqual(client.coverage,{
    sourceAreaReferences:2,nativeProtoDbAreaRecordsVerified:1,
    sourceLayoutOnlyAreaReferences:1,areaNativeGridReferences:2,
    sourceDefaultGridObjectReferenceRows:5,
    sourceDefaultGridObjectInstances:11,sourceCoverageComplete:false
  });
  assert.equal(client.source.gameVersion,'1.26.2');
  assert.equal(client.source.privateOnly,true);
  assert.equal(client.listSourceAreas().length,2);
  assert.equal(client.areasInSourceWorld(worldId).length,2);
  const first=client.getSourceArea(areaIds[0]);
  const second=client.getSourceArea(areaIds[1]);
  assert.equal(first.proof,DB04_NATIVE_AREA_TAG_PROOF);
  assert.equal(first.originalProtoDbAreaRecordVerified,true);
  assert.equal(first.originalProtoDbArea?.nativeAreaId,'1540000000:0');
  assert.equal(first.originalProtoDbArea?.nativeGroundNavMeshAreaId,3);
  assert.equal(first.originalProtoDbArea?.navMeshPlacementLegalityVerified,false);
  assert.equal(second.originalProtoDbAreaRecordVerified,false);
  assert.equal(second.originalProtoDbArea,null);
  assert.equal(second.sourceArea.nativeAreaTypeName,'Meadow');
  assert.equal(second.gameUiBiomeMembershipVerified,false);
  assert.equal(second.contentPackId,null);
  assert.equal(second.contentPackRelationVerified,false);
  assert.equal(second.dlcEntitlementVerified,false);
  assert.equal(second.itemOriginWorldVerified,false);
  assert.equal(second.acquisitionWorldVerified,false);
  assert.equal(second.playerSavePlacementVerified,false);
  assert.equal(first.sourceDefaultGridObjectInstances,6);
  assert.equal(second.sourceDefaultGridObjectInstances,5);
  assert.deepEqual(first.originalWorldTags.slice(0,2),[
    {worldTag:'IsDreamlightValley',originalReferenceRows:1,
      originalInstances:3,distinctItemIds:1},
    {worldTag:'IsEternityIsle',originalReferenceRows:1,
      originalInstances:2,distinctItemIds:1}
  ]);
  assert.equal(first.outsideFourOriginalItemCategories.originalInstances,1);
  assert.equal(second.noDirectWorldTag.originalInstances,4);
  assert.equal(second.originalWorldTags[0].originalInstances,1);
  assert.throws(()=>first.originalWorldTags.push({}),TypeError);
  assert.throws(()=>{first.sourceArea.nativeAreaTypeName='Forged';},TypeError);
});
test('reverse Area lookup by original World Tag does not infer World membership',()=>{
  const api=createDb04NativeAreaTagClient(worldGraph(),nativeScope());
  assert.deepEqual(api.byOriginalWorldTag('IsDreamlightValley'),[
    {areaRefId:areaIds[0],sourceWorldId:worldId,
      originalProtoDbAreaRecordVerified:true,
      originalReferenceRows:1,originalInstances:3,
      distinctItemIds:1,nativeWorldTagDoesNotProveBiomeOrDlc:true},
    {areaRefId:areaIds[1],sourceWorldId:worldId,
      originalProtoDbAreaRecordVerified:false,
      originalReferenceRows:1,originalInstances:1,
      distinctItemIds:1,nativeWorldTagDoesNotProveBiomeOrDlc:true}
  ]);
  assert.deepEqual(api.byOriginalWorldTag('isHoneywood'),[]);
  assert.deepEqual(api.areasInSourceWorld('village-layout:unknown'),[]);
  assert.equal(api.getSourceArea('missing'),null);
  assert.throws(()=>api.byOriginalWorldTag('Unknown'),/INVALID_WORLD_TAG/);
  assert.throws(()=>api.getSourceArea(''),/INVALID_AREA_REF_ID/);
});
test('scope version and falsified original World Tag identities fail closed',()=>{
  const bad=nativeScope();bad.source.gameVersion='1.26.1';
  assert.throws(()=>createDb04NativeAreaTagClient(worldGraph(),bad),
    /PRIVATE_ORIGINAL_ITEM_SCOPE_REQUIRED/);
  const publicSource=nativeScope();publicSource.source.privateOnly=false;
  assert.throws(()=>createDb04NativeAreaTagClient(worldGraph(),publicSource),
    /PRIVATE_ORIGINAL_ITEM_SCOPE_REQUIRED/);
  const corrupted=nativeScope();
  const original=corrupted.getItem;
  corrupted.getItem=id=>{
    const value=original(id);
    return value?{...value,worldsDirect:['IsUnknownWorld']}:null;
  };
  assert.throws(()=>createDb04NativeAreaTagClient(worldGraph(),corrupted),
    /ORIGINAL_ITEM_WORLD_TAG_IDENTITY/);
  const wrongIdentity=nativeScope();
  wrongIdentity.getItem=id=>{
    const v=nativeScope().getItem(id);
    return v?{...v,itemId:id+1}:null;
  };
  assert.throws(()=>createDb04NativeAreaTagClient(worldGraph(),wrongIdentity),
    /ORIGINAL_ITEM_WORLD_TAG_IDENTITY/);
});
