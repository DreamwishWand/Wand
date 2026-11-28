import {detectLocalSaveFormat} from '../save/save-diagnostics-worker-core.mjs';
/** Local furniture stock rehearsal and explicit test-only copy output. */
import init,{WasmAmountPreview} from '../save/wasm/p1g-pkg/ddv_p1g_codec.js';
import {testSaveExportEnabled} from './test-save-export.ts';
import wasmUrl from '../save/wasm/p1g-pkg/ddv_p1g_codec_bg.wasm?url';
const scope=self as unknown as {onmessage:((e:MessageEvent)=>void)|null;postMessage:(value:unknown,transfer?:Transferable[])=>void};
scope.onmessage=async({data})=>{
 let bytes:Uint8Array|null=null,wasm:WasmAmountPreview|null=null,copy:Uint8Array|null=null;
 try{
  const pickup=data?.command==='group-pickup-export',paste=data?.command==='group-paste-export',cut=data?.command==='group-cut-export',biome=data?.command==='biome-furniture-export',island=data?.command==='island-furniture-export',islandDecoration=data?.command==='island-decoration-export',network=data?.command==='biome-network-export',decoration=data?.command==='biome-decoration-export',inspect=data?.command==='inspect-area-network',inspectBatch=data?.command==='inspect-map-networks';
  const landscape=data?.command==='landscape-export',activity=data?.command==='activity-recovery-export',recoveryTargets=data?.command==='activity-recovery-destinations';
  const exporting=activity||landscape||data?.command==='furniture-stock-export'||pickup||paste||cut||biome||network||island||decoration||islandDecoration;
  if(exporting&&(!testSaveExportEnabled(self.location)||data.allowExperimentalCopy!==true))throw Error('test-only');
  if((!exporting&&!inspect&&!inspectBatch&&!recoveryTargets&&data?.command!=='furniture-stock-preview')||!(data.file instanceof File)||data.file.size<1||data.file.size>32*1024*1024||(!data.plan||typeof data.plan!=='object')&&!(exporting&&typeof data.privateStorage==='string'&&data.plan===null))throw Error('request');
  bytes=new Uint8Array(await data.file.arrayBuffer());await init(wasmUrl);
  wasm=new WasmAmountPreview(detectLocalSaveFormat(bytes));
  for(let i=0;i<bytes.length;i+=1048576)wasm.append_chunk(bytes.subarray(i,i+1048576));
  wasm.finish_open();
  if(recoveryTargets){scope.postMessage({kind:'activity-recovery-destinations',result:JSON.parse(wasm.list_field_recovery_destinations(JSON.stringify(data.plan)))});return;}
  if(inspectBatch){const plans=data.plan;if(!Array.isArray(plans)||plans.length<1||plans.length>64||new Set(plans.map(p=>p?.key)).size!==plans.length)throw Error('network batch');const receipts=[];for(const p of plans){if(typeof p?.key!=='string'||p.key.length>256)throw Error('network key');try{receipts.push({key:p.key,rows:JSON.parse(wasm.inspect_area_network(JSON.stringify(p.destination))),...(data.includeLandscape===true?{landscape:JSON.parse(wasm.inspect_area_landscape(JSON.stringify(p.destination)))}:{})});}catch{/* Unverified grids retain their original footprint rendering. */}}scope.postMessage({kind:'map-networks',receipts});return;}
  if(inspect){scope.postMessage({kind:'area-network',rows:JSON.parse(wasm.inspect_area_network(JSON.stringify(data.plan))),...(data.includeLandscape===true?{landscape:JSON.parse(wasm.inspect_area_landscape(JSON.stringify(data.plan)))}:{})});return;}
  if(exporting){
   const length=activity?wasm.prepare_activity_recovery_copy(JSON.stringify(data.plan),true):typeof data.privateStorage==='string'?wasm.prepare_private_decoration_copy(data.command,JSON.stringify(data.plan),data.privateStorage,data.privateScope,true):landscape?wasm.prepare_landscape_experimental_copy(JSON.stringify(data.plan),JSON.stringify(data.destination??null),true):islandDecoration?wasm.prepare_island_decoration_experimental_copy(JSON.stringify(data.plan),true):decoration?wasm.prepare_biome_decoration_experimental_copy(JSON.stringify(data.plan),true):island?wasm.prepare_island_furniture_experimental_copy(JSON.stringify(data.plan),true):network?wasm.prepare_biome_network_experimental_copy(JSON.stringify(data.plan),true):biome?wasm.prepare_biome_furniture_experimental_copy(JSON.stringify(data.plan),true):cut?wasm.prepare_group_cut_experimental_copy(JSON.stringify(data.plan),true):pickup?wasm.prepare_group_pickup_experimental_copy(JSON.stringify(data.plan),true):paste?wasm.prepare_group_paste_experimental_copy(JSON.stringify(data.plan),true):wasm.prepare_furniture_stock_experimental_copy(JSON.stringify(data.plan),JSON.stringify(data.destination??null),true);
   if(!Number.isSafeInteger(length)||length<1||length>32*1024*1024)throw Error('copy size');
   copy=new Uint8Array(length);
   for(let i=0;i<length;i+=1048576){const n=Math.min(1048576,length-i),part=wasm.take_copy_chunk(n);if(part.byteLength!==n){part.fill(0);throw Error('copy chunk');}copy.set(part,i);part.fill(0);}
   scope.postMessage({kind:'furniture-stock-copy',...(activity||typeof data.privateStorage==='string'?{}:{replay:{command:data.command,plan:data.plan,...((landscape||data.command==='furniture-stock-export')?{destination:data.destination??null}:{})}}),bytes:copy,receipt:{contract:'wand.db05.experimental-copy@1',copyBytes:length,originalUnchanged:true,independentReopenVerified:true,experimentalCopyOnly:true,productionWriterAuthorized:false}},[copy.buffer]);copy=null;return;
  }
  const r=JSON.parse(wasm.preview_furniture_stock_structure(JSON.stringify(data.plan),JSON.stringify(data.destination??null)));
  if(r?.contract!=='wand.db05.furniture-stock-preview@1'||r.changed!==true||r.lexicalBytesPreserved!==true||r.structureValidated!==true||r.reopenVerified!==true||r.exportAuthorized!==false||r.runtimeReferencesVerified!==false||
   !Number.isSafeInteger(r.stockBefore)||!Number.isSafeInteger(r.stockAfter)||r.stockBefore<0||r.stockAfter<0||r.stockAfter-r.stockBefore!==(data.plan.action==='remove'?1:-1))throw Error('receipt');
  scope.postMessage({kind:'furniture-stock-preview',validated:true,stockBefore:r.stockBefore,stockAfter:r.stockAfter});
 }catch{scope.postMessage({kind:'furniture-stock-preview-error'});}
 finally{copy?.fill(0);bytes?.fill(0);wasm?.close();wasm?.free();}
};