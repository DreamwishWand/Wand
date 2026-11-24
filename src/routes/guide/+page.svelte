<script lang="ts">
  import {onMount,onDestroy,tick} from 'svelte';
  import GuideAnnouncements from '$lib/guide/GuideAnnouncements.svelte';
  import {announcementProvider,EMPTY_ANNOUNCEMENTS,isPointAnnouncement,type AnnouncementProvider,type AnnouncementResult,type AnnouncementQuery} from '$lib/guide/community-announcements.ts';
  import {announcementCopy} from '$lib/guide/community-announcement-copy.ts';
  import {base} from '$app/paths';
  import WandIcon from '$lib/ui/WandIcon.svelte';
  import {loadPublicStarpath} from '$lib/guide/public-starpath.ts';
  import {loadPublicEventFriendshipRewards,DB03_EVENT_FRIENDSHIP_REWARD_FILE}
    from '$lib/guide/public-event-friendship-rewards.ts';
  import {starpathSeasonHref} from '$lib/guide/starpath-duty-link.ts';
  import {guideCalendarEvents,eventScheduleState,
    GUIDE_EVENT_CALENDAR_AS_OF,type GuideCalendarEvent
  } from '$lib/guide/event-calendar.ts';
  import {viewerEventDateTime} from '$lib/guide/viewer-event-time.ts';
  import {guideTimelineWindow,guideTimelineRows,guideAnnouncementMarker,
    type GuideTimelinePhase
  } from '$lib/guide/event-timeline.ts';
  import {watchWandLanguage,type WandLanguage} from '$lib/ui/preferences.ts';
  import {guideTimelineCopy,GUIDE_LOCALES} from '$lib/guide/timeline-copy.ts';
  import {GUIDE_EARLY_ACCESS_FIRST_DAY} from '$lib/guide/official-event-history.ts';
  import {mergeGuideNativeEvents} from '$lib/guide/native-event-calendar.ts';
  import {guideArchiveTitle,mergeGuideArchivedStarpaths} from '$lib/guide/starpath-calendar-archive.ts';

  let events:GuideCalendarEvent[]=[];
  let announcements:AnnouncementResult=EMPTY_ANNOUNCEMENTS;
  let announcementState:'unavailable'|'loading'|'ready'|'error'='unavailable';
  let announcementRequest:AbortController|undefined;
  let showCommunityCalendar=true;
  let mounted=false;
  $: newsCopy=announcementCopy(language);
  $: announcementQuery={firstDay:windowRange.firstDay,lastDay:windowRange.lastDay,timeZone:viewerZone,language};
  $: if(mounted)void refreshAnnouncements($announcementProvider,announcementQuery);
  $: announcementRows=showCommunityCalendar?announcements.calendar.flatMap(item=>{
    const marker=guideAnnouncementMarker(item.schedule,isPointAnnouncement(item.kind),windowRange);
    return marker?[{item,marker}]:[];
  }):[];
  async function refreshAnnouncements(provider:AnnouncementProvider|null,query:AnnouncementQuery){
    announcementRequest?.abort();
    if(!provider){announcements=EMPTY_ANNOUNCEMENTS;announcementState='unavailable';return;}
    const request=new AbortController();announcementRequest=request;
    announcementState='loading';
    try{
      const result=await provider.list(query,request.signal);
      if(request.signal.aborted)return;
      announcements=result;announcementState='ready';
    }catch{
      if(!request.signal.aborted){announcements=EMPTY_ANNOUNCEMENTS;announcementState='error';}
    }
  }
  onDestroy(()=>announcementRequest?.abort());
  let historyNames:Readonly<Record<string,Readonly<Record<string,string>>>>={};
  let loading=true;
  let loadError='';
  let now=Date.now();
  let viewerZone='UTC';
  let language:WandLanguage='ja';
  let weeks:5|9=5;
  let offsetWeeks=0;
  let selectedId:string|null=null;
  let timelineScroller:HTMLDivElement|null=null;
  $: viewerLocale=GUIDE_LOCALES[language];
  $: copy=guideTimelineCopy(language);
  $: formatLocal=(utc:string)=>viewerEventDateTime(utc,viewerZone,viewerLocale);
  $: windowRange=guideTimelineWindow(now,weeks,offsetWeeks,viewerZone);
  $: visibleRows=guideTimelineRows(events,windowRange);
  $: selected=events.find(event=>event.id===selectedId)??null;
  $: selectedHref=selected?eventHref(selected):null;
  $: previousOffset=offsetWeeks-weeks;
  $: selectedYear=Number((windowRange.days[4]?.day??windowRange.todayDay).slice(0,4));
  $: lastSelectableYear=Math.max(2022,selectedYear,Number(windowRange.todayDay.slice(0,4)));
  $: yearOptions=Array.from({length:lastSelectableYear-2021},(_,i)=>2022+i);
  $: atFirstRelease=previousOffset< -520||
    guideTimelineWindow(now,weeks,Math.max(-520,previousOffset),viewerZone)
      .lastDay<GUIDE_EARLY_ACCESS_FIRST_DAY;
  $: rangeText=longDay(windowRange.firstDay,viewerLocale)+' – '+longDay(windowRange.lastDay,viewerLocale);
  $: zoneLabel=new Intl.DateTimeFormat(viewerLocale,{timeZone:viewerZone,timeZoneName:'short'})
    .formatToParts(new Date(now)).find(p=>p.type==='timeZoneName')?.value??viewerZone;

  function monthLabel(day:string,locale:string):string{
    return new Intl.DateTimeFormat(locale,{timeZone:'UTC',month:'short'})
      .format(new Date(day+'T12:00:00Z'));
  }
  function longDay(day:string,locale:string):string{
    return new Intl.DateTimeFormat(locale,{
      timeZone:'UTC',year:'numeric',month:'short',day:'numeric'
    }).format(new Date(day+'T12:00:00Z'));
  }
  function weekdayLabel(day:string,locale:string):string{
    return new Intl.DateTimeFormat(locale,{timeZone:'UTC',weekday:'narrow'})
      .format(new Date(day+'T12:00:00Z'));
  }
  function displayCategory(event:GuideCalendarEvent):'starpath'|'floating'|'other'{
    return event.kind!=='limited-event'?'starpath':event.category;
  }
  function eventTitle(event:GuideCalendarEvent,lang:WandLanguage,names:typeof historyNames):string{
    return (event.kind==='limited-event'?event.nativeNames?.[lang]:undefined)
      ||guideArchiveTitle(event,lang)||names[event.id]?.[lang]||event.title;
  }
  function eventHref(event:GuideCalendarEvent):string|null{
    if(event.kind==='starpath')return starpathSeasonHref(base,event.sourceSeasonId);
    return event.href?`${base}${event.href}`:null;
  }
  function eventIcon(event:GuideCalendarEvent):string{
    return event.kind!=='limited-event'?'star':
      event.category==='floating'?'world':'plant';
  }
  function phaseName(phase:GuideTimelinePhase,copy:ReturnType<typeof guideTimelineCopy>):string{
    return phase==='task'||phase==='historic'?copy.starPaths:
      phase==='exchange'?copy.exchange:copy.events;
  }
  function stateName(event:GuideCalendarEvent,copy:ReturnType<typeof guideTimelineCopy>,now:number):string{
    switch(eventScheduleState(event,now)){
      case 'task-window':return copy.starPaths;
      case 'exchange-only':return copy.exchange;
      case 'date-window':return copy.active;
      case 'upcoming':return copy.upcoming;
      default:return copy.ended;
    }
  }
  function eventBoundary(event:GuideCalendarEvent,formatLocal:(utc:string)=>string,locale:string):string{
    if(event.precision==='date-only'){
      if(event.kind==='limited-event'&&event.sourceStartUtc&&event.sourceEndUtcInclusive)
        return `${formatLocal(event.sourceStartUtc)} – ${formatLocal(event.sourceEndUtcInclusive)}`;
      const end=event.kind==='starpath-history'&&event.officialEndUtc
        ?formatLocal(event.officialEndUtc):longDay(event.endDayInclusive,locale);
      return `${longDay(event.startDay,locale)} – ${end}`;
    }
    return `${formatLocal(event.startUtc)} – ${formatLocal(event.endUtcExclusive)}`;
  }
  function showEvent(id:string){selectedId=selectedId===id?null:id;}
  function navigate(direction:-1|1){
    const next=offsetWeeks+direction*weeks;
    if(next< -520||next>520)return;
    const proposed=guideTimelineWindow(now,weeks,next,viewerZone);
    if(proposed.lastDay<GUIDE_EARLY_ACCESS_FIRST_DAY)return;
    offsetWeeks=next;selectedId=null;
    if(timelineScroller)timelineScroller.scrollLeft=0;
  }
  function changeZoom(value:5|9){
    if(weeks===value)return;
    weeks=value;offsetWeeks=0;selectedId=null;
    void positionToday();
  }
  async function positionToday(){
    await tick();
    const scroller=timelineScroller;
    const today=scroller?.querySelector('.date-slot.today') as HTMLElement|null;
    const sidebar=scroller?.querySelector('.date-label') as HTMLElement|null;
    if(!scroller||!today||!sidebar)return;
    const box=scroller.getBoundingClientRect();
    const side=sidebar.getBoundingClientRect().width;
    const marker=today.getBoundingClientRect().left+today.getBoundingClientRect().width/2;
    // Show a little context before now; reserve most of the view for upcoming.
    const target=box.left+side+(box.width-side)*0.13;
    scroller.scrollLeft=Math.max(0,scroller.scrollLeft+marker-target);
  }
  function goToday(){
    offsetWeeks=0;selectedId=null;
    void positionToday();
  }
  function goYear(year:number){
    if(!Number.isInteger(year)||year<2022||year>lastSelectableYear)return;
    // Jump to the first VERIFIED event in the chosen year, not to a blank
    // January when the officially dated schedule begins much later.
    const starts=events.map(event=>event.precision==='date-only'
      ?event.startDay:new Date(event.startUtc).toISOString().slice(0,10))
      .filter(day=>day.startsWith(String(year))).sort();
    const target=starts[0]??(year===2022?GUIDE_EARLY_ACCESS_FIRST_DAY:`${year}-01-01`);
    const delta=(Date.parse(target+'T00:00:00Z')-
      Date.parse(windowRange.todayDay+'T00:00:00Z'))/86_400_000;
    offsetWeeks=Math.max(-520,Math.min(520,Math.floor((delta+4)/7)));
    selectedId=null;
    if(timelineScroller)timelineScroller.scrollLeft=0;
  }
  async function load(){
    loading=true;loadError='';
    try{
      const [snapshot,native]=await Promise.all([
        loadPublicStarpath(`${base}/guide/public/starpath-cache-2026-11-22.json`),
        loadPublicEventFriendshipRewards(`${base}/guide/public/${DB03_EVENT_FRIENDSHIP_REWARD_FILE}`)
          .catch(()=>null)
      ]);
      const articleEvents=mergeGuideArchivedStarpaths(guideCalendarEvents(snapshot));
      events=native?mergeGuideNativeEvents(articleEvents,native):articleEvents;
      historyNames={
        'haunted-floating-festival-2026':native?.getEvent('floating_festival','HauntedFloatingFestival2026')?.names??{},
        'haunted-floating-festival-2025':native?.getEvent('floating_festival','HauntedFloatingFestival')?.names??{},
        'trick-or-treat-2023':native?.getEvent('mini_event','TrickOrTreat')?.names??{},
        'trick-or-treat-2024':native?.getEvent('mini_event','TrickOrTreat')?.names??{},
        'dreamlight-parks-fest-2024':native?.getEvent('mini_event','DreamlightParkFest')?.names??{}
      };
    }catch(error){
      loadError=error instanceof Error?error.message:String(error);
    }finally{
      loading=false;
      if(!loadError)void positionToday();
    }
  }
  onMount(()=>{
    viewerZone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
    const unwatch=watchWandLanguage(value=>{language=value;});
    now=Date.now();
    const timer=setInterval(()=>{now=Date.now();},60000);
    mounted=true;
    void load();
    return ()=>{mounted=false;clearInterval(timer);unwatch();};
  });
