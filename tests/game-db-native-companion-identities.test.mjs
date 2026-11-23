import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openPublicSharedGameSources}
  from '../src/lib/game-db/public-sources.ts';
import {
  createDb00CompanionIdentityReader,
  DB00_NATIVE_COMPANION_IDENTITY_CONTRACT
} from '../src/lib/game-db/native-companion-identities.ts';

const ROOT=new URL('../static/',import.meta.url);
const IDENTITY_FILE='native-companion-identities-1.26.2.json';
const PET_FILE='pet-source-categories-1.26.2.json';
function local({corruptIdentity=false,missingIdentity=false}={}){
  const requests=[];
  const fetcher=async url=>{
    assert(typeof url==='string'&&url.startsWith('/Wand/')&&
      !url.includes('..'));
    requests.push(url);
    if(missingIdentity&&url.endsWith('/'+IDENTITY_FILE))
      return new Response('not found',{status:404});
    let bytes;
    try{bytes=readFileSync(new URL(url.slice(6),ROOT));}
    catch{return new Response('not found',{status:404});}
    if(corruptIdentity&&url.endsWith('/'+IDENTITY_FILE)){
      bytes=Buffer.from(bytes);bytes[97]^=1;
    }
    return new Response(bytes,{status:200});
  };
  return {requests,fetcher};
}
let shared;
const open=()=>shared??=openPublicSharedGameSources('/Wand',local().fetcher);

test('DB-00 original Companion 394 identity join loads exactly two optional SHA-verified assets, once',async()=>{
  const f=local();
  const pub=await openPublicSharedGameSources('/Wand',f.fetcher);
  const before=f.requests.length;
  assert(before>0);
  assert(!f.requests.some(x=>x.endsWith('/'+IDENTITY_FILE)||x.endsWith('/'+PET_FILE)));
  const native=await pub.loadNativeCompanionIdentitySources();
  assert.equal(native,await pub.loadNativeCompanionIdentitySources());
  assert.equal(native.contract,DB00_NATIVE_COMPANION_IDENTITY_CONTRACT);
  assert.equal(native.snapshotId,pub.snapshotId);
  assert.equal(native.originalCompanionDefinitions,394);
  assert.equal(native.explicitNativeSourceCategoryRows,134);
  assert.equal(native.remainingWithoutExplicitSourceCategory,260);
  assert.equal(native.officialNameCandidateRelations,3);
  assert.equal(native.nativeCandidateItemIds,2);
  assert.equal(native.originalIdentityVerified,true);
  assert.equal(native.campaignNumericItemIdLinkVerified,false);
  assert.equal(native.playerAcquisitionVerified,false);
  assert.equal(native.playerOwnershipVerified,false);
  assert.equal(f.requests.length,before+2);
  assert.equal(f.requests.filter(x=>x.endsWith('/'+IDENTITY_FILE)).length,1);
  assert.equal(f.requests.filter(x=>x.endsWith('/'+PET_FILE)).length,1);
  await pub.loadNativeCompanionSources();
  await pub.acquisition.loadNativePetSources();
  await pub.acquisition.loadNativeCompanionIdentities();
  await pub.acquisition.loadOfficialCompanionNameCandidates();
  assert.equal(f.requests.length,before+2);
  assert(Object.isFrozen(native));
  assert.equal(pub.acquisition.coverage.combinedSourceRoutes,1255);
});

