import init,{convert_native_decoration_to_scene,inspect_native_preset_backup} from '../save/wasm/p1g-pkg/ddv_p1g_codec.js';
import wasmUrl from '../save/wasm/p1g-pkg/ddv_p1g_codec_bg.wasm?url';
import {readPresetText} from './preset-file.ts';
const scope=self as unknown as {onmessage:((e:MessageEvent)=>void)|null;postMessage:(v:unknown)=>void};
scope.onmessage=async({data})=>{
 try{
  if(!['convert','inspect'].includes(data?.command)||!(data.file instanceof File))throw Error('request');
  const raw=await readPresetText(data.file);await init(wasmUrl);
  if(data.command==='inspect')scope.postMessage({kind:'native-detail',result:JSON.parse(inspect_native_preset_backup(raw))});
  else scope.postMessage({kind:'native-scene',raw:convert_native_decoration_to_scene(raw)});
 }catch{scope.postMessage({kind:'error'});}
};
