import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openPublicSharedGameSources}
  from '../src/lib/game-db/public-sources.ts';
import {
  createDb00DistributionSourceReader,
  DB00_DISTRIBUTION_SOURCE_CONTRACT
} from '../src/lib/game-db/distribution-sources.ts';

const ROOT=new URL('../static/',import.meta.url);
const ONLINE='online-categories-1.26.2.json';
const PET='pet-source-categories-1.26.2.json';
function local({corruptOnline=false,corruptPet=false}={}){
  const calls=[];
  const fetcher=async url=>{
    assert(typeof url==='string'&&url.startsWith('/Wand/')&&!url.includes('..'));
    calls.push(url);
    let bytes;
    try{bytes=readFileSync(new URL(url.slice(6),ROOT));}
    catch{return new Response('missing',{status:404});}
    if(corruptOnline&&url.endsWith('/'+ONLINE)){
      bytes=Buffer.from(bytes);bytes[50]^=1;
    }
    if(corruptPet&&url.endsWith('/'+PET)){
      bytes=Buffer.from(bytes);bytes[50]^=1;
    }
    return new Response(bytes,{status:200});
  };
  return {calls,fetcher};
}
let common;
const shared=()=>common??=openPublicSharedGameSources('/Wand',local().fetcher);
const SCOPES=[
  'ordinary_gameplay','gameplay_time_condition','real_world_distribution'
];

test('distribution source search is lazy and shares both SHA-authenticated DB-02 assets',async()=>{
  const {calls,fetcher}=local();
  const pub=await openPublicSharedGameSources('/Wand',fetcher);
  const initial=calls.length;
  assert(initial>0);
  assert.equal(calls.filter(x=>x.endsWith('/'+ONLINE)).length,0);
  assert.equal(calls.filter(x=>x.endsWith('/'+PET)).length,0);
  const reader=await pub.loadDistributionSourceSearch();
  assert.equal(reader.contract,DB00_DISTRIBUTION_SOURCE_CONTRACT);
  assert.equal(reader.snapshotId,pub.snapshotId);
  assert.equal(reader,await pub.loadDistributionSourceSearch());
  assert.equal(reader.nativeOnlineCategoryRows,2198);
  assert.equal(reader.nativePetSourceRows,134);
  assert.equal(reader.configuredOriginRoutes,1255);
  assert.equal(reader.indexedOriginalSourceRoutes,3961);
  assert.equal(reader.sourceCoverageComplete,false);
  assert.equal(reader.exclusiveTimeLimitedItemVerified,false);
  assert.equal(reader.currentAvailabilityVerified,false);
  assert.equal(reader.playerOwnershipVerified,false);
  assert.equal(calls.length,initial+4,
    'classification loads 2 original metadata and 2 original recipe/activity assets');
  assert.equal(calls.filter(x=>x.endsWith('/'+ONLINE)).length,1);
  assert.equal(calls.filter(x=>x.endsWith('/'+PET)).length,1);
  const source=await pub.acquisition.loadDistributionScopes();
  await pub.acquisition.loadNativeOnlineCategories();
  await pub.acquisition.loadNativePetSources();
  await pub.loadNativeOnlineCategories();
  await pub.loadNativeCompanionSources();
  assert.equal(reader.coveredSourceItemCount,
    source.coverage.distinctItemsWithSourceEvidence);
  assert.equal(reader.nameOnlyCandidateRelations,
    source.coverage.nameOnlyCandidateRelations);
  assert.equal(calls.length,initial+4,
    'all native DB-02 readers reuse the previously authenticated projections');
  assert(Object.isFrozen(reader));
});

