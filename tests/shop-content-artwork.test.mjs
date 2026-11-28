import test from 'node:test';
import assert from 'node:assert/strict';
import {readShopContentArtwork} from '../src/lib/media/shop-content-artwork.ts';
const asset={original:{sha256:'a'.repeat(64)},thumbnail:{sha256:'b'.repeat(64)}};
const item={url:'https://media.dreamwishwand.com/images/item.webp'};
test('explicit native source image takes precedence; unresolved override never falls back',async()=>{
 const requested=[];
 const components=[{itemId:1,quantity:2,image:'guid:known'},{itemId:2,quantity:1,image:'guid:missing'},{itemId:3,quantity:4},{itemId:3,quantity:5},{itemId:4,quantity:1}];
 const rows=await readShopContentArtwork({components},{get:(address,kind)=>address==='guid:known'&&kind==='Sprite'?asset:null},{getItemImage:async(id,variant)=>{requested.push([id,variant]);if(id===4)throw new Error('network');return item;}},'original');
 assert.deepEqual(rows.map(r=>[r.position,r.component.itemId,r.component.quantity,r.kind]),[[0,1,2,'explicit'],[1,2,1,'explicit'],[2,3,4,'item'],[3,3,5,'item'],[4,4,1,'missing']]);
 assert.equal(rows[0].sprite,asset);
 assert.equal(rows[0].texture,null);
 assert.equal(rows[1].item,null);
 assert.equal(rows[1].sprite,null);
 assert.equal(rows[2].item,item);
 assert.deepEqual(requested,[[3,'original'],[4,'original']]);
});
test('typed explicit references remain separate and canonical thumbnails are default',async()=>{
 const texture={...asset,original:{sha256:'c'.repeat(64)}};
 const rows=await readShopContentArtwork({components:[{itemId:1,quantity:1,image:'guid:dual'},{itemId:2,quantity:1}]},{get:(_,kind)=>kind==='Sprite'?asset:texture},{getItemImage:async(id,variant)=>{assert.equal(id,2);assert.equal(variant,'thumbnail');return item;}});
 assert.equal(rows[0].sprite,asset);assert.equal(rows[0].texture,texture);assert.equal(rows[1].item,item);
});
