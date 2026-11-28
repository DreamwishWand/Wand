import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {attachSwitchSourceObservations} from '../tools/db-01-items/switch-source-observations.mjs';
import {openPublicItemMaster} from '../src/lib/items/public-item-master.ts';
const fetcher=async url=>new Response(await readFile('static'+url),{status:200});
test('Switch source evidence preserves existing Steam introduction and content facts',()=>{
  const history=new Map([[40005160,{firstObservedVersion:'1.25.3',introducedVersion:null,contentReleaseId:null}],
    [10000012,{firstObservedVersion:'1.25.3',introducedVersion:'1.25.3',contentReleaseId:'version.25'}],
    [40006771,{firstObservedVersion:'1.26.1',introducedVersion:'1.26.1',contentReleaseId:null}]]);
  const meta=attachSwitchSourceObservations(process.cwd(),history);
  assert.equal(meta.observedUnionCount,34726);
  assert.equal(meta.commonCount,33815);
  assert.equal(meta.laterOnlyCount,906);
  assert.equal(meta.earlierOnlyCount,5);
  assert.equal(meta.canonicalItemCount,2);
  assert.equal(meta.earlierThanSteamIntroductionCount,1);
  assert.deepEqual(history.get(40005160).switchObservedVersions,['1.24.1','1.24.11']);
  assert.equal(history.get(10000012).switchFirstObservedVersion,'1.24.11');
  assert.equal(history.get(10000012).introducedVersion,'1.25.3');
  assert.equal(history.get(10000012).contentReleaseId,'version.25');
  assert.equal(history.get(40006771).switchObservedVersions,undefined);
  assert.equal(meta.gameWideIntroductionVerified,false);
});
test('canonical Switch observations support sparse field queries without changing Steam history',async()=>{
  const requests=[];
  const db=await openPublicItemMaster('',url=>{requests.push(url);return fetcher(url)},{scope:'complete'});
  const [old,later,newer,unknown]=await db.getItemFields([40005160,10000012,40006771,99999999],
    ['history.switchFirstObservedVersion','history.switchObservedVersions','history.introducedVersion']);
  assert.equal(old.values['history.switchFirstObservedVersion'],'1.24.1');
  assert.deepEqual(old.values['history.switchObservedVersions'],['1.24.1','1.24.11']);
  assert.equal(later.values['history.switchFirstObservedVersion'],'1.24.11');
  assert.equal(newer.values['history.switchFirstObservedVersion'],undefined);
  assert.equal(newer.values['history.introducedVersion'],'1.26.1');
  assert.equal(unknown,null);
  const observed=await db.findItemIdsByContent({kind:'switch_observed_version',version:'1.24.11'});
  const first=await db.findItemIdsByContent({kind:'switch_first_observed_version',version:'1.24.11'});
  assert.equal(observed.status,'indexed');
  assert(observed.itemIds.includes(40005160)&&observed.itemIds.includes(10000012));
  assert(first.itemIds.includes(10000012)&&!first.itemIds.includes(40005160));
  assert(!observed.itemIds.includes(40006771));
  assert(!requests.some(u=>u.includes('/id/')||u.includes('/locale/')||u.includes('/text/')));
});
