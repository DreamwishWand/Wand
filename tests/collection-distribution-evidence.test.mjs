import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeCollectionDistribution}
  from '../src/lib/collection/distribution-evidence.ts';
import {collectionDistributionCopy}
  from '../src/lib/collection/distribution-copy.ts';
import {openPublicSharedGameSources}
  from '../src/lib/game-db/public-sources.ts';

const ID='40001569';
const source=(group,kind,extra={})=>({
  itemId:ID,scope:group,evidenceKind:kind,relation:{itemId:ID},
  exactConfiguredItemIdLink:false,acquisitionMethodVerified:false,
  nameMatchOnly:false,liveAvailabilityVerified:false,
  exclusiveTimeLimitedItemVerified:false,playerOwnershipVerified:false,
  ...extra
});
function fixture(evidence=[]){
  return {
    itemId:ID,shared:{itemId:ID},
    canHaveMultipleScopes:true,sourceCoverageComplete:false,
    exclusiveTimeLimitedItemVerified:false,currentAvailabilityVerified:false,
    playerOwnershipVerified:false,gameCollectionUiMembershipVerified:false,
    distribution:{
      itemId:ID,
      scopes:['ordinary_gameplay','gameplay_time_condition','real_world_distribution']
        .filter(scope=>evidence.some(row=>row.scope===scope)),
      evidence,
      unknownBecauseNoEvidence:evidence.length===0,
      scopeCoverageComplete:false,exclusiveTimeLimitedItemVerified:false,
      currentAvailabilityVerified:false,playerOwnershipVerified:false
    }
  };
}

test('multiple source routes coexist: gameplay is not erased by historic distribution',()=>{
  const item=fixture([
    source('ordinary_gameplay','configured_item_origin',{
      exactConfiguredItemIdLink:true,acquisitionMethodVerified:true
    }),
    source('real_world_distribution','native_online_category'),
    source('real_world_distribution','campaign_or_shop_name_candidate',
      {nameMatchOnly:true})
  ]);
  const result=summarizeCollectionDistribution(item);
  assert.deepEqual(result.groups,[
    {group:'ordinary_gameplay',proofs:['configured_item_id_link']},
    {group:'real_world_distribution',proofs:[
      'native_source_category','name_only_candidate'
    ]}
  ]);
  assert.equal(result.exclusiveLimitedItemVerified,false);
  assert.equal(result.currentAvailabilityVerified,false);
  assert.equal(result.playerOwnershipVerified,false);
  assert.equal(result.collectionUiMembershipVerified,false);
  assert(Object.isFrozen(result.groups));
  assert(Object.isFrozen(result.groups[0].proofs));
});

test('gameplay clock is a distinct source condition and not a real-world date',()=>{
  const result=summarizeCollectionDistribution(fixture([
    source('gameplay_time_condition','configured_item_origin',{
      exactConfiguredItemIdLink:true,acquisitionMethodVerified:true
    }),
    source('real_world_distribution','configured_item_origin',{
      exactConfiguredItemIdLink:false,acquisitionMethodVerified:false
    })
  ]));
  assert.deepEqual(result.groups,[
    {group:'gameplay_time_condition',proofs:['configured_item_id_link']},
    {group:'real_world_distribution',proofs:['configured_route_unverified']}
  ]);
});

test('unrecorded evidence is unknown, not ordinary gameplay or a free item',()=>{
  const result=summarizeCollectionDistribution(fixture());
  assert.deepEqual(result.groups,[]);
  assert.equal(result.sourceCoverageComplete,false);
  const fraud=fixture();
  fraud.distribution.unknownBecauseNoEvidence=false;
  assert.throws(()=>summarizeCollectionDistribution(fraud),/MISSING_EVIDENCE/);
});

