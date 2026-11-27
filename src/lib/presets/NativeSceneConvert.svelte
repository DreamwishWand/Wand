<script lang="ts">
 import {onDestroy} from 'svelte';
 import {base} from '$app/paths';
 import type {WandLanguage} from '$lib/ui/preferences';
 import type {SessionPreset} from './preset-session-format.ts';
 import {parseSceneAnyFactor} from '../world/scene-preset.ts';
 import {parseMixedScene} from '../world/support-scene.ts';
 import {rememberPreset,downloadPresetFile} from './preset-session.ts';
 import {nativeSceneWords} from './native-scene-words.ts';
 export let entry:SessionPreset;
 export let locale:WandLanguage;
 let job:Worker|null=null,geometry:Worker|null=null,busy=false,error=false,done=false,epoch=0,previous:SessionPreset|null=null;
 $: w=nativeSceneWords[locale];
 $: if(previous!==entry){previous=entry;clear();}
 function clear(){epoch++;job?.terminate();geometry?.terminate();job=geometry=null;busy=error=done=false;}
 onDestroy(clear);
 async function convert(){
  if(busy||entry.kind!=='native-decoration'||!entry.privateBackup)return;
  clear();busy=true;const token=epoch,source=entry;
  const own=new Worker(new URL('./native-scene.worker.ts',import.meta.url),{type:'module'});job=own;
  const fail=()=>{if(epoch!==token)return;job?.terminate();geometry?.terminate();job=geometry=null;busy=false;error=true;};
  own.onerror=fail;own.onmessageerror=fail;
  own.onmessage=e=>{
   own.terminate();if(epoch!==token)return;job=null;
   try{
    if(e.data?.kind!=='native-scene'||typeof e.data.raw!=='string')throw Error('scene');
    const raw=e.data.raw;try{parseSceneAnyFactor(raw);}catch{parseMixedScene(raw);}
    const g=new Worker(new URL('../world/public-world-terrain.worker.ts',import.meta.url),{type:'module'});geometry=g;g.onerror=fail;g.onmessageerror=fail;
    g.onmessage=async event=>{
     if(epoch!==token)return;const v=event.data;
     if(v?.requestId===1&&v.kind==='index'){g.postMessage({command:'native-scene-geometry',requestId:2,raw});return;}
     if(v?.requestId!==2||v.kind!=='native-scene-geometry'||v.valid!==true){fail();return;}
     g.terminate();geometry=null;
     try{const f=new File([raw],source.name+'-scene.json',{type:'application/json'});const saved=await rememberPreset(f,raw);if(epoch!==token)return;await downloadPresetFile(saved.file,saved.name);if(epoch===token){done=true;busy=false;}}
     catch{fail();}
    };
    g.postMessage({command:'open',requestId:1,base});
   }catch{fail();}
  };
  own.postMessage({command:'convert',file:entry.file});
 }
</script>
<button type="button" disabled={busy} on:click={convert}>{busy?w[2]:w[0]}</button>
{#if error}<small role="alert">{w[1]}</small>{/if}
{#if done}<small role="status">{w[3]}</small>{/if}
<style>button{color:inherit;font:inherit;background:var(--wand-card);border:1px solid var(--wand-line);border-radius:5px;padding:7px}button:disabled{opacity:.5}</style>
