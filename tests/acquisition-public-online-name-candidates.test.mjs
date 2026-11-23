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
    OFFICIAL_CAMPAIGNS.filter(c=>!c.communityArchiveEvidence)
      .reduce((count,c)=>count+c.rewards.filter(r=>r.itemId===null).length,0));
  assert.equal(result.coverage.examinedOfficialRewardNames,
    result.coverage.uniquelyMatchedOfficialRewards+
    result.coverage.ambiguousOfficialRewards+result.coverage.unmatchedOfficialRewards);
  assert(Object.isFrozen(result.getCampaignCandidates('twitch:2023-launch')));
  assert(OFFICIAL_CAMPAIGNS.every(c=>c.rewards.every(r=>r.itemId===null)));
});
test('Official 2023/2024 Pride codes resolve 40 distinct public native Item ID name candidates, not verified code grants',()=>{
  const indexed=indexPublicOnlineNameCandidates(
    actualPublishedDb00(),OFFICIAL_CAMPAIGNS,[]
  );
  const rows=[
    ['Gleam','PRIDE20231','PRIDEGLEAM24','50000381','40002842','40002951','50400170','40002856'],
    ['Illuminate','PRIDE20232','PRIDEILLUMINATE24','50000379','40002948','40002949','50400172','40002950'],
    ['Shine','PRIDE20233','PRIDESHINE24','50000384','40002868','40002881','50400175','40002857'],
    ['Shimmer','PRIDE20234','PRIDESHIMMER24','50000378','40002869','40002879','50400174','40002855'],
    ['Glow','PRIDE20235','PRIDEGLOW24','50000380','40002870','40002880','50400171','40002865'],
    ['Radiate','PRIDE20236','PRIDERADIATE24','50000382','40002843','40002878','50400173','40002854'],
    ['Bright','PRIDE20237','PRIDEBRIGHT24','50000385','40002841','40002877','50400168','40002867'],
    ['Dazzle','PRIDE20238','PRIDEDAZZLE24','50000383','40002947','40002876','50400169','40002866']
  ];
  const itemIds=[];
  for(const [shade,oldCode,newCode,tee,arch,bouquet,ears,bucket] of rows){
    const old=indexed.getCampaignRewardResolution('code:'+oldCode);
    const newer=indexed.getCampaignRewardResolution('code:'+newCode);
    assert(old&&newer);
    assert.equal(old.campaignKind,'redeem_code');
    assert.equal(newer.campaignKind,'redeem_code');
    assert.equal(old.officialSourceUrl,'https://disneydreamlightvalley.com/news/Pride-2023');
    assert.equal(newer.officialSourceUrl,'https://disneydreamlightvalley.com/news/Pride-2024');
    assert.deepEqual(old.rewards.map(r=>r.name),['Pride — '+shade+' Tee']);
    assert.deepEqual(newer.rewards.map(r=>r.name),[
      shade+' Balloon Arch',shade+' Balloon Bouquet',
      shade+' Ears Headband',shade+' Popcorn Bucket'
    ]);
    assert.deepEqual(old.rewards.map(r=>r.nameCandidateItemIds),[[tee]]);
    assert.deepEqual(newer.rewards.map(r=>r.nameCandidateItemIds),
      [[arch],[bouquet],[ears],[bucket]]);
    const candidates=[
      ...indexed.getCampaignCandidates('code:'+oldCode),
      ...indexed.getCampaignCandidates('code:'+newCode)
    ];
    assert.equal(candidates.length,5);
    assert.deepEqual(candidates.map(r=>r.itemId),[tee,arch,bouquet,ears,bucket]);
    assert(candidates.every(c=>c.evidence==='exact_published_db00_en_name_only'&&
      c.acquisitionLinkVerified===false&&c.actualRewardGrantedVerified===false&&
      c.currentAvailabilityVerified===false&&c.accountOwnershipVerified===false));
    assert(old.rewards.every(r=>r.acquisitionLinkVerified===false&&
      r.claimedByPlayerVerified===false));
    assert(newer.rewards.every(r=>r.acquisitionLinkVerified===false&&
      r.claimedByPlayerVerified===false));
    itemIds.push(tee,arch,bouquet,ears,bucket);
  }
  assert.equal(itemIds.length,40);
  assert.equal(new Set(itemIds).size,40);
  assert.equal(OFFICIAL_CAMPAIGNS.filter(x=>x.campaignId.startsWith('code:PRIDE2023')).length,8);
  assert.equal(OFFICIAL_CAMPAIGNS.filter(x=>/^code:PRIDE[A-Z]+24$/.test(x.campaignId)).length,8);
  assert(OFFICIAL_CAMPAIGNS.filter(x=>x.campaignId.startsWith('code:PRIDE'))
    .every(x=>x.rewards.every(r=>r.itemId===null)));
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
    result.coverage.uniquelyMatchedOfficialRewards+
    result.coverage.uniquelyMatchedCommunityCampaignRewards);
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

test('Official campaign reward browser retains every unresolved name and never turns exact matches into confirmed acquisition',()=>{
  const index=indexPublicOnlineNameCandidates(
    actualPublishedDb00(),OFFICIAL_CAMPAIGNS,historicalPremiumShop.offers
  );
  const all=index.listCampaignRewardResolutions();
  assert.equal(all.length,OFFICIAL_CAMPAIGNS.length);
  assert(Object.isFrozen(all));
  assert(all.every(c=>c.acquisitionLinksVerified===false&&
    Object.isFrozen(c)&&Object.isFrozen(c.rewards)));
  const code=index.getCampaignRewardResolution('code:DDVPRIDE2026');
  assert(code);
  assert.equal(code.campaignKind,'redeem_code');
  assert.equal(code.rewards.length,2);
  assert.deepEqual(code.rewards.map(r=>r.nameCandidateItemIds),[
    ['40005840'],['50400271']
  ]);
  assert(code.rewards.every(r=>
    r.match==='unique_name_candidate'&&
    r.sourceSuppliedItemId===null&&
    r.acquisitionLinkVerified===false&&
    r.claimedByPlayerVerified===false&&
    Object.isFrozen(r)&&Object.isFrozen(r.nameCandidateItemIds)
  ));
  assert.equal(index.getCampaignRewardResolution(code.campaignId),code);
  assert.equal(index.getCampaignRewardResolution('missing:campaign'),null);
  const twitch=index.listCampaignRewardResolutions('twitch_drop');
  assert.equal(twitch.length,3);
  assert(Object.isFrozen(twitch));
  const first=twitch.find(c=>c.campaignId==='twitch:2023-launch');
  assert(first);
  assert.equal(first.rewards.length,4);
  assert.deepEqual(first.rewards.map(r=>r.nameCandidateItemIds),[
    ['50400102'],['40001607'],['40001609'],['50700124']
  ]);
  const onlyCodes=index.listCampaignRewardResolutions('redeem_code');
  assert.equal(onlyCodes.length,29);
  assert(onlyCodes.includes(code));
  assert.equal(onlyCodes.filter(x=>x.campaignId.startsWith('code:PRIDE2023')).length,8);
  assert.equal(onlyCodes.filter(x=>/^code:PRIDE[A-Z]+24$/.test(x.campaignId)).length,8);
  assert(onlyCodes.every(x=>x.acquisitionLinksVerified===false));
  assert.deepEqual(index.listCampaignRewardResolutions('gift'),[]);
  assert(all.every(c=>c.rewards.every(r=>
    r.match==='source_supplied_id_unverified' ||
    r.match==='unique_name_candidate' ||
    r.match==='ambiguous_name_candidates' ||
    r.match==='not_found_in_published_db00'
  )));
  assert.throws(()=>index.listCampaignRewardResolutions('not_a_kind'),
    /INVALID_CAMPAIGN_KIND/);
  assert.throws(()=>index.getCampaignRewardResolution('../private'),
    /INVALID_CAMPAIGN_ID/);
});

test('Ambiguous English names preserve multiple candidate Item IDs in reward resolution without verifying a source link',()=>{
  const snapshot=actualPublishedDb00();
  const last=snapshot.items.at(-1);
  const ambiguous={...snapshot,items:[
    ...snapshot.items.slice(0,-1),
    {...last,names:{...last.names,en:'Gamer Chair'}}
  ]};
  const index=indexPublicOnlineNameCandidates(
    ambiguous,OFFICIAL_CAMPAIGNS,[]
  );
  const resolution=index.getCampaignRewardResolution('twitch:2023-launch');
  const chair=resolution?.rewards.find(r=>r.name==='Gamer Chair');
  assert(chair);
  assert.equal(chair.match,'ambiguous_name_candidates');
  assert.equal(chair.nameCandidateItemIds.length,2);
  assert(chair.nameCandidateItemIds.includes('40001607'));
  assert(chair.nameCandidateItemIds.includes(String(last.id)));
  assert.equal(chair.acquisitionLinkVerified,false);
  assert.equal(index.getCampaignCandidates('twitch:2023-launch')
    .some(r=>r.rewardName==='Gamer Chair'),false);
});


test('2024 community-archived festival rewards are name candidates only, never official numeric grants',()=>{
  const index=indexPublicOnlineNameCandidates(
    actualPublishedDb00(),OFFICIAL_CAMPAIGNS,[]
  );
  assert.equal(index.coverage.examinedOfficialRewardNames,70);
  assert.equal(index.coverage.examinedCommunityCampaignRewardNames,20);
  assert.equal(
    index.coverage.examinedCommunityCampaignRewardNames,
    index.coverage.uniquelyMatchedCommunityCampaignRewards+
    index.coverage.ambiguousCommunityCampaignRewards+
    index.coverage.unmatchedCommunityCampaignRewards
  );
  const festival=index.listCampaignRewardResolutions('redeem_code').filter(
    c=>c.campaignId.startsWith('code:FOF')
  );
  assert.equal(festival.length,9);
  assert.equal(festival.reduce((n,c)=>n+c.rewards.length,0),20);
  const byCode=index.getCampaignRewardResolution('code:FOFGEMS24');
  assert(byCode);
  assert.equal(byCode.rewardMappingEvidence,'community_archive_report_only');
  assert.equal(byCode.officialSourceUrl,
    'https://disneydreamlightvalley.com/news/FestivalofFoolishness2024');
  assert.equal(byCode.rewardSourceUrl,
    'https://dreamlightvalleywiki.com/Festival_of_Foolishness_(2024)');
  assert.deepEqual(byCode.rewards.map(x=>x.name),['Diamond','Ruby','Sapphire']);
  assert(byCode.rewards.every(x=>x.sourceSuppliedItemId===null&&
    x.acquisitionLinkVerified===false&&x.claimedByPlayerVerified===false));
  const matched=index.getCampaignCandidates('code:FOFGEMS24');
  assert(matched.length>0);
  assert(matched.every(x=>
    x.kind==='community_campaign_name_candidate'&&
    x.rewardMappingEvidence==='community_archive_report_only'&&
    x.rewardSourceUrl===byCode.rewardSourceUrl&&
    x.officialSourceUrl===byCode.officialSourceUrl&&
    x.evidence==='exact_published_db00_en_name_only'&&
    x.acquisitionLinkVerified===false&&
    x.actualRewardGrantedVerified===false&&
    x.accountOwnershipVerified===false));
  const official=index.getCampaignCandidates('code:DDVPRIDE2026');
  assert(official.length>0);
  assert(official.every(x=>x.kind==='official_campaign_name_candidate'&&
    x.rewardMappingEvidence==='official_article_reward_text'&&
    x.rewardSourceUrl===x.officialSourceUrl));
  const forged=OFFICIAL_CAMPAIGNS.map(c=>c.campaignId!=='code:FOFGEMS24'?c:{
    ...c,communityArchiveEvidence:{
      ...c.communityArchiveEvidence,
      officialArticleProvidesRewardNames:true
    }
  });
  assert.throws(
    ()=>indexPublicOnlineNameCandidates(actualPublishedDb00(),forged,[]),
    /DB02_PUBLIC_NAME_COMMUNITY_REWARD_PROVENANCE/
  );
});
