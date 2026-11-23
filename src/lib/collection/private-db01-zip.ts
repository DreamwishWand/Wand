/** Owner-local, in-memory ZIP entry reader for independently SHA-pinned DB-01.
 * Retains original path, CRC, size and raw-DEFLATE constraints. No disk,
 * network requests, Save writes, or publication of private original bytes.
 */
const DECODER=new TextDecoder('utf-8',{fatal:true});
const MAX_ZIP=40*1024*1024;
const MAX_ENTRIES=2048;
const MAX_ENTRY=12*1024*1024;
const PATH=/^private-shards\/(?:manifest\.json|(?:id|historical)\/[a-f0-9]{2}\.json)$/;
const u16=(view:DataView,at:number)=>view.getUint16(at,true);
const u32=(view:DataView,at:number)=>view.getUint32(at,true);
const fail=(code:string):never=>{throw new TypeError('DB01_PRIVATE_ZIP_'+code);};

type Entry=Readonly<{
  method:number;begin:number;compressed:number;uncompressed:number;crc:number;
}>;
export interface Db01PrivateZipReader{
  readonly entryCount:number;
  readShard(path:string):Promise<Uint8Array<ArrayBuffer>>;
}
let crcTable:readonly number[]|null=null;
function crc32(data:Uint8Array):number{
  if(!crcTable){
    crcTable=Array.from({length:256},(_,i)=>{
      let c=i;
      for(let j=0;j<8;j++)c=c&1?(0xedb88320^(c>>>1)):(c>>>1);
      return c>>>0;
    });
  }
  let crc=0xffffffff;
  for(const byte of data)
    crc=(crc>>>8)^crcTable[(crc^byte)&255];
  return (crc^0xffffffff)>>>0;
}
export function openPrivateDb01Zip(bytes:Uint8Array):Db01PrivateZipReader{
  if(!(bytes instanceof Uint8Array)||bytes.byteLength<22||
    bytes.byteLength>MAX_ZIP)fail('SIZE_LIMIT');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let directoryEnd=-1;
  for(let p=bytes.byteLength-22;p>=Math.max(0,bytes.byteLength-65557);p--){
    if(u32(view,p)===0x06054b50&&p+22+u16(view,p+20)===bytes.byteLength){
      directoryEnd=p;break;
    }
  }
  if(directoryEnd<0||u16(view,directoryEnd+4)!==0||
    u16(view,directoryEnd+6)!==0||
    u16(view,directoryEnd+8)!==u16(view,directoryEnd+10))
    fail('BAD_DIRECTORY');
  const count=u16(view,directoryEnd+10);
  const start=u32(view,directoryEnd+16);
  const size=u32(view,directoryEnd+12);
  if(!count||count>MAX_ENTRIES||start+size!==directoryEnd||
    start+size>bytes.byteLength)fail('BAD_DIRECTORY');

  const entries=new Map<string,Entry>();
  let pos=start;
  for(let i=0;i<count;i++){
    if(pos+46>directoryEnd||u32(view,pos)!==0x02014b50)
      fail('CENTRAL_HEADER');
    const flags=u16(view,pos+8),method=u16(view,pos+10);
    const crc=u32(view,pos+16),compressed=u32(view,pos+20);
    const uncompressed=u32(view,pos+24);
    const nameLen=u16(view,pos+28),extra=u16(view,pos+30);
    const comment=u16(view,pos+32),disk=u16(view,pos+34);
    const offset=u32(view,pos+42);
    if(disk!==0||flags!==0||(method!==0&&method!==8)||
      compressed>MAX_ZIP)fail('UNSUPPORTED_ENTRY');
    const end=pos+46+nameLen+extra+comment;
    if(end>directoryEnd)fail('CENTRAL_BOUNDS');
    const name=DECODER.decode(bytes.subarray(pos+46,pos+46+nameLen));
    if(!name||name.includes('..')||name.startsWith('/')||
      name.includes('\\')||/[\u0000-\u001f]/.test(name)||
      entries.has(name))fail('INVALID_PATH');
    if(offset+30>start||u32(view,offset)!==0x04034b50)
      fail('LOCAL_HEADER');
    const localFlags=u16(view,offset+6),localMethod=u16(view,offset+8);
    const localNameLen=u16(view,offset+26),localExtra=u16(view,offset+28);
    const begin=offset+30+localNameLen+localExtra;
    if(localFlags!==flags||localMethod!==method||
      begin+compressed>start||
      DECODER.decode(bytes.subarray(offset+30,offset+30+localNameLen))!==name)
      fail('LOCAL_MISMATCH');
    if(u32(view,offset+14)!==crc||u32(view,offset+18)!==compressed||
      u32(view,offset+22)!==uncompressed)
      fail('LOCAL_METADATA_MISMATCH');
    entries.set(name,{method,begin,compressed,uncompressed,crc});
    pos=end;
  }
  if(pos!==directoryEnd||
    !entries.has('private-shards/manifest.json'))
    fail('MANIFEST_MISSING');

  return Object.freeze({
    entryCount:entries.size,
    async readShard(path:string):Promise<Uint8Array<ArrayBuffer>>{
      if(typeof path!=='string'||!PATH.test(path))
        fail('UNAPPROVED_PATH');
      const info=entries.get(path);
      if(!info)throw new TypeError('DB01_PRIVATE_ZIP_MISSING_SHARD');
      if(info.uncompressed>MAX_ENTRY)fail('ENTRY_TOO_LARGE');
      const compressed=bytes.subarray(info.begin,info.begin+info.compressed);
      let decoded:Uint8Array<ArrayBuffer>;
      if(info.method===0){
        decoded=new Uint8Array(compressed.byteLength);
        decoded.set(compressed);
      }else{
        if(typeof DecompressionStream!=='function')
          fail('DEFLATE_UNAVAILABLE');
        // Use a freshly owned buffer. Blob must not observe an externally
        // mutable or shared Uint8Array while the Worker inflates the bytes.
        const stable=new Uint8Array(compressed.byteLength);
        stable.set(compressed);
        const stream=new Blob([stable]).stream().pipeThrough(
          new DecompressionStream('deflate-raw'));
        const reader=stream.getReader();
        const chunks:Uint8Array[]=[];
        let total=0;
        try{
          while(true){
            const {value,done}=await reader.read();
            if(done)break;
            total+=value.byteLength;
            if(total>MAX_ENTRY||total>info.uncompressed)
              fail('INFLATED_TOO_LARGE');
            chunks.push(value);
          }
        }finally{
          reader.releaseLock();
        }
        decoded=new Uint8Array(total);
        let at=0;
        for(const chunk of chunks){decoded.set(chunk,at);at+=chunk.byteLength;}
      }
      if(decoded.byteLength!==info.uncompressed||
        crc32(decoded)!==info.crc)fail('CORRUPT_SHARD');
      return decoded;
    },
  });
}
