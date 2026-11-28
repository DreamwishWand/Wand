import test from 'node:test';
import assert from 'node:assert/strict';
import {readExploreBrowseSnapshot} from '../src/lib/explore/browse-snapshot.ts';
import {itemEntityHref} from '../src/lib/items/entity-item-url.ts';
test('history state is sanitized without storing game data, Save contents or a duplicate board',()=>{
 const result=readExploreBrowseSnapshot({schema:1,scope:'indoor',search:'chair',filters:{categories:['seating','invalid'],worlds:['base'],universes:['2000500017'],tags:{color:['Blue'],furnitureStyle:['Modern']}},ownedOnly:true,boardsOpen:true,selectedId:40000047,variantIds:[40000047,40000048,0],scrollY:789,anchor:{universe:'2000500017',index:20,offset:-4}});
 assert.equal(result.scope,'indoor');assert.deepEqual(result.filters.categories,['seating']);
 assert.deepEqual(result.filters.tags.color,['Blue']);assert.equal(result.ownedOnly,true);
 assert.equal(result.selectedId,40000047);assert.deepEqual(result.variantIds,[40000047,40000048]);
 assert.equal(result.scrollY,789);assert.equal(result.anchor.index,20);
 assert.equal(readExploreBrowseSnapshot({schema:2}),null);
});
test('common item URL uses locale and stable primary ID',()=>{
 assert.equal(itemEntityHref('/Wand',40000047,'ja'),'/Wand/ja/40000047/');
 assert.equal(itemEntityHref('',40000047,'en'),'/en/40000047/');
 assert.equal(itemEntityHref('/Wand',40000047),'/Wand/40000047/');
 assert.throws(()=>itemEntityHref('/Wand',0,'en'));
});
