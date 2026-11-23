import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalCollectionItemId,
  collectionItemIdFromSearch,
  collectionItemHref,
  collectionItemFromLink
} from '../src/lib/collection/item-permalink.ts';

test('canonical public Collection Item links use only exact positive safe IDs',()=>{
  assert.equal(collectionItemHref('/Wand',40005160),'/Wand/collection/?item=40005160');
  assert.equal(collectionItemHref('',40005160),'/collection/?item=40005160');
  assert.equal(collectionItemHref('/preview/Wand',1),'/preview/Wand/collection/?item=1');
  assert.equal(collectionItemIdFromSearch('?item=40005160'),40005160);
  assert.equal(collectionItemIdFromSearch('item=40005160&ref=guide'),40005160);
  assert.equal(collectionItemIdFromSearch('?ref=guide&item=40005160'),40005160);
  assert.equal(collectionItemIdFromSearch('?item=9007199254740991'),Number.MAX_SAFE_INTEGER);
  assert.equal(canonicalCollectionItemId('40005160'),40005160);
});

test('malformed duplicate, ambiguous, invalid and noncanonical item links fail closed',()=>{
  const bad=[
    '', '?', '?item=', '?item=0', '?item=-1', '?item=+1',
    '?item=001', '?item=1.0', '?item=1e3',
    '?item=%31%00', '?item=9007199254740992',
    '?item=1&item=2', '?item=1&item=1', '?item=NaN', '?item=Infinity',
    '?item=1%2F2', '?item=1%26ref%3Dhack', '?item=40005160&item=',
    '?item=40005160&item=99999999'
  ];
  for(const query of bad)assert.equal(collectionItemIdFromSearch(query),null,query);
  assert.equal(collectionItemIdFromSearch('?item='+('1'.repeat(2100))),null);
  assert.equal(canonicalCollectionItemId(40005160),null,'IDs must be canonical URL strings');
  for(const invalid of [0,-1,Number.MAX_SAFE_INTEGER+1,NaN,Infinity,1.5])
    assert.throws(()=>collectionItemHref('/Wand',invalid),/INVALID_ITEM_LINK/);
  for(const invalid of ['/Wand/../private','//other','https://example.com','/Wand?redirect=1'])
    assert.throws(()=>collectionItemHref(invalid,1),/INVALID_ITEM_LINK/);
});

test('only Rust-confirmed Item identities are accepted, no synthetic membership',()=>{
  const seen=[];
  const lookup={
    item(id,locale){
      seen.push({id,locale});
      if(id===40005160)return {itemId:id,label:'Glass Shoe',family:'Furniture'};
      if(id===40005161)return {itemId:99999999,label:'forged mismatch'};
      throw Error('COLLECTION_ITEM_MISSING');
    }
  };
  assert.deepEqual(collectionItemFromLink(lookup,'?item=40005160','en'),
    {itemId:40005160,label:'Glass Shoe',family:'Furniture'});
  assert.equal(collectionItemFromLink(lookup,'?item=40005161','ja'),null);
  assert.equal(collectionItemFromLink(lookup,'?item=90000000','ja'),null);
  assert.equal(collectionItemFromLink(lookup,'?item=40005160&item=40005160','ja'),null);
  assert.deepEqual(seen,[
    {id:40005160,locale:'en'},
    {id:40005161,locale:'ja'},
    {id:90000000,locale:'ja'}
  ]);
});
