import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldReferenceIndex} from '../src/lib/world/reference-graph.ts';
import {createDb04ItemGeographyBridge,DB04_ITEM_GEOGRAPHY_JOIN
  } from '../src/lib/world/item-geography.ts';

const layout='SceneLayouts/Realms/Example/Original.json';
const gridData='GridData/Realms/Example.json';
const worldId='Worlds!Example';
const gridRef=layout+'#grid=0';
function worldFixture(){
  return {
    schema:'wand.db04.native-reference-graph@1',
    target:{platform:'Steam',gameVersion:'1.26.2',
      nativeWorldManifestSha256:'a'.repeat(64)},
    status:'private_partial_exact_source_relations',
    sourceManifestStatus:'partial_game_native_evidence',
    privateOnly:true,publicationAuthorized:false,
    provenance:{noInferenceFromPathPrefixes:true},
    worlds:[{
      worldId,worldIdKind:'nativeWorldName',worldType:'realm',
      nativeParentWorldId:null,nativeParentWorldRelationVerified:false,
      nativeSceneId:123,defaultLayoutId:layout,sourceRootPresent:true,
      sourceScopeLabel:'Realms',nativeUniverseTagItemId:null,
      contentPackId:null,contentPackRelationVerified:false,
      worldCoverageComplete:false
    }],
    scenes:[{nativeSceneId:123,nativeSceneName:'Example',
      nativeSceneKindCode:1,worldId,
      worldMembershipVerifiedByExactSourceLink:true}],
    areas:[],
    layouts:[{
      layoutId:layout,layoutKind:'nativeGridCollection',
      nativeDefaultObjectCount:2,parentWorldId:worldId,
      parentAreaRefId:null,nativeSourceScopeLabel:'Realms',
      sourceWorldMembershipVerified:true,worldCoordinatesVerified:false,
      placementLegalityVerified:false
    }],
    gridData:[{
      gridDataPath:gridData,nativeSizeX:10,nativeSizeY:10,
      nativeSourceFormat:'original_binary_packed',
      gridLocalToWorldTransformVerified:false,
      placementLegalityVerified:false
    }],
    gridRefs:[{
      gridRefId:gridRef,gridRefIdKind:'derivedLayoutGridIdComposite',
      layoutId:layout,nativeGridId:0,gridDataPath:gridData,
      gridDataPresent:true,areaRefId:null,worldId,
      tessellationFactor:1,originalDefaultObjectCount:2,
      nativeWorldCoordinatesVerified:false,placementLegalityVerified:false
    }],
    initialItemRefs:[{
      itemId:'12345678',relation:'nativeSourceDefaultGridObject',
      gridRefId:gridRef,layoutId:layout,gridDataPath:gridData,
      worldId,areaRefId:null,instanceCount:2,
      itemOriginWorldId:null,itemAcquisitionWorldId:null,
      playerPlacedWorldId:null,placeableWorldId:null,
      otherFourRelationsVerified:false,
      nativeCoordinatesStoredInOriginalLayoutObjects:true
    }],
    worldCoverage:[{
      worldId,sourceAreaRefCount:0,sourceGridRefCount:1,
      initialSourceGridObjectCount:2,allGameAreasCovered:false,
      allSourceLayoutsCovered:false
    }],
    coverage:{
      worldDefinitionsInSubset:1,nativeAreaLayoutReferences:0,
      gridReferencesInSubset:1,sourceInitialGridObjects:2,
      sourceInitialGridObjectsWithoutVerifiedWorldLink:0,
      completeGameHierarchyVerified:false,
      allDlcAndAdventurePackIdsVerified:false,
      worldPlacementPermissionVerified:false,
      sourceCoverageComplete:false
    }
  };
}
const world=()=>new WorldReferenceIndex(worldFixture());
const db01=()=>({
  source:{platform:'Steam',gameVersion:'1.26.2',privateOnly:true,
    nativeSourceManifestSha256:'b'.repeat(64)},
  async getItem(itemId){
    return itemId===12345678?{itemId,nativeCategory:'Furniture',
      nativeKey:'Example',catalogDomain:'item',sourceSha256:'c'.repeat(64)}:null;
  }
});
const db02=()=>({
  contract:'wand.db01.db02-private-source-join@1',
  source:{platform:'Steam',gameVersion:'1.26.2',
    manifestSha256:'d'.repeat(64),currentConditionSha256:'e'.repeat(64)},
  async getItem(itemId){
    return {
      contract:'wand.db01.db02-private-source-join@1',itemId,
      versionAndSourceProvenanceMatched:true,
      publicationAuthorized:false,liveAvailabilityVerified:false,
      saveWritingAuthorized:false,
      status:'exact_current_definition_id',definition:null,
      staticAcquisition:{
        itemId,source:{platform:'Steam',gameVersion:'1.26.2'},
        acquisitionPaths:[{kind:'looted',location:'unknown_original_source'}]
      }
    };
  }
});

