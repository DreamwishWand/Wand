import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openPublicItemMaster} from '../src/lib/items/public-item-master.ts';

const project=resolve(fileURLToPath(new URL('..',import.meta.url)));
const script=join(project,'tools/db-01-items/materialize-public-master.mjs');
const output=join(project,'static');

test('13,202 verified Item-ID master rows are materialized for both Vite and Pages',async()=>{
  const generated=spawnSync(process.execPath,[script],{cwd:project,encoding:'utf8'});
  assert.equal(generated.status,0,generated.stderr||generated.stdout);
  const fetcher=async url=>{
    const path=join(output,url.replace(/^\//,''));
    const bytes=readFileSync(path);
    return new Response(bytes,{status:200,headers:{'content-type':'application/json'}});
  };
  const master=await openPublicItemMaster('',fetcher);
  assert.equal(master.release.count,13202);
  assert.equal(master.release.coverage.itemIconGuid,13202);
  assert.equal(master.release.coverage.itemNamesVerified,11492);
  assert.equal(master.release.coverage.sourceTagReferences,60814);
  const ids=[40005160,40006110,40300045,40005160];
  const rows=await master.getItems(ids);
  assert.equal(rows.length,4);
  assert.equal(rows[0]?.itemId,40005160);
  assert.equal(rows[0]?.names.ja,'ガラスの靴');
  assert.equal(rows[0]?.names.en,'Glass Shoe');
  assert.equal(rows[0]?.iconGuid,'ee85e95b0e61be642af03833a4942ae7');
  assert.deepEqual(rows[0]?.tags.map(t=>t.key),
    ['White','Bedroom','Decor','F_Elegant','LivingRoom','IsDreamlightValley']);
  assert.ok(rows[0]?.collectionSourceCandidates.some(c=>
    c.setId===2120000062&&c.universeTagKey==='Cinderella'));
  assert.equal(rows[0]?.collectionMembershipVerified,false);
  assert.equal(rows[1]?.names.en,'Decorative Picnic Basket');
  assert.equal(rows[2]?.itemType.subtypeName,'Door');
  assert.deepEqual(rows[3],rows[0]);
  assert.equal((await master.getItem(40005160))?.names.ja,'ガラスの靴');
  assert.equal(await master.getItem(1),null);
});
