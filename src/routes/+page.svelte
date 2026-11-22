<script lang="ts">
  import {base} from '$app/paths';
  import WandIcon from '$lib/ui/WandIcon.svelte';

  // Only these six entries are first-level Wand services.
  // Guide subfeatures and internal developer previews retain their own routes,
  // but must not be duplicated in the home service directory.
  const art='/ddv/item-images/steam-1.25.3-schema626-lossless160-v1/';
  const services=[
    {name:'Decorate',icon:'palette',href:'',hint:'',art:''},
    {name:'Collection',icon:'collection',href:'/collection/',hint:'アイテムと収集記録',art:art+'46/461f6484256c69e5a528adc3af7054301841fc324c237d8bc0d4534830345bec.webp'},
    {name:'Guide',icon:'guide',href:'/guide/',hint:'クエスト・イベント',art:art+'4f/4f1ed414b3f554a69dbc7b4e682507274c58ad327ace7e22808469aa1e56eff4.webp'},
    {name:'Presets',icon:'sparkles',href:'',hint:'',art:''},
    {name:'Gallery',icon:'gallery',href:'',hint:'',art:''},
    {name:'DreamSnaps',icon:'camera',href:'',hint:'',art:''}
  ];
</script>
<svelte:head>
  <title>Dreamwish Wand</title>
  <meta name="description" content="Dreamwish Wand — Decorate, Collection, Guide, Presets, Gallery and DreamSnaps."/>
</svelte:head>
<section class="portal-page" aria-label="Dreamwish Wand サービス一覧">
  <div class="portal-intro">
    <div class="portal-emblem" aria-hidden="true"><WandIcon name="sparkles" size={34} strokeWidth={1.3}/></div>
    <p class="eyebrow">DREAMWISH WAND</p>
    <h1>Dreamwish Wand</h1>
    <p>サービスを選択</p>
  </div>
  <div class="portal-grid" aria-label="6つの主要サービス">
    {#each services as service (service.name)}
      {#if service.href}
        <a class="portal-card" href="{base}{service.href}" aria-label={service.name}>
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

  <!-- Community Help Center is a separate support entry, not a seventh game service. -->
  <aside class="portal-community" aria-label="Community Help Center（準備中）">
    <span class="community-icon" aria-hidden="true"><WandIcon name="community" size={27}/></span>
    <span class="community-title">Community Help Center</span>
    <span class="community-state">準備中</span>
  </aside>
  <p class="portal-footnote">非公式ファンプロジェクト。セーブ解析は端末内で実行します。</p>
</section>
