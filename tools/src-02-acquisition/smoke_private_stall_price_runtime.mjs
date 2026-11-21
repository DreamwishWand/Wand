#!/usr/bin/env node
/**
 * Exact private DB-02 source smoke with the ACTUAL source-pinned JavaScript API.
 * Takes local ZIPs only; never connects to internet, extracts to disk or prints
 * item/merchant identifiers, prices or private player state.
 */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPrivateStallPriceOverlap} from '../../src/lib/acquisition/private-stall-price-overlap.mjs';

const ZIP_SHA='347ac135fdc07f57c82f556506fcaf3eb21710062a9c6c5d1b32654fde3b1853';
const R5_ZIP_SHA='7914b88b4d7c546ee362a907d9a66691debcafc54caefb0815254edc10fa7fb8';
const NAMES=Object.freeze(['manifest.json','shop-definitions.jsonl',
  'static-item-prices.jsonl','stall-shop-joins.jsonl','dynamic-price-source.jsonl']);
const dec=new TextDecoder('utf-8',{fatal:true});
const maxArchive=2*1024*1024;
const maxExpanded=2*1024*1024;
const fail=x=>{throw new TypeError('DB02_RUNTIME_SMOKE_'+x);};
const check=(ok,msg)=>{if(!ok)fail(msg);};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const u16=(b,n)=>b.readUInt16LE(n);
const u32=(b,n)=>b.readUInt32LE(n);
function loadBytes(path,expected){
  const bytes=readFileSync(path);
  check(bytes.length>0&&bytes.length<=maxArchive,'ZIP_SIZE');
  check(sha(bytes)===expected,'ORIGINAL_ZIP_SHA');
  return bytes;
}

/** A constrained, non-extracting ZIP reader for the exact private price release. */
export function readOriginalPriceReleaseZip(bytes){
  check(bytes instanceof Uint8Array&&bytes.length>=22&&bytes.length<=maxArchive,
    'INVALID_ARCHIVE');
  const buf=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  check(sha(buf)===ZIP_SHA,'PRIVATE_PRICE_ZIP_SHA');
  let end=-1;
  for(let i=buf.length-22;i>=Math.max(0,buf.length-65557);i--){
    if(u32(buf,i)===0x06054b50&&i+22+u16(buf,i+20)===buf.length){end=i;break;}
  }
  check(end>=0,'ZIP_TRAILER');
  check(u16(buf,end+4)===0&&u16(buf,end+6)===0&&
    u16(buf,end+8)===NAMES.length&&u16(buf,end+10)===NAMES.length,
    'ZIP_COUNT');
  const cdSize=u32(buf,end+12),start=u32(buf,end+16);
  check(start!==0xffffffff&&cdSize!==0xffffffff&&start+cdSize===end,'ZIP_DIRECTORY');
  const output=new Map();let expanded=0,offset=start;
  for(let entry=0;entry<NAMES.length;entry++){
    check(offset+46<=end&&u32(buf,offset)===0x02014b50,'CENTRAL_ENTRY');
    const madeBy=u16(buf,offset+4),flags=u16(buf,offset+8);
    const method=u16(buf,offset+10),crc=u32(buf,offset+16);
    const compressed=u32(buf,offset+20),size=u32(buf,offset+24);
    const nameLen=u16(buf,offset+28),extraLen=u16(buf,offset+30);
    const commentLen=u16(buf,offset+32),disk=u16(buf,offset+34);
    const unixMode=u32(buf,offset+38)>>>16;
    const local=u32(buf,offset+42);
    const next=offset+46+nameLen+extraLen+commentLen;
    check(next<=end&&disk===0&&flags===0&&(method===0||method===8)&&
      compressed<=maxArchive&&size<=maxExpanded&&
      compressed!==0xffffffff&&size!==0xffffffff&&
      ((madeBy>>>8)!==3||(unixMode&0xf000)!==0xa000),'ZIP_ENTRY_UNSAFE');
    const name=dec.decode(buf.subarray(offset+46,offset+46+nameLen));
    check(NAMES.includes(name)&&!output.has(name),'UNEXPECTED_ZIP_MEMBER');
    check(local+30<=start&&u32(buf,local)===0x04034b50,'ZIP_LOCAL_HEADER');
    const localNameLen=u16(buf,local+26),localExtra=u16(buf,local+28);
    const contentAt=local+30+localNameLen+localExtra;
    check(u16(buf,local+6)===flags&&u16(buf,local+8)===method&&
      u32(buf,local+14)===crc&&u32(buf,local+18)===compressed&&
      u32(buf,local+22)===size&&
      contentAt+compressed<=start&&
      dec.decode(buf.subarray(local+30,local+30+localNameLen))===name,
      'ZIP_LOCAL_INCONSISTENT');
    const payload=buf.subarray(contentAt,contentAt+compressed);
    let data;
    try{data=method===8?inflateRawSync(payload,{maxOutputLength:maxExpanded}):
      Buffer.from(payload);}
    catch{fail('ZIP_DEFLATE_INVALID');}
    check(data.length===size,'ZIP_UNCOMPRESSED_SIZE');
    expanded+=data.length;check(expanded<=maxExpanded,'ZIP_EXPANDED_LIMIT');
    output.set(name,Uint8Array.from(data));
    offset=next;
  }
  check(offset===end&&output.size===NAMES.length,'INCOMPLETE_ZIP');
  return Object.freeze({
    manifestBytes:output.get('manifest.json'),
    files:Object.freeze(Object.fromEntries(NAMES.filter(x=>x!=='manifest.json')
      .map(name=>[name,output.get(name)])))
  });
}

export async function runPrivateShopRuntimeSmoke(r5ZipPath,priceZipPath){
  const r5=loadBytes(r5ZipPath,R5_ZIP_SHA);
  const prices=readOriginalPriceReleaseZip(loadBytes(priceZipPath,ZIP_SHA));
  const result=await loadPrivateStallPriceOverlap({
    acquisitionArchiveBytes:new Uint8Array(r5),
    priceManifestBytes:prices.manifestBytes,priceFiles:prices.files
  });
  check(result.verifiedPrivateSources===true&&result.publishable===false&&
    result.currentOffersVerified===false&&result.shopDatabaseSelectionVerified===false&&
    result.effectivePricesVerified===false&&result.stockVerified===false,
    'RUNTIME_EVIDENCE_FLAGS');
  const counts=result.counts;
  return Object.freeze({
    status:'EXACT_PRIVATE_JS_SOURCE_SMOKE_PASS',
    gameVersion:result.gameVersion,sourceManifests:Object.freeze({
      src02R5:result.acquisitionSourceManifestSha256,
      protoDbShopPrices:result.priceSourceManifestSha256
    }),
    counts,
    currentOffersVerified:false,effectivePricesVerified:false,
    runtimeDatabaseSelectionVerified:false,privateOnly:true,publishable:false
  });
}
function cli(args){
  check(args.length===4&&args[0]==='--r5-zip'&&args[2]==='--price-zip',
    'USAGE_--r5-zip_PATH_--price-zip_PATH');
  return runPrivateShopRuntimeSmoke(args[1],args[3]);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  cli(process.argv.slice(2)).then(out=>console.log(JSON.stringify(out,null,2)))
    .catch(err=>{console.error(String(err));process.exitCode=1;});
}
