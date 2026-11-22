<script lang="ts">
  import {onMount} from 'svelte';
  import {base} from '$app/paths';
  import WandIcon from '$lib/ui/WandIcon.svelte';
  import {launcherServices} from '$lib/ui/services';
  import {watchWandLanguage,type WandLanguage} from '$lib/ui/preferences';

  // Home only: 2x2 decoration services on the left, Collection/Guide above Help on the right.
  // Keep global navigation order unchanged and avoid introducing new imagery.
  const homeTileOrder = ['decorate','presets','collection','guide','gallery','dreamsnaps','community'] as const;
  const homeTiles = homeTileOrder.map(key=>{
    const service=launcherServices.find(candidate=>candidate.key===key);
    if(!service)throw new Error(`Unknown launcher tile: ${key}`);
    return service;
  });

  let uiLocale:WandLanguage='ja';
  onMount(()=>watchWandLanguage(code=>uiLocale=code));
  const copy:Record<WandLanguage,{directory:string;planned:string}>={
    ja:{directory:'サービス',planned:'準備中'},
    en:{directory:'Services',planned:'Coming soon'},
    fr:{directory:'Services',planned:'Bientôt'},
    it:{directory:'Servizi',planned:'In arrivo'},
    de:{directory:'Dienste',planned:'In Vorbereitung'},
    'es-ES':{directory:'Servicios',planned:'Próximamente'},
    'zh-CN':{directory:'服务',planned:'开发中'},
    'pt-BR':{directory:'Serviços',planned:'Em breve'}
  };
  $: words=copy[uiLocale];
</script>
<svelte:head>
  <title>Dreamwish Wand</title>
  <meta name="description" content="Dreamwish Wand — Decorate, Collection, Guide, Presets, Gallery, DreamSnaps and Community Help Center."/>
</svelte:head>
<section class="portal-page" aria-label={words.directory}>
  <h1 class="visually-hidden">{words.directory}</h1>
  <div class="portal-grid">
    {#each homeTiles as service (service.key)}
      {#if service.href}
        <a class="portal-card" href="{base}{service.href}" aria-label={service.name}>
          <span class="portal-card-visual" aria-hidden="true">
            <WandIcon name={service.icon} size={64} strokeWidth={1.5}/>
            {#if service.art}<img class="portal-game-art" src="{base}{service.art}" alt="" loading="lazy"/>{/if}
          </span>
          <span class="portal-card-label"><strong>{service.name}</strong></span>
          <span class="portal-card-action" aria-hidden="true"><WandIcon name="arrow" size={22}/></span>
        </a>
      {:else}
        <div class="portal-card planned" class:portal-card-community={service.key==='community'}
          aria-label={service.name+' — '+words.planned}>
          <span class="portal-card-visual" aria-hidden="true"><WandIcon name={service.icon} size={64} strokeWidth={1.5}/></span>
          <span class="portal-card-label"><strong>{service.name}</strong><small>{words.planned}</small></span>
          <span class="portal-card-action" aria-hidden="true"><WandIcon name="lock" size={18}/></span>
        </div>
      {/if}
    {/each}
  </div>
</section>
