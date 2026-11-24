<script lang="ts">
  import GuideCommunityHelp from '$lib/guide/GuideCommunityHelp.svelte';
  import {onMount} from 'svelte';
  import {base} from '$app/paths';
  import WandIcon from '$lib/ui/WandIcon.svelte';
  import {GUIDE_SYSTEM_CATEGORIES} from '$lib/guide/system-topics.ts';
  import {watchWandLanguage,type WandLanguage} from '$lib/ui/preferences.ts';

  let locale:WandLanguage='ja';
  let query='';
  let current=0;
  let selected='';
  $: normalized=query.trim().toLocaleLowerCase();
  $: filtered=GUIDE_SYSTEM_CATEGORIES.map(category=>({
    ...category,groups:category.groups.map(group=>({
      ...group,topics:group.topics.filter(topic=>!normalized||
        (topic.ja+' '+topic.en+' '+group.ja+' '+group.en+' '+category.ja+' '+category.en)
          .toLocaleLowerCase().includes(normalized))
    })).filter(group=>group.topics.length)
  })).filter(category=>category.groups.length);
  $: activeCategory=GUIDE_SYSTEM_CATEGORIES[current]??GUIDE_SYSTEM_CATEGORIES[0];
  $: currentGroups=normalized?filtered.flatMap(category=>category.groups.map(group=>({
    ...group,category
  }))):activeCategory.groups.map(group=>({...group,category:activeCategory}));
  $: chosen=GUIDE_SYSTEM_CATEGORIES.flatMap(category=>
    category.groups.flatMap(group=>group.topics.map(topic=>({
      topic,group,category
    })))).find(x=>x.topic.id===selected)??null;
  function chooseCategory(index:number){current=index;query='';selected='';}
  function topicHref(id:string):string|null{
    if(id==='quest_progression')return base+'/guide/quests/';
    if(id==='star_paths'||id==='star_path_duties'||id==='star_path_rewards')
      return base+'/guide/star-path/';
    if(id==='events_event_board')return base+'/guide/events/';
    if(id==='collection'||id==='memories'||id==='snippets_lorekeeper')
      return base+'/collection/';
    if(id==='decorating_mode'||id==='furniture_placement'||id==='floating_islands')
      return base+'/world/preview/';
    return null;
  }
  onMount(()=>{
    const stop=watchWandLanguage(value=>{locale=value;});
    const params=new URLSearchParams(location.search);
    const topic=params.get('topic');
    if(topic){
      const i=GUIDE_SYSTEM_CATEGORIES.findIndex(category=>
        category.groups.some(group=>group.topics.some(item=>item.id===topic)));
      if(i>=0){current=i;selected=topic;}
    }
    return stop;
  });
</script>
<svelte:head>
  <title>Systems | Dreamwish Wand</title>
  <meta name="description" content="Disney Dreamlight Valleyのシステムと操作を、カテゴリ・トピックから調べるガイド。" />
</svelte:head>

