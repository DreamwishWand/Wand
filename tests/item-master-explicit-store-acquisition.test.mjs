import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {readStoreItemSourceEvidence} from '../src/lib/items/public-store-source-evidence.ts';
test('ordinary store classification requires explicit standard display, clear source gates and positive configured coin price',async()=>{
  const db=await openCurrentItemDatabase('',async url=>new Response(await readFile('static'+url),{status:200}));
  const sources=await db.getFieldRows('acquisition.additionalSources');
  const ids=sources.filter(([,v])=>v.some(l=>l.kind==='configured_store_display')).map(([id])=>id);
  assert.equal(ids.length,141);
  const rows=await readStoreItemSourceEvidence(db,ids,'ja');
  const overrides=new Map(await db.getFieldRows('source.PriceOverride'));
  const eligible=rows.filter(r=>{
    const override=overrides.get(r.itemId);
    return r.generatedScreen?.status==='not_excluded_by_reviewed_gates'&&r.catalog?.flagsKnown&&
      !r.catalog.exclusionFlags.length&&r.catalog.gateStatus==='empty_source_gate'&&
      (!override||!Object.keys(override).length||override.Price?.Id===80000000)&&
      r.configuredPrice.purchase.some(p=>p.currencyItemId===80000000&&p.amountFieldPresent&&p.amount>0);
  });
  const facts=await db.getFieldRows('acquisition.ordinaryConfiguredStoreSource');
  assert(eligible.length>0);
  assert.deepEqual(facts.map(([id])=>id),eligible.map(r=>r.itemId));
  const effective=new Map(await db.getFieldRows('acquisition.effectiveCategories'));
  const byId=new Map(rows.map(r=>[r.itemId,r]));
  for(const [id,v] of facts){
    const row=byId.get(id);
    assert.deepEqual(v.display,row.configuredDefaultDisplay);
    const p=row.configuredPrice.purchase.find(p=>p.currencyItemId===80000000);
    assert.equal(v.configuredPurchaseAmount,p.amount);assert.equal(v.priceSource,p.source);
    assert.equal(v.purchaseCurrencyItemId,80000000);
    assert.equal(v.ordinaryConfiguredRoute,true);
    assert.equal(v.storeMembershipVerified,false);assert.equal(v.liveTransactionVerified,false);assert.equal(v.currentAvailabilityVerified,false);
    assert(effective.get(id).includes('ordinary_gameplay'));
  }
});
