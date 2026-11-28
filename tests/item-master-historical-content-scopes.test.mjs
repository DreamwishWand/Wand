import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';

test('explicit historical native content scope, AND-only gate and linked grant evidence retain separate meanings',async()=>{
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{requests.push(url);return new Response(await readFile('static'+url),{status:200});});
  const data=JSON.parse(await readFile('data/ddv/item-master/historical-content-scope-steam-1261.json','utf8'));
  const confirmed=await db.findItemIdsByContent({kind:'confirmed_release',releaseId:'dlc.the-keepsake-sea'});
  assert.equal(confirmed.itemIds.length,565);
  const nativeScope=await db.findItemIdsByField('history.nativeContentScope',{kind:'equals',value:'Expansion04Main'});
  assert.deepEqual(nativeScope,data.scopeRows.map(r=>r[0]));
  assert(nativeScope.every(id=>confirmed.itemIds.includes(id)));
  assert.equal((await db.findItemIdsByField('history.contentAttributionEvidenceKind',{kind:'equals',value:'verified_native_content_scope'})).length,490);
  const gates=new Map(await db.getFieldRows('history.expansionGateEvidence'));
  assert.equal(gates.size,53);
  for(const [id,,cls,field,n,sha,paths] of data.gateRows){
    assert.deepEqual(gates.get(id),[{expansion:'Expansion04',sourceClass:cls,sourceField:field,
      sourceFieldNumber:n,rootSha256:sha,positiveAndPaths:paths,sourceGameVersion:'1.26.1',
      runtimeAvailabilityVerified:false,accountEntitlementVerified:false}]);
  }
  const grants=new Map(await db.getFieldRows('history.gatedGrantOriginEvidence'));
  assert.equal(grants.size,11);
  for(const [event,id,amount,role] of data.grantRows)
    assert.deepEqual(grants.get(id),[{sourceEventItemId:event,role,amount,requiredSourceExpansion:'Expansion04',
      sourceGameVersion:'1.26.1',runtimeGrantVerified:false}]);
  const [mission,dialogue,group,gate,boat,unmapped]=await db.getItemContentOrigins(
    [2070001610,2030000166,2070200385,1520003251,170500004,2070200428]);
  for(const r of [mission,dialogue]){assert.equal(r.attribution,'confirmed');assert.equal(r.contentReleaseId,'dlc.the-keepsake-sea');}
  for(const r of [group,gate,boat]){assert.equal(r.attribution,'candidate');assert.equal(r.contentReleaseId,null);}
  assert.equal(unmapped.contentReleaseId,null);
  assert(!requests.some(u=>u.includes('/id/')||u.includes('/locale/')||u.includes('/text/')));
});
