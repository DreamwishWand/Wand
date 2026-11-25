<script lang="ts">
 import {onDestroy} from 'svelte';
 import WandIcon from '$lib/ui/WandIcon.svelte';
 import type {WandLanguage} from '$lib/ui/preferences.ts';
 import {announcementCopy} from './community-announcement-copy.ts';
 import {ANNOUNCEMENT_KINDS,announcementDate,announcementSourceUrl,isPointAnnouncement,type AnnouncementKind,type AnnouncementProvider,type Announcement,type AnnouncementItem,type AnnouncementReward} from './community-announcements.ts';
 export let provider:AnnouncementProvider|null=null;
 export let language:WandLanguage='ja';
 export let initialKind:AnnouncementKind='update';
 export let close:()=>void;
 export let published:()=>void;
 let kind:AnnouncementKind=initialKind,title='',startDay='',startTime='',endDay='',endTime='',startOffset='+00:00',endOffset='+00:00',code='',source='',body='';
 let image:File|undefined;
 let itemQuery='',items:readonly AnnouncementItem[]=[],similar:readonly Announcement[]=[];
 let rewards:AnnouncementReward[]=[];
 let submitting=false,message='';
 let duplicateRequest:AbortController|undefined,itemRequest:AbortController|undefined;
 let duplicateTimer:ReturnType<typeof setTimeout>|undefined,itemTimer:ReturnType<typeof setTimeout>|undefined;
 $: copy=announcementCopy(language);
 $: point=isPointAnnouncement(kind);
 $: rewardKind=kind==='drops'||kind==='code';
 $: queueSimilar(provider,kind,kind==='code'?code:title);
 $: queueItems(provider,language,itemQuery,rewardKind);
 function queueSimilar(p:AnnouncementProvider|null,k:AnnouncementKind,t:string){
   clearTimeout(duplicateTimer);duplicateRequest?.abort();similar=[];
   if(!p||t.trim().length<2)return;
   const request=new AbortController();duplicateRequest=request;
   duplicateTimer=setTimeout(async()=>{try{const found=await p.similar(k,t.trim(),request.signal);if(!request.signal.aborted)similar=found;}catch{}},350);
 }
 function queueItems(p:AnnouncementProvider|null,lang:string,q:string,enabled:boolean){
   clearTimeout(itemTimer);itemRequest?.abort();items=[];
   if(!p||!enabled||q.trim().length<2)return;
   const request=new AbortController();itemRequest=request;
   itemTimer=setTimeout(async()=>{try{const found=await p.searchItems(q.trim(),lang,request.signal);if(!request.signal.aborted)items=found;}catch{}},250);
 }
 function addItem(item:AnnouncementItem){
   if(!rewards.some(r=>r.itemId===item.itemId))rewards=[...rewards,{itemId:item.itemId,name:item.name}];
   itemQuery='';
 }
 function changeReward(id:string,key:'quantity'|'minutes',value:string){
   const n=value===''?undefined:Number(value);
   rewards=rewards.map(r=>r.itemId===id?{...r,[key]:n}:r);
 }
 async function submit(){
   if(!provider||submitting)return;
   message='';
   let draft;
   try{
     const start=announcementDate(startDay,startTime,startOffset);
     const end=point?undefined:announcementDate(endDay,endTime,endOffset);
     if(start&&end&&start.precision===end.precision&&start.value>end.value)throw Error();
     if((kind==='code'?!code.trim():!title.trim())||(!startDay&&startTime)||(!point&&!endDay&&endTime))throw Error();
     if(rewardKind&&rewards.some(r=>[r.quantity,r.minutes].some(n=>n!==undefined&&(!Number.isSafeInteger(n)||n<=0))))throw Error();
     draft={kind,title:kind==='code'?code.trim():title.trim(),schedule:{start,end},code:kind==='code'?code.trim()||undefined:undefined,
       sourceUrl:announcementSourceUrl(source),body:body.trim()||undefined,language,
       rewards:rewardKind?rewards.map(r=>({itemId:r.itemId,name:r.name,...(kind==='drops'?{minutes:r.minutes}:{quantity:r.quantity})})):[]};
   }catch{message=copy.invalid;return;}
   submitting=true;
   try{await provider.create(draft,image);published();}catch{message=copy.failed;}finally{submitting=false;}
 }
 onDestroy(()=>{clearTimeout(duplicateTimer);clearTimeout(itemTimer);duplicateRequest?.abort();itemRequest?.abort();});
