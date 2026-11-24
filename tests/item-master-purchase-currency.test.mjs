import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';

test('default purchase currency selection preserves explicit original currency versus omitted field',async()=>{
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{
    requests.push(url);
    return new Response(await readFile('static'+url),{status:200});
  });
  const all=await db.getFieldRows('acquisition.purchaseCurrencySelection');
  const explicit=await db.getFieldRows('acquisition.defaultCurrencyItemId');
  assert.equal(all.length,8229);
  assert.equal(explicit.length,48);
  assert.equal(explicit.filter(([,v])=>v===80000000).length,41);
  assert.equal(explicit.filter(([,v])=>v===80100000).length,7);
  assert.equal(all.filter(([,v])=>!v.serializedFieldPresent).length,8181);
  assert.equal(all.filter(([,v])=>v.explicitDefaultMatchesPriceOverride).length,10);
  const byId=new Map(explicit);
  for(const [id,v] of all){
    assert.equal(v.defaultCurrencyItemId,byId.get(id)??null);
    assert.equal(v.serializedFieldPresent,byId.has(id));
    assert.equal(v.explicitDefaultLookup,'requested_currency');
    assert.equal(v.invalidNativeDefaultLookup,'first_returned_price');
    assert.equal(v.currentPriceVerified,false);
    assert.equal(v.currentAvailabilityVerified,false);
  }
  assert.deepEqual(await db.findItemIdsByField('acquisition.defaultCurrencyItemId',{kind:'equals',value:80100000}),
    [50800075,50800097,50800104,50800106,50800108,50800112,50800118]);
  const [coin,moon,omitted,unknown]=await db.getItemFields([40001187,50800075,40000047,99999999],
    ['acquisition.defaultCurrencyItemId','acquisition.purchaseCurrencySelection']);
  assert.equal(coin.values['acquisition.defaultCurrencyItemId'],80000000);
  assert.equal(moon.values['acquisition.defaultCurrencyItemId'],80100000);
  assert.equal(omitted.values['acquisition.defaultCurrencyItemId'],undefined);
  assert.equal(omitted.values['acquisition.purchaseCurrencySelection'].defaultCurrencyItemId,null);
  assert.equal(unknown,null);
  assert(!requests.some(u=>u.includes('/id/')||u.includes('/locale/')||u.includes('/acquisition/public/')));
});
