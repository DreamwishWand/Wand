import test from 'node:test';
import assert from 'node:assert/strict';
import {
  joinDb01OriginalCollectionWithPublishedDb00 as createPinnedReader,
  DB01_DB00_COLLECTION_RESULTS_CONTRACT,
} from './db00-source-results.ts';
import {DB01_SOURCE_MENU_INDEX_SCHEMA} from './collection-source-index.ts';
import {DB00_SOURCE_JOIN_CONTRACT} from '../game-db/source-join.ts';

const SHA='a'.repeat(64);
const SNAPSHOT='steam-1.26.2-native-itemlist-v1';
// Supply this pin independently: source.source.sourceItemsSha256 is untrusted
// until compared with a trusted, caller-owned original release digest.
function joinDb01OriginalCollectionWithPublishedDb00(source,publicJoined,pin=SHA){
  return createPinnedReader(source,publicJoined,pin);
}
function fixture(count=6){
  const calls={search:0,joined:0,query:[]};
  const rows=Array.from({length:count},(_,i)=>({
    itemId:100+i,locale:'en',nativeCategory:i%3===0?'Furniture':'ActivityItem',
    currentExactName:i===2?null:'Exact '+i,
    currentExactNameVerified:i!==2,
    matchedSourceLinks:[{
      collectionSetId:2120000001,submenuCode:3,submenu:'FurnitureSets',
      groupIndexes:[0],directGroupIndexes:i%2===0?[0]:[],
      predicateGroupIndexes:i%2!==0?[0]:[],
      directOriginalListing:i%2===0,sourcePredicateMatches:i%2,
      gameRuntimeMembershipVerified:false,worldAvailabilityVerified:false,
    }],
    gameRuntimeMembershipVerified:false,worldAvailabilityVerified:false,
  }));
  const source={
    schema:DB01_SOURCE_MENU_INDEX_SCHEMA,
    source:{gameVersion:'1.26.2',sourceItemsSha256:SHA},
    search:async query=>{
      calls.search++;calls.query.push(query);
      let matching=rows.map(r=>({...r,locale:query.locale}));
      if(query.searchText)
        matching=matching.filter(row=>
          row.currentExactName?.toLowerCase().includes(query.searchText.toLowerCase())||
          String(row.itemId).includes(query.searchText));
      const offset=query.offset??0,limit=query.limit??100;
      const items=matching.slice(offset,offset+limit);
      return {
        locale:query.locale,total:matching.length,itemIds:items.map(x=>x.itemId),
        items,hasMore:offset+items.length<matching.length,
        sourceOnly:true,gameRuntimeMembershipVerified:false,
        worldAvailabilityVerified:false,dlcOwnershipVerified:false,
      };
    },
  };
  const published=new Map(rows.filter((_,i)=>i%3!==1).map(x=>[x.itemId,{
    id:String(x.itemId),nameStatus:'verified',nativeCategory:x.nativeCategory,
    names:x.currentExactName===null?{}:{en:x.currentExactName,ja:'名前'+x.itemId},
    facts:{},historical:{},
  }]));
  const publicReader={
    contract:DB00_SOURCE_JOIN_CONTRACT,snapshotId:SNAPSHOT,
    getItems(ids){
      calls.joined++;
      return ids.map(itemId=>{
        const item=published.get(itemId)??null;
        return {
          itemId:String(itemId),catalog:item,
          catalogStatus:item?'current_published_item':
            'outside_published_item_scope',
          origins:item?[{itemId:String(itemId),routeStatus:'confirmed_source_link',
            availability:'not_live_verified'}]:null,
          starpathRelations:item?[{itemId:String(itemId),
            configuredRewardOnly:true}]:null,
          nativeTags:{status:'not_loaded',worldsDirect:[],
            gameUiMembershipVerified:false},
          currentlyAvailableVerified:false,playerOwnershipVerified:false,
        };
      });
    },
  };
  return {source,publicReader,calls,rows,published};
}