test('DB-01 native classification is joined by exact current Item ID',async()=>{
  const bridge=createDb04ItemGeographyBridge(world(),db01());
  assert.equal(bridge.contract,DB04_ITEM_GEOGRAPHY_JOIN);
  const result=await bridge.getItem(12345678);
  assert.equal(result.definition?.nativeCategory,'Furniture');
  assert.equal(result.sourceWorldManifestSha256,'a'.repeat(64));
  assert.equal(result.originalDefaultLocations.length,1);
  assert.equal(result.originalDefaultLocations[0].evidence.instanceCount,2);
  assert.equal(result.originalDefaultLocations[0].world?.worldId,worldId);
  assert.equal(result.originalDefaultLocations[0].area,null);
  assert.equal(result.originalDefaultLocations[0].placeableInWorldVerified,false);
  assert.equal(result.staticDb02Acquisition,null);
  assert.equal(result.itemOriginWorldVerified,false);
  assert.equal(result.itemAcquisitionWorldVerified,false);
  assert.equal(result.playerSavePlacementVerified,false);
  assert.equal(result.itemPlacementLegalityVerified,false);
  assert.equal(result.publicationAuthorized,false);
});
test('verified DB-02 source route never silently becomes an acquisition location',async()=>{
  const result=await createDb04ItemGeographyBridge(world(),db01(),db02())
    .getItem(12345678);
  assert.equal(result.staticDb02Acquisition.staticAcquisition
    .acquisitionPaths.length,1);
  assert.equal(result.sourceRelations.acquisitionWorld.status,'unverified');
  assert.equal(result.itemAcquisitionWorldVerified,false);
  assert.equal(result.originalDefaultLocations[0].acquisitionLocationVerified,false);
  const notPresent=await createDb04ItemGeographyBridge(world(),db01(),db02())
    .getItem(22222222);
  assert.equal(notPresent.definitionStatus,'not_in_partial_db01_catalog');
  assert.equal(notPresent.originalDefaultLocations.length,0);
  assert.equal(notPresent.sourceRelations.nativeSourceInitialPlacement.status,'unverified');
});
test('version mismatch, public source and invalid Item IDs fail closed',async()=>{
  const v=db01();v.source.gameVersion='1.26.3';
  assert.throws(()=>createDb04ItemGeographyBridge(world(),v),
    /DB01_PRIVATE_EXACT_VERSION_REQUIRED/);
  const publicItem=db01();publicItem.source.privateOnly=false;
  assert.throws(()=>createDb04ItemGeographyBridge(world(),publicItem),
    /DB01_PRIVATE_EXACT_VERSION_REQUIRED/);
  const wrongDb02=db02();wrongDb02.source.gameVersion='1.26.3';
  assert.throws(()=>createDb04ItemGeographyBridge(world(),db01(),wrongDb02),
    /DB02_VERIFIED_EXACT_VERSION_REQUIRED/);
  await assert.rejects(()=>createDb04ItemGeographyBridge(world(),db01()).getItem(0),
    /INVALID_ITEM_ID/);
});
test('invalid DB-01 or DB-02 reply identities fail closed',async()=>{
  const badDb01=db01();
  badDb01.getItem=async()=>({itemId:99999999,nativeCategory:'Furniture'});
  await assert.rejects(()=>createDb04ItemGeographyBridge(world(),badDb01)
    .getItem(12345678),/DB01_ITEM_ID_MISMATCH/);
  const badDb02=db02();
  badDb02.getItem=async()=>({contract:'wand.db01.db02-private-source-join@1',
    itemId:99999999,versionAndSourceProvenanceMatched:true,
    publicationAuthorized:false,liveAvailabilityVerified:false,
    saveWritingAuthorized:false,definition:null});
  await assert.rejects(()=>createDb04ItemGeographyBridge(world(),db01(),badDb02)
    .getItem(12345678),/DB02_ITEM_ID_OR_PROVENANCE_MISMATCH/);
});