test('every DB-02 source-evidence Item ID is joined to exact public DB-00 Item ID and retains non-exclusive scope evidence',async()=>{
  const pub=await shared();
  const r=await pub.loadDistributionSourceSearch();
  const source=await pub.acquisition.loadDistributionScopes();
  const ids=source.listItemIds();
  assert.equal(r.coveredSourceItemCount,ids.length);
  const evidenceCounts={
    native_online_category:0,native_pet_source_category:0,
    configured_item_origin:0,campaign_or_shop_name_candidate:0
  };
  let simultaneous=0,published=0,outside=0;
  for(const id of ids){
    const row=r.getItem(id);
    assert.equal(row.itemId,id);
    assert.deepEqual(row.shared,pub.getItem(id));
    assert.equal(row.distribution,source.getItem(id));
    assert.equal(row.distribution.unknownBecauseNoEvidence,false);
    assert.equal(row.distribution.scopeCoverageComplete,false);
    assert.equal(row.distribution.exclusiveTimeLimitedItemVerified,false);
    assert.equal(row.distribution.currentAvailabilityVerified,false);
    assert.equal(row.distribution.playerOwnershipVerified,false);
    assert.equal(row.canHaveMultipleScopes,true);
    assert.equal(row.sourceCoverageComplete,false);
    assert.equal(row.exclusiveTimeLimitedItemVerified,false);
    assert.equal(row.currentAvailabilityVerified,false);
    assert.equal(row.playerOwnershipVerified,false);
    assert.equal(row.gameCollectionUiMembershipVerified,false);
    if(row.distribution.scopes.length>1)simultaneous++;
    if(row.shared.catalog!==null)published++;else outside++;
    for(const e of row.distribution.evidence){
      evidenceCounts[e.evidenceKind]++;
      assert.equal(e.liveAvailabilityVerified,false);
      assert.equal(e.exclusiveTimeLimitedItemVerified,false);
      assert.equal(e.playerOwnershipVerified,false);
      assert.equal(e.relation.itemId,id);
    }
    assert(Object.isFrozen(row));
  }
  assert.equal(published+outside,ids.length);
  assert.equal(evidenceCounts.native_online_category,2198);
  assert.equal(evidenceCounts.native_pet_source_category,134);
  assert.equal(evidenceCounts.configured_item_origin,3961);
  assert.equal(r.indexedOriginalSourceRoutes,3961);
  assert.equal(evidenceCounts.campaign_or_shop_name_candidate,
    source.coverage.nameOnlyCandidateRelations);
  assert(simultaneous>=0);
  assert.equal(r.getItem('99999999').distribution.unknownBecauseNoEvidence,true);
  assert.deepEqual(r.getItem('99999999').distribution.scopes,[]);
  assert.deepEqual(r.getItem('99999999').distribution.evidence,[]);
});

test('each route group is searchable and paginates with exact published names, source evidence and numeric IDs',async()=>{
  const pub=await shared();
  const r=await pub.loadDistributionSourceSearch();
  const source=await pub.acquisition.loadDistributionScopes();
  const all=r.search({limit:500});
  assert.equal(all.scope,'distribution_source_evidence');
  assert.equal(all.total,source.listItemIds().length);
  assert.equal(all.filterScope,null);
  assert.equal(all.sourceCoverageComplete,false);
  assert.equal(all.exclusiveTimeLimitedItemVerified,false);
  assert.equal(all.playerOwnershipVerified,false);
  const joined=[];
  for(let offset=0;;){
    const page=r.search({offset,limit:43});
    assert.equal(page.total,all.total);
    joined.push(...page.items.map(x=>x.itemId));
    if(page.nextOffset===null)break;
    assert(page.nextOffset>offset);
    offset=page.nextOffset;
  }
  assert.deepEqual(joined,source.listItemIds());
  for(const scope of SCOPES){
    const expected=source.listItemIds(scope);
    const got=[];
    for(let offset=0;;){
      const page=r.search({scope,offset,limit:37});
      assert.equal(page.total,expected.length);
      assert.equal(page.filterScope,scope);
      got.push(...page.items.map(x=>x.itemId));
      if(page.nextOffset===null)break;
      offset=page.nextOffset;
    }
    assert.deepEqual(got,expected);
  }
  const published=r.search({publishedOnly:true,limit:500});
  assert.equal(published.total,
    source.listItemIds().filter(id=>pub.database.getItem(id)!==null).length);
  assert(published.items.every(x=>x.shared.catalog!==null));
  const known=joined.find(id=>pub.database.getItem(id)?.names.ja?.length>=2);
  if(known){
    const needle=pub.database.getItem(known).names.ja.slice(0,2);
    assert(r.search({text:needle,locale:'ja',limit:500}).items.some(
      x=>x.itemId===known));
  }
  const prefix=joined[0].slice(0,6);
  assert(r.search({text:prefix,limit:500}).items.some(x=>
    x.itemId===joined[0]));
  assert.equal(r.search({text:'unlikely-unlisted-ddv_item_124'}).total,0);
});

