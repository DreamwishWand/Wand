import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadPublicSourceCatalog} from '../src/lib/acquisition/public-source-catalog.ts';
import {indexDistributionScopes,DB02_DISTRIBUTION_SCOPE_SCHEMA}
  from '../src/lib/acquisition/distribution-scopes.ts';

const STATIC=new URL('../static/',import.meta.url);
function localFetcher(){
  const seen=[];
  return {
    seen,
    fetcher:async url=>{
      assert(url.startsWith('/Wand/')&&!url.includes('private')&&!url.includes('..'));
      seen.push(url);
      try {
        return new Response(readFileSync(new URL(url.slice('/Wand/'.length),STATIC)),
          {status:200});
      } catch {
        return new Response('not found',{status:404});
      }
    }
  };
}

test('on-demand three-group source index preserves all 1255 origins and never treats metadata as a live premium sale',async()=>{
  const {seen,fetcher}=localFetcher();
  const catalog=await loadPublicSourceCatalog('/Wand',fetcher);
  assert.equal(seen.length,26);
  const first=catalog.loadDistributionScopes();
  const second=catalog.loadDistributionScopes();
  assert.equal(first,second);
  const idx=await first;
  assert.equal(idx.schema,DB02_DISTRIBUTION_SCOPE_SCHEMA);
  assert.equal(idx.gameVersion,'1.26.2');
  assert.equal(seen.length,28,'two native original metadata projections load lazily');
  assert.equal(seen.filter(x=>x.endsWith('/online-categories-1.26.2.json')).length,1);
  assert.equal(seen.filter(x=>x.endsWith('/pet-source-categories-1.26.2.json')).length,1);
  assert.equal(idx.coverage.nativeOnlineCategoryRows,2198);
  assert.equal(idx.coverage.nativePetSourceRows,134);
  assert.equal(idx.coverage.existingSourceOriginRoutes,1255);
  assert.equal(idx.coverage.nameOnlyCandidateRelations,
    catalog.nameCandidates.coverage.totalCandidateRelations);
  assert(idx.coverage.distinctItemsWithSourceEvidence>=2198);
  assert(idx.coverage.realWorldDistributionItemIds>=2198);
  assert(idx.coverage.ordinaryGameplayItemIds>0);
  assert.equal(idx.coverage.gameplayTimeConditionItemIds,0,
    'current public baseline does not yet establish any in-game clock window');
  assert.equal(idx.coverage.exclusiveTimeLimitedItemVerified,false);
  assert.equal(idx.coverage.currentAvailabilityVerified,false);
  assert.equal(idx.coverage.playerOwnershipVerified,false);
  assert.equal(catalog.coverage.combinedSourceRoutes,1255);
  assert.equal(catalog.itemSources.query().totalOriginRelations,1255);
  assert.equal(catalog.itemSources.getKindItemIds('redeem_code').length,0);
  assert.equal(catalog.itemSources.getKindItemIds('twitch_drop').length,0);

  const real=idx.getItem('40001569');
  assert(real.scopes.includes('real_world_distribution'));
  const native=real.evidence.find(x=>x.evidenceKind==='native_online_category');
  assert(native);
  assert.equal(native.relation.category,'time_limited');
  assert.equal(native.exactConfiguredItemIdLink,false);
  assert.equal(native.acquisitionMethodVerified,false);
  assert.equal(native.liveAvailabilityVerified,false);
  assert.equal(native.exclusiveTimeLimitedItemVerified,false);
  assert.equal(real.currentAvailabilityVerified,false);
  assert.equal(real.scopeCoverageComplete,false);

  const pet=idx.getItem('120000043');
  assert(pet.evidence.some(x=>x.evidenceKind==='native_pet_source_category'&&
    x.relation.category==='exclusive_promotion'&&
    x.acquisitionMethodVerified===false));
  assert(pet.scopes.includes('real_world_distribution'));

  const shop=idx.getItem('20500136');
  assert(shop.evidence.some(x=>x.evidenceKind==='configured_item_origin'&&
    x.relation.kind==='premium_shop'&&
    x.exactConfiguredItemIdLink===true&&
    x.acquisitionMethodVerified===true&&
    x.liveAvailabilityVerified===false));
  assert(shop.scopes.includes('real_world_distribution'));

  const quest=idx.getItem('80000000');
  assert(quest.scopes.includes('ordinary_gameplay'));
  assert(quest.evidence.some(x=>x.evidenceKind==='configured_item_origin'&&
    x.relation.kind==='quest_reward'&&
    x.acquisitionMethodVerified===false));

  const gamer=idx.getItem('50400102');
  assert(gamer.evidence.some(x=>x.evidenceKind==='campaign_or_shop_name_candidate'&&
    x.relation.kind==='official_campaign_name_candidate'&&
    x.relation.campaignId==='twitch:2023-launch'&&
    x.nameMatchOnly===true&&x.exactConfiguredItemIdLink===false));
  assert(gamer.scopes.includes('real_world_distribution'));
  const officialCandidateCount=catalog.nameCandidates
    .getCampaignCandidates('twitch:2023-launch').length;
  assert.equal(officialCandidateCount,4);

  const unknown=idx.getItem('999999999');
  assert.deepEqual(unknown.scopes,[]);
  assert.deepEqual(unknown.evidence,[]);
  assert.equal(unknown.unknownBecauseNoEvidence,true);
  assert.equal(unknown.scopeCoverageComplete,false);
  assert.equal(unknown.currentAvailabilityVerified,false);
  assert.equal(idx.listItemIds().length,idx.coverage.distinctItemsWithSourceEvidence);
  for(const scope of ['ordinary_gameplay','gameplay_time_condition','real_world_distribution']){
    const ids=idx.listItemIds(scope);
    assert(Object.isFrozen(ids));
    assert(ids.every((id,i)=>i===0||Number(ids[i-1])<Number(id)));
    assert(ids.every(id=>idx.getItem(id).scopes.includes(scope)));
  }
  assert.equal(idx.listItemIds('real_world_distribution').includes('40001569'),true);
  assert.equal(idx.listItemIds('ordinary_gameplay').includes('80000000'),true);
  assert(Object.isFrozen(idx));
  assert(Object.isFrozen(idx.coverage));
  assert(Object.isFrozen(real));
  assert(Object.isFrozen(real.scopes));
  assert(Object.isFrozen(real.evidence));
  assert(Object.isFrozen(real.evidence[0]));
});

