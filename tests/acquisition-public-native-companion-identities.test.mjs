import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {
  DB02_COMPANION_IDENTITIES_FILE,DB02_COMPANION_IDENTITIES_BYTES,
  DB02_COMPANION_IDENTITIES_SHA,DB02_COMPANION_ORIGINAL_SHA,
  loadPinnedNativeCompanionIdentities,hasPinnedCompanionIdentityEvidence,
  joinOfficialNativeCompanionNameCandidates
} from '../src/lib/acquisition/public-native-companion-identities.ts';
import {OFFICIAL_CAMPAIGNS} from '../src/lib/acquisition/official-campaigns.ts';
import {
  loadPinnedNativePetSourceCategories,DB02_PET_SOURCE_FILE
} from '../src/lib/acquisition/public-pet-source-categories.ts';

const SOURCE=readFileSync(new URL(
  '../static/acquisition/public/'+DB02_COMPANION_IDENTITIES_FILE,import.meta.url));
const PET_SOURCE=readFileSync(new URL(
  '../static/acquisition/public/'+DB02_PET_SOURCE_FILE,import.meta.url));
function localFetch({mutate=false,truncate=false,missing=false}={}){
  const calls=[];
  const fetcher=async url=>{
    calls.push(url);
    if(missing)return new Response('',{status:404});
    assert(url.startsWith('/Wand/acquisition/public/'));
    const file=url.slice('/Wand/acquisition/public/'.length);
    const bytes=file===DB02_COMPANION_IDENTITIES_FILE?
      Buffer.from(SOURCE):file===DB02_PET_SOURCE_FILE?
      Buffer.from(PET_SOURCE):null;
    assert(bytes,file);
    if(mutate)bytes[125]^=1;
    return new Response(truncate?bytes.subarray(0,-1):bytes,{status:200});
  };
  return {fetcher,calls};
}
test('original Steam 1.26.2 Companion source exposes exactly 394 distinct pinned Item ID/native name pairs',async()=>{
  assert.equal(SOURCE.byteLength,DB02_COMPANION_IDENTITIES_BYTES);
  assert.equal(createHash('sha256').update(SOURCE).digest('hex'),
    DB02_COMPANION_IDENTITIES_SHA);
  const raw=JSON.parse(SOURCE);
  assert.equal(raw.schema,'wand.db02.public-native-companion-identities@1');
  assert.equal(raw.source.sha256,DB02_COMPANION_ORIGINAL_SHA);
  assert.equal(raw.source.bytes,123360);
  assert.equal(raw.identities.length,394);
  assert.equal(new Set(raw.identities.map(x=>x[0])).size,394);
  assert.equal(new Set(raw.identities.map(x=>x[1])).size,394);
  const {fetcher,calls}=localFetch();
  const reader=await loadPinnedNativeCompanionIdentities('/Wand',fetcher);
  assert.equal(calls.length,1);
  assert(hasPinnedCompanionIdentityEvidence(reader));
  assert(!hasPinnedCompanionIdentityEvidence({...reader}));
  assert.equal(reader.originalSha256,DB02_COMPANION_ORIGINAL_SHA);
  assert.equal(reader.identities.length,394);
  assert.equal(reader.coverage.originalCompanionDefinitions,394);
  assert.equal(reader.coverage.distinctCompanionItemIds,394);
  assert.equal(reader.coverage.uniqueNativeNameKeys,394);
  assert.equal(reader.coverage.nativeLocalizationKeyPatternVerified,true);
  assert.equal(reader.coverage.specificCampaignLinksVerified,0);
  assert.equal(reader.coverage.translatedDisplayNamesVerified,false);
  assert.equal(reader.coverage.playerAcquisitionVerified,false);
  assert.equal(reader.listItemIds().length,394);
  assert(reader.identities.every((x,i)=>{
    assert.equal(reader.getItem(x.itemId),x);
    assert.equal(reader.getByNativeNameKey(x.nativeNameKey),x);
    assert.equal(x.sourceLocalizationNameKey,
      'Companion.'+x.nativeNameKey+'_DisplayName');
    assert.equal(x.originalSourceSha256,DB02_COMPANION_ORIGINAL_SHA);
    assert.equal(x.sourceDefinitionIdVerified,true);
    assert.equal(x.sourceNameKeyVerified,true);
    assert.equal(x.translatedDisplayNameVerified,false);
    assert.equal(x.specificCampaignLinkVerified,false);
    assert.equal(x.playerOwnershipVerified,false);
    assert(Object.isFrozen(x));
    return i===0||Number(reader.identities[i-1].itemId)<Number(x.itemId);
  }));
  assert(Object.isFrozen(reader)&&Object.isFrozen(reader.identities)&&
    Object.isFrozen(reader.coverage)&&Object.isFrozen(reader.listItemIds()));
  assert.equal(reader.getItem('99999999'),null);
  assert.equal(reader.getByNativeNameKey('Companion!Unknown'),null);
});
test('original Sakura and Pirate Crocodile Item IDs are verified as definitions, not campaign-proven rewards',async()=>{
  const {fetcher}=localFetch();
  const source=await loadPinnedNativeCompanionIdentities('/Wand',fetcher);
  const sakura=source.getByNativeNameKey('Expansion02!BabyDragon!SakuraDragon');
  const pirate=source.getByNativeNameKey('Crocodile!PirateCrocodile');
  assert(sakura&&pirate);
  assert.equal(sakura.itemId,'120000191');
  assert.equal(pirate.itemId,'120000249');
  assert.equal(sakura.sourceLocalizationNameKey,
    'Companion.Expansion02!BabyDragon!SakuraDragon_DisplayName');
  assert.equal(pirate.sourceLocalizationNameKey,
    'Companion.Crocodile!PirateCrocodile_DisplayName');
  const pet=await loadPinnedNativePetSourceCategories('/Wand',fetcher);
  assert.deepEqual(pet.getItemCategories('120000191'),['exclusive_promotion']);
  assert.deepEqual(pet.getItemCategories('120000249'),[]);
  // Missing explicit Pet.Source does not mean a code/Twitch reward is impossible.
  const joined=joinOfficialNativeCompanionNameCandidates(
    source,OFFICIAL_CAMPAIGNS
  );
  assert.equal(joined.schema,'wand.db02.official-native-companion-name-candidates@1');
  assert.equal(joined.coverage.semanticCandidateRelations,3);
  assert.equal(joined.coverage.distinctNativeCandidateItemIds,2);
  assert.equal(joined.coverage.officialNumericItemIdLinksVerified,0);
  assert.equal(joined.coverage.playerGrantsVerified,0);
  assert.equal(joined.coverage.nativeNameOnlyNotCampaignProof,true);
  const sakuraRow=joined.getCampaignCandidates('code:COMMUNITYCOMPANIONDRAGON2025');
  assert.deepEqual(sakuraRow.map(r=>r.itemId),['120000191']);
  const pirateOct=joined.getCampaignCandidates('twitch:2026-october-showcase');
  const pirateNov=joined.getCampaignCandidates('twitch:2026-keepsake-sea');
  assert.deepEqual(pirateOct.map(r=>r.itemId),['120000249']);
  assert.deepEqual(pirateNov.map(r=>r.itemId),['120000249']);
  assert.deepEqual(joined.getItemCandidates('120000191'),sakuraRow);
  assert.deepEqual(joined.getItemCandidates('120000249'),[...pirateOct,...pirateNov]);
  for(const row of [...sakuraRow,...pirateOct,...pirateNov]){
    assert.equal(row.evidence,'native_key_semantic_name_candidate_only');
    assert.equal(row.originalNativeItemIdVerified,true);
    assert.equal(row.originalNativeNameKeyVerified,true);
    assert.equal(row.officialCampaignRewardNameVerified,true);
    assert.equal(row.officialCampaignNumericItemIdLinkVerified,false);
    assert.equal(row.campaignGrantVerified,false);
    assert.equal(row.currentAvailabilityVerified,false);
    assert.equal(row.playerOwnershipVerified,false);
    assert(Object.isFrozen(row));
  }
  assert(Object.isFrozen(joined)&&Object.isFrozen(joined.coverage));
  assert.equal(joined.getItemCandidates(50000000).length,0);
  assert.equal(joined.getCampaignCandidates('code:UNKNOWN').length,0);
});
test('source corruption, forged object, and fabricated official reward links are rejected',async()=>{
  await assert.rejects(
    loadPinnedNativeCompanionIdentities('/Wand',localFetch({mutate:true}).fetcher),
    /DB02_COMPANION_IDENTITIES_SHA/);
  await assert.rejects(
    loadPinnedNativeCompanionIdentities('/Wand',localFetch({truncate:true}).fetcher),
    /DB02_COMPANION_IDENTITIES_BYTES/);
  await assert.rejects(
    loadPinnedNativeCompanionIdentities('/Wand',localFetch({missing:true}).fetcher),
    /DB02_COMPANION_IDENTITIES_FETCH/);
  await assert.rejects(
    loadPinnedNativeCompanionIdentities('/Wand/../unsafe',localFetch().fetcher),
    /DB02_COMPANION_IDENTITIES_INVALID_BASE_PATH/);
  const native=await loadPinnedNativeCompanionIdentities(
    '/Wand',localFetch().fetcher);
  assert.throws(()=>native.getByNativeNameKey('unsafe key'),
    /INVALID_NATIVE_KEY/);
  assert.throws(()=>native.getItem('0120000191'),/INVALID_ID/);
  assert.throws(()=>joinOfficialNativeCompanionNameCandidates({...native},
    OFFICIAL_CAMPAIGNS),/PINNED_ORIGINALS_REQUIRED/);
  assert.throws(()=>joinOfficialNativeCompanionNameCandidates(native,
    OFFICIAL_CAMPAIGNS.filter(c=>c.campaignId!=='twitch:2026-keepsake-sea')),
    /OFFICIAL_NAME_EVIDENCE_REQUIRED/);
  assert.throws(()=>joinOfficialNativeCompanionNameCandidates(native,
    OFFICIAL_CAMPAIGNS.map(c=>c.campaignId==='code:COMMUNITYCOMPANIONDRAGON2025'?
      {...c,rewards:c.rewards.map(r=>({...r,itemId:'120000191'}))}:c)),
    /OFFICIAL_NAME_EVIDENCE_REQUIRED/);
});
