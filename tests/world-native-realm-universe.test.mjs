import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldReferenceIndex} from '../src/lib/world/reference-graph.ts';
import {createDb04RealmUniverseClient,DB04_REALM_UNIVERSE_JOIN,
  DB04_REALM_UNIVERSE_PROOF} from '../src/lib/world/native-realm-universes.ts';

const alpha='Worlds!Alice';
const child='Worlds!Alice!TableTop';
const other='Worlds!Moana';
const village='village-layout:SceneLayouts/VillageExpansion04/DefaultVillageExpansion04Layout.json';
const aliceTag=2000500032,moanaTag=2000500003;
const hash=(c)=>c.repeat(64);
function fixture(){
  const realm=(worldId,tag,parent=null)=>({
    worldId,worldIdKind:'nativeWorldName',worldType:'realm',
    nativeParentWorldId:parent,nativeParentWorldRelationVerified:parent!==null,
    nativeSceneId:null,
    defaultLayoutId:'SceneLayouts/Realms/'+worldId.replaceAll('!','/')+'.json',
    sourceRootPresent:true,sourceScopeLabel:'Realms',
    nativeUniverseTagItemId:tag,
    contentPackId:null,contentPackRelationVerified:false,
    worldCoverageComplete:false
  });
  return {
    schema:'wand.db04.native-reference-graph@1',
    target:{platform:'Steam',gameVersion:'1.26.2',
      nativeWorldManifestSha256:hash('a')},
    status:'private_partial_exact_source_relations',
    sourceManifestStatus:'partial_game_native_evidence',
    privateOnly:true,publicationAuthorized:false,
    provenance:{noInferenceFromPathPrefixes:true},
    worlds:[
      realm(alpha,aliceTag),
      realm(child,aliceTag,alpha),
      realm(other,moanaTag),
      {worldId:village,worldIdKind:'derivedLayoutKey',worldType:'village_layout',
        nativeParentWorldId:null,nativeParentWorldRelationVerified:false,
        nativeSceneId:null,defaultLayoutId:'SceneLayouts/VillageExpansion04/DefaultVillageExpansion04Layout.json',
        sourceRootPresent:true,sourceScopeLabel:'VillageExpansion04',
        nativeUniverseTagItemId:null,contentPackId:null,
        contentPackRelationVerified:false,worldCoverageComplete:false}
    ],
    scenes:[],areas:[],layouts:[],gridData:[],gridRefs:[],
    initialItemRefs:[],worldCoverage:[],
    coverage:{
      worldDefinitionsInSubset:4,nativeAreaLayoutReferences:0,
      gridReferencesInSubset:0,sourceInitialGridObjects:0,
      sourceInitialGridObjectsWithoutVerifiedWorldLink:0,
      nativeParentWorldLinksInSubset:1,
      completeGameHierarchyVerified:false,
      allDlcAndAdventurePackIdsVerified:false,
      worldPlacementPermissionVerified:false,
      sourceCoverageComplete:false
    }
  };
}
function db01(){
  const answers={
    [aliceTag]:{itemId:aliceTag,nativeCategory:'Tag',
      nativeKey:'Alice',catalogDomain:'definition_unclassified',
      sourceSha256:hash('b')},
    [moanaTag]:{itemId:moanaTag,nativeCategory:'Tag',
      nativeKey:'Moana',catalogDomain:'definition_unclassified',
      sourceSha256:hash('b')}
  };
  let lookups=0;
  return {
    source:{privateOnly:true,platform:'Steam',
      gameVersion:'1.26.2',nativeSourceManifestSha256:hash('c'),
      sourceItemsSha256:hash('d')},
    async getItem(id){lookups++;return answers[id]??null;},
    async getItems(ids){return ids.map(id=>answers[id]??null);},
    get lookups(){return lookups;}
  };
}
test('original Realm WorldData Universe Tag joins exact DB-01 Tag definition',async()=>{
  const catalog=db01();
  const index=new WorldReferenceIndex(fixture());
  const client=createDb04RealmUniverseClient(index,catalog);
  assert.equal(client.contract,DB04_REALM_UNIVERSE_JOIN);
  assert.equal(client.source.gameVersion,'1.26.2');
  const evidence=await client.getWorld(alpha);
  assert.equal(evidence.universeTagItemId,aliceTag);
  assert.equal(evidence.universeTagKey,'Alice');
  assert.equal(evidence.status,'source_native_verified');
  assert.equal(evidence.sourceProof,DB04_REALM_UNIVERSE_PROOF);
  assert.equal(evidence.originalRealmTagLinkVerified,true);
  assert.equal(evidence.originalTagDefinitionVerified,true);
  assert.equal(evidence.sourceWorld.worldId,alpha);
  assert.equal(evidence.contentPackRelationVerified,false);
  assert.equal(evidence.dlcEntitlementVerified,false);
  assert.equal(evidence.gameUiUniverseGroupingVerified,false);
  assert.equal(evidence.collectionItemWorldVerified,false);
  assert.equal(evidence.itemAcquisitionWorldVerified,false);
  assert.equal(evidence.playerSaveLocationVerified,false);
  const childEvidence=await client.getWorld(child);
  assert.equal(childEvidence.universeTagKey,'Alice');
  assert.equal(catalog.lookups,1,'source Tag definition is memoized by ID');
});
test('exact native universe reverse query keeps nested Realm identities and paging',async()=>{
  const client=createDb04RealmUniverseClient(new WorldReferenceIndex(fixture()),db01());
  const first=await client.byNativeUniverseTag(aliceTag,{offset:0,limit:1});
  assert.equal(first.status,'source_native_verified');
  assert.equal(first.totalSourceRealmWorlds,2);
  assert.deepEqual(first.sourceWorlds.map(x=>x.worldId),[alpha]);
  assert.equal(first.hasNextPage,true);
  assert.equal(first.nextOffset,1);
  assert.equal(first.contentPackRelationVerified,false);
  const second=await client.byNativeUniverseTag(aliceTag,{offset:1,limit:1});
  assert.deepEqual(second.sourceWorlds.map(x=>x.worldId),[child]);
  assert.equal(second.hasNextPage,false);
  const missing=await client.byNativeUniverseTag(2000500999);
  assert.equal(missing.status,'unverified');
  assert.equal(missing.totalSourceRealmWorlds,0);
  assert.equal(missing.universeTagKey,null);
  assert.equal(missing.completeGameWorldCoverageVerified,false);
  const tags=await client.listNativeUniverseTags();
  assert.deepEqual(tags.map(x=>x.tagKey),['Moana','Alice']);
  assert.deepEqual(tags[1].sourceRealmWorldIds,[alpha,child]);
  assert.equal(tags[1].sourceWorldSubsetOnly,true);
  assert.equal(tags[1].dlcEntitlementVerified,false);
  assert.throws(()=>tags[1].sourceRealmWorldIds.push('forged'),TypeError);
  assert.throws(()=>first.sourceWorlds.push({}),TypeError);
});
test('Village layouts and unknown identities never acquire fabricated Universe or DLC IDs',async()=>{
  const client=createDb04RealmUniverseClient(new WorldReferenceIndex(fixture()),db01());
  const derived=await client.getWorld(village);
  assert.equal(derived.status,'unverified');
  assert.equal(derived.sourceWorld.worldType,'village_layout');
  assert.equal(derived.universeTagKey,null);
  assert.equal(derived.universeTagItemId,null);
  assert.equal(derived.contentPackRelationVerified,false);
  const unknown=await client.getWorld('Worlds!NotInPartialSource');
  assert.equal(unknown.status,'unverified');
  assert.equal(unknown.sourceWorld,null);
  assert.equal(unknown.universeTagItemId,null);
});
test('missing or forged native Tag definitions and incompatible versions fail closed',async()=>{
  const invalid=db01();invalid.source.gameVersion='1.26.3';
  assert.throws(()=>createDb04RealmUniverseClient(new WorldReferenceIndex(fixture()),invalid),
    /DB01_PRIVATE_EXACT_SOURCE_REQUIRED/);
  const wrong=db01();wrong.getItem=async id=>({
    itemId:id,nativeCategory:'Furniture',nativeKey:'Alice',
    catalogDomain:'item',sourceSha256:hash('b')});
  await assert.rejects(()=>createDb04RealmUniverseClient(
    new WorldReferenceIndex(fixture()),wrong).getWorld(alpha),
    /NATIVE_TAG_DEFINITION_IDENTITY/);
  const missing=db01();missing.getItem=async()=>null;
  await assert.rejects(()=>createDb04RealmUniverseClient(
    new WorldReferenceIndex(fixture()),missing).byNativeUniverseTag(aliceTag),
    /NATIVE_TAG_DEFINITION_IDENTITY/);
});
test('reject malformed WorldData native universe ids and invalid API bounds',async()=>{
  const negative=fixture();negative.worlds[0].nativeUniverseTagItemId=-2;
  assert.throws(()=>new WorldReferenceIndex(negative),
    /INVALID_NATIVE_WORLD_UNIVERSE_TAG/);
  const derived=fixture();derived.worlds[3].nativeUniverseTagItemId=aliceTag;
  assert.throws(()=>new WorldReferenceIndex(derived),
    /INVALID_NATIVE_WORLD_UNIVERSE_TAG/);
  const client=createDb04RealmUniverseClient(new WorldReferenceIndex(fixture()),db01());
  await assert.rejects(()=>client.byNativeUniverseTag(-2),/INVALID_TAG_ITEM_ID/);
  await assert.rejects(()=>client.byNativeUniverseTag(aliceTag,{offset:0,limit:0}),
    /INVALID_PAGE/);
  await assert.rejects(()=>client.byNativeUniverseTag(aliceTag,{offset:-1,limit:3}),
    /INVALID_PAGE/);
  await assert.rejects(()=>client.getWorld(''),/INVALID_WORLD_ID/);
  const graph=new WorldReferenceIndex(fixture());
  assert.deepEqual(graph.listSourceWorlds().map(w=>w.worldId),
    [alpha,child,other,village]);
  assert.deepEqual(graph.sourceRealmWorldsForUniverseTag(aliceTag).values.map(w=>w.worldId),
    [alpha,child]);
  assert.equal(graph.sourceRealmWorldsForUniverseTag(123).status,'unverified');
  assert.throws(()=>graph.sourceRealmWorldsForUniverseTag(0),
    /INVALID_NATIVE_UNIVERSE_TAG_ID/);
});
