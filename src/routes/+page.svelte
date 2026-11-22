<script lang="ts">
  import {base} from '$app/paths';
  import WandIcon from '$lib/ui/WandIcon.svelte';

  const art='/ddv/item-images/steam-1.25.3-schema626-lossless160-v1/';
  const services=[
    {name:'Collection',icon:'collection',href:'/collection/',hint:'アイテムと収集記録',kind:'available',art:art+'46/461f6484256c69e5a528adc3af7054301841fc324c237d8bc0d4534830345bec.webp'},
    {name:'Guide',icon:'guide',href:'/guide/quests/',hint:'クエスト',kind:'available',art:art+'4f/4f1ed414b3f554a69dbc7b4e682507274c58ad327ace7e22808469aa1e56eff4.webp'},
    {name:'Star Path',icon:'star',href:'/guide/star-path/',hint:'タスク・報酬',kind:'available',art:art+'be/be04cf5698b094a1597bac8ceafa9c43d696c4bf75c8be8db2504ce764b58489.webp'},
    {name:'Characters',icon:'character',href:'/guide/characters/',hint:'キャラクター',kind:'available',art:''},
    {name:'World',icon:'world',href:'/world/preview/',hint:'原本プレビュー',kind:'preview',art:''},
    {name:'Save',icon:'save',href:'/save/diagnostics/',hint:'開発用診断',kind:'preview',art:''},
    {name:'Decorate',icon:'palette',href:'',hint:'',kind:'planned',art:''},
    {name:'Presets',icon:'sparkles',href:'',hint:'',kind:'planned',art:''},
    {name:'Gallery',icon:'gallery',href:'',hint:'',kind:'planned',art:''},
    {name:'DreamSnaps',icon:'camera',href:'',hint:'',kind:'planned',art:''},
    {name:'Help Center',icon:'community',href:'',hint:'',kind:'planned',art:''}
  ];
</script>
<svelte:head>
  <title>Dreamwish Wand</title>
  <meta name="description" content="Dreamwish Wand — Collection, Guide and Disney Dreamlight Valley tools."/>
</svelte:head>
<section class="portal-page" aria-label="Dreamwish Wand サービス一覧">
  <div class="portal-intro">
    <div class="portal-emblem" aria-hidden="true"><WandIcon name="sparkles" size={34} strokeWidth={1.3}/></div>
    <p class="eyebrow">DREAMWISH WAND</p>
    <h1>Dreamwish Wand</h1>
    <p>サービスを選択</p>
  </div>
  <div class="portal-grid">
    {#each services as service (service.name)}
      {#if service.href}
        <a class="portal-card" class:preview={service.kind==='preview'}
          href="{base}{service.href}" aria-label={service.name+(service.kind==='preview'?'（開発用）':'')}>
          <span class="portal-card-visual">
            <WandIcon name={service.icon} size={42} strokeWidth={1.35}/>
            {#if service.art}<img class="portal-game-art" src="{base}{service.art}" alt="" loading="lazy"/>{/if}
          </span>
          <span class="portal-card-label"><strong>{service.name}</strong><small>{service.hint}</small></span>
          <span class="portal-card-action" aria-hidden="true"><WandIcon name="arrow" size={20}/></span>
        </a>
      {:else}
        <div class="portal-card planned" aria-label={service.name+'（開発中）'}>
          <span class="portal-card-visual"><WandIcon name={service.icon} size={42} strokeWidth={1.35}/></span>
          <span class="portal-card-label"><strong>{service.name}</strong><small>開発中</small></span>
          <span class="portal-card-action" aria-hidden="true"><WandIcon name="lock" size={18}/></span>
        </div>
      {/if}
    {/each}
  </div>
  <p class="portal-footnote">非公式ファンプロジェクト。セーブ解析は端末内で実行します。</p>
</section>
