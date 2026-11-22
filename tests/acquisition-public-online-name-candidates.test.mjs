import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {OFFICIAL_CAMPAIGNS} from '../src/lib/acquisition/official-campaigns.ts';
import {historicalPremiumShop} from '../src/lib/acquisition/premium-shop-history.ts';
import {
  DB02_PUBLIC_NAME_CANDIDATE_SCHEMA,indexPublicOnlineNameCandidates,
  loadPublishedOnlineNameCandidates
} from '../src/lib/acquisition/public-online-name-candidates.ts';

const ROOT=new URL('../static/ddv/game-db/releases/steam-1.26.2-native-itemlist-v1/',import.meta.url);

function actualPublishedDb00(){
  const manifest=JSON.parse(readFileSync(new URL('index.json',ROOT),'utf8'));
  const items=[];
  let offset=0;
  for(const shard of manifest.shards){
    const bytes=readFileSync(new URL(shard.file,ROOT));
    assert.equal(bytes.length,shard.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),shard.sha256);
    const payload=JSON.parse(bytes.toString('utf8'));
    assert.equal(payload.offset,offset);
    assert.equal(payload.items.length,shard.count);
    items.push(...payload.items);
    offset+=shard.count;
  }
  assert.equal(manifest.shards.length,14);
  assert.equal(items.length,13202);
  return {
    kind:'db_snapshot',id:manifest.id,target:manifest.target,
    coverage:manifest.coverage,items
  };
}
test('Public Steam 1.26.2 DB-00 reveals concrete Twitch Drops and code reward name candidates without private DB-01',()=>{
  const snapshot=actualPublishedDb00();
  const result=indexPublicOnlineNameCandidates(
    snapshot,OFFICIAL_CAMPAIGNS,historicalPremiumShop.offers
  );
  assert.equal(result.schema,DB02_PUBLIC_NAME_CANDIDATE_SCHEMA);
  assert.equal(result.coverage.publishedItemDefinitions,13202);
  assert.equal(result.coverage.verifiedOnlineAcquisitionLinks,0);
  assert.equal(result.coverage.verifiedNativeShopOfferIds,0);
  const expected=[
    ['Gamer Mickey Ears Headband','50400102','twitch:2023-launch'],
    ['Gamer Chair','40001607','twitch:2023-launch'],
    ['Gamer Laptop','40001609','twitch:2023-launch'],
    ['Comfy Gamer Hoodie','50700124','twitch:2023-launch'],
    ['Round Rainbow Garden','40005840','code:DDVPRIDE2026'],
    ['Butterfly Tiara','50400271','code:DDVPRIDE2026']
  ];
  for(const [name,itemId,campaignId] of expected){
    const row=result.getCampaignCandidates(campaignId)
      .find(c=>c.rewardName===name);
    assert.equal(row?.itemId,itemId,name);
    assert.equal(row?.kind,'official_campaign_name_candidate');
    assert.equal(row?.evidence,'exact_published_db00_en_name_only');
    assert.equal(row?.acquisitionLinkVerified,false);
    assert.equal(row?.currentAvailabilityVerified,false);
    assert.equal(row?.accountOwnershipVerified,false);
    assert.equal(row?.actualRewardGrantedVerified,false);
    assert(Object.isFrozen(row));
    assert(result.getItemCandidates(itemId).includes(row));
  }
  assert.equal(result.getCampaignCandidates('twitch:2023-launch').length,4);
  assert.equal(result.getCampaignCandidates('code:DDVPRIDE2026').length,2);
  assert(result.coverage.uniquelyMatchedOfficialRewards>=6);
  assert.equal(result.coverage.examinedOfficialRewardNames,
    OFFICIAL_CAMPAIGNS.reduce((count,c)=>count+c.rewards.filter(r=>r.itemId===null).length,0));
  assert.equal(result.coverage.examinedOfficialRewardNames,
    result.coverage.uniquelyMatchedOfficialRewards+
    result.coverage.ambiguousOfficialRewards+result.coverage.unmatchedOfficialRewards);
  assert(Object.isFrozen(result.getCampaignCandidates('twitch:2023-launch')));
  assert(OFFICIAL_CAMPAIGNS.every(c=>c.rewards.every(r=>r.itemId===null)));
});
test('Community Premium Shop name matches retain week, price and uncertainty without inventing native offers',()=>{
  const result=indexPublicOnlineNameCandidates(
    actualPublishedDb00(),OFFICIAL_CAMPAIGNS,historicalPremiumShop.offers
  );
  assert.equal(result.coverage.examinedCommunityShopComponentRows,
    historicalPremiumShop.offers.reduce((n,a)=>n+a.contents.length,0));
  assert.equal(result.coverage.examinedCommunityShopComponentRows,
    result.coverage.uniquelyMatchedCommunityShopComponents+
    result.coverage.ambiguousCommunityShopComponents+
    result.coverage.unmatchedCommunityShopComponents);
  for(const appearance of historicalPremiumShop.offers){
    for(const row of result.getShopAppearanceCandidates(appearance.appearanceId)){
      assert.equal(row.kind,'community_premium_shop_name_candidate');
      assert.equal(row.reportedMoonstonePrice,appearance.moonstonePrice);
      assert.equal(row.weekStart,appearance.saleStart);
      assert.equal(row.weekEndExclusive,appearance.saleEndExclusive);
      assert.equal(row.sourceUrl,'https://dreamlightvalleywiki.com/Premium_Shop/2026');
      assert.equal(row.priceAndContentsEvidence,'community_archive_only');
      assert.equal(row.acquisitionLinkVerified,false);
      assert.equal(row.nativeOfferIdVerified,false);
      assert.equal(row.currentAvailabilityVerified,false);
      assert(result.getShopProductCandidates(appearance.productName).includes(row));
      assert(result.getItemCandidates(row.itemId).includes(row));
    }
  }
  assert(result.coverage.uniquelyMatchedCommunityShopComponents>0);
  const verifiedNameOnly=result.getShopProductCandidates('Enchanted Ice Fountain');
  assert.deepEqual(verifiedNameOnly.map(c=>[c.itemId,c.weekStart]),[
    ['40001849','2026-11-11'],['40001849','2026-09-16']
  ]);
  assert(result.getItemCandidates('40001849').every(c=>
    c.acquisitionLinkVerified===false&&c.currentAvailabilityVerified===false));
  assert(result.getShopAppearanceCandidates('2026-11-11/ballerina-ensemble')
    .some(c=>c.itemId==='50900411'&&c.componentName==='Ballerina Dress'));
  assert.equal(result.coverage.totalCandidateRelations,
    result.coverage.uniquelyMatchedCommunityShopComponents+
    result.coverage.uniquelyMatchedOfficialRewards);
  assert.equal(result.coverage.distinctCandidateItemIds,
    new Set([
      ...result.getCampaignCandidates('twitch:2023-launch').map(r=>r.itemId),
      ...result.getCampaignCandidates('code:DDVPRIDE2026').map(r=>r.itemId),
      ...historicalPremiumShop.offers.flatMap(a=>
        result.getShopAppearanceCandidates(a.appearanceId).map(r=>r.itemId)),
      ...OFFICIAL_CAMPAIGNS.flatMap(c=>
        result.getCampaignCandidates(c.campaignId).map(r=>r.itemId))
    ]).size);
});
test('Ambiguous exact names are not promoted; mismatched or duplicate public releases fail closed',()=>{
  const snapshot=actualPublishedDb00();
  const last=snapshot.items.at(-1);
  assert.notEqual(last.id,'40001607');
  const duplicateName={...snapshot,items:[
    ...snapshot.items.slice(0,-1),
    {...last,names:{...last.names,en:'Gamer Chair'}}
  ]};
  const index=indexPublicOnlineNameCandidates(
    duplicateName,OFFICIAL_CAMPAIGNS,[]
  );
  assert.equal(index.getCampaignCandidates('twitch:2023-launch')
    .some(x=>x.rewardName==='Gamer Chair'),false);
  assert(index.coverage.ambiguousOfficialRewards>=1);
  assert(index.coverage.ambiguousEnglishLabels>=1);
  assert.throws(()=>index.getItemCandidates('00040001607'),/INVALID_ITEM_ID/);
  assert.throws(()=>indexPublicOnlineNameCandidates(
    {...snapshot,target:{...snapshot.target,gameVersion:'1.26.1'}},
    OFFICIAL_CAMPAIGNS,[]
  ),/EXACT_CURRENT_PUBLIC_DB00_REQUIRED/);
  assert.throws(()=>indexPublicOnlineNameCandidates(
    {...snapshot,items:[...snapshot.items.slice(0,-1),snapshot.items[0]]},
    OFFICIAL_CAMPAIGNS,[]
  ),/DUPLICATE_DB00_ID/);
  assert.throws(()=>indexPublicOnlineNameCandidates(snapshot,OFFICIAL_CAMPAIGNS,
    [{...historicalPremiumShop.offers[0],nativeOfferId:'fabricated'}]
  ),/INVALID_SHOP_APPEARANCE/);
});

test('Public-only browser entrypoint independently hashes the active DB-00 release, without requiring SRC-02',async()=>{
  let requests=0;
  const base=new URL('../static/',import.meta.url);
  const localFetch=async url=>{
    assert(url.startsWith('/Wand/ddv/game-db/'),url);
    requests++;
    const raw=readFileSync(new URL(url.slice('/Wand/'.length),base));
    return new Response(raw,{status:200});
  };
  const index=await loadPublishedOnlineNameCandidates('/Wand',localFetch);
  assert.equal(requests,16); // active pointer + release index + 14 SHA-checked item shards
  assert.equal(index.getCampaignCandidates('code:DDVPRIDE2026').length,2);
  assert.equal(index.getCampaignCandidates('twitch:2023-launch').length,4);
  assert.equal(index.getShopProductCandidates('Enchanted Ice Fountain').length,2);
  assert.equal(index.coverage.verifiedOnlineAcquisitionLinks,0);
});
