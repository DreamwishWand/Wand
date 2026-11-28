import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {readStoreItemSourceEvidence} from '../src/lib/items/public-store-source-evidence.ts';
test('Scrooge explicit display sequences join the original building upgrade slots and positive coin price',async()=>{
 const db=await openCurrentItemDatabase('',async u=>new Response(await readFile('static'+u),{status:200}));
 const seq=new Map(await db.getFieldRows('acquisition.storeDisplaySequenceLinks'));
 assert.equal(seq.size,15);
 const [building]=await db.getItemFields([20300028],['source.UpgradeInfo','source.DisplayName','source.DefaultGridLayoutPath']);
 assert.equal(building.values['source.DisplayName'],'Building.ScroogeStore_DisplayName');
 const slots=building.values['source.UpgradeInfo'];
 const rows=await readStoreItemSourceEvidence(db,[...seq.keys()],'ja');
 const overrides=new Map(await db.getFieldRows('source.PriceOverride'));
 const expected=new Map();
 for(const r of rows){
   const override=overrides.get(r.itemId);
   const price=r.configuredPrice.purchase.find(p=>p.currencyItemId===80000000&&p.amountFieldPresent&&p.amount>0);
   if(r.generatedScreen?.status!=='not_excluded_by_reviewed_gates'||!r.catalog?.flagsKnown||r.catalog.exclusionFlags.length||
     r.catalog.gateStatus!=='empty_source_gate'||override&&Object.keys(override).length&&override.Price?.Id!==80000000||!price)continue;
   const links=seq.get(r.itemId).flatMap(l=>l.applyToBuildingIds.includes(20300028)?slots.flatMap((u,ui)=>(u.Store?.Displays??[]).flatMap((d,di)=>d.ItemID===l.displayItemId&&d.Quantity>0?
     [{l,sourcePath:'source.UpgradeInfo['+ui+'].Store.Displays['+di+'].ItemID',level:u.Level,qty:d.Quantity,price}]:[])):[]);
   if(links.length)expected.set(r.itemId,links);
 }
 const actual=new Map(await db.getFieldRows('acquisition.ordinaryStoreSequenceSources'));
 assert(actual.size>0);assert.deepEqual([...actual.keys()],[...expected.keys()]);
 const effective=new Map(await db.getFieldRows('acquisition.effectiveCategories'));
 for(const [id,links] of actual){
   const want=expected.get(id);assert.equal(links.length,want.length);
   for(const [i,l] of links.entries()){
     const w=want[i];assert.deepEqual(l.sequence,w.l);assert.equal(l.sourcePath,w.sourcePath);
     assert.equal(l.upgradeLevel,w.level);assert.equal(l.configuredDisplayQuantity,w.qty);
     assert.equal(l.configuredPurchaseAmount,w.price.amount);assert.equal(l.priceSource,w.price.source);
     assert.equal(l.storeMembershipVerified,false);assert.equal(l.currentAvailabilityVerified,false);
     assert.equal(l.guaranteedGrantVerified,false);assert.equal(l.liveTransactionVerified,false);
   }
   assert(effective.get(id).includes('ordinary_gameplay'));
 }
});
