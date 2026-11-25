import {detectLocalSaveFormat} from '../save/save-diagnostics-worker-core.mjs';
/** Local single-open Save projection across all public Grid witnesses. */
import init,{WasmAmountPreview} from '../save/wasm/p1g-pkg/ddv_p1g_codec.js';
import wasmUrl from '../save/wasm/p1g-pkg/ddv_p1g_codec_bg.wasm?url';
import {validateSourceGridQuery} from './saved-grid-source-candidates.ts';
import {projectTerrainSession} from './terrain-binding.ts';
const scope=self as unknown as {onmessage:((e:MessageEvent)=>void)|null;postMessage:(value:unknown)=>void};
scope.onmessage=async({data})=>{
 const requestId=data?.requestId;
 let bytes:Uint8Array<ArrayBuffer>|null=null,wasm:WasmAmountPreview|null=null;
 try{
  if(data?.command!=='terrain-session'||!Number.isSafeInteger(requestId)||requestId<1||
    !(data.file instanceof Blob)||data.file.size<1||data.file.size>32*1024*1024||
    typeof data.filename!=='string'||!Array.isArray(data.scopes)||data.scopes.length<1||data.scopes.length>2048)throw Error('request');
  const scopes=data.scopes.map((s:unknown)=>{
    const q=validateSourceGridQuery(s);
    if(q.sourceRefs.length!==1)throw Error('ambiguous');
    return {key:q.viewKey,witness:q.sourceRefs[0]};
  });
  bytes=new Uint8Array(await data.file.arrayBuffer());
  const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  const format=detectLocalSaveFormat(bytes);
  await init(wasmUrl);
  wasm=new WasmAmountPreview(format);
  for(let i=0;i<bytes.length;i+=1048576)wasm.append_chunk(bytes.subarray(i,i+1048576));
  wasm.finish_open();
  const raw=JSON.parse(wasm.match_db04_terrain_session(JSON.stringify({contract:'wand.db05.db04-object-source-witness@1',gridRefs:scopes.map((s:{witness:unknown})=>s.witness)})));
  const results=projectTerrainSession(raw,scopes);
  scope.postMessage({kind:'terrain-session',requestId,results,fingerprint,format});
 }catch{scope.postMessage({kind:'terrain-session-error',requestId});}
 finally{bytes?.fill(0);wasm?.close();wasm?.free();}
};
