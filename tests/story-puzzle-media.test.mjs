import test from 'node:test';
import assert from 'node:assert/strict';
import index from '../data/ddv/media/story-puzzle-steam-1.26.2.json' with {type:'json'};
import {getStoryPuzzleImage} from '../src/lib/media/story-puzzle-media.ts';
import {itemMedia} from '../src/lib/media/item-media.ts';
test('all reviewed Story IDs resolve all four exact image roles',async()=>{
  assert.equal(Object.keys(index.items).length,54);
  assert.equal(Object.keys(index.images).length,216);
  for(const [id,row] of Object.entries(index.items)){
    for(const [role,sha] of Object.entries({...row.image,icon:row.icon,blurredIcon:row.blurredIcon})){
      const image=getStoryPuzzleImage(Number(id),role);
      assert.equal(image.sha256,sha);
      assert.equal(image.url,'https://media.dreamwishwand.com/images/'+sha+'.webp');
      assert.equal(image.width,index.images[sha].width);
      assert.equal(image.height,index.images[sha].height);
      if(role==='thumbnail')assert.ok(Math.max(image.width,image.height)<=512);
    }
    assert.deepEqual(await itemMedia.getItemImage(Number(id)),getStoryPuzzleImage(Number(id)));
    assert.deepEqual(await itemMedia.getItemImage(Number(id),'original'),getStoryPuzzleImage(Number(id),'original'));
  }
});
test('unknown and non-Story IDs remain unresolved when common release is disabled',async()=>{
  assert.equal(await itemMedia.getItemImage(200000002),null);
  assert.equal(await itemMedia.getItemImage(257),null);
  assert.equal(getStoryPuzzleImage(200000001,'unknown'),null);
});
