import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
test('DLC catalog visibility requirements corroborate attribution, not grants or store membership',async()=>{
  const db=await openCurrentItemDatabase('',async url=>new Response(await readFile('static'+url),{status:200}));
  const doc=JSON.parse(await readFile('data/ddv/item-master/historical-expansion-catalog-gates-steam-1261.json','utf8'));
  const evidence=new Map(await db.getFieldRows('history.corroboratedExpansionCatalogGateEvidence'));
  assert.equal(evidence.size,41);
  for(const [i,cat,n,ordinal,kind,target,level,rootSha] of doc.rows){
    const [e]=evidence.get(i);
    assert.equal(e.kind,kind);assert.equal(e.sourceItemId,target);assert.equal(e.minimumFriendshipLevel,level);
    assert.equal(e.sourceFieldNumber,n);assert.equal(e.positiveAndLeafOrdinal,ordinal);assert.equal(e.rootSha256,rootSha);
    assert.equal(e.catalogVisibilityOnly,true);assert.equal(e.grantVerified,false);assert.equal(e.runtimeAvailabilityVerified,false);
  }
  const confirmed=await db.findItemIdsByContent({kind:'confirmed_release',releaseId:'dlc.the-keepsake-sea'});
  assert.equal(confirmed.itemIds.length,800);
  assert([...evidence.keys()].every(i=>confirmed.itemIds.includes(i)));
  assert.equal((await db.findItemIdsByField('history.contentAttributionEvidenceKind',{kind:'equals',value:'verified_expansion_tag_and_catalog_gate'})).length,41);
  const [mission,character,friend,other]=await db.getItemContentOrigins([40006108,40006411,50000463,40006771]);
  for(const row of [mission,character,friend])assert.equal(row.contentReleaseId,'dlc.the-keepsake-sea');
  assert.equal(other.contentReleaseId,null);
});
