/** Local-only copy transport; no raw Save content is logged or sent off-device. */
export interface ExperimentalCopyReceipt{contract:'wand.db05.experimental-copy@1';copyBytes:number;originalUnchanged:true;independentReopenVerified:true;experimentalCopyOnly:true;productionWriterAuthorized:false}
const MAX_COPY=32*1024*1024;
export function readExperimentalCopy(length:number,take:(size:number)=>Uint8Array){
 if(!Number.isSafeInteger(length)||length<1||length>MAX_COPY)throw Error('copy size');
 const bytes=new Uint8Array(length);
 try{for(let i=0;i<length;i+=1048576){const n=Math.min(1048576,length-i),part=take(n);try{if(!(part instanceof Uint8Array)||part.byteLength!==n)throw Error('copy chunk');bytes.set(part,i);}finally{part.fill(0);}}
 const receipt:ExperimentalCopyReceipt={contract:'wand.db05.experimental-copy@1',copyBytes:length,originalUnchanged:true,independentReopenVerified:true,experimentalCopyOnly:true,productionWriterAuthorized:false};
 return {bytes,receipt};
 }catch(e){bytes.fill(0);throw e;}
}
export function experimentalCopyDownload(data:unknown,source:File){
 const d=data as {bytes?:Uint8Array;receipt?:Partial<ExperimentalCopyReceipt>}|null;
 const b=d?.bytes,r=d?.receipt;
 if(!(b instanceof Uint8Array))throw Error('copy bytes');
 try{
  if(b.byteLength<1||b.byteLength>MAX_COPY||r?.contract!=='wand.db05.experimental-copy@1'||r.copyBytes!==b.byteLength||r.originalUnchanged!==true||r.independentReopenVerified!==true||r.experimentalCopyOnly!==true||r.productionWriterAuthorized!==false)throw Error('copy receipt');
  const dot=source.name.lastIndexOf('.'),name=dot>0?source.name.slice(0,dot)+'-world-test'+source.name.slice(dot):source.name+'-world-test';
  return {url:URL.createObjectURL(new Blob([b.slice().buffer as ArrayBuffer],{type:'application/octet-stream'})),name};
 }finally{b.fill(0);}
}
