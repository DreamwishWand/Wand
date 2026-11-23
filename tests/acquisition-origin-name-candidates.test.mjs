import test from 'node:test';
import assert from 'node:assert/strict';
import {OFFICIAL_CAMPAIGNS} from '../src/lib/acquisition/official-campaigns.ts';
import {matchOfficialCampaignRewardNames} from '../src/lib/acquisition/origin-name-candidates.ts';

test('Source-exact native DB-01 names may propose candidates but cannot verify campaign origin', async () => {
  const names = new Map([
    ['Round Rainbow Garden', [[40005840,'Round Rainbow Garden']]],
    ['Butterfly Tiara', [[50400271,'Butterfly Tiara']]],
    ['Gamer Chair', [[40000385,"Winner's Gamer Chair"],[40001607,'Gamer Chair']]]
  ]);
  const db01 = {
    source:{platform:'Steam',gameVersion:'1.26.2',privateOnly:true},
    async searchExactNames(name,locale) {
      assert.equal(locale,'en');
      return (names.get(name) ?? []).map(([itemId,value])=>({
        itemId,value,locale,evidence:'current_exact_locdb_join',baselineVersion:null
      }));
    }
  };
  const result=await matchOfficialCampaignRewardNames(OFFICIAL_CAMPAIGNS,db01);
  assert.equal(result.getSummary().examinedRewardNames,70);
  assert.equal(result.getSummary().exactlyMatchedNames,3);
  assert.equal(result.getSummary().unmatchedNames,67);
  assert.deepEqual(result.getCandidatesForItem('40005840').map(row=>row.rewardName),
    ['Round Rainbow Garden']);
  assert.equal(result.getCandidatesForItem(40001607).length,1);
  assert.equal(result.getCandidatesForItem(40000385).length,0);
  assert(result.getCandidatesForItem(50400271).every(r=>r.verifiedAcquisitionLink===false));
  assert.equal(result.verifiedAcquisitionLinks,0);
});

test('Reject unverified or cross-version DB-01 name sources', async () => {
  await assert.rejects(
    matchOfficialCampaignRewardNames(OFFICIAL_CAMPAIGNS,{
      source:{platform:'Steam',gameVersion:'1.26.1',privateOnly:true},
      searchExactNames:async()=>[]
    }),
    /DB02_NAME_CANDIDATE_VERIFIED_DB01_REQUIRED/
  );
});
