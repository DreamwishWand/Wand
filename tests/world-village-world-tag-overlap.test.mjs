import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldReferenceIndex} from '../src/lib/world/reference-graph.ts';
import {DB04_NATIVE_SCOPE_CLIENT} from '../src/lib/world/native-item-scope.ts';
import {createDb04VillageWorldTagOverlapClient,
  DB04_VILLAGE_WORLD_TAG_OVERLAP,DB04_VILLAGE_TAG_OVERLAP_EVIDENCE}
  from '../src/lib/world/village-world-tag-overlap.ts';

const BASE='SceneLayouts/Village04/DefaultVillageLayout01.json';
const DLC='SceneLayouts/VillageExpansion01/DefaultExpansion01Layout01.json';
const WORLD_A='village-layout:'+BASE;
const WORLD_B='village-layout:'+DLC;
const hash=(c)=>c.repeat(64);
function graph(){
  const makeWorld=(worldId,layout)=>({
    worldId,worldIdKind:'derivedLayoutKey',worldType:'village_layout',
    nativeParentWorldId:null,nativeParentWorldRelationVerified:false,
    nativeSceneId:null,defaultLayoutId:layout,sourceRootPresent:true,
    sourceScopeLabel:layout.split('/')[1],
    nativeUniverseTagItemId:null,contentPackId:null,
    contentPackRelationVerified:false,worldCoverageComplete:false
  });
  const makeLayout=(layout,count,worldId)=>({
    layoutId:layout,layoutKind:'nativeGridCollection',
    nativeDefaultObjectCount:count,parentWorldId:worldId,
    parentAreaRefId:null,nativeSourceScopeLabel:layout.split('/')[1],
    sourceWorldMembershipVerified:true,worldCoordinatesVerified:false,
    placementLegalityVerified:false
  });
  const makeGrid=(layout,worldId,count)=>({
    gridRefId:layout+'#grid=1',gridRefIdKind:'derivedLayoutGridIdComposite',
    layoutId:layout,nativeGridId:1,
    gridDataPath:'GridData/'+(layout===BASE?'Base':'Dlc')+'.json',
    gridDataPresent:true,areaRefId:null,worldId,tessellationFactor:1,
    originalDefaultObjectCount:count,nativeWorldCoordinatesVerified:false,
    placementLegalityVerified:false
  });
  const placements=(layout,worldId,values)=>values.map(([itemId,count])=>({
    itemId:String(itemId),relation:'nativeSourceDefaultGridObject',
    gridRefId:layout+'#grid=1',layoutId:layout,
    gridDataPath:'GridData/'+(layout===BASE?'Base':'Dlc')+'.json',
    worldId,areaRefId:null,instanceCount:count,
    itemOriginWorldId:null,itemAcquisitionWorldId:null,
    playerPlacedWorldId:null,placeableWorldId:null,
    otherFourRelationsVerified:false,
    nativeCoordinatesStoredInOriginalLayoutObjects:true
  }));
  return new WorldReferenceIndex({
    schema:'wand.db04.native-reference-graph@1',
    target:{platform:'Steam',gameVersion:'1.26.2',
      nativeWorldManifestSha256:hash('a')},
    status:'private_partial_exact_source_relations',
    sourceManifestStatus:'native_partial_world_extraction_preview',
    privateOnly:true,publicationAuthorized:false,
    provenance:{noInferenceFromPathPrefixes:true},
    worlds:[makeWorld(WORLD_A,BASE),makeWorld(WORLD_B,DLC)],
    scenes:[],areas:[],
    layouts:[makeLayout(BASE,11,WORLD_A),makeLayout(DLC,10,WORLD_B)],
    gridData:['Base','Dlc'].map(n=>({
      gridDataPath:'GridData/'+n+'.json',
      nativeSizeX:10,nativeSizeY:10,nativeSourceFormat:'json_direct',
      gridLocalToWorldTransformVerified:false,placementLegalityVerified:false
    })),
    gridRefs:[makeGrid(BASE,WORLD_A,11),makeGrid(DLC,WORLD_B,10)],
    initialItemRefs:[
      ...placements(BASE,WORLD_A,[[10,3],[11,2],[12,1],[13,4],[90000,1]]),
      ...placements(DLC,WORLD_B,[[10,2],[12,7],[14,1]])
    ],
    worldCoverage:[],
    coverage:{
      worldDefinitionsInSubset:2,nativeAreaLayoutReferences:0,
      gridReferencesInSubset:2,sourceInitialGridObjects:21,
      sourceInitialGridObjectsWithoutVerifiedWorldLink:0,
      completeGameHierarchyVerified:false,
      allDlcAndAdventurePackIdsVerified:false,
      worldPlacementPermissionVerified:false,sourceCoverageComplete:false
    }
  });
}
function itemScope(){
  return {
    contract:DB04_NATIVE_SCOPE_CLIENT,
    source:{platform:'Steam',gameVersion:'1.26.2',privateOnly:true,
      publicationAuthorized:false,originalItemDefinitions:13202,
      rowsSha256:hash('b'),auditSha256:hash('c'),
      originalTagSha256:hash('d')},
    getItem(id){
      const map={
        10:'IsDreamlightValley',11:'IsDreamlightValley',
        12:'IsEternityIsle',13:null,14:null
      };
      if(!Object.hasOwn(map,id))return null;
      return {
        itemId:id,nativeCategory:'Furniture',
        worldsDirect:map[id]===null?[]:[map[id]],
        universeTagsDirect:[],universeSetCandidates:[],setDefinitionIds:[]
      };
    }
  };
}
test('source Village overlaps keep exact tag+grid evidence, not DLC mapping',()=>{
  const client=createDb04VillageWorldTagOverlapClient(graph(),itemScope());
  assert.equal(client.contract,DB04_VILLAGE_WORLD_TAG_OVERLAP);
  assert.equal(client.source.privateOnly,true);
  assert.equal(client.source.originalItemScopeRowsSha256,hash('b'));
  assert.equal(client.source.sourceOriginalTagSha256,hash('d'));
  const villages=client.listSourceVillages();
  assert.equal(villages.length,2);
  const a=client.getSourceVillage(WORLD_A),b=client.getSourceVillage(WORLD_B);
  assert.equal(a.evidence,DB04_VILLAGE_TAG_OVERLAP_EVIDENCE);
  assert.equal(a.sourceDefaultGridObjectReferenceRows,5);
  assert.equal(a.sourceDefaultGridObjectInstances,11);
  assert.deepEqual(a.directWorldTags.slice(0,2),[
    {key:'IsDreamlightValley',originalReferenceRows:2,
      originalInstances:5,distinctItemIds:2},
    {key:'IsEternityIsle',originalReferenceRows:1,
      originalInstances:1,distinctItemIds:1}
  ]);
  assert.deepEqual(a.noDirectWorldTag,{
    originalReferenceRows:1,originalInstances:4,distinctItemIds:1});
  assert.deepEqual(a.outsideFourNativeItemCategories,{
    originalReferenceRows:1,originalInstances:1,distinctItemIds:1});
  assert.equal(b.directWorldTags[0].originalInstances,2);
  assert.equal(b.directWorldTags[1].originalInstances,7);
  assert.equal(b.noDirectWorldTag.originalInstances,1);
  assert.equal(a.exactOriginalPlacementTagIntersectionVerified,true);
  assert.equal(a.sourceLayoutWorldRelationVerified,true);
  assert.equal(a.villageToWorldTagAssociationVerified,false);
  assert.equal(a.contentPackId,null);
  assert.equal(a.contentPackRelationVerified,false);
  assert.equal(a.dlcEntitlementVerified,false);
  assert.equal(a.collectionGameUiMembershipVerified,false);
  assert.equal(a.itemAcquisitionWorldVerified,false);
  assert.equal(a.currentPlayerSavePlacementVerified,false);
  assert.equal(a.sourceCoverageComplete,false);
  assert.equal(client.getSourceVillage('Worlds!Unknown'),null);
  assert.throws(()=>a.directWorldTags.push({}),TypeError);
  assert.throws(()=>{a.noDirectWorldTag.originalInstances=999;},TypeError);
});
test('reverse World Tag lookup preserves cross-world default layout co-occurrence',()=>{
  const client=createDb04VillageWorldTagOverlapClient(graph(),itemScope());
  const a=client.byOriginalWorldTag('IsDreamlightValley');
  assert.equal(a.status,'source_native_verified');
  assert.deepEqual(a.villages,[
    {worldId:WORLD_A,originalSourceReferenceRows:2,
      originalSourceInstances:5,distinctItemIds:2},
    {worldId:WORLD_B,originalSourceReferenceRows:1,
      originalSourceInstances:2,distinctItemIds:1}
  ]);
  assert.equal(a.villageToWorldTagAssociationVerified,false);
  assert.equal(a.contentPackRelationVerified,false);
  assert.equal(a.dlcEntitlementVerified,false);
  assert.equal(client.byOriginalWorldTag('isHoneywood').status,'unverified');
  assert.deepEqual(client.byOriginalWorldTag('isHoneywood').villages,[]);
  assert.throws(()=>client.byOriginalWorldTag('forged'),/INVALID_ORIGINAL_WORLD_TAG/);
  assert.throws(()=>client.getSourceVillage(''),/INVALID_WORLD_ID/);
  assert.throws(()=>a.villages.push({}),TypeError);
});
test('fail closed on source-version and direct-tag identity mismatches',()=>{
  const mismatched=itemScope();mismatched.source.gameVersion='1.26.1';
  assert.throws(()=>createDb04VillageWorldTagOverlapClient(graph(),mismatched),
    /ORIGINAL_ITEM_SCOPE_REQUIRED/);
  const publicScope=itemScope();publicScope.source.publicationAuthorized=true;
  assert.throws(()=>createDb04VillageWorldTagOverlapClient(graph(),publicScope),
    /ORIGINAL_ITEM_SCOPE_REQUIRED/);
  const wrongId=itemScope();wrongId.getItem=id=>{
    const x=itemScope().getItem(id);
    return x?{...x,itemId:id+1}:null;
  };
  assert.throws(()=>createDb04VillageWorldTagOverlapClient(graph(),wrongId),
    /INVALID_ORIGINAL_ITEM_TAG_REPLY/);
  const forgedTag=itemScope();forgedTag.getItem=id=>{
    const x=itemScope().getItem(id);
    return x?{...x,worldsDirect:['NotARealWorldTag']}:null;
  };
  assert.throws(()=>createDb04VillageWorldTagOverlapClient(graph(),forgedTag),
    /INVALID_ORIGINAL_ITEM_TAG_REPLY/);
});
