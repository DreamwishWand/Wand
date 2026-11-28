<script lang="ts">
  import {page} from '$app/stores';
  import ItemPage from '$lib/items/ItemPage.svelte';
  import {entityItemId} from '$lib/items/entity-item-url';
  import type {WandLanguage} from '$lib/ui/preferences';
  $: id=entityItemId($page.params.itemId);
  $: locale=$page.params.locale as WandLanguage;
</script>
{#if id!==null}{#key id}<ItemPage itemId={id} {locale}/>{/key}{/if}
