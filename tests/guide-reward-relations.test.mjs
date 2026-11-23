import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {
  DB03_REWARD_RELATION_CONTRACT,createGuideRewardIndex,loadGuideRewardIndex,joinGuideRewardsToDb01
} from '../src/lib/guide/reward-relations.ts';
import {guideCalendarEvents} from '../src/lib/guide/event-calendar.ts';
import {STARPATH_PUBLIC_SHA} from '../src/lib/guide/public-starpath.ts';

const original=new URL('../static/guide/public/starpath-cache-2026-11-22.json',import.meta.url);
const bytes=()=>readFile(original);
const read=async()=>JSON.parse(await bytes());
const index=async()=>createGuideRewardIndex(await read());
const same=(a,b)=>assert.deepEqual(a,b);

test('published Guide Star Path projection retains 67 exact slots, 60 distinct related IDs and source provenance',async()=>{
  const raw=await bytes();
  assert.equal(createHash('sha256').update(raw).digest('hex'),STARPATH_PUBLIC_SHA);
  const data=await read(),view=createGuideRewardIndex(data);
  assert.equal(view.contract,DB03_REWARD_RELATION_CONTRACT);
  assert.equal(view.evidence.gameVersion,'1.26.2');
  assert.equal(view.evidence.integrity,'source_structure_only');
  assert.equal(view.evidence.publicProjectionSha256,STARPATH_PUBLIC_SHA);
  same(view.coverage,{
    knownSeasonCount:2,recordedRewardSlots:67,
    distinctPrimaryRewardIds:58,distinctRelatedItemIds:60,knownEventCount:21,
    historicalSeasonCatalogComplete:false,playerProgressIncluded:false,
    currentAvailabilityVerified:false,
    questRewardRelations:'not_in_published_starpath_snapshot',
    otherEventRewardRelations:'not_in_published_starpath_snapshot'
  });
  same(view.seasons.map(s=>s.id),['HauntingElegance2026','Seafaring2026']);
  const expected=[[34,9,7],[10,1,6]];
  for(const [seasonIndex,source] of data.seasons.entries()){
    const summary=view.getSeason(source.id);
    assert.equal(summary.title,source.title);
    assert.equal(summary.currencyName,source.currencyName);
    assert.equal(summary.startUtc,source.startUtc);
    assert.equal(summary.taskEndUtcExclusive,source.finishUtcExclusive);
    assert.equal(summary.endUtcExclusive,source.endUtcExclusive);
    assert.equal(summary.premiumAccessCost,source.premiumPrice.amount);
    assert.equal(summary.premiumAccessCurrencyItemId,source.premiumPrice.itemId);
    const groups=view.getSeasonGroups(source.id);
    same(groups.filter(g=>g.section==='normal').map(g=>g.rewards.length),
      source.rewardPages.map(p=>p.rewards.length));
    same(groups.filter(g=>g.section==='bonus').map(g=>g.rewards.length),
      source.bonusPages.map(p=>p.rewards.length));
    same(groups.filter(g=>g.section==='vault').map(g=>g.rewards.length),[source.vaultRewards.length]);
    const occurrences=view.getSeasonRewards(source.id);
    same(expected[seasonIndex],['normal','bonus','vault'].map(section=>
      occurrences.filter(r=>r.section===section).length));
    const allSource=[
      ...source.rewardPages.flatMap(p=>p.rewards.map((r,i)=>({r,section:'normal',page:p.page,slot:i+1,meta:p}))),
      ...source.bonusPages.flatMap(p=>p.rewards.map((r,i)=>({r,section:'bonus',page:p.page,slot:i+1,meta:p}))),
      ...source.vaultRewards.map((r,i)=>({r,section:'vault',page:null,slot:i+1,meta:{}}))
    ];
    for(const [i,{r,section,page,slot,meta}] of allSource.entries()){
      const actual=occurrences[i];
      assert.equal(actual.itemId,r.itemId);
      assert.equal(actual.amount,r.amount);
      assert.equal(actual.premium,r.premium);
      assert.equal(actual.bonus,r.bonus);
      assert.equal(actual.recurrent,r.recurrent);
      assert.equal(actual.price,r.price,'undefined source prices cannot be fabricated');
      assert.equal(actual.alternateItemId,r.alternateItemId);
      assert.equal(actual.section,section);
      assert.equal(actual.page,page);
      assert.equal(actual.slot,slot);
      assert.equal(actual.minPurchasedFromPreviousPage,meta.minPurchasedFromPreviousPage);
      assert.equal(actual.currencyConversionPage,meta.currencyConversionPage===true);
      assert.equal(actual.eventId,summary.eventId);
      assert.equal(actual.currencyName,source.currencyName);
      assert.equal(actual.occurrenceId,source.id+'/'+(section==='vault'?'vault':section+'-'+page)+'/'+slot);
      assert(Object.isFrozen(actual));
    }
  }
  assert.equal(view.getSeason('Nonexistent'),null);
  same(view.getSeasonGroups('Nonexistent'),[]);
  same(view.getSeasonRewards('Nonexistent'),[]);
  assert(Object.isFrozen(view.occurrences));
  assert(Object.isFrozen(view.seasons));
  assert(Object.isFrozen(view.coverage));
});

