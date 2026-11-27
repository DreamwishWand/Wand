<script lang="ts">
  import {base} from '$app/paths';
  import {onMount} from 'svelte';
  import PosePreview from './PosePreview.svelte';
  import {loadPagesPoseIndex,bodyTypes,assetUrl,loadPreviewScene,type BodyType} from './pages-preview.ts';
  import type {PoseScene} from './scene-session.ts';
  let {itemId,locale}:{itemId:number;locale:string}=$props();
  let options=$state<{id:BodyType;iconUrl:string;label:string;load:(signal:AbortSignal)=>Promise<PoseScene>}[]>([]);
  let expanded=$state(false);
  let playerOnly=$state(false);
  const ja={title:'3Dポーズプレビュー（テスト）',note:'ゲーム内の最終姿勢・外見との一致は未検証です。',partial:'現在は1体型のみ対応しています。',playerOnly:'小道具は未対応です。',play:'再生',pause:'一時停止',restart:'最初から再生',loop:'ループ',speed:'速度',time:'再生位置',zoom:'拡大縮小',resetView:'視点を戻す',orbit:'ドラッグで回転',loading:'読み込み中',unavailable:'3D表示を利用できません',bodyType:'体型',companion:'コンパニオン'};
  const en={title:'3D pose preview (test)',note:'In-game appearance and final pose are not yet verified.',partial:'Only one body type is currently available.',playerOnly:'Props are not included yet.',play:'Play',pause:'Pause',restart:'Restart',loop:'Loop',speed:'Speed',time:'Time',zoom:'Zoom',resetView:'Reset view',orbit:'Drag to orbit',loading:'Loading',unavailable:'3D rendering unavailable',bodyType:'Body type',companion:'Companion'};
  let copy=$derived(locale==='ja'?ja:en);
  onMount(()=>{
    let alive=true;
    void loadPagesPoseIndex(base).then(m=>{if(!alive||!m)return;const row=m.items[String(itemId)];if(!row)return;playerOnly=bodyTypes.some(b=>row[b]?.kind==='player');options=bodyTypes.flatMap((b,i)=>{const entry=row[b];return entry?[{id:b,iconUrl:assetUrl(base,m.bodyIcons[b],'.png'),label:copy.bodyType+' '+(i+1),load:(signal:AbortSignal)=>loadPairScene(base,itemId,entry,copy.companion,signal)}]:[]})}).catch(()=>{});
    return()=>{alive=false};
  });
</script>
{#if options.length}
  <details class="pose-test" bind:open={expanded}>
    <summary>{copy.title}</summary>
    {#if expanded}
      <p>{copy.note} {#if options.length===1}{copy.partial}{/if} {#if playerOnly}{copy.playerOnly}{/if}</p>
      <PosePreview {options} {copy}/>
    {/if}
  </details>
{/if}
<style>
  .pose-test{margin:8px 0;color:var(--wand-text)}
  summary{cursor:pointer;font-weight:600}
  p{font-size:.8rem}
</style>
