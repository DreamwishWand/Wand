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
  assert.deepEqual(c.nativeCharacterCollectionPredicate,{definitions:142,eligible:82,excluded:60,eligibleClassified:82,eligibleUnclassified:0});
  const native=c.nativeCollectionCoverage;
  assert(native);assert.equal(native.runtimeMembershipVerified,false);
  const predicates=new Map(await db.getFieldRows('collection.nativeCanBeCollected'));
  const candidates=families.filter(([id])=>scope.get(id)==='source_candidate');
  const census=ids=>{
    const v={candidates:ids.length,eligible:0,excluded:0,unknown:0,eligibleClassified:0,eligibleUnclassified:0,excludedClassified:0,excludedUnclassified:0,unknownClassified:0,unknownUnclassified:0};
    for(const id of ids){
      const p=predicates.get(id),key=p===true?'eligible':p===false?'excluded':'unknown';
      v[key]++;v[key+(current.has(id)?'Classified':'Unclassified')]++;
    }
    return v;
  };
  assert.deepEqual(native.total,census(candidates.map(([id])=>id)));
  for(const [family,counts] of Object.entries(native.byNativeCategory)){
    assert.deepEqual(counts,census(candidates.filter(([,f])=>f===family).map(([id])=>id)));
  }
  assert.deepEqual(native.eligibleUnclassifiedItemIds,candidates.filter(([id])=>predicates.get(id)===true&&!current.has(id)).map(([id])=>id));
  assert.deepEqual(native.unknownUnclassifiedItemIds,candidates.filter(([id])=>!predicates.has(id)&&!current.has(id)).map(([id])=>id));
  assert.equal(native.byNativeCategory.Character.eligibleUnclassified,0);
  assert.equal(native.byNativeCategory.MemoryShard.eligibleUnclassified,226);
  assert.equal(native.total.eligibleUnclassified+native.total.unknownUnclassified+native.total.excludedUnclassified,c.collectionSourceCandidates.unclassified);
  console.log('DB01_NATIVE_COLLECTION_COVERAGE '+JSON.stringify({total:native.total,byNativeCategory:native.byNativeCategory}));
  const details=await openCurrentItemDetails('',fetcher);
  assert.deepEqual(await details.getCurrentAcquisitionCoverage(),c);
  assert(!requests.some(u=>u.includes('/id/')||u.includes('/locale/')||u.includes('/text/')||u.includes('/acquisition/public/')));
  console.log('DB01_CURRENT_ACQUISITION_COVERAGE '+JSON.stringify({all:c.all,collection:c.collectionSourceCandidates,
    byCollectionCategory:c.collectionCandidatesByNativeCategory,nativeCharacterCollectionPredicate:c.nativeCharacterCollectionPredicate,unresolvedOnlineHintItemIds:c.unresolvedOnlineHintItemIds}));
});