</script>

<svelte:head>
  <title>{copy.guide} | Dreamwish Wand</title>
  <meta name="description" content={`${copy.systems} · ${copy.quests} · ${copy.timeline}`} />
</svelte:head>

<main class="guide-app" aria-label={copy.guide}>


  <section class="timeline-panel" aria-label={copy.timelineRegion}>
    <div class="timeline-toolbar">
      <div class="timeline-title">
        <WandIcon name="grid" size={19}/>
        <strong>{copy.timeline}</strong>
        <span class="zone" title={viewerZone}>{zoneLabel}</span>
        <details class="source-info">
          <summary aria-label={copy.dateInfo}><WandIcon name="info" size={17}/></summary>
          <p>{copy.sourceNote} · Steam v1.26.2 · {GUIDE_EVENT_CALENDAR_AS_OF}</p>
        </details>
      </div>
      <div class="calendar-nav">
        <div class="zoom" role="group" aria-label={copy.visiblePeriod}>
          <button class:active={weeks===5} aria-pressed={weeks===5} on:click={()=>changeZoom(5)}>5 {copy.weeks}</button>
          <button class:active={weeks===9} aria-pressed={weeks===9} on:click={()=>changeZoom(9)}>9 {copy.weeks}</button>
        </div>
        <div class="range-controls">
        <button class="nav-arrow previous" aria-label={copy.previous} title={copy.previous}
          disabled={atFirstRelease} on:click={()=>navigate(-1)}><WandIcon name="chevron" size={17}/></button>
        <strong class="range" aria-live="polite">{rangeText}</strong>
        <button class="nav-arrow next" aria-label={copy.next} title={copy.next}
          on:click={()=>navigate(1)}><WandIcon name="chevron" size={17}/></button>
        </div>
        <button class="today-button" on:click={goToday}>{copy.today}</button>
        <select class="calendar-year" aria-label={copy.year}
          value={selectedYear} on:change={event=>goYear(Number(event.currentTarget.value))}>
          {#each yearOptions as year (year)}
            <option value={year}>{year}</option>
          {/each}
        </select>
      </div>
    </div>

    <div class="timeline-key" aria-label={copy.legend}>
      <span title={copy.exchange}><i class="sample task"></i>{copy.starPaths}</span>
      <span><i class="sample floating"></i>{copy.floating}</span>
      <span><i class="sample other"></i>{copy.other}</span>
      <span><i class="sample today-sample"></i>{copy.today}</span>
      <span><i class="sample reset-sample"></i>{copy.reset}</span>
    </div>

    {#if loading}
      <div class="message" role="status">{copy.loading}…</div>
    {:else if loadError}
      <div class="message error" role="alert">{copy.loadFailed}
        <button on:click={load}>{copy.retry}</button>
      </div>
    {:else}
      <div class="timeline-scroll" bind:this={timelineScroller} role="region" tabindex="0"
        aria-label={copy.scrollTimeline}>
        <div class="timeline-content" style={`--day-count:${windowRange.days.length};min-width:${205+windowRange.days.length*30}px`}>
          <div class="timeline-heading">
            <div class="date-label">{copy.events}</div>
            <div class="dates-grid">
              {#each windowRange.days as day (day.day)}
                <div class="date-slot" class:reset={day.reset} class:today={day.today}
                  title={longDay(day.day,viewerLocale)+(day.today?' · '+copy.today:'')+(day.reset?' · '+copy.reset:'')}>
                  <span class="weekday">{weekdayLabel(day.day,viewerLocale)}</span>
                  <span class="date-number">{day.dayNumber}</span>
                  {#if day.dayNumber===1}<span class="month-label">{monthLabel(day.day,viewerLocale)}</span>{/if}
                </div>
              {/each}
            </div>
          </div>
          {#each visibleRows as row (row.event.id)}
            <div class="timeline-row" class:selected={selectedId===row.event.id} data-category={displayCategory(row.event)}>
              {#if eventHref(row.event)}
                <a class="event-label" href={eventHref(row.event)??undefined} title={eventTitle(row.event,language,historyNames)}>
                <span class="event-symbol"><WandIcon name={eventIcon(row.event)} size={17}/></span>
                <span class="event-name">{eventTitle(row.event,language,historyNames)}</span>
                <span class="row-chevron"><WandIcon name="chevron" size={15}/></span>
                </a>
              {:else}
              <button class="event-label" on:click={()=>showEvent(row.event.id)}
                aria-pressed={selectedId===row.event.id} title={eventTitle(row.event,language,historyNames)}>
                <span class="event-symbol"><WandIcon name={eventIcon(row.event)} size={17}/></span>
                <span class="event-name">{eventTitle(row.event,language,historyNames)}</span>
                <span class="row-chevron"><WandIcon name="chevron" size={15}/></span>
              </button>
              {/if}
              <div class="event-track">
                <div class="track-grid" aria-hidden="true">
                  {#each windowRange.days as day (day.day)}
                    <div class="track-day" class:reset={day.reset} class:today={day.today}></div>
                  {/each}
                </div>
                {#each row.segments as segment, i (`${row.event.id}-${i}`)}
                  <button class="timeline-bar"
                    class:task={segment.phase==='task'||segment.phase==='historic'}
                    class:exchange={segment.phase==='exchange'}
                    class:limited={segment.phase==='limited'}
                    class:floating={segment.phase==='limited'&&displayCategory(row.event)==='floating'}
                    class:other={segment.phase==='limited'&&displayCategory(row.event)==='other'}
                    class:clipped-start={segment.clippedStart}
                    class:clipped-end={segment.clippedEnd}
                    class:selected={selectedId===row.event.id}
                    style={`left:${segment.left}%;width:${segment.width}%`}
                    title={`${eventTitle(row.event,language,historyNames)} · ${phaseName(segment.phase,copy)} · ${eventBoundary(row.event,formatLocal,viewerLocale)}`}
                    aria-label={`${eventTitle(row.event,language,historyNames)} · ${phaseName(segment.phase,copy)}`}
                    aria-pressed={selectedId===row.event.id}
                    on:click={()=>showEvent(row.event.id)}>
                  </button>
                {/each}
              </div>
            </div>
          {/each}
          {#if announcementRows.length&&$announcementProvider}
            <div class="community-calendar-divider">{newsCopy.community}</div>
            {#each announcementRows as row (row.item.id)}
              <div class="timeline-row community-calendar-row">
                <a class="event-label" href={$announcementProvider.threadHref(row.item.id)} title={row.item.title}>
                  <WandIcon name="community" size={16}/><span class="event-name">{row.item.title}</span>
                </a>
                <div class="event-track">
                  <div class="track-grid" aria-hidden="true">{#each windowRange.days as day (day.day)}<div class="track-day"></div>{/each}</div>
                  <a class="community-marker" class:point={row.marker.point} style={`left:${row.marker.left}%;width:${row.marker.point?0:row.marker.width}%`}
                    href={$announcementProvider.threadHref(row.item.id)} title={row.item.title+' · '+row.item.confidenceLabel}
                    aria-label={row.item.title+' · '+row.item.confidenceLabel}></a>
                </div>
              </div>
            {/each}
          {/if}
          {#if visibleRows.length===0&&announcementRows.length===0}
            <div class="timeline-row empty-row">
              <div class="event-label blank"></div>
              <div class="empty-events">{copy.empty}</div>
            </div>
          {/if}
        </div>
      </div>

      {#if selected}
        <div class="event-inspector" aria-label={copy.eventDetails}>
          <div class="event-inspector-heading">
            <WandIcon name={eventIcon(selected)} size={22}/>
            <div><strong>{eventTitle(selected,language,historyNames)}</strong><small>{stateName(selected,copy,now)} · {(selected.precision==='utc-instant'||(selected.kind==='limited-event'&&selected.sourceStartUtc&&selected.sourceEndUtcInclusive))?viewerZone:copy.dateOnly}</small></div>
            <button class="close" aria-label={copy.close} on:click={()=>selectedId=null}>
              <WandIcon name="close" size={18}/>
            </button>
          </div>
          <div class="date-facts">
            {#if selected.kind==='limited-event'&&selected.sourceStartUtc&&selected.sourceEndUtcInclusive}
              <div><small>{copy.start}</small><strong>{formatLocal(selected.sourceStartUtc)}</strong></div>
              <div><small>{copy.end}</small><strong>{formatLocal(selected.sourceEndUtcInclusive)}</strong></div>
            {:else if selected.precision==='date-only'}
              <div><small>{copy.start}</small><strong>{longDay(selected.startDay,viewerLocale)}</strong></div>
              {#if selected.kind==='starpath-history'&&selected.taskEndDayInclusive}
                <div><small>{copy.taskEnd}</small><strong>{longDay(selected.taskEndDayInclusive,viewerLocale)}</strong></div>
              {/if}
              <div><small>{selected.kind==='starpath-history'&&selected.taskEndDayInclusive?copy.exchangeEnd:copy.end}</small>
                <strong>{selected.kind==='starpath-history'&&selected.officialEndUtc
                  ?formatLocal(selected.officialEndUtc)
                  :longDay(selected.endDayInclusive,viewerLocale)}</strong></div>
              <span class="uncertain"><WandIcon name="info" size={15}/>{selected.kind==='starpath-history'&&selected.officialEndUtc?copy.startTimeUnknown:copy.dateUnknown}</span>
            {:else}
              <div><small>{copy.start}</small><strong>{formatLocal(selected.startUtc)}</strong></div>
              <div><small>{copy.taskEnd}</small><strong>{formatLocal(selected.taskEndUtcExclusive)}</strong></div>
              <div><small>{copy.exchangeEnd}</small><strong>{formatLocal(selected.endUtcExclusive)}</strong></div>
            {/if}
          </div>
          <div class="inspector-actions">
            {#if selected.kind==='starpath-history'||selected.kind==='starpath-archive'}
              <span class="historic-status">{copy.onlineHistory}</span>
            {:else if selected.kind==='limited-event'&&selected.participation==='game-clock'}
              <span class="historic-status">{copy.gameClock}</span>
            {/if}
            {#if selectedHref}
              <a class="primary" href={selectedHref}>{copy.guideLink} <WandIcon name="arrow" size={16}/></a>
            {/if}
          </div>
        </div>
      {/if}
    {/if}
  </section>

  <GuideAnnouncements provider={$announcementProvider} data={announcements} {language} state={announcementState}
    showCalendar={showCommunityCalendar} toggleCalendar={checked=>showCommunityCalendar=checked}
    refresh={()=>refreshAnnouncements($announcementProvider,announcementQuery)}/>
  <nav class="guide-sections" aria-label={copy.guide}>
    <a class="service-card systems-card" href={`${base}/guide/systems/`}>
      <span class="service-icon"><WandIcon name="settings" size={46}/></span>
      <span class="service-name">{copy.systems}</span>
      <span class="service-chevron"><WandIcon name="chevron" size={22}/></span>
    </a>
    <a class="service-card quests-card" href={`${base}/guide/quests/`}>
      <span class="service-icon"><WandIcon name="guide" size={46}/></span>
      <span class="service-name">{copy.quests}</span>
      <span class="service-chevron"><WandIcon name="chevron" size={22}/></span>
    </a>
  </nav>
</main>

<style>
  .guide-app{box-sizing:border-box;width:100%;max-width:none;min-width:0;margin:0;padding:12px clamp(8px,1.4vw,22px) 14px;min-height:calc(100dvh - 64px);display:flex;flex-direction:column;gap:10px;color:#eee9f6}
  .guide-sections{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;flex:0 0 auto}
  .service-card{position:relative;display:flex;align-items:center;gap:clamp(16px,2.5vw,36px);min-width:0;min-height:clamp(122px,18vh,180px);box-sizing:border-box;padding:clamp(16px,3vw,38px);border:1px solid #66517e;border-radius:15px;color:#f4ecff;text-decoration:none;overflow:hidden;isolation:isolate;background:linear-gradient(125deg,#332747,#242037)}
  .quests-card{background:linear-gradient(125deg,#273c57,#252940);border-color:#526b8c}
  .service-card:hover,.service-card:focus-visible{border-color:#c8a6ef;box-shadow:inset 0 0 0 1px #c8a6ef;background:linear-gradient(125deg,#473460,#302542)}
  .quests-card:hover,.quests-card:focus-visible{border-color:#9abdeb;box-shadow:inset 0 0 0 1px #9abdeb;background:linear-gradient(125deg,#324e71,#303650)}
  .service-icon{display:grid;place-items:center;flex-shrink:0;width:clamp(64px,7vw,100px);aspect-ratio:1;border:1px solid #ffffff24;border-radius:18px;background:#ffffff0c;color:#dcc1ff}
  .quests-card .service-icon{color:#b8d8ff}
  .service-name{font-size:clamp(18px,2vw,30px);font-weight:700;overflow-wrap:anywhere}
  .service-chevron{margin-left:auto;flex-shrink:0;color:#bfb1d5}
  .service-chevron :global(svg){transform:rotate(-90deg)}
   .timeline-panel{display:flex;flex-direction:column;flex:0 0 auto;min-height:0;min-width:0;background:#181321;border:1px solid #493952;border-radius:15px;overflow:hidden}
  .timeline-toolbar{position:relative;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;padding:12px 15px;border-bottom:1px solid #48374f;background:#211a2c}
  .timeline-title{display:flex;align-items:center;gap:9px;min-width:0}
  .timeline-title>strong{font-size:17px;font-weight:700}
  .timeline-title :global(svg){color:#d1a8ed}
  .zone{font-size:10px;border:1px solid #51435d;color:#ac9bb9;padding:2px 5px;border-radius:4px}
  .source-info{position:static;font-size:12px}
  .source-info summary{display:flex;align-items:center;cursor:pointer;list-style:none;padding:5px;color:#c1afcc}
  .source-info summary::-webkit-details-marker{display:none}
  .source-info p{position:absolute;z-index:15;top:100%;right:12px;width:min(360px,calc(100% - 24px));box-sizing:border-box;padding:13px;margin:0;background:#352844;border:1px solid #8869a2;border-radius:9px;color:#ded1e9;box-shadow:0 8px 25px #0007;line-height:1.6}
  .calendar-nav{display:flex;align-items:center;gap:7px;min-width:0;flex-wrap:wrap}
  .range-controls{display:flex;align-items:center;gap:7px;min-width:0}
  .range-controls .nav-arrow{flex:0 0 auto}
  .calendar-nav button{border:1px solid #624b75;background:#2e233b;color:#ede2f5;border-radius:8px;padding:7px 10px;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
  .calendar-nav button:hover,.calendar-nav button:focus-visible{background:#4c3765;border-color:#aa88d0}
  .calendar-nav .range{min-width:0;font-size:13px;text-align:center;font-variant-numeric:tabular-nums;color:#f0e8f9}
  .calendar-nav .zoom{display:flex;border:1px solid #624b75;border-radius:8px;overflow:hidden;margin-right:8px}
  .zoom button{border:0;border-radius:0;padding:7px 10px}
  .zoom button+button{border-left:1px solid #624b75}
  .zoom button.active{background:#634582;color:#fff}
  .calendar-nav .nav-arrow{display:grid;place-items:center;width:32px;height:32px;padding:4px}
  .nav-arrow.previous :global(svg){transform:rotate(90deg)}
  .nav-arrow.next :global(svg){transform:rotate(-90deg)}
  .calendar-nav .today-button{background:#4c365e}
  .calendar-nav .calendar-year{background:#29243f;border:1px solid #65537a;color:#d0c2de;border-radius:8px;padding:7px 4px;font:inherit;font-size:12px;cursor:pointer;min-width:70px;max-width:88px}
  .calendar-nav button:disabled{opacity:.35;cursor:not-allowed}
  .historic-status{font-size:11px;color:#d4bbeb;white-space:nowrap}

  .timeline-key{display:flex;align-items:center;flex-wrap:wrap;gap:15px;padding:7px 15px;font-size:11px;color:#b6a4c1}
  .timeline-key span{display:flex;align-items:center;gap:6px}
  .sample{display:inline-block;width:17px;height:6px;border-radius:8px}
  .sample.task{background:linear-gradient(180deg,#8055ac,#9d68d2)}
  .sample.exchange{background:repeating-linear-gradient(135deg,transparent 0 5px,#ffffff38 5px 8px),linear-gradient(180deg,#8055ac,#9d68d2)}
  .sample.floating{background:#30a6ab}.sample.other{background:#d39747}
  .sample.today-sample{width:12px;height:12px;background:#674158;border:1px solid #e8a1c8;border-radius:3px}
  .sample.reset-sample{width:12px;height:12px;background:#224758;border:1px solid #74cde6;border-radius:3px}
  .timeline-scroll{min-width:0;max-width:100%;overflow-x:auto;overflow-y:hidden;flex:0 0 auto;scrollbar-color:#705b84 #21172d;scrollbar-width:thin}
  .timeline-content{--sidebar-width:205px;width:100%}
  .timeline-heading,.timeline-row{display:grid;grid-template-columns:var(--sidebar-width) minmax(0,1fr);min-width:0}
  .timeline-heading{min-height:64px;border-top:1px solid #4a3953;border-bottom:1px solid #52415e;background:#221a2b}
  .date-label{position:sticky;left:0;z-index:5;display:flex;align-items:center;padding-left:16px;background:#231a30;font-size:12px;color:#c0aeca;border-right:1px solid #52415e}
  .dates-grid,.track-grid{display:grid;grid-template-columns:repeat(var(--day-count),minmax(0,1fr));min-width:0}
  .dates-grid{position:relative}
  .date-slot{position:relative;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border-right:1px solid #352a3f;font-variant-numeric:tabular-nums;font-size:11px;color:#a99ab9}
  .date-slot .weekday{font-size:10px;color:#83758f}
  .date-number{font-size:13px;color:#d1c5dc}
  .date-slot.reset{background:#244153;box-shadow:inset 0 -2px #69bedc}
  .date-slot.reset .weekday,.date-slot.reset .date-number{color:#c4efff;font-weight:700}
  .date-slot.today{background:#56394f;box-shadow:inset 0 -2px #e6a4c7}
  .date-slot.today .weekday,.date-slot.today .date-number{color:#ffd3e6;font-weight:750}
  .date-slot.today.reset{background:linear-gradient(135deg,#56394f 0 50%,#244153 50%);box-shadow:inset 0 -2px #c2b2e6}
  .month-label{position:absolute;top:1px;font-size:9px;color:#b4a1c9;white-space:nowrap}
  .timeline-row{height:71px;border-bottom:1px solid #35293f}
  .timeline-row.selected{background:#2a2037}
  .event-label{position:sticky;left:0;z-index:5;display:flex;align-items:center;gap:9px;width:100%;min-width:0;box-sizing:border-box;padding:10px 12px;background:#211829;color:#eee3f4;text-align:left;border:0;border-right:1px solid #52415e;cursor:pointer}
  .timeline-row.selected .event-label{background:#382847}
  .event-label:hover,.event-label:focus-visible{background:#34243f}
  a.event-label{text-decoration:none}
  a.event-label:hover .event-name{text-decoration:underline;text-underline-offset:3px}
  .row-chevron{display:flex;flex-shrink:0;margin-left:auto}
  .row-chevron :global(svg){transform:rotate(-90deg);color:#9581aa}
  .event-symbol{color:#ca9bf2;flex-shrink:0}
  .event-name{min-width:0;font-size:12px;font-weight:600;line-height:1.3;overflow-wrap:anywhere}
  .event-track{position:relative;min-width:0;height:100%;display:flex;align-items:center}
  .track-grid{position:absolute;inset:0;pointer-events:none}
  .track-day{border-right:1px solid #33293d}
  .track-day.reset,.track-day.today{background:transparent}
  .timeline-bar{position:absolute;z-index:2;top:50%;transform:translateY(-50%);height:30px;min-width:0;box-sizing:border-box;border:1px solid #c9a5f44d;border-radius:5px;background:#8d5cbc;color:#fff;cursor:pointer;overflow:hidden;padding:0 4px}
  .timeline-bar span{display:block;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;font-size:10px;line-height:1.2}
  .timeline-bar.task{background:linear-gradient(180deg,#8055ac,#9d68d2)}
  .timeline-bar.exchange{background:repeating-linear-gradient(135deg,transparent 0 8px,#ffffff38 8px 13px),linear-gradient(180deg,#8055ac,#9d68d2);border-color:#c9a5f44d}
  .timeline-bar.task:not(.clipped-end){border-top-right-radius:0;border-bottom-right-radius:0}
  .timeline-bar.exchange:not(.clipped-start){border-top-left-radius:0;border-bottom-left-radius:0}
  .timeline-bar.floating{background:linear-gradient(180deg,#227d85,#37a9b2);border-color:#8cd9e1}
  .timeline-bar.other{background:linear-gradient(180deg,#996528,#d39b4d);border-color:#f4ce91}
  .timeline-bar.clipped-start{border-top-left-radius:0;border-bottom-left-radius:0;border-left:2px dashed #ddc6ed}
  .timeline-bar.clipped-end{border-top-right-radius:0;border-bottom-right-radius:0;border-right:2px dashed #ddc6ed}
  .timeline-bar:hover,.timeline-bar.selected{filter:brightness(1.2);box-shadow:0 0 0 2px #dab6ff90}
  .community-calendar-divider{position:sticky;left:0;padding:7px 12px;color:var(--wand-muted);border-top:1px dashed var(--wand-line);font-size:12px;background:var(--wand-menu)}
  .community-calendar-row{height:48px}
  .community-marker{position:absolute;top:50%;transform:translateY(-50%);height:20px;min-width:3px;box-sizing:border-box;border:1px solid var(--wand-accent);border-radius:4px;background:var(--wand-pill-bg);z-index:2}
  .community-marker.point{width:14px!important;height:14px;transform:translate(-50%,-50%) rotate(45deg);background:var(--wand-accent)}
  .community-marker:focus-visible,.community-marker:hover{outline:2px solid var(--wand-focus);outline-offset:2px}
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
    .guide-sections{gap:7px}
    .service-card{min-height:122px;padding:13px 9px;gap:7px;flex-direction:column;justify-content:center;text-align:center}
    .service-icon{width:48px;border-radius:12px}
    .service-icon :global(svg){width:30px;height:30px}
    .service-name{font-size:16px}
    .service-chevron{position:absolute;right:7px;top:8px}
    .service-chevron :global(svg){width:14px;height:14px}
    .timeline-toolbar{padding:9px;gap:8px}
    .timeline-title>strong{font-size:15px}
    .calendar-nav{width:100%;justify-content:space-between;gap:5px}
    .range-controls{flex:1 1 100%;justify-content:space-between;order:-1}
    .calendar-nav .zoom{margin-right:auto}
    .calendar-nav .range{min-width:0;flex:1;font-size:12px;overflow-wrap:anywhere}
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