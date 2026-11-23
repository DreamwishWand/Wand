import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openPublicSharedGameSources} from '../src/lib/game-db/public-sources.ts';
import {joinCurrentGameSources} from '../src/lib/game-db/source-join.ts';

const STATIC=new URL('../static/',import.meta.url);
const reader=async url=>{
  assert(typeof url==='string'&&url.startsWith('/Wand/')&&!url.includes('..'));
  try{return new Response(readFileSync(new URL(url.slice('/Wand/'.length),STATIC)),{status:200});}
  catch{return new Response('not found',{status:404});}
};
let source;
const open=()=>source??=openPublicSharedGameSources('/Wand',reader);
const publishedOfficial=app=>app.acquisition.nameCandidates
  .listCampaignRewardResolutions();

test('official name equality remains distinct from verified Item origins and community shop appearances',async()=>{
  const app=await open(),index=app.acquisition.nameCandidates;
  assert.equal(index.evidence,'name_only_no_grant_or_sale_proof');
  assert.equal(index.coverage.verifiedOnlineAcquisitionLinks,0);
  const names=new Set();
  let officialMatches=0,unmatched=0;
  for(const campaign of publishedOfficial(app)){
    const resolved=index.getCampaignRewardResolution(campaign.campaignId);
    assert.equal(resolved,campaign);
    assert.equal(resolved.acquisitionLinksVerified,false);
    for(const reward of campaign.rewards){
      assert.equal(reward.acquisitionLinkVerified,false);
      assert.equal(reward.claimedByPlayerVerified,false);
      if(reward.match==='unique_name_candidate'){
        assert.equal(reward.nameCandidateItemIds.length,1);
        const id=reward.nameCandidateItemIds[0];
        names.add(id);officialMatches++;
        assert(app.getItem(id).officialCampaignNameCandidates.some(row=>
          row.campaignId===campaign.campaignId&&
          row.sourceName===reward.name&&
          row.acquisitionLinkVerified===false));
      }else if(reward.match==='not_found_in_published_db00'||
        reward.match==='ambiguous_name_candidates'){
        unmatched++;
        assert.notEqual(reward.nameCandidateItemIds.length,1,
          'ambiguous/unknown official reward must not be assigned to an Item ID');
      }
    }
  }
  assert.equal(officialMatches,index.coverage.uniquelyMatchedOfficialRewards);
  assert(officialMatches>0);
  assert(unmatched>0,'non-matched official reward names must remain unresolved');
  assert.equal(app.searchItems({officialCampaignNameCandidate:true,limit:500}).total,names.size);
  const candidates=app.searchItems({officialCampaignNameCandidate:true,limit:500});
  assert.deepEqual(new Set(candidates.items.map(x=>x.itemId)),names);
  assert(candidates.items.every(item=>
    item.officialCampaignNameCandidates.length>0&&
    item.officialCampaignNameCandidates.every(candidate=>
      candidate.kind==='official_campaign_name_candidate'&&
      candidate.acquisitionLinkVerified===false&&
      candidate.evidence==='exact_published_db00_en_name_only'&&
      candidate.currentAvailabilityVerified===false)));
  assert(candidates.items.every(item=>
    item.officialCampaignAcquisitionLinkVerified===false&&
    item.currentlyAvailableVerified===false&&
    item.playerOwnershipVerified===false));
  assert(candidates.items.every(item=>
    !item.officialCampaignNameCandidates.some(candidate=>
      Object.hasOwn(candidate,'reportedMoonstonePrice')||
      Object.hasOwn(candidate,'weekStart')||
      Object.hasOwn(candidate,'priceAndContentsEvidence'))));
  const outside=app.getItem('170600007');
  assert.equal(outside.catalog,null);
  assert.deepEqual(outside.officialCampaignNameCandidates,[]);
  assert(Object.isFrozen(candidates));
  assert(Object.isFrozen(candidates.items));
  assert(Object.isFrozen(candidates.items[0].officialCampaignNameCandidates));
});

