/** Shared, version-neutral file transport. The inner schema owns semantics.
 * Gzip (RFC 1952) or UTF-8 JSON, whichever is smaller. No wrapper overhead,
 * base64, images, native Save bytes, or duplicated game catalog.
 */
export const PRESET_MAX_BYTES=16_000_000;
export const PRESET_ACCEPT='.wandpreset,.json,.gz,application/json,application/gzip';
export function presetFilename(name:string){return name.replace(/(?:\.wandpreset|\.json\.gz|\.json|\.gz)$/i,'')+'.wandpreset';}
export async function readPresetText(file:Blob,maxBytes=PRESET_MAX_BYTES):Promise<string>{
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>PRESET_MAX_BYTES||!file.size||file.size>maxBytes)throw Error('PRESET_SIZE');
 const magic=new Uint8Array(await file.slice(0,2).arrayBuffer()),gzip=magic[0]===31&&magic[1]===139;
 const stream=gzip?file.stream().pipeThrough(new DecompressionStream('gzip')):file.stream();
 const reader=stream.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let size=0;const chunks:string[]=[];
 try{
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)throw Error('PRESET_EXPANSION_LIMIT');chunks.push(decoder.decode(value,{stream:true}));}
  chunks.push(decoder.decode());const raw=chunks.join('');if(!raw.trim())throw Error('PRESET_EMPTY');return raw;
 }catch(e){try{await reader.cancel();}catch{}throw e;}finally{reader.releaseLock();}
}
export async function compactPresetFile(raw:string,name:string):Promise<File>{
 // Preserve the original UTF-8 JSON bytes, including unknown native
 // private fields, numeric spelling and property order.
 const source=new Blob([raw],{type:'application/json'});
 if(!source.size||source.size>PRESET_MAX_BYTES)throw Error('PRESET_SIZE');
 const target=presetFilename(name);
 if(typeof CompressionStream==='function'){
  try{const packed=await new Response(source.stream().pipeThrough(new CompressionStream('gzip'))).blob();
   if(packed.size<source.size)return new File([packed],target,{type:'application/gzip'});
  }catch{/* Same lossless JSON transport remains readable. */}
 }
 return new File([source],target,{type:'application/json'});
}