test('unknown or falsely promoted source evidence fails closed',()=>{
  const real=source('real_world_distribution','native_online_category');
  const bad=[
    fixture([{...real,relation:{itemId:'40001570'}}]),
    fixture([{...real,exactConfiguredItemIdLink:true}]),
    fixture([{...real,acquisitionMethodVerified:true}]),
    fixture([{...real,exclusiveTimeLimitedItemVerified:true}]),
    fixture([source('ordinary_gameplay','campaign_or_shop_name_candidate')]),
    fixture([source('ordinary_gameplay','configured_item_origin',
      {exactConfiguredItemIdLink:true,acquisitionMethodVerified:false})]),
    fixture([{...real,evidenceKind:'fictional_campaign'}])
  ];
  for(const record of bad)assert.throws(()=>summarizeCollectionDistribution(record),
    /COLLECTION_DISTRIBUTION/);
  const sourceWithForgedItem=fixture([real]);
  sourceWithForgedItem.shared.itemId='99999999';
  assert.throws(()=>summarizeCollectionDistribution(sourceWithForgedItem),
    /SOURCE_CONTRACT/);
  const sourceWithFalseOwnership=fixture([real]);
  sourceWithFalseOwnership.playerOwnershipVerified=true;
  assert.throws(()=>summarizeCollectionDistribution(sourceWithFalseOwnership),
    /SOURCE_CONTRACT/);
  const sourceWithFalseLimited=fixture([real]);
  sourceWithFalseLimited.exclusiveTimeLimitedItemVerified=true;
  assert.throws(()=>summarizeCollectionDistribution(sourceWithFalseLimited),
    /SOURCE_CONTRACT/);
});

test('all eight languages express provenance without item-level limited-time claims',()=>{
  for(const locale of ['ja','en','fr','it','de','es-ES','zh-CN','pt-BR']){
    const copy=collectionDistributionCopy(locale);
    for(const group of ['ordinary_gameplay','gameplay_time_condition','real_world_distribution'])
      assert(copy.groups[group]?.trim().length>0,locale+' '+group);
    for(const proof of ['configured_item_id_link','native_source_category',
      'configured_route_unverified','name_only_candidate'])
      assert(copy.proofs[proof]?.trim().length>0,locale+' '+proof);
    assert(copy.caveat?.length>15,locale+' caveat');
  }
  assert.match(collectionDistributionCopy('ja').caveat,/未確認/);
  assert.match(collectionDistributionCopy('en').caveat,/unverified/);
  assert.equal(collectionDistributionCopy('unknown'),collectionDistributionCopy('ja'));
});

test('real SHA-verified DB-00/02 source exposes original online routing as a category, not an Item grant',async()=>{
  const paths=[];
  const fetcher=async url=>{
    assert(typeof url==='string'&&url.startsWith('/Wand/')&&!url.includes('..'));
    paths.push(url);
    try{
      return new Response(readFileSync(new URL(url.slice(6),
        new URL('../static/',import.meta.url))),{status:200});
    }catch{return new Response('missing',{status:404});}
  };
  const db=await openPublicSharedGameSources('/Wand',fetcher);
  assert(!paths.some(path=>path.includes('native-online-categories-1.26.2')),
    'opening Collection does not eagerly download online distribution evidence');
  const native=await db.getItemDistributionEvidence(ID);
  const result=summarizeCollectionDistribution(native);
  assert.equal(result.itemId,40001569);
  assert(result.groups.some(x=>
    x.group==='real_world_distribution'&&
    x.proofs.includes('native_source_category')),
    'original TimeLimited OnlineCategory is a source category, NOT verified current availability');
  assert.equal(result.exclusiveLimitedItemVerified,false);
  assert.equal(result.currentAvailabilityVerified,false);
  const reader=await db.loadDistributionSourceSearch();
  assert.equal(reader.sourceCoverageComplete,false);
  const clock=reader.search({scope:'gameplay_time_condition'});
  assert.equal(clock.total,0,
    'no verified game-clock source conditions means no invented item membership');
  assert.equal(reader.getItem(ID).distribution.exclusiveTimeLimitedItemVerified,false);
});
