import test from 'node:test';
import assert from 'node:assert/strict';
import {createShopSourceReader,loadShopSourceMedia} from '../src/lib/media/shop-source-media.ts';
const a='a'.repeat(64),b='b'.repeat(64),g='1'.repeat(32);
const doc={schema:'wand.media.shop-source-release@1',state:'published',gameVersion:'1.26.2',publicationAuthorized:true,publicReadbackVerified:true,renderingVerified:false,
  references:{[g]:[a,b]},images:{[a]:{width:1024,height:512,bytes:1024},[b]:{width:512,height:256,bytes:512}}};
test('source images are exact GUID matches and list uses 512px asset',()=>{
  const r=createShopSourceReader(doc);
  assert.equal(r.url('guid:'+g),'https://media.dreamwishwand.com/images/'+b+'.webp');
  assert.equal(r.url('guid:'+g,'original'),'https://media.dreamwishwand.com/images/'+a+'.webp');
  assert.equal(r.get(g),null);assert.equal(r.get('guid:'+'2'.repeat(32)),null);
  const rev={revisionSha256:'c'.repeat(64),artwork:{image:'guid:'+g,megaImages:{OverridedImage2:'guid:'+g}},
    components:[{itemId:1,quantity:3,image:'guid:'+g},{itemId:2,quantity:4}]};
  const result=r.resolveRevision(rev);
  assert.equal(result.renderingVerified,false);assert.equal(result.image.thumbnail.sha256,b);
  assert.equal(result.megaImages[0],null);assert.equal(result.megaImages[1],result.image);
  assert.deepEqual(result.components.map(x=>[x.itemId,x.quantity,x.explicitImage!==null]),[[1,3,true],[2,4,false]]);
});
test('source candidates, malformed pairs and unused images are rejected',()=>{
  for(const d of [{...doc,publicReadbackVerified:false},{...doc,renderingVerified:true},{...doc,gameVersion:'1.24.1'},
    {...doc,references:{[g]:[a,a]}},{...doc,images:{...doc.images,['c'.repeat(64)]:doc.images[b]}}]){
    assert.throws(()=>createShopSourceReader(d),/Shop source/);
  }
  assert.equal(createShopSourceReader({state:'unpublished'}).get('guid:'+g),null);
});
