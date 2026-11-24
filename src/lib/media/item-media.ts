/** Lazy Item ID lookup over the SRC-04 sanitized public distribution shards.
 * All services share this client; no private source paths or image bytes in the DB.
 * An unpublished candidate must never be used as a published index.
 */
import {parsePublicImageKey, publicImageUrl, publicMediaOrigin, type ImageVariant} from './public-image-key.ts';
export interface ItemMediaPin { readonly sha256:string; readonly bytes:number }
export type ItemMediaActivation = {readonly state:'unpublished'} | {
  readonly state:'published'; readonly publicationAuthorized:true; readonly publicReadbackVerified:true;
  readonly origin:string; readonly gameVersion:string; readonly manifest:ItemMediaPin;
};
export const ITEM_MEDIA_ACTIVATION:ItemMediaActivation = {state:'unpublished'};
export interface ItemImage { readonly url:string; readonly sha256:string; readonly width:number; readonly height:number }
type Images = Readonly<Record<ImageVariant,ItemImage>>;
type ShardPin = ItemMediaPin & {readonly count:number};
const SHA=/^[0-9a-f]{64}$/;
const VERSION=/^steam-\d+\.\d+\.\d+$/;
const record=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const positive=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>0;
const nonnegative=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
function check(x:unknown,m:string):asserts x {if(!x)throw new TypeError('Item media: '+m);}
function validPin(x:unknown):x is ItemMediaPin {
  return record(x)&&typeof x.sha256==='string'&&SHA.test(x.sha256)&&positive(x.bytes)&&x.bytes<=16*1024*1024;
}
const hex=(n:number)=>n.toString(16).padStart(2,'0');
async function readJson(url:string,pin:ItemMediaPin,fetcher:typeof fetch):Promise<unknown>{
  const res=await fetcher(url,{credentials:'omit',redirect:'error'});
  check(res.ok,'index unavailable');
  const bytes=await res.arrayBuffer();
  check(bytes.byteLength===pin.bytes,'byte count');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>hex(x)).join('');
  check(hash===pin.sha256,'SHA-256');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
function parseManifest(doc:unknown,version:string):ReadonlyMap<string,ShardPin>{
  check(record(doc)&&Object.keys(doc).sort().join(',')==='bucketCount,cachePolicy,files,gameVersion,releaseState,schema,totalItems'&&
    doc.schema==='wand.media.distribution@1'&&doc.gameVersion===version&&doc.releaseState==='published'&&
    doc.bucketCount===256&&positive(doc.totalItems)&&doc.cachePolicy==='immutable_content_addressed_media'&&record(doc.files)&&
    Object.keys(doc.files).length===256,'published manifest identity');
  const pins=new Map<string,ShardPin>();let total=0;
  for(let n=0;n<256;n++){
    const bucket=hex(n), p=doc.files['id/'+bucket+'.json'];
    check(record(p)&&Object.keys(p).sort().join(',')==='bytes,count,sha256'&&validPin(p)&&nonnegative(p.count),'shard pin');
    pins.set(bucket,{sha256:p.sha256,bytes:p.bytes,count:p.count});total+=p.count;
  }
  check(total===doc.totalItems,'item count');
  return pins;
}
function parseShard(doc:unknown,bucket:string,pin:ShardPin,origin:string):ReadonlyMap<number,Images>{
  check(record(doc)&&Object.keys(doc).sort().join(',')==='bucket,items,schema'&&
    doc.schema==='wand.media.distribution-shard@1'&&doc.bucket===bucket&&Array.isArray(doc.items)&&doc.items.length===pin.count,'shard identity');
  const rows=new Map<number,Images>();
  for(const row of doc.items){
    check(record(row)&&Object.keys(row).sort().join(',')==='id,original,thumbnail'&&positive(row.id)&&
      hex(row.id%256)===bucket&&!rows.has(row.id),'item identity');
    const images={} as Record<ImageVariant,ItemImage>;
    for(const variant of ['original','thumbnail'] as const){
      const v=row[variant];
      check(record(v)&&Object.keys(v).sort().join(',')==='height,key,width'&&positive(v.width)&&positive(v.height)&&
        v.width<=16384&&v.height<=16384&&(variant!=='thumbnail'||(v.width<=128&&v.height<=128)),'image dimensions');
      const ref=parsePublicImageKey(v.key);
      check(ref&&ref.variant===variant,'image key');
      images[variant]=Object.freeze({url:publicImageUrl(origin,variant,ref.sha256),sha256:ref.sha256,width:v.width,height:v.height});
    }
    rows.set(row.id,Object.freeze(images));
  }
  return rows;
}
export function createItemMediaClient(activation:ItemMediaActivation=ITEM_MEDIA_ACTIVATION,fetcher:typeof fetch=fetch){
  const config=activation.state==='published'?activation:null;
  let root:string|null=null, origin:string|null=null;
  if(config){
    check(config.publicationAuthorized===true&&config.publicReadbackVerified===true&&VERSION.test(config.gameVersion)&&validPin(config.manifest),'unverified activation');
    origin=publicMediaOrigin(config.origin);
    root=origin+'/index/items/'+config.gameVersion+'/'+config.manifest.sha256+'/';
  }
  let manifest:Promise<ReadonlyMap<string,ShardPin>>|null=null;
  const shards=new Map<string,Promise<ReadonlyMap<number,Images>>>();
  function loadManifest(){
    if(!manifest)manifest=readJson(root!+'manifest.json',config!.manifest,fetcher)
      .then(doc=>parseManifest(doc,config!.gameVersion)).catch(e=>{manifest=null;throw e;});
    return manifest;
  }
  async function loadShard(bucket:string){
    const previous=shards.get(bucket);if(previous)return previous;
    const task=(async()=>{
      const pin=(await loadManifest()).get(bucket)!;
      if(pin.count===0)return new Map<number,Images>();
      return parseShard(await readJson(root!+'id/'+bucket+'.json',pin,fetcher),bucket,pin,origin!);
    })();
    shards.set(bucket,task);
    try{return await task;}catch(e){shards.delete(bucket);throw e;}
  }
  return {
    async getItemImage(itemId:number,variant:ImageVariant='thumbnail'):Promise<ItemImage|null>{
      if(!config||!positive(itemId)||(variant!=='thumbnail'&&variant!=='original'))return null;
      const images=(await loadShard(hex(itemId%256))).get(itemId);
      return images?.[variant]??null;
    }
  };
}
// Single default instance used by all services; stays network-free until activated.
export const itemMedia = createItemMediaClient();
