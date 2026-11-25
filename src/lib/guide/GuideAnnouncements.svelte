<script lang="ts">
 import WandIcon from '$lib/ui/WandIcon.svelte';
 import {GUIDE_LOCALES} from './timeline-copy.ts';
 import {announcementCopy} from './community-announcement-copy.ts';
 import {isPointAnnouncement,type AnnouncementProvider,type AnnouncementResult,type AnnouncementDate} from './community-announcements.ts';
 import AnnouncementComposer from './AnnouncementComposer.svelte';
 import CampaignCodeList from './CampaignCodeList.svelte';
 import type {AnnouncementKind} from './community-announcements.ts';
 import type {WandLanguage} from '$lib/ui/preferences.ts';
 export let provider:AnnouncementProvider|null;
 export let data:AnnouncementResult;
 export let language:WandLanguage;
 export let state:'unavailable'|'loading'|'ready'|'error';
 export let showCalendar:boolean;
 export let toggleCalendar:(checked:boolean)=>void;
 export let refresh:()=>void;
 let composing=false;
 let initialKind:AnnouncementKind='update';
 function shareCode(){initialKind='code';composing=true;}
 $: news=data.latest.filter(item=>item.kind!=='code');
 $: copy=announcementCopy(language);
 function date(value:AnnouncementDate,lang:WandLanguage){
   const parsed=new Date(value.precision==='day'?value.value+'T12:00:00Z':value.value);
   if(!Number.isFinite(parsed.getTime()))return '';
   return new Intl.DateTimeFormat(GUIDE_LOCALES[lang],value.precision==='day'?{dateStyle:'medium',timeZone:'UTC'}:{dateStyle:'medium',timeStyle:'short'}).format(parsed);
 }
 function published(){composing=false;refresh();}
</script>
<section class="guide-announcements" aria-label={copy.heading}>
 <header>
  <div class="title"><WandIcon name="community" size={19}/><h2>{copy.heading}</h2></div>
  <div class="controls">
   {#if provider}<label><input type="checkbox" checked={showCalendar} on:change={e=>toggleCalendar(e.currentTarget.checked)}/>{copy.showCalendar}</label>{/if}
   <button type="button" on:click={()=>{initialKind='update';composing=!composing;}} aria-expanded={composing}><WandIcon name="edit" size={17}/>{copy.share}</button>
   {#if provider}<a href={provider.browseHref()}>{copy.all}<WandIcon name="arrow" size={15}/></a>{/if}
  </div>
 </header>
 {#if composing}{#key initialKind}<AnnouncementComposer {provider} {language} {initialKind} close={()=>composing=false} {published}/>{/key}{/if}
 {#if state==='unavailable'}<p role="status">{copy.community} · {copy.unavailable}</p>
 {:else if state==='error'}<p role="status">{copy.error} <button type="button" on:click={refresh}>{copy.retry}</button></p>
 {:else if state==='loading'}<p role="status">{copy.loading}</p>
 {:else if !news.length}<p role="status">{copy.empty}</p>
 {:else if provider}
 <div class="announcements-grid">
  {#each news as item (item.id)}
   <a class="news-card" href={provider.threadHref(item.id)}>
    {#if item.imageUrl}<img src={item.imageUrl} alt="" loading="lazy"/>{/if}
    <div class="news-content"><small>{copy.kinds[item.kind]}</small><strong>{item.title}</strong>
    <span>{item.schedule.start?date(item.schedule.start,language):copy.unknown}{#if !isPointAnnouncement(item.kind)&&item.schedule.end} – {date(item.schedule.end,language)}{/if}</span>
    <small>{item.confidenceLabel}</small></div>
   </a>
  {/each}
 </div>
 {/if}
 <CampaignCodeList {language} community={data.latest} share={shareCode} threadHref={provider? id=>provider!.threadHref(id):undefined}/>
</section>
<style>
 .guide-announcements{min-width:0;padding:12px;border:1px solid var(--wand-line);border-radius:12px;background:var(--wand-card);color:var(--wand-text)}
 header,.title,.controls,button,.controls a{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
 header{justify-content:space-between;margin-bottom:8px}h2{font-size:16px;margin:0}.controls{gap:7px}
 button,.controls a{font:inherit;font-size:12px;border:1px solid var(--wand-line);border-radius:7px;padding:7px;background:var(--wand-pill-bg);color:inherit;text-decoration:none;cursor:pointer}
 label,p{font-size:12px;color:var(--wand-muted);margin:4px 0}
 .announcements-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:8px}
 .news-card{border:1px solid var(--wand-line);border-radius:9px;overflow:hidden;background:var(--wand-menu);color:inherit;text-decoration:none}
 .news-card img{width:100%;height:100px;object-fit:cover;display:block}
 .news-content{display:grid;gap:5px;padding:10px;overflow-wrap:anywhere}.news-content small{color:var(--wand-muted);font-size:11px}.news-content span{font-size:12px}
</style>
