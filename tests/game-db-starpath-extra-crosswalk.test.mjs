import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openPublicSharedGameSources} from '../src/lib/game-db/public-sources.ts';
import {
  createDb00StarpathRewardReader
} from '../src/lib/game-db/starpath-reward-crosswalk.ts';

const ROOT=new URL('../static/',import.meta.url);
const EXTRAS='starpath-reward-extras-2026-11-22.json';
function readFromPublic({corrupt=false}={}){
  const calls=[];
  const fetcher=async url=>{
    assert(typeof url==='string'&&url.startsWith('/Wand/')&&!url.includes('..'));
    calls.push(url);
    let bytes;
    try{bytes=readFileSync(new URL(url.slice(6),ROOT));}
    catch{return new Response('missing',{status:404});}
    if(corrupt&&url.endsWith('/'+EXTRAS)){
      bytes=Buffer.from(bytes);bytes[60]^=1;
    }
    return new Response(bytes,{status:200});
  };
  return {fetcher,calls};
}
let cached;
const open=()=>cached??=openPublicSharedGameSources('/Wand',readFromPublic().fetcher);

test('DB-00 authenticates 60 pinned Star Path IDs and loads the optional 17-row extra crosswalk once',async()=>{
  const {fetcher,calls}=readFromPublic();
  const app=await openPublicSharedGameSources('/Wand',fetcher);
  assert.equal(app.guide.itemIds.length,60);
  assert.equal(calls.length,30);
  assert.equal(calls.filter(x=>x.endsWith('/'+EXTRAS)).length,0);
  const reader=await app.loadStarpathRewardCrosswalk();
  assert.equal(reader,await app.loadStarpathRewardCrosswalk());
  assert.equal(reader.contract,'wand.game-db.starpath-reward-crosswalk@1');
  assert.equal(reader.sourceItemIds,60);
  assert.equal(reader.publicOriginalNames,43);
  assert.equal(reader.additionalOriginalNames,9);
  assert.equal(reader.unlabeledMotifs,8);
  assert.equal(calls.length,31);
  assert.equal(new Set(calls).size,31);
  assert.equal(calls.filter(x=>x.endsWith('/'+EXTRAS)).length,1);
  assert.equal(calls.filter(x=>x.endsWith('/starpath-cache-2026-11-22.json')).length,1);
  assert(Object.isFrozen(reader));
});

test('every 1.26.2 Star Path source reward has exact name provenance; all 8 Touch-of-Magic motifs stay unnamed',async()=>{
  const app=await open();
  const reader=await app.loadStarpathRewardCrosswalk();
  const expectedStates={
    public_original_name:43,original_extra_name:9,no_native_motif_name:8
  };
  const byState=new Map();
  const rows=reader.search({limit:100});
  assert.equal(rows.total,60);
  assert.equal(rows.items.length,60);
  assert.equal(rows.scope,'pinned_starpath_reward_source_only');
  assert.equal(rows.seasonCatalogComplete,false);
  assert.equal(rows.currentAvailabilityVerified,false);
  assert.equal(rows.guaranteedGrantVerified,false);
  assert.equal(rows.playerOwnershipVerified,false);
  assert.equal(rows.collectionUiMembershipVerified,false);
  assert.deepEqual(rows.items.map(x=>x.itemId),
    [...app.guide.itemIds].sort((a,b)=>Number(a)-Number(b)));
  for(const row of rows.items){
    byState.set(row.nameState,(byState.get(row.nameState)??0)+1);
    assert(row.relations.length>0);
    assert.deepEqual(row.relations,app.guide.getItemRelations(row.itemId));
    assert.deepEqual(row.item,app.getItem(row.itemId));
    assert.equal(row.guaranteedGrantVerified,false);
    assert.equal(row.currentAvailabilityVerified,false);
    assert.equal(row.playerOwnershipVerified,false);
    assert.equal(row.collectionUiMembershipVerified,false);
    assert.equal(row.configuredRewardsOnly,true);
    assert(row.seasonIds.length>0);
    assert(Object.isFrozen(row));
    assert(Object.isFrozen(row.relations));
    assert(Object.isFrozen(row.seasonIds));
    if(row.nameState==='no_native_motif_name'){
      assert.equal(row.extraNativeCategory,'TouchOfMagic');
      assert.equal(row.exactOriginalDisplayName,null);
      assert.equal(reader.getItem(row.itemId,'en').exactOriginalDisplayName,null);
      assert.equal(reader.getItem(row.itemId,'ja').exactOriginalDisplayName,null);
    }else{
      assert(typeof row.exactOriginalDisplayName==='string');
      assert(row.exactOriginalDisplayName.length>0);
      for(const locale of ['en','ja','pt-BR']){
        const localized=reader.getItem(row.itemId,locale);
        assert(typeof localized.exactOriginalDisplayName==='string');
        assert(localized.exactOriginalDisplayName.length>0);
      }
      if(row.nameState==='original_extra_name')assert(row.extraNativeCategory!==null);
      else assert.equal(row.extraNativeCategory,null);
    }
  }
  assert.deepEqual(Object.fromEntries(byState),expectedStates);
  assert.equal(reader.search({nameState:'public_original_name'}).total,43);
  assert.equal(reader.search({nameState:'original_extra_name'}).total,9);
  assert.equal(reader.search({nameState:'no_native_motif_name'}).total,8);
  assert.equal(reader.search({extraNativeCategory:'TouchOfMagic'}).total,8);
  assert.equal(reader.getItem('99999999'),null);
  assert(Object.isFrozen(rows));
  assert(Object.isFrozen(rows.items));
});

