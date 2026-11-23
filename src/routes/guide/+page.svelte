<script lang="ts">
  import {onMount,tick} from 'svelte';
  import {base} from '$app/paths';
  import WandIcon from '$lib/ui/WandIcon.svelte';
  import {loadPublicStarpath} from '$lib/guide/public-starpath.ts';
  import {starpathSeasonHref} from '$lib/guide/starpath-duty-link.ts';
  import {guideCalendarEvents,eventScheduleState,
    GUIDE_EVENT_CALENDAR_AS_OF,type GuideCalendarEvent
  } from '$lib/guide/event-calendar.ts';
  import {viewerEventDateTime} from '$lib/guide/viewer-event-time.ts';
  import {guideTimelineWindow,guideTimelineRows,
    type GuideTimelinePhase
  } from '$lib/guide/event-timeline.ts';

  let events:GuideCalendarEvent[]=[];
  let loading=true;
  let loadError='';
  let now=Date.now();
  let viewerZone='UTC';
  let viewerLocale='ja-JP';
  $: formatLocal=(utc:string)=>viewerEventDateTime(utc,viewerZone,viewerLocale);
  let weeks:5|9=5;
  let offsetWeeks=0;
  let selectedId:string|null=null;
  let timelineScroller:HTMLDivElement|null=null;

  $: windowRange=guideTimelineWindow(now,weeks,offsetWeeks);
  $: visibleRows=guideTimelineRows(events,windowRange);
  $: selected=events.find(event=>event.id===selectedId)??null;
  $: rangeText=shortDay(windowRange.firstDay)+' – '+shortDay(windowRange.lastDay);
  const weekdays=['日','月','火','水','木','金','土'];

  function shortDay(day:string):string{
    const parts=day.split('-');
    return Number(parts[1])+'/'+Number(parts[2]);
  }
  function eventHref(event:GuideCalendarEvent):string{
    return event.kind==='starpath'
      ?starpathSeasonHref(base,event.sourceSeasonId):`${base}${event.href}`;
  }
  function eventIcon(event:GuideCalendarEvent):string{
    return event.kind==='starpath'?'star':'world';
  }
  function phaseName(phase:GuideTimelinePhase):string{
    return phase==='task'?'タスク期間':phase==='exchange'?'交換期間':'開催日';
  }
  function stateName(event:GuideCalendarEvent):string{
    switch(eventScheduleState(event,now)){
      case 'task-window':return 'タスク期間内';
      case 'exchange-only':return '交換期間内';
      case 'date-window':return '開催日';
      case 'upcoming':return '開始前';
      default:return '終了';
    }
  }
  function eventBoundary(event:GuideCalendarEvent):string{
    if(event.precision==='date-only')
      return `${event.startDay} ～ ${event.endDayInclusive}（時刻未確認）`;
    return `${formatLocal(event.startUtc)} ～ ${formatLocal(event.endUtcExclusive)}`;
  }
  function showEvent(id:string){selectedId=selectedId===id?null:id;}
  function navigate(direction:-1|1){
    const next=offsetWeeks+direction*weeks;
    if(next< -104||next>104)return;
    offsetWeeks=next;selectedId=null;
    if(timelineScroller)timelineScroller.scrollLeft=0;
  }
  function changeZoom(value:5|9){
    if(weeks===value)return;
    weeks=value;offsetWeeks=0;selectedId=null;
    void centreToday();
  }
  async function centreToday(){
    await tick();
    const scroller=timelineScroller;
    const today=scroller?.querySelector('.date-slot.today') as HTMLElement|null;
    if(!scroller||!today)return;
    // Use viewport-relative rectangles: offsetLeft depends on layout/offsetParent.
    // The outer page never scrolls; only the event timeline moves.
    const scrollerBox=scroller.getBoundingClientRect();
    const dayBox=today.getBoundingClientRect();
    scroller.scrollLeft+=dayBox.left+dayBox.width/2-
      (scrollerBox.left+scrollerBox.width/2);
  }
  function goToday(){
    offsetWeeks=0;selectedId=null;
    void centreToday();
  }
  async function load(){
    loading=true;loadError='';
    try{
      const snapshot=await loadPublicStarpath(`${base}/guide/public/starpath-cache-2026-11-22.json`);
      events=guideCalendarEvents(snapshot);
    }catch(error){
      loadError=error instanceof Error?error.message:String(error);
    }finally{
      loading=false;
      if(!loadError)void centreToday();
    }
  }
  onMount(()=>{
    viewerZone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
    viewerLocale=navigator.language||'ja-JP';
    now=Date.now();
    const timer=setInterval(()=>{now=Date.now();},60000);
    void load();
    return ()=>clearInterval(timer);
  });
