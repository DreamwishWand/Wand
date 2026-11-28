import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';

test('canonical Premium Shop joins preserve server and historical compositions independently',async()=>{
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{requests.push(url);return new Response(await readFile('static'+url),{status:200});});
  const catalog=await db.getPremiumBundleCatalog();
  assert.equal(catalog.definitions.length,699);
  assert.equal(catalog.counts.total,705);
  assert.equal(catalog.counts.withheldDefinitions,6);
  assert.equal(catalog.definitions.filter(b=>b.current).length,683);
  assert.equal(catalog.definitions.filter(b=>b.legacy&&!b.current).length,16);
  assert.equal(catalog.definitions.filter(b=>b.legacy&&b.current).length,588);
  const all=new Map(),current=new Set();
  for(const b of catalog.definitions){
    assert.equal(b.listingEligibility,'unverified');
    assert.equal(b.saleHistoryVerified,false);
    for(const [kind,r] of [['current',b.current],['legacy',b.legacy]]){
      if(!r)continue;
      for(const [position,p] of r.components.entries()){
        if(kind==='current')current.add(p.itemId);
        const list=all.get(p.itemId)??[];
        list.push([b.bundleId,kind,position,p.quantity]);all.set(p.itemId,list);
      }
    }
  }
  assert.equal(all.size,1617);
  assert.equal(current.size,1590);
  const fields=await db.getFieldRows('acquisition.premiumBundleMembership');
  for(const [id,v] of fields){
    assert.deepEqual(v.occurrences,all.get(id));
    assert.deepEqual(v.currentBundleIds,[...new Set(all.get(id).filter(x=>x[1]==='current').map(x=>x[0]))]);
    assert.deepEqual(v.legacyBundleIds,[...new Set(all.get(id).filter(x=>x[1]==='legacy').map(x=>x[0]))]);
  }
  const canonical=await db.getItemFields([...all.keys()],['acquisition.effectiveCategories']);
  const m=new Map(fields);
  assert.equal(fields.length,canonical.filter(Boolean).length);
  for(const r of canonical)if(r&&current.has(r.itemId)){
    assert(r.values['acquisition.effectiveCategories'].includes('premium_shop'));
    assert(m.get(r.itemId).currentBundleIds.length);
  }
  const changed=catalog.definitions.filter(b=>b.current&&b.legacy&&JSON.stringify(b.current.components.map(p=>[p.itemId,p.quantity]))!==JSON.stringify(b.legacy.components.map(p=>[p.itemId,p.quantity])));
  assert.equal(changed.length,15);
  const sample=changed[0],found=await db.getPremiumBundleDefinitions([sample.bundleId,'not-a-real-bundle',sample.bundleId]);
  assert.equal(found[0],sample);assert.equal(found[1],null);assert.equal(found[0],found[2]);
  const item=sample.current.components[0].itemId;
  const memberships=await db.getPremiumBundleMembership([item,999999999999,item]);
  assert.equal(memberships[1],null);assert.deepEqual(memberships[0],memberships[2]);
  assert(!requests.some(u=>u.includes('/id/')||u.includes('/locale/')||u.includes('/acquisition/public/')));
});

test('confirmed content release selects bundles without mixing source revisions or inferring sale eligibility',async()=>{
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{requests.push(url);return new Response(await readFile('static'+url),{status:200});});
  const catalog=await db.getPremiumBundleCatalog();
  const ids=[...new Set(catalog.definitions.flatMap(b=>[...(b.current?.components??[]),...(b.legacy?.components??[])].map(p=>p.itemId)))];
  const origins=await db.getItemContentOrigins(ids);
  const releases=new Map();
  for(const origin of origins){
    if(origin?.attribution!=='confirmed')continue;
    const set=releases.get(origin.contentReleaseId)??new Set();
    set.add(origin.itemId);releases.set(origin.contentReleaseId,set);
  }
  // Independent expected join against canonical Item origins, including complete revision composition.
  for(const [release,selected] of releases){
    const expected=catalog.definitions.flatMap(definition=>{
      const match=r=>[...new Set((r?.components??[]).filter(p=>selected.has(p.itemId)).map(p=>p.itemId))];
      const currentMatchingItemIds=match(definition.current),legacyMatchingItemIds=match(definition.legacy);
      return currentMatchingItemIds.length||legacyMatchingItemIds.length?[{definition,currentMatchingItemIds,legacyMatchingItemIds}]:[];
    });
    const result=await db.findPremiumBundlesByContentRelease(release);
    assert.equal(result.status,'indexed');
    assert.deepEqual(result.matches,expected);
    assert.equal(result.listingEligibilityVerified,false);
    assert.equal(result.currentAvailabilityVerified,false);
  }
  const unknown=await db.findPremiumBundlesByContentRelease('test-no-such-release-99');
  assert.equal(unknown.status,'indexed');assert.deepEqual(unknown.matches,[]);
  await assert.rejects(db.findPremiumBundlesByContentRelease('bad release'),/INVALID_CONTENT_RELEASE_ID/);
  assert(!requests.some(u=>u.includes('/id/')||u.includes('/locale/')));
});