test('only current published Item IDs are returned; source-only IDs remain withheld',async()=>{
  const f=fixture(),reader=joinDb01OriginalCollectionWithPublishedDb00(
    f.source,f.publicReader);
  const result=await reader.search({locale:'en'},{offset:0,limit:10});
  assert.equal(reader.contract,DB01_DB00_COLLECTION_RESULTS_CONTRACT);
  assert.equal(reader.target.publicationAuthorized,false);
  assert.equal(result.snapshotId,SNAPSHOT);
  assert.equal(result.privateSourceJoin,true);
  assert.equal(result.publicationAuthorized,false);
  assert.equal(result.totalOriginalSourceCandidates,6);
  assert.equal(result.totalPublishedMatches,4);
  assert.equal(result.unpublishedSourceDefinitionCount,2);
  assert.deepEqual(result.items.map(x=>x.itemId),[100,102,103,105]);
  assert.equal(result.items[0].joined.origins[0].itemId,'100');
  assert.equal(result.items[0].joined.starpathRelations[0].itemId,'100');
  assert.equal(result.items[0].originalSource.matchedSourceLinks[0].collectionSetId,2120000001);
  assert.equal(result.items[0].originalCategoryIsGameUiVerified,false);
  assert.equal(result.items[0].playerOwnershipVerified,false);
  assert.equal(result.items[0].acquisitionWorldVerified,false);
  assert.equal(result.worldAvailabilityVerified,false);
  assert.equal(result.dlcEntitlementVerified,false);
  assert.equal(Object.isFrozen(result),true);
  assert.equal(Object.isFrozen(result.items),true);
  assert.equal(Object.isFrozen(result.items[0]),true);
});

test('no inferred fallback for absent exact names and independent DB00 name agreement status',async()=>{
  const f=fixture();
  f.published.get(103).names.en='Translated differently';
  const reader=joinDb01OriginalCollectionWithPublishedDb00(f.source,f.publicReader);
  const result=await reader.search({locale:'en'});
  assert.equal(result.items[0].currentNameAgreement,'identical');
  assert.equal(result.items[1].currentExactName,null);
  assert.equal(result.items[1].currentExactNameVerified,false);
  assert.equal(result.items[1].currentNameAgreement,'source_missing');
  assert.equal(result.items[2].currentNameAgreement,'different');
  assert.equal(result.items[2].joined.catalog.names.en,'Translated differently');
  assert.equal(result.items[2].currentExactName,'Exact 3');
  assert.equal(result.items[3].currentNameAgreement,'identical');
});

test('pagination happens AFTER public ID filtering, never on source candidate offsets',async()=>{
  const f=fixture(),reader=joinDb01OriginalCollectionWithPublishedDb00(
    f.source,f.publicReader);
  const first=await reader.search({locale:'en'},{offset:1,limit:2});
  assert.deepEqual(first.items.map(x=>x.itemId),[102,103]);
  assert.equal(first.totalPublishedMatches,4);
  assert.equal(first.nextOffset,3);
  assert.equal(first.hasMore,true);
  const last=await reader.search({locale:'en'},{offset:3,limit:2});
  assert.deepEqual(last.items.map(x=>x.itemId),[105]);
  assert.equal(last.nextOffset,null);
  assert.equal(last.hasMore,false);
  const beyond=await reader.search({locale:'en'},{offset:50,limit:10});
  assert.deepEqual(beyond.items,[]);
  assert.equal(beyond.nextOffset,null);
});

test('existing original exact-name filter and locale are forwarded without guessing source categories',async()=>{
  const f=fixture(),reader=joinDb01OriginalCollectionWithPublishedDb00(
    f.source,f.publicReader);
  const found=await reader.search({searchText:'Exact 5',
    submenuCodes:[3],locale:'en'});
  assert.deepEqual(found.items.map(x=>x.itemId),[105]);
  assert.equal(found.totalOriginalSourceCandidates,1);
  assert.equal(f.calls.query[0].submenuCodes[0],3);
  const withheld=await reader.search({searchText:'101',locale:'en'});
  assert.equal(withheld.totalOriginalSourceCandidates,1);
  assert.equal(withheld.totalPublishedMatches,0);
  assert.equal(withheld.unpublishedSourceDefinitionCount,1);
  assert.deepEqual(withheld.items,[]);
});

test('multi-page source search does not drop or duplicate published Item IDs',async()=>{
  const f=fixture(2003),reader=joinDb01OriginalCollectionWithPublishedDb00(
    f.source,f.publicReader);
  const page=await reader.search({locale:'en'},{offset:700,limit:50});
  const expected=f.rows.filter(x=>f.published.has(x.itemId));
  assert.equal(page.totalOriginalSourceCandidates,2003);
  assert.equal(page.totalPublishedMatches,expected.length);
  assert.deepEqual(page.items.map(x=>x.itemId),
    expected.slice(700,750).map(x=>x.itemId));
  assert.equal(f.calls.search,3);
  assert.equal(f.calls.joined,3);
  assert.equal(f.calls.query[0].offset,0);
  assert.equal(f.calls.query[1].offset,1000);
  assert.equal(f.calls.query[2].offset,2000);
});