test('original configured ItemOrigin, native source category and name candidate cannot be mistaken for equivalent evidence',async()=>{
  const pub=await shared();
  const r=await pub.loadDistributionSourceSearch();
  const source=await pub.acquisition.loadDistributionScopes();
  const exact=r.search({exactConfiguredItemIdLinkOnly:true,limit:500});
  const expected=source.listItemIds().filter(id=>source.getItem(id).evidence
    .some(e=>e.evidenceKind==='configured_item_origin'&&
      e.exactConfiguredItemIdLink===true));
  assert.equal(exact.total,expected.length);
  assert(exact.items.every(row=>row.distribution.evidence.some(e=>
    e.evidenceKind==='configured_item_origin'&&
    e.exactConfiguredItemIdLink===true)));
  const online=r.search({evidenceKind:'native_online_category',limit:500});
  assert.equal(online.total,2198);
  assert(online.items.every(x=>x.distribution.evidence.some(e=>
    e.evidenceKind==='native_online_category'&&
    e.acquisitionMethodVerified===false)));
  const pets=r.search({evidenceKind:'native_pet_source_category',limit:500});
  assert.equal(pets.total,134);
  const semantic=r.search({
    scope:'real_world_distribution',
    evidenceKind:'campaign_or_shop_name_candidate',limit:500
  });
  const nameIds=source.listItemIds('real_world_distribution').filter(
    id=>source.getItem(id).evidence.some(e=>
      e.evidenceKind==='campaign_or_shop_name_candidate'));
  assert.equal(semantic.total,nameIds.length);
  for(const row of semantic.items){
    assert(row.distribution.evidence.some(e=>
      e.evidenceKind==='campaign_or_shop_name_candidate'&&
      e.exactConfiguredItemIdLink===false&&
      e.acquisitionMethodVerified===false&&
      e.nameMatchOnly===true));
  }
  const both=r.search({
    scope:'real_world_distribution',
    exactConfiguredItemIdLinkOnly:true,limit:500
  });
  assert(both.items.every(row=>row.distribution.evidence.some(e=>
    e.scope==='real_world_distribution'&&
    e.evidenceKind==='configured_item_origin'&&
    e.exactConfiguredItemIdLink)));
  assert.equal(r.search({evidenceKind:'native_online_category',
    exactConfiguredItemIdLinkOnly:true}).total,0);
});

test('invalid requests, forged source coverage and corrupted native assets fail closed',async()=>{
  const pub=await shared();
  const r=await pub.loadDistributionSourceSearch();
  assert.throws(()=>r.search({scope:'exclusive_item'}),
    /INVALID_SCOPE/);
  assert.throws(()=>r.search({evidenceKind:'live_sale'}),
    /INVALID_EVIDENCE_KIND/);
  assert.throws(()=>r.search({publishedOnly:false}),
    /INVALID_PUBLISHED_FILTER/);
  assert.throws(()=>r.search({exactConfiguredItemIdLinkOnly:false}),
    /INVALID_EXACT_SOURCE_FILTER/);
  assert.throws(()=>r.search({locale:'ko'}),/INVALID_LOCALE/);
  assert.throws(()=>r.search({text:'bad\ntext'}),/INVALID_TEXT/);
  assert.throws(()=>r.search({limit:501}),/INVALID_PAGE/);
  assert.throws(()=>r.getItem('0120000000'),/invalid numeric Item ID/);
  const original=await pub.acquisition.loadDistributionScopes();
  assert.throws(()=>createDb00DistributionSourceReader(
    pub.database,pub.joined,
    {...original,coverage:{
      ...original.coverage,existingSourceOriginRoutes:1254
    }}
  ),/EXACT_DB00_DB02_CURRENT_SOURCE_REQUIRED/);
  const {calls,fetcher}=local({corruptOnline:true});
  const bad=await openPublicSharedGameSources('/Wand',fetcher);
  const before=calls.length;
  await assert.rejects(bad.getItemDistributionEvidence('0120000000'),
    /invalid numeric Item ID/);
  assert.equal(calls.length,before);
  await assert.rejects(bad.loadDistributionSourceSearch(),
    /DB02_NATIVE_ONLINE_CATEGORY_SHA/);
  const missing=await openPublicSharedGameSources('/Wand',
    local({corruptPet:true}).fetcher);
  await assert.rejects(missing.searchDistributionSources({scope:
    'real_world_distribution'}),/DB02_PET_SOURCE_SHA/);
});
