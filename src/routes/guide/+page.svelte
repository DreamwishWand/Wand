<script lang="ts">
  import {onMount} from 'svelte';
  import {base} from '$app/paths';
  import {loadPublicStarpath} from '$lib/guide/public-starpath.mjs';
  import {
    guideCalendarEvents,guideCalendarMonth,eventScheduleState,
    localGuideDateTime,GUIDE_EVENT_CALENDAR_AS_OF
  } from '$lib/guide/event-calendar.mjs';

  let events:any[]=[];
  let loading=true;
  let loadError='';
  let now=Date.now();
  let month='';
  $: monthGrid=month?guideCalendarMonth(events,month):[];
  $: thisMonthEvents=events.filter((e:any)=>{
    if(e.precision==='date-only')return e.startDay.slice(0,7)<=month&&e.endDayInclusive.slice(0,7)>=month;
    return e.startUtc.slice(0,7)<=month&&e.endUtcExclusive.slice(0,7)>=month;
  });
  $: scheduledStarpaths=events.filter((e:any)=>e.kind==='starpath'&&eventScheduleState(e,now)==='task-window');

  function shiftMonth(delta:number){
    const [y,m]=month.split('-').map(Number);
    if(!y||!m)return;
    const d=new Date(Date.UTC(y,m-1+delta,1));
    const target=d.toISOString().slice(0,7);
    if(d.getUTCFullYear()>=2025&&d.getUTCFullYear()<=2031)month=target;
  }
  function timeLabel(event:any){
    if(event.precision==='date-only')return `${event.startDay} ～ ${event.endDayInclusive}（開始・終了時刻は未確認）`;
    return `${localGuideDateTime(event.startUtc)} ～ ${localGuideDateTime(event.taskEndUtcExclusive)}（タスク期限・未満）`;
  }
  function scheduleLabel(event:any){
    switch(eventScheduleState(event,now)){
      case 'task-window':return '日程上のタスク期間内';
      case 'exchange-only':return 'タスク終了・交換期間内';
      case 'date-window':return '日程上の開催日（時刻未確認）';
      case 'upcoming':return '開始前';
      default:return '終了した日程';
    }
  }
  function titleOfMonth(value:string){
    const [y,m]=value.split('-').map(Number);
    return y+'年'+m+'月';
  }
  async function load(){
    loading=true;loadError='';
    try{
      const snapshot=await loadPublicStarpath(`${base}/guide/public/starpath-cache-2026-11-22.json`);
      events=guideCalendarEvents(snapshot);
    }catch(e){loadError=e instanceof Error?e.message:String(e)}
    finally{loading=false}
  }
  onMount(()=>{
    now=Date.now();
    month=new Date(now+9*3600000).toISOString().slice(0,7);
    const timer=setInterval(()=>{now=Date.now()},60000);
    void load();
    return ()=>clearInterval(timer);
  });
</script>

<svelte:head>
  <title>Guide・イベントカレンダー | Dreamwish Wand</title>
  <meta name="description" content="ディズニー ドリームライトバレーのクエスト、開催日程内のスターパス、期間限定イベントとイベントカレンダー。" />
</svelte:head>