test('reject mismatched versions, hashes and DB00 published release before any source access',()=>{
  const f=fixture();
  assert.throws(()=>joinDb01OriginalCollectionWithPublishedDb00(
    {...f.source,source:{...f.source.source,gameVersion:'1.25.0'}},
    f.publicReader),/PINNED_CURRENT_PRIVATE_AND_PUBLISHED_READERS_REQUIRED/);
  assert.throws(()=>joinDb01OriginalCollectionWithPublishedDb00(
    {...f.source,source:{...f.source.source,sourceItemsSha256:'invalid'}},
    f.publicReader),/PINNED_CURRENT_PRIVATE_AND_PUBLISHED_READERS_REQUIRED/);
  assert.throws(()=>joinDb01OriginalCollectionWithPublishedDb00(
    f.source,{...f.publicReader,snapshotId:'legacy-switch-1.25.0'}),
    /PINNED_CURRENT_PRIVATE_AND_PUBLISHED_READERS_REQUIRED/);
  assert.equal(f.calls.search,0);
});

test('reject unbounded pages, disguised source-page offsets, unknown language before private reads',async()=>{
  const f=fixture(),reader=joinDb01OriginalCollectionWithPublishedDb00(
    f.source,f.publicReader);
  await assert.rejects(reader.search({locale:'en',offset:9}),
    /INVALID_SOURCE_QUERY_PAGINATION/);
  await assert.rejects(reader.search({locale:'en',limit:9}),
    /INVALID_SOURCE_QUERY_PAGINATION/);
  await assert.rejects(reader.search({locale:'en-US'}),/UNSUPPORTED_SOURCE_LOCALE/);
  await assert.rejects(reader.search({locale:null}),/UNSUPPORTED_SOURCE_LOCALE/);
  await assert.rejects(reader.search({}, {offset:-1}),/INVALID_PAGE_RANGE/);
  await assert.rejects(reader.search({}, {limit:501}),/INVALID_PAGE_RANGE/);
  assert.equal(f.calls.search,0);
});

test('refuse unexpected private source counts and forged source UI membership',async()=>{
  const f=fixture(),original=f.source.search;
  const corrupted=joinDb01OriginalCollectionWithPublishedDb00(
    {...f.source,search:async q=>{
      const result=await original(q);
      return {...result,total:result.total+1};
    }},f.publicReader);
  await assert.rejects(corrupted.search({locale:'en'}),
    /ORIGINAL_SOURCE_PAGE_CORRUPTED/);
  const wrongUi=joinDb01OriginalCollectionWithPublishedDb00(
    {...f.source,search:async q=>{
      const result=await original(q);
      return {...result,items:result.items.map((x,i)=>i===0?
        {...x,gameRuntimeMembershipVerified:true}:x)};
    }},f.publicReader);
  await assert.rejects(wrongUi.search({locale:'en'}),
    /ORIGINAL_PUBLISHED_ID_OR_EVIDENCE_CONFLICT/);
});

test('refuse unrelated public Item IDs or different native item category',async()=>{
  const f=fixture(),original=f.publicReader.getItems.bind(f.publicReader);
  const wrongIds=joinDb01OriginalCollectionWithPublishedDb00(
    f.source,{...f.publicReader,getItems:ids=>original(ids).map((x,i)=>
      i===0?{...x,itemId:'999'}:x)});
  await assert.rejects(wrongIds.search({locale:'en'}),
    /ORIGINAL_PUBLISHED_ID_OR_EVIDENCE_CONFLICT/);
  const wrongCategory=joinDb01OriginalCollectionWithPublishedDb00(
    f.source,{...f.publicReader,getItems:ids=>original(ids).map((x,i)=>
      i===0?{...x,catalog:{...x.catalog,nativeCategory:'Wrong'}}:x)});
  await assert.rejects(wrongCategory.search({locale:'en'}),
    /PUBLISHED_NATIVE_ITEM_IDENTITY_MISMATCH/);
});

