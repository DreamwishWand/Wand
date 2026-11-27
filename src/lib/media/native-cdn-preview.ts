import {parseLocalNativePreview,requiredLocalImages,openLocalNativePreview,type LocalNativePreviewPack} from './native-local-preview.ts';
import {publicImageUrl} from './public-image-key.ts';
import type {ImageSource} from './native-map-renderer.ts';
const LIMIT=80*1024*1024;
const CACHE_LIMIT=64*1024*1024;
const PREFETCH_LIMIT=32*1024*1024;
const PREFETCH_COUNT=3;
const ORIGIN='https://media.dreamwishwand.com';
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function check(ok:unknown,msg:string):asserts ok{if(!ok)throw Error(msg);}
/** Private test manifest with source-pixel-checked CDN or R2 images. Each browser fetch still verifies bytes. Not placement or manifest publication authority. */
export function parseNativeCdnPreview(doc:unknown,request:typeof fetch=fetch,cacheLimit=CACHE_LIMIT):LocalNativePreviewPack{
 check(Number.isSafeInteger(cacheLimit)&&cacheLimit>=0&&cacheLimit<=CACHE_LIMIT,'Invalid encoded cache budget');
 check(record(doc)&&doc.sourcePixelsVerified===true&&record(doc.images),'Invalid map preview receipt');
 const verifiedCdn=doc.schema==='wand.media.native-cdn-preview@1'&&doc.cdnVerified===true;
 const verifiedR2=doc.schema==='wand.media.native-r2-preview@1'&&doc.canonicalMetadataVerified===true&&doc.cdnVerified===false;
 check(verifiedCdn||verifiedR2,'Unverified image delivery receipt');
 const maps=parseLocalNativePreview({...doc,schema:'wand.media.native-local-preview@1'});
 const required=requiredLocalImages(maps),images=new Map<string,number>();
 check(Object.keys(doc.images).length===required.size,'CDN image coverage mismatch');
 for(const [sha,sz] of required){
  const m=doc.images[sha];check(record(m)&&m.width===sz[0]&&m.height===sz[1]&&typeof m.bytes==='number'&&Number.isSafeInteger(m.bytes)&&m.bytes>=20&&m.bytes<=LIMIT,'CDN image metadata mismatch');images.set(sha,m.bytes);
 }
 const cache=new Map<string,Blob>();let resident=0;
 async function readVerified(layer:Parameters<ImageSource>[0],signal?:AbortSignal):Promise<Blob>{
  signal?.throwIfAborted();const size=images.get(layer.imageSha256);check(size,'Unknown CDN image');
  const old=cache.get(layer.imageSha256);
  if(old){cache.delete(layer.imageSha256);cache.set(layer.imageSha256,old);return old;}
  const response=await request(publicImageUrl(ORIGIN,'original',layer.imageSha256),{signal,mode:'cors',credentials:'omit',redirect:'error',cache:'default'});
  check(response.ok&&response.headers.get('content-type')?.split(';')[0].trim()==='image/webp'&&response.body,'CDN response invalid');
  const len=response.headers.get('content-length');check(len===null||Number(len)===size,'CDN length mismatch');
  const reader=response.body.getReader();let offset=0,finished=false;const bytes=new Uint8Array(size);
  try{
   while(true){signal?.throwIfAborted();const {done,value}=await reader.read();if(done){finished=true;break;}check(offset+value.length<=size,'CDN body exceeds verified size');bytes.set(value,offset);offset+=value.length;}
   check(offset===size,'CDN body truncated');
  }finally{if(!finished)await reader.cancel().catch(()=>{});reader.releaseLock();}
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  check(digest===layer.imageSha256,'CDN image digest mismatch');signal?.throwIfAborted();
  return new Blob([bytes],{type:'image/webp'});
 }
 async function decode(layer:Parameters<ImageSource>[0],blob:Blob,signal?:AbortSignal){
  signal?.throwIfAborted();
  const bitmap=await createImageBitmap(blob,{colorSpaceConversion:'none',premultiplyAlpha:'none',imageOrientation:'none'});
  if(signal?.aborted||bitmap.width!==layer.size[0]||bitmap.height!==layer.size[1]){bitmap.close();signal?.throwIfAborted();throw Error('CDN image dimensions mismatch');}
  if(blob.size<=cacheLimit&&!cache.has(layer.imageSha256)){
   for(const [key,value] of cache){if(resident+blob.size<=cacheLimit)break;cache.delete(key);resident-=value.size;}
   cache.set(layer.imageSha256,blob);resident+=blob.size;
  }
  return bitmap;
 }
 const source:ImageSource=async(layer,signal)=>decode(layer,await readVerified(layer,signal),signal);
 source.beginFrame=parent=>{
  const controller=new AbortController(),signal=controller.signal;
  const abort=()=>controller.abort(parent?.reason);
  if(parent?.aborted)abort();else parent?.addEventListener('abort',abort,{once:true});
  type Outcome={ok:true;blob:Blob}|{ok:false;error:unknown};
  const staged=new Map<string,{bytes:number;result:Promise<Outcome>}>();
  let reserved=0;
  const prefetch=(rows:readonly Parameters<ImageSource>[0][])=>{
   if(signal.aborted)return;
   for(const row of rows){
    const sha=row.imageSha256,bytes=images.get(sha);
    if(cache.has(sha)||staged.has(sha))continue;
    if(!bytes||staged.size>=PREFETCH_COUNT||reserved+bytes>PREFETCH_LIMIT)break;
    reserved+=bytes;
    const result=readVerified(row,signal).then<Outcome,Outcome>(blob=>({ok:true,blob}),error=>({ok:false,error}));
    staged.set(sha,{bytes,result});
   }
  };
  const read:ImageSource=async(row)=>{
   signal.throwIfAborted();
   const entry=staged.get(row.imageSha256);
   if(!entry)return decode(row,await readVerified(row,signal),signal);
   try{
    const result=await entry.result;signal.throwIfAborted();
    if(!result.ok)throw result.error;
    return await decode(row,result.blob,signal);
   }finally{if(staged.delete(row.imageSha256))reserved-=entry.bytes;}
  };
  return {source:read,prefetch,dispose:()=>{parent?.removeEventListener('abort',abort);controller.abort();staged.clear();reserved=0;}};
 };
 return {maps,source};
}
export async function openNativePreviewPack(files:readonly File[]):Promise<LocalNativePreviewPack>{
 const manifests=files.filter(f=>f.name==='manifest.json');
 check(manifests.length===1&&manifests[0].size<=4*1024*1024,'Select one manifest.json');
 const doc:unknown=JSON.parse(await manifests[0].text());
 if(record(doc)&&(doc.schema==='wand.media.native-cdn-preview@1'||doc.schema==='wand.media.native-r2-preview@1')){
  check(files.length===1,'Select CDN manifest only');return parseNativeCdnPreview(doc);
 }
 return openLocalNativePreview(files);
}
