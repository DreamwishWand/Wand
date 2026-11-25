import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {openCurrentItemDetails} from '../src/lib/items/public-item-details.ts';
import {readItemAcquisitionSourceDetails} from '../src/lib/items/public-item-acquisition-details.ts';

test('source details preserve distinct original occurrences and resolve canonical localized identities lazily',async()=>{
  const requests=[];
  const fetcher=async url=>{requests.push(url);return new Response(await readFile('static'+url),{status:200});};
  const db=await openCurrentItemDatabase('',fetcher);
  const ids=[30000031,51300032,120000073,80300000,30400064,99999999,30000031];
  const rows=await readItemAcquisitionSourceDetails(db,ids,'ja');
  assert.equal(rows[5],null);assert.deepEqual(rows[0],rows[6]);
  const edges=await db.getNativeAcquisitionCandidates(ids);
  const fieldRows=await db.getItemFields(ids,['acquisition.sourceRelations','acquisition.additionalSources','acquisition.effectiveCategories']);
  for(let i=0;i<rows.length;i++){
    const row=rows[i];if(!row)continue;
    assert.equal(row.itemId,ids[i]);
    assert.equal(row.indexedStatus,'current');
    assert.equal(row.nativeStatus,'indexed');
    assert.deepEqual(row.native.map(x=>x.evidence),edges[i]);
    assert.deepEqual(row.indexed.map(x=>x.evidence),fieldRows[i].values['acquisition.sourceRelations']?.links??[]);
    assert.deepEqual(row.additional.map(x=>x.evidence),fieldRows[i].values['acquisition.additionalSources']??[]);
    assert.deepEqual(row.effectiveCategories,fieldRows[i].values['acquisition.effectiveCategories']??[]);
    assert.equal(row.coverageComplete,false);assert.equal(row.currentAvailabilityVerified,false);
  }
  const recipe=rows[0].native.find(x=>x.evidence[0]===2050300095&&x.evidence[1]==='activity_result');
  assert.equal(recipe.identity.itemId,2050300095);
  assert.equal(recipe.identity.nativeCategory,'ActivityData');
  const story=rows[1].native.find(x=>x.evidence[0]===200000001);
  assert.equal(story.identity.nativeCategory,'Story');
  const quest=rows[4].native.find(x=>x.evidence[0]===2070000628);
  assert.equal(quest.identity.nativeCategory,'Mission');
  const [expected]=await db.getItemFields([2070000628],['names.ja','iconGuid']);
  assert.equal(quest.identity.name,expected.values['names.ja']||null);
  assert.equal(quest.identity.locale,'ja');
  const details=await openCurrentItemDetails('',fetcher);
  assert.deepEqual(await details.getItemAcquisitionSourceDetails(ids,'ja'),rows);
  assert(!requests.some(url=>url.includes('/id/')||url.includes('/locale/')||url.includes('/text/')||url.includes('/acquisition/public/')));
  await assert.rejects(readItemAcquisitionSourceDetails(db,ids,'invalid'),/DB01_SOURCE_DETAILS_LOCALE/);
});
