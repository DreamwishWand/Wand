/**
 * DB-05 development-only, one-shot private edit-preview Worker.
 * No export, save download, persistence, UI-visible IDs, or raw profile reply.
 */
import init, {WasmAmountPreview} from './wasm/p1g-pkg/ddv_p1g_codec.js';
import wasmUrl from './wasm/p1g-pkg/ddv_p1g_codec_bg.wasm?url';
import {detectLocalSaveFormat,MAX_LOCAL_P1G_BYTES,MAX_LOCAL_JSON_BYTES} from './save-diagnostics-worker-core.mjs';

const CHUNK=1024*1024;
const uint32=x=>Number.isInteger(x)&&x>0&&x<=0xffffffff;
const validId=x=>typeof x==='string' && /^[0-9]{1,20}$/.test(x) && BigInt(x)>0n &&
  BigInt(x)<=BigInt('18446744073709551615');
const exact=(obj,keys)=>obj && typeof obj==='object' && !Array.isArray(obj) &&
  Object.keys(obj).sort().join(',')===keys.slice().sort().join(',');

let started=false;
self.onmessage=async ({data})=>{
  if(started)return;
  started=true;
  let receipt={kind:'error'};
  const bytes=data?.bytes;
  let rust=null;
  try{
    if(!exact(data,['command','format','bytes','target','expected','replacement']) ||
      data.command!=='preview-existing-amount' ||
      !['auto','json','p1g'].includes(data.format) ||
      !(bytes instanceof Uint8Array) || !uint32(data.expected) || !uint32(data.replacement) ||
      !exact(data.target,data.target?.kind==='inventory'
        ? ['kind','inventoryId','itemId']
        : ['kind','containerId','slotIndex','itemId']))throw Error('bad request');
    const target=data.target;
    if(target.kind==='inventory'){
      if(!validId(target.inventoryId)||!validId(target.itemId))throw Error('bad identity');
    }else if(target.kind==='chest'){
      if(!validId(target.containerId)||!Number.isInteger(target.slotIndex)||
        target.slotIndex<0||target.slotIndex>1000000||!uint32(target.itemId))
          throw Error('bad identity');
    }else throw Error('bad kind');
    const format=data.format==='auto'?detectLocalSaveFormat(bytes):data.format;
    if(format==='p1g'
      ? (bytes.byteLength<16||bytes.byteLength>MAX_LOCAL_P1G_BYTES||bytes.byteLength%16!==0)
      : (bytes.byteLength<1||bytes.byteLength>MAX_LOCAL_JSON_BYTES))throw Error('size');
    await init(wasmUrl);
    rust=new WasmAmountPreview(format);
    for(let i=0;i<bytes.byteLength;i+=CHUNK){
      rust.append_chunk(bytes.subarray(i,i+CHUNK));
    }
    rust.finish_open();
    const raw=target.kind==='inventory'
      ? rust.preview_inventory(target.inventoryId,target.itemId,data.expected,data.replacement)
      : rust.preview_chest(target.containerId,target.slotIndex,target.itemId,
          data.expected,data.replacement);
    const result=JSON.parse(raw);
    if(!exact(result,[
      'contract','changed','lexicalBytesPreserved','reopenVerified',
      'writerAuthorized','exportAuthorized'
    ]) || result.contract!=='wand.db05.amount-preview@1'||
      typeof result.changed!=='boolean'||result.lexicalBytesPreserved!==true||
      typeof result.reopenVerified!=='boolean'||
      result.writerAuthorized!==false||result.exportAuthorized!==false)
      throw Error('untrusted receipt');
    receipt={kind:'result',receipt:{
      contract:'wand.db05.amount-preview@1',
      changed:result.changed,
      lexicalBytesPreserved:true,
      reopenVerified:result.reopenVerified,
      writerAuthorized:false,exportAuthorized:false
    }};
  }catch{
    // Never forward Rust error text, source bytes, IDs or private metadata.
  }finally{
    rust?.close();
    rust?.free();
    if(bytes instanceof Uint8Array && bytes.byteLength)bytes.fill(0);
  }
  self.postMessage(receipt);
  self.close();
};