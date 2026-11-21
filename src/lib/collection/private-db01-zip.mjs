/** In-memory, path-restricted ZIP reader for owner-selected private DB-01 shards.
 * No remote reads and no extraction to disk. Do not treat arbitrary ZIP files
 * as a trusted catalog: the caller MUST independently pin the manifest SHA.
 */
const U8 = new TextDecoder('utf-8', {fatal:true});
const MAX_ZIP = 40 * 1024 * 1024;
const MAX_ENTRIES = 2048;
const MAX_UNCOMPRESSED_ENTRY = 12 * 1024 * 1024;
const FILENAME = /^private-shards\/(?:manifest\.json|(?:id|historical)\/[a-f0-9]{2}\.json)$/;
const u16 = (v,p) => v.getUint16(p,true);
const u32 = (v,p) => v.getUint32(p,true);
const err = reason => {throw new TypeError('DB01_PRIVATE_ZIP_'+reason);};

let crcTable;
function crc32(data) {
  if(!crcTable){
    crcTable=Array.from({length:256},(_,i)=>{
      let c=i;for(let j=0;j<8;j++)c=c&1?(0xedb88320^(c>>>1)):(c>>>1);
      return c>>>0;
    });
  }
  let crc=0xffffffff;
  for(const b of data)crc=(crc>>>8)^crcTable[(crc^b)&255];
  return (crc^0xffffffff)>>>0;
}

export function openPrivateDb01Zip(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength<22 || bytes.byteLength>MAX_ZIP)
    err('SIZE_LIMIT');
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let eocd=-1;
  for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--){
    if(u32(v,p)===0x06054b50 && p+22+u16(v,p+20)===bytes.length){eocd=p;break;}
  }
  if(eocd<0 || u16(v,eocd+4)!==0 || u16(v,eocd+6)!==0 ||
     u16(v,eocd+8)!==u16(v,eocd+10))err('BAD_DIRECTORY');
  const count=u16(v,eocd+10), start=u32(v,eocd+16), size=u32(v,eocd+12);
  if(!count||count>MAX_ENTRIES||start+size!==eocd||start+size>bytes.length)
    err('BAD_DIRECTORY');
  const entries=new Map();
  let p=start;
  for(let i=0;i<count;i++){
    if(p+46>eocd || u32(v,p)!==0x02014b50)err('CENTRAL_HEADER');
    const flags=u16(v,p+8),method=u16(v,p+10),crc=u32(v,p+16);
    const compressed=u32(v,p+20),uncompressed=u32(v,p+24);
    const nameLen=u16(v,p+28),extra=u16(v,p+30),comment=u16(v,p+32);
    const disk=u16(v,p+34),offset=u32(v,p+42);
    if(disk!==0||flags!==0||(method!==0&&method!==8)||compressed>MAX_ZIP)
      err('UNSUPPORTED_ENTRY');
    const end=p+46+nameLen+extra+comment;
    if(end>eocd)err('CENTRAL_BOUNDS');
    const name=U8.decode(bytes.subarray(p+46,p+46+nameLen));
    if(!name || name.includes('..') || name.startsWith('/') || name.includes('\\') ||
       /[\u0000-\u001f]/.test(name) || entries.has(name))err('INVALID_PATH');
    if(offset+30>start||u32(v,offset)!==0x04034b50)err('LOCAL_HEADER');
    const localFlags=u16(v,offset+6),localMethod=u16(v,offset+8);
    const localNameLen=u16(v,offset+26),localExtraLen=u16(v,offset+28);
    const begin=offset+30+localNameLen+localExtraLen;
    if(localFlags!==flags||localMethod!==method||begin+compressed>start||
       U8.decode(bytes.subarray(offset+30,offset+30+localNameLen))!==name)
      err('LOCAL_MISMATCH');
    if(u32(v,offset+14)!==crc||u32(v,offset+18)!==compressed||
       u32(v,offset+22)!==uncompressed)err('LOCAL_METADATA_MISMATCH');
    entries.set(name,{method,begin,compressed,uncompressed,crc});
    p=end;
  }
  if(p!==eocd || !entries.has('private-shards/manifest.json'))err('MANIFEST_MISSING');
  return Object.freeze({
    entryCount: entries.size,
    async readShard(path) {
      if(typeof path!=='string'||!FILENAME.test(path))err('UNAPPROVED_PATH');
      const info=entries.get(path);
      if(!info)err('MISSING_SHARD');
      if(info.uncompressed>MAX_UNCOMPRESSED_ENTRY)err('ENTRY_TOO_LARGE');
      const raw=bytes.subarray(info.begin,info.begin+info.compressed);
      let decoded;
      if(info.method===0)decoded=new Uint8Array(raw);
      else {
        if(typeof DecompressionStream!=='function')err('DEFLATE_UNAVAILABLE');
        const stream=new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        const reader=stream.getReader();
        const chunks=[];let total=0;
        try{
          while(true){
            const {value,done}=await reader.read();if(done)break;
            total+=value.byteLength;
            if(total>MAX_UNCOMPRESSED_ENTRY||total>info.uncompressed)err('INFLATED_TOO_LARGE');
            chunks.push(value);
          }
        } finally {reader.releaseLock();}
        decoded=new Uint8Array(total);
        let pos=0;for(const part of chunks){decoded.set(part,pos);pos+=part.length;}
      }
      if(decoded.length!==info.uncompressed||crc32(decoded)!==info.crc)
        err('CORRUPT_SHARD');
      return decoded;
    }
  });
}