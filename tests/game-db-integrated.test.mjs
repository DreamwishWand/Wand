import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {
  SharedGameDatabase,verifyFactOverlay,openSharedGameDatabase,
  FACT_OVERLAY_SCHEMA
} from '../src/lib/game-db/integrated.ts';
const target={platform:'Steam',gameVersion:'1.26.2',buildId:null,sourceSha256:'a'.repeat(64)};
const row=(id)=>({id,names:{en:'Test '+id},nameStatus:'verified',category:'Source Activity Items',
  subcategory:null,worlds:[],universes:[],contentIds:[],releaseIds:[],relations:[],
  sourceRefs:['source']});
const current=()=>({schema:'wand.game-db.snapshot@1',id:'synthetic',target,
  coverage:{scope:'4 native categories',complete:true,categories:['ActivityItem'],
    semanticCategoriesVerified:false},
  sources:[{id:'source',sha256:'b'.repeat(64),visibility:'public_reference'}],
  releases:[],publishable:true,items:[row('40005160'),row('40006110')]});
const old=()=>({index:{t:{platform:'Nintendo Switch',gameVersion:'1.25.0',
  buildID:'52BD625D9B4E0053'},f:['Furniture'],c:['READ_ONLY'],
  m:['UNLOCK_OR_AVAILABILITY'],w:['Valley','Eternity'],u:['Alice','Frozen'],
  e:['BaseGame','Expansion01']},
  rows:[[40005160,0,0,0,[0,1],[0,1],[0,1],['Old','Old','Old','Old','Old','Old','Old','Old']]]});
const pack=(id,stream,rows)=>({schema:FACT_OVERLAY_SCHEMA,id,stream,target,
  sourceId:'source-'+stream,sourceSha256:'b'.repeat(64),
  scope:'source field checked for exact Item ID',rows});
