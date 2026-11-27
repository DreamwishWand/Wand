<script lang="ts">
  import {onDestroy} from 'svelte';
  import PosePreview from '../../src/lib/photo-mode/PosePreview.svelte';
  import {LocalCollectionPackage,bodyTypes,type BodyType} from './local-collection.ts';
  import type {PoseScene} from '../../src/lib/photo-mode/scene-session.ts';
  let {itemId,locale}:{itemId:number;locale:string}=$props();
  let options=$state<{id:BodyType;iconUrl:string;label:string;load:(signal:AbortSignal)=>Promise<PoseScene>}[]>([]);
  let status=$state<'idle'|'loading'|'ready'|'missing'|'error'>('idle');
  let generation=0,urls:string[]=[];
  const ja={title:'ローカル動作プレビュー（開発用）',note:'非公開の診断用素材を選択。ゲーム内姿勢との一致は未検証です。小道具は含まれません。',select:'診断用フォルダ',missing:'このアイテムのシーンは含まれていません',error:'診断用ファイルを読み込めません',play:'再生',pause:'一時停止',restart:'最初から再生',loop:'ループ',speed:'速度',time:'再生位置',zoom:'拡大縮小',resetView:'視点を戻す',orbit:'ドラッグで回転',loading:'読み込み中',unavailable:'3D表示を利用できません',bodyType:'体型',companion:'コンパニオン'};
  const en={title:'Local pose preview (development)',note:'Select private diagnostic assets. Game-pose parity is unverified. Props are not included.',select:'Diagnostic folder',missing:'No scene for this item',error:'Cannot read diagnostic assets',play:'Play',pause:'Pause',restart:'Restart',loop:'Loop',speed:'Speed',time:'Time',zoom:'Zoom',resetView:'Reset view',orbit:'Drag to orbit',loading:'Loading',unavailable:'3D rendering unavailable',bodyType:'Body type',companion:'Companion'};
  let copy=$derived(locale==='ja'?ja:en);
  function clear(){options=[];for(const url of urls)URL.revokeObjectURL(url);urls=[]}
  async function load(e:Event){
    const input=e.currentTarget as HTMLInputElement,token=++generation;clear();status='loading';
    try{
      const pkg=await LocalCollectionPackage.open(Array.from(input.files??[]));if(token!==generation)return;
      if(!pkg.has(itemId)){status='missing';return}
      const data=await Promise.all(bodyTypes.map(b=>pkg.icon(b)));if(token!==generation)return;
      const id=itemId;
      options=bodyTypes.map((b,i)=>{const iconUrl=URL.createObjectURL(new Blob([data[i]],{type:'image/png'}));urls.push(iconUrl);return {id:b,iconUrl,label:copy.bodyType+' '+(i+1),load:signal=>pkg.scene(id,b,copy.companion,signal)}});status='ready';
    }catch{if(token===generation){clear();status='error'}}
  }
  onDestroy(()=>{generation++;clear()});
</script>
<details class="diagnostic">
  <summary>{copy.title}</summary>
  <p>{copy.note}</p>
  <label>{copy.select}<input type="file" webkitdirectory multiple onchange={load}/></label>
  {#if status==='ready'&&options.length}
    {#key options}<PosePreview {options} {copy}/>{/key}
  {:else if status==='loading'}<p role="status">{copy.loading}</p>
  {:else if status==='missing'}<p role="status">{copy.missing}</p>
  {:else if status==='error'}<p role="status">{copy.error}</p>{/if}
</details>
<style>
  .diagnostic{margin:8px 0;color:var(--wand-text)}
  summary{cursor:pointer}
  p{font-size:.8rem}
  label{display:grid;gap:4px;margin:8px 0}
  input{max-width:100%}
</style>
