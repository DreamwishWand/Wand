/** One-shot local diagnostics Worker. Rust decrypts all encrypted P1G. */
import {inspectLocalSaveDiagnosticsBytes}
  from './save-diagnostics-worker-core.mjs';
import {probeWasmReferenceParity,wasmReferenceUnavailable}
  from './save-wasm-reference.mjs';
import {probeNativeP1gAudit,nativeP1gAuditUnavailable}
  from './save-native-p1g-audit.mjs';
import {decodeP1gRustOnly} from './p1g-read.ts';

async function safeWasmProbe(strictJsonText:string,root:Record<string,unknown>){
  try{return await probeWasmReferenceParity(strictJsonText,root);}
  catch{return wasmReferenceUnavailable();}
}
async function safeNativeP1gAudit(bytes:Uint8Array,strictJsonText:string){
  try{return await probeNativeP1gAudit(bytes,strictJsonText);}
  catch{return nativeP1gAuditUnavailable();}
}
const worker=self as unknown as {
  onmessage:((event:MessageEvent<unknown>)=>void)|null;
  postMessage:(value:unknown)=>void;
  close:()=>void;
};
let started=false;
worker.onmessage=async({data})=>{
  if(started)return;
  started=true;
  const command=data&&typeof data==='object'&&!Array.isArray(data)?
    data as Record<string,unknown>:null;
  const bytes=command?.bytes;
  let response:{kind:'error'|'result';result?:unknown}={kind:'error'};
  try{
    if(command?.command!=='inspect-local-save-diagnostics'||
      !['json','p1g','auto'].includes(String(command.format))||
      !(bytes instanceof Uint8Array)||
      Object.keys(command).sort().join(',')!=='bytes,command,format')
      throw new TypeError('DB05_LOCAL_WORKER_COMMAND_INVALID');
    response={kind:'result',result:await inspectLocalSaveDiagnosticsBytes(
      command.format,bytes,safeWasmProbe,safeNativeP1gAudit,
      decodeP1gRustOnly)};
  }catch{
    // Never return parser, profile or decoder error details to the UI.
  }finally{
    if(bytes instanceof Uint8Array&&bytes.byteLength)bytes.fill(0);
  }
  worker.postMessage(response);
  worker.close();
};
