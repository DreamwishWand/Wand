import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseNativeCdnPreview,openNativePreviewPack} from '../src/lib/media/native-cdn-preview.ts';
const bytes=Uint8Array.from({length:20},(_,i)=>i),sha=createHash('sha256').update(bytes).digest('hex');
const layer={kind:'texture',unitQuadToCanvas:[2,0,0,2,0,0],rgba:[1,1,1,1],imageSha256:sha,size:[2,2],wrap:[1,1],colorSpace:'sRGB'};
const doc={schema:'wand.media.native-cdn-preview@1',gameVersion:'1.26.2',privateOnly:true,publicationAuthorized:false,worldPlacementVerified:false,cdnVerified:true,sourcePixelsVerified:true,images:{[sha]:{width:2,height:2,bytes:20}},maps:[{id:'MapVillage04',width:2,height:2,ticksToCanvas:[1,0,0,1,0,0],locked:[layer],unlocked:[layer]}]};
const response=b=>new Response(b,{headers:{'Content-Type':'image/webp'}});
test('CDN pack resolves lazily through only canonical content addresses',async()=>{
 let calls=0,decoded=0;
 const pack=parseNativeCdnPreview(doc,async(url,init)=>{calls++;assert.equal(url,'https://media.dreamwishwand.com/images/'+sha+'.webp');assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');return response(bytes);});
 assert.equal(calls,0);
 const old=globalThis.createImageBitmap;
 try{globalThis.createImageBitmap=async()=>{decoded++;return {width:2,height:2,close(){}}};(await pack.source(layer)).close();assert.equal(calls,1);assert.equal(decoded,1);}finally{if(old)globalThis.createImageBitmap=old;else delete globalThis.createImageBitmap;}
});
test('CDN preview rejects missing source proof and incomplete image coverage',()=>{
 for(const d of [{...doc,cdnVerified:false},{...doc,sourcePixelsVerified:false},{...doc,publicationAuthorized:true},{...doc,worldPlacementVerified:true},{...doc,images:{}},{...doc,images:{[sha]:{width:1,height:2,bytes:20}}}])assert.throws(()=>parseNativeCdnPreview(d));
});
test('changed, oversized, truncated and non-WebP bodies are rejected before decode',async()=>{
 for(const body of [new Uint8Array(20),new Uint8Array(21),new Uint8Array(19)])await assert.rejects(parseNativeCdnPreview(doc,async()=>response(body)).source(layer));
 await assert.rejects(parseNativeCdnPreview(doc,async()=>new Response(bytes,{headers:{'Content-Type':'image/png'}})).source(layer));
 const c=new AbortController();c.abort();await assert.rejects(parseNativeCdnPreview(doc,async()=>{throw Error('unexpected network')}).source(layer,c.signal));
});
test('a CDN manifest can be opened alone without local PNGs',async()=>{
 const file=new File([JSON.stringify(doc)],'manifest.json');const pack=await openNativePreviewPack([file]);assert.equal(pack.maps[0].id,'MapVillage04');
 await assert.rejects(openNativePreviewPack([file,new File([bytes],'extra.png')]));
});
