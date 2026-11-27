import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseLocalNativePreview,nativeEditorExtent,editorViewToNativeCanvas,requiredLocalImages,localNativeImageSource} from '../src/lib/media/native-local-preview.ts';
const bytes=Uint8Array.from([1,2,3]),sha=createHash('sha256').update(bytes).digest('hex');
const texture={kind:'texture',unitQuadToCanvas:[16,0,0,16,0,0],rgba:[1,1,1,1],imageSha256:sha,size:[2,2],wrap:[1,1],colorSpace:'sRGB'};
const doc={schema:'wand.media.native-local-preview@1',gameVersion:'1.26.2',privateOnly:true,publicationAuthorized:false,worldPlacementVerified:false,maps:[{id:'MapVillage04',width:16,height:16,ticksToCanvas:[2,0,0,2,8,4],locked:[texture],unlocked:[texture]}]};
test('private native map plan preserves editor coordinate basis',()=>{
 const maps=parseLocalNativePreview(doc),m=maps[0];
 assert.deepEqual(nativeEditorExtent(m),{x:-4,y:-2,w:8,h:8});
 assert.deepEqual(editorViewToNativeCanvas(m,nativeEditorExtent(m)),{x:0,y:0,width:16,height:16});
 assert.deepEqual([...requiredLocalImages(maps)],[[sha,[2,2]]]);
 for(const invalid of [{...doc,publicationAuthorized:true},{...doc,worldPlacementVerified:true},{...doc,maps:[{...doc.maps[0],ticksToCanvas:[0,0,0,1,0,0]}]}])assert.throws(()=>parseLocalNativePreview(invalid));
});
test('local source rejects missing and modified images before decoding',async()=>{
 const maps=parseLocalNativePreview(doc),layer=maps[0].locked[0];
 assert.throws(()=>localNativeImageSource([],maps));
 const bad=localNativeImageSource([new File([Uint8Array.of(0)],sha+'.png')],maps);
 await assert.rejects(bad(layer),/digest mismatch/);
 const good=localNativeImageSource([new File([bytes],sha+'.png')],maps);
 const previous=globalThis.createImageBitmap;let calls=0;
 try{
  globalThis.createImageBitmap=async()=>({width:2,height:2,close(){calls++;}});
  (await good(layer)).close();assert.equal(calls,1);
  const abort=new AbortController();abort.abort();await assert.rejects(good(layer,abort.signal));
 }finally{if(previous)globalThis.createImageBitmap=previous;else delete globalThis.createImageBitmap;}
});
