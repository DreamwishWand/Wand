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
const originalShaPins={
  'DB-01':['b'.repeat(64)],'DB-02':['b'.repeat(64)],
  'DB-03':['b'.repeat(64)],'DB-04':['b'.repeat(64)]
};
const encode=x=>new TextEncoder().encode(JSON.stringify(x));
async function attach(db,overlay) {
  const bytes=encode(overlay);
  const pin=createHash('sha256').update(bytes).digest('hex');
  await db.attachVerifiedOverlay(bytes,pin);
}
test('source-empty is unknown, historical worlds/universes/DLC never current verified',()=>{
  const db=new SharedGameDatabase(current(),old(),originalShaPins);
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
  const db=new SharedGameDatabase(current(),old(),originalShaPins);
  const o=pack('db01','DB-01',[{itemId:'40005160',facts:[
    {field:'category',state:'verified',value:'Furniture'},
    {field:'worlds',state:'verified',value:['Valley','Eternity']},
    {field:'universes',state:'verified',value:['Alice','Frozen']},
    {field:'dlc',state:'verified',value:['BaseGame','Expansion01']}
  ]}]);
  const bytes=encode(o);
  await assert.rejects(verifyFactOverlay(bytes,'f'.repeat(64)),/SHA_MISMATCH/);
  const expected=createHash('sha256').update(bytes).digest('hex');
  const verified=await verifyFactOverlay(bytes,expected);
  assert.ok(Object.isFrozen(verified));
  assert.ok(Object.isFrozen(verified.rows[0].facts[0]));
  assert.throws(()=>{verified.rows[0].facts[0].value='Forged';},TypeError);
  db.attachOverlay(verified);
  assert.equal(db.getItem(40005160).facts.worlds.provenance.stream,'DB-01');
  assert.deepEqual(db.getItem(40005160).facts.dlc.value,['BaseGame','Expansion01']);
  assert.equal(db.coverage().fields.worlds.verified,1);
  assert.equal(db.coverage().fields.worlds.unverified,1);
  assert.equal(db.getItem(40005160).historical.worlds.currentVersionVerified,false);
  assert.throws(()=>db.attachOverlay(verified),/INVALID_OR_REUSED_OVERLAY/);
  assert.throws(()=>db.attachOverlay(o),/UNVERIFIED_OVERLAY_BYTES/);
  const unpinned=new SharedGameDatabase(current());
  assert.throws(()=>unpinned.attachOverlay(verified),
    /INDEPENDENT_ORIGINAL_SOURCE_SHA_PIN_REQUIRED/);
  await assert.rejects(attach(db,{...pack('stale','DB-01',[]),
    target:{...target,sourceSha256:'f'.repeat(64)}}),/CURRENT_SOURCE_TARGET_MISMATCH/);
  await assert.rejects(attach(db,pack('wrong-owner','DB-02',[
    {itemId:'40006110',facts:[{field:'worlds',state:'verified',value:['Valley']}]}
  ])),/FIELD_OWNER_OR_DUPLICATE/);
});
test('explicit no-results is different from not-applicable and not-covered',async()=>{
  const db=new SharedGameDatabase(current(),undefined,originalShaPins);
  await assert.rejects(attach(db,pack('no-proof','DB-03',[
    {itemId:'40005160',facts:[{field:'starpaths',state:'verified',value:[]}]}
  ])),/VERIFIED_ARRAY_REQUIRES_SOURCE_EVIDENCE/);
  await assert.rejects(attach(db,pack('bad-absence','DB-03',[
    {itemId:'40005160',facts:[{field:'starpaths',state:'not_applicable'}]}
  ])),/ABSENCE_MUST_BE_VERIFIED/);
  await attach(db,pack('guide','DB-03',[
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
test('conflicts and unrecognized item keys fail atomically',async()=>{
  const db=new SharedGameDatabase(current(),undefined,originalShaPins);
  await attach(db,pack('first','DB-01',[{itemId:'40005160',facts:[
    {field:'worlds',state:'verified',value:['Valley']}
  ]}]));
  await assert.rejects(attach(db,pack('conflicting','DB-01',[
    {itemId:'40005160',facts:[{field:'worlds',state:'verified',value:['Other']}]},
    {itemId:'40006110',facts:[{field:'worlds',state:'verified',value:['Eternity']}]}
  ])),/CONFLICTING_CURRENT_EVIDENCE/);
  assert.equal(db.getItem(40006110).facts.worlds.state,'unverified');
  await assert.rejects(attach(db,pack('unknown','DB-04',[
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

test('reverse indexes distinguish current facts, unknown state and historical candidates',async()=>{
  const db=new SharedGameDatabase(current(),old(),originalShaPins);
  const h={scope:'historical_candidate',field:'worlds',values:['Valley']};
  const w={scope:'current',field:'worlds',values:['Valley']};
  assert.deepEqual(db.queryItems([h]).items.map(x=>x.id),['40005160']);
  assert.equal(db.queryItems([w]).total,0,'old Switch must not become Steam fact');
  assert.equal(db.queryItems([{scope:'current',field:'worlds',state:'unverified'}]).total,2);
  assert.equal(db.queryItems([{scope:'current',field:'acquisition',state:'not_covered'}]).total,2);
  assert.deepEqual(db.queryItems([],{limit:1}).items.map(x=>x.id),['40005160']);
  assert.equal(db.queryItems([],{limit:1}).nextOffset,1);
  assert.deepEqual(db.queryItems([],{offset:1}).items.map(x=>x.id),['40006110']);
  await attach(db,pack('current-world','DB-01',[{itemId:'40005160',facts:[
    {field:'worlds',state:'verified',value:['Valley','Eternity']},
    {field:'universes',state:'verified',value:['Alice','Frozen']}
  ]}]));
  assert.deepEqual(db.queryItems([w]).items.map(x=>x.id),['40005160'],
    'reverse index must invalidate after verified overlay');
  assert.deepEqual(db.queryItems([{scope:'current',field:'worlds',
    values:['Valley','Eternity'],match:'all'}]).items.map(x=>x.id),['40005160']);
  assert.equal(db.queryItems([{scope:'current',field:'worlds',
    values:['Valley','Elsewhere'],match:'all'}]).total,0);
  assert.equal(db.queryItems([w,{scope:'current',field:'universes',
    values:['Frozen']}]).total,1);
  assert.equal(db.queryItems([{scope:'current',field:'worlds',state:'unverified'}]).total,1);
  assert.equal(db.queryItems([h]).total,1,'historical and current evidence remain separate');
  assert.deepEqual(db.getItems([40005160,'99999999',40006110]).map(x=>x?.id??null),
    ['40005160',null,'40006110']);
  assert.throws(()=>db.queryItems([{scope:'current',field:'media',values:['fake']}]),
    /MEDIA_NOT_TEXT_SEARCHABLE/);
  assert.throws(()=>db.queryItems([{scope:'historical_candidate',field:'events',
    values:['fake']}]),/INVALID_HISTORICAL_FACET/);
  assert.throws(()=>db.queryItems([],{limit:1000}),/INVALID_QUERY_PAGE/);
});

test('shared database owns immutable release facts after caller mutates source object',()=>{
  const raw=current();
  raw.items[0].worlds.push('IsDreamlightValley');
  raw.items[0].names.en='Original';
  const db=new SharedGameDatabase(raw);
  const first=db.getItem('40005160');
  assert.deepEqual(first.facts.worlds.value,['IsDreamlightValley']);
  raw.items[0].worlds.push('ForgedWorld');
  raw.items[0].names.en='Forged';
  assert.deepEqual(db.getItem('40005160').facts.worlds.value,['IsDreamlightValley']);
  assert.equal(db.getItem('40005160').names.en,'Original');
  assert.ok(Object.isFrozen(db.getItem('40006110').facts.worlds));
  assert.throws(()=>{db.getItem('40006110').facts.worlds.state='verified'},TypeError);
});

test('current Steam 13202-item facet query never presents absent world as none',async()=>{
  const root=resolve(new URL('..',import.meta.url).pathname);
  const local=async(url)=>{
    try{return new Response(await readFile(join(root,'static',url.replace(/^\/Wand\//,''))),{status:200});}
    catch(e){if(e?.code==='ENOENT')return new Response('',{status:404});throw e;}
  };
  const db=await openSharedGameDatabase('/Wand',local);
  assert.equal(db.queryItems([{scope:'current',field:'worlds',state:'unverified'}],{limit:10}).total,13202);
  assert.equal(db.queryItems([{scope:'current',field:'worlds',state:'not_applicable'}]).total,0);
  assert.equal(db.queryItems([{scope:'current',field:'worlds',values:['IsDreamlightValley']}]).total,0);
});

test('facet summaries preserve current verification, history and multi-valued counts',async()=>{
  const db=new SharedGameDatabase(current(),old(),originalShaPins);
  const initial=db.summarizeFacet({scope:'current',field:'worlds'});
  assert.equal(initial.matchedItems,2);
  assert.deepEqual(initial.values,[]);
  assert.deepEqual(initial.states,{
    verified:0,not_applicable:0,unverified:2,not_covered:0
  });
  const history=db.summarizeFacet({scope:'historical_candidate',field:'worlds'});
  assert.deepEqual(history.values,[
    {value:'Eternity',itemCount:1},{value:'Valley',itemCount:1}
  ]);
  assert.equal(history.candidateItems,1);
  assert.equal(history.missingCandidates,1);
  assert.equal(db.summarizeFacet({scope:'current',field:'worlds'},
    [{scope:'historical_candidate',field:'worlds',values:['Valley']}])
    .states.unverified,1,'historical values must not verify current memberships');

  await attach(db,pack('classify','DB-01',[{itemId:'40005160',facts:[
    {field:'worlds',state:'verified',value:['Valley','Eternity']},
    {field:'universes',state:'verified',value:['Frozen','Alice']}
  ]}]));
  await attach(db,pack('events','DB-03',[{itemId:'40005160',facts:[
    {field:'events',state:'verified',value:['SeasonA','SeasonB']}
  ]}]));
  const worlds=db.summarizeFacet({scope:'current',field:'worlds'});
  assert.deepEqual(worlds.values,[
    {value:'Eternity',itemCount:1},{value:'Valley',itemCount:1}
  ]);
  assert.deepEqual(worlds.states,{
    verified:1,not_applicable:0,unverified:1,not_covered:0
  });
  assert.deepEqual(db.summarizeFacet({scope:'current',field:'events'},
    [{scope:'current',field:'universes',values:['Frozen']}]).values,[
      {value:'SeasonA',itemCount:1},{value:'SeasonB',itemCount:1}
    ]);
  assert.equal(db.summarizeFacet({scope:'current',field:'events'},
    [{scope:'current',field:'worlds',values:['NotPresent']}]).matchedItems,0);
  assert.equal(db.summarizeFacet({scope:'historical_candidate',field:'worlds'},
    [{scope:'current',field:'worlds',values:['Valley']}]).candidateItems,1);
  assert.ok(Object.isFrozen(worlds));
  assert.ok(Object.isFrozen(worlds.values));
  assert.ok(Object.isFrozen(worlds.states));
  assert.throws(()=>db.summarizeFacet({scope:'current',field:'media'}),
    /INVALID_FACET_REQUEST/);
  assert.throws(()=>db.summarizeFacet({scope:'historical_candidate',field:'events'}),
    /INVALID_FACET_REQUEST/);
  assert.throws(()=>db.summarizeFacet({scope:'current',field:'worlds'},
    Array.from({length:17},()=>({scope:'current',field:'worlds',state:'verified'}))),
    /INVALID_QUERY_FILTERS/);
});

test('public Steam facets refuse to convert unknown World into a filter option',async()=>{
  const root=resolve(new URL('..',import.meta.url).pathname);
  const local=async(url)=>{
    try{return new Response(await readFile(join(root,'static',url.replace('/Wand/',''))),{status:200});}
    catch(e){if(e?.code==='ENOENT')return new Response('',{status:404});throw e;}
  };
  const db=await openSharedGameDatabase('/Wand',local);
  const summary=db.summarizeFacet({scope:'current',field:'worlds'});
  assert.equal(summary.matchedItems,13202);
  assert.equal(summary.states.unverified,13202);
  assert.deepEqual(summary.values,[]);
});