<main class="systems" aria-label="Systems">
  <header class="system-bar">
    <a class="back" href={`${base}/guide/`} aria-label="Guideへ戻る" title="Guideへ戻る"><WandIcon name="chevron" size={18}/></a>
    <strong>{locale==='ja'?'システム':'Systems'}</strong>
    <label class="system-search">
      <WandIcon name="search" size={17}/>
      <input type="search" bind:value={query} placeholder={locale==='ja'?'システムを検索':'Search systems'} aria-label="システムを検索"/>
      {#if query}<button aria-label="検索をクリア" on:click={()=>query=''}><WandIcon name="close" size={14}/></button>{/if}
    </label>
    <details class="system-info">
      <summary title="データの出典" aria-label="データの出典"><WandIcon name="info" size={17}/></summary>
      <p>分類は旧Dreamwish Wandで承認された7カテゴリー・106トピックに準拠。分類の参照元はSwitch v1.25.0です。ゲームのv1.26.2で各手順が検証済みという意味ではありません。</p>
    </details>
  </header>

  {#if !normalized}
    <nav class="system-categories" aria-label="システムの分類">
      {#each GUIDE_SYSTEM_CATEGORIES as category,i (category.id)}
        <button class:active={current===i} aria-pressed={current===i}
          on:click={()=>chooseCategory(i)}>
          <WandIcon name={category.icon} size={23}/>
          <span>{locale==='ja'?category.ja:category.en}</span>
        </button>
      {/each}
    </nav>
  {/if}
  <div class="system-workspace" class:detail-open={!!chosen}>
    <section class="system-topics" aria-label="トピック">
      {#if normalized&&filtered.length===0}
        <div class="empty">{locale==='ja'?'一致する項目はありません':'No matching systems'}</div>
      {:else}
        {#each currentGroups as group (group.category.id+group.ja)}
          <div class="topic-group">
            <h2>{locale==='ja'?group.ja:group.en}</h2>
            <div class="topic-buttons">
              {#each group.topics as topic (topic.id)}
                <button class:active={selected===topic.id} aria-pressed={selected===topic.id}
                  on:click={()=>selected=selected===topic.id?'':topic.id}>
                  <span>{locale==='ja'?topic.ja:topic.en}</span>
                  <WandIcon name="chevron" size={13}/>
                </button>
              {/each}
            </div>
          </div>
        {/each}
      {/if}
    </section>
    {#if chosen}
      <aside class="topic-detail" aria-label="選択したトピック">
        <button class="close-detail" aria-label="閉じる" on:click={()=>selected=''}><WandIcon name="close" size={18}/></button>
        <WandIcon name={chosen.category.icon} size={27}/>
        <h2>{locale==='ja'?chosen.topic.ja:chosen.topic.en}</h2>
        <span class="group-label">{locale==='ja'?chosen.group.ja:chosen.group.en}</span>
        <p class="historic-note">{locale==='ja'
          ?'旧プロジェクトの確定分類に基づくトピックです。現行バージョンの詳細な操作手順は、確認済みの情報を優先して順次表示します。'
          :'This topic follows the approved historical taxonomy. Detailed instructions require current-version source verification.'}</p>
        {#if topicHref(chosen.topic.id)}
          <a class="related" href={topicHref(chosen.topic.id)??'#'}>
            {locale==='ja'?'関連サービスを開く':'Open related service'}
            <WandIcon name="arrow" size={17}/>
          </a>
        {/if}
        <GuideCommunityHelp kind="system" id={chosen.topic.id}/>
      </aside>
    {/if}
  </div>
</main>

<style>
  .systems{height:calc(100dvh - 56px);min-height:560px;display:flex;flex-direction:column;gap:10px;padding:10px clamp(8px,1.4vw,22px);box-sizing:border-box;color:#eee7f6}
  .system-bar{position:relative;display:flex;align-items:center;gap:12px;min-height:43px}
  .system-bar>strong{font-size:17px}
  .back{display:grid;place-items:center;width:38px;height:38px;border:1px solid #524164;border-radius:9px;color:#dfc4ef}
  .back :global(svg){transform:rotate(90deg)}
  .system-search{display:flex;align-items:center;gap:8px;min-width:0;width:min(420px,55%);margin-left:auto;background:#251c32;border:1px solid #655075;border-radius:9px;padding:0 11px;color:#baa4d0}
  .system-search input{width:100%;padding:10px 0;background:transparent;border:0;outline:0;color:#f4eaf8;font:inherit;font-size:13px}
  .system-search button{display:grid;place-items:center;border:0;background:transparent;color:inherit;cursor:pointer}
  .system-info summary{display:grid;place-items:center;cursor:pointer;list-style:none;padding:7px;color:#bca4d3}
  .system-info summary::-webkit-details-marker{display:none}
  .system-info p{position:absolute;z-index:7;right:0;top:100%;width:min(390px,80vw);box-sizing:border-box;background:#30243d;padding:14px;border:1px solid #795f8e;border-radius:9px;font-size:12px;line-height:1.5;box-shadow:0 8px 20px #0007}
  .system-categories{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:7px}
  .system-categories button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:102px;padding:8px 5px;border:1px solid #554465;border-radius:10px;background:#261e34;color:#d6c9e2;cursor:pointer;font:inherit}
  .system-categories button>span{font-size:11px;font-weight:650;line-height:1.35;text-align:center;overflow-wrap:anywhere}
  .system-categories button :global(svg){color:#bf94e0;flex-shrink:0}
  .system-categories button.active,.system-categories button:hover{background:#49335e;border-color:#b58fd6;color:#fff}
  .system-workspace{display:flex;gap:10px;flex:1;min-height:0}
  .system-topics{flex:1;min-width:0;overflow-y:auto;background:#1d1628;border:1px solid #493754;border-radius:11px;padding:13px}
  .topic-group{margin-bottom:20px}
  .topic-group h2{font-size:13px;font-weight:680;color:#ccb6e2;margin:0 0 10px}
  .topic-buttons{display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:8px}
  .topic-buttons button{display:flex;align-items:center;justify-content:space-between;gap:7px;min-height:44px;padding:10px 12px;background:#2c223a;border:1px solid #473750;border-radius:8px;font:inherit;font-size:12px;text-align:left;color:#eee4f6;cursor:pointer}
  .topic-buttons button:hover,.topic-buttons button.active{border-color:#b08cda;background:#513969}
  .topic-buttons button :global(svg){transform:rotate(-90deg);flex-shrink:0}
  .topic-detail{overflow-y:auto;position:relative;flex:0 0 min(31%,370px);box-sizing:border-box;padding:20px 18px;border:1px solid #6d5482;background:#2a1f38;border-radius:11px;min-width:0}
  .topic-detail> :global(svg){color:#dab1f4}
  .topic-detail h2{font-size:21px;line-height:1.3;margin:13px 0 7px}
  .group-label{font-size:12px;color:#b9a4cb}
  .historic-note{font-size:12px;line-height:1.55;color:#b4a6c0;margin:24px 0}
  .close-detail{position:absolute;right:10px;top:10px;border:0;background:transparent;color:#dac6e8;cursor:pointer}
  .related{display:flex;align-items:center;justify-content:space-between;padding:12px;border-radius:8px;background:#6c4b8c;color:#fff;text-decoration:none;font-size:12px}
  .empty{text-align:center;padding:50px 12px;color:#bba9cb}
  @media(max-width:1100px){
    .system-categories{grid-template-columns:repeat(4,minmax(0,1fr))}
    .system-categories button{min-height:80px}
  }
  @media(max-width:650px){
    .systems{min-height:0;height:calc(100dvh - 48px);padding:7px;gap:7px}
    .system-categories{grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}
    .system-categories button{min-height:72px}
    .system-categories button>span{font-size:10px}
    .system-categories button :global(svg){width:21px;height:21px}
    .system-workspace{position:relative}
    .system-topics{padding:9px}
    .topic-buttons{grid-template-columns:repeat(auto-fill,minmax(145px,1fr));gap:6px}
    .topic-detail{position:absolute;inset:0;z-index:4;overflow-y:auto;border-radius:9px}
    .system-search{width:min(65%,290px)}
  }
</style>