import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLLECTION_INTERFACE_LANGUAGES,COLLECTION_INTERFACE_COPY,
  collectionInterfaceCopy
} from '../src/lib/collection/interface-copy.ts';

test('Collection control labels cover all eight current Wand languages',()=>{
  assert.deepEqual([...COLLECTION_INTERFACE_LANGUAGES],
    ['ja','en','fr','it','de','es-ES','zh-CN','pt-BR']);
  assert.deepEqual(Object.keys(COLLECTION_INTERFACE_COPY).sort(),
    [...COLLECTION_INTERFACE_LANGUAGES].sort());
  const keys=Object.keys(COLLECTION_INTERFACE_COPY.ja).sort();
  assert.ok(keys.length>=55,'all current controls and statuses must be localized');
  for(const locale of COLLECTION_INTERFACE_LANGUAGES){
    const copy=collectionInterfaceCopy(locale);
    assert.deepEqual(Object.keys(copy).sort(),keys,
      locale+' must neither omit nor invent visible UI controls');
    for(const key of keys){
      assert.equal(typeof copy[key],'string',locale+' '+key);
      assert.equal(copy[key].trim(),copy[key],locale+' '+key+' stray spaces');
      assert.ok(copy[key].length>0&&copy[key].length<=160,locale+' '+key);
      assert.ok(!/[\x00-\x1f]/.test(copy[key]),locale+' '+key+' control chars');
      assert.ok(!/[<>]/.test(copy[key]),locale+' '+key+' markup injection');
    }
    assert.notEqual(copy.owned,copy.missing);
    assert.notEqual(copy.unrecorded,copy.owned);
    assert.notEqual(copy.markMissing,copy.markOwned);
    assert.notEqual(copy.allMissing,copy.allOwned);
  }
  assert.deepEqual(collectionInterfaceCopy('unsupported'),COLLECTION_INTERFACE_COPY.en);
});
test('original item data and user status remain locale-independent',()=>{
  const ja=collectionInterfaceCopy('ja'),en=collectionInterfaceCopy('en');
  assert.equal(ja.searchLabel,'8言語のアイテム名で検索');
  assert.equal(ja.favoritesOnly,'お気に入りのみ表示');
  assert.equal(ja.filters,'フィルター');
  assert.equal(ja.closeDetails,'詳細を閉じる');
  assert.equal(en.searchLabel,'Search item names in all 8 languages');
  assert.equal(en.owned,'Owned / unlocked');
  assert.equal(en.noItems,'No matching items');
  assert.ok(!Object.values(COLLECTION_INTERFACE_COPY).some(copy=>
    Object.values(copy).some(text=>/v1\.25|Switch v1\.25/.test(text))),
    'the current Collection UI must not claim to display stale v1.25 source data');
});
