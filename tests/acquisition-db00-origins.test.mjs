import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAcquisitionOriginDatabase,starpathOriginRecords}
  from '../src/lib/acquisition/origins.ts';
import {joinDb02OriginsWithDb00} from '../src/lib/acquisition/db00-origins.ts';

const snapshot=JSON.parse(readFileSync(
  new URL('../static/guide/public/starpath-cache-2026-11-22.json',import.meta.url),'utf8'
));
const index=JSON.parse(readFileSync(
  new URL('../static/ddv/game-db/releases/steam-1.26.2-native-itemlist-v1/index.json',import.meta.url),'utf8'
));

test('DB00 can access the same DB02 known origins and preserve out-of-scope reward IDs',()=>{
  const {origins,campaigns}=starpathOriginRecords(snapshot);
  const original=origins.find(x=>x.itemId==='40006258');
  assert(original);
  const database=createAcquisitionOriginDatabase(origins,campaigns);
  // DB-00's real source-pinned v1.26.2 manifest plus representative
  // verified catalog ID (full ItemList is tested by DB-00's own suite).
  const db00={
    kind:'db_snapshot',
    id:index.id,
    target:index.target,
    coverage:index.coverage,
    items:[{id:'40006258',names:{en:'Representative furniture'},category:'Furniture'}]
  };
  const joined=joinDb02OriginsWithDb00(db00,database);
  assert.equal(joined.lookup('40006258').catalogClassification,'published_db00_item');
  assert.deepEqual(joined.lookup(40006258).origins,database.getItem(40006258).origins);
  assert.equal(joined.lookup('80100000').catalogClassification,'outside_published_db00_item_scope');
  assert(joined.lookup('80100000').origins.length>1);
  assert.equal(joined.lookup('80100000').availabilityVerified,false);
  assert.equal(joined.getCoverage().linkedDb00Items,1);
  assert.equal(joined.getCoverage().sourceLinkedItemIds,database.getCoverage().linkedItemIds);
});

test('DB00 join rejects cross-version, incomplete, or duplicate Item IDs',()=>{
  const database=createAcquisitionOriginDatabase([],[]);
  const base={
    kind:'db_snapshot',target:index.target,coverage:index.coverage,
    id:index.id,items:[{id:'42',names:{},category:null}]
  };
  assert.throws(()=>joinDb02OriginsWithDb00(
    {...base,target:{...index.target,gameVersion:'1.26.1'}},database
  ),/EXACT_SOURCE_SCOPE_REQUIRED/);
  assert.throws(()=>joinDb02OriginsWithDb00(
    {...base,coverage:{...index.coverage,complete:false}},database
  ),/EXACT_SOURCE_SCOPE_REQUIRED/);
  assert.throws(()=>joinDb02OriginsWithDb00({
    ...base,items:[base.items[0],base.items[0]]
  },database),/DUPLICATE_ITEM_ID/);
});