test('all 394 original Companion IDs retain native keys and DB-00 Item provenance; 134 explicit Pet Source classifications stay separate',async()=>{
  const pub=await open();
  const reader=await pub.loadNativeCompanionIdentitySources();
  const original=await pub.acquisition.loadNativeCompanionIdentities();
  const pet=await pub.acquisition.loadNativePetSources();
  const ids=reader.listNativeItemIds();
  assert.deepEqual(ids,original.listItemIds());
  assert.equal(ids.length,394);
  assert(Object.isFrozen(ids));
  let explicit=0,semantic=0,positiveItems=0;
  for(const id of ids){
    const row=reader.getItem(id);
    assert(row&&row.itemId===id);
    assert.equal(row.shared.itemId,id);
    assert.deepEqual(row.shared,pub.getItem(id));
    assert.equal(row.native,original.getItem(id));
    assert.equal(row.originalIdentityVerified,true);
    assert.equal(row.native.originalSourceSha256,original.originalSha256);
    assert.equal(row.native.sourceLocalizationNameKey,
      'Companion.'+row.native.nativeNameKey+'_DisplayName');
    assert.equal(row.native.sourceNameKeyVerified,true);
    assert.equal(row.native.translatedDisplayNameVerified,false);
    assert.equal(row.localizedNativeNameVerified,false);
    assert.equal(row.numericCampaignRewardLinkVerified,false);
    assert.equal(row.campaignGrantVerified,false);
    assert.equal(row.currentAvailabilityVerified,false);
    assert.equal(row.playerOwnershipVerified,false);
    assert.equal(row.collectionUiMembershipVerified,false);
    assert.equal(row.unclassifiedSourceIsNotAbsenceProof,true);
    assert.deepEqual(row.sourceClassifications,pet.getItemClassifications(id));
    if(row.explicitSourceCategory!==null){
      explicit++;
      assert.equal(row.sourceClassifications.length,1);
      assert.equal(row.sourceClassifications[0].category,row.explicitSourceCategory);
      assert.equal(row.sourceClassifications[0].campaignLinkVerified,false);
    }else{
      assert.deepEqual(row.sourceClassifications,[]);
    }
    if(row.officialNameCandidates.length){
      positiveItems++;
      semantic+=row.officialNameCandidates.length;
      assert(row.officialNameCandidates.every(c=>
        c.companion===row.native &&
        c.itemId===id&&
        c.officialCampaignNumericItemIdLinkVerified===false &&
        c.campaignGrantVerified===false));
    }
    assert.equal(reader.getNativeNameKey(row.native.nativeNameKey)?.itemId,id);
    assert(Object.isFrozen(row));
  }
  assert.equal(explicit,134);
  assert.equal(semantic,3);
  assert.equal(positiveItems,2);
  assert.equal(reader.getItem(99999999),null);
});

test('native Source enum categories are not conflated with official campaign names or verified acquisition',async()=>{
  const reader=await (await open()).loadNativeCompanionIdentitySources();
  const counts={
    quest:8,timebending:1,event:9,star_path:7,
    premium_shop:95,exclusive_promotion:14,
    not_in_explicit_source_subset:260
  };
  for(const [category,count] of Object.entries(counts)){
    const page=reader.search({category,limit:500});
    assert.equal(page.total,count);
    assert.equal(page.items.length,count);
    assert(page.items.every(x=>category==='not_in_explicit_source_subset'?
      x.explicitSourceCategory===null:x.explicitSourceCategory===category));
    assert(page.items.every(x=>
      x.numericCampaignRewardLinkVerified===false&&
      x.playerOwnershipVerified===false));
  }
  assert.equal(reader.search({limit:500}).total,394);
  assert.equal(reader.search({hasOfficialNameCandidateOnly:true}).total,2);
  assert.equal(reader.getNativeNameKey('Expansion02!BabyDragon!SakuraDragon')?.itemId,
    '120000191');
  assert.equal(reader.getNativeNameKey('Crocodile!PirateCrocodile')?.itemId,
    '120000249');
  for(const campaignId of [
    'code:COMMUNITYCOMPANIONDRAGON2025',
    'twitch:2026-october-showcase',
    'twitch:2026-keepsake-sea'
  ]){
    const rows=reader.getOfficialCampaignNameCandidates(campaignId);
    assert.equal(rows.length,1);
    assert(rows[0].officialNameCandidates.some(c=>c.campaignId===campaignId));
    assert.equal(rows[0].numericCampaignRewardLinkVerified,false);
  }
  assert.deepEqual(reader.getOfficialCampaignNameCandidates('code:unknown'),[]);
});