test('bidirectional lookup preserves every instance across both seasons and separate item relation roles',async()=>{
  const view=await index(),moonstones=view.getItemRelations('80100000');
  assert.equal(moonstones.length,12);
  same(new Set(moonstones.map(r=>r.seasonId)),
    new Set(['HauntingElegance2026','Seafaring2026']));
  assert.equal(moonstones.filter(r=>r.role==='configured_reward').length,10);
  assert.equal(moonstones.filter(r=>r.role==='premium_access_currency').length,2);
  assert.equal(view.getItemAcquisitionCandidates(80100000).length,10);
  for(const r of moonstones){
    assert.equal(r.guaranteedGrant,false);
    assert.equal(r.currentAvailabilityVerified,false);
    assert.equal(r.playerOwnershipVerified,false);
    if(r.role==='configured_reward'){
      assert(r.occurrence);
      assert.equal(r.itemId,r.occurrence.itemId);
      assert(Number.isSafeInteger(r.occurrence.amount));
    }else{
      assert.equal(r.occurrence,null);
      assert.equal(r.occurrenceId,null);
    }
  }
  for(const id of ['31400173','31400174']){
    const candidates=view.getItemRelations(id);
    assert(candidates.length>0);
    assert(candidates.every(x=>x.role==='vault_alternative_candidate'&&
      x.occurrence.section==='vault'&&x.occurrence.alternateItemId===id));
    same(view.getItemAcquisitionCandidates(id),[],
      'Vault alternate marker is not an actual configured reward item');
  }
  const totalRelations=view.itemIds.flatMap(id=>view.getItemRelations(id));
  assert.equal(totalRelations.filter(x=>x.role==='configured_reward').length,67);
  assert.equal(totalRelations.filter(x=>x.role==='vault_alternative_candidate').length,13);
  assert.equal(totalRelations.filter(x=>x.role==='premium_access_currency').length,2);
  assert.equal(new Set(totalRelations.map(x=>x.occurrenceId).filter(Boolean)).size,67);
  assert.equal(view.itemIds.length,60);
  assert.equal(view.getItemAcquisitionCandidates('120000253').length,1);
  assert.equal(view.getItemRelations('120000253')[0].seasonId,'Seafaring2026');
  assert.equal(view.getItemRelations(120000253).length,1);
  assert.equal(view.getItemRelations('999999').length,0);
  for(const id of ['0','01','__proto__','NaN','1.5','9999999999999999',0,NaN,-1])
    assert.throws(()=>view.getItemRelations(id),/INVALID_ITEM_ID/);
  assert.throws(()=>view.getItemAcquisitionCandidates('__proto__'),/INVALID_ITEM_ID/);
  const mutable=view.getItemRelations('80100000');
  assert(Object.isFrozen(mutable));
  assert.throws(()=>mutable.pop(),TypeError);
});

