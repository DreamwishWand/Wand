<script lang="ts">
  import WandIcon from '$lib/ui/WandIcon.svelte';
  import type {Db01ItemAcquisitionIndex} from '$lib/acquisition/db01-item-acquisition.ts';
  import type {GameNativeItemCategory} from '$lib/acquisition/game-native-item-categories.ts';
  import {collectionDb01AcquisitionLabel,collectionDb01AcquisitionHeading} from './db01-browse-labels.ts';
  export let index:Db01ItemAcquisitionIndex|null=null;
  export let itemId:number;
  export let locale:string;
  const icons:Record<GameNativeItemCategory,string>={
    ordinary_gameplay:'world',premium_shop:'gem',star_path:'star',
    in_game_limited_event:'sun',real_time_limited_event:'history',iap_package_reward:'collection'
  };
  $: categories=index?.getItem(itemId).categories??[];
</script>
{#if categories.length}
  <span class="collection-source-marks" role="group" aria-label={collectionDb01AcquisitionHeading(locale)}>
    {#each categories as category (category)}
      <span class="collection-source-mark" data-source-category={category}
        role="img" aria-label={collectionDb01AcquisitionLabel(locale,category)}
        title={collectionDb01AcquisitionLabel(locale,category)}>
        <WandIcon name={icons[category]} size={13}/>
      </span>
    {/each}
  </span>
{/if}
<style>
  .collection-source-marks{display:flex;flex-wrap:wrap;align-items:center;gap:4px;min-width:0;line-height:1}
  .collection-source-mark{display:inline-flex;align-items:center;justify-content:center;opacity:.8;flex:none}
</style>
