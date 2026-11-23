import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FESTIVAL_2024_COMMUNITY_REDEMPTION_CAMPAIGNS,
  FESTIVAL_2024_CODE_COVERAGE
} from '../src/lib/acquisition/community-festival-2024.ts';
import {OFFICIAL_CAMPAIGNS} from '../src/lib/acquisition/official-campaigns.ts';
import {createAcquisitionOriginDatabase} from '../src/lib/acquisition/origins.ts';

const OFFICIAL='https://disneydreamlightvalley.com/news/FestivalofFoolishness2024';
const ARCHIVE='https://dreamlightvalleywiki.com/Festival_of_Foolishness_(2024)';
const codes=[
  'FOFSOUFFLE24','FOFFISH24','FOFGEMS24','FOFSHARDS24',
  'FOFTHANKS24','FOFSNOW24','FOFPRANK24','FOFWORKOUT24','FOFFLOWERS24'
];

test('official 2024 event establishes nine historic codes; each exact reward mapping remains a separately attributed community report',()=>{
  const data=FESTIVAL_2024_COMMUNITY_REDEMPTION_CAMPAIGNS;
  assert.equal(FESTIVAL_2024_CODE_COVERAGE.officialEventCodeCount,9);
  assert.equal(FESTIVAL_2024_CODE_COVERAGE.communityArchivedCodeCount,9);
  assert.equal(FESTIVAL_2024_CODE_COVERAGE.communityArchivedRewardRows,20);
  assert.equal(FESTIVAL_2024_CODE_COVERAGE.officialArticleProvidedCodeTokens,0);
  assert.equal(FESTIVAL_2024_CODE_COVERAGE.officialArticleProvidedIndividualRewardNames,0);
  assert.equal(FESTIVAL_2024_CODE_COVERAGE.originalNumericItemIdGrantsVerified,0);
  assert.equal(data.length,9);
  assert.deepEqual(data.map(x=>x.code),codes);
  assert.equal(data.reduce((n,c)=>n+c.rewards.length,0),20);
  assert.equal(new Set(data.map(x=>x.campaignId)).size,9);
  for(const campaign of data){
    assert.equal(OFFICIAL_CAMPAIGNS.includes(campaign),true);
    assert.equal(campaign.kind,'redeem_code');
    assert.equal(campaign.window.start,'2024-07-16');
    assert.equal(campaign.window.endExclusive,null);
    assert.equal(campaign.source.kind,'official_publication');
    assert.equal(campaign.source.sourceUrl,OFFICIAL);
    assert.equal(campaign.source.sha256,null);
    assert.equal(campaign.availability,'not_live_verified');
    assert.deepEqual(campaign.communityArchiveEvidence,{
      evidence:'community_code_and_reward_mapping_for_official_event',
      archiveKind:'community_wiki',
      archiveUrl:ARCHIVE,checkedOn:'2026-11-23',
      officialArticleCodeCount:9,
      officialArticleProvidesCodeTokens:false,
      officialArticleProvidesRewardNames:false,
      officialExpirationDate:'2024-08-16',
      exactExpiryInstantVerified:false,nativeRewardItemIdVerified:false,
      actualRewardGrantedVerified:false
    });
    assert(campaign.rewards.every(row=>row.itemId===null &&
      row.quantity>0&&row.cumulativeWatchMinutes===null));
    assert(campaign.conditions.some(x=>x.includes('time-limited distribution route')));
    assert(Object.isFrozen(campaign));
    assert(Object.isFrozen(campaign.rewards));
    assert(Object.isFrozen(campaign.communityArchiveEvidence));
    assert(Object.isFrozen(campaign.source));
  }
  const ledger=createAcquisitionOriginDatabase([],OFFICIAL_CAMPAIGNS);
  assert.equal(ledger.getCoverage().rewardNamesAwaitingItemId,90);
  assert.equal(ledger.listLinkedItemIds().length,0);
  assert.equal(ledger.getItem('30000001').origins.length,0);
  assert(ledger.getCampaign('code:FOFSOUFFLE24')===data[0]);
  assert.equal(ledger.getCampaign('code:FOFTHANKS24').rewards[0].quantity,150);
  assert.equal(ledger.getCampaign('code:FOFPRANK24').rewards[0].quantity,150);
  assert.deepEqual(ledger.getCampaign('code:FOFFLOWERS24').rewards.map(r=>r.quantity),[5,5,5,5,5]);
});

test('community archive cannot silently become official, a confirmed numeric link, or a precise expiry instant',()=>{
  const base=FESTIVAL_2024_COMMUNITY_REDEMPTION_CAMPAIGNS[0];
  const expectRejected=(changed,code='CAMPAIGN_COMMUNITY_REWARD_PROVENANCE')=>
    assert.throws(()=>createAcquisitionOriginDatabase([],[changed]),
      new RegExp('DB02_ORIGINS_'+code));
  expectRejected({...base,communityArchiveEvidence:{
    ...base.communityArchiveEvidence,archiveUrl:'https://example.org/fake'
  }});
  expectRejected({...base,communityArchiveEvidence:{
    ...base.communityArchiveEvidence,officialArticleProvidesRewardNames:true
  }});
  expectRejected({...base,communityArchiveEvidence:{
    ...base.communityArchiveEvidence,nativeRewardItemIdVerified:true
  }});
  expectRejected({...base,communityArchiveEvidence:{
    ...base.communityArchiveEvidence,actualRewardGrantedVerified:true
  }});
  expectRejected({...base,communityArchiveEvidence:{
    ...base.communityArchiveEvidence,exactExpiryInstantVerified:true
  }});
  expectRejected({...base,window:{
    ...base.window,endExclusive:'2024-08-16T06:00:00Z'
  }});
  expectRejected({...base,source:{
    ...base.source,sourceUrl:ARCHIVE
  }});
  expectRejected({...base,rewards:[{
    ...base.rewards[0],itemId:'30000001'
  }]});
  expectRejected({...base,codeEvidence:{
    evidence:'community_code_report_official_reward_announcement',
    codeSourceKind:'community_wiki',
    codeSourceUrl:'https://dreamlightvalleywiki.com/Redemption_Codes',
    checkedOn:'2026-11-23',
    officialArticleContainsReadableCode:false,
    nativeRewardItemIdVerified:false
  }});
});