</script>
<form class="announcement-composer" on:submit|preventDefault={submit}>
 <div class="composer-head"><strong>{copy.share}</strong><button type="button" aria-label={copy.close} disabled={submitting} on:click={close}><WandIcon name="close" size={19}/></button></div>
 {#if !provider}<p role="status">{copy.community} · {copy.unavailable}</p>{/if}
 <div class="fields">
  <label>{copy.category}<select bind:value={kind}>{#each ANNOUNCEMENT_KINDS as k}<option value={k}>{copy.kinds[k]}</option>{/each}</select></label>
  {#if kind==='code'}<label>{copy.code}<input bind:value={code} required maxlength="128" autocomplete="off" spellcheck={false}/></label>{:else}<label>{copy.title}<input bind:value={title} required maxlength="180"/></label>{/if}
 </div>
 {#if similar.length&&provider}
  <div class="similar"><strong>{copy.similar}</strong>{#each similar as entry (entry.id)}<div><a href={provider.threadHref(entry.id)}>{entry.title}</a><a href={provider.supplementHref(entry.id)}>{copy.supplement}</a></div>{/each}</div>
 {/if}
 <p class="hint">{copy.optional}</p>
 <div class="fields dates">
  <label>{copy.start}<input type="date" bind:value={startDay}/></label>
  <label>{copy.time}<input type="time" bind:value={startTime}/></label>
  {#if startTime}<label>{copy.offset}<input bind:value={startOffset} placeholder="+09:00" pattern="[+-][0-9]{2}:[0-9]{2}"/></label>{/if}
  {#if !point}
    <label>{copy.end}<input type="date" bind:value={endDay}/></label>
    <label>{copy.time}<input type="time" bind:value={endTime}/></label>
    {#if endTime}<label>{copy.offset}<input bind:value={endOffset} placeholder="+09:00" pattern="[+-][0-9]{2}:[0-9]{2}"/></label>{/if}
  {/if}
 </div>
 {#if rewardKind}
   <label>{copy.rewards}<input type="search" placeholder={copy.search} bind:value={itemQuery} disabled={!provider}/></label>
   {#if items.length}<div class="item-results">{#each items as item (item.itemId)}<button type="button" on:click={()=>addItem(item)}>{#if item.imageUrl}<img src={item.imageUrl} alt="" loading="lazy"/>{/if}{item.name}</button>{/each}</div>{/if}
   {#each rewards as reward (reward.itemId)}
     <div class="reward"><span>{reward.name}</span><label>{kind==='drops'?copy.minutes:copy.quantity}<input type="number" min="1" step="1" value={kind==='drops'?reward.minutes??'':reward.quantity??''} on:input={e=>changeReward(reward.itemId,kind==='drops'?'minutes':'quantity',e.currentTarget.value)}/></label><button type="button" aria-label={copy.close} on:click={()=>rewards=rewards.filter(r=>r.itemId!==reward.itemId)}><WandIcon name="close" size={16}/></button></div>
   {/each}
 {/if}
 <label>{copy.source}<input type="url" bind:value={source} placeholder="https://" maxlength="2048"/></label>
 <label>{copy.body}<textarea bind:value={body} rows="3" maxlength="4000"></textarea></label>
 <label>{copy.image}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={!provider} on:change={e=>image=e.currentTarget.files?.[0]}/></label>
 {#if message}<p role="alert">{message}</p>{/if}
 <button class="publish" type="submit" disabled={!provider||submitting||(kind==='code'?!code.trim():!title.trim())}>{copy.publish}</button>
</form>
<style>
 .announcement-composer{display:grid;gap:10px;padding:12px;border:1px solid var(--wand-line);border-radius:10px;background:var(--wand-menu);color:var(--wand-text)}
 .composer-head,.reward{display:flex;align-items:center;justify-content:space-between;gap:8px}
 .fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr));gap:8px}
 label{display:grid;gap:4px;font-size:12px;min-width:0}
 input,select,textarea,button{box-sizing:border-box;min-width:0;font:inherit;color:inherit;border:1px solid var(--wand-line);border-radius:6px;background:var(--wand-bg);padding:7px}
 input,select,textarea{width:100%} button{cursor:pointer} button:disabled,input:disabled{opacity:.5;cursor:default}
 .hint,p{margin:0;color:var(--wand-muted);font-size:12px}.similar,.item-results{display:grid;gap:6px}.similar div{display:flex;gap:10px;flex-wrap:wrap}.similar a{color:var(--wand-accent)}
 .item-results button{display:flex;align-items:center;gap:8px;text-align:left}.item-results img{width:40px;height:40px;object-fit:contain}
 .reward{flex-wrap:wrap}.reward label{max-width:150px}.publish{background:var(--wand-accent-strong);color:var(--wand-accent-contrast);justify-self:end}
</style>
