import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openPublicSharedGameSources}
  from '../src/lib/game-db/public-sources.ts';
import {
  joinDb00LocalCompanionSources,DB00_LOCAL_COMPANION_CLASSES
} from '../src/lib/game-db/local-companion-classes.ts';
import {
  DB01_ORIGINAL_COMPANION_NATIVE_SCHEMA,
  DB01_ORIGINAL_COMPANION_SOURCE_SHA256,
  DB01_ORIGINAL_COMPANION_NATIVE_CLASS_COUNTS,
  DB01_ORIGINAL_COMPANION_POSITIVE_AREA_COUNTS
} from '../src/lib/items/companion-native-has-tag.ts';

const ROOT=new URL('../static/',import.meta.url);
const assets=[];
const fetcher=async url=>{
  assert(url.startsWith('/Wand/')&&!url.includes('..'));
  assets.push(url);
  try{return new Response(readFileSync(new URL(url.slice(6),ROOT)),{status:200});}
  catch{return new Response('missing',{status:404});}
};
let pubPromise,contextPromise;
const pub=()=>pubPromise??=openPublicSharedGameSources('/Wand',fetcher);
const areaCounts=DB01_ORIGINAL_COMPANION_POSITIVE_AREA_COUNTS;
const areaCodes=[1,2,3,4,5,4097];
let getItemCalls=0,getItemsCalls=0,coverageCalls=0,searchCalls=0;
async function makeContext(){
  const publicData=await pub();
  const identity=await publicData.loadNativeCompanionIdentitySources();
  const nativeItems=identity.search({limit:500}).items;
  assert.equal(nativeItems.length,394);
  const classified=nativeItems.filter(x=>x.explicitSourceCategory!==null);
  const remaining=nativeItems.filter(x=>x.explicitSourceCategory===null);
  assert.equal(classified.length,134);
  assert.equal(remaining.length,260);
  const pets=[...classified,...remaining.slice(0,107)];
  const mounts=remaining.slice(107,135);
  const critters=remaining.slice(135);
  assert.equal(pets.length,241);
  assert.equal(mounts.length,28);
  assert.equal(critters.length,125);
  const nonCritter=[...pets,...mounts];
  const sorted=nonCritter.concat(critters).sort((a,b)=>
    Number(a.itemId)-Number(b.itemId));
  const byId=new Map();
  const sourceAreaTags=new Map(areaCodes.map(code=>
    [code,publicData.originalCollectionAreas.getArea(code).original.gameplayTagId]
  ));
  const assignedCodes=areaCodes.flatMap(code=>
    Array.from({length:areaCounts[code]},()=>code));
  assert.equal(assignedCodes.length,246);
  nonCritter.forEach((item,i)=>{
    const pet=i<pets.length;
    const sourceClass=pet?'PetItemData':'MountItemData';
    const positiveCode=assignedCodes[i]??null;
    const nativeTags=Object.freeze(positiveCode===null?
      (pet?[123456789]:[]):[sourceAreaTags.get(positiveCode)]);
    const row=Object.freeze({
      itemId:Number(item.itemId),nativeKey:item.native.nativeNameKey,
      nativeCategory:'Companion',originalNativeClass:sourceClass,
      nativeKind:pet?'pet':'mount',nativeTags,
      tagsFieldNumber:pet?7:10,critterLocationOneofFieldNumber:null,
      originalIHasTagsInterface:true,originalIHasSetInterface:false,
      nativeClassSourceVerified:true,
      runtimeCritterWorldSceneVerified:false,
      gameUiCollectionMembershipVerified:false,
      dlcEntitlementVerified:false
    });
    byId.set(row.itemId,Object.freeze({
      source:row,
      positiveNativeAreaCodes:Object.freeze(
        positiveCode===null?[]:[positiveCode]),
      originalIHasTagsInterface:true,
      needsRuntimeCritterSceneEvaluation:false,
      sourceShardHashVerified:true,
      sourceOriginalNativeClassVerified:true,
      actualCollectionUiMembershipVerified:false,
      nativeAllAreasDefaultPredicateVerified:false,
      playerEntitlementVerified:false
    }));
  });
  critters.forEach((item,i)=>{
    const location=i<105?6:7;
    const row=Object.freeze({
      itemId:Number(item.itemId),nativeKey:item.native.nativeNameKey,
      nativeCategory:'Companion',originalNativeClass:'CritterItemData',
      nativeKind:'critter',nativeTags:null,
      tagsFieldNumber:null,critterLocationOneofFieldNumber:location,
      originalIHasTagsInterface:false,originalIHasSetInterface:false,
      nativeClassSourceVerified:true,
      runtimeCritterWorldSceneVerified:false,
      gameUiCollectionMembershipVerified:false,
      dlcEntitlementVerified:false
    });
    byId.set(row.itemId,Object.freeze({
      source:row,positiveNativeAreaCodes:null,
      originalIHasTagsInterface:false,
      needsRuntimeCritterSceneEvaluation:true,
      sourceShardHashVerified:true,
      sourceOriginalNativeClassVerified:true,
      actualCollectionUiMembershipVerified:false,
      nativeAllAreasDefaultPredicateVerified:false,
      playerEntitlementVerified:false
    }));
  });
  assert.equal(byId.size,394);
  const census=Object.freeze({
    sourceDefinitions:394,
    originalNativeClassCounts:DB01_ORIGINAL_COMPANION_NATIVE_CLASS_COUNTS,
    sourceNativeTaggedPositiveAreaItems:246,
    sourceNativeTaggedWithoutPositiveArea:23,
    sourceCritterLocationOneofCase6:105,
    sourceCritterSceneOneofCase7:20,
    sourceCritterRuntimeWorldUnknown:125,
    sourcePositiveAreaByCode:DB01_ORIGINAL_COMPANION_POSITIVE_AREA_COUNTS,
    nativeClassAndInterfaceSourceVerified:true,
    critterRuntimeCollectionAreaVerified:false,
    actualGameUiMembershipVerified:false,
    nativeAllAreasDefaultTagVerified:false
  });
  const source=Object.freeze({
    schema:DB01_ORIGINAL_COMPANION_NATIVE_SCHEMA,
    gameVersion:'1.26.2',
    async getItem(id){getItemCalls++;return byId.get(id)??null;},
    async getItems(ids){getItemsCalls++;return Object.freeze(
      ids.map(id=>byId.get(id)??null));},
    hasTag:async()=>null,
    async getCoverage(){coverageCalls++;return census;},
    async search(query={}){
      searchCalls++;
      const kinds=query.kinds??['pet','mount','critter'];
      const selected=query.areaCodes??[0];
      const filtered=sorted.filter(row=>{
        const source=byId.get(Number(row.itemId));
        return kinds.includes(source.source.nativeKind)&&
          (selected.includes(0)||source.positiveNativeAreaCodes?.some(code=>
            selected.includes(code))===true);
      });
      const offset=query.offset??0,limit=query.limit??100;
      const itemIds=Object.freeze(filtered.slice(offset,offset+limit)
        .map(x=>Number(x.itemId)));
      return Object.freeze({
        total:filtered.length,itemIds,
        hasMore:filtered.length>offset+itemIds.length,
        sourceNativePetAndMountTagOnly:true,
        critterProfileWorldAreaUnresolved:true,
        actualCollectionUiMembershipVerified:false,
        nativeAllAreasDefaultPredicateVerified:false,
        playerEntitlementVerified:false
      });
    }
  });
  return {publicData,identity,source,census,byId,
    reader:await joinDb00LocalCompanionSources(publicData,source)};
}
const context=()=>contextPromise??=makeContext();