test('native Companion browse supports source name, localized DB name, ID prefix and published-only paging',async()=>{
  const pub=await open();
  const reader=await pub.loadNativeCompanionIdentitySources();
  const native=await pub.acquisition.loadNativeCompanionIdentities();
  const all=[];
  for(let offset=0;;){
    const page=reader.search({offset,limit:41});
    assert.equal(page.source,'native_companion_identity_and_pet_source_only');
    assert.equal(page.originalDefinitionIdsVerified,true);
    assert.equal(page.numericCampaignRewardLinksVerified,0);
    assert.equal(page.playerOwnershipVerified,false);
    all.push(...page.items);
    if(page.nextOffset===null)break;
    offset=page.nextOffset;
  }
  assert.equal(all.length,394);
  assert.deepEqual(all.map(x=>x.itemId),native.listItemIds());
  const published=reader.search({publishedOnly:true,limit:500});
  assert.equal(published.total,all.filter(x=>x.shared.catalog!==null).length);
  assert(published.items.every(x=>x.shared.catalog!==null));
  const first=all[0];
  assert(reader.search({text:first.native.nativeNameKey}).items.some(x=>
    x.itemId===first.itemId));
  assert(reader.search({text:first.itemId}).items.some(x=>
    x.itemId===first.itemId));
  const localized=all.find(x=>typeof x.shared.catalog?.names?.ja==='string'&&
    x.shared.catalog.names.ja.length>=2);
  if(localized){
    const text=localized.shared.catalog.names.ja.slice(0,2);
    assert(reader.search({text,locale:'ja',limit:500}).items.some(x=>
      x.itemId===localized.itemId));
  }
  assert.equal(reader.search({text:'unrepresented-companion_312'}).total,0);
  assert.throws(()=>reader.search({category:'twitch_drop'}),
    /INVALID_SOURCE_CATEGORY/);
  assert.throws(()=>reader.search({locale:'ko'}),/INVALID_LOCALE/);
  assert.throws(()=>reader.search({hasOfficialNameCandidateOnly:false}),
    /INVALID_NAME_FILTER/);
  assert.throws(()=>reader.search({publishedOnly:false}),
    /INVALID_PUBLISHED_FILTER/);
  assert.throws(()=>reader.search({limit:501}),/INVALID_PAGE/);
  assert.throws(()=>reader.search({text:'bad\ntext'}),/INVALID_TEXT/);
});

test('per-Item lookup is lazy; forged, missing, corrupted original source is rejected',async()=>{
  const f=local();
  const pub=await openPublicSharedGameSources('/Wand',f.fetcher);
  const startup=f.requests.length;
  await assert.rejects(pub.getNativeCompanionIdentityEvidence('0120000191'),
    /invalid numeric Item ID/);
  assert.equal(f.requests.length,startup);
  const item=await pub.getNativeCompanionIdentityEvidence(120000191);
  assert(item);
  assert.equal(item.itemId,'120000191');
  assert.equal(item.native.nativeNameKey,'Expansion02!BabyDragon!SakuraDragon');
  assert.equal(item.numericCampaignRewardLinkVerified,false);
  await pub.getNativeCompanionIdentityEvidence('120000191');
  assert.equal(f.requests.length,startup+2);
  const [native,cats,campaigns]=await Promise.all([
    pub.acquisition.loadNativeCompanionIdentities(),
    pub.loadNativeCompanionSources(),
    pub.acquisition.loadOfficialCompanionNameCandidates()
  ]);
  assert.throws(()=>createDb00CompanionIdentityReader(
    pub.database,pub.joined,cats,{...native},campaigns
  ),/PINNED_COMPANION_ID_AND_CAMPAIGN_NAME_REQUIRED/);
  const bad=await openPublicSharedGameSources('/Wand',
    local({corruptIdentity:true}).fetcher);
  assert.equal(bad.database.itemCount,13202);
  await assert.rejects(bad.loadNativeCompanionIdentitySources(),
    /DB02_COMPANION_IDENTITIES_SHA/);
  const missing=await openPublicSharedGameSources('/Wand',
    local({missingIdentity:true}).fetcher);
  await assert.rejects(missing.loadNativeCompanionIdentitySources(),
    /DB02_COMPANION_IDENTITIES_FETCH/);
});