test('shared Catalog lookup adds distribution evidence on demand without changing ItemOrigin links',async()=>{
  const {seen,fetcher}=localFetcher();
  const catalog=await loadPublicSourceCatalog('/Wand',fetcher);
  const first=catalog.lookup('120000043');
  const total=seen.length;
  assert.equal(total,26);
  const row=await catalog.lookupWithDistributionScopes('120000043');
  assert.equal(seen.length,total+2);
  assert.equal(row.distributionScopeEvidenceLoaded,true);
  assert.equal(row.itemId,'120000043');
  assert.deepEqual(row.origins,first.origins);
  assert.deepEqual(row.onlineNameCandidates,first.onlineNameCandidates);
  assert.equal(row.distributionScope.itemId,'120000043');
  assert(row.distributionScope.scopes.includes('real_world_distribution'));
  assert(Object.isFrozen(row));
  const another=await catalog.lookupWithDistributionScopes('50400102');
  assert.equal(seen.length,total+2,'all further lookups share one scope index');
  assert(another.distributionScope.evidence.some(x=>x.nameMatchOnly));
  assert.equal(catalog.coverage.combinedSourceRoutes,1255);
});

test('community Festival code candidates remain source-specific and cannot create a confirmed origin',async()=>{
  const {fetcher}=localFetcher();
  const catalog=await loadPublicSourceCatalog('/Wand',fetcher);
  const index=await catalog.loadDistributionScopes();
  const candidates=catalog.nameCandidates.getCampaignCandidates('code:FOFGEMS24');
  assert(candidates.length>0);
  for(const candidate of candidates){
    const row=index.getItem(candidate.itemId);
    assert(row.evidence.some(x=>
      x.evidenceKind==='campaign_or_shop_name_candidate'&&
      x.relation===candidate&&
      x.relation.kind==='community_campaign_name_candidate'&&
      x.nameMatchOnly===true&&
      x.exactConfiguredItemIdLink===false&&
      x.acquisitionMethodVerified===false));
    assert(row.scopes.includes('real_world_distribution'));
    assert(row.exclusiveTimeLimitedItemVerified===false);
    assert(row.currentAvailabilityVerified===false);
    assert(row.playerOwnershipVerified===false);
    assert(catalog.itemSources.getItem(candidate.itemId).origins.every(o=>
      o.campaignId!=='code:FOFGEMS24'));
  }
});

test('a forged unpinned online or companion source cannot be admitted to the distribution join',async()=>{
  const {fetcher}=localFetcher();
  const catalog=await loadPublicSourceCatalog('/Wand',fetcher);
  const [online,pets]=await Promise.all([
    catalog.loadNativeOnlineCategories(),catalog.loadNativePetSources()
  ]);
  const mk=(a,b,c,d)=>indexDistributionScopes(a,b,c,d);
  assert.throws(()=>mk(catalog.origins,{...online},pets,catalog.nameCandidates),
    /DB02_DISTRIBUTION_SCOPE_PINNED_SOURCE_REQUIRED/);
  assert.throws(()=>mk(catalog.origins,online,{...pets},catalog.nameCandidates),
    /DB02_DISTRIBUTION_SCOPE_PINNED_SOURCE_REQUIRED/);
  assert.throws(()=>mk({...catalog.origins,schema:'spoofed'},online,pets,
    catalog.nameCandidates),/DB02_DISTRIBUTION_SCOPE_PINNED_SOURCE_REQUIRED/);
  assert.throws(()=>mk(catalog.origins,online,pets,{
    ...catalog.nameCandidates,
    coverage:{...catalog.nameCandidates.coverage,verifiedOnlineAcquisitionLinks:1}
  }),/DB02_DISTRIBUTION_SCOPE_PINNED_SOURCE_REQUIRED/);
  const idx=mk(catalog.origins,online,pets,catalog.nameCandidates);
  assert.throws(()=>idx.getItem('0001'),/INVALID_ITEM_ID/);
  assert.throws(()=>idx.getItem(0),/INVALID_ITEM_ID/);
  assert.throws(()=>idx.listItemIds('all'),/INVALID_SCOPE/);
});