test('campaign kind, exact campaign ID, Item name and pagination combine only name-only evidence',async()=>{
  const app=await open(),index=app.acquisition.nameCandidates;
  const list=publishedOfficial(app);
  const officialCandidates=list.filter(c=>index.getCampaignCandidates(c.campaignId).length>0);
  assert(officialCandidates.length>0);
  const selected=officialCandidates[0];
  const campaign=index.getCampaignCandidates(selected.campaignId);
  const expectedIds=new Set(campaign.map(x=>x.itemId));
  const chosen=app.searchItems({
    officialCampaignId:selected.campaignId,limit:500
  });
  assert.equal(chosen.total,expectedIds.size);
  assert.deepEqual(new Set(chosen.items.map(item=>item.itemId)),expectedIds);
  assert(chosen.items.every(item=>item.officialCampaignNameCandidates.some(
    row=>row.campaignId===selected.campaignId &&
      row.campaignKind===selected.campaignKind)));
  const kindMatches=app.searchItems({
    officialCampaignKind:selected.campaignKind,limit:500
  });
  assert(kindMatches.total>=chosen.total);
  assert(kindMatches.items.every(item=>item.officialCampaignNameCandidates.some(
    row=>row.campaignKind===selected.campaignKind)));
  const first=app.searchItems({officialCampaignNameCandidate:true,limit:1});
  const second=app.searchItems({
    officialCampaignNameCandidate:true,limit:1,offset:first.nextOffset??0
  });
  assert.equal(first.items.length,1);
  if(first.total>1)assert.notEqual(first.items[0].itemId,second.items[0].itemId);
  const match=chosen.items[0];
  const byId=app.searchItems({
    officialCampaignId:selected.campaignId,text:match.itemId,limit:500
  });
  assert(byId.items.some(row=>row.itemId===match.itemId));
  assert.equal(app.searchItems({officialCampaignId:'no-such-official-campaign'}).total,0);

  // Online English-name match must never enter 'confirmed_source_link' origin filters.
  assert.equal(app.searchItems({
    originKinds:['twitch_drop'],officialCampaignNameCandidate:true
  }).total,0);
  assert.equal(app.searchItems({
    originKinds:['redeem_code'],officialCampaignNameCandidate:true
  }).total,0);
  const twitch=app.searchItems({
    officialCampaignNameCandidate:true,officialCampaignKind:'twitch_drop'
  });
  assert(twitch.total>0);
  assert(twitch.items.every(item=>item.officialCampaignNameCandidates.some(
    row=>row.campaignKind==='twitch_drop')));
  assert.equal(app.acquisition.itemSources.getKindItemIds('twitch_drop').length,0);
  assert.equal(app.acquisition.itemSources.getKindItemIds('redeem_code').length,0);
});

test('omitted name source is null; a fake verified acquisition is rejected',async()=>{
  const app=await open(),native=app.acquisition.nameCandidates;
  const id=app.searchItems({officialCampaignNameCandidate:true,limit:1}).items[0].itemId;
  const plain=joinCurrentGameSources(app.database,{
    origins:app.acquisition.origins,rewards:app.guide,
    questTargets:app.guideQuestTargets,
    defaultInventories:app.acquisition.defaultInventorySource
  });
  assert.equal(plain.getItem(id).officialCampaignNameCandidates,null);
  assert.equal(plain.getItem(id).officialCampaignAcquisitionLinkVerified,false);
  const other=app.getItem(id);
  assert.deepEqual(other.officialCampaignNameCandidates,
    native.getItemCandidates(id).filter(x=>x.kind==='official_campaign_name_candidate'));
  assert.throws(()=>joinCurrentGameSources(app.database,{
    officialNameCandidates:{
      ...native,coverage:{...native.coverage,verifiedOnlineAcquisitionLinks:1}
    }
  }),/DB02_NAME_ONLY_SOURCE_REQUIRED/);
  for(const bad of [
    {officialCampaignNameCandidate:false},
    {officialCampaignKind:'invalid'},
    {officialCampaignId:'../owner-private'},
    {officialCampaignId:''},
    {officialCampaignNameCandidate:'yes'}
  ])assert.throws(()=>app.searchItems(bad),/DB00_PUBLIC_SEARCH_/);
});

test('official name-only search reuses already loaded DB-02 data without extra HTTP or shop price histories',async()=>{
  const calls=[];
  const app=await openPublicSharedGameSources('/Wand',async url=>{
    calls.push(url);return reader(url);
  });
  const original=calls.length;
  assert(original>0);
  const result=app.searchItems({officialCampaignNameCandidate:true,limit:2});
  assert(result.total>0);
  assert.equal(calls.length,original);
  const item=app.getItem(result.items[0].itemId);
  assert(item.officialCampaignNameCandidates.length>0);
  assert(!Object.hasOwn(item,'shopHistory'));
  assert(!Object.hasOwn(item,'reportedMoonstonePrice'));
  assert(!Object.hasOwn(item,'salePeriods'));
  assert.equal(item.officialCampaignAcquisitionLinkVerified,false);
});