const nativeScope=()=>({
  contract:'wand.db04.native-item-scope@1',
  source:{platform:'Steam',gameVersion:'1.26.2',privateOnly:true,
    publicationAuthorized:false,auditSha256:'f'.repeat(64),
    rowsSha256:'a'.repeat(64),
    sourceSha256ByCategory:{
      Furniture:'c'.repeat(64),Clothing:'d'.repeat(64),
      Trimming:'e'.repeat(64),ActivityItem:'f'.repeat(64)
    }},
  getItem(id){
    return id===12345678?{
      itemId:id,nativeCategory:'Furniture',
      worldsDirect:['IsEternityIsle'],universeTagsDirect:['Mickey'],
      universeSetCandidates:['Mickey'],setDefinitionIds:[1000001]
    }:null;
  }
});
test('independent original native Item Tags remain separate from default World locations',async()=>{
  const bridge=createDb04ItemGeographyBridge(world(),db01(),null,nativeScope());
  assert.equal(bridge.source.originalItemScopeAttached,true);
  const value=await bridge.getItem(12345678);
  assert.deepEqual(value.originalItemScopeTags.worldsDirect,['IsEternityIsle']);
  assert.deepEqual(value.originalItemScopeTags.universeTagsDirect,['Mickey']);
  assert.equal(value.originalDefaultLocations[0].world?.worldId,worldId);
  assert.equal(value.itemOriginWorldVerified,false);
  assert.equal(value.itemAcquisitionWorldVerified,false);
  assert.equal(value.itemPlacementLegalityVerified,false);
  assert.equal(value.dlcEntitlementVerified,false);
  assert.equal(value.publicationAuthorized,false);
  const other=await bridge.getItem(99999999);
  assert.equal(other.originalItemScopeTags,null);
  assert.equal(other.definition,null);
});
test('world tag and DB-01 definition must share exact current source ID and category SHA',async()=>{
  const wrongCategory=nativeScope();
  wrongCategory.getItem=(id)=>({...nativeScope().getItem(id),nativeCategory:'Clothing'});
  await assert.rejects(()=>createDb04ItemGeographyBridge(world(),db01(),null,wrongCategory)
    .getItem(12345678),/DB01_NATIVE_SCOPE_ORIGINAL_IDENTITY_MISMATCH/);
  const wrongSource=nativeScope();
  wrongSource.source.sourceSha256ByCategory.Furniture='0'.repeat(64);
  await assert.rejects(()=>createDb04ItemGeographyBridge(world(),db01(),null,wrongSource)
    .getItem(12345678),/DB01_NATIVE_SCOPE_ORIGINAL_IDENTITY_MISMATCH/);
  const wrongVersion=nativeScope();
  wrongVersion.source.gameVersion='1.26.1';
  assert.throws(()=>createDb04ItemGeographyBridge(world(),db01(),null,wrongVersion),
    /NATIVE_SCOPE_PRIVATE_EXACT_VERSION_REQUIRED/);
});

