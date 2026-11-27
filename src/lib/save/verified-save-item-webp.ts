/**
 * Public item icon bytes are read only from a same-release DB-00 media ref.
 * Verify the actual WebP SHA-256 before letting the browser decode/display it.
 * No Save bytes, player state or dynamic Item IDs are sent over the network.
 */
import type {Db00ItemContext} from './common-db-context.ts';
import {itemMedia,ITEM_MEDIA_ACTIVATION,type ItemImage} from '../media/item-media.ts';
import {publicImageUrl} from '../media/public-image-key.ts';

export type SaveItemMedia=NonNullable<Db00ItemContext['media']>;
const MEDIA_PATH=/^ddv\/item-images\/[a-z0-9.-]+\/[a-f0-9]{2}\/[a-f0-9]{64}\.webp$/;
const SHA=/^[0-9a-f]{64}$/;
const MAX_ICON_BYTES=3*1024*1024;

export function saveItemMediaUrl(
  base:string,media:SaveItemMedia
):string|null{
  if(!/^\/(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/.test(base)&&
     base!=='')return null;
  if(!media||!MEDIA_PATH.test(media.path)||media.path.includes('..')||
     !SHA.test(media.sha256))return null;
  return base+'/'+media.path;
}

/** The original database hash is a promise, not proof of the served bytes.
 * Display nothing unless the response matches the source-bound digest.
 */
export async function fetchVerifiedSaveItemWebp(
  base:string,media:SaveItemMedia,
  fetchImpl:typeof fetch=globalThis.fetch,signal?:AbortSignal
):Promise<ArrayBuffer|null>{
  const url=saveItemMediaUrl(base,media);
  if(!url)return null;
  return readVerifiedWebp(url,media.sha256,fetchImpl,signal,'same-origin');
}
async function readVerifiedWebp(url:string,sha256:string,fetchImpl:typeof fetch,
  signal:AbortSignal|undefined,credentials:'same-origin'|'omit'):Promise<ArrayBuffer|null>{
  if(!globalThis.crypto?.subtle||signal?.aborted)return null;
  try{
    const response=await fetchImpl(url,{signal,credentials,redirect:'error',referrerPolicy:'no-referrer'});
    if(!response.ok)return null;
    const mime=response.headers.get('content-type')?.split(';')[0]?.trim();
    if(mime!=='image/webp')return null;
    const hinted=response.headers.get('content-length');
    if(hinted!==null&&(Number(hinted)>MAX_ICON_BYTES||
       !Number.isSafeInteger(Number(hinted))||Number(hinted)<1))
      return null;
    const data=await response.arrayBuffer();
    if(data.byteLength<20||data.byteLength>MAX_ICON_BYTES)return null;
    const bytes=new Uint8Array(data);
    const fourCC=(offset:number)=>String.fromCharCode(...bytes.subarray(offset,offset+4));
    const chunkLength=new DataView(data).getUint32(4,true);
    if(fourCC(0)!=='RIFF'||fourCC(8)!=='WEBP'||
       chunkLength+8!==data.byteLength)return null;
    const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',data));
    const sha=[...digest].map(x=>x.toString(16).padStart(2,'0')).join('');
    return sha===sha256&&!signal?.aborted?data:null;
  }catch{return null;}
}

type ItemLookup=(id:number)=>Promise<ItemImage|null>;
/** Match only against the already-resolved public catalog. The only network
 * requests are immutable public index/shard and content-hash image URLs.
 * No Save bytes, quantities, raw IDs in URLs, or player data are transmitted.
 * As with any on-demand image, request patterns may reveal artwork viewed. */
export async function fetchCurrentSaveItemWebp(
  base:string,context:Db00ItemContext,gameVersion:string|null,
  fetchImpl:typeof fetch=globalThis.fetch,signal?:AbortSignal,
  lookup:ItemLookup=id=>itemMedia.getItemImage(id,'thumbnail')
):Promise<ArrayBuffer|null>{
  if(signal?.aborted||context.match!=='current_db00')return null;
  const id=Number(context.itemId);
  if(!Number.isSafeInteger(id)||id<1||String(id)!==context.itemId)return null;
  if(ITEM_MEDIA_ACTIVATION.state==='published'&&
     ITEM_MEDIA_ACTIVATION.gameVersion==='steam-'+gameVersion){
    try{
      const image=await lookup(id);
      if(signal?.aborted)return null;
      if(image&&SHA.test(image.sha256)&&Number.isSafeInteger(image.width)&&Number.isSafeInteger(image.height)&&
         image.width>0&&image.height>0&&Math.max(image.width,image.height)<=512&&
         image.url===publicImageUrl(ITEM_MEDIA_ACTIVATION.origin,'thumbnail',image.sha256)){
        const bytes=await readVerifiedWebp(image.url,image.sha256,fetchImpl,signal,'omit');
        if(bytes)return bytes;
      }
    }catch{/* A public image outage must never block local Save editing. */}
  }
  return context.media&&!signal?.aborted?fetchVerifiedSaveItemWebp(base,context.media,fetchImpl,signal):null;
}
