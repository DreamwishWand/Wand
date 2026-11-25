import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {openCurrentItemDetails} from '../src/lib/items/public-item-details.ts';
import {readItemTaxonomyDetails} from '../src/lib/items/public-item-taxonomy-details.ts';

test('localized taxonomy keeps exact original tag occurrences, browse association and source series separate',async()=>{
  const requests=[];
  const fetcher=async url=>{requests.push(url);return new Response(await readFile('static'+url),{status:200});};
  const db=await openCurrentItemDatabase('',fetcher);
  const ids=[20100031,20100056,20100000,40000047,30200020,99999999,20100031];
  const result=await readItemTaxonomyDetails(db,ids,'ja');
  const fields=['nativeCategory','itemType.subtypeCode','itemType.subtypeName','tags','universeSourceStatus',
    'universeTagIds','universeDirectTagIds','universeSetTagIds','universePredicateTagIds','browse.universeTagIds',
    'browse.universeAssociation','worldTagIds','sourceSetItemId'];
  const source=await db.getItemFields(ids,fields);
  assert.equal(result[5],null);assert.deepEqual(result[0],result[6]);
  for(const [i,r] of result.entries()){
    if(!r)continue;
    const v=source[i].values;
    assert.equal(r.nativeCategory,v.nativeCategory);
    assert.equal(r.nativeSubtypeCode,v['itemType.subtypeCode']);
    assert.equal(r.universeStatus,v.universeSourceStatus);
    assert.deepEqual(r.tags.map(({identity,...tag})=>tag),v.tags);
    assert.deepEqual(r.originalUniverseIds,v.universeTagIds);
    assert.deepEqual(r.directUniverseIds,v.universeDirectTagIds);
    assert.deepEqual(r.setUniverseIds,v.universeSetTagIds);
    assert.deepEqual(r.predicateUniverseIds,v.universePredicateTagIds);
    assert.deepEqual(r.browseUniverseIds,v['browse.universeTagIds']??v.universeTagIds);
    assert.deepEqual(r.worldIds,v.worldTagIds);
    assert.equal(r.sourceSetItemId,v.sourceSetItemId);
    assert.equal(r.worldMembershipVerified,false);
    assert.equal(r.placementLegalityVerified,false);
    const labels=[...r.originalUniverses,...r.browseUniverses,...r.worlds,...r.tags.map(t=>t.identity),r.sourceSet].filter(Boolean);
    for(const label of labels){
      assert.equal(label.locale,'ja');
      const [expected]=await db.getItemFields([label.itemId],['nativeCategory','names.ja','iconGuid']);
      assert.equal(label.nativeCategory,expected.values.nativeCategory);
      assert.equal(label.name,expected.values['names.ja']||null);
    }
  }
  assert.equal(result[0].browseAssociation.kind,'named_stall_character_association');
  assert.deepEqual(result[0].browseUniverseIds,[2000500061]);
  assert.equal(result[0].browseUniverses[0].itemId,2000500061);
  assert.equal(result[2].browseAssociation,null);
  const details=await openCurrentItemDetails('',fetcher);
  assert.deepEqual(await details.getItemTaxonomyDetails(ids,'ja'),result);
  assert(!requests.some(url=>url.includes('/id/')||url.includes('/locale/')||url.includes('/text/')||url.includes('/acquisition/public/')||url.endsWith('/collection-facets.json')));
  await assert.rejects(readItemTaxonomyDetails(db,ids,'invalid'),/DB01_TAXONOMY_LOCALE/);
});