test('DB-00 preserves exact 241 Pet, 28 Mount, 125 Critter original source classes and native area census',async()=>{
  const {reader,census}=await context();
  const c=await reader.getCoverage();
  assert.equal(reader.contract,DB00_LOCAL_COMPANION_CLASSES);
  assert.equal(reader.snapshotId,'steam-1.26.2-native-itemlist-v1');
  assert.equal(reader.gameVersion,'1.26.2');
  assert.equal(reader.originalDefinitions,394);
  assert.equal(reader.ownerLocalOnly,true);
  assert.equal(reader.publicationAuthorized,false);
  assert.equal(reader.critterRuntimeWorldVerified,false);
  assert.equal(reader.gameCollectionUiMembershipVerified,false);
  assert.equal(c.original,census);
  assert.equal(c.originalDefinitions,394);
  assert.equal(c.petDefinitions,241);
  assert.equal(c.mountDefinitions,28);
  assert.equal(c.critterDefinitions,125);
  assert.equal(c.petMountPositiveAreaMatches,246);
  assert.equal(c.petMountNoPositiveAreaMatches,23);
  assert.equal(c.critterSceneLocationPending,125);
  assert.equal(c.critterOneofLocation6,105);
  assert.equal(c.critterOneofScene7,20);
  assert.deepEqual(c.positiveAreaCounts,{
    1:170,2:20,3:16,4:19,5:17,4097:4
  });
  await reader.getCoverage();
  assert.equal(coverageCalls,1);
  assert(Object.isFrozen(reader));
  assert(Object.isFrozen(c));
});

