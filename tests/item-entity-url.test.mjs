import test from 'node:test';
import assert from 'node:assert/strict';
import {entityItemId,itemEntityHref} from '../src/lib/items/entity-item-url.ts';
test('shared native primary URL is independent of service and version',()=>{
 assert.equal(itemEntityHref('/Wand',40005160),'/Wand/40005160/');
 assert.equal(itemEntityHref('/Wand',40005160,'ja'),'/Wand/ja/40005160/');
 assert.equal(itemEntityHref('',40005160,'pt-BR'),'/pt-BR/40005160/');
 for(const invalid of ['0','01','-1','1e3','9007199254740992','1/2'])assert.equal(entityItemId(invalid),null);
 assert.throws(()=>itemEntityHref('/Wand',0));
});
