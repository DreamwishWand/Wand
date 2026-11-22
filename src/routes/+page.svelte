<script lang="ts">
  import {onMount} from 'svelte';
  import {base} from '$app/paths';
  import WandIcon from '$lib/ui/WandIcon.svelte';
  import {watchWandLanguage,type WandLanguage} from '$lib/ui/preferences';

  let uiLocale:WandLanguage='ja';
  onMount(()=>watchWandLanguage(code=>uiLocale=code));
  const descriptions:Record<WandLanguage,{
    collection:string;guide:string;planned:string;community:string;directory:string
  }>={
    ja:{collection:'アイテムと収集記録',guide:'クエスト・イベント',planned:'開発中',community:'準備中',directory:'6つの主要サービス'},
    en:{collection:'Items & progress',guide:'Quests & events',planned:'Coming soon',community:'Coming soon',directory:'Six services'},
    fr:{collection:'Objets et collection',guide:'Quêtes et événements',planned:'Bientôt',community:'Bientôt',directory:'Six services'},
    it:{collection:'Oggetti e raccolta',guide:'Missioni ed eventi',planned:'In arrivo',community:'In arrivo',directory:'Sei servizi'},
    de:{collection:'Gegenstände & Sammlung',guide:'Quests & Events',planned:'In Vorbereitung',community:'In Vorbereitung',directory:'Sechs Dienste'},
    'es-ES':{collection:'Objetos y colección',guide:'Misiones y eventos',planned:'Próximamente',community:'Próximamente',directory:'Seis servicios'},
    'zh-CN':{collection:'物品与收藏进度',guide:'任务与活动',planned:'开发中',community:'准备中',directory:'六项服务'},
    'pt-BR':{collection:'Itens e coleção',guide:'Missões e eventos',planned:'Em breve',community:'Em breve',directory:'Seis serviços'}
  };
  $: words=descriptions[uiLocale];
  const art='/ddv/item-images/steam-1.25.3-schema626-lossless160-v1/';
  const services=[
    {name:'Decorate',icon:'palette',href:'',hint:'',art:''},
    {name:'Collection',icon:'collection',href:'/collection/',hint:'collection',art:art+'46/461f6484256c69e5a528adc3af7054301841fc324c237d8bc0d4534830345bec.webp'},
    {name:'Guide',icon:'guide',href:'/guide/',hint:'guide',art:art+'4f/4f1ed414b3f554a69dbc7b4e682507274c58ad327ace7e22808469aa1e56eff4.webp'},
    {name:'Presets',icon:'sparkles',href:'',hint:'',art:''},
    {name:'Gallery',icon:'gallery',href:'',hint:'',art:''},
    {name:'DreamSnaps',icon:'camera',href:'',hint:'',art:''}
  ];
</script>
<svelte:head>
  <title>Dreamwish Wand</title>
  <meta name="description" content="Dreamwish Wand — Decorate, Collection, Guide, Presets, Gallery and DreamSnaps."/>
</svelte:head>
<section class="portal-page" aria-label={words.directory}>
  <h1 class="visually-hidden">{words.directory}</h1>
  <div class="portal-grid" aria-label={words.directory}>
    {#each services as service (service.name)}
      {#if service.href}
        <a class="portal-card" href="{base}{service.href}" aria-label={service.name}>
          <span class="portal-card-visual">
            <WandIcon name={service.icon} size={52} strokeWidth={1.35}/>
            {#if service.art}<img class="portal-game-art" src="{base}{service.art}" alt="" loading="lazy"/>{/if}
          </span>
          <span class="portal-card-label">
            <strong>{service.name}</strong>
            <small>{service.hint==='collection'?words.collection:words.guide}</small>
          </span>
          <span class="portal-card-action" aria-hidden="true"><WandIcon name="arrow" size={23}/></span>
        </a>
      {:else}
        <div class="portal-card planned" aria-label={service.name+' — '+words.planned}>
          <span class="portal-card-visual"><WandIcon name={service.icon} size={52} strokeWidth={1.35}/></span>
          <span class="portal-card-label"><strong>{service.name}</strong><small>{words.planned}</small></span>
          <span class="portal-card-action" aria-hidden="true"><WandIcon name="lock" size={18}/></span>
        </div>
      {/if}
    {/each}
  </div>
  <aside class="portal-community" aria-label="Community Help Center">
    <span class="community-icon" aria-hidden="true"><WandIcon name="community" size={27}/></span>
    <span class="community-title">Community Help Center</span>
    <span class="community-state">{words.community}</span>
  </aside>
</section>