test('all 394 original Companion IDs match SHA-pinned DB-02 names and keep Critter scene unknown distinct from Pet/Mount empty positive tags',async()=>{
  const {reader,identity}=await context();
  const ids=identity.listNativeItemIds();
  let seen=0,pet=0,mount=0,critter=0,positive=0,noPositive=0;
  let crit6=0,crit7=0;
  const all=[];
  for(let offset=0;;){
    const page=await reader.search({areaCodes:[0],offset,limit:61});
    assert.equal(page.total,394);
    assert.equal(page.allAreasMeansUnfilteredOriginalSource,true);
    assert.equal(page.critterRuntimeWorldVerified,false);
    assert.equal(page.gameCollectionUiMembershipVerified,false);
    assert.equal(page.playerOwnershipVerified,false);
    assert.equal(page.dlcEntitlementVerified,false);
    all.push(...page.items);
    if(page.nextOffset===null)break;
    assert(page.nextOffset>offset);
    offset=page.nextOffset;
  }
  assert.equal(all.length,394);
  assert.deepEqual(all.map(row=>row.itemId),ids);
  for(const item of all){
    seen++;
    assert.deepEqual(item.publicIdentity,identity.getItem(item.itemId));
    assert.equal(item.original.source.itemId,Number(item.itemId));
    assert.equal(item.original.source.nativeKey,item.publicIdentity.native.nativeNameKey);
    assert.equal(item.originalNativeNameKeyVerified,true);
    assert.equal(item.originalNativeClassVerified,true);
    assert.equal(item.currentAvailabilityVerified,false);
    assert.equal(item.gameCollectionUiMembershipVerified,false);
    assert.equal(item.playerOwnershipVerified,false);
    assert.equal(item.dlcEntitlementVerified,false);
    assert.equal(item.campaignGrantVerified,false);
    assert(Object.isFrozen(item));
    if(item.nativeKind==='critter'){
      critter++;
      assert.equal(item.originalNativeClass,'CritterItemData');
      assert.equal(item.positiveNativeAreaCodes,null);
      assert.equal(item.positiveSourceAreas,null);
      assert.equal(item.original.source.nativeTags,null);
      assert.equal(item.original.originalIHasTagsInterface,false);
      assert.equal(item.needsRuntimeCritterSceneEvaluation,true);
      assert.equal(item.sourceAreaResolution,
        'critter_requires_profile_world_scene');
      if(item.original.source.critterLocationOneofFieldNumber===6)crit6++;
      else crit7++;
    }else{
      if(item.nativeKind==='pet')pet++;else mount++;
      assert(Array.isArray(item.positiveNativeAreaCodes));
      assert(Array.isArray(item.positiveSourceAreas));
      assert.equal(item.needsRuntimeCritterSceneEvaluation,false);
      assert.equal(item.original.originalIHasTagsInterface,true);
      if(item.positiveNativeAreaCodes.length){
        positive++;
        assert.equal(item.sourceAreaResolution,
          'positive_original_pet_or_mount_tag');
        assert.equal(item.positiveNativeAreaCodes.length,1);
        assert.equal(item.positiveSourceAreas.length,1);
        assert.equal(item.positiveSourceAreas[0].areaCode,
          item.positiveNativeAreaCodes[0]);
      }else{
        noPositive++;
        assert.equal(item.sourceAreaResolution,
          'no_positive_original_pet_or_mount_tag');
      }
    }
  }
  assert.equal(seen,394);
  assert.deepEqual([pet,mount,critter,positive,noPositive,crit6,crit7],
    [241,28,125,246,23,105,20]);
  assert.equal(await reader.getItem('99999999'),null);
});

test('six source-positive area filters contain no Critters and preserve real source-only tags',async()=>{
  const {reader}=await context();
  for(const [code,count] of Object.entries(
    DB01_ORIGINAL_COMPANION_POSITIVE_AREA_COUNTS)){
    const page=await reader.search({areaCodes:[Number(code)]});
    assert.equal(page.total,count);
    assert(page.items.every(row=>
      row.nativeKind!=='critter'&&
      row.positiveNativeAreaCodes.includes(Number(code))&&
      row.sourceAreaResolution==='positive_original_pet_or_mount_tag'));
  }
  const combined=await reader.search({areaCodes:[2,4097]});
  assert.equal(combined.total,24);
  assert(combined.items.every(x=>
    x.positiveNativeAreaCodes[0]===2||
    x.positiveNativeAreaCodes[0]===4097));
  assert.equal((await reader.search({kinds:['critter'],areaCodes:[1]})).total,0);
  assert.equal((await reader.search({kinds:['critter'],areaCodes:[0]})).total,125);
  assert.equal((await reader.search({kinds:['pet'],areaCodes:[0]})).total,241);
  assert.equal((await reader.search({kinds:['mount'],areaCodes:[0]})).total,28);
  assert.equal((await reader.search({kinds:[],areaCodes:[0]})).total,0);
});

