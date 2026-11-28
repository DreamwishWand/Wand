import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {openCurrentItemDetails} from '../src/lib/items/public-item-details.ts';
import {readCurrentAcquisitionCoverage} from '../src/lib/items/public-acquisition-coverage.ts';
test('current acquisition coverage distinguishes collectible source candidates, native families and other definitions',async()=>{
  const requests=[],fetcher=async url=>{requests.push(url);return new Response(await readFile('static'+url),{status:200});};
  const db=await openCurrentItemDatabase('',fetcher);
  const c=await readCurrentAcquisitionCoverage(db);
  assert.equal(c.status,'indexed');assert.equal(c.currentAvailabilityVerified,false);
  const [effective,legacy,scopes,families]=await Promise.all([
    db.getFieldRows('acquisition.effectiveCategories'),db.getFieldRows('acquisition.categories'),
    db.getFieldRows('definitionScope'),db.getFieldRows('nativeCategory')]);
  const previous=new Map(legacy),current=new Map(effective),scope=new Map(scopes);
  assert.equal(c.all.definitions,families.length);
  assert.equal(c.all.classified,effective.length);
  assert.equal(c.all.newlyClassifiedSinceLegacy,effective.filter(([id])=>!previous.has(id)).length);
  assert(c.all.newlyClassifiedSinceLegacy>=366);
  assert.equal(c.all.unclassified,c.all.definitions-c.all.classified);
  for(const [category,count] of Object.entries(c.all.byCategory)){
    assert.equal(count,effective.filter(([,v])=>v.includes(category)).length);
  }
  for(const [family,counts] of Object.entries(c.byNativeCategory)){
    const ids=families.filter(([,f])=>f===family).map(([id])=>id);
    assert.equal(counts.definitions,ids.length);
    assert.equal(counts.classified,ids.filter(id=>current.has(id)).length);
    const candidates=ids.filter(id=>scope.get(id)==='source_candidate');
    if(candidates.length){
      const collection=c.collectionCandidatesByNativeCategory[family];
      assert.equal(collection.definitions,candidates.length);
      assert.equal(collection.classified,candidates.filter(id=>current.has(id)).length);
    }
  }
  assert.equal(c.collectionSourceCandidates.definitions,scopes.filter(([,s])=>s==='source_candidate').length);
  assert.equal(c.collectionSourceCandidates.classified,effective.filter(([id])=>scope.get(id)==='source_candidate').length);
  assert.equal(c.runtimeMembershipVerified,false);
  const details=await openCurrentItemDetails('',fetcher);
  assert.deepEqual(await details.getCurrentAcquisitionCoverage(),c);
  assert(!requests.some(u=>u.includes('/id/')||u.includes('/locale/')||u.includes('/text/')||u.includes('/acquisition/public/')));
  console.log('DB01_CURRENT_ACQUISITION_COVERAGE '+JSON.stringify({all:c.all,collection:c.collectionSourceCandidates,
    byCollectionCategory:c.collectionCandidatesByNativeCategory,unresolvedOnlineHintItemIds:c.unresolvedOnlineHintItemIds}));
});