test('Guide event links use existing calendar IDs, unknown non-Star Path rewards are not false zero grants',async()=>{
  const data=await read(),view=createGuideRewardIndex(data),events=guideCalendarEvents(data);
  for(const e of events){
    const link=view.getEventRewards(e.id);
    if(e.kind==='starpath'){
      const season=view.getSeason(e.sourceSeasonId);
      assert.equal(link.coverage,'source_recorded');
      assert.equal(link.rewards.length,view.getSeasonRewards(season.id).length);
      assert(link.rewards.every(r=>r.eventId===e.id));
    }else{
      assert.equal(link.coverage,'event_known_rewards_unpublished');
      same(link.rewards,[]);
    }
  }
  assert.equal(view.getEventRewards('fake-event').coverage,'event_not_in_verified_calendar');
  assert.equal(view.getQuestRewards('2070000620').coverage,'private_quest_reward_source_required');
  same(view.getQuestRewards('2070000620').rewards,[]);
  assert.throws(()=>view.getQuestRewards('__proto__'),/INVALID_QUEST_ID/);
});

test('DB-01 typed adapter joins same exact 60 item identities without creating a competing catalogue',async()=>{
  const view=await index(),requests=[];
  const rows=await joinGuideRewardsToDb01(view,{
    async getItems(ids){
      requests.push(ids);
      return ids.map(id=>id===31400174?null:({
        itemId:id,nativeCategory:'Furniture',catalogDomain:'item',
        nativeKey:'TEST',localizationKey:null,sourceSha256:'a'.repeat(64),
        verifiedIconGuid:null,
        names:{en:null,fr:null,it:null,de:null,'es-ES':null,ja:null,'zh-CN':null,'pt-BR':null}
      }));
    }
  });
  assert.equal(requests.length,1);
  assert.equal(requests[0].length,60);
  same(rows.map(r=>r.itemId),view.itemIds);
  const known=rows.find(r=>r.itemId==='120000253');
  assert.equal(known.status,'present_in_supplied_db01');
  assert.equal(known.item.itemId,Number(known.itemId));
  const missing=rows.find(r=>r.itemId==='31400174');
  assert.equal(missing.status,'not_in_supplied_db01');
  assert.equal(missing.item,null);
  assert(missing.sourceRelations.length>0,'missing partial DB01 record does not erase Guide source origin');
  assert(Object.isFrozen(rows));
  assert.throws(()=>rows.push('tamper'),TypeError);
  await assert.rejects(()=>joinGuideRewardsToDb01(view,{getItems:async()=>[]}),/DB01_LOOKUP_MISMATCH/);
  await assert.rejects(()=>joinGuideRewardsToDb01(view,{getItems:async ids=>ids.map(()=>({itemId:1}))}),/DB01_IDENTITY_MISMATCH/);
});

test('mutated source rows are rejected, and public loader requires exact pinned bytes',async()=>{
  const raw=await bytes();
  const fetcher=async()=>({ok:true,arrayBuffer:async()=>raw.buffer.slice(
    raw.byteOffset,raw.byteOffset+raw.byteLength)});
  const verified=await loadGuideRewardIndex('https://example.invalid/pinned.json',fetcher);
  assert.equal(verified.evidence.integrity,'pinned_public_sha256');
  assert.equal(verified.getSeasonRewards('Seafaring2026').length,17);
  const changed=Buffer.from(raw);changed[55]^=1;
  await assert.rejects(()=>loadGuideRewardIndex('unused',async()=>({
    ok:true,arrayBuffer:async()=>changed.buffer.slice(changed.byteOffset,changed.byteOffset+changed.length)
  })),/fingerprint mismatch/);
  const edit=await read();
  edit.seasons[1].rewardPages[0].rewards[0].price=-1;
  assert.throws(()=>createGuideRewardIndex(edit),/INVALID_PRICE|Public Star Path: reward price/);
  edit.seasons[1].rewardPages[0].rewards[0].price=100;
  edit.seasons[1].rewardPages[0].rewards[0].itemId='__proto__';
  assert.throws(()=>createGuideRewardIndex(edit),/(?:Public Star Path: reward|INVALID_ITEM_ID)/,
    'the pinned original Star Path validator may reject an invalid ID first');
  const reduced=await read();
  reduced.seasons[0].rewardPages[0].rewards.pop();
  assert.throws(()=>createGuideRewardIndex(reduced),/SOURCE_REWARD_CENSUS|Public Star Path: source reward census/);
  const badAlternative=await read();
  badAlternative.seasons[0].vaultRewards[0].alternateItemId='10000000'; // structurally valid but a previously unseen ID
  assert.throws(()=>createGuideRewardIndex(badAlternative),/SOURCE_REWARD_CENSUS/);
});
