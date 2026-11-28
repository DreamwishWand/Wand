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

test('Steam source default is independent of old Layout; never applied to Switch or unknown layouts',()=>{
 const v={...revision,gameVersion:'1.26.2',artwork:{layout:'Single_122',image:address,adjustImage:true,imageAdjustment:{FillMode:'FitInParent',MarginBottom:70}}};
 const res=inspectShopArtwork(v,reader,1500);
 assert.equal(res.native.layout,'Light_Dual');
 assert.equal(res.native.layoutDefaulted,true);
 assert.equal(res.template.layout,'Light_Dual');
 assert.equal(res.slots[0].image.original.sha256,a);
 assert.deepEqual(res.slots[0].adjustment,{fill:'contain',margins:[0,0,70,0]});
 assert.equal(inspectShopArtwork({...v,gameVersion:'1.24.1'},reader,1500).template,null);
 assert.equal(inspectShopArtwork({...v,artwork:{...v.artwork,layout:'Single_Mega_11'}},reader,1500).slots[0].image,null);
 assert.equal(inspectShopArtwork({...v,artwork:{...v.artwork,lightLayout:'unknown'}},reader,1500).template,null);
 assert.equal(inspectShopArtwork({...v,artwork:{...v.artwork,adjustImage:false}},reader,1500).slots[0].adjustment,null);
});
test('explicit native adjustment translates signed offsets and source enum values',async()=>{
 const {nativeShopAdjustment}=await import('../src/lib/media/shop-native-artwork.ts');
 assert.deepEqual(nativeShopAdjustment({FillMode:'EnvelopeParent',MarginTop:-5,MarginRight:20,MarginBottom:30,MarginLeft:40}),{fill:'cover',margins:[-5,20,30,40]});
 assert.deepEqual(nativeShopAdjustment({}),{fill:'cover',margins:[0,0,0,0]});
 assert.equal(nativeShopAdjustment({FillMode:'unknown'}),null);
 assert.equal(nativeShopAdjustment({MarginTop:NaN}),null);
});
test('current Steam catalog uses native default and resolves all explicit typed Shop references',async()=>{
 const {readFile}=await import('node:fs/promises');
 const catalog=JSON.parse(await readFile('data/ddv/item-master/premium-bundles-public.json','utf8'));
 const release=JSON.parse(await readFile('data/ddv/media/shop-sources-steam-1.26.2.json','utf8'));
 const r=createShopSourceReader(release);
 let count=0,defaults=0;
 for(const d of catalog.definitions){
   if(d.current?.gameVersion!=='1.26.2')continue;
   count++;
   const result=inspectShopArtwork(d.current,r,1500);
   assert(result.native,d.bundleId);
   assert(result.template,d.bundleId);
   assert.equal(result.renderingVerified,false);
   if(result.native.layoutDefaulted)defaults++;
   for(const row of result.rows){
     if(row.address==null||row.address==='')continue;
     if(row.field==='Background')assert(row.texture,d.bundleId+' '+row.field);
     else if(row.field.startsWith('Contents.')){assert(row.sprite,d.bundleId+' '+row.field);assert(row.texture,d.bundleId+' '+row.field);}
     else assert(row.sprite,d.bundleId+' '+row.field);
   }
 }
 assert(count>0);assert(defaults>0);
});
