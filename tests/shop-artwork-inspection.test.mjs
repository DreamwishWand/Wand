import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectShopArtwork} from '../src/lib/media/shop-artwork-inspection.ts';
import {createShopSourceReader} from '../src/lib/media/shop-source-media.ts';
const g='1'.repeat(32),a='a'.repeat(64),b='b'.repeat(64),address='guid:'+g;
const reader=createShopSourceReader({schema:'wand.media.shop-source-release@2',state:'published',gameVersion:'1.26.2',publicationAuthorized:true,publicReadbackVerified:true,renderingVerified:false,
 references:{[g]:{Sprite:[a,a],Texture2D:[b,b]}},images:{[a]:{width:100,height:200,bytes:1000},[b]:{width:200,height:200,bytes:1200}}});
const revision={revisionSha256:'c'.repeat(64),artwork:{image:address,background:address,lightLayout:'Light_Mega_11',megaImages:{OverridedImage1:address}},components:[{itemId:123,quantity:1,image:address}]};
test('preview resolves each source type independently and never certifies composition',()=>{
 const result=inspectShopArtwork(revision,reader,1500);
 assert.equal(result.renderingVerified,false);
 assert.equal(result.rows[0].sprite.original.sha256,a);
 assert.equal(result.rows[0].texture.original.sha256,b);
 assert.equal(result.slots[0].image.original.sha256,a);
 assert.equal(result.slots[1].image,null);
 assert.equal(result.rows.at(-1).itemId,123);
});
test('missing layout and unresolved Icon type are not inferred',()=>{
 const noLayout=inspectShopArtwork({...revision,artwork:{layout:'Light_Dual',image:address}},reader,1500);
 assert.equal(noLayout.template,null);
 const icons=inspectShopArtwork({...revision,artwork:{lightLayout:'Light_Single_111'}},reader,1500);
 assert(icons.slots.every(s=>s.image===null));
 assert.equal(icons.rows.at(-1).sprite.original.sha256,a);
 assert.equal(icons.rows.at(-1).texture.original.sha256,b);
 assert.equal(inspectShopArtwork(revision,reader,0).template,null);
});
