import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {openCurrentItemDetails} from '../src/lib/items/public-item-details.ts';
import {readStoreItemSourceEvidence} from '../src/lib/items/public-store-source-evidence.ts';
test('store evidence joins explicit lists and sequences independently of generator screening and configured price',async()=>{
  const requests=[],fetcher=async url=>{requests.push(url);return new Response(await readFile('static'+url),{status:200});};
  const db=await openCurrentItemDatabase('',fetcher);
  const sources=await db.getFieldRows('acquisition.additionalSources');
  const defaults=sources.filter(([,v])=>v.some(l=>l.kind==='configured_store_display'));
  const preDlc=sources.filter(([,v])=>v.some(l=>l.kind==='pre_dlc_store_list_member'));
  const sequences=await db.getFieldRows('acquisition.storeDisplaySequenceLinks');
  assert.equal(defaults.length,141);assert.equal(preDlc.length,76);assert.equal(sequences.length,15);
  const ids=[...new Set([...defaults,...preDlc,...sequences].map(([id])=>id).concat([40000047,40200001,40300001,40000048,50700002,50700017]))];
  const rows=await readStoreItemSourceEvidence(db,[...ids,30200000,99999999,ids[0]],'ja');
  const original=new Map(sources),seq=new Map(sequences);
  const fields=await db.getItemFields(ids,['acquisition.storeDisplayScreen','acquisition.storeLayoutCandidates','acquisition.catalogFacts','acquisition.effectiveCategories']);
  assert.equal(rows[ids.length].status,'not_store_display_family');
  assert.equal(rows[ids.length+1],null);assert.deepEqual(rows.at(-1),rows[0]);
  for(const [i,r] of rows.slice(0,ids.length).entries()){
    assert.equal(r.status,'indexed');assert.equal(r.itemId,ids[i]);
    assert.deepEqual(r.configuredDefaultDisplay,original.get(r.itemId)?.find(l=>l.kind==='configured_store_display')??null);
    assert.deepEqual(r.preDlcList,original.get(r.itemId)?.find(l=>l.kind==='pre_dlc_store_list_member')??null);
    assert.deepEqual(r.explicitSequences.map(l=>l.original),seq.get(r.itemId)??[]);
    assert.deepEqual(r.generatedScreen,fields[i].values['acquisition.storeDisplayScreen']??null);
    assert.deepEqual(r.layoutCandidates,fields[i].values['acquisition.storeLayoutCandidates']??null);
    assert.deepEqual(r.catalog,fields[i].values['acquisition.catalogFacts']??null);
    assert.deepEqual(r.effectiveCategories,fields[i].values['acquisition.effectiveCategories']??null);
    assert.equal(r.configuredPrice.itemId,r.itemId);assert.equal(r.configuredPrice.runtimeSaleEligibilityVerified,false);
    assert.equal(r.storeMembershipVerified,false);assert.equal(r.currentAvailabilityVerified,false);
    for(const l of r.explicitSequences)assert.deepEqual(l.buildings.map(b=>b.itemId),l.applyToBuildingIds);
  }
  const details=await openCurrentItemDetails('',fetcher);
  assert.deepEqual(await details.getStoreItemSourceEvidence(ids.slice(0,2),'ja'),rows.slice(0,2));
  assert(!requests.some(u=>u.includes('/id/')||u.includes('/locale/')||u.includes('/text/')||u.includes('/acquisition/public/')));
  console.log('DB01_STORE_JOIN '+JSON.stringify({explicitDisplayItems:defaults.length,preDlcItems:preDlc.length,sequenceItems:sequences.length,distinctExplicitItems:new Set([...defaults,...preDlc,...sequences].map(([id])=>id)).size,
    explicitItemsPassingScreen:rows.slice(0,ids.length).filter(r=>(r.configuredDefaultDisplay||r.preDlcList||r.explicitSequences.length)&&r.generatedScreen?.status==='not_excluded_by_reviewed_gates').length,
    explicitItemsWithSoftCurrencyPurchase:rows.slice(0,ids.length).filter(r=>(r.configuredDefaultDisplay||r.preDlcList||r.explicitSequences.length)&&r.configuredPrice.purchase.some(p=>p.currencyItemId===80000000&&p.amountFieldPresent&&p.amount>0)).length}));
});