const encode=x=>new TextEncoder().encode(JSON.stringify(x));
test('source-empty is unknown, historical worlds/universes/DLC never current verified',()=>{
  const db=new SharedGameDatabase(current(),old());
  const x=db.getItem(40005160);
  assert.equal(x.currentCategoryLabel,'Source Activity Items');
  assert.equal(x.facts.category.state,'unverified');
  assert.deepEqual(x.historical.worlds.value,['Valley','Eternity']);
  for(const name of ['worlds','universes','dlc']){
    assert.equal(x.facts[name].state,'unverified');
    assert.equal(x.facts[name].value,null);
    assert.equal(x.historical[name].currentVersionVerified,false);
  }
  assert.equal(x.facts.acquisition.state,'not_covered');
  assert.equal(db.getItem('40006110').historical.dlc,null);
  assert.equal(db.getItem('99999999'),null);
  assert.equal(db.coverage().fields.worlds.historicalCandidates,1);
});
test('exact current independent overlay proves multiple values, not ownership',async()=>{
  const db=new SharedGameDatabase(current(),old());
  const o=pack('db01','DB-01',[{itemId:'40005160',facts:[
    {field:'category',state:'verified',value:'Furniture'},
    {field:'worlds',state:'verified',value:['Valley','Eternity']},
    {field:'universes',state:'verified',value:['Alice','Frozen']},
    {field:'dlc',state:'verified',value:['BaseGame','Expansion01']}
  ]}]);
  const bytes=encode(o);
  await assert.rejects(verifyFactOverlay(bytes,'f'.repeat(64)),/SHA_MISMATCH/);
  const expected=createHash('sha256').update(bytes).digest('hex');
  db.attachOverlay(await verifyFactOverlay(bytes,expected));
  assert.equal(db.getItem(40005160).facts.worlds.provenance.stream,'DB-01');
  assert.deepEqual(db.getItem(40005160).facts.dlc.value,['BaseGame','Expansion01']);
  assert.equal(db.coverage().fields.worlds.verified,1);
  assert.equal(db.coverage().fields.worlds.unverified,1);
  assert.equal(db.getItem(40005160).historical.worlds.currentVersionVerified,false);
  assert.throws(()=>db.attachOverlay(o),/INVALID_OR_REUSED_OVERLAY/);
  assert.throws(()=>db.attachOverlay({...pack('stale','DB-01',[]),
    target:{...target,sourceSha256:'f'.repeat(64)}}),/CURRENT_SOURCE_TARGET_MISMATCH/);
  assert.throws(()=>db.attachOverlay(pack('wrong-owner','DB-02',[
    {itemId:'40006110',facts:[{field:'worlds',state:'verified',value:['Valley']}]}
  ])),/FIELD_OWNER_OR_DUPLICATE/);
});
test('explicit no-results is different from not-applicable and not-covered',()=>{
  const db=new SharedGameDatabase(current());
  assert.throws(()=>db.attachOverlay(pack('no-proof','DB-03',[
    {itemId:'40005160',facts:[{field:'starpaths',state:'verified',value:[]}]}
  ])),/VERIFIED_ARRAY_REQUIRES_SOURCE_EVIDENCE/);
  assert.throws(()=>db.attachOverlay(pack('bad-absence','DB-03',[
    {itemId:'40005160',facts:[{field:'starpaths',state:'not_applicable'}]}
  ])),/ABSENCE_MUST_BE_VERIFIED/);
  db.attachOverlay(pack('guide','DB-03',[
    {itemId:'40005160',facts:[
      {field:'starpaths',state:'verified',value:[],emptyVerified:true},
      {field:'events',state:'verified',value:['eventA','eventB']}
    ]},
    {itemId:'40006110',facts:[
      {field:'starpaths',state:'not_applicable',absenceVerified:true}
    ]}
  ]));
  assert.deepEqual(db.getItem(40005160).facts.starpaths.value,[]);
  assert.equal(db.getItem(40006110).facts.starpaths.state,'not_applicable');
  assert.equal(db.getItem(40006110).facts.events.state,'not_covered');
  assert.deepEqual(db.coverage().fields.starpaths,
    {verified:1,notApplicable:1,unverified:0,notCovered:0,historicalCandidates:0,total:2});
});
test('conflicts and unrecognized item keys fail atomically',()=>{
  const db=new SharedGameDatabase(current());
  db.attachOverlay(pack('first','DB-01',[{itemId:'40005160',facts:[
    {field:'worlds',state:'verified',value:['Valley']}
  ]}]));
  assert.throws(()=>db.attachOverlay(pack('conflicting','DB-01',[
    {itemId:'40005160',facts:[{field:'worlds',state:'verified',value:['Other']}]},
    {itemId:'40006110',facts:[{field:'worlds',state:'verified',value:['Eternity']}]}
  ])),/CONFLICTING_CURRENT_EVIDENCE/);
  assert.equal(db.getItem(40006110).facts.worlds.state,'unverified');
  assert.throws(()=>db.attachOverlay(pack('unknown','DB-04',[
    {itemId:'99999',facts:[{field:'worldRegions',state:'verified',value:['region']}]}
  ])),/OVERLAY_ID_NOT_COVERED_OR_DUPLICATE/);
  assert.throws(()=>db.attachHistorical({...old(),index:{...old().index,
    t:{...old().index.t,gameVersion:'1.26.2'}}}),/HISTORY_VERSION_MISMATCH/);
});
test('shared API reads the published Steam 1.26.2 13,202 item database',async()=>{
  const root=resolve(new URL('..',import.meta.url).pathname);
  const local=async(url)=>{
    try{return new Response(await readFile(join(root,'static',url.replace(/^\/Wand\//,''))),{status:200});}
    catch(e){if(e?.code==='ENOENT')return new Response('',{status:404});throw e;}
  };
  const db=await openSharedGameDatabase('/Wand',local);
  assert.equal(db.itemCount,13202);
  assert.equal(db.getItem('30000031').names.ja,'ピュアナイトシャード');
  const coverage=db.coverage();
  assert.deepEqual([coverage.nameVerified,coverage.nameUnverified],[11492,1710]);
  for(const key of ['worlds','universes','dlc']){
    assert.equal(coverage.fields[key].unverified,13202);
    assert.equal(db.getItem('30000031').facts[key].state,'unverified');
  }
  assert.equal(coverage.fields.events.notCovered,13202);
});
