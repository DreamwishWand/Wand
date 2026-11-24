<script lang="ts">
  import {onMount,onDestroy} from 'svelte';
  import WandIcon from '$lib/ui/WandIcon.svelte';
  import {watchWandLanguage,type WandLanguage} from '$lib/ui/preferences.ts';
  import {guideHelpCopy} from './community-help-copy.ts';
  import {guideHelpProvider,GUIDE_HELP_KINDS,guideHelpPostsFor,type GuideHelpSubjectKind,type GuideHelpPost,type GuideHelpProvider} from './community-help.ts';
  export let kind:GuideHelpSubjectKind;
  export let id:string;
  let language:WandLanguage='ja';
  let posts:readonly GuideHelpPost[]=[];
  let state:'unavailable'|'loading'|'ready'|'error'='unavailable';
  let controller:AbortController|undefined;
  const icons={issue:'alert',tip:'sparkles',question:'help'} as const;
  $: copy=guideHelpCopy(language);
  $: subject={kind,id};
  $: void refresh($guideHelpProvider,kind,id);
  onMount(()=>watchWandLanguage(value=>language=value));
  onDestroy(()=>controller?.abort());
  async function refresh(provider:GuideHelpProvider|null,kind:GuideHelpSubjectKind,id:string){
    controller?.abort();
    posts=[];
    if(!provider||!id){state='unavailable';return;}
    const request=new AbortController();
    controller=request;
    state='loading';
    try{
      const next=await provider.list({kind,id},request.signal);
      if(request.signal.aborted)return;
      posts=next;
      state='ready';
    }catch{
      if(!request.signal.aborted)state='error';
    }
  }
</script>
<section class="guide-community" aria-label={copy.heading} data-subject-kind={kind} data-subject-id={id}>
  <header><WandIcon name="community" size={19}/><h3>{copy.heading}</h3></header>
  {#if state==='unavailable'}
    <p class="help-state" role="status">{copy.unavailable}</p>
  {:else if state==='loading'}
    <p class="help-state" role="status">{copy.loading}</p>
  {:else if state==='error'}
    <p class="help-state" role="status">{copy.error} <button type="button" on:click={()=>refresh($guideHelpProvider,kind,id)}>{copy.retry}</button></p>
  {/if}
  {#each GUIDE_HELP_KINDS as section (section)}
    {@const related=guideHelpPostsFor(posts,subject,section)}
    <div class="help-section" data-post-kind={section}>
      <div class="help-row">
        <h4><WandIcon name={icons[section]} size={16}/>{copy.sections[section]}</h4>
        {#if $guideHelpProvider}
          <a class="help-action" href={$guideHelpProvider.createHref(subject,section)}><WandIcon name="plus" size={14}/>{copy.actions[section]}</a>
        {:else}
          <button type="button" class="help-action" disabled><WandIcon name="plus" size={14}/>{copy.actions[section]}</button>
        {/if}
      </div>
      {#if state==='ready'&&$guideHelpProvider}
        {#if related.length}
          <ul>
            {#each related as post (post.id)}
              <li><a href={$guideHelpProvider.threadHref(post.id)}>
                <strong>{post.title}</strong>
                {#if post.summary}<span>{post.summary}</span>{/if}
                <small>
                  {#if section==='issue'&&post.status}{post.status==='open'?copy.open:copy.resolved} · {/if}
                  {#if post.answerCount!==undefined}{copy.answers}: {post.answerCount} {/if}
                  {#if post.score!==undefined}{copy.score}: {post.score}{/if}
                </small>
              </a></li>
            {/each}
          </ul>
          <a class="help-all" href={$guideHelpProvider.browseHref(subject,section)}>{copy.all}<WandIcon name="arrow" size={14}/></a>
        {:else}
          <p class="help-state">{copy.empty}</p>
        {/if}
      {/if}
    </div>
  {/each}
</section>
<style>
  .guide-community{margin:18px 0 4px;min-width:0;padding:12px;border:1px solid var(--wand-line,#655079);border-radius:10px;background:var(--wand-card,#292035);color:var(--wand-text,#eee4f6)}
  header,.help-row,h4,.help-action,.help-all{display:flex;align-items:center;gap:7px}
  header{margin-bottom:6px}
  h3,h4{font-size:13px;line-height:1.4;margin:0;overflow-wrap:anywhere}
  h4{font-weight:600}
  .help-row{justify-content:space-between;flex-wrap:wrap;gap:8px}
  .help-section{padding:10px 0;border-top:1px solid var(--wand-line,#514160)}
  .help-section:last-child{padding-bottom:0}
  .help-action,.help-state button{padding:6px 9px;border:1px solid var(--wand-line,#655079);border-radius:7px;background:var(--wand-pill-bg,#332442);color:inherit;font:inherit;font-size:12px;text-decoration:none;cursor:pointer;min-height:32px;box-sizing:border-box}
  .help-action:disabled{opacity:.55;cursor:default}
  .help-state,small{font-size:12px;color:var(--wand-muted,#b4a6c0);margin:4px 0 8px}
  ul{list-style:none;padding:0;margin:8px 0}
  li a{display:flex;flex-direction:column;gap:4px;padding:8px;border:1px solid var(--wand-line,#514160);border-radius:7px;color:inherit;text-decoration:none;overflow-wrap:anywhere;font-size:13px}
  li+li{margin-top:6px}
  li span{font-size:12px}
  .help-all{font-size:12px;color:inherit;justify-content:flex-end;text-decoration:none}
</style>
