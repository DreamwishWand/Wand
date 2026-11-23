import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {OFFICIAL_CAMPAIGNS} from '../src/lib/acquisition/official-campaigns.ts';
import {ADDITIONAL_REDEMPTION_CAMPAIGNS,
  ADDITIONAL_REDEMPTION_COVERAGE} from '../src/lib/acquisition/official-additional-redemption.ts';
import {createAcquisitionOriginDatabase} from '../src/lib/acquisition/origins.ts';
import {indexPublicOnlineNameCandidates}
  from '../src/lib/acquisition/public-online-name-candidates.ts';

const ROOT=new URL(
  '../static/ddv/game-db/releases/steam-1.26.2-native-itemlist-v1/',import.meta.url
);
function pinnedPublicDb00(){
  const manifest=JSON.parse(readFileSync(new URL('index.json',ROOT),'utf8'));
  const items=[];
  let offset=0;
  for(const shard of manifest.shards){
    const bytes=readFileSync(new URL(shard.file,ROOT));
    assert.equal(bytes.length,shard.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),shard.sha256);
    const row=JSON.parse(bytes);
    assert.equal(row.offset,offset);
    assert.equal(row.count,shard.count);
    items.push(...row.items);
    offset+=row.count;
  }
  assert.equal(items.length,13202);
  return {kind:'db_snapshot',id:manifest.id,target:manifest.target,
    coverage:manifest.coverage,items};
}
test('two original official codes and one explicitly community-corroborated code are never conflated',()=>{
  assert.equal(ADDITIONAL_REDEMPTION_COVERAGE.officialExplicitCodeCampaigns,2);
  assert.equal(ADDITIONAL_REDEMPTION_COVERAGE.communityCorroboratedCodeCampaigns,1);
  assert.equal(ADDITIONAL_REDEMPTION_COVERAGE.totalCampaigns,3);
  assert.equal(ADDITIONAL_REDEMPTION_COVERAGE.officiallyDescribedRewardRows,6);
  assert.equal(ADDITIONAL_REDEMPTION_COVERAGE.officialNumericItemIdLinks,0);
  assert.equal(ADDITIONAL_REDEMPTION_CAMPAIGNS.length,3);
  const byCode=new Map(ADDITIONAL_REDEMPTION_CAMPAIGNS.map(c=>[c.code,c]));
  assert.equal(byCode.size,3);
  assert.equal(OFFICIAL_CAMPAIGNS.filter(c=>byCode.has(c.code)).length,3);
  const boo=byCode.get('DDV2024OOOOO');
  assert(boo);
  assert.equal(boo.code?.slice(-5),'OOOOO');
  assert.equal(boo.codeEvidence,undefined);
  assert.equal(boo.window.start,'2024-10-09');
  assert.equal(boo.window.endExclusive,'2024-11-20T14:00:00Z');
  assert.equal(boo.source.sourceUrl,
    'https://disneydreamlightvalley.com/ja/news/JungleGetawayUpdate');
  assert.deepEqual(boo.rewards.map(r=>r.name),['Mickey BOO! Loungefly Backpack']);
  assert(boo.conditions.some(s=>s.includes('five trailing letter O')));
  const dragon=byCode.get('COMMUNITYCOMPANIONDRAGON2025');
  assert(dragon);
  assert.equal(dragon.window.start,'2025-12-10');
  assert.equal(dragon.window.endExclusive,null);
  assert.equal(dragon.source.sourceUrl,
    'https://disneydreamlightvalley.com/ja/news/update-dec-10-2025');
  assert.deepEqual(dragon.rewards.map(r=>r.name),
    ['Sakura Blossom Dragon Companion']);
  assert.equal(dragon.codeEvidence,undefined);
  const pride=byCode.get('DDVPRIDE25');
  assert(pride);
  assert.equal(pride.window.start,'2025-06-20');
  assert.equal(pride.window.endExclusive,null);
  assert.equal(pride.source.sourceUrl,
    'https://disneydreamlightvalley.com/news/Pride2025');
  assert.deepEqual(pride.rewards.map(r=>r.name),[
    'Joy and Rainbows Sweater','Joy and Rainbows Umbrella',
    'Gleam Festive Pennants',
    'Pride 2025 Photo Mode Frame (official name unspecified)'
  ]);
  assert.deepEqual(pride.codeEvidence,{
    evidence:'community_code_report_official_reward_announcement',
    codeSourceKind:'community_wiki',
    codeSourceUrl:'https://dreamlightvalleywiki.com/Redemption_Codes',
    checkedOn:'2026-11-23',
    officialArticleContainsReadableCode:false,
    nativeRewardItemIdVerified:false
  });
  assert(ADDITIONAL_REDEMPTION_CAMPAIGNS.every(c=>
    c.kind==='redeem_code'&&c.availability==='not_live_verified'&&
    c.rewards.every(r=>r.itemId===null&&r.quantity===1)&&
    Object.isFrozen(c)&&Object.isFrozen(c.rewards)&&Object.isFrozen(c.source)));
  assert.equal(OFFICIAL_CAMPAIGNS.filter(c=>c.kind==='redeem_code').length,20);
  const ledger=createAcquisitionOriginDatabase([],OFFICIAL_CAMPAIGNS);
  assert.equal(ledger.getCoverage().rewardNamesAwaitingItemId,70);
  assert.equal(ledger.getCampaign('code:DDV2024OOOOO')?.code,boo.code);
  assert.equal(ledger.getCampaign('code:COMMUNITYCOMPANIONDRAGON2025')?.code,
    dragon.code);
  assert.equal(ledger.getCampaign('code:DDVPRIDE25')?.codeEvidence,pride.codeEvidence);
  assert.equal(ledger.listLinkedItemIds().length,0);
  assert.equal(ledger.getItem(50800092).origins.length,0);
});
test('independently SHA-pinned DB-00 supports two exact Item names; not an official campaign Item ID',()=>{
  const snapshot=pinnedPublicDb00();
  const candidateIndex=indexPublicOnlineNameCandidates(
    snapshot,OFFICIAL_CAMPAIGNS,[]
  );
  const boo=candidateIndex.getCampaignRewardResolution('code:DDV2024OOOOO');
  assert(boo);
  assert.equal(boo.rewards.length,1);
  assert.deepEqual(boo.rewards[0].nameCandidateItemIds,['50800092']);
  assert.equal(boo.rewards[0].match,'unique_name_candidate');
  const sweater=candidateIndex.getCampaignRewardResolution('code:DDVPRIDE25');
  assert(sweater);
  assert.equal(sweater.rewards.length,4);
  assert.deepEqual(sweater.rewards.map(r=>r.nameCandidateItemIds),
    [['50700199'],[],[],[]]);
  assert.deepEqual(sweater.rewards.map(r=>r.match),[
    'unique_name_candidate','not_found_in_published_db00',
    'not_found_in_published_db00','not_found_in_published_db00'
  ]);
  const dragon=candidateIndex.getCampaignRewardResolution(
    'code:COMMUNITYCOMPANIONDRAGON2025');
  assert(dragon);
  assert.equal(dragon.rewards.length,1);
  assert.deepEqual(dragon.rewards[0].nameCandidateItemIds,[]);
  assert.equal(dragon.rewards[0].match,'not_found_in_published_db00');
  for(const id of ['50800092','50700199']){
    const rows=candidateIndex.getItemCandidates(id).filter(
      r=>r.kind==='official_campaign_name_candidate'&&
      ['code:DDV2024OOOOO','code:DDVPRIDE25'].includes(r.campaignId));
    assert.equal(rows.length,1);
    assert.equal(rows[0].acquisitionLinkVerified,false);
    assert.equal(rows[0].actualRewardGrantedVerified,false);
    assert.equal(rows[0].currentAvailabilityVerified,false);
    assert.equal(rows[0].accountOwnershipVerified,false);
  }
  assert.equal(candidateIndex.coverage.verifiedOnlineAcquisitionLinks,0);
  assert.equal(candidateIndex.getCampaignCandidates('code:COMMUNITYCOMPANIONDRAGON2025').length,0);
  assert.equal(candidateIndex.getCampaignCandidates('code:DDV2024OOOOO').length,1);
  assert.equal(candidateIndex.getCampaignCandidates('code:DDVPRIDE25').length,1);
});
test('misrepresenting community code as official proof is rejected by shared acquisition ledger',()=>{
  const pride=ADDITIONAL_REDEMPTION_CAMPAIGNS[2];
  assert(pride.codeEvidence);
  const changed=(codeEvidence)=>({
    ...pride,codeEvidence
  });
  for(const malformed of [
    {...pride.codeEvidence,officialArticleContainsReadableCode:true},
    {...pride.codeEvidence,nativeRewardItemIdVerified:true},
    {...pride.codeEvidence,codeSourceKind:'official_publication'},
    {...pride.codeEvidence,codeSourceUrl:'https://example.org/forged'},
    {...pride.codeEvidence,checkedOn:'2026-99-99X'}
  ]){
    assert.throws(()=>createAcquisitionOriginDatabase([],[
      changed(malformed)
    ]),/DB02_ORIGINS_CAMPAIGN_CODE_PROVENANCE/);
  }
  assert.throws(()=>createAcquisitionOriginDatabase([],[
    {...pride,code:null}
  ]),/DB02_ORIGINS_CAMPAIGN_CODE_PROVENANCE|DB02_ORIGINS_CAMPAIGN/);
});