const universePredicateClient=()=>({
  source:{gameVersion:'1.26.2',sourceItemsSha256:'9'.repeat(64),
    sourceSqliteSha256:'8'.repeat(64),sourceIl2cppDumpSha256:'7'.repeat(64),
    sourceDefinitionCount:39067},
  async getItem(id){
    return id===12345678?[
      {setId:4000,groupIndex:0,nativeCategory:'Furniture',
        sourceSetItemId:5000,universeTagId:6000,universeTagKey:'Mickey',
        selectorField:3,
        rule:'source_item_set_disney_universe_tag_equals_collection_filter',
        sourcePredicateMatched:true,gameUiMembershipVerified:false,
        gameUiVisibilityVerified:false,worldAvailabilityVerified:false,
        dlcOwnershipVerified:false},
      {setId:4001,groupIndex:0,nativeCategory:'Furniture',
        sourceSetItemId:5001,universeTagId:6001,universeTagKey:'NonIP',
        selectorField:3,
        rule:'source_item_set_disney_universe_tag_equals_collection_filter',
        sourcePredicateMatched:true,gameUiMembershipVerified:false,
        gameUiVisibilityVerified:false,worldAvailabilityVerified:false,
        dlcOwnershipVerified:false}
    ]:[];
  }
});
test('source CollectionSet predicates cross-check, but do not promote, Universe Set names',async()=>{
  const catalog=db01();
  catalog.source.sourceItemsSha256='9'.repeat(64);
  catalog.source.definitions=39067;
  const native=nativeScope();
  native.getItem=id=>id===12345678?{
    ...nativeScope().getItem(id),
    universeSetCandidates:['Mickey','Ratatouille']
  }:null;
  const bridge=createDb04ItemGeographyBridge(world(),catalog,null,native,
    universePredicateClient());
  assert.equal(bridge.source.collectionUniversePredicatesAttached,true);
  const result=await bridge.getItem(12345678);
  assert.equal(result.sourceCollectionUniversePredicateMatches.length,2);
  assert.equal(result.sourceCollectionUniversePredicateMatches[0].rule,
    'source_item_set_disney_universe_tag_equals_collection_filter');
  assert.deepEqual(result.sourceUniverseReconciliation.directNativeUniverseTagKeys,['Mickey']);
  assert.deepEqual(result.sourceUniverseReconciliation.staticSourcePredicateKeys,
    ['Mickey','NonIP']);
  assert.deepEqual(result.sourceUniverseReconciliation
    .sourcePredicateAlsoInDirectOrSetNameKeys,['Mickey']);
  assert.deepEqual(result.sourceUniverseReconciliation.sourcePredicateOnlyKeys,['NonIP']);
  assert.deepEqual(result.sourceUniverseReconciliation
    .setNameCandidateWithoutPredicateKeys,['Ratatouille']);
  assert.equal(result.sourceUniverseReconciliation.gameRuntimeMembershipVerified,false);
  assert.equal(result.sourceUniverseReconciliation.dlcOwnershipVerified,false);
  assert.equal(result.itemAcquisitionWorldVerified,false);
  assert.equal(result.itemPlacementLegalityVerified,false);
  assert.throws(()=>{result.sourceCollectionUniversePredicateMatches[0].universeTagKey='Altered';},
    TypeError);
  const absent=await bridge.getItem(99999999);
  assert.deepEqual(absent.sourceCollectionUniversePredicateMatches,[]);
  assert.deepEqual(absent.sourceUniverseReconciliation.staticSourcePredicateKeys,[]);
});
test('collection predicate source attaches independently from native Tag scope',async()=>{
  const catalog=db01();
  catalog.source.sourceItemsSha256='9'.repeat(64);
  catalog.source.definitions=39067;
  const result=await createDb04ItemGeographyBridge(world(),catalog,null,null,
    universePredicateClient()).getItem(12345678);
  assert.equal(result.originalItemScopeTags,null);
  assert.equal(result.sourceCollectionUniversePredicateMatches.length,2);
  assert.equal(result.sourceUniverseReconciliation,null);
  const missing=await createDb04ItemGeographyBridge(world(),catalog)
    .getItem(12345678);
  assert.equal(missing.sourceCollectionUniversePredicateMatches,null);
});
test('mismatched or inconsistent source universe replies fail closed',async()=>{
  const catalog=db01();
  catalog.source.sourceItemsSha256='9'.repeat(64);
  catalog.source.definitions=39067;
  const wrong=universePredicateClient();
  wrong.source.gameVersion='1.26.3';
  assert.throws(()=>createDb04ItemGeographyBridge(world(),catalog,null,null,wrong),
    /DB01_UNIVERSE_PREDICATE_SOURCE_MISMATCH/);
  const wrongDigest=universePredicateClient();
  wrongDigest.source.sourceItemsSha256='0'.repeat(64);
  assert.throws(()=>createDb04ItemGeographyBridge(world(),catalog,null,null,wrongDigest),
    /DB01_UNIVERSE_PREDICATE_SOURCE_MISMATCH/);
  const spoofed=universePredicateClient();
  spoofed.getItem=async()=>[{...((await universePredicateClient().getItem(12345678))[0]),
    gameUiMembershipVerified:true}];
  await assert.rejects(()=>createDb04ItemGeographyBridge(world(),catalog,null,null,
    spoofed).getItem(12345678),/SOURCE_UNIVERSE_PREDICATE_REPLY_MISMATCH/);
});