test('Star Path native-name search preserves localized exact labels, source categories, season and pages',async()=>{
  const app=await open();
  const reader=await app.loadStarpathRewardCrosswalk();
  const names=reader.search({nameState:'original_extra_name',locale:'ja'});
  const named=names.items[0];
  assert(named);
  const query=named.exactOriginalDisplayName.slice(0,2);
  assert(reader.search({text:query,locale:'ja'}).items.some(
    x=>x.itemId===named.itemId));
  assert(reader.search({text:named.itemId,locale:'en'}).items.some(
    x=>x.itemId===named.itemId));
  const all=reader.search({limit:500});
  const p1=reader.search({limit:11});
  const p2=reader.search({offset:p1.nextOffset??0,limit:11});
  assert.deepEqual([...p1.items,...p2.items].map(x=>x.itemId),
    all.items.slice(0,22).map(x=>x.itemId));
  assert(Object.isFrozen(p1));
  const season=app.guide.seasons[0];
  const selected=reader.search({seasonId:season.id});
  assert(selected.total>0);
  assert(selected.items.every(item=>item.seasonIds.includes(season.id)));
  const missing=reader.search({seasonId:'NonexistentSeason2026'});
  assert.equal(missing.total,0);
  assert.equal(reader.search({nameState:'no_native_motif_name',
    extraNativeCategory:'Building'}).total,0);
  const published=reader.search({publishedOnly:true});
  assert(published.total>0);
  assert(published.items.every(row=>row.item.catalog!==null));
  assert.throws(()=>reader.search({locale:'ko'}),/INVALID_LOCALE/);
  assert.throws(()=>reader.search({nameState:'assumed'}),/INVALID_NAME_STATE/);
  assert.throws(()=>reader.search({extraNativeCategory:'premium_shop'}),
    /INVALID_EXTRA_CATEGORY/);
  assert.throws(()=>reader.search({seasonId:'../private'}),/INVALID_SEASON/);
  assert.throws(()=>reader.search({text:'bad\nname'}),/INVALID_TEXT/);
  assert.throws(()=>reader.search({publishedOnly:false}),/INVALID_PUBLISHED_FILTER/);
  assert.throws(()=>reader.search({limit:501}),/INVALID_PAGE/);
  assert.throws(()=>reader.search({offset:-1}),/INVALID_PAGE/);
  assert.throws(()=>reader.getItem('00031400173'),/invalid numeric Item ID/);
});

test('extra names are read-only native evidence and cannot promote rewards into ownership or origins',async()=>{
  const app=await open();
  const reader=await app.loadStarpathRewardCrosswalk();
  const first=reader.search({nameState:'original_extra_name',limit:1}).items[0];
  assert(first);
  const joined=app.getItem(first.itemId);
  assert.equal(joined.catalogStatus,first.item.catalogStatus);
  assert.deepEqual(joined.origins,first.item.origins);
  assert.deepEqual(joined.starpathRelations,first.item.starpathRelations);
  assert.equal(joined.playerOwnershipVerified,false);
  assert.equal(first.playerOwnershipVerified,false);
  assert(!Object.hasOwn(first,'verifiedMediaPath'));
  assert(!Object.hasOwn(first,'currentSaleWindow'));
  const response=reader.search({nameState:'no_native_motif_name'});
  assert(response.items.every(row=>row.exactOriginalDisplayName===null));
  assert.equal(app.guide.coverage.currentAvailabilityVerified,false);
});

test('byte tampering in optional reward extra data fails closed; base DB remains usable',async()=>{
  const {fetcher,calls}=readFromPublic({corrupt:true});
  const app=await openPublicSharedGameSources('/Wand',fetcher);
  assert.equal(calls.length,30);
  assert.equal(app.database.itemCount,13202);
  await assert.rejects(app.loadStarpathRewardCrosswalk(),
    /Star Path reward extras: fingerprint mismatch/);
  assert.equal(app.searchItems({limit:1}).total,13202);
  assert.equal(calls.filter(x=>x.endsWith('/'+EXTRAS)).length,1);
});
