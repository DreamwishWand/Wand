/** Resolve a verified Bundle/Offer artwork relation without loading the original for list cards. */
import {publicImageUrl} from './public-image-key.ts';
export const BUNDLE_THUMBNAIL_MAX_EDGE=512;
export interface BundleImageRef {readonly sha256:string;readonly width:number;readonly height:number;readonly bytes:number}
export interface BundleArtwork {readonly original:BundleImageRef;readonly thumbnail:BundleImageRef}
const SHA=/^[a-f0-9]{64}$/;
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
function valid(v:unknown):v is BundleImageRef{
  return record(v)&&typeof v.sha256==='string'&&SHA.test(v.sha256)&&positive(v.width)&&positive(v.height)&&positive(v.bytes)&&v.width<=16384&&v.height<=16384;
}
export function parseBundleArtwork(value:unknown):BundleArtwork|null{
  if(!record(value)||!valid(value.original)||!valid(value.thumbnail))return null;
  const o=value.original,t=value.thumbnail;
  if(Math.max(t.width,t.height)>BUNDLE_THUMBNAIL_MAX_EDGE||t.width>o.width||t.height>o.height)return null;
  if(o.sha256===t.sha256&&(o.width!==t.width||o.height!==t.height||o.bytes!==t.bytes))return null;
  return {original:{...o},thumbnail:{...t}};
}
export function bundleArtworkUrl(origin:string,value:unknown,detail=false):string|null{
  const image=parseBundleArtwork(value);
  if(!image)return null;
  return publicImageUrl(origin,detail?'original':'thumbnail',(detail?image.original:image.thumbnail).sha256);
}