</script>

<svelte:head>
  <title>Guide | Dreamwish Wand</title>
  <meta name="description" content="クエスト、スターパス、期間限定イベントの開催期間と攻略を確認できるDreamwish Wandガイド。" />
</svelte:head>

<main class="guide-app" aria-label="Guide">
  <nav class="guide-sections" aria-label="ガイドの機能">
    <span class="pending" aria-disabled="true" title="準備中"><WandIcon name="grid" size={20}/><span>システム</span></span>
    <a href={`${base}/guide/quests/`}><WandIcon name="guide" size={20}/><span>クエスト</span></a>
    <a href={`${base}/guide/star-path/`}><WandIcon name="star" size={20}/><span>スターパス</span></a>
    <a href={`${base}/guide/events/`}><WandIcon name="world" size={20}/><span>イベント</span></a>
  </nav>

  <section class="timeline-panel" aria-label="イベント開催期間">
    <div class="timeline-toolbar">
      <div class="timeline-title">
        <WandIcon name="grid" size={19}/>
        <strong>イベント</strong>
        <span class="zone" title="タイムラインの日付軸は日本時間。選択したイベントの日時は閲覧者の現地時間">JST軸</span>
        <details class="source-info">
          <summary aria-label="日程の出典と注意"><WandIcon name="info" size={17}/></summary>
          <p>公式発表とSteam v1.26.2の保存済みデータ（確認日：{GUIDE_EVENT_CALENDAR_AS_OF}）。ゲームサーバーの開催状況をリアルタイム確認したものではありません。時刻未確認のイベントは日付単位で表示します。</p>
        </details>
      </div>
      <div class="calendar-nav">
        <div class="zoom" role="group" aria-label="表示する期間">
          <button class:active={weeks===5} aria-pressed={weeks===5} on:click={()=>changeZoom(5)}>5週</button>
          <button class:active={weeks===9} aria-pressed={weeks===9} on:click={()=>changeZoom(9)}>9週</button>
        </div>
        <button class="nav-arrow previous" aria-label="前の期間" title="前の期間"
          on:click={()=>navigate(-1)}><WandIcon name="chevron" size={17}/></button>
        <strong class="range" aria-live="polite">{rangeText}</strong>
        <button class="nav-arrow next" aria-label="次の期間" title="次の期間"
          on:click={()=>navigate(1)}><WandIcon name="chevron" size={17}/></button>
        <button class="today-button" on:click={goToday}>今日</button>
      </div>
    </div>

    <div class="timeline-key" aria-label="表示記号">
      <span><i class="sample task"></i>タスク</span>
      <span><i class="sample exchange"></i>交換</span>
      <span><i class="sample limited"></i>イベント</span>
      <span class="reset-key"><WandIcon name="restore" size={14}/>水曜リセット</span>
    </div>

    {#if loading}
      <div class="message" role="status">読み込み中…</div>
    {:else if loadError}
      <div class="message error" role="alert">日程を読み込めませんでした
        <button on:click={load}>再読み込み</button>
      </div>
    {:else}
      <div class="timeline-scroll" bind:this={timelineScroller} role="region" tabindex="0"
        aria-label="開催期間タイムライン（横スクロールで日付を移動）">
        <div class="timeline-content" style={`--day-count:${windowRange.days.length};min-width:${205+windowRange.days.length*30}px`}>
          <div class="timeline-heading">
            <div class="date-label">イベント</div>
            <div class="dates-grid">
              {#each windowRange.days as day (day.day)}
                <div class="date-slot" class:reset={day.reset} class:today={day.today}
                  title={day.day+(day.reset?' · 水曜リセット':'')}>
                  <span class="weekday">{weekdays[day.weekday]}</span>
                  <span class="date-number">{day.dayNumber}</span>
                  {#if day.weekday===0}<span class="month-label">{day.month}月</span>{/if}
                  {#if day.reset}<span class="reset-symbol"><WandIcon name="restore" size={12}/></span>{/if}
                </div>
              {/each}
            </div>
          </div>
          {#each visibleRows as row (row.event.id)}
            <div class="timeline-row" class:selected={selectedId===row.event.id}>
              <button class="event-label" on:click={()=>showEvent(row.event.id)}
                aria-pressed={selectedId===row.event.id} title={row.event.title}>
                <span class="event-symbol"><WandIcon name={eventIcon(row.event)} size={17}/></span>
                <span class="event-name">{row.event.title}</span>
                <span class="row-chevron"><WandIcon name="chevron" size={15}/></span>
              </button>
              <div class="event-track">
                <div class="track-grid" aria-hidden="true">
                  {#each windowRange.days as day (day.day)}
                    <div class="track-day" class:reset={day.reset} class:today={day.today}></div>
                  {/each}
                </div>
                {#each row.segments as segment, i (`${row.event.id}-${i}`)}
                  <button class="timeline-bar"
                    class:task={segment.phase==='task'}
                    class:exchange={segment.phase==='exchange'}
                    class:limited={segment.phase==='limited'}
                    class:clipped-start={segment.clippedStart}
                    class:clipped-end={segment.clippedEnd}
                    class:selected={selectedId===row.event.id}
                    style={`left:${segment.left}%;width:${segment.width}%`}
                    title={`${row.event.title} · ${phaseName(segment.phase)} · ${eventBoundary(row.event)}`}
                    aria-label={`${row.event.title} · ${phaseName(segment.phase)} · 詳細を表示`}
                    aria-pressed={selectedId===row.event.id}
                    on:click={()=>showEvent(row.event.id)}>
                    {#if segment.width>12}
                      <span>{phaseName(segment.phase)}</span>
                    {/if}
                  </button>
                {/each}
                {#if windowRange.todayPosition!==null}
                  <div class="today-line" style={`left:${windowRange.todayPosition}%`} aria-hidden="true"></div>
                {/if}
              </div>
            </div>
          {/each}
          {#if visibleRows.length===0}
            <div class="timeline-row empty-row">
              <div class="event-label blank"></div>
              <div class="empty-events">この期間に登録されたイベントはありません</div>
            </div>
          {/if}
        </div>
      </div>

      {#if selected}
        <div class="event-inspector" aria-label="選択したイベントの詳細">
          <div class="event-inspector-heading">
            <WandIcon name={eventIcon(selected)} size={22}/>
            <div><strong>{selected.title}</strong><small>{stateName(selected)} · {selected.precision==='utc-instant'?viewerZone:'日付のみ'}</small></div>
            <button class="close" aria-label="詳細を閉じる" on:click={()=>selectedId=null}>
              <WandIcon name="close" size={18}/>
            </button>
          </div>
          <div class="date-facts">
            {#if selected.precision==='date-only'}
              <div><small>開始日</small><strong>{selected.startDay}</strong></div>
              <div><small>終了日</small><strong>{selected.endDayInclusive}</strong></div>
              <span class="uncertain"><WandIcon name="info" size={15}/>開始・終了時刻は未確認</span>
            {:else}
              <div><small>開始</small><strong>{formatLocal(selected.startUtc)}</strong></div>
              <div><small>タスク終了</small><strong>{formatLocal(selected.taskEndUtcExclusive)}</strong></div>
              <div><small>交換終了</small><strong>{formatLocal(selected.endUtcExclusive)}</strong></div>
            {/if}
          </div>
          <div class="inspector-actions">
            <a class="primary" href={eventHref(selected)}>攻略を見る <WandIcon name="arrow" size={16}/></a>
            <a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">
              公式情報 <WandIcon name="link" size={14}/>
            </a>
          </div>
        </div>
      {/if}
    {/if}
  </section>
</main>

<style>
  .guide-app{box-sizing:border-box;width:100%;max-width:none;min-width:0;margin:0;padding:12px clamp(8px,1.4vw,22px) 14px;min-height:calc(100dvh - 64px);display:flex;flex-direction:column;gap:10px;color:#eee9f6}
  .guide-sections{display:flex;gap:7px;flex-wrap:wrap}
  .guide-sections a,.guide-sections .pending{display:flex;align-items:center;justify-content:center;gap:9px;min-width:0;padding:9px 15px;border:1px solid #544261;background:#251c32;border-radius:10px;color:#e2d6ed;text-decoration:none;font-size:13px;font-weight:650}
  .guide-sections .pending{opacity:.5;cursor:not-allowed}
  .guide-sections a:hover,.guide-sections a:focus-visible{background:#403052;border-color:#b18bd7}
  .guide-sections :global(svg){color:#dcb8ff}
  .timeline-panel{display:flex;flex-direction:column;flex:1;min-height:0;min-width:0;background:#181321;border:1px solid #493952;border-radius:15px;overflow:hidden}
  .timeline-toolbar{position:relative;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;padding:12px 15px;border-bottom:1px solid #48374f;background:#211a2c}
  .timeline-title{display:flex;align-items:center;gap:9px;min-width:0}
  .timeline-title>strong{font-size:17px;font-weight:700}
  .timeline-title :global(svg){color:#d1a8ed}
  .zone{font-size:10px;border:1px solid #51435d;color:#ac9bb9;padding:2px 5px;border-radius:4px}
  .source-info{position:static;font-size:12px}
  .source-info summary{display:flex;align-items:center;cursor:pointer;list-style:none;padding:5px;color:#c1afcc}
  .source-info summary::-webkit-details-marker{display:none}
  .source-info p{position:absolute;z-index:15;top:100%;right:12px;width:min(360px,calc(100% - 24px));box-sizing:border-box;padding:13px;margin:0;background:#352844;border:1px solid #8869a2;border-radius:9px;color:#ded1e9;box-shadow:0 8px 25px #0007;line-height:1.6}
  .calendar-nav{display:flex;align-items:center;gap:7px;min-width:0}
  .calendar-nav button{border:1px solid #624b75;background:#2e233b;color:#ede2f5;border-radius:8px;padding:7px 10px;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
  .calendar-nav button:hover,.calendar-nav button:focus-visible{background:#4c3765;border-color:#aa88d0}
  .calendar-nav .range{min-width:125px;font-size:13px;text-align:center;font-variant-numeric:tabular-nums;color:#f0e8f9}
  .calendar-nav .zoom{display:flex;border:1px solid #624b75;border-radius:8px;overflow:hidden;margin-right:8px}
  .zoom button{border:0;border-radius:0;padding:7px 10px}
  .zoom button+button{border-left:1px solid #624b75}
  .zoom button.active{background:#634582;color:#fff}
  .calendar-nav .nav-arrow{display:grid;place-items:center;width:32px;height:32px;padding:4px}
  .nav-arrow.previous :global(svg){transform:rotate(90deg)}
  .nav-arrow.next :global(svg){transform:rotate(-90deg)}
  .calendar-nav .today-button{background:#4c365e}
  .timeline-key{display:flex;align-items:center;flex-wrap:wrap;gap:15px;padding:7px 15px;font-size:11px;color:#b6a4c1}
  .timeline-key span{display:flex;align-items:center;gap:6px}
  .sample{display:inline-block;width:17px;height:6px;border-radius:8px}
  .sample.task{background:#9c6dd2}.sample.exchange{background:#b5a4b9}.sample.limited{background:#4aabae}
  .reset-key :global(svg){color:#c3a4e2}
  .timeline-scroll{min-width:0;max-width:100%;overflow-x:auto;overflow-y:hidden;flex:1;scrollbar-color:#705b84 #21172d;scrollbar-width:thin}
  .timeline-content{--sidebar-width:205px;width:100%}
  .timeline-heading,.timeline-row{display:grid;grid-template-columns:var(--sidebar-width) minmax(0,1fr);min-width:0}
  .timeline-heading{min-height:64px;border-top:1px solid #4a3953;border-bottom:1px solid #52415e;background:#221a2b}
  .date-label{position:sticky;left:0;z-index:5;display:flex;align-items:center;padding-left:16px;background:#231a30;font-size:12px;color:#c0aeca;border-right:1px solid #52415e}
  .dates-grid,.track-grid{display:grid;grid-template-columns:repeat(var(--day-count),minmax(0,1fr));min-width:0}
  .date-slot{position:relative;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border-right:1px solid #352a3f;font-variant-numeric:tabular-nums;font-size:11px;color:#a99ab9}
  .date-slot .weekday{font-size:10px;color:#83758f}
  .date-number{font-size:13px;color:#d1c5dc}
  .date-slot.reset{background:#3a2b4c;border-left:1px solid #8363a9}
  .date-slot.reset .weekday,.date-slot.reset .date-number{color:#e6c9fa;font-weight:700}
  .date-slot.today{background:#4b3559;box-shadow:inset 0 -3px #e3bad5}
  .month-label{position:absolute;top:1px;font-size:9px;color:#b4a1c9}
  .reset-symbol{position:absolute;bottom:0;color:#b894df}
  .timeline-row{height:71px;border-bottom:1px solid #35293f}
  .timeline-row.selected{background:#2a2037}
  .event-label{position:sticky;left:0;z-index:5;display:flex;align-items:center;gap:9px;width:100%;min-width:0;box-sizing:border-box;padding:10px 12px;background:#211829;color:#eee3f4;text-align:left;border:0;border-right:1px solid #52415e;cursor:pointer}
  .timeline-row.selected .event-label{background:#382847}
  .event-label:hover{background:#34243f}
  .row-chevron{display:flex;flex-shrink:0;margin-left:auto}
  .row-chevron :global(svg){transform:rotate(-90deg);color:#9581aa}
  .event-symbol{color:#ca9bf2;flex-shrink:0}
  .event-name{min-width:0;font-size:12px;font-weight:600;line-height:1.3;overflow-wrap:anywhere}
  .event-track{position:relative;min-width:0;height:100%;display:flex;align-items:center}
  .track-grid{position:absolute;inset:0;pointer-events:none}
  .track-day{border-right:1px solid #33293d}
  .track-day.reset{background:#3c2d4e55;border-left:1px solid #694e82}
  .track-day.today{background:#70475c35}
  .timeline-bar{position:absolute;z-index:2;top:50%;transform:translateY(-50%);height:30px;min-width:0;box-sizing:border-box;border:1px solid #c9a5f44d;border-radius:5px;background:#8d5cbc;color:#fff;cursor:pointer;overflow:hidden;padding:0 4px}
  .timeline-bar span{display:block;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;font-size:10px;line-height:1.2}
  .timeline-bar.task{background:linear-gradient(180deg,#8055ac,#9d68d2)}
  .timeline-bar.exchange{background:linear-gradient(180deg,#6d6078,#8c7c94);border-color:#b4a7c2}
  .timeline-bar.limited{background:linear-gradient(180deg,#2b777c,#43a0a6);border-color:#7bc2c4}
  .timeline-bar.clipped-start{border-top-left-radius:0;border-bottom-left-radius:0;border-left:2px dashed #ddc6ed}
  .timeline-bar.clipped-end{border-top-right-radius:0;border-bottom-right-radius:0;border-right:2px dashed #ddc6ed}
  .timeline-bar:hover,.timeline-bar.selected{filter:brightness(1.2);box-shadow:0 0 0 2px #dab6ff90}
  .today-line{position:absolute;top:0;bottom:0;width:2px;z-index:3;pointer-events:none;background:#f5b8d2;box-shadow:0 0 6px #f5b8d260}
  .empty-row .event-label{cursor:default}
  .empty-events{align-self:center;color:#ab99b5;text-align:center;font-size:12px}
  .message{padding:40px 16px;text-align:center;color:#cbb5de}
  .error{color:#ffbeca}.message button{margin-left:12px;color:#fff;background:#62447a;border:0;border-radius:8px;padding:7px 12px;cursor:pointer}
  .event-inspector{display:flex;flex-wrap:wrap;align-items:center;gap:18px;padding:12px 16px;background:#2a2036;border-top:1px solid #71518b}
  .event-inspector-heading{display:flex;align-items:center;gap:11px;min-width:170px;flex:1}
  .event-inspector-heading>div{display:grid;gap:4px}
  .event-inspector-heading strong{font-size:14px;line-height:1.25}
  .event-inspector-heading small{font-size:11px;color:#baabc8}
  .event-inspector-heading :global(svg){color:#d0a5ef;flex-shrink:0}
  .event-inspector-heading .close{margin-left:auto;display:grid;place-items:center;border:0;background:transparent;color:#dac6e8;cursor:pointer;padding:6px}
  .date-facts{display:flex;flex-wrap:wrap;gap:9px 22px;align-items:center}
  .date-facts div{display:grid;gap:4px;font-variant-numeric:tabular-nums}
  .date-facts small{font-size:10px;color:#af9abf}
  .date-facts strong{font-size:12px;font-weight:600;white-space:nowrap}
  .uncertain{display:flex;align-items:center;gap:5px;font-size:11px;color:#c5aecd}
  .inspector-actions{display:flex;align-items:center;gap:12px;margin-left:auto}
  .inspector-actions a{display:flex;align-items:center;gap:6px;white-space:nowrap;color:#d2b5ee;font-size:12px;text-decoration:none}
  .inspector-actions a.primary{background:#694687;color:#fff;padding:10px 12px;border-radius:8px}
  @media(max-width:800px){
    .timeline-toolbar{align-items:flex-start}
    .timeline-content{--sidebar-width:172px}
    .timeline-row{height:64px}
    .event-label{padding:8px}
    .date-facts{gap:8px 15px}
    .event-inspector-heading{flex-basis:100%}
  }
  @media(max-width:560px){
    .guide-app{min-height:calc(100dvh - 50px);padding:7px;gap:7px}
    .guide-sections{gap:5px}
    .guide-sections a,.guide-sections .pending{padding:8px 10px;gap:6px;font-size:12px}
    .timeline-toolbar{padding:9px;gap:8px}
    .timeline-title>strong{font-size:15px}
    .calendar-nav{width:100%;justify-content:space-between;gap:3px}
    .calendar-nav .zoom{margin-right:3px}
    .calendar-nav .range{min-width:103px;font-size:12px}
    .calendar-nav button{padding:6px 8px}
    .timeline-key{padding:7px 9px;gap:10px;font-size:10px}
    .timeline-content{--sidebar-width:139px}
    .event-name{font-size:11px}
    .event-symbol :global(svg){width:15px;height:15px}
    .event-label{gap:5px}
    .timeline-row{height:61px}
    .timeline-bar{height:27px}
    .event-inspector{padding:11px;gap:10px}
    .inspector-actions{margin-left:0}
  }
</style>