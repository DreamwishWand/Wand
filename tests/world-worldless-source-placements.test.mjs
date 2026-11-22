import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldReferenceIndex} from '../src/lib/world/reference-graph.ts';
import {DB04_NATIVE_SCOPE_CLIENT} from '../src/lib/world/native-item-scope.ts';
import {createDb04WorldlessSourcePlacementClient,
  DB04_WORLDLESS_SOURCE_PLACEMENTS}
  from '../src/lib/world/worldless-source-placements.ts';

const WORLD='Worlds!Mickey';
const ROOT='SceneLayouts/Realms/Mickey/Root.json';
const LOOSE='SceneLayouts/Interiors/Loose.json';
const worldGrid=ROOT+'#grid=1';
const unlinkedGrid=LOOSE+'#grid=2';
const src='a'.repeat(64);

function nativeGraph(){
  const makeLayout=(id,worldId,objects)=>({
    layoutId:id,layoutKind:'nativeGridCollection',
    nativeDefaultObjectCount:objects,parentWorldId:worldId,
    parentAreaRefId:null,nativeSourceScopeLabel:'Mickey',
    sourceWorldMembershipVerified:worldId!==null,
    worldCoordinatesVerified:false,placementLegalityVerified:false
  });
  const makeGrid=(id,lid,gridId,worldId,objects,path)=>({
    gridRefId:id,gridRefIdKind:'derivedLayoutGridIdComposite',
    layoutId:lid,nativeGridId:gridId,gridDataPath:path,gridDataPresent:true,
    areaRefId:null,worldId,tessellationFactor:1,
    originalDefaultObjectCount:objects,
    nativeWorldCoordinatesVerified:false,placementLegalityVerified:false
  });
  const placement=(id,grid,layout,path,worldId,instances)=>({
    itemId:String(id),relation:'nativeSourceDefaultGridObject',
    gridRefId:grid,layoutId:layout,gridDataPath:path,
    worldId,areaRefId:null,instanceCount:instances,
    itemOriginWorldId:null,itemAcquisitionWorldId:null,
    playerPlacedWorldId:null,placeableWorldId:null,
    otherFourRelationsVerified:false,
    nativeCoordinatesStoredInOriginalLayoutObjects:true
  });
  return new WorldReferenceIndex({
    schema:'wand.db04.native-reference-graph@1',
    status:'private_partial_exact_source_relations',
    sourceManifestStatus:'native_partial_world_extraction_preview',
    target:{platform:'Steam',gameVersion:'1.26.2',
      nativeWorldManifestSha256:src},
    privateOnly:true,publicationAuthorized:false,
    provenance:{noInferenceFromPathPrefixes:true},
    worlds:[{
      worldId:WORLD,worldIdKind:'nativeWorldName',worldType:'realm',
      nativeSceneId:null,defaultLayoutId:ROOT,
      sourceRootPresent:true,sourceScopeLabel:'Mickey',
      nativeUniverseTagItemId:null,contentPackId:null,
      contentPackRelationVerified:false,worldCoverageComplete:false
    }],
    scenes:[],areas:[],
    layouts:[makeLayout(ROOT,WORLD,2),makeLayout(LOOSE,null,1)],
    gridData:[
      {gridDataPath:'GridData/Mickey.json',nativeSizeX:10,nativeSizeY:10,
        nativeSourceFormat:'original_json_direct_floor_values',
        gridLocalToWorldTransformVerified:false,placementLegalityVerified:false},
      {gridDataPath:'GridData/Loose.json',nativeSizeX:10,nativeSizeY:10,
        nativeSourceFormat:'original_json_direct_floor_values',
        gridLocalToWorldTransformVerified:false,placementLegalityVerified:false}
    ],
    gridRefs:[
      makeGrid(worldGrid,ROOT,1,WORLD,2,'GridData/Mickey.json'),
      makeGrid(unlinkedGrid,LOOSE,2,null,1,'GridData/Loose.json')
    ],
    initialItemRefs:[
      placement(11,worldGrid,ROOT,'GridData/Mickey.json',WORLD,2),
      placement(12,unlinkedGrid,LOOSE,'GridData/Loose.json',null,1)
    ],
    worldCoverage:[],
    coverage:{
      worldDefinitionsInSubset:1,nativeAreaLayoutReferences:0,
      gridReferencesInSubset:2,sourceInitialGridObjects:3,
      sourceInitialGridObjectsWithoutVerifiedWorldLink:1,
      completeGameHierarchyVerified:false,
      allDlcAndAdventurePackIdsVerified:false,
      worldPlacementPermissionVerified:false,
      sourceCoverageComplete:false
    }
  });
}
function nativeScope(){
  const ids=Array.from({length:2920},(_,i)=>11+i);
  return {
    contract:DB04_NATIVE_SCOPE_CLIENT,
    source:{platform:'Steam',gameVersion:'1.26.2',
      auditSha256:'b'.repeat(64),rowsSha256:'c'.repeat(64),
      privateOnly:true,publicationAuthorized:false,
      originalItemDefinitions:13202},
    getItem(id){
      if(!ids.includes(id))return null;
      return {itemId:id,
        nativeCategory:id<=2500?'ActivityItem':'Furniture',
        worldsDirect:[],universeTagsDirect:[],universeSetCandidates:[],
        setDefinitionIds:[]};
    },
    withoutWorldTag({offset,limit}){
      const rows=ids.slice(offset,offset+limit);
      const end=offset+rows.length;
      return {
        evidenceKind:'no_world_tag_in_original_item_record',
        tag:'',status:'unverified',itemIds:rows,
        matchingItemIdsInSourceSubset:2920,
        offset,limit,hasNextPage:end<2920,
        nextOffset:end<2920?end:null,
        sourceCoverageComplete:false,gameUiMembershipVerified:false,
        acquisitionWorldVerified:false,dlcEntitlementVerified:false
      };
    }
  };
}
test('2,920 missing direct world tags stay unresolved but native initial placement is independently queryable',()=>{
  const db=createDb04WorldlessSourcePlacementClient(nativeGraph(),nativeScope());
  assert.equal(db.contract,DB04_WORLDLESS_SOURCE_PLACEMENTS);
  assert.equal(db.source.gameVersion,'1.26.2');
  assert.equal(db.source.privateOnly,true);
  assert.deepEqual([
    db.summary.sourceDefaultWithWorld,
    db.summary.sourceDefaultWithoutWorld,
    db.summary.noSourceDefaultInPartialGraph
  ],[1,1,2918]);
  assert.deepEqual(db.summary.sourceDefaultNativeWorlds,[WORLD]);
  const first=db.getItem(11),second=db.getItem(12),third=db.getItem(13);
  assert.equal(first.kind,'source_default_gridobject_with_world');
  assert.deepEqual(first.sourceDefaultWorldIds,[WORLD]);
  assert.equal(first.originalDefaultInstances,2);
  assert.equal(first.originalSourcePlacementEvidenceVerified,true);
  assert.equal(first.nativeWorldAssociationVerified,false);
  assert.equal(first.acquisitionWorldVerified,false);
  assert.equal(first.dlcEntitlementVerified,false);
  assert.equal(second.kind,'source_default_gridobject_unlinked_world');
  assert.equal(second.originalDefaultsWithoutWorldLink,1);
  assert.deepEqual(second.sourceDefaultWorldIds,[]);
  assert.equal(third.kind,'no_default_gridobject_in_partial_source');
  assert.equal(third.originalSourcePlacementEvidenceVerified,false);
  assert.equal(third.sourceCoverageComplete,false);
  assert.equal(db.getItem(5000),null);
  assert.throws(()=>{first.sourceDefaultWorldIds.push('Fake');},TypeError);
});
test('reverse query distinguishes original default GridObject World from item World Tag membership',()=>{
  const db=createDb04WorldlessSourcePlacementClient(nativeGraph(),nativeScope());
  const original=db.bySourceDefaultWorld(WORLD);
  assert.deepEqual(original.itemIds,[11]);
  assert.equal(original.scope,'source_default_world');
  assert.equal(original.scopeIdentityInPartialSource,true);
  assert.equal(original.status,'source_native_verified');
  assert.equal(original.nativeWorldAssociationVerified,false);
  assert.equal(original.savedPlayerPlacementVerified,false);
  const unlinked=db.byEvidenceKind('source_default_gridobject_unlinked_world');
  assert.deepEqual(unlinked.itemIds,[12]);
  const notInSource=db.byEvidenceKind('no_default_gridobject_in_partial_source',
    {offset:0,limit:3});
  assert.deepEqual(notInSource.itemIds,[13,14,15]);
  assert.equal(notInSource.status,'unverified');
  assert.equal(notInSource.matchingItemIdsInSubset,2918);
  assert.equal(notInSource.hasNextPage,true);
  assert.equal(notInSource.nextOffset,3);
  const unknownWorld=db.bySourceDefaultWorld('Worlds!Unknown');
  assert.deepEqual(unknownWorld.itemIds,[]);
  assert.equal(unknownWorld.scopeIdentityInPartialSource,false);
  assert.equal(unknownWorld.status,'unverified');
  assert.throws(()=>db.bySourceDefaultWorld(WORLD,{offset:0,limit:0}),
    /INVALID_PAGE/);
  assert.throws(()=>db.byEvidenceKind('fake'),/INVALID_EVIDENCE_KIND/);
  assert.throws(()=>db.getItem(0),/INVALID_ITEM_ID/);
  assert.throws(()=>original.itemIds.push(12),TypeError);
});
test('misversioned clients, manipulated paging and contradictory native World tags fail closed',()=>{
  const scope=nativeScope();scope.source.gameVersion='1.26.1';
  assert.throws(()=>createDb04WorldlessSourcePlacementClient(nativeGraph(),scope),
    /ORIGINAL_SCOPE_PRIVATE_EXACT_VERSION_REQUIRED/);
  const missing=nativeScope();missing.getItem=()=>null;
  assert.throws(()=>createDb04WorldlessSourcePlacementClient(nativeGraph(),missing),
    /SOURCE_WORLDLESS_TAG_IDENTITY_MISMATCH/);
  const forged=nativeScope(),before=forged.getItem;
  forged.getItem=id=>{
    const row=before(id);
    return row?{...row,worldsDirect:id===11?['IsDreamlightValley']:[]}:null;
  };
  assert.throws(()=>createDb04WorldlessSourcePlacementClient(nativeGraph(),forged),
    /SOURCE_WORLDLESS_TAG_IDENTITY_MISMATCH/);
  const short=nativeScope(),old=short.withoutWorldTag;
  short.withoutWorldTag=page=>{
    const result=old(page);
    return result.offset===512?{...result,itemIds:result.itemIds.slice(1)}:result;
  };
  assert.throws(()=>createDb04WorldlessSourcePlacementClient(nativeGraph(),short),
    /SOURCE_WORLDLESS_PAGE_CONFLICT/);
});