<main class="guide-hub">
  <header class="intro">
    <div class="eyebrow">DREAMWISH WAND · GUIDE</div>
    <h1>Guide</h1>
    <p>クエストの進め方、スターパスのタスク、バレーや浮島の期間限定イベントをまとめて確認できます。</p>
  </header>
  <nav class="guide-sections" aria-label="Guideの主要機能">
    <a class="section-link" href={`${base}/guide/quests/`}>
      <span class="section-symbol" aria-hidden="true">✦</span>
      <strong>クエスト</strong>
      <span>ストーリーとフレンドシップの攻略</span>
    </a>
    <a class="section-link" href={`${base}/guide/star-path/`}>
      <span class="section-symbol" aria-hidden="true">★</span>
      <strong>スターパス</strong>
      <span>開催日程内のタスクの達成方法</span>
    </a>
    <a class="section-link" href={`${base}/guide/events/`}>
      <span class="section-symbol" aria-hidden="true">◈</span>
      <strong>期間限定イベント</strong>
      <span>フローティングアイランド・バレー内イベント</span>
    </a>
  </nav>

  <section class="calendar-section" aria-labelledby="calendar-title">
    <div class="section-heading">
      <div><h2 id="calendar-title">イベントカレンダー</h2>
        <p>開始・終了期間を日本時間で比較できます。期間が重なるイベントも表示します。</p>
      </div>
      <div class="calendar-nav">
        <button aria-label="前の月" on:click={()=>shiftMonth(-1)}>‹</button>
        <strong aria-live="polite">{month?titleOfMonth(month):''}</strong>
        <button aria-label="次の月" on:click={()=>shiftMonth(1)}>›</button>
        <button class="today" on:click={()=>month=new Date(now+9*3600000).toISOString().slice(0,7)}>今月</button>
      </div>
    </div>
    <p class="source-note">公式発表とSteam v1.26.2の保存済みデータに基づく日程です（確認基準日：{GUIDE_EVENT_CALENDAR_AS_OF}）。端末時刻で期間を判定しており、ゲームサーバーの開催状態をリアルタイム取得したものではありません。時刻未確認のイベントは日付だけを表示します。</p>
    {#if loading}
      <p role="status">イベント日程を読み込んでいます…</p>
    {:else if loadError}
      <p class="error" role="alert">日程を読み込めませんでした：{loadError}</p>
      <button on:click={load}>再読み込み</button>
    {:else}
      <div class="calendar" aria-label={`${month?titleOfMonth(month):''}のイベントカレンダー`}>
        {#each ['月','火','水','木','金','土','日'] as weekday}
          <div class="weekday">{weekday}</div>
        {/each}
        {#each monthGrid as cell (cell.day)}
          <div class:outside={!cell.isCurrent} class="day" aria-label={cell.day}>
            <span class="date">{cell.dayOfMonth}</span>
            {#each cell.events as event (event.id)}
              <a href={`${base}${event.href}`}
                class:starpath={event.kind==='starpath'}
                class:exchange={event.kind==='starpath'&&!event.taskPeriod}
                class:limited={event.kind==='limited-event'}
                title={event.title+(event.taskPeriod?'':'（交換期間）')}
                class="event-strip">
                {event.kind==='starpath'?(event.taskPeriod?'★':'◇'):'◈'} {event.title}
              </a>
            {/each}
          </div>
        {/each}
      </div>
      {#if !thisMonthEvents.length}
        <p class="no-month-events">この月に登録されたイベント日程はありません。日程未確認のイベントは掲載されません。</p>
      {/if}
      <div class="calendar-legend">
        <span><i class="legend-star"></i> スターパスのタスク期間</span>
        <span><i class="legend-exchange"></i> スターパスの交換期間</span>
        <span><i class="legend-limited"></i> その他の期間限定イベント</span>
      </div>
      <div class="events-list">
        <h3>登録済みのイベント日程</h3>
        {#each events as event (event.id)}
          <article class="schedule-card">
            <div class="event-top"><strong>{event.title}</strong><span>{scheduleLabel(event)}</span></div>
            <p>{timeLabel(event)}</p>
            {#if event.kind==='starpath'}
              <p>報酬交換期限：{localGuideDateTime(event.endUtcExclusive)}（未満）</p>
            {/if}
            <div class="event-actions">
              <a href={`${base}${event.href}`}>ガイドを見る</a>
              <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer">公式発表</a>
            </div>
          </article>
        {/each}
      </div>
      <p class="source-note">{scheduledStarpaths.length}件のスターパスが現在の日程上のタスク期間内です。表示は公式サーバーでのリアルタイム開催確認とは異なります。ゲーム内の開催状況を優先してください。</p>
    {/if}
  </section>

  <footer>
    <p>ゲーム進捗・所有権・サーバーの即時配信状態は取得しません。非公式ファンガイドです。</p>
    <a href={`${base}/guide/source/`}>原本データをローカルで検証する開発用画面</a>
  </footer>
</main>
<style>
  .guide-hub{max-width:1220px;margin:0 auto;padding:28px 24px 95px;color:#f2eafa}
  .intro h1{font-size:clamp(32px,4.5vw,48px);margin:12px 0}
  .eyebrow{color:#cfafe9;font-size:11px;letter-spacing:.2em;font-weight:700}
  .intro p,.section-heading p{color:#bcafca;font-size:14px;line-height:1.6}
  .guide-sections{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:28px 0 42px}
  .section-link{display:grid;gap:9px;text-decoration:none;padding:23px 19px;background:#21192f;border:1px solid #4b3b60;border-radius:15px;min-width:0}
  .section-link:hover{background:#302440;border-color:#9c7cc5}.section-link strong{font-size:19px}
  .section-link span:last-child{font-size:12px;color:#c1afce}
  .section-symbol{font-size:28px;color:#dab6ff}
  .section-heading{display:flex;gap:18px;align-items:end;justify-content:space-between;flex-wrap:wrap}
  .section-heading h2{font-size:23px;margin:0 0 7px}
  .calendar-nav{display:flex;align-items:center;gap:9px}
  .calendar-nav strong{min-width:110px;text-align:center}
  .calendar-nav button{background:#30243d;border:1px solid #725b89;border-radius:8px;color:#f2e5fc;padding:8px 12px}
  .calendar-nav .today{font-size:12px}
  .source-note{color:#bba8c7;font-size:12px;line-height:1.75;margin:17px 0}
  .calendar{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border-top:1px solid #514163;border-left:1px solid #514163;background:#191321;border-radius:9px;overflow:hidden}
  .weekday{text-align:center;font-size:12px;color:#c9b4db;padding:10px 0;background:#241b2f;border-right:1px solid #514163;border-bottom:1px solid #514163}
  .day{min-height:99px;border-right:1px solid #514163;border-bottom:1px solid #514163;padding:7px 4px;min-width:0;display:flex;flex-direction:column;gap:4px}
  .day.outside{opacity:.4;background:#211a2a}
  .date{font-size:11px;padding-left:4px;color:#dfccec;font-variant-numeric:tabular-nums}
  .event-strip{font-size:10px;background:#46345e;color:#f6e3ff;padding:4px 5px;border-radius:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-decoration:none;display:block}
  .event-strip.starpath{background:#583376}
  .event-strip.exchange{background:#5d505f}
  .event-strip.limited{background:#24585a}
  .event-strip:hover{outline:1px solid white}
  .calendar-legend{display:flex;gap:17px;flex-wrap:wrap;margin:15px 0;font-size:12px;color:#b8a6c8}
  .calendar-legend span{display:flex;align-items:center;gap:7px}
  .calendar-legend i{width:11px;height:11px;border-radius:2px;display:inline-block}
  .legend-star{background:#583376}.legend-exchange{background:#5d505f}.legend-limited{background:#24585a}
  .no-month-events{font-size:12px;color:#bba6c9}
  .events-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px;margin-top:35px}
  .events-list h3{grid-column:1/-1;font-size:17px;margin:0 0 4px}
  .schedule-card{background:#21182d;border:1px solid #4d3a5f;border-radius:11px;padding:16px;min-width:0}
  .event-top{display:flex;align-items:start;justify-content:space-between;gap:8px}
  .event-top strong{font-size:15px}.event-top span{font-size:11px;color:#dac1ed;text-align:right}
  .schedule-card p{font-size:12px;line-height:1.6;color:#c8bad3;margin:10px 0 0}
  .event-actions{display:flex;gap:17px;margin-top:13px;font-size:12px}
  .event-actions a,footer a{color:#dcc1f5;text-underline-offset:3px}
  .error{color:#f8b2bd}footer{margin-top:40px;font-size:12px;color:#a898b6}
  @media(max-width:720px){.guide-sections{grid-template-columns:1fr}.section-link{padding:15px 17px}.events-list{grid-template-columns:1fr}}
  @media(max-width:560px){.guide-hub{padding:20px 12px 80px}.day{min-height:75px;padding:4px 2px}.date{font-size:10px}.event-strip{font-size:8px;padding:4px 2px}.calendar-nav{gap:4px}.calendar-nav button{padding:7px 9px}.calendar-legend{font-size:10px}}
</style>