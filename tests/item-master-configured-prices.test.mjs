import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';

test('configured price overrides preserve all original public rows without claiming runtime prices',async()=>{
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{
    requests.push(url);
    return new Response(await readFile('static'+url),{status:200});
  });
  const rows=await db.getFieldRows('source.PriceOverride');
  assert.equal(rows.length,8229);
  const values=[];
  for(let i=0;i<rows.length;i+=500){
    values.push(...await db.getConfiguredPriceOverrides(rows.slice(i,i+500).map(([id])=>id)));
  }
  const counts={};
  for(const [index,value] of values.entries()){
    assert.equal(value.itemId,rows[index][0]);
    assert.equal(value.currentPurchasePriceVerified,false);
    assert.equal(value.currentRepurchasePriceVerified,false);
    assert.equal(value.currentSellPriceVerified,false);
    assert(Object.isFrozen(value));
    counts[value.status]=(counts[value.status]??0)+1;
    if(value.status==='amount_configured'){
      assert.equal(typeof value.amount,'number');
      assert.deepEqual(value.nativePurchaseOverride,{
        kind:'matching_currency_explicit_override',currencyItemId:value.priceCurrencyItemId,
        amount:value.amount,nativeLookupBranchVerified:true,precedesPriceProviders:true,
        liveTransactionVerified:false,sourceGameVersion:'1.26.2'
      });
      assert(Object.isFrozen(value.nativePurchaseOverride));
    }else{
      assert.equal(value.amount,null);
      assert.equal(value.nativePurchaseOverride,null);
    }
  }
  assert.deepEqual(counts,{amount_configured:1156,empty:7053,currency_only:20});
  const amountValues=values.filter(v=>v.status==='amount_configured');
  assert.equal(amountValues.filter(v=>v.priceCurrencyItemId===80000000).length,1135);
  assert.equal(amountValues.filter(v=>v.priceCurrencyItemId===80000009).length,21);
  const [priced,empty,only,unknown,other,repeat]=await db.getConfiguredPriceOverrides(
    [40000047,40000048,40000421,99999999,30000031,40000047]);
  assert.equal(priced.status,'amount_configured');
  assert.equal(priced.amount,16000);
  assert.equal(priced.priceCurrencyItemId,80000000);
  assert.equal(priced.overrideCurrencyItemId,null);
  assert.equal(empty.status,'empty');
  assert.equal(only.status,'currency_only');
  assert.equal(only.overrideCurrencyItemId,80000000);
  assert.equal(only.amount,null);
  assert.equal(unknown,null);
  assert.equal(other.status,'not_recorded');
  assert.deepEqual(repeat,priced);
  assert(!requests.some(url=>url.includes('/acquisition/public/')||url.includes('/id/')||url.includes('/locale/')));
});


test('native furniture display type gate is a structural filter, not shop membership',async()=>{
  const db=await openCurrentItemDatabase('',async url=>new Response(await readFile('static'+url),{status:200}));
  const gate=await db.getFieldRows('acquisition.furnitureDisplayTypeGate');
  assert.equal(gate.length,6746);
  const passed=gate.filter(([,value])=>value===true);
  assert.equal(passed.length,5288);
  assert.equal(gate.filter(([,value])=>value===false).length,1458);
  const types=new Map(await db.getFieldRows('itemType.subtypeCode'));
  const categories=new Map(await db.getFieldRows('nativeCategory'));
  for(const [id,value] of gate){
    assert.equal(categories.get(id),'Furniture');
    assert.equal(value,[0,3].includes(types.get(id)));
  }
  assert.deepEqual(await db.findItemIdsByField('acquisition.furnitureDisplayTypeGate',{kind:'equals',value:true}),
    passed.map(([id])=>id));
  const row=await db.getItemFields([40000047],['acquisition.furnitureDisplayTypeGate','acquisition.catalogFacts']);
  assert.equal(row[0].values['acquisition.furnitureDisplayTypeGate'],true);
  assert.equal(row[0].values['acquisition.catalogFacts'].storeMembershipVerified,false);
});