test('scroll pagination reuses the complete private source intersection and DB00 join once',async()=>{
  const f=fixture(2003),reader=joinDb01OriginalCollectionWithPublishedDb00(
    f.source,f.publicReader);
  const one=await reader.search({locale:'en',submenuCodes:[3]},{offset:0,limit:73});
  const two=await reader.search({submenuCodes:[3],locale:'en'},{offset:73,limit:73});
  const three=await reader.search({locale:'en',submenuCodes:[3]},{offset:146,limit:73});
  assert.equal(f.calls.search,3);
  assert.equal(f.calls.joined,3);
  assert.equal(one.totalPublishedMatches,two.totalPublishedMatches);
  assert.equal(two.totalPublishedMatches,three.totalPublishedMatches);
  assert.deepEqual([...one.items,...two.items,...three.items].map(x=>x.itemId),
    f.rows.filter(x=>f.published.has(x.itemId)).slice(0,219).map(x=>x.itemId));
});
test('concurrent scroll pages share one in-flight source read',async()=>{
  const f=fixture(1003),reader=joinDb01OriginalCollectionWithPublishedDb00(
    f.source,f.publicReader);
  const [a,b,c]=await Promise.all([
    reader.search({locale:'ja'},{offset:0,limit:35}),
    reader.search({locale:'ja'},{offset:35,limit:35}),
    reader.search({locale:'ja'},{offset:70,limit:35}),
  ]);
  assert.equal(f.calls.search,2);
  assert.equal(f.calls.joined,2);
  assert.deepEqual([...a.items,...b.items,...c.items].map(x=>x.itemId),
    f.rows.filter(x=>f.published.has(x.itemId)).slice(0,105).map(x=>x.itemId));
});
test('changing source criteria invalidates the cache but stable equivalent keys reuse it',async()=>{
  const f=fixture(),reader=joinDb01OriginalCollectionWithPublishedDb00(
    f.source,f.publicReader);
  await reader.search({locale:'en',searchText:'Exact 3'},{offset:0,limit:1});
  await reader.search({searchText:'Exact 3',locale:'en'},{offset:1,limit:1});
  assert.equal(f.calls.search,1);
  await reader.search({locale:'en',searchText:'Exact 5'});
  assert.equal(f.calls.search,2);
  await reader.search({locale:'en',searchText:'Exact 3'});
  assert.equal(f.calls.search,3);
});
test('in-flight caller mutation cannot change the validated source criteria',async()=>{
  const f=fixture(),reader=joinDb01OriginalCollectionWithPublishedDb00(
    f.source,f.publicReader);
  const categories=[3],query={locale:'en',submenuCodes:categories};
  const promise=reader.search(query);
  categories[0]=15;query.locale='ja';
  const result=await promise;
  assert.equal(result.locale,'en');
  assert.deepEqual(f.calls.query[0].submenuCodes,[3]);
  assert.equal(result.totalOriginalSourceCandidates,6);
});
test('independent original source SHA is mandatory and must not be copied from an untrusted client',()=>{
  const f=fixture();
  assert.throws(()=>createPinnedReader(f.source,f.publicReader),
    /PINNED_CURRENT_PRIVATE_AND_PUBLISHED_READERS_REQUIRED/);
  assert.throws(()=>createPinnedReader(f.source,f.publicReader,'b'.repeat(64)),
    /PINNED_CURRENT_PRIVATE_AND_PUBLISHED_READERS_REQUIRED/);
  assert.throws(()=>createPinnedReader(f.source,f.publicReader,'wrong'),
    /PINNED_CURRENT_PRIVATE_AND_PUBLISHED_READERS_REQUIRED/);
  assert.equal(f.calls.search,0);
  assert.equal(f.calls.joined,0);
});
test('invalid query object cannot share another cached result or reach original source',async()=>{
  const f=fixture(),reader=joinDb01OriginalCollectionWithPublishedDb00(
    f.source,f.publicReader);
  await reader.search({locale:'en'});
  assert.equal(f.calls.search,1);
  await assert.rejects(reader.search({searchText:()=> 'forge'}),
    /NON_JSON_QUERY_FIELD/);
  await assert.rejects(reader.search({searchText:Number.NaN}),
    /NON_JSON_QUERY_NUMBER/);
  const cycle={};cycle.self=cycle;
  await assert.rejects(reader.search({native:cycle}),/QUERY_DEPTH/);
  assert.equal(f.calls.search,1);
});
test('source scan failure evicts the incomplete census; identical filter retries correctly',async()=>{
  const f=fixture(),raw=f.source.search;
  let failOnce=true;
  const reader=joinDb01OriginalCollectionWithPublishedDb00({
    ...f.source,search:async q=>{
      if(failOnce){failOnce=false;throw Error('TRANSIENT_SOURCE_LOAD');}
      return raw(q);
    },
  },f.publicReader);
  await assert.rejects(reader.search({locale:'en'}),/TRANSIENT_SOURCE_LOAD/);
  const recovered=await reader.search({locale:'en'});
  assert.equal(recovered.totalPublishedMatches,4);
  assert.equal(f.calls.search,1);
  assert.equal(f.calls.joined,1);
});
