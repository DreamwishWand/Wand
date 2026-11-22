<script lang="ts">
  import {onMount} from 'svelte';
  import {base} from '$app/paths';
  import {loadPublicStarpath} from '$lib/guide/public-starpath.mjs';
  import {guideCalendarEvents,eventScheduleState} from '$lib/guide/event-calendar.mjs';
  let festival:any=null,loading=true,error='',now=Date.now();
  async function load(){
    loading=true;error='';
    try{
      const source=await loadPublicStarpath(`${base}/guide/public/starpath-cache-2026-11-22.json`);
      festival=guideCalendarEvents(source).find((e:any)=>e.id==='haunted-floating-festival-2026');
    }catch(e){error=e instanceof Error?e.message:String(e)}
    finally{loading=false}
  }
  onMount(()=>{
    now=Date.now();
    const timer=setInterval(()=>{now=Date.now()},60000);
    void load();
    return ()=>clearInterval(timer);
  });
</script>
<svelte:head>
  <title>期間限定イベント | Dreamwish Wand Guide</title>
  <meta name="description" content="Disney Dreamlight Valleyのフローティングアイランドとバレーで開催される期間限定イベントの案内。" />
</svelte:head>
<main class="event-guide">
  <header>
    <div class="eyebrow">DREAMWISH WAND · GUIDE</div>
    <h1>期間限定イベント</h1>
    <p>フローティングアイランドやバレー内で行われる特別イベントの内容と開催日程を確認できます。</p>
    <a href={`${base}/guide/`}>Guide・イベントカレンダーへ戻る</a>
  </header>
  {#if loading}
    <p role="status">公開日程を照合しています…</p>
  {:else if error}
    <p role="alert" class="warning">日程を読み込めませんでした：{error}</p>
    <button on:click={load}>再読み込み</button>
  {:else}
    <div class="entries">
      <article>
        <span class="category">浮島イベント</span>
        <h2>The Haunted Floating Festival</h2>
        <p>2026年10月7日～31日。限定のフローティングアイランドを探索し、島に用意された謎解きを進めて、季節限定の装飾報酬を獲得するイベントです。</p>
        {#if festival}
          <p class="date">公式発表日程：{festival.startDay} ～ {festival.endDayInclusive}（開始・終了の正確な時刻は未確認）</p>
          <p class="status">{eventScheduleState(festival,now)==='ended'?'公式日程上は終了':'公式日程に基づく表示（サーバー稼働未検証）'}</p>
        {/if}
        <p class="caution">謎解きの個別解答は現在検証中です。正確な解答を確認できるまで、推測を攻略手順として掲載しません。</p>
        <a href="https://disneydreamlightvalley.com/news/update-sep-23-2026" target="_blank" rel="noopener noreferrer">公式イベント発表</a>
      </article>
      <article>
        <span class="category">バレー内イベント</span>
        <h2>Oogie Boogie’s Halloween Event</h2>
        <p>2026年秋にバレー内で展開された、ウギー・ブギーに関する6週構成のチャレンジです。週ごとに課題が追加されます。</p>
        <p class="date">公開済み情報：第6週は2026年10月28日から。イベント全体の厳密な終了日時と進行可能期間は未検証です。</p>
        <p class="caution">終了日時の裏付けがないため、イベントカレンダーには推測の時間帯を追加していません。条件・解答が検証できた内容から攻略案内を追加します。</p>
        <a href="https://disneydreamlightvalley.com/news/OogieBoogieEvent2026" target="_blank" rel="noopener noreferrer">公式イベント解説</a>
      </article>
    </div>
  {/if}
  <footer>
    <p>ゲームサーバーのリアルタイム状態・本人の進捗・参加資格は取得していません。イベント内容と期間は公式発表に基づく参考情報です。</p>
  </footer>
</main>
<style>
  .event-guide{max-width:1050px;margin:auto;padding:30px 24px 90px;color:#f4eafa}
  .eyebrow{font-size:11px;letter-spacing:.17em;color:#d2afe9;font-weight:750}
  h1{font-size:clamp(28px,4vw,42px);margin:13px 0}
  header p{color:#c7b5d3;font-size:14px;line-height:1.8}
  header a,.entries a{color:#dfbefd;font-size:13px;text-underline-offset:3px}
  .entries{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px;margin:27px 0}
  article{min-width:0;background:#21192e;border:1px solid #504065;border-radius:15px;padding:24px}
  .category{font-size:11px;color:#cba9eb}h2{font-size:21px;margin:11px 0;overflow-wrap:anywhere}
  article p{font-size:13px;color:#c4b8d1;line-height:1.85}
  article .date,.status{color:#e4c8ff;font-size:12px}
  article .caution{font-size:12px;color:#cbb29c}
  .warning{color:#eab5ba}footer{color:#aa9ab6;font-size:12px}
  @media(max-width:760px){.entries{grid-template-columns:1fr}}
  @media(max-width:540px){.event-guide{padding:20px 12px 74px}article{padding:17px}}
</style>