test('DB-00 companion reader is bounded and uses authenticated DB-01 bulk getItems for search',async()=>{
  const {reader,identity}=await context();
  const first=await reader.search({limit:37});
  const second=await reader.search({offset:first.nextOffset,limit:37});
  assert.equal(first.items.length,37);
  assert.equal(second.items.length,37);
  assert.notDeepEqual(first.items[0].itemId,second.items[0].itemId);
  const originals=await reader.getItems(identity.listNativeItemIds().slice(0,100));
  assert.equal(originals.length,100);
  assert.equal(originals[0].publicIdentity.itemId,
    identity.listNativeItemIds()[0]);
  assert(getItemsCalls>0&&searchCalls>0);
  const before=assets.length;
  await reader.search({kinds:['pet'],areaCodes:[1],limit:3});
  assert.equal(assets.length,before,'DB-01 original data stays owner-local');
  await assert.rejects(reader.getItems(new Array(201).fill(120000191)),
    /INVALID_BATCH/);
  await assert.rejects(reader.search({limit:151}),/INVALID_PAGE/);
  await assert.rejects(reader.search({areaCodes:[0,2]}),
    /INVALID_OR_AMBIGUOUS_SOURCE_AREA/);
  await assert.rejects(reader.search({areaCodes:[1,1]}),
    /INVALID_OR_AMBIGUOUS_SOURCE_AREA/);
  await assert.rejects(reader.search({kinds:['critter','critter']}),
    /INVALID_SOURCE_KIND_FILTER/);
  await assert.rejects(reader.search({kinds:['mount','companion']}),
    /INVALID_SOURCE_KIND_FILTER/);
  await assert.rejects(reader.getItem('0120000191'),
    /invalid numeric Item ID/);
});

test('wrong original names, Critter with fabricated IHasTags, stale source census and native UI claims fail closed',async()=>{
  const {reader,publicData,source,byId,census,identity}=await context();
  const id=Number(identity.listNativeItemIds()[0]);
  const testRow=byId.get(id);
  const invalidName=await joinDb00LocalCompanionSources(publicData,{
    ...source,async getItem(itemId){
      const row=byId.get(itemId);
      return row?{...row,source:{...row.source,nativeKey:'FABRICATED'}}:null;
    }
  });
  await assert.rejects(invalidName.getItem(id),
    /COMPANION_ORIGINAL_ID_CLASS_OR_PROOF_MISMATCH/);
  const critterId=[...byId].find(([,x])=>
    x.source.nativeKind==='critter')[0];
  const fabricatedCritter=await joinDb00LocalCompanionSources(publicData,{
    ...source,async getItem(itemId){
      const row=byId.get(itemId);
      if(itemId!==critterId)return row??null;
      return {...row,source:{...row.source,nativeTags:[]}};
    }
  });
  await assert.rejects(fabricatedCritter.getItem(critterId),
    /CRITTER_MUST_NOT_BE_EVALUATED_AS_TAGGABLE_PET/);
  const stale=await joinDb00LocalCompanionSources(publicData,{
    ...source,async getCoverage(){
      return {...census,sourceCritterRuntimeWorldUnknown:124};
    }
  });
  await assert.rejects(stale.getCoverage(),
    /ORIGINAL_COMPANION_CLASS_CENSUS_MISMATCH/);
  const fakePage=await joinDb00LocalCompanionSources(publicData,{
    ...source,async search(options){
      return {...await source.search(options),
        actualCollectionUiMembershipVerified:true};
    }
  });
  await assert.rejects(fakePage.search({limit:5}),
    /SOURCE_COMPANION_PAGE_MISMATCH/);
  await assert.rejects(joinDb00LocalCompanionSources(
    {...publicData,hasPrivateGameSource:true},source
  ),/CURRENT_PUBLIC_AND_PRIVATE_COMPANION_SOURCES_REQUIRED/);
  assert.equal(testRow.source.nativeCategory,'Companion');
  assert.equal(reader.publicationAuthorized,false);
  assert.equal(DB01_ORIGINAL_COMPANION_SOURCE_SHA256,
    '62008c61bf0b407c40d0adf417db043ab058f4ec0ca2764355e176a3532c2219');
});
