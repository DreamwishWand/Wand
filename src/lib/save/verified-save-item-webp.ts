/**
 * Public item icon bytes are read only from a same-release DB-00 media ref.
 * Verify the actual WebP SHA-256 before letting the browser decode/display it.
 * No Save bytes, player state or dynamic Item IDs are sent over the network.
 */
import type {Db00ItemContext} from './common-db-context';

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
  if(!url||!globalThis.crypto?.subtle)return null;
  try{
    const response=await fetchImpl(url,{signal,credentials:'same-origin'});
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
    return sha===media.sha256?data:null;
  }catch{return null;}
}
