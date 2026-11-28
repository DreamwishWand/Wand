<script lang="ts">
  import {onMount} from 'svelte';
  import {base} from '$app/paths';
  import {page} from '$app/stores';
  import {goto} from '$app/navigation';
  import {entityItemId,itemEntityHref} from '$lib/items/entity-item-url';
  import {readWandLanguage} from '$lib/ui/preferences';
  onMount(()=>{
    const id=entityItemId($page.params.itemId);
    if(id!==null)void goto(itemEntityHref(base,id,readWandLanguage())+$page.url.search,{replaceState:true});
  });
</script>
