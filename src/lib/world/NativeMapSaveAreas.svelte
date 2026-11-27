<script lang="ts">
 import {onDestroy} from 'svelte';
 import {localSaveSession} from '../ui/local-save-session.ts';
 import {savedNativeAreaFlags,explicitSavedPreviewStates} from '../media/native-map-save-area-flags.ts';
 export let mapId:string;
 export let areaTypes:readonly number[];
 export let onApply:(states:Map<number,boolean>,file:File)=>void;
 let worker:Worker|null=null,projection:unknown=null,loading=false,error=false,readFile:File|null=null;
 $: if($localSaveSession.file!==readFile)reset($localSaveSession.file);
 $: rows=savedNativeAreaFlags(mapId,areaTypes,projection);
 $: complete=explicitSavedPreviewStates(rows);
 function reset(file:File|null){worker?.terminate();worker=null;readFile=file;projection=null;loading=false;error=false;}
 function read(){
  const file=$localSaveSession.file;if(!file)return;
  reset(file);loading=true;
  const own=new Worker(new URL('./native-map-save-areas.worker.ts',import.meta.url),{type:'module'});worker=own;
  const finish=(result:unknown)=>{own.terminate();if(worker!==own||$localSaveSession.file!==file)return;worker=null;loading=false;projection=result;error=result===null;};
  own.onmessage=({data})=>finish(data.kind==='area-flags'?data.result:null);own.onerror=()=>finish(null);own.postMessage({file});
 }
 onDestroy(()=>worker?.terminate());
</script>
{#if $localSaveSession.file&&areaTypes.length}
 <details><summary>セーブ内の区画情報（検証）</summary>
  <button type="button" disabled={loading} on:click={read}>保存フラグを確認</button>
  {#if loading}<p role="status">セーブを端末内で読み込み中…</p>{/if}
  {#if error}<p role="alert">区画情報を取得できませんでした。</p>{/if}
  {#if projection}
   <div class="flags">{#each rows as row}<span>区画 {row.areaType}: {row.unlocked===null?'不明':row.unlocked?'解放':'未解放'}</span>{/each}</div>
   <button type="button" disabled={!complete||!readFile||readFile!==$localSaveSession.file} on:click={()=>{if(complete&&readFile&&readFile===$localSaveSession.file)onApply(complete,readFile);}}>保存フラグで試験表示</button>
   <p>ゲームの実行時判定は未確認です。不明な区画がある場合は試験表示しません。セーブは変更されません。</p>
  {/if}
 </details>
{/if}
<style>.flags{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px}p{font-size:12px;margin:4px 0}</style>
